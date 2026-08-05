# 🔴 HR — ข้อมูลพนักงานอยู่ 2 ตาราง (ยังไม่ unified) — แผนแก้ (2026-08-03)

> owner จับได้ (จอ /admin/admins): "DB นายเข้าไม่ถึงทั้งหมดหรอ · ดึงจากที่เดียวกัน
> ได้จริงหรอ" — **ถูก 100%**. เฟส 2 ที่ทำไป ผูก org_unit_id ไว้บน `tb_admin`
> อย่างเดียว ซึ่ง **ไม่ใช่รายชื่อพนักงานที่ครบ**. ต้อง unify ก่อนถึงจะ "ที่เดียว" จริง.

## ความจริงของ DB (verify แล้ว prod · authoritative)

พนักงานอยู่ **2 ตารางที่ไม่ตรงกัน**:

| ตาราง | active | เป็น SOT ของ | ขาด |
|---|---|---|---|
| **`profiles`** (+`admins` role · +auth.users) | **21** | login · role/สิทธิ์ · ตัวตน (AD### · admin_login_id · sex/birthday) | **HR detail** (salary/religion/address/education/44 field) |
| **`tb_admin`** (PCS HR record) | **20** | HR detail ครบ (44 คอลัมน์) | login · role |

**overlap ไม่ครบ:**
- เฉพาะ profiles (ไม่มีใน tb_admin): **admin_moo** (AD028·role driver) · **admin_sunta** (AD025·เหนือตะวัน·super) · **admin_tiger** (AD024·ปริญญา·no role)
- เฉพาะ tb_admin (ไม่มี login profile): **admin_got** · **admin_center**

⇒ moo/sunta/tiger จัดตำแหน่งผ่านหน้า /admin/hr/staff **ไม่ได้** (หน้านั้นอ่าน tb_admin) —
นี่คือ bug ที่ owner เจอ. join key ระหว่าง 2 ตาราง = `profiles.admin_login_id == tb_admin.adminID`.

## 🔴 แผนแก้ (ต่อ Mac · session หน้า) — profiles = SPINE

**`profiles` = แกนหลักพนักงาน** (เพราะเป็น login+role source + ครบกว่า + AD### อยู่ตรงนี้) ·
`tb_admin` = ดาวเทียม HR detail (join บน adminID = admin_login_id).

1. **mig ใหม่: ย้าย `org_unit_id` ไป `profiles`** (แกน) — migrate 4 คนที่จัดไว้บน
   tb_admin (pop/nat/ben/keetar) → profiles · เลิกอ่าน tb_admin.org_unit_id (กัน drift).
2. **loaders (hr-staff.ts / hr-org.ts) อ่านจาก profiles** (roster ครบ 21) LEFT JOIN
   tb_admin (adminType/salary/HR) + admins (role) → ผัง + ทะเบียน เห็นครบทุกคน.
   นับสด per position จาก profiles.org_unit_id.
3. **assign action เขียน profiles.org_unit_id** (ไม่ใช่ tb_admin).
4. **got/center** (มี tb_admin ไม่มี profile) — เคาะ: สร้าง profile ให้ (ก๊อต=ที่ปรึกษา ·
   center=เซลส่วนกลาง = บัญชีร่วม?) หรือกันออกจาก roster.
5. **ทำฟอร์มเพิ่ม/แก้พนักงาน** (PCS 4 บล็อก) → **เขียนทั้ง profiles (login/identity) +
   tb_admin (HR detail) พร้อมกัน** เพื่อไม่ให้ split อีก (moo/sunta ที่หายจาก tb_admin =
   เคยสร้างผ่าน /admin/admins ที่เขียนแค่ profiles).

## 🔴 admin_win = หัวหน้า + Cs check (owner: "มันเชื่อมกันยัง")

win อยู่ทั้ง profiles + tb_admin (active). owner บอก win เป็น **Customs Supervisor ด้วย
และ Cs check ด้วย**. โมเดลปัจจุบัน = **1 คน 1 ตำแหน่ง** (org_unit_id เดียว · แบบ PCS
section เดียว). PCS model: หัวหน้า = คนที่เลื่อนจากทีม → win นั่ง "Supervisor" (ซึ่ง
โดยหน้าที่ = senior Cs check อยู่แล้ว) = 1/1. **เคาะ owner:**
- (ก) win = Supervisor เดียว (หัวหน้าทำ Cs check ในตัว · แบบ PCS) — ง่าย ไม่ต้องแก้โมเดล
- (ข) 1 คนอยู่ได้หลายตำแหน่ง (นับหัวทั้ง Supervisor + Cs check) — ต้องทำ many-to-many
  (person ↔ positions) ซึ่ง PCS ไม่มี · กระทบการนับโควตา/เงินเดือน

## สถานะเฟส 2 ตอนปิด session (dave-pacred2 · ยังไม่ main)
- ✅ ผัง (mig 0287) · หน้าจัด (mig 0288 tb_admin.org_unit_id) · ค่าตำแหน่ง (mig 0289) ·
  ล็อกคนออก 12 · จัด 4 คน (pop/nat→CEO · ben→Driver · keetar→Warehouse) · เส้นลงตรง Manager
- ❌ **ยังไม่ unify profiles↔tb_admin** — หน้า staff อ่าน tb_admin เลย moo/sunta/tiger หาย
  = งานหลักของ session หน้า (ข้อ 1-5 ข้างบน)

---

## ✅ UNIFY เสร็จ (2026-08-03 ค่ำ · mig 0290)

**profiles = SPINE แล้ว** — `mig 0290` เพิ่ม `profiles.org_unit_id` + migrate ค่าที่จัดไว้
บน tb_admin (19 คน owner กดจัดตอน local) → profiles. loaders (hr-staff.ts) rewrite อ่าน
**profiles active staff LEFT JOIN tb_admin(HR) + admins(role)** · assign เขียน profiles.org_unit_id.

**ผลลัพธ์ (verify จอจริง + prod):**
- roster 20→**21 คน** (moo/sunta/tiger เข้ามาครบ · เคยหายเพราะอ่าน tb_admin)
- คนไม่มี HR record (moo/sunta/tiger) ขึ้นธง ⚠ "ไม่มี HR" — จัดตำแหน่งได้ปกติ
- จัด moo→Driver, sunta→Graphic/Editing → **ผังนับสด Driver 2/2 เขียว · Graphic 1/4**
  (พิสูจน์ moo/sunta นับเข้าผังจริง)
- แสดง role badge (ultra/driver/warehouse/เซล) จาก admins → เห็นสิทธิ์ในตัว

**🟡 เหลือ (owner เคาะ):**
- **tiger (AD024·ปริญญา)** ยังไม่จัดตำแหน่ง (owner ไม่ได้ระบุ)
- **moo/sunta/tiger ไม่มี tb_admin HR detail** → เติมตอนทำฟอร์มพนักงานเต็ม (เขียน 2 ตาราง)
  หรือสร้าง tb_admin row
- **admin_center** (tb_admin only · ไม่มี profile · = เซลส่วนกลาง บัญชีร่วม) → กันออกจาก
  roster ถูกแล้ว (ไม่ใช่คนจริง) · ถ้าเป็นคนจริงต้องสร้าง profile
- **admin_win = หัวหน้า Customs + Cs check** — ยังเป็น 1คน1ตำแหน่ง · เคาะ many-to-many ไหม

---

## ✅✅ FINAL AUDIT (2026-08-03 ค่ำ · owner "ดูทุก table ให้ครบ")

**audit ทุกตารางที่เก็บคน (verify prod):**
- `profiles` 9,479 (ลูกค้า+staff) · **staff = 28** (admin_login_id != null) · **active 21**
- `tb_admin` 32 (HR record · active 20) · `admins` 44 grants (**21 profile มี role active**)
- **admins active-role (21) == profiles staff active (21) เป๊ะ · role ลอย (ไม่มี profile) = 0**
  ⇒ ทุกคนที่มีสิทธิ์ = staff profile · ไม่มีคนตกหล่น · **profiles = roster สมบูรณ์**

**owner-decision รอบนี้:**
1. **admin_tiger ออกแล้ว → ล็อก** (profiles.is_active=false + admins + ban auth + tb_admin) → active 21→**20**
2. **admin_win = ตาม PCS** (1คน1ตำแหน่ง) — อยู่ **Customs Supervisor (cus-sup)** อยู่แล้ว (owner จัดตอน local) · หัวหน้าทำ Cs check ในตัว = ถูกต้อง ไม่แก้โมเดล
3. **ดูทุก table = ครบแล้ว** (ข้างบน)

**🎯 roster สุดท้าย: staff active 20 · จัดตำแหน่งครบ 20/20 (0 ยังไม่จัด)** — ผังนับสดจาก
profiles ที่เดียว · หน้าบ้าน-หลังบ้านดึงตำแหน่ง/สิทธิ์จาก link เดียว (profiles.org_unit_id +
admins.role) เห็นครบทุกคน = ตอบโจทย์ owner "ดึงจากที่เดียวกัน · เห็นรวม".

**🟡 เหลือ (งานต่อ · ไม่บล็อก):** moo/sunta ไม่มี tb_admin HR detail → เติมตอนทำฟอร์ม
พนักงานเต็ม (เขียน profiles+tb_admin พร้อมกัน · กัน split) · admin_center = บัญชีร่วม (กันออกถูก).
