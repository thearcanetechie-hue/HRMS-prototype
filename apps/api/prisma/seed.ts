/**
 * Creates a demo workspace for local development:
 *   workspace: demo, password DemoPass123 for every login:
 *   owner@demo.test (Owner), vikram@demo.test (Manager), priya@demo.test (Employee)
 * Needs DATA_ENCRYPTION_KEY to encrypt the sample PAN and bank details.
 * Safe to run more than once.
 */
import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLES, SystemRoleKey } from '@hrms/shared';
import * as argon2 from 'argon2';
import { FieldCrypto } from '../src/crypto/field-crypto';

const prisma = new PrismaClient();

async function main() {
  if (await prisma.tenant.findUnique({ where: { slug: 'demo' } })) {
    console.log('Demo workspace already exists, nothing to do.');
    return;
  }
  const tenant = await prisma.tenant.create({
    data: { name: 'Demo Industries Pvt Ltd', slug: 'demo', status: 'ACTIVE' },
  });
  const tenantId = tenant.id;
  const roles = Object.fromEntries(
    await Promise.all(
      (Object.keys(SYSTEM_ROLES) as SystemRoleKey[]).map(async (key) => [
        key,
        await prisma.role.create({
          data: {
            tenantId,
            key,
            name: SYSTEM_ROLES[key].name,
            isSystem: true,
            permissions: SYSTEM_ROLES[key].permissions,
          },
        }),
      ]),
    ),
  );
  const passwordHash = await argon2.hash('DemoPass123', { type: argon2.argon2id });
  const login = (email: string, fullName: string, role: keyof typeof roles) =>
    prisma.user.create({
      data: {
        tenantId,
        email,
        fullName,
        passwordHash,
        roles: { create: { tenantId, roleId: roles[role]!.id } },
      },
    });
  const owner = await login('owner@demo.test', 'Asha Rao', 'owner');
  const managerLogin = await login('vikram@demo.test', 'Vikram Iyer', 'manager');
  const employeeLogin = await login('priya@demo.test', 'Priya Nair', 'employee');

  const entity = await prisma.legalEntity.create({
    data: { tenantId, name: 'Demo Industries Pvt Ltd', pan: 'AAACD1234E' },
  });
  const [blr, pune] = await Promise.all([
    prisma.location.create({
      data: { tenantId, name: 'Bengaluru HQ', city: 'Bengaluru', state: 'Karnataka' },
    }),
    prisma.location.create({
      data: { tenantId, name: 'Pune', city: 'Pune', state: 'Maharashtra' },
    }),
  ]);
  const depts = await Promise.all(
    ['Engineering', 'People', 'Finance', 'Sales'].map((name) =>
      prisma.department.create({ data: { tenantId, name } }),
    ),
  );
  const titles = await Promise.all(
    [
      ['Founder & CEO', 1],
      ['Engineering Manager', 3],
      ['Software Engineer', 5],
      ['HR Business Partner', 4],
      ['Accountant', 5],
      ['Account Executive', 5],
    ].map(([name, level]) =>
      prisma.designation.create({
        data: { tenantId, name: name as string, level: level as number },
      }),
    ),
  );

  const base = { tenantId, legalEntityId: entity.id, status: 'ACTIVE' as const };
  const ceo = await prisma.employee.create({
    data: {
      ...base,
      userId: owner.id,
      employeeCode: 'EMP-0001',
      firstName: 'Asha',
      lastName: 'Rao',
      workEmail: 'owner@demo.test',
      dateOfJoining: new Date('2022-04-01'),
      departmentId: depts[1]!.id,
      designationId: titles[0]!.id,
      locationId: blr.id,
    },
  });
  const em = await prisma.employee.create({
    data: {
      ...base,
      employeeCode: 'EMP-0002',
      userId: managerLogin.id,
      firstName: 'Vikram',
      lastName: 'Iyer',
      workEmail: 'vikram@demo.test',
      dateOfJoining: new Date('2022-06-15'),
      departmentId: depts[0]!.id,
      designationId: titles[1]!.id,
      locationId: blr.id,
      managerId: ceo.id,
    },
  });
  const rest: [string, string, number, number, string][] = [
    ['Priya', 'Nair', 0, 2, 'blr'],
    ['Rahul', 'Deshmukh', 0, 2, 'pune'],
    ['Meera', 'Kulkarni', 1, 3, 'pune'],
    ['Arjun', 'Singh', 2, 4, 'blr'],
    ['Sneha', 'Reddy', 3, 5, 'blr'],
  ];
  for (const [i, [first, last, d, t, loc]] of rest.entries()) {
    await prisma.employee.create({
      data: {
        ...base,
        employeeCode: `EMP-${String(i + 3).padStart(4, '0')}`,
        firstName: first,
        lastName: last,
        workEmail: `${first.toLowerCase()}@demo.test`,
        dateOfJoining: new Date(2023, i, 2),
        departmentId: depts[d]!.id,
        designationId: titles[t]!.id,
        locationId: loc === 'blr' ? blr.id : pune.id,
        managerId: d === 0 ? em.id : ceo.id,
        userId: first === 'Priya' ? employeeLogin.id : null,
      },
    });
  }

  const crypto = new FieldCrypto(process.env.DATA_ENCRYPTION_KEY ?? '');
  const priya = await prisma.employee.findFirstOrThrow({ where: { tenantId, firstName: 'Priya' } });
  await prisma.employeeProfile.create({
    data: {
      tenantId,
      employeeId: priya.id,
      dateOfBirth: new Date('1996-08-14'),
      gender: 'FEMALE',
      bloodGroup: 'B+',
      personalEmail: 'priya.nair@example.com',
      currentAddress: {
        line1: '12 Lake View Road',
        line2: 'Indiranagar',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560038',
      },
      emergencyContacts: [{ name: 'Ravi Nair', relation: 'Father', phone: '+91 98450 00000' }],
      panEnc: crypto.encrypt(tenantId, 'pan', 'ABCPN1234D'),
      panLast4: '234D',
      bankAccountNumberEnc: crypto.encrypt(tenantId, 'bankAccountNumber', '50100012345678'),
      bankAccountNumberLast4: '5678',
      bankIfsc: 'HDFC0000123',
      bankName: 'HDFC Bank',
      bankAccountHolder: 'Priya Nair',
    },
  });
  console.log(
    'Seeded demo workspace "demo": owner@, vikram@ (manager), priya@ (employee) demo.test, password DemoPass123',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
