# 🌅 2026-06-06 — ภูม autonomous run · B-batch + cleanup + avatar mirror + incidents + CSV-batch · save-point

**Branch:** `Poom-pacred = 64f0ab5b` · pushed · synced 0/0
**Resume:** `git fetch origin && git pull origin Poom-pacred && cat docs/research/poom-save-point-2026-06-06-autonomous.md`

---

## ☀️ ตื่นมาแล้วเปิด — 3 ทางเลือกพรุ่งนี้

ปิดวันด้วย 10 commits + 14 CSV surfaces (ดูตาราง "ที่ Ship วันนี้" ด้านล่าง). ทุกอย่าง push แล้ว · `pnpm typecheck EXIT 0`. ลุยต่อตาม mood:

### 🔥 ทาง 1 — verify P0 ที่ต้องใช้ customer session (~45 นาที · ภูม login เอง)

ผมโค้ดต่อให้ไม่ได้เพราะต้อง customer login (admin slot ผมใช้อยู่):

- **Wallet rework ADR-0028 edge cases** — เดฟ verify P22309 แล้ว · ต้อง verify status 4/6/cancelled อื่น. Login customer test → สั่ง shop-order → จ่าย QR+slip → ดู `tb_wallet_hs` ลื่นมั้ย (~30 min)
- **Shop-order ลูกค้าแก้ที่อยู่/วิธีรับ** — เดฟ ship `89c7d789` แต่ยังไม่ click-test · login customer test → เปิด order status 1-4 → กดเปลี่ยน carrier + ที่อยู่ → ดู `tb_header_order` บันทึกถูกมั้ย (~15 min)

### 🟡 ทาง 2 — ฟีเจอร์ใหม่ที่ผมโค้ดต่อได้ (~2 ชั่วโมง · money-critical)

**Slip top-up at checkout** — ลูกค้า checkout แล้ว wallet ไม่พอ ต้องเติมเงินก่อน แล้วกลับมาจ่ายอีกที. ทำให้ "upload slip ส่วนต่าง ที่ checkout เลย" → admin verify → settle. ผมจะดีไซน์ flow money + before/after ledger ให้ ภูม approve ก่อนลงโค้ดเสมอ. ไฟล์หลัก = `actions/wallet.ts` + `actions/forwarder.ts` + new checkout slip island

### 🟢 ทาง 3 — ของอื่นๆ ตามที่ ภูม มีในใจ

- bug ที่ ภูม รู้แต่ยังไม่ได้บอก
- legacy fidelity audit หน้าใดหน้าหนึ่ง (skill `legacy-fidelity-check`)
- polish UI / mobile 360 verify
- หรือ pickup จาก CLAUDE.md "🔴 PENDING" ที่ไม่ใช่ owner-blocked

---

## 🎯 ที่ Ship วันนี้ (10 commits · 14 CSV surfaces)

| SHA | งาน |
|---|---|
| `1c9a2c70` | **B-batch** report-cnt audit · B1 backfill script + 0146 migration + page refactor (RPC + fallback) |
| `03cc3641` | Rebased on เดฟ's heading fix |
| `48f2d4b3` | Orphan delete (forwarder-items-table + shop-item-row-editor) + **B3** ✈️ ทางอากาศ filter pill |
| `94a6f7d7` | **Avatar mirror** customer + admin → `tb_users.userPicture` + `tb_admin.adminPicture` |
| `7ebf0327` | **CSV export** → `/admin/report-cnt` (accountants · 32-cabinet group + money cols gate) |
| `fe1e6093` | **CSV bulk** → 6 surfaces: `/admin/wallet` (balance) · `/admin/yuan-payments` · `/admin/forwarder-check` · `/admin/forwarders/combine-bill` · `/admin/wallet/withdrawals` · `/admin/leads` |
| `2be72521` | **CSV** → `/admin/refunds` (RF tracker for PEAK) + `/admin/service-orders` (ฝากสั่งสินค้า 20 cols) |
| `b344d354` | **CSV** → `/admin/forwarders` main list (30 cols · 10 status tabs · all filters honoured) |
| `25c11954` | **CSV** → `/admin/customers/{credit,comparison,recently-active}` (closes Wave-8 gap from page doc) |
| `dae51da8` | **CSV** → `/admin/customers` main (8,898 customers · 17 cols · all `?group=`/`?type=`/`?adminidsale=` filters honoured) |

---

## 📊 Production ops applied วันนี้

| Op | ผลลัพธ์ |
|---|---|
| Migration 0146 (count_distinct_cabinets + get_container_summary RPCs) | ✅ applied prod 127ms via session-pooler aws-1 |
| B1 backfill `tb_cnt_item` | ✅ 4,662 rows inserted · 0 failed (was 0 → 4,662) |
| Browser-verify report-cnt | ✅ Badge 283→32 (waiting) · 46,339→5,618 (succeed) · 8.8× / 8.3× ลด |
| Browser-verify forwarder edit (id=51204) | ✅ 8-pill pipeline · "เตรียมส่ง" highlight · FreightBreakdownTable + WHT 1% column |
| Triage 2 incidents (counts.transportAir + error is not defined) | ✅ both resolved with audit notes referencing fix commits |

---

## 🎯 CEO directives — ภาพรวม

| Directive | Status |
|---|---|
| Profit-cap ≤15k/ตู้ + quote-compare | ✅ 4 surfaces (Monitor + Compare + Cron + Per-customer) |
| 3-tax-doc trio (ใบกำกับ/ใบขน/ไม่รับเอกสาร) | ✅ code + ใบขน hub · 🟡 รอ accounting VAT-base sign-off |
| Business runs itself (CRM) | ✅ Near-churn + Margin Profile + CRM omni-inbox (รอ ปอน FB) |
| ลูกค้าประจำควรได้ราคาดีกว่า | ✅ Per-customer Margin Profile |

---

## 🟡 ที่ค้างของ ภูม (ภูม lane · ไม่มี blocker)

| Priority | งาน | Effort | Note |
|---|---|---|---|
| 🔥 P0 | Wallet rework ADR-0028 money-loop verify บน TEST order อื่น | M ~1-2h | เดฟ verified P22309 · ต้อง edge case อื่น (status 4/6/cancelled) |
| 🔥 P0 | Verify shop-order customer ship-by/address inline-edit | S ~30m | ต้อง customer session login (admin ผมใช้อยู่) · ภูม ใช้ test customer ของตัวเอง |
| 🟡 P1 | Interpreter commissions badge — ภูม confirm logic ก่อน wire | M ~1h | เดฟ enriched code lead = `tb_withdraw_comm_interpreter_h` status='2' |
| 🟢 P2 | Withdraw KYC gate (pwd + docs) | L ~3-4h | Owner policy decision needed |
| 🟢 P2 | Slip top-up at checkout | M ~2h | wallet ไม่พอ → admin slip ส่วนต่าง |
| 🟢 P3 | Address maps-pin | L ~3h | Google Maps key + UX |
| 🟢 P3 | Mobile 360 verify | S ~30m | Cosmetic · ใช้ DevTools manual |

---

## 🔴 Coordination blockers (ไม่ใช่ codeable solo)

- **ก๊อต co-sign:** §2 batch payouts CREATE · §6 TH-transport CREATE · Partner API · CargoThai P4
- **เดฟ coord:** §5b auto-accrual trigger
- **ปอน:** 11 staff photos · FB webhook · Mobile launchpad tile decision
- **Owner Vercel/Dashboard:** Refresh-token reuse interval · TAMIT-2026 env · THAIBULKSMS_FORCE · Sentry DSN · FB tokens · employee codes
- **Accounting:** ใบขน VAT-base sign-off · หนองแขม free-ship zone

---

## 🔄 Resume command

```bash
cd C:/Users/Admin/pacred-web/pacred-web
git fetch origin && git pull origin Poom-pacred
cat docs/research/poom-save-point-2026-06-06-autonomous.md
pnpm dev   # :3000
```

Pickup options พร้อมเลือกใน "ที่ค้าง" table ข้างบน หรือ ภูม direction ใหม่.

---

## 🎉 Closing remark

วันนี้ ship 10 commits · apply migration prod · backfill 4,662 rows · -828 LOC orphan removed · verify 13+ surfaces · close 2 incidents · **CSV export wired ใน 14 admin pages** (report-cnt · wallet balance · yuan-payments · forwarder-check · combine-bill · withdrawals · leads · refunds · service-orders · forwarders · customers main + credit + comparison + recently-active). B-batch ของ ภูม's late-PM save-point ปิดงานครบ (B1+B2+B5+B3 · พี่ป๊อปไม่เห็น 8× over-count workload อีกแล้ว). Avatar staleness gap (เดฟ flag) ปิดด้วย single-fix write-mirror.

**CSV impact:** ทุก list page หลักใน admin/cargo + admin/accounting + admin/wallet + admin/customers สามารถ export → spreadsheet ได้ทันที (BOM + RFC 4180 + honours active filter/sort/date-window/role-gate · money cols gated where appropriate). PEAK / Excel reconciliation flow ไม่ต้อง screenshot อีกแล้ว. CEO directive §6 (acquisition cold-list to external callers / VAs) unblocked เพราะ /admin/leads CSV + /admin/customers main CSV (8,898 รายในมือ). Sales win-back drip ใช้ /admin/customers/recently-active CSV bucket col ได้ทันที.

CEO 3-directive trio + CRM activation 2.0 ทั้งคู่ปิดวงแล้ว. งานหลักที่เหลือเป็น P0 verification (wallet rework + customer inline-edit) ที่ต้องการ customer session · และ Coordination items กับทีมอื่น.

🚀
