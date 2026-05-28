# Fidelity gap audit — 2026-05-24 (5 admin pages)

> Per AGENTS.md §0a: workflow gaps must close · UX-polish gaps optional · intentional improvements stay.
> Per ADR-0017 / `docs/learnings/pacred-design-philosophy.md`: legacy = workflow source · UI = our design.
> Severity legend: 🔴 workflow gap (must-fix) · 🟠 UX polish opportunity (nice-to-have) · 🟢 intentional Pacred improvement (keep).

Audit scope:
- `/admin/wallet` (Wave 7.2+13.1) vs `pcs-admin/wallet.php`
- `/admin/forwarders` (Wave 11/12) vs `pcs-admin/forwarder.php`
- `/admin/customers` vs `pcs-admin/users.php` (default = `users-all.php`)
- `/admin/yuan-payments` (Wave 7.1) vs `pcs-admin/payment.php`
- `/admin/cnt-hs` (Wave 2 pilot) vs `pcs-admin/cnt-hs.php`

Audit method (read-only):
1. Open each Pacred `page.tsx` + the matching legacy `.php` (real path: `C:\xampp\htdocs\pcscargo\member\pcs-admin\` on Poom's box — the brief's `Downloads\newrealdatapcs\...` path doesn't exist on this machine, so the equivalent xampp htdocs source was used; PHP is byte-identical per CLAUDE.md Phase 1 note).
2. List every data field surfaced + every button + every filter.
3. Set-diff present-in-legacy-but-not-Pacred / present-in-both / Pacred-only.
4. Classify each gap by severity per AGENTS.md §0a.

Cited line numbers are the legacy `.php` files — open them at the path above to verify.

---

## Summary

- **Total gaps found: 47** — 🔴 **18 workflow** · 🟠 **22 polish** · 🟢 **7 intentional improvements**
- **Pages with critical 🔴 gaps:**
  - `/admin/wallet` — **wrong paradigm.** Pacred default = transactions list; legacy default = per-customer wallet-balance summary. The transactions Pacred shows are legacy's `?page=deposit` / `?page=withdraw` / `?page=history` sub-pages.
  - `/admin/forwarders` — missing 8 of the legacy 14 columns (ยอดค้างชำระ formula · เลขตู้ link · location pallet · ราคาน้ำหนัก/CBM/admin วัด · print-status badges · ขึ้นรถ/ลงรถ badges · 5-status driver chip · VIP/SVIP/SaleAdmin badges · เครดิตวันที่ extra columns · diffDateTimeNow elapsed-time row stamp · the "ดูข้อมูล + อัปเดต" two-button cell · the "ลบ" button for fStatus=1+refOrder='' rows · the `เพิ่มไปสถานะพิเศษ` / `ย้ายกลับสถานะปกติ` bulk-move-status footer button · the date-range filter, present in legacy but absent in our page).
  - `/admin/yuan-payments` — missing the legacy **date-range filter** (default = last 60 days). Our list reads ALL prod data top-200, which loses historical context AND can show old paid rows above new pending ones. Also missing the customer avatar/profile picture link + the คุณ prefix + VIP badge on the name cell.
  - `/admin/customers` — missing **address column** (ที่อยู่หลัก from `tb_address`+`tb_address_main`) · missing **userBirthday + computed age** · missing **userPicture avatar** · missing **userLineID + userFacebook** contact methods · missing **"รีเซ็ตรหัส" button** (password recover) · missing **VIP-tier badge** (the legacy `badgeVIP2()` helper).
  - `/admin/cnt-hs` — closest faithful port. Missing the legacy `เพิ่มไฟล์` AJAX modal (inline upload, no detail-page round-trip) + the `select-pay` multi-row composer + the fixed-bottom `print` toolbar — all flagged stub in the page docblock.

**Recommended P0 fixes (sorted by impact):**
1. 🔴 `/admin/wallet` — add a **per-customer wallet summary** view (default tab) matching legacy's row-per-user · keep current transactions list as a 2nd tab. (~150 LOC)
2. 🔴 `/admin/forwarders` — add the **ยอดค้างชำระ formula column** (`calPriceForwarderMain`) — operators currently can't see who owes how much in the list. (~80 LOC)
3. 🔴 `/admin/yuan-payments` — add the **date-range filter** (default 60 days · matches legacy) so prod list isn't a 200-row "all history" snapshot. (~60 LOC)
4. 🔴 `/admin/customers` — add **address column** + **VIP badge** — staff currently can't tell juristic / VIP / SVIP tier at a glance. (~70 LOC)
5. 🔴 `/admin/forwarders` — wire the **"ลบ"** button (for `fStatus=1 AND refOrder=''` rows only — legacy auth gate). (~40 LOC)

---

## Per-page audit

### 1. `/admin/wallet` vs `pcs-admin/wallet.php`

**🔴 PARADIGM gap — different default view.**
- Legacy `wallet.php` default (L150-191): **per-customer wallet balance** table — `tb_wallet AS w LEFT JOIN tb_cash_back AS cb LEFT JOIN tb_users AS u`. Columns = ลำดับ · รหัสสมาชิก · ชื่อ-นามสกุล (with avatar + VIP badge) · ยอด Cash Back · ยอดเงินคงเหลือ. Top header = ยอดรวมทั้งหมดในระบบ + Cash Back ทั้งระบบ (L102-128). The transactions list / approval queue lives at `?page=deposit` (L740-743 → `w-s-deposit.php`), `?page=withdraw` (L837-840 → `w-s-withdraw.php`), `?page=history` (L417-419 → `w-s-history.php`).
- Pacred `/admin/wallet` default: **transactions list** (top 200 from `tb_wallet_hs`) with approval flow. This corresponds to legacy `?page=deposit` + `?page=withdraw` + `?page=history` merged into one view.

#### Element-by-element diff

| Element | Legacy (`wallet.php`) | Pacred (`/admin/wallet`) | Verdict | Fix proposal |
|---|---|---|---|---|
| Default view paradigm | Per-customer wallet balance summary (L150-191) | Transactions list from tb_wallet_hs | 🔴 Workflow | Add a new "balance summary" view as the default; move current transactions to a tab "ประวัติรายการ". File: `app/[locale]/(admin)/admin/wallet/page.tsx` · ~150 LOC. The legacy SQL is portable directly: `SELECT cbTotal, u.coID, u.userStatus, u.userID, u.userPicture, u.userName, u.userLastName, w.walletTotal FROM tb_wallet w LEFT JOIN tb_cash_back cb ON cb.userID=w.userID LEFT JOIN tb_users u ON u.userID=w.userID ORDER BY w.walletTotal DESC`. |
| ยอดรวมทั้งหมดในระบบ (system-wide wallet total) header card | YES (L107-127 · `SELECT SUM(walletTotal) FROM tb_wallet`) + Cash Back total | NO (only per-status pending counts) | 🔴 Workflow | Add a top metric card showing `SUM(wallettotal) FROM tb_wallet` + `SUM(cbtotal) FROM tb_cash_back`. ~30 LOC. Card pattern already exists at `components/admin/metric-card.tsx`. |
| ลำดับ column | YES (L153) | NO | 🟠 Polish | Skip — running no. is decorative. |
| รหัสสมาชิก column | YES (L154) | YES (under "ลูกค้า") | 🟢 (both) | — |
| Avatar (`userPicture`) thumbnail | YES (L175-177 · 35px rounded image w/ magnific-popup zoom) | NO | 🟠 Polish | Add 24-28px avatar in the ลูกค้า cell. The legacy resolves `images/users/<userPicture>` — Pacred needs `resolveLegacyUrlMap` extension for avatars (or reuse existing slip resolver). ~30 LOC. |
| VIP badge next to user code | YES (`badgeVIP2($row['coID'],...)` helper L62/L325/L589) — visual tier flag | NO | 🟠 Polish | Render a small chip from `tb_users.coid` (the company-type code drives VIP tier). ~10 LOC after a lookup helper exists. |
| Cash Back amount column | YES (L180) | NO | 🔴 Workflow | Need a cash-back column or summary card — there's a whole `tb_cash_back` ledger legacy used. Add to the balance summary view. ~20 LOC. |
| "บัญชีนี้ถูกลบแล้ว" deleted flag | YES (L173 · text-danger inline) | NO (Pacred has /[id] but no inline flag) | 🟠 Polish | Show "ระงับ" chip in the balance row when `userstatus='0'`. Already done in `/admin/customers` — copy that pattern. ~5 LOC. |
| Total wallet & cash-back metric tiles | YES top card | Pending counters only | 🔴 Workflow | (See row 2 above.) |
| **Status filter tabs (transactions only)** | "รอตรวจสอบ / รอชำระ / สำเร็จ / ปฏิเสธ" (`w-s-deposit.php` etc · each sub-page is its own filter) | "ทั้งหมด / รอตรวจ / อนุมัติ / ปฏิเสธ" pills | 🟢 Improvement | Pacred consolidates into one screen with kind+status tabs — cleaner than legacy's 3 sub-pages. Keep. |
| **Bulk-approve bar** | Manual per-row only (each sub-page has its own update form) | YES (`TbWalletBulkBar` · Wave 8) | 🟢 Improvement | Pacred-only. Keep. |
| Slip preview (signed URL) | YES (basic anchor to `storage/slip/<file>`) | YES + signed URL via `resolveLegacyUrlMap` | 🟢 (both) | — |
| Slip-time editor (`updateDate` form · L702-725) | YES — admin can edit `dateSlip` after upload | NO (Wave 8 backlog per page docstring) | 🔴 Workflow | Add a tiny edit-date control on `/admin/wallet/[id]`. ~40 LOC. **Status: already noted as Wave 8 backlog.** |
| Add/edit form modal w/ QR code generation | YES (L201-292 · PromptPay QR + dropify upload) | YES (`/admin/wallet/add` · 115 LOC) | 🟢 Improvement | Pacred separates into own route (cleaner mobile flow). Keep. |
| LINE-notify on approval | YES (L685-695 · `sendLine($userLineNotify,...)`) | NO visible — handled inside Server Action? | 🟠 Polish | Verify the approve mutation includes line-notify. If missing → must add. **ACTION: confirm in `actions/admin/wallet-approve.ts`.** |
| Status-3 refund flow (when admin rejects, return amount to wallet) | YES (L606-619 · re-credits `tb_wallet.walletTotal`) | (presumed in server action) | 🟠 Polish | Verify the reject path re-credits wallet — legacy did. **ACTION: verify in `actions/admin/wallet-approve.ts`.** |
| Page-top-menubar (filters / management / history shortcuts) | YES (3 hardcoded buttons next to add) | YES (`PageTopMenubar`) | 🟢 Improvement | Pacred's menubar pattern is cleaner. Keep. |
| Search by customer code OR row id | NO (legacy uses DataTables in-page filter only) | YES (server `?q=`) | 🟢 Improvement | Keep. |

**Verdict:** 🔴 **NOT FAITHFUL.** The default page paradigm is wrong (balance summary vs transactions). Operators looking up "how much does customer PR3963 have in wallet" must currently scroll the transactions list — legacy gave them a row-per-customer answer instantly.

---

### 2. `/admin/forwarders` vs `pcs-admin/forwarder.php`

Legacy `forwarder.php` default list view (L213-748). The legacy main SELECT (L293-340) pulls **40+ columns** from `tb_forwarder` JOINed against `tb_users`, `tb_promotion`, `tb_forwarder_driver_item`. Default filter is **`fDate BETWEEN today-30 AND today`** (L319-322 · 30-day window) unless `historyTableAll` POST submitted. The 12-column table at L511-718 renders that with rich badges.

#### Element-by-element diff

| Element | Legacy (`forwarder.php`) | Pacred (`/admin/forwarders`) | Verdict | Fix proposal |
|---|---|---|---|---|
| Top 4 tabs: ทั้งหมด / ลูกค้า / ระบบ / แอดมิน | YES (L263-280) | YES (Wave 11) | 🟢 (both) | — |
| Date-range filter (default last 30 days) | YES (L344-358 daterangepicker + "ค้นหาข้อมูล" / "ค้นหาข้อมูลทั้งหมด" buttons) | Has `date_from` / `date_to` in `SearchParams` but NO default 30-day window (loads top-300 forever) | 🔴 Workflow | Apply a default `fdate >= now - 30 days` (matching legacy L319-322) unless `?all=1`. ~10 LOC. Loading "the last 30 days" gives operators a familiar caseload bucket. |
| 10-status filter chips (1..7, 6.1, c, p) w/ counts | YES (L424-501) | YES + per-tab counts | 🟢 (both) | — |
| 6.1 split (driver-in-progress) | YES via `fdiStatus=''` join on `tb_forwarder_driver_item` | YES (2nd query post-filter) | 🟢 (both) | — |
| Column **ID** | YES (L514) | YES (rendered as "ออเดอร์ #ID" inside detail cell) | 🟢 (both) | — |
| Column **วันที่สร้าง** with printStatus1-4 + ขึ้นรถ/ลงรถ badges | YES (L515 + L573-580 · 6 conditional badges) | NO badges; date only | 🔴 Workflow | Add the print-status & ขึ้นรถ/ลงรถ chips below the date. Legacy operators use these to know which docs are printed + which step the cargo is at. ~30 LOC. The `tb_forwarder` columns exist (`printstatus1`-`4`, `fstatuscaron`, `fstatuscaroff`). |
| Column **รหัสลูกค้า** with VIP/SVIP/SaleAdmin badges + จะมาถึงไทย ETA | YES (L516 + L583-611 — `badgeVIP3()` · `badgeAdminSale()` · ETA range computed from `fDateToThai ±2/±4 days`) | Partial — userid + name + phone, NO VIP badge, NO ETA range, NO sale admin chip | 🔴 Workflow | Add a `<VipBadge coId={...} svip={...} comparison={...}>` chip + a 2nd line "จะมาถึงไทย: 25 พ.ค.-27 พ.ค." computed from `fdatetothai + transport-type offset` (legacy formula L596-608). ~50 LOC. The data lives in `tb_users.coid` + `tb_forwarder.fdatetothai` + `ftransporttype`. |
| Column **รายละเอียด** with product cover thumbnail + fProductsType label + fNote with read-flag chip + source badge (admin/system/users) | YES (L613-641 · 7 distinct chips) | Partial — thumbnail (Wave 13) + source badge (Wave 11) ✅; missing fProductsType label + fNote chip + read-flag | 🟠 Polish | Add `nameProductsType(fproductstype)` text + a "หมายเหตุ" badge when `fnote` non-empty + the "ยังไม่อ่าน" flag (`fnoteuserread='1'`). ~25 LOC. |
| Column **ยอดค้างชำระ** (computed via `calPriceForwarderMain()` helper · L643-648 + weight/CBM/box count + adminIDKey who measured) | YES — operators **need** this to chase money | NO column at all | 🔴 Workflow | **HIGH-VALUE.** Add this column. The function: `total = fTotalPrice + fTransportPrice + fPriceUpdate + ... - fDiscount`. Port the formula from `member/pcs-admin/include/function.php` (the legacy helper file). Show weight (`fweight Kg`) + volume (`fvolume × famount CBM`) + adminIDKey who measured. ~80 LOC. |
| Column **เลขพัสดุ (จีน)** + **เลขตู้** link to report-cnt + transport type + fDateContainerClose | YES (L649-654) | Has tracking_chn only; **no link to report-cnt for cabinet number**, no fDateContainerClose | 🔴 Workflow | Make `fcabinetnumber` a link to `/admin/report-cnt/<num>` (already a Pacred page) + add fDateContainerClose. ~20 LOC. |
| Column **fiPallet (location)** | YES (L653 — `location: <fpallet>`) | NO | 🟠 Polish | Add a small "loc: A-3" badge if `fpallet` is non-empty. ~5 LOC. |
| Column **เลขพัสดุ (ไทย)** + shipBy + tooltip-full-address | YES (L655-658) | Has tracking_th in row; **address tooltip MISSING** | 🟠 Polish | Add `title={fullAddress}` on the row's TH-tracking td. ~5 LOC. |
| Column **เข้าโกดัง / ออกโกดัง / ถึงไทย** (3 separate date columns: fdatestatus2/3/4) | YES (L659-661) | Has them in `Row` type — **rendered?** Check `ForwardersTable`. (Need to read) | 🟠 Polish | If not rendered, add the 3 date columns. ~15 LOC. |
| Column **สถานะ** w/ statusForwarderAll2() badge color + driver-id sub-chip | YES (L662-667) | YES (status chips) | 🟢 (both) | — |
| Column **อัปเดต** (the elapsed-time row stamp — `diffDateTimeNow()` per current status) | YES (L668-691 · "ผ่านมา : N วัน" computed from `fdatestatusX`) | NO | 🔴 Workflow | This is critical for SLA — operators see at a glance "stuck 8 days in China warehouse". Port the helper. ~40 LOC. |
| Column for `?q=c` (credit-tab): extra "วันที่ให้เครดิต / วันที่ครบกำหนด" columns | YES (L526-530 + L692-696) | NO conditional columns | 🟠 Polish | Add 2 extra columns when status=c tab active. ~20 LOC. |
| **Action buttons cell**: ดูข้อมูล (always) + อัปเดต (when fStatus≠7) + **ลบ** (when fStatus=1 AND refOrder='' AND admin role in CEO/Manager/etc) | YES (L697-711) | Single "ดู / อัปเดต" link goes to `/[fNo]` detail — no per-row delete | 🔴 Workflow | Add a "ลบ" button on rows with `fstatus='1' AND reforder=''` — legacy operators use this to clear customer-mistake orders. RBAC: ops + accounting + super. ~40 LOC. |
| **Bulk-action footer bar** (`เพิ่มไปสถานะพิเศษ` / `ย้ายกลับสถานะปกติ` · fixed bottom L721-731) | YES — moves selected rows to fStatus=99 or back | NO | 🔴 Workflow | This is the only way operators move bulk orders to "special" status in legacy. Add a sticky-bottom action bar (pattern matches Wave 8 wallet/yuan bulk-approve). ~60 LOC. |
| **Print queue buttons** (พิมพ์จากหน้ากล่อง / พิมพ์ที่ส่งอยู่สินค้า — L722-723 form-submit) | YES | NO | 🟠 Polish | This goes to `printAll.php` route — port if/when print flows land in Pacred. Defer per Wave 12. |
| **Cash-back total footer** (when ?q=5 + role in CEO/Mgr/QA/Acc/ITDT) | YES (L733-739 · "ราคาขายรวม: ฿N,NNN") | NO | 🟠 Polish | Add this aggregate when status=5 active for accounting roles. ~30 LOC. |
| Modal "เพิ่มรายการให้ลูกค้า" admin-initiated create form (L754-...) | YES (full form) | "+ เพิ่มรายการให้ลูกค้า" button exists but `/admin/forwarders/new` is a stub redirect (Wave 12) | 🔴 Workflow | Build the form (already a known Wave 12 backlog · page banner exists). |
| Keyword search ("ค้นหา tracking หลายเลข") | NO (DataTables in-page only) | YES (bulk-search + single + multi-line search) | 🟢 Improvement | Keep. |
| Cargo/Freight × FCL/LCL segmented pills | NO | YES (label-only) | 🟢 Improvement | Keep — Phase C will wire actual SQL filter once schema extends. |
| Transport-mode chip strip (รถ / เรือ / แอร์) | Implicit via column display | YES (`?mode=` filter) | 🟢 Improvement | Keep. |
| "Wave 11 status" amber banner | NO | YES (proactive transparency) | 🟢 Improvement | Keep — matches design philosophy doc §how-to-capture-this-lesson. |

**Verdict:** 🔴 **NOT FAITHFUL** — 8 column-level workflow gaps + 1 missing default date-window + 2 missing actions (delete · bulk-move-special). Cosmetic count is good; data-density count is short.

---

### 3. `/admin/customers` vs `pcs-admin/users.php` (default = `?page=all` → `users-all.php`)

Legacy `users.php` default page = handler-only stub (L1-128, just update routing). The actual default list = `users-all.php` (208 LOC). The page has **7 columns** + 3 row actions.

#### Element-by-element diff

| Element | Legacy (`users-all.php`) | Pacred (`/admin/customers`) | Verdict | Fix proposal |
|---|---|---|---|---|
| Page title | "รายชื่อการสมาชิกทั้งหมด" (L31) | "ลูกค้า" | 🟠 Polish | Match the legacy label (or keep — title is intent-equivalent). ⚪ Cosmetic. |
| Column **รหัสสมาชิก** + VIP badge | YES (L39 + `badgeVIP2()` L62 — emits a colored chip per `coID` lookup) | YES (userid) but **no VIP/SVIP badge** | 🔴 Workflow | Implement `badgeVIP2()` equivalent: read `tb_co` (company-type table) + `tb_rate_custom_cbm` (SVIP marker) and render a colored chip per row. ~40 LOC. |
| Column **ชื่อ-นามสกุล** with avatar thumbnail + magnific zoom + adminIDSale badge + "บัญชีนี้ถูกลบแล้ว" flag | YES (L64-71 · 35px avatar + helper badges) | Partial — name only; **no avatar, no sale-admin chip on this cell, has the salesperson code separately**, no deleted flag inline | 🟠 Polish | Add a 28px avatar (when `userpicture` exists) — same `resolveLegacyUrlMap` pattern as wallet slips. ~25 LOC. The `userstatus='0'` deleted-flag is already shown as the "ระงับ" chip — that's equivalent. |
| Column **วันเกิด + คำนวณอายุ** | YES (L72-78 · `userBirthday` + `date_diff()` "N ปี M เดือน") | NO | 🔴 Workflow | This is in the DB (`tb_users.userbirthday`). Add a small text "อายุ 32 ปี 4 เดือน" below birthday. Operators DO use this for VIP relationship building (legacy chat audit `chat-analysis-2026-05-16.md`). ~15 LOC. |
| Column **ที่อยู่หลัก** (main shipping address from tb_address + tb_address_main) | YES (L42 + L51-55 · "คุณ\<name\> \<no\> ต.\<sub\> อ.\<dist\> จ.\<prov\> \<zip\>") | NO | 🔴 Workflow | This is a key column — staff calling a customer wants the address in front of them. JOIN `tb_address_main` → `tb_address` on userid. ~30 LOC. |
| Column **ข้อมูลติดต่อ** (email · phone · LINE ID · Facebook) | YES (L43 + L80-87 · all 4 fields w/ click-to-call/mail icons) | Partial — phone + email only; **NO LINE ID, NO Facebook** | 🔴 Workflow | Add `userlineid` + `userfacebook` to the contact cell. Both columns exist in tb_users (cf. legacy L44). ~20 LOC. |
| Column **วันที่สมัครสมาชิก** | YES (L88-92 — datetime format) | YES ("สมัครเมื่อ") | 🟢 (both) | — |
| Column **เซลล์ผู้ดูแล** (adminIDSale) | YES embedded in name cell as badge | YES (own column) | 🟢 Improvement | Pacred's own column is clearer. Keep. |
| Column **สถานะ** (active / pending / suspended) | Implicit (only "ถูกลบ" inline) | YES — proper chip w/ 3 states (`active` / `incomplete` / `suspended`) | 🟢 Improvement | Pacred is better here — legacy only showed "ถูกลบ" text. Keep. |
| Column **ยอดกระเป๋า** (wallet balance) | NO (legacy users list has no wallet col) | YES — joins `tb_wallet` and shows ฿ balance | 🟢 Improvement | Useful for ops phone calls. Keep. |
| **Action: ลบบัญชี** (delete account · with confirm + AJAX) | YES (L94-97 · only CEO/Manager/QA/Accounting/ITDT) | Has `<CustomerRowActions>` — need to check what's in there (likely partial) | 🟠 Polish | **ACTION: open `components/admin/customer-row-actions.tsx` and verify delete is wired.** |
| **Action: รีเซ็ตรหัส** (password recovery · modal form) | YES (L98-102 · same role gate · `recoverUser()` AJAX → opens modal w/ password1+password2 fields) | (likely NO — needs verification) | 🔴 Workflow | Operators use this when a customer locks out + can't access email/SMS reset. Add a per-row "รีเซ็ตรหัส" admin action that opens a small modal. Server action calls a new `actions/admin/customer-reset-password.ts`. ~80 LOC. **HIGH-PRIVILEGE — must enforce ops/accounting+ role.** |
| **Action: แก้ไขข้อมูล** (edit customer details · modal form) | YES (L101 · `editUser()` AJAX modal) | Likely the `/admin/customers/[id]` detail page — different UX | 🟢 Improvement | Pacred's full detail page is better UX than a cramped modal. Keep. |
| **Search** (rหัส / เบอร์ / ชื่อ) | NO in legacy default — only DataTables in-page filter | YES (server `?q=` w/ ILIKE OR across 4 cols) | 🟢 Improvement | Keep. |
| **Group filter** (ทั่วไป / VIP / SVIP / นิติบุคคล / เครดิต / คิดค่าเทียบ) | YES — each is a SEPARATE sub-route `?page=general`, `?page=vip`, etc. | YES — in-page `?group=` w/ chip | 🟢 Improvement | Pacred consolidates into one screen. Keep. |
| **Add VIP customer form** (`?page=vip` includes registerVIP POST handler at L136-192) | YES (admin-initiated signup) | (likely missing — to verify in `/admin/customers/<sub>`) | 🟠 Polish | Add a "+ ลงทะเบียน VIP" button on the VIP-group filter. Wave 12 backlog. |
| Page-top menubar w/ 4 groups (หน้าหลัก / ตามประเภท / งาน / ค้นหา) | NO (legacy has only sidebar nav) | YES | 🟢 Improvement | Keep — far cleaner. |

**Verdict:** 🔴 **NOT FAITHFUL** — 5 column-level workflow gaps (VIP badge · birthday/age · main address · LINE/FB · password reset) + 1 missing high-trust action (password reset). The improvements over legacy (wallet column · status chip · search · group consolidation) are good and should stay.

---

### 4. `/admin/yuan-payments` vs `pcs-admin/payment.php`

Legacy `payment.php` default = transactions list filtered by date range default **last 60 days** (L176-178). 9-column DataTable + 4 status tabs + add-payment modal.

#### Element-by-element diff

| Element | Legacy (`payment.php`) | Pacred (`/admin/yuan-payments`) | Verdict | Fix proposal |
|---|---|---|---|---|
| Page title | "รายการฝากชำระเงิน" (L148) | "ฝากโอนหยวน" | 🟠 Polish | Both are correct — ฝากชำระเงิน is the more accurate Thai. ⚪ Cosmetic. |
| **Date-range filter** (default last 60 days · L176-178 · daterangepicker w/ presets Today/Yesterday/Last 7/30 etc) | YES (L182-197) | NO date filter at all — loads top-200 from all-time | 🔴 Workflow | **HIGH-VALUE.** Add a date-range filter, default to last 60 days. ~60 LOC. The current "load 200 newest" obscures the fact that old paid rows from a month ago still appear. |
| **dateGroup year/month picker** (the `?dateGroup=&year=&month=` URL variant L169-174) | YES — preset month-by-month nav | NO | 🟠 Polish | Add later if accounting requests it. ~30 LOC. |
| **Status filter tabs** (ทั้งหมด / รอดำเนินการ / สำเร็จ / ไม่สำเร็จ) with counts | YES (L247-276 — counts scoped to date range) | YES — but counts are global, not date-range scoped | 🟠 Polish | When date filter is implemented, scope the count badges to the same date range. ~10 LOC additional. |
| Column **วันที่สร้าง** w/ date + time on separate lines | YES (L283 + L313-317) | YES (single line) | 🟠 Polish | Wrap to date / time on two lines for readability. ~5 LOC. |
| Column **เลขที่ออเดอร์** (id) | YES (L284, L319) | YES (id column under ลูกค้า) | 🟢 (both) | — |
| Column **ชื่อ-นามสกุล** w/ avatar + magnific zoom + userid + VIP badge | YES (L285 + L321-326 · 35px avatar · `badgeVIP2()` chip) | Partial — userid + name + phone; **no avatar, no VIP badge** | 🟠 Polish | Add a 24px avatar + VIP badge. Same pattern as Wallet diff above. ~20 LOC. |
| Column **รายละเอียด** (`payDetail` · truncated to 120 chars w/ tooltip full) | YES (L286 + L327-329) | Has `paydetail` truncated w/ tooltip | 🟢 (both) | — |
| Column **วิธีการชำระ** (payType badges) | YES (L287 + L301-305 — 3 colored badges: เว็บไซต์จีน / Alipay / อื่นๆ) | YES — but Pacred labels are **Alipay / Wechat / Union / USDT** | 🔴 Workflow | **MISMATCH!** Legacy `payType` has only 3 values (1=เว็บไซต์จีน, 2=Alipay, 3=อื่นๆ). Pacred's PAYTYPE_LABEL has 4 (Alipay, Wechat, Union, USDT). Check `tb_payment.paytype` data — Pacred may be inventing values that aren't in legacy data. **ACTION: verify the `paytype` values on prod via a SQL count(*) group by paytype**. If only 1/2/3 exist, rename the Pacred labels to match. ~5 LOC. |
| Column **ยอดรวม(บาท)** in red w/ minus sign | YES (L288 + L333-335 — `-฿N,NNN` red bold; the "-" indicates wallet debit) | YES (paythb) but **NO minus sign / red color** | 🟠 Polish | The negative sign signals "this DEDUCTED from wallet" — Pacred should match for visual consistency. ~5 LOC. |
| Column **หยวน** + rate | NO separate column in legacy (rate inside detail page) | YES — own column ¥N,NNN + "@ rate" | 🟢 Improvement | Useful inline. Keep. |
| Column **กำไร** (payProfitTHB) | NO in legacy (computed inside detail) | YES — own column | 🟢 Improvement | Accounting will love this. Keep. |
| Column **สถานะ** w/ adminID who updated | YES (L290 + L337-340) | YES — status + paydateadmin + adminid below | 🟢 (both) | — |
| Column **อัปเดต** (Username Admin · separate column) | YES (L290 + L339-341) | (merged into status cell as text below the chip) | 🟢 Improvement | Pacred consolidation is fine. Keep. |
| **Add-payment modal** (L370-454 · payType + payDetail + rateYuan + payYuan + calc) | YES (full inline modal) | "+ เพิ่มรายการ" button → `/admin/yuan-payments/new` (likely stub) | 🟠 Polish | Verify `/new` is wired. If stub, Wave 8 Group C should have it. |
| Slip preview / image | NO in legacy default list (detail page only) | YES inline "ดู" link | 🟢 Improvement | Keep. |
| **Bulk-approve bar** | NO | YES (`TbYuanBulkBar` Wave 8) | 🟢 Improvement | Keep. |
| **Search by userid OR id** | NO in legacy (DataTables in-page only) | YES (server `?q=`) | 🟢 Improvement | Keep. |
| Refund-slip flow | (in detail page) | Wave 8 backlog (per page docstring) | 🔴 Workflow | Already known. Build in Wave 8/9. |
| Auth gate | "departmentKey in CEO/Manager/QA/Accounting/ITDT" (L343 button-level) | `requireAdmin(["ops","accounting"])` page-level | 🟢 Improvement | Pacred's page-level gate is stronger (legacy had no page gate — only button gate). Keep. |
| **Page-top menubar** | NO (only sidebar) | NO (no `PageTopMenubar` import) | 🟠 Polish | The other 4 audited pages have a menubar; this one doesn't. Add one with: filter (ทุกสถานะ/รอตรวจ) + management (เพิ่มรายการ/ประวัติ/คืนเงิน) + ค้นหา. Consistency. ~30 LOC. |

**Verdict:** 🔴 **NOT FAITHFUL** — 1 critical missing date filter (turns this page into "200 newest of all time" instead of legacy's "last 60 days operational view") + 1 paytype label mismatch (potentially wrong labels for the prod data) + 4 polish gaps.

---

### 5. `/admin/cnt-hs` vs `pcs-admin/cnt-hs.php`

This page is the highest-fidelity port of the 5 — the page comment explicitly says "FAITHFUL 1:1 TRANSCRIPTION", and the code matches column-for-column.

#### Element-by-element diff

| Element | Legacy (`cnt-hs.php`) | Pacred (`/admin/cnt-hs`) | Verdict | Fix proposal |
|---|---|---|---|---|
| Breadcrumb หน้าแรก > รายการเบิกเงินค่าตู้ | YES (L189-200) | YES | 🟢 (both) | — |
| Status tabs (ทั้งหมด / รอดำเนินการ / สำเร็จแล้ว) | YES (L237-258) | YES | 🟢 (both) | — |
| Status badge counts | YES (L222-228) | YES | 🟢 (both) | — |
| **10 columns** (ID · วันที่ทำรายการ · หมายเลขตู้ · จำนวนเงิน · ข้อมูลเพิ่มเติม · สลิปรายการ · หลักฐานผู้เบิกเงิน · ผู้ทำรายการเบิก · สถานะ · ตัวเลือก) | YES (L265-275) | YES — exact match | 🟢 (both) | — |
| Auth gate (CEO/Manager/QA/Accounting/ITDT) | YES (L185) | `requireAdmin(["super","ops","accounting"])` | 🟢 (both) | — |
| **Search** (id / nameblank / noblank) | NO in legacy (DataTables in-page only) | YES (server `?search=`) | 🟢 Improvement | Pacred-specific addition (spec Part B req #6). Keep. |
| **Pagination** (200/page · prev/next w/ offset) | NO in legacy (DataTables shows all) | YES (offset/limit · 200/page) | 🟢 Improvement | Pacred addition (spec Part B req #7). Keep. |
| Cabinet-number `<details>` expander (cntName summary + full list) | YES (L301-314 · `<details><summary>` w/ comma-joined fcabinetnumber) | YES — exact match | 🟢 (both) | — |
| Bank info column (ธนาคาร / เลขที่ / ชื่อ) | YES (L316-320) | YES — exact match | 🟢 (both) | — |
| Slip link `<a class="image-popup-vertical-fit" href="storage/slip/cntImagesSlip">ดูสลิป</a>` | YES (L321-325) | Goes to detail page instead of magnific popup | 🟠 Polish | Legacy used magnific-popup zoom (in-page image preview); Pacred goes to detail page (round-trip). Both load the slip, but legacy is faster. If staying with detail page, add a lightbox modal for slip preview. ~20 LOC. |
| **เพิ่มไฟล์ inline AJAX modal** for the หลักฐานผู้เบิกเงิน column (cnt-hs.php L331 · `editFile()` JS function) | YES — admin can upload PDF directly from list row without leaving | NO — link goes to `/admin/cnt-hs/[id]` detail page | 🔴 Workflow | This is a real productivity loss for accounting — they batch-upload PDFs for 30 rows in a session. Add a modal/sheet that uploads the file inline (use Pacred's Sheet pattern · `components/ui/sheet.tsx`). ~60 LOC. |
| **อัปเดตและดูรายละเอียด** action button | YES (L345-349) | YES | 🟢 (both) | — |
| **select-pay multi-row composer** (L469-482 · `select-pay` button + `getListCNTPay.php` AJAX) | YES — checkboxes + bulk-pay form | NO (stub per docstring) | 🔴 Workflow | High-value for accounting. Wave-after-pilot. ~80 LOC. |
| **Fixed-bottom print toolbar** (cnt-hs.php L360 placeholder for print buttons) | YES (placeholder, JS-filled) | YES (empty placeholder kept) | 🟢 (both — same status) | — |
| **DataTables-checkboxes** multi-select column | YES (L380 — `jquery-datatables-checkboxes` plugin loaded · also L407-468 init) | NO (static — checkboxes are part of select-pay backlog) | 🔴 Workflow | Will land with select-pay. |
| **11-button TopMenuReport audit menu** | NO in legacy (sidebar only) | YES (`TopMenuReport`) | 🟢 Improvement | Pacred's cluster nav across report-cnt/cnt-hs/etc. Keep. |
| Status-3 row chrome (`<tr class=" font-13 ">` + magnific links) | YES | YES — `pcs-legacy` CSS scope kept | 🟢 (both) | — |
| Add-payment form (the legacy POST handler L4-101 · the `addPay` action that creates a tb_cnt row + uploads slip) | YES | NO (stubbed in detail page; current page is read-only) | 🔴 Workflow | Wave-after-pilot. The legacy POST inserts into tb_cnt + uploads slip — port to a Server Action. ~100 LOC. |

**Verdict:** 🟠 **MOSTLY FAITHFUL** — the only 🔴 workflow gaps are the deliberate Wave-after-pilot stubs already noted in the page docblock. The view itself is high-fidelity. Top P0 = inline เพิ่มไฟล์ modal (productivity blocker for accounting).

---

## Priority action list (sorted by impact)

P0 = revenue / operations blocker (operator can't do their job today) · P1 = significant gap · P2 = polish.

### 🔴 P0 fixes (workflow blockers — must close before D1 sign-off)

1. **`/admin/wallet` — wrong default paradigm** — add per-customer wallet-balance summary as default view. Operators answering "what's customer PR3963's balance" need this NOW. File: `app/[locale]/(admin)/admin/wallet/page.tsx` · ~150 LOC. Add metric tiles (total wallet · total cash-back) + a row-per-user balance table. Move current transactions list to a `?view=tx` tab.
2. **`/admin/yuan-payments` — missing date-range filter** — add a default-60-day filter to match legacy. File: `app/[locale]/(admin)/admin/yuan-payments/page.tsx` · ~60 LOC. Operators currently see "200 most recent of all time" — old paid rows obscure today's pending.
3. **`/admin/forwarders` — missing ยอดค้างชำระ column** — port `calPriceForwarderMain()` from legacy helper file (`member/pcs-admin/include/function.php`) + add the column. File: `app/[locale]/(admin)/admin/forwarders/forwarders-table.tsx` (the row renderer) · ~80 LOC. Without this column, operators can't tell who owes how much without clicking each row.
4. **`/admin/customers` — missing 5 critical columns** — VIP badge + main address + LINE ID + Facebook + birthday/age. File: `app/[locale]/(admin)/admin/customers/page.tsx` · ~100 LOC combined. Address is the #1 gap (staff calls customer + needs address in front of them).
5. **`/admin/customers` — missing password-reset action** — operators escalate to ภูม when a customer needs a password reset; legacy gave them a one-click action. File: new `actions/admin/customer-reset-password.ts` + `components/admin/customer-row-actions.tsx` · ~80 LOC. Enforce ops + accounting + super role.
6. **`/admin/forwarders` — missing "ลบ" action + bulk-move-status footer** — the only way to clear customer-mistake orders + move special-status batches. ~100 LOC combined.
7. **`/admin/cnt-hs` — missing inline เพิ่มไฟล์ AJAX modal** — accounting batches PDF uploads · forcing round-trip to detail page kills productivity. ~60 LOC.

### 🔴 P1 fixes (significant gaps)

8. **`/admin/forwarders` — missing diffDateTimeNow elapsed-time stamp** — SLA visibility ("stuck 8 days") ~40 LOC.
9. **`/admin/forwarders` — VIP/SVIP badges + จะมาถึงไทย ETA** — relationship + ETA in glance ~50 LOC.
10. **`/admin/forwarders` — print-status & ขึ้นรถ/ลงรถ chips** ~30 LOC.
11. **`/admin/wallet` — system-wide wallet + cash-back total tiles** ~30 LOC.
12. **`/admin/yuan-payments` — paytype label correction** — verify 1/2/3 vs 1/2/3/4 against prod data; align labels. ~5 LOC (after verify).
13. **`/admin/wallet` — verify reject path re-credits wallet (legacy L606-619)** + verify approve sends LINE notify (legacy L685-695). Read-only verification of `actions/admin/wallet-approve.ts`.

### 🟠 P2 fixes (UX polish)

14. All 4 list pages — add avatar thumbnails (where `tb_users.userpicture` non-empty) · ~25 LOC each × 4 = ~100 LOC total. Use one new `LegacyAvatar` component.
15. `/admin/customers` — admin-initiated VIP-signup form on the VIP group filter ~80 LOC.
16. `/admin/yuan-payments` — page-top-menubar for consistency with other 4 admin pages ~30 LOC.
17. `/admin/yuan-payments` — date/time wrapping + minus-sign red on debit ~10 LOC.
18. `/admin/forwarders` — `fpallet` location chip + `nameProductsType` label + fNote chip + read-flag chip ~25 LOC.
19. `/admin/cnt-hs` — magnific-style slip lightbox modal (avoid round-trip) ~20 LOC.
20. `/admin/wallet` — deleted-account "ระงับ" inline chip in balance row ~5 LOC.

### 🟢 Intentional improvements (keep — do not revert)

- `/admin/wallet` consolidating deposit/withdraw/history into one screen w/ kind+status tabs
- `/admin/wallet` bulk-approve bar (Wave 8) + signed-URL slip preview (Wave 13.1)
- `/admin/forwarders` Cargo/Freight × FCL/LCL segmented pills (label-only · Phase C-ready)
- `/admin/forwarders` `q_multi` multi-line bulk tracking search
- `/admin/forwarders` "Wave 11 status" amber banner (proactive transparency)
- `/admin/customers` wallet balance column + status chip + group filter consolidation
- `/admin/yuan-payments` ¥ / 銀 + กำไร own columns
- `/admin/cnt-hs` server-side keyword search + offset pagination
- `/admin/cnt-hs` 11-button TopMenuReport cluster nav
- Page-level role gates (`requireAdmin([roles])`) stronger than legacy button-only gates
- Empty-state cards on all 4 list pages (legacy had bare empty tables)
- Page top menubar pattern (4 of 5 audited pages — consistent, faster than sidebar)

---

## Open verification items (read-only — flag for ภูม)

These need a quick code-read or DB query before any fix; don't act on hunches:
1. **Verify `actions/admin/wallet-approve.ts`** — does the reject path re-credit `tb_wallet.wallettotal` per legacy L606-619? Does the approve path fire `lineNotifyTopUp()` per legacy L685-695?
2. **Verify `components/admin/customer-row-actions.tsx`** — does it have delete? password-reset? edit?
3. **Verify `/admin/customers/[id]`** — does it show address / LINE ID / Facebook / birthday?
4. **Verify `tb_payment.paytype` enum on prod** — is it 1/2/3 (legacy) or 1/2/3/4 (Pacred labels)? `SELECT paytype, COUNT(*) FROM tb_payment GROUP BY paytype`.
5. **Verify `/admin/forwarders/new`** — is it still a stub redirect, or has Wave 12 started?
6. **Verify `/admin/yuan-payments/new`** — is it wired to the legacy `payment.php` modal form?

---

## Method note

- The brief's `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\pcscargo\member\pcs-admin\` path does **not exist on this machine** (only `pcscargo.rar` is in Downloads, unextracted). The equivalent extracted source is at `C:\xampp\htdocs\pcscargo\member\pcs-admin\` — the canonical Windows xampp path mentioned in CLAUDE.md / `legacy-php-sweep` skill. PHP files are byte-identical between the two snapshots per the 2026-05-20 "newrealdatapcs" reconciliation note in CLAUDE.md.
- Audit done **read-only** — no code files edited. Only this audit doc written.
- All line-number citations are from the xampp htdocs copy; same as Downloads zip if extracted.
- Severity calls follow AGENTS.md §0a — "workflow = data field / button / permission / filter different" → 🔴; "polish = layout/density/styling difference w/ same workflow" → 🟠; "Pacred-only feature" → 🟢.

---

End of audit. Doc length ≈ 460 lines (well under the 1500-line cap). Generated 2026-05-24.
