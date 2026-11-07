import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, todayIst } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

// Last month: a month's attendance can be closed (and so payroll locked) once it has ended.
const month = (() => {
  const [y, m] = todayIst().split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
})();
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

describe('Payroll', () => {
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

  const salary = (auth: Record<string, string>, id: string, annualCtc: number) =>
    api()
      .put(`/api/payroll/salaries/${id}`)
      .set(auth)
      .send({ annualCtc, basicPercent: 50, metro: true, effectiveFrom: '2024-01-01' })
      .expect(200);

  it('runs a month: flags, review, lock, pay, payslips and claims paid', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'P1');
    const lowId = await addEmployee(owner.auth, 'P2');
    const emp = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `p1@${owner.workspace}.test`,
      empId,
    );
    // The owner has an employee record from sign-up.
    const ownerEmp = (await api().get('/api/auth/me').set(owner.auth)).body.employee.id as string;

    await salary(owner.auth, empId, 12_00_000);
    await salary(owner.auth, lowId, 2_40_000);
    await salary(owner.auth, ownerEmp, 24_00_000);
    await api()
      .put(`/api/payroll/salaries/${empId}`)
      .set(emp.auth)
      .send({ annualCtc: 99_00_000, effectiveFrom: '2024-01-01' })
      .expect(403);
    const mine = await api().get(`/api/payroll/salaries/${empId}`).set(emp.auth).expect(200);
    expect(mine.body.current.annualCtc).toBe(12_00_000);
    await api().get(`/api/payroll/salaries/${lowId}`).set(emp.auth).expect(404);

    // An approved claim gets paid with the run.
    const cats = await api().get('/api/claims/categories').set(owner.auth).expect(200);
    const travel = cats.body.find((c: { name: string }) => c.name === 'Travel');
    const receipt = await api()
      .post('/api/documents')
      .set(owner.auth)
      .field('employeeId', empId)
      .field('category', 'Receipt')
      .attach('file', PDF, { filename: 'r.pdf', contentType: 'application/pdf' })
      .expect(201);
    const claim = await api()
      .post('/api/claims/expenses')
      .set(owner.auth)
      .send({
        employeeId: empId,
        categoryId: travel.id,
        spentOn: `${month}-15`,
        amount: 1200,
        description: 'Cab',
        receiptDocumentId: receipt.body.id,
      })
      .expect(201);
    await api()
      .post('/api/claims/expenses/decision')
      .set(owner.auth)
      .send({ ids: [claim.body.id], decision: 'APPROVE' })
      .expect(200);

    const run = await api().post('/api/payroll/runs').set(owner.auth).send({ month }).expect(201);
    expect(run.body.status).toBe('DRAFT');
    const slip = (id: string) =>
      run.body.payslips.find((p: { employee: { id: string } }) => p.employee.id === id);
    expect(slip(empId).reimbursements).toBe(1200);
    expect(slip(lowId).flags.map((f: { tag: string }) => f.tag)).toContain('ESI');

    // Employees don't see draft payslips.
    await api()
      .get(`/api/payroll/payslips/${slip(empId).id}`)
      .set(emp.auth)
      .expect(404);
    expect((await api().get('/api/payroll/my-payslips').set(emp.auth).expect(200)).body).toEqual(
      [],
    );

    await api().post(`/api/payroll/runs/${run.body.id}/lock`).set(owner.auth).expect(400);
    for (const p of run.body.payslips.filter((x: { flags: unknown[] }) => x.flags.length))
      await api()
        .post(`/api/payroll/runs/${run.body.id}/payslips/${p.id}/review`)
        .set(owner.auth)
        .expect(200);
    // Payroll locks only once the month's attendance is closed.
    await api().post(`/api/payroll/runs/${run.body.id}/lock`).set(owner.auth).expect(400);
    await api()
      .post('/api/attendance/close')
      .set(owner.auth)
      .send({ month, unmarkedAs: 'P' })
      .expect(200);
    await api().post(`/api/payroll/runs/${run.body.id}/lock`).set(owner.auth).expect(200);
    // And attendance can't reopen while payroll is locked.
    await api().post('/api/attendance/close/reopen').set(owner.auth).send({ month }).expect(400);
    await api().post(`/api/payroll/runs/${run.body.id}/recalculate`).set(owner.auth).expect(400);

    const own = await api()
      .get(`/api/payroll/payslips/${slip(empId).id}`)
      .set(emp.auth)
      .expect(200);
    expect(own.body.net).toBe(slip(empId).net);
    await api()
      .get(`/api/payroll/payslips/${slip(lowId).id}`)
      .set(emp.auth)
      .expect(404);

    const bank = await api()
      .get(`/api/payroll/runs/${run.body.id}/bank-file`)
      .set(owner.auth)
      .expect(200);
    expect(bank.text.split('\n')[0]).toContain('Account number');

    await api().post(`/api/payroll/runs/${run.body.id}/paid`).set(owner.auth).expect(200);
    const claims = await api()
      .get(`/api/claims/expenses?employeeId=${empId}`)
      .set(owner.auth)
      .expect(200);
    expect(claims.body[0].status).toBe('PAID');
  });

  it('tracks statutory filings', async () => {
    const owner = await signup(app);
    const list = await api()
      .get(`/api/payroll/compliance?month=${month}`)
      .set(owner.auth)
      .expect(200);
    const pf = list.body.find((i: { key: string }) => i.key === 'PF');
    expect(pf.status).not.toBe('filed');
    await api()
      .post('/api/payroll/compliance/filed')
      .set(owner.auth)
      .send({ key: 'PF', period: pf.period, reference: 'TRRN123' })
      .expect(201);
    const after = await api()
      .get(`/api/payroll/compliance?month=${month}`)
      .set(owner.auth)
      .expect(200);
    expect(after.body.find((i: { key: string }) => i.key === 'PF')).toMatchObject({
      status: 'filed',
      reference: 'TRRN123',
    });
  });

  it('keeps payroll to payroll people and to each workspace', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const empA = await addEmployee(a.auth, 'W1');
    await salary(a.auth, empA, 6_00_000);
    const run = await api().post('/api/payroll/runs').set(a.auth).send({ month }).expect(201);
    const empLogin = await addLogin(
      app,
      prisma,
      a.workspace,
      'employee',
      `w1@${a.workspace}.test`,
      empA,
    );

    await api().get('/api/payroll/runs').set(empLogin.auth).expect(403);
    await api().get(`/api/payroll/runs/${run.body.id}`).set(b.auth).expect(404);
    await api()
      .put(`/api/payroll/salaries/${empA}`)
      .set(b.auth)
      .send({ annualCtc: 1_00_000, effectiveFrom: '2024-01-01' })
      .expect(404);
    await api().get(`/api/payroll/payslips/${run.body.payslips[0].id}`).set(b.auth).expect(404);
    const bRun = await api().post('/api/payroll/runs').set(b.auth).send({ month }).expect(201);
    expect(
      bRun.body.payslips.map((p: { employee: { id: string } }) => p.employee.id),
    ).not.toContain(empA);
  });
});
