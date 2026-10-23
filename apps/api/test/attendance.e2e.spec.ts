import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, isWeekend, todayIst } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

/** The next weekday on or after `from`. */
function weekday(from: string) {
  let d = from;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}
/** The most recent weekday strictly before today. */
function pastWeekday() {
  let d = addDays(todayIst(), -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

type LeaveType = { id: string; code: string; daysPerYear: number | null };

describe('Attendance and leave', () => {
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
        dateOfJoining: '2026-01-01',
        status: 'ACTIVE',
        ...extra,
      })
      .expect(201);
    return res.body.id as string;
  }

  async function types(auth: Record<string, string>) {
    const res = await api().get('/api/leave/types').set(auth).expect(200);
    return res.body as LeaveType[];
  }

  it('lets an employee apply, their manager approve, and shows it on the register', async () => {
    const owner = await signup(app);
    const bossId = await addEmployee(owner.auth, 'B1');
    const meId = await addEmployee(owner.auth, 'E1', { managerId: bossId });
    const otherId = await addEmployee(owner.auth, 'O1');
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
    const other = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `o1@${owner.workspace}.test`,
      otherId,
    );

    const all = await types(me.auth);
    expect(all.map((t) => t.code)).toEqual(expect.arrayContaining(['PL', 'SL', 'CL', 'FV']));
    const casual = all.find((t) => t.code === 'CL')!;

    const start = weekday(addDays(todayIst(), 14));
    const req = await api()
      .post('/api/leave/requests')
      .set(me.auth)
      .send({ leaveTypeId: casual.id, startDate: start, endDate: start, reason: 'Family function' })
      .expect(201);
    expect(req.body).toMatchObject({
      status: 'PENDING',
      days: 1,
      canDecide: false,
      canCancel: true,
    });

    // Overlapping request is refused.
    await api()
      .post('/api/leave/requests')
      .set(me.auth)
      .send({ leaveTypeId: casual.id, startDate: start, endDate: start })
      .expect(409);

    // A colleague can't see or decide it; the employee can't approve their own.
    await api()
      .post(`/api/leave/requests/${req.body.id}/decision`)
      .set(other.auth)
      .send({ decision: 'APPROVE' })
      .expect(404);
    await api()
      .post(`/api/leave/requests/${req.body.id}/decision`)
      .set(me.auth)
      .send({ decision: 'APPROVE' })
      .expect(403);

    const toDecide = await api()
      .get('/api/leave/requests?toDecide=true')
      .set(boss.auth)
      .expect(200);
    expect(toDecide.body.map((r: { id: string }) => r.id)).toEqual([req.body.id]);
    await api()
      .post(`/api/leave/requests/${req.body.id}/decision`)
      .set(boss.auth)
      .send({ decision: 'APPROVE' })
      .expect(200);

    const balances = await api().get('/api/leave/balances').set(me.auth).expect(200);
    const cl = balances.body.find(
      (b: { leaveType: { code: string } }) => b.leaveType.code === 'CL',
    );
    expect(cl).toMatchObject({ used: 1, entitled: 8, left: 7 });

    const reg = await api()
      .get(`/api/attendance/register?month=${start.slice(0, 7)}`)
      .set(boss.auth)
      .expect(200);
    const row = reg.body.rows.find((r: { employee: { id: string } }) => r.employee.id === meId);
    expect(row.cells[reg.body.days.indexOf(start)].code).toBe('CL');
    // The manager sees their team and themselves, not the colleague.
    expect(reg.body.rows.map((r: { employee: { id: string } }) => r.employee.id).sort()).toEqual(
      [bossId, meId].sort(),
    );
  });

  it('enforces balances and lets HR set up leave types', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'L1');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `l1@${owner.workspace}.test`,
      empId,
    );

    const created = await api()
      .post('/api/leave/types')
      .set(owner.auth)
      .send({ name: 'Marriage leave', code: 'MR', daysPerYear: 2, tone: 'primary' })
      .expect(201);
    await api()
      .post('/api/leave/types')
      .set(me.auth)
      .send({ name: 'Mine', code: 'MI' })
      .expect(403);

    const start = weekday(addDays(todayIst(), 30));
    const end = addDays(start, 7); // at least 5 weekdays
    // More weekdays than the 2-day allowance.
    await api()
      .post('/api/leave/requests')
      .set(me.auth)
      .send({ leaveTypeId: created.body.id, startDate: start, endDate: end })
      .expect(400);

    await api()
      .patch(`/api/leave/types/${created.body.id}`)
      .set(owner.auth)
      .send({ active: false })
      .expect(200);
    await api()
      .post('/api/leave/requests')
      .set(me.auth)
      .send({ leaveTypeId: created.body.id, startDate: start, endDate: start })
      .expect(404);
  });

  it('records check-ins and HR marks, with leave taking precedence', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'C1');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `c1@${owner.workspace}.test`,
      empId,
    );

    await api().post('/api/attendance/check-in').set(me.auth).expect(200);
    await api().post('/api/attendance/check-in').set(me.auth).expect(409);
    await api().post('/api/attendance/check-out').set(me.auth).expect(200);
    const today = await api().get('/api/attendance/today').set(me.auth).expect(200);
    expect(today.body.me.checkIn).toBeTruthy();
    expect(today.body.me.checkOut).toBeTruthy();

    const day = pastWeekday();
    await api()
      .put('/api/attendance/marks')
      .set(me.auth)
      .send({ employeeId: empId, date: day, code: 'A' })
      .expect(403);
    await api()
      .put('/api/attendance/marks')
      .set(owner.auth)
      .send({ employeeId: empId, date: day, code: 'A' })
      .expect(200);
    let reg = await api()
      .get(`/api/attendance/register?month=${day.slice(0, 7)}`)
      .set(owner.auth)
      .expect(200);
    const cellOf = (r: typeof reg) =>
      r.body.rows.find((x: { employee: { id: string } }) => x.employee.id === empId).cells[
        r.body.days.indexOf(day)
      ].code;
    expect(cellOf(reg)).toBe('A');

    // Marking a leave code records an approved one-day leave instead.
    await api()
      .put('/api/attendance/marks')
      .set(owner.auth)
      .send({ employeeId: empId, date: day, code: 'SL' })
      .expect(200);
    reg = await api()
      .get(`/api/attendance/register?month=${day.slice(0, 7)}`)
      .set(owner.auth)
      .expect(200);
    expect(cellOf(reg)).toBe('SL');
    const leaves = await api()
      .get(`/api/leave/requests?employeeId=${empId}`)
      .set(owner.auth)
      .expect(200);
    expect(leaves.body[0]).toMatchObject({ status: 'APPROVED', days: 1 });

    // And back to present cancels that one-day leave.
    await api()
      .put('/api/attendance/marks')
      .set(owner.auth)
      .send({ employeeId: empId, date: day, code: 'P' })
      .expect(200);
    reg = await api()
      .get(`/api/attendance/register?month=${day.slice(0, 7)}`)
      .set(owner.auth)
      .expect(200);
    expect(cellOf(reg)).toBe('P');

    const future = weekday(addDays(todayIst(), 5));
    await api()
      .put('/api/attendance/marks')
      .set(owner.auth)
      .send({ employeeId: empId, date: future, code: 'P' })
      .expect(400);
  });

  it('never shows one workspace another workspace’s attendance or leave', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const empId = await addEmployee(a.auth, 'T1');
    const pl = (await types(a.auth)).find((t) => t.code === 'PL')!;
    const start = weekday(addDays(todayIst(), 10));
    const req = await api()
      .post('/api/leave/requests')
      .set(a.auth)
      .send({ employeeId: empId, leaveTypeId: pl.id, startDate: start, endDate: start })
      .expect(201);
    expect(req.body.status).toBe('APPROVED');

    await api().post(`/api/leave/requests/${req.body.id}/cancel`).set(b.auth).expect(404);
    await api().get(`/api/leave/balances?employeeId=${empId}`).set(b.auth).expect(404);
    await api()
      .put('/api/attendance/marks')
      .set(b.auth)
      .send({ employeeId: empId, date: pastWeekday(), code: 'A' })
      .expect(404);
    await api()
      .post('/api/leave/requests')
      .set(b.auth)
      .send({ employeeId: empId, leaveTypeId: pl.id, startDate: start, endDate: start })
      .expect((r) => expect([400, 404]).toContain(r.status));
    const reg = await api()
      .get(`/api/attendance/register?month=${start.slice(0, 7)}`)
      .set(b.auth)
      .expect(200);
    expect(reg.body.rows.map((r: { employee: { id: string } }) => r.employee.id)).not.toContain(
      empId,
    );
    const list = await api().get('/api/leave/requests').set(b.auth).expect(200);
    expect(list.body).toEqual([]);
  });
});
