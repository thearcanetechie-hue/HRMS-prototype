'use client';

import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Download,
  File as FileIcon,
  FileText,
  Folder,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  ScanLine,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { FileDrop, Toast, useToast } from '@/components/ui/bits';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Field, Select } from '@/components/ui/input';
import { DemoBadge, IconTile, PageHeader } from '@/components/ui/page';
import { ProgressBar, Skeleton } from '@/components/ui/progress';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Tone } from '@/components/ui/tone';
import {
  fileSize,
  getDocumentsOverview,
  type DocFile,
  type DocumentsOverview,
  type QueueItem,
} from '@/lib/demo/documents';
import { cn } from '@/lib/utils';

const STATUS: Record<DocFile['status'], [string, BadgeTone]> = {
  processing: ['Processing', 'accent'],
  signed: ['Signed', 'success'],
  verified: ['Verified', 'success'],
  issued: ['Issued', 'info'],
  needs_review: ['Needs review', 'warning'],
  convert: ['Convert to PDF', 'neutral'],
};
const QUEUE_ICON: Record<QueueItem['kind'], [LucideIcon, Tone]> = {
  scan: [ScanLine, 'primary'],
  convert: [RefreshCw, 'info'],
  merge: [Layers, 'detail'],
  extract: [FileText, 'success'],
};
const PEOPLE = ['Ananya Sharma', 'Arjun Reddy', 'Ravi Kumar', 'Priya Menon', 'Kabir Singh'];
const DOC_TYPES = [
  'Aadhaar card',
  'PAN card',
  'Offer letter',
  'Relieving letter',
  'Degree certificate',
  'Payslip',
  'Other',
];
const ACTIONS = [
  'Convert to PDF',
  'Merge into one PDF',
  'Split pages',
  'Compress',
  'Add letterhead',
];

type Flow = 'scan' | 'upload' | 'convert' | null;

const typeOf = (name: string): DocFile['type'] => {
  const ext = name.split('.').pop()?.toUpperCase();
  return ext === 'JPEG'
    ? 'JPG'
    : ((['PDF', 'JPG', 'PNG', 'DOCX', 'XLSX'] as const).find((t) => t === ext) ?? 'PDF');
};
const guessType = (name: string) =>
  DOC_TYPES.find((t) => name.toLowerCase().includes(t.split(' ')[0]!.toLowerCase())) ?? 'Other';

export default function DocumentsPage() {
  const [data, setData] = useState<DocumentsOverview | null>(null);
  const [folder, setFolder] = useState('emp');
  const [view, setView] = useState('list');
  const [flow, setFlow] = useState<Flow>(null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    getDocumentsOverview().then(setData);
  }, []);

  // Move the demo queue along so finished items drop off and their files update.
  useEffect(() => {
    const t = setInterval(() => {
      setData((d) => {
        if (!d || !d.queue.length) return d;
        const queue = d.queue.map((q) => ({ ...q, pct: Math.min(100, q.pct + 2) }));
        const done = queue.filter((q) => q.pct >= 100);
        return {
          ...d,
          queue: queue.filter((q) => q.pct < 100),
          files: d.files.map((f) =>
            done.some((q) => q.label.startsWith(f.name))
              ? {
                  ...f,
                  name: f.status === 'convert' ? f.name.replace(/\.\w+$/, '.pdf') : f.name,
                  type: f.status === 'convert' ? 'PDF' : f.type,
                  status: 'verified',
                }
              : f,
          ),
        };
      });
    }, 1500);
    return () => clearInterval(t);
  }, []);

  function addFiles(files: DocFile[], queue: QueueItem[], message: string) {
    setData((d) => d && { ...d, files: [...files, ...d.files], queue: [...queue, ...d.queue] });
    setFlow(null);
    showToast(message);
  }

  function convertOne(f: DocFile) {
    setData(
      (d) =>
        d && {
          ...d,
          files: d.files.map((x) => (x.id === f.id ? { ...x, status: 'processing' } : x)),
          queue: [
            {
              id: `q${Date.now()}`,
              label: `${f.name} → PDF`,
              step: 'Converting',
              pct: 5,
              kind: 'convert',
            },
            ...d.queue,
          ],
        },
    );
  }

  if (!data)
    return (
      <>
        <PageHeader eyebrow="Files" title="Documents" />
        <Skeleton className="h-96 rounded-2xl" />
      </>
    );

  const previewFile = data.files.find((f) => f.id === data.preview.fileId);
  const roots = data.folders.filter((f) => !f.parentId);
  const used = (data.storage.usedGb / data.storage.totalGb) * 100;

  const actions: [LucideIcon, Tone, string, string, string, Flow][] = [
    [
      ScanLine,
      'primary',
      'Scan hardcopy to PDF',
      'Use your phone or office scanner. Pages are cropped, straightened and made searchable.',
      'Start scanning',
      'scan',
    ],
    [
      Upload,
      'detail',
      'Upload softcopies',
      'Drop PDFs, Word, Excel or photos. We sort them into the right employee folder.',
      'Choose files',
      'upload',
    ],
    [
      RefreshCw,
      'info',
      'Convert and tidy',
      'Word or images to PDF, merge, split, compress and add your letterhead.',
      'Open converter',
      'convert',
    ],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Files"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Documents <DemoBadge />
          </span>
        }
        description="Scan paper, upload files, convert them and find anything in seconds."
        actions={
          <>
            <Button onClick={() => setFlow('upload')}>
              <Upload /> Upload files
            </Button>
            <Button variant="primary" onClick={() => setFlow('scan')}>
              <ScanLine /> Scan a document
            </Button>
          </>
        }
      />

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
                onClick={() => setFlow(f)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1 justify-self-start text-[13.5px] font-bold',
                  { primary: 'text-primary', detail: 'text-detail', info: 'text-info' }[
                    tone as 'primary'
                  ],
                )}
              >
                {link} <ChevronRight className="size-4" />
              </button>
            </Card>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[230px_1fr] 2xl:grid-cols-[230px_1fr_300px]">
          <Card className="grid content-start gap-1 p-3 sm:p-3">
            <nav aria-label="Folders" className="grid gap-0.5">
              {roots.map((r) => (
                <div key={r.id} className="grid gap-0.5">
                  {[r, ...data.folders.filter((c) => c.parentId === r.id)].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      aria-current={folder === f.id ? 'true' : undefined}
                      onClick={() => setFolder(f.id)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-xl py-2 pr-2.5 text-left text-[13.5px] font-semibold',
                        f.parentId ? 'pl-[30px]' : 'pl-2.5',
                        folder === f.id
                          ? 'bg-primary/8 text-primary'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Folder className="size-4 shrink-0" />
                      <span className="grow truncate">{f.name}</span>
                      <span className="font-mono text-xs">{f.count.toLocaleString('en-IN')}</span>
                    </button>
                  ))}
                </div>
              ))}
            </nav>
            <div className="mt-3 grid gap-2 rounded-[14px] bg-surface-2 p-3 shadow-inset-sm">
              <div className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                Storage
              </div>
              <ProgressBar value={used} label="Storage used" />
              <div className="text-xs text-muted-foreground">
                {data.storage.usedGb} GB of {data.storage.totalGb} GB used
              </div>
            </div>
          </Card>

          <div className="grid min-w-0 content-start gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"
              >
                {data.path.map((p, i) => (
                  <span key={p} className="flex items-center gap-1.5">
                    {i > 0 && <ChevronRight className="size-3.5" />}
                    <span className={i === data.path.length - 1 ? 'text-foreground' : ''}>{p}</span>
                  </span>
                ))}
              </nav>
              <Tabs value={view} onValueChange={setView}>
                <TabsList>
                  <TabsTrigger value="list">List</TabsTrigger>
                  <TabsTrigger value="grid">Grid</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <Card className="min-w-0">
              <CardHeader>
                <div>
                  <CardTitle>{data.path[data.path.length - 1]}</CardTitle>
                  <CardDescription>{data.fileCount} files · last change today</CardDescription>
                </div>
              </CardHeader>
              {view === 'list' ? (
                <Table bare>
                  <THead>
                    <tr>
                      <TH>Name</TH>
                      <TH>Type</TH>
                      <TH className="text-right">Size</TH>
                      <TH>Added</TH>
                      <TH>Status</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {data.files.map((f) => (
                      <TR key={f.id}>
                        <TD>
                          <div className="flex min-w-44 items-center gap-2.5">
                            <IconTile tone={f.type === 'PDF' ? 'danger' : 'info'} size={32}>
                              {f.type === 'JPG' || f.type === 'PNG' ? <ImageIcon /> : <FileIcon />}
                            </IconTile>
                            <span className="font-semibold">{f.name}</span>
                          </div>
                        </TD>
                        <TD className="text-muted-foreground">{f.type}</TD>
                        <TD className="text-right font-mono text-[13px] whitespace-nowrap">
                          {fileSize(f.size)}
                        </TD>
                        <TD className="whitespace-nowrap">{f.addedAt}</TD>
                        <TD>
                          {f.status === 'convert' ? (
                            <button
                              type="button"
                              className="cursor-pointer"
                              onClick={() => convertOne(f)}
                            >
                              <Badge tone="neutral" className="hover:text-foreground">
                                Convert to PDF
                              </Badge>
                            </button>
                          ) : (
                            <Badge tone={STATUS[f.status][1]}>{STATUS[f.status][0]}</Badge>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {data.files.map((f) => (
                    <li key={f.id} className="grid gap-2 rounded-2xl bg-surface-2/60 p-3">
                      <div className="grid h-24 place-items-center rounded-xl bg-surface shadow-inset-sm">
                        <FileText className="size-8 text-muted-foreground" />
                      </div>
                      <div className="truncate text-[13px] font-semibold">{f.name}</div>
                      <Badge tone={STATUS[f.status][1]} className="justify-self-start">
                        {STATUS[f.status][0]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Processing queue</CardTitle>
                  <CardDescription>
                    {data.queue.length
                      ? `${data.queue.length} ${data.queue.length === 1 ? 'file' : 'files'} in progress`
                      : 'Nothing in progress'}
                  </CardDescription>
                </div>
              </CardHeader>
              <ul className="grid gap-4">
                {data.queue.map((q) => {
                  const [Icon, tone] = QUEUE_ICON[q.kind];
                  return (
                    <li key={q.id} className="flex items-center gap-3">
                      <IconTile tone={tone} size={36}>
                        <Icon />
                      </IconTile>
                      <div className="grid min-w-0 grow gap-1.5">
                        <div className="flex justify-between gap-3">
                          <span className="truncate font-semibold">{q.label}</span>
                          <span className="font-mono text-[13px]">{q.pct}%</span>
                        </div>
                        <ProgressBar value={q.pct} tone={tone} label={q.label} />
                        <span className="text-xs text-muted-foreground">{q.step}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <Card className="content-start lg:col-span-2 2xl:col-span-1">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="truncate">{previewFile?.name ?? 'Preview'}</CardTitle>
                <CardDescription>{data.preview.caption}</CardDescription>
              </div>
            </CardHeader>
            <div className="mb-5 grid place-items-center rounded-2xl bg-surface-2 p-5">
              <div className="grid aspect-[3/4] w-40 content-start gap-2 rounded-md bg-white p-4 text-[10px] text-neutral-500 shadow-raised-sm">
                <div className="h-2 w-16 rounded bg-neutral-300" />
                <div className="mt-2 flex gap-2">
                  <div className="size-10 rounded bg-neutral-200" />
                  <div className="grid content-start gap-1">
                    <div className="h-1.5 w-14 rounded bg-neutral-300" />
                    <div className="h-1.5 w-10 rounded bg-neutral-200" />
                  </div>
                </div>
                <div className="mt-auto pt-10 text-center font-mono text-[11px] font-bold text-neutral-700">
                  {data.preview.masked}
                </div>
              </div>
            </div>
            <h4 className="mb-3 text-xs font-bold tracking-[0.1em] text-detail uppercase">
              Read from the document
            </h4>
            <dl className="mb-5 grid gap-2.5">
              {data.preview.extracted.map((x) => (
                <div key={x.field} className="flex items-center gap-2">
                  <Check
                    className={cn('size-4 shrink-0', x.ok ? 'text-success' : 'text-warning')}
                  />
                  <dt className="grow text-muted-foreground">{x.field}</dt>
                  <dd className="text-right font-semibold">{x.value}</dd>
                </div>
              ))}
            </dl>
            <div className="grid gap-2.5">
              <Button disabled title="Coming soon">
                <Download /> Download
              </Button>
              <Button
                variant="primary"
                onClick={() => showToast('Saved to Ananya Sharma’s profile')}
              >
                Save to profile
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={flow !== null} onOpenChange={(o) => !o && setFlow(null)}>
        {flow === 'scan' && <ScanFlow onDone={addFiles} />}
        {flow === 'upload' && <UploadFlow onDone={addFiles} />}
        {flow === 'convert' && <ConvertFlow files={data.files} onDone={addFiles} />}
      </Dialog>
      <Toast message={toast} />
    </>
  );
}

type Done = (files: DocFile[], queue: QueueItem[], message: string) => void;

const stamp = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

function ScanFlow({ onDone }: { onDone: Done }) {
  const [pages, setPages] = useState<{ url: string; name: string }[]>([]);
  const [person, setPerson] = useState(PEOPLE[0]!);
  const [docType, setDocType] = useState(DOC_TYPES[0]!);
  const camera = useRef<HTMLInputElement>(null);
  const scanner = useRef<HTMLInputElement>(null);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);

  const add = (files: FileList | null) =>
    files &&
    setPages((ps) => [
      ...ps,
      ...[...files].map((f) => ({ url: URL.createObjectURL(f), name: f.name })),
    ]);
  const move = (i: number) =>
    setPages((ps) => {
      if (i === 0) return ps;
      const n = [...ps];
      [n[i - 1], n[i]] = [n[i]!, n[i - 1]!];
      return n;
    });

  function save() {
    const name = `${docType}.pdf`;
    onDone(
      [
        {
          id: `f${Date.now()}`,
          name,
          type: 'PDF',
          size: pages.length * 350_000,
          addedAt: stamp(),
          status: 'processing',
        },
      ],
      [
        {
          id: `q${Date.now()}`,
          label: `${name} · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} for ${person}`,
          step: 'Straightening and reading text',
          pct: 5,
          kind: 'scan',
        },
      ],
      `Scanning ${pages.length} pages into ${name}`,
    );
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
          <Button onClick={() => scanner.current?.click()}>
            <ScanLine /> From scanner
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
            ref={scanner}
            type="file"
            accept="image/*,application/pdf"
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
                      onClick={() => move(i)}
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
            Capture each page. They are cropped and straightened automatically.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="scan-person" label="Employee">
            <Select id="scan-person" value={person} onChange={(e) => setPerson(e.target.value)}>
              {PEOPLE.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field id="scan-type" label="Document type">
            <Select id="scan-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex gap-3">
          <Button variant="primary" disabled={!pages.length} onClick={save}>
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

function UploadFlow({ onDone }: { onDone: Done }) {
  const [items, setItems] = useState<{ file: File; person: string; type: string }[]>([]);

  function upload() {
    const now = Date.now();
    onDone(
      items.map((it, i) => ({
        id: `f${now + i}`,
        name: it.file.name,
        type: typeOf(it.file.name),
        size: it.file.size,
        addedAt: stamp(),
        status: 'processing',
      })),
      items.map((it, i) => ({
        id: `q${now + i}`,
        label: `${it.file.name} · ${it.person}`,
        step: `Filing as ${it.type}`,
        pct: 10,
        kind: 'extract',
      })),
      `Uploading ${items.length} ${items.length === 1 ? 'file' : 'files'}`,
    );
  }

  return (
    <DialogContent title="Upload files" side="right" aria-describedby={undefined}>
      <div className="grid gap-5">
        <FileDrop
          title="Drop files here, or browse"
          caption="PDF, Word, Excel or photos"
          onFile={(file) =>
            setItems((xs) => [...xs, { file, person: PEOPLE[0]!, type: guessType(file.name) }])
          }
        />
        <ul className="grid gap-3">
          {items.map((it, i) => (
            <li key={it.file.name + i} className="grid gap-2 rounded-2xl bg-surface-2/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{it.file.name}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${it.file.name}`}
                  onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  aria-label="Employee"
                  value={it.person}
                  onChange={(e) =>
                    setItems((xs) =>
                      xs.map((x, j) => (j === i ? { ...x, person: e.target.value } : x)),
                    )
                  }
                >
                  {PEOPLE.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
                <Select
                  aria-label="Document type"
                  value={it.type}
                  onChange={(e) =>
                    setItems((xs) =>
                      xs.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)),
                    )
                  }
                >
                  {DOC_TYPES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </Select>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          <Button variant="primary" disabled={!items.length} onClick={upload}>
            Upload {items.length || ''}
          </Button>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );
}

function ConvertFlow({ files, onDone }: { files: DocFile[]; onDone: Done }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [action, setAction] = useState(ACTIONS[0]!);
  const chosen = files.filter((f) => picked.has(f.id));

  function run() {
    const merge = action.startsWith('Merge');
    onDone(
      [],
      [
        {
          id: `q${Date.now()}`,
          label: merge
            ? `Merge: ${chosen.length} files`
            : `${chosen.map((f) => f.name).join(', ')} · ${action}`,
          step: merge ? `Merging ${chosen.length} files` : action,
          pct: 5,
          kind: merge ? 'merge' : 'convert',
        },
      ],
      `${action}: ${chosen.length} ${chosen.length === 1 ? 'file' : 'files'} queued`,
    );
  }

  return (
    <DialogContent title="Convert and tidy" side="right" aria-describedby={undefined}>
      <div className="grid gap-5">
        <Field id="conv-action" label="What to do">
          <Select id="conv-action" value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </Field>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[13px] font-semibold text-muted-foreground">
            Pick files
          </legend>
          {files.map((f) => (
            <label
              key={f.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface-2/60 px-3 py-2.5"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={picked.has(f.id)}
                onChange={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (n.has(f.id)) n.delete(f.id);
                    else n.add(f.id);
                    return n;
                  })
                }
              />
              <span className="grow truncate font-semibold">{f.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{fileSize(f.size)}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex gap-3">
          <Button variant="primary" disabled={!chosen.length} onClick={run}>
            {action}
          </Button>
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
        </div>
      </div>
    </DialogContent>
  );
}
