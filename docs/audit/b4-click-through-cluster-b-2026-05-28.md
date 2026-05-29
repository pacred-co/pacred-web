# B-4 Click-through audit · Cluster B · Financial · 2026-05-28

Static-analysis pass per AGENTS.md §0c + verify-deep-flow learning. Read-only on `main` HEAD `c4417ee4`. Audits **cluster B = financial admin pages** (accounting · wallet · yuan-payments · refunds · tax-invoices · payment-reconciliation · wht · withdrawals · withdrawal/freight-th · shop-payouts · sales-payouts · commissions).

## §0 TL;DR

- **Pages audited:** 47 page files + 20 server-action files (`actions/admin/*.ts` imported by those pages)
- **P0 findings:** 2 (definite bugs · revenue-critical)
- **P1 findings:** 8 (silent bugs / data corruption risk)
- **P2 findings:** 3 (polish)
- 🔴 **HIGHEST-IMPACT FINDING:** `adminBulkApproveWalletHs` (tb-bulk.ts:92) writes the **UUID admin id (36 chars) into the legacy `tb_wallet_hs.adminid` column (varchar(20))** — bulk-approve of pending topups from `/admin/wallet` (1,470+ pending rows per CLAUDE.md) will throw a Postgres `value too long for type character varying(20)` error PER ROW and silently surface as `result.failed++` in the toast — staff sees "❌ พลาด N" but can't approve anything via bulk. The legacy-id-respecting single-row path (`adminApproveWalletHs`) works fine. Bulk approve is broken in production for any admin signed in with a Supabase UUID.

## §1 P0 findings

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P0-1 | `actions/admin/tb-bulk.ts:92` | UUID written to legacy varchar(20) column | `adminBulkApproveWalletHs` does `.update({ status: "2", adminid: adminId })` where `adminId` is the Supabase `user.id` (UUID, 36 chars) and `tb_wallet_hs.adminid` is `varchar(20)`. Every bulk-approve row fails with PG error `22001 value too long for type character varying(20)`. The legacy single-row `adminApproveWalletHs` (wallet-trans.ts:189) correctly uses `legacyAdminId = await resolveLegacyAdminId()` (which queries `tb_admin` for the 20-char `adminID`). Bulk approve is broken on prod for every admin with a UUID auth (= all of them). | Resolve `legacyAdminId` at top of `adminBulkApproveWalletHs` (mirror wallet-trans.ts:163 `resolveLegacyAdminId()` extraction) and write that instead of `adminId`. Also add `adminidupdate: legacyAdminId` to match the single-row write. |
| P0-2 | `app/[locale]/(admin)/admin/wallet/add/page.tsx:49, 61` | Lowercase columns on already-renamed `tb_users` table | After batch-1 camelCase rename (`tb_users` columns are now quoted `"userID"/"userName"/"userLastName"/"userTel"/"userEmail"`), the `.select("userid, username, userlastname, usertel, useremail")` query is using unquoted lowercase column names. PostgREST sends these as unquoted SQL identifiers → PG normalizes to lowercase → no matching column → query returns error `42703 column "userid" does not exist`. Net effect: `?q=PR1234` prefill returns null + recent customers list is empty. Wallet/add form still works manually (user types userid) but two UX features silently broken. | Change both `.select` clauses to `"userID, userName, userLastName, userTel, userEmail"` and update the `CustomerLite` type in form.tsx to use camelCase fields (or normalize via the same `toCustomerLite` helper that yuan-payments/new/page.tsx uses at L51-57). |

## §2 P1 findings

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P1-1 | `actions/admin/wallet-hs.ts:205-235`, `wallet-trans.ts:200-229`, `tb-bulk.ts:104-134` | Read-then-update race on `tb_wallet.wallettotal` | Three actions read `tb_wallet.wallettotal`, add `delta` in JS, write back — without a `FOR UPDATE` lock OR atomic SQL `UPDATE … SET wallettotal = wallettotal + N`. Two admins approving different topups for the same customer at the same time will lose one delta (both read X → both write X+ΔA / X+ΔB → last write wins). The 0064 overdraw guard does NOT cover `tb_wallet` (it covers `wallet_transactions`, the rebuilt-era table). Risk highest on bulk-approve where N customer rows process in a tight loop. | Replace the read-then-update with an RPC like `wallet_apply_delta(userid, delta)` that runs `UPDATE tb_wallet SET wallettotal = wallettotal + p_delta WHERE userid = p_userid RETURNING wallettotal` inside one transaction. Mirror the pattern in `wallet_assert_no_overdraw` (locks via `FOR UPDATE`). |
| P1-2 | `actions/admin/wallet.ts:341-419` (`adminCreateManualWalletEntry`) | Admin manual `kind=withdraw` has no overdraw guard | Admin manual entry inserts `wallet_transactions` with `status="completed"`. The 0064 trigger guards `pending` debits only (intentional per migration header). A manual withdraw of any amount lands `completed` immediately, so the balance trigger will recompute → can push wallet negative. Sign-check exists but no balance-check. Comment at wallet.ts:42-45 acknowledges scope but no UI warning either. | Either (a) call `wallet_available_balance(profile_id, bucket)` RPC and reject if `amount + available < 0` (use `withAdmin` to call RPC via admin client which is granted execute), OR (b) require an explicit `allow_overdraw: true` opt-in flag in the input schema with admin role-gated CSS+server enforcement. Same fix would apply to `wallet-hs.ts:adminCreateWalletHsManual` and `wallet-trans.ts:adminApproveWalletHs` for `kind=withdraw`. |
| P1-3 | `actions/admin/sales-payouts.ts:51-99` | No status transition allow-list on money-moving actions | `adminUpdateSalesPayout` accepts ANY status → ANY status flip. The side-effects only fire on the `paid` and `rejected` transitions, so a `paid → pending` flip leaves `sales_commissions` stuck in `paid` while `sales_payouts.status` says `pending` — re-submit creates a duplicate commission payment. Mirror bug as the yuan-payment H-1 fix that yuan-payments.ts:34-46 added an allow-list for. | Add `SALES_PAYOUT_TRANSITIONS` allow-list matching the yuan-payment.ts pattern. Forbid backward transitions (`paid → *`, `rejected → *`). Also clarify `paid → cancelled` semantics: should it reverse the commission `paid_at` too? |
| P1-4 | `actions/admin/shop-payouts.ts:50-113` (`adminUpdateShopPayout`) | No `withAdmin` wrapper + no audit log + no transition allow-list | This action uses `requireAdmin` directly (line 55) instead of the `withAdmin` helper (which centralizes auth + logging). No `logAdminAction` call anywhere in the file → mutations are invisible in `admin_audit_log`. Also no status transition allow-list — `cancelled → completed` would silently bypass the customer's refund expectation (the trigger from migration 0104 already recomputes balance on `completed`, so the flip moves real money). | Refactor to use `withAdmin([...])` pattern. Add `logAdminAction(adminId, "shop_payout.update", "tb_shop_transactions", input.id, { before, after })`. Add allow-list rejecting non-monotonic transitions. |
| P1-5 | `app/[locale]/(admin)/admin/sales-payouts/actions-cell.tsx:46-51`, `shop-payouts/actions-cell.tsx:78-93`, `wallet/actions-cell.tsx:106-111` (non-deposit), `wallet/bulk-approve-bar.tsx:48-67`, `yuan-payments/actions-cell.tsx:46-53`, `commissions/[id]/withdrawal-actions-client.tsx:40-56` | No confirm dialog on destructive money mutations | "อนุมัติ" / "โอนแล้ว" / "ปฏิเสธ" / "เริ่มโอน" / "โอนสำเร็จ" / "ล้มเหลว" / "อนุมัติทั้งหมด (N)" buttons all fire the server action on first click. Single misclick = irreversible money state. Tax-invoices issue/cancel/credit-note buttons (and wallet/[id]/edit-form ApproveRejectForm + accounting/periods close) DO use a two-step confirm — apply the same pattern. | Add a two-step confirm panel (mirror the issue-button.tsx pattern — `confirming` state with cancel + confirm buttons + warning copy) OR wrap in the existing `components/ui/pacred-dialog.tsx` helper that other Wave 22+ pages use. |
| P1-6 | `app/[locale]/(admin)/admin/wht/page.tsx:99-101` | Missing `error` destructure (AGENTS §0c) | `const { data: rawRows, count: total } = status === "all" ? await baseQuery : await baseQuery.eq("cert_status", status);` — `error` is NOT destructured. Lint rule `pacred/no-bare-supabase-data-destructure` should catch but isn't here (probably because the ternary obscures the call site). On query failure rows render as 0 → user sees "ไม่มีใบ..." for cleared queue and never sees the chase work. | `const { data: rawRows, count: total, error } = …`; add `if (error) console.error('[wht list]', { code, message });` block. |
| P1-7 | `app/[locale]/(admin)/admin/accounting/closing/page.tsx:84-96` | Stale rebuilt-table read on prod | Reads from `forwarders` table (rebuilt-era, empty on prod). Real data is in `tb_forwarder` (~50k+ rows). The accounting closing page therefore renders zero data forever until Phase-B port lands. Same pattern as the Wave 20 P0-2 fix that swapped `/admin/accounting/page.tsx` to `tb_forwarder` — closing/page wasn't included. | Either (a) banner the page "Wave 24+ — closing report ยังใช้ Pacred-rebuilt schema · ใช้ legacy PHP `closingAccReportForwarder.php` ระหว่างนี้" OR (b) port the query to `tb_forwarder` with `fstatus = '7'` (delivered) + month-range on `fdate` (mirror accounting/page.tsx:243-296 sum-by-tab logic). |
| P1-8 | `actions/admin/payment-reconciliation.ts:97-109` (`listPendingReconciliations`) | Reads only rebuilt `wallet_transactions` | Same stale-table risk as P1-7 — the auto-match queue reads `wallet_transactions` (empty on prod) so the "candidates" list will be empty. Real deposit slips live in `tb_wallet_hs`. Function is wired but renders an empty UI under D1. Lower priority than P1-7 because the matching page `/admin/payment-reconciliation` may not be on the critical path (Phase-C-deferred). | Add a banner on `/admin/payment-reconciliation` documenting the gap (Phase C will swap to `tb_wallet_hs` + paydeposit-join semantics) OR mark the page route as a stub with a redirect to a manual /admin/wallet view. |

## §3 P2 findings

| # | File:Line | Pattern | What's wrong | Suggested fix |
|---|---|---|---|---|
| P2-1 | `app/[locale]/(admin)/admin/commissions/tiers/row-actions.tsx:29-46` (`toggleActive`) | No confirm on deactivate tier | Tier deactivation is recoverable (re-activate flips back) but still affects new commission accruals. No explicit confirm. | Add lightweight `confirm('ปิดใช้งานเรทคอมมิชชั่นนี้?')` or inline confirm panel. |
| P2-2 | `app/[locale]/(admin)/admin/wallet/[id]/page.tsx:240-241` | 50,000-row over-fetch for one summary card | The `/admin/wallet/[id]` detail page fetches ALL `tb_wallet` (≈8,898 rows) + ALL `tb_cash_back` rows on every page load just to render the "ยอดรวมทั้งหมดในระบบ" summary card. Page docstring acknowledges this (line 234-239 — "to be replaced by a `get_wallet_system_totals()` RPC in Phase C"). Adds ~500ms to every wallet detail open. | Phase C: build `get_wallet_system_totals()` SECURITY DEFINER RPC. Until then, consider caching with `unstable_cache(..., { revalidate: 60 })`. |
| P2-3 | `actions/admin/wallet-hs.ts:213, 226`, `wallet-trans.ts:209, 220`, `tb-bulk.ts:117, 127`, `commissions.ts:540` (`compensate`) | Compensation-on-failure logic exists but is best-effort | When the second step in a multi-write sequence fails (e.g. wallet_hs row inserted but tb_wallet upsert fails), error returns to caller but the in-progress half-state persists with a "บันทึก wallet_hs สำเร็จ (id=N) แต่ tb_wallet update ล้มเหลว" error message. The reverse path doesn't try to undo step 1. Acceptable for a money mutation given audit log captures it, but should be flagged for monitoring. | Add a periodic reconciliation cron that diffs `SUM(tb_wallet_hs.amount WHERE status='2' BY userid)` vs `tb_wallet.wallettotal` and alerts on divergence. Document the half-states each action can leave. |

## §4 Pages with ZERO findings (clean — green list)

Pages where static analysis found nothing actionable:

- `app/[locale]/(admin)/admin/accounting/page.tsx` (Wave 20 P0-2 dashboard — clean)
- `app/[locale]/(admin)/admin/accounting/cargo/page.tsx` (redirect)
- `app/[locale]/(admin)/admin/accounting/cargo/income/[type]/[service]/[[...slug]]/page.tsx` (catch-all stub)
- `app/[locale]/(admin)/admin/accounting/container-costs/page.tsx`
- `app/[locale]/(admin)/admin/accounting/disbursements/page.tsx` (tombstone)
- `app/[locale]/(admin)/admin/accounting/forwarder/page.tsx`
- `app/[locale]/(admin)/admin/accounting/forwarder-invoice/page.tsx` (shell, no SQL)
- `app/[locale]/(admin)/admin/accounting/freight/page.tsx` (hub, no SQL)
- `app/[locale]/(admin)/admin/accounting/payment/page.tsx`
- `app/[locale]/(admin)/admin/accounting/periods/page.tsx` + `[period_yyyymm]/page.tsx` (close-confirm pattern solid)
- `app/[locale]/(admin)/admin/accounting/reconcile/page.tsx`
- `app/[locale]/(admin)/admin/accounting/shop/page.tsx`
- `app/[locale]/(admin)/admin/accounting/withdraw/page.tsx`
- `app/[locale]/(admin)/admin/refunds/page.tsx` + `[id]/page.tsx` + `[id]/refund-actions.tsx` + `new/page.tsx` (confirm dialogs present)
- `app/[locale]/(admin)/admin/sales-payouts/page.tsx` + `[id]/page.tsx`
- `app/[locale]/(admin)/admin/shop-payouts/page.tsx`
- `app/[locale]/(admin)/admin/tax-invoices/page.tsx` + `[id]/page.tsx` + 3 buttons (two-step confirm)
- `app/[locale]/(admin)/admin/wallet/page.tsx` (dispatcher, clean)
- `app/[locale]/(admin)/admin/wallet/[id]/page.tsx` + `edit-form.tsx` (rich detail · 2-step approve flow)
- `app/[locale]/(admin)/admin/wallet/balance-view.tsx` + `transactions-view.tsx`
- `app/[locale]/(admin)/admin/wallet/deposit/page.tsx` (redirect)
- `app/[locale]/(admin)/admin/wallet/history/page.tsx` (redirect)
- `app/[locale]/(admin)/admin/wallet/pay-user/page.tsx` (stub)
- `app/[locale]/(admin)/admin/wallet/slip-review-modal.tsx`
- `app/[locale]/(admin)/admin/withdrawal/freight-th/page.tsx` (stub)
- `app/[locale]/(admin)/admin/withdrawals/page.tsx` (redirect)
- `app/[locale]/(admin)/admin/yuan-payments/page.tsx` + `[id]/page.tsx` + `new/page.tsx`
- `app/[locale]/(admin)/admin/yuan-payments/tb-bulk-bar.tsx` (action via tb-bulk.ts is bulk-approve-yuan path — no balance impact)
- `app/[locale]/(admin)/admin/wht/page.tsx` *EXCEPT P1-6* (column missing error destructure)
- `app/[locale]/(admin)/admin/commissions/page.tsx` + `[id]/page.tsx` + `tiers/page.tsx` (read-only · solid)
- `app/[locale]/(admin)/admin/payment-reconciliation/page.tsx` (UI clean; underlying action data P1-8)
- `app/api/commission-withdrawal/[id]/route.tsx` (PDF stream · solid)
- Server actions: `refunds.ts` (ceiling+IDOR guards solid), `yuan-payments.ts` (transition allow-list solid), `commissions.ts` (serial RPC + race-safe), `accounting-periods.ts` (snapshot + freeze trigger), `container-costs.ts`, `tax-invoices.tsx` (serial RPC + WHT gate), `payment-reconciliation.ts` (race-safe `.is(null)` predicates), `wht.ts` (RPC-backed), `disbursements.ts` (stub)

## §5 Pages NOT audited

None — every page in cluster B scope plus its imported server actions was inspected.

---

## Appendix · spot-checks performed

- All `tb_users` queries in cluster B = camelCase (`userID/userName/userLastName/userTel/userEmail`) ✅ except wallet/add/page.tsx (P0-2)
- All `tb_admin` queries in cluster B = camelCase (`adminID/adminEmail`) ✅
- All `tb_cnt` queries use uppercase `ID` (batch 2a rename) ✅
- Lowercase columns on `tb_wallet/tb_cash_back/tb_payment/tb_wallet_hs/tb_forwarder/tb_settings` are correct (not yet renamed)
- Tax-invoice serial = `next_tax_invoice_serial()` RPC ✅
- Commission withdrawal serial = `next_commission_withdrawal_no()` RPC ✅
- Refund request serial = `next_refund_request_no()` RPC ✅
- `wallet_transactions` overdraw guard via 0064 trigger ✅ (applies to pending debits only — `kind=adjustment` + `status=completed` flows intentionally excluded)
- Yuan-payment status transition allow-list ✅ (yuan-payments.ts:34-46 + isYuanTransitionAllowed at L43)
- Refund ceiling guard ✅ (refunds.ts:resolveRefundCeiling fail-closed semantics)
- Refund IDOR guard ✅ (refunds.ts:verifySourceRef profile_id match)
- All accounting/* pages have explicit page-level `await requireAdmin(["accounting"])` or stricter ✅
