# 14 Documents

Route `/documents`. Demo data first; the Core HR documents work (roadmap week 1) will back it.
App shell, "Documents" active. Goal from the user: scan hardcopies to PDF, upload softcopies,
convert them, and make it easy for HR to find things.

## Layout

1. `PageHeader`: eyebrow "Files", title "Documents", description "Scan paper, upload files,
   convert them and find anything in seconds." Actions: default "Upload files" (upload), primary
   "Scan a document" (scan).
2. Three action cards (icon tile 44, title, two-line text, ghost link in the tile's tone):
   - Scan hardcopy to PDF (scan, primary): "Use your phone or office scanner. Pages are cropped,
     straightened and made searchable." → "Start scanning".
   - Upload softcopies (upload, detail): "Drop PDFs, Word, Excel or photos. We sort them into the
     right employee folder." → "Choose files".
   - Convert and tidy (refresh, info): "Word or images to PDF, merge, split, compress and add your
     letterhead." → "Open converter".
3. Three columns:
   - **Folders** (230 px card): rows with folder icon, name, count; the selected row is
     `bg-primary/8` with primary text; sub-folders indented 18 px. All documents 2,486 · Employee
     files 1,904 (selected) · Engineering 812 · Sales 344 · Operations 298 · Company policies 42 ·
     Payroll & tax 318 · Compliance 96 · Contracts 74 · Templates 52. Storage well at the bottom:
     "Storage", bar 38%, "38 GB of 100 GB used".
   - Middle (grows):
     - Breadcrumb "Employee files › Engineering › Ananya Sharma" and `Tabs` List / Grid.
     - File table titled "Ananya Sharma", caption "14 files · last change today". Columns: Name
       (file tile 32 + name, grows) · Type (56) · Size (mono, 76) · Added (84) · Status (128).
       Aadhaar card.pdf · PDF · 412 KB · 17 Oct · Processing (accent) · Offer letter.pdf · PDF ·
       188 KB · 28 Dec 23 · Signed (success) · PAN card.jpg · JPG · 1.2 MB · 04 Jan 24 · Verified ·
       Relieving letter.docx · DOCX · 96 KB · 04 Jan 24 · "Convert to PDF" (neutral, clickable) ·
       Form 16 FY25.pdf · PDF · 240 KB · 12 Jun · Issued · Degree certificate.pdf · PDF · 3.4 MB ·
       17 Oct · Needs review (warning).
     - **Processing queue** card "4 files in progress": icon tile, name, mono %, bar, step caption:
       Scan batch · 12 pages from front desk · Straightening and reading text · 64% · Relieving
       letter.docx → PDF · Converting · 88% · Merge: Arjun Reddy joining kit · Merging 6 files ·
       30% · Aadhaar card.pdf · Reading details for profile · 92%.
   - **Preview** (300 px card): "Aadhaar card.pdf", "Scanned 17 Oct · 1 page"; a page preview
     (white paper on `bg-surface-2`, masked number "•••• •••• 4412"); eyebrow "Read from the
     document"; rows with a success check: Document type Aadhaar card · Name Ananya Sharma · Date
     of birth 14/03/1994 · Number •••• 4412 · Matches profile Yes. Buttons stacked: default
     "Download", primary "Save to profile".
4. **Scan flow** (`Dialog`, full screen on phones): choose camera or scanner → capture pages
   (thumbnails, reorder, delete) → auto crop and straighten → choose employee and document type
   → "Save as PDF". **Upload flow**: `FileDrop` + per-file employee and type (pre-filled by
   guess) → upload with per-file progress. **Converter**: pick files → action (to PDF, merge,
   split, compress, add letterhead) → result appears in the queue.

## Data

```ts
type Folder = { id: string; name: string; count: number; parentId?: string };
type DocFile = {
  id: string;
  name: string;
  type: 'PDF' | 'JPG' | 'PNG' | 'DOCX' | 'XLSX';
  size: number;
  addedAt: string;
  status: 'processing' | 'signed' | 'verified' | 'issued' | 'needs_review' | 'convert';
  employeeId?: string;
};
type QueueItem = {
  id: string;
  label: string;
  step: string;
  pct: number;
  kind: 'scan' | 'convert' | 'merge' | 'extract';
};
type Extracted = { field: string; value: string; ok: boolean }[];
```

## Notes

- ID numbers are always masked in the UI and stored encrypted, same as the profile.
- Text reading (OCR) and conversion run on the server later; for now the queue is demo data.
