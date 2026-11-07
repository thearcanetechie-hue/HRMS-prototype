import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, isWeekend, todayIst } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

function weekday(from: string) {
  let d = from;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

describe('Home dashboard', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function addEmployee(auth: Record<string, string>, code: string, extra: object = {}) {
    const res = await api()
      .post('/api/employees')
      .set(auth)
      .send({
        employeeCode: code,
        firstName: code,
        workEmail: `${code.toLowerCase()}@acme.test`,
        dateOfJoining: '2024-01-01',
        status: 'ACTIVE',
        ...extra,
      })
      .expect(201);
    return res.body.id as string;
  }

  it('counts real people and shows what is waiting on the caller', async () => {
    const owner = await signup(app);
    const bossId = await addEmployee(owner.auth, 'B1');
    const meId = await addEmployee(owner.auth, 'E1', { managerId: bossId });
    const soon = addDays(todayIst(), 5);
    await addEmployee(owner.auth, 'N1', { status: 'ONBOARDING', dateOfJoining: soon });
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `e1@${owner.workspace}.test`,
      meId,
    );
    const boss = await addLogin(
      app,
      prisma,
      owner.workspace,
      'manager',
      `b1@${owner.workspace}.test`,
      bossId,
    );

    const types = await api().get('/api/leave/types').set(me.auth).expect(200);
    const cl = types.body.find((t: { code: string }) => t.code === 'CL');
    const day = weekday(addDays(todayIst(), 10));
    await api()
      .post('/api/leave/requests')
      .set(me.auth)
      .send({ leaveTypeId: cl.id, startDate: day, endDate: day })
      .expect(201);

    const hr = await api().get('/api/dashboard/home').set(owner.auth).expect(200);
    // Owner, B1, E1 and the new joiner.
    expect(hr.body.headcount).toBe(4);
    expect(hr.body.scope).toBe('company');
    expect(hr.body.attendanceWeek).toHaveLength(7);
    expect(hr.body.events.map((e: { kind: string }) => e.kind)).toContain('joining');
    expect(hr.body.checklists.map((c: { kind: string }) => c.kind)).toContain('ONBOARDING');

    const mgr = await api().get('/api/dashboard/home').set(boss.auth).expect(200);
    expect(mgr.body.scope).toBe('team');
    expect(mgr.body.headcount).toBe(2);
    expect(
      mgr.body.requests.map((r: { kind: string; employee: { id: string } }) => [
        r.kind,
        r.employee.id,
      ]),
    ).toContainEqual(['leave', meId]);
  });

  it('never counts another workspace’s people', async () => {
    const a = await signup(app);
    const b = await signup(app);
    await addEmployee(a.auth, 'X1');
    await addEmployee(a.auth, 'X2');
    const home = await api().get('/api/dashboard/home').set(b.auth).expect(200);
    expect(home.body.headcount).toBe(1);
  });

  it('describes recent changes in plain words, to the right people', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'F1');
    const otherId = await addEmployee(owner.auth, 'F2');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `f1@${owner.workspace}.test`,
      empId,
    );

    const all = await api().get('/api/dashboard/activity').set(owner.auth).expect(200);
    expect(all.body.map((x: { text: string }) => x.text)).toContain('Ada Lovelace added F1');

    await api().get('/api/dashboard/activity').set(me.auth).expect(403);
    const mine = await api()
      .get(`/api/dashboard/activity?employeeId=${empId}`)
      .set(me.auth)
      .expect(200);
    expect(mine.body.every((x: { employeeId: string }) => x.employeeId === empId)).toBe(true);
    await api().get(`/api/dashboard/activity?employeeId=${otherId}`).set(me.auth).expect(403);
  });
});
