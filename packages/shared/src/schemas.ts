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

// ---------- Core HR: invites and profiles ----------

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const GENDERS = ['FEMALE', 'MALE', 'NON_BINARY', 'UNDISCLOSED'] as const;
export const MARITAL_STATUSES = [
  'SINGLE',
  'MARRIED',
  'DIVORCED',
  'WIDOWED',
  'UNDISCLOSED',
] as const;
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

const addressSchema = z.object({
  line1: z.string().trim().max(160).default(''),
  line2: z.string().trim().max(160).default(''),
  city: z.string().trim().max(80).default(''),
  state: z.string().trim().max(80).default(''),
  pincode: z
    .string()
    .trim()
    .regex(/^$|^[1-9][0-9]{5}$/, 'Enter a 6-digit PIN code')
    .default(''),
});

const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  relation: z.string().trim().max(40).default(''),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 -]{7,20}$/, 'Enter a valid phone number'),
});

// Verhoeff checksum used by Aadhaar numbers; catches single-digit typos and most swaps.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidVerhoeff(digits: string): boolean {
  let c = 0;
  [...digits].reverse().forEach((ch, i) => {
    c = VERHOEFF_D[c]![VERHOEFF_P[i % 8]![Number(ch)]!]!;
  });
  return c === 0;
}

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/** Statutory and bank identifiers are stored encrypted; null clears a value. */
const secret = (schema: z.ZodType<string, z.ZodTypeDef, string>) =>
  z.preprocess(blankToNull, schema.nullish());

export const profileSchema = z.object({
  dateOfBirth: z.preprocess(blankToNull, z.coerce.date().nullish()),
  gender: z.enum(GENDERS).nullish(),
  maritalStatus: z.enum(MARITAL_STATUSES).nullish(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullish(),
  personalEmail: z.preprocess(blankToNull, email.nullish()),
  personalPhone: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^\+?[0-9 -]{7,20}$/, 'Enter a valid phone number')
      .nullish(),
  ),
  currentAddress: addressSchema.nullish(),
  permanentAddress: addressSchema.nullish(),
  emergencyContacts: z.array(emergencyContactSchema).max(5).optional(),
  pan: secret(
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Enter a valid PAN'),
  ),
  aadhaar: secret(
    z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, ''))
      .pipe(
        z
          .string()
          .regex(/^[2-9][0-9]{11}$/, 'Enter a valid 12-digit Aadhaar number')
          .refine(isValidVerhoeff, 'This Aadhaar number has a typo'),
      ),
  ),
  uan: secret(
    z
      .string()
      .trim()
      .regex(/^[0-9]{12}$/, 'Enter a valid 12-digit UAN'),
  ),
  esicNumber: secret(
    z
      .string()
      .trim()
      .regex(/^[0-9]{10,17}$/, 'Enter a valid ESIC number'),
  ),
  bankAccountNumber: secret(
    z
      .string()
      .trim()
      .regex(/^[0-9]{9,18}$/, 'Enter a valid account number'),
  ),
  bankIfsc: z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC')
      .nullish(),
  ),
  bankName: z.preprocess(blankToNull, z.string().trim().max(120).nullish()),
  bankAccountHolder: z.preprocess(blankToNull, z.string().trim().max(120).nullish()),
});
export type ProfileInput = z.infer<typeof profileSchema>;

/** Identifiers that are encrypted at rest and masked unless the viewer may see them. */
export const SENSITIVE_PROFILE_FIELDS = [
  'pan',
  'aadhaar',
  'uan',
  'esicNumber',
  'bankAccountNumber',
] as const;
export type SensitiveProfileField = (typeof SENSITIVE_PROFILE_FIELDS)[number];

// ---------- Documents ----------

export const DOCUMENT_STATUSES = [
  'PROCESSING',
  'NEEDS_REVIEW',
  'VERIFIED',
  'SIGNED',
  'ISSUED',
  'REJECTED',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** Kinds of document HR keeps per employee; free text is allowed too. */
export const DOCUMENT_CATEGORIES = [
  'Aadhaar card',
  'PAN card',
  'Passport',
  'Offer letter',
  'Appointment letter',
  'Relieving letter',
  'Experience letter',
  'Degree certificate',
  'Payslip',
  'Form 16',
  'Bank proof',
  'Policy',
  'Contract',
  'Other',
] as const;

/** Files the API accepts, by MIME type, with the extension each must carry. */
export const DOCUMENT_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.ms-excel': ['xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'text/csv': ['csv'],
};

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** Form fields sent with an upload (the file itself is the `file` part). */
export const uploadDocumentSchema = z
  .object({
    employeeId: z.string().uuid().optional(),
    folderId: z.string().uuid().optional(),
    category: z.string().trim().min(1).max(60).default('Other'),
    name: z.string().trim().min(1).max(160).optional(),
  })
  .refine((v) => Boolean(v.employeeId) !== Boolean(v.folderId), {
    message: 'Choose either an employee or a folder',
    path: ['employeeId'],
  });
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const listDocumentsQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;

export const updateDocumentSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(['EVERYONE', 'HR']).default('HR'),
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
