# 17 Analytics & reporting

Route `/analytics`. Demo data. App shell, "Analytics" active. The user wants reports built from
the data given to the engine: HR types a question and gets a report.

## Layout

1. `PageHeader`: eyebrow "Insights", title "Analytics & reporting", description "Ask a question
   about your people data and get a report you can share." Actions: default "Schedule" (calendar),
   primary "Export report" (download; PDF or Excel).
2. **Ask** card: well (`bg-surface-2 shadow-inset-sm`, radius 16) with spark icon, the question
   text field ("Show attrition by team for the last 12 months and what drives it") and primary
   "Build report" (arrow). Under it "Try:" + suggestion chips (raised pills): Overtime cost by
   month · Leave taken vs balance · Gender pay gap by level · New joiner 90-day retention.
3. Report header: H2 "Attrition report · Nov 2025 – Oct 2026", caption "Built from 142 employee
   records, 14 exits and 104 survey replies · updated just now"; right `Tabs` 12 months · Quarter
   · YTD.
4. `StatCard`s: Attrition rate 10.9% (trend, "-2.1 pts") · Exits 14 (log-out, "9 voluntary",
   warning) · Avg tenure at exit 1.8 yrs (clock, "+0.3") · Regretted exits 4 (alert, "High
   performers", danger).
5. Two columns:
   - **Exits by month** (grows), "Voluntary and involuntary", ghost "Show data" (eye; toggles a
     table). `BarChart` N D J F M A M J J A S O = 1, 0, 2, 1, 1, 3, 2, 0, 1, 2, 1, 0 (total 14),
     April highlighted.
   - **Attrition by team** (380 px), "Rate over 12 months": Sales 18.2% (danger) · Operations
     12.5% (warning) · Engineering 9.3% · Finance 8.0% · Design 6.7% · People 0.0%, bars scaled to
     Sales.
6. Two columns:
   - **What the data says** (grows), "Written by the report engine · check before sharing",
     badge accent "AI summary". Four wells with icon tile + sentence:
     - Sales loses people 2× faster than the company average. 5 of 6 Sales exits were in their
       first 18 months. (trend, danger)
     - People who left were paid 11% below the median for their level, based on October salary
       bands. (wallet, warning)
     - Exits fell after the manager training in April: 1.4 a month before, 0.9 a month after.
       (users, info)
     - Exit interviews most often mention growth (6), pay (5) and travel load (3). (message,
       success)
   - **Saved reports** (380 px), "12 reports", ghost "New": icon tile, name, schedule caption,
     chevron: Monthly headcount · Every 1st · emailed to leadership · Payroll cost by team · Every
     payroll run · Absenteeism heatmap · Weekly · Monday 9:00 · Diversity snapshot · Quarterly ·
     board pack · Overtime vs budget · Monthly · finance.

## Data and engine

```ts
type Report = {
  title: string;
  period: string;
  sources: string;
  kpis: StatCardProps[];
  charts: (
    | {
        kind: 'bars';
        title: string;
        caption: string;
        labels: string[];
        values: number[];
        highlight?: number;
      }
    | {
        kind: 'ranked';
        title: string;
        caption: string;
        rows: { label: string; value: number; tone?: BadgeTone }[];
      }
  )[];
  insights: { icon: string; tone: BadgeTone; text: string }[];
};
```

For now "Build report" returns the demo attrition report after a short loading state (skeleton
cards, "Building your report…"). Later the API turns the question into queries over the
company's own data and returns this `Report` shape; the summary must only cite numbers that
appear in the charts.

## States

- Loading: skeletons for KPIs and charts.
- Unanswerable question: `Banner` "I couldn't build that report from your data yet" + suggestions.
