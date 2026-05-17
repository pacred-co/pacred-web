# 🚀 Pacred — Upgrade Plan (post-launch roadmap)

> **Produced 2026-05-17** (launch eve), for เดฟ. The single execution-sequenced
> rollup of all **post-launch** work — phases, gate, dependencies, ownership.
>
> **This is a consolidation, not a re-spec.** Per-item detail lives in the
> source docs (linked per item). This doc owns the *sequence*, the *gate*, and
> the *cross-cutting phasing* — the source docs own the *what* and the *how*.
>
> **Sources consolidated:**
> [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md)
> §3 (wire-the-flow) + §4 (Part W ranked) + §5 (phasing) ·
> [`PORT_PLAN.md`](PORT_PLAN.md) Part W (gap-hunt backlog) + Part V (cargo
> backlog) · [`research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md)
> R-1..R-19 · [`research/legacy-chat-datanew-2026-05-17.md`](research/legacy-chat-datanew-2026-05-17.md)
> DN-1..DN-5 · the tools agenda (PEAK / NetBay / ship-tracking / fuel-calc /
> Customs Trader Portal).
>
> **Scope = V2 `pacred-web` (this repo).** V3 architecture is a **separate
> repo** (`pacred-DPX`) per [ADR-0010](decisions/0010-v2-v3-version-strategy.md)
> — out of scope here. This plan upgrades the *shipped V2*; it does not
> redesign it.

---

## §0 — 🔴 THE GATE — before ANY upgrade *execution*

The launch-week security/money code (W-1 · W-3 · S-3/S-4/S-7 · 0064
overdraw-guard) is **merged** on `dave`/`Poom`/`podeng` and passes static
verify + production build + a route-level smoke. It is **not yet** verified
"every function works" — no authenticated end-to-end flow has been exercised,
and the 14 migrations are not yet in the database.

**No upgrade item below is *coded* until this gate is green:**

1. **ภูม applies the 14 migrations** (`0044`-`0052` + `0060`-`0064`) to Supabase
   **dev → prod** — runbook [`runbook/poom-apply-migrations-2026-05-17.md`](runbook/poom-apply-migrations-2026-05-17.md)
   (verify queries through (9)).
2. **`dave → main` deploy** — *after* (1), ก๊อต gate. Ordering is load-bearing:
   the code on `main` expects schema `0062`-`0064`; deploying before the
   migrations are applied breaks freight wallet-pay + the overdraw floor.
3. **Post-launch functional verification on the LIVE system** — production
   smoke + *walk the key flows* and confirm each produces the **right result**,
   not merely "no 500":
   - the 6-step billing flow (datanew **L-1**): button → debt notice + invoice
     → customer pays + uploads slip → staff verifies → save → receipt;
   - place a cargo order · pay-from-wallet (customer + admin mark-paid) ·
     a freight invoice + payment · a withdraw (confirm the 0064 overdraw floor
     actually rejects an overdraw) · an admin role-gated page as a low-trust
     role (confirm W-1 RLS role-pin).
4. **Only after (3) is green → Phase U1 execution begins.**

> Planning / spec / ADR work for U1-U4 **may proceed in parallel** with the
> gate — only *code that touches the running system* waits.

**Not a phase — do this week regardless:** rotate the leaked legacy credential
(`pacred.co/wp-admin` — datanew **L-5**). It is a WordPress login, not
`pacred-web`, but `admin_tam` / `123456` is live and weak.

---

## §1 — Phase U1 · Make the product honest (wire the flow)

> **Why first.** Master Strategy §3: Pacred-web is "correct islands with no
> bridges" — a container marked delivered never closes the order, a paid order
> never appears on a container, a delivered freight job never bills. The status
> board (R-1) is theatre until the bridges exist. U1 builds the bridges + the
> highest-leverage unbuilt money paths. **Revenue-first** — every U1 item makes
> the product either *true* or *able to bill*.

| id | item | why | source | effort | status |
|---|---|---|---|---|---|
| **U1-1** | **Unify the two container tables** — pick `cargo_containers` canonical, migrate legacy `containers`, repoint `forwarders.container_id`, redirect `/admin/containers` | the rest of U1 (and R-1) inherits a split if this is not first | Part W W-2 · MS §3.2 W-1w | M | ✅ shipped 2026-05-17 (commits `cfb78aa` + `6681657` audit-fix: legacy writes stubbed, detail page redirects to spine, migration `0059` + `0066` triggers) |
| **U1-2** | **Container→order status propagation** — `setContainerStatus` maps onto `forwarders`/`service_orders` status via a documented enum | the single highest-leverage bridge — makes the customer "track my shipment" page *true* | Part W W-2 · MS §3.2 W-2w | M | ✅ shipped 2026-05-17 (commit `d4339bd`: cascadeContainerToShipments + cascadeShipmentToOrders + 4 audit events; forward-only; best-effort) |
| **U1-3** | **Arrival→billing gate** — block mark-paid / pay-from-wallet for an arrived cargo job until container-no + final CBM confirmed | pairs with datanew **L-3**: PCS vs MOMO CBM disagree ~31% every container — bill off the MOMO closed-container figure, not the order-time estimate | Part W W-2 · MS §3.2 W-3w · datanew L-3 | M | ✅ shipped 2026-05-17 (commit `d31e906`: `getCargoBillingGate()` + wired into `adminMarkForwarderPaid` (with `allow_unverified_billing` admin escape hatch) + `payForwarderFromWallet` (customer, no escape); fail-OPEN on DB read errors; 2 distinct audit events) |
| **U1-4** | **Freight chain wiring** — `quote.convert` creates a shipment · `markFreightDelivered` auto-drafts the invoice · `freight_invoices` partial-unique index | a delivered freight job currently reaches `delivered` with no invoice — revenue silently un-billed | Part W W-2 · MS §3.2 W-4w · Part V V-E6/E7 | M | ✅ shipped 2026-05-17 (commits `6a63464` + `6681657`: auto-draft-invoice on delivery + auto-convert on accept + `freight_invoices` partial-unique on `(freight_shipment_id) where status != 'cancelled'`) |
| **U1-5** | **Order auto-close** — a `…→completed` action + a trigger from container `delivered` | `service_orders.completed` is today set by nothing — the flow has no finish line | Part W W-2 · MS §3.2 W-5w | S | ✅ shipped 2026-05-17 (commit `d4339bd`: `service_order.auto_close_on_delivery` audit event on cascade hop shipment.delivered → service_order.completed) |
| **U1-6** | **Refund money path** — one credit-writing action (`kind='refund'`) covering cancel-after-paid · yuan refund of a completed payment · carrier-change over-collection · a customer-facing refund/claim entry | Master Strategy §2 "where do refunds happen" — currently nowhere coherent | Part W W-5 · gap-revenue-flow H-3 | M | ✅ shipped 2026-05-17 (commits `1a35ada` + `6681657`: `refund_requests` table + 5 actions + customer self-serve + admin queue + terminal-state lock trigger in `0066`) |
| **U1-7** | **MOMO JMF sync runnable** — ⚠️ **first correct the API docs** (datanew **L-0**): real surface is `https://api.momocargo.com:8080` REST (`/api/func/get/import/track/{range}`, `/api/func/get/container/closed/{range}`, `/api/sack/get/info/{code}`, date = `YYYY-MM-DD+YYYY-MM-DD`) — **not** the retired `api-cn.alilogisticshub.com` `?api=` decode. Then build the sync client + `app/api/cron/momo-jmf-sync/route.ts` + the 7th `vercel.json` cron | the status board's data source; the existing `momo-jmf-api-decoded.md` decode is wrong | Part W W-4 · datanew L-0 | L | ⏸ blocked on L-0 API doc correction |
| **U1-8** | **Launch-monitoring env live** — `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` · `NEXT_PUBLIC_GTM_ID` · Clarity · hCaptcha + Upstash creds · OTP SMS-balance alert | observability for everything above; resolve the hCaptcha fail-mode doc contradiction first (gap-integrations G-3) | MS §5.1 R-M* · gap-integrations G-3 | S | 🟢 code-ready (audit 2026-05-17): Sentry init in `instrumentation-client.ts` + `.server.config.ts` + `.edge.config.ts` ✓; `<GtmScript />` + `<ClarityScript />` mounted in root `layout.tsx` ✓ (no-op when env unset); `lib/hcaptcha.ts` wired in `/auth/register` + `/forgot-password` ✓; `/api/cron/sms-balance-check` registered in `vercel.json` ✓. Remaining: deployment-side env-var set in Vercel (`docs/env.md` §"Launch checklist" covers acquisition steps) |

**Status note (2026-05-17 night, final):** **6 of 8 U1 items shipped** (U1-1, U1-2, U1-3, U1-4, U1-5, U1-6). U1-8 is 🟢 code-ready (env-only). Only U1-7 (MOMO sync) outstanding — blocked on L-0 API doc fix. **Phase U1 coding is effectively complete.** Bonus: **U2-3 shipped** at `6681657` (`getFreightReceiptGate` wired against `freight_invoice_id` WHT entries). Tonight's commit chain: `cfb78aa` U1-1 · `1a35ada` U1-6 · `6a63464` U1-4 · `d4339bd` U1-2+U1-5 · `6681657` U2-3 + audit-fix · `d31e906` U1-3 · plus 3 doc commits. All on origin/Poom.

**Interleaves with:** R-1 status board (depends on U1-1 + U1-2) · R-2 MOMO
Pay-Later gating (depends on U1-7).

---

## §2 — Phase U2 · Revenue, margin, data integrity

> Once the flow is honest (U1), U2 makes the money side *complete and
> measurable* — and absorbs the legacy customer base.

| id | item | why | source | effort | status |
|---|---|---|---|---|---|
| **U2-1** | **PCS→Pacred customer migration** — backfill legacy customers, re-stamp `PCS<n>` → `PR<n>`; **offset `member_code_seq`** so a migrated `PR1234` never collides with a fresh-signup `PR001` | datanew **L-2** — a launch-week job; the sequence offset is the one technical trap | datanew L-2 · migration `0060` | M | ⏳ pending |
| **U2-2** | **Per-container cost basis + AP/disbursement ledger** — `container_costs` carrier-rate-card table + the disbursement ledger (legacy `tb_cost_container` + `tb_bill`) | Pacred has zero cost side today → no margin, no "billed below cost" flag, no commission-on-profit | Part W W-8 · R-7 · gap-schema-security G-1/G-2 | L | ⏳ pending |
| **U2-3** | **Freight WHT gate** — add `freight_invoice_id` to `withholding_tax_entries`, un-stub `getFreightReceiptGate()` | juristic freight customers withhold tax like cargo customers — the "no cert → no receipt" control does not exist for freight today | Part W W-8 · gap-schema-security G-4 · Part V V-A6.1 | S | ✅ shipped 2026-05-17 (commit `6681657`: `getFreightReceiptGate` queries `withholding_tax_entries.freight_invoice_id`; blocks when `cert_status='pending'`; fails OPEN on transient DB errors) |
| **U2-4** | **PEAK accounting integration** — sync issued invoices / receipts to PEAK | tools agenda — closes the books loop; removes manual re-keying | tools agenda | L | ⏳ pending |
| **U2-5** | **"sack" entity** — model the `CBX…-EK…` sack the legacy ops use; missing from the Pacred schema | datanew **L-4** — surfaces in IT-team chat container handling | datanew L-4 | M | ✅ shipped 2026-05-17 (migration `0068`: `cargo_sacks` + `cargo_sack_seq` + `next_sack_code()` daily-reset + `cargo_shipments.cargo_sack_id` FK + RLS customer-via-shipment-ownership + `lib/warehouse/sacks.ts` with `upsertSackByCode` MOMO entry-point + `reconcileSack` outside-vs-inside CBM gap helper) |

---

## §3 — Phase U3 · Ecosystem & integration tools

> The tools agenda — turn Pacred from "a portal" into the full-loop platform
> the DNA promises ("ทุกคนนำเข้า-ส่งออกได้ ง่ายๆแค่ปลายนิ้ว"). Each item is an
> external-integration build (L effort) — schedule by partner-readiness.

| id | item | why |
|---|---|---|
| **U3-1** | **NetBay — ใบขนสินค้า** (customs declaration) integration | service #8 `shipping-document` — currently TBD |
| **U3-2** | **Customs Trader Portal** integration | broker/declaration lifecycle; service #1 `customs-broker-matching` + #6 `customs-clearance` |
| **U3-3** | **Real-time container / ship tracking** — by vessel + voyage (MarineTraffic-style live position), surfaced on the customer shipment page | makes "track my shipment" a live map, not a status string |
| **U3-4** | **Fuel surcharge calculator** — fuel-indexed surcharge in the freight quote engine | quote accuracy; legacy ops re-price on fuel |
| **U3-5** | **Driver scheduling** — extends the `driver-runs` / barcode-scan flow into an assignable schedule board | the warehouse/driver roles (R-8/R-9) need a workspace |
| **U3-6** | **Webhook-receiver harness** — a tested inbound-webhook surface for partner callbacks (MOMO / carriers / payment) | gap-integrations — replaces poll-only sync where partners support push |

> Sourced from the tools agenda + gap-integrations G-3..G-13 + Part W item-9+
> tail. These are independent — sequence by which partner credential / API
> access lands first.

---

## §4 — Phase U4 · Supervisory layer & customer depth

| id | item | why | source |
|---|---|---|---|
| **U4-1** | **Admin supervisory layer** — audit-log search/filter/export · staff RBAC / `super`-review console · notification delivery log · global search · cron-health panel | the back-office can *do* things but not *oversee* them | Part W W-6 |
| **U4-2** | **Customer credit line** (เครดิตสินค้า / pay-later) — `profiles.credit_limit` + a credit-charge ledger kind + an outstanding-credit view + a "pay my credit" action; lights up the dead `wallet.credit_balance` UI | a real revenue feature legacy customers expect | Part W W-7 |
| **U4-3** | **Tier-2 tail** — customer delivery-acknowledgement · yuan tax-invoice · wallet-tx lifecycle UX · admin view-as-customer · export hub · editable business config · audit retention · `tax_id` verification gate | the polish backlog | Part W §4.2 items 9+ · gap-customer / gap-admin |

---

## §5 — Sequencing rules (hard constraints)

1. **§0 gate is green before any U1 code.** Non-negotiable — the user's
   "ถ้าเช็คชัวร์แล้ว" rule. Planning may run ahead; code may not.
2. **U1-1 (container unify) before everything else in U1** — and before R-1 /
   R-10 — or every later piece inherits the two-table split.
3. **U1-7: correct the MOMO API docs before writing the sync client.** The
   on-record decode is wrong (datanew L-0). A wrong client is worse than none.
4. **W-1 must be live before any `warehouse`/`driver` admin account is created**
   — it is already merged; migration `0062` (in the §0 batch) applies the RLS
   role-pin. Do not create those accounts until §0 step 1 is done on prod.
5. **L-5 credential rotation is this-week, phase-independent.**
6. Within a phase, items are roughly ranked top-to-bottom; U1-1 → U1-5 is a
   strict chain, U1-6/U1-7/U1-8 can run in parallel once U1-1 lands.

---

## §6 — Pacred-identity guardrail (load-bearing — restated)

The legacy PCS/TTP operation leaned on **gray-channel** practice (no-document
"เหมาภาษี", HS-code re-engineering, declared-value engineering, ตั๋วพ่วง). The
R&D docs catalogue it as *operational lessons*, **not features**. Every U-item
that touches money / tax / declarations / value (U1-3 billing, U1-6 refund,
U2-2 cost, U2-3 WHT, U3-1 NetBay, U3-2 Customs Trader Portal) builds the
**legitimate, document-complete, fully-audited path only** — Pacred's identity
is the *opposite* of the legacy shortcut. Full statement:
[`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md) §5.5.

---

## §7 — Cross-references

- 🎯 Strategic synthesis this sequences → [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md)
- 📋 Detailed backlogs → [`PORT_PLAN.md`](PORT_PLAN.md) Part W (gap-hunt) + Part V (cargo)
- 🗺 Prior 19-item roadmap (R-1..R-19) → [`research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md)
- 🆕 Launch-eve data findings (DN-1..DN-5) → [`research/legacy-chat-datanew-2026-05-17.md`](research/legacy-chat-datanew-2026-05-17.md)
- 🔐 Gap drills → [`research/gap-customer.md`](research/gap-customer.md) · [`research/gap-admin.md`](research/gap-admin.md) · [`research/gap-revenue-flow.md`](research/gap-revenue-flow.md) · [`research/gap-integrations-tools.md`](research/gap-integrations-tools.md) · [`research/gap-schema-security.md`](research/gap-schema-security.md)
- 🗄 The §0 migration gate → [`runbook/poom-apply-migrations-2026-05-17.md`](runbook/poom-apply-migrations-2026-05-17.md)
- 🧭 V3 (separate repo — NOT this plan) → [ADR-0010](decisions/0010-v2-v3-version-strategy.md)
- 📘 Entry point → [`HANDBOOK.md`](HANDBOOK.md) · master single-read → [`STRATEGY.md`](STRATEGY.md)

---

**End — `UPGRADE_PLAN.md`.** §0 gate → §1 wire-the-flow → §2 revenue/margin →
§3 ecosystem tools → §4 supervisory/depth. Nothing is *coded* until §0 is
green; everything is *plannable* now.
