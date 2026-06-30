# 📨 Handoff → เดฟ (จาก ภูม · 2026-06-30 บ่าย/ค่ำ · Poom-pacred)

> ภูม session ต่อจาก integrate ของเดฟ (`a39eb41d`). งานทั้งหมด commit + push **Poom-pacred** แล้ว
> (tip `7a6cbc6a` · gate tsc 0 · eslint 0 · unit 11/11 · verify สดทุกอัน). ของที่ **เดฟ ต้องทำบน prod**
> (ผม read-only prod ตามกฎ) อยู่ด้านล่าง — ทำให้ครบเพื่อปิด loop.

---

## 🔴 ต้องทำบน PROD (DEV ทำแล้วทั้งหมด · prod = เดฟ)

### 1. apply migration `0232_shop_all_shops_arrival_gate.sql` → prod
- **NEXT FREE mig หลังจากนี้ = 0233** (0229/0230/0231 เดฟ apply prod ไปแล้วใน `a39eb41d`).
- เนื้อ: แก้ trigger `advance_shop_order_on_forwarder_arrival()` — ฝากสั่งซื้อ multi-ร้านจะขึ้น **สำเร็จ(5)/ถึงโกดังจีน(40)** ก็ต่อเมื่อ **"ทุกร้าน"** ถึงครบ (เดิม flip ทันทีที่ร้านเดียวถึง = บั๊กที่ภูมเจอ "3 ร้าน 2 ถึง 1 ไม่ถึง แต่ขึ้นสำเร็จ").
- **forward-only** — ออเดอร์ที่ขึ้นสำเร็จไปแล้วก่อนหน้าจะคงสถานะ 5 (ไม่ย้อนแก้ · ปลอดภัย). ของใหม่จะถูก gate.
- คำสั่ง: `SUPABASE_DB_PASSWORD='DqOzfEZVXfMHIryz' node scripts/apply-migration-generic.mjs supabase/migrations/0232_shop_all_shops_arrival_gate.sql` (หรือ reconcile · DEV-applied แล้ว).
- E2E verified DEV: 2 ร้าน · ร้าน A ถึง (1/2) → คง 4 · ร้าน B ถึง (2/2) → 5.
- โค้ด TS mirror ที่ตรงกับ trigger: `lib/admin/advance-linked-shop-order.ts` + `maybe-complete-shop-order.ts` (ใช้ `lib/admin/shop-order-arrivals.ts countShopArrivals`).

### 2. รัน frefrate backfill → prod  ⭐ (money · แต่ money-isolated + tested)
- **อาการ:** report-cnt กำไรตู้ติดลบมั่ว / ค่านำเข้า=0 (ภูมเจอ GZS260605-1 กำไร −21,102). root = หลายแถว MOMO **frefrate=0** (import เก่าบางรอบไม่เซ็ตเรทขาย). ลูกค้ามีเรทการ์ดจริง.
- **fix:** `node --env-file=.env.local scripts/backfill-momo-forwarder-rates.mjs` (dry-run ก่อน) → `--apply`.
  - เขียน **เฉพาะ** frefrate/frefprice/ftotalprice (money-isolated) · **ข้ามตู้ที่บิลแล้ว** (fstatus 5/6/7) · idempotent · resolve เรทจากการ์ดเดิม.
- **DEV verified:** wrote 13 · GZS260605-1 กำไรตู้ **−21,102 → +13,523.86** (ราคาขายตู้ 41,698.57).
- ⚠️ `.env.local` ต้องชี้ prod ตอนรัน (เดฟ จัดการ env).

### 3. Vercel env (ถ้ายังไม่ได้ตั้ง · จาก MOMO Live earlier)
- `MOMO_WEB_USER=PacredShipping` · `MOMO_WEB_PASS=PcrdShip@TH` (creds chat-only · หน้า MOMO (Live) login ไม่ต้องใส่รหัส). + MOMO weight backfill prod (ถ้ายังค้างจาก session ก่อน).

---

## 🟡 พิจารณา (permanent / owner)

- **frefrate=0 root** — MOMO import เก่าบางพาธไม่เซ็ตเรทขายตอน commit. ของใหม่ auto-price แล้ว แต่ควรเช็คว่า wire-in ครอบ **ทุก** import path (กัน backfill ซ้ำในอนาคต).
- **3-bank-account SOT (จากบล็อกเดฟ `a39eb41d`)** ยังไม่ wire เข้า payment surfaces + ยังต้องวาง 2 QR PNG — งานเดฟ.

---

## ✅ งาน session ภูม นี้ (push Poom-pacred แล้ว · verified)

1. **วางบิล slip = หลายรูป + ตรวจ 2 รอบ เหมือนหน้า wallet** (`cc2fc098`-เก่า + mig 0231) — รวมเข้าคิว "ชำระเงิน" + ตรวจสลิปรอบ1→ตัดจ่ายรอบ2 + ปฏิเสธ. verify กดจริง.
2. **report-cnt กำไรตู้ติดลบ** (`96ada884`) — derive ราคาขายสดจาก frefrate (display) + **backfill frefrate=0** (ข้อ 2 บน · ตัวจริง).
3. **report-cnt ตาราง box** (`f03537fb`) — คอลัมน์ "รหัสลูกค้า" (PR) + zebra (agent แยกร่าง).
4. **ทางลัด MOMO (Live) sidebar** + **ฝากสั่งซื้อ multi-ร้าน gate** (`cc2fc098` + mig 0232 · ข้อ 1 บน) + panel "ร้านที่สั่ง X/Y".
5. **มอบงานคนขับ** (`7a6cbc6a`) — ที่อยู่จริงไม่ขึ้นเพราะชื่อเป็น placeholder ("รับที่โกดัง Pacred") → แยก nameIsPlaceholder vs hasRealAddress · + ขยายช่องที่อยู่เหมือน PCS.
6. **โฟลว์ doc** (`4820b02a`) — `docs/flows/cargo-arrival-rate-vs-container-cost-flow.md` (ตั้งเรทขาย vs ตรวจตู้/จ่ายค่าตู้ แยกเส้น).
