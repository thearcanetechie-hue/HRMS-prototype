'use client';

import type { CustomFieldType } from '@hrms/shared';
import { Pencil, Save } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';

export interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  helpText: string;
  section: string;
  visibility: 'HR_ONLY' | 'MANAGERS' | 'EVERYONE';
  selfEditable: boolean;
  order: number;
  archived: boolean;
}
type Values = Record<string, unknown>;

export const TYPE_NAME: Record<CustomFieldType, string> = {
  TEXT: 'Short text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  DATE: 'Date',
  SELECT: 'Pick one',
  MULTI_SELECT: 'Pick several',
  BOOLEAN: 'Yes or no',
  EMAIL: 'Email',
  PHONE: 'Phone',
  URL: 'Web link',
};

function show(def: FieldDef, v: unknown) {
  if (v === undefined || v === null || v === '') return '–';
  if (def.type === 'BOOLEAN') return v ? 'Yes' : 'No';
  if (def.type === 'DATE') return formatDate(String(v));
  if (Array.isArray(v)) return v.join(', ') || '–';
  return String(v);
}

/**
 * The workspace's extra fields on a person's profile, grouped by section. HR edits all of them;
 * the person edits the ones marked self-editable. Fields the viewer can't see never arrive.
 */
export function CustomFieldsCard({
  employeeId,
  values,
  canEdit,
  self,
}: {
  employeeId: string;
  values: Values;
  canEdit: boolean;
  self: boolean;
}) {
  const [defs, setDefs] = useState<FieldDef[] | null>(null);
  const [saved, setSaved] = useState<Values>(values);
  const [draft, setDraft] = useState<Values>(values);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<FieldDef[]>('/custom-fields')
      .then(setDefs)
      .catch(() => setDefs([]));
  }, []);
  useEffect(() => {
    setSaved(values);
    setDraft(values);
  }, [values]);

  if (!defs || !defs.length) return null;
  const editable = (d: FieldDef) => canEdit && (!self || d.selfEditable);
  const sections = [...new Set(defs.map((d) => d.section))];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setError('');
    const changed = Object.fromEntries(
      defs!.filter(editable).map((d) => [d.key, draft[d.key] ?? null]),
    );
    try {
      const r = await api<{ customFields: Values }>(`/employees/${employeeId}/custom-fields`, {
        method: 'PUT',
        body: JSON.stringify({ values: changed }),
      });
      setSaved(r.customFields);
      setDraft(r.customFields);
      setEditing(false);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
        setErrors(
          Object.fromEntries(
            Object.entries(err.fieldErrors).map(([k, v]) => [
              k.replace(/^customFields\./, ''),
              v[0] ?? '',
            ]),
          ),
        );
      else setError(err instanceof ApiError ? err.message : 'Could not save');
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>More details</CardTitle>
          <CardDescription>Fields your company added</CardDescription>
        </div>
        {defs.some(editable) && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        )}
      </CardHeader>
      <form onSubmit={submit} className="grid gap-5">
        {sections.map((s) => (
          <section key={s} className="grid gap-3">
            {sections.length > 1 && (
              <h4 className="text-xs font-bold tracking-[0.1em] text-detail uppercase">{s}</h4>
            )}
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {defs
                .filter((d) => d.section === s)
                .map((d) =>
                  editing && editable(d) ? (
                    <FieldInput
                      key={d.key}
                      def={d}
                      value={draft[d.key]}
                      error={errors[d.key]}
                      onChange={(v) => setDraft((x) => ({ ...x, [d.key]: v }))}
                    />
                  ) : (
                    <div key={d.key}>
                      <dt className="text-xs text-muted-foreground">{d.label}</dt>
                      <dd className="font-semibold break-words">{show(d, saved[d.key])}</dd>
                    </div>
                  ),
                )}
            </dl>
          </section>
        ))}
        <FormError>{error}</FormError>
        {editing && (
          <div className="flex gap-3">
            <Button variant="primary" type="submit" disabled={busy}>
              <Save /> Save
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDraft(saved);
                setErrors({});
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function FieldInput({
  def,
  value,
  error,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const id = `cf-${def.key}`;
  const label = `${def.label}${def.required ? ' *' : ''}`;
  let input;
  switch (def.type) {
    case 'LONG_TEXT':
      input = (
        <textarea
          id={id}
          rows={3}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-xl bg-surface-2 p-3 text-sm shadow-inset-sm outline-none"
        />
      );
      break;
    case 'SELECT':
      input = (
        <Select
          id={id}
          value={value == null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || null)}
        >
          <option value="">–</option>
          {def.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      );
      break;
    case 'MULTI_SELECT': {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      input = (
        <div className="grid gap-1.5">
          {def.options.map((o) => (
            <Checkbox
              key={o}
              label={o}
              checked={picked.includes(o)}
              onChange={(e) =>
                onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))
              }
            />
          ))}
        </div>
      );
      break;
    }
    case 'BOOLEAN':
      input = (
        <Select
          id={id}
          value={value === true ? 'yes' : value === false ? 'no' : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'yes')}
        >
          <option value="">–</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      );
      break;
    default:
      input = (
        <Input
          id={id}
          type={
            { NUMBER: 'number', DATE: 'date', EMAIL: 'email', PHONE: 'tel', URL: 'url' }[
              def.type as string
            ] ?? 'text'
          }
          step="any"
          value={value == null ? '' : String(value)}
          onChange={(e) =>
            onChange(
              def.type === 'NUMBER' && e.target.value !== ''
                ? Number(e.target.value)
                : e.target.value,
            )
          }
        />
      );
  }
  return (
    <div className="sm:col-span-1">
      <Field id={id} label={label} error={error}>
        {input}
      </Field>
      {def.helpText && <p className="mt-1 text-xs text-muted-foreground">{def.helpText}</p>}
    </div>
  );
}
