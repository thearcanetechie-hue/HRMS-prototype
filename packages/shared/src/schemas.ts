import { z } from 'zod';
import { ALL_PERMISSIONS } from './permissions';

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and hyphens');

const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .regex(/[a-zA-Z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

const email = z.string().trim().toLowerCase().email().max(254);

export const signupSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  workspace: slug,
  fullName: z.string().trim().min(2).max(120),
  email,
  password,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  workspace: slug,
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
  'CONSULTANT',
] as const;
export const EMPLOYEE_STATUSES = ['ONBOARDING', 'ACTIVE', 'ON_NOTICE', 'EXITED'] as const;

const optionalId = z.string().uuid().nullish();

export const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(1).max(32),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(''),
  workEmail: email,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 -]{7,20}$/, 'Enter a valid phone number')
    .nullish(),
  dateOfJoining: z.coerce.date({ errorMap: () => ({ message: 'Enter a date' }) }),
  employmentType: z.enum(EMPLOYMENT_TYPES).default('FULL_TIME'),
  status: z.enum(EMPLOYEE_STATUSES).default('ONBOARDING'),
  departmentId: optionalId,
  designationId: optionalId,
  locationId: optionalId,
  legalEntityId: optionalId,
  managerId: optionalId,
  customFields: z.record(z.string(), z.unknown()).default({}),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const listEmployeesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  departmentId: z.string().uuid().optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(16).nullish(),
  parentId: optionalId,
});

export const createDesignationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  level: z.number().int().min(0).max(50).nullish(),
});

/** Indian state matters for Professional Tax and LWF, so locations carry it. */
export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().max(80).nullish(),
  state: z.string().trim().max(80).nullish(),
  country: z.string().trim().length(2).default('IN'),
  timezone: z.string().trim().max(64).default('Asia/Kolkata'),
});

/** A registered company under the tenant; statutory registrations hang off it for payroll. */
export const createLegalEntitySchema = z.object({
  name: z.string().trim().min(1).max(160),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid PAN')
    .nullish(),
  tan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}[0-9]{5}[A-Z]$/, 'Enter a valid TAN')
    .nullish(),
  gstin: z.string().trim().toUpperCase().length(15).nullish(),
});

export const createRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,39}$/),
  name: z.string().trim().min(1).max(60),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(200),
});

export const updateRoleSchema = createRoleSchema.omit({ key: true }).partial();

export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1).max(20),
});
