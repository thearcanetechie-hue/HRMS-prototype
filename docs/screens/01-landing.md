# 01 Landing page

Route `/` (replace the redirect in `app/page.tsx`). Signed-in visitors still go straight to
`/dashboard`; everyone else sees this page. Public, no app shell. Full width, content padded
96 px left and right on desktop, 24 px on phones.

## Sections, top to bottom

1. **Hero (always dark)**. Wrap in a `dark` class container so it uses the dark tokens in both
   themes. Padding 28 top, 96 bottom.
   - Nav row: logo + "HRMS"; links Product, Modules, Pricing, Customers, Resources (muted
     semibold, 32 px apart); right side "Sign in" (link to `/login`) and primary button
     "Start free trial" (link to `/signup`).
   - 88 px gap, then two columns (64 px gap):
     - Left: pill `bg-primary/14 text-primary` with spark icon, "Built for Indian companies ·
       PF, ESI, PT, TDS ready". Headline 60/800, line height 1.06, tracking -2%: "The HR
       platform your people will actually enjoy." Sub 18 px muted, max 540 px: "Attendance,
       leave, payroll, documents, learning and engagement in one calm, premium workspace. Set
       up in an afternoon, not a quarter." Buttons 52 px high: primary "Start free trial" (arrow
       icon), default "Book a demo" (video icon). Trust row with check icons: "14-day free
       trial", "No card needed", "Data stored in India".
     - Right: a 560 px product preview card in the **light** theme (wrap in a `light` class):
       "Good morning, Meera" + badge success "Payroll ready"; three mini stats in wells (128
       Employees, 94% Present today, 6 Leave requests); "Attendance this week · Avg 93%" bar
       chart Mon–Sat 88, 92, 95, 91, 97, 62 with Fri highlighted; a leave row "Ananya Sharma ·
       Sick leave, 20 – 21 Oct · 2 days" with a small primary "Approve" button.
   - 72 px gap, logo strip: eyebrow "Trusted by teams at", then names as muted 18 px bold text:
     Kestrel Labs, Northwind, Saffron Retail, Vayu Mobility, Indigo Health, Tarang Media.
2. **Modules** (page background). Centred eyebrow "Everything HR, one login", H2 40 px
   "Fourteen modules that work as one", sub "Start with the basics and switch on more as you
   grow. Every module shares the same people data." Then a 4-column grid of 12 cards
   (`IconTile` + title + one line):
   Employee records (users) Profiles, IDs and history in one place · Attendance & leave (clock)
   Biometric sync, shifts and leave rules · Payroll & compliance (wallet) PF, ESI, PT and TDS
   calculated for you · On/offboarding (user-plus) Checklists that run themselves · Performance
   (target) Goals, reviews and workload · Learning (graduation cap) Courses, enrolments and
   progress · Documents (folder) Scan, convert and find any file · Engagement (heart) A feed your
   team wants to read · Inbox (inbox) Internal messages and approvals · Expenses (receipt) Claims,
   overtime and payouts · Assets (briefcase) Laptops, cards and who holds them · Integrations
   (plug) Teams, Meet, Zoom, Jira and more.
3. **Payroll feature**, two columns. Left: eyebrow "Payroll & compliance", H2 38 px "Payroll
   that closes in an afternoon", paragraph "Attendance, overtime and approved claims flow
   straight into payroll. Statutory deductions are worked out, payslips go out, and challans
   are ready to file." Four check rows (check in a 24 px tinted circle): "PF, ESI, PT and TDS
   calculated per state", "Payslips emailed and in the employee app", "ECR, Form 16 and Form 24Q
   exports", "Bank transfer file for every major bank". Right: card "October 2026 payroll ·
   128 employees · pay date 31 Oct" + badge accent "Ready to run"; five rows with label, mono
   amount and a progress bar: Gross pay ₹ 1,12,40,000 (100%), PF (employer + employee)
   ₹ 10,84,320 (42%), ESI ₹ 1,26,500 (12%), Professional tax ₹ 25,600 (6%), TDS ₹ 9,62,180 (38%);
   buttons "Preview payslips" (default, eye) and "Run payroll" (primary, play).
4. **Stats band (dark)**: four columns, 44 px numbers in `text-primary`: 1,240+ Companies on
   HRMS · 2.1 lakh Payslips every month · 3 min Average leave approval · 99.95% Uptime this year.
5. **Pricing** (page background). Eyebrow "Pricing", H2 "Simple pricing per employee", `Tabs`
   Monthly / "Yearly · save 20%" (yearly selected). Three cards:
   - Starter ₹ 79 / employee / month, "For teams finding their feet": Employee records,
     Attendance & leave, Documents, Up to 50 people. Default button "Start free trial".
   - Growth ₹ 149, "Everything most companies need", **highlighted**: inverted card (foreground
     colour as background, background colour as text) with a gold "Most popular" pill:
     All of Starter, Payroll & compliance, Performance & learning, Engagement feed & inbox.
     Primary button "Start free trial".
   - Enterprise "Custom", "For large and multi-entity groups": All of Growth, SSO and audit
     exports, Custom integrations, Dedicated success manager. Default button "Talk to sales".
6. **CTA and footer (dark)**. CTA card: "Bring your whole team in this week" (34 px) / "Import
   from Excel or connect your database. We help you move, free." + "Book a demo" and primary
   "Start free trial". Footer columns: brand + "HR software for Indian companies. Made in
   Bengaluru."; Product (Modules, Pricing, Security, Changelog); Company (About, Customers,
   Careers, Contact); Resources (Help centre, Payroll guide, API docs, Status). Bottom row
   "© 2026 HRMS Technologies Pvt Ltd" and "Privacy · Terms · DPDP compliance".

## Notes

- Static content; no data calls. Put copy in a `lib/marketing.ts` constant so it is easy to edit.
- Phone: hero columns stack (preview card below), module grid 1 column, pricing cards stack.
- Dark mode: sections 2, 3 and 5 switch to dark tokens; the highlighted pricing card becomes a
  pearl card with dark text.
