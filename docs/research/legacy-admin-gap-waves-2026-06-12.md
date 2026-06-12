# Legacy admin-menu gap → wave plan (2026-06-12)

> Source: the full PCS-admin sidebar HTML + the 99k-line forwarder-list HTML (owner-supplied) → a 10-auditor codebase gap audit (146 leaves: 98 BUILT · 24 PARTIAL · 24 MISSING) + a hand-audit of the reports/settings/learning section. Owner: "ทำทั้งหมด จับเป็น wave ใหญ่ แล้วแยกร่างทำ."
>
> Method: parallel feature-agents per wave (disjoint NEW route dirs · no shared-file edits) → I wire nav + i18n + gate (verify+build) + adversarial review + push. Money/policy surfaces ship with a banner, never fabricated rules.

## The forwarder-list confirm (not a gap)
The 99k-line `รายการฝากนำเข้าสินค้า` HTML = the list page. Pacred `/admin/forwarders` has ALL 13 columns (ID · วันที่ · รหัสลูกค้า+tier/sale badge · รายละเอียด+image/import-admin/linked-shop · ค้างชำระ · พัสดุจีน/ไทย · เข้า/ออกโกดัง · ถึงไทย+เลขตู้/transport · สถานะ flow · อัปเดต · ตัวเลือก) + filters (coID tier · ~25 carriers · รถ/เรือ) + status flow (รอชำระเงิน→ถึงโกดังจีน→กำลังมาไทย→ถึงไทย→เตรียมส่ง→ส่งแล้ว+พิมพ์แล้ว). **Faithful — no gap.**

---

## WAVE 1 — เครื่องมือ + รายงาน + content (read-only · no migration · no owner input) ⚙️ BUILD NOW
Lowest-risk, fully autonomous, real shipped value. Parallel agents:
- **ตรวจสอบขนส่งไทย hub** `/admin/tools/thai-shipping` (faithful to legacy's 6 checkers): คำนวณค่าขนส่ง Flash (check-price-flash) · เช็คบริษัทขนส่ง (check-shipby) · ขนส่งต้น-ปลายทาง (check-payMethod) · ลูกค้าเหมาฟรี (maomao-free) · เหมานอกเขต (maomao-vip) · เลือกขนส่งอิสระ (shipby-freedom). Read tb_users flags + a Flash rate table.
- **Reports** (read-only over tb_*): ยอดรวมทุกบริการ (report-user-all) · ยอดขายรวมตามรหัส (report-sales-group-by-user) · ยอด API จีน (report-api-china) · OTP ไม่ผ่าน (report-otp-not-pass).
- **Learning content**: ประชาสัมพันธ์ (publicRelations) · แนะนำระบบใหม่ (introdNewSystem).
- **hs-customrate** ประวัติปรับเรทลูกค้า (read-only over the rate-change log).
- **Filter edits (I do — existing files)**: SVIP customer filter · driver vehicle-type filter · `segment=freight` customer filter.

## WAVE 2 — Freight money surfaces (stub → real · §0e/§0f) 💰 ✅ SHIPPED 2026-06-12
The freight BACKEND was already built (freight_quotes/invoices/shipments/payments + 8 action files); the gap was the admin UI. Surfaced the EXISTING actions into real pages (0 new write-paths · all mutations via existing audited actions · §0e clean · money-isolation reviewed):
- ✅ `/admin/accounting/freight/quotes` — ใบเสนอราคา list+detail (adminSubmit/Approve/Reject/Send/MarkAccepted/Expire/Convert · §0f confirm each).
- ✅ `/admin/accounting/freight/invoices` — ใบแจ้งหนี้ list+detail (adminIssue/Cancel/recordFreightPayment · VAT/WHT/payment-ledger · PDF print).
- ✅ `/admin/accounting/freight/ledger` — รายรับ-รายจ่าย (เงินเข้า freight_invoice_payments − เงินออก freight_shipments cost = สุทธิ · CSV · read-only).
- ✅ `/admin/withdrawal/freight-th-list` — ค่าขนส่งไทย เบิกเงิน real read-surface; approve/pay gated+bannered until owner confirms commission 50/50 (isFreightCommissionEnabled).
- Wired: freight hub menubar +3 leaves · HUB cards repointed (the old ใบเสนอราคา card pointed at a non-existent route) · sidebar freight-th repointed stub→real. Gate REAL verify=0/build=0.
- ⏳ Still owner: Freight commission 50/50 policy (unlocks the freight-th pay button + accrual). Remaining stub TODOs (รายจ่าย/ผู้ติดต่อ/การเงิน/การบัญชี menubar) = Phase C. segment=freight member-approval = Wave 5.

## WAVE 3 — Payroll / HR (new system · big · OWNER policy) 🔴 needs input
- ตั้งเงินเดือน · สรุปเงินเดือน · ประวัติการจ่ายเงินเดือน · บัญชีธนาคารพนักงาน.
- attendance scanner/mobile import · stock-used-organization sub-pages · contact-list-outsider.
- ⚠️ salary amounts + payroll rules = OWNER. Build the system shell + banner; fill rules on owner sign-off.

## WAVE 4 — API admin UIs (needs creds for live) 🔴 needs ก๊อต/owner
- GOGO admin (ปรับข้อมูลนำเข้าจีน + sheet update) · JMF admin UI (dashboard/view/history · sync already runs via cron) · CargoCenter ประวัติอัตโนมัติ.
- ⚠️ live GOGO/JMF creds = owner/ก๊อต. Build UI shell + manual mode now; wire live API on creds.

## WAVE 5 — เกร็ดเล็ก (small · build) 🧩
- adjust-words-below-search (ปรับคำล่างช่องค้นหา · needs a small table) · Messenger/family/Line-notify staff types · VIP-group commission filter (THADA/SIN/OOAEOM/SWAN) · promo reports.

---

## Execution log
- 2026-06-12: plan authored. Wave 1 launched.
- 2026-06-12: **Wave 1 SHIPPED** (8 routes · 5 features · 5 parallel agents). `/admin/tools/thai-shipping` (6 legacy checkers: Flash calc faithful to calPriceFlash/calFlashPriceKG/CBM + remote/tourist/BKK zip arrays · carrier-by-province if-chain · ต้น-ปลายทาง guide · maomao-free reads tb_address_maomao_free · maomao-vip/shipby-freedom static reference w/ PCS→PR rebrand) + `/admin/reports/{user-all,sales-group}` (per-customer revenue across shop/import/yuan) + `/admin/reports/{api-china,otp-failed}` (tb_search_history usage · otp_codes failed) + `/admin/reports/rate-change-history` (tb_rate_custom) + `/admin/learning/{public-relations,new-system}`. Wired: REPORTS_MENUBAR (5 leaves) + learning hub (2 cards) + extension sidebar leaf `thaiShippingTools` (Calculator icon) + th/en i18n. ALL read-only (0 writes verified) · §0c clean · gate REAL verify=0/build=0. NOT authed-click-tested (no test super login).
