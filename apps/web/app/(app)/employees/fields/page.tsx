'use client';

import { CUSTOM_FIELD_TYPES, type CustomFieldType } from '@hrms/shared';
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { type FieldDef, TYPE_NAME } from '@/components/custom-fields';
import { Badge } from '@/components/ui/badge';
import { Toast, ToggleRow, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { Empty, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';

const VISIBILITY_NAME: Record<FieldDef['visibility'], string> = {
  HR_ONLY: 'HR only',
  MANAGERS: 'HR, the person and their managers',
  EVERYONE: 'Everyone',
};
type Draft = Omit<FieldDef, 'id' | 'key' | 'archived'> & { id?: string };
const blank = (): Draft => ({
  label: '',
  type: 'TEXT',
  options: [],
  required: false,
  helpText: '',
  section: 'Other details',
  visibility: 'MANAGERS',
  selfEditable: false,
  order: 0,
});

/** HR's list of extra employee fields: add, change, archive and restore. */
export default function CustomFieldsPage() {
  const { can } = useSession();
  const [fields, setFields] = useState<FieldDef[] | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setFields(await api<FieldDef[]>('/custom-fields?archived=true'));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggleArchive(f: FieldDef) {
    try {
      await api(
        `/custom-fields/${f.id}`,
        f.archived
          ? { method: 'PATCH', body: JSON.stringify({ archived: false }) }
          : { method: 'DELETE' },
      );
      showToast(f.archived ? `${f.label} is back` : `${f.label} is hidden; its values are kept`);
      await load();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  if (!can('employee.manage'))
    return (
      <Card>
        <Empty>Only HR can change employee fields.</Empty>
      </Card>
    );

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/employees" className="hover:underline">
            Employees
          </Link>
        }
        title="Custom fields"
        description="Extra details your company keeps for each person. They show under More details on every profile."
        actions={
          <Button variant="primary" onClick={() => setEditing(blank())}>
            <Plus /> Add field
          </Button>
        }
      />
      <Card>
        {!fields ? (
          <Skeleton className="h-48 rounded-2xl" />
        ) : fields.length ? (
          <Table bare>
            <THead>
              <tr>
                <TH>Field</TH>
                <TH>Type</TH>
                <TH>Section</TH>
                <TH>Who sees it</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {fields.map((f) => (
                <TR key={f.id} className={f.archived ? 'opacity-60' : undefined}>
                  <TD>
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {f.label}
                      {f.required && <Badge tone="warning">Required</Badge>}
                      {f.selfEditable && <Badge tone="info">Person can edit</Badge>}
                      {f.archived && <Badge>Hidden</Badge>}
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{f.key}</div>
                  </TD>
                  <TD>
                    {TYPE_NAME[f.type]}
                    {f.options.length > 0 && (
                      <div className="text-xs text-muted-foreground">{f.options.join(', ')}</div>
                    )}
                  </TD>
                  <TD>{f.section}</TD>
                  <TD>{VISIBILITY_NAME[f.visibility]}</TD>
                  <TD className="text-right whitespace-nowrap">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Edit ${f.label}`}
                      onClick={() => setEditing({ ...f })}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={f.archived ? `Restore ${f.label}` : `Hide ${f.label}`}
                      onClick={() => void toggleArchive(f)}
                    >
                      {f.archived ? <ArchiveRestore /> : <Archive />}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <Empty>
            No custom fields yet. Add things like blood group, T-shirt size or a laptop serial.
          </Empty>
        )}
      </Card>
      <FieldDialog
        draft={editing}
        onClose={() => setEditing(null)}
        onSaved={(label) => {
          setEditing(null);
          showToast(`Saved ${label}`);
          void load();
        }}
      />
      <Toast message={toast} />
    </>
  );
}

function FieldDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft | null;
  onClose: () => void;
  onSaved: (label: string) => void;
}) {
  const [f, setF] = useState<Draft>(blank());
  const [choices, setChoices] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!draft) return;
    setF(draft);
    setChoices(draft.options.join('\n'));
    setErrors({});
    setError('');
  }, [draft]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((x) => ({ ...x, [k]: v }));
  const choice = f.type === 'SELECT' || f.type === 'MULTI_SELECT';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setError('');
    const options = choice
      ? choices
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
    const { id, type, ...rest } = f;
    try {
      await api(id ? `/custom-fields/${id}` : '/custom-fields', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(id ? { ...rest, options } : { ...rest, type, options }),
      });
      onSaved(f.label);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
        setErrors(
          Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])),
        );
      else setError(err instanceof ApiError ? err.message : 'Could not save');
    }
  }

  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !o && onClose()}>
      {draft && (
        <DialogContent side="right" title={f.id ? `Edit ${draft.label}` : 'Add a field'}>
          <form onSubmit={submit} className="grid gap-4">
            <Field id="f-label" label="Name" error={errors.label}>
              <Input
                id="f-label"
                value={f.label}
                onChange={(e) => set('label', e.target.value)}
                placeholder="Blood group"
                required
              />
            </Field>
            <Field id="f-type" label="Type">
              <Select
                id="f-type"
                value={f.type}
                disabled={Boolean(f.id)}
                onChange={(e) => set('type', e.target.value as CustomFieldType)}
              >
                {CUSTOM_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_NAME[t]}
                  </option>
                ))}
              </Select>
            </Field>
            {choice && (
              <Field id="f-options" label="Choices, one per line" error={errors.options}>
                <textarea
                  id="f-options"
                  rows={4}
                  value={choices}
                  onChange={(e) => setChoices(e.target.value)}
                  className="rounded-xl bg-surface-2 p-3 text-sm shadow-inset-sm outline-none"
                />
              </Field>
            )}
            <Field id="f-section" label="Section on the profile">
              <Input
                id="f-section"
                value={f.section}
                onChange={(e) => set('section', e.target.value)}
              />
            </Field>
            <Field id="f-help" label="Help text (optional)">
              <Input
                id="f-help"
                value={f.helpText}
                onChange={(e) => set('helpText', e.target.value)}
              />
            </Field>
            <Field id="f-vis" label="Who can see it">
              <Select
                id="f-vis"
                value={f.visibility}
                onChange={(e) => set('visibility', e.target.value as Draft['visibility'])}
              >
                {Object.entries(VISIBILITY_NAME).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <ToggleRow
              title="Required"
              caption="Must be filled in when the details are saved"
              checked={f.required}
              onCheckedChange={(v) => set('required', v)}
            />
            <ToggleRow
              title="The person can fill it in"
              caption="Shown as editable on their own profile"
              checked={f.selfEditable}
              onCheckedChange={(v) => set('selfEditable', v)}
            />
            <FormError>{error}</FormError>
            <div className="flex gap-3">
              <Button variant="primary" type="submit">
                Save field
              </Button>
              <DialogClose asChild>
                <Button type="button">Cancel</Button>
              </DialogClose>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
