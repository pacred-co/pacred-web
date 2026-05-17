# 🎯 Pacred — Master Strategy (gap-hunt chained)

> **Produced 2026-05-17** for เดฟ. **What this is:** the synthesis step over the
> 5 deep gap-hunt docs (`gap-customer` · `gap-admin` · `gap-revenue-flow` ·
> `gap-integrations-tools` · `gap-schema-security`) + the prior 19-item roadmap
> [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) + the 8 R&D/audit docs in
> [`_index.md`](_index.md).
>
> **Why a synthesis.** The 5 gap docs each drilled one slice and each found
> *fragments* of the same few problems. Read in isolation they look like 60
> separate tickets. Read together they are **four chains** — and the chains, not
> the fragments, are what must be planned. This doc states the chains, ranks
> them, phases launch-week-vs-post-launch, and consolidates every unplanned
> `G-*` item into one backlog: **[PORT_PLAN.md Part W](../PORT_PLAN.md#-part-w--gap-hunt-backlog-2026-05-17)**.
>
> **Read order:** §1 (the security keystone — do NOW) → §2 (money-loss chain)
> → §3 (the islands theme) → §4 (Part W ranked) → §5 (phasing) → §6 (guardrail).

---

## 0. TL;DR

The cargo + freight **spine is built and launches 2026-05-18 GO** — but the 5
gap-hunts expose that the spine is **four broken chains**, not four isolated
bugs:

1. **🔴 The money-is-reachable-and-movable chain (P0, launch-week).** Three
   findings the audits filed separately — `gap-schema-security S-1`, `gap-admin
   H-1`, `gap-schema-security S-2` — are **one exploit**. A low-trust admin role
   (driver/warehouse) has a valid JWT; RLS waves it through to every money
   table; the finance admin *pages* that should gate it have no role check; and
   the convention that *would* contain a bad write is unenforced. Money is
   **reachable** (read), **movable** (write), and **un-attributed** (no DB
   audit). This is ranked first and is the only thing here that is *exploitable
   the moment a second admin role exists* — which `R-8`/`R-9` will create.

2. **🔴 The wallet-leaks-money chain (P0/P1).** `gap-schema-security G-3`,
   `gap-customer H-1`, `gap-revenue-flow H-1/H-2` are one bug class: the wallet
   ledger's balance math (`sum where status='completed'`) and its
   reference-type CHECK are too narrow, so money escapes — a freight invoice
   flips `paid` with no debit, stacked pending debits overdraw, a yuan refund
   re-completed never re-debits. **One coherent wallet-integrity guard** fixes
   all of them; three patches do not.

3. **🟠 The "islands with no bridges" theme.** Pacred-web is a set of correct
   islands — three container systems, three money tables, freight quote /
   shipment / invoice stubs — with **no edges between them**. A container marked
   `delivered` never closes the order; an order paid never appears on a
   container; a freight job delivered never bills. The audits planned the
   *islands* (`R-1` board, `R-7` ledger, `V-E` docs); nobody planned the
   *bridges*. This is the legacy "ของอยู่ไหน" leak **rebuilt inside Pacred**.

4. **The unplanned-functions backlog.** ~40 genuinely unplanned `G-*` items
   across the 5 docs, deduped against `R-1..R-19` and Part V, consolidated and
   ranked in **Part W**.

**Do-now (launch-week, all small):** W-1 (security keystone — role-pin RLS +
gate the 11 pages) · W-3 (wallet-integrity guard) · the 4 launch-day env-var /
monitoring items already in `R-M*`. Everything else is post-launch, phased in
§5.

---

## 1. 🔴 P0 SECURITY — the money-is-reachable-and-movable chain (do NOW)

> **Ranked first. This is the launch-week security fix.** Three findings the
> prior audits filed in three separate docs are **one attack chain**. The OWASP
> + RLS audits rated this area 🟢 because they checked the wrong question — see
> the "why missed" note below.

### 1.1 The three links

| Link | Doc · ID | What it is |
|---|---|---|
| **A — RLS predicate ≠ role model** | `gap-schema-security` **S-1** | Migration `0033` added admin roles `warehouse` + `driver`. But every admin-write RLS policy in `0015_admin_rbac.sql` is `for all using (is_admin()) with check (is_admin())` — **bare `is_admin()`, no role array**. `is_admin(null)` returns true for *any* active admin. So a `driver`/`warehouse` account, **directly against PostgREST with its own anon-key JWT**, can `UPDATE public.wallet SET balance=…`, `INSERT wallet_transactions` (kind `adjustment`, status `completed` → credit itself unlimited money), flip any order to `completed`, rewrite any `profiles` row (another user's `tax_id`, `credit_limit`, `sales_admin_id`), and read every customer's PII. |
| **B — finance pages have no page gate** | `gap-admin` **H-1** | 11 financially-sensitive admin pages (`/admin/wallet`, `/admin/wallet/deposit`, `/admin/accounting`, `/admin/accounting/closing`, `/admin/yuan-payments`, `/admin/tax-invoices`, `/admin/sales-payouts`, `/admin/withdrawals`, `/admin/payment`, `/admin/customers`, `/admin/forwarders`) call `createAdminClient()` (RLS-bypass) but have **no `requireAdmin([roles])`** — the `(admin)/layout.tsx` only proves "is *some* admin". The sidebar hides the menu item by role; the URL is guessable and stable. A driver navigating directly to `/admin/wallet` sees every customer's bank name, account number, slip images. |
| **C — IDOR safety is convention-only** | `gap-schema-security` **S-2** | 11 customer-facing action files use `createAdminClient()` (RLS fully bypassed) for some writes. The code is *careful today* (ownership SELECT first), but the safety is **100% convention** — the admin client will write a row for *any* `profile_id`. One future edit that trusts an input id, or forgets the SELECT, is a cross-customer write (pay another user's order from your wallet; issue a tax invoice under someone else's order). |
| **(backstop missing)** | `gap-schema-security` **G-6** | `admin_audit_log` is written *only* by the `logAdminAction()` helper inside `actions/admin/*`. A direct `createAdminClient()` / PostgREST mutation (i.e. exactly link A's exploit path) leaves **zero audit rows**. There is no DB-level mutation trail. |

### 1.2 The combined exploit

A truck driver or warehouse-scan staffer is given an admin login — the
*intended, low-trust* use of the `driver`/`warehouse` roles (`R-8`/`R-9` scope).
That account:

1. Opens `/admin/wallet` directly by URL — **link B** means no page gate stops
   the render → reads every customer's wallet PII (bank, account no., slips).
2. Does not even need the UI. With its valid JWT it hits PostgREST directly —
   **link A** means RLS approves
   `INSERT public.wallet_transactions {profile_id: <self>, kind:'adjustment',
   status:'completed', amount: 500000}` → the balance-recompute trigger fires →
   the driver's wallet now holds ฿500,000 it can withdraw.
3. **link G-6** means that INSERT wrote **no `admin_audit_log` row** — the
   helper was never on the path. The money moved with **no attribution
   anywhere**.
4. Even a future legitimate-looking feature edit that drops an ownership check
   (**link C**) turns a normal customer action into a cross-account write.

Net: **money is reachable (read), movable (write), and invisible (un-audited)
— with no role gate at any layer.** RLS is the *only* thing between a driver
login and the money tables, and today RLS says yes.

### 1.3 Why the prior audits missed it

`docs/audit/owasp-2026-05.md` (A01) and `docs/audit/rls-and-audit-log-2026-05-16.md`
both rated this 🟢. They checked **"is RLS enabled?"** — yes, 58/58 tables. They
did **not** check **"does the RLS predicate match the current role model?"** —
it does not, because `0033` added two roles *after* `0015` wrote the policies.
"`is_admin()` with no argument on a *write* policy after new roles were added"
is a money hole, not the read-route nit the OWASP audit dismissed it as. **This
is the single most important lesson for the verification playbook** — see §7.

### 1.4 The combined fix (one launch-week pass — Part W item W-1)

Do all four together; they are one defense-in-depth rebuild:

1. **Fix A — role-pin every RLS policy.** One corrective migration. Every
   `*_admin_all` policy on a money / PII / order table becomes
   `is_admin(array['super','ops','accounting'])` (or the correct subset) —
   **never bare `is_admin()`**. `warehouse`/`driver` may reach only
   `cargo_containers`, `cargo_shipment_tracking`, and scan tables. ~30 policy
   rewrites in `0015` + later migrations. Add an RLS integration test that
   asserts a `driver`-role JWT is refused on `wallet_transactions`.
2. **Fix B — gate the 11 pages.** Add `await requireAdmin([...])` at the top of
   each: `["accounting"]` for wallet / accounting / yuan / tax / payouts /
   withdrawals / payment; `["ops","sales_admin"]` for customers; `["ops"]` for
   forwarders. ~1 line each. (Also decide + document `/admin` itself —
   `gap-admin` H-2 — and `/admin/customers` PII audience — `gap-admin` H-7.)
3. **Fix C — make the ownership check un-skippable.** Where the customer's own
   RLS policy *can* express the write, **fix the RLS policy** instead of
   reaching for the admin client (this also resolves the `gap-revenue-flow`
   wallet-bypass family). Where bypass is genuinely needed, route it through a
   thin `lib/` helper that takes the *verified* `profileId` and refuses a
   mismatch.
4. **Backstop G-6 — DB-level money audit.** A Postgres trigger on
   `wallet_transactions`, `freight_invoice_payments`, `tax_invoices` that logs
   every mutation regardless of code path — so even a direct PostgREST write is
   recorded. This catches what `logAdminAction()` structurally cannot.

**Keystone = Fix A.** It is the only link *exploitable today*; B and C are
"one edit / one URL away"; G-6 is the backstop. Ship A + B launch-week (both
small); C + G-6 launch-week if time allows, else first post-launch week —
**but all four before any `warehouse`/`driver` account is created.**

Related, smaller, same family — fold into the same pass: `gap-schema-security`
**S-3** (`confirmPasswordResetByPhone` has no rate limit — account-takeover
vector), **S-4** (`proxy.ts` does zero route protection — no edge backstop if a
layout guard is ever omitted), **S-7** (`admins` write relies on default-deny
only — add a guard test). All are S effort.

---

## 2. 🔴 MONEY-LOSS — the wallet-leaks-money chain (P0/P1)

> Same class as §1 but on the *write-correctness* side, not the *authz* side.
> Three gap-doc findings = one bug family. The known P0/P1 money bugs
> (`audit-money-billing` P0-1/P0-2/P1-1..5) are **fixed** — migration 0061
> landed. This chain is what those audits did **not** cover.

### 2.1 The three links — one bug class

| Link | Doc · ID | The hole |
|---|---|---|
| **Freight wallet pay = free shipment** | `gap-schema-security` **G-3** | `freight_invoice_payments.method` accepts `'wallet'` (migration 0052) but `recordFreightPayment` **does not debit `wallet_transactions`** — because that table's `reference_type` CHECK (0007) has no `'freight_invoice'` value. Recording a freight payment as `wallet` flips the invoice to `paid` **without ever reducing the customer's wallet balance**. The shipment releases; the money was never taken. Same bug class as the *fixed* P0-2 (yuan wallet debit) — but for freight, which the money-audit never covered. |
| **Stacked pending debits → negative wallet** | `gap-customer` **H-1** | `createWithdraw` + `createYuanPayment` insert the debit as `status:'pending'`. The balance trigger (`wallet_recompute_balance`) sums only `status='completed'` rows — **a pending debit does not reduce the balance**. So a customer submits N withdraws / N wallet-paid yuan transfers, each individually ≤ balance; none reflected until an admin approves; the admin approves them all → `wallet.balance` goes **negative**. Pacred pays out / ships transfers it never funded. |
| **Yuan refund→completed never re-debits** | `gap-revenue-flow` **H-1/H-2** | `adminUpdateYuanPayment` has **no status-transition guard** (unlike `adminUpdateServiceOrder`). `refunded → completed` is freely allowed; the wallet-tx flip block only fires on a *new* `completed` and the refund branch filters `.eq("status","pending")`. So a yuan payment refunded (its wallet-tx now `cancelled`/`completed`, not `pending`) then re-set to `completed` **leaves the wallet un-touched** — customer keeps the money and the goods. |

### 2.2 Root cause + combined fix (Part W item W-3)

All three are the **same root**: the wallet ledger's two core assumptions are
too narrow —

- *balance = `sum(amount) where status='completed'`* → ignores pending debits
  and cannot represent a held reservation;
- *`reference_type` CHECK is a closed 4-value enum* (`order_header`,
  `forwarder`, `yuan_payment`, `manual`) → freight money has no legitimate way
  in, so code either skips the debit (G-3) or reaches for `createAdminClient()`
  (the §1 link C tension).

Plus the planned-but-unspecced `gap-schema-security` **S-5** (= money-audit
P1-1): there is **no `CHECK (balance >= 0)`** and no row lock — concurrent
pay-from-wallet on two orders both pass the balance check and both debit.

**The fix is one wallet-integrity guard, not three patches:**

1. Add `'freight_invoice'` to the `reference_type` CHECK + a real debit in
   `recordFreightPayment` (closes G-3 — S effort, ~15 lines).
2. The balance check (withdraw / yuan / pay-from-wallet) must sum **pending +
   completed** debits, or *reserve* funds at request time (a held bucket / a
   `completed` reservation row). One rule, applied at every debit site (closes
   H-1).
3. Add `isStatusRollback`-style transition guards to `adminUpdateYuanPayment`;
   make the refund credit fire for a *completed* wallet-tx, not only `pending`
   (closes revenue-flow H-1/H-2).
4. Balance-integrity mechanism for S-5: **not a naive `CHECK`** (it would
   hard-error a legitimate concurrent op) — use a `SELECT … FOR UPDATE` on the
   wallet row inside a DB function that does balance-check + debit atomically,
   *or* a deferred-constraint trigger that rejects the second committing debit.

Best owned **alongside the §1 security pass** so the wallet gets one coherent
guard (RLS + balance + reference-type) in a single migration. Severity: **P0
if/while freight wallet-pay is reachable; P1 otherwise** — but H-1 is
exploitable the moment withdraw + yuan are both live, i.e. at launch.

Related — fold in: `gap-revenue-flow` **H-3** (cancel-after-paid orphans the
debit), **H-7** (`forwarder_cost_adjustments` no double-submit guard →
double-charge), **H-8** (`refreshContainerTotals` manual-only → stale CBM feeds
billing). The durable answer to "where do refunds happen" is **W-5** below.

---

## 3. 🟠 THE ISLANDS WITH NO BRIDGES — wire the flow

> The single theme that ties `gap-revenue-flow` together and recurs in
> `gap-admin` H-3. Pacred-web's stages are *present*; the **edges between them
> are absent**.

### 3.1 The picture

```
quote ─✗─▶ order ─✗─▶ payment ─✗─▶ container ─✗─▶ arrival ─✗─▶ invoice ─✗─▶ receipt ─✗─▶ close
     no lock    (manual)   no attach   no propagate   no auto-bill   (ok)        no auto-close
```

Three container systems (`forwarders`, `cargo_containers`/`cargo_shipments`,
`freight_shipments`) and three money tables (`wallet_transactions`,
`freight_invoice_payments`, `forwarder_cost_adjustments`) each work in
isolation; **none signals the next**. The concrete breaks:

- **Container status never propagates to the order** (`gap-revenue-flow`
  Stage 4). `setContainerStatus` flips `cargo_containers` through `packing →
  closed` and writes history but **never updates the linked `forwarders` /
  `service_orders` rows**. The customer portal reads `forwarders.status` —
  frozen at `shipped_china` from the moment they paid. The "track my shipment"
  promise is wired to a table nothing updates. **This is the legacy
  "ของอยู่ไหน" leak reproduced inside Pacred.** `R-1` plans the *board*; it
  does **not** plan the *propagation*.
- **Two parallel container tables, no bridge** (`gap-revenue-flow` Stage 4 +
  `gap-admin` **H-3**). `/admin/containers` writes legacy `containers`;
  `/admin/warehouse/containers` writes the spine `cargo_containers`. Staff can
  create a container in *either*; the two never reconcile. `R-1` builds on the
  spine — every container made in the legacy screen is invisible to it.
- **Freight chain is four disconnected stubs** (`gap-revenue-flow` Stage 7).
  `freight_quotes` "convert-to-shipment" is a stub; `adminCreateFreightShipment`
  does not read a quote; **nothing auto-creates an invoice when a shipment is
  marked `delivered`** — a freight job reaches `delivered` with no invoice,
  revenue silently never billed. `V-E1/E6/E7` each ship a piece; the chain
  between them is the gap.
- **No order ever auto-closes** (`gap-revenue-flow` Stage 9). `service_orders`
  terminal state `completed` is set by **nothing**. Every order sits in
  `ordered` forever. The flow has no finish line.
- **No "ready to bill" gate on a container number** (`gap-revenue-flow`
  Stage 6). `adminMarkForwarderPaid` happily charges a forwarder with
  `container_id` NULL and order-time estimated CBM → systematic over/under-
  collection vs arrival reality.

### 3.2 The "wire the flow" workstream (Part W — W-1w..W-5w)

Treat the bridges as **one workstream**, sequenced — not five scattered
tickets. It is a precondition for `R-1` being worth anything (a board that
reads a table half the containers are missing from, and that the customer's
order never reflects, is theatre):

1. **W-1w — Unify the two container tables first.** Pick `cargo_containers` as
   canonical, migrate `containers`, repoint `forwarders.container_id`, convert
   `/admin/containers` to a redirect (the pattern already used for
   `/admin/orders/*`). Must precede everything else or the rest inherits the
   split.
2. **W-2w — Container→order status propagation.** `setContainerStatus` maps
   onto `forwarders`/`service_orders` status via a documented enum. The single
   highest-leverage bridge — it makes the customer portal *true*.
3. **W-3w — Arrival→billing gate.** Block `mark*Paid` / pay-from-wallet for an
   arrived cargo job until container-no + final CBM are confirmed. Pairs with
   `V-D1`/`V-D3`.
4. **W-4w — Freight chain wiring.** `quote.convert` actually creates a
   shipment; `markFreightDelivered` (or a billing action) auto-drafts the
   invoice; add the `freight_invoices` partial-unique index (mirror the P1-4
   fix `tax_invoices` got — `gap-revenue-flow` Stage 8 found `freight_invoices`
   has the same race and was not given the index).
5. **W-5w — Order auto-close.** A `…→completed` action + a trigger from
   container `delivered`. Depends on W-2w.

---

## 4. PART W — the consolidated unplanned-functions backlog

> Every genuinely *unplanned* `G-*` item across the 5 gap docs, **deduped**
> against `R-1..R-19` ([`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)) and
> Part V (`V-A..V-H`), consolidated into one ranked backlog. The full table —
> id · what · why · severity · effort · dependency · launch-blocker — lives in
> **[PORT_PLAN.md Part W](../PORT_PLAN.md#-part-w--gap-hunt-backlog-2026-05-17)**.
> This section is the *ranking rationale*; Part W is the *schedule*.

### 4.1 Ranking principle

Three tiers, by the revenue-first lens (AGENTS.md §2 — "does this get cargo
customers faster / does it stop money leaking?"):

- **Tier 0 — launch-week, security/money correctness.** Exploitable or
  money-leaking *now*. Small effort. Do before / immediately around launch.
- **Tier 1 — post-launch P0/P1, makes the product honest + bills reliably.**
  The bridges (§3) + the highest-leverage unbuilt features.
- **Tier 2 — post-launch P2/P3, supervision, polish, ecosystem.**

### 4.2 Top 8 Part-W items (ranked)

| # | Part W id | Item | Sev | Effort | Launch-blocker | Source |
|---|---|---|---|---|---|---|
| 1 | **W-1** | Security keystone — role-pin every money/PII RLS policy + add `requireAdmin([roles])` to the 11 finance pages + un-skippable ownership helper + DB-level money-mutation audit trigger | 🔴 P0 | M | **Yes — launch-week** | sec S-1/S-2/G-6 · admin H-1/H-2/H-7 |
| 2 | **W-3** | Wallet-integrity guard — `freight_invoice` reference type + debit · pending+completed-aware balance check · yuan transition guard · atomic non-negative-balance mechanism | 🔴 P0/P1 | M | **Yes — launch-week** | sec G-3/S-5 · customer H-1 · rev-flow H-1/H-2 |
| 3 | **W-2** | Wire the flow — unify the 2 container tables · container→order status propagation · arrival→billing gate · freight quote/deliver→invoice wiring · order auto-close | 🟠 P1 | L | No (post-launch P0 first wave) | rev-flow Stages 4/6/7/9 · admin H-3 |
| 4 | **W-4** | MOMO JMF sync made runnable — fill `sync.ts` upsert loop · add `app/api/cron/momo-jmf-sync/route.ts` · add the 7th `vercel.json` cron · capture the `?api=` endpoint names | 🔴 P0 | L | No (manual entry covers launch; P0 right after) | integrations G-1 |
| 5 | **W-5** | Refund money path — one credit-writing action (`kind='refund'`) covering cancel-after-paid · yuan refund of a *completed* payment · carrier-change over-collection · a customer-facing refund/claim entry | 🟠 P1 | M | No | rev-flow H-3 · admin G-6 · customer G-C2 |
| 6 | **W-6** | Admin supervisory layer — audit-log search/filter/export · staff RBAC/`super`-review console · notification delivery log · global search · cron-health panel | 🟠 P1 | M | No | admin G-1/G-2/G-5/G-7/G-9 |
| 7 | **W-7** | Customer credit line (เครดิตสินค้า / "pay later") — `profiles.credit_limit` + a credit-charge ledger kind + an outstanding-credit view + a "pay my credit" action; lights up the dead `wallet.credit_balance` UI | 🟠 High | L | No | customer G-C1 |
| 8 | **W-8** | Freight WHT gate + per-container cost basis — add `freight_invoice_id` to `withholding_tax_entries` (un-stub `getFreightReceiptGate`) + a `container_costs` carrier-rate-card table (feeds R-7, kills cargo margin-blindness) | 🟠 P1 | M | No | sec G-1/G-4 · rev-flow Stage 8 |

**Items 9+ (Tier 2 — see Part W for the full list):** customer
delivery-acknowledgement + yuan tax-invoice + wallet-tx lifecycle UX
(`gap-customer` G-C3/G-C4/H-2/H-3/H-6); admin cost-entry on container,
view-as-customer, refund desk, export hub, editable business config
(`gap-admin` G-3/G-4/G-8/G-10); webhook-receiver harness, ship-tracking feed,
PEAK, NetBay, fuel calc, Customs Trader Portal, hCaptcha fail-mode doc fix,
Sentry deprecation cleanup, dead carrier env stubs (`gap-integrations` G-3..G-13);
audit retention + `tax_id` verification gate, slip-evidence parity
(`gap-schema-security` G-5/G-7).

> **Dedup note.** `gap-revenue-flow`'s own `W-1..W-8` numbering is *folded in* —
> its W-1/W-2/W-3 (container unify + propagation + billing gate) ⇒ Part W
> **W-2**; its W-4/W-5 (deposit model + refund path) ⇒ **W-3** + **W-5**; its
> W-6 (freight wiring) ⇒ **W-2**; W-7/W-8 (yuan guard + orphan-tx report) ⇒
> **W-3** + **W-6**. Items already covered by `R-1..R-19` or `V-A..V-H` are
> **not** re-listed (e.g. the status board itself = `R-1`; the AP ledger =
> `R-7`; MOMO Pay-Later gating = `R-2`). Part W is strictly the *delta* the 5
> gap-hunts found on top of the existing roadmap.

---

## 5. Strategy — phasing

### 5.1 Launch-week (do NOW — 2026-05-17/18)

All small, all correctness — no new features:

- **W-1 Fix A + Fix B** — role-pin the RLS policies, gate the 11 finance pages.
  *(Fix C + the G-6 audit trigger: launch-week if time, else first post-launch
  week — but all of W-1 before any `warehouse`/`driver` account exists.)*
- **W-3** — the wallet-integrity guard (freight reference type + debit,
  pending-aware balance, yuan transition guard, atomic balance mechanism).
- The §1-related smalls: S-3 (reset rate limit), S-4 (`proxy.ts` edge gate),
  S-7 (`admins` guard test).
- **The 4 launch-day monitoring items** (already `R-M*`, restated as a hard
  gate not a "should"): set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_GTM_ID`, the OTP SMS-balance alert, and the hCaptcha + Upstash
  creds — **after first resolving `gap-integrations` G-3**: the hCaptcha
  prod-fail-mode doc contradiction (`lib/hcaptcha.ts` degrades **OPEN**;
  `.env.example` says **fails-closed**) decides whether the hCaptcha keys are
  *mandatory* for launch. Decide first, then the launch checklist is honest.
- Plus the already-tracked **money-audit P0-1 + P0-2** (fixed in 0061 — verify
  deployed).

### 5.2 Post-launch P0/P1 — first weeks

- **W-2** — wire the flow (container unify → status propagation → billing gate
  → freight wiring → auto-close). Precondition for `R-1` having value.
- **W-4** — MOMO sync runnable (the board's data source).
- **W-5** — the refund money path.
- **W-8** — freight WHT gate + per-container cost basis (feeds `R-7`).
- In parallel, the existing roadmap's P0/P1 first wave: `R-1` status board,
  `R-2` MOMO Pay-Later gating, the `R-7` ADR.

### 5.3 Post-launch P2/P3

- **W-6** (admin supervisory layer), **W-7** (customer credit line), then the
  Tier-2 Part-W tail (§4.2 items 9+) interleaved with `R-3..R-19`.

### 5.4 Sequencing rule

Two hard "before" constraints, both from the chains:

1. **W-1 before any `warehouse`/`driver` admin account is created** — i.e.
   before `R-8`/`R-9` ship. They are the roles the §1 exploit needs.
2. **W-2's container-table unification before `R-1`/`R-10`** — or the board
   inherits the two-table split (`gap-admin` H-3, `gap-revenue-flow` Stage 4).

### 5.5 Pacred-identity guardrail (restated — load-bearing)

The 5 gap docs are a *delta* on the 8 R&D docs, and those R&D docs catalogue a
legacy operation that **leaned on gray-channel revenue** — NNB "เหมาภาษี"
(no-document tax-included), HS-code re-engineering to dodge permits, two-track
tax figures, declared-value engineering ("แผน VAT"), ตั๋วพ่วง piggyback
declarations. **None of that is a Pacred feature.** Pacred's identity (CLAUDE.md
DNA) is the **opposite** — a legitimate, document-complete,
"เกราะป้องกันสรรพากร 100%" service. Every Part-W item that touches money,
tax, declarations, or value (W-3 wallet, W-5 refund, W-8 WHT/cost) builds the
**legitimate, fully-documented, fully-audited path only**. The legacy
*operational* lessons — status visibility, the AP/cost ledger, the float audit,
warehouse scanning, role-pinned access control — are gold; its *compliance
shortcuts* stay in the legacy system being retired. Full statement:
[`PACRED-GAP-ANALYSIS.md` §4](PACRED-GAP-ANALYSIS.md).

---

## 6. The meta-lesson — why the chains were invisible

Each of the 5 gap-hunts drilled one slice and each found *fragments*. The
fragments looked benign in isolation — `gap-admin` saw "11 pages miss a 1-line
gate", `gap-schema-security` saw "RLS predicate is stale", `gap-customer` saw
"pending debits don't reduce balance". Filed as 60 separate tickets, each gets a
"🟡 polish" rating and is deferred.

**Chained, they are four 🔴 problems.** The 11 ungated pages are only scary
*because* RLS underneath them is also open (§1). The pending-debit overdraw is
the same bug as the freight free-shipment, which is the same bug as the
yuan-refund leak (§2). The container board is worthless *because* nothing
propagates status onto the order (§3). The synthesis step is not paperwork — it
is what turns "60 polish tickets" into "4 launch-week-or-soon decisions". This
doc, and Part W, exist so that next time the team plans, it plans the **chains**.

---

## 7. Skills / playbook update prompted by this synthesis

The §1 finding — the OWASP + RLS audits rated a P0 privilege-escalation 🟢
because they checked *"is RLS enabled"* and not *"does the RLS predicate match
the role model"* — is a concrete, repeatable verification gap, and a real
addition for the **`phase-verify-loop`** skill.

**Action needed (could not be applied in this worktree — the `.claude/` tree is
permission-protected here; the owner / a session with write access should make
this one-line edit):**

> Add to the **ASSUME** step cheatsheet in
> `.claude/skills/phase-verify-loop/SKILL.md`:
>
> *"if a migration ADDED or CHANGED an admin/auth **role**: every RLS policy
> predicate **and** every `requireAdmin([...])` call was updated to the new
> role set — `RLS enabled` is NOT enough; a stale bare `is_admin()` write
> policy after a new role is added is a silent privilege escalation (see
> `PACRED-MASTER-STRATEGY.md` §1)."*

No other skill had a real, concrete addition from these 5 gap docs — they were
left untouched (the brief says only touch skills with a genuine addition).

---

## 8. Cross-references

- 📋 The 5 gap docs this chains → [`gap-customer.md`](gap-customer.md) ·
  [`gap-admin.md`](gap-admin.md) · [`gap-revenue-flow.md`](gap-revenue-flow.md) ·
  [`gap-integrations-tools.md`](gap-integrations-tools.md) ·
  [`gap-schema-security.md`](gap-schema-security.md)
- 🎯 Prior 19-item roadmap this extends → [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)
- 📚 R&D evidence base → [`_index.md`](_index.md)
- 📦 The Part W schedule → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part W (+ Part V cargo backlog)
- 💰 Money bugs this is the *delta* over → [`audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md)
- 🔐 Security audits §1 corrects → [`../audit/owasp-2026-05.md`](../audit/owasp-2026-05.md) ·
  [`../audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md)
- 🛡 Verify-loop skill that should get the §7 one-line addition → [`../../.claude/skills/phase-verify-loop/SKILL.md`](../../.claude/skills/phase-verify-loop/SKILL.md)
- ⚠️ Don't scrub legacy PCS/TTP/CargoThai refs before switchover → [`../runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)

**End — `PACRED-MASTER-STRATEGY.md`.** 5 gap-hunts chained into 4 problems:
§1 the security keystone (do NOW), §2 the wallet-leak chain (do NOW), §3 the
islands-with-no-bridges workstream, §4 Part W. Launch-week = W-1 + W-3 + the
4 monitoring env items. Everything else phased post-launch in §5.
