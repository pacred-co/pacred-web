# Admin dashboard tab-strip → legacy PCS fidelity (owner 2026-07-04)

> **Owner ask (via ภูม):** make our `/admin` dashboard tab-strip + each tab's list
> content match legacy PCS **exactly** — tab names, order, counts, AND the per-tab
> table columns / displayed data. รูป1 (legacy) vs รูป2 (ours) look different.
>
> **Root cause found:** legacy gives EACH tab its own tailored columns; **we use
> ONE generic 4-col table** (`ลำดับ · วันที่สร้าง · ข้อมูลรายการ · สถานะ`) for every tab,
> cramming all data into the "ข้อมูลรายการ" HTML blob. Fix = per-tab-group column
> layouts (6 distinct layouts).
>
> **Legacy source (§0b · read from disk, not screenshots):**
> `C:\xampp\htdocs\pcscargo\member\pcs-admin\include\pages\home\Cargo\CEO\` — the
> CEO dashboard. `CEO.php` renders the tab-strip; each `<name>.php` renders one
> tab's table. Shared row templates: `include/pages/oop/shopTableAll.php` (shop),
> `include/pages/oop/forwarderTableAll.php` (forwarder).
>
> **Our file:** `app/[locale]/(admin)/admin/page.tsx` (~1600 lines · money-dashboard).

## Tab-strip — legacy order + count var + our current state (CEO.php:300-343)

| # | Legacy page= | Legacy label | Legacy count var | OUR label | OUR filter | Diff / fix |
|---|---|---|---|---|---|---|
| 1 | usersActive | ลูกค้าที่ยังไม่ได้ใช้งาน | `$countUserNotActive` | ลูกค้าที่ยังไม่ได้ใช้งาน | list_unused_customers RPC | label ✓ · legacy = `userActive=''` LIMIT 20 |
| 2 | topup *(DEFAULT)* | เติมเงิน | `$countDeposit` | **ชำระเงิน** | wallet_hs type1 amount>0 | 🚩 renamed (owner: top-up→ชำระเงิน + merged bill-slips) — KEEP ชำระเงิน |
| 3 | payShopPCS | เบิกเงินค่าสินค้า | `$countShopPay1` | เบิกเงินค่าสินค้า **(Phase C)** | **sales_payouts** (empty stub) | 🔴 WRONG TABLE — legacy = `tb_shop_pay_h WHERE status=1`; repoint + drop "(Phase C)" |
| 4 | withdrawUser | ถอนเงิน | `$countWithdraw` | ถอนเงิน | wallet_hs type3 amount<0 | ✓ (legacy `type=3 status=1`) |
| 5 | shop1 | สั่งซื้อรอดำเนินการ | `$countShops1` | สั่งซื้อรอดำเนินการ | hstatus=1 | ✓ |
| 6 | shop2 | รอชำระเงินสินค้า | `$countShops2` | รอชำระเงินสินค้า | hstatus=2 | ✓ |
| — | *(none)* | — | — | **สั่งสินค้า (ชำระแล้ว)** | hstatus=3 → link | 🚩 Pacred-added (not in legacy strip) — KEEP (real workflow) or hide? |
| 7 | shop4 | รอร้านจีนจัดส่ง | `$countShops4` | รอร้านจีนจัดส่ง | hstatus=4 | ✓ |
| 8 | forwarder1 | รอเข้าโกดังจีน | `$countForwarder1` | รอเข้าโกดังจีน | fstatus=1 | ✓ |
| 9 | forwarder5 | รอชำระเงินนำเข้า | `$countForwarder5` | รอชำระเงินนำเข้า | fstatus=5 | ✓ |
| 10 | forwarderC | เครดิตค้างนำเข้า | `$fCreditCount` | เครดิตค้างนำเข้า | fcredit=1 | ✓ |
| 11 | forwarder6 | เตรียมส่ง | `$countForwarder6` | เตรียมส่ง | **fstatus=4** ❌ | 🔴 legacy = `fStatus=6 AND (fdiStatus<>'' OR NULL)` (fstatus=6 NOT with driver) |
| 12 | forwarder62 | กำลังจัดส่ง | `$status_driver_item` | กำลังจัดส่ง | fstatus=6 | 🔴 legacy = `fStatus=6 AND fdiStatus=''` (fstatus=6 WITH open driver-item) |
| 13 | payment | ฝากโอนรอดำเนินการ | `$countPayment1` | ฝากโอนรอดำเนินการ | paystatus=1 | ✓ |
| 14 | *(link)* report-cnt.php | รายการตู้ | `$countFALL` | รายการตู้ (link) | → report-cnt | ✓ |

**Stat cards above strip (both have · minor):** ยอดฝากสั่งซื้อ[month] · ยอดฝากนำเข้า · ยอดฝากโอน · เรทสั่งซื้อ/โอน/Sale/รวม · กระเป๋าสตางค์ · ลูกค้าใช้งานแล้ว · ลูกค้ายังไม่ใช้งาน · ออเดอร์ยกเลิก.

## Per-tab table columns (legacy · from source) — the 6 layouts to build

**L1 · usersActive** (6 col · `tb_users WHERE userActive='' ORDER BY userRegistered DESC LIMIT 20`; header "แสดง 20 ล่าสุด" + link report-user-all):
`วันที่สมัครสมาชิก · ซื้อสินค้าเพื่อ(shopUserName) · รู้จักเราจาก(channelUserName) · รหัสสมาชิก(userID link+VIP+sale badge) · ชื่อ-นามสกุล(avatar+userFullname) · ...โน้ต...(userNote)` — no action btn.

**L2 · topup** (4 col · `tb_wallet_hs type=1 status=1`):
`ลำดับ · วันที่สร้าง · ข้อมูลรายการ(userID link+fullname · "สลิป:" popup[Lock] · "ยอดเงิน:" number) · สถานะ(statusWalletShopBadge + "แก้ไขข้อมูล" → wallet/deposit/ID)`.

**L2b · withdrawUser** (7 col · `tb_wallet_hs type=3 status=1`):
`ลำดับ · วันที่ทำรายการ · ชื่อ-นามสกุล(avatar+userID+fullname) · สถานะรายการ(badge) · สลิป(popup Lock) · ยอดเงินที่ถอน(number) · ตัวเลือก("แก้ไขข้อมูลและดูรายละเอียด" → wallet/withdraw/ID)`.

**L3 · payShopPCS** (6 col · `tb_shop_pay_h WHERE status=1`):
`วันที่ทำรายการ(date+time) · ผู้ทำรายการ(adminIDCreate) · จำนวนเงิน(number) · สลิป(popup Lock) · สถานะทำรายการ(1=รอดำเนินการ warn/2=จ่ายแล้ว success/else=ไม่สำเร็จ danger) · ตัวเลือก("ดำเนินการ" → report-shops-profit-pay-history.php?id=ID)`.

**L4 · shop1/shop2/shop4** (8 col · `tb_header_order WHERE hStatus=1/2/4` · shopTableAll.php):
`วันที่สร้าง(date+time) · รหัสสมาชิก(userID link+VIP+sale) · เลขที่ออเดอร์(hNo link shops/detail + IP/promo/ship badges) · ข้อมูลสินค้า(cover thumb 60px popup + hTitle + "และอีก N รายการ" + note badges) · ราคารวม(บาท)(((hTotalPriceCHN+hShippingCHN)*hRate)+hShippingService) · สถานะ(statusOrderBadgeAll: 1รอดำเนินการ warn/2รอชำระเงิน danger/3สั่งสินค้า info/4รอร้านจีนจัดส่ง primary/5สำเร็จ success/6ยกเลิก danger + shop-N.png) · อัปเดต(hDate[N] + "ผ่านมา" + adminIDUpdate) · ตัวเลือก(ดูรายละเอียด green→shops/detail + อัปเดตรายการ yellow→shops/update [dept-gated])`.
shop2 extra: "กรุณาชำระเงินก่อน" + `hDatePayment` deadline (red). shop1 total `$totalPriceAll`; shop4 no total.

**L5 · forwarder1/5/C/6/62** (9 col · `tb_forwarder WHERE fStatus=1 / =5 / fCredit=1 / =6-noDriver / =6-withDriver` · forwarderTableAll.php):
`วันที่สร้าง(date+time + "พิมพ์แล้ว"/"ขึ้นรถแล้ว"/"ลงรถ" badges) · รหัสลูกค้า(userID+VIP+sale+note block) · รายละเอียด(fCover thumb 90px default-fallback + "เลขที่รายการ #ID" + fDetail + "ฝากนำเข้า" badge + "จะมาถึงไทยประมาณ" ETA) · ยอดค้างชำระ(calPriceForwarderMain ฿ + nameTransportType + fWeight Kg/fVolume CBM + adminIDKey) · เลขพัสดุ(จีน)(fTrackingCHN + "เลขตู้:" fCabinetNumber link + "ตู้วันที่" + "ประเภท:" nameProductsType + "location:" fPallet + fAmount กล่อง) · เลขพัสดุ(ไทย)(nameShipBy + fTrackingTH + fullAddress) · สถานะ(statusForwarderAll2 badge [เตรียมส่ง primary / กำลังจัดส่ง info2 + "ส่ง:" fdAdminID] + forwarder-N.png) · อัปเดต(fDateStatus[N] + "ผ่านมา" + adminIDUpdate) · ตัวเลือก(ลบรายการ danger[fStatus=1 & no refOrder & priv dept] + ดูรายละเอียด→forwarder/detail + อัปเดตรายการ yellow→forwarder/update[hide fStatus 1/7])`.
forwarder5 + forwarderC show page-level `$totalPriceAll` sum; forwarder1/6/62 no total.

**L6 · payment** (9 col · `tb_payment WHERE payStatus=1`):
`วันที่สร้าง(payDate date+time) · เลขที่ออเดอร์(p.ID) · ชื่อ-นามสกุล(avatar 35px + userID link + fullname + VIP) · รายละเอียด(payDetail 120-char trunc) · วิธีการชำระ(payType: 1จ่ายผ่านเว็บไซต์จีน primary/2โอนเข้าบัญชี Alipay ร้านค้าจีน info/อื่นๆ dark) · ยอดรวม(บาท)(-payTHB bold RED negative) · สถานะ(payStatus: 1รอดำเนินการ warn) · อัปเดต(p.adminID) · ตัวเลือก("แก้ไขข้อมูลและดูรายละเอียด" → payment/update/ID)`.

## Our current state (page.tsx)
- `RowShape` (L553): `id, created_at, member_code, customer_name, amount, detail(HTML), link, status, slipUrl?`.
- `getRowsForTab` (per-tab fetch): each tab collapses to that generic shape (`detail` = HTML blob).
- `ActiveTabTable` (L1033): ONE `<table>` = 4 cols (ลำดับ/วันที่สร้าง/ข้อมูลรายการ/สถานะ), status hardcoded "รอดำเนินการ" + `TAB_NEXT` hint + "ดู/แก้ไข" btn. Same for every tab.
- Counts computed in a separate block (~L195-260) → tab-strip badges.

## Build plan (safe gated increments · money-dashboard · ห้ามบัค/งานหาย)
1. **Shop group (L4)** — ShopTable 8-col + enrich shop fetch (orderNo/status/update). *(first — contained)*
2. **Forwarder group (L5)** — ForwarderTable 9-col + enrich forwarder fetch (tracking/cabinet/address/status) + fix forwarder6 fstatus 4→6 + forwarder62 driver-item partition + counts.
3. **Payment group (L6)** — PaymentTable 9-col (payMethod/negative amount).
4. **Wallet group (L2/L2b)** — topup 4-col (≈current) + withdraw 7-col.
5. **payShop (L3)** — repoint sales_payouts → `tb_shop_pay_h` + 6-col + drop "(Phase C)".
6. **usersActive (L1)** — 6-col (ซื้อเพื่อ/รู้จักจาก/โน้ต) + "แสดง 20 ล่าสุด" note.
7. **Counts** — align each badge count query to legacy (esp. forwarder6/62).
Each increment: gate tsc/lint 0 + browser-verify the tab renders (dev + Chrome) + push Poom-pacred.

## 🚩 Owner decisions (defaults chosen to keep the run going · confirm if wrong)
- **เติมเงิน→ชำระเงิน:** KEEP "ชำระเงิน" (owner cancelled top-up + merged bill-slips). Legacy = เติมเงิน.
- **"สั่งสินค้า(ชำระแล้ว)" tab:** KEEP (real hstatus=3 workflow; not in legacy strip).
- **forwarder6 fstatus 4→6:** FIX to legacy (clear mismatch · our axis fstatus6=เตรียมส่ง too).
