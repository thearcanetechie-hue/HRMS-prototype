import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addLogin, createApp, signup } from './helpers';

describe('Assets', () => {
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

  const laptop = (serial: string) => ({
    name: 'ThinkPad E14',
    category: 'Laptop',
    serial,
    purchasedOn: '2026-01-10',
    cost: 74990,
    warrantyUntil: '2029-01-10',
    location: 'Bengaluru HQ',
  });

  it('numbers assets and tracks assign, return, repair and retire with history', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'A1');

    const a = await api().post('/api/assets').set(owner.auth).send(laptop('SN-1')).expect(201);
    const b = await api().post('/api/assets').set(owner.auth).send(laptop('SN-2')).expect(201);
    expect([a.body.tag, b.body.tag]).toEqual(['AST-0001', 'AST-0002']);
    expect(a.body).toMatchObject({ status: 'IN_STOCK', condition: 'NEW', holder: null });
    await api().post('/api/assets').set(owner.auth).send(laptop('SN-1')).expect(409);

    const assigned = await api()
      .post(`/api/assets/${a.body.id}/assign`)
      .set(owner.auth)
      .send({ employeeId: empId, note: 'with charger' })
      .expect(200);
    expect(assigned.body).toMatchObject({ status: 'ASSIGNED', holder: { id: empId, name: 'A1' } });
    // Can't assign what's already out.
    await api()
      .post(`/api/assets/${a.body.id}/assign`)
      .set(owner.auth)
      .send({ employeeId: empId })
      .expect(400);

    const held = await api().get(`/api/employees/${empId}/assets`).set(owner.auth).expect(200);
    expect(held.body.map((x: { id: string }) => x.id)).toEqual([a.body.id]);

    const back = await api()
      .post(`/api/assets/${a.body.id}/return`)
      .set(owner.auth)
      .send({ condition: 'DAMAGED', note: 'cracked hinge' })
      .expect(200);
    expect(back.body).toMatchObject({ status: 'IN_REPAIR', holder: null, condition: 'DAMAGED' });

    const fixed = await api()
      .post(`/api/assets/${a.body.id}/status`)
      .set(owner.auth)
      .send({ status: 'IN_STOCK' })
      .expect(200);
    expect(fixed.body).toMatchObject({ status: 'IN_STOCK', condition: 'GOOD' });

    // Retiring an assigned asset is refused; it must come back first.
    await api()
      .post(`/api/assets/${b.body.id}/assign`)
      .set(owner.auth)
      .send({ employeeId: empId })
      .expect(200);
    await api()
      .post(`/api/assets/${b.body.id}/status`)
      .set(owner.auth)
      .send({ status: 'RETIRED' })
      .expect(400);

    const full = await api().get(`/api/assets/${a.body.id}`).set(owner.auth).expect(200);
    expect(full.body.history.map((h: { kind: string }) => h.kind)).toEqual([
      'in_stock',
      'repair',
      'returned',
      'assigned',
      'added',
    ]);
  });

  it('flags assets held by people who are leaving', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'L1');
    const a = await api().post('/api/assets').set(owner.auth).send(laptop('SN-L')).expect(201);
    await api()
      .post(`/api/assets/${a.body.id}/assign`)
      .set(owner.auth)
      .send({ employeeId: empId })
      .expect(200);
    await api()
      .post(`/api/employees/${empId}/checklists`)
      .set(owner.auth)
      .send({ kind: 'OFFBOARDING', startDate: '2026-12-15' })
      .expect(201);
    const list = await api().get('/api/assets').set(owner.auth).expect(200);
    expect(list.body[0].holder).toMatchObject({ id: empId, leaving: '2026-12-15' });
  });

  it('keeps the register to HR, and lets people see what they hold', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'E1');
    const otherId = await addEmployee(owner.auth, 'E2');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `e1@${owner.workspace}.test`,
      empId,
    );
    const a = await api().post('/api/assets').set(owner.auth).send(laptop('SN-E')).expect(201);
    await api()
      .post(`/api/assets/${a.body.id}/assign`)
      .set(owner.auth)
      .send({ employeeId: empId })
      .expect(200);

    await api().get('/api/assets').set(me.auth).expect(403);
    await api().post('/api/assets').set(me.auth).send(laptop('SN-X')).expect(403);
    await api()
      .post(`/api/assets/${a.body.id}/return`)
      .set(me.auth)
      .send({ condition: 'GOOD' })
      .expect(403);
    const mine = await api().get(`/api/employees/${empId}/assets`).set(me.auth).expect(200);
    expect(mine.body).toHaveLength(1);
    await api().get(`/api/employees/${otherId}/assets`).set(me.auth).expect(404);
  });

  it('never shows one workspace another workspace’s assets', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const empA = await addEmployee(a.auth, 'T1');
    const empB = await addEmployee(b.auth, 'T2');
    const asset = await api().post('/api/assets').set(a.auth).send(laptop('SN-T')).expect(201);

    await api().get(`/api/assets/${asset.body.id}`).set(b.auth).expect(404);
    await api()
      .post(`/api/assets/${asset.body.id}/assign`)
      .set(b.auth)
      .send({ employeeId: empB })
      .expect(404);
    await api()
      .post(`/api/assets/${asset.body.id}/status`)
      .set(b.auth)
      .send({ status: 'LOST' })
      .expect(404);
    const mine = await api().post('/api/assets').set(b.auth).send(laptop('SN-T')).expect(201);
    // Workspace B can't hand its asset to workspace A's employee.
    await api()
      .post(`/api/assets/${mine.body.id}/assign`)
      .set(b.auth)
      .send({ employeeId: empA })
      .expect(404);
    expect(mine.body.tag).toBe('AST-0001');
    const list = await api().get('/api/assets').set(b.auth).expect(200);
    expect(list.body.map((x: { id: string }) => x.id)).toEqual([mine.body.id]);
  });
});
