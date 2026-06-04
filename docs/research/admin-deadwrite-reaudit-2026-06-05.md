# 🔎 Admin §0e dead-write re-audit (2026-06-05) — handoff for ภูม

> Read-only re-audit of `actions/admin/**` at HEAD `1323ed32`, verifying the
> 2026-06-01 big-audit's flagged admin Potemkin traps against current state.
> Done by เดฟ (overnight tidy run) — **I did not change any admin code** (ภูม's
> lane); this is an actionable list for ภูม.

## ✅ Headline: 0 OPEN dead-write traps remain on the admin surface

Every reachable admin money/state write targets the live legacy `tb_*` table.
The 4 originally-flagged Potemkin surfaces are all resolved:

| Surface | Was-flagged | Current state |
|---|---|---|
| `/admin/rates/vip` (`rate-edits.ts` `adminUpdateVipRateCells`) | Potemkin rate_vip | ✅ always wrote `tb_rate_vip_kg/cbm` (the page label was the only confusion) |
| `/admin/commissions` | read empty `commission_withdrawals` | ✅ repointed to `tb_user_sales` (4,104 real earns · ADR-0026) |
| `/admin/forwarder-sales` | read empty `sales_commissions` | ✅ repointed to `tb_sales_report` (17,027 rows) |
| `/admin/settings` `adminUpdateSettings` | wrote empty `settings` | ✅ neutralized → redirects to the 3 live editors (ADR-0024) |
| `/admin/yuan` bulk-approve | wrote empty `yuan_payments` | ✅ delegates to `…Tb` → `tb_payment` |

No admin staff will get a green toast on a money screen while nothing changes.

## ⚠️ Deferred cleanup (non-emergency · ภูม / Phase-C)

1. **Delete 4 tombstoned dead-writer modules** (guarded — they `throw`/return error
   if called, and have ZERO importers, so they're safe; just dead weight):
   - `actions/admin/rates.ts` (7 fns → `rate_general`/`rate_vip`/`rate_custom_*`) — live = `rate-edits.ts`
   - `actions/admin/commissions.ts` (8 fns → `commission_*`) — live = `sales-payouts-tb.ts` / `commissions-tb.ts`
   - `actions/admin/sales-payouts.ts` `adminUpdateSalesPayout` → `sales_payouts` — live = `sales-payouts-tb.ts`
   - `actions/admin/wallet.ts` (5 fns → `wallet_transactions`) — live = `wallet-hs.ts` (`tb_wallet_hs`)
   - Delete together with a `DROP TABLE` of the 0-row rebuilt twins (one cleanup ADR).

2. **Interpreter-commission sidebar badge** (`actions/admin/sidebar-counts.ts:161`):
   reads the empty rebuilt `commissions` table → badge stuck at 0. Real interpreter
   payouts live in `tb_withdraw_comm_interpreter_h` (status='2' = รอจ่าย · ~46 batches).
   ภูม to confirm the canonical source + repoint the count. (Read-only — not a write
   trap, just an inaccurate badge · §0f #2.)

3. **`wallet_transactions` dead-twin READS in 6 reconciliation/refund/freight flows**
   (`accounting-periods.ts` · `forwarder-cost-adjustments.ts` · `freight-invoice-payments.ts`
   · `payment-reconciliation.ts` · `reconciliation.ts` · `refunds.ts`): these read the
   empty rebuilt table inside larger workflows → silently return 0 rows. NOT §0e
   write-traps, but a **logic-brittleness** flag — these PEAK-accounting / refund /
   freight flows need an end-to-end audit to decide whether the legacy twin is still
   needed or the reads should move to `tb_wallet_hs`. (ภูม PEAK lane.)

## Method
Per AGENTS.md §0e: grep each action's `.from("X").insert/.update/.delete` write
target vs what the consumer page/cron reads; cross-ref big-audit
`_MASTER-PLAN.md` + CLAUDE.md PM-3/PM-4 to skip already-fixed ones. Full agent
output retained in this session's transcript.
