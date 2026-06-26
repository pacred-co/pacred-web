# 🧾 SAVE-POINT 2026-06-26 (ภูม · คอมที่ทำงาน → กลับไปทำต่อที่บ้าน)

> **Branch `Poom-pacred` = `2c1950bb`** (= HEAD · pushed · clean · local==origin 0/0).
> **คอมบ้าน resume:** `git fetch && git pull origin Poom-pacred` + copy `.env.local` จาก main repo (`C:\Users\Admin\pacred-web`) + connect browser ใหม่ (work machine = Browser deviceId `c0898978-…` · authed admin "Pasit Pappornpisit · Ultra Admin Z" · ที่บ้าน re-connect).
> **Gate เขียวทุก commit:** tsc 0 · eslint 0 (อ่าน exit จริง · กรอง `grep 'error TS' \| grep -v '.next'`). localhost/.env.local = **DEV** (`lozntlidlqqzzcaathnm` · pw `n61OKDy28QcrB1ZJ`) · prod = เดฟ จัดการ (ผม read-only) · **NEXT FREE mig = 0214** (วันนี้ใช้ 0213 driver fail-note). กฎ: push เฉพาะ Poom-pacred · ห้ามงานหาย · explain ภาษาพูด.

## ✅ งานวันนี้ (push Poom-pacred ครบ · gate เขียว · verify สด authed browser)

**(1) หน้าคนขับ — แยกจุดส่ง + ผู้รับชื่อจริง** (`7ed874bf`+`c387a7b2`) — `/admin/drivers/[id]` + `/work` เคยรวม PR10190 ปนกับ PR7429 (คนละลูกค้า) เป็นจุดเดียว + ผู้รับโชว์ "รับที่โกดัง Pacred" (placeholder). แก้: group key เพิ่ม **userid** (ตาม legacy `forwarder-driver.php` L918 `CONCAT(userID,fAddress)`) → คนละลูกค้าไม่รวมกัน · ผู้รับ = ชื่อลูกค้าจริง (lookup tb_users) + ⚠️ เตือนถ้าที่อยู่ placeholder. **+ QoL:** เก็บ+โชว์เหตุผล "ส่งไม่ได้" (`fdinote` · mig **0213** DEV) + ปุ่ม "ลบรอบ" inline ในหน้า list (legacy parity).

**(2) Flash ค่าส่งในไทย — คิดต่อกล่องแล้วรวม** (`e10b0774`) — forwarder MOMO หัวบิล fweight=0 → เลือก Flash ขึ้น "0 กก. ฿25". แก้ `lib/forwarder/domestic-shipping.ts`: รับ `parcels[]` (sibling boxes) → `calPriceFlash` ต่อกล่อง (แต่ละกล่อง ≤50kg) แล้วรวม (faithful legacy per-row + จำเป็น เพราะ calPriceFlash kg>50 → 0). ถ้ากล่องไหน >50kg → ตัด Flash. +3 test.

**(3) ปุ่ม "ปฏิเสธรายการ" สลิป type 4/8** (`0156ca51`) — `/admin/wallet/[id]` กดยืนยันได้ แต่ปฏิเสธไม่ได้. `adminRejectWalletDeposit` guard เดิมรับแค่ `type='1'` (bug pattern เดียวกับ approve ที่แก้ 2026-06-25). แก้: รับ type 4 (direct forwarder-pay) + 8 (direct shop-pay) ด้วย — money-safe (pending slip ยังไม่เข้า/ออก).

**(4) 🔴 ป้ายพิมพ์ที่อยู่/กล่อง `/admin/forwarders/print`** (8 commit · `ebb4710d`→`1f57a41e`) — ภูม flag: ป้ายไม่มีผู้ส่ง + ผู้รับ placeholder + พิมพ์ออกเครื่อง thermal ES-9910UB ไม่ติด/เลยหน้า/หมึกจาง.
> - **content:** เพิ่มผู้ส่ง Pacred (`SITE_LEGAL_NAME_TH`+`ADDRESSES.office.full`+`CONTACT.phoneCompanyDisplay`) + ผู้รับใช้ที่อยู่จริง (reuse `resolveShipTo` จาก [fNo] · `loadCustomerPrimaryAddress`/`loadJuristicCorporateAddress`).
> - **ขนาด:** หลงทางหลายรอบ (100×75→150×100→หมุน 90°→100×75) เพราะ**เดาขนาด**. สุดท้ายภูมส่งสเปค label จริง = **100×150mm portrait (Easy Print · 350/roll)** → ตั้ง `@page 100mm 150mm` · ผู้รับตัวใหญ่ 6.5mm จัดกึ่งกลาง เต็มป้าย · layout faithful legacy `printAll.php` case 4 (ผู้ส่ง+เลขที่/แทรกกิ้ง บน · ถึง/TO+ที่อยู่ กลาง · ขนส่ง+จำนวน ล่าง). verify สด: page 100×150 · content fits · overflow 0px.
> - **learning** (`2c1950bb` · pacred-domain-knowledge.md): print/label งาน — **ถามขนาด media จริง + แกะ legacy source ก่อน** อย่าเดา. browser-print `transform:rotate`+`@page` พังบน thermal · legacy ใช้ mPDF PDF (เชื่อถือได้).

## 🔴 CARRYOVER (เปิดอยู่ · ฝั่งภูม/ฮาร์ดแวร์ · ไม่ใช่งานโค้ด)

- **🖨 เครื่องพิมพ์ ES-9910UB พิมพ์ "นิดเดียว"** — diagnose จบแล้ว: **Windows Print Test Page ก็ออกนิดเดียว = 100% ไดรเวอร์เครื่อง (ความสูงกระดาษไม่ใช่ 150mm) ไม่เกี่ยวเว็บ/โค้ดเรา** (เว็บ render 100×150 ถูกแล้ว verify ละ). **ภูมต้องตั้งที่ไดรเวอร์เอง:** Printer Properties → Preferences → Page Setup → Stock → New → **W 100 · H 150** → set default → Print Test Page ต้องออกเต็มดวง. ทางตรงรุ่นสุด = วิดีโอทางการ **[easyprinterthailand.com/driveres9910](https://easyprinterthailand.com/driveres9910/)** ("ตั้งค่ากระดาษและปรับความเข้ม" แก้ทั้งขนาด+หมึกจาง). **🟢 ถ้าตั้งไดรเวอร์ height=150 เสร็จ → พิมพ์จากเว็บได้เลย (ไม่ต้องแก้โค้ดอีก).**
- **(option) ทำ PDF route** — ถ้าอยากชัวร์กว่า browser-print: ทำหน้านี้ออกเป็น PDF 100×150 (เหมือน legacy mPDF) ได้ · เสนอภูมไว้แล้ว · **ยังไม่ทำ** (รอภูมเคาะ — แต่ถ้าตั้งไดรเวอร์ถูก browser-print ก็พอ).

## ⏭️ NOTE
- carryover เดิม (เดฟ): MOMO vs แต้ม reconcile parser · rate=0 calc check (ยังเปิด · ไม่ได้แตะวันนี้).
- mig 0213 (`tb_forwarder_driver_item.fdinote`) = **DEV เท่านั้น** · เดฟ apply prod ตอน integrate.
