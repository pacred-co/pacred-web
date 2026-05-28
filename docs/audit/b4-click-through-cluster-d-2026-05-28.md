# B-4 Click-through audit · Cluster D · Tools / Reports / Settings · 2026-05-28

Static-analysis pass over the cluster-D admin pages on `claude/hopeful-almeida-359e44` (HEAD `c4417ee4`). Looks for runtime bugs that `pnpm build` + ESLint don't catch — wrong column case after the camelCase batch (migration 0113 = `tb_users` + `tb_admin` + `tb_co` · migration 0115 = `tb_cnt` + `tb_cnt_item`), reads against empty rebuilt-era tables that silently return 0 rows, missing `requireAdmin()` gates, missing error destructure, and stale references in `lib/cron/registry.ts`.

## §0 TL;DR

- **Pages audited:** ~70 (every `page.tsx` under reports/ + barcode/ + board/ + bookings/ + broadcasts/ + carriers/ + rates/ + settings/ + system/ + freight/ + audit/ + dashboard/ + kpi/ + search/ + organization-email/ + notifications/dispatch + the admin root).
- **P0 findings:** **3** (1 keystone · 1 dead-table search · 1 dead-table reports module)
- **P1 findings:** **6** (cron registry drift · missing role gate on rates hub · missing role gate on containers-hs · missing error destructure on broadcasts detail · non-atomic TOS activation · broadcasts only fan out to `profiles` which is ~empty on prod)
- **P2 findings:** **3** (1 stray comment, 1 cosmetic, 1 deferred-stub log).
- 🔴 **HIGHEST-IMPACT FINDING:** **`/admin/search` is broken for the 99.9% of real Pacred data.** The global search box queries only the rebuilt-era tables (`profiles`, `forwarders`, `service_orders`, `freight_shipments`, `tax_invoices`, `refund_requests`, `freight_quotes`) — NONE of `tb_users` (8,898 customers), `tb_forwarder` (47,626 rows), or `tb_header_order` (21,950 rows). Staff pasting any legacy member_code (`PR####`), legacy F-No, or legacy H-No gets "ไม่พบรายการ" and either re-types it elsewhere or calls a coworker. This is a staff-experience keystone — fix before next sprint demo.

## §1 P0 findings

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| 1 | `app/[locale]/(admin)/admin/search/page.tsx:88-180` | Reads only rebuilt-era tables (`profiles`, `forwarders`, `service_orders`, `freight_shipments`, `tax_invoices`, `refund_requests`, `freight_quotes`) | Global search returns 0 hits for any legacy customer/forwarder/order. On prod `profiles` has ~3 rows; the 8,898 ported customers live in `tb_users` (keyed by `userID` post-batch-1) and the 47,626 forwarders live in `tb_forwarder` (lowercase `userid`, `fno`, `fcabinetnumber`). Staff who paste a member_code from a phone call / an F-No from a receipt / an H-No from LINE see "no results" and waste time. Same shape as `/admin/page.tsx` Wave-6 rewrite — needs the equivalent tb_* sweep here. | Add a parallel section per legacy table — `tb_users.userID/userTel/userEmail/userName/userLastName/companyCustomer`, `tb_forwarder.fno/ftrackingchn/fcabinetnumber/userid`, `tb_header_order.hno/htitle/userid`, `tb_payment.id/userid` — with the same 5-result + "ดูเพิ่ม" link pattern. Detail-page hrefs use the existing legacy routes (`/admin/customers/PR####`, `/admin/forwarders/<fNo>`, `/admin/service-orders/<hNo>`, `/admin/wallet/<id>`). |
| 2 | `actions/admin/reports.ts:44-437` (5 fetchers: `getSalesMonthlyReport`, `getForwarderProfitReport`, `getShopsProfitReport`, `getYuanProfitReport`, `getOtpSuccessReport`) | All five read REBUILT-era tables (`forwarders`, `service_orders`, `yuan_payments`, `otp_codes` + `profiles`-keyed phone join) | The five report pages that import these actions — `/admin/reports/sales-monthly`, `/admin/reports/forwarder-profit`, `/admin/reports/shops-profit`, `/admin/reports/yuan-profit`, `/admin/reports/otp-success` — render with 0 rows on prod because the rebuilt tables were never backfilled (per `/admin/page.tsx` Wave-6 header note). Each page calls `res.ok ? res.data : []` and shows the empty-state "—" — looks like clean implementation, actually shows nothing useful. | Rewrite each fetcher against the legacy schema, mirroring `/admin/reports/forwarder/page.tsx` (which reads `tb_forwarder` directly): `tb_forwarder.fstatus='7'` for sales-monthly · `tb_forwarder` + `tb_users.adminIDSale` join for sales rep · `tb_payment.paystatus='3'` for yuan-profit · `tb_users` direct read + `tb_users_otp` join for otp-success. Pattern reference: the Wave 23 P1 batch 2-A rewrite of `/admin/reports/sales-by-rep` (which reads `vw_sales_by_rep`) and Wave 23 P1 batch 3 `/admin/reports/shops-profit-pay` (which reads `tb_header_order` + `tb_wallet_hs` + `tb_users`). |
| 3 | `app/[locale]/(admin)/admin/reports/containers-hs/page.tsx:53-69`<br>`app/[locale]/(admin)/admin/reports/hs-code-revenue/page.tsx:58-69` | Read REBUILT-era `container_hs_lines` + `containers` + `hs_codes` | Both HS-code-driven reports return 0 rows because those tables are an upstream pre-D1 schema (the spine ภูม retired in Wave 3 cleanup; only forwarders.cabinet_number/fcabinetnumber survives). The pages render empty-state "ไม่มี HS lines ในช่วงเวลานี้" + a dead link to `/admin/containers` (which is the spine page that was tombstoned). | Either (a) tombstone both pages with a banner pointing at the actual HS workflow on `/admin/cnt-hs` (which reads tb_cnt-keyed legacy rows), or (b) rewrite to read `tb_cnt_item` + `tb_cnt` + a yet-to-be-created legacy HS-line table if such exists. Owner-discussion needed — neither table is populated. |

## §2 P1 findings

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| 1 | `lib/cron/registry.ts` (9 entries) vs `app/api/cron/*` (10 routes) | `/api/cron/momo-sync/route.ts` exists in the filesystem but is missing from `CRON_REGISTRY` | `/admin/system/crons` won't show momo-sync's last-fire / 7-day-success / error-message panel. Operators reviewing cron health will think momo-sync isn't a cron OR is never logged; both wrong. Also breaks the "Trigger now" button surface for super-admins. | Append a `{ path: "/api/cron/momo-sync", label: "Sync ตู้/forwarder จาก MOMO", schedule: …, scheduleLabel: …, description: … }` entry. Cross-reference `vercel.json` to lift the actual schedule. |
| 2 | `app/[locale]/(admin)/admin/rates/page.tsx:16-17` (the hub) | Page calls `createAdminClient()` directly with no `await requireAdmin(…)` gate | Layout-level admin gate only proves "some admin role" — driver / warehouse roles legitimately reach floor-ops pages but they should NOT see the company-wide rate hub (yuan-rate · service-fee · QC fee · crate-fee · juristic discount · free-shipping threshold — all sensitive pricing levers). | Add `await requireAdmin(["super", "accounting"]);` as line 1 of the function (mirrors `/admin/rates/general`/`vip`/`custom-hs`/`custom-user` which all gate to these two roles). |
| 3 | `app/[locale]/(admin)/admin/reports/containers-hs/page.tsx:41-46` | Same — page calls `createAdminClient()` directly with no `await requireAdmin(…)` gate | One of 22+1 reports that's missing the role-narrow gate. Even if (per P0 #3) the page returns 0 rows, the route should still be gated — leaks the existence of the customs HS table to any admin role. | Add `await requireAdmin(["super", "ops", "accounting"]);` matching the rest of the reports/* family. |
| 4 | `app/[locale]/(admin)/admin/broadcasts/[id]/page.tsx:74-77` | `const { count } = await admin.from("notification_reads")…` — missing `error` destructure | Violates AGENTS §0c rule "destructure error from EVERY Supabase query". If the count query silently fails (RLS regression / column type change / view drift), the "เปอร์เซ็นต์อ่าน" pill renders `0%` and the admin thinks the broadcast had abysmal engagement. The actual data is still there; the read just failed. | Change to `const { count, error: countErr } = await admin.from(...)...; if (countErr) console.error("[notification_reads count] failed", { code: countErr.code, message: countErr.message });`. |
| 5 | `actions/admin/tos-versions.ts:127-168` (`activateTosVersion`) | Two separate UPDATEs (deactivate-others, then activate-this) with no transaction wrapper | Race window: if the first UPDATE succeeds and the second errors mid-flight (network blip · query timeout · RLS violation surfacing on a deeper row), all TOS versions land in `is_active=false`. Customer-side TOS-gate (per V-G4 spec) would then fail — incomplete-profile users get blocked from signup with no banner. | Wrap both UPDATEs in a single SQL/RPC call (`begin … commit`), e.g. write a `tos_versions_activate(uuid)` SECURITY DEFINER function. Alternatively: re-order so we activate the new one FIRST (so we always have at least one active), THEN deactivate the others — single-row blip leaves you with two actives temporarily, but never zero. |
| 6 | `actions/admin/broadcasts.ts:196-220` (`adminSendBroadcastNow` → fan-out) | Audience-resolution reads `profiles` only (not `tb_users`) | "Send broadcast to all customers (audience=all)" enumerates `profiles WHERE status='active'`. On prod profiles has ~3 rows (rebuilt tables never backfilled). The send card afterwards shows "ส่งสำเร็จ 3 รายการ" — staff thinks the broadcast went out + got read by 3 of 8,898 customers. **Actually only 3 rows in `notifications` were created.** The 8,895 legacy customers got nothing. | Either (a) gate broadcasts behind a banner "ส่งได้เฉพาะลูกค้าที่ register ใหม่หลัง launch · ลูกค้าเก่า 8,898 ราย ใช้ LINE blast แทน" until ภูม backfills profiles from tb_users, OR (b) extend the audience fan-out to also enumerate `tb_users.userID WHERE userActive='1'` and map those to profiles via the legacy bridge `lib/auth/pcs-legacy-bridge.ts`. Likely (a) for V1 — owner needs to choose. |

## §3 P2 findings

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| 1 | `app/[locale]/(admin)/admin/reports/pending-payments/page.tsx:16` | Stray "เติม XXX" in a JSDoc comment | Looks like a TODO placeholder that was never filled; the comment block describes the page as the wallet-page's `เติม XXX` link's twin. Harmless but reads as unfinished. | Rephrase to the actual link label or delete. |
| 2 | `app/[locale]/(admin)/admin/notifications/dispatch/page.tsx:23` | Dead-code reference: page banner says cron `/api/cron/dispatch-line-notify` is removed (LINE Notify EOL 2025-03-31) but the page is still wired to the retry button + RetryDispatchButton component | Operator action surface is honest about the deprecation; cosmetic only. | Consider hiding the retry button until the LIFF + Messaging API replacement (task L) ships, OR add a tooltip saying "Retry just resets the row — the cron that consumes it is decommissioned; redeliver via the per-notification 'push now' button instead." |
| 3 | `app/[locale]/(admin)/admin/reports/page.tsx:135-137` | TODO comment: `// TODO Phase C: decide whether to retire this tab or wire it to a real legacy commission table (tb_user_sales_admin_pay status='1' looks closest).` | Phase-C deferral noted but the `sales_payouts` tab is shipping with a 0-count badge today because the table is empty on prod. | Either retire the tab (per the TODO) or stub-banner it like the `/admin/accounting/*` Wave 23 P0 catch-all stubs. Owner / ภูม decision. |

## §4 Pages with ZERO findings (clean)

Read-only, lowercase-correct legacy reads or Pacred-original schema reads — no column-case bug, has `requireAdmin()`, destructures `error`.

### `reports/*` (correct)

- `/admin/reports/page.tsx` (hub · uses `tb_users.adminIDSale` post-rename · clean)
- `/admin/reports/forwarder/page.tsx` (reads tb_forwarder + tb_users.userID)
- `/admin/reports/shop/page.tsx` (reads tb_header_order + tb_users.userID)
- `/admin/reports/payment/page.tsx` (reads tb_payment + tb_users.userID)
- `/admin/reports/monthly-orders/page.tsx` (reads tb_forwarder + tb_users.userID + tb_payment)
- `/admin/reports/pending-payments/page.tsx` (reads tb_wallet_hs + tb_users.userID)
- `/admin/reports/credit-pending/page.tsx` (reads tb_forwarder + tb_users.userID)
- `/admin/reports/debtors/page.tsx` (reads tb_wallet + tb_cash_back + tb_users.userID)
- `/admin/reports/refunds/page.tsx` (reads tb_wallet_hs + tb_users.userID)
- `/admin/reports/shops-profit-pay/page.tsx` (Wave 23 P1 batch 3 · reads tb_header_order + tb_wallet_hs + tb_users.userID)
- `/admin/reports/user-sales-history/page.tsx` (reads tb_users.userID/adminIDSale + tb_payment + tb_forwarder + tb_header_order)
- `/admin/reports/user-sales-history/[customer_id]/page.tsx` (same)
- `/admin/reports/sales-by-rep/page.tsx` (Wave 23 P1 batch 2-A · reads vw_sales_by_rep VIEW from migration 0094 · view aliases insulate the page from underlying camelCase renames)
- `/admin/reports/forwarder-volume/page.tsx` (reads tb_forwarder · lowercase columns correct)
- `/admin/reports/containers-awaiting-th/page.tsx` (reads tb_forwarder · lowercase columns correct)
- `/admin/reports/system/page.tsx` (reads tb_web_hs + tb_page_name · lowercase columns correct)

### `barcode/*` (correct — all use tb_forwarder + tb_forwarder_import2 which aren't renamed)

- `/admin/barcode/page.tsx`
- `/admin/barcode/gateway/page.tsx`
- `/admin/barcode/cargo/{all,from,import,prepare}/page.tsx` (scanner UI — no DB reads in page)
- `/admin/barcode/driver/page.tsx`
- `/admin/barcode/driver/{all,from,import,prepare}/page.tsx` (mostly scanner UI; the writers live in `actions/admin/barcode.ts`)

### `board/*` + `bookings/*` + `broadcasts/page.tsx` + `broadcasts/new/`

- `/admin/board/page.tsx` (reads work_items + profiles + admins · Pacred-original schema)
- `/admin/board/inbox/page.tsx` (same)
- `/admin/bookings/page.tsx` (reads bookings · Pacred-original schema)
- `/admin/bookings/[bookingNo]/page.tsx` (same + booking_options + work_items + profiles)
- `/admin/broadcasts/page.tsx` (reads broadcasts · Pacred-original schema · has requireAdmin)
- `/admin/broadcasts/new/page.tsx` + `new-broadcast-form.tsx` (client form · validates via Zod)

### `freight/*` (all reads Pacred-original schema — `freight_shipments`, `freight_quotes`, `freight_invoices`, `customs_declarations` etc.)

- `/admin/freight/shipments/page.tsx` (+ `[id]/page.tsx`, `new/page.tsx`)
- `/admin/freight/quotes/page.tsx` (+ `[id]/page.tsx`, `new/page.tsx`)
- `/admin/freight/declarations/page.tsx` (+ `[id]/page.tsx`)

### `rates/*` (4 of 5 clean — the hub is the P1 #2 exception)

- `/admin/rates/general/page.tsx` (reads customer_groups + rate_general · Pacred-original · has requireAdmin)
- `/admin/rates/vip/page.tsx` (reads customer_groups + rate_vip · Pacred-original · has requireAdmin)
- `/admin/rates/custom-hs/page.tsx` (reads tb_users.userID + tb_hs_rate_custom_kg + tb_hs_rate_custom_cbm — legacy + lowercase correct)
- `/admin/rates/custom-user/page.tsx` (reads tb_rate_vip_kg + tb_rate_vip_cbm — legacy + lowercase correct)

### `settings/*` + `system/*` + `audit/*` + `kpi/*` + `dashboard/*` + `carriers/*` + `organization-email/*` + `notifications/dispatch/*`

- `/admin/settings/page.tsx` (reads settings · Pacred-original)
- `/admin/settings/business-config/page.tsx` (reads via lib helpers · audit logged on update)
- `/admin/settings/contacts/page.tsx` (reads org_contacts · Pacred-original)
- `/admin/settings/notifications/page.tsx` (reads profiles + admins · Pacred-original)
- `/admin/settings/tos-versions/page.tsx` (reads tos_versions + tos_acceptances · Pacred-original)
- `/admin/system/cron-health/page.tsx` (redirect-only stub to /admin/system/crons)
- `/admin/system/crons/page.tsx` (reads cron_invocations + CRON_REGISTRY · clean except P1 #1 drift)
- `/admin/system/notifications/page.tsx` (reads notifications + profiles · Pacred-original · gated super+ops)
- `/admin/audit/page.tsx` (reads admin_audit_log + profiles · Pacred-original · gated super)
- `/admin/kpi/page.tsx` (reads tb_users.userActive/userRegistered + tb_forwarder + tb_header_order + tb_payment + tb_wallet_hs + tb_wallet · all post-rename columns correct · gated super+ops+accounting+sales_admin)
- `/admin/dashboard/page.tsx` (redirect-only stub to /admin)
- `/admin/carriers/page.tsx` (reads carriers · Pacred-original)
- `/admin/organization-email/page.tsx` (reads tb_organization_email — not renamed · lowercase correct)
- `/admin/notifications/dispatch/page.tsx` (reads notifications + profiles · Pacred-original · gated super+ops)
- `/admin/page.tsx` (the root · uses tb_users.userActive/userID + tb_settings + tb_forwarder + tb_header_order + tb_payment + tb_wallet_hs + tb_wallet — all post-rename columns correct)

## §5 Pages NOT audited (out of scope or unable to read)

- `actions/admin/barcode.ts` (server actions for `/admin/barcode/*` writers · briefly inspected for the auto-flip-status hint #11 but not deeply audited because the user-facing PAGES are in scope, not the writer)
- `actions/admin/broadcasts.ts` lines 1-150 + 250-400 (only the audience-fan-out section was scrutinized · the other server actions handle status transitions on the `broadcasts` table, no cross-table joins to audit)
- `actions/admin/business-config.ts` (only checked for `logAdminAction` presence; per audit hint #8 the audit-log gate is satisfied)
- `actions/admin/freight-*.ts` (deferred — every freight page surfaces a server-action import; auditing them would re-audit ~15 files for the same Pacred-original schema)
- `components/admin/csv-button.tsx` / `top-menu-barcode.tsx` / shared subcomponents (pure UI · no DB)

---

## Notes on what was checked / not-checked

- **Cross-checked with `supabase/migrations/0113_align_pilot_users_admin_co.sql`** (tb_users 38 + tb_admin 38 + tb_co 4 renames) + **`0115_align_container_payment_tables.sql`** (tb_cnt 12 + tb_cnt_item 3 renames). Wave-25 batch-2a per CLAUDE.md HEAD context.
- **Postgres column-rename semantics** auto-rewrite view definitions when underlying columns are renamed via `ALTER TABLE … RENAME COLUMN`. That means `vw_sales_by_rep` (migration 0094 · references pre-rename `u.adminidsale` / `a.adminid` / `a.adminname` / etc.) still works on prod even after migration 0113 — Postgres mutated the view's stored definition during the RENAME COLUMN. The view's **output** column aliases (`admin_userid`, `adminnickname`, `admin_fullname`) never changed, so callers like `/admin/reports/sales-by-rep` are insulated. Not flagged as a finding; the migration file itself remains misleading (a developer reading 0094.sql would expect a broken view) but the runtime is fine.
- **PostgREST RPC `or()` chaining** (e.g. `/admin/search` profiles fan-out) was verified by reading the `.or([...].join(","))` syntax against PostgREST docs — correct shape.
- **Audit hint #4 "rates pages mutate tb_rate_* / tb_hs_rate_custom_*"** — verified `custom-hs/page.tsx` and `custom-user/page.tsx` writers (server actions): mutate via `actions/admin/rates-*.ts` which preserve lowercase. **Clean.**
- **Audit hint #5 "broadcasts send to MEMBER_CODES via tb_users"** — verified `adminCreateBroadcast` + `adminSendBroadcastNow`: actually the fan-out hits `profiles` (not tb_users) because audience is profile-id-keyed. This is the P1 #6 finding (broadcasts hit the ~3-row profiles table, not the 8,898-row tb_users).
- **Audit hint #6 "system/crons displays cron names — spot-check vs actual files"** — found the cron-registry drift (P1 #1).
- **Audit hint #7 "TOS-versions activate should not auto-flip customers"** — verified the workflow: `activateTosVersion` flips `tos_versions.is_active` but does NOT mass-write `tos_acceptances`. **Workflow safety OK** (the customer-side gate re-evaluates per-customer). But found a separate race (P1 #5).
- **Audit hint #8 "settings/business-config UPDATE without audit log"** — verified `actions/admin/business-config.ts:125` writes `business_config.update` via `logAdminAction`. **Clean.**
- **Audit hint #9 "missing error destructure"** — found 1 case (P1 #4). The other ~150 Supabase calls in cluster-D all destructure `error` correctly (`§0c` rule has been enforced).
- **Audit hint #10 "TODO/FIXME/HACK comments"** — found 1 substantive TODO (P2 #3 — sales_payouts tab retire decision) + 1 stray placeholder (P2 #1).
