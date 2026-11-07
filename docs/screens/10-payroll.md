# 10 Payroll & compliance

Route `/payroll`. Demo data. App shell, "Payroll & compliance" active. Figures are samples;
real calculations must be checked by a chartered accountant before any live payroll run.

## Layout

1. `PageHeader`: eyebrow "Money", title "Payroll & compliance", description "October 2026 · 128
   employees · pay date Saturday 31 October." Actions: default "Preview payslips" (eye), primary
   "Run payroll" (play; disabled until step 3 is done, opens a confirm `Dialog`).
2. **Run stepper** card (horizontal `Stepper`, gap 12): Lock attendance (done) · Approve overtime
   & claims (done) · Review salaries (current, 3) · Pay & payslips (4) · File returns (5).
3. Four `StatCard`s: Gross pay ₹ 1.12 Cr (wallet, "+2.4%") · Net pay ₹ 89.6 L (send, "128
   people") · Statutory dues ₹ 22.0 L (shield, "Due 15 Nov", warning) · Cost to company ₹ 1.24 Cr
   (building, "+1.8%").
4. Two columns:
   - Left (grows):
     - **Salary register** table: title + caption "128 employees · 3 flagged for review";
       actions `Chip` "Flagged 3" (alert icon) and default "Download". Columns (amounts mono,
       right aligned): Employee (avatar + name + team) · Gross · PF · ESI · PT · TDS · Net pay.
       Ananya Sharma, Engineering: 1,54,166 · 1,800 · — · 200 · 18,420 · 1,33,746
       Ravi Kumar, Operations: 92,500 · 1,800 · — · 200 · 6,110 · 84,390
       Priya Menon, Finance: 68,000 · 1,800 · — · 200 · 2,340 · 63,660
       Arjun Reddy, Engineering: 1,05,000 · 1,800 · — · 200 · 8,950 · 94,050
       Vinod S., Operations: 19,800 · 1,782 · 149 · 0 · 0 · 17,869
       Kabir Singh, Sales: 84,000 · 1,800 · — · 200 · 4,860 · 77,140
     - **Flagged for review** card, "Check these before you run payroll": wells with avatar,
       name, reason, badge, default "Review" button: Vinod S. · Gross under ₹ 21,000, ESI applies
       from this month · ESI (warning) · Priya Menon · Last working day 14 Nov, prorate and hold
       F&F · Exit (danger) · Arjun Reddy · Joined 15 Oct, pay for 17 of 31 days · New joiner
       (accent).
   - Right (380 px):
     - **Compliance calendar** "Karnataka · FY 2026–27": date block (day number + month in a
       52 px `bg-surface-2` tile), name + "Due in N days", status badge: PF ECR & challan 15 Nov
       (Open, warning) · ESI contribution 15 Nov (Open, warning) · Professional tax (KA) 20 Nov
       (Open) · TDS · Form 24Q Q2 31 Oct (Soon, danger) · LWF (half-yearly) 15 Jan (Open) · Form
       16 15 Jun (Filed, success).
     - **Where the money goes** "October CTC ₹ 1.24 Cr": label, mono amount, bar: Net salaries
       ₹ 89.6 L (primary) · Income tax (TDS) ₹ 9.6 L (detail) · Provident fund ₹ 10.8 L (info) ·
       ESI + PT + LWF ₹ 1.5 L (warning) · Reimbursements ₹ 3.2 L (success).
5. Four shortcut cards (icon tile, arrow, title, caption): Payslips · Email 128 payslips with a
   password · Bank transfer file · HDFC, ICICI, SBI and Axis formats · Statutory reports · ECR,
   ESI, PT, Form 24Q and Form 16 · Full and final · 2 settlements pending.

## Data

```ts
type PayrollRun = {
  month: string;
  payDate: string;
  step: 1 | 2 | 3 | 4 | 5;
  gross: number;
  net: number;
  statutory: number;
  ctc: number;
};
type SalaryRow = {
  employeeId: string;
  initials: string;
  name: string;
  team: string;
  gross: number;
  pf: number;
  esi: number | null;
  pt: number;
  tds: number;
  net: number;
  flag?: { reason: string; tag: string; tone: BadgeTone };
};
type ComplianceItem = { name: string; due: string; status: 'open' | 'soon' | 'filed' };
```

## States

- Before attendance is locked, the register shows `Empty` "Lock October attendance to see
  salaries" with a button to Attendance.
- After running: stepper moves to step 4 and a success `Banner` "Payroll run for October.
  Payslips are ready to send."
