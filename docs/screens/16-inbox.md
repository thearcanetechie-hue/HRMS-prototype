# 16 Inbox

Route `/inbox`. Demo data. App shell, "Inbox" active (sidebar count pill shows unread). Internal
messages, approvals and announcements.

## Layout

1. `PageHeader`: eyebrow "Communication", title "Inbox", description "Messages, approvals and
   announcements in one place." Action: primary "New message" (edit).
2. Three panes, equal height (gap 20):
   - **Folders** card (210 px): rows icon + label + count pill: All messages 4 (selected,
     `bg-primary/8`, pill `bg-primary`) · Approvals 14 · Announcements · Starred · Sent. Eyebrow
     "Channels" then "# people-team" (unread, bold), "# all-acme", "# engineering",
     "# bengaluru-office", "# payroll-help" (unread).
   - **Conversation list** (330 px card): search well "Search messages"; rows (avatar, name, time,
     subject, one-line preview, optional badge, unread dot `bg-primary`); selected row raised.
     Ravi Kumar · 10:42 · Overtime for stock count · Sharing the sheet with hours for all 6 people…
     · badge warning "Approval" (selected, unread) · Finance team · 09:15 · October payroll inputs ·
     Please lock attendance by Monday so we can… (unread) · Arjun Reddy · Yesterday · Laptop and ID
     card · Got the laptop, still waiting on the access card (unread) · Priya Menon · Yesterday ·
     Notice period question · Can I adjust leave against my last 10 days? · badge "Exit" · Sneha
     Das · Mon · Re: Sales incentive plan · Thanks Meera, the new slabs look clear · IT helpdesk ·
     Mon · Biometric device offline · Pune device is back online after reboot.
   - **Thread** card (grows): header avatar 44 + subject "Overtime for stock count" + "Ravi Kumar ·
     Operations · Pune" + icon buttons star, video (starts a Teams/Meet call via Integrations),
     more. Day divider pill "Today". Messages: theirs on the left in `bg-surface-2` bubbles (radius
     18, bottom-left 6) with a 32 px avatar; mine on the right in `bg-primary` with
     `text-primary-foreground` (bottom-right 6); time under each.
     1. Ravi 10:31: "Hi Meera, we ran the quarterly stock count on Thursday. Six of us stayed back
        for about 6 hours. Sharing the sheet."
     2. Ravi 10:32: "Can this go into October payroll?" + attachment chip
        "stock-count-ot-15oct.xlsx · 6 people · 36 hours".
     3. Meera 10:40: "Thanks Ravi. Hours look right. I have approved 5, and need a manager
        sign-off for Vinod since it was his weekly off."
        Linked request card (`bg-warning/10`): clock tile, "Overtime request · 36 h · ₹ 27,720",
        "5 approved · 1 waiting for manager", default "Open request" (to `/claims`).
        Composer pinned to the bottom of the card: `bg-surface-2 shadow-inset-sm` radius 16,
        attach icon, "Write a reply…", spark icon (suggest a reply), 40 px `bg-primary` send button.
3. Phone: one pane at a time (folders → list → thread with a back button).

## Data

```ts
type Conversation = {
  id: string;
  with: Person | { channel: string };
  subject: string;
  preview: string;
  at: string;
  unread: boolean;
  tag?: { label: string; tone: BadgeTone };
};
type Message = {
  id: string;
  from: Person;
  mine: boolean;
  text: string;
  at: string;
  attachment?: { name: string; caption: string };
};
```

## States

- No conversation selected: thread pane shows `Empty` "Pick a conversation".
- Sending: bubble appears immediately with a faint "Sending…" caption.
