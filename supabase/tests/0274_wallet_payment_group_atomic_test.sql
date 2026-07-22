\set ON_ERROR_STOP on

create extension if not exists pgcrypto;

-- Minimal faithful subset of migration 0081 + 0196 used by 0274.
create table public.tb_forwarder (
  id bigint primary key,
  userid varchar(10) not null,
  fstatus varchar(2) not null default '5',
  fcredit varchar(1) not null default '',
  paydeposit varchar(1),
  fdateadminstatus timestamp without time zone,
  fdatestatus6 timestamp without time zone,
  fusercompany varchar(1) not null default '',
  adminidupdate varchar(10) not null default ''
);

create table public.tb_wallet_hs (
  id bigserial primary key,
  date timestamp without time zone,
  dateslip timestamp without time zone,
  amount numeric(14,2) not null,
  status varchar(1),
  type varchar(1),
  typenew varchar(1) not null,
  typeservice varchar(1) not null,
  paydeposit varchar(1),
  admincreate varchar(20),
  imagesslip varchar(150),
  depositnamebank varchar(100),
  nameuserbank varchar(200),
  nouserbank varchar(200),
  note text,
  adminid varchar(20),
  adminidupdate varchar(20),
  lockdate timestamp without time zone default current_timestamp,
  session varchar(100),
  reforder varchar(30),
  reforder2 bigint,
  whno varchar(30) not null,
  wusercredit varchar(1) not null,
  userid varchar(20) not null,
  adminidcrate varchar(30) not null
);

create table public.tb_wallet_paydeposit (
  id bigserial primary key,
  whid bigint not null,
  hno varchar(30) not null
);

alter table public.tb_wallet_hs enable row level security;
alter table public.tb_wallet_paydeposit enable row level security;

\ir ../migrations/0274_wallet_payment_group_atomic.sql

create or replace function public.test_assert(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

insert into public.tb_forwarder (id, userid, fstatus, fcredit) values
  (101, 'PR001', '5', ''),
  (102, 'PR001', '5', ''),
  (103, 'PR001', '5', ''),
  (104, 'PR001', '4', ''),
  (105, 'PR001', '4', '1'),
  (106, 'PR001', '5', ''),
  (201, 'PR002', '5', ''),
  (301, 'PR003', '5', ''),
  (302, 'PR003', '5', ''),
  (303, 'PR003', '5', ''),
  (304, 'PR004', '5', ''),
  (305, 'PR005', '5', '');

create temporary table test_result (name text primary key, whid bigint not null);
create temporary table decision_result (name text primary key, payload jsonb not null);

-- Main success case: caller order is intentionally reversed. gross + vat - wht
-- = net = bank (cashback is release-contained at zero) = sum(lines), all in satang.
insert into test_result (name, whid)
select 'first', public.submit_forwarder_payment_group_atomic(
  'idem-payment-0001',
  'PR001',
  array[102, 101]::bigint[],
  array[7500, 5000]::bigint[],
  jsonb_build_object(
    'gross_satang', 12000,
    'vat_satang', 700,
    'wht_satang', 200,
    'net_satang', 12500,
    'cashback_satang', 0,
    'bank_satang', 12500,
    'metadata', jsonb_build_object('rate_version', 'test-v1')
  ),
  'auth-user/forwarder_payment/slip-1.png',
  timestamp '2026-07-23 10:30:00',
  'KBANK-1234',
  true
);

select public.test_assert(
  (select count(*) = 1 from public.tb_wallet_hs
    where id = (select whid from test_result where name = 'first')
      and type = '1' and status = '1' and amount = 125.00
      and quote_gross_satang = 12000 and quote_vat_satang = 700
      and quote_wht_satang = 200 and quote_net_satang = 12500
      and quote_cashback_satang = 0 and quote_bank_satang = 12500
      and note = ''
      and payment_group_id is not null),
  'one slip header stores the frozen satang quote and actual bank amount'
);

select public.test_assert(
  (select quote_snapshot #> '{lines,0}' = '{"forwarder_id": 101, "amount_satang": 5000}'::jsonb
          and quote_snapshot #> '{lines,1}' = '{"forwarder_id": 102, "amount_satang": 7500}'::jsonb
     from public.tb_wallet_hs
    where id = (select whid from test_result where name = 'first')),
  'snapshot lines are canonical, ID-sorted, and amount-aligned'
);

select public.test_assert(
  (select count(*) = 2 and sum(amount) = 125.00
     from public.tb_wallet_hs
    where reforder2 = (select whid from test_result where name = 'first')
      and type = '4'),
  'exactly N children reconcile to frozen net'
);

select public.test_assert(
  (select count(distinct payment_group_id) = 1
          and min(payment_group_id::text) = max(payment_group_id::text)
     from public.tb_wallet_hs
    where id = (select whid from test_result where name = 'first')
       or reforder2 = (select whid from test_result where name = 'first')),
  'header and every child share one payment_group_id'
);

select public.test_assert(
  (select count(*) = 2 from public.tb_wallet_paydeposit
    where whid = (select whid from test_result where name = 'first')),
  'exactly N bridge rows were created'
);

select public.test_assert(
  (select count(*) = 2 from public.tb_forwarder
    where id in (101, 102) and fstatus = '6' and paydeposit = '1'
      and fusercompany = '1' and fdatestatus6 is not null),
  'all normal forwarders moved to pending verification together'
);

-- Review fields stay mutable. This simulates staff correcting dateslip, while
-- the original submitted date remains immutable in quote_snapshot.
update public.tb_wallet_hs
   set dateslip = timestamp '2026-07-23 10:31:00',
       note = note || ' reviewed'
 where id = (select whid from test_result where name = 'first');

-- Exact replay (also reordered) returns the same whID even after source statuses
-- and the mutable review date changed. No row is duplicated.
insert into test_result (name, whid)
select 'replay', public.submit_forwarder_payment_group_atomic(
  'idem-payment-0001',
  'PR001',
  array[101, 102]::bigint[],
  array[5000, 7500]::bigint[],
  '{"gross_satang":12000,"vat_satang":700,"wht_satang":200,"net_satang":12500,"cashback_satang":0,"bank_satang":12500,"metadata":{"rate_version":"test-v1"}}'::jsonb,
  'auth-user/forwarder_payment/slip-1.png',
  timestamp '2026-07-23 10:30:00',
  'KBANK-1234',
  true
);

select public.test_assert(
  (select (select whid from test_result where name = 'first')
        = (select whid from test_result where name = 'replay')),
  'same idempotency key + same canonical payload returns the original whID'
);
select public.test_assert(
  (select count(*) = 3 from public.tb_wallet_hs where payment_group_id =
    (select payment_group_id from public.tb_wallet_hs
      where id = (select whid from test_result where name = 'first'))),
  'idempotent replay creates no new header or children'
);

do $$
begin
  begin
    perform public.submit_forwarder_payment_group_atomic(
      'idem-payment-0001', 'PR001', array[101,102]::bigint[], array[5000,7500]::bigint[],
      '{"gross_satang":12001,"vat_satang":699,"wht_satang":200,"net_satang":12500,"cashback_satang":0,"bank_satang":12500,"metadata":{"rate_version":"test-v1"}}'::jsonb,
      'auth-user/forwarder_payment/slip-1.png', timestamp '2026-07-23 10:30:00', 'KBANK-1234', true
    );
    raise exception 'expected changed idempotency payload to fail';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    update public.tb_wallet_hs set amount = amount + 1
     where id = (select whid from test_result where name = 'first');
    raise exception 'expected frozen header amount update to fail';
  exception when check_violation then
    null;
  end;

  begin
    update public.tb_wallet_hs set reforder = '999'
     where reforder2 = (select whid from test_result where name = 'first')
       and reforder = '101';
    raise exception 'expected frozen child source update to fail';
  exception when check_violation then
    null;
  end;
end;
$$;

-- A second key cannot pay an already-active source. Resetting the forwarder row
-- demonstrates that the ledger guard is independent of the mutable status flag.
update public.tb_forwarder
   set fstatus = '5', paydeposit = null
 where id = 101;

do $$
begin
  begin
    perform public.submit_forwarder_payment_group_atomic(
      'idem-payment-duplicate-source', 'PR001', array[101]::bigint[], array[5000]::bigint[],
      '{"gross_satang":5000,"vat_satang":0,"wht_satang":0,"net_satang":5000,"cashback_satang":0,"bank_satang":5000}'::jsonb,
      'auth-user/forwarder_payment/slip-duplicate.png', null, 'KBANK-1234', false
    );
    raise exception 'expected duplicate active source to fail';
  exception when unique_violation then
    null;
  end;
end;
$$;

-- Cross-customer input is rejected before any money row is written.
do $$
begin
  begin
    perform public.submit_forwarder_payment_group_atomic(
      'idem-cross-user-0001', 'PR001', array[103,201]::bigint[], array[4000,6000]::bigint[],
      '{"gross_satang":10000,"vat_satang":0,"wht_satang":0,"net_satang":10000,"cashback_satang":0,"bank_satang":10000}'::jsonb,
      'auth-user/forwarder_payment/slip-cross.png', null, 'KBANK-1234', false
    );
    raise exception 'expected cross-user group to fail';
  exception when sqlstate '22023' then
    null;
  end;
end;
$$;

select public.test_assert(
  not exists (select 1 from public.tb_wallet_hs where idempotency_key = 'idem-cross-user-0001')
  and (select fstatus = '5' and coalesce(paydeposit, '') = '' from public.tb_forwarder where id = 103)
  and (select fstatus = '5' and coalesce(paydeposit, '') = '' from public.tb_forwarder where id = 201),
  'mixed ownership fails before header/child/status writes'
);

-- Force the third hop to fail. Catching the exception creates a PL/pgSQL
-- subtransaction; assertions prove header + child + prior work all rolled back.
create or replace function public.test_fail_wallet_bridge()
returns trigger language plpgsql as $$
begin
  if new.hno = '103' then
    raise exception 'injected bridge failure';
  end if;
  return new;
end;
$$;
create trigger trg_test_fail_wallet_bridge
before insert on public.tb_wallet_paydeposit
for each row execute function public.test_fail_wallet_bridge();

do $$
begin
  begin
    perform public.submit_forwarder_payment_group_atomic(
      'idem-rollback-bridge-0001', 'PR001', array[103]::bigint[], array[9000]::bigint[],
      '{"gross_satang":9000,"vat_satang":0,"wht_satang":0,"net_satang":9000,"cashback_satang":0,"bank_satang":9000}'::jsonb,
      'auth-user/forwarder_payment/slip-rollback.png', null, 'KBANK-1234', false
    );
    raise exception 'expected injected bridge failure';
  exception when raise_exception then
    null;
  end;
end;
$$;

drop trigger trg_test_fail_wallet_bridge on public.tb_wallet_paydeposit;

select public.test_assert(
  not exists (select 1 from public.tb_wallet_hs where idempotency_key = 'idem-rollback-bridge-0001')
  and not exists (select 1 from public.tb_wallet_hs where reforder = '103')
  and not exists (select 1 from public.tb_wallet_paydeposit where hno = '103')
  and (select fstatus = '5' and coalesce(paydeposit, '') = '' from public.tb_forwarder where id = 103),
  'failure at bridge hop rolls back the entire group'
);

-- Fail at the final forwarder-flip hop too. Header, child, and bridge were all
-- attempted before this trigger raises; the whole RPC still rolls back.
create or replace function public.test_fail_forwarder_flip()
returns trigger language plpgsql as $$
begin
  if new.id = 106 and new.paydeposit = '1' then
    raise exception 'injected forwarder flip failure';
  end if;
  return new;
end;
$$;
create trigger trg_test_fail_forwarder_flip
before update on public.tb_forwarder
for each row execute function public.test_fail_forwarder_flip();

do $$
begin
  begin
    perform public.submit_forwarder_payment_group_atomic(
      'idem-rollback-forwarder-0001', 'PR001', array[103,106]::bigint[], array[2000,2400]::bigint[],
      '{"gross_satang":4400,"vat_satang":0,"wht_satang":0,"net_satang":4400,"cashback_satang":0,"bank_satang":4400}'::jsonb,
      'auth-user/forwarder_payment/slip-rollback-forwarder.png', null, 'KBANK-1234', false
    );
    raise exception 'expected injected forwarder flip failure';
  exception when raise_exception then
    null;
  end;
end;
$$;

drop trigger trg_test_fail_forwarder_flip on public.tb_forwarder;

select public.test_assert(
  not exists (select 1 from public.tb_wallet_hs where idempotency_key = 'idem-rollback-forwarder-0001')
  and not exists (select 1 from public.tb_wallet_hs where reforder in ('103','106'))
  and not exists (select 1 from public.tb_wallet_paydeposit where hno in ('103','106'))
  and (select fstatus = '5' and coalesce(paydeposit, '') = '' from public.tb_forwarder where id = 103)
  and (select fstatus = '5' and coalesce(paydeposit, '') = '' from public.tb_forwarder where id = 106),
  'failure at final forwarder hop rolls back header, child, bridge, and status'
);

-- Ineligible state and broken money invariants also fail with zero writes.
do $$
begin
  begin
    perform public.submit_forwarder_payment_group_atomic(
      'idem-ineligible-0001', 'PR001', array[104]::bigint[], array[1000]::bigint[],
      '{"gross_satang":1000,"vat_satang":0,"wht_satang":0,"net_satang":1000,"cashback_satang":0,"bank_satang":1000}'::jsonb,
      'auth-user/forwarder_payment/slip-ineligible.png', null, 'KBANK-1234', false
    );
    raise exception 'expected ineligible status to fail';
  exception when sqlstate '22023' then
    null;
  end;

  begin
    perform public.submit_forwarder_payment_group_atomic(
      'idem-cashback-contained-0001', 'PR001', array[103]::bigint[], array[9000]::bigint[],
      '{"gross_satang":9000,"vat_satang":0,"wht_satang":0,"net_satang":9000,"cashback_satang":500,"bank_satang":8500}'::jsonb,
      'auth-user/forwarder_payment/slip-cashback.png', null, 'KBANK-1234', false
    );
    raise exception 'expected cashback release containment to fail';
  exception when sqlstate '0A000' then
    null;
  end;
end;
$$;

select public.test_assert(
  not exists (select 1 from public.tb_wallet_hs where idempotency_key in ('idem-ineligible-0001','idem-cashback-contained-0001')),
  'invalid eligibility/cashback-contained submissions leave no payment rows'
);

-- Credit reserve/restore is not in the atomic decision yet, so release
-- containment rejects the source without consuming its credit marker.
do $$
begin
  begin
    perform public.submit_forwarder_payment_group_atomic(
      'idem-credit-0001', 'PR001', array[105]::bigint[], array[3300]::bigint[],
      '{"gross_satang":3300,"vat_satang":0,"wht_satang":0,"net_satang":3300,"cashback_satang":0,"bank_satang":3300,"metadata":{"kind":"credit"}}'::jsonb,
      'auth-user/forwarder_payment/slip-credit.png', null, 'KBANK-1234', false
    );
    raise exception 'expected credit release containment to fail';
  exception when sqlstate '0A000' then
    null;
  end;
end;
$$;

select public.test_assert(
  not exists (select 1 from public.tb_wallet_hs where idempotency_key = 'idem-credit-0001')
  and (select fstatus = '4' and fcredit = '1' and coalesce(paydeposit, '') = ''
         from public.tb_forwarder where id = 105),
  'credit source is rejected without any payment row or state mutation'
);

-- ────────────────────────────────────────────────────────────
-- Atomic approve + durable receipt outbox
-- ────────────────────────────────────────────────────────────
insert into test_result (name, whid)
select 'approve_group', public.submit_forwarder_payment_group_atomic(
  'idem-approve-group-0001', 'PR003', array[302,301]::bigint[], array[6000,4000]::bigint[],
  '{"gross_satang":10100,"vat_satang":0,"wht_satang":100,"net_satang":10000,"cashback_satang":0,"bank_satang":10000,"metadata":{"decision_test":"approve"}}'::jsonb,
  'auth-pr003/forwarder_payment/slip-approve.png', null, 'KBANK-1234', true
);

insert into decision_result (name, payload)
select 'approve_first', public.approve_forwarder_payment_group_atomic(
  (select whid from test_result where name = 'approve_group'),
  'admin_a',
  'FRG2607-TEST01'
);

select public.test_assert(
  (select status = '2' and adminidupdate = 'admin_a'
     from public.tb_wallet_hs where id = (select whid from test_result where name = 'approve_group'))
  and (select count(*) = 2 from public.tb_wallet_hs
        where reforder2 = (select whid from test_result where name = 'approve_group') and status = '2')
  and (select count(*) = 2 from public.tb_forwarder
        where id in (301,302) and fstatus = '6' and paydeposit = ''
          and fdatestatus6 is not null and adminidupdate = 'admin_a'),
  'approve atomically settles header, every child, and every forwarder'
);

select public.test_assert(
  (select count(*) = 2 from public.tb_wallet_paydeposit
    where whid = (select whid from test_result where name = 'approve_group'))
  and (select count(*) = 1 and bool_and(
                status = 'pending'
                and forwarder_ids = array[301,302]::bigint[]
                and requested_receipt_no = 'FRG2607-TEST01'
              )
         from public.wallet_payment_receipt_outbox
        where whid = (select whid from test_result where name = 'approve_group')),
  'approve retains exact bridges and durably enqueues one frozen receipt intent'
);

select public.test_assert(
  (select payload ->> 'already_done' = 'false'
          and payload -> 'fids' = '[301,302]'::jsonb
     from decision_result where name = 'approve_first'),
  'first approve reports exact fids and already_done=false'
);

insert into decision_result (name, payload)
select 'approve_retry', public.approve_forwarder_payment_group_atomic(
  (select whid from test_result where name = 'approve_group'),
  'admin_b',
  'FRG2607-TEST01'
);

select public.test_assert(
  (select payload ->> 'already_done' = 'true'
          and payload ->> 'requested_receipt_no' = 'FRG2607-TEST01'
     from decision_result where name = 'approve_retry')
  and (select count(*) = 1 and bool_and(approved_by = 'admin_a')
         from public.wallet_payment_receipt_outbox
        where whid = (select whid from test_result where name = 'approve_group')),
  'approve retry is idempotent and does not rewrite the original approver/outbox'
);

do $$
begin
  begin
    perform public.reject_forwarder_payment_group_atomic(
      (select whid from test_result where name = 'approve_group'), 'admin_b'
    );
    raise exception 'expected approved/outboxed group rejection to fail';
  exception when check_violation then
    null;
  end;

  begin
    perform public.approve_forwarder_payment_group_atomic(
      (select whid from test_result where name = 'approve_group'),
      'admin_b',
      'FRG2607-DIFFERENT'
    );
    raise exception 'expected changed requested receipt number to fail idempotency';
  exception when check_violation then
    null;
  end;

  begin
    update public.wallet_payment_receipt_outbox
       set quote_snapshot = quote_snapshot || '{"tampered":true}'::jsonb
     where whid = (select whid from test_result where name = 'approve_group');
    raise exception 'expected immutable outbox payload update to fail';
  exception when check_violation then
    null;
  end;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- Atomic reject + idempotent retry (never creates receipt intent)
-- ────────────────────────────────────────────────────────────
insert into test_result (name, whid)
select 'reject_group', public.submit_forwarder_payment_group_atomic(
  'idem-reject-group-0001', 'PR003', array[303]::bigint[], array[5500]::bigint[],
  '{"gross_satang":5600,"vat_satang":0,"wht_satang":100,"net_satang":5500,"cashback_satang":0,"bank_satang":5500}'::jsonb,
  'auth-pr003/forwarder_payment/slip-reject.png', null, 'KBANK-1234', true
);

insert into decision_result (name, payload)
select 'reject_first', public.reject_forwarder_payment_group_atomic(
  (select whid from test_result where name = 'reject_group'),
  'admin_r',
  'สลิปไม่ชัด กรุณาส่งใหม่'
);

select public.test_assert(
  (select status = '3' and adminidupdate = 'admin_r'
          and note = 'สลิปไม่ชัด กรุณาส่งใหม่'
     from public.tb_wallet_hs where id = (select whid from test_result where name = 'reject_group'))
  and (select count(*) = 1 from public.tb_wallet_hs
        where reforder2 = (select whid from test_result where name = 'reject_group') and status = '3')
  and (select fstatus = '5' and paydeposit = '' and fusercompany = '' and adminidupdate = 'admin_r'
         from public.tb_forwarder where id = 303)
  and not exists (select 1 from public.tb_wallet_paydeposit
                   where whid = (select whid from test_result where name = 'reject_group'))
  and not exists (select 1 from public.wallet_payment_receipt_outbox
                   where whid = (select whid from test_result where name = 'reject_group')),
  'reject atomically rejects all rows, reverts source, deletes bridges, and creates no receipt'
);

insert into decision_result (name, payload)
select 'reject_retry', public.reject_forwarder_payment_group_atomic(
  (select whid from test_result where name = 'reject_group'),
  'admin_x',
  'เหตุผลใหม่ที่ retry ต้องไม่ทับ'
);

select public.test_assert(
  (select payload ->> 'already_done' = 'false' from decision_result where name = 'reject_first')
  and (select payload ->> 'already_done' = 'true'
              and payload ->> 'rejection_reason' = 'สลิปไม่ชัด กรุณาส่งใหม่'
         from decision_result where name = 'reject_retry')
  and (select note = 'สลิปไม่ชัด กรุณาส่งใหม่'
         from public.tb_wallet_hs where id = (select whid from test_result where name = 'reject_group')),
  'reject retry reports already_done and never overwrites the first reason'
);

-- Inject failure at the durable outbox insert, after approve has attempted every
-- status mutation. All prior work must roll back to pending.
insert into test_result (name, whid)
select 'approve_failure_group', public.submit_forwarder_payment_group_atomic(
  'idem-approve-failure-0001', 'PR004', array[304]::bigint[], array[6600]::bigint[],
  '{"gross_satang":6600,"vat_satang":0,"wht_satang":0,"net_satang":6600,"cashback_satang":0,"bank_satang":6600}'::jsonb,
  'auth-pr004/forwarder_payment/slip-approve-failure.png', null, 'KBANK-1234', false
);

create or replace function public.test_fail_receipt_outbox()
returns trigger language plpgsql as $$
begin
  if new.userid = 'PR004' then
    raise exception 'injected receipt outbox failure';
  end if;
  return new;
end;
$$;
create trigger trg_test_fail_receipt_outbox
before insert on public.wallet_payment_receipt_outbox
for each row execute function public.test_fail_receipt_outbox();

do $$
begin
  begin
    perform public.approve_forwarder_payment_group_atomic(
      (select whid from test_result where name = 'approve_failure_group'), 'admin_f'
    );
    raise exception 'expected injected receipt outbox failure';
  exception when raise_exception then
    null;
  end;
end;
$$;

drop trigger trg_test_fail_receipt_outbox on public.wallet_payment_receipt_outbox;

select public.test_assert(
  (select status = '1' from public.tb_wallet_hs
    where id = (select whid from test_result where name = 'approve_failure_group'))
  and (select count(*) = 1 from public.tb_wallet_hs
        where reforder2 = (select whid from test_result where name = 'approve_failure_group') and status = '1')
  and (select fstatus = '6' and paydeposit = '1' from public.tb_forwarder where id = 304)
  and (select count(*) = 1 from public.tb_wallet_paydeposit
        where whid = (select whid from test_result where name = 'approve_failure_group'))
  and not exists (select 1 from public.wallet_payment_receipt_outbox
                   where whid = (select whid from test_result where name = 'approve_failure_group')),
  'outbox failure rolls approve header, child, forwarder, and outbox back to pending'
);

insert into decision_result (name, payload)
select 'approve_after_failure', public.approve_forwarder_payment_group_atomic(
  (select whid from test_result where name = 'approve_failure_group'), 'admin_f'
);

select public.test_assert(
  (select payload ->> 'already_done' = 'false'
     from decision_result where name = 'approve_after_failure')
  and (select count(*) = 1 and bool_and(status = 'pending')
         from public.wallet_payment_receipt_outbox
        where whid = (select whid from test_result where name = 'approve_failure_group')),
  'approve can be retried safely after a rolled-back outbox failure'
);

-- Inject failure at bridge deletion, the final reject hop. Earlier row/source
-- reversals must roll back and leave the entire group pending for retry.
insert into test_result (name, whid)
select 'reject_failure_group', public.submit_forwarder_payment_group_atomic(
  'idem-reject-failure-0001', 'PR005', array[305]::bigint[], array[7700]::bigint[],
  '{"gross_satang":7700,"vat_satang":0,"wht_satang":0,"net_satang":7700,"cashback_satang":0,"bank_satang":7700}'::jsonb,
  'auth-pr005/forwarder_payment/slip-reject-failure.png', null, 'KBANK-1234', false
);

create or replace function public.test_fail_bridge_delete()
returns trigger language plpgsql as $$
begin
  if old.hno = '305' then
    raise exception 'injected bridge delete failure';
  end if;
  return old;
end;
$$;
create trigger trg_test_fail_bridge_delete
before delete on public.tb_wallet_paydeposit
for each row execute function public.test_fail_bridge_delete();

do $$
begin
  begin
    perform public.reject_forwarder_payment_group_atomic(
      (select whid from test_result where name = 'reject_failure_group'), 'admin_f'
    );
    raise exception 'expected injected bridge delete failure';
  exception when raise_exception then
    null;
  end;
end;
$$;

drop trigger trg_test_fail_bridge_delete on public.tb_wallet_paydeposit;

select public.test_assert(
  (select status = '1' from public.tb_wallet_hs
    where id = (select whid from test_result where name = 'reject_failure_group'))
  and (select count(*) = 1 from public.tb_wallet_hs
        where reforder2 = (select whid from test_result where name = 'reject_failure_group') and status = '1')
  and (select fstatus = '6' and paydeposit = '1' from public.tb_forwarder where id = 305)
  and (select count(*) = 1 from public.tb_wallet_paydeposit
        where whid = (select whid from test_result where name = 'reject_failure_group')),
  'bridge-delete failure rolls reject header, child, source, and bridge back to pending'
);

insert into decision_result (name, payload)
select 'reject_after_failure', public.reject_forwarder_payment_group_atomic(
  (select whid from test_result where name = 'reject_failure_group'), 'admin_f'
);

select public.test_assert(
  (select payload ->> 'already_done' = 'false'
     from decision_result where name = 'reject_after_failure')
  and not exists (select 1 from public.tb_wallet_paydeposit
                   where whid = (select whid from test_result where name = 'reject_failure_group')),
  'reject can be retried safely after a rolled-back bridge failure'
);

-- The partial unique index is a DB backstop even for a direct legacy insert.
do $$
begin
  begin
    insert into public.tb_wallet_hs (
      date, amount, status, type, typenew, typeservice, paydeposit, imagesslip,
      depositnamebank, note, reforder, whno, wusercredit, userid, adminidcrate
    ) values (
      now(), 50, '1', '4', '6', '2', '1', '', '', '', '101', '', '', 'PR001', ''
    );
    raise exception 'expected DB duplicate-source guard to fail';
  exception when unique_violation then
    null;
  end;
end;
$$;

-- เก็บเพิ่ม (follow-up collection · PR215/52328 prod precedent): a SETTLED
-- ('2') allocation plus a NEW pending ('1') leg for the same forwarder is a
-- legitimate business shape (forgotten crate fee etc.) and must NOT trip the
-- pending-only uniqueness guard. Uses forwarder 304 (PR004 · untouched above).
do $$
begin
  insert into public.tb_wallet_hs (
    date, amount, status, type, typenew, typeservice, paydeposit, imagesslip,
    depositnamebank, note, reforder, whno, wusercredit, userid, adminidcrate
  ) values (
    now(), 500, '2', '4', '6', '2', '', '', '', '', '304', '', '', 'PR004', ''
  );
  -- Follow-up pending leg for the same (userid, reforder): must succeed.
  insert into public.tb_wallet_hs (
    date, amount, status, type, typenew, typeservice, paydeposit, imagesslip,
    depositnamebank, note, reforder, whno, wusercredit, userid, adminidcrate
  ) values (
    now(), 120, '1', '4', '6', '2', '1', '', '', '', '304', '', '', 'PR004', ''
  );
  -- But a SECOND simultaneous pending leg is the real double-submit race: block.
  begin
    insert into public.tb_wallet_hs (
      date, amount, status, type, typenew, typeservice, paydeposit, imagesslip,
      depositnamebank, note, reforder, whno, wusercredit, userid, adminidcrate
    ) values (
      now(), 120, '1', '4', '6', '2', '1', '', '', '', '304', '', '', 'PR004', ''
    );
    raise exception 'expected second PENDING leg for the same source to fail';
  exception when unique_violation then
    null;
  end;
end;
$$;

select public.test_assert(
  (select count(*) from public.tb_wallet_hs
    where userid = 'PR004' and reforder = '304' and type = '4' and typeservice = '2') = 2,
  'follow-up collection (settled + one pending) is allowed; a duplicate pending leg is not'
);

select public.test_assert(
  not has_function_privilege(
    'authenticated',
    'public.submit_forwarder_payment_group_atomic(text,text,bigint[],bigint[],jsonb,text,timestamp without time zone,text,boolean)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the SECURITY DEFINER money RPC'
);
select public.test_assert(
  has_function_privilege(
    'service_role',
    'public.submit_forwarder_payment_group_atomic(text,text,bigint[],bigint[],jsonb,text,timestamp without time zone,text,boolean)',
    'EXECUTE'
  ),
  'server-side service_role can call the atomic RPC'
);

select public.test_assert(
  not has_function_privilege(
    'authenticated',
    'public.approve_forwarder_payment_group_atomic(bigint,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reject_forwarder_payment_group_atomic(bigint,text,text)',
    'EXECUTE'
  )
  and not has_table_privilege(
    'authenticated', 'public.wallet_payment_receipt_outbox', 'SELECT'
  ),
  'authenticated clients cannot call decision RPCs or read receipt outbox'
);

select public.test_assert(
  has_function_privilege(
    'service_role',
    'public.approve_forwarder_payment_group_atomic(bigint,text,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.reject_forwarder_payment_group_atomic(bigint,text,text)',
    'EXECUTE'
  )
  and has_table_privilege(
    'service_role', 'public.wallet_payment_receipt_outbox', 'SELECT'
  )
  and has_table_privilege(
    'service_role', 'public.wallet_payment_receipt_outbox', 'UPDATE'
  ),
  'service_role can call decision RPCs and process durable receipt outbox'
);

select '✓ migration 0274 submit + approve/reject + receipt-outbox scenarios passed' as result;
