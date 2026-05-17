-- ════════════════════════════════════════════════════════════
-- 0080 · work_items — cross-department work-board / job-assignment spine
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/operating-system-analysis-2026-05-18.md §1.4
--         + docs/research/capability-tools-strategy-2026-05-18.md
--         Tier 2 centrepiece.
--
-- Migration number: 0080 is a เดฟ-RESERVED block — deliberately clear
-- of ภูม's active 0073-0079 sequence. Do NOT renumber into that range.
--
-- ── THE HOLE (§1.2 of the operating-system analysis) ─────────
-- Status-visibility — Pacred's headline DNA promise — is delivered
-- for the *customer* (shipment timeline, scan events, freshness pill)
-- but missing for *staff*. Every department reads only its own table:
--   CS    → contact_messages          ops → forwarders / service_orders
--   wh    → cargo_containers           acc → freight_invoices / wallet
-- There is NO single screen that answers "show me every live job, its
-- stage, and which department/person owns it RIGHT NOW". A hand-off
-- from department A to B is still a LINE message — the legacy
-- "ของอยู่ไหน" status-relay failure, rebuilt at the staff layer.
--
-- ── THE FIX (§1.4 — the work_items spine) ───────────────────
-- ONE thin overlay table that *indexes* the domain rows into a single
-- assignable, queryable flow. It is ADDITIVE:
--   • It does NOT replace forwarders / service_orders / cargo_* /
--     freight_invoices / customs_declarations — those stay canonical.
--   • A work_item is a pointer: (entity_type, entity_ref) → the domain
--     row, plus assignment + lifecycle state the domain row lacks
--     (assigned_role, assigned_to, due_at, priority, a free note).
--   • The /admin/board page + per-role inbox read work_items; staff
--     still act on the domain detail page as today.
--
-- The polymorphic link is (entity_type, entity_ref) — entity_ref is a
-- TEXT natural key so it works uniformly across heterogeneous PKs:
--   forwarder            → forwarders.f_no            (text)
--   service_order        → service_orders.h_no        (text)
--   cargo_container      → cargo_containers.code      (text)
--   cargo_shipment       → cargo_shipments.shipment_code (text)
--   freight_shipment     → freight_shipments.id       (uuid::text)
--   customs_declaration  → customs_declarations.id    (uuid::text)
--   freight_invoice      → freight_invoices.id        (uuid::text)
--   contact_message      → contact_messages.id        (uuid::text)
--   refund_request       → refund_requests.id         (uuid::text)
--   qa_inspection        → freight_qa_inspections.id  (uuid::text)
-- No FK is enforced on entity_ref (it spans 10 tables / mixed key
-- types); the app layer + the (entity_type, entity_ref) unique index
-- keep it coherent. This mirrors how refund_requests.source_ref (0058)
-- already models a heterogeneous polymorphic link with a text ref.
--
-- ── RLS (follows the 0062 role-pin keystone) ────────────────
-- Work assignment is internal-operations data — NO customer access at
-- all (the table is never exposed to a customer client). Every policy
-- uses an EXPLICIT is_admin(array[...]) role array — never bare
-- is_admin() — per the 0062 S-1 fix. Two policies:
--   SELECT  → all operational + supervisory roles can SEE the board
--             (cross-department visibility IS the point):
--             super, ops, accounting, sales_admin, warehouse, driver,
--             interpreter.
--   WRITE   → super + ops only. ops is the operations coordinator that
--             routes work; super is the implicit catch-all. Other roles
--             advance work via the gated Server Actions in
--             actions/admin/work-items.ts (createAdminClient bypasses
--             RLS — the requireAdmin gate there is the real check), not
--             via direct PostgREST writes. Keeping the table-level
--             write surface tight (super+ops) means a low-trust
--             warehouse/driver anon-key JWT cannot rewrite assignments
--             directly — the same exploit class 0062 closed for money.
--
-- Idempotent: table is create-if-not-exists, every policy + trigger is
-- drop-if-exists + recreate, the function is create-or-replace. Zero
-- data migration. Additive only — adds no grants on existing tables,
-- never widens access. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- ── 1) work_items ───────────────────────────────────────────────────
create table if not exists public.work_items (
  id              uuid primary key default gen_random_uuid(),

  -- ── Polymorphic domain link ──
  -- entity_type names the domain table; entity_ref is its natural key
  -- as text (f_no / h_no / code / shipment_code / uuid::text). See the
  -- header for the per-type mapping. No cross-table FK is possible here.
  entity_type     text not null check (entity_type in (
                    'forwarder',
                    'service_order',
                    'cargo_container',
                    'cargo_shipment',
                    'freight_shipment',
                    'customs_declaration',
                    'freight_invoice',
                    'contact_message',
                    'refund_request',
                    'qa_inspection'
                  )),
  entity_ref      text not null check (char_length(entity_ref) between 1 and 128),

  -- ── What kind of work + a human title ──
  -- type is the work category (drives icon + default routing). title is
  -- a short staff-facing label; note is the free-text hand-off detail.
  type            text not null check (type in (
                    'intake_review',     -- a new order needs first-touch
                    'payment_followup',  -- chase / verify a payment
                    'warehouse_action',  -- receive / pack / load / scan
                    'doc_issue',         -- issue an invoice / Form-E / D-O / declaration
                    'customs_clearance', -- clear a shipment at the port
                    'delivery_dispatch', -- assign + dispatch a delivery run
                    'cs_followup',       -- a customer ticket / question
                    'refund_process',    -- process a refund request
                    'qa_check',          -- a QA / QC inspection
                    'general'            -- catch-all hand-off
                  )),
  title           text not null check (char_length(title) between 1 and 200),
  note            text,

  -- ── Lifecycle ──
  -- open → in_progress → done (terminal) | open/in_progress → cancelled.
  -- blocked is a non-terminal hold (waiting on another department /
  -- the customer). The board groups by status; the actions enforce the
  -- legal transitions with an optimistic .eq("status", expectedFrom)
  -- race-guard (see actions/admin/work-items.ts).
  status          text not null default 'open' check (status in (
                    'open', 'in_progress', 'blocked', 'done', 'cancelled'
                  )),

  -- low | normal | high | urgent — sorts the board within a column.
  priority        text not null default 'normal' check (priority in (
                    'low', 'normal', 'high', 'urgent'
                  )),

  -- ── Assignment ──
  -- assigned_role routes the item to a DEPARTMENT (always set — every
  -- item belongs to some role's inbox). assigned_to optionally pins it
  -- to one person (a profiles.id that is an admin). The CHECK keeps
  -- assigned_role within the known admin-role set (mirrors
  -- admins.role — 0033 + 0054 extended it to this 7-value set).
  assigned_role   text not null default 'ops' check (assigned_role in (
                    'super', 'ops', 'accounting', 'sales_admin',
                    'warehouse', 'driver', 'interpreter'
                  )),
  assigned_to     uuid references public.profiles(id) on delete set null,

  -- ── Timing ──
  due_at          timestamptz,                       -- SLA target (nullable)

  -- ── Provenance + lifecycle stamps ──
  created_by      uuid references public.profiles(id) on delete set null,
  started_at      timestamptz,                       -- set when → in_progress
  closed_at       timestamptz,                       -- set when → done / cancelled
  closed_by       uuid references public.profiles(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A done / cancelled item MUST carry a closed_at (audit completeness —
  -- mirrors the refund_requests *_consistent constraints in 0058).
  constraint work_items_closed_consistent check (
    status not in ('done','cancelled')
    or closed_at is not null
  )
);

-- ── 2) Indexes ──────────────────────────────────────────────────────
-- The board's primary query: open work for a role, newest / by priority.
create index if not exists work_items_role_status_idx
  on public.work_items(assigned_role, status, created_at desc);

-- The per-person "my inbox" query.
create index if not exists work_items_assignee_idx
  on public.work_items(assigned_to, status)
  where assigned_to is not null;

-- "Show every live job by stage" — the cross-department board columns.
create index if not exists work_items_status_idx
  on public.work_items(status, created_at desc);

-- Reverse lookup: given a domain row, is there an open work_item for it?
-- (used by the additive status-cascade hook to find-or-create.)
create index if not exists work_items_entity_idx
  on public.work_items(entity_type, entity_ref);

-- Overdue scan — open/in_progress items past their due_at.
create index if not exists work_items_due_idx
  on public.work_items(due_at)
  where due_at is not null and status in ('open','in_progress','blocked');

-- ── 3) updated_at auto-touch ────────────────────────────────────────
-- public.set_updated_at() is defined in the early migrations (used by
-- orders / corporate / addresses / wallet / refund_requests) — reuse it.
drop trigger if exists work_items_updated_at_trigger on public.work_items;
create trigger work_items_updated_at_trigger
  before update on public.work_items
  for each row execute function public.set_updated_at();

-- ── 4) RLS ──────────────────────────────────────────────────────────
alter table public.work_items enable row level security;

-- SELECT — cross-department visibility is the WHOLE point of the board,
-- so every operational + supervisory admin role can read. NO customer
-- access (no auth.uid()-self policy — the table is internal-only).
drop policy if exists "work_items_admin_select" on public.work_items;
create policy "work_items_admin_select" on public.work_items
  for select
  using (public.is_admin(array[
    'super','ops','accounting','sales_admin','warehouse','driver','interpreter'
  ]));

-- WRITE — table-level INSERT/UPDATE/DELETE pinned to super + ops (the
-- operations-coordination roles). Every other role mutates work_items
-- through the requireAdmin-gated Server Actions in
-- actions/admin/work-items.ts, which use the service-role admin client
-- (RLS-bypassing) — the action's requireAdmin([...]) is the real gate.
-- Keeping the direct PostgREST write surface narrow means a low-trust
-- warehouse / driver JWT cannot rewrite the board directly (the 0062
-- S-1 exploit class). EXPLICIT role array — never bare is_admin().
drop policy if exists "work_items_admin_write" on public.work_items;
create policy "work_items_admin_write" on public.work_items
  for all
  using      (public.is_admin(array['super','ops']))
  with check (public.is_admin(array['super','ops']));

-- ── 5) find-or-create helper (additive cascade hook support) ────────
-- §1.4 says the work_items spine should be opened/advanced by the same
-- status-change events the U1-2 cascade already fires on. Rather than a
-- DB trigger on 10 heterogeneous domain tables, we expose ONE idempotent
-- SECURITY DEFINER function that the warehouse / order / freight Server
-- Actions can call (best-effort, post-status-change) to ensure a board
-- entry exists for a domain row. Re-callable: if a non-closed work_item
-- already exists for (entity_type, entity_ref) it is returned untouched;
-- otherwise one is inserted at status='open'. This makes the spine
-- additive — domain code calls it, it never rewrites domain tables.
create or replace function public.ensure_work_item(
  p_entity_type   text,
  p_entity_ref    text,
  p_type          text,
  p_title         text,
  p_assigned_role text default 'ops',
  p_priority      text default 'normal',
  p_due_at        timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_id      uuid;
begin
  -- Already an open / in-progress / blocked item for this domain row?
  select id into existing_id
    from public.work_items
   where entity_type = p_entity_type
     and entity_ref  = p_entity_ref
     and status in ('open','in_progress','blocked')
   order by created_at desc
   limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.work_items
    (entity_type, entity_ref, type, title, assigned_role, priority, due_at)
  values
    (p_entity_type, p_entity_ref, p_type, p_title, p_assigned_role, p_priority, p_due_at)
  returning id into new_id;

  return new_id;
end;
$$;

-- Only the service-role admin client calls this (from a requireAdmin-gated
-- Server Action) — mirror next_refund_request_no (0058): no anon/authenticated
-- execute grant. Keeps the helper off the public PostgREST surface entirely.
revoke all     on function public.ensure_work_item(text,text,text,text,text,text,timestamptz) from public, authenticated, anon;
grant  execute on function public.ensure_work_item(text,text,text,text,text,text,timestamptz) to service_role;

-- ── 6) Comments ─────────────────────────────────────────────────────
comment on table public.work_items is
  '0080 — cross-department work-board / job-assignment spine (operating-system-analysis-2026-05-18.md §1.4). A thin ADDITIVE overlay: each row points (entity_type, entity_ref) at a domain row and carries the assignment + lifecycle state the domain row lacks. The /admin/board page + per-role inbox read this table; domain tables are NOT replaced.';
comment on column public.work_items.entity_type is
  'Names the domain table. entity_ref is its natural key as text. 10 types — see migration header for the per-type ref mapping (f_no / h_no / code / uuid::text).';
comment on column public.work_items.entity_ref is
  'Polymorphic domain key as TEXT (no cross-table FK — spans 10 tables / mixed PK types). Mirrors refund_requests.source_ref (0058).';
comment on column public.work_items.type is
  'Work category — drives board icon + default routing. intake_review | payment_followup | warehouse_action | doc_issue | customs_clearance | delivery_dispatch | cs_followup | refund_process | qa_check | general.';
comment on column public.work_items.status is
  'open → in_progress → done (terminal) | → cancelled (terminal). blocked = non-terminal hold. Transitions enforced in actions/admin/work-items.ts with an optimistic .eq(status, expectedFrom) race-guard.';
comment on column public.work_items.assigned_role is
  'The DEPARTMENT that owns this item (always set). Drives the per-role inbox. Within the admins.role set (0033 + 0054).';
comment on column public.work_items.assigned_to is
  'Optional pin to one person (a profiles.id that is an admin). NULL = the whole assigned_role department owns it.';
comment on column public.work_items.due_at is
  'SLA target. NULL = no SLA. The work_items_due_idx powers the overdue scan on the board.';
comment on constraint work_items_closed_consistent on public.work_items is
  'A done / cancelled work_item MUST carry closed_at — audit completeness (mirrors the refund_requests *_consistent constraints in 0058).';
comment on function public.ensure_work_item(text,text,text,text,text,text,timestamptz) is
  '0080 — idempotent find-or-create for a board entry on a domain row. Returns the existing open/in_progress/blocked work_item for (entity_type, entity_ref) if one exists, else inserts a new open one. Called best-effort by domain Server Actions post-status-change so the work_items spine stays ADDITIVE (no DB trigger on the 10 domain tables).';

-- ── 7) Verify (counts) ──────────────────────────────────────────────
do $$
declare
  rls_count int;
  idx_count int;
begin
  select count(*) into rls_count
    from pg_policies
   where schemaname = 'public' and tablename = 'work_items';
  if rls_count < 2 then
    raise warning '0080 work_items RLS expected >= 2 policies, found %', rls_count;
  else
    raise notice '0080 work_items ready — % RLS policies installed', rls_count;
  end if;

  select count(*) into idx_count
    from pg_indexes
   where schemaname = 'public' and tablename = 'work_items';
  raise notice '0080 work_items — % indexes installed', idx_count;
end $$;
