# ADR-0020 — Customer-commission (affiliate sales-agent) Source-of-Truth = legacy `tb_user_sales` family

**Status:** Accepted 2026-05-30 (เดฟ — customer-backend lane · Path A pre-decided by the P0-23 task brief)
**Supersedes (on the commission domain only):** the rebuilt-era `sales_commissions` / `sales_payouts` / `team_leaders` model from migration `0013_sales_referral.sql` + the `commission_*` tier tables from `0054_commissions.sql`.
**Closes audit gate:** [`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../research/legacy-gap-2026-05-30/_MASTER.md) P0-23 + cust-07 (`docs/research/legacy-gap-2026-05-30/cust-07-sales.md`).
**Mirrors:** [ADR-0018](0018-wallet-sot.md) (wallet SOT) + [ADR-0019](0019-customer-backend-arch-decisions-2026-05-30.md) D-B (the earn-trigger decision) — same "ratify the half that already works" stance.

## Context

The 2026-05-30 master gap audit found the **customer-commission (ตัวแทนขาย / affiliate sales-agent) feature is a half-wired Potemkin**: the READ surfaces (`/sales/*`) faithfully read the legacy `tb_user_sales` family where the four real VIP teams accrue commission, but there is **zero WRITE path** — the agent can see what they earned but cannot withdraw it, and a full parallel CRUD stack (`/commissions/*` + `actions/commissions.ts` 539 LOC + `actions/admin/sales-payouts.ts`) writes the **rebuilt `sales_commissions` / `sales_payouts` tables that were never backfilled** (empty on production).

Two schema families exist for "customer commission":

| | Legacy (ported) | Rebuilt (Pacred-native) |
|---|---|---|
| Earned-row ledger | **`tb_user_sales`** — 1 row per delivered forwarder (`idf`), `usstatus` 1=unpaid / 2=pending / 3=paid | `sales_commissions` (0013) |
| Withdrawal-request header | **`tb_user_sales_admin_pay`** — bank info, `file` (ID-card PDF), `imagesslip` (admin pays out), `amount` (net), `status` 2=pending / 3=paid | `sales_payouts` (0013) |
| Earned↔withdrawal link | **`tb_user_sales_pay`** — `(idus, idusap)` | `sales_commissions.payout_id` FK |
| Tier config | (none — legacy hardcodes 1% / 3% / the 4 VIP `coid`) | `commission_tiers` (0054) |

The legacy data is real (the 4 teams `THADA.VIP` / `SIN.VIP` / `OOAEOM.VIP` / `SWAN` accrue on every delivery via P1-5 earn-trigger — `actions/admin/earn-trigger-tb-user-sales.ts`). The rebuilt tables are **empty on production** — the same "silent dead-write" pattern the master audit calls out as Pacred's #1 bug class.

Legacy source contract (read in full before any change):
- `member/include/pages/report-user-sales/getListForwarder.php` — the **customer** withdrawal modal: select unpaid rows → bank name/no/account-name + ID-card **PDF** (`file`) upload + the **min net ฿1,000** gate (`($priceUserAllCHN*$percen)-(($priceUserAllCHN*$percen)*0.03) >= 1000`), posts `name="add"` to `report-user-sales-history/`.
- `pcs-admin/report-user-sales.php` L6-81 — the matching `add` INSERT logic: dedup-guard the selected `tb_user_sales_pay.IDUS` set, INSERT `tb_user_sales_admin_pay`, INSERT the `tb_user_sales_pay` links, then `UPDATE tb_user_sales SET usStatus='2' WHERE ID IN (...)`.
- `pcs-admin/report-user-sales-history.php` — the payout history + per-payout detail (admin uploads the slip + flips `status` → 3 at actual pay-out time).

Commission math (verified across all four legacy screens):
- **gross** = `Σ(fTotalPrice − fDiscount)` over the selected delivered forwarders × **1%** (`$percen = 0.01` for all four teams — `report-user-sales-history.php` L405).
- **WHT** = gross × **3%** (`*0.03`).
- **net** = gross − WHT — this is what is stored in `tb_user_sales_admin_pay.amount` and what gets paid out.
- **gate** = net ≥ **1,000 THB** (`getListForwarder.php` L174).

## Decision

### D-1 — Canonical commission SOT: **`tb_user_sales` + `tb_user_sales_admin_pay` + `tb_user_sales_pay`** (legacy)

For every customer-commission read, summary, withdrawal-request, and admin payout in Pacred:

- **Earned ledger** = `tb_user_sales` (`usstatus` 1=ยังไม่เบิกจ่าย / 2=รอดำเนินการ / 3=เบิกจ่ายแล้ว). One row per delivered forwarder, keyed on `idf` (the legacy dedup key). Written at delivery by the P1-5 earn-trigger.
- **Withdrawal header** = `tb_user_sales_admin_pay` (`status` 2=รอดำเนินการ at customer-create, 3=สำเร็จ when admin pays out). `amount` = **net** commission. `file` = the customer's ID-card PDF. `imagesslip` = the admin's payout slip (empty until pay-out). `name_blank` / `no_blank` / `name_account` = the agent's bank account.
- **Link** = `tb_user_sales_pay` `(idus, idusap)` — joins the selected earned rows to their withdrawal header.

The rebuilt `sales_commissions`, `sales_payouts`, `team_leaders` (0013), and the `commission_*` tier tables (0054) are **frozen** — no new writes, no new readers. They retire when the last `/commissions/*` reader is migrated or deleted (a follow-up sprint, NOT a launch blocker). `actions/commissions.ts` + `actions/admin/sales-payouts.ts` are the dead twins.

### D-2 — The withdrawal contract (legacy faithful)

`submitSalesWithdrawal` (in `actions/commissions-tb.ts`) implements `getListForwarder.php` + `report-user-sales.php` L6-81 exactly:

1. **Gate** — only the 4 VIP team-leader accounts (`resolveSalesAgent` whitelist) may submit. Impersonation is refused (`assertNotImpersonating`).
2. **Re-fetch + anti-tamper** — the selected `tb_user_sales` ids are re-read server-side with `usstatus='1'` AND their forwarder's `userid` in the agent's team. The amount is **recomputed server-side** from the live `tb_forwarder.fTotalPrice − fDiscount` (never trust a client-posted amount).
3. **Min gate** — net (gross×1% − 3% WHT) must be ≥ 1,000 THB, else reject (legacy `bg-danger` message).
4. **Dedup** — refuse if any selected `idus` already has a `tb_user_sales_pay` row (legacy `SELECT ID FROM tb_user_sales_pay WHERE IDUS IN (...)` num_rows==0 guard → otherwise `eRe` "ข้อมูลซ้ำ").
5. **Upload** ID-card PDF to the `slips` bucket under `{auth.uid()}/sales_withdraw/<time>.pdf` (same proven customer-upload convention as `submitLegacyWalletDeposit`).
6. **Write, in order:** INSERT `tb_user_sales_admin_pay` (status='2', amount=net, file=PDF path, imagesslip='', bank fields) → INSERT the `tb_user_sales_pay` links → `UPDATE tb_user_sales SET usstatus='2' WHERE id IN (selected)`. Best-effort rollback of the header + uploaded file if a later step fails.

`getSalesWithdrawalSummary` reads the agent's team's unpaid `tb_user_sales` (usstatus='1'), sums `Σ(fTotalPrice − fDiscount)` over their forwarders, and returns `{ gross, commission (1%), wht (3%), net, eligible (net≥1000) }` for the summary card.

### D-3 — Reachability

The withdrawal entry point is `/sales/report/add` (the "รายการที่ยังไม่ได้เบิกเงิน" screen), reachable in ≤2 clicks from the customer left-menu "ประวัติตัวแทน" accordion (`components/legacy/pcs-left-menu.tsx` L232-243, `isAgent` only) → "ทำรายการเบิกเงิน". The legacy dead `#select1` jQuery button on that screen is replaced by a real client selector that calls `submitSalesWithdrawal`.

### D-4 — No new migration

All three legacy tables are already ported (`supabase/migrations/0081_pcs_legacy_schema.sql` L5705 `tb_user_sales`, L5726 `tb_user_sales_admin_pay`, L5791 `tb_user_sales_pay`) with their sequences. **No migration is added** — Path A reuses the existing ported schema. (NEXT FREE remains 0132 per `docs/runbook/migration-ledger.md`.)

## Consequences

- The 4 VIP teams can now withdraw commission end-to-end — the revenue/payout loop closes.
- `/commissions/*` (rebuilt) is now provably dead; a follow-up should delete it + `actions/commissions.ts` + `actions/admin/sales-payouts.ts` + the `0013`/`0054` tables (separate cleanup task — out of P0-23 scope).
- Admin pay-out (the `report-user-sales-history.php?page=ID` slip-upload that flips `status` → 3) is the admin-side counterpart — already has the read screens (`/admin/reports/user-sales-history`); wiring the admin pay-out write is a follow-up (P1, not in P0-23 scope which is the customer earn→withdraw loop).

## References

- Legacy: `member/include/pages/report-user-sales/getListForwarder.php`, `pcs-admin/report-user-sales.php`, `pcs-admin/report-user-sales-history.php`
- Schema: `supabase/migrations/0081_pcs_legacy_schema.sql` L5705-5821
- Earn-trigger: `actions/admin/earn-trigger-tb-user-sales.ts` (P1-5)
- Read screens: `app/[locale]/(protected)/sales/{page,report,report/add,history,history/[id]}.tsx`
- Team whitelist: `app/[locale]/(protected)/sales/team-map.ts`
- Sibling decision: [ADR-0018](0018-wallet-sot.md), [ADR-0019](0019-customer-backend-arch-decisions-2026-05-30.md)
