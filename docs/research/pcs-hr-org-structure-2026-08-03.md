# PCS HR / ผังองค์กร — แกะโครงสร้างจริงจาก legacy (2026-08-03)

> เจาะจาก **source จริง** (`C:\xampp\htdocs\pcscargo\member\pcs-admin\`) + **DB local จริง**
> (MySQL `pcsc_main` · `tb_admin` 167 แถว) ตาม §0b — ไม่ใช่จาก HTML/ภาพจำ.
> โจทย์ owner: *"ของเราตำแหน่งชื่อมันแปลกๆ โครงสิทธิ์ หรือ row แปลกๆ เหมือนวาดมาใช้ไม่ได้จริง
> แบบ pcs เขาใช้ได้จริง"* → หาว่า PCS ทำยังไงถึง "ใช้ได้จริง".

---

## 1. แกนของ PCS = ผังองค์กรเป็น SOT เดียว แล้วทุกอย่างชี้เข้าหามัน

**ผัง 3 ชั้น: บริษัท → ฝ่าย (department) → แผนก/ตำแหน่ง (section)** เก็บที่เดียว:
`include/pages/organization-chart/dataJson.php` (JSON hardcode 40 แถว) — แต่ละแถวคือ 1 ตำแหน่ง พร้อม**โควตาหัวคน**:

| field | ความหมาย |
|---|---|
| `companyNo/company/companyName` | 1 = **Cargo & Freight** (ส่วนกลาง) · 2 = **Freight** · 3 = **Cargo** |
| `departmentNo/departmentName` | ฝ่าย (ต่อบริษัท) |
| `sectionNo/sectionName` | **แผนก = ตำแหน่งเลย** (ไม่มีชั้น "ตำแหน่ง" แยกอีก) |
| `numberEmployee / numberInternship / numberPartner` | โควตาต่อตำแหน่ง: พนักงานกี่คน / ฝึกงานกี่คน / พาร์ทเนอร์กี่คน |
| `salary` / `active` | ช่องเผื่อไว้ (ยังเป็น 0 หมด) |

**ผังจริงของ PCS ทั้ง 40 ตำแหน่ง:**

- **บ.1 Cargo & Freight (กลาง):** CEO · Manager · HR (HR Manager / HR / Maid) · QA&QC (QA Manager / QA / QC) · Accounting (Accounting Manager / Admin Accounting) · Marketing (Manager Marketing / **Pricing** / Marketing-Creative / Graphic-Editing / **Sales All**) · ITDT (IT Project Manager / FrontEnd / BackEnd / FullStack)
- **บ.2 Freight:** Sales Freight (Sales Manager / Sales) · Freight Export (Manager / CS-Doc / Shipping Doc / Shipping Clearance / Clearance Imp&Exp / Messenger) · Freight Import (โครงเดียวกัน 6 ตำแหน่ง)
- **บ.3 Cargo:** Sales Cargo (Sales Manager / Sales) · CS Purchasing (Manager / Purchasing) · Warehouse (Manager / Warehouse / **Driver**)

**ทุกอย่างอ่านจาก dataJson ตัวเดียว:** dropdown ตอนเพิ่มพนักงาน (`api-list-department/section`) ·
ผังภาพ (`organization-chart.php` · treeflex · โชว์ตัวจริงใน tb_admin เทียบโควตา แยก em-/in-/pa-) ·
ผังตาราง (`organization-table.php`) · ป้ายชื่อฝ่ายบน sidebar (`checkRightsName`) · ตัวเช็คสิทธิ์ (`checkRights`).

## 2. Row พนักงาน = `tb_admin` แถวเดียวจบ ชี้เข้าผังด้วยเลข 3 ตัว

คอลัมน์สำคัญ (จาก DESCRIBE จริง · 44 คอลัมน์):
- **ตำแหน่ง:** `companyType` + `department` + `section` (เลขชี้เข้า dataJson) + `adminType` = **ประเภทการจ้าง**
  (1 ประจำ · 2 ทดลองงาน · 3 ฝึกงาน · 4 สหกิจ · 5 พาสเนอร์ · 6 ฟรีแลนซ์ · 7 คนในบ้าน — `optionEmployeeType()` function.php:3102)
  · adminType='7' ข้ามผังได้ (ไม่บังคับ dept/section)
- **การจ้าง:** `startDate`/`endDate` (สัญญา) · `endDateOfLogin` (ตัดสิทธิ์เข้าระบบ) · `salary` + `salaryType` · `expiryDate`
- **สถานะ:** `adminStatusA` (1=ทำงาน/0=ออก + `adminDel`/`dateDel` soft-delete) · `adminStatusSale` (ธงเป็นเซลรับงาน) ·
  `adminTMP` (พักงานรับออเดอร์ชั่วคราว) · ⚠️ `adminStatus` มีคอลัมน์แต่**ว่างทั้ง 167 แถว** = ไม่ใช้
- **เอกสาร/ตัวตน:** `nationalIDCard`+ไฟล์ · ทะเบียนบ้าน · เรซูเม่ · ศาสนา/สัญชาติ/สถานภาพ · `adminNickname` ·
  อีเมล/เบอร์ **แยกส่วนตัว vs บริษัท** (`adminEmail`/`adminEmailOrg` · `adminTel`/`adminTelOrg`)
- **ตารางลูก:** `tb_admin_address` (ที่อยู่ 171 แถว) · บัญชีธนาคาร (`admin-acc.php`) · ประวัติการศึกษา (ใน admin-profile)

prod ปัจจุบัน active 27 คน: CEO×6 · HR Mgr 1 · HR 1 · Admin Accounting 2 · Cargo Sales 7 · Purchasing 3 · Warehouse 4 · Driver 3.

## 3. สิทธิ์ = ตำแหน่งเลือก "ไฟล์เมนู" ตัวเดียว — เมนูคือสิทธิ์ ไม่มี ACL แยก

`include/left-menu.php` = `switch(companyType) → switch(department) → switch(section) → require เมนูของตำแหน่งนั้น 1 ไฟล์`
(เช่น section 11 Pricing → `left-menu/CargoAndFreight/Marketing/Pricing.php`).

- **เมนูต่อตำแหน่งประกอบจากโมดูลกลาง ~20 ชิ้น** ใน `left-menu/OOP/` (menu-forwarder · menu-acc · menu-payment ·
  menu-report · menu-hr-manage-human-resource · menu-wallet · menu-user · Learning/* · Extension/*)
  → **CEO.php = superset** (require ทุกโมดูล) · ตำแหน่งอื่น require เฉพาะโมดูลของงานตัวเอง
- **dashboard ก็แยกต่อตำแหน่งด้วยโครงเดียวกัน:** `include/pages/home/<Company>/<Dept>/<Section>/`
- `checkRights()` แบบเทียบชื่อ (company+dept+section) มีอยู่ แต่ wire จริงแค่ api ทดสอบ — **ตัวคุมจริงคือเมนู**
  (หน้าในลึกเช็คแค่ cookie login) ⇒ "ตำแหน่ง = เมนู = สิทธิ์" จุดเดียวจบ · เพิ่มตำแหน่งใหม่ = เพิ่มไฟล์เมนู 1 ไฟล์

## 4. โมดูล HR รอบตัว (จากเมนู HR จริง `menu-hr-manage-human-resource.php`)

| กลุ่ม | ของจริง/stub | หมายเหตุ |
|---|---|---|
| ผังองค์กร ภาพ+ตาราง | ✅ จริง | ตัวจริง vs โควตา ต่อตำแหน่ง |
| ทะเบียนพนักงาน `admin-table.php` | ✅ จริง | กรอง: ประเภทการจ้าง / บริษัท / ตำแหน่ง Partner (messenger·shipping·driver) / **ชนิดรถ driver** (4-6-10 ล้อ·หัวลาก 20'/40') / ลาออก(s=2) / คนในบ้าน |
| บัญชีธนาคารพนักงาน `admin-acc.php` | ✅ จริง | |
| Time-attendance `time-attendance-system.php` | ✅ สร้างจริง (data น้อย) | ลา 4 ชนิด (`tas_leave` · **อนุมัติ 2 ชั้น adminIDHR + adminIDCEO**) · วันหยุด (`tas_holiday` + แยกแม่บ้าน) · บันทึกเข้างานจาก **เครื่องสแกนประตู** (upload) + **มือถือ** + สรุป |
| สรรหาบุคคล (ประกาศรับ/ผู้สมัคร/นัดสัมภาษณ์) | 🟡 stub | ลิงก์ชี้ `admin.php?s=all` = placeholder |
| KPI / โบนัส / เงินเดือน | 🟡 stub | ลิงก์ชี้ `admin.php?s=all` — **legacy เองก็ยังไม่ได้ทำ** (`salary` เก็บบน tb_admin เฉยๆ · `salary-hs.php` จริงๆ คือจ่ายคอมเซล ไม่ใช่เงินเดือน) |
| โปรไฟล์พนักงาน `admin-profile.php` | ✅ จริง | ตำแหน่ง · ข้อมูลทั่วไป · ที่อยู่ · รูป · **กระเป๋าสำรองจ่าย** · KPI · วันลาที่เหลือ · โบนัส · บัญชีธนาคาร · การศึกษา |

## 5. ทำไมของเรา "เหมือนวาดมาใช้ไม่ได้จริง" — วินิจฉัย

ตอนนี้เรามี **3 ระบบซ้อนกันที่ไม่คุยกัน**:

1. **`org_branches/org_sections/org_positions/org_assignments`** (mig 0017 · ยุค pre-D1 rebuild) — หลัง `/admin/hr/org-chart` อ่านชุดนี้
   - ชื่อ**วาดเอง ไม่ตรงกับที่บริษัททำงานจริง**: branch "Business Development & Tech" · "Sales Team A/B" ·
     "Merchandiser" · "Sourcing" · "Planning" · "Sup-Express" — ไม่มีในภาษางานของ PCS/Pacred เลย
   - **ไม่เชื่อมกับสิทธิ์ใดๆ**: assignment ชี้ profiles เฉยๆ ไม่รู้จัก `admins.role` / เมนู → ผังเป็นรูปโชว์ ไม่ gate อะไร
2. **`admins.role`** (ultra/super/accounting/sales/…) = สิทธิ์เงิน+เมนูตัวจริง — แต่ไม่รู้จักผัง
3. **`admin_positions.workspace_role`** (mig 0221) = ตำแหน่ง→เมนู แกนที่สาม — seed 12 ตำแหน่ง ก็ไม่รู้จัก org_* เช่นกัน

⇒ เพิ่มพนักงานที่ `/admin/admins` แล้ว**ไม่ไปโผล่ในผัง** · ผังไม่กำหนดเมนู · โควตาหัวคนไม่มี · ประเภทการจ้าง 7 แบบไม่มี
ครบทุกอาการ "แปลก" ที่ owner ทัก.

## 6. ข้อเสนอ (แนว PCS · ยังไม่ได้ build — รอ owner เคาะ)

หลักการเดียว: **ผังเป็น SOT · พนักงานชี้เข้าผัง · ตำแหน่งกำหนดเมนู/workspace อัตโนมัติ**

1. ผังใหม่ **บริษัท → ฝ่าย → ตำแหน่ง** + โควตา (พนักงาน/ฝึกงาน/พาร์ทเนอร์) ต่อตำแหน่ง —
   seed จากผัง PCS จริง 40 ตำแหน่ง (§1) แล้วให้ owner ปรับชื่อเป็น Pacred · แก้ได้จากหลังบ้าน (ไม่ hardcode แบบ dataJson)
2. row พนักงาน = ตำแหน่งเดียวในผัง + **ประเภทการจ้าง 7 แบบ** + วันเริ่ม/สิ้นสุด + `adminTMP` พักงานรับออเดอร์ +
   เอกสาร (บัตร ปชช./ทะเบียนบ้าน/เรซูเม่) + อีเมล/เบอร์ ส่วนตัว-บริษัท แยก
3. **ตำแหน่ง → workspace_role/เมนู ผูกอัตโนมัติ** — ต่อยอด `admin_positions` (0221) ที่มีอยู่ ไม่สร้างแกนที่ 4;
   `admins.role` คง money-tier ตามเดิม (RBAC 3 แกนเดิมไม่พัง)
4. **org_* (0017) = ยุบ/ทิ้ง** (ผังปลอม ไม่มีผู้บริโภคจริง) — ย้ายหน้า org-chart/org-table มาอ่านผังใหม่ ·
   ผังภาพโชว์ "ตัวจริง N/โควตา M" ต่อตำแหน่งแบบ PCS
5. เฟสถัดไป (ตามลำดับที่ legacy พิสูจน์ว่าใช้จริง): ทะเบียนพนักงาน filter ตามผัง → บัญชีธนาคาร →
   ลา/วันหยุด (อนุมัติ 2 ชั้น HR+CEO) → เข้างาน → (KPI/เงินเดือน legacy ก็ยังเป็น stub — ไว้ท้ายสุด)

**คำถามรอ owner:** (ก) ชั้น "บริษัท" ของ Pacred เอากี่บริษัท (PCS มี 3: กลาง/Freight/Cargo — เราจะใช้โครงเดียวกันไหม) ·
(ข) ชื่อฝ่าย/ตำแหน่ง เอาตาม PCS ไปก่อนแล้วค่อยปรับ หรือ owner ร่างใหม่เลย
