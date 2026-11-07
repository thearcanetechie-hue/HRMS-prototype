# 12 Workload & performance

Route `/performance`. Demo data (workload later comes from Jira, see 18). App shell,
"Performance" active.

## Layout

1. `PageHeader`: eyebrow "Growth", title "Workload & performance", description "See who is
   stretched, how goals are moving and where the H2 review cycle stands." Actions: default "New
   goal" (target), primary "Start review cycle" (play).
2. `Tabs`: Overview · Goals · Reviews · Workload · 1:1s · Feedback.
3. `StatCard`s: Goals on track 78% (target, "+6%") · H2 reviews done 42 / 128 (check, "33%",
   warning) · Over capacity 6 people (alert, "Above 110%", danger) · Avg utilisation 84% (trend,
   "Healthy").
4. Two columns:
   - **Workload by person** (grows): caption "Planned hours as a share of capacity, next 6
     weeks", team `Chip` "Engineering". Heatmap: name column (avatar 30 + name, 190) then one
     cell per week (19 Oct, 26 Oct, 2 Nov, 9 Nov, 16 Nov, 23 Nov), 34 px high, radius 10, label
     "NN%" in 12 px bold. Tone: under 70 info, 70–94 success, 95–110 warning, over 110 danger
     (tint 14%, 22% for danger).
     Ananya Sharma 95 120 115 90 80 70 · Arjun Reddy 60 70 85 90 90 85 · Vikram Joshi 105 110 100
     95 60 40 · Neha Gupta 80 85 90 100 100 95 · Rahul Verma 118 125 112 105 100 90 · Tanvi Mehta
     40 55 70 80 85 85. Legend underneath with the four bands.
   - **H2 2026 review cycle** (360 px), "Closes 15 Dec", badge accent "Live": `Ring` 33%
     "complete" + rows Self review 96 / 128 · Manager review 42 / 128 · Calibration 0 / 128 ·
     Shared 0 / 128; default full-width "Nudge 32 managers" (bell).
5. Two columns:
   - **Company goals** table (grows), caption "24 goals · 18 on track", ghost "All goals".
     Columns: Goal (230, wraps) · Owner (avatar + name, 160) · Due (70) · Progress (bar 96 px +
     mono %, 150) · Status badge. Launch payments v2 in 3 cities · Ananya Sharma · 30 Nov · 82% ·
     On track · Cut support backlog to under 50 · Ravi Kumar · 31 Oct · 48% · At risk (warning) ·
     Close ₹ 3 Cr new revenue in Q3 · Sneha Das · 31 Dec · 64% · On track · Redesign onboarding
     flow · Neha Gupta · 15 Nov · 30% · Behind (danger) · Automate month-end close · Priya Menon
     · 31 Dec · 55% · On track. Bar tone follows status.
   - **Recognition this month** (360 px) "From peers and managers": avatar, name, reason, star
     count pill (warning tint): Ananya Sharma · Shipped payments v2 beta · 12 · Kabir Singh · Won
     the Saffron Retail deal · 9 · Tanvi Mehta · Mentored 3 new joiners · 7.

## Data

```ts
type WorkloadRow = { employee: Person; weeks: { start: string; pct: number }[] };
type Goal = {
  id: string;
  title: string;
  owner: Person;
  due: string;
  progress: number;
  status: 'on_track' | 'at_risk' | 'behind' | 'done';
};
type ReviewCycle = {
  name: string;
  closes: string;
  self: number;
  manager: number;
  calibration: number;
  shared: number;
  total: number;
};
```

## States

- Clicking a heatmap cell opens a popover with that week's tasks (from Jira when connected).
- No review cycle: card shows "No review cycle running" + "Start review cycle".
