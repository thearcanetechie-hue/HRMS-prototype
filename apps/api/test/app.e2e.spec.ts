import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { createApp, password, signup as signupFull, suffix } from './helpers';

const signup = (app: INestApplication, workspace?: string) => signupFull(app, workspace);

describe('HRMS API', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const api = () => request(app.getHttpServer());

  it('reports health without login', async () => {
    await api().get('/api/health').expect(200, { status: 'ok' });
  });

  it('rejects requests without a token', async () => {
    await api().get('/api/employees').expect(401);
    await api().get('/api/employees').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('signs up a workspace whose owner has every permission', async () => {
    const { token, workspace } = await signup(app);
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.tenant.slug).toBe(workspace);
    expect(me.body.user.permissions).toEqual(
      expect.arrayContaining(['tenant.manage', 'employee.manage']),
    );
    expect(me.body.employee.employeeCode).toBe('EMP-0001');
  });

  it('refuses a taken workspace name and weak passwords', async () => {
    const { workspace } = await signup(app);
    await api()
      .post('/api/auth/signup')
      .send({
        companyName: 'Xyz',
        workspace,
        fullName: 'Someone Else',
        email: 'x@y.test',
        password,
      })
      .expect(409);
    const weak = await api()
      .post('/api/auth/signup')
      .send({
        companyName: 'Xyz',
        workspace: `w-${suffix()}`,
        fullName: 'Someone',
        email: 'x@y.test',
        password: 'short',
      })
      .expect(400);
    expect(weak.body.errors.password).toBeDefined();
  });

  it('logs in with the right credentials only', async () => {
    const { workspace, email } = await signup(app);
    await api()
      .post('/api/auth/login')
      .send({ workspace, email, password: 'WrongPass123' })
      .expect(401);
    await api()
      .post('/api/auth/login')
      .send({ workspace: 'nope-nope', email, password })
      .expect(401);
    const ok = await api().post('/api/auth/login').send({ workspace, email, password }).expect(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));
  });

  it('manages org structure and employees inside a workspace', async () => {
    const { token } = await signup(app);
    const auth = { Authorization: `Bearer ${token}` };
    const dept = await api()
      .post('/api/org/departments')
      .set(auth)
      .send({ name: 'Engineering' })
      .expect(201);
    const loc = await api()
      .post('/api/org/locations')
      .set(auth)
      .send({ name: 'Bengaluru', state: 'Karnataka' })
      .expect(201);
    const emp = await api()
      .post('/api/employees')
      .set(auth)
      .send({
        employeeCode: 'EMP-0002',
        firstName: 'Grace',
        lastName: 'Hopper',
        workEmail: 'grace@acme.test',
        dateOfJoining: '2026-10-01',
        departmentId: dept.body.id,
        locationId: loc.body.id,
      })
      .expect(201);
    expect(emp.body.department.name).toBe('Engineering');

    await api()
      .post('/api/employees')
      .set(auth)
      .send({
        employeeCode: 'EMP-0002',
        firstName: 'Dup',
        workEmail: 'dup@acme.test',
        dateOfJoining: '2026-10-01',
      })
      .expect(409);

    const list = await api().get('/api/employees?search=grace').set(auth).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(emp.body.id);

    await api()
      .patch(`/api/employees/${emp.body.id}`)
      .set(auth)
      .send({ managerId: emp.body.id })
      .expect(400);
    const updated = await api()
      .patch(`/api/employees/${emp.body.id}`)
      .set(auth)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(updated.body.status).toBe('ACTIVE');

    const audit = await api().get('/api/audit-logs').set(auth).expect(200);
    expect(audit.body.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['employee.created', 'employee.updated', 'department.created']),
    );
  });

  it('keeps workspaces isolated from each other', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const authA = { Authorization: `Bearer ${a.token}` };
    const authB = { Authorization: `Bearer ${b.token}` };

    const deptA = await api()
      .post('/api/org/departments')
      .set(authA)
      .send({ name: 'Secret' })
      .expect(201);
    const empA = await api()
      .post('/api/employees')
      .set(authA)
      .send({
        employeeCode: 'A-1',
        firstName: 'Alice',
        workEmail: 'alice@a.test',
        dateOfJoining: '2026-01-01',
      })
      .expect(201);

    const listB = await api().get('/api/employees').set(authB).expect(200);
    expect(listB.body.items.map((e: { id: string }) => e.id)).not.toContain(empA.body.id);
    expect(listB.body.total).toBe(1); // only B's own owner

    await api().get(`/api/employees/${empA.body.id}`).set(authB).expect(404);
    await api()
      .patch(`/api/employees/${empA.body.id}`)
      .set(authB)
      .send({ firstName: 'Mallory' })
      .expect(404);

    const deptsB = await api().get('/api/org/departments').set(authB).expect(200);
    expect(deptsB.body).toEqual([]);

    const crossRef = await api()
      .post('/api/employees')
      .set(authB)
      .send({
        employeeCode: 'B-1',
        firstName: 'Bob',
        workEmail: 'bob@b.test',
        dateOfJoining: '2026-01-01',
        departmentId: deptA.body.id,
        managerId: empA.body.id,
      })
      .expect(400);
    expect(Object.keys(crossRef.body.errors).sort()).toEqual(['departmentId', 'managerId']);

    const rolesA = await api().get('/api/roles').set(authA).expect(200);
    const ownerA = rolesA.body.find((r: { key: string }) => r.key === 'owner');
    const usersB = await prisma.user.findMany({ where: { tenant: { slug: b.workspace } } });
    await api()
      .put(`/api/users/${usersB[0]!.id}/roles`)
      .set(authA)
      .send({ roleIds: [ownerA.id] })
      .expect(404);
  });

  it('enforces role permissions', async () => {
    const { workspace, token } = await signup(app);
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: workspace } });
    const role = await prisma.role.findFirstOrThrow({
      where: { tenantId: tenant.id, key: 'employee' },
    });
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'staff@acme.test',
        fullName: 'Staff Member',
        passwordHash: await argon2.hash(password),
        roles: { create: { tenantId: tenant.id, roleId: role.id } },
      },
    });
    const login = await api()
      .post('/api/auth/login')
      .send({ workspace, email: 'staff@acme.test', password })
      .expect(200);
    const staff = { Authorization: `Bearer ${login.body.accessToken}` };

    await api().get('/api/employees').set(staff).expect(200);
    await api()
      .post('/api/employees')
      .set(staff)
      .send({
        employeeCode: 'X-1',
        firstName: 'X',
        workEmail: 'x@acme.test',
        dateOfJoining: '2026-01-01',
      })
      .expect(403);
    await api().get('/api/roles').set(staff).expect(403);

    // A custom role grants new access on the very next request.
    const owner = { Authorization: `Bearer ${token}` };
    const custom = await api()
      .post('/api/roles')
      .set(owner)
      .send({
        key: 'recruiter',
        name: 'Recruiter',
        permissions: ['employee.read', 'employee.manage'],
      })
      .expect(201);
    const staffUser = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, email: 'staff@acme.test' },
    });
    await api()
      .put(`/api/users/${staffUser.id}/roles`)
      .set(owner)
      .send({ roleIds: [custom.body.id] })
      .expect(200);
    await api()
      .post('/api/employees')
      .set(staff)
      .send({
        employeeCode: 'X-1',
        firstName: 'X',
        workEmail: 'x@acme.test',
        dateOfJoining: '2026-01-01',
      })
      .expect(201);

    // The last owner cannot be demoted, and the owner role is locked.
    const ownerUser = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id, email: `owner@${workspace}.test` },
    });
    await api()
      .put(`/api/users/${ownerUser.id}/roles`)
      .set(owner)
      .send({ roleIds: [custom.body.id] })
      .expect(400);
    const ownerRole = await prisma.role.findFirstOrThrow({
      where: { tenantId: tenant.id, key: 'owner' },
    });
    await api()
      .patch(`/api/roles/${ownerRole.id}`)
      .set(owner)
      .send({ permissions: [] })
      .expect(403);
  });

  it('rotates refresh tokens and revokes everything when an old one is reused', async () => {
    const { cookie } = await signup(app);
    const first = await api().post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const rotated = first.headers['set-cookie'] as unknown as string[];
    expect(rotated[0]).toMatch(/hrms_rt=.+; Path=\/api\/auth; .*HttpOnly/);

    await api().post('/api/auth/refresh').set('Cookie', cookie).expect(401); // reuse of the old token
    await api().post('/api/auth/refresh').set('Cookie', rotated).expect(401); // family revoked
  });

  it('logs out by revoking the refresh token', async () => {
    const { cookie } = await signup(app);
    await api().post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await api().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
