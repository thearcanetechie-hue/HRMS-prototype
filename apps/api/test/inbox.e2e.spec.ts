import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addLogin, createApp, signup } from './helpers';

describe('Inbox', () => {
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
    const ids = [
      await addEmployee(owner.auth, 'E1', { managerId: bossId }),
      await addEmployee(owner.auth, 'E2'),
      await addEmployee(owner.auth, 'E3'),
    ];
    const ws = owner.workspace;
    const boss = await addLogin(app, prisma, ws, 'manager', `b1@${ws}.test`, bossId);
    const e1 = await addLogin(app, prisma, ws, 'employee', `e1@${ws}.test`, ids[0]!);
    const e2 = await addLogin(app, prisma, ws, 'employee', `e2@${ws}.test`, ids[1]!);
    const e3 = await addLogin(app, prisma, ws, 'employee', `e3@${ws}.test`, ids[2]!);
    return { owner, bossId, ids, boss, e1, e2, e3 };
  }

  it('keeps direct messages between their members and tracks unread', async () => {
    const { ids, e1, e2, e3 } = await team();
    const c = await api()
      .post('/api/inbox/conversations')
      .set(e1.auth)
      .send({
        toIds: [ids[1]],
        subject: 'Laptop',
        body: 'Got the laptop, still waiting on the card',
      })
      .expect(201);
    expect(c.body.messages).toHaveLength(1);

    const theirs = await api().get('/api/inbox/conversations').set(e2.auth).expect(200);
    expect(theirs.body[0]).toMatchObject({ subject: 'Laptop', unread: 1 });
    await api().get(`/api/inbox/conversations/${c.body.id}`).set(e3.auth).expect(404);
    await api()
      .post(`/api/inbox/conversations/${c.body.id}/messages`)
      .set(e3.auth)
      .send({ body: 'Let me in' })
      .expect(404);

    await api().get(`/api/inbox/conversations/${c.body.id}`).set(e2.auth).expect(200);
    const read = await api().get('/api/inbox/conversations').set(e2.auth).expect(200);
    expect(read.body[0].unread).toBe(0);
    await api()
      .post(`/api/inbox/conversations/${c.body.id}/messages`)
      .set(e2.auth)
      .send({ body: 'IT says Friday' })
      .expect(201);
    const counts = await api().get('/api/inbox/counts').set(e1.auth).expect(200);
    expect(counts.body.unread).toBe(1);

    await api()
      .post(`/api/inbox/conversations/${c.body.id}/star`)
      .set(e1.auth)
      .send({ starred: true })
      .expect(200);
    const starred = await api()
      .get('/api/inbox/conversations?folder=starred')
      .set(e1.auth)
      .expect(200);
    expect(starred.body).toHaveLength(1);
    const search = await api().get('/api/inbox/conversations?q=friday').set(e1.auth).expect(200);
    expect(search.body).toHaveLength(1);
  });

  it('lets anyone create, join and post in channels', async () => {
    const { e1, e2 } = await team();
    const start = await api().get('/api/inbox/channels').set(e1.auth).expect(200);
    expect(start.body.map((c: { name: string }) => c.name)).toEqual(['all-company']);
    const ch = await api()
      .post('/api/inbox/channels')
      .set(e1.auth)
      .send({ name: 'Bengaluru-Office' })
      .expect(201);
    expect(ch.body.channelName).toBe('bengaluru-office');
    await api()
      .post('/api/inbox/channels')
      .set(e2.auth)
      .send({ name: 'bengaluru-office' })
      .expect(409);

    await api()
      .post(`/api/inbox/conversations/${ch.body.id}/messages`)
      .set(e2.auth)
      .send({ body: 'Hi all' })
      .expect(201);
    const list = await api().get('/api/inbox/channels').set(e2.auth).expect(200);
    expect(list.body.find((c: { name: string }) => c.name === 'bengaluru-office')).toMatchObject({
      joined: true,
      members: 2,
    });
    const unread = await api().get('/api/inbox/channels').set(e1.auth).expect(200);
    expect(unread.body.find((c: { name: string }) => c.name === 'bengaluru-office').unread).toBe(1);
  });

  it('lists approvals waiting on a manager and never crosses workspaces', async () => {
    const { owner, boss, e1, ids } = await team();
    const types = await api().get('/api/leave/types').set(owner.auth).expect(200);
    const day = new Date(Date.now() + 14 * 86_400_000);
    while ([0, 6].includes(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
    const iso = day.toISOString().slice(0, 10);
    await api()
      .post('/api/leave/requests')
      .set(e1.auth)
      .send({
        leaveTypeId: types.body[0].id,
        startDate: iso,
        endDate: iso,
        reason: 'Family function',
      })
      .expect(201);
    const approvals = await api().get('/api/inbox/approvals').set(boss.auth).expect(200);
    expect(approvals.body).toHaveLength(1);
    expect(approvals.body[0]).toMatchObject({ kind: 'LEAVE', employee: { id: ids[0] } });
    const none = await api().get('/api/inbox/approvals').set(e1.auth).expect(200);
    expect(none.body).toEqual([]);

    const b = await signup(app);
    const theirs = await api().get('/api/inbox/conversations').set(b.auth).expect(200);
    expect(theirs.body).toEqual([]);
    await api()
      .post('/api/inbox/conversations')
      .set(b.auth)
      .send({ toIds: [ids[1]], body: 'Hello' })
      .expect(404);
  });
});
