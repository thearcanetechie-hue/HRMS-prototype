# 08 Employees & logs

Route `/employees` (replaces the current list; keep its API calls, search and invite flow).
"Activity log" data is demo until an audit-log endpoint is exposed (the API already writes an
audit log; expose a read endpoint when convenient).

## Layout

1. `PageHeader`: eyebrow "People", title "Employees", description "128 people across 6 teams and
   4 offices." Actions: default "Import" (upload, goes to the onboarding import flow), primary
   "Add employee" (user-plus, existing invite dialog).
2. Row: `Tabs` Directory · Activity log · Org chart; right: `SearchField` 280 px ("Name, code or
   email") and default "Filters · 2" (filter icon, opens a sheet with team, location, status).
3. Status `Chip`s with counts: All 128 (on), Active 119, Onboarding 5, On notice 3, Exited 14.
4. Two columns:
   - **Directory** table card (grows). Columns: Employee (avatar + name + designation, 230) ·
     Code (mono, 90) · Team (110) · Location (100) · Status badge (110) · Last seen (right aligned).
     Rows: Ananya Sharma, Senior Engineer, EMP-101, Engineering, Bengaluru, Active, "In · 09:12" ·
     Ravi Kumar, Ops Lead, EMP-102, Operations, Pune, Active, "In · 08:55" · Priya Menon,
     Accountant, EMP-103, Finance, Kochi, On notice (warning), "Sick leave" · Arjun Reddy,
     Engineer, EMP-104, Engineering, Hyderabad, Onboarding (accent), "Day 3" · Kabir Singh,
     Account Executive, EMP-106, Sales, Delhi, Active, "Field · Pune" · Neha Gupta, Product
     Designer, EMP-107, Design, Bengaluru, Active, "In · 09:40" · Vikram Joshi, QA Engineer,
     EMP-108, Engineering, Pune, Active, "In · 09:03" · Sneha Das, Sales Manager, EMP-109, Sales,
     Kolkata, Active, "WFH" · Farhan Khan, Support Lead, EMP-110, Operations, Mumbai, Exited
     (neutral), "Left 30 Sep". Rows link to `/employees/[id]`.
     Under the card: "Showing 1–9 of 128" and pagination squares (32 px; current `bg-primary`).
   - **Employee log** card (360 px): caption "Every change, in order", ghost "Export". Grouped by
     day with an eyebrow (Today, Yesterday, 15 Oct); each item is an `ActivityItem`:
     Today: Ananya Sharma checked in · Biometric · Bengaluru office · 09:12 (user-check, success);
     Ravi Kumar updated bank details · Approved by Meera · 08:40 (edit, info); Arjun Reddy uploaded
     Aadhaar · Verified automatically · 08:15 (file, detail).
     Yesterday: Neha Gupta promoted · Designer to Product Designer (briefcase, primary); Priya
     Menon applied sick leave · 20–21 Oct · 2 days (calendar, warning); Kabir Singh started field
     visit · Pune client · 11:30 (map pin, detail).
     15 Oct: Arjun Reddy joined · Engineering · reports to Ananya (user-plus, success); Farhan
     Khan exit closed · Full and final settled (log-out, danger).
5. The **Activity log** tab shows the same log full width with filters (person, type, date range).
   **Org chart** can say "Coming soon" for now.

## Data

Directory rows come from the existing `Employee` type; add `lastSeen?: string` (demo until
attendance exists).

```ts
type LogEvent = {
  id: string;
  at: string;
  icon: string;
  tone: BadgeTone;
  title: string;
  detail: string;
};
```

## States

- No results: `TableEmpty` "No one matches these filters" + "Clear filters".
- Roles without `employee.read` keep today's directory view.
