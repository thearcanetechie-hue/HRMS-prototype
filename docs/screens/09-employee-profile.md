# 09 Employee profile

Route `/employees/[id]` (replaces the current detail page; keep its API calls and the existing
rules for who can see or reveal PAN, Aadhaar, UAN and bank details). Attendance, leave,
documents and performance cards are demo until those modules exist.

## Layout

1. Breadcrumb: "Employees" › "Ananya Sharma".
2. **Hero card** (padding 28, horizontal): 88 px avatar tile (radius 28, crimson gradient in
   light, gold in dark, glow, initials 28 px); name (H1) + status badge; line "Senior Engineer ·
   Engineering · reports to Rahul Verma"; meta row with small `text-detail` icons: EMP-101 ·
   Bengaluru · ananya@acme.in · +91 98860 44120 · Joined 03 Jan 2024. Actions: default "Message"
   (links to Inbox with this person), primary "Edit profile".
3. `Tabs`: Overview · Job & pay · Attendance · Leave · Documents · Performance · Timeline.
4. Overview: two columns.
   - Left (grows), three key–value cards, two pairs per row; labels are 12 px bold uppercase
     muted, values semibold:
     - **Personal details** (ghost "Edit"): Date of birth 14 Mar 1994 · Gender Female · Blood
       group B+ · Marital status Single · Personal email ananya.s@gmail.com · Emergency contact
       Raj Sharma · +91 98450 22110 · Current address HSR Layout, Bengaluru 560102 · Languages
       English, Hindi, Kannada.
     - **Job & pay**: Department Engineering · Designation Senior Engineer · Employment type
       Full time · permanent · Work location Bengaluru HQ · Annual CTC ₹ 18,50,000 · Pay group
       Bengaluru · monthly · Shift General · 09:30 – 18:30 · Notice period 60 days.
     - **Statutory and bank (encrypted)**, caption "Visible to HR admins only", ghost "Reveal"
       (eye). Masked values in mono with a lock icon: PAN ABCPS•••4K · Aadhaar •••• •••• 4412 ·
       UAN 1009•••••327 · ESI number Not applicable · Bank account HDFC ••••••6612 · IFSC
       HDFC0001234. "Reveal" calls the existing reveal endpoint and is audit-logged.
   - Right (380 px):
     - **October attendance** "1 – 17 Oct": `Ring` 100% "12/12 days" + rows Avg check-in 09:14 ·
       Avg hours 8 h 42 m · Late marks 0 · Overtime 3 h.
     - **Leave balance** "2026": label, "N of M left", `ProgressBar` (remaining / total, tone per
       type): Paid leave 11 of 18 (info) · Sick leave 8 of 12 (warning) · Casual leave 5 of 8
       (success) · Comp off 1 of 2 (primary).
     - **Documents** "6 files", ghost "Upload": file tile, name, status caption, download icon:
       Offer letter.pdf · Signed · 28 Dec 2023 · Aadhaar card.pdf · Verified · PAN card.jpg ·
       Verified · Form 16 FY25.pdf · Issued 12 Jun.
     - **Performance** "H1 2026 review", badge success "Exceeds": goals with mono % and bar: Ship
       payments v2 100% · Mentor 2 engineers 70% · Cut API latency 30% 55%.
5. Other tabs reuse the same cards full width; Timeline reuses `ActivityItem` from 08.

## States

- Self view (`/profile`) uses the same layout with the employee's own edit rights.
- Without permission, the statutory card shows "Ask HR to see these details".
