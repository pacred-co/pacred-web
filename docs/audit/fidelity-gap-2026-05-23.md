# Fidelity gap audit — 5 list pages — 2026-05-23

**Trigger:** ภูม taught 2026-05-23: "Legacy = workflow source · Pacred UI = ของเราเอง · เปิด PCS เทียบควบคู่ไปเลย" (per `docs/learnings/pacred-design-philosophy.md`). Wave 11 shipped /admin/forwarders with gaps because no proactive comparison happened. This audit closes the gap for 5 more list pages — DONE BEFORE the operator clicks through and finds the gaps the hard way.

**Method:** legacy `.php` source at `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\pcscargo\member\pcs-admin\` — grep top tabs · column headers · action buttons. Then read each Pacred page + compare. Findings sorted by visible-to-operator severity.

**Scope:** 5 admin list pages — cnt-hs · wallet · service-orders · customers · yuan-payments. Excludes /admin/forwarders (Wave 11 + 11.1 just shipped) + /admin/drivers/work (Wave 10 + bug-fix shipped).

---

## 1. `/admin/cnt-hs` (cnt-hs.php default branch)

**Legacy ref:** `pcs-admin/cnt-hs.php` L3-484 (default list) · 1,861 LOC total. Top tabs: ทั้งหมด · รอดำเนินการ (`?q=1`) · สำเร็จแล้ว (`?q=2`).

**Legacy columns (10):**
ID · วันที่ทำรายการ · หมายเลขตู้ · จำนวนเงิน · ข้อมูลเพิ่มเติม · สลิปรายการ · หลักฐานผู้เบิกเงิน · ผู้ทำรายการเบิก · สถานะ · ตัวเลือก

**Legacy actions per row:** อัปเดตและดูรายละเอียด · คัดลอก · อัปเดตต้นทุนตามชีสของแสง

**Pacred state:** 635 LOC. Already has the form for creating new cnt + table view of past cnt rows. Wave 10 added `/admin/cnt-hs/[id]` detail + approve/reject + (Wave 12-A in flight) slip upload.

**Gap status: 🟡 partial — verify these vs legacy when Wave 12-A merges:**

| Element | Legacy | Pacred (current) | Status |
|---|---|---|---|
| Top tabs ทั้งหมด/รอ/สำเร็จ (`?q=`) | ✅ | ❓ check | NEED to verify after Wave 12-A merge |
| ID column | ✅ | ✅ | OK |
| วันที่ทำรายการ | ✅ | ✅ | OK |
| หมายเลขตู้ list (comma-separated `cntname`) | ✅ | ✅ | OK |
| จำนวนเงิน (`cntamount`) | ✅ | ✅ | OK |
| ข้อมูลเพิ่มเติม (note column) | ✅ | ❓ check | |
| สลิปรายการ thumbnail | ✅ | ❓ Wave 12-A in flight adds upload — does LIST page show thumb? | likely needs add |
| หลักฐานผู้เบิกเงิน (cntfile = PDF) | ✅ | ❓ check | |
| ผู้ทำรายการเบิก (`adminidcreate`) | ✅ | ❓ check | |
| สถานะ chip | ✅ | ✅ | OK |
| "อัปเดตและดูรายละเอียด" button | ✅ | ✅ | linked to /[id] |
| "คัดลอก" copy-cnt-row action | ✅ | ❌ MISSING | Wave 13 |
| "อัปเดตต้นทุนตามชีสของแสง" sheet-import action | ✅ | ❌ MISSING | Wave 13+ (depends on แสง Sheet integration) |

**Recommended Wave 13 work:**
- Add top tabs (ทั้งหมด · รอ · สำเร็จ) using `?q=`
- Add slip thumbnail + PDF link icons inline in list
- "คัดลอก" action — duplicates a cnt row (legacy convenience for similar suppliers)

---

## 2. `/admin/wallet` (vs wallet.php)

**Legacy ref:** `pcs-admin/wallet.php` — 848 LOC · NO ?create= top tabs. Routes by `?page=add|history|deposit|withdraw|history-cash-back`. The "default" page (`!isset(page) || page==add`) is **the admin manual topup form**, NOT a transaction list.

The "balance overview" page (5 cols: ลำดับ · รหัสสมาชิก · ชื่อ-นามสกุล · ยอด Cash Back · ยอดเงินคงเหลือ) is a DIFFERENT view (per-customer balance summary) — not what Pacred's /admin/wallet shows.

**Pacred /admin/wallet (451 LOC · Wave 7.2 rewrite):** shows the **transaction list** from `tb_wallet_hs` — equivalent to legacy `wallet.php?page=history`.

**Gap status: 🟢 mostly OK · 🟡 one missing sister page**

| Element | Legacy view | Pacred today | Status |
|---|---|---|---|
| Transaction list (`tb_wallet_hs`) | `wallet.php?page=history` | `/admin/wallet` | ✅ — Pacred merged history into the main wallet entry |
| Add manual topup | `wallet.php?page=add` (default) | `/admin/wallet/add` — Wave 12-A in flight | ⏳ |
| ประวัติรายการ | `?page=history` | `/admin/wallet/history` redirect → `/admin/wallet?status=2` | ✅ |
| รายการฝากเงิน drilldown | `?page=deposit` | `/admin/wallet?kind=topup` filter | ✅ |
| รายการถอนเงิน drilldown | `?page=withdraw` | `/admin/wallet?kind=withdraw` filter | ✅ |
| **Cash-back history** | `?page=history-cash-back` | ❌ MISSING | Wave 13 — if cash-back is in active use |
| **Per-customer balance overview** (5-col page) | default landing OR a sub-page | ❌ MISSING | Wave 13 — useful for accounting reconciliation |

**Recommended Wave 13 work:**
- `/admin/wallet/cash-back` — port `wallet.php?page=history-cash-back` (READ-ONLY first; legacy gets the rows from a `tb_*` cash-back ledger · need to find the table name)
- `/admin/wallet/balances` — per-customer balance overview (join `tb_wallet.wallettotal` with `tb_users` for top-N richest/empty wallets)

---

## 3. `/admin/service-orders` (vs shops.php)

**Legacy ref:** `pcs-admin/shops.php` — 1,942 LOC · top tab: ทั้งหมด only. Filters via `?q=1..6` (status: รอดำเนินการ / รอชำระ / สั่งสินค้า / รอร้านจีนจัดส่ง / สำเร็จ / ยกเลิก).

**Legacy columns (8):**
ID · เลขที่ออเดอร์ · รหัสสมาชิก · ข้อมูลสินค้า · ราคารวม (บาท) · สถานะ · อัปเดต · ตัวเลือก

**Legacy actions per row:** ดูรายละเอียด · อัปเดตรายการ · พิมพ์ใบเสร็จ · พิมพ์ใบแจ้งหนี้ · "ดูรายการทั้งหมดในประวัติ" (`historyTable` form button)

**Pacred state:** 152 LOC. Way smaller than legacy. Wave 7.x dashboard fix added tb_header_order legacy fallback for `/admin/service-orders/[hNo]` but the list page itself is thin.

**Gap status: 🔴 BIG — needs Wave 13 fidelity port like /admin/forwarders Wave 11**

| Element | Legacy | Pacred | Status |
|---|---|---|---|
| ID column | ✅ | ❓ | LIKELY MISSING |
| เลขที่ออเดอร์ (`hno`) | ✅ | ❓ | check |
| รหัสสมาชิก + ชื่อ join from tb_users | ✅ | ❓ | check |
| ข้อมูลสินค้า + thumbnail (`hcover`) | ✅ | ❌ likely missing thumbnail | Wave 13 — same lesson as /admin/forwarders Wave 11.1 |
| ราคารวม (`htotalpriceuser`) | ✅ | ❓ | check |
| Status chip + filter `?q=1..6` | ✅ | ❓ | check — Wave 10 fix mentioned `?status=` vs `?q=` mismatch · verify both |
| อัปเดต column (admin who touched · time) | ✅ | ❓ | check |
| ดูรายละเอียด button | ✅ | ✅ | /[hNo] page exists |
| อัปเดตรายการ button | ✅ | ❓ likely on /[hNo] | check |
| **พิมพ์ใบเสร็จ** action | ✅ | ❓ | LIKELY MISSING — Wave 13 |
| **พิมพ์ใบแจ้งหนี้** action | ✅ | ❓ | LIKELY MISSING — Wave 13 |
| **ดูประวัติทั้งหมด** (form submit · loads larger history) | ✅ | ❌ | Wave 13+ |

**Recommended Wave 13 work (separate fidelity-port sprint):**
- Mirror the /admin/forwarders Wave 11 pattern: 8-column legacy layout + status filter chips + product thumbnail + per-row print buttons
- Add print-receipt + print-invoice page routes (legacy has its own PHP for each · ours can use a shared print component)

---

## 4. `/admin/customers` (vs users.php)

**Legacy ref:** `pcs-admin/users.php` — 970 LOC. Routes via `?page=all|general|vip|svip|admin|sale|profile|...` (NO top tabs · uses sidebar leaves instead — which Pacred already does via the menubar in customers/page.tsx).

The list view's table headers are dynamically built per page-type, so the grep didn't catch static `<th>`. Need to read the file deeper to compare columns per page type.

**Pacred state:** 269 LOC. Wave 7.2 rewrite reads `tb_users` directly. Earlier Wave 7 also added the menubar with 9 group/segment filters (ทั่วไป · VIP · SVIP · นิติบุคคล · เครดิต · etc.). The legacy fallback at `/admin/customers/[id]` was added Wave 7.

**Gap status: 🟢 mostly OK — the per-group page-type pattern Pacred uses is BETTER than legacy's URL-based switching (one URL · param-based filter · single source of truth)**

The pieces that LIKELY need a deep-read against legacy:

| Element | Need to check |
|---|---|
| Per-customer drill-down sections | Legacy `?page=profile` has 9 tabs (shop · forwarder · payment · cash-back · wallet · wallet-add · wallet-his · wallet-payment · wallet-withdraw). Pacred customers/[id] consolidates via the legacy fallback but may not surface ALL 9 sections. ⚠️ Verify. |
| Admin user management (`?page=admin`) | Pacred has `/admin/admins` separately. Legacy has it nested. Different but functional. ⚠️ Verify URL routing intent. |
| Sales staff management (`?page=sale`) | Pacred has team-leaders + sales-payouts pages. Legacy has it nested. ⚠️ Verify. |

**Recommended Wave 13 work:**
- Deep-read `users.php?page=profile` and confirm `/admin/customers/[id]` shows the same 9 tab sections (likely needs adding cash-back history + wallet-add quick action)

---

## 5. `/admin/yuan-payments` (vs payment.php)

**Legacy ref:** `pcs-admin/payment.php` — 1,047 LOC. Top tabs: ทั้งหมด (`?date=...`) · รอดำเนินการ (`?q=1&date=...`). Date range filter is in the URL (`?date=YYYY-MM-DD+-+YYYY-MM-DD`).

**Legacy columns (9):**
วันที่สร้าง · เลขที่ออเดอร์ · ชื่อ-นามสกุล · รายละเอียด · วิธีการชำระ · ยอดรวม(บาท) · สถานะ · อัปเดต · ตัวเลือก

**Legacy actions:** แก้ไขข้อมูลและดูรายละเอียด · search form submit

**Pacred state:** 325 LOC · Wave 7.1 rewrite reads `tb_payment`. Has status tabs + search by userid/id.

**Gap status: 🟡 mostly OK · 1-2 missing pieces**

| Element | Legacy | Pacred | Status |
|---|---|---|---|
| วันที่สร้าง | ✅ | ✅ | OK |
| เลขที่ออเดอร์ (= `id` integer · "ออเดอร์ #X") | ✅ | ❌ shows `id` raw · not "ออเดอร์ #X" format | Wave 13 trivial |
| ชื่อ-นามสกุล (joined from tb_users) | ✅ | ✅ | OK |
| รายละเอียด (`paydetail` — recipient info) | ✅ | ❓ check | likely OK |
| วิธีการชำระ (Alipay/Wechat/Union/USDT) | ✅ | ✅ | OK (PAYTYPE_LABEL chip) |
| ยอดรวม (THB) | ✅ | ✅ | OK |
| สถานะ chip | ✅ | ✅ | OK |
| อัปเดต column (paydateadmin + adminid) | ✅ | ✅ | OK |
| Date range filter `?date=YYYY-MM-DD+-+YYYY-MM-DD` | ✅ | ❌ MISSING | Wave 13 — date-range search bar |
| Top tabs ทั้งหมด/รอดำเนินการ | ✅ | ✅ (4 tabs · richer than legacy's 2) | Pacred polished |
| ดู / แก้ไข button | ✅ | ✅ | → /yuan-payments/[id] |
| Slip thumbnail in list | ❓ (need to grep) | ✅ | Pacred polished |

**Recommended Wave 13 work:**
- Add date-range search bar (start date + end date inputs · push to `?date=...`)
- Format ID as "ออเดอร์ #1460" (match legacy convention for muscle memory)

---

## Summary table — recommended priority

| Page | Gap severity | Wave 13 estimate |
|---|---|---|
| `/admin/service-orders` | 🔴 BIG (8-col layout missing · thumbnail · print buttons) | 2-3 hours · same shape as forwarders Wave 11 |
| `/admin/cnt-hs` (list) | 🟡 medium (top tabs · slip thumbnail · "คัดลอก" action) | 1-2 hours |
| `/admin/wallet` sub-pages | 🟡 medium (cash-back history + balances overview missing) | 1-2 hours |
| `/admin/customers/[id]` | 🟢 small (9-tab parity check + maybe add quick wallet-add action) | 1 hour |
| `/admin/yuan-payments` | 🟢 small (date range filter + ID format) | 30 min |

**Total ~6-8 hours of Wave 13 fidelity work.** Can be split across 3-4 agents in one batch (each agent owns one page).

---

## Cross-reference

- Wave 11 forwarders fidelity port → blueprint for the service-orders rewrite
- Wave 11.1 design-philosophy doc — the rule that triggered this audit
- AGENTS.md §0a — agent-behaviour rule to compare with legacy proactively
- `docs/audit/page-inventory-2026-05-21-night.md` — broader orphan/dead-link catalogue
