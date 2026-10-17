'use client';

import {
  Database,
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash2,
  Upload,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { OnboardingLayout } from '@/components/onboarding-layout';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { FileDrop, ToggleRow } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { IconTile } from '@/components/ui/page';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import {
  buildPreview,
  guessColumns,
  importRows,
  parseCsv,
  rowProblem,
  TARGETS,
  type ImportColumn,
  type ImportRow,
  type Target,
} from '@/lib/import';
import { clearOnboarding, loadOnboarding, saveOnboarding, sizeHint } from '@/lib/onboarding';
import { RequireSession } from '@/lib/session';
import { cn } from '@/lib/utils';

type Method = 'upload' | 'manual' | 'database';

const METHODS: [Method, LucideIcon, string, string][] = [
  ['upload', Upload, 'Upload a spreadsheet', 'Excel or CSV. We map the columns for you.'],
  ['manual', UserPlus, 'Add people manually', 'Type in a few people and invite them.'],
  ['database', Database, 'Connect your database', 'Sync from your HR or payroll database.'],
];

const STATUS: Record<ImportColumn['status'], [string, BadgeTone]> = {
  matched: ['Matched', 'success'],
  check: ['Check unit', 'warning'],
  unmapped: ['Not imported', 'neutral'],
};

const TEMPLATE =
  'Emp Name,Mail ID,Dept,Designation,DOJ,Mobile\nMeera Iyer,meera@acme.in,People,HR Manager,01/04/2024,+91 98450 12345\n';

export default function OnboardingTeamPage() {
  return (
    <RequireSession>
      <TeamStep />
    </RequireSession>
  );
}

function TeamStep() {
  const router = useRouter();
  const [method, setMethod] = useState<Method>('upload');
  const [count, setCount] = useState<number | undefined>();

  useEffect(() => {
    const saved = loadOnboarding();
    setCount(sizeHint(saved.company?.size));
    saveOnboarding({ step: 3 });
  }, []);

  const finish = () => {
    clearOnboarding();
    router.replace('/dashboard');
  };

  return (
    <OnboardingLayout
      step={3}
      title="Bring your team in"
      description={`Pick how you want to add your${count ? ` ${count}` : ''} employees. You can mix methods later.`}
      onSaveAndExit={() => router.push('/dashboard')}
    >
      <div role="radiogroup" aria-label="How to add people" className="grid gap-4 md:grid-cols-3">
        {METHODS.map(([m, Icon, title, caption]) => {
          const on = method === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMethod(m)}
              className={cn(
                'relative grid cursor-pointer gap-3 rounded-[18px] p-5 text-left transition-all',
                on ? 'bg-surface shadow-raised' : 'bg-surface-2 hover:shadow-raised-sm',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-4 right-4 grid size-5 place-items-center rounded-full',
                  on ? 'bg-primary' : 'bg-surface shadow-inset-sm',
                )}
              >
                {on && <span className="size-2 rounded-full bg-primary-foreground" />}
              </span>
              <IconTile tone={on ? 'primary' : undefined} size={40}>
                <Icon />
              </IconTile>
              <div>
                <div className="font-bold">{title}</div>
                <div className="text-[13px] text-muted-foreground">{caption}</div>
              </div>
            </button>
          );
        })}
      </div>

      {method === 'upload' && <UploadPath onDone={finish} />}
      {method === 'manual' && <ManualPath onDone={finish} />}
      {method === 'database' && <DatabasePath />}
    </OnboardingLayout>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/dashboard" className="font-bold">
        Skip for now
      </Link>
      {children}
    </div>
  );
}

function UploadPath({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<{ name: string; data: string[][]; header: string[] } | null>(
    null,
  );
  const [columns, setColumns] = useState<ImportColumn[]>([]);
  const [invite, setInvite] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const built = useMemo(
    () => (file ? buildPreview(file.name, file.data, columns) : null),
    [file, columns],
  );

  async function pick(f: File) {
    setError('');
    if (!/\.csv$/i.test(f.name)) {
      setError('For now, save the sheet as CSV (File › Save as › CSV) and upload that.');
      return;
    }
    if (f.size > 20 * 1024 * 1024) return setError('That file is over 20 MB.');
    const rows = parseCsv(await f.text());
    if (rows.length < 2) return setError('That file has no rows under the header.');
    const [header, ...data] = rows;
    setFile({ name: f.name, header, data });
    setColumns(guessColumns(header, data[0]));
  }

  function remap(i: number, target: Target) {
    setColumns((cols) =>
      cols.map((c, j) =>
        j === i ? { ...c, target, status: target === 'skip' ? 'unmapped' : 'matched' } : c,
      ),
    );
  }

  async function run() {
    if (!built) return;
    setError('');
    setProgress(0);
    try {
      const { failed } = await importRows(built.rows, { invite, onProgress: setProgress });
      if (failed.length) {
        setError(`${failed.length} rows could not be added: ${failed[0].reason}`);
        setProgress(null);
      } else onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
      setProgress(null);
    }
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

  return (
    <div className="grid gap-5">
      {!file ? (
        <FileDrop
          title="Drop your file here, or browse"
          accept=".csv,.xlsx,.xls"
          onFile={pick}
          caption={
            <>
              .xlsx, .xls or .csv up to 20 MB ·{' '}
              <a
                href={templateHref}
                download="hrms-employees-template.csv"
                onClick={(e) => e.stopPropagation()}
              >
                Download our template
              </a>
            </>
          }
        />
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-4 shadow-raised-sm">
          <IconTile tone="success">
            <FileSpreadsheet />
          </IconTile>
          <div className="min-w-0 grow">
            <div className="truncate font-bold">{file.name}</div>
            <div className="text-[13px] text-muted-foreground">
              {built?.preview.rows} rows found · {built?.preview.ready} ready ·{' '}
              {built?.preview.needsAttention} need attention
            </div>
          </div>
          {!!built?.preview.needsAttention && (
            <Badge tone="warning">{built.preview.needsAttention} to fix</Badge>
          )}
          <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
            Replace
          </Button>
        </div>
      )}

      {file && (
        <div className="grid gap-3">
          <h3 className="font-bold">Column mapping</h3>
          <Table>
            <THead>
              <TR>
                <TH>Column in your file</TH>
                <TH>Maps to</TH>
                <TH>Sample</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {columns.map((c, i) => (
                <TR key={c.source + i}>
                  <TD className="font-semibold">{c.source}</TD>
                  <TD className="min-w-48">
                    <Select
                      aria-label={`Map ${c.source} to`}
                      value={c.target}
                      onChange={(e) => remap(i, e.target.value as Target)}
                      className="h-9"
                    >
                      {Object.entries(TARGETS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </TD>
                  <TD className="font-mono text-[13px] text-muted-foreground">{c.sample}</TD>
                  <TD>
                    <Badge tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {built && built.preview.needsAttention > 0 && (
            <p className="text-[13px] text-muted-foreground">
              Rows to fix:{' '}
              {built.rows
                .map((r, i) => [i + 2, rowProblem(r)] as const)
                .filter(([, p]) => p)
                .slice(0, 3)
                .map(([line, p]) => `line ${line} (${p})`)
                .join(', ')}
              . They are skipped; fix them in the file and import again.
            </p>
          )}
        </div>
      )}

      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Database className="size-4 shrink-0" />
        Prefer a live sync? Connect PostgreSQL, MySQL, SQL Server, or Zoho People, Keka, greytHR and
        Darwinbox.
      </p>
      <ToggleRow
        title="Email everyone an invite to set up their profile once the import finishes"
        checked={invite}
        onCheckedChange={setInvite}
      />
      <FormError>{error}</FormError>
      <Footer>
        <Button
          variant="primary"
          size="lg"
          disabled={!built?.preview.ready || progress !== null}
          onClick={run}
        >
          {progress !== null && <Loader2 className="animate-spin" />}
          {progress !== null
            ? `Importing ${progress} of ${built?.preview.ready}…`
            : `Import ${built?.preview.ready ?? ''} employees`}
        </Button>
      </Footer>
    </div>
  );
}

type Person = { fullName: string; workEmail: string; department: string; designation: string };
const blank = (): Person => ({ fullName: '', workEmail: '', department: '', designation: '' });

function ManualPath({ onDone }: { onDone: () => void }) {
  const [people, setPeople] = useState<Person[]>([blank(), blank()]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const filled = people.filter((p) => p.fullName || p.workEmail);

  const set = (i: number, k: keyof Person, v: string) =>
    setPeople((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function run() {
    const bad = filled.map((p) => rowProblem(p as ImportRow)).find(Boolean);
    if (bad) return setError(bad);
    setError('');
    setBusy(true);
    const { failed } = await importRows(filled as ImportRow[], { invite: true }).catch((e) => ({
      failed: [{ reason: e instanceof Error ? e.message : 'Failed' }],
    }));
    if (failed.length) {
      setError(`${failed.length} could not be added: ${failed[0].reason}`);
      setBusy(false);
    } else onDone();
  }

  return (
    <div className="grid gap-4">
      {people.map((p, i) => (
        <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          {(
            [
              ['fullName', 'Full name', 'Ravi Kumar'],
              ['workEmail', 'Work email', 'ravi@acme.in'],
              ['department', 'Department', 'Engineering'],
              ['designation', 'Designation', 'Developer'],
            ] as const
          ).map(([k, label, ph]) => (
            <Field key={k} id={`${k}-${i}`} label={label}>
              <Input
                id={`${k}-${i}`}
                value={p[k]}
                placeholder={ph}
                type={k === 'workEmail' ? 'email' : 'text'}
                onChange={(e) => set(i, k, e.target.value)}
              />
            </Field>
          ))}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove row ${i + 1}`}
            disabled={people.length === 1}
            onClick={() => setPeople((ps) => ps.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <div>
        <Button size="sm" onClick={() => setPeople((ps) => [...ps, blank()])}>
          <Plus /> Add another person
        </Button>
      </div>
      <FormError>{error}</FormError>
      <Footer>
        <Button variant="primary" size="lg" disabled={!filled.length || busy} onClick={run}>
          {busy && <Loader2 className="animate-spin" />}
          Invite {filled.length || ''} {filled.length === 1 ? 'person' : 'people'}
        </Button>
      </Footer>
    </div>
  );
}

function DatabasePath() {
  return (
    <div className="grid gap-4">
      <Badge tone="info" className="justify-self-start">
        Coming soon
      </Badge>
      <fieldset disabled className="grid gap-4 opacity-80 sm:grid-cols-2">
        <Field id="dbType" label="Type">
          <Select id="dbType">
            {[
              'PostgreSQL',
              'MySQL',
              'SQL Server',
              'Zoho People',
              'Keka',
              'greytHR',
              'Darwinbox',
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field id="dbHost" label="Host">
          <Input id="dbHost" placeholder="db.acme.in" />
        </Field>
        <Field id="dbPort" label="Port">
          <Input id="dbPort" placeholder="5432" />
        </Field>
        <Field id="dbName" label="Database">
          <Input id="dbName" placeholder="hr" />
        </Field>
        <Field id="dbUser" label="Username">
          <Input id="dbUser" />
        </Field>
        <Field id="dbPass" label="Password">
          <Input id="dbPass" type="password" />
        </Field>
      </fieldset>
      <Footer>
        <Button disabled title="Coming soon">
          Test connection
        </Button>
      </Footer>
    </div>
  );
}
