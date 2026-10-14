'use client';

import { CalendarDays, Clock, Plus, Search, Sparkles, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { IconTile, PageHeader } from '@/components/ui/page';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Switch } from '@/components/ui/switch';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';

const SWATCHES = [
  ['Background', 'bg-background'],
  ['Surface', 'bg-surface'],
  ['Primary', 'bg-primary'],
  ['Primary soft', 'bg-primary-soft'],
  ['Success', 'bg-success'],
  ['Warning', 'bg-warning'],
  ['Danger', 'bg-danger'],
  ['Info', 'bg-info'],
] as const;

/** Living style guide: every building block new modules should reuse, in the current theme. */
export default function DesignPage() {
  const [on, setOn] = useState(true);
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <div className="mb-8 flex items-center gap-3">
        <Logo />
        <span className="font-extrabold">HRMS design system</span>
        <ThemeToggle className="ml-auto" />
      </div>
      <PageHeader
        eyebrow="Foundations"
        title="Colours, surfaces and controls"
        description="Light mode is soft grey with teal; dark mode is near-black with gold. Every screen uses these pieces."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Colours</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {SWATCHES.map(([name, cls]) => (
              <div key={name} className="grid gap-2">
                <div className={`h-14 rounded-xl shadow-raised-sm ${cls}`} />
                <span className="text-xs font-semibold text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="flex items-center justify-center">
          <ProgressRing value={76} label="Attendance" />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">
              <Plus /> Primary
            </Button>
            <Button>Default</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button size="icon" aria-label="Search">
              <Search />
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Badges and people</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-3">
            <Badge tone="success">Active</Badge>
            <Badge tone="accent">Onboarding</Badge>
            <Badge tone="warning">On notice</Badge>
            <Badge tone="danger">Exited</Badge>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Avatar initials="AS" />
            <Avatar initials="RK" size="sm" />
            <Avatar initials="PM" size="lg" />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Toggles</CardTitle>
          </CardHeader>
          <label className="flex items-center justify-between gap-3 font-semibold">
            Email me leave requests
            <Switch checked={on} onCheckedChange={setOn} />
          </label>
          <label className="mt-4 flex items-center justify-between gap-3 font-semibold">
            Dark mode
            <ThemeToggle />
          </label>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Form fields</CardTitle>
            <CardDescription>Pressed-in wells for anything the user types.</CardDescription>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="d-name" label="Full name">
              <Input id="d-name" placeholder="Ananya Sharma" />
            </Field>
            <Field id="d-dept" label="Department">
              <Select id="d-dept" defaultValue="eng">
                <option value="eng">Engineering</option>
                <option value="ops">Operations</option>
              </Select>
            </Field>
            <Field id="d-pan" label="PAN" error="Enter a valid PAN, like ABCDE1234F">
              <Input id="d-pan" defaultValue="ABC12" aria-invalid />
            </Field>
            <Field id="d-date" label="Date of joining">
              <Input id="d-date" type="date" defaultValue="2026-10-14" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dialogs</CardTitle>
          </CardHeader>
          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger asChild>
                <Button>Open dialog</Button>
              </DialogTrigger>
              <DialogContent title="Approve leave?" aria-describedby={undefined}>
                <p className="text-muted-foreground">Ravi Kumar · 3 days casual leave</p>
                <div className="mt-5 flex gap-3">
                  <DialogClose asChild>
                    <Button variant="primary">Approve</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>Cancel</Button>
                  </DialogClose>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </Card>

        <div className="grid gap-4 lg:col-span-3 lg:grid-cols-4">
          {(
            [
              [Clock, 'Attendance', '94%'],
              [CalendarDays, 'On leave today', '6'],
              [Wallet, 'Payroll run', '28 Oct'],
              [Sparkles, 'Open questions', '3'],
            ] as const
          ).map(([Icon, label, value]) => (
            <Card key={label} className="flex items-center gap-4">
              <IconTile>
                <Icon />
              </IconTile>
              <div>
                <div className="text-[13px] font-semibold text-muted-foreground">{label}</div>
                <div className="text-2xl font-extrabold tabular">{value}</div>
              </div>
            </Card>
          ))}
        </div>

        <div className="lg:col-span-3">
          <Table>
            <THead>
              <tr>
                <TH>Employee</TH>
                <TH>Department</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <TBody>
              {(
                [
                  ['AS', 'Ananya Sharma', 'Engineering', 'success', 'Active'],
                  ['RK', 'Ravi Kumar', 'Operations', 'accent', 'Onboarding'],
                  ['PM', 'Priya Menon', 'Finance', 'warning', 'On notice'],
                ] as const
              ).map(([i, n, d, tone, s]) => (
                <TR key={n}>
                  <TD>
                    <div className="flex items-center gap-3 font-bold">
                      <Avatar size="sm" initials={i} />
                      {n}
                    </div>
                  </TD>
                  <TD>{d}</TD>
                  <TD>
                    <Badge tone={tone}>{s}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </main>
  );
}
