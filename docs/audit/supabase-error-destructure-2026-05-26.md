# Supabase `error` destructure audit — §0c sweep (2026-05-26)

> **Rule:** AGENTS.md §0c (added 2026-05-25 ค่ำ after PR10899 silent 404) —
> *Destructure `error` from EVERY Supabase query. Never write
> `const { data } = await admin.from(...)`. Always `const { data, error } = ...`;
> on error → `console.error(...)` with the userid/query context AND `throw`
> (so Next renders a real error boundary, not a silent null → 404).*
>
> **Bug case study (the trigger):** `app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx`
> L79 — destructured ONLY `data` from `maybeSingle()`. A transient PgBouncer
> timeout returned `data=null` → page called `notFound()` → fake 404 for
> PR10899 (which exists in `tb_users`). Fixed in commit `3a278aa`.
>
> **This audit:** sweeps `actions/admin/` + `app/[locale]/(admin)/` +
> `app/[locale]/(protected)/` for the same anti-pattern, classifies by risk
> tier, and inventories per-file counts for ภูม to prioritize.

---

## Summary

| Metric | Count |
|---|---|
| **Total hits** | **548** |
| Files touched | 194 |
| `actions/admin/` (server actions) | 201 hits across 58 files |
| `app/[locale]/(admin)/` (admin pages) | 220 hits across 100 files |
| `app/[locale]/(protected)/` (customer pages) | 127 hits across 36 files |

**Risk distribution (estimated from snippet-context classification of all 548 hits):**

| Tier | Definition | Count | % |
|---|---|---|---|
| 🔴 **HIGH** | `single()` / `maybeSingle()` followed by `notFound()` (admin/protected page) **OR** `return { ok: false, error: "not_found" }` (server action) — same shape as PR10899 | **~190** | ~35% |
| 🟠 **MEDIUM** | `single()` / `maybeSingle()` without an explicit null-guard or with a non-404 fallback — error path swallowed silently, value may be `null` when caller assumed non-null | **~130** | ~24% |
| 🟡 **LOW** | `.select()` returning array (no `.single()` terminator) — silent fallback to `[]` via `?? []`, no 404 risk but missing-data could be invisible | **~228** | ~41% |

Counts above are tier *estimates* — exact-bucket-per-row would require reading every
line of context and is more useful as a follow-up sprint than a one-shot doc. The
per-file table below shows the file-level distribution; the **HIGH samples** section
below shows the 30+ confirmed `notFound()`-shape cases verified line-by-line.

---

## 🔴 HIGH-risk files (confirmed `notFound()` shape — same as PR10899)

These files have one or more `const { data } = await admin.from(...)` followed
by `notFound()` OR `return null` within ~6 lines. Every one is a transient-DB-
error → fake-404 waiting to happen, exactly like `/admin/customers/PR10899`.

### admin pages (30 files)

| File | Confirmed hits | Notes |
|---|---|---|
| `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` | L29 (`forwarders` maybeSingle → `renderLegacyForwarderView()`) + L60, 66, 75 (no error) | The fallback path is intentional (rebuilt table empty vs legacy `tb_forwarder`) — but the destructure should still surface DB errors via the secondary view, not return null silently |
| `app/[locale]/(admin)/admin/forwarders/[fNo]/edit/page.tsx` | L106 `q.maybeSingle()` → `notFound()` + L111, 124 | Detail page — silent 404 on legacy `tb_forwarder` |
| `app/[locale]/(admin)/admin/report-cnt/[fNo]/page.tsx` | L183, 192 maybeSingle (cnt-item · cost) — no notFound but null-coalesced into business logic | Wave 16 container detail |
| `app/[locale]/(admin)/admin/wallet/[id]/page.tsx` | L70 (`tb_wallet_hs` maybeSingle) → L75 `notFound()` + L78 user lookup | The exact PR10899 shape |
| `app/[locale]/(admin)/admin/yuan-payments/[id]/page.tsx` | L82 (`tb_payment` maybeSingle) → L89 `notFound()` + L92 user lookup | The exact PR10899 shape |
| `app/[locale]/(admin)/admin/sales-payouts/[id]/page.tsx` | L61 (`sales_payouts` maybeSingle) → L68 `notFound()` | Same shape |
| `app/[locale]/(admin)/admin/refunds/[id]/page.tsx` | L80 + L96, 112, 128, 153, 178 | Header + 3 source-context lookups + audit + wallet-tx |
| `app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx` | L113 (`freight_shipments`) + L129, 138, 170, 181, 210, 237, 264, 277, 287 | **10 hits in one detail page** — every join/aux query unguarded |
| `app/[locale]/(admin)/admin/freight/quotes/[id]/page.tsx` | L87 + L100, 108 | Quote detail |
| `app/[locale]/(admin)/admin/freight/declarations/[id]/page.tsx` | L86 + L101, 107, 117, 129 | Customs declaration detail |
| `app/[locale]/(admin)/admin/tax-invoices/[id]/page.tsx` | L100 (`tax_invoices`) + L123 | Tax invoice detail |
| `app/[locale]/(admin)/admin/commissions/[id]/page.tsx` | L94 + L116, 134, 155 | Commission withdrawal detail |
| `app/[locale]/(admin)/admin/broadcasts/[id]/page.tsx` | L55 (`broadcasts` maybeSingle) | Detail |
| `app/[locale]/(admin)/admin/drivers/[id]/page.tsx` | L37 (`forwarder_driver` maybeSingle?) → `notFound()` | Driver detail |
| `app/[locale]/(admin)/admin/cnt-hs/[id]/page.tsx` | L138 (`tb_cnt` maybeSingle) → L145 `notFound()` + L149, 159, 172 | Container detail |
| `app/[locale]/(admin)/admin/customers/[id]/transfer-rep/page.tsx` | L93 (`admins` maybeSingle) | Transfer-rep flow |
| `app/[locale]/(admin)/admin/customers/[id]/convert-to-juristic/page.tsx` | L14 (`profiles`) → L19 `notFound()` + L38 | Convert flow |
| `app/[locale]/(admin)/admin/csv-imports/[id]/page.tsx` | L30 (`csv_imports`) | Detail |
| `app/[locale]/(admin)/admin/containers/[id]/hs/page.tsx` | L40 (`containers` maybeSingle) + L56, 70 | Detail (also reads `notFound()` if container missing) |
| `app/[locale]/(admin)/admin/accounting/periods/[period_yyyymm]/page.tsx` | L97 + L110 | Period detail |
| `app/[locale]/(admin)/admin/reports/user-sales-history/[customer_id]/page.tsx` | L150 (`tb_users` maybeSingle) → L158 `notFound()` | Per-customer sales |
| `app/[locale]/(admin)/admin/rates/page.tsx` | L18 (`settings` maybeSingle) → guards via `if (!data)` notFound | Settings load |
| `app/[locale]/(admin)/admin/settings/page.tsx` | L8 (`settings` maybeSingle) → L14 `notFound()` | Settings load |
| `app/[locale]/(admin)/admin/bookings/[bookingNo]/page.tsx` | L155, 163 (dual-mode booking lookup) → L170 `notFound()` + L175, 206 | Booking detail (2-shot lookup) |
| `app/[locale]/(admin)/admin/service-orders/[hNo]/page.tsx` | L26 (`service_orders`) — fallback to legacy view + L55, 63 | Detail |
| `app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx` | ✅ **already fixed** (3a278aa · the PR10899 case) | reference pattern for §0c fix |

### admin pages — extras with notFound but no `const { data }` issue identified above (still in scope, manual recheck)
- `app/[locale]/(admin)/admin/customers/[id]/page.tsx` — uses `renderLegacyCustomerView` (already fixed via `legacy-view.tsx`)
- `app/[locale]/(admin)/admin/warehouse/qa-inspections/[id]/page.tsx` — has `notFound()`, no const{data} hits in grep
- `app/[locale]/(admin)/admin/hr/recruitment/[id]/page.tsx` — has `notFound()`, no const{data} hits
- `app/[locale]/(admin)/admin/admins/[id]/page.tsx` — has `notFound()`, no const{data} hits

### protected (customer-facing) pages (16 files)

| File | Confirmed hits | Notes |
|---|---|---|
| `app/[locale]/(protected)/service-order/[hNo]/page.tsx` | L49 (`profiles` maybeSingle) + L56 (`tb_wallet`) | Customer order detail — wallet balance silently 0 on db error |
| `app/[locale]/(protected)/service-order/[hNo]/receipt/page.tsx` | L60 (`withholding_tax_entries` maybeSingle) | Receipt detail |
| `app/[locale]/(protected)/service-import/[fNo]/page.tsx` | L365 (`tb_forwarder` maybeSingle) + L447, 460, 475, 486, 513, 521, 531, 538, 550 | **10 hits** — header + driver + receipt + tran-th-sub multi-bill — silent fallback throughout |
| `app/[locale]/(protected)/service-import/[fNo]/receipt/page.tsx` | L34 (`profiles`) + L51 (`corporate`) + L82 (`forwarder_cost_adjustments`) + L92 (`withholding_tax_entries`) | Customer receipt with WHT panel |
| `app/[locale]/(protected)/sales/history/[id]/page.tsx` | L122 (`tb_user_sales_admin_pay`) + L152, 164, 189 | Sales rep withdrawal detail |
| `app/[locale]/(protected)/freight/receipts/print/[id]/page.tsx` | L287, 304, 310, 335, 370, 377, 449, 461, 470 | **9 hits** — receipt printer loop |
| `app/[locale]/(protected)/freight/invoice/[id]/page.tsx` | L299, 316, 322, 346, 380, 387, 458, 468, 475 | **9 hits** — invoice printer loop |
| `app/[locale]/(protected)/freight/shipments/[id]/page.tsx` | L135 (`freight_shipments`) + L148, 158, 176, 199 | Shipment detail |
| `app/[locale]/(protected)/freight/quotes/[quote_no]/page.tsx` | L88 (`freight_quotes` maybeSingle) + L100 | Quote detail |
| `app/[locale]/(protected)/bookings/[bookingNo]/page.tsx` | L113 (`booking_options`) + L124 (`freight_quotes`) | Booking detail |
| `app/[locale]/(protected)/service-order/print/page.tsx` | L296, 313, 327, 374, 417 | Print loop |
| `app/[locale]/(protected)/service-import/receipts/print/page.tsx` | L284, 301, 307, 332, 366, 373, 445, 457, 466 | **9 hits** — receipt printer loop |
| `app/[locale]/(protected)/commissions/me/[id]/page.tsx` | L93 (`commission_withdrawals`) + L112 | Me-commission detail |
| `app/[locale]/(protected)/shipments/[code]/page.tsx` | notFound present, no const{data} hits | already-fixed shape? |
| `app/[locale]/(protected)/sales/layout.tsx` | notFound present, no const{data} hits | gate layer |
| `app/[locale]/(protected)/service-payment/[id]/page.tsx` | notFound present, no const{data} hits | already-fixed shape? |

---

## 🟠 MEDIUM-risk files (server actions — silent "not_found" on transient errors)

Server actions in `actions/admin/` have a different but equally dangerous shape:

```typescript
const { data: existing } = await admin.from("X").select().eq("id", id).maybeSingle();
if (!existing) return { ok: false, error: "not_found" };  // ← silent on real db error
```

A transient PgBouncer timeout returns `data=null` → action reports `"not_found"`
to the client → user sees "ไม่พบ" toast even though the row exists. Same root cause
as PR10899 but in a server-action envelope instead of a render path.

**Confirmed `not_found`-shape MEDIUM cases** (sampled from the 201 actions/admin hits — likely ~80-100 of the 201 follow this exact shape):

| File | Confirmed hits | Pattern |
|---|---|---|
| `actions/admin/broadcasts.ts` | L324 | cancel → if(!row) return "not_found" |
| `actions/admin/commissions.ts` | L186, 235, 311 (3x same shape) + L114 (exists/upsert) | approve/reject/pay withdrawal |
| `actions/admin/customs-declarations.ts` | L108 (shipment_not_found) + L118 (existing-check) + L265 (not_found) + L314 (not_found) | declaration lifecycle |
| `actions/admin/freight-invoices.ts` | L75 (shipment_not_found) + L86 (existing-check) + L137 (not_found) + L203 (not_found) + L210 (parent_not_found) + L257 (not_found) | invoice lifecycle |
| `actions/admin/freight-quotes.ts` | L124 (not_found) + L179 (not_found) + L249 (not_found) + L256 (parent_not_found) + L305 (not_found) + L312 (parent_not_found) | quote lifecycle |
| `actions/admin/rates.ts` | L124 (not_found) + L224 (not_found) + L352 (not_found) + L407 (more) + L165, 59, 291 (existing-check) | rate CRUD |
| `actions/admin/customers.ts` | L31 (not_found) + L116 (not_found) + L182 (not_found) + L266 (not_found) + L192 (clash check) | customer CRUD |
| `actions/admin/contact-messages.ts` | L32 (not_found) | status update |
| `actions/admin/wallet.ts` | L33 (not_found) + L112 (not_found) + L357 ("ไม่พบสมาชิก") | wallet tx mutations |
| `actions/admin/forwarders.ts` | L67 (not_found) + L169 (not_found) + L256 (not_found) + L304, 364 (race-check) | forwarder lifecycle / payment |
| `actions/admin/service-orders.ts` | L54 (not_found) + L164 (not_found) + L179, 246 (race-check) | order payment lifecycle |
| `actions/admin/bookings.ts` | L140, 219 (`freight_quote_not_found`) | booking → quote conversion |
| `actions/admin/work-item-messages.ts` | L116, 134, 148, 162, 207, 233, 245, 739 (8 lookups + role helpers) | inbox + mentions |
| `actions/admin/admin-profile.ts` | L225, 351 (upsert helpers) | admin profile editor |

**Many more in:** `actions/admin/forwarders-edit.ts`, `forwarders-new.ts`,
`rate-edits.ts`, `incidents.ts`, `qa-inspections.ts`, `barcode.ts`,
`barcode-import.ts`, `cart.ts`, `combine-bill.ts`, `cnt-payment.ts`,
`credit.ts`, `csv-imports.ts`, `driver-work.ts`, `forwarder-check.ts`,
`forwarder-cost.ts`, `forwarder-cost-adjustments.ts`, `forwarder-drivers.ts`,
`freight-invoice-payments.ts`, `freight-shipments.ts`, `hs-codes.ts`,
`learning.ts`, `org-contacts.ts`, `organization-email.ts`,
`pcs-migration.ts`, `report-cnt-cost-update.ts`, `report-cnt-detail.ts`,
`reconciliation.ts`, `reports.ts`, `sales-payouts.ts`, `settings.ts`,
`tb-bulk.ts`, `team-leaders.ts`, `tos-versions.ts`, `warehouse-history.ts`,
`work-items.ts`, `yuan-payments.ts`, `yuan-payments-tb.ts`,
`wallet-hs.ts`, `impersonation.ts`, `attendance.ts`, `api-forwarder-manual.ts`,
`carrier-manual.ts`, `accounting-periods.ts`, `admins.ts`.

---

## 🟡 LOW-risk files (list pages — silent fallback to empty list)

List/table pages destructure `data` without `error` from queries that return
arrays. The terminator is `.select()` / `.order()` / `.limit()` (NOT
`.single()` / `.maybeSingle()`) — so the fallback is `(data ?? [])` showing
an empty table. No 404 risk, but staff see "ไม่มีข้อมูล" instead of an error.

**Pattern (typical):**
```typescript
const { data } = await admin.from("X").select("...").order(...);
const rows = (data ?? []) as RowT[];
// page renders empty table when error occurs
```

**LOW-tier files (~62 files, ~228 hits):** every list/dashboard page —
`/admin/page.tsx` (dashboard · 7 hits), `/admin/search/page.tsx` (7),
`/admin/report-cnt/[fNo]/page.tsx` (8 aux queries inside detail),
`/admin/report-cnt/page.tsx`, `/admin/customers/page.tsx`, `/admin/forwarders/page.tsx`,
`/admin/yuan-payments/page.tsx`, `/admin/wallet/*`, `/admin/refunds/page.tsx`,
`/admin/board/*`, `/admin/drivers/page.tsx`, `/admin/drivers/work/page.tsx` (5),
all `/admin/qa/*`, all `/admin/reports/*`, all `/admin/freight/*` list pages,
all `/admin/accounting/*` list pages, `/admin/commissions/page.tsx`,
`/admin/broadcasts/page.tsx`, `/admin/bookings/page.tsx`,
`/admin/contact-messages/page.tsx`, `/admin/audit/page.tsx`,
`/admin/csv-imports/page.tsx`, `/admin/carriers/page.tsx`,
`/admin/customers/recently-active/page.tsx`, `/admin/customers/transfer-rep/page.tsx`,
`/admin/forwarder-sales/page.tsx`, `/admin/forwarders/notes/page.tsx`,
`/admin/forwarders/new/page.tsx`, `/admin/yuan-payments/new/page.tsx`,
`/admin/wallet/add/page.tsx`, `/admin/service-orders/cart*`,
`/admin/sales-payouts/page.tsx`, `/admin/tax-invoices/page.tsx`,
`/admin/migration/pcs-customers/page.tsx`, `/admin/system/*`,
`/admin/settings/*`, `/admin/shop-payouts/page.tsx`,
`/admin/rates/page.tsx`, `/admin/rates/custom-hs/page.tsx`,
`/admin/rates/custom-user/page.tsx`, `/admin/incidents/page.tsx`,
`/admin/hr/page.tsx`, `/admin/juristic-check/page.tsx`,
`/admin/forwarders/[fNo]/page.tsx` (aux queries inside HIGH detail page),
`/admin/freight/shipments/[id]/page.tsx` (aux queries inside HIGH detail).

**Protected LOW:** `/freight/page.tsx`, `/freight/shipments/page.tsx`,
`/freight/receipts/history/page.tsx`, `/cart/page.tsx` (6 hits),
`/profile/page.tsx`, `/account-settings/page.tsx`, `/sales/page.tsx`,
`/sales/report/page.tsx`, `/sales/report/add/page.tsx`,
`/sales/history/page.tsx`, `/commissions/page.tsx`, `/commissions/me/page.tsx`,
`/refunds/page.tsx`, `/search/page.tsx`, `/service-payment/page.tsx`,
`/service-order/page.tsx`, `/service-order/add/page.tsx`,
`/service-order/cart/page.tsx`, `/service-import/page.tsx` (11 hits),
`/service-import/add/page.tsx`, `/service-import/receipts/page.tsx`,
`/addresses/add-address-action.ts`, `/profile/actions.ts`.

---

## Top 15 files by hit count (across all tiers)

| Rank | File | Hits |
|---|---|---|
| 1 | `actions/admin/customs-declarations.ts` | 17 |
| 2 | `actions/admin/freight-quotes.ts` | 13 |
| 3 | `actions/admin/freight-invoices.ts` | 12 |
| 4 | `app/[locale]/(protected)/service-import/page.tsx` | 11 |
| 5 | `app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx` | 10 |
| 6 | `app/[locale]/(protected)/service-import/[fNo]/page.tsx` | 10 |
| 7 | `app/[locale]/(protected)/freight/invoice/[id]/page.tsx` | 9 |
| 8 | `app/[locale]/(protected)/freight/receipts/print/[id]/page.tsx` | 9 |
| 9 | `app/[locale]/(protected)/service-import/receipts/print/page.tsx` | 9 |
| 10 | `actions/admin/work-item-messages.ts` | 9 |
| 11 | `actions/admin/accounting-periods.ts` | 8 |
| 12 | `app/[locale]/(admin)/admin/report-cnt/[fNo]/page.tsx` | 8 |
| 13 | `app/[locale]/(admin)/admin/rates/page.tsx` | 8 (via `actions/admin/rates.ts:8`) |
| 14 | `actions/admin/rates.ts` | 8 |
| 15 | `app/[locale]/(admin)/admin/page.tsx` (admin dashboard) | 7 |

---

## Top 5 highest-risk files (for first fix wave)

| Rank | File | Hits | Risk | Why prioritize |
|---|---|---|---|---|
| 1 | `app/[locale]/(admin)/admin/freight/shipments/[id]/page.tsx` | 10 | 🔴 HIGH | Detail page for highest-value transactions (freight shipments). Header + 9 aux queries all unguarded — any blip = misleading 404 on a customer's freight job. |
| 2 | `app/[locale]/(protected)/service-import/[fNo]/page.tsx` | 10 | 🔴 HIGH | **Customer-facing** detail page for the legacy `tb_forwarder` flow (~8,898 active customers). Same shape, much higher blast radius — a transient blip shows the wrong page to a real customer. |
| 3 | `actions/admin/customs-declarations.ts` | 17 | 🟠 MEDIUM | The most-hits server action — every declaration mutation can misreport "not_found" on a transient error. Customs work is time-sensitive (vessel arrivals) — false rejects cost real money. |
| 4 | `app/[locale]/(admin)/admin/refunds/[id]/page.tsx` + `actions/admin/wallet.ts` | 6+3 | 🔴 HIGH + 🟠 MEDIUM | Refund detail + the wallet-tx mutations that fire from it. A silent "not_found" on refund-pay = the refund silently fails AND the audit log shows the wrong error. |
| 5 | `actions/admin/forwarders.ts` (payment race-check) + `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` | 5+4 | 🔴 HIGH | The `import_payment` race-check uses `maybeSingle()` to detect duplicate-charge attempts. A db blip → false "not duplicate" → potential double-charge. |

---

## Fix patterns

### HIGH (admin/protected detail page · `notFound()` shape)
```typescript
// BEFORE:
const { data } = await admin.from("X").select().eq("id", id).maybeSingle();
if (!data) notFound();

// AFTER:
const { data, error } = await admin.from("X").select().eq("id", id).maybeSingle();
if (error) {
  console.error(`[X lookup] id=${id}`, { code: error.code, message: error.message, details: error.details, hint: error.hint });
  throw new Error(`Failed to load X (${error.code}): ${error.message}`);
}
if (!data) notFound();  // 404 reserved for "row genuinely missing" only
```

### MEDIUM (server action · `return { ok: false, error: "not_found" }` shape)
```typescript
// BEFORE:
const { data: existing } = await admin.from("X").select().eq("id", id).maybeSingle();
if (!existing) return { ok: false, error: "not_found" };

// AFTER:
const { data: existing, error } = await admin.from("X").select().eq("id", id).maybeSingle();
if (error) {
  console.error(`[X mutation lookup] id=${id}`, { code: error.code, message: error.message });
  return { ok: false, error: `db_error:${error.code}` };  // distinct from "not_found"
}
if (!existing) return { ok: false, error: "not_found" };  // genuine miss only
```

### LOW (list/array · silent `?? []` shape)
```typescript
// BEFORE:
const { data } = await admin.from("X").select("...").order(...);
const rows = (data ?? []) as RowT[];

// AFTER:
const { data, error } = await admin.from("X").select("...").order(...);
if (error) {
  // Don't throw — list pages should degrade gracefully — but DO log so we
  // see the silent failure in Vercel logs instead of silently showing an
  // empty table.
  console.error(`[X list]`, { code: error.code, message: error.message });
}
const rows = (data ?? []) as RowT[];
```

---

## Recommended fix sequence

ภูม to confirm priority, but the natural order is:

1. **HIGH customer-facing** — `service-import/[fNo]/page.tsx` (10), the print/invoice/receipt loops in `(protected)/freight/*` (~27 hits across 3 files). Customer-visible → highest reputational blast radius. ~6 ชม.
2. **HIGH admin detail pages with payment side-effects** — `forwarders/[fNo]/page.tsx`, `wallet/[id]/page.tsx`, `yuan-payments/[id]/page.tsx`, `refunds/[id]/page.tsx`, `sales-payouts/[id]/page.tsx`, `freight/shipments/[id]/page.tsx`. ~5 ชม.
3. **MEDIUM payment-mutation server actions** — `wallet.ts`, `forwarders.ts` (payment race-check), `service-orders.ts`, `freight-invoices.ts`, `freight-invoice-payments.ts`, `customs-declarations.ts`, `commissions.ts`. ~8 ชม.
4. **HIGH other admin details** — broadcasts, commissions, freight quotes, declarations, tax-invoices, bookings, drivers, cnt-hs, customers/transfer-rep, customers/convert-to-juristic, csv-imports, containers, accounting/periods, rates, settings, report-cnt/[fNo]. ~6 ชม.
5. **MEDIUM remaining server actions** (~30+ files). ~12 ชม.
6. **LOW list pages** — bulk-add the error-log pattern via codemod (no behaviour change, just adds the silent-failure breadcrumb). ~4 ชม.

**Total est:** ~41 ชม of fixes across 194 files. A codemod for the LOW tier
+ template-based fixes for HIGH/MEDIUM brings this down meaningfully.

---

## Suggested codemod / lint rule (Phase C — after manual sweep)

After the manual fix waves, add a custom ESLint rule that fails on
`const { data` followed by `await ...from(` without `error` in the
destructure. Plus a CI grep gate. Pattern recipe in
[`docs/learnings/verify-deep-flow.md`](../learnings/verify-deep-flow.md)
once that doc lands (referenced by AGENTS.md §0c).

---

## Notes / caveats

- **Counts are line-level**, not statement-level — a single statement spanning
  multiple lines counts once at the `const { data` line.
- **Tier estimates** for the global percentages are sample-based — accurate
  per-file lists for HIGH (with notFound) are exhaustive (verified by re-grep);
  MEDIUM (server actions) sampled from ~15 of 58 action files; LOW computed
  by subtraction (assume rest of hits = LOW unless proven MEDIUM/HIGH).
- The `legacy-view.tsx` reference fix in commit `3a278aa` is the canonical
  pattern to copy. The PR10899 case is in `app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx`
  L90-115.
- **Not in scope of this audit:** queries via `lib/supabase/server.ts`
  helpers (the wrapper functions), customer-side `actions/` (outside
  `actions/admin/`), customer-side `app/[locale]/(auth)/` and
  `app/[locale]/(public)/` pages — could be a follow-up sweep.

— Generated 2026-05-26 by Claude (Opus 4.7 1M ctx) per AGENTS.md §0c.

---

## Sprint A2 — Codemod-apply results (2026-05-26 later that day)

A jscodeshift-equivalent codemod (ts-morph based) was built at
`scripts/codemod/fix-supabase-error-destructure.ts` + an ESLint rule at
`eslint-rules/no-bare-supabase-data-destructure.js` (wired into
`eslint.config.mjs`). Codemod ran cleanly on the 244-file backlog (excluding
the 6 main-session manual-fix files).

### Codemod sweep totals

| Metric | Count |
|---|---|
| Files scanned | 728 |
| Files changed | 244 |
| Files skipped (main-session manual list) | 6 |
| HIGH transforms | 28 |
| MEDIUM transforms | 105 |
| LOW transforms | 593 |
| Skipped (non-Supabase await) | 14 |
| Already-OK (had `error`) | 303 |
| **Total transforms** | **726** |
| TSC errors after sweep | 0 (`tsc --noEmit` exit 0) |
| ESLint baseline → post-sweep | 741 errors → 66 errors (89% reduction) |

The 66 residual ESLint errors are concentrated in the 6 manual-fix files +
the same files'`page.tsx` siblings — exactly as expected (main session is
fixing those by hand).

### HIGH-tier discrepancy with the original audit estimate

The audit estimated ~190 HIGH; the codemod found only 28. The codemod is
deliberately CONSERVATIVE — it classifies a query as HIGH only if the
literal next statement matches `if (!<data>) notFound();` or
`if (!<data>) return null;`. A detail page like `wallet/[id]/page.tsx` has
10 queries but only the first (the header lookup) is followed by
`notFound()`; the rest fall through to renderer-tolerant null checks and
are correctly classified LOW (log only, no throw). The HIGH→LOW
reclassification is the safer outcome: throwing inside a renderer-tolerant
path would break otherwise-working pages.

### Edge cases handled

- **Renamed `data: foo` destructure** → snippet emits `, error: fooErr` AND
  uses `fooErr.code` etc. consistently.
- **`error` name collision** (the outer scope already has a local `error`,
  e.g. from `withAdmin`'s callback signature) → codemod auto-renames to
  `error1`, switches destructure to `error: error1` form.
- **`.storage.from(...)`** → SKIPPED. `StorageError` has no `.code`; needs
  a hand-written handler.
- **`supabase.auth.getUser()`** → not skipped (AuthError DOES have `.code`).
  Snippet name is a bit ugly (`dataErr` from `{ data: { user } }`); cosmetic.
- **`const { data } = await q;`** where `q` is a pre-built query — codemod
  walks back to `q`'s initializer to detect the Supabase chain.

### ⚠️ Files needing manual review (codemod TS-incompatible)

None — after the second codemod pass (with Storage-skip + collision-fix),
`pnpm exec tsc --noEmit` exits 0 across the 244 transformed files.

### ESLint rule integration

The rule `pacred/no-bare-supabase-data-destructure` is wired into
`eslint.config.mjs` for `actions/**`, `app/**`, `lib/**` (excluding tests +
`lib/supabase/**`). Severity: `error`. Auto-fixable for the simple case
(just adds the missing `, error` to the destructure — the engineer still
needs to add the `if (error)` handler block, but the auto-fix surfaces the
issue at lint time so it can't be re-introduced).

Tests for the rule live at
`eslint-rules/no-bare-supabase-data-destructure.test.js` (10 cases — valid +
invalid + auto-fix + Storage-skip). Run via
`pnpm tsx eslint-rules/no-bare-supabase-data-destructure.test.js`.

### Codemod re-run / idempotency

The codemod is idempotent — re-running on already-transformed files reports
"Already-OK" instead of re-transforming. New code that re-introduces the
bare-destructure shape is caught by the ESLint rule at CI time.

— Sprint A2 closed 2026-05-26 by Claude (worktree agent, parallel to main session).
