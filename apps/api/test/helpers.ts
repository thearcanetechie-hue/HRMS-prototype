import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

process.env.AUTH_RATE_LIMIT = '1000';

export const password = 'Sup3rSecretPass';
export const suffix = () => randomBytes(4).toString('hex');

export async function createApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication(), 'http://localhost:3000');
  await app.init();
  return app;
}

export async function signup(app: INestApplication, workspace = `acme-${suffix()}`) {
  const email = `owner@${workspace}.test`;
  const res = await request(app.getHttpServer())
    .post('/api/auth/signup')
    .send({ companyName: 'Acme Pvt Ltd', workspace, fullName: 'Ada Lovelace', email, password })
    .expect(201);
  return {
    workspace,
    email,
    token: res.body.accessToken as string,
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
    cookie: res.headers['set-cookie'] as unknown as string[],
  };
}

/** Creates a login with the given system role, linked to an existing employee if one is given. */
export async function addLogin(
  app: INestApplication,
  prisma: PrismaClient,
  workspace: string,
  roleKey: string,
  email: string,
  employeeId?: string,
) {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: workspace } });
  const role = await prisma.role.findFirstOrThrow({ where: { tenantId: tenant.id, key: roleKey } });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      fullName: email.split('@')[0]!,
      passwordHash: await argon2.hash(password),
      roles: { create: { tenantId: tenant.id, roleId: role.id } },
    },
  });
  if (employeeId)
    await prisma.employee.update({ where: { id: employeeId }, data: { userId: user.id } });
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ workspace, email, password })
    .expect(200);
  return { userId: user.id, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}
