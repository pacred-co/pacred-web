-- ════════════════════════════════════════════════════════════
-- 0075 · G-4 — Admin impersonation (view-as-customer, read-only)
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/gap-admin.md G-4 — support + ops can see
-- EXACTLY what a customer sees, without phoning, without
-- screenshare. Today every "ลูกค้าบอกว่าหน้าจอขึ้นแบบนี้" call
-- is blind because admin pages don't render in the customer
-- viewport.
--
-- ── Design ──────────────────────────────────────────────────
-- An impersonation_session row is created by adminBeginImpersonation
-- (super OR ops). A cookie `pacred_impersonating` carries a signed
-- payload {admin_id, target_profile_id, session_id, expires_at}.
-- lib/auth/get-user.ts `getEffectiveUser()` looks at the cookie,
-- re-verifies the admin still has super/ops role + the session is
-- still active + not expired, and returns the TARGET profile (with
-- `_impersonating: true` flag). All RLS-scoped customer reads
-- happen as if the target customer is signed in.
--
-- ── HARD CONSTRAINT: WRITES BLOCKED ─────────────────────────
-- Impersonation is a READ-ONLY tool. Every server action that
-- mutates checks `getEffectiveUser()._impersonating` and refuses
-- with `cannot_write_during_impersonation`. This is enforced in
-- app code (lib/auth/impersonation.ts assertNotImpersonating).
-- We do NOT need a DB-level write-block because the admin auth
-- cookie is still that of the admin — RLS on customer tables
-- already requires the row to be either self-owned (by auth.uid())
-- or admin-overridden. The cookie remap is a UI/action concern.
--
-- ── Schema ──────────────────────────────────────────────────
-- One row per impersonation session. Append-only audit-style
-- (no UPDATE on row content other than setting ended_at +
-- exit_reason at session close).
-- ════════════════════════════════════════════════════════════

create table if not exists public.impersonation_sessions (
  id                 uuid primary key default gen_random_uuid(),
  admin_id           uuid not null references public.profiles(id) on delete restrict,
  target_profile_id  uuid not null references public.profiles(id) on delete restrict,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  expires_at         timestamptz not null,
  exit_reason        text check (exit_reason in ('manual','expired','admin_role_lost')),
  created_at         timestamptz not null default now()
);

comment on table public.impersonation_sessions is
  'G-4 — admin view-as-customer sessions. One row per session. Read-only — admin cannot mutate during impersonation; assertNotImpersonating() in lib/auth/impersonation.ts enforces.';

create index if not exists impersonation_sessions_admin_idx
  on public.impersonation_sessions(admin_id, started_at desc);
create index if not exists impersonation_sessions_target_idx
  on public.impersonation_sessions(target_profile_id, started_at desc);
create index if not exists impersonation_sessions_active_idx
  on public.impersonation_sessions(admin_id)
  where ended_at is null;

-- ════════════════════════════════════════════════════════════
-- RLS — super read all; ops/etc. read only own sessions
-- ════════════════════════════════════════════════════════════
-- Customers never have access. Service-role bypasses RLS so
-- adminBeginImpersonation / adminEndImpersonation can write via
-- createAdminClient. We deliberately do NOT add insert/update/
-- delete policies — those go through the service-role admin
-- client + withAdmin role gate.
alter table public.impersonation_sessions enable row level security;

drop policy if exists "impersonation_sessions_select_own" on public.impersonation_sessions;
create policy "impersonation_sessions_select_own" on public.impersonation_sessions
  for select
  using (
    public.is_admin(array['super'])
    or (admin_id = auth.uid() and public.is_admin(array['ops','accounting','sales_admin']))
  );

-- audit events written by adminBeginImpersonation + adminEndImpersonation
-- via logAdminAction:
--   admin.impersonation_begin  (target_type='profile', target_id=target_profile_id)
--   admin.impersonation_end    (target_type='profile', target_id=target_profile_id)
