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
  'Receipt',
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

// ---------- Onboarding and offboarding checklists ----------

export const CHECKLIST_KINDS = ['ONBOARDING', 'OFFBOARDING'] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

/** Who a task falls to. Resolved per employee: their manager, the employee, HR or IT. */
export const TASK_ASSIGNEES = ['HR', 'MANAGER', 'EMPLOYEE', 'IT'] as const;
export type TaskAssignee = (typeof TASK_ASSIGNEES)[number];

export const templateTaskSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullish(),
  assignee: z.enum(TASK_ASSIGNEES),
  /** Days from the joining date (onboarding) or last working day (offboarding); can be negative. */
  dueOffsetDays: z.number().int().min(-180).max(365).default(0),
  /** When set, the task points the person to upload this kind of document. */
  documentCategory: z.string().trim().max(60).nullish(),
});
export type TemplateTaskInput = z.infer<typeof templateTaskSchema>;

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(CHECKLIST_KINDS),
  isDefault: z.boolean().default(false),
  tasks: z.array(templateTaskSchema).min(1).max(60),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.omit({ kind: true }).partial();
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-30')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a real date');

export const startChecklistSchema = z.object({
  kind: z.enum(CHECKLIST_KINDS),
  templateId: z.string().uuid().optional(),
  /** Joining date for onboarding (defaults to the employee's); last working day for offboarding. */
  startDate: isoDate.optional(),
  /** Offboarding only, recorded on the exit. */
  reason: z.enum(['RESIGNATION', 'TERMINATION', 'RETIREMENT', 'CONTRACT_END', 'OTHER']).optional(),
});
export type StartChecklistInput = z.infer<typeof startChecklistSchema>;

export const listChecklistsQuerySchema = z.object({
  kind: z.enum(CHECKLIST_KINDS).optional(),
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
  employeeId: z.string().uuid().optional(),
  /** Only checklists with a task waiting on the caller. */
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListChecklistsQuery = z.infer<typeof listChecklistsQuerySchema>;

export const updateTaskSchema = z.object({
  done: z.boolean(),
  note: z.string().trim().max(500).nullish(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const addTaskSchema = templateTaskSchema
  .omit({ dueOffsetDays: true })
  .extend({ dueDate: isoDate.optional() });
export type AddTaskInput = z.infer<typeof addTaskSchema>;

// ---------- Attendance and leave ----------

/** Day codes on the register. Leave types add their own codes (PL, SL, FV…). */
export const ATTENDANCE_MARKS = ['P', 'A', 'HD'] as const;
export type AttendanceMark = (typeof ATTENDANCE_MARKS)[number];

export const TONES = ['primary', 'detail', 'success', 'warning', 'danger', 'info'] as const;

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(60),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,4}$/, 'Use 1 to 4 letters, like PL'),
  tone: z.enum(TONES).default('info'),
  /** null means no limit. */
  daysPerYear: z.number().int().min(0).max(366).nullable().default(null),
  accrual: z.enum(['YEARLY', 'MONTHLY']).default('YEARLY'),
  carryForward: z.number().int().min(0).max(366).default(0),
  /** Ask for a document when a request is longer than this many days. */
  documentAfterDays: z.number().int().min(1).max(366).nullable().default(null),
  paid: z.boolean().default(true),
  approver: z.enum(['MANAGER', 'HR']).default('MANAGER'),
  /** Field visits and work from home count as present on the register. */
  countsAsPresent: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;
export const updateLeaveTypeSchema = leaveTypeSchema.partial();
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-21')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Enter a real date');

export const createLeaveRequestSchema = z
  .object({
    /** HR can apply on someone's behalf; otherwise it's for the caller. */
    employeeId: z.string().uuid().optional(),
    leaveTypeId: z.string().uuid(),
    startDate: day,
    endDate: day,
    halfDay: z.boolean().default(false),
    reason: z.string().trim().max(500).nullish(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'The end date is before the start date',
    path: ['endDate'],
  })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, {
    message: 'A half day is a single day',
    path: ['halfDay'],
  });
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;

export const decideLeaveSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().max(500).nullish(),
});
export type DecideLeaveInput = z.infer<typeof decideLeaveSchema>;

export const listLeaveQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  employeeId: z.string().uuid().optional(),
  /** Only requests the caller can decide. */
  toDecide: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListLeaveQuery = z.infer<typeof listLeaveQuerySchema>;

export const registerQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10'),
  departmentId: z.string().uuid().optional(),
});
export type RegisterQuery = z.infer<typeof registerQuerySchema>;

export const markAttendanceSchema = z.object({
  employeeId: z.string().uuid(),
  date: day,
  /** P, A or HD, or a leave type code to record a one-day approved leave. */
  code: z.string().trim().toUpperCase().min(1).max(4),
  note: z.string().trim().max(300).nullish(),
});
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;

// ---------- Assets ----------

export const ASSET_CATEGORIES = [
  'Laptop',
  'Monitor',
  'Phone',
  'SIM card',
  'ID card',
  'Access card',
  'Headset',
  'Furniture',
  'Vehicle',
] as const;
export const ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'DAMAGED'] as const;
export const ASSET_STATUSES = ['ASSIGNED', 'IN_STOCK', 'IN_REPAIR', 'RETIRED', 'LOST'] as const;

const optionalDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-21')
  .nullish();

export const createAssetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.enum(ASSET_CATEGORIES),
  serial: z.string().trim().min(1).max(80),
  purchasedOn: optionalDay,
  /** Rupees, whole. */
  cost: z.number().int().min(0).max(1_00_00_00_000).default(0),
  warrantyUntil: optionalDay,
  location: z.string().trim().max(80).nullish(),
  condition: z.enum(ASSET_CONDITIONS).default('NEW'),
  notes: z.string().trim().max(500).nullish(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export const updateAssetSchema = createAssetSchema.partial();
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

export const listAssetsQuerySchema = z.object({
  status: z.enum(ASSET_STATUSES).optional(),
  category: z.enum(ASSET_CATEGORIES).optional(),
  holderId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
});
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;

export const assignAssetSchema = z.object({
  employeeId: z.string().uuid(),
  note: z.string().trim().max(300).nullish(),
});
export type AssignAssetInput = z.infer<typeof assignAssetSchema>;

export const returnAssetSchema = z.object({
  condition: z.enum(ASSET_CONDITIONS),
  note: z.string().trim().max(300).nullish(),
});
export type ReturnAssetInput = z.infer<typeof returnAssetSchema>;

export const assetStatusSchema = z.object({
  status: z.enum(['IN_REPAIR', 'IN_STOCK', 'RETIRED', 'LOST']),
  note: z.string().trim().max(300).nullish(),
});
export type AssetStatusInput = z.infer<typeof assetStatusSchema>;

// ---------- Overtime and expense claims ----------

export const CLAIM_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'ON_HOLD', 'PAID'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const createOvertimeSchema = z.object({
  employeeId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-21'),
  hours: z.number().min(0.5).max(16),
  reason: z.string().trim().min(2).max(300),
});
export type CreateOvertimeInput = z.infer<typeof createOvertimeSchema>;

export const createExpenseSchema = z.object({
  employeeId: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-21'),
  /** Whole rupees. */
  amount: z.number().int().min(1).max(10_00_000),
  description: z.string().trim().min(2).max(300),
  /** A document already uploaded to the employee's files (category Receipt). */
  receiptDocumentId: z.string().uuid().nullish(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const decideClaimsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  decision: z.enum(['APPROVE', 'REJECT', 'HOLD', 'PAID']),
  note: z.string().trim().max(300).nullish(),
});
export type DecideClaimsInput = z.infer<typeof decideClaimsSchema>;

export const listClaimsQuerySchema = z.object({
  status: z.enum(CLAIM_STATUSES).optional(),
  employeeId: z.string().uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;

export const claimCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Most that one claim may be for; null means no limit. */
  limitPerClaim: z.number().int().min(1).max(10_00_000).nullable().default(null),
  needsReceipt: z.boolean().default(true),
  active: z.boolean().default(true),
});
export type ClaimCategoryInput = z.infer<typeof claimCategorySchema>;

// ---------- Payroll ----------

export const salaryStructureSchema = z.object({
  /** Yearly cost to company in whole rupees. */
  annualCtc: z.number().int().min(10_000).max(10_00_00_000),
  /** Basic as a percentage of gross, usually 40–50. */
  basicPercent: z.number().int().min(30).max(80).default(50),
  /** HRA at 50% of basic for Mumbai, Delhi, Kolkata and Chennai; 40% elsewhere. */
  metro: z.boolean().default(false),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-01'),
});
export type SalaryStructureInput = z.infer<typeof salaryStructureSchema>;

export const createPayrollRunSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use a month like 2026-10'),
});
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

export const markFiledSchema = z.object({
  key: z.string().trim().min(1).max(40),
  period: z.string().trim().min(1).max(20),
  reference: z.string().trim().max(80).nullish(),
});
export type MarkFiledInput = z.infer<typeof markFiledSchema>;

// ---------- Performance ----------

export const GOAL_STATUSES = ['ON_TRACK', 'AT_RISK', 'BEHIND', 'DONE'] as const;
export const GOAL_SCOPES = ['COMPANY', 'TEAM', 'PERSONAL'] as const;

export const goalSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).nullish(),
  /** Whose goal it is. Company goals still have an owner who drives them. */
  ownerId: z.string().uuid().optional(),
  scope: z.enum(GOAL_SCOPES).default('PERSONAL'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31'),
  progress: z.number().int().min(0).max(100).default(0),
  status: z.enum(GOAL_STATUSES).default('ON_TRACK'),
});
export type GoalInput = z.infer<typeof goalSchema>;
export const updateGoalSchema = goalSchema.partial();
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const reviewCycleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  closesOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-15'),
});
export type ReviewCycleInput = z.infer<typeof reviewCycleSchema>;

/** 1 Needs improvement · 2 Developing · 3 Meets · 4 Exceeds · 5 Outstanding */
export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comments: z.string().trim().min(2).max(4000),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const kudosSchema = z.object({
  toId: z.string().uuid(),
  value: z.string().trim().min(2).max(40),
  reason: z.string().trim().min(2).max(300),
});
export type KudosInput = z.infer<typeof kudosSchema>;

export const COURSE_MODES = ['GOOGLE_MEET', 'ZOOM', 'TEAMS', 'IN_PERSON', 'SELF_PACED'] as const;

const courseBase = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullish(),
  category: z.string().trim().min(2).max(40),
  leadId: z.string().uuid().nullish(),
  /** Leave empty for everyone. */
  departmentId: z.string().uuid().nullish(),
  mandatory: z.boolean().default(false),
  seats: z.number().int().min(1).max(10000).nullish(),
  startsOn: isoDate,
  endsOn: isoDate,
  hours: z.number().min(0.5).max(500).default(1),
  mode: z.enum(COURSE_MODES).default('GOOGLE_MEET'),
  meetingLink: z.string().trim().url().max(500).nullish().or(z.literal('')),
});
export const courseSchema = courseBase.refine((c) => c.endsOn >= c.startsOn, {
  message: 'The course ends before it starts',
  path: ['endsOn'],
});
export type CourseInput = z.infer<typeof courseSchema>;
export const updateCourseSchema = courseBase.partial();
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const courseSessionSchema = z.object({
  title: z.string().trim().min(2).max(120),
  startsAt: z.string().datetime({ offset: true }),
  minutes: z.number().int().min(10).max(600).default(60),
  location: z.string().trim().max(200).nullish(),
});
export type CourseSessionInput = z.infer<typeof courseSessionSchema>;

export const enrollSchema = z.object({ employeeIds: z.array(z.string().uuid()).min(1).max(500) });
export const progressSchema = z.object({ progress: z.number().int().min(0).max(100) });

export const POST_KINDS = ['UPDATE', 'WIN', 'ANNOUNCEMENT', 'EVENT'] as const;
export const postSchema = z
  .object({
    kind: z.enum(POST_KINDS).default('UPDATE'),
    body: z.string().trim().min(1).max(3000),
    /** Leave empty for everyone. */
    departmentId: z.string().uuid().nullish(),
    eventTitle: z.string().trim().min(2).max(120).nullish(),
    eventStartsAt: z.string().datetime({ offset: true }).nullish(),
    eventEndsAt: z.string().datetime({ offset: true }).nullish(),
    eventLocation: z.string().trim().max(200).nullish(),
  })
  .refine((p) => p.kind !== 'EVENT' || (p.eventTitle && p.eventStartsAt), {
    message: 'An event needs a title and a start time',
    path: ['eventTitle'],
  });
export type PostInput = z.infer<typeof postSchema>;

export const commentSchema = z.object({ body: z.string().trim().min(1).max(1000) });
export const rsvpSchema = z.object({ answer: z.enum(['GOING', 'MAYBE', 'NOT_GOING']) });

export const pollSchema = z.object({
  question: z.string().trim().min(4).max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(6),
  closesOn: isoDate,
});
export type PollInput = z.infer<typeof pollSchema>;

export const pulseSurveySchema = z.object({
  name: z.string().trim().min(2).max(80),
  closesOn: isoDate,
});
export type PulseSurveyInput = z.infer<typeof pulseSurveySchema>;

export const pulseResponseSchema = z.object({
  score: z.number().int().min(0).max(10),
  recognised: z.boolean(),
  managerSupport: z.boolean(),
  workloadFair: z.boolean(),
  comment: z.string().trim().max(1000).nullish(),
});
export type PulseResponseInput = z.infer<typeof pulseResponseSchema>;

export const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });
export const newConversationSchema = z.object({
  toIds: z.array(z.string().uuid()).min(1).max(50),
  subject: z.string().trim().max(160).optional(),
  body: z.string().trim().min(1).max(4000),
});
export type NewConversationInput = z.infer<typeof newConversationSchema>;
export const channelSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,39}$/, 'Use 2 to 40 lower-case letters, numbers or dashes'),
  description: z.string().trim().max(200).nullish(),
});
export type ChannelInput = z.infer<typeof channelSchema>;
