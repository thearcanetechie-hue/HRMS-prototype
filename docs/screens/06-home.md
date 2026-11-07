# 06 Home

Route `/dashboard` (replaces the current dashboard). App shell, Home active. Headcount and
team numbers come from the real employees API; attendance, requests, payroll and events are
demo data until those modules exist.

## Layout

1. `PageHeader`: eyebrow = today's date ("Saturday, 17 October 2026"); title "Good morning,
   Meera" (time-of-day greeting + first name); description "118 of 128 people are in today. 14
   requests are waiting for you." Actions: default "Add employee" (user-plus, opens the existing
   invite dialog), primary "Run October payroll" (play, links to `/payroll`).
2. Four `StatCard`s: Headcount 128 (users, "+4 this month") · Present today 118 (user-check,
   "92%") · On leave 6 (calendar, "2 sick", warning) · Open requests 14 (inbox, "5 urgent",
   danger).
3. Row (gap 20):
   - **Attendance this week** card (grows): caption "Share of people checked in by 10:00",
     `Tabs` Week / Month; `BarChart` Mon 12 … Sun 18 = 91, 94, 96, 93, 95, 52, 0 with Fri 16
     highlighted; legend dots: On time 88% (primary), Late 5% (warning), Field visit 3%
     (detail), Absent 4% (danger).
   - **Needs your attention** card (400 px): caption "14 open", ghost "View all". Four rows in
     tinted wells: avatar, name, request line, `ApproveButtons`.
     Ananya Sharma · Sick leave · 20–21 Oct; Ravi Kumar · Overtime · 6 h on 15 Oct; Priya Menon
     · Travel claim · ₹ 4,820; Kabir Singh · Field visit · Pune client.
4. Row of three cards:
   - **October payroll**, "Pay date 31 Oct · 14 days left", badge accent "In progress"; `Ring`
     72% "ready" centred; checklist rows (icon, label, mono count): Attendance locked 128 / 128
     (check, success) · Overtime approved 18 / 21 · Claims approved 42 / 47 · Tax declarations
     119 / 128 (clock, warning).
   - **Coming up**, "Next 14 days": icon tile + title + caption: Neha Gupta turns 27 · Birthday
     · Tue 20 Oct (star) · Ravi Kumar · 2 years · Work anniversary · Thu 22 Oct (award, detail)
     · Diwali (Deepavali) · Company holiday · Sat 7 Nov (calendar, warning) · 3 people join ·
     Onboarding · Mon 26 Oct (user-plus, success).
   - **Headcount by team**, "128 people": label, mono count, `ProgressBar` scaled to the
     biggest team: Engineering 54, Sales 22, Operations 18, Finance 12, People 8, Design 14.

## Data

```ts
type HomeSummary = {
  headcount: number;
  joinedThisMonth: number;
  presentToday: number;
  onLeave: number;
  sickToday: number;
  openRequests: number;
  urgentRequests: number;
  attendanceWeek: { label: string; pct: number }[];
  requests: {
    employee: { initials: string; name: string };
    kind: 'leave' | 'overtime' | 'claim' | 'field';
    summary: string;
  }[];
  payroll: {
    month: string;
    payDate: string;
    daysLeft: number;
    readyPct: number;
    checks: { label: string; done: number; total: number }[];
  };
  events: {
    kind: 'birthday' | 'anniversary' | 'holiday' | 'joining';
    title: string;
    when: string;
  }[];
  teams: { name: string; count: number }[];
};
```

## States

- Approve/decline in "Needs your attention" removes the row optimistically and shows a toast.
- Phone: stat cards 2 × 2, everything else one column (keep the existing rule that the calendar
  card is hidden on phones; it is not on this screen any more).
