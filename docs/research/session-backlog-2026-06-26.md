# 🧾 Session backlog — 2026-06-26 (เดฟ · ปิด session) → ส่งต่อน้อง/รอบหน้า

งานที่ owner สั่งรอบนี้ + ที่ยัง **ค้าง/รอเคาะ** หลังปิด session. resume: `git fetch && git pull` (main = dave-pacred = ทุก branch ที่ tip เดียวกัน).

---

## 1) 🔴 ฝากสั่งซื้อ (shop order) faithful-port — DETAIL ต้องครบทุกฟังก์ชันเท่า legacy

**Owner (frustrated · ลูกค้าจริงเข้าหลายออเดอร์):** *"แกะมาให้เหมือนเลย · ทำงานได้ทุกฟังก์ชัน"*. legacy spec = `pcs-admin/shops/update` + `pcs-admin/include/pages/shops/*.php` (owner pasted HTML ของ `P22839`). **Pacred หน้า detail มีโครงเกือบครบแล้ว** (screenshot: status stepper + edit fields + items + cost) — งานคือ **audit field-by-field + เติม gap ที่ขาด**. (workflow รอบนี้โดน server rate-limit · 0 งาน → ยังไม่ได้ทำ.)

**legacy DETAIL ทุกฟังก์ชันที่ต้องมี (จาก HTML จริง):**
- 5-step status stepper (รอดำเนินการ→รอชำระเงิน→สั่งสินค้า→รอร้านจีนจัดส่ง→สำเร็จ)
- แก้ไข **ล่ามดูแลออเดอร์ (IPC)** — `editIPC.php` (AJAX)
- customer block (ชื่อ/รหัส/email/โทร/avatar + badge SVIP/นิติ/Sale)
- edit **รูปแบบขนส่งจีน-ไทย** (รถ/เรือ · `hTransportType`)
- edit **การตีลังไม้** (`crate` ตีลัง/ไม่ตีลัง)
- edit **บริษัทขนส่ง** (`hShipBy` · dropdown 47 เจ้า + PCS/PCSF/PCSE → display PRF/PRE)
- edit **การเก็บเงินค่าขนส่งในไทย** (`payMethod` ต้นทาง/ปลายทาง)
- edit **ที่อยู่จัดส่ง** (`addressID` dropdown จาก tb_address)
- edit **อัตราแลกเปลี่ยน** (`hRate`)
- price breakdown (ราคาสินค้า/ค่าขนส่งจีน/ราคารวมหยวน/ราคารวมสุทธิ/เพิ่ม-ลด)
- **cost capture**: `hRateCost` (เรทจริง) + `hCostAll` (ราคาซื้อจริงหยวน) — [[cost-editable-sell-locked]]
- **items table** ต่อแถว: qty/¥price/ค่าขนส่งจีน/เพิ่ม-ลด/ราคารวม/ลบ + **live JS recompute** + per-shop grouping (provider 1688 + ชื่อร้าน)
- หมายเหตุ (`hNote` + `hNoteUser` แอดมินเท่านั้น/ลูกค้าและแอดมิน)
- ยกเลิกการสั่งซื้อ (`cancelOrder.php`) / ลบถาวร (`deleteOrder.php`) / เปลี่ยนสถานะ (`update2`)
- **คืนเงินรายสินค้า** (`repayItem.php` · คืนบางส่วน/ทั้งแถว → wallet) ⚠️ money
- row-lock (`updateLock.php` ทุก 60s กันแก้ชน)

**วิธี:** §0b อ่าน legacy PHP จริง (`C:\Users\Admin\Desktop\newrealdatapcs\pcscargo\member\pcs-admin\shops\` + `include/pages/shops\`) → diff กับ Pacred `app/[locale]/(admin)/admin/service-orders/[hNo]/` → เติม gap (§0a Tailwind ของเรา · §0e เขียน tb_header_order/tb_order/tb_address/tb_settings live · §0f confirm). ⚠️ rate/cost/item/status = money → ตรง legacy เป๊ะ ห้ามมั่ว.

---

## 2) 🟡 #11 เรท — relabel ภาษาคน + ลิงก์เว็บ/พอร์ทัล (display-only · ปลอดภัย · รอ owner เคาะคำ)

**ตอบ owner "rgdefault คือไร":** = ช่องเก่าตกค้างจาก PCS · **ไม่มีหน้าไหนใช้คิดราคา** (โค้ดเขียนกำกับ "ไม่ได้ใช้") → แก้ = **ซ่อนออกจากหน้าจอ**.

เรทจริงมี 2 แบบ (หลังบ้านลิงก์ถูก ~90%):
1. **เรทหยวน** (tb_settings · `rsdefault`=ฝากสั่ง · `rpdefault`=ฝากโอน · `hratecostdefault`=ต้นทุน) → /cart + /service-payment ใช้ทันที ✓
2. **เรทค่าขนส่งจีน-ไทย** (tb_rate_* waterfall `resolve-rate.ts`: SVIP>VIP>General) → /admin/rates ✓

**gap = หน้าเว็บโฆษณา + หน้าลูกค้า ยังไม่ดึงเรทจริงมาโชว์.**

**แผน (NO migration/cron/flag):**
- **PLAN 1 relabel** — `/admin/settings/legacy-rates` form.tsx: ป้ายไทย + **ลบ rgdefault input ออก** (เก็บ column ใน DB เฉยๆ) · `/admin/rates` เพิ่มชื่อไทยนำ · forwarder detail: `frefrate`→"เรทค่าขนส่งจีน-ไทย" · "ค่าเทียบ"→ `<Explain>` tooltip ("น้ำหนัก÷คิว > ค่าเทียบ → คิดตามกิโล · มาตรฐาน 250"). ใช้ `components/ui/tooltip.tsx` + `guide-note.tsx` ที่มีแล้ว.
- **PLAN 2 ลิงก์เว็บ** — `/services/*` + `/freight-quote` server-read `rsdefault` + sample General rate จาก tb_settings/tb_rate_g_* ตัวเดียวกับแอดมิน → "แก้ที่เดียวเปลี่ยนทุกที่". (อ่านอย่างเดียว ไม่เขียน) + (optional) การ์ด "ดูเรทของฉัน" หน้าลูกค้า (read-only `resolveLiveForwarderRate`).

**🔴 owner ต้องเคาะก่อนทำ:** (1) ลบ rgdefault ออกจากจอ OK? (2) เว็บโชว์เรทแบบไหน (เรทหยวนวันนี้ / "เริ่ม ฿X/กก." / ไม่โชว์)? (3) การ์ด "ดูเรทของฉัน" ทำเลย/Phase หน้า? (4) คำไทยที่จะใช้ ("ค่าเทียบ" เก็บไว้ หรือ "เกณฑ์คิดกิโล/คิว").

---

## 3) 🟡 #10 MOMO — SF0219344032022 (PR018 · เข้าโกดังจีนแล้วแต่ระบบไม่มี)

**diagnose (prod probe):** SF0219344032022 = PR018 · อยู่เฉพาะใน `momo_container_closed.raw.track_details[]` ของตู้ GZS260624-1 (DEPARTED) · **pipeline ไม่เคย insert reTracks (เลขย่อยในตู้ปิด) เป็น import-track** → ไม่มีแถวใน tb_forwarder. cron MOMO ทำงานปกติ (ไม่ใช่ cron พัง).

**fix 3 จุด:**
- **(A) เปิด auto-commit** `MOMO_CRON_AUTOCOMMIT=true` (Vercel env · ตอนนี้ false) — 🔴 owner เคาะ (auto สร้าง billable row)
- **(B) harvest reTracks** — `lib/integrations/momo-isolated/sync.ts` step 2.5: แกะ `track_details[]` จากตู้ปิด → upsert `momo_import_tracks` + backfill script. ⚠️ money-adjacent (weight/cbm→price) → gate+test. = fix จริงของ SF นี้.
- **(C) /review owner-assist** — UI ให้ผูกเจ้าของ reTrack ที่ยังไม่มี owner.

---

## 4) 🟡 #2 identity — จุฑามณี/AD009

owner: "จุฑามณี = เจน = บัญชี". แต่ prod: **AD009 = admin_vam = role `super` (god)** ไม่ใช่ accounting. **ห้ามแตะ ultra/super role โดยไม่ถาม** → รอ owner ยืนยัน: ลด AD009 super→accounting ไหม? + ซันต้า (การตลาด) รูปยัง pending.

---

## ✅ เสร็จรอบนี้ (อยู่ใน commit · ดู CLAUDE.md save-point 2026-06-26)
RECEIPT 4-หน้า fix · MOMO cost backfill 40 แถว prod · status-sync **DB trigger 2 จังหวะ** (40→5) · avatar client-compress · wallet จ่ายนอกระบบ 1-step + แก้ยอด approved type8 (#6) · บุคคล→นิติ + เอกสารหลายไฟล์ · bank dropdown · 3 reps (ล่าม/pricing/สั่งซื้อ) · HS auto-search + TAM ingest (ftaem_* reference) · HR เห็นรายงานโทรเซล (#9) · mig 0213-0219 prod+dev.
