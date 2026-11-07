import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addDays, todayIst } from '../src/attendance/days';
import { matchReport, monthsFor } from '../src/analytics/analytics.service';
import { addLogin, createApp, signup } from './helpers';

describe('Analytics', () => {
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

  it('picks the months for each range', () => {
    expect(monthsFor('12m', '2026-11-07')).toHaveLength(12);
    expect(monthsFor('q', '2026-11-07')).toEqual(['2026-09', '2026-10', '2026-11']);
    // The Indian financial year starts in April.
    expect(monthsFor('fy', '2026-11-07')[0]).toBe('2026-04');
    expect(monthsFor('fy', '2027-02-10')).toHaveLength(11);
    expect(monthsFor('fy', '2026-04-01')).toEqual(['2026-04']);
  });

  it('matches questions to reports', () => {
    expect(matchReport('Why are people quitting?')).toBe('attrition');
    expect(matchReport('total salary cost this year')).toBe('payroll');
    expect(matchReport('how many people do we have')).toBe('headcount');
    expect(matchReport('weather in Pune')).toBeNull();
  });

  it('counts headcount, joiners and exits from real records', async () => {
    const owner = await signup(app);
    const today = todayIst();
    const add = (code: string, joined: string, extra: object = {}) =>
      api()
        .post('/api/employees')
        .set(owner.auth)
        .send({
          employeeCode: code,
          firstName: code,
          workEmail: `${code.toLowerCase()}@${owner.workspace}.test`,
          dateOfJoining: joined,
          status: 'ACTIVE',
          ...extra,
        })
        .expect(201);
    await add('A1', '2020-01-01');
    await add('A2', addDays(today, -30));
    const leaver = await add('A3', '2021-01-01');
    await prisma.employee.update({
      where: { id: leaver.body.id },
      data: { status: 'EXITED', dateOfExit: new Date(`${addDays(today, -10)}T00:00:00Z`) },
    });

    const res = await api()
      .get('/api/analytics/reports/headcount?range=12m')
      .set(owner.auth)
      .expect(200);
    const kpi = (label: string) =>
      res.body.kpis.find((k: { label: string }) => k.label === label).value;
    // The owner from sign-up plus A1 and A2; A3 has left.
    expect(kpi('Headcount today')).toBe('3');
    expect(kpi('Joiners')).toBe('1');
    expect(kpi('Exits')).toBe('1');
    expect(res.body.bars.values).toHaveLength(12);

    const attrition = await api()
      .get('/api/analytics/reports/attrition?range=q')
      .set(owner.auth)
      .expect(200);
    expect(attrition.body.kpis[1].value).toBe('1');
  });

  it('answers a question and keeps saved reports per workspace', async () => {
    const owner = await signup(app);
    const asked = await api()
      .post('/api/analytics/ask')
      .set(owner.auth)
      .send({ question: 'show leave taken by type', range: 'fy' })
      .expect(200);
    expect(asked.body.matched).toBe('leave');
    expect(asked.body.report.title).toBe('Leave report');

    const saved = await api()
      .post('/api/analytics/saved')
      .set(owner.auth)
      .send({ name: 'Leave FY', reportKey: 'leave', range: 'fy' })
      .expect(201);
    expect((await api().get('/api/analytics/saved').set(owner.auth)).body).toHaveLength(1);

    const other = await signup(app);
    expect((await api().get('/api/analytics/saved').set(other.auth)).body).toHaveLength(0);
    await api().delete(`/api/analytics/saved/${saved.body.id}`).set(other.auth).expect(404);
    await api().delete(`/api/analytics/saved/${saved.body.id}`).set(owner.auth).expect(204);
  });

  it('keeps reports to people with analytics access, and payroll cost to payroll admins', async () => {
    const owner = await signup(app);
    const emp = await api()
      .post('/api/employees')
      .set(owner.auth)
      .send({
        firstName: 'Plain',
        workEmail: `plain@${owner.workspace}.test`,
        dateOfJoining: '2024-01-01',
      })
      .expect(201);
    const plain = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `plain@${owner.workspace}.test`,
      emp.body.id,
    );
    await api().get('/api/analytics/reports/headcount').set(plain.auth).expect(403);

    // A custom role with analytics but not payroll sees every report except payroll cost.
    await prisma.role.create({
      data: {
        tenantId: (await prisma.tenant.findUniqueOrThrow({ where: { slug: owner.workspace } })).id,
        key: 'analyst',
        name: 'Analyst',
        permissions: ['analytics.read'],
      },
    });
    const { auth } = await addLogin(
      app,
      prisma,
      owner.workspace,
      'analyst',
      `analyst@${owner.workspace}.test`,
    );
    const keys = (await api().get('/api/analytics/reports').set(auth).expect(200)).body.keys;
    expect(keys).toContain('headcount');
    expect(keys).not.toContain('payroll');
    await api().get('/api/analytics/reports/payroll').set(auth).expect(403);
    await api().get('/api/analytics/reports/payroll').set(owner.auth).expect(200);
  });
});
