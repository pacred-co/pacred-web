# 🧾 Save-point 2026-07-02 (ภูม · Poom-pacred) — MOMO box-split จบ → NEXT: โกดังอี้อู reconcile (NEW CARGO + WeChat) · resume พรุ่งนี้

> **Branch Poom-pacred = `770effc5`** (push แล้ว · git 0/0 · gate เขียว tsc 0 · momo tests pass). NEXT FREE mig = 0241 (0240 momo_box_detail applied DEV only).

## ✅ วันนี้เสร็จ (MOMO/กวางโจว — "ได้ระดับนึงแล้ว")
- สถานะ MOMO base-match · สร้างใหม่ดึง Live · เลขตู้/วันปิดตู้ auto (ทุก 10 นาที) · **แตกกล่อง MOMO → N แถวจริง (money-safe · DEV-verified 1781675788 = 4 แถว · เงินตรง)** · editor revert (เอา box sub-table ที่งงออก). รายละเอียดเต็ม: memory `session-2026-07-02-momo-boxsplit`.
- 🔴 เดฟ: deploy Poom-pacred→prod · review money box-split · backfill `scripts/split-aggregated-momo-boxes-2026-07-02.ts --apply` · apply mig 0240 prod · MOMO_WEB creds ใน Vercel.

## 🔜 งานต่อ (ภูม directive · resume พรุ่งนี้) — **โกดังอี้อู: หา สถานะ/สินค้า/ลูกค้า/ตู้ ที่ยังไม่มีในระบบ**
พี่ภูมิ: "กวางโจว+MOMO ได้ระดับนึงแล้ว · มาต่อโกดังอี้อู · สำรองแชท WeChat+LINE มาให้แล้ว · ไปตามสถานะ/สินค้า/ลูกค้า/ตู้ มาให้ครบ · งานอี้อูที่ยังไม่รู้ ไม่มีในระบบ · เอามาให้หมด"

### แหล่งข้อมูล (paths):
- **LINE** (อ่านแล้ว): `C:\Users\Admin\Downloads\[LINE] การแชทของ Ttw เปิดใบกำกับ-ใบขนพ่วง แพคเรต.txt` + `C:\Users\Admin\Downloads\[LINE] การแชทของ NEW CARGO_PACRED.txt`
- **WeChat** (ยังไม่แกะ · เข้ารหัส): `C:\Users\Admin\Documents\xwechat_files\wxid_w2v3udjdefzt22_ef71\db_storage\message\message_0.db` + `message_1.db` (SQLCipher v4) · contact.db · session.db · Backup ที่ `...\Backup\wxid_w2v3udjdefzt22`

### สิ่งที่เจอจาก LINE (first-pass):
- **NEW CARGO** (`newcargothai.net`) = พาร์ทเนอร์ฝั่งอี้อู · **เพิ่งเชื่อม 2/7** (add Pacred เข้ากลุ่ม + ให้ portal login `PACRED@gmail.com` / `123456789`) → **นี่คืองานที่ยังไม่อยู่ในระบบ** (เจนขอ "แทรคทั้งหมดที่กำลังมาไทย" = ยังไม่ดึงเลย). shipment ที่เห็น: **PR9602** track `202750953248` PO `0516043-PR9602` 42kg/0.114 (เข้าโกดังไทย 24/6) · **PR10900** track `79009237562096` PO `0516785-PR10900` เรือ (ตู้เทียบท่า 22/6) · +1 item 20kg/0.120 (25/6 ยังไม่ระบุ PR). **ทั้ง portal ต้องดึงมาเทียบ.**
- **TTW** = ลูกค้า (ไม่ใช่โกดังอี้อู) · งาน ฝากโอนหยวน + ใบกำกับ + ใบขนพ่วง · ตู้ GZS (กวางโจว) · เกี่ยวบัญชี/เอกสาร ไม่ใช่สถานะโกดังอี้อู (เก็บไว้ lane accounting).

### WeChat — วิธีแกะ (เข้ารหัสอยู่):
บัญชี `wxid_w2v3udjdefzt22` (โกดังอี้อู?) · ถอดด้วยวิธีเดิม 2026-06-29 → learning `docs/learnings/wechat-china-ops-network-2026-06-29.md` + decryptor + table `wechat_ops_message` (mig 0228) + memory [[wechat-decrypt-china-ops]]. **ต้องได้ key ของบัญชีนี้จาก WeChat process ที่รันอยู่ในเครื่องก่อน** (ถ้าปิด/logout ต้องเปิด+login บัญชีนี้ก่อน).

### 🙏 2 ข้อที่ต้องเคาะก่อนลุยเต็ม (ถามภูมิ):
1. **NEW CARGO (newcargothai.net) = โกดังอี้อูใช่มั้ย?** หรืออี้อู = คนใน WeChat (คนละเจ้า)?
2. **WeChat `wxid_w2v3udjdefzt22` ยัง login อยู่ในเครื่องมั้ย?** (จำเป็นสำหรับดึง key ถอด DB)

### แผนพรุ่งนี้ (ultracode workflow — ทำให้ครบ ไม่ตกหล่น):
(a) ถอด WeChat อี้อู → ม.decrypt + ingest ข้อความ → หา แทรค/ตู้/ลูกค้า/สถานะ ที่พูดถึง · (b) ดึง portal `newcargothai.net` (login ที่ให้มา) → รายการทั้งหมดที่กำลังมาไทย · (c) **reconcile กับ tb_forwarder** → list ของที่ **ยังไม่มีในระบบ** (แทรค + ลูกค้า PR + ตู้ + สถานะ) · (d) เสนอวิธี sync เข้าระบบ (money-safe · fill-when-empty · เหมือน MOMO). ⚠️ money rule เดิม: fweight/fvolume feed SELL price · fill-when-empty · ห้ามแตะบิลแล้ว · 1 แทรค = 1 ออเดอร์.
