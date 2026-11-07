'use client';

import {
  Check,
  ChevronRight,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Lock,
  RefreshCw,
  ScanLine,
  Trash2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  ConvertDialog,
  DocStatus,
  downloadDocument,
  ScanDialog,
  UploadDialog,
} from '@/components/documents';
import { SearchField, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, FormError, Input, Select } from '@/components/ui/input';
import { Banner, Empty, IconTile, PageHeader } from '@/components/ui/page';
import { Skeleton } from '@/components/ui/progress';
import { Table, TableEmpty, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import {
  api,
  apiBlob,
  ApiError,
  type DocumentFolders,
  type DocumentItem,
  type Paged,
} from '@/lib/api';
import { fileKind, fileSize, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

type View =
  | { kind: 'all' }
  | { kind: 'employees'; departmentId?: string | null; label?: string }
  | { kind: 'folder'; id: string; label: string };

type Flow = 'scan' | 'upload' | 'convert' | 'folder' | null;

const ownerOf = (d: DocumentItem) =>
  d.employee
    ? `${d.employee.firstName} ${d.employee.lastName}`.trim()
    : (d.folder?.name ?? 'Company');

export default function DocumentsPage() {
  const [info, setInfo] = useState<DocumentFolders | null>(null);
  const [view, setView] = useState<View>({ kind: 'all' });
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState('list');
  const [data, setData] = useState<Paged<DocumentItem> | null>(null);
  const [selected, setSelected] = useState<DocumentItem | null>(null);
  const [flow, setFlow] = useState<Flow>(null);
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();

  const loadInfo = useCallback(
    () =>
      api<DocumentFolders>('/documents/folders')
        .then(setInfo)
        .catch((err) =>
          setError(err instanceof ApiError ? err.message : 'Could not load your folders.'),
        ),
    [],
  );

  const load = useCallback(async () => {
    const q = new URLSearchParams({ pageSize: '100' });
    if (search) q.set('search', search);
    if (view.kind === 'folder') q.set('folderId', view.id);
    if (view.kind === 'employees' && view.departmentId) q.set('departmentId', view.departmentId);
    try {
      const res = await api<Paged<DocumentItem>>(`/documents?${q}`);
      const items =
        view.kind === 'employees'
          ? res.items.filter(
              (d) => d.employeeId && (view.departmentId !== null || !d.employee?.department),
            )
          : res.items;
      setData({ ...res, items, total: view.kind === 'employees' ? items.length : res.total });
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load documents.');
    }
  }, [search, view]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    setSelected((s) => (s && data?.items.find((d) => d.id === s.id)) || data?.items[0] || null);
  }, [data]);

  function afterUpload(docs: DocumentItem[]) {
    setFlow(null);
    showToast(docs.length === 1 ? `Saved ${docs[0]!.name}` : `Saved ${docs.length} files`);
    void load();
    void loadInfo();
    if (docs[0]) setSelected(docs[0]);
  }

  async function setStatus(doc: DocumentItem, status: 'VERIFIED' | 'REJECTED') {
    try {
      const updated = await api<DocumentItem>(`/documents/${doc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setData((d) => d && { ...d, items: d.items.map((x) => (x.id === doc.id ? updated : x)) });
      showToast(`${status === 'VERIFIED' ? 'Verified' : 'Rejected'} ${doc.name}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update the document');
    }
  }

  async function remove(doc: DocumentItem) {
    if (!window.confirm(`Delete ${doc.name}? This removes the file for good.`)) return;
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' });
      showToast(`Deleted ${doc.name}`);
      setSelected(null);
      void load();
      void loadInfo();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not delete the document');
    }
  }

  const canManage = info?.canManage ?? false;
  const hr = (info?.byDepartment.length ?? 0) > 0 || canManage;
  const actions: [LucideIcon, Tone, string, string, string, Flow][] = [
    [
      ScanLine,
      'primary',
      'Scan hardcopy to PDF',
      'Use your phone camera or office scanner. Pages are joined into one PDF.',
      'Start scanning',
      'scan',
    ],
    [
      Upload,
      'detail',
      'Upload softcopies',
      'Drop PDFs, Word, Excel or photos into an employee’s files or a company folder.',
      'Choose files',
      'upload',
    ],
    [
      RefreshCw,
      'info',
      'Convert and tidy',
      'Join photos into one PDF or merge several PDFs. More conversions coming.',
      'Open converter',
      'convert',
    ],
  ];

  const crumbs =
    view.kind === 'all'
      ? ['All documents']
      : view.kind === 'employees'
        ? ['Employee files', ...(view.label ? [view.label] : [])]
        : ['Company folders', view.label];

  return (
    <>
      <PageHeader
        eyebrow="Files"
        title="Documents"
        description="Scan paper, upload files, convert them and find anything in seconds."
        actions={
          <>
            <Button onClick={() => setFlow('upload')} disabled={!info}>
              <Upload /> Upload files
            </Button>
            <Button variant="primary" onClick={() => setFlow('scan')} disabled={!info}>
              <ScanLine /> Scan a document
            </Button>
          </>
        }
      />
      {error && <Banner>{error}</Banner>}

      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-3">
          {actions.map(([Icon, tone, title, text, link, f]) => (
            <Card key={title} className="grid content-start gap-3 p-5 sm:p-5">
              <IconTile tone={tone} size={44}>
                <Icon />
              </IconTile>
              <div>
                <div className="font-bold">{title}</div>
                <p className="text-[13px] text-muted-foreground">{text}</p>
              </div>
              <button
                type="button"
                disabled={!info}
                onClick={() => setFlow(f)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1 justify-self-start text-[13.5px] font-bold',
                  tone === 'primary'
                    ? 'text-primary'
                    : tone === 'detail'
                      ? 'text-detail'
                      : 'text-info',
                )}
              >
                {link} <ChevronRight className="size-4" />
              </button>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[230px_1fr] 2xl:grid-cols-[230px_1fr_320px]">
          <Card className="grid content-start gap-1 p-3 sm:p-3">
            {!info ? (
              <Skeleton className="h-64" />
            ) : (
              <nav aria-label="Folders" className="grid gap-0.5">
                <FolderRow
                  label="All documents"
                  count={info.all}
                  active={view.kind === 'all'}
                  onClick={() => setView({ kind: 'all' })}
                />
                <FolderRow
                  label={hr ? 'Employee files' : 'My files'}
                  count={info.employeeFiles}
                  active={view.kind === 'employees' && view.departmentId === undefined}
                  onClick={() => setView({ kind: 'employees' })}
                />
                {info.byDepartment.map((d) => (
                  <FolderRow
                    key={d.id ?? 'none'}
                    nested
                    label={d.name}
                    count={d.count}
                    active={view.kind === 'employees' && view.departmentId === d.id}
                    onClick={() =>
                      setView({ kind: 'employees', departmentId: d.id, label: d.name })
                    }
                  />
                ))}
                {info.folders.map((f) => (
                  <FolderRow
                    key={f.id}
                    label={f.name}
                    count={f.count}
                    locked={f.visibility === 'HR'}
                    active={view.kind === 'folder' && view.id === f.id}
                    onClick={() => setView({ kind: 'folder', id: f.id, label: f.name })}
                  />
                ))}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => setFlow('folder')}
                    className="mt-1 flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <FolderPlus className="size-4" /> New folder
                  </button>
                )}
              </nav>
            )}
            <p className="mt-3 flex items-start gap-2 rounded-[14px] bg-surface-2 p-3 text-xs text-muted-foreground shadow-inset-sm">
              <Lock className="mt-0.5 size-3.5 shrink-0 text-detail" />
              Files are encrypted when stored. Opening an employee’s file is logged.
            </p>
          </Card>

          <div className="grid min-w-0 content-start gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"
              >
                {crumbs.map((p, i) => (
                  <span key={p} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="size-3.5" />}
                    <span className={i === crumbs.length - 1 ? 'text-foreground' : ''}>{p}</span>
                  </span>
                ))}
              </nav>
              <div className="flex flex-wrap gap-3">
                <SearchField
                  className="w-56"
                  placeholder="Name, person or type"
                  aria-label="Search documents"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Tabs value={layout} onValueChange={setLayout}>
                  <TabsList>
                    <TabsTrigger value="list">List</TabsTrigger>
                    <TabsTrigger value="grid">Grid</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>{crumbs[crumbs.length - 1]}</CardTitle>
                  <CardDescription>
                    {data
                      ? `${data.total} ${data.total === 1 ? 'file' : 'files'}${
                          data.items[0]
                            ? ` · last change ${formatDate(data.items[0].updatedAt)}`
                            : ''
                        }`
                      : 'Loading…'}
                  </CardDescription>
                </div>
              </CardHeader>
              {!data ? (
                <Skeleton className="h-48" />
              ) : data.items.length === 0 ? (
                <div className="grid justify-items-center gap-3">
                  <TableEmpty>
                    {search ? 'No files match that search.' : 'No files here yet.'}
                  </TableEmpty>
                  <Button size="sm" onClick={() => setFlow('upload')}>
                    <Upload /> Upload files
                  </Button>
                </div>
              ) : layout === 'list' ? (
                <Table bare>
                  <THead>
                    <tr>
                      <TH>Name</TH>
                      <TH>{view.kind === 'folder' ? 'Type' : 'Belongs to'}</TH>
                      <TH>Kind</TH>
                      <TH className="text-right">Size</TH>
                      <TH>Added</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {data.items.map((d) => (
                      <TR
                        key={d.id}
                        aria-selected={selected?.id === d.id}
                        onClick={() => setSelected(d)}
                        className={cn(
                          'cursor-pointer',
                          selected?.id === d.id && 'bg-primary/6 even:bg-primary/6',
                        )}
                      >
                        <TD>
                          <button
                            type="button"
                            className="flex min-w-44 cursor-pointer items-center gap-2.5 text-left"
                            onClick={() => setSelected(d)}
                          >
                            <FileTile mime={d.mimeType} />
                            <span className="font-semibold">{d.name}</span>
                          </button>
                        </TD>
                        <TD className="whitespace-nowrap text-muted-foreground">
                          {view.kind === 'folder' ? d.category : ownerOf(d)}
                        </TD>
                        <TD className="text-muted-foreground">{fileKind(d.mimeType, d.name)}</TD>
                        <TD className="text-right font-mono text-[13px] whitespace-nowrap">
                          {fileSize(d.size)}
                        </TD>
                        <TD className="whitespace-nowrap">{formatDate(d.createdAt)}</TD>
                        <TD>
                          <DocStatus status={d.status} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {data.items.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(d)}
                        className={cn(
                          'grid w-full cursor-pointer gap-2 rounded-2xl p-3 text-left',
                          selected?.id === d.id ? 'bg-surface shadow-raised' : 'bg-surface-2/60',
                        )}
                      >
                        <div className="grid h-24 place-items-center rounded-xl bg-surface shadow-inset-sm">
                          <FileTile mime={d.mimeType} />
                        </div>
                        <div className="truncate text-[13px] font-semibold">{d.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{ownerOf(d)}</div>
                        <DocStatus status={d.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="lg:col-span-2 2xl:col-span-1">
            {selected ? (
              <Preview
                key={selected.id}
                doc={selected}
                canManage={canManage}
                onDownload={() =>
                  downloadDocument(selected).catch(() => showToast('Could not download the file'))
                }
                onVerify={() => setStatus(selected, 'VERIFIED')}
                onReject={() => setStatus(selected, 'REJECTED')}
                onDelete={() => remove(selected)}
              />
            ) : (
              <Card>
                <Empty className="py-10">Pick a file to preview it.</Empty>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={flow !== null} onOpenChange={(o) => !o && setFlow(null)}>
        {flow === 'scan' && <ScanDialog info={info} onUploaded={afterUpload} />}
        {flow === 'upload' && <UploadDialog info={info} onUploaded={afterUpload} />}
        {flow === 'convert' && <ConvertDialog docs={data?.items ?? []} onUploaded={afterUpload} />}
        {flow === 'folder' && (
          <NewFolder
            onCreated={(name) => {
              setFlow(null);
              showToast(`Created ${name}`);
              void loadInfo();
            }}
          />
        )}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

function FolderRow({
  label,
  count,
  active,
  nested,
  locked,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  nested?: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-xl py-2 pr-2.5 text-left text-[13.5px] font-semibold',
        nested ? 'pl-[30px]' : 'pl-2.5',
        active ? 'bg-primary/8 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Folder className="size-4 shrink-0" />
      <span className="grow truncate">{label}</span>
      {locked && <Lock className="size-3 shrink-0 opacity-60" aria-label="HR only" />}
      <span className="font-mono text-xs">{count.toLocaleString('en-IN')}</span>
    </button>
  );
}

function FileTile({ mime }: { mime: string }) {
  const image = mime.startsWith('image/');
  return (
    <IconTile tone={mime === 'application/pdf' ? 'danger' : image ? 'info' : 'detail'} size={32}>
      {image ? <ImageIcon /> : <FileIcon />}
    </IconTile>
  );
}

/** Shows the file itself (PDFs and images) with its details and HR actions. */
function Preview({
  doc,
  canManage,
  onDownload,
  onVerify,
  onReject,
  onDelete,
}: {
  doc: DocumentItem;
  canManage: boolean;
  onDownload: () => void;
  onVerify: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const previewable = doc.mimeType === 'application/pdf' || doc.mimeType.startsWith('image/');

  useEffect(() => {
    if (!previewable) return;
    let objectUrl: string | null = null;
    apiBlob(`/documents/${doc.id}/file?inline=1`)
      .then((b) => {
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => setFailed(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id, previewable]);

  const details: [string, string][] = [
    ['Document type', doc.category],
    ['Belongs to', ownerOf(doc)],
    ...(doc.employee ? ([['Employee code', doc.employee.employeeCode]] as [string, string][]) : []),
    ['Added', formatDate(doc.createdAt)],
    ['Size', fileSize(doc.size)],
  ];

  return (
    <Card className="content-start">
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="truncate">{doc.name}</CardTitle>
          <CardDescription>
            {fileKind(doc.mimeType, doc.name)} · {fileSize(doc.size)}
          </CardDescription>
        </div>
        <DocStatus status={doc.status} />
      </CardHeader>
      <div className="mb-5 grid h-64 place-items-center overflow-hidden rounded-2xl bg-surface-2 shadow-inset-sm">
        {!previewable || failed ? (
          <div className="grid justify-items-center gap-2 text-[13px] text-muted-foreground">
            <FileIcon className="size-8" />
            {failed ? 'Preview not available' : 'No preview for this kind of file'}
          </div>
        ) : !url ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : doc.mimeType === 'application/pdf' ? (
          <iframe title={`Preview of ${doc.name}`} src={url} className="h-full w-full bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={doc.name} className="max-h-full max-w-full object-contain" />
        )}
      </div>
      <dl className="mb-5 grid gap-2.5">
        {details.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-2.5">
        <Button onClick={onDownload}>
          <Download /> Download
        </Button>
        {canManage && doc.status === 'NEEDS_REVIEW' && (
          <div className="grid grid-cols-2 gap-2.5">
            <Button onClick={onReject}>
              <X /> Reject
            </Button>
            <Button variant="primary" onClick={onVerify}>
              <Check /> Verify
            </Button>
          </div>
        )}
        {(canManage || doc.status === 'NEEDS_REVIEW') && (
          <Button variant="danger" onClick={onDelete}>
            <Trash2 /> Delete
          </Button>
        )}
      </div>
    </Card>
  );
}

function NewFolder({ onCreated }: { onCreated: (name: string) => void }) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'HR' | 'EVERYONE'>('HR');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api('/documents/folders', {
        method: 'POST',
        body: JSON.stringify({ name, visibility }),
      });
      onCreated(name);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 409
          ? 'A folder with that name already exists.'
          : err instanceof ApiError
            ? err.message
            : 'Could not create the folder.',
      );
    }
  }

  return (
    <DialogContent title="New folder" aria-describedby={undefined}>
      <form onSubmit={submit} className="grid gap-4">
        <Field id="nf-name" label="Name">
          <Input id="nf-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field id="nf-vis" label="Who can see it">
          <Select
            id="nf-vis"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'HR' | 'EVERYONE')}
          >
            <option value="HR">HR only</option>
            <option value="EVERYONE">Everyone in the company</option>
          </Select>
        </Field>
        <FormError>{error}</FormError>
        <div className="flex gap-3">
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            <FolderPlus /> Create folder
          </Button>
          <DialogClose asChild>
            <Button type="button">Cancel</Button>
          </DialogClose>
        </div>
      </form>
    </DialogContent>
  );
}
