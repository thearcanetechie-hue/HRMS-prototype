import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { todayIst } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

const monthsAgo = (n: number) => {
  const [y, m] = todayIst().split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 - n, 1)).toISOString().slice(0, 7);
};
const fyOf = (month: string) =>
  Number(month.slice(5)) >= 4 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1;

describe('Payroll compliance: declarations, pay items, arrears, settlements and returns', () => {
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
        dateOfJoining: '2020-01-01',
        status: 'ACTIVE',
        ...extra,
      })
      .expect(201);
    return res.body.id as string;
  }
  const salary = (
    auth: Record<string, string>,
    id: string,
    annualCtc: number,
    effectiveFrom = '2020-01-01',
  ) =>
    api()
      .put(`/api/payroll/salaries/${id}`)
      .set(auth)
      .send({ annualCtc, basicPercent: 50, metro: true, effectiveFrom })
      .expect(200);

  /** Runs, reviews, closes attendance for and locks a month. */
  async function runAndLock(auth: Record<string, string>, month: string, pay = false) {
    const run = await api().post('/api/payroll/runs').set(auth).send({ month }).expect(201);
    for (const p of run.body.payslips.filter((x: { flags: unknown[] }) => x.flags.length))
      await api()
        .post(`/api/payroll/runs/${run.body.id}/payslips/${p.id}/review`)
        .set(auth)
        .expect(200);
    await api()
      .post('/api/attendance/close')
      .set(auth)
      .send({ month, unmarkedAs: 'P' })
      .expect(200);
    await api().post(`/api/payroll/runs/${run.body.id}/lock`).set(auth).expect(200);
    if (pay) await api().post(`/api/payroll/runs/${run.body.id}/paid`).set(auth).expect(200);
    return run.body;
  }

  it('takes Form 12BB declarations and taxes by the chosen regime', async () => {
    const owner = await signup(app);
    const id = await addEmployee(owner.auth, 'T1');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `t1@${owner.workspace}.test`,
      id,
    );
    await salary(owner.auth, id, 30_00_000);
    const fyStart = fyOf(todayIst().slice(0, 7));
    const decl = { fyStart, regime: 'OLD', rentMonthly: 40_000, sec80C: 1_50_000, sec80D: 25_000 };
    await api().put('/api/payroll/declarations').set(me.auth).send(decl).expect(400);
    const saved = await api()
      .put('/api/payroll/declarations')
      .set(me.auth)
      .send({ ...decl, landlordPan: 'abcde1234f' })
      .expect(200);
    expect(saved.body).toMatchObject({ regime: 'OLD', landlordPan: 'ABCDE1234F', verified: false });
    const cmp = await api().get('/api/payroll/declarations/compare').set(me.auth).expect(200);
    expect(cmp.body).toMatchObject({ better: expect.stringMatching(/NEW|OLD/) });
    expect(cmp.body.newTax).toBeGreaterThan(0);

    await api().post(`/api/payroll/declarations/${saved.body.id}/verify`).set(me.auth).expect(403);
    await api()
      .post(`/api/payroll/declarations/${saved.body.id}/verify`)
      .set(owner.auth)
      .expect(200);
    await api()
      .put('/api/payroll/declarations')
      .set(me.auth)
      .send({ ...decl, landlordPan: 'ABCDE1234F' })
      .expect(403);

    const run = await api()
      .post('/api/payroll/runs')
      .set(owner.auth)
      .send({ month: monthsAgo(1) })
      .expect(201);
    const slip = run.body.payslips.find((p: { employee: { id: string } }) => p.employee.id === id);
    expect(slip.regime).toBe('OLD');
    expect(slip.lines.find((l: { key: string }) => l.key === 'tds').label).toContain('old regime');
    expect(slip.flags.map((f: { tag: string }) => f.tag)).toEqual(
      expect.arrayContaining(['No PAN', 'No UAN']),
    );
  });

  it('adds one-off pay items and pays arrears for a back-dated raise', async () => {
    const owner = await signup(app);
    const id = await addEmployee(owner.auth, 'A1');
    await salary(owner.auth, id, 12_00_000);
    const first = monthsAgo(2);
    const second = monthsAgo(1);
    await runAndLock(owner.auth, first);
    await api()
      .post('/api/payroll/items')
      .set(owner.auth)
      .send({
        employeeId: id,
        month: first,
        kind: 'INCENTIVE',
        label: 'Sales incentive',
        amount: 5_000,
      })
      .expect(400);

    // A raise back-dated to the first month: the second month pays the difference.
    await salary(owner.auth, id, 15_00_000, `${first}-01`);
    await api()
      .post('/api/payroll/items')
      .set(owner.auth)
      .send({
        employeeId: id,
        month: second,
        kind: 'INCENTIVE',
        label: 'Sales incentive',
        amount: 5_000,
      })
      .expect(201);
    await api()
      .post('/api/payroll/items')
      .set(owner.auth)
      .send({
        employeeId: id,
        month: second,
        kind: 'ADVANCE_RECOVERY',
        label: 'Salary advance',
        amount: 2_000,
      })
      .expect(201);
    const run = await api()
      .post('/api/payroll/runs')
      .set(owner.auth)
      .send({ month: second })
      .expect(201);
    const slip = run.body.payslips.find((p: { employee: { id: string } }) => p.employee.id === id);
    const line = (label: string) =>
      slip.lines.find((l: { label: string }) => l.label.startsWith(label));
    expect(line('Sales incentive')).toMatchObject({ amount: 5_000, kind: 'earning' });
    expect(line('Salary advance')).toMatchObject({ amount: 2_000, kind: 'deduction' });
    // ₹ 15 L gross is ₹ 1,23,200 a month against ₹ 98,200 paid before.
    expect(line('Arrears for')).toMatchObject({ amount: 25_000 });
    expect(slip.flags.map((f: { tag: string }) => f.tag)).toContain('Arrears');
  });

  it('works out a full and final settlement with gratuity, leave encashment and notice recovery', async () => {
    const owner = await signup(app);
    const id = await addEmployee(owner.auth, 'L1');
    await salary(owner.auth, id, 12_00_000);
    const lastDay = `${monthsAgo(1)}-20`;
    await api()
      .post('/api/payroll/settlements')
      .set(owner.auth)
      .send({ employeeId: id, lastWorkingDay: lastDay, noticeServedDays: 10 })
      .expect(200);
    const st = await api().get(`/api/payroll/settlements/${id}`).set(owner.auth).expect(200);
    const data = st.body.data;
    // Over six years since 2020: gratuity on wages of ₹ 49,100.
    expect(data.gratuity).toMatchObject({ eligible: true });
    expect(data.gratuity.amount).toBe(Math.round((49_100 * 15 * data.gratuity.years) / 26));
    // 30 days' notice, 10 served: 20 days of gross recovered.
    expect(data.noticeRecovery).toBe(Math.round((20 * 98_200) / 30));
    expect(data.encashDays).toBeGreaterThan(0);

    await api().post(`/api/payroll/settlements/${id}/finalise`).set(owner.auth).expect(200);
    await api().post(`/api/payroll/settlements/${id}/finalise`).set(owner.auth).expect(409);
    const items = await api()
      .get(`/api/payroll/items?month=${monthsAgo(1)}`)
      .set(owner.auth)
      .expect(200);
    expect(items.body.map((i: { kind: string }) => i.kind).sort()).toEqual([
      'GRATUITY',
      'LEAVE_ENCASHMENT',
      'NOTICE_RECOVERY',
    ]);
    const emp = await prisma.employee.findUniqueOrThrow({ where: { id } });
    expect(emp.dateOfExit?.toISOString().slice(0, 10)).toBe(lastDay);

    const run = await api()
      .post('/api/payroll/runs')
      .set(owner.auth)
      .send({ month: monthsAgo(1) })
      .expect(201);
    const slip = run.body.payslips.find((p: { employee: { id: string } }) => p.employee.id === id);
    expect(slip.lines.some((l: { label: string }) => l.label.startsWith('Gratuity'))).toBe(true);
    expect(slip.flags.map((f: { tag: string }) => f.tag)).toContain('Exit');
  });

  it('produces the PF ECR, ESI, PT/LWF and 24Q files, and the statutory bonus', async () => {
    const owner = await signup(app);
    const high = await addEmployee(owner.auth, 'H1');
    const low = await addEmployee(owner.auth, 'W1');
    const lowLogin = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `w1@${owner.workspace}.test`,
      low,
    );
    await api()
      .put('/api/me/profile')
      .set(lowLogin.auth)
      .send({ uan: '100123456789', esicNumber: '3112345678', pan: 'ABCDE1234F' })
      .expect(200);
    await salary(owner.auth, high, 12_00_000);
    await salary(owner.auth, low, 2_40_000);
    const month = monthsAgo(1);
    const run = await runAndLock(owner.auth, month, true);

    const ecr = await api().get(`/api/payroll/runs/${run.id}/ecr`).set(owner.auth).expect(200);
    const lines = (ecr.body.text as string).trim().split('\n');
    const lowLine = lines.find((l) => l.startsWith('100123456789#~#'))!;
    // UAN, name, gross, EPF wages, EPS wages, EDLI wages, EE, EPS, ER, NCP days, refunds.
    expect(lowLine.split('#~#')).toEqual([
      '100123456789',
      'W1',
      '18307',
      '9154',
      '9154',
      '9154',
      '1098',
      '763',
      '335',
      '0',
      '0',
    ]);
    expect(ecr.body.missing).toEqual(['H1']);

    const esi = await api().get(`/api/payroll/runs/${run.id}/esi`).set(owner.auth).expect(200);
    expect(esi.body.csv).toContain('"3112345678","W1"');
    const levies = await api()
      .get(`/api/payroll/runs/${run.id}/state-levies`)
      .set(owner.auth)
      .expect(200);
    expect(levies.body.csv).toContain('"Not set"');

    const q = [4, 5, 6].includes(Number(month.slice(5)))
      ? 1
      : [7, 8, 9].includes(Number(month.slice(5)))
        ? 2
        : [10, 11, 12].includes(Number(month.slice(5)))
          ? 3
          : 4;
    const q24 = await api()
      .get(`/api/payroll/returns/24q?fyStart=${fyOf(month)}&quarter=${q}`)
      .set(owner.auth)
      .expect(200);
    expect(q24.body.csv).toContain('"ABCDE1234F","W1","192"');

    // The low earner qualifies for bonus; the ₹ 12 L earner's wages are over ₹ 21,000.
    const bonus = await api()
      .post('/api/payroll/bonus')
      .set(owner.auth)
      .send({ fyStart: fyOf(month), month: monthsAgo(0), preview: true })
      .expect(200);
    expect(
      bonus.body.people.map((p: { employee: { employeeCode: string } }) => p.employee.employeeCode),
    ).toEqual(['W1']);
    expect(bonus.body.people[0].amount).toBe(Math.round(7_000 * 0.0833));

    const me = await api()
      .get(`/api/payroll/form16?fyStart=${fyOf(month)}`)
      .set(lowLogin.auth)
      .expect(200);
    expect(me.body).toMatchObject({ regime: 'NEW', grossSalary: 18_307 });
  });
});
