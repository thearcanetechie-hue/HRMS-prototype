# HRMS Workspace — UI Prototype

A clickable front-end prototype of a multi-tenant HRMS SaaS for Indian companies (2 to 10,000 employees). Black-and-orange theme with depth cards and glass, gradient buttons.

> Prototype only: all names, figures and dates are fictional sample data. There is no backend; state resets on reload.

## Run it

No build step. Open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8080
```

To publish with GitHub Pages: push this folder, then **Settings → Pages → Deploy from branch** and pick the branch and `/ (root)`.

## What's inside

**HR admin view**
- Login and sign-up
- Dashboard: KPIs, attendance trend, pending approvals (approve / reject), next payroll, compliance calendar, team mood
- Employees: search, department filters, "Add employee" drawer with validation
- Attendance & Leave: leave approvals, October calendar with holidays
- Payroll & Compliance: 5-step payroll run, statutory breakdown, anomaly review
- Performance, Meetings (Teams / Google Meet), Notifications
- Customise (no-code): toggle modules, change brand colour live, add custom fields, extend approval workflow

**Employee view** (switch in the sidebar)
- Work Hub: check-in / check-out, mood check-in, tasks, leave balance, app launcher
- Request templates, Calendar & Holidays, "What's good today" feed

**AI assistant** (scripted demo answers for the suggested prompts)

## Tech

Single HTML file: vanilla JavaScript, CSS custom properties, inline SVG icons, Google Fonts (Outfit, Manrope, IBM Plex Mono). Theme tokens are at the top of the `<style>` block (`--acc`, `--acc2`, `--acc-rgb` control the accent colour).

## Next steps

Port screens to React components and connect them to the NestJS + PostgreSQL backend.
