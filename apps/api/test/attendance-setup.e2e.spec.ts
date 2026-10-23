import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, todayIst, toDate } from '../src/attendance/days';
import { DevicesService } from '../src/attendance/devices.service';
import { addLogin, createApp, signup } from './helpers';

describe('Shifts, holidays, fixes and biometric devices', () => {
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
    const bossId = await addEmployee(owner.auth, 'B1');
    const meId = await addEmployee(owner.auth, 'E1', { managerId: bossId });
    const otherId = await addEmployee(owner.auth, 'O1');
    const ws = owner.workspace;
    const boss = await addLogin(app, prisma, ws, 'manager', `b1@${ws}.test`, bossId);
    const me = await addLogin(app, prisma, ws, 'employee', `e1@${ws}.test`, meId);
    const other = await addLogin(app, prisma, ws, 'employee', `o1@${ws}.test`, otherId);
    return { owner, bossId, meId, otherId, boss, me, other };
  }

  /** The next date on or after `from` that falls on a given weekday (0 Sunday). */
  const next = (from: string, dow: number) => {
    let d = from;
    while (toDate(d).getUTCDay() !== dow) d = addDays(d, 1);
    return d;
  };
  /** The most recent Monday to Thursday before today. */
  const lastWorkday = () => {
    let d = addDays(todayIst(), -1);
    while (![1, 2, 3, 4].includes(toDate(d).getUTCDay())) d = addDays(d, -1);
    return d;
  };

  it('uses each person’s shift for weekly offs and the holiday list for days off', async () => {
    const { owner, me, meId } = await team();
    const shifts = await api().get('/api/attendance/shifts').set(owner.auth).expect(200);
    expect(shifts.body[0]).toMatchObject({ name: 'General', isDefault: true, weeklyOffs: [0, 6] });

    await api()
      .post('/api/attendance/shifts')
      .set(me.auth)
      .send({ name: 'Retail', startTime: '10:00', endTime: '19:00' })
      .expect(403);
    const retail = await api()
      .post('/api/attendance/shifts')
      .set(owner.auth)
      .send({ name: 'Retail', startTime: '10:00', endTime: '19:00', weeklyOffs: [2] })
      .expect(201);
    await api()
      .post(`/api/attendance/shifts/${retail.body.id}/assign`)
      .set(owner.auth)
      .send({ employeeIds: [meId] })
      .expect(200);

    // A Monday to Sunday week: on Retail only Tuesday is off, so a full week of leave is 6 days.
    const monday = next(addDays(todayIst(), 14), 1);
    const holiday = addDays(monday, 3);
    await api()
      .post('/api/attendance/holidays')
      .set(owner.auth)
      .send({ date: holiday, name: 'Diwali' })
      .expect(201);
    await api()
      .post('/api/attendance/holidays')
      .set(owner.auth)
      .send({ date: holiday, name: 'Diwali' })
      .expect(409);

    const types = await api().get('/api/leave/types').set(owner.auth).expect(200);
    // Field visit has no yearly limit, so a full week fits.
    const unpaid = types.body.find((t: { code: string }) => t.code === 'FV');
    const leave = await api()
      .post('/api/leave/requests')
      .set(owner.auth)
      .send({
        employeeId: meId,
        leaveTypeId: unpaid.id,
        startDate: monday,
        endDate: addDays(monday, 6),
      })
      .expect(201);
    // 7 days, minus Tuesday off, minus the holiday on Thursday.
    expect(Number(leave.body.days)).toBe(5);

    const reg = await api()
      .get(`/api/attendance/register?month=${holiday.slice(0, 7)}`)
      .set(owner.auth)
      .expect(200);
    const row = reg.body.rows.find((r: { employee: { id: string } }) => r.employee.id === meId);
    const idx = (d: string) => reg.body.days.indexOf(d);
    expect(row.cells[idx(addDays(monday, 1))].code).toBe('W');
    expect(row.cells[idx(holiday)]).toMatchObject({ code: 'H', title: 'Diwali' });
    expect(reg.body.holidays).toEqual([expect.objectContaining({ date: holiday, name: 'Diwali' })]);
  });

  it('lets people ask to fix a missed punch, and only their manager or HR decides', async () => {
    const { boss, me, other, meId } = await team();
    const day = lastWorkday();
    await api()
      .post('/api/attendance/regularisations')
      .set(me.auth)
      .send({ date: addDays(todayIst(), 1), checkIn: '09:30', reason: 'Forgot' })
      .expect(400);
    const fix = await api()
      .post('/api/attendance/regularisations')
      .set(me.auth)
      .send({ date: day, checkIn: '09:20', checkOut: '18:40', reason: 'Card reader was down' })
      .expect(201);
    await api()
      .post('/api/attendance/regularisations')
      .set(me.auth)
      .send({ date: day, checkIn: '09:20', reason: 'Again' })
      .expect(409);

    await api()
      .post(`/api/attendance/regularisations/${fix.body.id}/decision`)
      .set(me.auth)
      .send({ decision: 'APPROVE' })
      .expect(403);
    await api()
      .post(`/api/attendance/regularisations/${fix.body.id}/decision`)
      .set(other.auth)
      .send({ decision: 'APPROVE' })
      .expect(403);
    const waiting = await api().get('/api/inbox/approvals').set(boss.auth).expect(200);
    expect(waiting.body.some((a: { kind: string }) => a.kind === 'ATTENDANCE')).toBe(true);
    await api()
      .post(`/api/attendance/regularisations/${fix.body.id}/decision`)
      .set(boss.auth)
      .send({ decision: 'APPROVE' })
      .expect(200);

    const record = await prisma.attendanceRecord.findFirst({
      where: { employeeId: meId, date: toDate(day) },
    });
    expect(record).toMatchObject({ status: 'P', source: 'REGULARISED' });
    const mine = await api()
      .get('/api/attendance/regularisations?mine=true')
      .set(me.auth)
      .expect(200);
    expect(mine.body[0]).toMatchObject({
      status: 'APPROVED',
      recorded: { checkIn: '09:20', checkOut: '18:40' },
    });
  });

  it('takes punches from devices by key or serial number and turns them into attendance', async () => {
    const { owner, meId } = await team();
    const added = await api()
      .post('/api/attendance/devices')
      .set(owner.auth)
      .send({ name: 'Front door', serialNumber: `cq${Date.now()}` })
      .expect(201);
    const { key, device } = added.body;
    expect(key).toMatch(/^hrd_/);
    expect(device.keyHash).toBeUndefined();

    const day = lastWorkday();
    const punches = [
      { userId: '1007', time: `${day}T09:05:00+05:30`, direction: 'IN' },
      { userId: '1007', time: `${day}T13:00:00+05:30` },
      { userId: '1007', time: `${day}T18:45:00+05:30`, direction: 'OUT' },
    ];
    await api().post('/api/attendance/punches').send({ punches }).expect(401);
    await api()
      .post('/api/attendance/punches')
      .set('X-Device-Key', 'hrd_wrong')
      .send({ punches })
      .expect(401);
    const first = await api()
      .post('/api/attendance/punches')
      .set('X-Device-Key', key)
      .send({ punches })
      .expect(200);
    expect(first.body).toMatchObject({ received: 3, stored: 3, unmatched: 3 });
    // Sending the same punches again stores nothing new.
    const again = await api()
      .post('/api/attendance/punches')
      .set('X-Device-Key', key)
      .send({ punches })
      .expect(200);
    expect(again.body.stored).toBe(0);

    const unmatched = await api()
      .get('/api/attendance/devices/unmatched')
      .set(owner.auth)
      .expect(200);
    expect(unmatched.body[0]).toMatchObject({ deviceUserId: '1007', punches: 3 });
    const mapped = await api()
      .post('/api/attendance/devices/map')
      .set(owner.auth)
      .send({ deviceUserId: '1007', employeeId: meId })
      .expect(200);
    expect(mapped.body).toEqual({ linked: 3, days: 1 });
    const rec = await prisma.attendanceRecord.findFirst({
      where: { employeeId: meId, date: toDate(day) },
    });
    expect(rec).toMatchObject({ status: 'P', source: 'BIOMETRIC' });
    expect(rec!.checkIn!.toISOString()).toBe(new Date(`${day}T09:05:00+05:30`).toISOString());
    expect(rec!.checkOut!.toISOString()).toBe(new Date(`${day}T18:45:00+05:30`).toISOString());

    // The ZKTeco/eSSL push protocol, outside /api.
    const sn = device.serialNumber as string;
    await api().get('/iclock/cdata?SN=UNKNOWN1').expect(401);
    const hello = await api().get(`/iclock/cdata?SN=${sn}&options=all`).expect(200);
    expect(hello.text).toContain(`GET OPTION FROM: ${sn}`);
    const earlier = addDays(day, -7);
    const upload = await api()
      .post(`/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=1`)
      .set('Content-Type', 'text/plain')
      .send(`1007\t${earlier} 09:40:10\t0\t1\t0\n1007\t${earlier} 13:10:00\t1\t1\t0\n`)
      .expect(200);
    expect(upload.text).toBe('OK: 2');
    const short = await prisma.attendanceRecord.findFirst({
      where: { employeeId: meId, date: toDate(earlier) },
    });
    // Three and a half hours is less than a full day.
    expect(short).toMatchObject({ status: 'HD', source: 'BIOMETRIC' });

    const b = await signup(app);
    const theirs = await api().get('/api/attendance/devices').set(b.auth).expect(200);
    expect(theirs.body).toEqual([]);
  });

  it('parses ADMS attendance lines and skips junk', () => {
    const p = DevicesService.parseAttlog(
      '12\t2026-10-20 09:01:02\t0\t1\nbad line\n13\t2026-10-20 18:00\t1\t15\n',
    );
    expect(p).toEqual([
      { userId: '12', time: new Date('2026-10-20T09:01:02+05:30'), direction: 'IN' },
      { userId: '13', time: new Date('2026-10-20T18:00+05:30'), direction: 'OUT' },
    ]);
  });
});
