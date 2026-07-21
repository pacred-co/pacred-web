\set ON_ERROR_STOP on

CREATE TABLE public.tb_users (
  id bigserial PRIMARY KEY,
  userid varchar(10) NOT NULL UNIQUE,
  useraddressid varchar(20) NOT NULL DEFAULT ''
);

CREATE TABLE public.tb_address (
  addressid bigserial PRIMARY KEY,
  addressstatus varchar(1) NOT NULL DEFAULT '1',
  addressname varchar(200) NOT NULL DEFAULT 'สมชาย',
  addresslastname varchar(200) NOT NULL DEFAULT 'ใจดี',
  addresstel varchar(10) NOT NULL DEFAULT '0812345678',
  addresstel2 varchar(10),
  addressno varchar(200) NOT NULL DEFAULT '99/1',
  addresssubdistrict varchar(255) NOT NULL DEFAULT 'คลองเตย',
  addressdistrict varchar(255) NOT NULL DEFAULT 'คลองเตย',
  addressprovince varchar(255) NOT NULL DEFAULT 'กรุงเทพมหานคร',
  addresszipcode varchar(5) NOT NULL DEFAULT '10110',
  userid varchar(10) NOT NULL
);

CREATE TABLE public.tb_address_main (
  id bigserial PRIMARY KEY,
  addressid bigint NOT NULL,
  userid varchar(10) NOT NULL
);

CREATE OR REPLACE FUNCTION public.test_assert(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(condition, false) THEN
    RAISE EXCEPTION 'assertion failed: %', message;
  END IF;
END;
$$;

INSERT INTO public.tb_users (userid, useraddressid) VALUES
  ('PR001', ''),
  ('PR002', 'PCS'),
  ('PR003', '999'),
  ('PR004', ''),
  ('PR005', '50');

INSERT INTO public.tb_address (addressid, addressstatus, userid) VALUES
  (10, '1', 'PR001'),
  (11, '1', 'PR001'),
  (20, '0', 'PR002'),
  (21, '1', 'PR002'),
  (30, '1', 'PR003'),
  (50, '1', 'PR005');
UPDATE public.tb_address SET addressname = '' WHERE addressid = 50;

-- PR001 has duplicate pointers but the later row is the valid one.
INSERT INTO public.tb_address_main (id, addressid, userid) VALUES
  (1, 999, 'PR001'),
  (2, 11, 'PR001'),
  (3, 20, 'PR002'),
  (4, 999, 'PR004'),
  (5, 50, 'PR005');

\ir ../migrations/0270_customer_address_main_guard.sql

SELECT public.test_assert(
  (SELECT COUNT(*) = 1 AND MIN(addressid) = 11 FROM public.tb_address_main WHERE userid = 'PR001'),
  'duplicates converge on an active owned pointer'
);
SELECT public.test_assert(
  (SELECT addressid = 21 FROM public.tb_address_main WHERE userid = 'PR002'),
  'deleted pointer repairs to an active owned address'
);
SELECT public.test_assert(
  (SELECT addressid = 30 FROM public.tb_address_main WHERE userid = 'PR003'),
  'customer with an active address receives a missing main pointer'
);
SELECT public.test_assert(
  NOT EXISTS (SELECT 1 FROM public.tb_address_main WHERE userid = 'PR004'),
  'customer without an active address keeps no dangling pointer'
);
SELECT public.test_assert(
  NOT EXISTS (SELECT 1 FROM public.tb_address_main WHERE userid = 'PR005'),
  'incomplete active address is not accepted as a delivery default'
);
SELECT public.test_assert(
  (SELECT useraddressid = '11' FROM public.tb_users WHERE userid = 'PR001'),
  'blank last-used value repairs to main'
);
SELECT public.test_assert(
  (SELECT useraddressid = 'PCS' FROM public.tb_users WHERE userid = 'PR002'),
  'explicit warehouse pickup sentinel is preserved during backfill'
);
SELECT public.test_assert(
  (SELECT useraddressid = '30' FROM public.tb_users WHERE userid = 'PR003'),
  'invalid last-used value repairs to main'
);

-- First-address creation is atomic default + next-use persistence.
INSERT INTO public.tb_address (addressid, addressstatus, userid) VALUES (40, '1', 'PR004');
SELECT public.test_assert(
  (SELECT addressid = 40 FROM public.tb_address_main WHERE userid = 'PR004'),
  'first active address automatically becomes main'
);
SELECT public.test_assert(
  (SELECT useraddressid = '40' FROM public.tb_users WHERE userid = 'PR004'),
  'first main address is remembered for next checkout'
);

-- A deliberate default switch updates both canonical stores.
UPDATE public.tb_address_main SET addressid = 10 WHERE userid = 'PR001';
SELECT public.test_assert(
  (SELECT useraddressid = '10' FROM public.tb_users WHERE userid = 'PR001'),
  'switching main updates last-used address'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.tb_address_main (userid, addressid) VALUES ('PR001', 11);
    RAISE EXCEPTION 'expected duplicate main write to fail';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.tb_address_main SET addressid = 21 WHERE userid = 'PR004';
    RAISE EXCEPTION 'expected cross-user main write to fail';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.tb_address SET addressstatus = '0' WHERE addressid = 10;
    RAISE EXCEPTION 'expected current main soft-delete to fail';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.tb_address WHERE addressid = 10;
    RAISE EXCEPTION 'expected current main hard-delete to fail';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.tb_address (addressid, addressstatus, addressname, userid)
    VALUES (41, '1', '', 'PR004');
    RAISE EXCEPTION 'expected incomplete new active address to fail';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

SELECT public.test_assert(
  (SELECT addressstatus = '1' FROM public.tb_address WHERE addressid = 10),
  'failed default deletion leaves address active'
);

SELECT '✓ migration 0270 customer address continuity scenarios passed' AS result;
