# 🌆 2026-06-05 LATE-PM SAVE-POINT — ภูม forwarder edit/detail batch + report-cnt audit

> **Status:** all work pushed to `Poom-pacred`. Resume on the home computer:
> `git fetch origin && git checkout Poom-pacred && git pull --no-edit && pnpm dev`.
> Read this doc FIRST + `head -200 CLAUDE.md` for context. The browser session
> at `/admin/forwarders/52017` was being live-tested when ภูม left.

## 1) What landed in this batch (commit + push)

One save-point commit covering ภูม's flags from the entire 2026-06-05 PM live-testing session at `localhost:3000/admin/forwarders/52017` + `/edit`.

### A · Customer-side full-precision display (pre-compaction flag)
- `app/[locale]/(protected)/service-order/[hNo]/page.tsx` — `computeRawTotal()` + grey-parens `subValue` line shows the un-rounded ฿ figure next to every rounded one so customers don't under-transfer.
- `app/[locale]/(protected)/service-order/[hNo]/pay-from-wallet-button.tsx` — `totalThbRaw` prop · insufficient-hint + confirm dialog show both rounded + 4-decimal raw.
- `app/[locale]/(protected)/service-order/print/page.tsx` + `app/[locale]/(admin)/admin/service-orders/print/page.tsx` — grand-total row 4-decimal subline.

### B · ฝากสั่งซื้อ admin items table — per-shop tracking + cPrice inline
- `app/[locale]/(admin)/admin/service-orders/[hNo]/shop-fields-board.tsx` — per-shop bands fully rewritten: tracking inputs (top) + items table (bottom 6 cols) with inline `<InlinePriceUpdateCell>` per item. Display fields (coverUrl/curl/ccolor/csize/cshippingchn) plumbed through.
- `app/[locale]/(admin)/admin/service-orders/[hNo]/edit/page.tsx` — passes the display fields to `<ShopFieldsBoard>` + dropped unused helpers (`cny()`, `Lock`).

### C · fwarehousename "แสง" default fix (server-side, ALL spawn paths)
- `actions/admin/service-orders-spawn.ts:243` — `fwarehousename: ""` (was `"1"`).
- `actions/forwarder-legacy.ts:225` — same.
- `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/page.tsx` + `[fNo]/page.tsx` — empty fwarehousename render as `"—"` (no fake "แสง" warehouse label).

### D · admin ใบเสร็จ button 404 fix (smart route)
- `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/page.tsx` + `[fNo]/page.tsx` — look up `tb_receipt_item.fid → tb_receipt.fid` join · render `📄 ใบเสร็จ` link if receipt exists else `📄 ออกใบเสร็จ` link to `/add?fid=` (creates new). No more 404.

### E · `"use server"` array-export bomb fix
- NEW `actions/admin/forwarders-bulk-types.ts` — extracted `TB_FORWARDER_STATUSES` const + type out of `forwarders-bulk.ts` (Next 16 rejects non-async-function value exports from `"use server"` files · was 500'ing `/admin/forwarders/52015/edit`).
- `actions/admin/forwarders-bulk.ts` — re-exports the type from the types file.

### F · server-side fstatus auto-advance (forward-only)
- `actions/admin/forwarders.ts` — `FSTATUS_ORDER_AUTOADV` rank map + `rankFs()` + `bumpIfBehind()`. When admin fills `cabinet_number` (≥3) or `tracking_th` (≥6), the action derives `derivedFstatus` and bumps **only forward** (never regress). Audit log + status log + notify + earn-trigger now use `derivedFstatus`.
- `app/[locale]/(admin)/admin/forwarders/[fNo]/tb-action-panel.tsx` — sky-blue hint under the status dropdown when `willAutoAdvance` true (preview before submit).

### G · /admin/forwarders/[fNo]/edit · PCS-faithful 1-card edit form
- `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/edit-form.tsx` — major rewrite to a single PCS-style card with 3-row grid + bottom 2-col (calc breakdown left, summary right). 10 new init props plumbed: customRate/customRateKg/customRateCbm/fDiscount/fTransportPriceChnThb/priceOther/fTransportPrice/fShippingService/fWarehouseChina/fWarehouseName. Live calc preview via `useMemo`.
- `actions/admin/forwarders-edit.ts` — Zod schema + UPDATE cover all 10 new columns to `tb_forwarder`.
- `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/page.tsx` — added `AdminForwarderEditForm` import + render section (§4.6) with the 10 init props. Extended `RawForwarderRow` type + select string with the 6 missing freight columns.

### H · 8-step status pipeline (TODAY · ภูม "สถานะตกไปตัวนึง")
Legacy `function.php` L1218-1233 splits **fstatus=6** into two visual states by `$fStatusDriver`:
- fstatus=6 + driver assigned → **"กำลังจัดส่ง"** (icon 6.1) — out for delivery
- fstatus=6 + NO driver yet → **"เตรียมส่ง"** (icon 6)

Pacred was rendering 7 pills · this batch:
- `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/page.tsx` pipeline (L470+) — 8 cells with `rank` map (`6` and `6.5` both render but only one is "current" per `driverAssignment.fdistatus === ""`).
- `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` TIMELINE (L300+) — same 8-step ordering · added a `tb_forwarder_driver_item` fetch (1 row) to compute `isDriverDispatched` flag.

### I · `<FreightBreakdownTable>` (TODAY · ภูม "ตารางแสดงข้อมูลไม่เหมือนกัน")
NEW `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/freight-breakdown-table.tsx` — async server component fetching items inline. Rendered on BOTH `/edit` AND `/detail`. Layout:
- **N per-item rows** from `tb_order` (shop-spawned) or `tb_forwarder_item` (admin-direct). Thumbnail · ชื่อสินค้า · ร้าน · qty · ¥ราคา (cprice×qty) · ¥เพิ่ม/ลด · ¥ค่าขนส่งจีน (cshippingchn×qty) · ¥รวม subtotal · other cols `—`.
- **¥ subtotal row** (amber band) — `รวมต้นทาง (¥) จาก ฝากสั่งซื้อ`.
- **∑ ฿ freight breakdown row** (red double-border band) — full legacy 16-col layout from `tb_forwarder` header values + WHT 1% for juristic (`tb_users.userCompany="1"` OR `tb_forwarder.fusercompany="1"`) AND grand ≥ ฿1000.

The standalone `<ForwarderItemsTable>` section on `/edit` AND `/detail` was REMOVED — legacy doesn't have it, ภูม flag.

⚠️ `app/[locale]/(admin)/admin/forwarders/[fNo]/forwarder-items-table.tsx` file is now ORPHAN (no callers in `/admin/forwarders/*`). Audit on home computer + delete in next batch if no other surface uses it.

## 2) Browser-test queue for home computer (~10 min)

1. `/admin/forwarders/52017/edit` (PR10822 · 3 items from P22310) — confirm:
   - 8-pill pipeline shows · "ถึงไทยแล้ว" (fstatus=4) active
   - รายการสินค้า table = **3 per-item rows + 1 ¥ subtotal row + 1 ∑ ฿ breakdown row** · no separate รายการสินค้า (3) table below
   - PCS-style edit form (purple-border §4.6) renders with 10 fields
2. `/admin/forwarders/52017` (detail) — same 8-pill TIMELINE + same FreightBreakdownTable
3. Pick any fstatus=6 forwarder where a driver IS assigned — verify pill 7 "กำลังจัดส่ง" highlights (not "เตรียมส่ง")
4. Pick any juristic customer order with total ≥ ฿1000 — verify WHT 1% column appears in the ∑ row
5. Mobile viewport — 8 pills wrap to `grid-cols-4` (2 rows) without breaking

## 3) Pending — report-cnt deep audit (ภูม said "A · ลุยทั้ง B1+B2+B5")

ภูม chose **Option A** — back-to-back fix of all 3 report-cnt audit findings · "ส่งงานเดียวจบ" · 2-3 hours.

### B1 — backfill `tb_cnt_item` (CRITICAL · data-only · no code change)
- `tb_cnt` = 970 rows (CSV cabinet names in `cntName`) · `tb_cnt_item` = **0 rows**
- Result: every cabinet on `/admin/report-cnt` shows "ยังไม่จ่าย" because the paid-join is empty
- Code is correct (verified camelCase ✓ matches schema) · legacy data migration missed the explode step
- **Fix:** SQL backfill (dry-run + verify count + `--apply`):
  ```sql
  INSERT INTO tb_cnt_item ("cntID", "fCabinetNumber")
  SELECT c."ID", trim(cab)
  FROM tb_cnt c, unnest(string_to_array(c."cntName", ',')) cab
  WHERE c."ID" IS NOT NULL AND trim(cab) <> '';
  ```
  Estimated: ~9-10k tb_cnt_item rows produced (latest 50 tb_cnt entries reference 412 unique cabinets).
- AGENTS.md §11 rule: write `scripts/backfill-tb-cnt-item.mjs` with `--dry-run` default + `--apply` gate.

### B2 — tab badge overcount **8.8× / 8.3×** (CRITICAL UX bug)
- Source: `app/[locale]/(admin)/admin/report-cnt/page.tsx` L399-410 — `countWaiting()` + `countSucceed()` use `count: "exact"` on `tb_forwarder` ROWS
- Truth: waiting badge **283** rows / **32** containers · succeed badge **46,339** rows / **5,603** containers
- พี่ป๊อป + ภูม think workload is 8× larger than reality
- **Fix:** new Postgres RPC `count_distinct_cabinets(p_page, p_transport, p_start, p_end)` returning COUNT(DISTINCT fcabinetnumber). Migration: next free is `0141` (per CLAUDE.md ledger). Repoint 6 `loadHeaderCounts` calls.

### B5 — `/admin/report-cnt` succeed page pulls 46,339 rows · ~12-23MB wire (PERF)
- `page.tsx:184-192` selects 50,000 tb_forwarder rows then groups client-side into 5,603 containers
- **Fix:** new RPC `get_container_summary(filter)` doing `SELECT ... GROUP BY fcabinetnumber, SUM(...) ...` server-side · returns 5,603 rows directly · cuts wire 88× · removes the 50k-row in-memory walk

### B3 / B4 — DEFER (cosmetic + negligible)
- B3 = missing ทางอากาศ filter pill · 0 air rows currently · 1-line fix for the future
- B4 = redundant server pre-sort (CntListTable re-sorts client-side) · CPU negligible

### Next-session execution plan (ภูม approved Option A)
1. Write `scripts/backfill-tb-cnt-item.mjs` (dry-run default · prints row count + samples first 5 inserts · `--apply` gate)
2. Run dry-run → review output → run `--apply` against prod
3. Write `supabase/migrations/0141_count_distinct_cabinets_rpc.sql` (creates 2 RPCs: `count_distinct_cabinets` + `get_container_summary`)
4. Apply via Supabase dashboard SQL editor (per `docs/runbook/migration-ledger.md`)
5. Refactor `page.tsx` — `loadHeaderCounts()` calls new RPC · main query swaps to `get_container_summary`
6. Smoke test: tab badges should now show **32 / 5,603** instead of **283 / 46,339** · page-load wire 88× smaller
7. Browser-verify on home prod data + report to ภูม

## 4) Branch state at save-point

| Branch | HEAD | Status |
|---|---|---|
| `main` | (Vercel prod base) | unchanged this batch |
| `Poom-pacred` | this commit | **all work landed** |
| Our worktree | this commit | in sync 0/0 |

`pnpm verify` partial: `typecheck` EXIT 0 · `lint` 0 errors / 138 warnings (all pre-existing).
Browser smoke: `/admin/forwarders/52017` + `/52017/edit` = 307 (auth-gate normal · ภูม logged in).

## 5) Tomorrow — recommended pickup ORDER

1. Browser-verify 5 items in §2 (~10 min)
2. Execute report-cnt fix plan in §3 (~2-3h)
3. After report-cnt: pick up #259 backlog (Cabinet manual override + lock flag) OR #228 (บริการฝากสั่ง shop-order faithful port in detail)

## Resume command at home

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git checkout Poom-pacred
git pull origin Poom-pacred --no-edit
git rev-list --left-right --count HEAD...origin/Poom-pacred   # = 0/0

head -250 CLAUDE.md                                            # 🌙 2026-06-05 PM-2 + this batch
cat docs/research/poom-save-point-2026-06-05-late-pm.md       # this doc

# If dev server isn't running:
pnpm dev   # port 3000

# Browser ภูม session at /admin/forwarders/52017 should still be valid
```
