# 🧪 T-D1 — Cargo flow end-to-end smoke test runbook

> **Purpose:** Verify the cargo revenue loop works end-to-end before public ad spend or soft-launch (T-D4). Run on **dev Supabase + dev server** first; repeat on **production** before flipping any ad campaigns live.
>
> **Owner:** เดฟ executes; ภูม assists on backend issues that surface.
>
> **Estimated time:** 60-90 minutes for a clean run (~2-3 hours including debugging the first time).

---

## 🔍 Code-audit findings — 2026-05-15 (เดฟ via Claude)

A static code audit traced the full loop (signup → topup → admin approve → order →
pay-from-wallet → fulfilment → receipt → tax invoice) against the merged `dave` HEAD.
The core money path is **sound**: the `wallet_recompute_balance` trigger fires on
insert/update/delete, RLS forces the admin client on every status flip, and the
status / `kind` / `reference_type` enums are consistent across migrations + actions + UI.
Gaps found:

| # | Severity | Gap | Status |
|---|---|---|---|
| G1 | doc | Order is created directly at `awaiting_payment` (no `pending` stage); old Steps 4–5 implied a `pending` stage + admin status-set | ✅ runbook corrected below |
| G2 | low | No customer self-cancel of a pending deposit (`actions/wallet.ts` — deferred to Phase G; customer contacts admin) | hand-off ภูม |
| G3 | doc | `h_no` is `O<YYMMDD>-<seq>` (`generate_service_order_no()`, migration 0011), not `ONS<…>`. CLAUDE.md PORT_PLAN feature-map also says `ONS` — stale | ✅ runbook corrected; CLAUDE.md flagged |
| G5 | med | Receipt page gated the "ขอใบกำกับภาษี" panel to `status='completed'`, but `requestTaxInvoice` accepts any paid order (`ordered`+) → paid juristic customers couldn't request until delivery | ✅ fixed — `service-order/[hNo]/receipt/page.tsx` |
| G6 | low | Personal accounts with a `profiles.tax_id` can't request a tax invoice — `getServiceOrderForReceipt` reads tax_id only for `account_type='juristic'`, though 0034 + the panel allow personal-with-tax-ID | hand-off ภูม |
| **G7** | **HIGH** | `saveJuristicStep2` wrote company info to `profiles.*` only and never created the `corporate` row. Every juristic registrant had an empty `corporate` → the receipt eligibility check (reads `corporate`) failed → tax invoice broken for the >50%-revenue B2B segment | ✅ fixed — `actions/auth.ts` now upserts `corporate` (mirrors `upsertCorporate`) |
| G8 | design | Old Step 5 assumed admin can adjust `total_thb` pre-payment, but no action does (`adminUpdateServiceOrder` takes status/note only) | confirm design w/ ภูม |

**Not runtime-tested** — this was a static code audit. Run the live smoke test below on
dev Supabase to confirm the G5 + G7 fixes behave end-to-end. Juristic accounts created
*before* the G7 fix have no `corporate` row — they must re-save company info once via
`/profile` to backfill it.

---

## 🔁 Re-audit — 2026-05-17 (เดฟ via Claude, T-D1 production smoke gate)

`pnpm build && pnpm start` + `curl` every route — **🟢 zero 500s, zero DYNAMIC_SERVER_USAGE** on every customer route (public · auth · 7 customs `[port]` dynamic · knowledge `[slug]` · en-locale · protected-guest-307 · admin-guest-307). Re-traced the launch-critical register path against current `dave` HEAD (~40 commits since the 2026-05-15 audit):

- ✅ **Register + OTP** — `registerPersonal` + `registerJuristicStep1` both call `verifyOtp` correctly; no B1 `"bypass"`-hardcode regression after the register restyle. `actions/otp.ts` dual-pepper rotation intact.
- ✅ **G7 (juristic corporate row)** — fix held: `saveJuristicStep2` still upserts `corporate`.
- ✅ **wallet deposit / withdraw** — `createDeposit` + `createWithdraw` clean; server-side slip validation present.
- ✅ **DBD lookup** — fixed the misleading degradation message (separate commit + `learnings/partner-apis-quirks.md`).

| # | Severity | Gap | Status |
|---|---|---|---|
| **G9** | **low-med** | **`payServiceOrderFromWallet` (+ mirror `adminMarkServiceOrderPaid`) idempotency is check-then-act** — it `SELECT`s for an existing completed `order_payment` tx, then `INSERT`s the debit. No DB-level guard between the two. A customer submitting from 2 tabs / back-button / API-replay could double-debit. The pay button IS `disabled={pending}` client-side (blocks the common impatient double-click), so the residual race is edge-case + recoverable (refund). **Not a launch blocker.** | → ภูม follow-up F-11 (week-1) |

**G9 fix (handed to ภูม — exact spec in [`poom-handoff-2026-05-16.md`](poom-handoff-2026-05-16.md) F-11):** add a partial unique index so the DB rejects a 2nd completed `order_payment` atomically, then catch the unique-violation in both actions → return `already_paid: true`.

---

## Pre-flight checklist (do once before first run)

- [ ] **Migrations applied** on the target Supabase project (dev or prod):
      `0001..0034` — verify via Dashboard → SQL Editor → `select name from supabase_migrations.schema_migrations order by name desc limit 5;`
- [ ] **Dev server running:** `pnpm dev` (port 3000 default). For prod test, use the Vercel preview URL.
- [ ] **Test phone number / email** ready (don't use the owner's real number — OTP rate limits are 3/hour).
- [ ] **`OTP_BYPASS=true`** in `.env.local` for dev runs (skip ThaiBulkSMS). For prod test, expect real SMS.
- [ ] **A test admin account** with role `super` or `accounting` exists (for approving deposits + marking paid).
- [ ] **Optional:** PromptPay number set in env (if testing real top-up flow with QR). If `PROMPTPAY_*` not set, top-up degrades to a friendly "ติดต่อทีม" notice — that's fine for smoke test.
- [ ] **Open `/admin/dashboard` in a separate browser** logged in as admin → live view of incoming actions.

---

## Step 1 — Customer signup

**As customer (incognito browser):**

1. Visit `/register`
2. Choose **Personal** flow
3. Fill: first name, last name, phone, email (use throwaway), password (≥6 chars)
4. Submit step 1
5. (If `OTP_BYPASS=true`) enter `000000` as OTP — accepts. (If real OTP, enter received code.)
6. Land on `/dashboard`

**Verify:**
- [ ] `member_code` shown on dashboard (format `PR00###`)
- [ ] Profile row exists in `public.profiles` with `account_type='personal'`, `user_active=true`
- [ ] No errors in browser console or Vercel logs

**Repeat with Juristic flow** (recommended — needed later for tax invoice step):
1. `/register` → **Juristic** (3-step)
2. Fill personal info + company info (tax ID 13 digits + company name + company address)
3. Upload at least one document (PDF or image — `member-docs/` bucket should accept)
4. Submit + OTP

**Verify:**
- [ ] `profiles.account_type='juristic'`
- [ ] `public.corporate` row created with `company_name`, `tax_id`, `company_address`
- [ ] Document uploaded to Storage `member-docs/<profile_id>/...`

---

## Step 2 — Customer tops up wallet

**As customer (still in incognito):**

1. Go to `/wallet/deposit`
2. Enter amount (e.g., **฿500.00** — round to allow exact pay later)
3. **If PromptPay configured:** scan QR or copy amount → simulate bank transfer (no real money on dev).
4. **Upload deposit slip** (any image — placeholder ok for smoke)
5. Submit deposit request

**Verify:**
- [ ] `/wallet/history` shows a row: `เติมเงิน · รอดำเนินการ · ฿500.00`
- [ ] `public.wallet_transactions` row: `kind='deposit'`, `status='pending'`, `bucket='main'`, amount=+500
- [ ] Slip uploaded to Storage `slips/<profile_id>/...`
- [ ] Customer received notification: "ส่งคำขอเติมเงิน"

---

## Step 3 — Admin approves deposit

**As admin (separate browser):**

1. Go to `/admin/wallet`
2. Find the pending deposit row → click checkbox (NEW T-P3 bulk-approve bar appears)
3. Click **"อนุมัติทั้งหมด"** in the bar (or single-row approve via detail page — both should work)
4. Confirm action

**Verify:**
- [ ] Toast confirms "อนุมัติแล้ว 1 · ข้าม 0 · พลาด 0"
- [ ] `wallet_transactions.status` flips `pending → completed`
- [ ] `public.wallet.balance` for the customer recomputes to +500 (the `wallet_recompute_balance` trigger fires)
- [ ] Customer's `/wallet/history` shows the deposit as ✓ สำเร็จ
- [ ] Customer received notification: "เติมเงิน — สำเร็จ"

---

## Step 4 — Customer places a service-order (ฝากสั่งซื้อ)

**As customer:**

1. Go to `/service-order/add` or `/service-order/cart`
2. Add at least 1 item — paste a Taobao/1688/Tmall URL (or use placeholder if env vars not set for the parser)
3. Fill shipping address (use a non-BKK province for now to avoid the free-shipping quirk; or BKK if testing BKK zip discount)
4. Pick warehouse: **กวางโจว** · transport: **ทางรถ**
5. Submit order

**Verify:**
- [ ] Order created at `/service-order/<hNo>` with `status='awaiting_payment'` — `placeServiceOrder` computes `total_thb` and sets the 24h `payment_due_at` timer at creation; there is **no separate `pending` stage** in the current flow
- [ ] `service_orders` row exists with `h_no` like `O<YYMMDD>-<seq>` (e.g. `O260515-1` — single leading `O`, from the `generate_service_order_no()` trigger)
- [ ] Customer received a notification for the placed order
- [ ] Order shows in the `/admin/service-orders` admin list

---

## Step 5 — Admin reviews the order

**As admin:**

1. Open `/admin/service-orders/<hNo>` (from list)
2. Verify the items, address, warehouse
3. The order is **already** `awaiting_payment` with `total_thb` + `payment_due_at` set from Step 4 — no admin status change is needed here

**Verify:**
- [ ] `service_orders.status = 'awaiting_payment'` (set at creation, not by admin)
- [ ] `service_orders.date_awaiting_payment` stamped
- [ ] `service_orders.total_thb` = `subtotal_cny × yuan_rate + service_fee` (yuan_rate + service_fee from the `settings` row `id=1`; falls back to 5.0 / ฿50 if `settings` is empty)
- [ ] `service_orders.payment_due_at` is set (24h after creation)

> ⚠️ **Gap G8** — there is currently **no admin action to adjust `total_thb`** before payment (`adminUpdateServiceOrder` takes status/note only). If admin price-correction before payment is required, that action is unbuilt — confirm intended design with ภูม.

---

## Step 6 — Customer pays from wallet (NEW — closes the loop)

**As customer:**

1. Go to `/service-order/<hNo>`
2. See the yellow **"ยอดที่ต้องชำระ ฿400"** banner
3. **NEW:** Primary button **"💰 ชำระจาก wallet ทันที (มี ฿500.00)"** appears (because balance ≥ total)
4. Click → confirm "ยืนยันชำระ ฿400 จาก wallet ของคุณ?"
5. See success message: "ชำระเงินสำเร็จ — ตัด wallet ฿400.00 เรียบร้อย"

**Verify:**
- [ ] `wallet_transactions` row created: `kind='order_payment'`, `amount=-400`, `status='completed'`, `reference_type='order_header'`, `reference_id=<hNo>`, `admin_id=null` (customer-initiated)
- [ ] `wallet.balance` for customer recomputes to ฿100 (was 500, paid 400)
- [ ] `service_orders.status = 'ordered'`
- [ ] `service_orders.date_ordered` stamped
- [ ] Customer received notification: "ชำระฝากสั่ง — สำเร็จ"
- [ ] **Re-click** the (now hidden) button via browser back/refresh: page should NOT show the pay button anymore (status='ordered'). If you somehow trigger the action again (e.g., via API), it should return `already_paid=true` (idempotent).

**Edge cases to spot-check (if time permits):**
- Customer with balance < total: button replaced by hint "ยอดในกระเป๋า ฿X — ขาดอีก ฿Y..." + existing "ฝากเงิน" link still works
- Admin overrides via `/admin/service-orders/<hNo>` mark-paid (cash-in-hand path): should also work; preserve audit trail

---

## Step 7 — Admin moves status through fulfilment

**As admin:**

1. `/admin/service-orders/<hNo>` → status: **`ordered → awaiting_chn_dispatch`** (Pacred China side picks up)
2. Mark items shipped — paste tracking number per item (optional; saves to `service_order_items.tracking_number`)
3. Status: **`awaiting_chn_dispatch → completed`** (when delivered to TH customer)

**Verify each transition:**
- [ ] Customer received notification per status flip
- [ ] Date stamps populated on `service_orders` (`date_dispatched`, `date_completed`)
- [ ] Status badge color updates on `/service-order/<hNo>` (customer's view)

---

## Step 8 — Customer downloads receipt

**As customer:**

1. Go to `/service-order/<hNo>`
2. **NEW (from T-P1 GAP 3):** Click **"📄 ดาวน์โหลดใบเสร็จ PDF"** button (appears once status ≥ awaiting_payment)
3. OR navigate to `/service-order/<hNo>/receipt` for the print-friendly HTML view (Ctrl+P to save as PDF locally)
4. **Verify both paths work:**
   - PDF route: `/api/pdf/shop-order/<hNo>` returns `application/pdf` with Sarabun font + Pacred header
   - HTML route: `/service-order/<hNo>/receipt` shows print-friendly receipt with customer + items + breakdown

**Verify:**
- [ ] PDF / HTML both show:
  - "ใบเสร็จรับเงิน" label (status=completed) OR "ใบแจ้งหนี้" (status=ordered/awaiting_chn_dispatch)
  - Pacred company info from `components/seo/site.ts` (CONTACT, ADDRESSES)
  - Customer name + member_code + juristic block (if applicable)
  - Item list + pricing breakdown (CNY → rate → THB)
  - Total in THB
  - Footer disclaimer

---

## Step 9 — Juristic customer requests tax invoice

T-P4 G2b–G2f has shipped — this is now a live step.

**Pre-req:** the juristic customer must have a `corporate` row (tax_id + company_name).
The receipt panel reads `corporate`; if it is empty the panel shows a "not eligible"
hint. Gap G7 (fixed 2026-05-15) makes `saveJuristicStep2` create that row at
registration — accounts registered *before* the fix must re-save once via `/profile`.

**As juristic customer:**

1. On `/service-order/<hNo>/receipt`, the **"ขอใบกำกับภาษี"** panel appears once the
   order is paid (status `ordered` onward — Gap G5 fixed 2026-05-15; it previously
   showed only at `completed`)
2. Open the panel — buyer fields pre-fill from `corporate`; VAT is inclusive 7% per ADR-0006
3. Submit

**Verify:**
- [ ] `tax_invoices` row created: `status='pending'`, buyer fields populated, `subtotal_thb` + `vat_thb` + `total_thb` snapshotted

**As admin (super or accounting):**

1. `/admin/tax-invoices` → see pending request → click into detail
2. Click **"ออกใบกำกับภาษี"**
3. Wait — serial `INV-YYYYMM-NNNN` generated via `next_tax_invoice_serial()` → PDF rendered → uploaded to `tax-invoices/` Storage

**Verify:**
- [ ] `tax_invoices.status = 'issued'`, `serial_no` set, `issued_at` stamped
- [ ] PDF accessible via `/api/tax-invoice/<id>.pdf`
- [ ] Customer received notification: tax invoice ready to download

---

## Acceptance for T-D1 smoke test PASS

All of these must be ✓ for the smoke test to count as a pass:

- [ ] Personal customer can sign up → top up → place order → pay from wallet → receive receipt PDF
- [ ] Juristic customer can sign up + upload docs → has same flow + (when T-P4) tax invoice request works
- [ ] Admin can approve deposit (bulk + single both work)
- [ ] Admin can move order through full status chain (pending → … → completed)
- [ ] Customer receives notifications at every status change (check `/notifications`)
- [ ] No errors in browser console
- [ ] No 500s or unhandled exceptions in Vercel logs (or local terminal)
- [ ] Receipt PDF renders correctly with Sarabun Thai font
- [ ] Wallet balance recomputes correctly after each transaction (deposit, order_payment)
- [ ] Idempotency: clicking pay-from-wallet twice rapidly does NOT double-debit

---

## What to do when something breaks

1. **Wallet balance drift** — check `wallet_recompute_balance` trigger fired; inspect `wallet_transactions` rows for the customer; compare sum of `bucket='main' AND status='completed'` vs `wallet.balance`.
2. **Notification not received** — check `notifications` table for the row; check `profile.notify_channels` to ensure the customer is opted in.
3. **Receipt PDF blank or fails** — check `@react-pdf/renderer` register-fonts loaded; check Sarabun font asset exists in `public/fonts/`.
4. **OTP didn't arrive** — confirm `OTP_BYPASS=true` for dev; check ThaiBulkSMS gateway logs if `false`.
5. **Status didn't flip after pay** — check `service_orders.admin_id_update` and `service_orders.status` in DB; the action's "don't roll back" behavior may have left a debit without a status flip — admin reconciles manually via `/admin/service-orders/<hNo>` mark-paid (will return `already_paid=true`).

---

## After PASS

1. Document any gaps found → add to flag section of `docs/runbook/team-status-<date>.md`
2. Tighten any rough edges in a fast follow-up commit
3. Repeat smoke test on **production Supabase + production Vercel** before flipping ad campaigns live
4. Schedule T-D4 soft-launch — 5 friendly customers (พี่ป๊อป's network) walked through the full loop

---

## Cross-links

- [`docs/runbook/team-status-<date>.md`](./team-status-2026-05-16.md) — current dispatch state
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T5 — revenue-ready DoD checklist
- [`docs/decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) — Step 9 reference
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — future container tracking integration
