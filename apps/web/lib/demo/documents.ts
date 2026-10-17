import { demoDelay } from '@/lib/format';

export type Folder = { id: string; name: string; count: number; parentId?: string };

export type DocFile = {
  id: string;
  name: string;
  type: 'PDF' | 'JPG' | 'PNG' | 'DOCX' | 'XLSX';
  size: number;
  addedAt: string;
  status: 'processing' | 'signed' | 'verified' | 'issued' | 'needs_review' | 'convert';
  employeeId?: string;
};

export type QueueItem = {
  id: string;
  label: string;
  step: string;
  pct: number;
  kind: 'scan' | 'convert' | 'merge' | 'extract';
};

export type Extracted = { field: string; value: string; ok: boolean }[];

export type DocumentsOverview = {
  folders: Folder[];
  selectedFolder: string;
  path: string[];
  files: DocFile[];
  fileCount: number;
  queue: QueueItem[];
  preview: { fileId: string; caption: string; masked: string; extracted: Extracted };
  storage: { usedGb: number; totalGb: number };
};

const overview: DocumentsOverview = {
  folders: [
    { id: 'all', name: 'All documents', count: 2486 },
    { id: 'emp', name: 'Employee files', count: 1904 },
    { id: 'eng', name: 'Engineering', count: 812, parentId: 'emp' },
    { id: 'sales', name: 'Sales', count: 344, parentId: 'emp' },
    { id: 'ops', name: 'Operations', count: 298, parentId: 'emp' },
    { id: 'pol', name: 'Company policies', count: 42 },
    { id: 'pay', name: 'Payroll & tax', count: 318 },
    { id: 'comp', name: 'Compliance', count: 96 },
    { id: 'con', name: 'Contracts', count: 74 },
    { id: 'tpl', name: 'Templates', count: 52 },
  ],
  selectedFolder: 'emp',
  path: ['Employee files', 'Engineering', 'Ananya Sharma'],
  files: [
    {
      id: 'f1',
      name: 'Aadhaar card.pdf',
      type: 'PDF',
      size: 412_000,
      addedAt: '17 Oct',
      status: 'processing',
    },
    {
      id: 'f2',
      name: 'Offer letter.pdf',
      type: 'PDF',
      size: 188_000,
      addedAt: '28 Dec 23',
      status: 'signed',
    },
    {
      id: 'f3',
      name: 'PAN card.jpg',
      type: 'JPG',
      size: 1_200_000,
      addedAt: '04 Jan 24',
      status: 'verified',
    },
    {
      id: 'f4',
      name: 'Relieving letter.docx',
      type: 'DOCX',
      size: 96_000,
      addedAt: '04 Jan 24',
      status: 'convert',
    },
    {
      id: 'f5',
      name: 'Form 16 FY25.pdf',
      type: 'PDF',
      size: 240_000,
      addedAt: '12 Jun',
      status: 'issued',
    },
    {
      id: 'f6',
      name: 'Degree certificate.pdf',
      type: 'PDF',
      size: 3_400_000,
      addedAt: '17 Oct',
      status: 'needs_review',
    },
  ],
  fileCount: 14,
  queue: [
    {
      id: 'q1',
      label: 'Scan batch · 12 pages from front desk',
      step: 'Straightening and reading text',
      pct: 64,
      kind: 'scan',
    },
    {
      id: 'q2',
      label: 'Relieving letter.docx → PDF',
      step: 'Converting',
      pct: 88,
      kind: 'convert',
    },
    {
      id: 'q3',
      label: 'Merge: Arjun Reddy joining kit',
      step: 'Merging 6 files',
      pct: 30,
      kind: 'merge',
    },
    {
      id: 'q4',
      label: 'Aadhaar card.pdf',
      step: 'Reading details for profile',
      pct: 92,
      kind: 'extract',
    },
  ],
  preview: {
    fileId: 'f1',
    caption: 'Scanned 17 Oct · 1 page',
    masked: '•••• •••• 4412',
    extracted: [
      { field: 'Document type', value: 'Aadhaar card', ok: true },
      { field: 'Name', value: 'Ananya Sharma', ok: true },
      { field: 'Date of birth', value: '14/03/1994', ok: true },
      { field: 'Number', value: '•••• 4412', ok: true },
      { field: 'Matches profile', value: 'Yes', ok: true },
    ],
  },
  storage: { usedGb: 38, totalGb: 100 },
};

export const getDocumentsOverview = () => demoDelay(structuredClone(overview));

export function fileSize(bytes: number) {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
}
