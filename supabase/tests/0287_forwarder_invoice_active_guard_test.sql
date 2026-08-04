\set ON_ERROR_STOP on

create table public.tb_forwarder_invoice (
  id bigserial primary key,
  doc_no varchar(20) not null unique,
  userid varchar(20) not null,
  date_issued date not null,
  date_due date not null,
  subtotal_thb numeric(12,2) not null default 0,
  total_thb numeric(12,2) not null default 0,
  status varchar(20) not null default 'issued'
    check (status in ('issued', 'paid', 'cancelled')),
  is_juristic boolean not null default false,
  issued_by varchar(50) not null
);

create table public.tb_forwarder_invoice_item (
  id bigserial primary key,
  invoice_id bigint not null references public.tb_forwarder_invoice(id) on delete cascade,
  forwarder_id integer not null,
  amount_thb numeric(12,2) not null,
  unique (invoice_id, forwarder_id)
);

\ir ../migrations/0287_forwarder_invoice_active_guard.sql

begin;

do $$
declare
  first_invoice_id bigint;
  second_invoice_id bigint;
  test_forwarder_id integer := 2147483001;
  duplicate_blocked boolean := false;
begin
  insert into public.tb_forwarder_invoice (
    doc_no, userid, date_issued, date_due, subtotal_thb, total_thb,
    status, is_juristic, issued_by
  ) values (
    'TEST-0287-A', 'TEST0287', current_date, current_date, 100, 100,
    'issued', false, 'test'
  ) returning id into first_invoice_id;

  insert into public.tb_forwarder_invoice_item (invoice_id, forwarder_id, amount_thb)
  values (first_invoice_id, test_forwarder_id, 100);

  insert into public.tb_forwarder_invoice (
    doc_no, userid, date_issued, date_due, subtotal_thb, total_thb,
    status, is_juristic, issued_by
  ) values (
    'TEST-0287-B', 'TEST0287', current_date, current_date, 100, 100,
    'issued', false, 'test'
  ) returning id into second_invoice_id;

  begin
    insert into public.tb_forwarder_invoice_item (invoice_id, forwarder_id, amount_thb)
    values (second_invoice_id, test_forwarder_id, 100);
  exception when unique_violation then
    duplicate_blocked := true;
  end;

  if not duplicate_blocked then
    raise exception 'expected second active invoice item to be rejected';
  end if;

  update public.tb_forwarder_invoice
  set status = 'cancelled'
  where id = first_invoice_id;

  insert into public.tb_forwarder_invoice_item (invoice_id, forwarder_id, amount_thb)
  values (second_invoice_id, test_forwarder_id, 100);
end;
$$;

rollback;
