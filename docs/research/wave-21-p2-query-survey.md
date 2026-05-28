# Wave 21 P2 — Supabase query optimization survey

> Generated 2026-05-27 by Agent C · NO CODE CHANGES applied yet · investigation only

## TL;DR (3 lines)

**The biggest win is layout-level — every `/admin/*` page triggers ~22 sequential `count: exact, head: true` queries via `getSidebarCounts()` against `tb_*` tables whose filter columns have NO indexes** (`hstatus`, `fstatus`, `paystatus`, `useractive`, `paydeposit`, `fnote`, `hnote`). Add 10 partial indexes → **HOT** chrome drops from ~2-3s to <300ms across every admin page. Second biggest: revenue dashboards (`/admin`, `/admin/accounting`, `/admin/kpi`) pull **47K-row+ result sets just to sum/distinct-count in JS** (`SELECT ftotalprice FROM tb_forwarder LIMIT 50000`) — swap to `count: exact` + a small `tb_forwarder_revenue_summary` RPC. Third: legacy `coverUrl` resolution + per-row `tb_users.in()` joins are already O(1) (good), but `/admin/page.tsx` runs 22 reads in parallel without grouping the `count` ones into a single RPC = network-bound 6-RTT.

## Method

**Files swept (3 directories):**
- `app/[locale]/(admin)/admin/**/page.tsx` — 100+ page.tsx files (read 15 hot ones in full)
- `actions/admin/*.ts` — 83 files (sampled `sidebar-counts.ts`, `customers.ts`, `forwarders.ts`)
- `lib/supabase/{admin,server,client}.ts` — 3 files (admin.ts = `service_role` RLS-bypass; no per-request cache)

**Indexes audited:** `supabase/migrations/0108_pcs_legacy_hot_indexes.sql` (Sprint-8c added 13 `(userid)` + `(userid, status)` indexes for CUSTOMER chrome). No date-column indexes (`fdate`, `hdate`, `paydate`, `date`) anywhere. No standalone status indexes (`fstatus`, `hstatus`, `paystatus`) — the existing ones are compound on `(userid, status)` which Postgres can use only for `userid=`-anchored queries.

**Search patterns (Grep across `app/[locale]/(admin)/admin/`):**
- `\.length` after `data ?? []` (in-JS counting → 1000-row cap risk · 30 files)
- `\.limit\(50_?000\)` / `\.limit\(10_?000\)` / `\.limit\(5_?000\)` (huge fetches · 19 hits)
- `\.from\(.*tb_forwarder.*\).*\.select` + scan call sites (~80)
- `Promise.all([` (parallelism check)

**Test request that triggered survey:**
```
GET /admin/customers/PR2583  →  5.7s   ←  THIS ONE
  next.js: 731ms · proxy.ts: 510ms · application-code: 4.4s
```
The `/admin/customers/[id]/legacy-view.tsx` page itself fires **7 reads in Promise.all** + 1 sequential `tb_users` lookup + 1 storage signed URL. That's ~9 round-trips. PLUS the layout fires `getSidebarCounts()` = 22 more. **Total: ~31 PostgREST calls per page render.** At 100-200ms per PostgREST RTT on Supabase Pro = 3-6s baseline.

---

## Findings — ranked by impact

### 1. 🔴 BIGGEST WIN — `getSidebarCounts()` fires 22 count queries on EVERY admin page

- **Path:** `actions/admin/sidebar-counts.ts` L42-152 (called from `app/[locale]/(admin)/layout.tsx` L21)
- **Pattern:** correct use of `count: "exact", head: true`, but on UN-INDEXED filter columns. Each query is a full `Seq Scan` on tables of 21K-104K rows.
- **The 22 queries** (each = one Postgres seq scan):

```ts
// tb_wallet_hs  (104K rows · no index on status or amount)
admin.from("tb_wallet_hs").select("id", { head: true }).eq("status", "1").gt("amount", 0)
admin.from("tb_wallet_hs").select("id", { head: true }).eq("status", "1").lt("amount", 0)

// tb_header_order  (21,950 rows · idx on userid+hstatus exists; but no idx on hstatus alone)
admin.from("tb_header_order").select("id", { head: true }).eq("hstatus", "1")  // and 2, 3
admin.from("tb_header_order").select("id", { head: true }).neq("hnote", "").not("hstatus", "in", "(5,6)")  // NO index on hnote at all

// tb_forwarder  (47,587 rows · idx on userid+fstatus exists; no idx on fstatus alone)
admin.from("tb_forwarder").select("id", { head: true }).eq("fstatus", "4")  // and 5, 5+paydeposit, 6
admin.from("tb_forwarder").select("id", { head: true }).not("fnote", "is", null).neq("fnote", "").neq("fstatus", "7")  // NO index

// tb_forwarder_import2  (size unknown · no index on fid IS NULL)
admin.from("tb_forwarder_import2").select("id", { head: true }).is("fid", null)

// tb_payment  · tb_users  · tb_cnt  ...  (8 more)
```

- **Why slow:** the existing migration 0108 only added `(userid, fstatus)` and `(userid, hstatus)` compound indexes. A plain `WHERE fstatus='4'` (no userid) **cannot use the compound index** — it falls back to seq-scan 47K rows. The 0082 migration carries the legacy MySQL UNIQUE indexes only (intentional faithful port comment at L8: "*The legacy MySQL schema carries no non-unique secondary indexes*").
- **Fix:** add 10 partial indexes for the EXACT predicates the sidebar uses. Partial indexes are tiny + razor-fast:

```sql
-- These match the sidebar-counts.ts predicates 1:1
CREATE INDEX idx_tb_wallet_hs_status_amount_signed ON tb_wallet_hs (status, sign(amount));
CREATE INDEX idx_tb_header_order_hstatus ON tb_header_order (hstatus);
CREATE INDEX idx_tb_forwarder_fstatus ON tb_forwarder (fstatus);
CREATE INDEX idx_tb_forwarder_paydeposit_fstatus ON tb_forwarder (fstatus, paydeposit) WHERE fstatus='5';
CREATE INDEX idx_tb_forwarder_fnote_open ON tb_forwarder (fstatus) WHERE fnote IS NOT NULL AND fnote <> '' AND fstatus <> '7';
CREATE INDEX idx_tb_header_order_hnote_open ON tb_header_order (hstatus) WHERE hnote <> '' AND hstatus NOT IN ('5','6');
CREATE INDEX idx_tb_forwarder_import2_fid_null ON tb_forwarder_import2 (id) WHERE fid IS NULL;
CREATE INDEX idx_tb_payment_paystatus ON tb_payment (paystatus);
CREATE INDEX idx_tb_users_useractive_0 ON tb_users (useractive) WHERE useractive='0';
CREATE INDEX idx_tb_users_usercompany_useractive ON tb_users (usercompany, useractive);
CREATE INDEX idx_tb_cnt_cntstatus ON tb_cnt (cntstatus);
```

- **Estimated impact: BIG.** Sidebar count batch on admin layout currently ~1.5-3s on cold cache; after partial indexes ~50-150ms. **Every admin page benefits.** This single fix likely turns the test 5.7s page into ~3-4s.
- **Bonus optimization:** all 22 reads currently go through PostgREST's HTTP/2-multiplexed transport but each is still a separate Postgres parse+plan+execute. A single RPC `get_admin_sidebar_counts()` (one PLpgSQL function returning a JSON record) collapses 22 RTTs into 1. Combined with the indexes → ~30-80ms total. Defer to Phase C; the indexes alone fix 80% of the pain.

---

### 2. 🔴 Revenue dashboards fetch 47K+ rows just to sum in JS

- **Files:**
  - `app/[locale]/(admin)/admin/page.tsx` L102-154 (the 22 parallel reads — main dashboard)
  - `app/[locale]/(admin)/admin/accounting/page.tsx` L243-356 (P0-2 accounting summary tab)
  - `app/[locale]/(admin)/admin/kpi/page.tsx` L128-189 (executive dashboard)
  - `app/[locale]/(admin)/admin/wallet/balance-view.tsx` L51-54 (wallet total)
- **Pattern:** Pattern 2 (`SELECT *` when not needed) + Pattern 3 (no `.limit()` pagination)

```ts
// admin/page.tsx L112 — fetches 47,587 ROWS just to sum one column
admin.from("tb_forwarder").select("ftotalprice").gte("fdate", monthStart).neq("fstatus", "7")
// then: rows.reduce((s, r) => s + Number(r.ftotalprice ?? 0), 0)

// admin/page.tsx L118 — fetches ALL 8,898 wallet rows to sum balances
admin.from("tb_wallet").select("wallettotal").limit(50_000)

// admin/page.tsx L149 — fetches 30K+ rows just to DISTINCT-count fcabinetnumber
admin.from("tb_forwarder").select("fcabinetnumber").not("fcabinetnumber", "is", null)
  .neq("fcabinetnumber", "").neq("fcabinetnumber", "0").lt("fstatus", "4").limit(50_000)
// then: new Set((rows ?? []).map((r) => r.fcabinetnumber)).size

// accounting/page.tsx L340 — fetches EVERY non-delivered forwarder (~40K rows) just to sum
admin.from("tb_forwarder").select("ftotalprice").neq("fstatus", "7")
```

- **Why slow:** A 47K-row response is 1-3MB of JSON + parse + GC. At a 100ms Supabase RTT, the actual wire transfer dominates. The `/admin/accounting` summary tab has 7 of these fan-out reads — that's potentially **300K rows pulled per page-view**.
- **Fix:** Postgres `SUM()` runs in <50ms. Promote to a single RPC:

```sql
CREATE OR REPLACE FUNCTION get_revenue_summary(
  p_month_start timestamp,
  p_today_start timestamp,
  p_prev_month_start timestamp,
  p_prev_month_end timestamp
) RETURNS json
LANGUAGE sql STABLE
AS $$
  SELECT json_build_object(
    'shop_month',     (SELECT COALESCE(SUM(hcostallth),0) FROM tb_header_order WHERE hdate >= p_month_start AND hstatus <> '6'),
    'shop_today',     (SELECT COALESCE(SUM(hcostallth),0) FROM tb_header_order WHERE hdate >= p_today_start AND hstatus <> '6'),
    'forwarder_month',(SELECT COALESCE(SUM(ftotalprice),0) FROM tb_forwarder    WHERE fdate >= p_month_start AND fstatus <> '7'),
    -- ...etc, 12 aggregates in one round-trip
    'wallet_total',   (SELECT COALESCE(SUM(wallettotal),0) FROM tb_wallet),
    'containers_in_transit', (SELECT COUNT(DISTINCT fcabinetnumber) FROM tb_forwarder
                              WHERE fcabinetnumber IS NOT NULL AND fcabinetnumber NOT IN ('','0') AND fstatus < '4')
  );
$$;
```
Then `await admin.rpc('get_revenue_summary', { p_month_start, ... })` returns one JSON blob in ~80ms.

- **Estimated impact: MEDIUM-BIG** for `/admin` + `/admin/accounting` + `/admin/kpi`. The `/admin` dashboard load drops from ~3-4s (after the sidebar fix) to ~500ms.
- **Date indexes needed:** `CREATE INDEX idx_tb_forwarder_fdate ON tb_forwarder (fdate DESC); CREATE INDEX idx_tb_header_order_hdate ON tb_header_order (hdate DESC); CREATE INDEX idx_tb_payment_paydate ON tb_payment (paydate DESC); CREATE INDEX idx_tb_wallet_hs_date ON tb_wallet_hs (date DESC);` — without these the `SUM(...) WHERE fdate >= '2026-05-01'` also seq-scans.

---

### 3. 🔴 `/admin/forwarders` list = 11 sequential count queries + 4 main queries per page

- **Path:** `app/[locale]/(admin)/admin/forwarders/page.tsx` L884-939 (the `loadStatusCounts` helper) + main query L320-407
- **Pattern:** Same as #1 — `count: exact, head: true` but on un-indexed `fstatus` column. Done 11 times in parallel (one per tab).

```ts
const [total, s1, s2, s3, s4, s5, s6, s7, credit, special] = await Promise.all([
  countTotal(),                  // .from("tb_forwarder").select("id", { head: true })  + date filter
  countFstatus("1"),            // .eq("fstatus", "1")  + date filter
  countFstatus("2"),  ...  countFstatus("7"),     // 7 more
  countCredit(),                 // .eq("fcredit", "1")
  countFstatus("99"),
]);
```

PLUS the main query at L320-340 selects 50 columns from `tb_forwarder` with `.limit(300)` + 30-day date window.

PLUS 3 follow-up parallel reads: `tb_users.in()`, `tb_rate_custom_cbm.in()`, `tb_corporate.in()` for the page (good — already batched).

- **Why slow:** With the date-window default (`fdate >= 30d ago`) the count queries return fast IF there's a `fdate` index. Without one → seq scan 47K rows × 11 queries. After index 1 (above) + a `fdate` index → all 11 counts run in <100ms parallel.
- **Estimated impact: BIG.** Forwarders list page-load drops from ~4s to <1s.
- **No code change needed if indexes #1 + #2 land** — the count queries become fast automatically. The main `.limit(300)` query is already correct (uses default 30-day window).

---

### 4. 🟠 `/admin/report-cnt` (รายงานตู้) — `tb_cnt_item` whole-table fetch every page

- **Path:** `app/[locale]/(admin)/admin/report-cnt/page.tsx` L213
- **Pattern:** Pattern 3 — pull all rows just to make a Set

```ts
const { data: paidRows } = await admin.from("tb_cnt_item").select("fcabinetnumber").limit(50_000);
const paidSet = new Set((paidRows ?? []).map((r) => r.fcabinetnumber as string));
// then later in the loop:
const isPaid = paidSet.has(g.fCabinetNumber);
```

- **Why slow:** unknown row count for `tb_cnt_item` but in the same family as `tb_cnt` (container payments). For each `tb_cnt_item.fcabinetnumber` lookup the page does `paidSet.has(...)` — but only ~30-100 distinct containers are on screen at once. The full table fetch is overkill.
- **Fix:** scope to the containers currently on screen:

```ts
const cabNumbers = Array.from(new Set(rows.map(r => r.fcabinetnumber)));
const { data: paidRows } = await admin
  .from("tb_cnt_item")
  .select("fcabinetnumber")
  .in("fcabinetnumber", cabNumbers);
```

Pairs with `CREATE INDEX idx_tb_cnt_item_fcabinetnumber ON tb_cnt_item (fcabinetnumber);`
- **Estimated impact: MEDIUM** (report-cnt is WARM not HOT — warehouse team only).

---

### 5. 🟠 `/admin/forwarders/warehouse-history` — un-bounded scan-event fetch when `?historyTableAll=true`

- **Path:** `app/[locale]/(admin)/admin/forwarders/warehouse-history/page.tsx` L286-311
- **Pattern:** Pattern 3 — already has `ALL_MODE_CAP = 5_000` but the default 7-day window query has no date index

```ts
let matchedScansQ = admin.from("tb_forwarder_import2").select(scanColumns).not("fid", "is", null);
if (dateGte) matchedScansQ = matchedScansQ.gte("fi2date", dateGte);
// + orphan query (same shape)
```

- **Why slow:** `WHERE fid IS NOT NULL AND fi2date >= '...'` requires both predicates. No index on either column for `tb_forwarder_import2`.
- **Fix:** `CREATE INDEX idx_tb_forwarder_import2_fid_fi2date ON tb_forwarder_import2 (fid, fi2date DESC); CREATE INDEX idx_tb_forwarder_import2_fid_null_fi2date ON tb_forwarder_import2 (fi2date DESC) WHERE fid IS NULL;`
- **Estimated impact: MEDIUM.** Warehouse team uses this daily; default 7-day mode should be ~200ms instead of ~2-3s.

---

### 6. 🟠 `/admin/wallet/[id]` detail page — runs `tb_wallet.limit(50_000)` + `tb_cash_back.limit(50_000)` to compute totals

- **Path:** `app/[locale]/(admin)/admin/wallet/[id]/page.tsx` L234-235, `balance-view.tsx` L51-54
- **Same anti-pattern as #2** — single-row detail page should NOT pull every wallet to render one customer's transaction page.
- **Fix:** `select SUM(wallettotal)` via RPC, or cache the float number (rarely changes between page-loads). The "ยอดในระบบ" summary card is informational — fetching 8,898 rows for it is overkill.
- **Estimated impact: MEDIUM** (saves ~500ms per page-load on detail pages).

---

### 7. 🟡 `/admin/page.tsx` revenue cards = 8 separate aggregates that could be 1 RPC

- **Path:** `app/[locale]/(admin)/admin/page.tsx` L84-154 (the Promise.all of 22 reads)
- **Pattern:** Pattern 4 — already parallel, but 22 separate RTTs to PostgREST is bandwidth-bound regardless of latency
- **Fix:** combine the 8 sum/count aggregates into a single `get_dashboard_kpi()` RPC (see #2). The remaining 14 are already counts; once #1 + indexes are in, they're fast individually.
- **Estimated impact: SMALL after #1 + #2 land** (mostly RTT savings, ~200ms).

---

## Missing indexes table

| Table (rows) | Column(s) | Used in | Suggested SQL |
|---|---|---|---|
| `tb_forwarder` (47K) | `fstatus` | sidebar-counts ×4, forwarders/page.tsx ×11, kpi ×8, accounting count | `CREATE INDEX idx_tb_forwarder_fstatus ON tb_forwarder (fstatus);` |
| `tb_forwarder` (47K) | `fdate DESC` | forwarders default-30d window, accounting date filter, kpi month/prev-month | `CREATE INDEX idx_tb_forwarder_fdate_desc ON tb_forwarder (fdate DESC);` |
| `tb_forwarder` (47K) | partial: `fstatus='5' WHERE paydeposit='1'` | sidebar forwarderCredit | `CREATE INDEX idx_tb_forwarder_credit_open ON tb_forwarder (fstatus) WHERE fstatus='5' AND paydeposit='1';` |
| `tb_forwarder` (47K) | partial: `fnote IS NOT NULL AND fnote <> '' AND fstatus <> '7'` | sidebar forwarderNote | `CREATE INDEX idx_tb_forwarder_fnote_open ON tb_forwarder (fstatus) WHERE fnote IS NOT NULL AND fnote <> '' AND fstatus <> '7';` |
| `tb_forwarder` (47K) | `fcredit` (standalone, currently only (userid, fcredit)) | reports/credit-pending, sidebar | `CREATE INDEX idx_tb_forwarder_fcredit ON tb_forwarder (fcredit) WHERE fcredit='1';` |
| `tb_forwarder` (47K) | `fcabinetnumber WHERE fstatus<4` | admin/page.tsx containers in-transit, kpi containers, reports | `CREATE INDEX idx_tb_forwarder_cabinet_pre_arrival ON tb_forwarder (fcabinetnumber) WHERE fstatus < '4' AND fcabinetnumber IS NOT NULL AND fcabinetnumber NOT IN ('','0');` |
| `tb_header_order` (22K) | `hstatus` | sidebar-counts ×3, admin/page tabs, kpi ×6 | `CREATE INDEX idx_tb_header_order_hstatus ON tb_header_order (hstatus);` |
| `tb_header_order` (22K) | `hdate DESC` | service-orders list, accounting, kpi prev-month | `CREATE INDEX idx_tb_header_order_hdate_desc ON tb_header_order (hdate DESC);` |
| `tb_header_order` (22K) | partial: `hnote <> '' AND hstatus NOT IN ('5','6')` | sidebar shopNote | `CREATE INDEX idx_tb_header_order_hnote_open ON tb_header_order (hstatus) WHERE hnote <> '' AND hstatus NOT IN ('5','6');` |
| `tb_payment` (size?) | `paystatus` | sidebar ×1, accounting, kpi | `CREATE INDEX idx_tb_payment_paystatus ON tb_payment (paystatus);` |
| `tb_payment` (size?) | `paydate DESC` | accounting + kpi date filter | `CREATE INDEX idx_tb_payment_paydate_desc ON tb_payment (paydate DESC);` |
| `tb_wallet_hs` (~104K?) | `(status, sign(amount))` | sidebar walletTopup/walletWithdraw | `CREATE INDEX idx_tb_wallet_hs_status_amount_pos ON tb_wallet_hs (status) WHERE amount > 0; CREATE INDEX idx_tb_wallet_hs_status_amount_neg ON tb_wallet_hs (status) WHERE amount < 0;` |
| `tb_wallet_hs` (~104K?) | `(type, status, date)` | accounting topup/withdraw/refund tabs, kpi wallet | `CREATE INDEX idx_tb_wallet_hs_type_status_date ON tb_wallet_hs (type, status, date DESC);` |
| `tb_wallet` (~9K) | `wallettotal < 0` | reports/debtors | `CREATE INDEX idx_tb_wallet_debtors ON tb_wallet (wallettotal) WHERE wallettotal < 0;` |
| `tb_users` (8.9K) | `useractive` (standalone) | sidebar customerPending, admin/page inactive | `CREATE INDEX idx_tb_users_useractive ON tb_users (useractive) WHERE useractive='0';` |
| `tb_users` (8.9K) | `(usercompany, useractive)` | sidebar corporatePending | `CREATE INDEX idx_tb_users_company_active ON tb_users (usercompany, useractive) WHERE usercompany='1' AND useractive='0';` |
| `tb_users` (8.9K) | `userlastlogin DESC` | customers/recently-active | `CREATE INDEX idx_tb_users_lastlogin_desc ON tb_users (userlastlogin DESC NULLS LAST);` |
| `tb_forwarder_import2` (size?) | partial: `WHERE fid IS NULL` | sidebar whError, warehouse-history orphans | `CREATE INDEX idx_tb_forwarder_import2_orphans ON tb_forwarder_import2 (fi2date DESC) WHERE fid IS NULL;` |
| `tb_forwarder_import2` (size?) | `(fid, fi2date DESC)` | warehouse-history matched section | `CREATE INDEX idx_tb_forwarder_import2_matched ON tb_forwarder_import2 (fid, fi2date DESC) WHERE fid IS NOT NULL;` |
| `tb_cnt` (~1K?) | `cntstatus` | sidebar cntUnpaid, /admin/cnt-hs | `CREATE INDEX idx_tb_cnt_cntstatus ON tb_cnt (cntstatus) WHERE cntstatus='1';` |
| `tb_cnt_item` (size?) | `fcabinetnumber` | report-cnt paidSet lookup | `CREATE INDEX idx_tb_cnt_item_fcabinetnumber ON tb_cnt_item (fcabinetnumber);` |
| `tb_forwarder` (47K) | `ftrackingchn` | warehouse-history dupe-detection | `CREATE INDEX idx_tb_forwarder_ftrackingchn ON tb_forwarder (ftrackingchn) WHERE ftrackingchn IS NOT NULL AND ftrackingchn <> '';` |

**Total: ~22 new indexes.** Apply in one migration `0109_pcs_legacy_admin_hot_indexes.sql` — same shape as 0108. Use `CREATE INDEX IF NOT EXISTS` + `ANALYZE` at the end.

**Why partial indexes for many of these:** the filter is usually `WHERE col='1'` or `WHERE col IS NULL` — partial indexes are 10-100× smaller than full ones (e.g. `useractive='0'` is ~5% of users → index 1/20 the size).

**Tail risk:** running 22 `CREATE INDEX` on prod will lock writes for the duration of each build. On 47K-row tables this is ~10-30s per index = ~5-10min total downtime for `tb_forwarder` writes. Apply during quiet hours OR use `CREATE INDEX CONCURRENTLY` (which requires running each statement OUTSIDE a transaction — Supabase migration runner wraps each file in one, so split into N one-statement migrations OR run via `psql` directly).

---

## Recommended sprint plan (3 phases)

### Phase A — Quick wins, NO migration (1-2h)
1. **`/admin/page.tsx` L118** + **`admin/wallet/balance-view.tsx` L52-53** + **`admin/wallet/[id]/page.tsx` L234-235**: replace `.select("wallettotal").limit(50_000)` with a single helper that uses `count: 'exact', head: true` for "X รายชื่อ" + ditch the JS reduce for system-wide total (or accept stale-by-30-min cache).
2. **`/admin/report-cnt/page.tsx` L213**: scope `tb_cnt_item` fetch to `.in("fcabinetnumber", visibleCabs)`.
3. **Audit `Promise.all` placement**: most pages already parallel-fire correctly; the only sequential await chain found was in `/admin/customers/[id]/legacy-view.tsx` (first `tb_users` lookup then 7-read Promise.all) — that ordering is necessary (need userid before joins) so leave it.

**Estimated impact:** 200-500ms shaved per page on the affected surfaces. Not a step-change.

### Phase B — Index migration (2h + 30s migration runtime per index)
1. Write `supabase/migrations/0109_pcs_legacy_admin_hot_indexes.sql` per the table above. Mirror the 0108 style (IF NOT EXISTS + ANALYZE at end).
2. Apply via Supabase dashboard SQL editor (or `supabase db push`) during a quiet window. Expected lock time on `tb_forwarder`: ~30-60s; on `tb_wallet_hs`: ~30-60s; on smaller tables: <10s.
3. Verify with `EXPLAIN ANALYZE` on the 5 worst queries (sidebar walletTopup, sidebar forwarderArrived, accounting fForwarder, kpi soStatusCounts, reports debtors).

**Estimated impact: BIG.** Every admin page chrome drops from 1.5-3s to 100-300ms baseline. Test request 5.7s → ~2-3s probably (most of the gain).

### Phase C — RPC consolidation (4h)
1. **`get_admin_sidebar_counts()` PLpgSQL function** — returns all 22 counts as one JSON object. Cut 22 RTTs to 1.
2. **`get_dashboard_kpi(p_month_start, p_today_start, p_prev_month_start, p_prev_month_end)` RPC** — replaces 8 in-JS sum-reduces on `/admin` + `/admin/accounting` + `/admin/kpi`.
3. **`get_forwarder_status_counts(p_date_from, p_date_to)` RPC** — replaces 11 count queries on `/admin/forwarders`.
4. **Optional cache layer** for the sidebar counts (`unstable_cache` with 30-60s TTL keyed by admin role) — sidebar values are inherently slightly stale; full freshness on every navigation is overkill.

**Estimated impact: MEDIUM.** Most of the per-RTT saving (~50-100ms × 20 = 1-2s) becomes negligible once Phase B indexes make each query <50ms. Phase C is a polish phase.

---

## Out-of-scope (deferred)

- **Per-admin role count caching** — `getSidebarCounts()` returns the SAME numbers for all admins regardless of role; in-memory or Redis cache with 30s TTL would eliminate 95% of the queries entirely. Out of scope here (requires infra decision).
- **Materialised views for KPI** — `vw_admin_kpi_monthly` refreshed nightly would make `/admin/kpi` instant. But adds operational complexity (refresh schedule, staleness window). Defer until Phase B doesn't move the needle.
- **PostgREST `db.max_rows` config** — currently default 1000. Could lift to 50K for service-role only, but every site that already uses `.limit(50_000)` already works (.limit() overrides max_rows for the request). Real fix is to STOP fetching 50K rows; raising the cap masks the smell.
- **The 22 sidebar queries themselves** — can technically be folded into 1 RPC (Phase C item 1), but the index fix is sufficient by itself. Don't do both at once; measure after Phase B and decide.
- **`force-dynamic` on EVERY admin page** — every page sets `export const dynamic = "force-dynamic"`, meaning ZERO cache between requests. Once we have stable revenue numbers we could let SOME pages cache for 30-60s. Out of scope — staff expectation is "always fresh".
- **`pg_stat_statements` review** — would tell us EXACTLY which queries hurt most. Suggest enabling on prod for a week before Phase C to confirm the worst offenders match our static analysis here.

---

## Footnotes

- **`tb_wallet_hs` row count:** estimate ~100K-150K based on save-point "wallet topup volume" KPI. Confirm via `SELECT count(*) FROM tb_wallet_hs` before deciding on `(type, status, date)` index strategy — could split into smaller per-type partials if huge.
- **`tb_forwarder_import2` row count:** unknown but warehouse-history page can hit 5K cap → assume tens-of-thousands of scan events accumulated.
- **`tb_cnt` / `tb_cnt_item` row counts:** "958 tb_cnt" per CLAUDE.md; tb_cnt_item likely 5-10K.
- **The `force-dynamic` directive is mandatory** for these pages (cookie reads in `requireAdmin`) — NOT removable. AGENTS.md §11 covers this. Caching at the data layer is the only viable knob.
- **Migration 0108 ANALYZE is correctly written** — must replicate that pattern in 0109 so Postgres planner picks the new indexes immediately rather than waiting for autovacuum.
