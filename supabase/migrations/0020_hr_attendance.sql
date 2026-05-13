-- ════════════════════════════════════════════════════════════
-- Phase H · HR — Time Attendance (TAS) + Leave Management
-- ════════════════════════════════════════════════════════════
-- Two related operational tables:
--   1. attendance_logs   — one row per (profile, work_date) with
--                          clock_in / clock_out and computed status.
--                          Currently populated manually by HR. Future:
--                          biometric device + employee self-service.
--   2. leave_requests    — vacation/sick/personal/etc. requests with
--                          a pending/approved/rejected lifecycle. Admin
--                          (super) approves; once approved, the matching
--                          attendance_log days are auto-marked 'leave'.
--
-- Default schedule (org-wide for now): 08:30 - 17:30 with 15-min grace
-- on clock-in. Per-employee or per-department schedule can be added
-- later via admin_contact_extras.
-- ════════════════════════════════════════════════════════════

-- ── attendance_logs ──
create table if not exists public.attendance_logs (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  work_date       date not null,

  clock_in        timestamptz,
  clock_out       timestamptz,
  expected_in     time not null default '08:30',
  expected_out    time not null default '17:30',

  status          text not null default 'absent'
                    check (status in (
                      'present',    -- clock_in & on time
                      'late',       -- clock_in > expected_in + grace
                      'early_leave',-- clock_out < expected_out
                      'absent',     -- no clock_in by end of day
                      'leave',      -- approved leave_request covers this day
                      'holiday',    -- public holiday / company off
                      'off'         -- regular day off (sat/sun)
                    )),
  late_minutes    int  not null default 0,
  worked_minutes  int  not null default 0,

  location        text,
  source          text not null default 'manual'
                    check (source in ('web','biometric','manual','import')),
  note            text,

  recorded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, work_date)
);

drop trigger if exists attendance_logs_updated_at_trigger on public.attendance_logs;
create trigger attendance_logs_updated_at_trigger before update on public.attendance_logs
  for each row execute function public.set_updated_at();

create index if not exists attendance_logs_date_idx on public.attendance_logs(work_date desc, status);
create index if not exists attendance_logs_profile_idx on public.attendance_logs(profile_id, work_date desc);

-- ── leave_requests ──
create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  leave_type      text not null
                    check (leave_type in ('vacation','sick','personal','maternity','marriage','funeral','unpaid','other')),
  start_date      date not null,
  end_date        date not null,
  days_count      numeric(4,1) not null default 1.0 check (days_count > 0),
  reason          text,

  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected','cancelled')),
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  approval_note   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (end_date >= start_date)
);

drop trigger if exists leave_requests_updated_at_trigger on public.leave_requests;
create trigger leave_requests_updated_at_trigger before update on public.leave_requests
  for each row execute function public.set_updated_at();

create index if not exists leave_requests_status_idx on public.leave_requests(status, start_date desc);
create index if not exists leave_requests_profile_idx on public.leave_requests(profile_id, start_date desc);
create index if not exists leave_requests_pending_idx on public.leave_requests(created_at desc) where status = 'pending';

-- ════════════════════════════════════════════════════════════
-- Helper — recompute late_minutes + worked_minutes + status from
-- clock_in / clock_out. Called by upsert action + on trigger.
-- (Grace period = 15 min on clock-in)
-- ════════════════════════════════════════════════════════════
create or replace function public.recompute_attendance_log()
returns trigger language plpgsql as $$
declare
  grace_min int := 15;
  late_threshold timestamptz;
  expected_out_ts timestamptz;
  expected_in_ts  timestamptz;
begin
  -- Skip override if status already 'leave' / 'holiday' / 'off' (admin-set)
  if new.status in ('leave','holiday','off') then
    new.late_minutes   := 0;
    new.worked_minutes := 0;
    return new;
  end if;

  expected_in_ts  := (new.work_date::text || ' ' || new.expected_in::text)::timestamptz;
  expected_out_ts := (new.work_date::text || ' ' || new.expected_out::text)::timestamptz;
  late_threshold  := expected_in_ts + (grace_min || ' minutes')::interval;

  if new.clock_in is null then
    new.status := 'absent';
    new.late_minutes := 0;
    new.worked_minutes := 0;
  else
    -- Late calc
    if new.clock_in > late_threshold then
      new.status := 'late';
      new.late_minutes := greatest(0, ceil(extract(epoch from (new.clock_in - expected_in_ts)) / 60))::int;
    else
      new.status := 'present';
      new.late_minutes := 0;
    end if;

    -- Early leave
    if new.clock_out is not null and new.clock_out < expected_out_ts then
      new.status := 'early_leave';
    end if;

    -- Worked minutes
    if new.clock_out is not null then
      new.worked_minutes := greatest(0, ceil(extract(epoch from (new.clock_out - new.clock_in)) / 60))::int;
    else
      new.worked_minutes := 0;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_logs_recompute_trigger on public.attendance_logs;
create trigger attendance_logs_recompute_trigger
  before insert or update of clock_in, clock_out, expected_in, expected_out, status
  on public.attendance_logs
  for each row execute function public.recompute_attendance_log();

-- ════════════════════════════════════════════════════════════
-- Helper — when a leave_request is APPROVED, fill matching
-- attendance_logs days with status='leave' so the dashboard shows the
-- employee as on leave instead of absent.
-- ════════════════════════════════════════════════════════════
create or replace function public.apply_leave_to_attendance()
returns trigger language plpgsql as $$
declare
  d date;
begin
  if new.status = 'approved' and (old.status is null or old.status <> 'approved') then
    d := new.start_date;
    while d <= new.end_date loop
      insert into public.attendance_logs (profile_id, work_date, status, note, source)
      values (new.profile_id, d, 'leave',
              concat('Auto-set by leave request: ', new.leave_type), 'manual')
      on conflict (profile_id, work_date)
        do update set status = 'leave',
                      note = excluded.note;
      d := d + interval '1 day';
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_requests_apply_trigger on public.leave_requests;
create trigger leave_requests_apply_trigger
  after insert or update of status
  on public.leave_requests
  for each row execute function public.apply_leave_to_attendance();

-- ════════════════════════════════════════════════════════════
-- RLS — admin-only for both tables (employees see own rows via separate
-- policy added in a future Phase 4 when /me/attendance ships).
-- ════════════════════════════════════════════════════════════
alter table public.attendance_logs enable row level security;
alter table public.leave_requests  enable row level security;

drop policy if exists "attendance_logs_admin_all" on public.attendance_logs;
create policy "attendance_logs_admin_all" on public.attendance_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- Employee can see their own logs (for future self-service page)
drop policy if exists "attendance_logs_self_read" on public.attendance_logs;
create policy "attendance_logs_self_read" on public.attendance_logs
  for select using (profile_id = auth.uid());

drop policy if exists "leave_requests_admin_all" on public.leave_requests;
create policy "leave_requests_admin_all" on public.leave_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- Employee can see + create their own leave requests
drop policy if exists "leave_requests_self_read" on public.leave_requests;
create policy "leave_requests_self_read" on public.leave_requests
  for select using (profile_id = auth.uid());

drop policy if exists "leave_requests_self_insert" on public.leave_requests;
create policy "leave_requests_self_insert" on public.leave_requests
  for insert with check (profile_id = auth.uid() and status = 'pending');
