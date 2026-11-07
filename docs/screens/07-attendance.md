# 07 Attendance & leave

Route `/attendance`. Demo data. App shell, "Attendance & leave" active.

## Layout

1. `PageHeader`: eyebrow "Time", title "Attendance & leave", description "October 2026 register,
   leave requests and the leave types your company offers." Actions: default "Export" (download),
   primary "Mark attendance" (edit, opens the absence dialog below).
2. Row: `Tabs` Register · Leave requests · Leave types · Holidays · Shifts (Register selected;
   the design shows Register with requests and leave types beneath, so the other tabs can scroll
   to those sections for now). Right side team `Chip`s: All teams (on), Engineering, Sales,
   Operations.
3. Five small stat cards, each a coloured dot + label + number: Present 112 (success), Late 4
   (warning), Absent 2 (danger), On leave 6 (info), Field visit 4 (detail).
4. **Register** card: title "October 2026 register", caption "Click any cell to change it.
   Weekends and holidays are shaded." Legend pills on the right: P Present (success), A Absent
   (danger), PL Paid (info), SL Sick (warning), FV Field (detail).
   - Grid: first column employee (avatar 30 px + name, 210 px), one 38 × 30 cell per day 1–17
     with the weekday letter above the date (weekends Sa/Su in `text-primary`), last column "Days"
     (mono, present + field days over working days, e.g. "12 / 12").
   - Cell: radius 8, code in 11 px bold, tinted background of the code's tone (P at 10%, others
     at 16%); weekends `bg-surface-2` with a "·".
   - Rows (codes for 1–17 Oct, W = weekend):
     Ananya Sharma `P P W W P P P P P W W P P P P P W`; Ravi Kumar `P P W W P FV FV P P W W P P P P P W`;
     Priya Menon `P PL W W PL PL P P P W W P P P SL SL W`; Arjun Reddy `P P W W P P A P P W W P P P P P W`;
     Kabir Singh `FV FV W W P P P P FV W W FV FV P P P W`; Neha Gupta `P P W W P P P P P W W P P A P P W`;
     Vikram Joshi `P P W W P P P SL SL W W P P P P P W`.
   - Clicking a cell opens a small popover to change the code (P, A, PL, SL, CL, FV, WFH, Half day).
5. Two columns:
   - **Leave requests** (grows): caption "6 waiting", ghost "See all". Each request is a tinted
     well: avatar, name, "dates · days · balance left", leave-type badge on the right; bottom
     right buttons default "Decline" and primary "Approve" (36 px high).
     Ananya Sharma · Sick leave (warning) · 20–21 Oct · 2 days · 8 of 12 left; Rohit Bansal · Paid
     leave (accent) · 26–30 Oct · 5 days · 11 of 18 left; Kabir Singh · Field visit (neutral) · 19
     Oct · Pune client · No limit; Neha Gupta · Casual leave (success) · 23 Oct · 1 day · 5 of 8 left.
   - Right column (440 px), two cards:
     - **Leave types**: caption "HR can add, rename or change any type", default button "Add
       type" (plus). Rows: colour dot, name, rule caption, edit icon button, `Switch` (on/off).
       Paid leave · 18 days a year · carry forward 6 (info, on); Sick leave · 12 days a year · note
       after 2 days (warning, on); Casual leave · 8 days a year (success, on); Field visit · No
       limit · manager approves (detail, on); Comp off · Earned from weekend work (primary, on);
       Work from home · 4 days a month (info, off).
       Edit / Add opens a `Dialog`: Name, Colour (token picker), Days per year or "No limit",
       Accrual (yearly / monthly), Carry forward days, Needs document after N days, Paid or
       unpaid, Who approves (manager / HR), Active switch.
     - **Mark someone's absence** ("Fill in on behalf of an employee"): Employee search
       ("Arjun Reddy · EMP-104"), Date + "Mark as" select side by side, "Reason (shown to
       employee)", primary full-width "Save to register". Same form is used by the header's
       "Mark attendance" button in a `Dialog`.

## Data

```ts
type DayCode = 'P' | 'A' | 'PL' | 'SL' | 'CL' | 'FV' | 'WFH' | 'HD' | 'W' | 'H';
type RegisterRow = { employeeId: string; initials: string; name: string; days: DayCode[] };
type LeaveType = {
  id: string;
  name: string;
  tone: BadgeTone;
  rule: string;
  daysPerYear: number | null;
  carryForward: number;
  active: boolean;
};
type LeaveRequest = {
  id: string;
  employee: { initials: string; name: string };
  typeId: string;
  from: string;
  to: string;
  days: number;
  balanceLeft: string;
  note?: string;
};
```

## States

- Empty requests: "No leave requests waiting".
- Saving a leave type or an absence shows a toast and updates the register cell.
- Phone: register scrolls sideways with the name column sticky.
