-- ════════════════════════════════════════════════════════════
-- 0287 · HR ผังองค์กร Pacred — บริษัทเดียว · แก้จากหลังบ้านได้
-- ════════════════════════════════════════════════════════════
-- owner 2026-08-03: "ใช้แบบ PCS แต่ยุบเหลือบริษัทเดียว Pacred · แยกแผนก ·
--   หัวหน้า = แบบ PCS (ตำแหน่งจริง เลื่อน=ย้ายคน) · Manager+AUDIT+QC = คนเดียวกัน ·
--   เอา PCS มาให้หมดจดก่อน ค่อยต่อยอด"
--
-- ตารางต้นไม้เดียว (company → position CEO → position Manager·AUDIT/QC →
-- department → position) — แก้จากหลังบ้านได้ (ไม่ hardcode เหมือน PCS dataJson.php).
--   • quota_*  = โควตาเป้าหมาย (พนักงาน/ฝึกงาน/partner)
--   • have_*   = คนจริงตอนนี้ (seed จากผังที่ owner วาด · แก้ได้) → เฟส 2 จะสลับ
--                ไปนับสดจาก row พนักงานที่ย้ายเข้าตำแหน่ง (employee↔position link)
--   • is_head  = ตำแหน่งหัวหน้า/Supervisor (สิทธิ์มากกว่าลูกทีม · เฟส 4 ผูก role/menu)
--
-- แทนที่ผังเก่า org_branches/org_sections/org_positions (mig 0017 · วาดเล่น
-- ไม่ตรงงานจริง · หน้า org-chart/org-table เดิม repoint มาตารางนี้). ตารางเก่า
-- ไม่ drop (เก็บไว้ย้อน · ห้ามงานหาย) — แค่เลิกอ่าน.
-- Additive · idempotent · apply prod (dev unreachable → คิว reconcile).
-- ════════════════════════════════════════════════════════════

create table if not exists public.hr_org_units (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  parent_id        uuid references public.hr_org_units(id) on delete cascade,
  kind             text not null check (kind in ('company','department','position')),
  name_th          text not null,
  name_en          text,
  band             smallint,                      -- แถวเรียงแผนกบนผัง (1/2) · null = อื่น
  is_head          boolean not null default false,-- หัวหน้า/Supervisor (PCS model)
  sort_order       integer not null default 0,
  quota_employee   integer not null default 0,
  quota_internship integer not null default 0,
  quota_partner    integer not null default 0,
  have_employee    integer not null default 0,    -- seed · เฟส 2 -> นับสดจาก row พนักงาน
  have_internship  integer not null default 0,
  have_partner     integer not null default 0,
  role_key         text,                          -- เฟส 4: map -> workspace_role/menu
  note             text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists hr_org_units_parent_idx on public.hr_org_units (parent_id);
create index if not exists hr_org_units_band_idx   on public.hr_org_units (band) where band is not null;

alter table public.hr_org_units enable row level security;
drop policy if exists hr_org_units_read on public.hr_org_units;
create policy hr_org_units_read on public.hr_org_units for select to authenticated using (true);
-- เขียนผ่าน service-role (createAdminClient) เท่านั้น — ไม่มี write policy = แอดมิน API เท่านั้น

comment on table public.hr_org_units is 'ผังองค์กร Pacred (owner 2026-08-03) — company->CEO->Manager AUDIT/QC->department->position · แก้จากหลังบ้าน · have_* seed จากผังที่วาด เฟส 2 นับสดจาก row พนักงาน';

delete from public.hr_org_units where code in ('pacred','ceo','head','hr','hr-sup','hr-staff','maid','acc','acc-sup','acc-admin','mkt','mkt-sup','mkt-data','mkt-graphic','it','it-pm','it-fe','it-be','it-fs','ops','ops-sales','ops-cs','ops-pur','ops-price','cus','cus-sup','cus-check','cus-doc','cus-clr','fex','fex-sup','fex-doc','fex-ship','fex-clr-h','fex-clr','fim','fim-sup','fim-doc','fim-ship','fim-clr-h','fim-clr','log','log-sup','log-wh','log-drv','log-msg');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('pacred',null,'company','Pacred','Pacred',null,false,0,0,0,0,0,0,0,'บริษัทเดียว (owner 2026-08-03)');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('ceo',(select id from public.hr_org_units where code='pacred'),'position','CEO','CEO',null,true,1,1,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('head',(select id from public.hr_org_units where code='ceo'),'position','Manager AUDIT/QC','Manager AUDIT/QC',null,true,2,1,0,0,0,0,0,'คนเดียวกัน คุมทุกแผนก + ตรวจสอบในตัว');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('hr',(select id from public.hr_org_units where code='head'),'department','HR','HR',1,false,3,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('hr-sup',(select id from public.hr_org_units where code='hr'),'position','HR Supervisor','HR Supervisor',null,true,4,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('hr-staff',(select id from public.hr_org_units where code='hr'),'position','HR','HR',null,false,5,4,1,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('maid',(select id from public.hr_org_units where code='hr'),'position','Maid','Maid',null,false,6,1,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('acc',(select id from public.hr_org_units where code='head'),'department','Accounting','Accounting',1,false,7,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('acc-sup',(select id from public.hr_org_units where code='acc'),'position','Accounting Supervisor','Accounting Supervisor',null,true,8,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('acc-admin',(select id from public.hr_org_units where code='acc'),'position','Admin Accounting','Admin Accounting',null,false,9,2,1,0,2,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('mkt',(select id from public.hr_org_units where code='head'),'department','Marketing','Marketing',1,false,10,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('mkt-sup',(select id from public.hr_org_units where code='mkt'),'position','Marketing Supervisor','Marketing Supervisor',null,true,11,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('mkt-data',(select id from public.hr_org_units where code='mkt'),'position','Data Analyst','Data Analyst',null,false,12,2,1,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('mkt-graphic',(select id from public.hr_org_units where code='mkt'),'position','Graphic/Editing','Graphic/Editing',null,false,13,4,1,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('it',(select id from public.hr_org_units where code='head'),'department','ITDT','ITDT',1,false,14,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('it-pm',(select id from public.hr_org_units where code='it'),'position','Project Manager','Project Manager',null,false,15,1,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('it-fe',(select id from public.hr_org_units where code='it'),'position','Front End','Front End',null,false,16,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('it-be',(select id from public.hr_org_units where code='it'),'position','Back End','Back End',null,false,17,1,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('it-fs',(select id from public.hr_org_units where code='it'),'position','Full Stack','Full Stack',null,false,18,1,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('ops',(select id from public.hr_org_units where code='head'),'department','Operations','Operations',2,false,19,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('ops-sales',(select id from public.hr_org_units where code='ops'),'position','Sales','Sales',null,false,20,4,0,0,4,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('ops-cs',(select id from public.hr_org_units where code='ops'),'position','Customer Service','Customer Service',null,false,21,2,0,0,2,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('ops-pur',(select id from public.hr_org_units where code='ops'),'position','Purchasing','Purchasing',null,false,22,2,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('ops-price',(select id from public.hr_org_units where code='ops'),'position','Pricing','Pricing',null,false,23,2,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('cus',(select id from public.hr_org_units where code='head'),'department','Customs Specialist','Customs Specialist',2,false,24,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('cus-sup',(select id from public.hr_org_units where code='cus'),'position','Supervisor','Supervisor',null,true,25,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('cus-check',(select id from public.hr_org_units where code='cus'),'position','Cs check','Cs check',null,false,26,1,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('cus-doc',(select id from public.hr_org_units where code='cus'),'position','Doc','Doc',null,false,27,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('cus-clr',(select id from public.hr_org_units where code='cus'),'position','Clearance','Clearance',null,false,28,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fex',(select id from public.hr_org_units where code='head'),'department','Freight Export','Freight Export',2,false,29,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fex-sup',(select id from public.hr_org_units where code='fex'),'position','Export Supervisor','Export Supervisor',null,true,30,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fex-doc',(select id from public.hr_org_units where code='fex'),'position','Doc Freight Export','Doc Freight Export',null,false,31,4,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fex-ship',(select id from public.hr_org_units where code='fex'),'position','Doc Shipping Export','Doc Shipping Export',null,false,32,2,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fex-clr-h',(select id from public.hr_org_units where code='fex'),'position','Shipping Clearance Export หัวหน้า','Shipping Clearance Export (Head)',null,true,33,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fex-clr',(select id from public.hr_org_units where code='fex'),'position','Shipping Clearance Export','Shipping Clearance Export',null,false,34,2,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fim',(select id from public.hr_org_units where code='head'),'department','Freight Import','Freight Import',2,false,35,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fim-sup',(select id from public.hr_org_units where code='fim'),'position','Import Supervisor','Import Supervisor',null,true,36,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fim-doc',(select id from public.hr_org_units where code='fim'),'position','Doc Freight Import','Doc Freight Import',null,false,37,4,0,0,2,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fim-ship',(select id from public.hr_org_units where code='fim'),'position','Doc Shipping Import','Doc Shipping Import',null,false,38,2,0,0,1,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fim-clr-h',(select id from public.hr_org_units where code='fim'),'position','Shipping Clearance Import หัวหน้า','Shipping Clearance Import (Head)',null,true,39,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('fim-clr',(select id from public.hr_org_units where code='fim'),'position','Shipping Clearance Import','Shipping Clearance Import',null,false,40,2,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('log',(select id from public.hr_org_units where code='head'),'department','Logistics','Logistics',2,false,41,0,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('log-sup',(select id from public.hr_org_units where code='log'),'position','Warehouse Supervisor','Warehouse Supervisor',null,true,42,1,0,0,0,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('log-wh',(select id from public.hr_org_units where code='log'),'position','Warehouse','Warehouse',null,false,43,2,0,0,2,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('log-drv',(select id from public.hr_org_units where code='log'),'position','Driver','Driver',null,false,44,2,0,2,2,0,0,'');
insert into public.hr_org_units (code,parent_id,kind,name_th,name_en,band,is_head,sort_order,quota_employee,quota_internship,quota_partner,have_employee,have_internship,have_partner,note) values ('log-msg',(select id from public.hr_org_units where code='log'),'position','Messenger','Messenger',null,false,45,2,0,0,0,0,0,'');
