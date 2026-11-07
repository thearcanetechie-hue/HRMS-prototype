import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, todayIst } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

describe('Performance', () => {
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

  const due = addDays(todayIst(), 60);

  it('keeps personal goals to the person, their managers and HR; company goals to everyone', async () => {
    const { owner, me, boss, other, meId, otherId } = await team();
    const mine = await api()
      .post('/api/performance/goals')
      .set(me.auth)
      .send({ title: 'Ship payments v2', dueDate: due })
      .expect(201);
    await api()
      .post('/api/performance/goals')
      .set(me.auth)
      .send({ title: 'Company thing', scope: 'COMPANY', dueDate: due })
      .expect(403);
    await api()
      .post('/api/performance/goals')
      .set(owner.auth)
      .send({ title: 'Grow revenue 30%', scope: 'COMPANY', ownerId: otherId, dueDate: due })
      .expect(201);
    await api()
      .post('/api/performance/goals')
      .set(me.auth)
      .send({ title: 'Theirs', ownerId: otherId, dueDate: due })
      .expect(403);

    const seenByOther = await api().get('/api/performance/goals').set(other.auth).expect(200);
    expect(seenByOther.body.map((g: { title: string }) => g.title)).toEqual(['Grow revenue 30%']);
    await api()
      .patch(`/api/performance/goals/${mine.body.id}`)
      .set(other.auth)
      .send({ progress: 90 })
      .expect(404);

    const upd = await api()
      .patch(`/api/performance/goals/${mine.body.id}`)
      .set(boss.auth)
      .send({ progress: 100 })
      .expect(200);
    expect(upd.body.status).toBe('DONE');
    const seenByBoss = await api()
      .get(`/api/performance/goals?ownerId=${meId}`)
      .set(boss.auth)
      .expect(200);
    expect(seenByBoss.body[0]).toMatchObject({ progress: 100, canEdit: true });
  });

  it('runs a review cycle: self, manager, calibrate and share', async () => {
    const { owner, me, boss, other } = await team();
    await api()
      .post('/api/performance/cycles')
      .set(boss.auth)
      .send({ name: 'H2 2026', closesOn: due })
      .expect(403);
    await api()
      .post('/api/performance/cycles')
      .set(owner.auth)
      .send({ name: 'H2 2026', closesOn: due })
      .expect(201);
    await api()
      .post('/api/performance/cycles')
      .set(owner.auth)
      .send({ name: 'Another', closesOn: due })
      .expect(409);

    const mineList = await api().get('/api/performance/reviews').set(me.auth).expect(200);
    const myReview = mineList.body.reviews.find((r: { canWriteSelf: boolean }) => r.canWriteSelf);
    await api()
      .post(`/api/performance/reviews/${myReview.id}/self`)
      .set(me.auth)
      .send({ rating: 4, comments: 'Shipped payments v2' })
      .expect(200);

    // A colleague can't write the manager review; the manager can.
    await api()
      .post(`/api/performance/reviews/${myReview.id}/manager`)
      .set(other.auth)
      .send({ rating: 1, comments: 'No' })
      .expect(404);
    await api()
      .post(`/api/performance/reviews/${myReview.id}/manager`)
      .set(boss.auth)
      .send({ rating: 5, comments: 'Outstanding year' })
      .expect(200);

    // Before sharing, the employee doesn't see the manager's rating.
    let mine = await api().get('/api/performance/reviews').set(me.auth).expect(200);
    let r = mine.body.reviews.find((x: { id: string }) => x.id === myReview.id);
    expect(r.managerRating).toBeNull();

    await api()
      .post(`/api/performance/reviews/${myReview.id}/share`)
      .set(owner.auth)
      .send({ finalRating: 4 })
      .expect(200);
    mine = await api().get('/api/performance/reviews').set(me.auth).expect(200);
    r = mine.body.reviews.find((x: { id: string }) => x.id === myReview.id);
    expect(r).toMatchObject({ stage: 'SHARED', managerRating: 5, finalRating: 4 });
    const overview = await api().get('/api/performance/overview').set(owner.auth).expect(200);
    expect(overview.body.counts.shared).toBe(1);
  });

  it('records kudos and never shows another workspace’s goals', async () => {
    const { me, otherId, meId } = await team();
    await api()
      .post('/api/performance/kudos')
      .set(me.auth)
      .send({ toId: meId, value: 'Ownership', reason: 'Me' })
      .expect(400);
    await api()
      .post('/api/performance/kudos')
      .set(me.auth)
      .send({ toId: otherId, value: 'Ownership', reason: 'Owned the release' })
      .expect(201);
    const list = await api().get('/api/performance/kudos').set(me.auth).expect(200);
    expect(list.body.top[0]).toMatchObject({ count: 1 });

    const b = await signup(app);
    const goals = await api().get('/api/performance/goals').set(b.auth).expect(200);
    expect(goals.body).toEqual([]);
    await api()
      .post('/api/performance/kudos')
      .set(b.auth)
      .send({ toId: otherId, value: 'x1', reason: 'Nice one' })
      .expect(404);
  });
});
