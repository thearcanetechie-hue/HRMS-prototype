# 03–05 Onboarding (admin sign-up)

Three steps that create the workspace. Step 1 replaces the current `/signup` page and keeps its
API call (create workspace + owner). Steps 2 and 3 are new routes, shown right after sign-up.
Store progress so "Save and exit" returns to the same step.

## Shared layout

- Top row (padding 24/48): logo + "HRMS"; right side "Step N of 3", a 160 px `ProgressBar`
  (33 / 67 / 100%), link "Save and exit" (primary text).
- Body: two columns, 40 px gap.
  - Left (300 px): eyebrow "Set up your workspace"; H2 "A few details and your HR workspace is
    ready."; vertical `Stepper` with three items (title + caption): "About you · Your name and
    login", "Your company · Name, size and location", "Bring your team · Import or connect your
    data". Current step sits in a raised `bg-surface` row. Below: help well with message icon,
    "Need a hand?", "Our onboarding team moves your data for free. Book a 20-minute call."
  - Right: form card, radius 24, padding 40, gap 24. Title (H1) + muted description, fields,
    footer row (Back link on steps 2–3, primary button on the right).
- Two fields side by side per row on desktop; one column on phones.

## 03 About you (`/signup`)

Title "Tell us about you" / "You will be the first admin of your company workspace."

| Field             | Example         | Notes                                                                      |
| ----------------- | --------------- | -------------------------------------------------------------------------- |
| Full name         | Meera Iyer      | required                                                                   |
| Job title         | HR Manager      |                                                                            |
| Work email        | meera@acme.in   | required                                                                   |
| Mobile number     | +91 98450 12345 | `+91` prefix                                                               |
| Create a password | ••••••••••••    | required; 4-segment strength meter, label e.g. "Strong password" (success) |

- "What best describes your role?" single-select `Chip`s: HR / People team (default), Founder /
  CEO, Finance, IT admin.
- Checkbox "I agree to the Terms and the Privacy policy (DPDP Act 2023)" (required).
- Primary button "Continue".

## 04 Your company (`/onboarding/company`)

Title "About your company" / "This sets up your workspace, payroll rules and holiday calendar."

- Company name (building icon) "Acme Technologies Pvt Ltd" · Workspace address (globe icon)
  "acme.hrms.in" (slug, checked for availability).
- Company size chips: 1–10, 11–50, **51–200**, 201–500, 501–1000, 1000+.
- Industry chips: **IT & software**, Manufacturing, Retail, Healthcare, Finance, Other.
- Head office city (map pin) "Bengaluru" · State for professional tax (`Select`) "Karnataka".
- Company PAN, optional, "AAACA1234F" · Payroll starts from (`Select` month) "November 2026".
- "Switch on modules (change any time)": multi-select chips with icons: Attendance & leave,
  Payroll, Documents, Performance, Learning, Engagement (first three and Engagement on).
- Footer: Back, primary "Continue".

## 05 Bring your team (`/onboarding/team`)

Title "Bring your team in" / "Pick how you want to add your 128 employees. You can mix methods
later." (number comes from the size picked, or is omitted.)

- Three option cards in a row, single select (radio dot top right). Selected card is raised
  `bg-surface`; others are flat `bg-surface-2`:
  1. Upload a spreadsheet (upload icon) "Excel or CSV. We map the columns for you."
  2. Add people manually (user-plus) "Type in a few people and invite them."
  3. Connect your database (database) "Sync from your HR or payroll database."
- **Upload path** (shown in the design):
  - `FileDrop`: "Drop your file here, or browse" / ".xlsx, .xls or .csv up to 20 MB · Download
    our template".
  - After a file is picked: file row card with success file tile, "acme-employees-oct.xlsx",
    "128 rows found · 125 ready · 3 need attention", badge warning "3 to fix", ghost "Replace".
  - "Column mapping" table: Column in your file · Maps to (a `Select` per row) · Sample · Status
    badge. Rows: Emp Name → Full name · Mail ID → Work email · Dept → Department · DOJ → Date of
    joining · CTC (LPA) → Annual CTC (warning "Check unit") · PAN No → PAN (encrypted), sample
    masked "ABCPS••••K".
  - Caption with database icon: "Prefer a live sync? Connect PostgreSQL, MySQL, SQL Server, or
    Zoho People, Keka, greytHR and Darwinbox."
  - Switch row "Email everyone an invite to set up their profile once the import finishes" (on).
  - Footer: Back, primary "Import 125 employees".
- **Manual path**: a small table of editable rows (name, work email, department, designation)
  with "Add another person" and primary "Invite N people"; reuse the existing invite API.
- **Database path**: form with Type (`Select`: PostgreSQL, MySQL, SQL Server, Zoho People, Keka,
  greytHR, Darwinbox), host, port, database, username, password, and "Test connection". Mark as
  "Coming soon" until the backend exists.

Data shape for the import preview:

```ts
type ImportPreview = {
  fileName: string;
  rows: number;
  ready: number;
  needsAttention: number;
  columns: {
    source: string;
    target: string;
    sample: string;
    status: 'matched' | 'check' | 'unmapped';
  }[];
};
```

The CSV parse and mapping can run in the browser first; posting rows reuses the employee
create endpoint in batches.

## Dark mode

Same layout on dark tokens; the stepper's current dot and the primary button turn gold.
