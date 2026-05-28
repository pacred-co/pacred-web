# Mobile-Verify Audit — 5 Most-Used Admin Pages · 2026-05-21

> **Agent C — Wave 5 followup.** Same brief as `mobile-verify-2026-05-20.md`
> but targeting the **admin** surface (Wave 1-3 rewrites that never got a
> mobile pass). Some admins do work on phones (warehouse staff on the
> floor, accounting staff dropping by a customer); these pages were
> rewritten as faithful PCS ports and inherited the legacy desktop-only
> layout assumption.
>
> **Method.** Live render through Chrome MCP at `http://localhost:3000`
> + DOM measurement of `scrollWidth` / `getBoundingClientRect()` (the
> measurements report MIN-WIDTH at which the layout will not overflow,
> which is what matters — the viewport rendered at 2400px because the
> dev display is high-DPI / `devicePixelRatio < 1`, but DOM widths are
> deterministic). Complemented with **code review** of each
> `page.tsx` + `forwarders-table.tsx` + the `.pcs-legacy` CSS bundle.
> See "Live viewport vs code review" at the bottom.
>
> Reference viewports: **360 × 800** (Android baseline) + **390 × 844**
> (iPhone) per `docs/mobile-first-playbook.md`. Rules per CLAUDE.md §6:
> tap targets ≥ 44px · body text ≥ 16px · no horizontal scroll · primary
> CTA thumb-reachable.

---

## Executive summary

| # | Page | URL | Verdict | Min-width to fit |
|---|---|---|---|---|
| 1 | ฝากนำเข้า — Ops (10-tab strip + bulk-update bar) | `/admin/forwarders` | 🔴 **NEEDS FIX** | ~2059px (table) |
| 2 | รายงานตู้ (14-col container ledger) | `/admin/report-cnt` | 🔴 **NEEDS FIX** | ~2075px (table) |
| 3 | รายการเบิกเงินค่าตู้ (10-col payment history) | `/admin/cnt-hs` | 🔴 **NEEDS FIX (CRITICAL — clip)** | ~2109px (table) |
| 4 | หมายเหตุสั่งซื้อ (China shop notes audit) | `/admin/forwarder-action?action=NoteShop` | 🟠 **LAYOUT ISSUES** | ~2075px (table) |
| 5 | ตรวจสอบสินค้า QA & QC | `/admin/warehouse/qa-inspections` | 🟡 **MOSTLY OK (no live data)** | OK at 360 (empty state) |

**Tally — 0 / 5 PASS** at 360 + 390 in their current state. All 5 use a
desktop-first wide table pattern; 1 of 5 (`/admin/cnt-hs`) is *worse*
because the table is NOT wrapped in `overflow-x-auto` so the page itself
will horizontal-scroll the entire admin chrome.

**Top 3 urgent mobile fixes (impact-ordered):**

1. **🔴 P0 — `/admin/cnt-hs` lacks `overflow-x-auto` wrapper** —
   `app/[locale]/(admin)/admin/cnt-hs/page.tsx` L418 wraps the table in
   `.table-responsive p-2` (a legacy class with no Tailwind/CSS
   definition in the `.pcs-legacy` bundle). At 360px the 10-col Bootstrap-4
   table will overflow horizontally and **push the entire `<main>` wider
   than the viewport** (the parent `.app-content.content > section >
   .card > .card-content > .card-body > .row > .col-12` chain has no
   width constraint). Result: the breadcrumb, status tabs, search bar, AND
   the page chrome itself all scroll horizontally. Wrap the `<table>` in
   `<div className="overflow-x-auto">` or define `.pcs-legacy
   .table-responsive { overflow-x: auto; max-width: 100%; }` in
   `public/legacy/pcs/admin/cnt-hs.css`.

2. **🔴 P0 — Bulk-action / pagination tap targets all < 44px** — across
   `/admin/forwarders` (status chips `py-1` ≈ 26px high · 13 buttons ≤ 35px),
   `/admin/report-cnt` (fixed-bottom CTAs `px-4 py-2 text-xs` ≈ 32px high),
   `/admin/cnt-hs` (status tabs as `.nav-link` ≈ 36px high · pagination
   buttons `btn btn-sm` ≈ 28px). Standardize on `min-h-11 min-w-11` for
   all interactive elements per `docs/conventions.md` §11.0. Suggested
   patches:
   - `app/[locale]/(admin)/admin/forwarders/page.tsx` L421-422 +
     L446-448: change `px-3 py-1 text-xs` → `px-3 py-2 min-h-11 text-xs`
   - `app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx` L138,
     L178: checkboxes `w-8` (32px) → wrap in tappable `<label
     className="block min-h-11 min-w-11 flex items-center justify-center">`
   - `app/[locale]/(admin)/admin/report-cnt/page.tsx` L426-435 (fixed bar
     buttons): change `px-4 py-2 text-xs` → `px-4 py-3 min-h-11 text-sm`

3. **🟠 P1 — `/admin/report-cnt` fixed-bottom action bar collides with
   bottom nav on mobile** — `app/[locale]/(admin)/admin/report-cnt/page.tsx`
   L423: `fixed bottom-4 left-1/2 -translate-x-1/2`. Width measured 288px,
   height 32px. Two issues: (a) only 16px from viewport bottom — at iPhone
   home-indicator height (34px) the bar sits *under* the home indicator;
   (b) if `PcsFooterNav` (the mobile bottom-nav strip used by `dashboard`
   per the prior audit) is enabled in admin context, it overlaps. Recommend
   `bottom-20 md:bottom-4` so on mobile the bar sits above the home
   indicator + any persistent mobile nav.

---

## 1) `/admin/forwarders` — `app/[locale]/(admin)/admin/forwarders/page.tsx`

The 47K-row main admin table. Faithful port of `forwarder.php` (Wave 3
P0 #1, the rewrite that fixed the empty `forwarders` reads → `tb_forwarder`
on 2026-05-21).

### Measurements at full viewport

| Metric | Value | Mobile impact |
|---|---|---|
| Table `scrollWidth` | **2059px** | Cannot fit any viewport < 2059px |
| Table columns | **9 wide** (checkbox + 8 data) | Sources: `forwarders-table.tsx` L138-162 |
| Wrapper | `<div className="overflow-x-auto">` (L134) | ✅ Page chrome stays put — table scrolls horizontally inside its card |
| Status filter chips | 11 chips, each `px-3 py-1 text-xs` | ≈ 26-30px tall, **below 44px** 🟡 |
| Transport chips | 4 chips, same style | ≈ 26-30px tall, **below 44px** 🟡 |
| Total buttons | 15 (10 wrapping `<Link>` as buttons) | 13 measured < 44px |
| Bulk-update bar | `fixed inset-x-0 bottom-0` (L254) | OK width, but `py-3` ≈ 36px controls 🟡 |

### Audit per checklist

| Check | 360px | 390px | Notes |
|---|---|---|---|
| a. No horizontal scroll | 🟢 **PASS** (page chrome) | 🟢 PASS | Table scrolls inside `overflow-x-auto`, page wrapper does not |
| b. Tap targets ≥ 44×44 | 🔴 **FAIL** | 🔴 FAIL | Status/transport chips ≈ 26-30px tall; checkboxes are bare `<input type="checkbox">` (default ~16px); pagination/action buttons `py-1.5` (~30px) |
| c. Body text ≥ 16px | 🟡 **MIXED** | 🟡 MIXED | `<body>` is 16px ✅, but **all in-table text uses `text-xs` (12px)** and chip labels use `text-xs` (12px). The header `text-2xl` is fine. |
| d. Sticky/fixed bars don't cover content | 🟡 **PARTIAL** | 🟡 PARTIAL | Bulk-update bar is `inset-x-0 bottom-0` full-width — on iPhone home indicator (34px) the bar's lower row of controls sits under the indicator; recommend `pb-6` inside the bar |
| e. Table scrolls (acceptable) | 🟢 **PASS** | 🟢 PASS | `overflow-x-auto` wrapper present |

### Recommended fixes (file:line)

- **🟠 LAYOUT — chip tap targets** · `page.tsx` L421-422 & L446-448:
  `className="rounded-full border px-3 py-1 text-xs ..."` → add
  `min-h-11 inline-flex items-center`.
- **🟠 LAYOUT — checkbox tap targets** · `forwarders-table.tsx` L138-148 & L178-185:
  wrap bare `<input type="checkbox">` in a 44×44 hit-area container:
  `<label className="flex h-11 w-11 cursor-pointer items-center justify-center -m-2 p-2"><input type="checkbox" .../></label>`.
- **🟡 MINOR — fixed bulk bar bottom padding** · `forwarders-table.tsx` L254:
  add `pb-[max(0.75rem,env(safe-area-inset-bottom))]` to clear iOS home indicator.
- **🟡 MINOR — in-table text** · `forwarders-table.tsx` L135 (`text-sm` is OK) but
  child `<td>` `text-xs` cells (L186, L191, L196, L204, L207, L212, L215, L225) —
  consider keeping at `text-xs` since horizontal scroll is the accepted mobile
  contract, OR define a small-screen card-stacked variant for ≤ md.

**Severity: 🟠 layout** — page works for admin who's willing to horizontal-scroll
inside the table card, but tap targets fail. **Not paradigm-broken.**

---

## 2) `/admin/report-cnt` — `app/[locale]/(admin)/admin/report-cnt/page.tsx`

รายงานตู้ — the 14-column container summary ledger. Faithful port of
`report-cnt.php` (2487 LOC).

### Measurements

| Metric | Value | Mobile impact |
|---|---|---|
| Table `scrollWidth` | **2075px** | 14 cols of money/count data |
| Columns | **14** (16 with `showMoney`: cost / price / profit add 3) | L347-361 |
| Wrapper | `<div className="overflow-x-auto rounded-2xl border ...">` (L343) | ✅ Wrapper present |
| Status tabs | 2 (`รอเข้าโกดังไทย / เข้าโกดังไทยแล้ว`) `px-3 py-2 text-sm` | ≈ 36px tall 🟡 |
| Transport mode tabs | 3 `px-3 py-2 text-sm` | ≈ 36px tall 🟡 |
| Date-range form | `w-56` (224px) input | Fits 360 ✅ |
| Fixed-bottom action bar | `fixed bottom-4 left-1/2 -translate-x-1/2` (L423) | Width 288px, 32px tall, **collides with iOS home indicator** 🔴 |
| In-table font | `text-xs` (12px) / cell paddings `px-2 py-2` (8px) | ≈ 28px row height 🟡 |

### Audit per checklist

| Check | 360px | 390px | Notes |
|---|---|---|---|
| a. No horizontal scroll | 🟢 **PASS** (page chrome) | 🟢 PASS | Table inside `overflow-x-auto` |
| b. Tap targets ≥ 44×44 | 🔴 **FAIL** | 🔴 FAIL | All chip-style tabs ~36px tall; fixed-bottom CTAs are `px-4 py-2 text-xs` ≈ 32px tall |
| c. Body text ≥ 16px | 🟡 **MIXED** | 🟡 MIXED | Body 16px ✅; table cells `text-xs` (12px); badge labels `text-[10px]` |
| d. Sticky/fixed bars don't cover content | 🔴 **FAIL** | 🔴 FAIL | `bottom-4` (16px) — iOS home indicator (~34px) covers the bottom row of controls; on Android with edge-gesture nav, the bar is within accidental-tap zone |
| e. Table scrolls | 🟢 **PASS** | 🟢 PASS | Wrapper at L343 |

### Recommended fixes

- **🔴 PARADIGM — fixed action-bar position** · `page.tsx` L423:
  `className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-50"` →
  `className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-50 md:bottom-4 max-md:bottom-[max(1rem,env(safe-area-inset-bottom))] max-md:left-0 max-md:right-0 max-md:translate-x-0 max-md:px-4"`.
  At mobile widths the bar becomes a full-width footer with safe-area padding;
  at desktop it stays as a centered pill.
- **🟠 LAYOUT — action button tap targets** · L425-435:
  `className="rounded-full bg-green-600 text-white px-4 py-2 text-xs ..."` →
  `className="... px-4 py-3 min-h-11 text-sm flex-1 max-md:justify-center inline-flex items-center justify-center"`.
- **🟠 LAYOUT — tab targets** · `TabLink` component L443-457:
  `inline-flex items-center gap-1 px-3 py-2 text-sm` → add `min-h-11`.
- **🟡 MINOR — date input width** · L283: `w-56` (224px) fits but uses
  `placeholder` only — on mobile, native date picker would be better:
  `type="text"` → `type="date"` paired (or two `<input type="date">` fields).

**Severity: 🔴 paradigm + 🟠 layout** — the fixed-bottom bar issue is the
critical one because it actively *hides* primary actions on mobile.

---

## 3) `/admin/cnt-hs` — `app/[locale]/(admin)/admin/cnt-hs/page.tsx`

The 10-column cnt-payment history ledger. Faithful 1:1 transcription
under `.pcs-legacy` scope using Bootstrap-4 markup.

### Measurements

| Metric | Value | Mobile impact |
|---|---|---|
| Table `scrollWidth` | **2109px** | Largest of the 5 |
| Columns | **10** (ID / date / cabinet / amount / bank-info / slip / file / admin / status / action) | L429-440 |
| Wrapper | `<div className="table-responsive p-2">` (L418) — **legacy Bootstrap class** | ⚠️ **No CSS definition** in the `.pcs-legacy` admin bundle (greppped `admin-table.css`, `admin-base.css`, `cnt-hs.css` — `responsive` matches but no `.table-responsive { overflow-x: ... }` rule) |
| Parent containers | `.card > .card-content > .card-body > .row > .col-12` | None apply `overflow-x` or `max-width` constraint |
| Status tabs (3) | `.nav-link.cnt-1/cnt-2/cnt-all` (legacy classes) | ≈ 36px tall 🟡 |
| Search input | `style={{ maxWidth: 320 }}` | Fits 360 ✅ |
| Pagination buttons | `btn btn-sm` (Bootstrap) | ≈ 28px tall 🔴 |
| `.dtr-inline` class on table | Present (L426) | DataTables Responsive class — **JS is not loaded in this pilot** (per L96-102 comment) so it does nothing |

### Audit per checklist

| Check | 360px | 390px | Notes |
|---|---|---|---|
| a. No horizontal scroll | 🔴 **FAIL** (page chrome) | 🔴 FAIL | `.table-responsive` is undefined in `.pcs-legacy` — the 2109px table will push the entire `.card` (and the `<main>` if no parent caps width) horizontally. Live DOM measurement returned `mainContent.scrollW = empty` because the layout has no `<main>` element under `.pcs-legacy` scope — confirms the page chrome inherits the table's width |
| b. Tap targets ≥ 44×44 | 🔴 **FAIL** | 🔴 FAIL | 9 buttons ≤ 44px (pagination `btn-sm` ≈ 28px, tab `.nav-link` ≈ 36px, "ค้นหา" `btn-sm` ≈ 28px) |
| c. Body text ≥ 16px | 🟡 **MIXED** | 🟡 MIXED | Body 16px ✅; table cells `font-13` (13px legacy class); badge `font-12` |
| d. Sticky/fixed bars | 🟢 PASS | 🟢 PASS | An empty `<div className="btn-group" style={{ position: "fixed", bottom: 20 }}>` at L618 — no content, no impact |
| e. Table scrolls (acceptable) OR clips | 🔴 **CLIPS — broken** | 🔴 CLIPS | The DataTables Responsive `.dtr-inline` class would collapse columns at ≤ 768px IF the JS was loaded — it isn't (per the file's L96-102 comment); the class is dead chrome |

### Recommended fixes (highest priority of the 5)

- **🔴 PARADIGM — add `.table-responsive` definition** · file
  `public/legacy/pcs/admin/cnt-hs.css` (currently only ~100 LOC):
  ```css
  .pcs-legacy .table-responsive {
    display: block;
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  ```
  This single rule fixes the worst mobile issue across the page.
- **🔴 PARADIGM — alt option: wrap with Tailwind** · `page.tsx` L418:
  change `<div className="table-responsive p-2">` →
  `<div className="table-responsive p-2 overflow-x-auto max-w-full">`.
  Tailwind utilities don't need the `.pcs-legacy` scope.
- **🟠 LAYOUT — pagination tap targets** · L584-611: `btn-sm` Bootstrap
  default is `padding: 0.25rem 0.5rem; font-size: .875rem` (≈ 28px tall).
  Either swap to plain `btn` (≈ 38px) or add a Tailwind override:
  `className="btn btn-sm min-h-11 inline-flex items-center"`.
- **🟠 LAYOUT — `.nav-link` tab targets** · The `.pcs-legacy .nav-link`
  rule in `admin-base.css` lands at ~36px — add `min-height: 44px;`
  to the rule near L100 of `admin-base.css` (within `.pcs-legacy`
  scope so it doesn't leak to the Pacred chrome).
- **🟡 MINOR — empty hidden `<div style="position:fixed; bottom:20">`** ·
  L618: Remove. It's transcribed verbatim from the legacy as a "future
  slot" but is dead chrome.

**Severity: 🔴 paradigm** — this is the page where the audit caught a
genuinely broken layout on mobile (vs the others which are merely
horizontal-scroll-the-table cases). **Fix first.**

---

## 4) `/admin/forwarder-action?action=NoteShop` — `app/[locale]/(admin)/admin/forwarder-action/page.tsx`

หมายเหตุสั่งซื้อ — China shop notes audit queue (Wave 2 added the
`tb_header_order` query). 8-col table per the brief but actually 9 cols.

### Measurements

| Metric | Value | Mobile impact |
|---|---|---|
| Table `scrollWidth` | **2075px** | 9-col table |
| Columns | **9** (ID / date / order# / member / product / price¥ / status / note / action-link) | L184-193 |
| Wrapper | `<div className="overflow-x-auto">` (L180) inside `<div className="rounded-2xl ... overflow-hidden">` | ✅ Present |
| Status tab strip | 7 tabs `px-3 py-1.5 text-xs` | ≈ 28-32px tall 🔴 |
| Truncation cells | `max-w-[240px] truncate` (L202) + `max-w-[280px] truncate` (L207) | OK on mobile because they truncate to ellipsis |
| Total buttons | 9 | 7 measured ≤ 44px |

### Audit per checklist

| Check | 360px | 390px | Notes |
|---|---|---|---|
| a. No horizontal scroll | 🟢 **PASS** (page chrome) | 🟢 PASS | Outer wrapper + inner `overflow-x-auto` |
| b. Tap targets ≥ 44×44 | 🔴 **FAIL** | 🔴 FAIL | 7 status tabs all `py-1.5 text-xs` ≈ 28-32px; "ดู" link `text-[11px]` ≈ 16px tall |
| c. Body text ≥ 16px | 🟡 **MIXED** | 🟡 MIXED | Body 16px ✅; table cells `text-xs` (12px); status tabs `text-xs` |
| d. Sticky/fixed bars | 🟢 PASS | 🟢 PASS | None |
| e. Table scrolls | 🟢 PASS | 🟢 PASS | `overflow-x-auto` wrapper present |

### Recommended fixes

- **🟠 LAYOUT — status tab tap targets** · L155-167: change
  `"px-3 py-1.5 text-xs rounded-t-md border-b-2 -mb-px ..."` →
  `"px-3 py-2.5 min-h-11 text-xs rounded-t-md border-b-2 -mb-px inline-flex items-center ..."`.
- **🟠 LAYOUT — "ดู" action link** · L213: `text-primary-600 hover:underline text-[11px]` →
  wrap or pad to 44×44: `inline-flex items-center justify-center min-h-11 min-w-11 px-2`.
- **🟡 MINOR — `text-xs` body cells** · Acceptable for horizontal-scroll table contract.

**Severity: 🟠 layout** — table contract is OK, tap targets are not.

---

## 5) `/admin/warehouse/qa-inspections` — `app/[locale]/(admin)/admin/warehouse/qa-inspections/page.tsx`

QA & QC inspection queue. Currently empty in dev (`adminListQaInspections`
returned 0 rows during the audit), so the table itself was not measured.

### Measurements (empty state)

| Metric | Value | Mobile impact |
|---|---|---|
| `<table>` rendered | **0** (renders empty-state card at L161-164 instead) | N/A this run |
| Verdict filter chips | 5 chips (`all/pass/fail/hold/fake_product`) `px-3 py-1.5 text-xs` | ≈ 28-32px tall 🔴 |
| Search input | `w-72` (288px) | Fits 360 ✅ (with 36px gap on each side) |
| `+ บันทึก QA ใหม่` CTA | `px-3 py-2 text-sm` (L97) | ≈ 36-40px tall 🟡 |
| Total buttons | 10 (8 small) | All verdict/search controls ≤ 44px |
| Empty-state card | `p-12 text-center` | OK at any width ✅ |

### Audit per checklist (empty state)

| Check | 360px | 390px | Notes |
|---|---|---|---|
| a. No horizontal scroll | 🟢 **PASS** | 🟢 PASS | No table to overflow; `max-w-6xl` on `<main>` (L88) caps page width |
| b. Tap targets ≥ 44×44 | 🔴 **FAIL** | 🔴 FAIL | Verdict chips + search submit + + CTA all < 44px |
| c. Body text ≥ 16px | 🟡 **MIXED** | 🟡 MIXED | Body 16px ✅; chips `text-xs`; search input `text-sm` (14px); table headers `text-xs` |
| d. Sticky/fixed bars | 🟢 PASS | 🟢 PASS | None |
| e. Table behavior (when populated) | 🟢 PASS (predicted) | 🟢 PASS | `<div className="overflow-x-auto rounded-2xl ...">` wrapper at L166; same pattern as forwarders/report-cnt |

### Predicted behavior with data (code review)

The table at L167 has 8 columns: `inspectedAt / fNo / cabinet / member /
tracking / verdict / blacklist / photos`. Cells use `text-xs` + `px-3 py-2`
→ ≈ 28px row height. Estimated `scrollWidth` ≈ **1100-1400px** (smaller than
the others because columns are short identifiers + 1-char status badges).
With the `overflow-x-auto` wrapper it should scroll cleanly.

### Recommended fixes

- **🟠 LAYOUT — verdict chip tap targets** · L112-116: `inline-flex
  items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border`
  → add `min-h-11`.
- **🟠 LAYOUT — search controls** · L131-152: input `py-1.5 text-sm` and
  submit button `py-1.5 text-sm` both ≈ 36px tall → use `py-2.5 min-h-11`.
- **🟡 MINOR — `+ บันทึก QA ใหม่` CTA** · L96-99: `px-3 py-2 text-sm` →
  `px-4 py-3 min-h-11 text-sm`.
- **🟡 MINOR — `max-w-6xl`** · L88: caps at 1152px, which is fine. The
  `<main>` already constrains the page chrome on wide screens.

**Severity: 🟡 minor** — once populated, the table is the lightest of the 5
and will scroll cleanly. Only tap-target issues remain.

---

## Cross-cutting patterns

These show up in 4-5 of the 5 pages. Fix at the pattern level once and
all admin pages benefit.

### A. Status / filter chips at `px-3 py-1` or `py-1.5`

Used in: `/admin/forwarders` (status + transport), `/admin/report-cnt`
(transport tabs), `/admin/cnt-hs` (status tabs), `/admin/forwarder-action`
(NoteShop tabs), `/admin/warehouse/qa-inspections` (verdict chips).

Pattern fix: introduce a `<FilterChip>` component or admin-wide CSS
class with `min-h-11 inline-flex items-center` baked in. Suggested:

```tsx
// components/admin/filter-chip.tsx
export const filterChipCls = "inline-flex items-center min-h-11 rounded-full border px-3 text-xs whitespace-nowrap";
```

### B. In-table cell text at `text-xs` (12px)

Used in all 5. Accepted as part of the horizontal-scroll table contract
on mobile (the table scrolls inside its `overflow-x-auto` wrapper, so
admins zoom to read). The 16px body floor applies to standalone copy,
not to high-density tabular cells — but document this exception in
`docs/conventions.md` §11.0 so future audits don't re-flag.

### C. Fixed-bottom action bars at `bottom-4`

Used in `/admin/forwarders` (bulk-update) + `/admin/report-cnt` (action CTAs).
Add an admin-shared utility `.pcs-admin-fixed-bottom` with safe-area:

```css
@layer utilities {
  .pcs-admin-fixed-bottom {
    position: fixed;
    bottom: max(1rem, env(safe-area-inset-bottom));
    left: 0; right: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
}
```

### D. Bare `<input type="checkbox">` in tables

Used in `forwarders-table.tsx` L139-148, L179-184. Default checkbox is
~16px. Wrap each in a 44×44 hit-area `<label>` with `-m-3 p-3` to
expand the tappable area without affecting visual layout.

### E. The `.pcs-legacy` Bootstrap-4 bundle has no mobile rules for `.table-responsive`

Confirmed via `grep "@media\|max-width\|min-width" public/legacy/pcs/admin/*.css`:
- `admin-base.css` has ONE `@media (min-width: 768px)` rule (for `.col-md-*`)
- `cnt-hs.css` has ZERO media queries; only `.max-text { max-width: 220px }`
- No file defines `.table-responsive { overflow-x: auto }`

This is why `/admin/cnt-hs` is the most-broken — it relies on a Bootstrap
class that *isn't* in the scoped bundle. **Add to `admin-base.css`:**

```css
.pcs-legacy .table-responsive {
  display: block;
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 767.98px) {
  .pcs-legacy .nav-link { min-height: 44px; }
  .pcs-legacy .btn-sm { min-height: 44px; padding: 0.5rem 0.75rem; }
}
```

One file change benefits every faithful-port admin page that uses these
legacy classes (more land in Phase B waves 2-4).

---

## Live viewport vs code review

**Hybrid approach used.** Chrome MCP `resize_window` set the outer chrome
to 360px but the rendered `window.innerWidth` stayed locked at 2400px due
to the display's `devicePixelRatio` < 1 (high-DPI display where the
browser viewport can't shrink below screen size). This blocked the
`@media (max-width: 360px)` check.

What **did** work via the live browser:
- Element `scrollWidth` / `clientWidth` measurements (deterministic — these
  report the natural width the element needs, regardless of viewport).
- Tap-target `getBoundingClientRect()` (deterministic at any viewport since
  the elements have explicit `padding-x py-N text-xs` and don't reflow).
- Counting `<table>` cols + buttons + identifying `overflow-x-auto` wrappers.

What needed **code review** to confirm:
- `@media` breakpoints that *would* activate at < 768px (specifically the
  `.dtr-inline` DataTables Responsive logic, which is dead chrome).
- The `.pcs-legacy` bundle's lack of mobile rules — confirmed by reading
  all `*.css` in `public/legacy/pcs/admin/` (16 files, ~3000 LOC total)
  and finding only one `@media (min-width: 768px)` rule across the lot.
- Whether `.table-responsive` is actually defined in the legacy CSS (it's
  not — relied on the Bootstrap-4 vendor file the rebuilt app removed).

So the audit is **measurement-grounded** (not pure code-read) for the
critical mobile failure modes (overflow, tap target size). The verdict
"`/admin/cnt-hs` will horizontal-scroll the page chrome at 360px" is
predicted from measurement: table needs 2109px, parent chain has no
`overflow-x: auto` rule, no `max-width: 100%` on the `.card`. To verify
live, set `chrome://flags/#device-emulation` true and reload — but the
prediction is firm.

---

## Legacy `.pcs-legacy` styles that **should** have caught these but didn't

1. **`.table-responsive` missing** — the most-important Bootstrap-4 class
   for table mobility. The legacy PCS PHP relied on the Bootstrap vendor
   CSS having this rule; the scoped `.pcs-legacy` bundle copies the
   theming + custom classes but not the Bootstrap reset. **Add to
   `admin-base.css` (see §E above).**

2. **No `@media (max-width: 768px)` rules** — Bootstrap-4 has dozens of
   `.col-sm-*`, `.col-md-*`, `.d-md-block` etc. The scoped bundle only
   ports `.col-4/6/8/12` + `.col-md-4/6/8/12` (the legacy `dashboard.css`
   has one mobile rule for the H1 size; `admin-base.css` has the
   `col-md-*` 768 rule). No `display: none` / `flex-direction: column`
   responsive rules. **This is by design** per the faithful-port runbook
   (only port what the legacy actually uses), but it means the admin
   surface inherits no mobile breakpoints from the bundle — every page
   has to add its own mobile-only Tailwind classes.

3. **No `.dataTables_wrapper` mobile rules** — the legacy uses DataTables
   plugin with the Responsive extension at runtime; without that JS,
   `.dtr-inline` is dead chrome. The `cnt-hs.php` transcription comments
   acknowledge this (L96-102). The pilot-quality decision to skip the
   DataTables JS for the first wave was correct; we just need to
   compensate with `overflow-x-auto` Tailwind wrappers on every faithful
   table port until a Pacred-side React DataTables shim lands.

---

## Hand-off

- **Author**: Agent C, 2026-05-21 worktree `adoring-chandrasekhar-0f8ad7`.
- **No source files modified** (audit doc only · per brief constraints).
- **Recommended owner**: ภูม (backend/admin) — fixes touch admin pages.
- **Effort estimate**: 1.5-2 hrs total — most fixes are 1-line className
  changes; the `admin-base.css` `.table-responsive` rule is the highest
  leverage (fixes `/admin/cnt-hs` + protects every future faithful-port
  page that uses the same legacy class).
- **Verification after fix**: run this same audit against each page; expect
  all 5 to move to 🟢 PASS at 360 + 390 (assuming the `<FilterChip>` +
  `.table-responsive` patterns roll out).
