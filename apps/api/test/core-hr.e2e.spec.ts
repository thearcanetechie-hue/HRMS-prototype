import { INestApplication } from '@nestjs/common';
import { isValidVerhoeff } from '@hrms/shared';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { FieldCrypto } from '../src/crypto/field-crypto';
import { addLogin, createApp, password, signup } from './helpers';

/** A syntactically valid Aadhaar-style number (correct Verhoeff check digit). */
function aadhaar(prefix = '23456789012') {
  for (let d = 0; d < 10; d++) if (isValidVerhoeff(prefix + d)) return prefix + d;
  throw new Error('unreachable');
}

describe('Core HR', () => {
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
        dateOfJoining: '2026-01-01',
        ...extra,
      })
      .expect(201);
    return res.body.id as string;
  }

  describe('invitations', () => {
    it('lets an invited employee set a password once and sign in', async () => {
      const owner = await signup(app);
      const empId = await addEmployee(owner.auth, 'E1');

      const invite = await api().post(`/api/employees/${empId}/invite`).set(owner.auth).expect(201);
      const token = new URL(invite.body.inviteUrl).searchParams.get('token')!;
      expect(invite.body.inviteUrl).toMatch(/\/accept-invite\?token=/);

      const info = await api().get(`/api/auth/invitations/${token}`).expect(200);
      expect(info.body).toMatchObject({ workspace: owner.workspace, email: 'e1@acme.test' });

      // Invited but not accepted: cannot sign in yet.
      await api()
        .post('/api/auth/login')
        .send({ workspace: owner.workspace, email: 'e1@acme.test', password })
        .expect(401);

      const accepted = await api()
        .post('/api/auth/accept-invite')
        .send({ token, password })
        .expect(200);
      expect(accepted.headers['set-cookie']?.[0]).toMatch(/hrms_rt=/);
      const me = await api()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accepted.body.accessToken}`)
        .expect(200);
      expect(me.body.employee.id).toBe(empId);
      expect(me.body.user.permissions).toEqual(expect.arrayContaining(['directory.read']));
      expect(me.body.user.permissions).not.toContain('employee.read');

      await api().post('/api/auth/accept-invite').send({ token, password }).expect(410);
      await api()
        .post('/api/auth/login')
        .send({ workspace: owner.workspace, email: 'e1@acme.test', password })
        .expect(200);
      await api().post(`/api/employees/${empId}/invite`).set(owner.auth).expect(409);

      const list = await api().get('/api/employees?search=E1').set(owner.auth).expect(200);
      expect(list.body.items[0].user.status).toBe('ACTIVE');
    });

    it('replaces older links, rejects expired ones and needs employee.manage', async () => {
      const owner = await signup(app);
      const empId = await addEmployee(owner.auth, 'E2');
      const first = await api().post(`/api/employees/${empId}/invite`).set(owner.auth).expect(201);
      const second = await api().post(`/api/employees/${empId}/invite`).set(owner.auth).expect(201);
      const tokenOf = (r: request.Response) => new URL(r.body.inviteUrl).searchParams.get('token')!;

      await api()
        .get(`/api/auth/invitations/${tokenOf(first)}`)
        .expect(404);
      await prisma.invitation.updateMany({
        where: { userId: second.body.userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await api()
        .post('/api/auth/accept-invite')
        .send({ token: tokenOf(second), password })
        .expect(410);

      const staffEmp = await addEmployee(owner.auth, 'E3');
      const staff = await addLogin(
        app,
        prisma,
        owner.workspace,
        'employee',
        'e3@acme.test',
        staffEmp,
      );
      await api().post(`/api/employees/${empId}/invite`).set(staff.auth).expect(403);
    });
  });

  describe('access levels', () => {
    it('gives employees the directory, managers their reporting line, HR everything', async () => {
      const owner = await signup(app);
      const boss = await addEmployee(owner.auth, 'BOSS');
      const lead = await addEmployee(owner.auth, 'LEAD', { managerId: boss });
      const dev = await addEmployee(owner.auth, 'DEV', { managerId: lead });
      const other = await addEmployee(owner.auth, 'OTHER');
      const gone = await addEmployee(owner.auth, 'GONE', { status: 'EXITED' });

      const manager = await addLogin(
        app,
        prisma,
        owner.workspace,
        'manager',
        'boss@acme.test',
        boss,
      );
      const staff = await addLogin(app, prisma, owner.workspace, 'employee', 'dev@acme.test', dev);

      // Directory: everyone except leavers, basic fields only.
      const dir = await api().get('/api/employees?pageSize=100').set(staff.auth).expect(200);
      const ids = dir.body.items.map((e: { id: string }) => e.id);
      expect(ids).toEqual(expect.arrayContaining([boss, lead, other]));
      expect(ids).not.toContain(gone);
      expect(dir.body.items[0].dateOfJoining).toBeUndefined();
      expect(dir.body.items[0].customFields).toBeUndefined();
      await api().get(`/api/employees/${gone}`).set(staff.auth).expect(404);

      // Full record of yourself, directory view of others.
      const self = await api().get(`/api/employees/${dev}`).set(staff.auth).expect(200);
      expect(self.body.dateOfJoining).toBeDefined();
      const peer = await api().get(`/api/employees/${other}`).set(staff.auth).expect(200);
      expect(peer.body.dateOfJoining).toBeUndefined();
      await api().get(`/api/employees/${other}/profile`).set(staff.auth).expect(404);
      await api().get('/api/employees/team').set(staff.auth).expect(403);

      // Manager: whole reporting line in full, not people outside it.
      const team = await api().get('/api/employees/team').set(manager.auth).expect(200);
      expect(team.body.items.map((e: { id: string }) => e.id).sort()).toEqual([dev, lead].sort());
      expect(team.body.items.find((e: { id: string }) => e.id === lead).direct).toBe(true);
      const report = await api().get(`/api/employees/${dev}`).set(manager.auth).expect(200);
      expect(report.body.dateOfJoining).toBeDefined();
      await api().get(`/api/employees/${dev}/profile`).set(manager.auth).expect(200);
      await api().get(`/api/employees/${other}/profile`).set(manager.auth).expect(404);
      const outsider = await api().get(`/api/employees/${other}`).set(manager.auth).expect(200);
      expect(outsider.body.dateOfJoining).toBeUndefined();

      // HR (owner) sees leavers too.
      await api().get(`/api/employees/${gone}`).set(owner.auth).expect(200);
    });
  });

  describe('profiles', () => {
    it('encrypts identifiers and masks them for everyone but the employee and HR', async () => {
      const owner = await signup(app);
      const mgrEmp = await addEmployee(owner.auth, 'MGR');
      const devEmp = await addEmployee(owner.auth, 'DEV2', { managerId: mgrEmp });
      const peerEmp = await addEmployee(owner.auth, 'PEER', { managerId: mgrEmp });
      const manager = await addLogin(
        app,
        prisma,
        owner.workspace,
        'manager',
        'mgr@acme.test',
        mgrEmp,
      );
      const dev = await addLogin(
        app,
        prisma,
        owner.workspace,
        'employee',
        'dev2@acme.test',
        devEmp,
      );
      const peer = await addLogin(
        app,
        prisma,
        owner.workspace,
        'employee',
        'peer@acme.test',
        peerEmp,
      );
      const aadhaarNo = aadhaar();

      const saved = await api()
        .put('/api/me/profile')
        .set(dev.auth)
        .send({
          pan: 'abcde1234f',
          aadhaar: `${aadhaarNo.slice(0, 4)} ${aadhaarNo.slice(4, 8)} ${aadhaarNo.slice(8)}`,
          bankAccountNumber: '123456789012',
          bankIfsc: 'hdfc0001234',
          bloodGroup: 'O+',
          emergencyContacts: [{ name: 'Mom', relation: 'Mother', phone: '+91 90000 00000' }],
        })
        .expect(200);
      expect(saved.body.identifiers.pan).toEqual({ last4: '234F', value: 'ABCDE1234F' });
      expect(saved.body.identifiers.aadhaar.value).toBe(aadhaarNo);
      expect(saved.body.bankIfsc).toBe('HDFC0001234');

      // Stored encrypted, not in plain text.
      const row = await prisma.employeeProfile.findUniqueOrThrow({ where: { employeeId: devEmp } });
      expect(row.panEnc).toMatch(/^v1\./);
      expect(JSON.stringify(row)).not.toContain('ABCDE1234F');
      expect(JSON.stringify(row)).not.toContain(aadhaarNo);

      // Manager: masked. Owner (employee.sensitive.read): unmasked. Peer: nothing.
      const asManager = await api()
        .get(`/api/employees/${devEmp}/profile`)
        .set(manager.auth)
        .expect(200);
      expect(asManager.body.identifiers.pan).toEqual({ last4: '234F' });
      expect(asManager.body.unmasked).toBe(false);
      const asOwner = await api()
        .get(`/api/employees/${devEmp}/profile`)
        .set(owner.auth)
        .expect(200);
      expect(asOwner.body.identifiers.bankAccountNumber.value).toBe('123456789012');
      await api().get(`/api/employees/${devEmp}/profile`).set(peer.auth).expect(404);

      // Only self or employee.manage may edit; a manager can view but not edit.
      await api()
        .put(`/api/employees/${devEmp}/profile`)
        .set(peer.auth)
        .send({ bloodGroup: 'A+' })
        .expect(404);
      await api()
        .put(`/api/employees/${devEmp}/profile`)
        .set(manager.auth)
        .send({ bloodGroup: 'A+' })
        .expect(403);
      await api()
        .put(`/api/employees/${devEmp}/profile`)
        .set(owner.auth)
        .send({ bloodGroup: 'A+' })
        .expect(200);

      // Partial update keeps other fields; null clears.
      const cleared = await api()
        .put('/api/me/profile')
        .set(dev.auth)
        .send({ pan: null })
        .expect(200);
      expect(cleared.body.identifiers.pan).toEqual({ last4: null, value: null });
      expect(cleared.body.identifiers.aadhaar.value).toBe(aadhaarNo);
      expect(cleared.body.bloodGroup).toBe('A+');

      // Audit log records which fields changed, never their values.
      const audit = await api().get('/api/audit-logs').set(owner.auth).expect(200);
      const changed = audit.body
        .filter((a: { action: string }) => a.action === 'employee.profile_updated')
        .flatMap((a: { data: { fields: string[] } }) => a.data.fields);
      expect(changed).toEqual(expect.arrayContaining(['pan', 'aadhaar', 'bloodGroup']));
      expect(JSON.stringify(audit.body)).not.toContain('ABCDE1234F');
    });

    it('rejects invalid identifiers', async () => {
      const owner = await signup(app);
      const bad = aadhaar().slice(0, 11) + ((Number(aadhaar().slice(11)) + 1) % 10);
      const res = await api()
        .put('/api/me/profile')
        .set(owner.auth)
        .send({ aadhaar: bad, pan: 'NOTAPAN', bankIfsc: 'XYZ' })
        .expect(400);
      expect(Object.keys(res.body.errors).sort()).toEqual(['aadhaar', 'bankIfsc', 'pan']);
    });
  });

  describe('field encryption', () => {
    const crypto = new FieldCrypto(Buffer.alloc(32, 7).toString('base64'));
    const tenantA = '00000000-0000-4000-8000-00000000000a';
    const tenantB = '00000000-0000-4000-8000-00000000000b';

    it('round-trips and uses a fresh IV each time', () => {
      const a = crypto.encrypt(tenantA, 'pan', 'ABCDE1234F');
      expect(crypto.encrypt(tenantA, 'pan', 'ABCDE1234F')).not.toBe(a);
      expect(crypto.decrypt(tenantA, 'pan', a)).toBe('ABCDE1234F');
    });

    it('refuses ciphertext moved to another workspace or field, or tampered with', () => {
      const a = crypto.encrypt(tenantA, 'pan', 'ABCDE1234F');
      expect(() => crypto.decrypt(tenantB, 'pan', a)).toThrow();
      expect(() => crypto.decrypt(tenantA, 'aadhaar', a)).toThrow();
      // Flip a character well inside the payload: the last base64 character can carry unused
      // padding bits, so changing it does not always change the bytes.
      const tampered = a.slice(0, 12) + (a[12] === 'A' ? 'B' : 'A') + a.slice(13);
      expect(() => crypto.decrypt(tenantA, 'pan', tampered)).toThrow();
    });
  });
});
