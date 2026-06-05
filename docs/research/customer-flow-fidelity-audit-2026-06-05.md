# 🔎 Customer-flow legacy-fidelity audit — 2026-06-05 (เดฟ · long autonomous run)

**Method:** 3 read-only agents audited the CUSTOMER-facing flows vs the legacy
PHP at `C:\Users\Admin\Desktop\newrealdatapcs\pcscargo\member\*.php` (the 42
customer files) — ฝากสั่งซื้อ/ฝากนำเข้า · ฝากโอน/wallet · address/refund/profile.
Every legacy customer function → mapped to Pacred (✅have / ⚠️partial / ❌missing),
checked reachable (§0d) + writes-live-`tb_*` (§0e).

**Headline:** the customer money loop is **faithful + writes live `tb_*`** on all
flows (`tb_header_order`/`tb_order`/`tb_cart`/`tb_forwarder`/`tb_wallet`/`tb_wallet_hs`/
`tb_payment`/`tb_address`/`tb_users`). No customer *create/cart/pay/cancel* dead-write
traps. Gaps = a few broken links, one latent dead-write, missing inline-edits, and
one Potemkin Pacred-original (`/refunds`).

---

## ✅ FIXED this run (เดฟ-lane · pushed · build+verify EXIT 0)

1. **6 broken wallet-history order links → 404 (§0d)** — `wallet/page.tsx`,
   `wallet/deposit/page.tsx`, `wallet-credit/page.tsx` linked refOrder rows to
   non-existent `/shops/detail/`, `/forwarder/detail/`, `/service-order/detail/`,
   `/service-import/detail/`. Repointed → `/service-order/{hNo}` + `/service-import/{fNo}`.
2. **`createYuanPayment` now SLIP-ONLY (§0e)** — its wallet branch INSERTed the dead
   rebuilt `wallet_transactions` (latent double-spend · never debited `tb_wallet`).
   The form already routes wallet→`createYuanPaymentFromWallet` (live `tb_wallet_hs`);
   this action now rejects wallet-paid + requires a slip. Dead write + 3 unused imports removed.
3. **ฝากโอน eligibility backstop** — `lib/payment/yuan-eligibility.ts` replicates the
   list-page gate (legacy `payment.php` L256-276: no pending juristic + used BOTH a paid
   shop order AND a paid forwarder), enforced in BOTH create actions → closes the
   deep-link-to-`/add` bypass. Same logic as the page = no over-block.
4. **delete-main-address parity** — legacy `deleteAddress.php` REFUSES deleting the main
   address; Pacred allowed it (dropped the pointer → customer left with no main). Added the
   refuse-guard + `?error=delete_main` message.

---

## 🚩 HANDOFFS — gaps NOT fixed (cross-lane / Phase-C / owner-decision)

### 🔴 `/refunds` — Potemkin subsystem (ภูม-admin lane + owner decision)
The customer refund-REQUEST page (a Pacred-original; legacy has NO such page) is wired
end-to-end to **rebuilt-empty twins**: the source-picker reads `forwarders`/`service_orders`/
`yuan_payments` (`refunds/page.tsx` L73-104) AND `actions/admin/refunds.ts::adminMarkRefundPaid`
writes the credit to the dead **`wallet_transactions`** (L293/327/467), not `tb_wallet`/`tb_wallet_hs`.
Since all orders write `tb_*`, those twins are 0-row → the page degrades to "ติดต่อทีม" for
EVERY customer (no death, but self-service never works). **The faithful legacy refund (admin
issues → customer sees `tb_wallet_hs` type-5 "รายการคืนเงิน") IS correctly ported** in
`wallet/page.tsx`. Decision (owner/ภูม): (a) full repoint of the WHOLE subsystem to `tb_*` +
`tb_wallet_hs` credit, or (b) formalize `/refunds` as contact-team-only. Not done — it's a
cross-lane (admin) Phase-C call, and it's inert (no death) today.

### ✅ DONE (this run) — Shop-order customer inline-edit of ship-by / address
Legacy `shops.php` L1470-1551 lets a customer change carrier (`update_hShipBy`) + re-pick the
delivery address (`update_hAddress`). **⚠️ Gate correction (§0b — re-read the source):** the
legacy form gates on **`hStatus != 5`** (editable until *completed* — L1679/L1701), NOT `≤2` as
this audit's draft said. Shipped: `actions/service-order-legacy.ts`
(`updateLegacyShopOrderShipBy`/`updateLegacyShopOrderAddress` → `tb_header_order`, keyed
`hno+userid`, gated `!= '5'` + we also lock `'6'`; PCS pickup forces payMethod=1 + rewrites
address to the Pacred warehouse; address-edit refused for PCS pickup) + 2 inline forms
(`shop-order-edit-ship-by-form.tsx` / `shop-order-edit-address-form.tsx`) + shared
`lib/legacy/customer-address-options.ts`. Mirrors the forwarder twin exactly. typecheck+lint+verify
EXIT 0, route 307, prod columns + 152 editable orders confirmed. ⚠️ NOT click-tested on a live
authed order (preview flaky) — open a status-1..4 TEST order, change carrier + re-pick address.

### 🟡 Smaller (flag)
- **Profile avatar** writes `profiles.avatar_url` (full public URL) not legacy
  `tb_users.userPicture` (filename) → admin back-office shows a STALE portrait after a customer
  changes their picture. **DON'T mirror** (writing a full URL into `userPicture` would break the
  ~12 readers that prepend a path to the legacy filename). **Safe ภูม-lane fix (5 lines, no
  regression):** in `app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx`, right before
  `const userImageUrl = await resolveLegacyUrl(u.userPicture, "profile")`, also
  `admin.from("profiles").select("avatar_url").eq("member_code", id).maybeSingle()` and
  `const userImageUrl = (profRow?.avatar_url?.trim() ? profRow.avatar_url : null) ?? await resolveLegacyUrl(...)`.
  Targeted to this primary customer-detail reader only — leave the other userPicture readers on the
  legacy filename. (เดฟ drafted + reverted this 2026-06-05 to respect the admin/** lane boundary.)
- **Shop-order slip-top-up at checkout** (`shops.php` L328-429) — pay shortfall + upload slip in
  one click when wallet insufficient. Pacred refuses + routes to `/wallet/deposit` (2-step). Missing.
- **Customer withdraw** missing legacy KYC controls (`wallet.php` L601-722): password re-confirm,
  2 mandatory doc uploads (บัตรปชช + สมุดบัญชี), and the `fStatus>5` "must-have-imported" hard gate
  (money math is faithful; the controls are dropped). — ปอน UI + เดฟ gate.
- **Address Google-Maps pin + jQuery.Thailand zip autocomplete dropped** (`address.php` L534-685)
  → delivery `latitude/longitude` saved as 0. Big integration (ปอน).
- **`/wallet-credit/withdraw`** legacy branch (`wallet-credit.php` L535-803) not ported.
- **Forwarder create: no `fCover` photo upload**; promo-on-add not wired (both flows).
- **Forwarder payment** is record-only (writes `tb_wallet_hs` pending, leaves `fStatus=5` for admin
  verify) vs legacy flip 5→6 on customer submit — INTENTIONAL Pacred divergence; confirm with owner.

> The 3 full per-flow gap tables are in this run's agent output (session transcript).
