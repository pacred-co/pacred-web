# Admin UI design audit — 2026-05-27

**Agent L** · branch `Poom-pacred` HEAD `05ce7a8` · scope = every `.tsx` under `app/[locale]/(admin)/admin/`.

## TL;DR

Across **176 admin route directories**, we found:

- 🟢 **~146 pages — TAILWIND CLEAN** (no Bootstrap markers found · the Pacred design-system baseline).
- 🔴 **9 pages — CHROME LEGACY** (entire page chrome under `.pcs-legacy` scope · loads `admin-base.css` · Bootstrap-4 markup verbatim).
- 🟠 **4 pages — FORM LEGACY** (Tailwind chrome but the form-island inside renders `form-control` / `col-md-X` / `alert alert-*` Bootstrap classes; Wave 20 P1 batch 2-a explicitly deferred these form internals to Wave 21).
- 🟡 **2 pages — MODAL LEGACY** (Tailwind page chrome BUT a child component still uses `data-toggle="modal"` jQuery openers — these will silently fail to open in pages that don't load jQuery).
- ⚪ **9 pages — DELIBERATE faithful-transcription stubs** (CHROME LEGACY but documented as "match-legacy-chrome on purpose" — e.g. barcode handheld-scanner pages, accounting hub).

Zero `data-bs-toggle` (Bootstrap-5 syntax) occurrences anywhere. All legacy modal triggers still use the BS4 `data-toggle="modal"` form.

## Method

1. `Grep` for Bootstrap class signatures (`btn btn-*` / `form-control` / `col-md-*` / `modal fade` / `panel panel-*` / `alert alert-*` / `input-group` / `nav-tabs`) under `app/[locale]/(admin)`.
2. `Grep` for `.pcs-legacy` scope wrapper, `data-toggle="modal"`, jQuery `$()` selectors.
3. Cross-referenced hit-bearing files against the known-good Pacred Tailwind references (`/admin/admins/page.tsx` · `/admin/forwarders/page.tsx` · `/admin/reports/refunds/page.tsx`).
4. **Read top-of-file doc comments** for each candidate to classify INTENT — many "Bootstrap hits" turn out to be (a) inside JSDoc comments referencing the legacy, (b) deliberate faithful 1:1 transcriptions of legacy admin pages (CHROME LEGACY by design — per AGENTS §0a where copy-100%-first applies).
5. Verified chrome state by grepping for `<main className="p-` (Pacred chrome) vs `<div className="pcs-legacy">` (legacy chrome) on each suspect page.

## 🔴 CHROME LEGACY (highest priority — full Bootstrap-4 chrome rendering)

These pages render `<div className="pcs-legacy">` + `<link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />` and use Bootstrap-4 markup top-to-bottom. The CSS is sandboxed but visually JARRING vs neighboring Pacred-Tailwind pages.

| File | BS hits | pcs-legacy | Notes |
|---|---|---|---|
| `admin/cnt-hs/page.tsx` | 8 | yes | รายการเบิกเงินค่าตู้ · faithful 1:1 of `cnt-hs.php` · DAILY ops surface (CS + accounting workflow). |
| `admin/service-orders/cart/page.tsx` | 16 | yes | รถเข็นแอดมิน · faithful 1:1 of `cart.php` · daily CS purchasing surface. |
| `admin/service-orders/cart/add/page.tsx` | 5 | yes | สั่งสินค้าแบบกำหนดเอง · faithful 1:1 of `search.php?product=custom`. |
| `admin/reports/sales-by-rep/page.tsx` | 9 | yes | ยอดพนักงานขาย · faithful 1:1 of `report-sale.php` (used by mgmt + accounting). |
| `admin/reports/user-sales-history/page.tsx` | 9 | yes | ประวัติลูกค้า · faithful 1:1 of `report-user-sales-history.php`. |
| `admin/reports/user-sales-history/[customer_id]/page.tsx` | 6 | yes | Per-customer drill-in · same audit comments. |
| `admin/reports/system/page.tsx` | 9 | yes | รายงานการเข้าถึงเว็บ · faithful 1:1 of `report-system.php` (admin/super only). |
| `admin/organization-email/page.tsx` + `client.tsx` | 3 + 26 | yes | อีเมลในองค์กร · ALSO uses 2 BS4 modals (see 🟡 below). HR-only. |
| `admin/withdrawal/freight-th/page.tsx` | 4 | yes | P0.5 placeholder stub · explicit "ดูเร็วๆนี้" copy. Pacred-styled would be safer. |

## 🟠 FORM LEGACY (Tailwind chrome, Bootstrap form internals)

These pages have correct Pacred Tailwind chrome (`<main className="p-6 lg:p-8 max-w-5xl mx-auto">`) but the embedded form-island still uses `form-control` / `form-control-label` / `col-md-X` / `row mb-1` / `alert alert-success` — which renders as UNSTYLED inputs because Tailwind doesn't ship those classes and `.pcs-legacy` scope is absent. **Wave 20 P1 batch 2-a explicitly bannered these as "form Tailwind rewrite deferred to Wave 21"** in the page-level doc comments.

| File | BS hits in form | Wave 20 banner present? |
|---|---|---|
| `admin/wallet/add/form.tsx` | 16 (form-control + col-md + alert + form-text) | YES — page.tsx L13-18 documents deferral. |
| `admin/yuan-payments/new/form.tsx` | 15 (same set) | YES — page.tsx L13-18 documents deferral. |
| `admin/customers/transfer-rep/transfer-form.tsx` | 13 | NO explicit banner · but the page.tsx L89-91 doc says "removed `.pcs-legacy` chrome ... same form logic" — form internals slipped through. |
| `admin/forwarders/combine-bill/add/add-form.tsx` | 3 (minimal) | NO banner · low impact (single-input + submit). |

## 🟡 MODAL LEGACY (Tailwind chrome, broken-jQuery modal triggers)

These pages USE Tailwind chrome BUT a child island still emits `data-toggle="modal"` markers — these are no-ops because the (admin) layout no longer loads jQuery + Bootstrap-4 globally (Wave 21 dropped them). The trigger renders but produces no modal.

| File | data-toggle hits | Notes |
|---|---|---|
| `admin/organization-email/client.tsx` | 2 | "เพิ่มใหม่" + "คำอธิบายระบบ" CTAs — modals do not open. HR-only page · low-volume but BROKEN. |
| `admin/barcode/driver/import/import-scanner-panel.tsx` | 1 | "คำแนะนำการใช้งาน" help button — modal does not open. Daily ops (driver USB scanner) · low-stake (help only). |

**Note:** `admin/admins/[id]/admin-profile-client.tsx` doc-comment matches Wave 21 conversion to native `<dialog>` — only 1 `data-toggle="modal"` instance which is INSIDE A DOC COMMENT (line 7). Confirmed clean at runtime. However, the file STILL contains 89 `form-control` classes inside its dialog forms — see "🟠 hybrid case" below.

## 🟠 hybrid case (modal Tailwind-ified, form internals still legacy)

`admin/admins/[id]/admin-profile-client.tsx` is the Wave 21 reference for the native-`<dialog>` conversion (modal CHROME is Pacred Tailwind), but inside each dialog the FORM internals (`form-control-lg` / `form-control-label` / `col-md-*`) still match the legacy. The file's own doc comment (L18-22) acknowledges this is intentional because the dialog WAS originally rendered inside `.pcs-legacy` scope — but if the parent page (`admin/admins/[id]/page.tsx`) is now full-Tailwind, those classes render unstyled. **Validate visually** on /admin/admins/<id> next session.

## ⚪ DELIBERATE faithful-transcription stubs (CHROME LEGACY by design)

Per AGENTS §0a + ADR-0017 + faithful-port-transcription.md §8, these are EXPLICITLY 1:1 transcriptions and their `.pcs-legacy` chrome is the design intent. Don't rewrite unless ภูม signals priority shift:

- `admin/barcode/driver/{all,from,prepare,import}/page.tsx` — 4 handheld USB scanner pages (faithful per agent-3 brief).
- `admin/barcode/cargo/{all,from,prepare,import}/page.tsx` — 4 cargo scanner pages (same).
- `admin/accounting/{payment,withdraw,shop,forwarder,forwarder-invoice}/page.tsx` — 5 accounting-team report pages (faithful 1:1 of `acc-*.php`).

Sub-total: 13 deliberate transcriptions in the "CHROME LEGACY" bucket. Subtracting these from the 9 + 13 raw count above leaves the 9 high-priority CHROME LEGACY entries in the first table.

## 🟢 Verified Tailwind clean (top-10 baseline)

These are the design references — newest Wave 20 / Wave 21 / Wave 22 rewrites. Copy their patterns when rewriting:

1. `admin/admins/page.tsx` — list view · Wave 22 Phase 2.
2. `admin/forwarders/page.tsx` — list with 10-tab status filter (Wave 3 P0 #1).
3. `admin/reports/refunds/page.tsx` — reports template (Wave 20 P0-4 `8071a3d`).
4. `admin/reports/payment/page.tsx` — Wave 20 P1 batch 2-b (same template).
5. `admin/reports/shop/page.tsx` — Wave 20 P1 batch 2-b.
6. `admin/reports/forwarder/page.tsx` — Wave 20 P1 batch 2-b.
7. `admin/forwarders/notes/page.tsx` — Wave 20 P1 cleanup (dropped `.pcs-legacy`).
8. `admin/forwarders/warehouse-history/page.tsx` — Wave 20 P1 rewrite (was 1141 LOC Bootstrap+DT).
9. `admin/customers/[id]/page.tsx` — Wave 20 P0-1 (uses `legacy-view.tsx` for data display).
10. `admin/customers/transfer-rep/page.tsx` — Wave 20 P1 chrome rewrite (form internals still 🟠).

## Suggested rewrite sprint (top 10 highest-impact)

Order by: customer-facing impact ≥ admin-daily ≥ admin-rare. Each entry includes file path · estimate (S < 1h · M 1-3h · L 3-6h) · whether ภูม has flagged before.

| # | Priority | File | Est | Why |
|---|---|---|---|---|
| 1 | P0 | `admin/cnt-hs/page.tsx` | L | DAILY accounting + CS surface · faithful 1:1 of `cnt-hs.php` · CHROME LEGACY · jarring next to Tailwind sister `/admin/forwarders`. |
| 2 | P0 | `admin/service-orders/cart/page.tsx` | L | DAILY CS purchasing · same case as #1 · biggest CS workflow surface still on BS4. |
| 3 | P0 | `admin/organization-email/client.tsx` | M | MODAL LEGACY — "เพิ่มใหม่" + "คำอธิบายระบบ" CTAs CURRENTLY BROKEN (jQuery removed). HR cannot add new emails via UI. |
| 4 | P1 | `admin/wallet/add/form.tsx` | M | FORM LEGACY · explicit Wave 20 deferral · the accounting + CS pain on Monday's batch. |
| 5 | P1 | `admin/yuan-payments/new/form.tsx` | M | FORM LEGACY · same Wave 20 deferral · daily yuan-transfer ops. |
| 6 | P1 | `admin/admins/[id]/admin-profile-client.tsx` | L | 89 form-control hits · dialog forms render unstyled inside Tailwind chrome. Validate first; rewrite if confirmed broken. |
| 7 | P1 | `admin/reports/sales-by-rep/page.tsx` | M | CHROME LEGACY · weekly mgmt report · already has a Tailwind template (`reports/payment/page.tsx`) to copy. |
| 8 | P1 | `admin/reports/user-sales-history/page.tsx` + `[customer_id]/page.tsx` | L | CHROME LEGACY · 2 files · sales-team daily lookup. |
| 9 | P2 | `admin/customers/transfer-rep/transfer-form.tsx` | S | FORM LEGACY · light form (3 fields) · admin-rare (bulk transfer). |
| 10 | P2 | `admin/barcode/driver/import/import-scanner-panel.tsx` | S | MODAL LEGACY (help modal only · low-stake) · driver scanner is daily but the broken help-popup is non-blocking. |

Deferred (don't rewrite — deliberate faithful transcriptions):

- All 8 `admin/barcode/{driver,cargo}/*/page.tsx` scanner pages.
- All 5 `admin/accounting/{payment,withdraw,shop,forwarder,forwarder-invoice}/page.tsx` accounting hub pages.
- `admin/withdrawal/freight-th/page.tsx` (placeholder stub · low-traffic).
- `admin/reports/system/page.tsx` (admin/super only · 1 user).

## Cross-cutting observations

1. **Wave 20 P1 batch 2-a explicitly bannered the form-island rewrites** as deferred to Wave 21 — those bannerings are clear and findable in doc comments. The Wave 21 batch list should pull from this audit.
2. **Wave 21 jQuery+BS4 removal was incomplete** — `organization-email/client.tsx` still emits `data-toggle="modal"` which now no-ops. This is a real bug (HR can't open the add-email modal). Flag for ภูม immediately.
3. **`admin-profile-client.tsx` modal chrome was Tailwind-ified but form internals weren't.** Visual validation pending.
4. **Faithful transcription discipline is mostly respected** — every `.pcs-legacy`-wrapping page documents its 1:1 intent in the top comment. Audit-reader can trust the doc comments as the design-intent declaration.
5. **No active `data-bs-toggle` (BS5 syntax) anywhere.** All BS4-style triggers only.

## Appendix — raw counts (no judgement)

- Total `.tsx` files under `admin/`: ~180+ (truncated glob).
- Files matching wide Bootstrap regex (`btn btn-` / `form-control` / `col-md-*` / `modal fade` / `panel-*` / `alert alert-` / `input-group` / `nav-tabs`): **33 files · 263 hits**.
- Files matching `pcs-legacy` token: **35 files** (23 actively render the wrapper · 12 only reference it in doc comments).
- Files matching `form-control` JSX attribute: **15 files**.
- Files matching `data-toggle="modal"` JSX attribute: **8 files** (6 of which are deliberate `.pcs-legacy` transcriptions where it WORKS · 2 in Tailwind pages where it DOES NOT — the 🟡 list).
- Files matching `<main className="p-` (Pacred chrome marker): **176 files** = the green-baseline count.
