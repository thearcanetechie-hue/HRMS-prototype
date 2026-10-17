# Screen build spec

This folder describes the 18 screens designed in Figma (file "HRMS Design System",
<https://www.figma.com/design/sDWjyU065KWfdDbQO6tZby>, page **Screens**, the four sections below
the older dashboard screens; dark versions sit to the right in sections ending "· Dark"). It is
written so the screens can be built without opening Figma.

Read `docs/DESIGN.md` first. Every rule there still applies: tokens only, no borders, one primary
button per screen, `PageHeader` first, both themes, phone width.

## Files

| #   | Screen                       | Route                 | Spec                                             |
| --- | ---------------------------- | --------------------- | ------------------------------------------------ |
| 01  | Landing page                 | `/`                   | [01-landing.md](01-landing.md)                   |
| 02  | Sign in                      | `/login`              | [02-sign-in.md](02-sign-in.md)                   |
| 03  | Onboarding · About you       | `/signup`             | [03-05-onboarding.md](03-05-onboarding.md)       |
| 04  | Onboarding · Your company    | `/onboarding/company` | [03-05-onboarding.md](03-05-onboarding.md)       |
| 05  | Onboarding · Bring your team | `/onboarding/team`    | [03-05-onboarding.md](03-05-onboarding.md)       |
| 06  | Home                         | `/dashboard`          | [06-home.md](06-home.md)                         |
| 07  | Attendance & leave           | `/attendance`         | [07-attendance.md](07-attendance.md)             |
| 08  | Employees & logs             | `/employees`          | [08-employees.md](08-employees.md)               |
| 09  | Employee profile             | `/employees/[id]`     | [09-employee-profile.md](09-employee-profile.md) |
| 10  | Payroll & compliance         | `/payroll`            | [10-payroll.md](10-payroll.md)                   |
| 11  | Overtime & reimbursements    | `/claims`             | [11-claims.md](11-claims.md)                     |
| 12  | Workload & performance       | `/performance`        | [12-performance.md](12-performance.md)           |
| 13  | Learning & development       | `/learning`           | [13-learning.md](13-learning.md)                 |
| 14  | Documents                    | `/documents`          | [14-documents.md](14-documents.md)               |
| 15  | Engagement feed              | `/engagement`         | [15-engagement.md](15-engagement.md)             |
| 16  | Inbox                        | `/inbox`              | [16-inbox.md](16-inbox.md)                       |
| 17  | Analytics & reporting        | `/analytics`          | [17-analytics.md](17-analytics.md)               |
| 18  | Integrations                 | `/integrations`       | [18-integrations.md](18-integrations.md)         |

## Build order

1. New shared components (below) and the new app shell.
2. Sign in, onboarding, Home, Employees, Employee profile: these replace screens that already
   talk to the real API, so keep the existing data calls and only change the layout.
3. The other HR screens on demo data (see "Data").
4. Landing page.

## Data

Only auth, workspace sign-up, invites, employees and the employee profile have a real API today
(PR #1). Every other screen runs on typed demo data until its module is built:

- Put types and demo rows in `apps/web/lib/demo/<module>.ts` (for example `lib/demo/payroll.ts`
  exporting `type PayrollRow` and `payrollRows: PayrollRow[]`). Each spec lists the shape.
- Read demo data through one async function per screen (`getPayrollOverview()` and so on) so
  swapping in the API later touches one place.
- Show a small `Badge tone="neutral"` reading "Demo data" next to the page title on demo screens.
- Sample company: Acme Technologies, 128 employees, HR admin Meera Iyer (meera@acme.in), date
  Saturday 17 October 2026. Money is Indian rupees with Indian grouping (`₹ 1,12,40,000`);
  use `Intl.NumberFormat('en-IN')`.

## App shell (all HR screens, 06 to 18)

Replaces the current sidebar in `app/(app)/layout.tsx`.

- **Sidebar**, 264 px wide on `lg` and up, page background (no card), padding 24/18:
  - Brand row: `Logo` (crimson gradient tile in light, gold in dark, 40 px, glow) + "HRMS" bold +
    company name in muted caption.
  - Grouped nav. Group label is an eyebrow (12 px, 700, uppercase, `text-muted-foreground`).

    | Group          | Items (label, lucide icon, route)                                                                             |
    | -------------- | ------------------------------------------------------------------------------------------------------------- |
    | Workspace      | Home `LayoutDashboard` `/dashboard`; Attendance & leave `Clock` `/attendance`; Employees `Users` `/employees` |
    | Money          | Payroll & compliance `Wallet` `/payroll`; Overtime & claims `Receipt` `/claims`                               |
    | Growth         | Performance `Target` `/performance`; Learning `GraduationCap` `/learning`; Documents `Folder` `/documents`    |
    | People & comms | Engagement `Heart` `/engagement`; Inbox `Inbox` `/inbox` (count pill "4", `bg-primary`)                       |
    | Insights       | Analytics `BarChart3` `/analytics`; Integrations `Plug` `/integrations`                                       |

  - Active item: `bg-surface shadow-raised-sm`, label and icon `text-primary`, radius 12.
  - Bottom: user card (`Card`, radius 16, `shadow-raised-sm`, padding 14): `Avatar` "MI", name,
    "HR Manager · Admin", settings icon button. Keep the existing sign-out and theme toggle in a
    menu on that card.
  - Keep the existing permission checks (`can(...)`) for which items show; hide modules a role
    cannot use.
- **Top bar** (first row of the main column): search well (`bg-surface-2 shadow-inset-sm`,
  radius 12, 44 px high, max 420 px wide, search icon, placeholder "Search people, documents,
  requests", a `Ctrl K` key hint in a small `bg-surface` chip on the right), then pushed right: a
  44 px square bell button (`bg-surface shadow-raised-sm`, radius 12, 8 px `bg-primary` dot top
  right) and the user `Avatar`.
- **Main column**: padding 28 top, 40 right, 56 bottom, 16 left; gap 24 between blocks; content
  max width about 1120 px.
- Below `lg`: sidebar becomes the existing slide-over menu; grids collapse to one column; tables
  scroll sideways inside their card.

## New shared components (`components/ui`)

| Component        | What it is                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Tabs`           | Segmented control: track `bg-surface-2 shadow-inset-sm` radius 14 padding 4; active tab `bg-surface shadow-raised-sm` radius 10, bold; others muted semibold. Use Radix Tabs.                                                             |
| `Chip`           | Filter pill, radius 999, padding 8/14, 13 px semibold. Off: `bg-surface shadow-raised-sm`. On: `bg-primary text-primary-foreground shadow-glow`. Optional leading icon.                                                                   |
| `StatCard`       | KPI card: `Card` padding 20; row with `IconTile` and an optional delta pill on the right (tinted `success`/`warning`/`danger` at 12%, 12 px bold); big number (28 px, 800); label (14.5 px semibold muted).                               |
| `ProgressBar`    | Track `bg-surface-2`, fill a token colour, height 6 to 8, fully rounded. Props: `value`, `tone`.                                                                                                                                          |
| `StackedBar`     | Several `ProgressBar` segments in one track (used for done / in progress / not started).                                                                                                                                                  |
| `BarChart`       | Simple vertical bars from divs: one bar per value, faint tint (`bg-primary/28`), highlighted bar solid; labels under each bar. Values must match the numbers shown.                                                                       |
| `Ring`           | Extend `ProgressRing` with a centre value and caption.                                                                                                                                                                                    |
| `Stepper`        | Horizontal steps: done = tinted `success` circle with check, current = `bg-primary` circle with number and glow, upcoming = `bg-surface-2` circle; connecting line `success` when done else `surface-2`. Vertical variant for onboarding. |
| `SearchField`    | The top-bar search well, reusable inside pages.                                                                                                                                                                                           |
| `Toggle row`     | `Switch` with title and caption, used in settings lists.                                                                                                                                                                                  |
| `FileDrop`       | Drop zone with no border: `bg-surface-2 shadow-inset`, radius 18, centred `IconTile`, title, caption.                                                                                                                                     |
| `ActivityItem`   | Icon tile + bold line + muted caption; used in logs and activity lists.                                                                                                                                                                   |
| `ApproveButtons` | Two 32 px square buttons: check on `success/12`, cross on `danger/10`, radius 10, with aria-labels.                                                                                                                                       |
| `Skeleton`       | `bg-surface-2` pulse block for loading states.                                                                                                                                                                                            |

`IconTile` gains a `tone` prop (`primary`, `detail`, `success`, `warning`, `danger`, `info`): tint
`bg-<tone>/10`, icon `text-<tone>`, sizes 32 / 36 / 40 / 44.

`Badge` tones already exist; add a leading 6 px dot in the current colour (the Figma badges have one).

## Typography and spacing used everywhere

Plus Jakarta Sans; JetBrains Mono for codes, amounts in tables and counts like `128 / 128`.
H1 28/700, card titles 16/700, body 14.5, captions 12, eyebrow 12/700 uppercase tracking 0.1em
in `text-detail`. Cards radius 20, padding 24, gap 16; inner tiles radius 14; buttons and
inputs radius 12, 44 px high.

## Common states (apply to every screen)

- **Loading**: keep the page header, show `Skeleton` blocks shaped like the cards.
- **Empty**: `Empty` with one line and the screen's main action, for example "No leave requests
  waiting" on Attendance.
- **Error**: `Banner` above the content with a retry button.
- **Permissions**: hide actions the role can't take; never show salary or ID numbers without the
  right permission (the profile already handles this).

## Dark mode

All screens are the same layout in dark. Because everything reads the tokens, no screen needs
dark-specific code. Things to check in dark:

- Primary buttons are the gold gradient with dark text (`text-primary-foreground`).
- Status tints (success, warning, danger, info) use the lighter dark-theme values from `globals.css`.
- The Growth pricing card on the landing page is inverted (see 01).
- The landing hero is dark in both themes.
