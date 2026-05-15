# 🧪 T-D1 — Cargo flow end-to-end smoke test runbook

> **Purpose:** Verify the cargo revenue loop works end-to-end before public ad spend or soft-launch (T-D4). Run on **dev Supabase + dev server** first; repeat on **production** before flipping any ad campaigns live.
>
> **Owner:** เดฟ executes; ภูม assists on backend issues that surface.
>
> **Estimated time:** 60-90 minutes for a clean run (~2-3 hours including debugging the first time).

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
- [ ] Order created at `/service-order/<hNo>` with `status='pending'` (or `awaiting_payment` if total auto-calc'd)
- [ ] `service_orders` row exists with `h_no` like `ONS<YYMMDD>-<seq>`
- [ ] Customer received notification: "วางออเดอร์ ONS... เรียบร้อย"
- [ ] Order shows in `/admin/orders` and `/admin/service-orders` admin lists

---

## Step 5 — Admin reviews + calculates total

**As admin:**

1. Open `/admin/service-orders/<hNo>` (from list)
2. Verify the items, address, warehouse
3. Update order status to **`awaiting_payment`** via the status dropdown OR adjust total_thb if needed (depending on rate logic; legacy used yuan_rate × subtotal + service_fee — verify the calculated `total_thb` matches expectations)
4. Save

**Verify:**
- [ ] `service_orders.status = 'awaiting_payment'`
- [ ] `service_orders.date_awaiting_payment` stamped
- [ ] `service_orders.total_thb` is the correct THB amount (≤500 for smoke; let's say ฿400)
- [ ] `service_orders.payment_due_at` is set (default policy = 24h after awaiting_payment)
- [ ] Customer received notification: "ฝากสั่ง ONS... อัพเดทแล้ว — สถานะ: รอชำระเงิน"

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

## Step 9 — (When T-P4 G2b ships) Juristic customer requests tax invoice

**Skip if T-P4 hasn't shipped yet.** This becomes the test once ภูม picks up T-P4 G2b-G2f.

**As juristic customer:**

1. On `/service-order/<hNo>/receipt`, click **"ขอใบกำกับภาษี"** (juristic-only button)
2. Confirm buyer snapshot: company_name + tax_id + company_address (pulled from `corporate` table)
3. Choose VAT mode: **inclusive** (default) or **exclusive**
4. Submit

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
