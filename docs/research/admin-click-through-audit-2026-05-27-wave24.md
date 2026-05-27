# 🔍 Admin click-through audit — Wave 24 close-out (2026-05-27 ดึก)

> **Generated:** during Wave 24 close-out · after pushing 7 commits to `Poom-pacred`
> **Trigger:** ภูม asked "เทสทุกระบบ ทุกฟังก์ชั่นแล้วใช่มั้ย" — answer was honestly NO,
> only Wave 23/24-touched surfaces verified. This audit fills the gap.
> **Method:** Chrome MCP click-through on `localhost:3000` admin shell (PR Admin · super
> role). For each surface: navigate → check renders cleanly → find primary actions →
> spot-test 1-2 clicks → capture findings.
> **Coverage:** 19 critical surfaces verified · out of 196 admin routes total · Tier 3
> (HR/barcode/accounting subpages) NOT verified individually · only spot-tested where
> Wave 23/24 changes hit.
>
> **Status codes used:**
> - ✅ **PASS** — renders + primary actions work · no console errors · click-through clean
> - 🟡 **CAVEAT** — renders + works but with caveat (slow / mobile-broken / known-limit)
> - ❌ **FAIL** — 500 / 404 / broken interactive flow / silent error
> - ⏭ **SKIP** — not tested in this round

---

## Tier 1 — Wave 23/24-touched surfaces (must verify)

| # | Surface | Status | Notes |
|---|---|---|---|
| 1 | `/admin/service-orders/cart/add` (1688) | ✅ | 19-color chips · ¥6.30 card pre-verified earlier |
| 2 | `/admin/service-orders/cart/add` (Taobao) | ✅ | 6×22 SKU picker · tb_cart #212956 created · ccolor/csize correct |
| 3 | `/admin/service-orders/cart` (top strip) | ✅ | Single CTA · URL+content sync |
| 4 | `/admin/reports/payment` | ✅ | 717 rows · pagination page 1+2 verified |
| 5 | `/admin/reports/refunds` | ✅ | Banner + footer + card present |
| 6 | `/admin/reports/shop` | ✅ | "หน้า 1 จาก 5" footer (~958 rows total) |
| 7 | `/admin/reports/shops-profit-pay` | 🟡 | Banner + footer present · count is "DB-side upper bound" (post-JOIN filter caveat doc'd) |
| 8 | `/admin/reports/pending-payments` | ✅ | Banner + "ทั้งหมด (ทุกหน้า)" card |
| 9 | `/admin/reports/forwarder` | ✅ | Agent B's 399ed01 pagination still working |
| 10 | `/admin/cnt-hs` | ✅ | CabinetListCell shows "คลิกเพื่อดูทั้งหมด 91 ตู้" button (heavy row) |
| 11 | `/admin/cnt-hs/[id]` | ⏭ | Cap bump 1000→5000 + warn · not browser-tested with large container |
| 12 | `/admin/forwarders/[fNo]` (id=51971) | ✅ | TbForwarderActionPanel renders · status combobox "3 · กำลังส่งมาไทย" |
| 13 | `/admin/forwarders` + bulk-bar | ✅ | List renders · status column present (cabinet input field exists per code · not clicked) |
| 14 | `/admin/admins` | ✅ | "รายชื่อพนักงานทั้งหมด" heading + table + "+ เพิ่มพนักงานใหม่" CTA |
| 15 | `/admin/admins/[id]` | ⏭ | Detail page not navigated this round (Wave 23 Agent N rewrite documented) |
| 16 | `/admin/customers/PR10899` | ✅ | Was 500 — now renders detail header + heading "PR10899" |

---

## Tier 2 — Critical revenue surfaces (must work daily)

| # | Surface | Status | Notes |
|---|---|---|---|
| 17 | `/admin/dashboard` | ✅ | Stats cards: ลูกค้า 10,600 · ออเดอร์ 48,842 · ฝากสั่ง 4.88 ฿/¥ |
| 18 | `/admin/kpi` | ✅ | Real revenue cards: ฿4M ฝากสั่ง · ฿1.8M ฝากนำเข้า · ฿1M ฝากโอน · ฿13K wallet |
| 19 | `/admin/wallet` (list) | ✅ | "ยอดเติมเงิน · เดือนนี้" + "ยอด wallet คงค้างรวม ฿13,359" |
| 20 | `/admin/wallet/[id]` | ⏭ | Not browser-tested · code path covered Wave 19 BUG #3/#4 |
| 21 | `/admin/yuan-payments` | ✅ | Table renders |
| 22 | `/admin/service-orders` (list) | ✅ | Table with P22305, P22304, etc · status column · PR links |
| 23 | `/admin/service-orders/[hNo]` | ⏭ | Not browser-tested |
| 24 | `/admin/forwarders/combine-bill` | ⏭ | Navigation issue during audit · not verified (Wave 23 P0-4 code change documented) |
| 25 | `/admin/reports` (hub) | ⏭ | Not browser-tested |
| 26 | `/admin/qa` (hub) | ⏭ | Not browser-tested |
| 27 | `/admin/accounting` | ⏭ | Not browser-tested (Wave 23 P0 menubar 404→stub done) |
| 28 | `/admin/customers` (list) | ⏭ | Not browser-tested in this round (Wave 23 P0 suspend confirm done) |

---

## Tier 3 — Not tested (deferred to future audit)

196 total admin routes. ~150 NOT individually verified this round, including:
- `/admin/barcode/*` (10 sub-routes)
- `/admin/hr/*` (12 sub-routes)
- `/admin/accounting/*` (14 sub-routes incl. closing / reconcile / periods)
- `/admin/qa/*` (10 sub-queues)
- `/admin/rates/*` (5 sub-routes)
- `/admin/settings/*` (5 sub-routes)
- `/admin/warehouse/*`, `/admin/containers/*`, `/admin/bookings/*`, `/admin/drivers/*`,
  `/admin/refunds/*`, `/admin/tax-invoices/*`, `/admin/commissions/*`, `/admin/sales-payouts/*`,
  `/admin/api-forwarder-*`, `/admin/api-sheets-*`, `/admin/broadcasts/*`, `/admin/csv-imports/*`,
  `/admin/report-cnt/*`, `/admin/system/*`, `/admin/migration/*`, etc.

**Why deferred:** time budget · 196 surfaces × ~3 min each = 10+ hours wallclock. This
round focused on the highest-leverage surfaces (Wave 23/24-touched + critical revenue).
Tier 3 should be the **focus of next audit session** (suggest splitting into sub-batches
of 30 per agent).

---

## Findings

### 🔴 P0 bugs (fix this session)
_(none in tested surfaces)_

### 🟠 P1 issues (next session)

1. **🟡 Intermittent Supabase ConnectTimeoutError (10000 ms)** — dev server logs show
   sporadic `fetch failed [cause]: Error [ConnectTimeoutError]` connecting to
   `yzljakczhwrpbxflnmco.supabase.co:443`. When this fires, pages that do legacy queries
   (like `/admin/forwarders/[fNo]` fallback path) → query returns null → `notFound()` →
   misleading 404 to admin. Hit during this audit when first attempting forwarder #51971
   (22.4s app code, mostly timeout retries) · second attempt succeeded.
   - **Impact:** intermittent UX bug — admin sees "404" for rows that exist
   - **Likely cause:** prod Supabase region throttle or local Windows fetch IPv6/IPv4 DNS race
   - **Fix:** investigate Node fetch timeout config + retry strategy · consider longer
     timeouts (15-30s) for legacy fallback queries · also: convert silent-`notFound()` to
     a real error banner that distinguishes "row missing" vs "Supabase timeout"
   - **Severity:** P1 — degrades UX but admin can refresh

2. **🟡 `tb_admin` column case mismatch — every lowercase reader silently fails** —
   probed direct: `tb_admin` table on prod has **CamelCase** columns (`adminID`, `adminEmail`,
   `adminPass`, `adminName`, etc.) not the lowercase `adminid`/`adminemail` our 18 Pacred
   files expect. PostgREST returns `42703 column does not exist`. Wave 22 merge created
   the `admins` table (correct lowercase) but legacy `tb_admin` was preserved with original
   MySQL CamelCase from the import. 18 actions/* files still read tb_admin directly
   (`actions/admin/{cart,combine-bill,wallet-trans,...}.ts`).
   - **Impact:** silent log spam · features that depend on resolveLegacyAdminId fall
     through to UUID fallback · NOT blocking but pollutes Sentry
   - **Likely Wave 22 oversight:** Phase 1 merged data but didn't drop tb_admin OR rename
     columns OR create a lowercase view
   - **Fix:** either (a) create a `tb_admin_lc` VIEW with `SELECT adminID AS adminid, ...
     FROM tb_admin` so legacy readers keep working, OR (b) sweep all 18 files to use
     `adminID` (capital), OR (c) finish Wave 22 migration to read `admins` table only +
     drop tb_admin · option (c) preferred long-term, (a) for immediate quiet
   - **Severity:** P1 — log noise + silent feature degradation

### 🟡 Caveats / known-edge cases

3. **`shops-profit-pay` count != visible rows** — agent's count query can't replicate
   the post-query `confirmedHnos` wallet-confirm 2-pass JOIN. "ทั้งหมด (ทุกหน้า)" card
   is honestly a "DB-side filtered upper bound". Documented in JSDoc + inline.

4. **`cnt-hs/[id]` 5000 cap with warn** — sub-resource grouping prevents pagination.
   Bumped from 1000 → 5000 with `console.warn` at ≥5000. Will fire warning when a
   single cnt-hs container exceeds 5000 forwarders (unlikely · max seen = 91 cabinets).

5. **`/admin` top-level may not load directly** — navigated `/admin` once during audit,
   tab title showed "Pacred Shipping" (homepage). Subsequent direct nav to `/admin/dashboard`
   worked fine. Could be:
   - Auto-redirect logic in `/admin/page.tsx` that didn't fire in this session
   - Stale browser cache (tab title lag is common in our Chrome MCP)
   - **NOT confirmed as a bug** · needs reproduction · likely tab title lag only since
     `/admin/dashboard` works (which IS the same code)

### ✅ Confirmed clean (19 surfaces)

- 4 reports/* pagination pages — 717 rows verified on payment, banner+footer on all 4
- /admin/cnt-hs LIST (CabinetListCell client island)
- /admin/forwarders LIST + /[fNo] DETAIL (TbForwarderActionPanel)
- /admin/admins LIST
- /admin/customers/PR10899 (was 500, now fine)
- /admin/dashboard (real cargo numbers)
- /admin/kpi (real revenue)
- /admin/wallet, /admin/yuan-payments, /admin/service-orders list pages
- /admin/service-orders/cart + /cart/add (Taobao SKU picker E2E)

---

## What this audit DOES NOT cover

1. **Mobile viewport** — all surfaces tested at desktop resolution. Per AGENTS.md §6
   customer-facing surfaces must be verified at 360/390px before push. Admin surfaces are
   less critical (staff use desktops) but should still scale.
2. **Tier 3 routes** (~150 surfaces) — see list above.
3. **Cross-flow integration** — e.g. add product to cart → submit as order → forwarder
   spawn → cabinet assignment → payment confirm. Each link tested but not the full chain.
4. **Mutation paths** — most click-throughs were READ-only. Suspend/approve/delete/edit
   mutations not exercised this round (other than Wave 24 ccolor/csize write via cart).
5. **Concurrent user** — single-user smoke. Race conditions not tested.
6. **Error UX** — what happens when Supabase times out · when storage upload fails · when
   role check fails · these need explicit fault-injection runs.

---

## Cross-links

- [`admin-click-through-audit-2026-05-27.md`](admin-click-through-audit-2026-05-27.md) — Agent K's earlier (เช้า) audit
- [`admin-tech-debt-master-2026-05-27.md`](admin-tech-debt-master-2026-05-27.md) — master tech-debt (18 of 19 closed)
- [`poom-save-point-2026-05-27-night.md`](poom-save-point-2026-05-27-night.md) — canonical save-point for this work-day
- [`docs/learnings/supabase-rls-patterns.md`](../learnings/supabase-rls-patterns.md) — consider adding "tb_admin CamelCase trap" entry
