# Orphan-pages audit — admin routes (2026-05-21)

ภูม asked: "หน้าไหนที่สร้างแล้วแต่ยังไม่มีปุ่มกดเข้าไป" — pages that exist but have no entry point in sidebar or top-menu. This is the catalogue.

## Numbers

- **158 admin page.tsx files exist**
- **56 unique hrefs in sidebar-menu.ts**
- **102 admin routes with no sidebar entry**
  - ~70 are detail/sub-routes (`[id]/page.tsx`, `/new/page.tsx`, `/edit/page.tsx`) — linked from list pages, intentionally not in sidebar
  - **~32 are landing pages without a sidebar entry** (this catalogue)
  - 14 of those 32 are reachable via PageTopMenubar from related pages
  - **~18 are truly orphan** (no sidebar + no page menubar)

## 🔴 Phase 1 Essentials — should have a sidebar entry (FIX NOW)

| Page | Current state | Action |
|---|---|---|
| `/admin/warehouse/qa-inspections` | Built (Wave 3D · 2026-05-21 commit ce17af9). menuWarehouse + menuQa link it (L650 + L766) BUT NOT menuSuper. | ✅ FIXED — added "ตรวจสอบสินค้า (QA & QC)" leaf to menuSuper Cargo & Freight section (2026-05-21 commit) |

## 🟡 Phase 2 (super-only · soon-to-launch)

These have been built but are gated to `super` per CLAUDE.md L62-65 — they appear in the menu but with `phase: 2` flag, so non-super roles don't see them. Verify each has a `phase: 2` tag set.

| Page | Current state |
|---|---|
| `/admin/refunds` | Page exists; sidebar entry? — `blockWithdrawalList` may include but verify |
| `/admin/contact-messages` | Page exists; **MISSING from sidebar** — Phase 2 wire pending |
| `/admin/kpi` | Page exists (exec dashboard); **MISSING from sidebar** — Phase 2 wire pending |
| `/admin/board` + `/admin/board/inbox` | Pages exist (work-board); **MISSING from sidebar** — Phase 2 wire pending |
| `/admin/withdrawals` | Page exists; **MISSING** — Phase 2 wire pending (separate from blockWithdrawalList?) |
| `/admin/broadcasts` (parent list) | Sub-pages `/new` + `/[id]` exist; parent list MISSING from sidebar |
| `/admin/tax-invoices` | Page exists; **MISSING from sidebar** — Phase 2 |

## 🟢 Phase 3 (super-only · deeper future)

| Page | Phase |
|---|---|
| `/admin/csv-imports` (+ /upload + /[id]) | 3 |
| `/admin/system/crons` | 3 |
| `/admin/system/notifications` | 3 |
| `/admin/migration/pcs-customers` | 3 (one-shot tool) |
| `/admin/rates` | 3 (admin internal tool) |

## 🟢 Phase 4 (way later)

| Page | Phase |
|---|---|
| `/admin/barcode` (parent home) | 4 — alternative entry, sub-routes already wired in blockBarcode |
| `/admin/inventory` | 4 |
| `/admin/organization-email` | 4 |
| `/admin/admins` (admin staff CRUD) | 4 — surfaced via blockHr → "พนักงาน" |

## ✅ Already reachable via PageTopMenubar (NOT in sidebar by design)

The Pacred-is-one-company pattern (ภูม 2026-05-20 ค่ำ) consolidated the sidebar to slim leaves; the deeper navigation moved to per-page top-menubars. These pages ARE reachable, just not via the sidebar:

- `/admin/report-cnt` + `/admin/cnt-hs` + `/admin/forwarder-action` + `/admin/forwarder-import-warehouse` (via `<TopMenuReport>` on each)
- `/admin/accounting/{cargo,freight,closing,disbursements,forwarder,forwarder-invoice,shop}` (via PageTopMenubar on accounting pages)
- `/admin/customers/{pending,recently-active,transfer-rep}` (via PageTopMenubar on /admin/customers)
- `/admin/forwarders/{combine-bill,drivers,warehouse-history,bulk-search}` (via PageTopMenubar on /admin/forwarders)
- `/admin/barcode/{cargo,driver}/{all,from,import,prepare}` (via `<TopMenuBarcode>`)

## 🟠 Tombstoned / legacy (intentionally orphan)

These pages are 308-redirects (legacy bookmark catchers); they don't need sidebar entries.

- `/admin/containers` → redirects to `/admin/report-cnt`
- `/admin/warehouse/containers` → redirects to `/admin/report-cnt`
- `/admin/dashboard` (legacy alias for `/admin`)

## Recommendation for ภูม

1. ✅ **QA inspections fixed** — super sidebar now has the leaf
2. **Phase 2 wire wave** (~5 leaves · 30 minutes): add `contact-messages`, `kpi`, `board`/`inbox`, `withdrawals`, `broadcasts`, `tax-invoices` — all tagged `phase: 2`. These are "soon-to-launch" so super needs the navigation; non-super doesn't see them.
3. **Phase 3/4 stay deferred** — no entry needed until launched
4. **PageTopMenubar entries are intentional** — no action needed; that's the consolidate pattern

The above is a snapshot · re-audit when new pages land.
