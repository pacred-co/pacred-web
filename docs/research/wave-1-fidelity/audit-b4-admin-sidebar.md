# Wave-1 fidelity audit — B-4 admin per-role RBAC sidebar + live-count badges

> **Audit-only.** Read-only review of the B-4 slice. Verifies ภูม's save-point
> finding that the sidebar badges have "0 `tb_*` refs". Source-of-truth:
> [`d1-fidelity-admin.md`](../d1-fidelity-admin.md) §1 + §1.4 (the IA + badge
> mandate) and [`d1-phase-b-gap-map.md`](../d1-phase-b-gap-map.md) §1.

---

## 1. Files audited

| Path | Lines | Role |
|---|---|---|
| `lib/admin/sidebar-menu.ts` | 702 | NEW — per-role menu data (OOP blocks + 7 role variants + badge keys) |
| `actions/admin/sidebar-counts.ts` | 157 | NEW — server action computing badge counts |
| `components/sections/admin-sidebar.tsx` | 321 | REWRITTEN — was flat-array filter; now renders sections + nested accordion + badges |

## 2. Structural fidelity — per-role hand-built variants? ✅

**Verdict: ✅ structurally faithful.** The rebuilt-era flat `items[]` filter is
**gone**. `lib/admin/sidebar-menu.ts` now:

- Defines **17 OOP menu blocks** (`blockWallet`, `blockPurchasing`,
  `blockForwarder`, `blockBarcode`, `blockPayment`, `blockReport`,
  `blockAccCargo`, `blockSettingsCargo`, `blockUserCargo`, `blockQA`,
  `blockHrHumanResource`, `blockHrCorporateAssets`, `blockWithdrawalList`,
  `blockUserCargoAndFreight`, `blockAccFreight`, Learning ×4, Extension ×5) —
  the same reusable-block pattern as legacy `include/pages/left-menu/OOP/*`.
- Hand-assembles **7 per-role menus** (`menuSuper`, `menuOps`, `menuAccounting`,
  `menuSalesAdmin`, `menuWarehouse`, `menuDriver`, `menuInterpreter`) from
  those blocks — one per `AdminRole` enum value.
- `menuForRoles(roles)` picks the highest-precedence single menu (no Frankenstein
  merge) — faithful to legacy "one staffer = one tree".

**Variant count gap:** legacy assembles **~22 distinct sidebars** from the
`company / department / section` triple; Pacred has **7** (one per role enum).
Acceptable for D1 v1 — the 7-role flattening matches Pacred's current RBAC
model — but warehouse/HR/QA-and-QC/marketing/ITDT sub-section variants are
collapsed. This is a Phase-B/C structural-debt item, not a Wave-1 blocker.

## 3. Section headers ✅

**Verdict: ✅ legacy headers used.** All 6 fixed EN headers present and ordered
to the CEO canonical sequence:

```
(blank — Dashboard) · Cargo & Freight · Freight · Cargo · Settings · Learning · Extension
```

No ad-hoc Thai headings (`ภาพรวม / กระดานงาน / รีพอร์ตเฉพาะกิจ / …` are gone).
The non-`super` roles use a subset (e.g. `menuWarehouse` = blank + Cargo +
Learning + Extension) but each section still uses the legacy EN label. ✅

## 4. Badge audit — THE CRITICAL ONE 🔴

**Verdict: 🔴 ภูม's finding is CONFIRMED. ZERO `tb_*` refs.** Every count query
hits rebuilt-era Pacred tables. Migrated customers' data lives in `tb_*` (Phase A
loaded 8,898 customers into `tb_users`, orders into `tb_header_order`, etc.) —
so the badges will read **0 / wrong** for the entire ported dataset.

| BadgeKey | `.from(...)` in counts | Verdict | Legacy `tb_*` it should hit |
|---|---|---|---|
| `walletTopup` | `wallet_transactions` | 🔴 rebuilt | `tb_deposit` (status=1) |
| `walletWithdraw` | `wallet_transactions` | 🔴 rebuilt | `tb_withdraw_credit` |
| `shopPending` | `service_orders` (status=pending) | 🔴 rebuilt | `tb_header_order` (hStatus=1) |
| `shopAwaitPay` | `service_orders` | 🔴 rebuilt | `tb_header_order` (hStatus=2) |
| `shopOrdered` | `service_orders` | 🔴 rebuilt | `tb_header_order` (hStatus=3) |
| `forwarderArrived` | `forwarders` (status=arrived_thailand) | 🔴 rebuilt | `tb_forwarder` (fStatus=4 or 5) |
| `forwarderDelivery` | `forwarders` (status=out_for_delivery) | 🔴 rebuilt | `tb_forwarder` (fStatus=6 / 6.1) |
| `forwarderCredit` | `forwarders` | 🔴 rebuilt | `tb_forwarder` (fStatus='c') |
| `driverItems` | `forwarders` | 🔴 rebuilt | `tb_forwarder_driver_item` |
| `yuanPending` | `yuan_payments` | 🔴 rebuilt | `tb_payment` (pStatus=1/2) |
| `salesPayout` | `sales_payouts` | 🔴 rebuilt | `tb_withdraw_*` family |
| `interpreterPayout` | `commissions` | 🔴 rebuilt | `tb_withdraw_interpreter_bonus` |
| `corporatePending` | `profiles` (account_type=juristic) | 🔴 rebuilt | `tb_users` (corporateStatus=1) |
| `customerPending` | `profiles` (status=incomplete) | 🔴 rebuilt | `tb_users` (userStatus pending) |
| `contactMessages` | `contact_messages` | 🟡 Pacred-only (no legacy equivalent) | — keep as-is |
| `refundsPending` | `refund_requests` | 🔴 rebuilt | `tb_refund` |
| `bookingsPending` | `bookings` | 🟡 Pacred-only (BK-1 = deferred Phase C) | — keep as-is |
| `incidents` | `platform_incidents` | 🟡 Pacred-only | — keep as-is |
| `shopNote` | hard-coded 0 (note queue not ported) | 🔴 missing | `tb_header_order` (hNote<>'') |
| `forwarderNote` | hard-coded 0 | 🔴 missing | `tb_forwarder` (fNote<>'' AND fStatus<>7) |
| `forwarderWhError` | hard-coded 0 | 🔴 missing | `tb_forwarder_import2` error queue |
| `cntDrawMoney` | hard-coded 0 ("tb_cnt … not yet ported") | 🔴 OUT-OF-DATE | `tb_cnt` (cntStatus=1) — **B-6 DID ship the `tb_cnt` ledger this wave**; this comment is stale |
| `shopPayout` | aliased to salesPayout | 🔴 rebuilt | `tb_withdraw_shoppay` |

**14 of 18 active queries** hit rebuilt-era tables; **4 keys** are hard-coded
zero; the `tb_cnt` zero is now actually-wrong because B-6 shipped the ledger.
Net: **the badge layer is structurally complete but semantically broken** for
the migrated dataset.

## 5. Missing menu items vs the legacy mandate

Wave 1 ships **most** of the §1.5 list:

- ✅ Learning section — 4 items (regulations · training × 3 · newsfeed · TOS)
- ✅ Extension section — juristic-check · thai-transport · meeting-room · history · incidents
- ✅ Note queues — included as menu items (forwarder note + shop note rows are
  in the menu, with badge slots `shopNote` / `forwarderNote`)
- ✅ Container-cost Sheet check — `forwarder.checkCntCost` row present
- ✅ VIP/SVIP/นิติบุคคล/เครดิต segmentation — `blockUserCargo` has all 6 groups

**Still missing:**

- ⚠️ Work-tools sub-section under HR (เครื่องมือ: เบอร์/อีเมล/ไลน์/WeChat/โดเมน) —
  `blockHrCorporateAssets` lacks this group (legacy has it under HR).
- ⚠️ `Learning / การอบรม` — sub-pages exist as 3 children (business-plan / culture /
  job-flow) but legacy also includes the audit-trail of who-read-what; not in
  Wave 1.
- ⚠️ Dashboard 3-way `?c=all/freight/cargo` switch — `itemDashboard` defines it
  for `super` only; `menuOps` / `menuWarehouse` / etc. use a flat dashboard
  item with no scope switch.

Acceptable for Wave 1; flag for follow-up Wave.

## 6. Fidelity gaps — severity

| Gap | Severity | Notes |
|---|---|---|
| Badge counts read rebuilt-era schema | 🔴 paradigm | Migrated data invisible — staff sees badge "0" beside a queue with hundreds of pending rows. The #1 daily-workflow regression *returns* despite the chrome being correct. Resolves with `B-0`. |
| `tb_cnt` not wired despite B-6 ship | 🔴 layout (small) | One-line fix — swap `cnt = 0` to a `tb_cnt` count of `cntStatus=1`. |
| Note-queue badges hard-coded 0 | 🟠 layout | The menu rows exist; counts will populate once `B-0` lands the `tb_*` reads. |
| Variant count 7 vs legacy ~22 | 🟠 layout | Phase-B/C structural debt; acceptable for v1. |
| Dashboard `?c=` switch only for `super` | 🟡 polish | Add to ops/accounting/warehouse menus. |
| No HR "เครื่องมือ" sub-section | 🟡 polish | Add to `blockHrCorporateAssets`. |

## 7. Required fixes

**Split — B-0 work (data layer, single-shot):**
1. Rewrite `actions/admin/sidebar-counts.ts` `Promise.all` so every query
   targets the legacy `tb_*` table:
   - `wallet_transactions` → split: `tb_deposit` (pending) + `tb_withdraw_credit`
   - `service_orders` → `tb_header_order` with `hStatus` 1/2/3
   - `forwarders` → `tb_forwarder` with `fStatus` 4/5/6/'c'
   - `forwarders` (driverItems) → `tb_forwarder_driver_item`
   - `yuan_payments` → `tb_payment` (pStatus in 1,2)
   - `sales_payouts` → `tb_withdraw_*` family (per legacy split)
   - `commissions` → `tb_withdraw_interpreter_bonus`
   - `profiles` (corporate/pending) → `tb_users` (corporateStatus / userStatus)
   - `refund_requests` → `tb_refund`
2. Wire `cntDrawMoney` to `tb_cnt` (cntStatus=1) — B-6 has shipped the table.
3. Populate `shopNote` (`tb_header_order` where `hNote<>''`),
   `forwarderNote` (`tb_forwarder` where `fNote<>'' AND fStatus<>7`),
   `forwarderWhError` (`tb_forwarder_import2` error rows).
4. Keep `contact_messages` / `bookings` / `platform_incidents` as-is — these
   are Pacred-original surfaces with no legacy equivalent.

**Structure fixes (smaller follow-up Wave):**
- Add the dashboard 3-way scope switch to non-super menus.
- Add HR "เครื่องมือ" sub-section block.
- Add note-queue + warehouse-error-history menu items where missing.
- Consider splitting the 7 role menus further if Phase-C HR/marketing/QA
  staff need their own variants.

## 8. Recommendation

**Back to เดฟ — but as a single `B-0` swap, not a re-do.** The B-4 chrome
(per-role assembly, sections, accordion, badge mechanism, dark theme) is
**structurally complete and matches legacy**. The blocker is one file
(`actions/admin/sidebar-counts.ts`) reading the wrong schema — exactly
ภูม's flagged finding. Pairing this fix into the `B-0` data-foundation wave
will simultaneously fix the 9-icon launchpad (`dashboard/page.tsx`) and the
shop-order pages that hit the same rebuilt-era tables. Until `B-0` lands,
the sidebar renders correctly but its badges are non-functional for migrated
data. No need to re-architect.
