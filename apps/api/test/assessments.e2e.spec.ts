import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { markAnswer, shuffled } from '../src/assessments/marking';
import { addLogin, createApp, signup } from './helpers';

const QUESTIONS = [
  {
    kind: 'SINGLE',
    prompt: 'Capital of Maharashtra?',
    options: [
      { id: 'a', text: 'Pune' },
      { id: 'b', text: 'Mumbai' },
    ],
    answer: ['b'],
    points: 2,
  },
  {
    kind: 'MULTIPLE',
    prompt: 'Which are statutory deductions?',
    options: [
      { id: 'pf', text: 'PF' },
      { id: 'esi', text: 'ESI' },
      { id: 'hra', text: 'HRA' },
    ],
    answer: ['pf', 'esi'],
    points: 2,
  },
  {
    kind: 'NUMBER',
    prompt: 'EPF employee rate (%)?',
    answer: { value: 12, tolerance: 0 },
    points: 1,
  },
  {
    kind: 'SHORT',
    prompt: 'Name the tax form for salary TDS',
    answer: ['Form 16', 'form16'],
    points: 1,
  },
];

describe('Assessments', () => {
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

  it('marks answers', () => {
    const single = { kind: 'SINGLE' as const, answer: ['b'], points: 2 };
    expect(markAnswer(single, ['b'])).toBe(2);
    expect(markAnswer(single, 'a')).toBe(0);
    expect(markAnswer(single, null)).toBe(0);
    const multi = { kind: 'MULTIPLE' as const, answer: ['x', 'y'], points: 3 };
    expect(markAnswer(multi, ['y', 'x'])).toBe(3);
    expect(markAnswer(multi, ['x'])).toBe(0);
    expect(markAnswer(multi, ['x', 'y', 'z'])).toBe(0);
    const n = { kind: 'NUMBER' as const, answer: { value: 3.14, tolerance: 0.01 }, points: 1 };
    expect(markAnswer(n, '3.15')).toBe(1);
    expect(markAnswer(n, 3.2)).toBe(0);
    const short = { kind: 'SHORT' as const, answer: ['Form 16'], points: 1 };
    expect(markAnswer(short, '  form 16. ')).toBe(1);
    expect(markAnswer({ kind: 'SHORT', answer: [], points: 1 }, 'anything')).toBeNull();
    expect(markAnswer({ kind: 'LONG', answer: null, points: 5 }, 'essay')).toBeNull();
    expect(markAnswer({ kind: 'LONG', answer: null, points: 5 }, '')).toBe(0);
    expect(shuffled([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });

  async function setup() {
    const owner = await signup(app);
    const emp = await api()
      .post('/api/employees')
      .set(owner.auth)
      .send({
        firstName: 'Kavya',
        workEmail: `kavya@${owner.workspace}.test`,
        dateOfJoining: '2025-01-01',
        status: 'ACTIVE',
      })
      .expect(201);
    const kavya = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `kavya@${owner.workspace}.test`,
      emp.body.id,
    );
    return { owner, kavya, kavyaId: emp.body.id as string };
  }

  async function publish(
    auth: Record<string, string>,
    extra: object = {},
    questions: object[] = QUESTIONS,
  ) {
    const a = await api()
      .post('/api/assessments')
      .set(auth)
      .send({ title: 'Payroll basics', passPercent: 70, ...extra })
      .expect(201);
    await api()
      .put(`/api/assessments/${a.body.id}/questions`)
      .set(auth)
      .send({ questions })
      .expect(200);
    await api().post(`/api/assessments/${a.body.id}/publish`).set(auth).expect(200);
    return a.body.id as string;
  }

  it('runs an assessment end to end and hides answers while it is taken', async () => {
    const { owner, kavya, kavyaId } = await setup();
    const id = await publish(owner.auth);

    // Not assigned yet.
    await api().post(`/api/assessments/${id}/attempts`).set(kavya.auth).expect(403);
    const assigned = await api()
      .post(`/api/assessments/${id}/assign`)
      .set(owner.auth)
      .send({ employeeIds: [kavyaId] })
      .expect(200);
    expect(assigned.body.assigned).toBe(1);

    const mine = await api().get('/api/assessments/mine').set(kavya.auth).expect(200);
    expect(mine.body[0]).toMatchObject({ id, canStart: true, questions: 4 });

    const attempt = await api().post(`/api/assessments/${id}/attempts`).set(kavya.auth).expect(201);
    expect(attempt.body.questions).toHaveLength(4);
    expect(JSON.stringify(attempt.body.questions)).not.toContain('"answer"');
    const q = (prompt: string) =>
      attempt.body.questions.find((x: { prompt: string }) => x.prompt.startsWith(prompt)).id;

    const say = (questionId: string, answer: unknown) =>
      api()
        .put(`/api/assessments/attempts/${attempt.body.id}/answers`)
        .set(kavya.auth)
        .send({ questionId, answer })
        .expect(200);
    await say(q('Capital'), ['b']);
    await say(q('Which'), ['pf', 'esi']);
    await say(q('EPF'), 12);
    await say(q('Name'), 'form 16');

    // Nobody else can answer or read it.
    const other = await addLogin(
      app,
      prisma,
      owner.workspace,
      'employee',
      `other@${owner.workspace}.test`,
    );
    await api().get(`/api/assessments/attempts/${attempt.body.id}`).set(other.auth).expect(404);

    const done = await api()
      .post(`/api/assessments/attempts/${attempt.body.id}/submit`)
      .set(kavya.auth)
      .expect(200);
    expect(done.body).toMatchObject({ status: 'MARKED', passed: true });
    expect(Number(done.body.percent)).toBe(100);
    await api()
      .put(`/api/assessments/attempts/${attempt.body.id}/answers`)
      .set(kavya.auth)
      .send({ questionId: q('EPF'), answer: 13 })
      .expect(409);

    // One attempt allowed.
    await api().post(`/api/assessments/${id}/attempts`).set(kavya.auth).expect(409);
    const results = await api().get(`/api/assessments/${id}/results`).set(owner.auth).expect(200);
    expect(results.body.summary).toMatchObject({ assigned: 1, completed: 1, passed: 1 });
    // Questions are locked once someone has started.
    await api()
      .put(`/api/assessments/${id}/questions`)
      .set(owner.auth)
      .send({ questions: QUESTIONS })
      .expect(409);
  });

  it('waits for HR to mark written answers', async () => {
    const { owner, kavya, kavyaId } = await setup();
    const id = await publish(owner.auth, { showResults: 'AFTER_SUBMIT', passPercent: 50 }, [
      QUESTIONS[0]!,
      { kind: 'LONG', prompt: 'Explain gratuity eligibility', answer: null, points: 4 },
    ]);
    await api()
      .post(`/api/assessments/${id}/assign`)
      .set(owner.auth)
      .send({ everyone: true })
      .expect(200);
    const t = await api().post(`/api/assessments/${id}/attempts`).set(kavya.auth).expect(201);
    const longQ = t.body.questions.find((x: { kind: string }) => x.kind === 'LONG').id;
    await api()
      .put(`/api/assessments/attempts/${t.body.id}/answers`)
      .set(kavya.auth)
      .send({ questionId: longQ, answer: 'After five years of service.' })
      .expect(200);
    const sub = await api()
      .post(`/api/assessments/attempts/${t.body.id}/submit`)
      .set(kavya.auth)
      .expect(200);
    expect(sub.body).toMatchObject({ status: 'SUBMITTED', percent: null });

    await api()
      .post(`/api/assessments/attempts/${t.body.id}/mark`)
      .set(kavya.auth)
      .send({ marks: [{ questionId: longQ, points: 4 }] })
      .expect(403);
    await api()
      .post(`/api/assessments/attempts/${t.body.id}/mark`)
      .set(owner.auth)
      .send({ marks: [{ questionId: longQ, points: 5 }] })
      .expect(400);
    const marked = await api()
      .post(`/api/assessments/attempts/${t.body.id}/mark`)
      .set(owner.auth)
      .send({
        marks: [{ questionId: longQ, points: 3, feedback: 'Mention the 4 years 240 days rule' }],
      })
      .expect(200);
    // 0 of 2 on the choice question, 3 of 4 written: 50%.
    expect(marked.body).toMatchObject({ status: 'MARKED', passed: true });
    expect(Number(marked.body.percent)).toBe(50);
    const seen = await api()
      .get(`/api/assessments/attempts/${t.body.id}`)
      .set(kavya.auth)
      .expect(200);
    expect(seen.body.questions.find((x: { id: string }) => x.id === longQ).feedback).toContain(
      '240 days',
    );
  });

  it('submits automatically when time is up, and keeps HR pages to HR', async () => {
    const { owner, kavya, kavyaId } = await setup();
    const id = await publish(owner.auth, { timeLimitMinutes: 5, maxAttempts: 2 });
    await api()
      .post(`/api/assessments/${id}/assign`)
      .set(owner.auth)
      .send({ employeeIds: [kavyaId] })
      .expect(200);
    const t = await api().post(`/api/assessments/${id}/attempts`).set(kavya.auth).expect(201);
    await prisma.assessmentAttempt.update({
      where: { id: t.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await api()
      .put(`/api/assessments/attempts/${t.body.id}/answers`)
      .set(kavya.auth)
      .send({ questionId: t.body.questions[0].id, answer: ['b'] })
      .expect(409);
    const after = await api()
      .get(`/api/assessments/attempts/${t.body.id}`)
      .set(kavya.auth)
      .expect(200);
    expect(after.body.status).toBe('MARKED');
    expect(after.body.passed).toBe(false);
    // A second attempt is allowed.
    await api().post(`/api/assessments/${id}/attempts`).set(kavya.auth).expect(201);

    await api().get('/api/assessments').set(kavya.auth).expect(403);
    await api().get(`/api/assessments/${id}`).set(kavya.auth).expect(403);
    await api().get(`/api/assessments/${id}/results`).set(kavya.auth).expect(403);
    await api().delete(`/api/assessments/${id}`).set(owner.auth).expect(409);

    const other = await signup(app);
    expect((await api().get('/api/assessments').set(other.auth)).body).toHaveLength(0);
    await api().get(`/api/assessments/${id}`).set(other.auth).expect(404);
  });

  it('checks questions and closes cleanly', async () => {
    const { owner } = await setup();
    const a = await api()
      .post('/api/assessments')
      .set(owner.auth)
      .send({ title: 'Draft' })
      .expect(201);
    await api().post(`/api/assessments/${a.body.id}/publish`).set(owner.auth).expect(400);
    await api()
      .put(`/api/assessments/${a.body.id}/questions`)
      .set(owner.auth)
      .send({
        questions: [
          {
            kind: 'SINGLE',
            prompt: 'x',
            options: [
              { id: 'a', text: 'A' },
              { id: 'b', text: 'B' },
            ],
            answer: ['c'],
          },
        ],
      })
      .expect(400);
    const copy = await api().post(`/api/assessments/${a.body.id}/copy`).set(owner.auth).expect(201);
    expect(copy.body.title).toBe('Draft (copy)');
    await api().delete(`/api/assessments/${copy.body.id}`).set(owner.auth).expect(204);
    await api().post(`/api/assessments/${a.body.id}/close`).set(owner.auth).expect(200);
    await api()
      .post(`/api/assessments/${a.body.id}/assign`)
      .set(owner.auth)
      .send({ everyone: true })
      .expect(409);
  });
});
