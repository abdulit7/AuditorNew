# Distributor & Retail Audit Management: UI/UX Design System

Stack: React + Tailwind + shadcn/ui + Lucide. Two surfaces share one token set: **Manager dashboard (desktop-first)** and **Auditor PWA (mobile-first, 360-430px)**.

## 1. Direction

- **Style:** Minimalism / Swiss (clean, grid-based, high contrast). Fits enterprise dashboards and non-technical users.
- **Mode:** **Light-first.** The tool's generated default was a dark terminal theme; it was rejected because auditors work outdoors in daylight on phones. Dark mode is a later option.
- **Dials:** variance 3 (calm, predictable), motion 3 (subtle), density 7 on manager tables, 4 on auditor screens (big touch targets).
- **Tone:** trustworthy and audit-like. Colour is reserved for *status*, so status is never lost in decoration.

## 2. Colour tokens (shadcn-compatible)

| Token | Hex | Use |
|---|---|---|
| `--primary` | `#1E3A5F` | Nav, primary buttons, headings |
| `--primary-foreground` | `#FFFFFF` | Text on primary |
| `--secondary` | `#2563EB` | Links, selected rows, focus accents |
| `--accent` | `#16A34A` | Verified / Approved / success |
| `--background` | `#F8FAFC` | App background |
| `--card` | `#FFFFFF` | Cards, tables |
| `--foreground` | `#0F172A` | Body text |
| `--muted` | `#E9EEF5` | Table headers, read-only fields |
| `--muted-foreground` | `#475569` | Secondary text (4.5:1 on white) |
| `--border` | `#CBD5E1` | Dividers, inputs |
| `--destructive` | `#DC2626` | Rejected, errors, delete |
| `--ring` | `#1E3A5F` | Focus ring (2px + 2px offset) |
| `--warning` | `#B45309` | Under Review, Low GPS Accuracy (text on `#FEF3C7`) |

### Semantic status chips (always icon + text, never colour alone)

| Status | Colour | Icon (Lucide) |
|---|---|---|
| Draft / In Progress | slate | `Pencil` / `Loader` |
| Submitted | blue | `Send` |
| Under Review | amber | `Eye` |
| Approved | green | `CheckCircle2` |
| Rejected | red | `XCircle` |
| Flagged | red outline | `Flag` |
| GPS Verified | green | `MapPinCheck` |
| Outside Allowed Radius | red | `MapPinOff` |
| Low GPS Accuracy | amber | `SignalLow` |
| Location Unavailable | slate | `MapPinX` |
| Awaiting Verification | blue | `Clock` |
| Approved Exception | purple | `ShieldCheck` |

Group A / Group B: neutral outlined badges ("Group A", "Group B") in two distinct tints, kept separate from audit-status colours so they are never confused.

## 3. Typography

- **Fira Sans** (400/500/600/700) for UI; **Fira Code** only for codes and numerals (`GUJ-T01`, quantities, Rs. values), using `font-variant-numeric: tabular-nums` so columns align.
- Base 16px, line-height 1.5; table text 14px on desktop only; nothing below 12px.
- Scale: 12 / 14 / 16 / 20 / 24 / 32.
- Currency format: `Rs. 46,800` (en-PK grouping). CTN display: 2 decimals (`10.83 CTNs`); full precision is kept in data, never in the UI.

## 4. Spacing, shape, motion

- 4px grid. Auditor screens: 16px gutters, 12px between cards. Manager: 24px page padding, 8px table cell padding.
- Radius 8px (cards, inputs), 999px (chips). Shadows minimal (`0 1px 2px`), borders do most of the work.
- Motion: 150-250ms ease-out for hover/press/expand; no page-level animation; respect `prefers-reduced-motion`.
- Touch targets ≥ 44×44px with ≥ 8px between them (auditor app); `cursor-pointer` on all clickable items.

## 5. Manager dashboard layout

- Left sidebar (collapsible to icons): Dashboard · Geography (Cities, Territories, Locations, Sub-locations, Shops) · Distributors · Product Catalog (Group A / B) · Auditors · Territory Assignments · Stock Audits · Shop Audits · Reports · Users · Settings.
- Top bar: global search, city filter, date range, user menu.
- Under 1024px the sidebar becomes a drawer.
- **Dashboard:** KPI row (the 17 SRS cards grouped into 4 clusters: Network, People, Audits, Alerts; "GPS Mismatches" and "Pending Reviews" get the strongest emphasis and link straight to filtered lists). Below: stock-value-by-distributor (bar), audit trend (line, dashed/solid + direct labels), Group A vs B (two-segment bar with counts), recent activity feed.
- **Tables:** shadcn DataTable + TanStack Table, sticky header, filters above (Date, City, Territory, Distributor, Auditor, Status, GPS), pagination, row click opens a detail page. Under 768px, rows collapse into cards.
- **Distributor detail:** tabs *Overview · Assigned Products · Deleted Products · Stock Audit History*. Deleted Products rows carry a **Restore** button; Remove uses a confirm dialog explaining that history is kept.
- **Territory page:** tree view (Territory → Location → Sub-location → Shop) beside a map; the active distributor shown as a card with "Change distributor" (ends assignment, keeps tree).
- **Coordinates picker (shared component):** lat/lng inputs plus "Pick on map" and an always-visible map preview after save.
- **Audit review:** two-column: left = entries table + photos; right = sticky review panel (GPS map with registered/actual/distance, Approve, Reject with mandatory reason, Flag, comments, history timeline).

## 6. Auditor PWA layout

Bottom navigation (max 5): **Home · Territories · Audit (+) · History · Profile**. The SRS's other items (Distributors, Retailer Shops) are reached inside *Territories*, which keeps nav simple. The centre **Audit** action opens a sheet: *Distributor Stock Audit* or *Retailer Shop Audit*.

Home: today's assigned territories, drafts to finish (resume card), recent submissions with status.

### Distributor stock audit flow
1. **Select** (stepper City → Territory → Distributor, each a searchable select, only assigned options).
2. **GPS gate:** full-screen state with permission prompt; denial shows a plain explanation and a **Retry** button. Never proceeds with fake coordinates.
3. **Entry list:** header card (distributor, group, territory, date) and a **product search combobox** (type-ahead, eligible products only). Selecting a product creates an **entry card**:
   - Read-only master values (group, boxes/CTN, unit/box, price/box) in a muted block, clearly not editable.
   - Inputs: Qty CTN, Qty Box (`inputmode="numeric"`), Dispatch Date (native date picker), Stacking, Remarks. Visible labels above every field.
   - Live result row: `Total 10.83 CTNs · Rs. 46,800`.
   - Inline validation: negatives blocked, box qty hint if ≥ boxes/CTN.
   - **Add another entry for this product** button duplicates the product with empty batch fields (each batch is its own card).
4. **Sticky summary bar** (always visible): entries · unique products · CTNs · extra boxes · carton equivalents · **total value**. Expandable to full breakdown.
5. **Submit:** review screen, then a confirm dialog; end-GPS captured on submit. Autosaves draft locally after every field change ("Saved just now" indicator).

### Retailer shop audit flow
Drill-down (City → Territory → Location → Sub-location → search shop), then a shop header with registered location. Sections as collapsible cards: Visit status & Open/Closed (large segmented toggles), retailer details, product entries (repeatable card: availability, stock qty, shelf condition, damaged / expired / near-expiry counts, competitor), remarks, photos (camera button first, thumbnail grid, remove with confirm). If the shop is closed or not visited, the product sections collapse so the auditor can submit quickly.

### Offline/low-signal behaviour
Internet is expected, but show a clear banner on connection loss, keep the draft locally, and block *Submit* (not editing) until reconnected.

## 7. Forms and feedback rules

- Visible labels above inputs; never placeholder-only. Helper text below; errors adjacent to the field, plus an error summary at the top on submit.
- Numeric fields use `inputmode="numeric"`; phone `type="tel"`; email `type="email"`.
- Destructive actions (remove product, deactivate distributor/auditor, remove territory assignment) use a confirm dialog that states what is **kept**.
- Skeleton loaders for lists and cards; spinners only on buttons. Toasts for success; inline alerts for blocking problems.
- Empty states say what to do next (e.g. "No shops yet. Add the first shop to this sub-location").

## 8. Reports

- On-screen report mirrors the printed A4 layout: title *STOCK AUDIT REPORT*, two-column header block, 9-column table (one row per batch), right-aligned total.
- Print CSS: A4 portrait, 12mm margins, repeat table header per page, no sidebar/nav, black-on-white.
- Toolbar: **View · Print · Download PDF · Export Excel**.

## 9. Charts

Recharts. Lines use solid/dashed styles plus direct labels; bars have value labels; each chart has a "View as table" toggle and a text summary. Palette: navy `#1E3A5F`, blue `#2563EB`, teal `#0F766E`, amber `#B45309`, slate `#64748B`.

## 10. shadcn component map

Table + DataTable (lists), Form + React Hook Form + Zod (inputs), Command + Popover (searchable selects/product search), Dialog / AlertDialog (confirm), Sheet (mobile filters, audit-type chooser), Tabs (distributor detail), Badge (status), Card, Toast (Sonner), Skeleton, Calendar/Popover (dates), Breadcrumb (geography drill-down).

## 11. Accessibility & pre-delivery checklist

- [ ] Text contrast ≥ 4.5:1 (UI components ≥ 3:1); status never conveyed by colour alone
- [ ] Visible focus ring on every interactive element; logical tab order; dialogs trap and restore focus
- [ ] Icon-only buttons have `aria-label`; decorative icons `aria-hidden`
- [ ] Lucide SVG icons only, no emoji
- [ ] Touch targets ≥ 44px; no hover-only actions
- [ ] `prefers-reduced-motion` respected
- [ ] Test at 375, 768, 1024, 1440px; no horizontal page scroll; safe-area padding for the bottom nav
- [ ] Reserve image/map space to avoid layout shift; lazy-load maps and photos
- [ ] Live calculations announced politely (`aria-live="polite"`) for screen readers
- [ ] PWA: installable manifest, theme colour `#1E3A5F`, update-available prompt
