/**
 * Creates a demo workspace for local development:
 *   workspace: demo   email: owner@demo.test   password: DemoPass123
 * Safe to run more than once.
 */
import { PrismaClient } from '@prisma/client';
import { SYSTEM_ROLES, SystemRoleKey } from '@hrms/shared';
import * as argon2 from 'argon2';

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
  const owner = await prisma.user.create({
    data: {
      tenantId,
      email: 'owner@demo.test',
      fullName: 'Asha Rao',
      passwordHash: await argon2.hash('DemoPass123', { type: argon2.argon2id }),
      roles: { create: { tenantId, roleId: roles.owner.id } },
    },
  });

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
      },
    });
  }
  console.log('Seeded demo workspace: demo / owner@demo.test / DemoPass123');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
