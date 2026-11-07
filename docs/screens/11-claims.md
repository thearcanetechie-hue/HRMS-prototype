# 11 Overtime & reimbursements

Route `/claims`. Demo data. App shell, "Overtime & claims" active.

## Layout

1. `PageHeader`: eyebrow "Money", title "Overtime & reimbursements", description "Extra hours and
   expense claims flow into October payroll once approved." Actions: default "Policies"
   (settings), primary "Approve selected (4)" (check; count follows the selection).
2. Row: `Tabs` Overtime · Expense claims · Advances · Policies; right status `Chip`s Pending 21
   (on), Approved, Paid, Rejected.
3. `StatCard`s: Overtime this month 186 h (clock, "+12%", warning) · Overtime payout ₹ 1.42 L
   (wallet, "At 2× rate") · Claims pending ₹ 2.18 L (receipt, "47 claims", warning) · Avg approval
   time 1.6 days (check, "-0.4 d").
4. Two columns:
   - Left (grows), two table cards:
     - **Overtime requests**, caption "Paid at 2× hourly basic as per Factories Act / company
       policy". Columns: select checkbox (28) · Employee (180) · Date (76) · Hours (mono, 64) ·
       Reason (grows) · Amount (mono, 96) · Status (104). Each cell has 14 px right padding.
       Ravi Kumar, Operations · 15 Oct · 6.0 · Warehouse stock count · ₹ 4,620 · Pending ✓
       Vikram Joshi, Engineering · 14 Oct · 4.5 · Release night v3.2 · ₹ 5,180 · Pending ✓
       Sneha Das, Sales · 12 Oct · 3.0 · Client demo, Kolkata · ₹ 2,940 · Approved
       Ananya Sharma, Engineering · 11 Oct · 3.0 · Production incident · ₹ 4,260 · Pending ✓
       Vinod S., Operations · 10 Oct · 8.0 · Saturday shift cover · ₹ 1,320 · Pending ✓
       (✓ = selected.)
     - **Expense claims**, caption "47 claims · ₹ 2.18 L waiting". Columns: Employee · Category ·
       Spent on · Receipt badge · Amount · Status. Priya Menon · Travel · 09 Oct · Attached ·
       ₹ 4,820 · Pending · Kabir Singh · Client meal · 08 Oct · Attached · ₹ 2,350 · Pending · Neha
       Gupta · Software · 05 Oct · Attached · ₹ 1,999 · Approved · Arjun Reddy · Internet · 01 Oct ·
       Missing (danger) · ₹ 1,000 · On hold (danger). Clicking a row fills the detail card.
   - Right (380 px):
     - **Claim detail** "Priya Menon · Travel", badge Pending. Receipt well: image tile,
       "uber-receipt-09oct.pdf", success caption "Read automatically · amount and date match".
       Rows: Trip Kochi office to client, Kakkanad · Spent on 09 Oct 2026 · Amount ₹ 4,820 ·
       Policy limit ₹ 6,000 per trip · Pays out with October payroll. Buttons: default "Reject"
       (x), primary "Approve" (check). Reject asks for a reason in a `Dialog`.
     - **Spend by category** "October so far": Travel ₹ 92,400 · Client meals ₹ 41,800 ·
       Internet & phone ₹ 38,000 · Software ₹ 26,300 · Other ₹ 19,500, bars scaled to Travel.

## Data

```ts
type OvertimeRequest = {
  id: string;
  employee: Person;
  date: string;
  hours: number;
  reason: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
};
type ExpenseClaim = {
  id: string;
  employee: Person;
  category: string;
  spentOn: string;
  receipt: 'attached' | 'missing';
  amount: number;
  status: 'pending' | 'approved' | 'on_hold' | 'paid' | 'rejected';
  receiptFile?: string;
  notes?: string;
};
```

## States

- Header primary button is disabled with "Approve selected" when nothing is selected.
- Empty: "No pending overtime" / "No pending claims".
