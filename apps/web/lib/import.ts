import { api, Employee, Named } from './api';

/** Fields a spreadsheet column can map to. `skip` leaves the column out. */
export const TARGETS = {
  fullName: 'Full name',
  workEmail: 'Work email',
  department: 'Department',
  designation: 'Designation',
  dateOfJoining: 'Date of joining',
  employeeCode: 'Employee code',
  phone: 'Mobile number',
  ctc: 'Annual CTC',
  pan: 'PAN (encrypted)',
  skip: 'Don’t import',
} as const;
export type Target = keyof typeof TARGETS;

export type ImportColumn = {
  source: string;
  target: Target;
  sample: string;
  status: 'matched' | 'check' | 'unmapped';
};

export type ImportPreview = {
  fileName: string;
  rows: number;
  ready: number;
  needsAttention: number;
  columns: ImportColumn[];
};

const GUESSES: [RegExp, Target][] = [
  [/e-?mail|mail id/i, 'workEmail'],
  [/name/i, 'fullName'],
  [/dept|department|team/i, 'department'],
  [/designation|title|role/i, 'designation'],
  [/doj|joining|join date|start/i, 'dateOfJoining'],
  [/code|emp ?id|employee id/i, 'employeeCode'],
  [/mobile|phone/i, 'phone'],
  [/ctc|salary/i, 'ctc'],
  [/pan/i, 'pan'],
];

/** Small CSV reader: commas, quoted fields with "" escapes, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const mask = (pan: string) => (pan.length >= 5 ? pan.slice(0, 5) + '••••' + pan.slice(-1) : pan);

export function guessColumns(header: string[], first: string[] = []): ImportColumn[] {
  const used = new Set<Target>();
  return header.map((source, i) => {
    const guess = GUESSES.find(([re, t]) => re.test(source) && !used.has(t))?.[1] ?? 'skip';
    if (guess !== 'skip') used.add(guess);
    const raw = first[i] ?? '';
    return {
      source,
      target: guess,
      sample: guess === 'pan' ? mask(raw) : raw,
      status: guess === 'skip' ? 'unmapped' : /lpa|lakh/i.test(source) ? 'check' : 'matched',
    };
  });
}

export type ImportRow = Partial<Record<Target, string>>;

export function toRows(data: string[][], columns: ImportColumn[]): ImportRow[] {
  return data.map((cells) => {
    const row: ImportRow = {};
    columns.forEach((c, i) => {
      if (c.target !== 'skip' && cells[i]) row[c.target] = cells[i];
    });
    return row;
  });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Why a row can't be imported yet, or null when it is ready. */
export function rowProblem(r: ImportRow): string | null {
  if (!r.fullName) return 'Missing name';
  if (!r.workEmail || !EMAIL.test(r.workEmail)) return 'Missing or invalid email';
  if (r.dateOfJoining && Number.isNaN(parseDate(r.dateOfJoining).getTime()))
    return 'Unreadable joining date';
  return null;
}

/** Accepts 2026-10-17, 17/10/2026 and 17-10-2026 (Indian day-first order). */
export function parseDate(s: string) {
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : new Date(s);
}

export function buildPreview(fileName: string, data: string[][], columns: ImportColumn[]) {
  const rows = toRows(data, columns);
  const ready = rows.filter((r) => !rowProblem(r)).length;
  return {
    preview: {
      fileName,
      rows: rows.length,
      ready,
      needsAttention: rows.length - ready,
      columns,
    } satisfies ImportPreview,
    rows,
  };
}

/** Finds a department or designation by name, creating it when missing. */
async function namedId(kind: 'departments' | 'designations', name: string, cache: Named[]) {
  const hit = cache.find((n) => n.name.toLowerCase() === name.toLowerCase());
  if (hit) return hit.id;
  const created = await api<Named>(`/org/${kind}`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  cache.push(created);
  return created.id;
}

/**
 * Creates employees for every ready row, a few at a time, and optionally invites them.
 * Returns how many were created and the rows that failed with the API's reason.
 */
export async function importRows(
  rows: ImportRow[],
  { invite, onProgress }: { invite: boolean; onProgress?: (done: number) => void },
) {
  const [departments, designations] = await Promise.all([
    api<Named[]>('/org/departments'),
    api<Named[]>('/org/designations'),
  ]);
  const ready = rows.filter((r) => !rowProblem(r));
  const failed: { row: ImportRow; reason: string }[] = [];
  let created = 0;
  let n = 0;
  for (const r of ready) {
    n++;
    const [firstName, ...rest] = r.fullName!.trim().split(/\s+/);
    try {
      const departmentId = r.department
        ? await namedId('departments', r.department, departments)
        : undefined;
      const designationId = r.designation
        ? await namedId('designations', r.designation, designations)
        : undefined;
      const e = await api<Employee>('/employees', {
        method: 'POST',
        body: JSON.stringify({
          employeeCode: r.employeeCode || `EMP-${String(n).padStart(3, '0')}`,
          firstName,
          lastName: rest.join(' '),
          workEmail: r.workEmail,
          phone: r.phone || null,
          dateOfJoining: (r.dateOfJoining ? parseDate(r.dateOfJoining) : new Date()).toISOString(),
          departmentId,
          designationId,
        }),
      });
      created++;
      if (invite) await api(`/employees/${e.id}/invite`, { method: 'POST' }).catch(() => null);
    } catch (err) {
      failed.push({ row: r, reason: err instanceof Error ? err.message : 'Failed' });
    }
    onProgress?.(n);
  }
  return { created, failed };
}
