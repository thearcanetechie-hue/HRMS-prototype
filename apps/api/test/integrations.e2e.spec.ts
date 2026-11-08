import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { signBody } from '../src/integrations/webhooks.service';
import { addLogin, createApp, signup } from './helpers';

interface Hit {
  headers: IncomingMessage['headers'];
  body: string;
}

describe('Integrations: webhooks and API keys', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const api = () => request(app.getHttpServer());
  let server: Server;
  let base: string;
  const hits: Hit[] = [];

  beforeAll(async () => {
    app = await createApp();
    // A stand-in for the other app: /ok answers 200, /fail answers 500.
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        hits.push({ headers: req.headers, body });
        res.statusCode = req.url === '/fail' ? 500 : 200;
        res.end(req.url === '/fail' ? 'boom' : 'ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    server.close();
  });

  const waitFor = async (check: () => boolean) => {
    for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 100));
  };

  it('sends a signed event when someone is added', async () => {
    const owner = await signup(app);
    const created = await api()
      .post('/api/integrations/webhooks')
      .set(owner.auth)
      .send({ name: 'Zapier', url: `${base}/ok`, events: ['employee.created'] })
      .expect(201);
    expect(created.body.secret).toMatch(/^whsec_/);

    const before = hits.length;
    await api()
      .post('/api/employees')
      .set(owner.auth)
      .send({
        firstName: 'Neha',
        lastName: 'Joshi',
        workEmail: `neha@${owner.workspace}.test`,
        dateOfJoining: '2026-01-05',
      })
      .expect(201);
    await waitFor(() => hits.length > before);
    const hit = hits[hits.length - 1]!;
    const body = JSON.parse(hit.body);
    expect(hit.headers['x-hrms-event']).toBe('employee.created');
    expect(body.event).toBe('employee.created');
    expect(body.summary).toContain('Neha Joshi');
    expect(body.workspace.slug).toBe(owner.workspace);
    const [, ts, sig] = /t=(\d+),v1=([a-f0-9]+)/.exec(String(hit.headers['x-hrms-signature']))!;
    expect(sig).toBe(signBody(created.body.secret, Number(ts), hit.body));

    // Events nobody subscribed to are not sent.
    const count = hits.length;
    await api().post('/api/org/departments').set(owner.auth).send({ name: 'Ops' }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(hits.length).toBe(count);

    const overview = await api().get('/api/integrations').set(owner.auth).expect(200);
    expect(overview.body.webhooks).toHaveLength(1);
    expect(overview.body.deliveries[0].status).toBe('SENT');
    expect(JSON.stringify(overview.body)).not.toContain('whsec_');
  });

  it('reports a failing endpoint and keeps retrying it', async () => {
    const owner = await signup(app);
    const hook = await api()
      .post('/api/integrations/webhooks')
      .set(owner.auth)
      .send({ name: 'Broken', url: `${base}/fail`, events: ['employee.created'] })
      .expect(201);
    const test = await api()
      .post(`/api/integrations/webhooks/${hook.body.id}/test`)
      .set(owner.auth)
      .expect(200);
    expect(test.body).toMatchObject({ status: 'FAILED', responseCode: 500, error: 'boom' });

    await api()
      .post('/api/employees')
      .set(owner.auth)
      .send({ firstName: 'R', workEmail: `r@${owner.workspace}.test`, dateOfJoining: '2026-01-05' })
      .expect(201);
    let rows: { status: string; attempts: number }[] = [];
    await waitFor(() => {
      void prisma.webhookDelivery
        .findMany({ where: { endpointId: hook.body.id, event: 'employee.created' } })
        .then((r) => (rows = r));
      return rows.some((r) => r.attempts > 0);
    });
    expect(rows[0]).toMatchObject({ status: 'PENDING', attempts: 1 });
  });

  it('checks Slack addresses and keeps webhooks to their workspace', async () => {
    const owner = await signup(app);
    await api()
      .post('/api/integrations/webhooks')
      .set(owner.auth)
      .send({ name: 'Slack', url: `${base}/ok`, format: 'SLACK', events: ['leave.approved'] })
      .expect(400);
    await api()
      .post('/api/integrations/webhooks')
      .set(owner.auth)
      .send({ name: 'None', url: `${base}/ok`, events: [] })
      .expect(400);
    const hook = await api()
      .post('/api/integrations/webhooks')
      .set(owner.auth)
      .send({ name: 'Mine', url: `${base}/ok`, events: ['leave.approved'] })
      .expect(201);

    const other = await signup(app);
    expect((await api().get('/api/integrations').set(other.auth)).body.webhooks).toHaveLength(0);
    await api().delete(`/api/integrations/webhooks/${hook.body.id}`).set(other.auth).expect(404);
    await api()
      .patch(`/api/integrations/webhooks/${hook.body.id}`)
      .set(owner.auth)
      .send({ active: false })
      .expect(200);
    await api().delete(`/api/integrations/webhooks/${hook.body.id}`).set(owner.auth).expect(204);
  });

  it('lets an API key do only what it was given', async () => {
    const owner = await signup(app);
    const key = await api()
      .post('/api/integrations/api-keys')
      .set(owner.auth)
      .send({ name: 'Reports script', permissions: ['employee.read', 'directory.read'] })
      .expect(201);
    expect(key.body.key).toMatch(/^hrms_/);
    const auth = { Authorization: `Bearer ${key.body.key}` };

    await api().get('/api/employees').set(auth).expect(200);
    await api().get('/api/integrations').set(auth).expect(403);
    await api()
      .post('/api/employees')
      .set(auth)
      .send({ firstName: 'X', workEmail: `x@${owner.workspace}.test`, dateOfJoining: '2026-01-01' })
      .expect(403);
    // Sign-in and account security are off limits to keys.
    await api().get('/api/auth/me').set(auth).expect(403);

    const listed = await api().get('/api/integrations').set(owner.auth).expect(200);
    expect(listed.body.apiKeys[0]).toMatchObject({ name: 'Reports script' });
    expect(JSON.stringify(listed.body.apiKeys)).not.toContain(key.body.key);

    await api().delete(`/api/integrations/api-keys/${key.body.id}`).set(owner.auth).expect(204);
    await api().get('/api/employees').set(auth).expect(401);
  });

  it('keeps integrations to people who manage them', async () => {
    const owner = await signup(app);
    const { auth } = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `staff@${owner.workspace}.test`,
    );
    await api().get('/api/integrations').set(auth).expect(403);
    await api()
      .post('/api/integrations/api-keys')
      .set(auth)
      .send({ name: 'x', permissions: ['directory.read'] })
      .expect(403);
  });
});
