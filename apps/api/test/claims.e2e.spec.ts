import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, todayIst } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

describe('Overtime and expense claims', () => {
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
    return { owner, bossId, meId, otherId, me, boss, other };
  }

  it('records overtime, lets the manager approve it in bulk, and refuses duplicates', async () => {
    const { me, boss, other, meId } = await team();
    const d1 = addDays(todayIst(), -3);
    const d2 = addDays(todayIst(), -2);
    const a = await api()
      .post('/api/claims/overtime')
      .set(me.auth)
      .send({ date: d1, hours: 3, reason: 'Release night' })
      .expect(201);
    const b = await api()
      .post('/api/claims/overtime')
      .set(me.auth)
      .send({ date: d2, hours: 2.5, reason: 'Stock count' })
      .expect(201);
    await api()
      .post('/api/claims/overtime')
      .set(me.auth)
      .send({ date: d1, hours: 1, reason: 'Again' })
      .expect(409);
    await api()
      .post('/api/claims/overtime')
      .set(me.auth)
      .send({ date: addDays(todayIst(), 2), hours: 1, reason: 'Future' })
      .expect(400);

    // Not their own, and not someone outside the line.
    await api()
      .post('/api/claims/overtime/decision')
      .set(me.auth)
      .send({ ids: [a.body.id], decision: 'APPROVE' })
      .expect(403);
    await api()
      .post('/api/claims/overtime/decision')
      .set(other.auth)
      .send({ ids: [a.body.id], decision: 'APPROVE' })
      .expect(404);

    await api()
      .post('/api/claims/overtime/decision')
      .set(boss.auth)
      .send({ ids: [a.body.id, b.body.id], decision: 'APPROVE' })
      .expect(200);
    const list = await api()
      .get(`/api/claims/overtime?employeeId=${meId}`)
      .set(boss.auth)
      .expect(200);
    expect(list.body.map((r: { status: string }) => r.status)).toEqual(['APPROVED', 'APPROVED']);
    const summary = await api().get('/api/claims/summary').set(boss.auth).expect(200);
    expect(summary.body.overtimeApprovedHours).toBeGreaterThanOrEqual(0);
  });

  it('checks receipts and limits on expenses, and only HR marks them paid', async () => {
    const { owner, me, boss, meId, otherId } = await team();
    const cats = await api().get('/api/claims/categories').set(me.auth).expect(200);
    const travel = cats.body.find((c: { name: string }) => c.name === 'Travel');
    const spentOn = addDays(todayIst(), -1);

    // Needs a receipt; over the limit is refused.
    await api()
      .post('/api/claims/expenses')
      .set(me.auth)
      .send({ categoryId: travel.id, spentOn, amount: 900, description: 'Cab' })
      .expect(400);
    const receipt = await api()
      .post('/api/documents')
      .set(me.auth)
      .field('employeeId', meId)
      .field('category', 'Receipt')
      .attach('file', PDF, { filename: 'cab.pdf', contentType: 'application/pdf' })
      .expect(201);
    await api()
      .post('/api/claims/expenses')
      .set(me.auth)
      .send({
        categoryId: travel.id,
        spentOn,
        amount: 9000,
        description: 'Flight',
        receiptDocumentId: receipt.body.id,
      })
      .expect(400);
    // Someone else's document can't be used as a receipt.
    const theirs = await api()
      .post('/api/documents')
      .set(owner.auth)
      .field('employeeId', otherId)
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(201);
    await api()
      .post('/api/claims/expenses')
      .set(me.auth)
      .send({
        categoryId: travel.id,
        spentOn,
        amount: 900,
        description: 'Cab',
        receiptDocumentId: theirs.body.id,
      })
      .expect(400);

    const claim = await api()
      .post('/api/claims/expenses')
      .set(me.auth)
      .send({
        categoryId: travel.id,
        spentOn,
        amount: 900,
        description: 'Cab to client',
        receiptDocumentId: receipt.body.id,
      })
      .expect(201);

    await api()
      .post('/api/claims/expenses/decision')
      .set(boss.auth)
      .send({ ids: [claim.body.id], decision: 'PAID' })
      .expect(403);
    await api()
      .post('/api/claims/expenses/decision')
      .set(boss.auth)
      .send({ ids: [claim.body.id], decision: 'APPROVE' })
      .expect(200);
    await api()
      .post('/api/claims/expenses/decision')
      .set(owner.auth)
      .send({ ids: [claim.body.id], decision: 'PAID' })
      .expect(200);
    const mine = await api().get('/api/claims/expenses').set(me.auth).expect(200);
    expect(mine.body[0]).toMatchObject({ status: 'PAID', amount: 900 });
    const summary = await api().get('/api/claims/summary').set(owner.auth).expect(200);
    expect(summary.body.spendByCategory).toContainEqual({ label: 'Travel', amount: 900 });
  });

  it('never shows one workspace another workspace’s claims', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const empA = await addEmployee(a.auth, 'T1');
    const ot = await api()
      .post('/api/claims/overtime')
      .set(a.auth)
      .send({ employeeId: empA, date: addDays(todayIst(), -1), hours: 2, reason: 'Late shift' })
      .expect(201);
    await api()
      .post('/api/claims/overtime/decision')
      .set(b.auth)
      .send({ ids: [ot.body.id], decision: 'APPROVE' })
      .expect(404);
    await api()
      .post('/api/claims/overtime')
      .set(b.auth)
      .send({ employeeId: empA, date: addDays(todayIst(), -1), hours: 2, reason: 'Late shift' })
      .expect(404);
    const list = await api().get('/api/claims/overtime').set(b.auth).expect(200);
    expect(list.body).toEqual([]);
  });
});
