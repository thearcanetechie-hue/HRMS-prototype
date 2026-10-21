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

export interface SalaryInfo {
  id: string;
  annualCtc: number;
  basicPercent: number;
  metro: boolean;
  effectiveFrom: string;
  monthlyGross: number;
}

export interface PayslipFlag {
  tag: string;
  reason: string;
  tone: 'warning' | 'danger' | 'accent' | 'info';
}

export interface PayslipData {
  id: string;
  runId: string;
  month: string;
  runStatus: 'DRAFT' | 'LOCKED' | 'PAID';
  company?: string;
  employee: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department: string | null;
    designation: string | null;
    location: string | null;
  };
  lines: {
    key: string;
    label: string;
    amount: number;
    kind: 'earning' | 'deduction' | 'employer';
  }[];
  gross: number;
  deductions: number;
  net: number;
  pf: number;
  esi: number;
  pt: number;
  tds: number;
  employerPf: number;
  employerEsi: number;
  reimbursements: number;
  payableDays: number;
  daysInMonth: number;
  lopDays: number;
  overtimeHours: number;
  flags: PayslipFlag[];
  reviewed: boolean;
}

export interface PayrollRunData {
  id: string;
  month: string;
  status: 'DRAFT' | 'LOCKED' | 'PAID';
  gross: number;
  net: number;
  statutory: number;
  ctc: number;
  lockedAt: string | null;
  paidAt: string | null;
  payslips: PayslipData[];
  pendingOvertime: number;
  pendingClaims: number;
  flagged: number;
  unreviewed: number;
  split: { net: number; tds: number; pf: number; esiPt: number; reimbursements: number };
}

export interface ComplianceItem {
  key: string;
  name: string;
  period: string;
  due: string;
  amount: number | null;
  dueInDays: number;
  status: 'open' | 'soon' | 'overdue' | 'filed';
  filedAt: string | null;
  reference: string | null;
}

export interface PerfPerson {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department: { name: string } | null;
}

export interface GoalItem {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  scope: 'COMPANY' | 'TEAM' | 'PERSONAL';
  dueDate: string;
  progress: number;
  status: 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'DONE';
  canEdit: boolean;
  owner: PerfPerson;
}

export interface ReviewItem {
  id: string;
  cycleId: string;
  stage: 'SELF' | 'MANAGER' | 'CALIBRATION' | 'SHARED';
  employee: PerfPerson;
  reviewer: PerfPerson | null;
  selfRating: number | null;
  selfComments: string | null;
  managerRating: number | null;
  managerComments: string | null;
  finalRating: number | null;
  canWriteSelf: boolean;
  canWriteManager: boolean;
  canShare: boolean;
}

export interface ReviewCycleInfo {
  id: string;
  name: string;
  closesOn: string;
  active: boolean;
}

export interface ReviewsData {
  cycle: ReviewCycleInfo | null;
  counts: {
    total: number;
    selfDone: number;
    managerDone: number;
    calibrated: number;
    shared: number;
  } | null;
  reviews: ReviewItem[];
}

export interface PerformanceOverview {
  goals: number;
  goalsOnTrackPct: number | null;
  goalsAtRisk: number;
  cycle: ReviewCycleInfo | null;
  counts: ReviewsData['counts'];
  myReviewTodo: number;
  kudosThisMonth: number;
  canManage: boolean;
  selfEmployeeId: string | null;
}

export interface KudosData {
  recent: {
    id: string;
    value: string;
    reason: string;
    createdAt: string;
    from: PerfPerson;
    to: PerfPerson;
  }[];
  top: { employee: PerfPerson; count: number; latest: string }[];
}

export type CourseMode = 'GOOGLE_MEET' | 'ZOOM' | 'TEAMS' | 'IN_PERSON' | 'SELF_PACED';

export interface CourseItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  lead: PerfPerson | null;
  leadId: string | null;
  department: { id: string; name: string } | null;
  mandatory: boolean;
  seats: number | null;
  startsOn: string;
  endsOn: string;
  hours: number;
  mode: CourseMode;
  meetingLink: string | null;
  status: 'UPCOMING' | 'ONGOING' | 'COMPLETED';
  registered: number;
  done: number;
  inProgress: number;
  notStarted: number;
  avg: number;
  mine: { id: string; progress: number } | null;
  canManage: boolean;
  canEnroll: boolean;
}

export interface CourseSessionItem {
  id: string;
  courseId: string;
  title: string;
  course: string;
  startsAt: string;
  minutes: number;
  location: string | null;
  mode: CourseMode;
  meetingLink: string | null;
}

export interface LearningOverview {
  courses: CourseItem[];
  sessions: CourseSessionItem[];
  stats: {
    running: number;
    mandatory: number;
    registrations: number;
    registrationsThisMonth: number;
    completionPct: number | null;
    hours: number;
  };
  canManage: boolean;
  selfEmployeeId: string | null;
}

export interface LearnerItem {
  id: string;
  employee: PerfPerson;
  progress: number;
  completedAt: string | null;
  canUpdate: boolean;
}

export interface MyCourse {
  id: string;
  progress: number;
  completedAt: string | null;
  course: {
    id: string;
    title: string;
    mandatory: boolean;
    endsOn: string;
    status: CourseItem['status'];
  };
}

export interface FeedPerson extends PerfPerson {
  designation: { name: string } | null;
}

export interface FeedPost {
  id: string;
  kind: 'UPDATE' | 'WIN' | 'ANNOUNCEMENT' | 'KUDOS' | 'EVENT';
  body: string;
  author: FeedPerson;
  department: { id: string; name: string } | null;
  pinned: boolean;
  createdAt: string;
  kudos: { value: string; to: FeedPerson } | null;
  event: {
    title: string;
    startsAt: string;
    endsAt: string | null;
    location: string | null;
    going: number;
    maybe: number;
    mine: 'GOING' | 'MAYBE' | 'NOT_GOING' | null;
  } | null;
  reactions: number;
  comments: number;
  liked: boolean;
  canDelete: boolean;
}

export interface FeedPage {
  posts: FeedPost[];
  nextBefore: string | null;
}

export interface FeedComment {
  id: string;
  body: string;
  author: FeedPerson;
  createdAt: string;
  canDelete: boolean;
}

export interface PulseSummary {
  id: string;
  name: string;
  closesOn: string;
  active: boolean;
  replies: number;
  invited: number;
  answered: boolean;
  minResponses: number;
  score: number | null;
  items: { label: string; pct: number }[];
  comments: string[];
}

export interface PollSummary {
  id: string;
  question: string;
  closesOn: string;
  open: boolean;
  votes: number;
  voted: string | null;
  options: { id: string; label: string; votes: number; pct: number }[];
}

export interface Celebration {
  kind: 'BIRTHDAY' | 'ANNIVERSARY' | 'JOINED';
  employee: FeedPerson;
  on: string;
  caption: string;
}

export interface EngagementSidebar {
  pulse: PulseSummary | null;
  poll: PollSummary | null;
  celebrations: Celebration[];
  trending: string[];
  canManage: boolean;
  selfEmployeeId: string | null;
  departmentId: string | null;
}
