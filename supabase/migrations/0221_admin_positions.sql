-- 0221 — admin positions (ตำแหน่ง) + department link (owner ปอน 2026-06-27)
--
-- The admin model gains a POSITION axis. A position (ตำแหน่ง) belongs to a
-- department and references a WORKSPACE-ROLE (the menu template that decides
-- which pages/menus the staffer sees · lib/admin/sidebar-menu.ts ROLE_MENUS).
-- Positions are CRUD-able ("สร้างได้ เพิ่มได้"). The create-admin form picks a
-- department (1 of 6 · lib/admin/departments.ts) + a position (dropdown, filtered
-- by department) instead of free-text.
--
-- The three axes on a staffer (kept independent):
--   • money tier   admins.role ∈ {ultra,super,normies}        → cost/profit visibility
--   • department   admin_contact_extras.department (6 keys)    → grouping
--   • position     admin_contact_extras.position_id → workspace_role → menus/actions
--
-- Companion code: lib/admin/departments.ts · lib/admin/positions.ts ·
--   lib/validators/admin-form.ts · the positions CRUD page + the sidebar wiring.

create table if not exists public.admin_positions (
  id             uuid primary key default gen_random_uuid(),
  name_th        text not null,
  department     text not null,           -- one of lib/admin/departments.ts DEPARTMENT_KEYS
  workspace_role text not null,           -- an AdminRole menu key (ROLE_MENUS) — the workspace template
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz
);

-- One position name per department (case-insensitive) — avoids dup dropdown entries.
create unique index if not exists admin_positions_name_dept_uniq
  on public.admin_positions (lower(name_th), department);

create index if not exists admin_positions_department_idx
  on public.admin_positions (department) where is_active;

-- Link a staffer to their position (HR sidecar). Nullable — legacy/unassigned
-- staff have none (the sidebar falls back to their existing role menu).
alter table public.admin_contact_extras
  add column if not exists position_id uuid references public.admin_positions(id) on delete set null;

-- RLS: admin-only (defense-in-depth · admin pages use the service-role client
-- which bypasses RLS, but never leave a table world-readable).
alter table public.admin_positions enable row level security;
drop policy if exists admin_positions_admin_all on public.admin_positions;
create policy admin_positions_admin_all on public.admin_positions
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.admin_positions is
  '2026-06-27 (ปอน · mig 0221): ตำแหน่ง — CRUD-able positions. Each belongs to a '
  'department (departments.ts) + references a workspace_role (ROLE_MENUS key) that '
  'drives the staffer''s menu/workspace. Picked as a dropdown on /admin/admins/new.';

-- ── Seed positions from the owner''s examples (workspace_role = closest legacy
--    ROLE_MENUS menu; marketing/hr/it have no dedicated legacy menu yet → broad
--    base, tailor later via the positions/role builder). Idempotent. ──────────
insert into public.admin_positions (name_th, department, workspace_role) values
  ('เซลล์ (Sales)',          'biz_cs',    'sales'),
  ('CS / บริการลูกค้า',       'biz_cs',    'sales_admin'),
  ('Pricing / ตั้งราคา',      'biz_cs',    'pricing'),
  ('การตลาด (Marketing)',     'marketing', 'sales_admin'),
  ('โกดัง (Warehouse)',       'logistics', 'warehouse'),
  ('คนขับรถ (Driver)',        'logistics', 'driver'),
  ('เอกสาร / Doc',            'logistics', 'freight_import_doc'),
  ('ทรัพยากรบุคคล (HR)',      'hr',        'super'),
  ('บัญชี (Accounting)',      'finance',   'accounting'),
  ('การเงิน (Finance)',       'finance',   'accounting'),
  ('ไอที / พัฒนาระบบ (IT)',   'it',        'super')
on conflict (lower(name_th), department) do nothing;
