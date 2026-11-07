import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, todayIst } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

describe('Learning', () => {
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
    const dept = await api()
      .post('/api/org/departments')
      .set(owner.auth)
      .send({ name: 'Engineering' })
      .expect(201);
    const meId = await addEmployee(owner.auth, 'E1', { departmentId: dept.body.id });
    const otherId = await addEmployee(owner.auth, 'O1');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `e1@${owner.workspace}.test`,
      meId,
    );
    const other = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `o1@${owner.workspace}.test`,
      otherId,
    );
    return { owner, deptId: dept.body.id as string, meId, otherId, me, other };
  }

  const today = todayIst();
  const course = (extra: object = {}) => ({
    title: 'Applied AI',
    category: 'Engineering',
    startsOn: addDays(today, -3),
    endsOn: addDays(today, 30),
    hours: 6,
    ...extra,
  });

  it('enrols everyone in a mandatory course and keeps department courses to that department', async () => {
    const { owner, me, other, deptId } = await team();
    await api().post('/api/learning/courses').set(me.auth).send(course()).expect(403);
    const posh = await api()
      .post('/api/learning/courses')
      .set(owner.auth)
      .send(course({ title: 'POSH awareness', category: 'Compliance', mandatory: true }))
      .expect(201);
    expect(posh.body).toMatchObject({ status: 'ONGOING', registered: 3, notStarted: 3 });
    await api()
      .post('/api/learning/courses')
      .set(owner.auth)
      .send(course({ departmentId: deptId, seats: 1 }))
      .expect(201);

    const mine = await api().get('/api/learning/overview').set(me.auth).expect(200);
    expect(mine.body.courses.map((c: { title: string }) => c.title).sort()).toEqual([
      'Applied AI',
      'POSH awareness',
    ]);
    const theirs = await api().get('/api/learning/overview').set(other.auth).expect(200);
    expect(theirs.body.courses.map((c: { title: string }) => c.title)).toEqual(['POSH awareness']);

    // Can't leave a mandatory course; can't see learners without being lead/HR/manager.
    await api().delete(`/api/learning/courses/${posh.body.id}/enrol`).set(me.auth).expect(400);
    await api().get(`/api/learning/courses/${posh.body.id}/learners`).set(me.auth).expect(403);
    const learners = await api()
      .get(`/api/learning/courses/${posh.body.id}/learners`)
      .set(owner.auth)
      .expect(200);
    expect(learners.body).toHaveLength(3);
  });

  it('lets people sign up while there are seats and track their own progress', async () => {
    const { owner, me, other, otherId } = await team();
    const c = await api()
      .post('/api/learning/courses')
      .set(owner.auth)
      .send(course({ seats: 1 }))
      .expect(201);
    const signed = await api()
      .post(`/api/learning/courses/${c.body.id}/enrol`)
      .set(me.auth)
      .expect(200);
    expect(signed.body.mine).toMatchObject({ progress: 0 });
    await api().post(`/api/learning/courses/${c.body.id}/enrol`).set(me.auth).expect(409);
    await api().post(`/api/learning/courses/${c.body.id}/enrol`).set(other.auth).expect(400);
    await api()
      .post(`/api/learning/courses/${c.body.id}/assign`)
      .set(owner.auth)
      .send({ employeeIds: [otherId] })
      .expect(400);

    const id = signed.body.mine.id;
    await api()
      .patch(`/api/learning/enrolments/${id}`)
      .set(other.auth)
      .send({ progress: 100 })
      .expect(404);
    await api()
      .patch(`/api/learning/enrolments/${id}`)
      .set(me.auth)
      .send({ progress: 100 })
      .expect(200);
    const o = await api().get('/api/learning/overview').set(owner.auth).expect(200);
    expect(o.body.courses[0]).toMatchObject({ done: 1, avg: 100 });
    expect(o.body.stats).toMatchObject({ completionPct: 100, hours: 6 });
  });

  it('shows upcoming sessions and never another workspace’s courses', async () => {
    const { owner } = await team();
    const c = await api().post('/api/learning/courses').set(owner.auth).send(course()).expect(201);
    const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
    await api()
      .post(`/api/learning/courses/${c.body.id}/sessions`)
      .set(owner.auth)
      .send({ title: 'Session 1', startsAt: at, minutes: 90 })
      .expect(201);
    const o = await api().get('/api/learning/overview').set(owner.auth).expect(200);
    expect(o.body.sessions).toHaveLength(1);

    const b = await signup(app);
    const ob = await api().get('/api/learning/overview').set(b.auth).expect(200);
    expect(ob.body.courses).toEqual([]);
    await api().post(`/api/learning/courses/${c.body.id}/enrol`).set(b.auth).expect(404);
  });
});
