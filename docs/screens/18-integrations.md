# 18 Integrations

Route `/integrations`. Demo data (connections are not wired yet). App shell, "Integrations"
active. The user named Teams, Google Meet, Zoom and Jira.

## Layout

1. `PageHeader`: eyebrow "Connect", title "Integrations", description "Connect the tools your
   team already uses. Data flows both ways." Actions: default "API & webhooks" (link), primary
   "Request an app" (plus).
2. Row: `Tabs` All · Meetings · Work tracking · Chat · Finance · Devices; right `Chip` "Connected
   5" (check).
3. Two columns:
   - **App grid** (grows), 3 columns of cards (padding 20): 48 px app tile (radius 14, solid app
     colour, white initial; use the apps' official logos only if we have the right to), status
     badge top right (Connected success / Available neutral), name, category eyebrow
     (`text-detail`), two-line description, full-width button: default "Manage" (settings) if
     connected, primary "Connect" (plug) if not.

     | App               | Category      | Description                                                            | State     |
     | ----------------- | ------------- | ---------------------------------------------------------------------- | --------- |
     | Microsoft Teams   | Meetings      | Schedule 1:1s, reviews and interviews; post announcements to channels. | Connected |
     | Google Meet       | Meetings      | Add Meet links to trainings and reviews; sync with Google Calendar.    | Connected |
     | Zoom              | Meetings      | Create Zoom rooms for sessions and record attendance automatically.    | Available |
     | Jira              | Work tracking | Pull assigned work into workload planning and link goals to epics.     | Connected |
     | Slack             | Chat          | Send leave approvals and kudos to Slack, approve with one click.       | Available |
     | Google Workspace  | Accounts      | Create and suspend accounts automatically on joining and exit.         | Connected |
     | Outlook calendar  | Calendar      | Show leave and holidays on everyone's calendar.                        | Available |
     | Tally Prime       | Finance       | Post payroll journals and reimbursements to your books.                | Connected |
     | Biometric devices | Devices       | eSSL, ZKTeco and Matrix devices sync check-ins every 5 minutes.        | Available |

   - Right (360 px):
     - **Jira detail** (shown for the selected app): app tile + "Jira" + "acme.atlassian.net ·
       synced 4 min ago"; eyebrow "What syncs"; toggle rows: Assigned issues to workload · Story
       points become planned hours (on) · Epics to company goals · Goal progress follows epic
       progress (on) · Leave to Jira capacity · Planned leave blocks sprint capacity (on) ·
       Contractors · Include non-employee assignees (off). Eyebrow "Projects mapped": wells with
       mono project key → team: PAY · Payments → Engineering · WEB · Website → Design · OPS ·
       Warehouse → Operations. Buttons: default "Disconnect", primary "Sync now" (refresh).
     - **Recent activity** "All integrations": `ActivityItem`s: Teams meeting created · H2 review
       · Ananya with Rahul · 10:05 (video, info) · Google account created · arjun@acme.in · on
       joining (check, success) · Jira sync finished · 214 issues · 6 teams · 09:58 (refresh,
       primary) · Tally export needs review · 2 ledgers not mapped (alert, warning).
4. "Connect" opens a `Dialog`: what the app will be able to read and write, then the provider's
   sign-in (OAuth) in a new window; for now show "Coming soon".

## Data

```ts
type Integration = {
  id: string;
  name: string;
  category: string;
  description: string;
  connected: boolean;
  color: string;
  account?: string;
  lastSync?: string;
  settings?: { key: string; label: string; caption: string; on: boolean }[];
  mappings?: { from: string; to: string }[];
};
```
