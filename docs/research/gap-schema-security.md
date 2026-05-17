# 🔐 Pacred — Schema Gaps & Security Holes (deep drill)

> **Produced 2026-05-17** by เดฟ-led deep gap-hunt. Two angles: (1) database
> schema gaps, (2) security holes. **Drilled "ให้หมดเปลือก"** against
> `supabase/migrations/0002`–`0061` + `schema.sql`, RLS policies, `lib/auth/`,
> `lib/supabase/`, `proxy.ts`, all `actions/*` + `lib/validators/`.
>
> **Extends, does not replace** — items already planned in
> [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) (R-7 AP/cost ledger,
> R-1 status board), [`audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md)
> (P0-1/P0-2/P1-1..5), [`../audit/owasp-2026-05.md`](../audit/owasp-2026-05.md),
> [`../audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md).
> Everything below is **NEW** — not in those docs. Where a finding is adjacent
> to a planned item, it is flagged.
>
> Legacy reference: MySQL `pcsc_main` (114 tables, SQL dump
> `SQLWPPCS/somedata-2026-03-19-1348-pcsc_main.sql`).

---

## 1. Summary + security verdict

**Schema verdict — 🟡 functional but margin-blind + 2 structural gaps.**
The customer + AR spine is solid (wallet ledger, freight invoices, tax
invoices, WHT). But: (a) **zero cost/AP side** — no per-container cost basis,
no disbursement ledger, no derived profit (the legacy `tb_cost_container` +
`tb_bill`/`tb_bill_item` have no Pacred equivalent — R-7 names the *ledger*
but not the **cost-basis-per-container** table that feeds it); (b) **freight
`method='wallet'` payments do not debit the wallet** — `freight_invoice_payments`
and `wallet_transactions` have no bridge (a customer "pays" a freight invoice
from wallet and the wallet balance never moves — free shipment). (c) several
smaller column gaps (no `slip` evidence on yuan refunds, no shipment↔WHT key,
no audit-retention column).

**Security verdict — 🟠 NOT as clean as the OWASP/RLS audits concluded.**
Those audits checked "is RLS *enabled*" (yes, 58/58) but **not "does the
policy predicate match the role model"**. It does not. The headline:
migration `0033` added two new admin roles (`warehouse`, `driver`) but **every
admin-write RLS policy still uses bare `is_admin()`** (any role passes) — so a
low-trust `driver`/`warehouse` admin has **direct PostgREST read+write to every
customer's wallet, orders, tax invoices, and profiles**, fully bypassing the
app-layer `requireAdmin(["ops"])` page gates. That is a **P0 privilege
escalation**. Plus: an unauthenticated/under-gated reset-confirm path, and the
`createAdminClient` ownership-check pattern used in 11 customer action files is
correct *today* but is one careless edit away from an IDOR.

| Area | Audit said | This drill found |
|---|---|---|
| RLS coverage | 🟢 100% tables | True — but **predicate ≠ role model** (S-1) |
| `is_admin()` | 🟢 correct | Correct as a function — **mis-applied** in 30+ policies (S-1) |
| Auth gating | 🟢 strong | `confirmPasswordResetByPhone` has **no rate limit** (S-3) |
| Schema | (not audited here) | No cost/AP basis (G-1/G-2); wallet↔freight bridge missing (G-3) |

---

## 2. Schema gaps (ranked)

Effort: **S** ≤1 d · **M** 2–4 d · **L** 1–2 wk. "Planned-adjacent" = a related
item exists in PACRED-GAP-ANALYSIS but this specific table/column is not in it.

### G-1 🥇 — `container_costs` / per-container cost basis table — MISSING
- **What:** Legacy `tb_cost_container` stores `{fCabinetNumber, cost per
  product-type ×4, adminID, date}` — the **cost rate** Pacred pays the carrier
  per cabinet, per cargo type (A/M/X/O/Z). Pacred has `cargo_containers` (0033)
  but **no cost column anywhere** — not on the container, not on `forwarders`
  (`forwarders` has only `total_price` = the customer charge). There is no
  record of what a container *cost* Pacred.
- **Why:** Without a cost basis there is no margin, no "billed below cost"
  flag, no commission-on-profit. R-7 (PACRED-GAP-ANALYSIS) specs a *job-level*
  AP ledger but **not** this carrier-rate-card table — they are different: the
  rate card is the *expected* cost (priced per cabinet+type), the AP ledger is
  *actual* disbursements. The legacy ran both. R-7 as written would still be
  margin-blind on the cargo side.
- **Severity:** P1 (revenue/margin visibility). **Effort:** M. **Dep:** feeds R-7.

### G-2 🥈 — `job_costs` / disbursement (AP) ledger — MISSING (= R-7, partially planned)
- **What:** Legacy `tb_bill` + `tb_bill_item` = the billing-pack / disbursement
  records (`{billID, date, printStatus, adminID}` + line items). Pacred models
  only AR (`freight_invoices`, `tax_invoices`, `wallet_transactions`). No outflow
  table.
- **Why:** Identical to PACRED-GAP-ANALYSIS **R-7** §1.5/§1.6 — listed here only
  to (a) confirm the drill agrees it is genuinely absent, (b) note the legacy
  table names so the R-7 ADR has a concrete porting reference, (c) flag that R-7
  must be split from G-1 (rate card ≠ disbursement ledger).
- **Severity:** P1. **Effort:** L. **Status:** PLANNED (R-7) — not re-scoped here.

### G-3 🥇 — wallet ↔ freight-invoice bridge — MISSING (silent revenue leak)
- **What:** `freight_invoice_payments.method` accepts `'wallet'`
  (migration 0052) but `actions/admin/freight-invoice-payments.ts:177-181`
  documents plainly: *"method='wallet' … does NOT auto-debit wallet_transactions
  — that table's reference_type CHECK (0007) has a fixed enum with no
  'freight_invoice' value."* So recording a freight payment as `wallet`
  **flips the invoice to `paid` without ever reducing the customer's wallet
  balance.** The shipment releases; the money was never taken.
- **Why:** `wallet_transactions.reference_type` CHECK = `('order_header',
  'forwarder','yuan_payment','manual')` — no `freight_invoice`. Adding the enum
  value + a debit in `recordFreightPayment` closes it. This is the exact same
  bug class as money-audit P0-2 (yuan wallet debit) but for freight — and it is
  **not** in money-audit (which only covered cargo/yuan, freight = Phase I2).
- **Severity:** **P0 if freight goes live with wallet payment enabled**; P1
  while freight is admin-only/cash. **Effort:** S (one enum value + ~15 lines).
  **Dep:** mirrors money-audit P0-2 fix.

### G-4 — `withholding_tax_entries` has no freight key — MISSING column
- **What:** `withholding_tax_entries` (0044) keys its parent via `order_h_no`
  XOR `forwarder_f_no` only. Freight (`freight_shipments`/`freight_invoices`)
  cannot be linked. `getFreightReceiptGate()` is hardcoded `{blocked:false}`
  as a result — **a freight receipt for a juristic customer issues with the
  WHT cert ungated**, the opposite of the ADR-0015 rule for cargo.
- **Why:** Juristic freight customers withhold tax just like cargo customers;
  with no linkage the "ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ" control simply does
  not exist for freight. Self-noted as "follow-up V-A6.1" in code comments but
  **not tracked in any plan doc**.
- **Severity:** P1. **Effort:** S — add `freight_invoice_id uuid` + relax the
  XOR CHECK to a 3-way "exactly one parent". **Dep:** none.

### G-5 — yuan refund / freight have no slip-evidence parity — MINOR columns
- **What:** `yuan_payments` stores `slip_url` (customer slip) + `admin_proof_url`
  for the outbound transfer, but a **`refunded` yuan payment has no refund-slip
  column** — the legacy `tb_payment` carried separate proof for the reverse leg.
  Also `wallet_transactions` cancellations (kind flips to `cancelled`) keep no
  reason/approver pair (contrast `freight_invoice_payments` which *does* enforce
  `voided_has_reason`). Inconsistent audit completeness.
- **Severity:** P2. **Effort:** S. **Dep:** none.

### G-6 — no global DB-mutation audit; `admin_audit_log` is app-layer only — GAP
- **What:** Legacy `tb_history` logged **every SQL mutation** (`action` =
  literal SQL text, `adminID`, `date`) — a DB-level trail. Pacred's
  `admin_audit_log` is written *only* by the `logAdminAction()` helper inside
  `actions/admin/*`. Any write that bypasses that helper — a direct
  `createAdminClient()` mutation, a Supabase Studio edit, a future cron — leaves
  **no trace**. The RLS audit §6.3 already flags 3 unaudited actions; the deeper
  point is the pattern has no backstop.
- **Why:** With the S-1 privilege-escalation below, a `driver`-role admin
  editing wallets directly via PostgREST writes **zero audit rows**. A
  Postgres-trigger-based audit on the money tables (`wallet_transactions`,
  `freight_invoice_payments`, `tax_invoices`) would catch what the helper misses.
- **Severity:** P1 (pairs with S-1). **Effort:** M. **Dep:** none.

### G-7 — no audit-log retention column / no `tax_id` integrity gate — MINOR
- **What:** (a) `admin_audit_log` grows unbounded (RLS audit §7.2 noted, no
  fix) — add a `retention_class` or partition by month. (b) `corporate.tax_id`
  is customer-writable (RLS `corporate_update_own`) and `saveJuristicStep2`
  writes it with **only Zod shape validation, no DBD verification gate** — a
  customer can set any 13-digit tax ID and later have a Code-86 tax invoice
  issued under it (`requestTaxInvoice` snapshots `buyer_tax_id` from the form).
  The `corporate.status='verified'` flag exists but **nothing requires it**
  before tax-invoice issuance.
- **Severity:** P2 (retention) / P1 (tax-id — RD compliance). **Effort:** S.

---

## 3. Security holes (ranked by exploitability)

### S-1 🔴 P0 — `warehouse`/`driver` admin roles get FULL wallet/order/tax write via RLS
- **What:** Migration `0033` extends `admins.role` CHECK with `'warehouse'` and
  `'driver'`. But every admin-write policy in `0015_admin_rbac.sql` is
  `for all using (public.is_admin()) with check (public.is_admin())` — **bare
  `is_admin()` with no role array**. `is_admin(null)` returns true for *any*
  active admin row. So a `driver`- or `warehouse`-role account can, **directly
  against PostgREST with its own anon-key session** (no server action needed):
  - `UPDATE public.wallet SET balance = 9999999` for any customer
  - `INSERT public.wallet_transactions` (kind `adjustment`, status `completed`)
    → credit themselves unlimited money
  - `UPDATE public.service_orders` / `forwarders` status to `completed` free
  - `UPDATE public.tax_invoices`, `profiles` (incl. another user's `tax_id`,
    `credit_limit`, `sales_admin_id`)
  - read every customer's PII (`profiles_admin_all` is also bare `is_admin()`).
  The app-layer `requireAdmin(["ops"])` page guards are **irrelevant** — RLS is
  the only thing standing between a driver login and the money tables, and RLS
  says yes. `actions/admin/wallet.ts` etc. gate by role, but **the attacker
  does not have to use the actions** — they have a valid JWT and PostgREST is
  public.
- **Why exploitable:** `warehouse`/`driver` are explicitly the *low-trust*
  roles (scan staff, truck drivers — per `0033` + R-8/R-9 scope). Handing a
  driver the keys to every wallet is a textbook privilege escalation. The OWASP
  audit A01 said "🟢 strong … some routes assert `is_admin()` without further
  role check … not blocking" — it **missed** that `is_admin()` *with no arg* on
  a *write* policy after two new roles were added is a money hole, not a
  read-route nit.
- **Fix:** Every `*_admin_all` policy on a money/PII/order table must be
  `is_admin(array['super','ops','accounting'])` (or the correct subset) — never
  bare `is_admin()`. Audit all 30+ policies in `0015` (+ later migrations) and
  pin the role array. `warehouse`/`driver` should only reach `cargo_containers`,
  `cargo_shipment_tracking`, scan tables.
- **Severity:** **P0 exploitable.** **Effort:** M (one corrective migration,
  ~30 policy rewrites + a test). **Dep:** none — ship before any
  `warehouse`/`driver` account is created.

### S-2 🔴 P0 — `createAdminClient` ownership-check pattern is IDOR-fragile (11 files)
- **What:** 11 customer-facing action files (`payment.ts`, `forwarder.ts`,
  `service-order.ts`, `tax-invoices.ts`, `wht.ts`, `sales.ts`, `tos.ts`,
  `security.ts`, `contact.ts`, `otp.ts`, `auth.ts`) use `createAdminClient()`
  (RLS **fully bypassed**) for some writes. The current code is *careful* —
  e.g. `payServiceOrderFromWallet` does an RLS-scoped ownership SELECT first,
  then admin-client writes. But the safety is **100% convention, 0% enforced**:
  the admin client will happily write a row for *any* `profile_id`. The pattern
  "verify with `createClient()`, then mutate with `createAdminClient()`" means a
  single future edit that (a) trusts an id from the input instead of re-fetching,
  or (b) forgets the ownership SELECT, becomes a cross-customer write — paying
  another user's order from *your* wallet, or issuing a tax invoice under
  someone else's order. `requestTaxInvoice` already inserts with
  `profile_id: user.id` but reads the source order ownership correctly — good,
  but nothing in the type system or RLS *forces* it.
- **Why exploitable:** Not exploitable *today* (the reviewed code re-verifies),
  but it is the single largest latent-IDOR surface and the audits did not flag
  the *pattern* as a risk — only spot-checked individual call sites. With 11
  files and active feature work, regression probability is high.
- **Fix:** (a) Where the customer's own RLS policy *can* express the write
  (e.g. yuan `wallet_transactions` insert — money-audit P0-2 chose admin client
  because the RLS INSERT policy forbids `kind='yuan_payment'`), **fix the RLS
  policy** to permit the legitimate self-serve insert instead of reaching for
  the admin client. (b) For writes that genuinely need bypass, route them
  through a thin `lib/` helper that takes the *verified* `profileId` and refuses
  a mismatch — make the ownership check un-skippable. (c) Add an RLS integration
  test (RLS audit §8 already recommends this — tie it here).
- **Severity:** P0 (latent — exploit = one bad commit away). **Effort:** M.
  **Dep:** overlaps money-audit P0-2 (same RLS-vs-admin-client tension).

### S-3 🟠 P1 — `confirmPasswordResetByPhone` has NO rate limit (OTP brute-force)
- **What:** `requestPasswordResetByPhone` is rate-limited (`passwordReset`,
  5/h/IP) + hCaptcha. But the **second step**, `confirmPasswordResetByPhone`
  (`actions/auth.ts:413`) — the one that takes the OTP code and *sets the new
  password* — has **no `checkRateLimit`, no captcha, no IP gate**. It calls
  `verifyOtp(phone, otp, "reset")` directly. `verifyOtp` caps `attempts` at 5
  **per OTP row**, but the attacker controls timing and the victim's reset OTP
  is a 6-digit code (10⁶ space). The protections that *do* exist:
  `requestOtp` mints ≤3 rows/hour/phone, each row burns after 5 wrong tries →
  ~15 guesses/hour/phone. That bounds it, but: nothing stops an attacker
  hammering `confirmPasswordResetByPhone` the instant a victim legitimately
  requests a reset (race the real user to the 5 attempts), and there is **no
  IP-level or account-level lockout, no Sentry signal** on a burst of failed
  resets. `registerPersonal` + `confirmPhoneChange` share the same un-rate-
  limited `verifyOtp` exposure.
- **Why exploitable:** Account-takeover vector. The DB attempt-cap makes it
  *slow*, not *blocked*, and the missing alerting means a sustained campaign is
  invisible. `OTP_BYPASS=true` in any non-prod env makes `verifyOtp` return
  `true` for *any* code — must be verified off in prod (checklist item, but no
  runtime guard).
- **Fix:** Add `checkRateLimit("passwordReset", ip)` (or a stricter dedicated
  bucket) + the same to `confirmPhoneChange` / `registerPersonal`. Consider a
  per-phone failed-verify counter that locks for 1h after N total failures
  across rows. Wire a Sentry alert on OTP-verify failure bursts (ties to R-M3).
- **Severity:** P1. **Effort:** S. **Dep:** none.

### S-4 🟠 P1 — `proxy.ts` middleware does ZERO route protection
- **What:** `proxy.ts` only (a) runs i18n, (b) sets the visitor cookie,
  (c) refreshes the Supabase session. It **never checks auth and never
  redirects** — every `(protected)` and `(admin)` route is guarded *solely* by
  the per-layout `requireAuth()`/`requireAdmin()` call. The OWASP audit calls
  this "defence-in-depth, 3 layers" — but layer 1 (middleware) is **not actually
  a gate**, it is a session refresher. If any admin/protected layout ever ships
  without its `requireAdmin()`/`requireAuth()` call (easy in a 95-route admin
  surface), that route is **wide open** with no middleware backstop. There is
  no allowlist/denylist at the edge.
- **Why exploitable:** Not a live exploit — it is a missing safety net that
  makes any future "forgot the guard" mistake a full exposure instead of a
  caught one. Pacred has 95 admin routes; the probability one ships unguarded
  over the V2 long-phase is non-trivial.
- **Fix:** Add a path-prefix check in `proxy.ts` — for `/**/admin/**` and the
  `(protected)` route set, if `supabase.auth.getUser()` is null, redirect to
  `/login` at the edge. Keep layout guards as layer 2. Cheap, and converts a
  latent hole into defence-in-depth that is *actually* deep.
- **Severity:** P1. **Effort:** S. **Dep:** none.

### S-5 🟠 P1 — no DB-level negative-balance floor on `wallet` (concurrent overdraw)
- **What:** This is money-audit **P1-1** ("no negative-balance floor … concurrent
  pay-from-wallet on two orders overdraws") — **confirmed and sharpened here.**
  `payServiceOrderFromWallet` + `payForwarderFromWallet` + `createWithdraw` +
  `createYuanPayment` each do a read-balance-then-insert-debit with **no row
  lock and no DB CHECK**. The 0049/0061 partial-unique indexes prevent
  double-paying the *same* order, but **two different orders** (or an order +
  a withdraw) paid concurrently both pass the balance check and both debit →
  `wallet.balance` goes negative. `wallet_recompute_balance()` recomputes from
  `sum(amount)` and will cheerfully store a negative number — there is **no
  `CHECK (balance >= 0)`** on `public.wallet`.
- **Why listed despite being "planned":** money-audit names P1-1 but the *fix*
  is not specced. The drill's recommendation: a `CHECK` alone is wrong (it would
  hard-error a legitimate concurrent op); the correct fix is either (a) a
  `SELECT ... FOR UPDATE` on the wallet row inside a DB function that does
  balance-check + debit atomically, or (b) a deferred-constraint trigger that
  rejects the *second* committing debit. Flagged so the P1-1 fix picks the
  right mechanism, not a naive CHECK.
- **Severity:** P1. **Effort:** M. **Status:** PLANNED (P1-1) — mechanism note added.

### S-6 🟡 P2 — `requestOtp` rate limit is per-phone only; no IP/global cap (SMS-cost abuse)
- **What:** `requestOtp` (`actions/otp.ts`) rate-limits **3/hour/phone** via the
  `otp_codes` table. There is **no IP-level limit** on OTP *requests* — an
  attacker scripts thousands of distinct phone numbers and burns the ThaiBulkSMS
  balance (each request = a real paid SMS). The IP `checkRateLimit` on
  `registerPersonal`/`reset` is on the *outer* action, but `requestOtp` is also
  exported and callable directly as a server action, and `requestPhoneChangeOtp`
  reaches it after only a password check. The legacy "OTP credit ran dry → 14h
  dead signups" (`DI-3`) is a *reliability* incident; this is the *adversarial*
  version of the same drain.
- **Why exploitable:** Financial-DoS on the SMS budget + can starve real
  signups. Bounded only by hCaptcha on the outer flows — and `requestOtp`
  itself has no captcha.
- **Fix:** Add an IP-keyed rate limit *inside* `requestOtp` (e.g. 10/h/IP) and
  a global daily ceiling with a Sentry/LINE alert (ties R-M3 SMS-balance alert).
- **Severity:** P2. **Effort:** S. **Dep:** R-M3.

### S-7 🟡 P2 — `admins` table has no RLS write policy → relies entirely on no-anon-grant
- **What:** `0015` enables RLS on `admins` and adds only a SELECT policy; the
  comment says INSERT/UPDATE/DELETE "go through the service-role admin client."
  Correct — but it means **the *only* thing preventing self-grant of `super`
  is that no INSERT policy exists** (default-deny). That is fine *as long as*
  no migration ever adds a permissive `admins` write policy and `adminGrantRole`
  stays `withAdmin(["super"])`-gated. Worth a guard test: an assertion that
  `admins` has exactly one policy (the SELECT) and that PostgREST INSERT as a
  normal user fails. Low risk, high blast radius if it ever regresses.
- **Severity:** P2 (latent). **Effort:** S (a test). **Dep:** none.

### S-8 🟡 P2 — `logAdminAction` is best-effort; money mutations can lose their audit row
- **What:** `withAdmin` → `logAdminAction` swallows insert errors by design
  ("losing the audit row is preferable to rolling back work"). For *money*
  mutations (`forwarder.mark_paid`, `wallet` adjustments, `tax_invoice` issue)
  a silently-lost audit row means an unexplained balance change. Combined with
  G-6 (no DB-level trail) there is a window where money moved and nothing
  recorded who did it.
- **Fix:** For the money-critical namespaces, make the audit insert part of the
  same transaction (or use the G-6 DB trigger as the authoritative trail and
  keep `logAdminAction` as the human-readable layer).
- **Severity:** P2. **Effort:** S–M. **Dep:** G-6.

---

## 4. Chain notes (how findings compound)

- **S-1 × G-6 × S-8 — the silent-money chain.** A `driver`-role admin (S-1) can
  write `wallet_transactions` directly via PostgREST, which (G-6) leaves no
  DB-level trail, and even an action-routed money mutation (S-8) can lose its
  `admin_audit_log` row. Net: a money movement with **no attribution anywhere**.
  Fixing S-1 (role-pinned RLS) is the keystone; G-6 (DB trigger audit) is the
  backstop. Do S-1 first — it is the only one that is *exploitable now*.

- **S-2 × G-3 — the wallet-bypass family.** money-audit P0-2 (yuan), G-3
  (freight), and S-2 (the admin-client pattern) are three faces of one root
  cause: `wallet_transactions` RLS is too tight for legitimate self-serve money
  movement, so code reaches for `createAdminClient()` and the safety degrades to
  convention. The durable fix is **one well-designed RLS policy** for self-serve
  debits keyed on a verified reference, after which most `createAdminClient()`
  money writes can drop back to the RLS-scoped client.

- **S-3 × S-6 — the OTP-abuse pair.** Un-rate-limited *verify* (S-3, takeover)
  + un-IP-limited *request* (S-6, SMS drain) — both invisible without alerting.
  R-M3 (SMS-balance + burst alerts) is the shared monitoring fix; the rate-limit
  additions are the shared prevention fix.

- **S-4 × S-1 — the missing net.** Neither the edge (S-4) nor — for
  `warehouse`/`driver` — RLS (S-1) currently gates the admin surface correctly.
  If a layout guard is ever omitted, S-4 means no edge catch and S-1 means RLS
  waves the under-trusted role through. Two independent safety nets, both with
  holes; close S-1 and S-4 and a single forgotten `requireAdmin()` becomes a
  caught mistake instead of a breach.

- **G-1/G-2 vs R-7.** R-7 in PACRED-GAP-ANALYSIS is real and planned, but the
  drill shows it must be **two tables** (carrier rate card `tb_cost_container`
  → G-1, *and* the disbursement ledger `tb_bill`/`tb_bill_item` → G-2/R-7), not
  one. The R-7 ADR should say so explicitly or the cargo side stays margin-blind.

---

## 5. Priority recap

| ID | Title | Sev | Effort | Status |
|---|---|---|---|---|
| **S-1** | `warehouse`/`driver` roles → full wallet/order/PII RLS write | **P0** | M | NEW — fix before any such account exists |
| **S-2** | `createAdminClient` ownership pattern IDOR-fragile (11 files) | **P0** (latent) | M | NEW |
| **G-3** | wallet ↔ freight-invoice bridge missing (free shipment) | P0/P1 | S | NEW |
| S-3 | `confirmPasswordResetByPhone` no rate limit | P1 | S | NEW |
| S-4 | `proxy.ts` does no route protection | P1 | S | NEW |
| S-5 | no negative-balance floor on `wallet` | P1 | M | money-audit P1-1 (+mechanism) |
| G-1 | per-container cost basis table missing | P1 | M | NEW (feeds R-7) |
| G-4 | `withholding_tax_entries` no freight key | P1 | S | NEW |
| G-6 | no DB-level mutation audit | P1 | M | NEW |
| G-2 | AP/disbursement ledger | P1 | L | PLANNED (R-7) |
| S-6 | `requestOtp` no IP/global cap (SMS drain) | P2 | S | NEW |
| S-7 | `admins` write relies on default-deny only | P2 | S | NEW |
| S-8 | `logAdminAction` best-effort loses money audit rows | P2 | S–M | NEW |
| G-5 | yuan-refund / cancel slip+reason parity | P2 | S | NEW |
| G-7 | audit retention + `tax_id` verification gate | P1/P2 | S | NEW |

**Do-now (pre-launch / pre-role-rollout):** S-1 (keystone), G-3 (if freight
wallet pay is reachable), S-3, S-4 — all small-to-medium, all close exploitable
or one-edit-away holes the prior audits rated 🟢.

---

**End — `gap-schema-security.md`.** Drill scope: `supabase/migrations/0002`–
`0061` + `schema.sql`, all RLS policies, `lib/auth/*`, `lib/supabase/*`,
`proxy.ts`, `actions/*` + `lib/validators/*`, vs legacy `pcsc_main` (114 tables).
Cross-ref: [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) R-7 ·
[`audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md) P0-1/P0-2/P1-1 ·
[`../audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md) ·
[`../audit/owasp-2026-05.md`](../audit/owasp-2026-05.md).
