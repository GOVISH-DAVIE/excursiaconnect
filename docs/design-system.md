# ExcursiaConnect design system

One language for every screen: the public event site, the organiser portal, the Algotech admin, the badge and the staff scanner. It lives in [`src/app/globals.css`](../src/app/globals.css) (tokens and the component layer) and [`src/components/ui.tsx`](../src/components/ui.tsx) (the shared primitives). Nothing on a screen adds a second grid, type scale, radius, button or link style.

## Brand files

`public/brand/` holds three files, each with one job:

| File | Use |
| --- | --- |
| `darkexcursia.svg` | The stacked lockup on light grounds, where it has room to read (badge print, reports, the home page on light). |
| `lightexcursia.svg` | The same lockup on dark grounds: white wordmark, coral icon and "Connect". The home page uses it. |
| `excursia-icon.svg` | The icon alone. `<Wordmark>` sets it beside the name in the system face for rails, bars and "Powered by" lines, where the lockup would be too small to read; on a dark ground the name goes white and "Connect" keeps its coral. |

A real logo keeps its own colours. The icon is never tinted or inverted.

## Tokens

**Colour.** The interface stays neutral; colour comes from one accent and the organiser's own brand.

| Token | Value | Job |
| --- | --- | --- |
| `coral` / `--accent` | `#FF664C` | The one accent: filled buttons, focus ring, the live dot, a count badge. Its label is near-black ink (`--accent-ink #111`), because white on coral reads at 3:1 and fails the 4.5:1 rule. |
| `ink` | `#1C1C1E` | Text, hairlines, the dark ground (the rails, the speakers band). |
| `slate` | `#5B6470` | Muted text at 6:1: dates, meta, the grey run-on of a heading. |
| `mute` | `#6B7280` | Labels at 4.8:1; the floor for any text. |
| `paper` / `--bg` | `#FBFAF8` | The page ground, warm white. |
| `paper-200` / `--surface` | `#F1EFEA` | The surface step: frames, panels, the window behind a programme. |
| `line`, `line-strong` | ink at 11% and 20% | Hairlines and control borders. |
| `ok`, `warn`, `bad` | green, amber, red | Status only (pills, meters), never decoration. |

**Type.** One family, Rethink Sans (`@fontsource-variable/rethink-sans`, bundled so the build works offline), at 400 and 500 only. Headlines are 400 with tight tracking; size carries them, never weight. The floor is 13px; text people read is 16px.

| Token | 1440 / 390 | Use |
| --- | --- | --- |
| `--t-h1` | 72 / 38 | The site hero |
| `--t-h2` | 48 / 30 | Site section headings |
| `--t-h3` | 24 | The footer lede |
| `--t-stat` | 38 / 28 | A number under a heading: a price, a dashboard stat |
| `--t-lead` | 18 | A line under a heading |
| `--t-body` | 16 | Everything people read |
| `--t-small` | 14 | Dates, meta, table cells |
| `--t-label` | 13 | Labels, at 500 |
| `.h1`, `.h2` | 26 / 17 at 500 | The dashboards' page and section titles |

**Radius.** Soft: `--r-sm` 8 (controls), `--r-md` 12 (panels, dashboard cards), `--r-lg` 20 (frames, feature tiles); buttons are pills. Tailwind's `rounded-md`, `rounded-lg` and `rounded-xl` map to the same three values.

**Spacing.** `--s-1` to `--s-10`: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Heading to content 48 (32 on a phone); cards 24 apart (12).

**Motion.** `--m-in` 140ms, `--m-out` 200ms, `--m-press` 90ms, ease `cubic-bezier(.2,.8,.2,1)`. Hover only: a button steps 1px up and 14% toward the ink, presses 1px down at .985; a linked card lifts 2px; a link draws its underline left to right; a chevron moves 3px. Nothing moves on load or on scroll. Reduced motion turns every transition off.

## Components

- **Buttons.** One pair: `.btn-primary` (filled accent, ink label) and `.btn-secondary` (tinted, no border; `.btn-ghost` and `.btn-dark` are kept as aliases). Exactly one filled button marks the main action in any view. The main action of a site carries `.btn-cta`, which adds the drawn chevron; `.btn--xl` is the close's one big button. `.btn-quiet` and `.btn-sm` are the 36px row actions inside tables.
- **Links.** `.link` in running text: a faint hairline at rest, an ink line on hover, an arrow that moves.
- **Surfaces.** `.surface` is a dashboard card (white, hairline, 12px). `.card-link` makes a linked one lift on hover. The card is barely there and never repeats one layout four times: a dashboard's stats are one divided row of ink numbers (`.stat`, a tone shown as a dot by the label), speakers are open entries on hairlines (`.person`), tickets are ruled rows with the price set large and a text link (`.rows--tickets`), registration choices are ruled rows (`.choice`). Boxes go at most two deep.
- **Forms.** `.input` fields are 48px with 16px text; `.label` is 13px at 500. Fields take the accent border and a soft ring on focus.
- **Status.** `.pill` at 13px; `<EventPill>`, `<StatusPill>` and `<Tone>` map states to the status colours.
- **Dashboards.** `<Rail>` (the dark persona rail with the light wordmark), `<PageHeader>`, `<Stat>` (a `--t-stat` number; with an `href` it is a linked card), `<Section>`, `<Tabs>`, `<KV>`, `<Bars>`, `<Meter>`; `.th` and `.td` for tables.

## The public event site

[`src/app/e/[slug]/event-public.tsx`](../src/app/e/[slug]/event-public.tsx) follows the page contract of the taste skill under `.site`:

- One fixed `header.nav` (72px, 56 on a phone) on the same `.wrap` as everything else: `width: min(100% - 160px, 1280px)`, so every edge sits on x 80 and 1360 at 1440, 24 and 366 at 390.
- `main > section` takes the height of its content, the h2 120px under its top (96px on a phone) and 72px of air below. Only the hero fills the first screen: the photograph behind (`.hero--photo`) or a dark ground lit with the organiser's colour (`.hero--dark`), the date and venue, the name, the ticket panel, and the facts bar at its foot. Then about with the numbers and the photo gallery, programme, speakers on the dark band, tickets as pricing cards (`.prices`), sponsors, venue, questions, and `footer.closing`.
- The 12-column `.grid` with `.span-N` and `.begin-7` / `.begin-8` (not `start-7`: Tailwind owns that name as an inset utility).
- The dealt parts: hero `split` (words on five columns, the Day 1 programme as a live window on six), `nav-split`, `footer-columns`, close `close-type`, one dark band (`.ground-inverse`, the speakers), pill buttons.
- Under 640px the words stack first, the secondary becomes a text link, and `nav.actionbar` fixes the main action at the foot (`--bar` keeps content above it).

**The organiser's colour.** The page root carries `className="site brand"` with `--accent` and `--accent-ink` inline from `event.brand.primary`; `readableOn()` in [`src/lib/brand.ts`](../src/lib/brand.ts) picks white or ink for 4.5:1. `.brand` re-points `--action` on the same element, since a custom property that references another resolves where it is declared.

**Copy.** Sentence case everywhere. The h1 names the category and the place; the first screen holds one hard fact; every heading has a noun; buttons are a verb and an object ("Get a ticket", "Choose this ticket"); the main action reads the same in the nav, the hero, the close and the phone bar. No caption under a visual; a sold item's name and price sit inside its tile.

## The Deal Room

The Deal Room reuses the dashboard and site components; what it adds:

- **Staff workspace.** `/dealroom` uses `<Rail>` with a *Signed in as* switcher and the demo clock in its context slot; the nav shows only what the signed-in role may use. Shared bits are in [`src/app/dealroom/bits.tsx`](../src/app/dealroom/bits.tsx): `<Pill tone>` (ok, okSolid, warn, bad, mute, coral, ink), status, decision and readiness pills, `<When>` for clock dates, `<DocLine>` and `<UploadDoc>` (file picker with *Use a sample file*), `<Refusal>` for a role or rule that closes a screen, `<Labeled>`.
- **Refusals before they happen.** A greyed button always says why, next to it or in its title, using the same function the reducer uses to refuse.
- **Participant portal.** `/dr/[appId]` is phone-first: the event's colour in the header (`.brand`), tabs that scroll sideways, cards one column wide. `.dr-track` is the step tracker: a short list on a phone, a row of equal steps from 640px.
- **Public page and form.** `.dr-steps` (how it works), `.dr-toggle` (seeker or provider), `.dr-form`, `.dr-check` and `.dr-verdict` (the self-check), on the site contract above.
- **Dates.** `fmtStamp` for clock times ("Tue 16 Mar, 10:40"); `fmtLong` with the year for dates that can fall in another year, such as the document deletion date.
- **Phone width.** Grid columns that hold a sideways-scrolling row or a wide table carry `min-w-0`, so the page never grows wider than the screen.

## The Exhibition

The Exhibition module (`/exhibition`, `/exhibitor/[id]`, the public exhibit page) follows the Deal Room's patterns; what it adds:

- **Floor plan.** [`<FloorPlan>`](../src/components/floor-plan.tsx) draws a hall to scale in SVG, in metres: booths coloured by `STATUS_STYLE` with their code and a label, hatching for booths off sale, tooltips on hover and focus, arrow keys to nudge the selected booth, a drag ghost that turns red where the reducer would refuse. `paint` replaces the status colour (staffed, not staffed, no stand in Operations); `<PlanLegend extra>` names those colours. Below 640px the plan keeps about 13 px a metre and scrolls sideways inside its card, so a 3 m booth stays a tap target.
- **States.** `<StatePill s>` in [`src/app/exhibition/bits.tsx`](../src/app/exhibition/bits.tsx) maps the stand and logistics states (branding, orders, deliveries, dismantling, issues, staffed) to the Deal Room's pill tones; booking, invoice and exhibitor states have their own pills there.
- **Charts.** The Deal Room kit (`ChartCard`, `HBars`, `StackedColumns`) has three hues; a chart never shows more than three series, so a hue never repeats. Every bar and segment is a link to the records behind it, and every report table downloads as CSV.
- **Refusals.** As in the Deal Room: the reason sits next to the control, from the same function the reducer uses. A whole column that waits on the same thing (rentals before dismantling) says it once, not on every card.
- **Portal.** `/exhibitor/[id]` shares the Deal Room portal's shape: the event's colour in the header, tabs that scroll and keep the active one in view, one-column cards on a phone.

## Checking a page

The taste skill's layout checker runs against the dev server:

```bash
node ~/.claude/skills/design-taste-frontend/assets/layout/check.mjs --url http://127.0.0.1:3000/e/nairobi-brand-summit-2026 --sizes 1440x900,390x844 --shots shots --profile .taste-profile --json
```

Every finding (`edge-left`, `spill`, `screen-height`, `sparse`, `neighbour`, `hero-fold`) fails the page. The event site passes with zero findings at both sizes.
