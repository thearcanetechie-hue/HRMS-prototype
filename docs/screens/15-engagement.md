# 15 Engagement feed

Route `/engagement`. Demo data. App shell, "Engagement" active. A LinkedIn-style feed for the
company.

## Layout

1. `PageHeader`: eyebrow "People", title "Engagement", description "Wins, thank-yous and news
   from across Acme." Actions: default "Pulse survey" (chart), primary "New post" (edit).
2. Two columns (gap 24):
   - **Feed** (grows):
     - Composer card: avatar + pill input (`bg-surface-2 shadow-inset-sm`, radius 999)
       "Share an update, a win or a thank-you"; action row: Photo (image, info), Kudos (award,
       warning), Poll (chart, success), Event (calendar, primary) as icon + muted label; right
       `Chip` "Everyone" (globe) for audience.
     - Row: `Tabs` For you · Announcements · Kudos · My team; right "Sort: Latest".
     - Post card (padding 22): avatar 44, name + optional badge, "role · time", more button;
       body text (max 600 px, line height 1.55); optional attachment; reaction summary (three
       overlapping 22 px circles with thumbs-up, heart, star + "N reactions", "N comments" on the
       right); action row of four equal buttons in `bg-surface-2/60`: Like, Comment, Kudos, Share.
       Posts:
       1. Kabir Singh, Account Executive, Sales · 2 h · badge success "Win": "We just signed
          Saffron Retail, our biggest deal this year. 42 stores, 3 states. Huge thanks to Sneha,
          Vikram and the solutions team for the late nights." Image card 220 px high with a
          crimson-to-gold gradient, eyebrow "SAFFRON RETAIL × ACME" and "Deal signed · 16 Oct
          2026". 48 reactions, 12 comments.
       2. Meera Iyer, HR Manager · 5 h · badge accent "Announcement": "Diwali at Acme is on. Join
          us for lunch, rangoli and the lantern contest. Families welcome after 5 pm." Event
          card: date block NOV 6 (`bg-primary` with glow), "Diwali celebration 2026", "Friday ·
          12:30 – 19:00 · Bengaluru, Pune and online", "86 going · 12 maybe", primary "RSVP".
          126 reactions, 31 comments.
       3. Tanvi Mehta, Engineering Manager · Yesterday: "Kudos to Arjun for owning his first
          production release in week one. Calm, careful and well documented." Kudos card
          (`bg-warning/10`): award tile, "KUDOS · OWNERSHIP", "Arjun Reddy", avatar. 64
          reactions, 9 comments.
   - Right (320 px):
     - **Team pulse** "October survey · 104 replies": `Ring` 82% with "8.2 of 10"; bars Feel
       recognised 86% · Manager support 79% · Workload is fair 64% (warning, under 70).
     - **Celebrations** "Today and this week": avatar, name, caption, "Wish" pill: Neha Gupta ·
       Birthday · Tue (star, primary) · Ravi Kumar · 2 years at Acme · Thu (award, detail) · Arjun
       Reddy · Joined this week (user-plus, success).
     - **Poll** "Ends Friday · 71 votes": "Where should the Q4 offsite be?" options as rows with
       %: Coorg 46% (voted, primary tint) · Goa 34% · Rishikesh 20%.
     - **Trending**: wrapped tag pills (`bg-primary/8 text-primary`): #DiwaliAtAcme,
       #PaymentsV2, #SaffronWin, #Kudos, #NewJoiners.

## Data

```ts
type Post = {
  id: string;
  author: Person & { role: string };
  at: string;
  tag?: { label: string; tone: BadgeTone };
  body: string;
  attachment?:
    | { kind: 'image'; title: string; caption: string }
    | { kind: 'event'; date: string; title: string; when: string; going: number; maybe: number }
    | { kind: 'kudos'; value: string; to: Person }
    | { kind: 'poll'; question: string; options: { label: string; pct: number }[] };
  reactions: number;
  comments: number;
};
```

## States

- New post opens a `Dialog` with text, attachment type, audience; posts appear at the top.
- Empty feed: "Be the first to post" + "New post".
