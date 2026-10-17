'use client';

import { Download, Filter, Upload, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ActivityLog } from '@/components/activity-log';
import { AddEmployee } from '@/components/add-employee';
import { InviteButton } from '@/components/invite-button';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { SearchField } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/input';
import { Banner, Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { Table, TableEmpty, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError, Employee, Named, Paged } from '@/lib/api';
import { getEmployeeLog, LAST_SEEN, type LogEvent } from '@/lib/demo/employees';
import { initials, STATUS_TONE, titleCase } from '@/lib/format';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 9;
const STATUSES = ['ACTIVE', 'ONBOARDING', 'ON_NOTICE', 'EXITED'] as const;
type Status = (typeof STATUSES)[number];

export default function EmployeesPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense>
      <Employees />
    </Suspense>
  );
}

function Employees() {
  const { can } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const full = can('employee.read');
  const manage = can('employee.manage');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<Employee> | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [departments, setDepartments] = useState<Named[]>([]);
  const [log, setLog] = useState<LogEvent[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(params.get('add') === '1');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(departmentId ? { departmentId } : {}),
      });
      setData(await api<Paged<Employee>>(`/employees?${q}`));
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load employees.');
    }
  }, [search, status, departmentId, page]);

  const loadCounts = useCallback(() => {
    if (!full) return;
    const count = (s = '') =>
      api<Paged<Employee>>(`/employees?pageSize=1${s && `&status=${s}`}`).then(
        (r) => [s || 'ALL', r.total] as const,
      );
    Promise.all([count(), ...STATUSES.map(count)])
      .then((pairs) => setCounts(Object.fromEntries(pairs)))
      .catch(() => undefined);
  }, [full]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(loadCounts, [loadCounts]);
  useEffect(() => {
    api<Named[]>('/org/departments')
      .then(setDepartments)
      .catch(() => undefined);
    if (full) getEmployeeLog().then(setLog);
  }, [full]);

  const filterCount = [status, departmentId].filter(Boolean).length;
  const clearFilters = () => {
    setStatus('');
    setDepartmentId('');
    setSearch('');
    setPage(1);
  };
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const from = data && data.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = data ? Math.min(page * PAGE_SIZE, data.total) : 0;

  const directory = (
    <div className="grid min-w-0 content-start gap-4">
      {full && (
        <div className="flex flex-wrap gap-2.5">
          {(['', ...STATUSES] as const).map((s) => (
            <Chip
              key={s || 'ALL'}
              active={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s ? titleCase(s) : 'All'}
              {counts[s || 'ALL'] != null && (
                <span className="font-mono text-xs opacity-80">{counts[s || 'ALL']}</span>
              )}
            </Chip>
          ))}
        </div>
      )}
      {error && <Banner>{error}</Banner>}
      <Table>
        <THead>
          <tr>
            <TH>Employee</TH>
            <TH>Code</TH>
            <TH>Team</TH>
            <TH>Location</TH>
            {full && <TH>Status</TH>}
            {full && <TH className="text-right">Last seen</TH>}
            {manage && <TH>Access</TH>}
          </tr>
        </THead>
        <TBody>
          {!data &&
            [0, 1, 2, 3].map((i) => (
              <TR key={i}>
                <TD colSpan={7}>
                  <Skeleton className="h-9" />
                </TD>
              </TR>
            ))}
          {data?.items.map((e, i) => (
            <TR
              key={e.id}
              className="cursor-pointer"
              onClick={(ev) => {
                if (!(ev.target as HTMLElement).closest('a,button'))
                  router.push(`/employees/${e.id}`);
              }}
            >
              <TD>
                <Link
                  href={`/employees/${e.id}`}
                  className="group flex min-w-52 items-center gap-3 text-inherit no-underline"
                >
                  <Avatar size="sm" initials={initials(e.firstName, e.lastName)} />
                  <div className="min-w-0">
                    <div className="font-bold whitespace-nowrap group-hover:text-primary">
                      {e.firstName} {e.lastName}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {e.designation?.name ?? e.workEmail}
                    </div>
                  </div>
                </Link>
              </TD>
              <TD className="font-mono text-[13px]">{e.employeeCode}</TD>
              <TD>{e.department?.name ?? '–'}</TD>
              <TD>{e.location?.name ?? '–'}</TD>
              {full && (
                <TD>
                  {e.status && (
                    <Badge tone={e.status === 'EXITED' ? 'neutral' : STATUS_TONE[e.status]}>
                      {titleCase(e.status)}
                    </Badge>
                  )}
                </TD>
              )}
              {full && (
                <TD className="text-right whitespace-nowrap text-muted-foreground">
                  {e.status === 'EXITED' ? 'Left' : LAST_SEEN[i % LAST_SEEN.length]}
                </TD>
              )}
              {manage && (
                <TD>
                  <InviteButton employee={e} onInvited={() => void load()} />
                </TD>
              )}
            </TR>
          ))}
        </TBody>
      </Table>
      {data && data.items.length === 0 && (
        <div className="grid justify-items-center gap-3">
          <TableEmpty>No one matches these filters</TableEmpty>
          <Button size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      )}
      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <span>
            Showing {from}–{to} of {data.total}
          </span>
          <nav aria-label="Pages" className="flex gap-1.5">
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => setPage(p)}
                className={cn(
                  'grid size-8 cursor-pointer place-items-center rounded-[10px] font-bold tabular',
                  p === page
                    ? 'bg-primary text-primary-foreground shadow-glow'
                    : 'bg-surface text-foreground shadow-raised-sm',
                )}
              >
                {p}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow="People"
        title={full ? 'Employees' : 'Directory'}
        description={
          counts.ALL != null
            ? `${counts.ALL} ${counts.ALL === 1 ? 'person' : 'people'} across ${departments.length} teams.`
            : data
              ? `${data.total} people`
              : 'Loading…'
        }
        actions={
          manage && (
            <>
              <Button asChild>
                <Link href="/onboarding/team">
                  <Upload /> Import
                </Link>
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                <UserPlus /> Add employee
              </Button>
            </>
          )
        }
      />

      <Tabs defaultValue="directory" className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          {full ? (
            <TabsList>
              <TabsTrigger value="directory">Directory</TabsTrigger>
              <TabsTrigger value="log">Activity log</TabsTrigger>
              <TabsTrigger value="org">Org chart</TabsTrigger>
            </TabsList>
          ) : null}
          <div className="ml-auto flex w-full gap-3 sm:w-auto">
            <SearchField
              className="sm:w-[280px]"
              placeholder="Name, code or email"
              aria-label="Search employees"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <Button className="h-11" onClick={() => setFiltersOpen(true)}>
              <Filter /> Filters{filterCount ? ` · ${filterCount}` : ''}
            </Button>
          </div>
        </div>

        <TabsContent value="directory">
          {full ? (
            <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
              {directory}
              <Card className="content-start">
                <CardHeader>
                  <div>
                    <CardTitle>Employee log</CardTitle>
                    <CardDescription>Every change, in order</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" disabled title="Coming soon">
                    <Download /> Export
                  </Button>
                </CardHeader>
                {log ? <ActivityLog events={log} /> : <Skeleton className="h-60" />}
              </Card>
            </div>
          ) : (
            directory
          )}
        </TabsContent>
        <TabsContent value="log">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Activity log</CardTitle>
                <CardDescription>Every change, in order</CardDescription>
              </div>
            </CardHeader>
            {log ? <ActivityLog events={log} /> : <Skeleton className="h-60" />}
          </Card>
        </TabsContent>
        <TabsContent value="org">
          <Card>
            <Empty>The org chart is coming soon.</Empty>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent title="Filters" side="right" aria-describedby={undefined}>
          <div className="grid gap-4">
            <Field id="f-team" label="Team">
              <Select
                id="f-team"
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All teams</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            {full && (
              <Field id="f-status" label="Status">
                <Select
                  id="f-status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as Status | '');
                    setPage(1);
                  }}
                >
                  <option value="">Any status</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {titleCase(s)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="flex gap-3">
              <DialogClose asChild>
                <Button variant="primary">Show results</Button>
              </DialogClose>
              <Button onClick={clearFilters}>Clear</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && (
          <AddEmployee
            onCreated={() => {
              setAdding(false);
              void load();
              loadCounts();
            }}
          />
        )}
      </Dialog>
    </>
  );
}
