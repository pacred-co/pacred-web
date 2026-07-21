\set ON_ERROR_STOP on

CREATE TABLE public.tb_header_order (
  hno text PRIMARY KEY,
  userid text NOT NULL,
  hstatus text NOT NULL,
  hdateupdate timestamptz,
  hdate5 timestamptz
);

CREATE TABLE public.tb_order (
  id bigserial PRIMARY KEY,
  hno text,
  userid text,
  cnameshop text,
  ctitle text,
  ctrackingnumber text
);

CREATE TABLE public.tb_forwarder (
  id bigserial PRIMARY KEY,
  userid text,
  reforder text,
  ftrackingchn text,
  fstatus text,
  fcabinetnumber text
);

\ir ../migrations/0268_shop_order_import_single_spine.sql

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

-- Multi-shop + comma bag + explicit split denominator + same-user scope.
INSERT INTO public.tb_header_order (hno, userid, hstatus) VALUES ('P1', 'PR001', '4');
INSERT INTO public.tb_order (hno, userid, cnameshop, ctitle, ctrackingnumber) VALUES
  ('P1', 'PR001', 'shop-a', 'two parcels', 'T1,T2'),
  ('P1', 'PR001', 'shop-b', 'split family', 'BASE');

INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber)
VALUES ('PR001', '', 'T1', '2', '');
SELECT public.test_assert((SELECT hstatus = '4' FROM public.tb_header_order WHERE hno = 'P1'), 'one of two comma tokens cannot advance');

INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber)
VALUES ('PR999', '', 'T2', '7', 'CROSS-USER');
SELECT public.test_assert((SELECT hstatus = '4' FROM public.tb_header_order WHERE hno = 'P1'), 'another member tracking cannot count');

INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber)
VALUES ('PR001', '', 'T2', '2', '');
INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber)
VALUES ('PR001', '', 'BASE-1/3', '2', '');
SELECT public.test_assert((SELECT hstatus = '4' FROM public.tb_header_order WHERE hno = 'P1'), 'BASE-1/3 cannot represent all three boxes');

INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber) VALUES
  ('PR001', '', 'BASE-2/3', '2', ''),
  ('PR001', '', 'BASE-3/3', '2', '');
SELECT public.test_assert((SELECT hstatus = '40' FROM public.tb_header_order WHERE hno = 'P1'), 'all shops and split boxes arrived -> 40');

UPDATE public.tb_forwarder
SET fcabinetnumber = 'CNT-P1'
WHERE userid = 'PR001' AND ftrackingchn IN ('T1','T2','BASE-1/3','BASE-2/3','BASE-3/3');
SELECT public.test_assert((SELECT hstatus = '5' AND hdate5 IS NOT NULL FROM public.tb_header_order WHERE hno = 'P1'), 'all families done -> 5 with hdate5');

SELECT public.test_assert(
  (SELECT COUNT(*) = 5 FROM public.get_linked_shop_forwarders('P1')),
  'canonical reader returns five same-user active rows and excludes cross-user'
);

-- Status 40 must down-correct on cancellation and deletion.
INSERT INTO public.tb_header_order (hno, userid, hstatus) VALUES ('P2', 'PR002', '4');
INSERT INTO public.tb_order (hno, userid, cnameshop, ctitle, ctrackingnumber)
VALUES ('P2', 'PR002', 'shop', 'rollback', 'ROLL');
INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber)
VALUES ('PR002', 'P2', 'ROLL', '2', '');
SELECT public.test_assert((SELECT hstatus = '40' FROM public.tb_header_order WHERE hno = 'P2'), 'arrival -> 40');

UPDATE public.tb_forwarder SET fstatus = '99' WHERE userid = 'PR002' AND ftrackingchn = 'ROLL';
SELECT public.test_assert((SELECT hstatus = '4' FROM public.tb_header_order WHERE hno = 'P2'), 'cancel -> 40 down-corrects to 4');

UPDATE public.tb_forwarder SET fstatus = '2' WHERE userid = 'PR002' AND ftrackingchn = 'ROLL';
SELECT public.test_assert((SELECT hstatus = '40' FROM public.tb_header_order WHERE hno = 'P2'), 'restore -> 40');

DELETE FROM public.tb_forwarder WHERE userid = 'PR002' AND ftrackingchn = 'ROLL';
SELECT public.test_assert((SELECT hstatus = '4' FROM public.tb_header_order WHERE hno = 'P2'), 'delete -> 40 down-corrects to 4');

-- Chinese comma is a first-class parcel separator.
INSERT INTO public.tb_header_order (hno, userid, hstatus) VALUES ('P3', 'PR003', '4');
INSERT INTO public.tb_order (hno, userid, cnameshop, ctitle, ctrackingnumber)
VALUES ('P3', 'PR003', 'shop', 'Chinese comma', 'A，B');
INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber) VALUES
  ('PR003', '', 'A', '2', ''),
  ('PR003', '', 'B', '2', '');
SELECT public.test_assert((SELECT hstatus = '40' FROM public.tb_header_order WHERE hno = 'P3'), 'Chinese comma tokens both arrived -> 40');

-- A known -N sibling at status 1 must hold the whole family back.
INSERT INTO public.tb_header_order (hno, userid, hstatus) VALUES ('P4', 'PR004', '4');
INSERT INTO public.tb_order (hno, userid, cnameshop, ctitle, ctrackingnumber)
VALUES ('P4', 'PR004', 'shop', 'undelimited split', 'FAM');
INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber)
VALUES ('PR004', '', 'FAM-1', '2', '');
SELECT public.test_assert((SELECT hstatus = '40' FROM public.tb_header_order WHERE hno = 'P4'), 'known -1 child arrived');
INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber)
VALUES ('PR004', '', 'FAM-2', '1', '');
SELECT public.test_assert((SELECT hstatus = '4' FROM public.tb_header_order WHERE hno = 'P4'), 'new pending sibling down-corrects family to 4');

-- Legacy lines with a blank userid inherit the header owner for safe linking.
INSERT INTO public.tb_header_order (hno, userid, hstatus) VALUES ('P5', 'PR005', '4');
INSERT INTO public.tb_order (hno, userid, cnameshop, ctitle, ctrackingnumber)
VALUES ('P5', '', 'shop', 'legacy blank owner', 'LEGACY');
INSERT INTO public.tb_forwarder (userid, reforder, ftrackingchn, fstatus, fcabinetnumber)
VALUES ('PR005', '', 'LEGACY', '2', '');
SELECT public.test_assert((SELECT hstatus = '40' FROM public.tb_header_order WHERE hno = 'P5'), 'blank line userid inherits header owner');

SELECT '✓ migration 0268 PostgreSQL integration scenarios passed' AS result;
