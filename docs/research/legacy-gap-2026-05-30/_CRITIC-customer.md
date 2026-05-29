# Completeness critique — CUSTOMER side (legacy-gap-2026-05-30)

> Role: completeness critic for the 7 customer-side lane docs (cust-01..cust-07).
> Date: 2026-05-30 · Branch: `dave-pacred` HEAD (`844a0b5a`).
> Legacy SOT: `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/`
> Method: read all 7 lane docs in full → inventoried the legacy customer nav (`include/left-menu.php` + `top-menu.php`) + every `include/pages/index/` + `include/pages/index/all-popup/` handler → cross-checked each against the 7 docs → opened the actual Pacred files to verify the most severe death-flows.

**Verdict: the 7 lanes are high-quality and accurate.** Every severe death-flow I spot-checked (OTP bypass, cart split-brain, withdraw dead-write, yuan never-settle, forwarder inline-reads-healthy, getShipBy unwired, no customer deleteForwarder) verified TRUE against the real Pacred code — **zero false positives** among the P0/P1s. The lanes also correctly map 1:1 to the legacy left-menu spine. The gaps are not in what the lanes *claimed*, but in a band of **cross-cutting notification / popup / gate infrastructure that lives in `include/pages/index/all-popup/` and does not map to any single left-menu item** — so it fell between the 7 lanes and **no one audited it**. That is the main thing this critique adds.

---

## 1. MISSED SUBSYSTEMS (legacy customer workflows no lane audited)

These are real legacy customer-facing flows with surviving PHP handlers that **none** of cust-01..07 mention (verified by grep across all 7 docs — every term returned "NOT MENTIONED"). They cluster in the `index/all-popup/` + notification layer.

### M-1 (P1) — General notification center + admin-broadcast popups (`tb_notify` / `tb_notify_read`)
- **Legacy:** the top-menu bell (`top-menu.php` L131 `dropdown-notification`) + `index/all-popup/popup-database.php` render **admin-pushed broadcast popups** — an image (`images/notify/<content>`) with an optional detail URL, dismissed via `userReadNotify.php` → `INSERT tb_notify_read (userID, popID)`. This is how PCS pushed promos / announcements / "ระบบปิดปรับปรุง" to every customer with per-user read tracking.
- **Pacred:** HAS a rebuilt version — `actions/notifications.ts` reads **`notifications` + `notification_reads`** (rebuilt tables), and `/notifications` route + `/admin/notifications/dispatch` exist. But it is the **silent-dead-write / split-data pattern** (Rule 3): it does NOT read legacy `tb_notify` / `tb_notify_read` (grep: zero hits in actions/lib/app). Any broadcast the 8,898 migrated customers received, and any in-flight `tb_notify` row, is invisible; a Pacred broadcast won't appear to a customer whose client still expects the legacy table. **No lane scored its fidelity.**
- **Owner:** **ปอน** (customer-facing notification surface + the bell). Decide: repoint at `tb_notify`/`tb_notify_read`, or document `notifications`/`notification_reads` as the chosen Phase-C reframe + backfill.

### M-2 (P1) — Terms-of-Service acceptance gate (`tb_terms_service`)
- **Legacy:** `index/all-popup/popup-termsofservice.php` force-shows a scroll-to-bottom ToS modal (version `v.24.05.15`), accept → `userAcceptTermofservice.php` → `INSERT tb_terms_service (userID, version, date)`. It gates portal usage until accepted.
- **Pacred:** HAS a rebuilt version — `lib/tos-server.ts` + `lib/tos.ts` + `components/tos-gate.tsx`, wired in `(protected)/layout.tsx`, reading **`tos_versions`** (migration 0047) + acceptances. Functionally equivalent and arguably better (admin-versioned). But it does NOT read/write legacy `tb_terms_service` (grep: zero hits) → the migrated acceptance history is orphaned, and this is a Phase-C reframe that **no lane assessed for faithfulness**. Likely acceptable-as-improvement, but it must be *named* as a deliberate divergence, not left silently un-audited.
- **Owner:** **ปอน** (customer-facing gate; small — mostly a "confirm + document the reframe" task).

### M-3 (P1) — 7-15-day re-verification OTP gate (`notification-verifi.php` → `verify-tel.php`)
- **Legacy:** `index/all-popup/notification-verifi.php` force-shows a "ยืนยันตัวตนเพื่อเช็คข้อมูลการนำเข้า … ภายในระยะเวลา 7 - 15 วัน" OTP modal that posts to `verify-tel.php` (re-confirms the customer's primary phone via OTP on a schedule). A real recurring customer-facing identity gate.
- **Pacred:** **NONE.** No `verify-tel` route, no re-verification gate (grep across app/components = empty). cust-01 audited register/login/change-phone OTP but **not** this periodic re-verify gate. Genuinely missing flow.
- **Owner:** **เดฟ** (customer-backend / auth — pairs with cust-01's OTP work; gated behind the OTP-route fix, since OTP itself is currently bypassed P0-1).

### M-4 (P1) — Credit-due reminder auto-popups (`credit-due-1d` / `credit-due-3d` / `credit-past-due`)
- **Legacy:** three `index/all-popup/credit-due-*.php` modals auto-fire on login when the customer has credit-line forwarder rows due in 1 day / 3 days / past-due (`countFCredit1Day` etc.), each linking to `forwarder/?q=c` ("ชำระเลย"). This is the credit-collection nudge that keeps the credit-line revenue moving.
- **Pacred:** **NONE** (grep: credit-due / ครบกำหนดชำระ = only unrelated forwarder-invoice files). cust-03 explicitly **deferred** these ("credit-due popups … present in all-script.php, check separately") and cust-05's `/wallet-credit` audit covers the balance page but not the due-reminder popups. So they fell through the crack between the forwarder lane and the wallet-credit lane.
- **Owner:** **เดฟ** (customer-backend — the due-date computation over `tb_forwarder fCredit=1` + the popup trigger; pairs with cust-03's credit work).

### M-5 (P2) — Home/member-root dashboard not audited as a whole
- **Legacy:** the member root (`?page=''`) renders the slogan banner + status-summary + the ToS/notify/credit/verify popups all fire here. cust-02 audits the **order list** that appears on it, but no lane audits the **dashboard page itself** (Pacred `(protected)/dashboard/page.tsx`) for fidelity — its summary cards, the 9-icon launchpad vs legacy menu, and whether it is the mount point that should host M-1..M-4's popups.
- **Owner:** **ปอน** (customer-facing dashboard surface). Low severity — mostly a "where do the popups mount + does the summary match" check.

> **Common thread of M-1..M-5:** the lanes were partitioned by **left-menu item**, but the `index/all-popup/*` layer is **cross-menu infrastructure** that mounts on every page. It has no menu item, so it had no lane. **Recommend a small dedicated "cust-08-notify-gates" follow-up** (owner ปอน for the surfaces, with เดฟ on M-3/M-4 backends) rather than wedging these into existing lanes.

### Lower-confidence / already-correctly-parked
- **`wallet-shop` (affiliate shop wallet):** cust-05 audits it (P0-3) and flags it may be a Phase-C invention. I **confirmed it is NOT in the customer `left-menu.php`** (the `wallet-shop/` dir + 4 AJAX loaders exist but are unlinked in customer nav). This **downgrades cust-05 P0-3 to P1/P2** pending the ก๊อต/owner "was it ever live?" check — a customer can't even navigate to it in legacy. Not a missed subsystem (cust-05 owns it) — just a severity correction.
- **`oop/` + `LineNotify/` + `404page/` handler dirs:** infra/util, not customer workflows — correctly unaudited.
- **`getLineOA.php` (LINE-OA link write):** cust-06 row 20 + cust-07 W10 both touch LINE-OA linking; adequately covered between them.

---

## 2. FALSE GAPS (claimed gaps that are actually present / mis-stated)

I opened the real Pacred files for the most severe death-flows. **No false positives found** — every P0/P1 death-flow verified TRUE:

| Lane claim | Verified in Pacred | Verdict |
|---|---|---|
| cust-01 P0-1: OTP hardcoded-bypassed | `actions/otp.ts:42` `EMERGENCY_OTP_BYPASS = true`; L79 + L148 short-circuit | ✅ TRUE |
| cust-02 P0-1: `placeServiceOrder` writes rebuilt `service_orders` | `actions/service-order.ts:670` `.from("service_orders").insert` (vs faithful `submitCartOrder` → `tb_header_order` L163/256) | ✅ TRUE |
| cust-05 P0-1: `createWithdraw` writes rebuilt `wallet_transactions` | `actions/wallet.ts:174` reads `wallet` (L59) + writes `wallet_transactions` (L210); `tb_wallet_hs` write (L451) is only in `submitLegacyWalletDeposit` (deposit path) | ✅ TRUE |
| cust-04 P0-1: yuan wallet-paid debit never settles | `createYuanPayment` writes pending `wallet_transactions` (kind=yuan_payment); `adminBulkApproveYuanPayments` (`tb-bulk.ts` L270+) flips only `tb_payment.paystatus` and the wallet bulk path (L64-190) is a *separate* `tb_wallet`/`tb_wallet_hs` flow — they never meet | ✅ TRUE |
| cust-03: primary forwarder screens read `tb_forwarder` inline (healthy) | `service-import/page.tsx` + `[fNo]/page.tsx` docblocks confirm inline `tb_forwarder` ⋈ joins | ✅ TRUE (correct PRESENT call) |
| cust-03 P1: `getShipBy` carrier picker unwired | `service-import/add/page.tsx:554-556` `<div id="selectShipBy">` + `TODO(server-action)` | ✅ TRUE |
| cust-03 P1: no customer `deleteForwarder` | grep `actions/forwarder*.ts` = zero hits | ✅ TRUE |

**One soft correction (not a false gap, a severity over-statement):** cust-05 **P0-3 (affiliate shop wallet)** is rated P0, but the feature is **not reachable from the customer nav in legacy** (unlinked `wallet-shop/`). If it was never live in legacy prod (ก๊อت/owner to confirm), it's a **P1/P2 Phase-C label**, not a launch-blocking P0. The lane already hedged this ("P1 if shop-wallet was never live") — I'm confirming the nav evidence that pushes it toward the lower rating.

No other claims contradicted by the code.

---

## 3. CROSS-CUTTING PATTERNS (recurring root causes, this side)

1. **Silent dead-write to rebuilt empty tables (the dominant pattern — Rule 3).** Appears in EVERY lane: cust-01 (`profiles`/`corporate` vs `tb_users`/`tb_corporate`), cust-02 (`cart_items`/`service_orders`/`wallet_transactions`), cust-03 (`forwarders`/`forwarder_items`/`forwarder_cost_adjustments`), cust-04 (`wallet_transactions`), cust-05 (`wallet`/`wallet_transactions`/`tb_shop_transactions`), cust-06 (`addresses`), cust-07 (`sales_commissions`/`sales_payouts`). **And it extends into the un-audited infra** I found: M-1 (`notifications`/`notification_reads` vs `tb_notify`/`tb_notify_read`) and M-2 (`tos_versions` vs `tb_terms_service`). This is the #1 systemic root cause on the customer side and the single architecture decision that gates almost everything: **pick the SOT (legacy `tb_*` vs rebuilt) per domain, repoint writes, delete the loser.**

2. **Duplicate action files / split-brain, where the FAITHFUL one is the orphan.** Recurs with a cruel twist — the correct `tb_*` implementation often already exists but is **not wired to the UI**, while the dead rebuilt one IS: cust-02 `submitCartOrder`(faithful, orphan) vs `placeServiceOrder`(rebuilt, live); cust-03 `createLegacyForwarder`(live, good) but `forwarder.ts` rebuilt fns back a dead `/pending` view + `forwarder-form.tsx` orphan; cust-05 `submitLegacyWalletDeposit`(faithful) vs `createWithdraw`(rebuilt); cust-06 `add-address-action`(faithful) vs `actions/addresses.ts`(dead); cust-07 Path A `/sales`(faithful read, no writes) vs Path B `/commissions`(rebuilt CRUD, dead). **Mitigation is often just a re-point of nav + deletion of the rebuilt twin, not new code** — which makes these high-leverage.

3. **Money loop never closes (debit-timing / settle-gap).** cust-04 (yuan debit parked pending, never settled → balance never drops → double-spend), cust-05 (withdraw never debits `tb_wallet`, reject never refunds, paydeposit batch-settle absent), cust-02 (pay-from-wallet on rebuilt ledger). Legacy debits `tb_wallet.walletTotal` **synchronously** and settles via admin approve/reject + `tb_wallet_paydeposit` cascade; Pacred's rebuilt `wallet_transactions` "pending→completed via trigger" model is half-wired. The wallet SOT decision (Pattern 1) + the approve/reject settle paths must land together or money silently leaks.

4. **Notify fan-out narrowed: admin-group ping dropped.** Legacy fires TWO notifications on customer create (customer + **admin/staff LINE group**) so staff act fast. Pacred consistently keeps the customer push but **drops the admin-group ping**: cust-04 P1-4 (yuan create), cust-02 (status transitions admin-side), cust-05 W17/FO-5 (no notify on wallet status flip), cust-07 W11/W12 (per-transition coverage + connect-nag). Plus the whole M-1 broadcast channel. **Recurring: the customer half of notifications is wired; the staff/ops + broadcast half is not.**

5. **Flow-ORDER drift even when pieces exist (the owner's specific concern).** cust-01 (register: stage→OTP→users INVERTED to auth→profile→mirror; sales-rep moved register-time→approval-time), cust-02 (order created straight at status 2, skipping legacy status-1 review; cancel guard `hStatus<3` dropped), cust-04 (wallet-debit timing inverted; gate moved off `/add`; slip-only bypass added), cust-06 FO-1 (search→cart split across two screens with a re-paste). Several gaps are NOT "missing piece" but "right pieces, wrong sequence" — exactly the class the mandate flags.

6. **Cross-menu popup/gate layer fell between lanes (the structural gap of THIS audit).** M-1..M-5 — the `index/all-popup/*` infrastructure (notify broadcast, ToS gate, re-verify gate, credit-due nudges, the dashboard they mount on) has no left-menu item, so the menu-partitioned lanes missed it. Root cause is the audit partition, not the code.

7. **Status-enum / value drift.** cust-01 (`userActive` `''` vs `'0'` splits the pending queue), cust-02 (cancel `'cancelled'` vs `'6'`; the audit-caveat that shop cancel = `6` NOT `99` — correctly reproduced), cust-05 (wallet `type` enum: type 3=withdraw vs type 7=pay-top-up-extra mis-mapped in admin delta rule). Writing a word/wrong-digit where legacy uses a specific 1-char code recurs.

---

## 4. TRUE P0 ORDERING (customer side)

Ranked by revenue/trust impact × blast-radius. The first two are the keystones that unblock the rest.

1. **[P0 · เดฟ + ก๊อต] Wallet SOT decision (legacy `tb_wallet`/`tb_wallet_hs` vs rebuilt `wallet`/`wallet_transactions`).** This single architecture call gates cust-02 P0-3 (pay-from-wallet), cust-04 P0-1 (yuan settle), cust-05 P0-1/P0-2 (withdraw + history), and the money-loop pattern (#3). Decide first; everything money-shaped hangs off it.
2. **[P0 · เดฟ] Restore OTP gating (cust-01 P0-1).** `EMERGENCY_OTP_BYPASS=true` is a live security hole — anyone registers/resets with any phone, no verification. Flip to env-gated `false` the moment the ThaiBulkSMS route is fixed (coordinate with ก๊อต on the SMS route). Also unblocks M-3 (re-verify gate).
3. **[P0 · เดฟ] Unify customer cart+order onto `tb_header_order` (cust-02 P0-1/2/3/4).** Re-point nav to the faithful `/cart` + `submitCartOrder`; make add-to-cart write `tb_cart`; pivot cancel→`hstatus='6'` (guard `<3`) + pay→`tb_wallet`; delete the rebuilt `service_orders`/`cart_items` twin. Resurrects place/cancel/pay — the worst dead surface in the port. Depends on #1 for the pay leg.
4. **[P0 · เดฟ] Close the yuan money-hole (cust-04 P0-1) + restore wallet-always funding (P0-2).** On yuan approve/reject, settle the matching `wallet_transactions` row (or debit `tb_wallet` per #1); drop the slip-only bypass; restore the shortfall-QR. Direct double-spend risk today.
5. **[P0 · เดฟ] Re-wire customer WITHDRAW + HISTORY onto `tb_*` (cust-05 P0-1/P0-2)** + **[P0→ภูม] admin withdraw approve/reject + refund + enum fix.** Migrated customers currently see ฿0 withdrawable and a `/wallet/history` that contradicts `/wallet`. Ship the customer re-wire and the admin refund-on-reject together (a rejected withdraw must refund).
6. **[P0 · เดฟ] Resolve canonical-table inversion on register (cust-01 P0-2)** — make `tb_users` the canonical signup write (or transactional fail-closed mirror) + seed `tb_wallet`/`tb_cash_back`/`tb_corporate` there. This is the auth-side root of Pattern #1; a native signup is otherwise a functional orphan in the legacy data plane.
7. **[P0 · เดฟ] Pick the commission architecture (cust-07 P0-1) + earn-trigger (P0-2 · ภูม).** Affiliate revenue-share is wholly dead (read-only faithful path with no writes + a rebuilt CRUD path on empty tables). Choose Path A, add the VIP-`coID` earn INSERT on forwarder-final.

**Then the newly-surfaced infra (P1, recommend a dedicated cust-08 follow-up):** M-1 notify-broadcast SOT (ปอน), M-2 ToS reframe confirm (ปอน), M-3 re-verify gate (เดฟ), M-4 credit-due popups (เดฟ) — plus the per-transition + admin-group notify coverage (Pattern #4).

---

### Appendix — coverage matrix (legacy customer nav → lane)
`profile/account-settings/login/register/logout` → cust-01 · `shops/cart` → cust-02 · `forwarder/receipt-f-hs/forwarder-add` → cust-03 · `payment` → cust-04 · `wallet/wallet-credit/wallet-shop` → cust-05 · `address/search/map/china-address` → cust-06 · `user-sales/report-user-sales*` → cust-07.
**Uncovered (no menu item → no lane):** `index/all-popup/*` (notify broadcast `popup-database`, ToS `popup-termsofservice`, re-verify `notification-verifi`, credit-due `credit-due-*`) + the bell (`userReadNotify`/`tb_notify`) + the dashboard mount point. → M-1..M-5.
