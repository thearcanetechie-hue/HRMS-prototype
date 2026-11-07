'use client';

import { Loader2, RotateCcw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Banner, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { POLICY_SECTIONS, type PolicyField } from '@/lib/policy-fields';

type Json = Record<string, unknown>;

const getAt = (o: Json, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Json)[k] : undefined), o);

function setAt(o: Json, path: string, value: unknown): Json {
  const [head, ...rest] = path.split('.') as [string, ...string[]];
  if (!rest.length) return { ...o, [head]: value };
  return { ...o, [head]: setAt((o[head] as Json) ?? {}, rest.join('.'), value) };
}

export default function PoliciesPage() {
  const { can } = useSession();
  const sections = POLICY_SECTIONS.filter((s) => can(s.permission));
  const [key, setKey] = useState(sections[0]?.key ?? 'attendance');
  const [saved, setSaved] = useState<Json | null>(null);
  const [draft, setDraft] = useState<Json | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const section = sections.find((s) => s.key === key);

  useEffect(() => {
    setSaved(null);
    setDraft(null);
    api<Json>(`/policies/${key}`)
      .then((p) => {
        setSaved(p);
        setDraft(p);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load the policy'),
      );
  }, [key]);

  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<Json>(`/policies/${key}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      setSaved(next);
      setDraft(next);
      showToast('Policy saved. It applies from now on.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  if (!sections.length)
    return (
      <>
        <PageHeader eyebrow="Settings" title="Policies" />
        <Banner>Only HR and payroll admins can change company policies.</Banner>
      </>
    );

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Policies"
        description="How attendance, leave and payroll work at your company. Defaults follow common Indian practice; change what differs for you."
        actions={
          <>
            <Button disabled={!dirty || busy} onClick={() => setDraft(saved)}>
              <RotateCcw /> Undo changes
            </Button>
            <Button variant="primary" disabled={!dirty || busy} onClick={save}>
              {busy ? <Loader2 className="animate-spin" /> : <Save />} Save policy
            </Button>
          </>
        }
      />
      {error && <Banner>{error}</Banner>}
      <Tabs value={key} onValueChange={(v) => setKey(v as typeof key)} className="mb-5">
        <TabsList>
          {sections.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.title}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!draft || !section ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {section.groups.map((g) => (
            <Card key={g.title} className="content-start">
              <CardHeader>
                <div>
                  <CardTitle>{g.title}</CardTitle>
                  {g.description && <CardDescription>{g.description}</CardDescription>}
                </div>
              </CardHeader>
              <ul className="grid gap-4">
                {g.fields.map((f) => (
                  <li
                    key={f.path}
                    className="grid gap-1.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"
                  >
                    <div>
                      <label htmlFor={`p-${f.path}`} className="font-semibold">
                        {f.label}
                      </label>
                      {f.help && <p className="text-[13px] text-muted-foreground">{f.help}</p>}
                    </div>
                    <FieldInput
                      field={f}
                      value={getAt(draft, f.path)}
                      onChange={(v) => setDraft(setAt(draft, f.path, v))}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
      <Toast message={toast} />
    </>
  );
}

function FieldInput({
  field: f,
  value,
  onChange,
}: {
  field: PolicyField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `p-${f.path}`;
  if (f.type === 'toggle')
    return <Switch id={id} checked={Boolean(value)} onCheckedChange={onChange} />;
  if (f.type === 'select')
    return (
      <Select
        id={id}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className="sm:w-56"
      >
        {f.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </Select>
    );
  if (f.type === 'list')
    return (
      <Input
        id={id}
        value={Array.isArray(value) ? value.join(', ') : ''}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((x) => x.trim())
              .filter(Boolean),
          )
        }
        className="sm:w-56"
      />
    );
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="number"
        min={f.min}
        max={f.max}
        step={f.step ?? 1}
        value={
          value === null || value === undefined
            ? ''
            : String(f.percent ? Number(value) * 100 : value)
        }
        onChange={(e) => {
          const n = e.target.value === '' ? (f.nullable ? null : 0) : Number(e.target.value);
          onChange(n === null ? null : f.percent ? Math.round(n * 1000) / 100000 : n);
        }}
        className="w-28"
      />
      {f.unit && <span className="text-[13px] text-muted-foreground">{f.unit}</span>}
    </div>
  );
}
