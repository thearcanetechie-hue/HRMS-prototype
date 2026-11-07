# 02 Sign in

Route `/login`. Keep the current login logic (workspace slug + email + password, existing error
handling); this is a layout change. Replaces `AuthLayout` for this page.

## Layout

Two columns, full height (min 960 px on desktop):

- **Left brand panel**, 620 px, always dark (`dark` class), padding 48/56:
  - Top: logo + "HRMS".
  - Bottom-aligned block: eyebrow (primary) "Your people, in one place"; 40 px headline "Run HR
    the calm way. Attendance, payroll and growth in one workspace."; 16 px muted "Built for
    Indian teams: PF, ESI, PT and TDS handled, payslips on time, and every document a search
    away."
  - Three small stat cards (radius 16, `shadow-raised-sm`): 98.6% Payroll on time · 3 min To
    approve leave · 1,240 Companies (number 24 px in `text-primary`).
  - Quote card: "We closed October payroll for 340 people in an afternoon. The compliance
    reports were simply there." — avatar "RN", Rohan Nair, Head of People, Kestrel Labs.
- **Right form side**, page background, padding 48/64, form centred:
  - Top right: "New to HRMS?" + link "Create a workspace" (arrow icon) to `/signup`.
  - Card 440 px wide, radius 24, padding 36, gap 20: H1 "Welcome back", muted "Sign in to your
    company workspace."; fields Workspace (building icon, e.g. "acme"), Work email (mail icon),
    Password (lock icon); row: checkbox "Keep me signed in" + link "Forgot password?"; primary
    full-width "Sign in"; divider "or continue with"; two default buttons "Google" and
    "Microsoft" (visual only for now, disabled with a "Coming soon" title); caption with shield
    icon "Single sign-on (SAML) available for your company".
  - Bottom caption: "Protected by 256-bit encryption · Data stored in India".

## States

- Submitting: button shows a spinner and "Signing in…", fields disabled.
- Error: `FormError` under the password field with the API message.
- Phone: brand panel hidden; form card full width.
- Dark: same; the right side uses dark tokens.
