import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { checkValue } from '../src/employees/custom-fields.service';
import { addLogin, createApp, signup } from './helpers';

jest.setTimeout(20_000);

describe('Custom fields', () => {
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

  it('checks values by type', () => {
    const sel = { type: 'SELECT' as const, options: ['S', 'M', 'L'] };
    expect(checkValue(sel, 'm')).toEqual({ value: 'M' });
    expect(checkValue(sel, 'XL')).toHaveProperty('error');
    expect(checkValue({ type: 'MULTI_SELECT', options: ['Hindi', 'Odia'] }, 'odia; hindi')).toEqual(
      {
        value: ['Odia', 'Hindi'],
      },
    );
    expect(checkValue({ type: 'NUMBER', options: [] }, '1,200')).toEqual({ value: 1200 });
    expect(checkValue({ type: 'DATE', options: [] }, '2026-02-30T00:00')).toHaveProperty('error');
    expect(checkValue({ type: 'BOOLEAN', options: [] }, 'Yes')).toEqual({ value: true });
    expect(checkValue({ type: 'URL', options: [] }, 'javascript:alert(1)')).toHaveProperty('error');
    expect(checkValue({ type: 'EMAIL', options: [] }, 'A@B.in')).toEqual({ value: 'a@b.in' });
  });

  async function setup() {
    const owner = await signup(app);
    const field = (body: object) =>
      api().post('/api/custom-fields').set(owner.auth).send(body).expect(201);
    await field({
      label: 'T-shirt size',
      type: 'SELECT',
      options: ['S', 'M', 'L'],
      selfEditable: true,
    });
    await field({
      label: 'Background check',
      type: 'SELECT',
      options: ['Pending', 'Clear'],
      visibility: 'HR_ONLY',
    });
    await field({
      label: 'Blood donor',
      type: 'BOOLEAN',
      visibility: 'EVERYONE',
      required: true,
      selfEditable: true,
    });
    const boss = await api()
      .post('/api/employees')
      .set(owner.auth)
      .send({
        firstName: 'Boss',
        workEmail: `boss@${owner.workspace}.test`,
        dateOfJoining: '2024-01-01',
        status: 'ACTIVE',
      })
      .expect(201);
    const me = await api()
      .post('/api/employees')
      .set(owner.auth)
      .send({
        firstName: 'Ira',
        workEmail: `ira@${owner.workspace}.test`,
        dateOfJoining: '2024-01-01',
        status: 'ACTIVE',
        managerId: boss.body.id,
        customFields: { t_shirt_size: 'm', background_check: 'Pending' },
      })
      .expect(201);
    const ira = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `ira@${owner.workspace}.test`,
      me.body.id,
    );
    const bossLogin = await addLogin(
      app,
      prisma,
      owner.workspace,
      'manager',
      `boss@${owner.workspace}.test`,
      boss.body.id,
    );
    return { owner, ira, meId: me.body.id as string, bossLogin };
  }

  it('saves checked values and rejects bad ones', async () => {
    const { owner, meId } = await setup();
    const got = await api().get(`/api/employees/${meId}`).set(owner.auth).expect(200);
    expect(got.body.customFields).toEqual({ t_shirt_size: 'M', background_check: 'Pending' });

    const bad = await api()
      .patch(`/api/employees/${meId}`)
      .set(owner.auth)
      .send({ customFields: { t_shirt_size: 'XXL', nickname: 'x' } })
      .expect(400);
    expect(Object.keys(bad.body.errors)).toEqual(
      expect.arrayContaining(['customFields.t_shirt_size', 'customFields.nickname']),
    );
    // A patch merges; null clears one field.
    await api()
      .patch(`/api/employees/${meId}`)
      .set(owner.auth)
      .send({ customFields: { background_check: null } })
      .expect(200);
    const after = await api().get(`/api/employees/${meId}`).set(owner.auth).expect(200);
    expect(after.body.customFields).toEqual({ t_shirt_size: 'M' });

    // The values form enforces required fields.
    await api()
      .put(`/api/employees/${meId}/custom-fields`)
      .set(owner.auth)
      .send({ values: { t_shirt_size: 'L' } })
      .expect(400);
    const ok = await api()
      .put(`/api/employees/${meId}/custom-fields`)
      .set(owner.auth)
      .send({ values: { t_shirt_size: 'L', blood_donor: 'yes' } })
      .expect(200);
    expect(ok.body.customFields).toEqual({ t_shirt_size: 'L', blood_donor: true });
  });

  it('shows each field only to the people it allows', async () => {
    const { owner, ira, meId, bossLogin } = await setup();
    await api()
      .put(`/api/employees/${meId}/custom-fields`)
      .set(owner.auth)
      .send({ values: { background_check: 'Clear', blood_donor: false } })
      .expect(200);

    const mine = await api().get(`/api/employees/${meId}`).set(ira.auth).expect(200);
    expect(mine.body.customFields).toEqual({ t_shirt_size: 'M', blood_donor: false });
    const team = await api().get(`/api/employees/${meId}`).set(bossLogin.auth).expect(200);
    expect(team.body.customFields).not.toHaveProperty('background_check');
    const defs = await api().get('/api/custom-fields').set(ira.auth).expect(200);
    expect(defs.body.map((d: { key: string }) => d.key)).not.toContain('background_check');

    // People fill in their own self-editable fields, and nothing else.
    await api()
      .put(`/api/employees/${meId}/custom-fields`)
      .set(ira.auth)
      .send({ values: { t_shirt_size: 'S' } })
      .expect(200);
    await api()
      .put(`/api/employees/${meId}/custom-fields`)
      .set(ira.auth)
      .send({ values: { background_check: 'Clear' } })
      .expect(400);
    const boss = (
      await prisma.employee.findFirstOrThrow({
        where: { firstName: 'Boss', tenant: { slug: owner.workspace } },
      })
    ).id;
    await api()
      .put(`/api/employees/${boss}/custom-fields`)
      .set(ira.auth)
      .send({ values: { t_shirt_size: 'S' } })
      .expect(403);
  });

  it('archives fields, keeps keys unique, and stays in its workspace', async () => {
    const { owner, meId } = await setup();
    await api()
      .post('/api/custom-fields')
      .set(owner.auth)
      .send({ label: 'T-shirt size', type: 'TEXT' })
      .expect(409);
    await api()
      .post('/api/custom-fields')
      .set(owner.auth)
      .send({ label: 'Languages', type: 'MULTI_SELECT' })
      .expect(400);
    const defs = await api().get('/api/custom-fields').set(owner.auth).expect(200);
    const shirt = defs.body.find((d: { key: string }) => d.key === 't_shirt_size');
    await api().delete(`/api/custom-fields/${shirt.id}`).set(owner.auth).expect(204);
    const got = await api().get(`/api/employees/${meId}`).set(owner.auth).expect(200);
    expect(got.body.customFields).not.toHaveProperty('t_shirt_size');
    await api()
      .patch(`/api/custom-fields/${shirt.id}`)
      .set(owner.auth)
      .send({ archived: false })
      .expect(200);
    expect(
      (await api().get(`/api/employees/${meId}`).set(owner.auth)).body.customFields.t_shirt_size,
    ).toBe('M');

    const other = await signup(app);
    expect((await api().get('/api/custom-fields').set(other.auth)).body).toHaveLength(0);
    await api()
      .patch(`/api/custom-fields/${shirt.id}`)
      .set(other.auth)
      .send({ label: 'x' })
      .expect(404);
  });
});
