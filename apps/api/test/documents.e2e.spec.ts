import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import request from 'supertest';
import { addLogin, createApp, signup } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer\n%%EOF\n');

describe('Documents', () => {
  let app: INestApplication;
  let storageDir: string;
  const prisma = new PrismaClient();
  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp();
    storageDir = resolve(String(app.get(ConfigService).get('STORAGE_DIR')));
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
        ...extra,
      })
      .expect(201);
    return res.body.id as string;
  }

  const upload = (
    auth: Record<string, string>,
    fields: Record<string, string>,
    file: Buffer = PDF,
    filename = 'aadhaar.pdf',
    contentType = 'application/pdf',
  ) => {
    let req = api().post('/api/documents').set(auth);
    for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
    return req.attach('file', file, { filename, contentType });
  };

  it('stores files encrypted and returns the original bytes to people allowed to read them', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'D1');

    const res = await upload(owner.auth, { employeeId: empId, category: 'Aadhaar card' }).expect(
      201,
    );
    expect(res.body).toMatchObject({ name: 'aadhaar.pdf', status: 'VERIFIED', employeeId: empId });
    expect(res.body.storageKey).toBeUndefined();

    const row = await prisma.document.findUniqueOrThrow({ where: { id: res.body.id } });
    const onDisk = await readFile(resolve(storageDir, row.storageKey));
    expect(onDisk.includes(Buffer.from('%PDF'))).toBe(false);

    const file = await api()
      .get(`/api/documents/${res.body.id}/file`)
      .set(owner.auth)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);
    expect(file.headers['content-disposition']).toMatch(/^attachment; filename="aadhaar.pdf"/);

    const audit = await prisma.auditLog.findMany({
      where: { entityId: res.body.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((a) => a.action)).toEqual(['document.uploaded', 'document.downloaded']);
  });

  it('lets employees manage only their own files, and hides them from managers', async () => {
    const owner = await signup(app);
    const bossId = await addEmployee(owner.auth, 'B1');
    const meId = await addEmployee(owner.auth, 'M1', { managerId: bossId });
    const otherId = await addEmployee(owner.auth, 'O1');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `me@${owner.workspace}.test`,
      meId,
    );
    const boss = await addLogin(
      app,
      prisma,
      owner.workspace,
      'manager',
      `boss@${owner.workspace}.test`,
      bossId,
    );

    const mine = await upload(me.auth, { employeeId: meId, category: 'PAN card' }).expect(201);
    expect(mine.body.status).toBe('NEEDS_REVIEW');
    const hrDoc = await upload(owner.auth, { employeeId: otherId }).expect(201);

    // Own list only.
    const list = await api().get('/api/documents').set(me.auth).expect(200);
    expect(list.body.items.map((d: { id: string }) => d.id)).toEqual([mine.body.id]);

    // Someone else's files look like they don't exist.
    await api().get(`/api/documents/${hrDoc.body.id}`).set(me.auth).expect(404);
    await api().get(`/api/documents?employeeId=${otherId}`).set(me.auth).expect(404);
    await upload(me.auth, { employeeId: otherId }).expect(404);

    // Managers don't see their reports' ID copies.
    await api().get(`/api/documents/${mine.body.id}`).set(boss.auth).expect(404);

    // Only HR can verify.
    await api()
      .patch(`/api/documents/${mine.body.id}`)
      .set(me.auth)
      .send({ status: 'VERIFIED' })
      .expect(403);
    const verified = await api()
      .patch(`/api/documents/${mine.body.id}`)
      .set(owner.auth)
      .send({ status: 'VERIFIED' })
      .expect(200);
    expect(verified.body.status).toBe('VERIFIED');

    // Once verified, the employee can no longer delete it; while pending they could.
    await api().delete(`/api/documents/${mine.body.id}`).set(me.auth).expect(403);
    const pending = await upload(me.auth, { employeeId: meId }).expect(201);
    await api().delete(`/api/documents/${pending.body.id}`).set(me.auth).expect(204);
    await api().get(`/api/documents/${pending.body.id}`).set(me.auth).expect(404);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: pending.body.id } });
    expect(row.deletedAt).not.toBeNull();
    await expect(readFile(resolve(storageDir, row.storageKey))).rejects.toThrow();
  });

  it('rejects files that are too big or not what they claim to be', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'F1');

    await upload(owner.auth, { employeeId: empId }, Buffer.from('MZ\x90\x00 not a pdf')).expect(
      400,
    );
    await upload(
      owner.auth,
      { employeeId: empId },
      PDF,
      'tool.exe',
      'application/x-msdownload',
    ).expect(400);
    await upload(
      owner.auth,
      { employeeId: empId },
      Buffer.alloc(20 * 1024 * 1024 + 1, 0x25),
    ).expect((r) => expect([400, 413]).toContain(r.status));
    await upload(owner.auth, {}).expect(400);
  });

  it('shows company folders by visibility and keeps HR folders to HR', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'P1');
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `p1@${owner.workspace}.test`,
      empId,
    );

    const hrView = await api().get('/api/documents/folders').set(owner.auth).expect(200);
    const policies = hrView.body.folders.find(
      (f: { name: string }) => f.name === 'Company policies',
    );
    const payroll = hrView.body.folders.find((f: { name: string }) => f.name === 'Payroll & tax');
    expect(policies.visibility).toBe('EVERYONE');
    expect(payroll.visibility).toBe('HR');

    const policy = await upload(
      owner.auth,
      { folderId: policies.id, category: 'Policy' },
      PDF,
      'leave-policy.pdf',
    ).expect(201);
    const salary = await upload(
      owner.auth,
      { folderId: payroll.id },
      PDF,
      'october-register.pdf',
    ).expect(201);

    const empView = await api().get('/api/documents/folders').set(me.auth).expect(200);
    expect(empView.body.folders.map((f: { name: string }) => f.name)).toEqual(['Company policies']);
    expect(empView.body.canManage).toBe(false);

    await api().get(`/api/documents/${policy.body.id}`).set(me.auth).expect(200);
    await api().get(`/api/documents/${salary.body.id}`).set(me.auth).expect(404);
    await api().get(`/api/documents?folderId=${payroll.id}`).set(me.auth).expect(404);
    await upload(me.auth, { folderId: policies.id }).expect(403);
    await api().post('/api/documents/folders').set(me.auth).send({ name: 'Mine' }).expect(403);
  });

  it('never shows one workspace another workspace’s documents', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const empId = await addEmployee(a.auth, 'T1');
    const doc = await upload(a.auth, { employeeId: empId }).expect(201);
    const folders = await api().get('/api/documents/folders').set(a.auth).expect(200);

    await api().get(`/api/documents/${doc.body.id}`).set(b.auth).expect(404);
    await api().get(`/api/documents/${doc.body.id}/file`).set(b.auth).expect(404);
    await api().delete(`/api/documents/${doc.body.id}`).set(b.auth).expect(404);
    await upload(b.auth, { employeeId: empId }).expect(404);
    await upload(b.auth, { folderId: folders.body.folders[0].id }).expect(404);
    const list = await api().get('/api/documents').set(b.auth).expect(200);
    expect(list.body.total).toBe(0);
  });
});
