import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createSign, generateKeyPairSync } from 'node:crypto';
import request from 'supertest';
import { OAuthService } from '../src/auth/oauth.service';
import { base32Encode, codeAt, currentStep, verify } from '../src/auth/totp';
import { createApp, password, signup, suffix } from './helpers';

describe('Sign-in security', () => {
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

  /** The link token in the newest email to someone. */
  async function tokenFromEmail(to: string, path: string) {
    const mail = await prisma.outboxEmail.findFirst({
      where: { to },
      orderBy: { createdAt: 'desc' },
    });
    const m = mail?.text?.match(new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`));
    if (!m) throw new Error(`No ${path} link in the last email to ${to}`);
    return m[1]!;
  }
  const login = (workspace: string, email: string, pw = password, remember = true) =>
    api().post('/api/auth/login').send({ workspace, email, password: pw, remember });

  it('checks passwords, terms and bots at sign-up, then verifies the email', async () => {
    const ws = `sec-${suffix()}`;
    const base = {
      companyName: 'Zenith Labs',
      workspace: ws,
      fullName: 'Ravi Kumar',
      email: `ravi@${ws}.test`,
      acceptTerms: true,
    };
    for (const pw of [
      'password123',
      'Welcome@123',
      `My${ws}Pass99`,
      'RaviKumar2026!',
      'aaaaaaaaaaaa',
    ])
      await api()
        .post('/api/auth/signup')
        .send({ ...base, password: pw })
        .expect(400);
    await api()
      .post('/api/auth/signup')
      .send({ ...base, password, acceptTerms: false })
      .expect(400);
    await api()
      .post('/api/auth/signup')
      .send({ ...base, password, website: 'spam.example' })
      .expect(400);
    await api()
      .post('/api/auth/signup')
      .send({ ...base, workspace: 'admin', password })
      .expect(409);
    const res = await api()
      .post('/api/auth/signup')
      .send({ ...base, password })
      .expect(201);
    const auth = { Authorization: `Bearer ${res.body.accessToken}` };

    const me = await api().get('/api/auth/me').set(auth).expect(200);
    expect(me.body.security).toEqual({
      emailVerified: false,
      mfaEnabled: false,
      mfaRequired: false,
    });
    const user = await prisma.user.findFirstOrThrow({ where: { email: base.email } });
    expect(user.termsVersion).toBeTruthy();

    const token = await tokenFromEmail(base.email, '/verify-email');
    await api().post('/api/auth/verify-email').send({ token }).expect(200);
    await api().post('/api/auth/verify-email').send({ token }).expect(400);
    expect((await api().get('/api/auth/me').set(auth)).body.security.emailVerified).toBe(true);
  });

  it('locks a login after repeated wrong passwords, and tells the owner', async () => {
    const owner = await signup(app);
    for (let i = 0; i < 4; i++)
      await login(owner.workspace, owner.email, 'Wrong-password-1').expect(401);
    await login(owner.workspace, owner.email, 'Wrong-password-1').expect(401);
    const locked = await login(owner.workspace, owner.email).expect(429);
    expect(locked.body.message).toMatch(/Too many wrong passwords/);
    const mail = await prisma.outboxEmail.findFirst({
      where: { to: owner.email },
      orderBy: { createdAt: 'desc' },
    });
    expect(mail?.subject).toMatch(/locked/);
    // Unknown people get the same answer as a wrong password.
    await login(owner.workspace, `nobody@${owner.workspace}.test`).expect(401);
    // HR can tune the policy.
    const policy = await api().get('/api/policies/security').set(owner.auth).expect(200);
    expect(policy.body.lockout).toEqual({ attempts: 5, minutes: 15 });
  });

  it('resets a forgotten password once, signing out everywhere', async () => {
    const owner = await signup(app);
    await api()
      .post('/api/auth/forgot-password')
      .send({ workspace: owner.workspace, email: `ghost@${owner.workspace}.test` })
      .expect(200);
    await api()
      .post('/api/auth/forgot-password')
      .send({ workspace: owner.workspace, email: owner.email })
      .expect(200);
    const token = await tokenFromEmail(owner.email, '/reset-password');
    await api()
      .post('/api/auth/reset-password')
      .send({ token, password: 'password1234' })
      .expect(400);
    const next = 'Saffron-river-42-kites';
    const done = await api()
      .post('/api/auth/reset-password')
      .send({ token, password: next })
      .expect(200);
    expect(done.body.workspace).toBe(owner.workspace);
    await api().post('/api/auth/reset-password').send({ token, password: next }).expect(400);
    // The old sign-in is gone, immediately.
    await api().get('/api/auth/me').set(owner.auth).expect(401);
    await api().post('/api/auth/refresh').set('Cookie', owner.cookie).expect(401);
    await login(owner.workspace, owner.email).expect(401);
    await login(owner.workspace, owner.email, next).expect(200);
  });

  it('gives a browser-session cookie without "Keep me signed in"', async () => {
    const owner = await signup(app);
    const short = await login(owner.workspace, owner.email, password, false).expect(200);
    const cookie = (short.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('hrms_rt='),
    )!;
    expect(cookie).not.toMatch(/Expires=/);
    const long = await login(owner.workspace, owner.email).expect(200);
    expect(
      (long.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('hrms_rt=')),
    ).toMatch(/Expires=/);
  });

  it('runs two-step sign-in with an authenticator app and recovery codes', async () => {
    const owner = await signup(app);
    const setup = await api().post('/api/auth/mfa/setup').set(owner.auth).expect(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    await api().post('/api/auth/mfa/enable').set(owner.auth).send({ code: '000000' }).expect(400);
    const step = currentStep();
    const on = await api()
      .post('/api/auth/mfa/enable')
      .set(owner.auth)
      .send({ code: codeAt(setup.body.secret, step) })
      .expect(200);
    expect(on.body.recoveryCodes).toHaveLength(10);

    const first = await login(owner.workspace, owner.email).expect(200);
    expect(first.body).toMatchObject({ mfaRequired: true });
    expect(first.body.accessToken).toBeUndefined();
    // The code used to switch it on can't be used again.
    await api()
      .post('/api/auth/mfa/verify')
      .send({ challenge: first.body.challenge, code: codeAt(setup.body.secret, step) })
      .expect(401);
    const ok = await api()
      .post('/api/auth/mfa/verify')
      .send({ challenge: first.body.challenge, code: codeAt(setup.body.secret, step + 1) })
      .expect(200);
    expect(ok.body.accessToken).toBeTruthy();
    await api()
      .post('/api/auth/mfa/verify')
      .send({ challenge: first.body.challenge, code: codeAt(setup.body.secret, step + 1) })
      .expect(401);

    const second = await login(owner.workspace, owner.email).expect(200);
    const code = on.body.recoveryCodes[0].toUpperCase();
    await api()
      .post('/api/auth/mfa/verify')
      .send({ challenge: second.body.challenge, code })
      .expect(200);
    const third = await login(owner.workspace, owner.email).expect(200);
    await api()
      .post('/api/auth/mfa/verify')
      .send({ challenge: third.body.challenge, code })
      .expect(401);

    const account = await api()
      .get('/api/auth/account')
      .set({ Authorization: `Bearer ${ok.body.accessToken}` })
      .expect(200);
    expect(account.body).toMatchObject({ mfaEnabled: true, recoveryCodesLeft: 9 });
    // When the company requires it, it can't be switched off.
    await api()
      .put('/api/policies/security')
      .set(owner.auth)
      .send({ mfaForAdmins: true })
      .expect(200);
    await api()
      .post('/api/auth/mfa/disable')
      .set({ Authorization: `Bearer ${ok.body.accessToken}` })
      .send({ password, code: on.body.recoveryCodes[1] })
      .expect(403);
  });

  it('lists signed-in devices and signs the others out at once', async () => {
    const owner = await signup(app);
    const other = await login(owner.workspace, owner.email).expect(200);
    const otherAuth = { Authorization: `Bearer ${other.body.accessToken}` };
    const list = await api().get('/api/auth/sessions').set(owner.auth).expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    await api().post('/api/auth/sessions/revoke-others').set(owner.auth).expect(204);
    await api().get('/api/auth/me').set(otherAuth).expect(401);
    await api().get('/api/auth/me').set(owner.auth).expect(200);
  });

  it('changes the password with the current one, and emails workspaces on request', async () => {
    const owner = await signup(app);
    await api()
      .post('/api/auth/password')
      .set(owner.auth)
      .send({ current: 'nope', password: 'Teal-lantern-77-orbit' })
      .expect(400);
    await api()
      .post('/api/auth/password')
      .set(owner.auth)
      .send({ current: password, password: 'Teal-lantern-77-orbit' })
      .expect(200);
    await login(owner.workspace, owner.email, 'Teal-lantern-77-orbit').expect(200);
    await api().post('/api/auth/find-workspaces').send({ email: owner.email }).expect(200);
    const mail = await prisma.outboxEmail.findFirst({
      where: { to: owner.email },
      orderBy: { createdAt: 'desc' },
    });
    expect(mail?.text).toContain(owner.workspace);
    expect((await api().get('/api/auth/providers').expect(200)).body).toEqual({
      google: false,
      microsoft: false,
    });
    await api().get(`/api/auth/oauth/google/start?workspace=${owner.workspace}`).expect(400);
  });
});

describe('Authenticator codes (RFC 6238)', () => {
  it('matches the RFC test vector and allows one step of drift', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    // RFC 6238 Appendix B, T = 59s: 94287082, whose last six digits are 287082.
    expect(codeAt(secret, 1)).toBe('287082');
    expect(verify(secret, '287082', 59_000)).toBe(1);
    expect(verify(secret, '287082', 89_000)).toBe(1);
    expect(verify(secret, '287082', 150_000)).toBeNull();
  });
});

describe('Google and Microsoft ID tokens', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
  const cfg = {
    jwks: 'https://keys.test/jwks',
    issuer: (i: string) => i === 'https://accounts.google.com',
    clientId: 'client-1',
  };
  const sign = (claims: object) => {
    const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
    const p = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const s = createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url');
    return `${h}.${p}.${s}`;
  };
  const service = () => {
    const s = new OAuthService({} as never, {} as never, {} as never);
    (s as unknown as { jwksCache: Map<string, unknown> }).jwksCache.set(cfg.jwks, {
      at: Date.now(),
      keys: [jwk],
    });
    return s;
  };
  const good = {
    iss: 'https://accounts.google.com',
    aud: 'client-1',
    exp: Date.now() / 1000 + 300,
    nonce: 'n1',
    sub: '42',
    email: 'a@b.test',
    email_verified: true,
  };

  it('accepts a correctly signed token for this app', async () => {
    await expect(service().verifyIdToken(sign(good), cfg, 'n1')).resolves.toMatchObject({
      sub: '42',
    });
  });

  it('refuses the wrong audience, issuer, nonce, expiry or a forged signature', async () => {
    for (const bad of [
      { aud: 'someone-else' },
      { iss: 'https://evil.test' },
      { nonce: 'n2' },
      { exp: Date.now() / 1000 - 600 },
    ])
      await expect(service().verifyIdToken(sign({ ...good, ...bad }), cfg, 'n1')).rejects.toThrow();
    const [h, p] = sign(good).split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...good, sub: '99' })).toString('base64url')}.${sign(good).split('.')[2]}`;
    void p;
    await expect(service().verifyIdToken(forged, cfg, 'n1')).rejects.toThrow();
  });
});
