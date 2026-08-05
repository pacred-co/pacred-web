# PCS HR — แกะละเอียดทุกซอก (2026-08-03 · deep pass)

> ต่อยอดจาก [pcs-hr-org-structure-2026-08-03.md](pcs-hr-org-structure-2026-08-03.md) (โครงภาพรวม) —
> ไฟล์นี้ = **สเปคระดับ field/table/action** สำหรับ build จริง. แกะจาก source จริง
> `C:\xampp\htdocs\pcscargo\member\pcs-admin\` + DESCRIBE `tb_admin` (44 คอลัมน์ · ทำไว้แล้ว §0b).
> owner เคาะ 2026-08-03: **Pacred บริษัทเดียว · โมเดลหัวหน้า = แบบ PCS** (หัวหน้า = ตำแหน่งจริง
> โควตา 1 · เลื่อน = ย้ายคนจากกล่องทีมขึ้นกล่องหัวหน้า ไม่รับคนเพิ่ม).

---

## 1. ฟอร์มเพิ่ม/แก้พนักงาน — ทุก field (add.php · POST → admin-table.php)

`add.php` กับ `edit.php` **field เหมือนกันเป๊ะ** ต่างแค่ add มี `adminPass` (edit ไม่ตั้งรหัสซ้ำ).
ฟอร์มแบ่ง 4 บล็อก:

**บล็อก 1 · ข้อมูลตำแหน่งงาน**
| field | ชนิด | หมายเหตุ |
|---|---|---|
| `companyType` | dropdown | PCS: 1/2/3 · **Pacred = ล็อกเป็น Pacred ตัวเดียว** (ยุบทิ้ง dropdown นี้) |
| `adminType` | dropdown 7 ค่า | ประเภทการจ้าง (§2) |
| `department` | dropdown (cascade จาก company) | ยิง `api-list-department.php` |
| `section` | dropdown (cascade จาก department) | ยิง `api-list-section.php` = **ตำแหน่ง** |
| `startDate` / `endDate` | date | ช่วงสัญญาจ้าง (add: `.apprentice` slideUp/down ตาม type) |
| `adminTMP` | dropdown | พักงานรับออเดอร์ชั่วคราว (0/1) |
| `salaryType` / `salary` | dropdown + number | ประเภท+จำนวนเงินเดือน |

**บล็อก 2 · ข้อมูลทั่วไปพนักงาน**
`userPicture` (อัปรูป · preview `userPictured`) · `adminID` (รหัส · ยิง `api-check-adminID` กันซ้ำ · **Pacred = AD####** แยกจาก pool ลูกค้า PR — มีอยู่แล้ว mig 0199) · `adminTel` (ยิง `api-check-adminTel`) · `adminName` · `adminLastName` · `adminNickname` · `adminSex` · `adminBirthday` · `nationalIDCard` + ไฟล์ `nationalIDCardFile` · `copyHouseRegistrationFile` (สำเนาทะเบียนบ้าน) · `expiryDate` (วันหมดอายุบัตร)

**บล็อก 3 · ที่อยู่ปัจจุบัน** → `tb_admin_address`
`addressNo` · `district`(ตำบล) · `amphoe`(อำเภอ) · `province` · `zipcode` · `addressNote`

**บล็อก 4 · อีเมล/รหัส + ช่องทางองค์กร**
`adminEmail` (ส่วนตัว) · `adminPass` (add เท่านั้น) · **`adminEmailOrg`/`adminLineOrg`/`adminWeChatOrg`/`adminTelOrg`** = เลือกจาก dictionary องค์กร (§4) → เขียนลงตาราง ships

### 1.1 ตัวเลือกในฟอร์ม (ค่าจริงทุกช่อง · function.php)
- **`adminSex`**: 1=ชาย · 2=หญิง · 3=LGBTQ
- **`salaryType`**: 1=รายวัน · 2=รายเดือน · 3=ไม่มีเงินเดือนประจำ
- **`adminTMP`** (พักงานรับออเดอร์): 1=ทำงานอยู่ · 2=พักงานชั่วคราว
- **`religion`**: 1พุทธ 2คริสต์ 3อิสลาม 4ฮินดู 5ซิกข์ 6ยูดาห์ 7ไม่มีศาสนา 8อื่นๆ
- **`maritalStatus`**: 1โสด 2แต่งงาน 3หย่าร้าง 4ม่าย 5แยกกันอยู่ 6มีความสัมพันธ์ 7หมั้น 8อื่นๆ
- **การศึกษา** (`tb_education_background` · หลายแถวต่อคน): educationStatus · educationLevel · Institution(สถาบัน) · faculty(คณะ) · educationDepartment(สาขา) · graduateYear(ปีจบ) · GPA
- **ช่องทางองค์กร** (dictionary CRUD แยกหน้า · `organization-email/line/wechat/tell.php`): พนักงานเลือกผูก 1 ช่องจาก dictionary → เขียนตาราง `tb_org_*_ships`

## 2. ประเภทการจ้าง `adminType` (optionEmployeeType · function.php:3102)

`1`=พนักงานประจำ · `2`=ทดลองงาน · `3`=เด็กฝึกงาน · `4`=สหกิจศึกษา · `5`=พาสเนอร์(partner) ·
`6`=ฟรีแลนซ์ · `7`=คนในบ้าน. **type 7 ข้ามผัง** (add.php JS: type 7 → ซ่อน department/section · ไม่ required).
ผังนับแยก 3 ถัง: **em-** (type 1,2), **in-** (type 3,4), **pa-** (type 5) — ตรงกับ พนักงาน/ฝึกงาน/พาร์ทเนอร์ ในกล่อง.

### 2.1 🔴 Partner (type 5) คืออะไร — แกะจาก source (owner ถาม 2026-08-03)
**= คนที่ทำงานให้บริษัทแบบจ้างเป็นงาน/เป็นเที่ยว ไม่ใช่ลูกจ้างประจำ** (outsource ที่ผูกกับบริษัท · คู่กับ freelance type 6 แต่ partner มีตำแหน่งในผัง). หลักฐาน:
- **โค้ดปฏิบัติต่างจากประจำ** (`admin-table.php:125`): type 1/5/6/7 → `startDate=endDate='0000-00-00'` = **ไม่ผูกวันเริ่ม/สิ้นสุดสัญญา** (ต่างจากทดลองงาน/ฝึกงาน/สหกิจ ที่บังคับใส่ช่วงเวลา) · ปกติไม่มีเงินเดือนประจำ (จ่ายเป็นงาน/ค่าเที่ยว)
- **มีจริง 2 จุดในผัง**: **Driver** (partner 3 คน — คนขับเจ้าของรถรับจ้างวิ่ง) + IT Project Manager (1 — outsource ทำระบบ)
- **เมนู HR แยก Partner เป็นหมวดใหญ่** พร้อม sub-filter ละเอียดสุดในระบบ:
  `Partner ทั้งหมด` → `All Partner` · `Messenger` · `Shipping Clearance` · `Import` · `Export` · `Import & Export` · **`Driver` → แยกชนิดรถ**: ทั้งหมด/4ล้อ/6ล้อ/10ล้อ/หัวลาก 20'/หัวลาก 40'
- **owner เคาะ (2026-08-03): เอาครบตาม PCS — คนขับแยกชนิดรถด้วย** (ไม่ตัดทิ้ง)

## 3. tb_admin — 44 คอลัมน์ (สิ่งที่ 1 row เก็บ)

ตำแหน่ง: `companyType`+`department`+`section`+`adminType` · การจ้าง: `startDate`/`endDate`/`endDateOfLogin`/`salary`/`salaryType`/`expiryDate` ·
สถานะ: `adminStatusA`(1ทำงาน/0ออก)+`adminDel`/`dateDel`(soft-del) · `adminStatusSale`(ธงเซลรับงาน) · `adminTMP`(พักรับออเดอร์) ·
ตัวตน: `adminID`/`adminName`/`adminLastName`/`adminNickname`/`adminSex`/`adminBirthday`/`nationalIDCard`+ไฟล์/ทะเบียนบ้าน/เรซูเม่/`religion`/`nationality`/`maritalStatus` ·
ติดต่อ: `adminEmail`+`adminEmailOrg` · `adminTel`+`adminTelOrg` · `adminPicture` · `adminLineTokenNotify` ·
auth: `adminPass`(passTam hash) · `pcs_admin_logged` · `statusResetPass` · `adminLastLogin` · `adminIDCreate`.
⚠️ `adminStatus` มีคอลัมน์แต่**ว่างทั้ง 167 แถว = ไม่ใช้**.

## 4. ตารางลูก (INSERT พร้อม row · admin-table.php POST)

| ตาราง | เก็บอะไร | dictionary แม่ |
|---|---|---|
| `tb_admin_address` | ที่อยู่ปัจจุบัน | — |
| `tb_education_background` | ประวัติการศึกษา (ระดับ/สถาบัน/คณะ/สาขา/ปีจบ/GPA · หลายแถว) | — |
| `tb_org_email_ships` | ผูกอีเมลองค์กร → พนักงาน | `tb_organization_email` |
| `tb_org_line_ships` | ผูก LINE องค์กร | `tb_organization_line` |
| `tb_org_wechat_ships` | ผูก WeChat องค์กร | `tb_organization_wechat` |
| `tb_org_tell_ships` | ผูกเบอร์องค์กร | `tb_organization_tell` |

⇒ อีเมล/ไลน์/wechat/เบอร์ "องค์กร" = ทรัพย์สินบริษัทที่**แจกจ่ายให้พนักงาน** (1 ช่องทาง → ผูกได้) มีหน้าจัดการแยกใน HR menu (`organization-email/line/wechat/tell.php`).

## 5. reset รหัสผ่าน (admin-table.php:237)
`UPDATE tb_admin SET adminPass=passTam(...), pcs_admin_logged='' WHERE adminID=...`
→ ตั้งรหัสใหม่ + เตะ session ปัจจุบันหลุด. (เรามีปุ่ม reset บน profile แล้ว)

## 6. ทะเบียนพนักงาน — filter ทั้งหมด (menu-hr · admin-table.php)
- `?s=1` ทำงานอยู่ · `?s=2` ลาออก/หมดเวลา
- `?type=1` ประจำ · `?type=3and4` ฝึกงาน+สหกิจ · `?type=5` partner · `?type=7` คนในบ้าน
- `?type=5&position=` messenger / shipping-clearance / shipping-import / shipping-export / shipping-importAndExport / **driver**
- `?position=driver&truck-type=` all / 4Wheels / 6Wheels / 10Wheels / tractorHead20ft / tractorHead40ft
- `?c=1/2/3` กรองตามบริษัท (Pacred = ตัดทิ้ง เหลือบริษัทเดียว)

## 7. หน้าโปรไฟล์พนักงาน — 12 section (admin-profile.php)
ข้อมูลตำแหน่งงาน · ข้อมูลทั่วไปพนักงาน · ที่อยู่ปัจจุบัน · แก้ไข/ปรับตำแหน่งรูปโปรไฟล์ ·
**กระเป๋าสตางค์สำรองจ่าย** (`tb_account_pcs`) · **KPI ที่ได้** · **วันลาที่เหลือ** (`tas_leave`) · **โบนัสที่ได้** ·
ข้อมูลทั่วไป(องค์กร) · **รายชื่อบัญชีธนาคารในระบบ** (`admin-acc.php`) · ประวัติการศึกษาทั้งหมด.
🟡 KPI/โบนัส/เงินเดือน ใน PCS = โครงมีแต่ยังไม่ทำจริง (เมนูชี้ `admin.php?s=all`) — เฟสท้ายสุด.

## 8. Time-attendance (`tas_leave`/`tas_holiday`/`tas_holiday_maid`)
ลา 4 ชนิด (ป่วย/กิจ/พักร้อน/คลอด) · **อนุมัติ 2 ชั้น** `adminIDHR` + `adminIDCEO` (คอลัมน์บน tas_leave) ·
วันหยุด แยกพนักงาน/แม่บ้าน · บันทึกเข้างานจากเครื่องสแกนประตู + มือถือ + สรุป.

---

## 9. โมเดลหัวหน้า = แบบ PCS (owner เคาะรอบ 2)

PCS ไม่มี "ธงหัวหน้า" — **section เอง = ตำแหน่ง** และหัวหน้าคือ **section แยกกล่อง**
(เช่น HR มี section "HRManager"(2) + "HR"(3) เป็นคนละ section). ดังนั้น:
- กล่องหัวหน้า/Supervisor = **1 ตำแหน่งจริงในผัง โควตา 1**
- เลื่อนตำแหน่ง = **ย้ายคน**: เปลี่ยน `section` ของ row นั้นจากกล่องทีม → กล่องหัวหน้า
  → ช่องทีมว่างลง 1 · หัวหน้าเต็ม · **จำนวนคนรวมในแผนกเท่าเดิม · ไม่รับคนเพิ่ม**
- สิทธิ์/เมนู ผูกที่ **section** → หัวหน้าเห็นเมนูมากกว่าลูกทีม เพราะเป็นคนละ section (คนละไฟล์เมนูใน left-menu switch)

## 10. Pacred — ต่างจาก PCS ตรงไหน (owner สั่ง)
1. **บริษัทเดียว** = ตัด `companyType` (PCS 3 บริษัท → Pacred 1) · ผัง = แผนก → ตำแหน่ง 2 ชั้น
2. **9 แผนก** (จากดราฟที่ owner เคาะ): HR · Accounting · Marketing · ITDT · Operations · Customs Specialist · Freight Export · Freight Import · Logistics
3. **บางตำแหน่งเปลี่ยนชื่อ/เพิ่มใหม่** — owner จะบอกตอนจัด row (เช่น Operations รวม Sales+CS+Purchasing+Pricing = ต่างจาก PCS ที่แยก Sales/CS-Purchasing คนละแผนก)
4. ผัง **แก้จากหลังบ้านได้** (PCS hardcode ใน dataJson.php — เราเก็บ DB table แทน)
5. รหัสพนักงาน **AD####** (มีแล้ว mig 0199) แยก pool จากลูกค้า PR

## 11. ลำดับ build (รอ owner สั่ง "ลุย")
1. **ตาราง org** (บริษัท 1 · แผนก · ตำแหน่ง + โควตา em/in/pa) แก้หลังบ้านได้ + seed จากดราฟ → หน้า `/admin/hr/org-chart` render แบบดราฟเป๊ะ · ยุบผังเก่า `org_*` (mig 0017 · วาดเล่น ไม่มี consumer)
2. **Row พนักงาน** = ฟอร์ม 4 บล็อก (§1) + adminType 7 แบบ + ตารางลูก (address/education/org-ships) → ทะเบียน filter (§6) → ย้ายคนจริง ~27 คนเข้า row
3. **section → สิทธิ์/เมนู** (ต่อยอด admin_positions mig 0221 · หัวหน้า section = เมนูมากกว่าลูกทีม)
4. โปรไฟล์ 12 section (§7) · time-attendance (§8) — เฟสถัดไป · KPI/เงินเดือน ท้ายสุด

---

## 12. เฟส 2 — owner-decisions (2026-08-03 · จอ prod)

**ล็อกคนออก (12 คน · applied prod · ย้อนได้):** admin_admin_man · admin_admin_put ·
admin_alongkor · admin_beer · admin_jane · admin_pod · admin_pupu · admin_saiu_4 ·
admin_tam · admin_toey · admin_vam · admin_wave — ล็อก 4 ชั้น: ban auth.users +
admins.is_active=false + profiles.is_active=false + tb_admin.adminStatusA='0'.
`scripts/hr-lock-and-assign-2026-08-03.mjs` (backup /tmp) · **ปลดล็อก = un-ban +
set is_active กลับ** (owner กดเปิดทีหลัง · "ค่อยว่ากัน"). active 32→20.

**จัดตำแหน่ง (applied):** admin_pop + admin_nat → **CEO** (โควตา CEO=2 · 2/2 เขียว) ·
admin_ben → **Driver** · admin_keetar → **Warehouse**.

**🔴 ค้าง — owner เคาะ:**
- **admin_moo (=Driver) · admin_sunta (=Graphic/Editing) ไม่มีใน tb_admin เลย**
  ("คนที่หายไป") → ต้องสร้าง row ใหม่ หรือรหัสต่างจากนี้? (ไม่เดา ไม่สร้างผี)
- **admin_ben = ซ้ำซ้อน+ข้อมูลหาย** (owner แจ้ง) → จัดเป็น Driver ไปก่อน · ต้องเคลียร์
  ข้อมูลซ้ำทีหลัง

**งาน/สิทธิ์ที่ row มองเห็น (เฟส 4 · owner):** Driver = เอาของ **admin_ben** ·
Warehouse = เอาตาม **admin_keetar** (ปอน+ภูมิเก็บ 2 หน้านี้ไว้เยอะแล้ว) → ตอนผูก
ตำแหน่ง→role/menu ใช้ 2 คนนี้เป็น template.

**ค่าตำแหน่ง/เงินเดือน (mig 0289 · single-source ยืนยัน):** พนักงาน 1 คน →
`tb_admin.org_unit_id` link เดียว → เงินเดือน/ประเภทจ้าง (tb_admin) + ค่าตำแหน่ง
(hr_org_units.position_allowance) + แผนก (derive จาก parent_id) — ไม่เก็บซ้ำที่ไหน.
