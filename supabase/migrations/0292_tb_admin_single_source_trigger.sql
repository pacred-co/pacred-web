-- 0292 — tb_admin = แหล่งเดียวของข้อมูลพนักงาน (owner 2026-08-05)
-- ═══════════════════════════════════════════════════════════════════════
-- owner: "เอาทุกอย่างเข้ามาใช้ใน tb_admin ไปเลยสิครับ ใช้ที่เดียวจบๆ ...
--         ไม่งั้นตอนมีคนใหม่ หรือ ลูกค้าใหม่ หรือ พาร์ทเนอร์ กระทบหมด
--         ถ้าไม่ได้ดึงจากที่ที่เดียว"
--
-- ปมเดิม: ข้อมูลพนักงานอยู่ 2 ตาราง (profiles=login · tb_admin=HR+ที่ลูกค้าเห็น)
-- ต้องเขียน 2 ที่ให้ตรงกัน = เปราะ (drift bug). 89 ไฟล์ + เซล/CS ที่ลูกค้าเห็น
-- อ่าน tb_admin อยู่แล้ว → ทำ tb_admin เป็นแกนเดียว.
--
-- profiles เอาออกไม่ได้ (Supabase Auth บังคับใช้เป็นกุญแจ login/RLS) → ทำเป็น
-- "เงาที่ sync อัตโนมัติ" ด้วย DB trigger: เขียน tb_admin ที่เดียว → trigger
-- มิเรอร์ ชื่อ/นามสกุล/เบอร์/รูป/เพศ/วันเกิด/ตำแหน่ง ไป profiles ให้เอง.
-- ⇒ กรอกที่เดียว (tb_admin) · ทุก surface ตรงกัน · ไม่มี drift เชิงโครงสร้าง.
-- ═══════════════════════════════════════════════════════════════════════

-- (1) one-time: sync org_unit_id ที่ค้าง (tb_admin ← profiles ที่เคยเป็น spine
--     ชั่วคราว mig 0290) — moo: CEO(ค้าง) → Driver. identity ห้ามแตะ (tb_admin
--     ของ 18 คนเดิมสมบูรณ์กว่า profiles → copy กลับจะทับหาย).
update tb_admin a
set org_unit_id = p.org_unit_id
from profiles p
where p.admin_login_id = a."adminID"
  and p.is_active = true
  and p.org_unit_id is not null
  and a.org_unit_id is distinct from p.org_unit_id;

-- (2) trigger: tb_admin = แหล่งเดียว → มิเรอร์ไป profiles (login shim) อัตโนมัติ
create or replace function sync_tb_admin_identity_to_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set
    first_name = new."adminName",
    last_name  = coalesce(new."adminLastName", ''),
    -- เบอร์ว่างเก็บเป็น placeholder na-<id> ใน tb_admin (UNIQUE) → profiles เก็บว่าง
    phone      = case when new."adminTel" like 'na-%' then '' else coalesce(new."adminTel", '') end,
    avatar_url = nullif(new."adminPicture", ''),
    sex        = new."adminSex",
    birthday   = nullif(new."adminBirthday"::text, '')::date,
    org_unit_id = new.org_unit_id
  where admin_login_id = new."adminID";
  return new;
end;
$$;

drop trigger if exists trg_sync_tb_admin_identity on tb_admin;
create trigger trg_sync_tb_admin_identity
  after insert or update of
    "adminName", "adminLastName", "adminTel", "adminPicture",
    "adminSex", "adminBirthday", org_unit_id
  on tb_admin
  for each row
  execute function sync_tb_admin_identity_to_profiles();

comment on function sync_tb_admin_identity_to_profiles() is
  'owner 2026-08-05: tb_admin = แหล่งเดียวข้อมูลพนักงาน → มิเรอร์ identity+ตำแหน่งไป profiles (login shim) อัตโนมัติ กัน drift';
