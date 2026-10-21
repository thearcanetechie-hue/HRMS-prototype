'use client';

import {
  CalendarDays,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Hash,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityFeed } from './activity-log';
import { ProfileAssetsCard } from './assets';
import { ProfileChecklistCard } from './checklists';
import { EmployeeDocumentsCard } from './documents';
import { EmployeeAttendanceCard, EmployeeLeaveCard } from './person-cards';
import { InviteButton } from './invite-button';
import { ProfileForm } from './profile-form';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent } from './ui/dialog';
import { DemoBadge, IconTile } from './ui/page';
import { ProgressBar, Skeleton } from './ui/progress';
import { ProgressRing } from './ui/progress-ring';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { api, type Employee, type IdentifierKey, type Profile, type SalaryInfo } from '@/lib/api';
import { getProfileExtras, type ProfileExtras } from '@/lib/demo/profile';
import { formatDate, initials, inr, STATUS_TONE, titleCase } from '@/lib/format';
import { useSession } from '@/lib/session';

type KV = [string, ReactNode];

function KeyValues({ items }: { items: KV[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{k}</dt>
          <dd className="mt-0.5 font-semibold break-words">{v || '–'}</dd>
        </div>
      ))}
    </dl>
  );
}

const IDS: [IdentifierKey, string, (l: string) => string][] = [
  ['pan', 'PAN', (l) => `•••••••${l}`],
  ['aadhaar', 'Aadhaar', (l) => `•••• •••• ${l}`],
  ['uan', 'UAN', (l) => `••••••••${l}`],
  ['esicNumber', 'ESI number', (l) => `••••••${l}`],
  ['bankAccountNumber', 'Bank account', (l) => `••••••${l}`],
];

const address = (a: Profile['currentAddress']) =>
  a && [a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ');

/**
 * A person's page (screen 09). Used for /employees/[id] and for /profile (self view).
 * Job and identity data are real; attendance, leave, documents and performance are demo.
 */
export function EmployeeProfileView({
  employee,
  profile,
  editable,
  canInvite,
  onProfileSaved,
  self = false,
}: {
  employee: Employee;
  profile: Profile | null;
  editable: boolean;
  canInvite?: boolean;
  onProfileSaved: (p: Profile) => void;
  self?: boolean;
}) {
  const { can } = useSession();
  const [extras, setExtras] = useState<ProfileExtras | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [editing, setEditing] = useState(false);
  const name = `${employee.firstName} ${employee.lastName}`.trim();

  const [salary, setSalary] = useState<SalaryInfo | null>(null);

  useEffect(() => {
    getProfileExtras(employee.id).then(setExtras);
    // Salary is shown to the person and to payroll; for anyone else the request is refused.
    if (self || can('payroll.manage'))
      api<{ current: SalaryInfo | null }>(`/payroll/salaries/${employee.id}`)
        .then((r) => setSalary(r.current))
        .catch(() => setSalary(null));
  }, [employee.id, self, can]);

  const meta: [typeof Hash, string | null | undefined][] = [
    [Hash, employee.employeeCode],
    [MapPin, employee.location?.name],
    [Mail, employee.workEmail],
    [Phone, employee.phone],
    [CalendarDays, employee.dateOfJoining && `Joined ${formatDate(employee.dateOfJoining)}`],
  ];

  const personal: KV[] = profile
    ? [
        ['Date of birth', profile.dateOfBirth && formatDate(profile.dateOfBirth)],
        ['Gender', profile.gender && titleCase(profile.gender)],
        ['Blood group', profile.bloodGroup],
        ['Marital status', profile.maritalStatus && titleCase(profile.maritalStatus)],
        ['Personal email', profile.personalEmail],
        [
          'Emergency contact',
          profile.emergencyContacts[0] &&
            `${profile.emergencyContacts[0].name} · ${profile.emergencyContacts[0].phone}`,
        ],
        ['Current address', address(profile.currentAddress)],
        ['Personal phone', profile.personalPhone],
      ]
    : [];

  const job: KV[] = [
    ['Department', employee.department?.name],
    ['Designation', employee.designation?.name],
    ['Employment type', employee.employmentType && titleCase(employee.employmentType)],
    ['Work location', employee.location?.name],
    ...(salary
      ? ([
          ['Annual CTC', inr(salary.annualCtc)],
          ['Monthly gross', inr(salary.monthlyGross)],
          ['Salary from', formatDate(salary.effectiveFrom)],
        ] as KV[])
      : []),
  ];

  const personalCard = (
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
        {editable && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        )}
      </CardHeader>
      {profile ? (
        <KeyValues items={personal} />
      ) : (
        <p className="text-muted-foreground">Only HR and {employee.firstName} can see these.</p>
      )}
    </Card>
  );

  const jobCard = (
    <Card>
      <CardHeader>
        <CardTitle>Job & pay</CardTitle>
      </CardHeader>
      <KeyValues items={job} />
    </Card>
  );

  const statutoryCard = (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Statutory and bank (encrypted)</CardTitle>
          <CardDescription>
            {self ? 'Visible to you and HR admins only' : 'Visible to HR admins only'}
          </CardDescription>
        </div>
        {profile?.unmasked && (
          <Button variant="ghost" size="sm" onClick={() => setRevealed((r) => !r)}>
            {revealed ? <EyeOff /> : <Eye />} {revealed ? 'Hide' : 'Reveal'}
          </Button>
        )}
      </CardHeader>
      {profile ? (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {IDS.map(([key, labelText, maskFn]) => {
            const id = profile.identifiers[key];
            const shown =
              revealed && id.value
                ? key === 'bankAccountNumber' && profile.bankName
                  ? `${profile.bankName} ${id.value}`
                  : id.value
                : id.last4
                  ? (key === 'bankAccountNumber' && profile.bankName
                      ? `${profile.bankName} `
                      : '') + maskFn(id.last4)
                  : null;
            return (
              <div key={key}>
                <dt className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  {labelText}
                </dt>
                <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-[13.5px]">
                  {shown ? (
                    <>
                      {!revealed && <Lock className="size-3.5 text-detail" />}
                      {shown}
                    </>
                  ) : (
                    <span className="font-sans font-semibold text-muted-foreground">Not added</span>
                  )}
                </dd>
              </div>
            );
          })}
          <div>
            <dt className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              IFSC
            </dt>
            <dd className="mt-0.5 font-mono text-[13.5px]">{profile.bankIfsc || '–'}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-muted-foreground">Ask HR to see these details.</p>
      )}
    </Card>
  );

  const attendanceCard = <EmployeeAttendanceCard employeeId={employee.id} />;
  const leaveCard = <EmployeeLeaveCard employeeId={employee.id} />;

  const documentsCard = <EmployeeDocumentsCard employeeId={employee.id} self={self} />;

  const performanceCard = extras && (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Performance</CardTitle>
          <CardDescription>{extras.performance.cycle}</CardDescription>
        </div>
        <Badge tone="success">{extras.performance.rating}</Badge>
      </CardHeader>
      <ul className="grid gap-3.5">
        {extras.performance.goals.map((g) => (
          <li key={g.title} className="grid gap-1.5">
            <div className="flex justify-between gap-2">
              <span className="font-semibold">{g.title}</span>
              <span className="font-mono text-[13px] text-muted-foreground">{g.pct}%</span>
            </div>
            <ProgressBar value={g.pct} tone={g.pct >= 100 ? 'success' : 'primary'} />
          </li>
        ))}
      </ul>
    </Card>
  );

  return (
    <>
      {!self && (
        <nav
          aria-label="Breadcrumb"
          className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"
        >
          <Link href="/employees" className="text-muted-foreground no-underline">
            Employees
          </Link>
          <ChevronRight className="size-3.5" />
          <span className="text-foreground">{name}</span>
        </nav>
      )}

      <Card className="mb-6 flex flex-wrap items-center gap-6 p-6 sm:p-7">
        <span className="grid size-[88px] shrink-0 place-items-center rounded-[28px] bg-gradient-to-br from-primary-soft to-primary-strong text-[28px] font-extrabold text-primary-foreground shadow-glow">
          {initials(employee.firstName, employee.lastName)}
        </span>
        <div className="min-w-0 grow">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-[28px]">{name}</h1>
            {employee.status && (
              <Badge tone={STATUS_TONE[employee.status]}>{titleCase(employee.status)}</Badge>
            )}
          </div>
          <p className="mt-1 text-muted-foreground">
            {[
              employee.designation?.name,
              employee.department?.name,
              employee.manager &&
                `reports to ${employee.manager.firstName} ${employee.manager.lastName}`,
            ]
              .filter(Boolean)
              .join(' · ') || 'No job details yet'}
          </p>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
            {meta
              .filter(([, v]) => v)
              .map(([Icon, v]) => (
                <li key={v} className="flex items-center gap-1.5">
                  <Icon className="size-3.5 text-detail" /> {v}
                </li>
              ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-3">
          {canInvite && <InviteButton employee={employee} />}
          {!self && (
            <Button asChild>
              <Link href={`/inbox?to=${employee.id}`}>
                <MessageSquare /> Message
              </Link>
            </Button>
          )}
          {editable && profile && (
            <Button variant="primary" onClick={() => setEditing(true)}>
              <Pencil /> Edit profile
            </Button>
          )}
        </div>
      </Card>

      <Tabs defaultValue="overview" className="grid gap-5">
        <TabsList className="justify-self-start">
          {[
            'Overview',
            'Job & pay',
            'Attendance',
            'Leave',
            'Documents',
            'Performance',
            'Timeline',
          ].map((t) => (
            <TabsTrigger key={t} value={t.toLowerCase()}>
              {t}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
            <div className="grid content-start gap-5">
              {personalCard}
              {jobCard}
              {statutoryCard}
            </div>
            <div className="grid content-start gap-5">
              <ProfileChecklistCard employee={employee} canManage={can('lifecycle.manage')} />
              <ProfileAssetsCard employeeId={employee.id} canManage={can('employee.manage')} />
              {attendanceCard}
              {leaveCard}
              {documentsCard}
              {performanceCard}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="job & pay" className="grid gap-5">
          {jobCard}
          {statutoryCard}
        </TabsContent>
        <TabsContent value="attendance">{attendanceCard}</TabsContent>
        <TabsContent value="leave">{leaveCard}</TabsContent>
        <TabsContent value="documents">{documentsCard}</TabsContent>
        <TabsContent value="performance">{performanceCard}</TabsContent>
        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <ActivityFeed employeeId={employee.id} take={50} />
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && profile && (
          <DialogContent title="Edit profile" side="right" aria-describedby={undefined}>
            <ProfileForm
              employeeId={self ? 'me' : employee.id}
              profile={profile}
              editable={editable}
              onSaved={(p) => {
                onProfileSaved(p);
                setEditing(false);
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="grid gap-5">
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-10 w-96 max-w-full" />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}
