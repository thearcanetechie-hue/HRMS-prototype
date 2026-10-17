# 13 Learning & development

Route `/learning`. Demo data. App shell, "Learning" active. The list is course by course, as
the user asked: each course shows who leads it, the schedule, how many registered, and progress.

## Layout

1. `PageHeader`: eyebrow "Growth", title "Learning & development", description "Courses run by
   Acme, who has signed up and how far along they are." Actions: default "Course library"
   (book), primary "Create course" (plus).
2. `StatCard`s: Running courses 9 (graduation cap, "3 mandatory") · Registrations 214 (users,
   "+38 this month") · Avg completion 61% (trend, "+7%") · Learning hours 1,320 h (clock, "This
   quarter").
3. Row: `Tabs` All courses · Ongoing · Upcoming · Completed · Mandatory; right team `Chip`s All
   teams (on), Engineering, Sales.
4. Two columns:
   - **Courses** card (grows), caption "Listed course by course · sorted by start date". Each
     course is a row (radius 16, padding 14; the selected one raised, alternate rows tinted):
     icon tile 44 · title block (name bold, caption "category · Led by X", status badge below) ·
     Schedule (caption + value) · Registered (big number + "/ seats") · Avg progress (caption +
     mono %, `StackedBar` done / in progress / not started, caption "N done · N going · N not
     started").

     | Course                   | Category · lead                               | Schedule        | Registered | Avg  | Done / going / not started | Status    |
     | ------------------------ | --------------------------------------------- | --------------- | ---------- | ---- | -------------------------- | --------- |
     | POSH awareness 2026      | Mandatory · Compliance · Led by Meera Iyer    | 1 – 31 Oct      | 128 / 128  | 74%  | 95 / 18 / 15               | Ongoing   |
     | Applied AI for engineers | Engineering · 6 sessions · Led by Rahul Verma | 7 Oct – 11 Nov  | 46 / 50    | 52%  | 8 / 30 / 8                 | Ongoing   |
     | Consultative selling     | Sales · 4 sessions · Led by Sneha Das         | 14 Oct – 4 Nov  | 22 / 25    | 38%  | 2 / 14 / 6                 | Ongoing   |
     | First-time managers      | Leadership · cohort 3 · Led by Tanvi Mehta    | 21 Oct – 16 Dec | 14 / 16    | 12%  | 0 / 9 / 5                  | Ongoing   |
     | Payroll basics for leads | Finance · 2 sessions · Led by Priya Menon     | 3 – 10 Nov      | 18 / 30    | 0%   | 0 / 0 / 18                 | Upcoming  |
     | Information security 101 | Mandatory · Compliance · Led by IT team       | Sept 2026       | 126 / 128  | 100% | 126 / 0 / 0                | Completed |

     Status badge tones: Ongoing accent, Upcoming warning, Completed success.

   - Right (340 px):
     - **Selected course** (POSH awareness 2026), "Mandatory for everyone · due 31 Oct": `Ring`
       74% "done" + legend Completed 95 · In progress 18 · Not started 15; eyebrow "Learners";
       rows avatar + name + thin bar + mono %: Arjun Reddy 20% · Neha Gupta 60% · Kabir Singh 0% ·
       Vinod S. 0%; default full-width "Remind 33 people" (bell).
     - **Next sessions** "This week": date tile (weekday + day, `bg-primary/8 text-primary`) +
       title + caption: Mon 19 Applied AI · session 3 · 11:00 · Google Meet · Wed 21 First-time
       managers · 15:00 · Board room, Bengaluru · Thu 22 Consultative selling · 16:30 · Zoom.
5. "Create course" opens a `Dialog`: title, category, lead (employee search), mandatory switch,
   audience (everyone / teams / people), seats, schedule (dates and sessions, with meeting link
   from Integrations), materials upload.

## Data

```ts
type Course = {
  id: string;
  title: string;
  category: string;
  lead: string;
  mandatory: boolean;
  schedule: string;
  registered: number;
  seats: number;
  done: number;
  inProgress: number;
  notStarted: number;
  status: 'ongoing' | 'upcoming' | 'completed';
};
type Learner = { employee: Person; progress: number };
type Session = { courseId: string; title: string; at: string; where: string };
```
