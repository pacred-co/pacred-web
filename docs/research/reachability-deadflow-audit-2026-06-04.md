# 🔎 Reachability · 404 · dead-flow audit + fix wave — 2026-06-04 (เดฟ)

**HEAD:** `40d3ec46` (= `main` = `dave-pacred`) · worktree `gifted-snyder-0a9cca` · Mac.
**Owner directive (this session):** legacy PCS = master spec; **NO death / error / 404** in Pacred; **every customer function must have a clickable entry point** (admin gated from customers is correct). Full click-test allowed (data is pre-launch, gets purged) **EXCEPT any action that notifies/calls/SMS/LINE/emails a customer — ห้ามลั่นเด็ดขาด**. Tag test mutations `devtest`.

**Method:** 4 read-only audit agents over all **374 routes** (69 customer · 253 admin · 46 public · 3 auth) cross-referenced vs legacy `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member{,/pcs-admin}`. Findings re-verified against HEAD by hand (the §0c/§0e discipline disproved several agent claims — noted below).

---

## ✅ Headline

- **Customer surface is healthy** — ZERO 404 risk, **no customer dead-write traps** (every customer mutation writes the live legacy `tb_*`; rebuilt 0-row twins already re-pointed). The only real customer *death* was one dead button (now fixed).
- **Admin money/status paths are faithful** — every major dead-write trap from prior audits is CLOSED (re-verified): yuan_rate, rates/vip, 3 commission pages, money-loop, forwarder `[fNo]`, yuan_payments, service_orders, wallet_transactions. Residue = 1 broken link (fixed), ~9 orphan routes, 2 dead-code files, a few parity items.

---

## 🛠 Fixes applied this session (customer-first)

| # | Issue | File | Fix | Verify |
|---|---|---|---|---|
| 1 | `/service-order` "ยกเลิก" = **dead `<button>`** in a Server Component (every nav lands here) | `app/[locale]/(protected)/service-order/page.tsx:445` + NEW `cancel-order-button.tsx` | client island → `cancelServiceOrder` (faithful, no comms) | route 200, compiles; ⚠️ live cancel-click not exercised (PR112 has 0 status-1/2 orders) — pattern-proven |
| 2 | dashboard "billing" banner → `/service-order/cart` (redirect to `/cart`) | `components/dashboard-banners.tsx:31` | → canonical `/cart` | config change |
| 3 | `doGTranslate is not defined` console error on **every** protected page (legacy `app.min.js` lang menu) | `app/[locale]/(protected)/layout.tsx` loader | no-op `window.doGTranslate` stub before `app.min.js` injects | stub present in payload + live `typeof===function`; buffer count flat across reloads → fixed (pristine confirm pending server restart) |
| 4 | `/admin/learning` ticket link → missing `/admin/inbox` (404) | `app/[locale]/(admin)/admin/learning/page.tsx:65` | → `/admin/board/inbox` (exists) | route confirmed exists |

**Verified FALSE POSITIVES (agent over-flagged — did NOT fix):**
- `warehouse-addresses` "orphan" → reachable via `/addresses` `ChinaWarehouseModal` + `m/dashboard/mobile-launchpad.tsx:72`.
- 4× `accounting/cargo/income/.../coming-soon` "404" → absorbed by the catch-all `[type]/[service]/[[...slug]]` (renders, not 404). Verify render content is intentional.

---

## 🟠 Remaining queue (next push — disjoint lanes, no collision)

### Customer (minor — non-deaths)
- Profile image-upload modal UI present but unwired (cropper/croppie not ported) — `profile/page.tsx:70`. Either wire the upload or hide the control.
- `/service-order` `PaymentBar` is a "view pending" nudge, not real multi-pay (legacy had bulk-pay). Per-order pay works via detail. Low priority.
- `popimportboded.png` `fill` missing `sizes` (LCP/perf warning).
- `/my-issues` orphan (likely internal — confirm intent or add entry).
- Address-delete-on-main: legacy refuses; Pacred re-points main. Minor behavioral divergence.

### Admin — orphan routes to wire into sidebar/menubar (§0d ≤3-click) — RE-VERIFY each is truly unlinked first
`/admin/reports/forwarder` · `/admin/search` · `/admin/inventory` · `/admin/migration/pcs-customers` · `/admin/notifications/dispatch` · `/admin/payment-reconciliation` · `/admin/wht` · `/admin/settings/contacts` · `/admin/system/cron-health` (+ several phase-gated/super-only that are intentional). Nav config: `lib/admin/sidebar-menu.ts` + `lib/admin/accounting-menubar.ts` + `components/admin/*menu*`.

### Admin — dead-code (delete or harden to throw; confirm 0 live importers first)
- `actions/admin/rates.ts` — writes rebuilt `rate_general`/`rate_custom_*`; UI uses `rate-edits.ts` → `tb_rate_*`.
- `actions/admin/wallet.ts` — tombstoned, writes empty `wallet_transactions`; UI uses `wallet-hs.ts`.

### Admin — parity to click-confirm
single-row forwarder delete (status1) · shop receipt format · `forwarder-bill` `update_fPhotoEnd` delivery-photo · `cart.ts` cart→customer notification profile↔tb_users bridge.

### Soft §0c
`customers/transfer-bulk/page.tsx:101` — unguarded `const { data }` (coerced to `[]`; no crash, but add error log).

---

## 🚫 COMMS DO-NOT-FIRE list (live testing must NEVER click these — they create a real customer in-app notify row even with LINE/SMS bypassed)

`sendNotification` ALWAYS inserts an in-app `notifications` row (lib/notifications/index.ts:49) then returns early under bypass. So bypass stops external LINE/SMS/email but NOT the in-app เด้ง. Avoid:

- `adminCallPriceUser` (แจ้งเก็บเงิน) — `forwarder-check.ts:354/401` (SMS+LINE+email+in-app)
- `approveCustomer` — `customers.ts:467/485` (SMS + in-app, to customer) + rep alert `:542/555`
- `adminConvertToJuristic` — `customers.ts:692`
- `adminTransferSalesRep` — `admins.ts:310` notifies the customer
- wallet deposit approve/reject — `wallet-hs.ts` (via shims) — `wallet.ts:109/266`
- `adminBulkApproveWalletHs` (forwarder slip bulk) — `tb-bulk.ts:507/520` (SMS+in-app per row)
- `adminIssueForwarderInvoice`/receipt — `forwarder-invoice.ts:391/413`
- `adminUpdateServiceOrder` (shop status) — `service-orders.ts:266`
- shop workflow quote/ordered/arrived — `service-orders-shop-workflow.ts:970/990/1015/1051`
- `adminSpawnForwarderFromShopOrder` — `service-orders-spawn.ts:341`
- yuan approve/refund — `yuan-payments.ts:257/551`
- pay-on-behalf — `pay-user.ts:439/723/1128/1422`
- forwarder cost-adjust add/paid/cancel — `forwarder-cost-adjustments.ts:152/181/320`
- forwarder status change — `forwarders.ts:602` · customer-note save — `forwarders.ts:1036`
- barcode scan (intake/prepare/deliver) — `barcode.ts:266/391`
- payment-reconciliation match — `payment-reconciliation.ts:301` · reconciliation — `reconciliation.ts:105`
- report-cnt detail cnt notify — `report-cnt-detail.ts:616`
- invoice adjustments — `invoice-adjustments.ts:191/322` · tax-invoice issue — `tax-invoices.tsx:250/360/652`
- billing-run "send invoice" — `billing-run.ts:1179`
- sales payouts (leader) — `sales-payouts.ts:95` · forwarder-drivers (driver) — `forwarder-drivers.ts:403`
- **broadcast popup → EVERY active customer** — `broadcasts.ts:115` (NEVER)
- `notifyStaffGroup` (admin notes → staff LINE OA group) — `forwarders.ts:1021` (fires to staff group; `LINE_STAFF_GROUP_ID` is set)

> Local safety net: `.env.local` has `LINE_PUSH_BYPASS=true` + `NOTIFY_BYPASS=true` (added this session) + placeholder ThaiBulkSMS key → external comms suppressed (needs server restart to take effect). In-app rows still insert → still avoid the above.

Customer-side comms (also avoid): `placeServiceOrder`/`submitCartOrder`, `payServiceOrderFromWallet`, `submitForwarderPayment` (4-ch + staff group), `createYuanPayment`, `createLegacyForwarder`, register/forgot-password OTP.

---

## 🔵 Owner-only (เดฟ has no Vercel token)
- Vercel prod env: `PACRED_TAMIT_DETAIL_URL`=`https://tamit-cloud.com/api-product-2026` (or delete) · confirm `THAIBULKSMS_FORCE=corporate` · pcs-sync (apply `0137` + `PCS_SYNC_URL`/`PCS_SYNC_TOKEN` + deploy `pacred-sync.php`).
- Confirm admin login on prod (`admin_pee`/`123456`). FB 8 tokens → scaffold `/api/webhooks/facebook`.
- `migration 0137_pcs_sync_state` NOT applied prod (0138 applied · next free 0139).

## Env notes (Mac worktree, this session)
- Worktree had no `.env.local` (the "DB click hangs" trap) → copied the reconciled prod set from main checkout + applied `TAMIT → /api-product-2026` + removed a broken `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=the base64 string` placeholder + added `NOTIFY_BYPASS=true`. Dev server: worktree on **:58553** (main checkout's old server holds :3000). Legacy source confirmed at `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/`.
