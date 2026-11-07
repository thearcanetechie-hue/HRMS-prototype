import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { addLogin, createApp, password, signup } from './helpers';

type Task = {
  id: string;
  title: string;
  assignee: string;
  canTick: boolean;
  doneAt: string | null;
};

describe('Onboarding and offboarding checklists', () => {
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
        dateOfJoining: '2026-10-01',
        ...extra,
      })
      .expect(201);
    return res.body.id as string;
  }

  async function checklistFor(
    auth: Record<string, string>,
    employeeId: string,
    kind = 'ONBOARDING',
  ) {
    const res = await api()
      .get(`/api/checklists?employeeId=${employeeId}&kind=${kind}&status=OPEN`)
      .set(auth)
      .expect(200);
    return res.body[0] as { id: string; status: string; tasks: Task[]; startDate: string };
  }

  const tick = (auth: Record<string, string>, checklistId: string, taskId: string, done = true) =>
    api().patch(`/api/checklists/${checklistId}/tasks/${taskId}`).set(auth).send({ done });

  it('starts onboarding for new joiners and makes them Active when it is done', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'N1');

    const checklist = await checklistFor(owner.auth, empId);
    expect(checklist.startDate).toBe('2026-10-01');
    expect(checklist.tasks.length).toBeGreaterThan(5);
    expect(checklist.tasks.map((t) => t.assignee)).toEqual(
      expect.arrayContaining(['HR', 'IT', 'EMPLOYEE', 'MANAGER']),
    );

    for (const t of checklist.tasks) await tick(owner.auth, checklist.id, t.id).expect(200);

    const done = await api().get(`/api/checklists/${checklist.id}`).set(owner.auth).expect(200);
    expect(done.body.status).toBe('COMPLETED');
    const emp = await api().get(`/api/employees/${empId}`).set(owner.auth).expect(200);
    expect(emp.body.status).toBe('ACTIVE');

    // Reopening a task reopens the checklist but leaves the person Active.
    await tick(owner.auth, checklist.id, checklist.tasks[0]!.id, false).expect(200);
    const reopened = await api().get(`/api/checklists/${checklist.id}`).set(owner.auth).expect(200);
    expect(reopened.body.status).toBe('OPEN');
  });

  it('lets each person tick only their own tasks', async () => {
    const owner = await signup(app);
    const bossId = await addEmployee(owner.auth, 'B1', { status: 'ACTIVE' });
    const newId = await addEmployee(owner.auth, 'J1', { managerId: bossId });
    const otherId = await addEmployee(owner.auth, 'X1', { status: 'ACTIVE' });
    const me = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `j1@${owner.workspace}.test`,
      newId,
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
      `x1@${owner.workspace}.test`,
      otherId,
    );

    const checklist = await checklistFor(me.auth, newId);
    const byAssignee = (a: string) => checklist.tasks.find((t) => t.assignee === a)!;
    expect(byAssignee('EMPLOYEE').canTick).toBe(true);
    expect(byAssignee('HR').canTick).toBe(false);

    await tick(me.auth, checklist.id, byAssignee('EMPLOYEE').id).expect(200);
    await tick(me.auth, checklist.id, byAssignee('HR').id).expect(403);
    await tick(me.auth, checklist.id, byAssignee('MANAGER').id).expect(403);

    await tick(boss.auth, checklist.id, byAssignee('MANAGER').id).expect(200);
    await tick(boss.auth, checklist.id, byAssignee('EMPLOYEE').id).expect(403);
    const mine = await api().get('/api/checklists?mine=true').set(boss.auth).expect(200);
    expect(mine.body.map((c: { id: string }) => c.id)).toContain(checklist.id);

    // Someone outside the reporting line can't see it at all.
    await api().get(`/api/checklists/${checklist.id}`).set(other.auth).expect(404);
    await tick(other.auth, checklist.id, byAssignee('EMPLOYEE').id).expect(404);
    const list = await api().get('/api/checklists').set(other.auth).expect(200);
    expect(list.body.map((c: { employee: { id: string } }) => c.employee.id)).not.toContain(newId);

    // Only HR starts checklists.
    await api()
      .post(`/api/employees/${otherId}/checklists`)
      .set(boss.auth)
      .send({ kind: 'OFFBOARDING', startDate: '2026-12-31' })
      .expect(403);
  });

  it('runs an exit: on notice, cancel restores, finishing turns off the login', async () => {
    const owner = await signup(app);
    const empId = await addEmployee(owner.auth, 'L1', { status: 'ACTIVE' });
    const login = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `l1@${owner.workspace}.test`,
      empId,
    );

    await api()
      .post(`/api/employees/${empId}/checklists`)
      .set(owner.auth)
      .send({ kind: 'OFFBOARDING' })
      .expect(400);

    const started = await api()
      .post(`/api/employees/${empId}/checklists`)
      .set(owner.auth)
      .send({ kind: 'OFFBOARDING', startDate: '2026-11-30', reason: 'RESIGNATION' })
      .expect(201);
    let emp = await api().get(`/api/employees/${empId}`).set(owner.auth).expect(200);
    expect(emp.body.status).toBe('ON_NOTICE');
    expect(emp.body.dateOfExit).toMatch(/^2026-11-30/);

    await api()
      .post(`/api/employees/${empId}/checklists`)
      .set(owner.auth)
      .send({ kind: 'OFFBOARDING', startDate: '2026-11-30' })
      .expect(409);

    // Resignation withdrawn.
    await api().post(`/api/checklists/${started.body.id}/cancel`).set(owner.auth).expect(200);
    emp = await api().get(`/api/employees/${empId}`).set(owner.auth).expect(200);
    expect(emp.body.status).toBe('ACTIVE');
    expect(emp.body.dateOfExit).toBeNull();

    const again = await api()
      .post(`/api/employees/${empId}/checklists`)
      .set(owner.auth)
      .send({ kind: 'OFFBOARDING', startDate: '2026-11-30' })
      .expect(201);
    for (const t of again.body.tasks as Task[])
      await tick(owner.auth, again.body.id, t.id).expect(200);

    emp = await api().get(`/api/employees/${empId}`).set(owner.auth).expect(200);
    expect(emp.body.status).toBe('EXITED');
    await api().get('/api/auth/me').set(login.auth).expect(401);
    await api()
      .post('/api/auth/login')
      .send({ workspace: owner.workspace, email: `l1@${owner.workspace}.test`, password })
      .expect(401);
  });

  it('uses the edited default template for new checklists', async () => {
    const owner = await signup(app);
    const templates = await api()
      .get('/api/checklist-templates?kind=ONBOARDING')
      .set(owner.auth)
      .expect(200);
    const def = templates.body.find((t: { isDefault: boolean }) => t.isDefault);

    await api()
      .patch(`/api/checklist-templates/${def.id}`)
      .set(owner.auth)
      .send({
        tasks: [
          { title: 'Welcome lunch', assignee: 'MANAGER', dueOffsetDays: 0 },
          {
            title: 'Sign NDA',
            assignee: 'EMPLOYEE',
            dueOffsetDays: -2,
            documentCategory: 'Contract',
          },
        ],
      })
      .expect(200);
    await api().delete(`/api/checklist-templates/${def.id}`).set(owner.auth).expect(400);

    const empId = await addEmployee(owner.auth, 'T1');
    const checklist = await checklistFor(owner.auth, empId);
    expect(checklist.tasks.map((t) => t.title)).toEqual(['Welcome lunch', 'Sign NDA']);
    expect((checklist.tasks[1] as unknown as { dueDate: string }).dueDate).toBe('2026-09-29');

    const emp = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `t1@${owner.workspace}.test`,
      empId,
    );
    await api().get('/api/checklist-templates').set(emp.auth).expect(403);
  });

  it('never shows one workspace another workspace’s checklists', async () => {
    const a = await signup(app);
    const b = await signup(app);
    const empId = await addEmployee(a.auth, 'W1');
    const checklist = await checklistFor(a.auth, empId);

    await api().get(`/api/checklists/${checklist.id}`).set(b.auth).expect(404);
    await tick(b.auth, checklist.id, checklist.tasks[0]!.id).expect(404);
    await api().post(`/api/checklists/${checklist.id}/cancel`).set(b.auth).expect(404);
    await api()
      .post(`/api/employees/${empId}/checklists`)
      .set(b.auth)
      .send({ kind: 'OFFBOARDING', startDate: '2026-12-01' })
      .expect(404);
    const list = await api().get('/api/checklists').set(b.auth).expect(200);
    expect(list.body).toEqual([]);
  });
});
