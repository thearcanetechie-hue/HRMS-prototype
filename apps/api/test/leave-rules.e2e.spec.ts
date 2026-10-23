import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, todayIst, toDate } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

describe('Leave rules, policies and month close', () => {
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

  async function team() {
    const owner = await signup(app);
    const meId = await addEmployee(owner.auth, 'E1');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `e1@${owner.workspace}.test`,
      meId,
    );
    const types = (await api().get('/api/leave/types').set(owner.auth).expect(200)).body as {
      id: string;
      code: string;
    }[];
    const type = (code: string) => types.find((t) => t.code === code)!;
    return { owner, me, meId, type };
  }

  const year = Number(todayIst().slice(0, 4));
  const lastMonth = () => {
    const [y, m] = todayIst().split('-').map(Number) as [number, number];
    return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  };

  it('lets only HR change policies, and keeps defaults for what HR didn’t change', async () => {
    const { owner, me } = await team();
    const defaults = await api().get('/api/policies/attendance').set(me.auth).expect(200);
    expect(defaults.body).toMatchObject({
      unmarkedDays: 'A',
      latePenalty: { enabled: false, latesPerHalfDay: 3 },
    });
    await api()
      .put('/api/policies/attendance')
      .set(me.auth)
      .send({ webCheckIn: false })
      .expect(403);
    await api()
      .put('/api/policies/attendance')
      .set(owner.auth)
      .send({ latePenalty: { latesPerHalfDay: 0 } })
      .expect(400);
    const saved = await api()
      .put('/api/policies/attendance')
      .set(owner.auth)
      .send({ latePenalty: { enabled: true } })
      .expect(200);
    // The nested default survives a partial change.
    expect(saved.body.latePenalty).toEqual({ enabled: true, latesPerHalfDay: 3 });
    await api().get('/api/policies/nope').set(owner.auth).expect(404);

    await api()
      .put('/api/policies/attendance')
      .set(owner.auth)
      .send({ webCheckIn: false })
      .expect(200);
    await api().post('/api/attendance/check-in').set(me.auth).expect(400);
  });

  it('adds opening balances and adjustments, and closes a year with carry forward and encashment', async () => {
    const { owner, meId, type } = await team();
    const pl = type('PL');
    const before = await api()
      .get(`/api/leave/balances?employeeId=${meId}&year=${year - 1}`)
      .set(owner.auth)
      .expect(200);
    expect(
      before.body.find((b: { leaveType: { code: string } }) => b.leaveType.code === 'PL').entitled,
    ).toBe(18);

    await api()
      .post('/api/leave/adjustments')
      .set(owner.auth)
      .send({
        employeeId: meId,
        leaveTypeId: pl.id,
        year: year - 1,
        days: 4,
        kind: 'OPENING',
        note: 'Carried in from the old system',
      })
      .expect(201);
    await api()
      .post('/api/leave/adjustments')
      .set(owner.auth)
      .send({
        employeeId: meId,
        leaveTypeId: pl.id,
        year: year - 1,
        days: 1,
        kind: 'OPENING',
        note: 'Again',
      })
      .expect(409);
    await api()
      .post('/api/leave/adjustments')
      .set(owner.auth)
      .send({ employeeId: meId, leaveTypeId: type('FV').id, year, days: 2, note: 'No limit type' })
      .expect(400);

    // 18 + 4 = 22 unused: 6 carry forward (PL's limit), 16 left over, 30 can be encashed.
    const closed = await api()
      .post('/api/leave/year-end')
      .set(owner.auth)
      .send({ year: year - 1, encash: true })
      .expect(200);
    // The owner joined this year, so only E1 was employed last year. Unused sick (12) and
    // casual (8) leave can't be carried or encashed, so they lapse.
    expect(closed.body).toMatchObject({ people: 1, carried: 6, encashed: 16, lapsed: 20 });
    await api()
      .post('/api/leave/year-end')
      .set(owner.auth)
      .send({ year: year - 1 })
      .expect(409);
    await api().post('/api/leave/year-end').set(owner.auth).send({ year }).expect(400);

    const ledger = await api()
      .get(`/api/leave/ledger?employeeId=${meId}&year=${year - 1}`)
      .set(owner.auth)
      .expect(200);
    const plRows = ledger.body.filter(
      (l: { leaveType: { code: string } }) => l.leaveType.code === 'PL',
    );
    expect(plRows.map((l: { kind: string; days: number }) => [l.kind, l.days]).sort()).toEqual([
      ['ENCASHED', -16],
      ['OPENING', 4],
    ]);
    const now = await api()
      .get(`/api/leave/balances?employeeId=${meId}&year=${year}`)
      .set(owner.auth)
      .expect(200);
    const nowPl = now.body.find((b: { leaveType: { code: string } }) => b.leaveType.code === 'PL');
    const accrued = Math.round(((18 * Number(todayIst().slice(5, 7))) / 12) * 2) / 2;
    expect(nowPl.entitled).toBe(accrued + 6);
  });

  it('earns comp-off for device punches on a weekly off', async () => {
    const { owner, meId, type } = await team();
    const added = await api()
      .post('/api/attendance/devices')
      .set(owner.auth)
      .send({ name: 'Door', serialNumber: `lr${Date.now()}` })
      .expect(201);
    await api()
      .post('/api/attendance/devices/map')
      .set(owner.auth)
      .send({ deviceUserId: '55', employeeId: meId })
      .expect(200);
    let sunday = addDays(todayIst(), -1);
    while (toDate(sunday).getUTCDay() !== 0) sunday = addDays(sunday, -1);
    await api()
      .post('/api/attendance/punches')
      .set('X-Device-Key', added.body.key)
      .send({
        punches: [
          { userId: '55', time: `${sunday}T10:00:00+05:30` },
          { userId: '55', time: `${sunday}T15:00:00+05:30` },
        ],
      })
      .expect(200);
    const bal = await api()
      .get(`/api/leave/balances?employeeId=${meId}`)
      .set(owner.auth)
      .expect(200);
    const co = bal.body.find(
      (b: { leaveType: { id: string } }) => b.leaveType.id === type('CO').id,
    );
    // Five hours is a half day of comp-off under the default policy.
    expect(co).toMatchObject({ isCompOff: true, entitled: 0.5, left: 0.5 });
  });

  it('closes a month: unmarked days become absent, and the month can’t change until reopened', async () => {
    const { owner, me, meId, type } = await team();
    const month = lastMonth();
    await api()
      .post('/api/attendance/close')
      .set(owner.auth)
      .send({ month: todayIst().slice(0, 7) })
      .expect(400);
    const status = await api()
      .get(`/api/attendance/close?month=${month}`)
      .set(owner.auth)
      .expect(200);
    const mine = status.body.unmarked.find(
      (r: { employee: { id: string } }) => r.employee.id === meId,
    );
    expect(mine.days.length).toBeGreaterThan(15);

    const closed = await api()
      .post('/api/attendance/close')
      .set(owner.auth)
      .send({ month })
      .expect(200);
    expect(closed.body.marked).toBeGreaterThan(15);
    const day = mine.days[0] as string;
    const rec = await prisma.attendanceRecord.findFirst({
      where: { employeeId: meId, date: toDate(day) },
    });
    expect(rec).toMatchObject({ status: 'A', source: 'HR' });

    await api()
      .put('/api/attendance/marks')
      .set(owner.auth)
      .send({ employeeId: meId, date: day, code: 'P' })
      .expect(400);
    await api()
      .post('/api/leave/requests')
      .set(me.auth)
      .send({ leaveTypeId: type('SL').id, startDate: day, endDate: day })
      .expect(400);
    await api().post('/api/attendance/close/reopen').set(owner.auth).send({ month }).expect(200);
    await api()
      .put('/api/attendance/marks')
      .set(owner.auth)
      .send({ employeeId: meId, date: day, code: 'P' })
      .expect(200);
  });

  it('counts weekly offs inside leave when the sandwich rule is on', async () => {
    const { owner, meId, type } = await team();
    let friday = addDays(todayIst(), 10);
    while (toDate(friday).getUTCDay() !== 5) friday = addDays(friday, 1);
    const monday = addDays(friday, 3);
    const off = await api()
      .post('/api/leave/requests')
      .set(owner.auth)
      .send({ employeeId: meId, leaveTypeId: type('FV').id, startDate: friday, endDate: monday })
      .expect(201);
    expect(off.body.days).toBe(2);
    await api().post(`/api/leave/requests/${off.body.id}/cancel`).set(owner.auth).expect(200);
    await api().put('/api/policies/leave').set(owner.auth).send({ sandwich: true }).expect(200);
    const on = await api()
      .post('/api/leave/requests')
      .set(owner.auth)
      .send({ employeeId: meId, leaveTypeId: type('FV').id, startDate: friday, endDate: monday })
      .expect(201);
    expect(on.body.days).toBe(4);
  });
});
