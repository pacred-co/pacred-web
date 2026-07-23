-- 0274_wallet_payment_group_atomic.sql
--
-- One customer forwarder payment submission must land as ONE indivisible unit:
--   1 type='1' header (the slip + transferred amount)
--   N type='4' allocation children
--   N tb_wallet_paydeposit bridges
--   N tb_forwarder pending-review flips
--
-- The former PostgREST write sequence committed each hop independently. A failed
-- bridge/forwarder update could therefore leave a slip header without a complete
-- shipment, and a concurrent retry could create a second active child for the
-- same forwarder. This migration moves the write into one service-role-only RPC;
-- one PostgreSQL function call is one transaction, so every hop commits or every
-- hop rolls back.
--
-- The header also freezes the exact quote the customer accepted. All canonical
-- amounts are integer satang (never binary floats):
--   gross + vat - wht = net
--   bank + cashback   = net
--   sum(line amounts) = net
-- `metadata` inside quote_snapshot is deliberately generic; this migration does
-- not infer a tax rate or reinterpret the application's pricing components.
-- Existing legacy rows remain untouched: every new column is nullable and is
-- required only when payment_group_id is present.

alter table public.tb_wallet_hs
  add column if not exists payment_group_id uuid,
  add column if not exists idempotency_key text,
  add column if not exists quote_snapshot jsonb,
  add column if not exists quote_gross_satang bigint,
  add column if not exists quote_vat_satang bigint,
  add column if not exists quote_wht_satang bigint,
  add column if not exists quote_net_satang bigint,
  add column if not exists quote_cashback_satang bigint,
  add column if not exists quote_bank_satang bigint;

comment on column public.tb_wallet_hs.payment_group_id is
  '0274 — immutable UUID shared by one type=1 payment header and all of its type=4 forwarder allocation children.';
comment on column public.tb_wallet_hs.idempotency_key is
  '0274 — caller-generated retry key. Present only on the type=1 group header and globally unique.';
comment on column public.tb_wallet_hs.quote_snapshot is
  '0274 — immutable canonical JSONB quote captured at customer submit. Core money values and line allocations are integer satang; optional metadata is opaque.';
comment on column public.tb_wallet_hs.quote_gross_satang is
  '0274 — frozen pre-VAT/pre-WHT gross in integer satang (group header only).';
comment on column public.tb_wallet_hs.quote_vat_satang is
  '0274 — frozen VAT component in integer satang; no rate is inferred (group header only).';
comment on column public.tb_wallet_hs.quote_wht_satang is
  '0274 — frozen withholding component in integer satang (group header only).';
comment on column public.tb_wallet_hs.quote_net_satang is
  '0274 — frozen settled obligation before cashback split, in integer satang (group header only).';
comment on column public.tb_wallet_hs.quote_cashback_satang is
  '0274 — frozen cashback applied at submit, in integer satang (group header only).';
comment on column public.tb_wallet_hs.quote_bank_satang is
  '0274 — frozen amount actually transferred to the bank/slip, in integer satang (group header only).';

-- Pure validator used by the row CHECK. It verifies both the scalar accounting
-- identity and the canonical JSON line snapshot. It deliberately catches malformed
-- JSON/casts and returns false so callers receive a CHECK violation, not a partial
-- money write.
create or replace function public.wallet_payment_quote_snapshot_valid(
  p_snapshot jsonb,
  p_gross_satang bigint,
  p_vat_satang bigint,
  p_wht_satang bigint,
  p_net_satang bigint,
  p_cashback_satang bigint,
  p_bank_satang bigint
)
returns boolean
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_line jsonb;
  v_line_count integer := 0;
  v_line_sum numeric := 0;
  v_fid_num numeric;
  v_amount_num numeric;
  v_seen_fids bigint[] := array[]::bigint[];
  v_money_max constant bigint := 99999999999999; -- numeric(14,2), expressed in satang
begin
  if jsonb_typeof(p_snapshot) is distinct from 'object' then
    return false;
  end if;

  if jsonb_typeof(p_snapshot -> 'billing_identity') is distinct from 'object'
     or not (p_snapshot -> 'billing_identity' ?& array['name', 'tax_id', 'address', 'is_juristic'])
     or jsonb_object_length(p_snapshot -> 'billing_identity') <> 4 then
    return false;
  end if;
  if jsonb_typeof(p_snapshot #> '{billing_identity,name}') is distinct from 'string'
     or jsonb_typeof(p_snapshot #> '{billing_identity,tax_id}') is distinct from 'string'
     or jsonb_typeof(p_snapshot #> '{billing_identity,address}') is distinct from 'string'
     or jsonb_typeof(p_snapshot #> '{billing_identity,is_juristic}') is distinct from 'boolean' then
    return false;
  end if;
  if nullif(btrim(p_snapshot #>> '{billing_identity,name}'), '') is null
     or p_snapshot #>> '{billing_identity,name}'
          is distinct from btrim(p_snapshot #>> '{billing_identity,name}')
     or length(p_snapshot #>> '{billing_identity,name}') > 300
     or length(p_snapshot #>> '{billing_identity,tax_id}') > 13
     or p_snapshot #>> '{billing_identity,tax_id}'
          is distinct from btrim(p_snapshot #>> '{billing_identity,tax_id}')
     or nullif(btrim(p_snapshot #>> '{billing_identity,address}'), '') is null
     or p_snapshot #>> '{billing_identity,address}'
          is distinct from btrim(p_snapshot #>> '{billing_identity,address}')
     or length(p_snapshot #>> '{billing_identity,address}') > 2000
     or (
       p_snapshot #> '{billing_identity,is_juristic}' = 'true'::jsonb
       and nullif(p_snapshot #>> '{billing_identity,tax_id}', '') is null
     ) then
    return false;
  end if;

  if p_gross_satang < 0 or p_gross_satang > v_money_max
     or p_vat_satang < 0 or p_vat_satang > v_money_max
     or p_wht_satang < 0 or p_wht_satang > v_money_max
     or p_net_satang <= 0 or p_net_satang > v_money_max
     or p_cashback_satang < 0 or p_cashback_satang > v_money_max
     or p_bank_satang < 0 or p_bank_satang > v_money_max then
    return false;
  end if;

  if p_gross_satang + p_vat_satang - p_wht_satang <> p_net_satang
     or p_bank_satang + p_cashback_satang <> p_net_satang then
    return false;
  end if;

  if p_snapshot -> 'schema_version' is distinct from to_jsonb(1)
     or p_snapshot -> 'currency' is distinct from to_jsonb('THB'::text)
     or p_snapshot -> 'gross_satang' is distinct from to_jsonb(p_gross_satang)
     or p_snapshot -> 'vat_satang' is distinct from to_jsonb(p_vat_satang)
     or p_snapshot -> 'wht_satang' is distinct from to_jsonb(p_wht_satang)
     or p_snapshot -> 'net_satang' is distinct from to_jsonb(p_net_satang)
     or p_snapshot -> 'cashback_satang' is distinct from to_jsonb(p_cashback_satang)
     or p_snapshot -> 'bank_satang' is distinct from to_jsonb(p_bank_satang)
     or jsonb_typeof(p_snapshot -> 'lines') is distinct from 'array'
     or jsonb_typeof(p_snapshot -> 'submission') is distinct from 'object'
     or jsonb_typeof(p_snapshot #> '{submission,slip_path}') is distinct from 'string'
     or jsonb_typeof(p_snapshot #> '{submission,deposit_name_bank}') is distinct from 'string'
     or jsonb_typeof(p_snapshot #> '{submission,apply_niti}') is distinct from 'boolean'
     or p_snapshot #> '{billing_identity,is_juristic}'
          is distinct from p_snapshot #> '{submission,apply_niti}'
     or jsonb_typeof(p_snapshot -> 'metadata') is distinct from 'object' then
    return false;
  end if;

  -- submitted_slip_date may be JSON null (customer omitted it) or a timestamp
  -- string. The mutable legacy dateslip column can later be corrected by staff;
  -- this original submitted value remains frozen here for idempotent replay.
  if jsonb_typeof(p_snapshot #> '{submission,submitted_slip_date}') is null
     or jsonb_typeof(p_snapshot #> '{submission,submitted_slip_date}')
          not in ('null', 'string') then
    return false;
  end if;

  for v_line in
    select value from jsonb_array_elements(p_snapshot -> 'lines')
  loop
    v_line_count := v_line_count + 1;
    if v_line_count > 50
       or jsonb_typeof(v_line) is distinct from 'object'
       or jsonb_typeof(v_line -> 'forwarder_id') is distinct from 'number'
       or jsonb_typeof(v_line -> 'amount_satang') is distinct from 'number' then
      return false;
    end if;

    v_fid_num := (v_line ->> 'forwarder_id')::numeric;
    v_amount_num := (v_line ->> 'amount_satang')::numeric;
    if trunc(v_fid_num) <> v_fid_num
       or v_fid_num <= 0 or v_fid_num > 9223372036854775807::numeric
       or trunc(v_amount_num) <> v_amount_num
       or v_amount_num <= 0 or v_amount_num > v_money_max then
      return false;
    end if;

    if v_fid_num::bigint = any(v_seen_fids) then
      return false;
    end if;
    v_seen_fids := array_append(v_seen_fids, v_fid_num::bigint);
    v_line_sum := v_line_sum + v_amount_num;
  end loop;

  return v_line_count between 1 and 50 and v_line_sum = p_net_satang;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.wallet_payment_quote_snapshot_valid(
  jsonb, bigint, bigint, bigint, bigint, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.wallet_payment_quote_snapshot_valid(
  jsonb, bigint, bigint, bigint, bigint, bigint, bigint
) to service_role;

alter table public.tb_wallet_hs
  drop constraint if exists tb_wallet_hs_payment_group_shape_check;

alter table public.tb_wallet_hs
  add constraint tb_wallet_hs_payment_group_shape_check check (
    (
      payment_group_id is null
      and idempotency_key is null
      and quote_snapshot is null
      and quote_gross_satang is null
      and quote_vat_satang is null
      and quote_wht_satang is null
      and quote_net_satang is null
      and quote_cashback_satang is null
      and quote_bank_satang is null
    )
    or
    (
      payment_group_id is not null
      and (
        (
          type = '1'
          and nullif(btrim(idempotency_key), '') is not null
          and length(idempotency_key) <= 200
          and quote_snapshot is not null
          and quote_gross_satang is not null
          and quote_vat_satang is not null
          and quote_wht_satang is not null
          and quote_net_satang is not null
          and quote_cashback_satang is not null
          and quote_bank_satang is not null
          and amount = quote_bank_satang::numeric / 100
          and public.wallet_payment_quote_snapshot_valid(
            quote_snapshot,
            quote_gross_satang,
            quote_vat_satang,
            quote_wht_satang,
            quote_net_satang,
            quote_cashback_satang,
            quote_bank_satang
          )
        )
        or
        (
          type = '4'
          and idempotency_key is null
          and quote_snapshot is null
          and quote_gross_satang is null
          and quote_vat_satang is null
          and quote_wht_satang is null
          and quote_net_satang is null
          and quote_cashback_satang is null
          and quote_bank_satang is null
          and reforder2 is not null
          and nullif(btrim(reforder), '') is not null
        )
      )
    )
  );

comment on constraint tb_wallet_hs_payment_group_shape_check on public.tb_wallet_hs is
  '0274 — legacy rows keep all new fields NULL. Atomic group headers hold one validated frozen quote; children hold only group/header/source linkage.';

-- Fail closed if pre-0274 data already contains duplicate PENDING payment legs.
-- The migration intentionally refuses to guess which money row is authoritative;
-- accounting must reconcile such data before applying this uniqueness guard.
--
-- ⚠️ Scope = status '1' (pending) ONLY — deliberately NOT ('1','2').
-- Prod pre-flight 2026-07-23 found PR215/forwarder 52328 carrying TWO settled
-- (status '2') allocations: #105614 ฿7,319.51 + #105622 ฿1,880.99 — the second
-- is the LEGITIMATE follow-up collection of a forgotten crate fee (save-point
-- 2026-07-15 · legacy typeNew='6' "ชำระเงินนำเข้าเติมเพิ่ม" exists for exactly
-- this). A ('1','2') uniqueness guard would both block this migration on prod
-- AND forbid every future "เก็บเพิ่ม" (approve flips the new pending row to '2'
-- beside the old settled one → violation). Two SIMULTANEOUS pending allocations
-- for one forwarder remain the real double-submit race and stay forbidden.
do $$
declare
  v_duplicate_keys integer;
begin
  select count(*)
    into v_duplicate_keys
    from (
      select userid, reforder
        from public.tb_wallet_hs
       where type = '4'
         and typeservice = '2'
         and status = '1'
         and nullif(btrim(reforder), '') is not null
       group by userid, reforder
      having count(*) > 1
    ) d;

  if v_duplicate_keys > 0 then
    raise exception using
      errcode = '23505',
      message = format(
        '0274 blocked: tb_wallet_hs contains %s duplicate pending forwarder-payment source key(s)',
        v_duplicate_keys
      ),
      hint = 'Reconcile the duplicate money rows explicitly; do not delete or merge them automatically.';
  end if;
end;
$$;

create unique index if not exists tb_wallet_hs_active_forwarder_source_uidx
  on public.tb_wallet_hs (userid, reforder)
  where type = '4'
    and typeservice = '2'
    and status = '1'
    and nullif(btrim(reforder), '') is not null;

create unique index if not exists tb_wallet_hs_payment_idempotency_uidx
  on public.tb_wallet_hs (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists tb_wallet_hs_payment_group_header_uidx
  on public.tb_wallet_hs (payment_group_id)
  where payment_group_id is not null and type = '1';

create index if not exists tb_wallet_hs_payment_group_idx
  on public.tb_wallet_hs (payment_group_id, type, id)
  where payment_group_id is not null;

comment on index public.tb_wallet_hs_active_forwarder_source_uidx is
  '0274 — at most one PENDING (status 1) import-payment allocation per customer+tb_forwarder source: two simultaneous submits cannot both hold a pending leg, while a settled (status 2) row plus a later follow-up collection (เก็บเพิ่ม · e.g. PR215/52328) stays legal.';
comment on index public.tb_wallet_hs_payment_idempotency_uidx is
  '0274 — exactly one payment header per caller idempotency key.';

-- Freeze the source + money identity after insertion while leaving review fields
-- (status, dateslip, note, admin ids, paydeposit) mutable for the normal admin flow.
-- For a child, also prove that its reforder/reforder2/amount exactly match a line
-- in the group's frozen header snapshot.
create or replace function public.enforce_wallet_payment_group_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_child_matches boolean;
begin
  if tg_op = 'UPDATE' then
    if old.payment_group_id is null and new.payment_group_id is not null then
      raise exception using
        errcode = '23514',
        constraint = 'tb_wallet_hs_payment_group_insert_only',
        message = '0274 payment groups must be created by the atomic RPC, not retrofitted by UPDATE';
    end if;

    if old.payment_group_id is not null and (
      new.payment_group_id is distinct from old.payment_group_id
      or new.idempotency_key is distinct from old.idempotency_key
      or new.quote_snapshot is distinct from old.quote_snapshot
      or new.quote_gross_satang is distinct from old.quote_gross_satang
      or new.quote_vat_satang is distinct from old.quote_vat_satang
      or new.quote_wht_satang is distinct from old.quote_wht_satang
      or new.quote_net_satang is distinct from old.quote_net_satang
      or new.quote_cashback_satang is distinct from old.quote_cashback_satang
      or new.quote_bank_satang is distinct from old.quote_bank_satang
      or new.userid is distinct from old.userid
      or new.type is distinct from old.type
      or new.typenew is distinct from old.typenew
      or new.typeservice is distinct from old.typeservice
      or new.reforder is distinct from old.reforder
      or new.reforder2 is distinct from old.reforder2
      or new.amount is distinct from old.amount
      or new.imagesslip is distinct from old.imagesslip
      or new.depositnamebank is distinct from old.depositnamebank
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'tb_wallet_hs_payment_group_immutable',
        message = '0274 payment group source/quote fields are immutable after submit';
    end if;
  end if;

  if new.payment_group_id is not null and new.type = '4' then
    select exists (
      select 1
        from public.tb_wallet_hs h
       where h.id = new.reforder2
         and h.type = '1'
         and h.userid = new.userid
         and h.payment_group_id = new.payment_group_id
         and exists (
           select 1
             from jsonb_array_elements(h.quote_snapshot -> 'lines') line
            where (line ->> 'forwarder_id')::bigint = new.reforder::bigint
              and (line ->> 'amount_satang')::bigint::numeric / 100 = new.amount
         )
    ) into v_child_matches;

    if not coalesce(v_child_matches, false) then
      raise exception using
        errcode = '23514',
        constraint = 'tb_wallet_hs_payment_group_child_link',
        message = '0274 child must match its group header, source ID, and frozen line amount';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_wallet_payment_group_integrity()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_wallet_payment_group_integrity on public.tb_wallet_hs;
create trigger trg_wallet_payment_group_integrity
before insert or update on public.tb_wallet_hs
for each row execute function public.enforce_wallet_payment_group_integrity();

-- Atomic customer submit. The caller supplies only integer-satang quote values;
-- the function rebuilds canonical lines, stamps one group UUID, locks every source
-- in deterministic ID order, and returns the legacy header ID (whID).
drop function if exists public.submit_forwarder_payment_group_atomic(
  text, text, bigint[], bigint[], jsonb, text, timestamp without time zone,
  text, boolean
);
create or replace function public.submit_forwarder_payment_group_atomic(
  p_idempotency_key text,
  p_userid text,
  p_forwarder_ids bigint[],
  p_line_amounts_satang bigint[],
  p_quote_snapshot jsonb,
  p_billing_identity jsonb,
  p_slip_path text,
  p_slip_date timestamp without time zone,
  p_deposit_name_bank text,
  p_apply_niti boolean
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_userid text := btrim(coalesce(p_userid, ''));
  v_slip_path text := btrim(coalesce(p_slip_path, ''));
  v_deposit_name_bank text := btrim(coalesce(p_deposit_name_bank, ''));
  v_ids bigint[];
  v_amounts bigint[];
  v_lines jsonb;
  v_metadata jsonb;
  v_billing_identity jsonb;
  v_billing_name text;
  v_billing_tax_id text;
  v_billing_address text;
  v_snapshot jsonb;
  v_gross_num numeric;
  v_vat_num numeric;
  v_wht_num numeric;
  v_net_num numeric;
  v_cashback_num numeric;
  v_bank_num numeric;
  v_gross bigint;
  v_vat bigint;
  v_wht bigint;
  v_net bigint;
  v_cashback bigint;
  v_bank bigint;
  v_now timestamp without time zone := transaction_timestamp() at time zone 'UTC';
  v_group_id uuid;
  v_whid bigint;
  v_existing record;
  v_forwarder record;
  v_forwarder_count integer := 0;
  v_updated_count integer := 0;
  v_money_max constant bigint := 99999999999999;
begin
  if length(v_key) < 8 or length(v_key) > 200 then
    raise exception using errcode = '22023', message = 'idempotency_key must be 8..200 characters';
  end if;
  if v_userid = '' or length(v_userid) > 10 then
    raise exception using errcode = '22023', message = 'userid must be 1..10 characters';
  end if;
  if v_slip_path = '' or length(v_slip_path) > 150 then
    raise exception using errcode = '22023', message = 'slip_path must be 1..150 characters';
  end if;
  if length(v_deposit_name_bank) > 100 then
    raise exception using errcode = '22023', message = 'deposit_name_bank exceeds 100 characters';
  end if;
  if p_apply_niti is null then
    raise exception using errcode = '22023', message = 'apply_niti is required';
  end if;
  if jsonb_typeof(p_billing_identity) is distinct from 'object'
     or not (p_billing_identity ?& array['name', 'tax_id', 'address', 'is_juristic'])
     or jsonb_object_length(p_billing_identity) <> 4
     or jsonb_typeof(p_billing_identity -> 'name') is distinct from 'string'
     or jsonb_typeof(p_billing_identity -> 'tax_id') is distinct from 'string'
     or jsonb_typeof(p_billing_identity -> 'address') is distinct from 'string'
     or jsonb_typeof(p_billing_identity -> 'is_juristic') is distinct from 'boolean' then
    raise exception using
      errcode = '22023',
      message = 'billing_identity must contain exactly name, tax_id, address, and boolean is_juristic';
  end if;

  v_billing_name := btrim(p_billing_identity ->> 'name');
  v_billing_tax_id := btrim(p_billing_identity ->> 'tax_id');
  v_billing_address := btrim(p_billing_identity ->> 'address');
  if v_billing_name = '' or length(v_billing_name) > 300 then
    raise exception using errcode = '22023', message = 'billing_identity.name must be 1..300 characters';
  end if;
  if length(v_billing_tax_id) > 13
     or (p_apply_niti and v_billing_tax_id = '') then
    raise exception using errcode = '22023', message = 'billing_identity.tax_id must be 1..13 characters for juristic customers and at most 13 otherwise';
  end if;
  if v_billing_address = '' or length(v_billing_address) > 2000 then
    raise exception using errcode = '22023', message = 'billing_identity.address must be 1..2000 characters';
  end if;
  if (p_billing_identity -> 'is_juristic') is distinct from to_jsonb(p_apply_niti) then
    raise exception using errcode = '22023', message = 'billing_identity.is_juristic must match apply_niti';
  end if;
  v_billing_identity := jsonb_build_object(
    'name', v_billing_name,
    'tax_id', v_billing_tax_id,
    'address', v_billing_address,
    'is_juristic', p_apply_niti
  );
  if p_forwarder_ids is null or p_line_amounts_satang is null
     or cardinality(p_forwarder_ids) not between 1 and 50
     or cardinality(p_forwarder_ids) <> cardinality(p_line_amounts_satang) then
    raise exception using errcode = '22023', message = 'forwarder IDs and satang amounts must have the same 1..50 length';
  end if;

  if exists (
    select 1
      from generate_subscripts(p_forwarder_ids, 1) g(i)
     where p_forwarder_ids[g.i] is null
        or p_forwarder_ids[g.i] <= 0
        or p_line_amounts_satang[g.i] is null
        or p_line_amounts_satang[g.i] <= 0
        or p_line_amounts_satang[g.i] > v_money_max
  ) then
    raise exception using errcode = '22023', message = 'source IDs must be positive and every line amount must be positive integer satang within numeric(14,2)';
  end if;

  if (select count(distinct x) from unnest(p_forwarder_ids) x)
       <> cardinality(p_forwarder_ids) then
    raise exception using errcode = '22023', message = 'duplicate forwarder IDs are not allowed in one payment group';
  end if;

  -- Canonical ID order makes a retry order-independent while preserving each
  -- ID/amount pair.
  select array_agg(p_forwarder_ids[g.i] order by p_forwarder_ids[g.i]),
         array_agg(p_line_amounts_satang[g.i] order by p_forwarder_ids[g.i])
    into v_ids, v_amounts
    from generate_subscripts(p_forwarder_ids, 1) g(i);

  if jsonb_typeof(p_quote_snapshot) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'quote_snapshot must be a JSON object';
  end if;
  if jsonb_typeof(coalesce(p_quote_snapshot -> 'metadata', '{}'::jsonb)) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'quote_snapshot.metadata must be a JSON object';
  end if;

  begin
    if jsonb_typeof(p_quote_snapshot -> 'gross_satang') is distinct from 'number'
       or jsonb_typeof(p_quote_snapshot -> 'vat_satang') is distinct from 'number'
       or jsonb_typeof(p_quote_snapshot -> 'wht_satang') is distinct from 'number'
       or jsonb_typeof(p_quote_snapshot -> 'net_satang') is distinct from 'number'
       or jsonb_typeof(p_quote_snapshot -> 'cashback_satang') is distinct from 'number'
       or jsonb_typeof(p_quote_snapshot -> 'bank_satang') is distinct from 'number' then
      raise exception using errcode = '22023', message = 'all canonical quote amounts must be JSON numbers in integer satang';
    end if;

    v_gross_num := (p_quote_snapshot ->> 'gross_satang')::numeric;
    v_vat_num := (p_quote_snapshot ->> 'vat_satang')::numeric;
    v_wht_num := (p_quote_snapshot ->> 'wht_satang')::numeric;
    v_net_num := (p_quote_snapshot ->> 'net_satang')::numeric;
    v_cashback_num := (p_quote_snapshot ->> 'cashback_satang')::numeric;
    v_bank_num := (p_quote_snapshot ->> 'bank_satang')::numeric;

    if trunc(v_gross_num) <> v_gross_num or v_gross_num < 0 or v_gross_num > v_money_max
       or trunc(v_vat_num) <> v_vat_num or v_vat_num < 0 or v_vat_num > v_money_max
       or trunc(v_wht_num) <> v_wht_num or v_wht_num < 0 or v_wht_num > v_money_max
       or trunc(v_net_num) <> v_net_num or v_net_num <= 0 or v_net_num > v_money_max
       or trunc(v_cashback_num) <> v_cashback_num or v_cashback_num < 0 or v_cashback_num > v_money_max
       or trunc(v_bank_num) <> v_bank_num or v_bank_num < 0 or v_bank_num > v_money_max then
      raise exception using errcode = '22023', message = 'quote amounts must be non-negative integer satang within numeric(14,2), with net > 0';
    end if;

    v_gross := v_gross_num::bigint;
    v_vat := v_vat_num::bigint;
    v_wht := v_wht_num::bigint;
    v_net := v_net_num::bigint;
    v_cashback := v_cashback_num::bigint;
    v_bank := v_bank_num::bigint;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'quote amounts must be valid integer satang';
  end;

  if v_gross + v_vat - v_wht <> v_net then
    raise exception using errcode = '22023', message = 'quote invariant failed: gross + vat - wht must equal net';
  end if;
  if v_bank + v_cashback <> v_net then
    raise exception using errcode = '22023', message = 'quote invariant failed: bank + cashback must equal net';
  end if;
  -- Release containment: cashback settlement is not yet part of the atomic
  -- approve/reject state machine. Refuse it at submit so a header can never be
  -- approved while its separately-held cashback debit is missing.
  if v_cashback <> 0 then
    raise exception using
      errcode = '0A000',
      message = 'cashback payment groups are temporarily disabled until cashback settlement is atomic';
  end if;
  if (select sum(x) from unnest(v_amounts) x) <> v_net then
    raise exception using errcode = '22023', message = 'quote invariant failed: line satang sum must equal net';
  end if;

  select jsonb_agg(
           jsonb_build_object(
             'forwarder_id', v_ids[g.i],
             'amount_satang', v_amounts[g.i]
           ) order by v_ids[g.i]
         )
    into v_lines
    from generate_subscripts(v_ids, 1) g(i);

  v_metadata := coalesce(p_quote_snapshot -> 'metadata', '{}'::jsonb);
  v_snapshot := jsonb_build_object(
    'schema_version', 1,
    'currency', 'THB',
    'gross_satang', v_gross,
    'vat_satang', v_vat,
    'wht_satang', v_wht,
    'net_satang', v_net,
    'cashback_satang', v_cashback,
    'bank_satang', v_bank,
    'lines', v_lines,
    'billing_identity', v_billing_identity,
    'submission', jsonb_build_object(
      'slip_path', v_slip_path,
      'submitted_slip_date', to_jsonb(p_slip_date),
      'deposit_name_bank', v_deposit_name_bank,
      'apply_niti', p_apply_niti
    ),
    'metadata', v_metadata
  );

  if not public.wallet_payment_quote_snapshot_valid(
    v_snapshot, v_gross, v_vat, v_wht, v_net, v_cashback, v_bank
  ) then
    raise exception using errcode = '22023', message = 'canonical quote snapshot validation failed';
  end if;

  -- Same key calls serialize. A retry can return before re-checking the now
  -- pending forwarder statuses; a changed payload with the same key is rejected.
  perform pg_advisory_xact_lock(hashtextextended('wallet-forwarder-payment:' || v_key, 274));

  select id, userid, payment_group_id, quote_snapshot, imagesslip,
         depositnamebank, type, typeservice
    into v_existing
    from public.tb_wallet_hs
   where idempotency_key = v_key;

  if found then
    if v_existing.type is distinct from '1'
       or v_existing.typeservice is distinct from '2'
       or v_existing.userid is distinct from v_userid
       or v_existing.payment_group_id is null
       or v_existing.quote_snapshot is distinct from v_snapshot
       or v_existing.imagesslip is distinct from v_slip_path
       or v_existing.depositnamebank is distinct from v_deposit_name_bank then
      raise exception using
        errcode = '22023',
        message = 'idempotency_key was already used with a different payment payload';
    end if;
    return v_existing.id;
  end if;

  -- Deterministic row-lock order serializes two different idempotency keys that
  -- race for any of the same source IDs and avoids lock-order deadlocks.
  for v_forwarder in
    select id, userid, fstatus, fcredit, paydeposit
      from public.tb_forwarder
     where id = any(v_ids)
     order by id
     for update
  loop
    v_forwarder_count := v_forwarder_count + 1;
    if v_forwarder.userid is distinct from v_userid then
      raise exception using errcode = '22023', message = format('forwarder %s is not owned by userid %s', v_forwarder.id, v_userid);
    end if;
    if not (v_forwarder.fstatus = '5' or v_forwarder.fcredit = '1')
       or v_forwarder.paydeposit = '1' then
      raise exception using errcode = '22023', message = format('forwarder %s is not eligible for payment submission', v_forwarder.id);
    end if;
    -- Release containment: the credit branch has different reversal semantics.
    -- Keep it out until credit reserve/restore is part of this same transaction.
    if v_forwarder.fcredit = '1' then
      raise exception using
        errcode = '0A000',
        message = format('credit forwarder %s is temporarily disabled for atomic payment groups', v_forwarder.id);
    end if;
  end loop;

  if v_forwarder_count <> cardinality(v_ids) then
    raise exception using errcode = '22023', message = 'one or more requested forwarder IDs do not exist';
  end if;

  if exists (
    select 1
      from public.tb_wallet_hs
     where userid = v_userid
       and type = '4'
       and typeservice = '2'
       and status in ('1', '2')
       and reforder = any(v_ids::text[])
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'tb_wallet_hs_active_forwarder_source_uidx',
      message = 'one or more forwarder IDs already have an active payment allocation';
  end if;

  v_group_id := gen_random_uuid();

  insert into public.tb_wallet_hs (
    date, dateslip, amount, status, type, typenew, typeservice, paydeposit,
    imagesslip, depositnamebank, note, reforder, whno, wusercredit, userid,
    adminidcrate, payment_group_id, idempotency_key, quote_snapshot,
    quote_gross_satang, quote_vat_satang, quote_wht_satang, quote_net_satang,
    quote_cashback_satang, quote_bank_satang
  ) values (
    v_now, p_slip_date, v_bank::numeric / 100, '1', '1', '6', '2', '1',
    v_slip_path, v_deposit_name_bank,
    case when v_cashback > 0
      then '[CB:' || to_char(v_cashback::numeric / 100, 'FM9999999999990.00') || ']'
      else ''
    end,
    '', '', '', v_userid, '', v_group_id, v_key, v_snapshot,
    v_gross, v_vat, v_wht, v_net, v_cashback, v_bank
  )
  returning id into v_whid;

  insert into public.tb_wallet_hs (
    date, dateslip, amount, status, type, typenew, typeservice, paydeposit,
    imagesslip, depositnamebank, note, reforder, reforder2, whno,
    wusercredit, userid, adminidcrate, payment_group_id
  )
  select
    v_now, p_slip_date, v_amounts[g.i]::numeric / 100,
    '1', '4', '6', '2', '1', '', '', '', v_ids[g.i]::text, v_whid, '',
    '', v_userid, '', v_group_id
  from generate_subscripts(v_ids, 1) g(i)
  join public.tb_forwarder f on f.id = v_ids[g.i];

  insert into public.tb_wallet_paydeposit (whid, hno)
  select v_whid, x::text
    from unnest(v_ids) x;

  update public.tb_forwarder f
     set fstatus = '6',
         paydeposit = '1',
         fdateadminstatus = v_now,
         fdatestatus6 = v_now,
         fusercompany = case when p_apply_niti then '1' else '' end
   where f.id = any(v_ids)
     and f.userid = v_userid;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> cardinality(v_ids) then
    raise exception using errcode = '40001', message = 'forwarder pending-state update count changed during atomic submit';
  end if;

  return v_whid;
end;
$$;

revoke all on function public.submit_forwarder_payment_group_atomic(
  text, text, bigint[], bigint[], jsonb, jsonb, text, timestamp without time zone,
  text, boolean
) from public, anon, authenticated;

grant execute on function public.submit_forwarder_payment_group_atomic(
  text, text, bigint[], bigint[], jsonb, jsonb, text, timestamp without time zone,
  text, boolean
) to service_role;

comment on function public.submit_forwarder_payment_group_atomic(
  text, text, bigint[], bigint[], jsonb, jsonb, text, timestamp without time zone,
  text, boolean
) is
  '0274 — service-role-only atomic/idempotent customer forwarder payment submission. Validates one owner + eligible locked sources + integer-satang frozen quote + canonical billing identity; writes one header, N children, N bridges and N pending flips; returns legacy whID.';

-- ────────────────────────────────────────────────────────────
-- Durable receipt outbox
-- ────────────────────────────────────────────────────────────
-- Approval commits the money/status decision and this durable intent in the
-- same transaction. Receipt generation may run afterwards and retry safely;
-- it can never be silently skipped because an in-process best-effort hook died.
create table if not exists public.wallet_payment_receipt_outbox (
  id uuid primary key default gen_random_uuid(),
  whid bigint not null unique,
  payment_group_id uuid not null unique,
  userid varchar(20) not null,
  forwarder_ids bigint[] not null,
  quote_snapshot jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'issued', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  receipt_id bigint,
  receipt_no varchar(20),
  requested_receipt_no varchar(20),
  claim_token uuid,
  claimed_at timestamptz,
  last_error text,
  approved_by varchar(10) not null,
  approved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_payment_receipt_outbox_fids_check
    check (
      cardinality(forwarder_ids) between 1 and 50
      and array_position(forwarder_ids, null) is null
    ),
  constraint wallet_payment_receipt_outbox_issued_check
    check (status <> 'issued' or receipt_id is not null)
);

alter table public.wallet_payment_receipt_outbox
  add column if not exists requested_receipt_no varchar(20),
  add column if not exists claim_token uuid,
  add column if not exists claimed_at timestamptz;

do $$
begin
  if exists (
    select 1 from public.wallet_payment_receipt_outbox
     where length(requested_receipt_no) > 20
        or length(receipt_no) > 20
  ) then
    raise exception using
      errcode = '22001',
      message = '0274 blocked: receipt number exceeds tb_receipt.rid varchar(20)';
  end if;
end;
$$;
alter table public.wallet_payment_receipt_outbox
  alter column requested_receipt_no type varchar(20),
  alter column receipt_no type varchar(20);

-- Backfill a recoverable lease identity if a provisional version of this
-- migration already left a row in processing. A later claim may take it over
-- only after the normal lease timeout.
update public.wallet_payment_receipt_outbox
   set claim_token = coalesce(claim_token, gen_random_uuid()),
       claimed_at = coalesce(claimed_at, updated_at, clock_timestamp())
 where status = 'processing'
   and (claim_token is null or claimed_at is null);

update public.wallet_payment_receipt_outbox
   set claim_token = null,
       claimed_at = null
 where status <> 'processing'
   and (claim_token is not null or claimed_at is not null);

alter table public.wallet_payment_receipt_outbox
  drop constraint if exists wallet_payment_receipt_outbox_issued_check;
alter table public.wallet_payment_receipt_outbox
  add constraint wallet_payment_receipt_outbox_issued_check check (
    status <> 'issued'
    or (
      receipt_id is not null
      and nullif(btrim(receipt_no), '') is not null
      and length(receipt_no) <= 20
    )
  );

alter table public.wallet_payment_receipt_outbox
  drop constraint if exists wallet_payment_receipt_outbox_claim_check;
alter table public.wallet_payment_receipt_outbox
  add constraint wallet_payment_receipt_outbox_claim_check check (
    (
      status = 'processing'
      and claim_token is not null
      and claimed_at is not null
    )
    or (
      status <> 'processing'
      and claim_token is null
      and claimed_at is null
    )
  );

alter table public.wallet_payment_receipt_outbox
  drop constraint if exists wallet_payment_receipt_outbox_requested_no_check;
alter table public.wallet_payment_receipt_outbox
  add constraint wallet_payment_receipt_outbox_requested_no_check check (
    requested_receipt_no is null
    or (
      requested_receipt_no = btrim(requested_receipt_no)
      and length(requested_receipt_no) between 1 and 20
    )
  );

comment on table public.wallet_payment_receipt_outbox is
  '0274 — durable one-row-per-payment-group receipt intent. Inserted atomically with approve; an async/service worker retries pending/failed rows and stamps receipt_id on issued.';

create index if not exists wallet_payment_receipt_outbox_pending_idx
  on public.wallet_payment_receipt_outbox (status, created_at, id)
  where status in ('pending', 'failed');

create unique index if not exists wallet_payment_receipt_outbox_requested_no_uidx
  on public.wallet_payment_receipt_outbox (requested_receipt_no)
  where requested_receipt_no is not null;

create unique index if not exists wallet_payment_receipt_outbox_receipt_id_uidx
  on public.wallet_payment_receipt_outbox (receipt_id)
  where receipt_id is not null;

create unique index if not exists wallet_payment_receipt_outbox_receipt_no_uidx
  on public.wallet_payment_receipt_outbox (receipt_no)
  where receipt_no is not null;

alter table public.wallet_payment_receipt_outbox enable row level security;
revoke all on table public.wallet_payment_receipt_outbox
  from public, anon, authenticated, service_role;
grant select on table public.wallet_payment_receipt_outbox
  to service_role;

-- The worker may update delivery state/attempt/error/receipt references, but
-- never rewrite which approved payment or frozen quote the receipt represents.
create or replace function public.enforce_wallet_receipt_outbox_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if new.id is distinct from old.id
     or new.whid is distinct from old.whid
     or new.payment_group_id is distinct from old.payment_group_id
     or new.userid is distinct from old.userid
     or new.forwarder_ids is distinct from old.forwarder_ids
     or new.quote_snapshot is distinct from old.quote_snapshot
     or new.requested_receipt_no is distinct from old.requested_receipt_no
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = '23514',
      constraint = 'wallet_payment_receipt_outbox_immutable',
      message = 'receipt outbox payment identity and frozen quote are immutable';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.enforce_wallet_receipt_outbox_immutable()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_wallet_receipt_outbox_immutable
  on public.wallet_payment_receipt_outbox;
create trigger trg_wallet_receipt_outbox_immutable
before update on public.wallet_payment_receipt_outbox
for each row execute function public.enforce_wallet_receipt_outbox_immutable();

-- Internal structural lock/validator shared by approve + reject. Locks are held
-- until the outer RPC transaction ends. It trusts only the immutable header
-- snapshot, then proves that group rows and source rows match it exactly.
create or replace function public.lock_wallet_payment_group_0274(p_whid bigint)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_header public.tb_wallet_hs%rowtype;
  v_ids bigint[];
  v_amounts bigint[];
  v_group_row_count integer;
  v_child_count integer;
  v_forwarder_count integer := 0;
  v_forwarder record;
begin
  if p_whid is null or p_whid <= 0 then
    raise exception using errcode = '22023', message = 'whid must be a positive integer';
  end if;

  select * into v_header
    from public.tb_wallet_hs
   where id = p_whid
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = format('wallet payment group header %s was not found', p_whid);
  end if;

  if v_header.type is distinct from '1'
     or v_header.typeservice is distinct from '2'
     or v_header.payment_group_id is null
     or nullif(btrim(v_header.idempotency_key), '') is null
     or v_header.quote_snapshot is null then
    raise exception using errcode = '22023', message = 'whid is not a 0274 forwarder payment-group header';
  end if;

  if not coalesce(public.wallet_payment_quote_snapshot_valid(
    v_header.quote_snapshot,
    v_header.quote_gross_satang,
    v_header.quote_vat_satang,
    v_header.quote_wht_satang,
    v_header.quote_net_satang,
    v_header.quote_cashback_satang,
    v_header.quote_bank_satang
  ), false) then
    raise exception using errcode = '23514', message = 'payment group frozen quote is invalid';
  end if;

  -- Release containment mirrored from submit. This must stay fail-closed for
  -- any hand-crafted/pre-release row too.
  if v_header.quote_cashback_satang <> 0 then
    raise exception using errcode = '0A000', message = 'cashback payment groups cannot be approved/rejected atomically yet';
  end if;

  select array_agg((line ->> 'forwarder_id')::bigint order by (line ->> 'forwarder_id')::bigint),
         array_agg((line ->> 'amount_satang')::bigint order by (line ->> 'forwarder_id')::bigint)
    into v_ids, v_amounts
    from jsonb_array_elements(v_header.quote_snapshot -> 'lines') line;

  if v_ids is null or cardinality(v_ids) not between 1 and 50 then
    raise exception using errcode = '23514', message = 'payment group has no canonical source lines';
  end if;

  -- Lock every group row in stable PK order, then demand exactly one header + N
  -- children. Any hidden extra/missing row blocks both decisions.
  perform 1
    from public.tb_wallet_hs r
   where r.payment_group_id = v_header.payment_group_id
   order by r.id
   for update;

  select count(*) into v_group_row_count
    from public.tb_wallet_hs r
   where r.payment_group_id = v_header.payment_group_id;
  select count(*) into v_child_count
    from public.tb_wallet_hs c
   where c.payment_group_id = v_header.payment_group_id
     and c.type = '4';

  if v_group_row_count <> cardinality(v_ids) + 1
     or v_child_count <> cardinality(v_ids) then
    raise exception using errcode = '23514', message = 'payment group header/child count does not match its frozen quote';
  end if;

  if exists (
    select 1
      from generate_subscripts(v_ids, 1) g(i)
      left join public.tb_wallet_hs c
        on c.payment_group_id = v_header.payment_group_id
       and c.type = '4'
       and c.reforder = v_ids[g.i]::text
     where c.id is null
        or c.reforder2 is distinct from p_whid
        or c.userid is distinct from v_header.userid
        or round(c.amount * 100)::bigint is distinct from v_amounts[g.i]
        or coalesce(c.wusercredit, '') <> ''
  ) then
    raise exception using errcode = '23514', message = 'payment children do not exactly match frozen IDs/amounts or contain a credit leg';
  end if;

  -- Lock bridge rows too. Approve/reject decide below whether N (pending/paid)
  -- or zero (already rejected) is the only valid cardinality.
  perform 1
    from public.tb_wallet_paydeposit b
   where b.whid = p_whid
   order by b.id
   for update;

  -- Lock all source forwarders in deterministic order and verify exact owner,
  -- existence, and the release-contained non-credit branch.
  for v_forwarder in
    select id, userid, fstatus, fcredit, paydeposit, fdatestatus6
      from public.tb_forwarder
     where id = any(v_ids)
     order by id
     for update
  loop
    v_forwarder_count := v_forwarder_count + 1;
    if v_forwarder.userid is distinct from v_header.userid then
      raise exception using errcode = '23514', message = format('forwarder %s owner differs from frozen payment owner', v_forwarder.id);
    end if;
    if v_forwarder.fcredit = '1' then
      raise exception using errcode = '0A000', message = format('credit forwarder %s is not supported by atomic approve/reject', v_forwarder.id);
    end if;
  end loop;

  if v_forwarder_count <> cardinality(v_ids) then
    raise exception using errcode = '23514', message = 'payment group source count does not match existing forwarders';
  end if;

  return jsonb_build_object(
    'whid', p_whid,
    'payment_group_id', v_header.payment_group_id,
    'userid', v_header.userid,
    'header_status', v_header.status,
    'header_paydeposit', v_header.paydeposit,
    'fids', to_jsonb(v_ids),
    'quote_snapshot', v_header.quote_snapshot,
    'header_adminidupdate', v_header.adminidupdate,
    'header_note', v_header.note
  );
end;
$$;

revoke all on function public.lock_wallet_payment_group_0274(bigint)
  from public, anon, authenticated, service_role;

-- Atomic approve: settle every row/source and enqueue exactly one durable
-- receipt intent in the same transaction. Receipt rendering/number minting is
-- intentionally downstream; this RPC never performs a best-effort side effect.
drop function if exists public.approve_forwarder_payment_group_atomic(bigint, text);
create or replace function public.approve_forwarder_payment_group_atomic(
  p_whid bigint,
  p_admin_slug text,
  p_requested_receipt_no text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin text := btrim(coalesce(p_admin_slug, ''));
  v_requested_receipt_no text := nullif(btrim(coalesce(p_requested_receipt_no, '')), '');
  v_group jsonb;
  v_ids bigint[];
  v_ids_text text[];
  v_group_id uuid;
  v_userid text;
  v_status text;
  v_snapshot jsonb;
  v_count integer;
  v_match_count integer;
  v_distinct_count integer;
  v_now timestamptz := clock_timestamp();
  v_already_done boolean := false;
  v_outbox public.wallet_payment_receipt_outbox%rowtype;
begin
  if v_admin = '' or length(v_admin) > 10 then
    raise exception using errcode = '22023', message = 'admin_slug must be 1..10 characters';
  end if;
  if p_requested_receipt_no is not null and v_requested_receipt_no is null then
    raise exception using errcode = '22023', message = 'requested_receipt_no cannot be blank';
  end if;
  if length(v_requested_receipt_no) > 20 then
    raise exception using errcode = '22023', message = 'requested_receipt_no exceeds tb_receipt.rid limit of 20 characters';
  end if;

  v_group := public.lock_wallet_payment_group_0274(p_whid);
  select array_agg(value::bigint order by value::bigint)
    into v_ids
    from jsonb_array_elements_text(v_group -> 'fids') value;
  v_ids_text := v_ids::text[];
  v_group_id := (v_group ->> 'payment_group_id')::uuid;
  v_userid := v_group ->> 'userid';
  v_status := v_group ->> 'header_status';
  v_snapshot := v_group -> 'quote_snapshot';

  select count(*),
         count(*) filter (where b.hno = any(v_ids_text)),
         count(distinct b.hno) filter (where b.hno = any(v_ids_text))
    into v_count, v_match_count, v_distinct_count
    from public.tb_wallet_paydeposit b
   where b.whid = p_whid;
  if v_count <> cardinality(v_ids)
     or v_match_count <> cardinality(v_ids)
     or v_distinct_count <> cardinality(v_ids) then
    raise exception using errcode = '23514', message = 'approve blocked: bridge rows do not exactly match frozen forwarder IDs';
  end if;

  if v_status = '2' then
    select count(*) into v_count
      from public.tb_wallet_hs c
     where c.payment_group_id = v_group_id and c.type = '4' and c.status = '2';
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'approved header has non-approved children';
    end if;

    select count(*) into v_count
      from public.tb_forwarder f
     where f.id = any(v_ids)
       and f.userid = v_userid
       -- A receipt retry may happen after dispatch completed. Status 7 is the
       -- only normal forward progression from paid/ready status 6; status 5
       -- is unpaid/reverted and 99 is the exceptional/cancelled lane.
       and f.fstatus in ('6', '7')
       and coalesce(f.paydeposit, '') = ''
       and f.fdatestatus6 is not null;
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'approved group has incomplete forwarder settlement';
    end if;
    v_already_done := true;
  elsif v_status = '1' then
    if (v_group ->> 'header_paydeposit') is distinct from '1' then
      raise exception using errcode = '23514', message = 'pending header is missing paydeposit marker';
    end if;
    if exists (select 1 from public.wallet_payment_receipt_outbox where whid = p_whid) then
      raise exception using errcode = '23514', message = 'pending group already has a receipt outbox row';
    end if;

    select count(*) into v_count
      from public.tb_wallet_hs c
     where c.payment_group_id = v_group_id and c.type = '4' and c.status = '1';
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'pending header has non-pending children';
    end if;

    select count(*) into v_count
      from public.tb_forwarder f
     where f.id = any(v_ids)
       and f.userid = v_userid
       and f.fstatus = '6'
       and f.paydeposit = '1';
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'pending group forwarders are not all in exact pending-review state';
    end if;

    update public.tb_wallet_hs
       set status = '2', adminid = v_admin, adminidupdate = v_admin
     where id = p_whid and status = '1';
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '40001', message = 'approve lost the header status claim';
    end if;

    update public.tb_wallet_hs
       set status = '2', adminid = v_admin, adminidupdate = v_admin
     where payment_group_id = v_group_id and type = '4' and status = '1';
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '40001', message = 'approve child update count changed';
    end if;

    update public.tb_forwarder
       set paydeposit = '',
           fdatestatus6 = v_now,
           fdateadminstatus = v_now,
           adminidupdate = v_admin
     where id = any(v_ids)
       and userid = v_userid
       and fstatus = '6'
       and paydeposit = '1';
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '40001', message = 'approve forwarder update count changed';
    end if;
  else
    raise exception using errcode = '22023', message = format('payment group status %s cannot be approved', coalesce(v_status, 'NULL'));
  end if;

  insert into public.wallet_payment_receipt_outbox (
    whid, payment_group_id, userid, forwarder_ids, quote_snapshot,
    status, requested_receipt_no, approved_by, approved_at
  ) values (
    p_whid, v_group_id, v_userid, v_ids, v_snapshot,
    'pending', v_requested_receipt_no,
    case when v_already_done
      then coalesce(nullif(v_group ->> 'header_adminidupdate', ''), v_admin)
      else v_admin
    end,
    v_now
  )
  on conflict (whid) do nothing;

  select * into v_outbox
    from public.wallet_payment_receipt_outbox
   where whid = p_whid
   for update;
  if not found
     or v_outbox.payment_group_id is distinct from v_group_id
     or v_outbox.userid is distinct from v_userid
     or v_outbox.forwarder_ids is distinct from v_ids
     or v_outbox.quote_snapshot is distinct from v_snapshot
     or v_outbox.requested_receipt_no is distinct from v_requested_receipt_no then
    raise exception using errcode = '23514', message = 'receipt outbox payload does not match the approved frozen group';
  end if;

  return jsonb_build_object(
    'whid', p_whid,
    'payment_group_id', v_group_id,
    'fids', to_jsonb(v_ids),
    'already_done', v_already_done,
    'receipt_outbox_status', v_outbox.status,
    'requested_receipt_no', v_outbox.requested_receipt_no
  );
end;
$$;

revoke all on function public.approve_forwarder_payment_group_atomic(bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.approve_forwarder_payment_group_atomic(bigint, text, text)
  to service_role;

comment on function public.approve_forwarder_payment_group_atomic(bigint, text, text) is
  '0274 — service-role atomic/idempotent group approve. Locks and validates frozen header/children/bridges/forwarders, settles every row, and inserts one durable pending receipt outbox row including the optional immutable STEP-2 requested receipt number.';

-- Atomic reject: revert every non-credit source and remove every bridge in the
-- same transaction. An approved/outboxed group can never enter this path.
drop function if exists public.reject_forwarder_payment_group_atomic(bigint, text);
create or replace function public.reject_forwarder_payment_group_atomic(
  p_whid bigint,
  p_admin_slug text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_admin text := btrim(coalesce(p_admin_slug, ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_group jsonb;
  v_ids bigint[];
  v_ids_text text[];
  v_group_id uuid;
  v_userid text;
  v_status text;
  v_count integer;
  v_match_count integer;
  v_distinct_count integer;
  v_now timestamp without time zone := transaction_timestamp() at time zone 'UTC';
  v_already_done boolean := false;
  v_final_reason text;
begin
  if v_admin = '' or length(v_admin) > 10 then
    raise exception using errcode = '22023', message = 'admin_slug must be 1..10 characters';
  end if;
  if length(v_reason) > 1000 then
    raise exception using errcode = '22023', message = 'reject reason exceeds 1000 characters';
  end if;

  v_group := public.lock_wallet_payment_group_0274(p_whid);
  select array_agg(value::bigint order by value::bigint)
    into v_ids
    from jsonb_array_elements_text(v_group -> 'fids') value;
  v_ids_text := v_ids::text[];
  v_group_id := (v_group ->> 'payment_group_id')::uuid;
  v_userid := v_group ->> 'userid';
  v_status := v_group ->> 'header_status';
  v_final_reason := v_group ->> 'header_note';

  if exists (select 1 from public.wallet_payment_receipt_outbox where whid = p_whid) then
    raise exception using errcode = '23514', message = 'group has a durable receipt intent and cannot be rejected';
  end if;

  select count(*),
         count(*) filter (where b.hno = any(v_ids_text)),
         count(distinct b.hno) filter (where b.hno = any(v_ids_text))
    into v_count, v_match_count, v_distinct_count
    from public.tb_wallet_paydeposit b
   where b.whid = p_whid;

  if v_status = '3' then
    if v_count <> 0 then
      raise exception using errcode = '23514', message = 'rejected group still has bridge rows';
    end if;
    select count(*) into v_count
      from public.tb_wallet_hs c
     where c.payment_group_id = v_group_id and c.type = '4' and c.status = '3';
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'rejected header has non-rejected children';
    end if;
    select count(*) into v_count
      from public.tb_forwarder f
     where f.id = any(v_ids)
       and f.userid = v_userid
       and f.fstatus = '5'
       and coalesce(f.paydeposit, '') = ''
       and coalesce(f.fusercompany, '') = '';
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'rejected group has incomplete forwarder reversal';
    end if;
    v_already_done := true;
  elsif v_status = '1' then
    if (v_group ->> 'header_paydeposit') is distinct from '1' then
      raise exception using errcode = '23514', message = 'pending header is missing paydeposit marker';
    end if;
    if v_count <> cardinality(v_ids)
       or v_match_count <> cardinality(v_ids)
       or v_distinct_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'reject blocked: bridge rows do not exactly match frozen forwarder IDs';
    end if;
    select count(*) into v_count
      from public.tb_wallet_hs c
     where c.payment_group_id = v_group_id and c.type = '4' and c.status = '1';
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'pending header has non-pending children';
    end if;
    select count(*) into v_count
      from public.tb_forwarder f
     where f.id = any(v_ids)
       and f.userid = v_userid
       and f.fstatus = '6'
       and f.paydeposit = '1';
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '23514', message = 'pending group forwarders are not all in exact pending-review state';
    end if;

    update public.tb_wallet_hs
       set status = '3',
           adminid = v_admin,
           adminidupdate = v_admin,
           note = coalesce(v_reason, note)
     where id = p_whid and status = '1';
    get diagnostics v_count = row_count;
    if v_count <> 1 then
      raise exception using errcode = '40001', message = 'reject lost the header status claim';
    end if;
    if v_reason is not null then
      v_final_reason := v_reason;
    end if;

    update public.tb_wallet_hs
       set status = '3', adminid = v_admin, adminidupdate = v_admin
     where payment_group_id = v_group_id and type = '4' and status = '1';
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '40001', message = 'reject child update count changed';
    end if;

    update public.tb_forwarder
       set fstatus = '5',
           paydeposit = '',
           fusercompany = '',
           fdateadminstatus = v_now,
           adminidupdate = v_admin
     where id = any(v_ids)
       and userid = v_userid
       and fstatus = '6'
       and paydeposit = '1';
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '40001', message = 'reject forwarder update count changed';
    end if;

    delete from public.tb_wallet_paydeposit
     where whid = p_whid;
    get diagnostics v_count = row_count;
    if v_count <> cardinality(v_ids) then
      raise exception using errcode = '40001', message = 'reject bridge delete count changed';
    end if;
  else
    raise exception using errcode = '22023', message = format('payment group status %s cannot be rejected', coalesce(v_status, 'NULL'));
  end if;

  return jsonb_build_object(
    'whid', p_whid,
    'payment_group_id', v_group_id,
    'fids', to_jsonb(v_ids),
    'already_done', v_already_done,
    'rejection_reason', v_final_reason
  );
end;
$$;

revoke all on function public.reject_forwarder_payment_group_atomic(bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.reject_forwarder_payment_group_atomic(bigint, text, text)
  to service_role;

comment on function public.reject_forwarder_payment_group_atomic(bigint, text, text) is
  '0274 — service-role atomic/idempotent group reject. Locks and validates the full frozen group, freezes the optional first-decision reason on the header, rejects header+children, reverts all non-credit forwarders, deletes all bridges, and never creates a receipt intent.';

-- Receipt workers use the same exact paid-state proof as the decision RPC.
-- Status 7 is accepted because delivery may legitimately finish after approval
-- but before a crashed receipt attempt is retried. Status 5/99 remain blocked.
create or replace function public.lock_approved_wallet_payment_group_0274(
  p_whid bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_group jsonb;
  v_ids bigint[];
  v_ids_text text[];
  v_group_id uuid;
  v_userid text;
  v_count integer;
  v_match_count integer;
  v_distinct_count integer;
begin
  v_group := public.lock_wallet_payment_group_0274(p_whid);
  if (v_group ->> 'header_status') is distinct from '2' then
    raise exception using errcode = '22023', message = 'receipt delivery requires an approved payment group';
  end if;

  select array_agg(value::bigint order by value::bigint)
    into v_ids
    from jsonb_array_elements_text(v_group -> 'fids') value;
  v_ids_text := v_ids::text[];
  v_group_id := (v_group ->> 'payment_group_id')::uuid;
  v_userid := v_group ->> 'userid';

  select count(*),
         count(*) filter (where b.hno = any(v_ids_text)),
         count(distinct b.hno) filter (where b.hno = any(v_ids_text))
    into v_count, v_match_count, v_distinct_count
    from public.tb_wallet_paydeposit b
   where b.whid = p_whid;
  if v_count <> cardinality(v_ids)
     or v_match_count <> cardinality(v_ids)
     or v_distinct_count <> cardinality(v_ids) then
    raise exception using errcode = '23514', message = 'approved group bridge rows do not exactly match frozen forwarder IDs';
  end if;

  select count(*) into v_count
    from public.tb_wallet_hs c
   where c.payment_group_id = v_group_id
     and c.type = '4'
     and c.status = '2';
  if v_count <> cardinality(v_ids) then
    raise exception using errcode = '23514', message = 'approved group has non-approved children';
  end if;

  select count(*) into v_count
    from public.tb_forwarder f
   where f.id = any(v_ids)
     and f.userid = v_userid
     and f.fstatus in ('6', '7')
     and coalesce(f.paydeposit, '') = ''
     and f.fdatestatus6 is not null;
  if v_count <> cardinality(v_ids) then
    raise exception using errcode = '23514', message = 'approved group is unpaid, reverted, cancelled, or structurally incomplete';
  end if;

  return v_group;
end;
$$;

revoke all on function public.lock_approved_wallet_payment_group_0274(bigint)
  from public, anon, authenticated, service_role;

-- Atomic lease claim. The random token, rather than an application-side
-- read/update pair, is the authority for the matching completion/failure.
create or replace function public.claim_forwarder_payment_receipt_outbox_atomic(
  p_whid bigint,
  p_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_group jsonb;
  v_ids bigint[];
  v_outbox public.wallet_payment_receipt_outbox%rowtype;
  v_now timestamptz := clock_timestamp();
  v_token uuid;
begin
  if p_lease_seconds is null or p_lease_seconds not between 30 and 3600 then
    raise exception using errcode = '22023', message = 'receipt lease must be 30..3600 seconds';
  end if;

  -- Keep lock order identical to approve: group rows/sources, then outbox.
  v_group := public.lock_approved_wallet_payment_group_0274(p_whid);
  select array_agg(value::bigint order by value::bigint)
    into v_ids
    from jsonb_array_elements_text(v_group -> 'fids') value;

  select * into v_outbox
    from public.wallet_payment_receipt_outbox
   where whid = p_whid
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'approved payment group has no receipt outbox row';
  end if;
  if v_outbox.payment_group_id is distinct from (v_group ->> 'payment_group_id')::uuid
     or v_outbox.userid is distinct from v_group ->> 'userid'
     or v_outbox.forwarder_ids is distinct from v_ids
     or v_outbox.quote_snapshot is distinct from v_group -> 'quote_snapshot' then
    raise exception using errcode = '23514', message = 'receipt outbox identity differs from the approved frozen group';
  end if;

  if v_outbox.status = 'issued' then
    return jsonb_build_object(
      'claimed', false,
      'already_issued', true,
      'in_progress', false,
      'status', v_outbox.status,
      'attempt_count', v_outbox.attempt_count,
      'claim_token', null,
      'payment_group_id', v_outbox.payment_group_id,
      'userid', v_outbox.userid,
      'fids', to_jsonb(v_outbox.forwarder_ids),
      'quote_snapshot', v_outbox.quote_snapshot,
      'requested_receipt_no', v_outbox.requested_receipt_no,
      'receipt_id', v_outbox.receipt_id,
      'receipt_no', v_outbox.receipt_no
    );
  end if;

  if v_outbox.status = 'processing'
     and v_outbox.claimed_at > v_now - make_interval(secs => p_lease_seconds::double precision) then
    return jsonb_build_object(
      'claimed', false,
      'already_issued', false,
      'in_progress', true,
      'status', v_outbox.status,
      'attempt_count', v_outbox.attempt_count,
      'claim_token', null,
      'payment_group_id', v_outbox.payment_group_id,
      'userid', v_outbox.userid,
      'fids', to_jsonb(v_outbox.forwarder_ids),
      'quote_snapshot', v_outbox.quote_snapshot,
      'requested_receipt_no', v_outbox.requested_receipt_no,
      'receipt_id', null,
      'receipt_no', null
    );
  end if;

  if v_outbox.status not in ('pending', 'failed', 'processing') then
    raise exception using errcode = '22023', message = format('receipt outbox status %s cannot be claimed', v_outbox.status);
  end if;

  v_token := gen_random_uuid();
  update public.wallet_payment_receipt_outbox
     set status = 'processing',
         attempt_count = attempt_count + 1,
         claim_token = v_token,
         claimed_at = v_now,
         last_error = null
   where id = v_outbox.id;

  return jsonb_build_object(
    'claimed', true,
    'already_issued', false,
    'in_progress', false,
    'status', 'processing',
    'attempt_count', v_outbox.attempt_count + 1,
    'claim_token', v_token,
    'payment_group_id', v_outbox.payment_group_id,
    'userid', v_outbox.userid,
    'fids', to_jsonb(v_outbox.forwarder_ids),
    'quote_snapshot', v_outbox.quote_snapshot,
    'requested_receipt_no', v_outbox.requested_receipt_no,
    'receipt_id', null,
    'receipt_no', null
  );
end;
$$;

revoke all on function public.claim_forwarder_payment_receipt_outbox_atomic(bigint, integer)
  from public, anon, authenticated;
grant execute on function public.claim_forwarder_payment_receipt_outbox_atomic(bigint, integer)
  to service_role;

comment on function public.claim_forwarder_payment_receipt_outbox_atomic(bigint, integer) is
  '0274 — service-role atomic lease claim for one approved frozen-group receipt. Returns the immutable group payload and a single-use claim_token; fresh processing claims cannot be stolen.';

-- Stamp only the claimant's result, and only after proving that the receipt is
-- the exact active document for this whID, owner, frozen totals, and complete
-- forwarder group (never a one-tracking/subset document).
create or replace function public.complete_forwarder_payment_receipt_outbox_atomic(
  p_whid bigint,
  p_claim_token uuid,
  p_receipt_id bigint,
  p_receipt_no text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_receipt_no text := btrim(coalesce(p_receipt_no, ''));
  v_group jsonb;
  v_ids bigint[];
  v_outbox public.wallet_payment_receipt_outbox%rowtype;
  v_count integer;
  v_match_count integer;
  v_distinct_count integer;
begin
  if p_claim_token is null then
    raise exception using errcode = '22023', message = 'claim_token is required';
  end if;
  if p_receipt_id is null or p_receipt_id <= 0 then
    raise exception using errcode = '22023', message = 'receipt_id must be a positive integer';
  end if;
  if v_receipt_no = '' or length(v_receipt_no) > 20 then
    raise exception using errcode = '22023', message = 'receipt_no must be 1..20 characters';
  end if;

  v_group := public.lock_approved_wallet_payment_group_0274(p_whid);
  select array_agg(value::bigint order by value::bigint)
    into v_ids
    from jsonb_array_elements_text(v_group -> 'fids') value;

  select * into v_outbox
    from public.wallet_payment_receipt_outbox
   where whid = p_whid
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'receipt outbox row was not found';
  end if;
  if v_outbox.payment_group_id is distinct from (v_group ->> 'payment_group_id')::uuid
     or v_outbox.userid is distinct from v_group ->> 'userid'
     or v_outbox.forwarder_ids is distinct from v_ids
     or v_outbox.quote_snapshot is distinct from v_group -> 'quote_snapshot' then
    raise exception using errcode = '23514', message = 'receipt outbox identity differs from the approved frozen group';
  end if;

  if v_outbox.status = 'issued' then
    if v_outbox.receipt_id is distinct from p_receipt_id
       or v_outbox.receipt_no is distinct from v_receipt_no then
      raise exception using errcode = '23514', message = 'receipt outbox was already completed with a different receipt';
    end if;
    return jsonb_build_object(
      'whid', p_whid,
      'status', 'issued',
      'already_done', true,
      'receipt_id', v_outbox.receipt_id,
      'receipt_no', v_outbox.receipt_no
    );
  end if;

  if v_outbox.status is distinct from 'processing'
     or v_outbox.claim_token is distinct from p_claim_token then
    raise exception using errcode = '40001', message = 'receipt completion does not own the active claim';
  end if;
  if v_outbox.requested_receipt_no is not null
     and v_outbox.requested_receipt_no is distinct from v_receipt_no then
    raise exception using errcode = '23514', message = 'issued receipt number differs from the frozen requested number';
  end if;

  select count(*) into v_count
    from public.tb_receipt r
   where r.id = p_receipt_id
     and r.rid = v_receipt_no
     and r.userid = v_outbox.userid
     and r.refwhid = p_whid
     and r.rstatus in ('0', '1', '3')
     and round(r.totalbeforewithholding * 100)::bigint =
           (v_outbox.quote_snapshot ->> 'gross_satang')::bigint
     and round(r.ramount * 100)::bigint =
           (v_outbox.quote_snapshot ->> 'net_satang')::bigint;
  if v_count <> 1 then
    raise exception using errcode = '23514', message = 'receipt header does not match the approved frozen payment';
  end if;

  select count(*),
         count(*) filter (where i.fid = any(v_ids)),
         count(distinct i.fid) filter (where i.fid = any(v_ids))
    into v_count, v_match_count, v_distinct_count
    from public.tb_receipt_item i
   where i.rid = v_receipt_no;
  if v_count <> cardinality(v_ids)
     or v_match_count <> cardinality(v_ids)
     or v_distinct_count <> cardinality(v_ids) then
    raise exception using errcode = '23514', message = 'receipt items do not exactly cover the frozen payment group';
  end if;

  update public.wallet_payment_receipt_outbox
     set status = 'issued',
         receipt_id = p_receipt_id,
         receipt_no = v_receipt_no,
         claim_token = null,
         claimed_at = null,
         last_error = null
   where id = v_outbox.id
     and status = 'processing'
     and claim_token = p_claim_token;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '40001', message = 'receipt completion lost its claim';
  end if;

  return jsonb_build_object(
    'whid', p_whid,
    'status', 'issued',
    'already_done', false,
    'receipt_id', p_receipt_id,
    'receipt_no', v_receipt_no
  );
end;
$$;

revoke all on function public.complete_forwarder_payment_receipt_outbox_atomic(bigint, uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.complete_forwarder_payment_receipt_outbox_atomic(bigint, uuid, bigint, text)
  to service_role;

comment on function public.complete_forwarder_payment_receipt_outbox_atomic(bigint, uuid, bigint, text) is
  '0274 — service-role claim-token finalize. Verifies active receipt header, frozen gross/net, whID/owner, and the exact full forwarder item set before stamping issued.';

create or replace function public.fail_forwarder_payment_receipt_outbox_atomic(
  p_whid bigint,
  p_claim_token uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_error text := btrim(coalesce(p_error, ''));
  v_outbox public.wallet_payment_receipt_outbox%rowtype;
  v_count integer;
begin
  if p_whid is null or p_whid <= 0 or p_claim_token is null then
    raise exception using errcode = '22023', message = 'positive whid and claim_token are required';
  end if;
  if v_error = '' or length(v_error) > 2000 then
    raise exception using errcode = '22023', message = 'receipt failure error must be 1..2000 characters';
  end if;

  select * into v_outbox
    from public.wallet_payment_receipt_outbox
   where whid = p_whid
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'receipt outbox row was not found';
  end if;

  -- A stale loser can never downgrade the winner's durable issued stamp.
  if v_outbox.status = 'issued' then
    return jsonb_build_object(
      'whid', p_whid,
      'status', 'issued',
      'already_done', true,
      'receipt_id', v_outbox.receipt_id,
      'receipt_no', v_outbox.receipt_no
    );
  end if;
  if v_outbox.status = 'failed' and v_outbox.last_error = v_error then
    return jsonb_build_object(
      'whid', p_whid,
      'status', 'failed',
      'already_done', true,
      'receipt_id', null,
      'receipt_no', null
    );
  end if;
  if v_outbox.status is distinct from 'processing'
     or v_outbox.claim_token is distinct from p_claim_token then
    raise exception using errcode = '40001', message = 'receipt failure does not own the active claim';
  end if;

  update public.wallet_payment_receipt_outbox
     set status = 'failed',
         claim_token = null,
         claimed_at = null,
         last_error = v_error
   where id = v_outbox.id
     and status = 'processing'
     and claim_token = p_claim_token;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception using errcode = '40001', message = 'receipt failure lost its claim';
  end if;

  return jsonb_build_object(
    'whid', p_whid,
    'status', 'failed',
    'already_done', false,
    'receipt_id', null,
    'receipt_no', null
  );
end;
$$;

revoke all on function public.fail_forwarder_payment_receipt_outbox_atomic(bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_forwarder_payment_receipt_outbox_atomic(bigint, uuid, text)
  to service_role;

comment on function public.fail_forwarder_payment_receipt_outbox_atomic(bigint, uuid, text) is
  '0274 — service-role claim-token failure stamp. Only the active claimant may fail an attempt and an issued result can never be downgraded.';
