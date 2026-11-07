import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, todayIst } from '../src/attendance/days';
import { addLogin, createApp, signup } from './helpers';

describe('Engagement', () => {
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
      .send({ name: 'Sales' })
      .expect(201);
    const ids = [
      await addEmployee(owner.auth, 'E1', { departmentId: dept.body.id }),
      await addEmployee(owner.auth, 'E2'),
      await addEmployee(owner.auth, 'E3'),
    ];
    const logins = [];
    for (const [i, id] of ids.entries())
      logins.push(
        await addLogin(
          app,
          prisma,
          owner.workspace,
          'employee',
          `e${i + 1}@${owner.workspace}.test`,
          id,
        ),
      );
    return { owner, deptId: dept.body.id as string, ids, logins };
  }

  it('posts, likes, comments and keeps department posts inside the department', async () => {
    const { owner, deptId, logins } = await team();
    const e1 = logins[0]!;
    const e2 = logins[1]!;
    await api()
      .post('/api/engagement/posts')
      .set(e1.auth)
      .send({ kind: 'ANNOUNCEMENT', body: 'Hello' })
      .expect(403);
    const win = await api()
      .post('/api/engagement/posts')
      .set(e1.auth)
      .send({ kind: 'WIN', body: 'Signed Saffron Retail #SaffronWin' })
      .expect(201);
    await api()
      .post('/api/engagement/posts')
      .set(e1.auth)
      .send({ body: 'Sales only', departmentId: deptId })
      .expect(201);

    const seen = await api().get('/api/engagement/feed').set(e2.auth).expect(200);
    expect(seen.body.posts.map((p: { body: string }) => p.body)).toEqual([
      'Signed Saffron Retail #SaffronWin',
    ]);

    const liked = await api()
      .post(`/api/engagement/posts/${win.body.id}/react`)
      .set(e2.auth)
      .expect(200);
    expect(liked.body).toEqual({ liked: true, reactions: 1 });
    await api()
      .post(`/api/engagement/posts/${win.body.id}/comments`)
      .set(e2.auth)
      .send({ body: 'Brilliant!' })
      .expect(201);
    await api().delete(`/api/engagement/posts/${win.body.id}`).set(e2.auth).expect(403);

    const mine = await api().get('/api/engagement/feed').set(e1.auth).expect(200);
    expect(mine.body.posts.find((p: { id: string }) => p.id === win.body.id)).toMatchObject({
      reactions: 1,
      comments: 1,
      canDelete: true,
    });
    const side = await api().get('/api/engagement/sidebar').set(owner.auth).expect(200);
    expect(side.body.trending).toEqual(['#SaffronWin']);
  });

  it('runs events, polls and kudos on the feed', async () => {
    const { owner, ids, logins } = await team();
    const e1 = logins[0]!;
    const e2 = logins[1]!;
    const ev = await api()
      .post('/api/engagement/posts')
      .set(owner.auth)
      .send({
        kind: 'EVENT',
        body: 'Lunch and lanterns',
        eventTitle: 'Diwali',
        eventStartsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      })
      .expect(201);
    const r = await api()
      .post(`/api/engagement/posts/${ev.body.id}/rsvp`)
      .set(e1.auth)
      .send({ answer: 'GOING' })
      .expect(200);
    expect(r.body).toMatchObject({ going: 1, maybe: 0 });

    await api()
      .post('/api/engagement/polls')
      .set(e1.auth)
      .send({ question: 'Offsite?', options: ['Coorg', 'Goa'], closesOn: addDays(todayIst(), 3) })
      .expect(403);
    const poll = await api()
      .post('/api/engagement/polls')
      .set(owner.auth)
      .send({ question: 'Offsite?', options: ['Coorg', 'Goa'], closesOn: addDays(todayIst(), 3) })
      .expect(201);
    const voted = await api()
      .post(`/api/engagement/polls/${poll.body.id}/vote`)
      .set(e2.auth)
      .send({ optionId: poll.body.options[1].id })
      .expect(200);
    expect(voted.body).toMatchObject({ votes: 1, voted: poll.body.options[1].id });

    await api()
      .post('/api/performance/kudos')
      .set(e1.auth)
      .send({ toId: ids[1], value: 'Teamwork', reason: 'Saved the demo' })
      .expect(201);
    const kudos = await api().get('/api/engagement/feed?tab=kudos').set(e2.auth).expect(200);
    expect(kudos.body.posts[0]).toMatchObject({ kind: 'KUDOS', kudos: { value: 'Teamwork' } });
  });

  it('keeps pulse answers anonymous and hides results until enough people answer', async () => {
    const { owner, logins } = await team();
    const s = await api()
      .post('/api/engagement/pulse')
      .set(owner.auth)
      .send({ name: 'October pulse', closesOn: addDays(todayIst(), 7) })
      .expect(201);
    await api()
      .post('/api/engagement/pulse')
      .set(owner.auth)
      .send({ name: 'Another', closesOn: addDays(todayIst(), 7) })
      .expect(409);
    const answer = { score: 8, recognised: true, managerSupport: true, workloadFair: false };
    const first = await api()
      .post(`/api/engagement/pulse/${s.body.id}/respond`)
      .set(logins[0]!.auth)
      .send(answer)
      .expect(200);
    expect(first.body).toMatchObject({ replies: 1, score: null, items: [], answered: true });
    await api()
      .post(`/api/engagement/pulse/${s.body.id}/respond`)
      .set(logins[0]!.auth)
      .send(answer)
      .expect(409);
    await api()
      .post(`/api/engagement/pulse/${s.body.id}/respond`)
      .set(logins[1]!.auth)
      .send(answer)
      .expect(200);
    const third = await api()
      .post(`/api/engagement/pulse/${s.body.id}/respond`)
      .set(logins[2]!.auth)
      .send({ ...answer, score: 5, workloadFair: true })
      .expect(200);
    expect(third.body).toMatchObject({ replies: 3, score: 7 });
    expect(third.body.items[2]).toEqual({ label: 'Workload is fair', pct: 33 });

    // Responses carry no link to the person who answered.
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'PulseResponse'`;
    expect(cols.map((c) => c.column_name)).not.toContain('employeeId');

    const b = await signup(app);
    const other = await api().get('/api/engagement/sidebar').set(b.auth).expect(200);
    expect(other.body.pulse).toBeNull();
  });
});
