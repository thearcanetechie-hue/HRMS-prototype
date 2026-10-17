'use client';

import { DOCUMENT_CATEGORIES } from '@hrms/shared';
import {
  ArrowLeft,
  Camera,
  Download,
  FileText,
  Loader2,
  ScanLine,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from './ui/badge';
import { FileDrop } from './ui/bits';
import { Button } from './ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogClose, DialogContent } from './ui/dialog';
import { IconTile } from './ui/page';
import { Skeleton } from './ui/progress';
import { Field, FormError, Select } from './ui/input';
import {
  api,
  apiBlob,
  ApiError,
  uploadDocument,
  type DocumentFolders,
  type DocumentItem,
  type DocumentStatus,
  type Employee,
  type Paged,
} from '@/lib/api';
import { fileSize, formatDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { imagesToPdf, mergePdfs, normaliseImage } from '@/lib/pdf';

export const DOC_STATUS: Record<DocumentStatus, [string, BadgeTone]> = {
  PROCESSING: ['Processing', 'accent'],
  NEEDS_REVIEW: ['Needs review', 'warning'],
  VERIFIED: ['Verified', 'success'],
  SIGNED: ['Signed', 'success'],
  ISSUED: ['Issued', 'info'],
  REJECTED: ['Rejected', 'danger'],
};

export function DocStatus({ status }: { status: DocumentStatus }) {
  const [label, tone] = DOC_STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

/** Saves a document to the person's device. */
export async function downloadDocument(doc: Pick<DocumentItem, 'id' | 'name'>) {
  const blob = await apiBlob(`/documents/${doc.id}/file`);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: doc.name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Where a new file goes: one employee's files, or a company folder (`f:<id>`). */
export type Target = { employeeId?: string; folderId?: string };

type Option = { value: string; label: string };

/** Employees and folders the caller may upload to. HR sees everyone; others only themselves. */
function useTargets(info: DocumentFolders | null, fixed?: Target) {
  const [options, setOptions] = useState<{ people: Option[]; folders: Option[] }>({
    people: [],
    folders: [],
  });
  useEffect(() => {
    if (!info || fixed) return;
    const folders = info.canManage
      ? info.folders.map((f) => ({ value: `f:${f.id}`, label: f.name }))
      : [];
    if (info.canManage) {
      api<Paged<Employee>>('/employees?pageSize=100')
        .then((r) =>
          setOptions({
            folders,
            people: r.items.map((e) => ({
              value: e.id,
              label: `${e.firstName} ${e.lastName} · ${e.employeeCode}`.replace('  ', ' '),
            })),
          }),
        )
        .catch(() => setOptions({ folders, people: [] }));
    } else if (info.selfEmployeeId) {
      setOptions({ folders, people: [{ value: info.selfEmployeeId, label: 'My files' }] });
    }
  }, [info, fixed]);
  return options;
}

const toTarget = (value: string): Target =>
  value.startsWith('f:') ? { folderId: value.slice(2) } : { employeeId: value };

function TargetFields({
  info,
  fixed,
  target,
  setTarget,
  category,
  setCategory,
  idPrefix,
}: {
  info: DocumentFolders | null;
  fixed?: Target;
  target: string;
  setTarget: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  idPrefix: string;
}) {
  const { people, folders } = useTargets(info, fixed);
  useEffect(() => {
    if (!target && (people[0] || folders[0])) setTarget((people[0] ?? folders[0])!.value);
  }, [people, folders, target, setTarget]);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {!fixed && (
        <Field id={`${idPrefix}-target`} label="Save to">
          <Select
            id={`${idPrefix}-target`}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {people.length > 0 && (
              <optgroup label="Employee files">
                {people.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            )}
            {folders.length > 0 && (
              <optgroup label="Company folders">
                {folders.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </Field>
      )}
      <Field id={`${idPrefix}-category`} label="Document type">
        <Select
          id={`${idPrefix}-category`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

const guessCategory = (name: string) =>
  DOCUMENT_CATEGORIES.find((c) => name.toLowerCase().includes(c.split(' ')[0]!.toLowerCase())) ??
  'Other';

/** Upload one or more files (screen 14, "Upload softcopies"). */
export function UploadDialog({
  info,
  fixed,
  onUploaded,
}: {
  info: DocumentFolders | null;
  fixed?: Target;
  onUploaded: (docs: DocumentItem[]) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState('');
  const [category, setCategory] = useState('Other');
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload() {
    setBusy(true);
    setError('');
    const done: DocumentItem[] = [];
    for (const f of files) {
      try {
        done.push(
          await uploadDocument(
            f,
            f.name,
            fixed ?? toTarget(target),
            files.length > 1 ? guessCategory(f.name) : category,
          ),
        );
        setProgress((p) => [...p, f.name]);
      } catch (err) {
        setError(`${f.name}: ${err instanceof ApiError ? err.message : 'Upload failed'}`);
      }
    }
    setBusy(false);
    if (done.length) onUploaded(done);
  }

  return (
    <DialogContent title="Upload files" side="right" aria-describedby={undefined}>
      <div className="grid gap-5">
        <FileDrop
          title="Drop files here, or browse"
          caption="PDF, Word, Excel, CSV or photos · up to 20 MB each"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv"
          onFile={(f) => {
            setFiles((xs) => [...xs, f]);
            if (!files.length) setCategory(guessCategory(f.name));
          }}
        />
        {files.length > 0 && (
          <ul className="grid gap-2">
            {files.map((f, i) => (
              <li
                key={f.name + i}
                className="flex items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5"
              >
                <span className="grow truncate font-semibold">{f.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{fileSize(f.size)}</span>
                {progress.includes(f.name) ? (
                  <Badge tone="success">Uploaded</Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${f.name}`}
                    disabled={busy}
                    onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <TargetFields
          info={info}
          fixed={fixed}
          target={target}
          setTarget={setTarget}
          category={category}
          setCategory={setCategory}
          idPrefix="up"
        />
        {files.length > 1 && (
          <p className="text-[13px] text-muted-foreground">
            With several files, each one’s type is guessed from its name.
          </p>
        )}
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" disabled={!files.length || busy} onClick={upload}>
            {busy && <Loader2 className="animate-spin" />}
            Upload {files.length || ''}
          </Button>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );
}

/** Photograph or pick pages, then save them as one searchable-later PDF (screen 14, scan flow). */
export function ScanDialog({
  info,
  fixed,
  onUploaded,
}: {
  info: DocumentFolders | null;
  fixed?: Target;
  onUploaded: (docs: DocumentItem[]) => void;
}) {
  const [pages, setPages] = useState<{ file: File; url: string }[]>([]);
  const [target, setTarget] = useState('');
  const [category, setCategory] = useState('Aadhaar card');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  function add(list: FileList | null) {
    if (!list) return;
    const added = [...list]
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => {
        const url = URL.createObjectURL(file);
        urls.current.push(url);
        return { file, url };
      });
    setPages((ps) => [...ps, ...added]);
  }

  function moveEarlier(i: number) {
    setPages((ps) => {
      const n = [...ps];
      [n[i - 1], n[i]] = [n[i]!, n[i - 1]!];
      return n;
    });
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const images = await Promise.all(pages.map((p) => normaliseImage(p.file)));
      const pdf = await imagesToPdf(images);
      const doc = await uploadDocument(pdf, `${category}.pdf`, fixed ?? toTarget(target), category);
      onUploaded([doc]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not build the PDF from these pages.');
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title="Scan a document"
      side="right"
      aria-describedby={undefined}
      className="max-sm:max-w-none max-sm:rounded-none"
    >
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => camera.current?.click()}>
            <Camera /> Use camera
          </Button>
          <Button onClick={() => picker.current?.click()}>
            <ScanLine /> Pick scanned pages
          </Button>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => add(e.target.files)}
          />
          <input
            ref={picker}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="sr-only"
            onChange={(e) => add(e.target.files)}
          />
        </div>
        {pages.length > 0 ? (
          <ol className="grid grid-cols-3 gap-3">
            {pages.map((p, i) => (
              <li key={p.url} className="grid gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={`Page ${i + 1}`}
                  className="aspect-[3/4] w-full rounded-lg bg-surface-2 object-cover shadow-raised-sm"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  Page {i + 1}
                  <span className="flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Move page ${i + 1} earlier`}
                      disabled={i === 0}
                      onClick={() => moveEarlier(i)}
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete page ${i + 1}`}
                      onClick={() => setPages((ps) => ps.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl bg-surface-2 p-6 text-center text-[13px] text-muted-foreground shadow-inset-sm">
            Take a photo of each page, or pick images from your scanner. They are joined into one
            PDF in the order shown.
          </p>
        )}
        <TargetFields
          info={info}
          fixed={fixed}
          target={target}
          setTarget={setTarget}
          category={category}
          setCategory={setCategory}
          idPrefix="scan"
        />
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" disabled={!pages.length || busy} onClick={save}>
            {busy && <Loader2 className="animate-spin" />}
            Save as PDF
          </Button>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );
}

const CONVERT_ACTIONS = [
  ['images', 'Join images into one PDF'],
  ['merge', 'Merge PDFs into one'],
] as const;
const LATER = ['Word to PDF', 'Split pages', 'Compress', 'Add letterhead'];

/** Converter (screen 14): runs in the browser on files already stored, saves the result. */
export function ConvertDialog({
  docs,
  onUploaded,
}: {
  docs: DocumentItem[];
  onUploaded: (docs: DocumentItem[]) => void;
}) {
  const [action, setAction] = useState<(typeof CONVERT_ACTIONS)[number][0]>('images');
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const eligible = docs.filter((d) =>
    action === 'images'
      ? d.mimeType === 'image/jpeg' || d.mimeType === 'image/png'
      : d.mimeType === 'application/pdf',
  );
  const chosen = picked
    .map((id) => eligible.find((d) => d.id === id))
    .filter(Boolean) as DocumentItem[];
  const owners = new Set(chosen.map((d) => d.employeeId ?? `f:${d.folderId}`));

  async function run() {
    const first = chosen[0];
    if (!first) return;
    setBusy(true);
    setError('');
    try {
      const blobs = await Promise.all(chosen.map((d) => apiBlob(`/documents/${d.id}/file`)));
      const pdf =
        action === 'images'
          ? await imagesToPdf(blobs.map((b, i) => new File([b], chosen[i]!.name, { type: b.type })))
          : await mergePdfs(blobs);
      const fileName =
        (name.trim() || `${first.category} combined`).replace(/\.pdf$/i, '') + '.pdf';
      const target = first.employeeId
        ? { employeeId: first.employeeId }
        : { folderId: first.folderId ?? undefined };
      onUploaded([await uploadDocument(pdf, fileName, target, first.category)]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not combine these files.');
      setBusy(false);
    }
  }

  return (
    <DialogContent title="Convert and tidy" side="right" aria-describedby={undefined}>
      <div className="grid gap-5">
        <Field id="conv-action" label="What to do">
          <Select
            id="conv-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as typeof action);
              setPicked([]);
            }}
          >
            {CONVERT_ACTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-[13px] text-muted-foreground">Coming later: {LATER.join(', ')}.</p>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">
            Pick files in the order you want them
          </legend>
          {eligible.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              No {action === 'images' ? 'JPG or PNG images' : 'PDFs'} in this view.
            </p>
          )}
          {eligible.map((d) => {
            const at = picked.indexOf(d.id);
            return (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={at >= 0}
                  onChange={() =>
                    setPicked((p) => (at >= 0 ? p.filter((x) => x !== d.id) : [...p, d.id]))
                  }
                />
                <span className="grow truncate font-semibold">{d.name}</span>
                {at >= 0 && <span className="font-mono text-xs text-primary">#{at + 1}</span>}
              </label>
            );
          })}
        </fieldset>
        {owners.size > 1 && (
          <p className="text-[13px] font-semibold text-warning">
            Pick files from one person or one folder at a time.
          </p>
        )}
        <Field id="conv-name" label="Name for the new PDF">
          <input
            id="conv-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={chosen[0] ? `${chosen[0].category} combined` : 'Combined'}
            className="h-11 w-full rounded-xl bg-surface-2 px-3.5 text-sm shadow-inset-sm outline-none focus-visible:outline-2 focus-visible:outline-ring/60"
          />
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button
            variant="primary"
            disabled={!chosen.length || owners.size > 1 || busy}
            onClick={run}
          >
            {busy && <Loader2 className="animate-spin" />}
            Make PDF
          </Button>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );
}

/** The Documents card on a person's page: their real files, with upload for them or HR. */
export function EmployeeDocumentsCard({ employeeId, self }: { employeeId: string; self: boolean }) {
  const { can } = useSession();
  const [docs, setDocs] = useState<DocumentItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const canSee = self || can('document.read');
  const canUpload = self || can('document.manage');

  const load = useCallback(() => {
    if (!canSee) return;
    api<Paged<DocumentItem>>(`/documents?employeeId=${employeeId}&pageSize=6`)
      .then((r) => {
        setDocs(r.items);
        setTotal(r.total);
      })
      .catch(() => setError('Could not load documents.'));
  }, [employeeId, canSee]);
  useEffect(load, [load]);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Documents</CardTitle>
          <CardDescription>
            {canSee ? `${total} ${total === 1 ? 'file' : 'files'}` : 'Kept between them and HR'}
          </CardDescription>
        </div>
        {canUpload && (
          <Button variant="ghost" size="sm" onClick={() => setUploading(true)}>
            <Upload /> Upload
          </Button>
        )}
      </CardHeader>
      {!canSee ? (
        <p className="text-[13px] text-muted-foreground">
          Only HR and the employee can see these files.
        </p>
      ) : error ? (
        <p className="text-[13px] text-danger">{error}</p>
      ) : !docs ? (
        <Skeleton className="h-32" />
      ) : docs.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No files yet.</p>
      ) : (
        <ul className="grid gap-3">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3">
              <IconTile tone="detail" size={36}>
                <FileText />
              </IconTile>
              <div className="min-w-0 grow">
                <div className="truncate font-semibold">{d.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {d.category} · {formatDate(d.createdAt)}
                </div>
              </div>
              <DocStatus status={d.status} />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Download ${d.name}`}
                onClick={() => downloadDocument(d).catch(() => setError('Could not download.'))}
              >
                <Download />
              </Button>
            </li>
          ))}
          {total > docs.length && (
            <li>
              <Link href="/documents" className="text-[13px] font-bold">
                See all {total} files
              </Link>
            </li>
          )}
        </ul>
      )}
      <Dialog open={uploading} onOpenChange={setUploading}>
        {uploading && (
          <UploadDialog
            info={null}
            fixed={{ employeeId }}
            onUploaded={() => {
              setUploading(false);
              load();
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}
