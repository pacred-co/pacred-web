-- ════════════════════════════════════════════════════════════
-- 0294 · HR การลา — คำขอลา 2 ชั้น (HR อนุมัติ → CEO อนุมัติ)
-- ════════════════════════════════════════════════════════════
-- owner (item 4b): พนักงานยื่นใบลา → HR อนุมัติก่อน → CEO อนุมัติปิดท้าย.
-- faithful PCS: การลาแบบ 2-tier approval. status flow เส้นเดียว:
--   pending → hr_approved → approved   (ปฏิเสธได้ที่ pending/hr_approved → rejected)
--
-- admin_login_id = พนักงานผู้ยื่น (= profiles.admin_login_id = tb_admin.adminID · spine key เดียวกับ HR staff).
-- reference table (ไม่แตะเงิน) · additive · idempotent. RLS: read = authenticated ·
-- เขียนผ่าน service-role (createAdminClient) เท่านั้น (action re-gate 2 ชั้นเอง).
-- ⚠️ NOT APPLIED (dev unreachable → คิว reconcile · owner apply prod).
-- ════════════════════════════════════════════════════════════

create table if not exists public.hr_leave_request (
  id               uuid primary key default gen_random_uuid(),
  admin_login_id   text not null,            -- พนักงานผู้ยื่น (profiles.admin_login_id)
  leave_type       text,                     -- ลากิจ / ลาป่วย / ลาพักร้อน / อื่นๆ
  start_date       date not null,
  end_date         date not null,
  days             numeric,                  -- จำนวนวันลา (รวมวันเริ่ม-สิ้นสุด)
  reason           text,
  status           text not null default 'pending'
    check (status in ('pending','hr_approved','approved','rejected')),
  hr_approved_by   text,                     -- ผู้อนุมัติชั้น HR (auth id ของแอดมิน)
  hr_approved_at   timestamptz,
  ceo_approved_by  text,                     -- ผู้อนุมัติชั้น CEO (auth id ของแอดมิน)
  ceo_approved_at  timestamptz,
  reject_reason    text,
  created_at       timestamptz not null default now()
);
create index if not exists hr_leave_request_login_idx  on public.hr_leave_request (admin_login_id);
create index if not exists hr_leave_request_status_idx on public.hr_leave_request (status);

alter table public.hr_leave_request enable row level security;
drop policy if exists hr_leave_request_read on public.hr_leave_request;
create policy hr_leave_request_read on public.hr_leave_request for select to authenticated using (true);
-- เขียนผ่าน service-role (createAdminClient) เท่านั้น — ไม่มี write policy = แอดมิน API เท่านั้น

comment on table public.hr_leave_request is 'HR การลา (item 4b · owner) — คำขอลา 2 ชั้น pending->hr_approved->approved (ปฏิเสธ->rejected) · HR อนุมัติก่อน CEO ปิดท้าย · admin_login_id = ผู้ยื่น';
