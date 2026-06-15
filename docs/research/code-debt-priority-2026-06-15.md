# Code-debt priority sweep — 2026-06-15 (post juristic+credit close)

> 8-dimension adversarial sweep (`code-debt-priority-sweep-2026-06-15` workflow · 17 agents · 28 findings → 7 confirmed · 1 false-positive killed). Owner: "ไล่เก็บงานโค้ดทั้งหมด ไล่ตามความด่วน." All confirmed items are money/security, none owner-gated.

## 🔴 P0 — security (Wave 1)
**14 ungated `"use server"` admin READERS leak money/PII via service-role to ANY authenticated session.** `proxy.ts` only blocks UNAUTHENTICATED page requests; a server-action POST from any logged-in session (a customer, or a low-trust driver/warehouse admin) reaches the action body, and `createAdminClient()` bypasses the RLS pins migration 0062 added → re-opens exactly that vector. 139/158 sibling admin actions DO gate; these 14 don't:
`customer-margin.ts:71` · `withdraw-comm-batch.ts:140,222` (bank acct #s) · `etax-export.ts:111,223` (buyer tax_id/addr) · `peak-export.ts` · `reports-agent-payouts.ts` · `ar-aging.ts` · `reports-ar.ts` · `reports-profit.ts` · `margin-monitor.ts` · `near-churn.ts` · `reports-attribution.ts` · `reports-cockpit.ts` · `reports-sla.ts` · `quote-comparison.ts`.
**Fix:** add the standard gate as the FIRST line of every exported fn (match the 139 siblings' pattern · role set per file: money/PII→`['super','accounting','ops']`; sales payouts→`['super','accounting','sales_admin']`).

## 🟠 P1 (Waves 2-3)
1. **Bulk wallet-HS approve double-credits tb_wallet on a 0-row status-flip race** — `actions/admin/tb-bulk.ts:169-214` flips `.eq('status','1')` but checks only the error (0-row match returns no error) → the tb_wallet credit fires even when a concurrent path already approved the same id. Fix (zero-migration): `.update({status:'2',adminid}).eq('id',r.id).eq('status','1').select('id').maybeSingle()` + `if(!flipped) continue;` BEFORE the balance mutation (the exact 2026-06-14 cnt-hs/forwarder/yuan pattern). Writer==reader (not §0e). **[Wave 2]**
2. **CSV importer writes the dead `forwarders` twin** — `csv-imports.ts:324,391,467` (sidebar-reachable · silent data loss · live = tb_forwarder 47k rows). Repoint to tb_forwarder w/ column remap per legacy `import-excel.php`, OR retire the sidebar entry + banner. **[Wave 3]**
3. **Accounting reconcile dashboard reads dead twins** — `accounting/reconcile/page.tsx:83,102,165` + `reconciliation.ts:43,62,87` read `forwarders`/`wallet_transactions` (0-row) → false "all reconciled" on a money-control screen. Repoint to tb_forwarder + tb_wallet_hs, OR retire. **[Wave 3]**
4. **Payment-reconciliation page reads/writes dead twins** — `payment-reconciliation/page.tsx` + `payment-reconciliation.ts:98,123,262,346,369` → permanently-empty queue + false clean. Repoint or retire (sibling of #3). **[Wave 3]**
5. **Forwarder cost-adjustment 'mark paid' debits dead `wallet_transactions` twin** — `forwarder-cost-adjustments.ts:275-293` (balance checked vs LIVE tb_wallet but debit written to dead twin → money collected on paper, never removed). Panel UNMOUNTED today (contained). Banner/guard dormant + fix the debit→tb_wallet_hs before mounting. **[Wave 3]**

## 🟡 P2/P3 (Wave 4)
- single-row deposit approve `wallet-hs.ts:1044-1100` 0-row race (cross-path double-credit) → same .select().maybeSingle() fold · type='4' branch L767-815 too.
- `pay-user.ts:1020` wallet-restore + `service-order.ts:1392-1397` refundWallet: bare update, no {error} check → claims "restored" on silent fail. Capture error.
- §0c lint rule (`no-bare-supabase-data-destructure.js:120-126`) blind to statement-level writes → add an ExpressionStatement visitor for unchecked Supabase writes on money tables.
- tb_wallet.wallettotal debits read-modify-write w/o balance fold (`service-order.ts:1149-1182` · `payment-tb.ts:400` · `wallet-tb.ts:252` · `credit.ts`).
- `shop-payouts.ts:74-107` setShopPayoutStatus no status guard + no row-count.
- orphan `/admin/accounting/payment` (no menubar) · redundant `/freight/receipts/history` dup · 3 customer freight tables clip on mobile.

## ❌ False-positive (do NOT re-raise)
- `wallet-trans.ts:490-501` reject re-credit — DEPRECATED dead code (zero live callers).

## Waves (ไล่ตามความด่วน) — progress 2026-06-15
1. **Wave 1 — security gate sweep** (P0) — 🤖 แยกร่าง agent in flight (14 readers → requireAdmin).
2. **Wave 2 — wallet TOCTOU hardening** (P1+P2 money) — ✅ DONE `1b315642` (bulk + single-row type='4' + type='1' folds).
3. **Wave 3 — dead-twin §0e retire/banner** (P1) — 🤖 แยกร่าง agent in flight (CSV import retire + 2 reconcile banner + cost-adj guard).
4. **Wave 4 — P2 money-safety + cleanup** — ✅ partial `a656b4a6` (pay-user restore-check + refundWallet recredit-check + shop-payout status guard).

### Deferred (flagged · not blind-shipped)
- **§0c lint rule statement-level-write detection** — valuable regression-guard, but at error-level it would flood `pnpm verify` with the many pre-existing bare money-table writes + break the gate. Needs a SCOPED rollout: warn-only on unchecked `.update/.insert/.delete/.upsert` to money tables (tb_wallet/tb_payment/tb_wallet_hs/tb_credit), measured before promoting to error. Own follow-up.
- **Atomic balance folds** (service-order.ts:1149-1182 · payment-tb.ts:400 · wallet-tb.ts:252 · credit.ts) — `UPDATE wallettotal = wallettotal - x WHERE wallettotal >= x` can't be expressed via PostgREST (no column-relative update) → needs an RPC + migration. Bigger; flag for an owner-gated migration wave.
- **Wave 4 reachability/mobile** (orphan /admin/accounting/payment menubar · /freight/receipts/history dup · 3 mobile freight table clips) — P3 polish, after the money/security waves land.
