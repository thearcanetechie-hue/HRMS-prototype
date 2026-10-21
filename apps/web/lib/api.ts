/**
 * Browser API client. The access token lives in memory only; the refresh token
 * is an httpOnly cookie the API sets, so a reload calls /auth/refresh to get a
 * new access token and scripts can never read the long-lived credential.
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (res) => {
      if (!res.ok) return false;
      setAccessToken(((await res.json()) as { accessToken: string }).accessToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Fetches with the access token, refreshing it once on a 401. Throws ApiError when not ok. */
async function send(path: string, init: RequestInit, retry: boolean): Promise<Response> {
  const headers = new Headers(init.headers);
  // FormData sets its own multipart Content-Type with the boundary.
  if (typeof init.body === 'string' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const res = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return send(path, init, false);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
      errors?: Record<string, string[]>;
    };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(
      res.status,
      res.status === 413 ? 'Files can be up to 20 MB' : (message ?? res.statusText),
      body.errors,
    );
  }
  return res;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await send(path, init, retry);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Downloads a protected file (sent with the access token) as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  return (await send(path, {}, true)).blob();
}

export interface Me {
  user: { id: string; email: string; fullName: string; permissions: string[] };
  tenant: { id: string; name: string; slug: string; status: string };
  employee: { id: string; employeeCode: string; firstName: string; lastName: string } | null;
}

/** Directory entries leave out the fields marked optional; full records include them. */
export interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string | null;
  dateOfJoining?: string;
  employmentType?: string;
  status?: 'ONBOARDING' | 'ACTIVE' | 'ON_NOTICE' | 'EXITED';
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
  manager: { id: string; firstName: string; lastName: string } | null;
  user?: { id: string; status: 'INVITED' | 'ACTIVE' | 'DISABLED' } | null;
  direct?: boolean;
}

export interface Address {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
}

export type IdentifierKey = 'pan' | 'aadhaar' | 'uan' | 'esicNumber' | 'bankAccountNumber';

export interface Profile {
  employeeId: string;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  bloodGroup: string | null;
  personalEmail: string | null;
  personalPhone: string | null;
  currentAddress: Address | null;
  permanentAddress: Address | null;
  emergencyContacts: { name: string; relation: string; phone: string }[];
  bankIfsc: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  identifiers: Record<IdentifierKey, { last4: string | null; value?: string | null }>;
  unmasked: boolean;
  updatedAt: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Named {
  id: string;
  name: string;
}

export type DocumentStatus =
  'PROCESSING' | 'NEEDS_REVIEW' | 'VERIFIED' | 'SIGNED' | 'ISSUED' | 'REJECTED';

export interface DocumentItem {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  uploadedById: string | null;
  employeeId: string | null;
  folderId: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department: Named | null;
  } | null;
  folder: { id: string; name: string; visibility: 'EVERYONE' | 'HR' } | null;
}

export interface DocumentFolders {
  all: number;
  employeeFiles: number;
  byDepartment: { id: string | null; name: string; count: number }[];
  folders: { id: string; name: string; visibility: 'EVERYONE' | 'HR'; count: number }[];
  canManage: boolean;
  selfEmployeeId: string | null;
}

/** Uploads one file to an employee or a company folder. */
export function uploadDocument(
  file: Blob,
  fileName: string,
  target: { employeeId?: string; folderId?: string },
  category: string,
) {
  const form = new FormData();
  if (target.employeeId) form.set('employeeId', target.employeeId);
  if (target.folderId) form.set('folderId', target.folderId);
  form.set('category', category);
  form.set('file', file, fileName);
  return api<DocumentItem>('/documents', { method: 'POST', body: form });
}

export type ChecklistKind = 'ONBOARDING' | 'OFFBOARDING';
export type TaskAssignee = 'HR' | 'MANAGER' | 'EMPLOYEE' | 'IT';

export interface ChecklistTask {
  id: string;
  checklistId: string;
  position: number;
  title: string;
  description: string | null;
  assignee: TaskAssignee;
  dueDate: string;
  documentCategory: string | null;
  doneAt: string | null;
  doneBy: string | null;
  note: string | null;
  overdue: boolean;
  canTick: boolean;
}

export interface Checklist {
  id: string;
  kind: ChecklistKind;
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  startDate: string;
  reason: string | null;
  createdAt: string;
  completedAt: string | null;
  canManage: boolean;
  progress: { done: number; total: number };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    managerId: string | null;
    status: Employee['status'];
    department: Named | null;
    designation: Named | null;
  };
  tasks: ChecklistTask[];
}

export interface TemplateTask {
  title: string;
  description?: string | null;
  assignee: TaskAssignee;
  dueOffsetDays: number;
  documentCategory?: string | null;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  kind: ChecklistKind;
  isDefault: boolean;
  tasks: TemplateTask[];
}

export type Tone6 = 'primary' | 'detail' | 'success' | 'warning' | 'danger' | 'info';

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  tone: Tone6;
  daysPerYear: number | null;
  accrual: 'YEARLY' | 'MONTHLY';
  carryForward: number;
  documentAfterDays: number | null;
  paid: boolean;
  approver: 'MANAGER' | 'HR';
  countsAsPresent: boolean;
  active: boolean;
}

export interface RegisterCell {
  code: string;
  late?: boolean;
  halfDay?: boolean;
}

export interface AttendanceRegister {
  month: string;
  days: string[];
  today: string;
  canMark: boolean;
  leaveTypes: Pick<LeaveType, 'id' | 'code' | 'name' | 'tone' | 'countsAsPresent' | 'active'>[];
  rows: {
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      employeeCode: string;
      department: Named | null;
    };
    cells: RegisterCell[];
    present: number;
    workingDays: number;
  }[];
}

export interface AttendanceToday {
  date: string;
  weekend: boolean;
  headcount: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  field: number;
  notMarked: number;
  me: {
    employeeId: string;
    checkIn: string | null;
    checkOut: string | null;
    status: string | null;
  } | null;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decisionNote: string | null;
  createdAt: string;
  canDecide: boolean;
  canCancel: boolean;
  needsDocument?: boolean;
  leaveType: { id: string; name: string; code: string; tone: Tone6; approver: 'MANAGER' | 'HR' };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department: Named | null;
  };
}

export interface LeaveBalance {
  leaveType: { id: string; name: string; code: string; tone: Tone6 };
  entitled: number | null;
  total: number | null;
  used: number;
  pending: number;
  left: number | null;
}

export interface HomeData {
  scope: 'company' | 'team';
  date: string;
  headcount: number;
  joinedThisMonth: number;
  onNotice: number;
  today: AttendanceToday;
  attendanceWeek: { date: string; label: string; pct: number; weekend: boolean }[];
  attendanceMonths: { label: string; pct: number }[];
  requests: (
    | { kind: 'leave'; id: string; summary: string; employee: HomePerson }
    | { kind: 'task'; id: string; checklistId: string; summary: string; employee: HomePerson }
  )[];
  openRequests: number;
  checklists: {
    id: string;
    kind: ChecklistKind;
    startDate: string;
    employee: { id: string; name: string };
    progress: { done: number; total: number };
    overdue: number;
  }[];
  events: {
    kind: 'birthday' | 'anniversary' | 'joining' | 'leaving';
    title: string;
    when: string;
    date: string;
  }[];
  teams: { name: string; count: number }[];
}

export interface HomePerson {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
}

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ON_HOLD' | 'PAID';

export interface ClaimPerson {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department: Named | null;
}

export interface OvertimeItem {
  id: string;
  employeeId: string;
  date: string;
  hours: number;
  reason: string;
  status: ClaimStatus;
  decisionNote: string | null;
  createdAt: string;
  canDecide: boolean;
  employee: ClaimPerson;
}

export interface ClaimCategory {
  id: string;
  name: string;
  limitPerClaim: number | null;
  needsReceipt: boolean;
  active: boolean;
}

export interface ExpenseItem {
  id: string;
  employeeId: string;
  spentOn: string;
  amount: number;
  description: string;
  receiptDocumentId: string | null;
  status: ClaimStatus;
  decisionNote: string | null;
  paidAt: string | null;
  createdAt: string;
  overLimit: boolean;
  canDecide: boolean;
  canMarkPaid: boolean;
  employee: ClaimPerson;
  category: Pick<ClaimCategory, 'id' | 'name' | 'limitPerClaim' | 'needsReceipt'>;
}

export interface ClaimsSummary {
  month: string;
  overtimeHours: number;
  overtimeApprovedHours: number;
  pendingClaims: number;
  pendingAmount: number;
  monthSpend: number;
  avgApprovalDays: number | null;
  spendByCategory: { label: string; amount: number }[];
  canManage: boolean;
  selfEmployeeId: string | null;
}
