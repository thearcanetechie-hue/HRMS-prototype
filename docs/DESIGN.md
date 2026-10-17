# Design system

The web app (`apps/web`) is styled with Tailwind CSS v4 and a small set of shared components in
`apps/web/components/ui`, written in the shadcn/ui style (Radix primitives for anything
interactive, `class-variance-authority` for variants, `lucide-react` for icons).

Open `/design` in the running app to see every piece in the current theme.

## Themes

|         | Light                                     | Dark                                           |
| ------- | ----------------------------------------- | ---------------------------------------------- |
| Palette | Soft Pearl & Crimson Depth                | Obsidian Black & Antique Gold                  |
| Look    | Pearl shell, warm white cards             | Soft black cards with a gold glow              |
| Accent  | Crimson, with Warm Sand for small details | Antique gold, with Warm Sand for small details |

The theme follows the device setting until the person flips the switch in the top bar
(`next-themes`, stored per browser). Both themes are defined as CSS variables in
`app/globals.css`; Tailwind classes such as `bg-surface`, `text-primary` and `shadow-raised`
read those variables, so a screen written once works in both themes.

## Rules for new screens

- Build from `components/ui` (`Card`, `Button`, `Input`, `Select`, `Field`, `Badge`, `Table`,
  `Dialog`, `PageHeader`, `IconTile`, `ProgressRing`, `Switch`). Add a new shared component
  there rather than styling one-offs inside a page.
- Use the semantic colour tokens (`primary`, `muted-foreground`, `success`, `warning`,
  `danger`, `info`), never raw hex values or Tailwind palette colours, so both themes stay right.
- No borders on any component. Cards, buttons and the selected nav item stand out with
  `shadow-raised` / `shadow-raised-sm`; inputs and read-only wells use `bg-surface-2`, optionally
  with `shadow-inset-sm`. Badges and icon tiles use a soft tint of their colour (`bg-current/12`,
  `bg-accent-2/14`) instead of an outline. Table rows are separated by a faint zebra stripe.
- `text-detail` is for eyebrows and other small accents; `accent-2` colours icon tiles.
- One `variant="primary"` button per screen for the main action; it carries the coloured glow.
- Every page starts with `PageHeader`; errors use `Banner`; empty tables use `TableEmpty`.
- Status pills map through `STATUS_TONE` in `lib/format.ts`.
- Check new screens in both themes and at phone width (the sidebar collapses below `lg`).
