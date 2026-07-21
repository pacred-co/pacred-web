-- 0270_customer_address_main_guard.sql (2026-07-21 · Codex)
-- One reusable customer address spine for member/admin/MOMO flows.
--
-- Existing production risk repaired here:
--   * tb_address_main allowed duplicate, dangling, deleted, and cross-user rows;
--   * the first saved address was not guaranteed to become the default;
--   * tb_users.userAddressID and tb_address_main could disagree;
--   * a current default could be deleted/disabled without selecting a replacement.
--
-- ADDRESS METADATA ONLY. No order, forwarder, status, wallet, or money writes.

-- One DB predicate shared by cleanup, pointer guards, and the NOT VALID check.
-- NOT VALID preserves historical rows for staff-led correction while every new
-- active row (and every future UPDATE) must be complete enough to deliver.
CREATE OR REPLACE FUNCTION public.is_customer_delivery_address_usable(
  p_status text,
  p_name text,
  p_lastname text,
  p_tel text,
  p_tel2 text,
  p_no text,
  p_subdistrict text,
  p_district text,
  p_province text,
  p_zipcode text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT p_status <> '1' OR (
    btrim(COALESCE(p_name, '')) <> ''
    AND btrim(COALESCE(p_lastname, '')) <> ''
    AND btrim(COALESCE(p_tel, '')) ~ '^[0-9]{9,10}$'
    AND (
      btrim(COALESCE(p_tel2, '')) = ''
      OR btrim(COALESCE(p_tel2, '')) ~ '^[0-9]{9,10}$'
    )
    AND btrim(COALESCE(p_no, '')) <> ''
    AND btrim(COALESCE(p_subdistrict, '')) <> ''
    AND btrim(COALESCE(p_district, '')) <> ''
    AND btrim(COALESCE(p_province, '')) <> ''
    AND btrim(COALESCE(p_zipcode, '')) ~ '^[0-9]{5}$'
  );
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tb_address'::regclass
      AND conname = 'chk_tb_address_active_delivery_usable'
  ) THEN
    ALTER TABLE public.tb_address
      ADD CONSTRAINT chk_tb_address_active_delivery_usable
      CHECK (public.is_customer_delivery_address_usable(
        addressstatus, addressname, addresslastname, addresstel, addresstel2,
        addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode
      )) NOT VALID;
  END IF;
END;
$$;

-- 1. Keep exactly one deterministic pointer per customer. Prefer the oldest
-- pointer that already targets one of that customer's usable active addresses.
WITH ranked AS (
  SELECT
    m.id,
    row_number() OVER (
      PARTITION BY m.userid
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1
          FROM public.tb_address a
          WHERE a.addressid = m.addressid
            AND a.userid = m.userid
            AND a.addressstatus = '1'
            AND public.is_customer_delivery_address_usable(
              a.addressstatus, a.addressname, a.addresslastname, a.addresstel, a.addresstel2,
              a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode
            )
        ) THEN 0 ELSE 1 END,
        m.id
    ) AS rn
  FROM public.tb_address_main m
)
DELETE FROM public.tb_address_main m
USING ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- Repair the survivor when it points to a missing/deleted/foreign address.
WITH replacement AS (
  SELECT m.id, MIN(a.addressid) AS addressid
  FROM public.tb_address_main m
  JOIN public.tb_address a
    ON a.userid = m.userid
   AND a.addressstatus = '1'
   AND public.is_customer_delivery_address_usable(
     a.addressstatus, a.addressname, a.addresslastname, a.addresstel, a.addresstel2,
     a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode
   )
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.tb_address current_address
    WHERE current_address.addressid = m.addressid
      AND current_address.userid = m.userid
      AND current_address.addressstatus = '1'
      AND public.is_customer_delivery_address_usable(
        current_address.addressstatus, current_address.addressname, current_address.addresslastname,
        current_address.addresstel, current_address.addresstel2, current_address.addressno,
        current_address.addresssubdistrict, current_address.addressdistrict,
        current_address.addressprovince, current_address.addresszipcode
      )
  )
  GROUP BY m.id
)
UPDATE public.tb_address_main m
SET addressid = r.addressid
FROM replacement r
WHERE m.id = r.id;

-- No active address means there is no honest default to point at.
DELETE FROM public.tb_address_main m
WHERE NOT EXISTS (
  SELECT 1
  FROM public.tb_address a
  WHERE a.addressid = m.addressid
    AND a.userid = m.userid
    AND a.addressstatus = '1'
    AND public.is_customer_delivery_address_usable(
      a.addressstatus, a.addressname, a.addresslastname, a.addresstel, a.addresstel2,
      a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_address_main_userid
  ON public.tb_address_main (userid);

-- Legacy imports may have inserted explicit ids without advancing the sequence.
-- Resynchronise before the backfill creates any new pointer rows.
DO $$
DECLARE
  seq_name text := pg_get_serial_sequence('public.tb_address_main', 'id');
  max_id bigint;
  has_rows boolean;
BEGIN
  IF seq_name IS NOT NULL THEN
    SELECT COALESCE(MAX(id), 0), EXISTS (SELECT 1 FROM public.tb_address_main)
      INTO max_id, has_rows
    FROM public.tb_address_main;
    PERFORM setval(seq_name::regclass, GREATEST(max_id, 1), has_rows);
  END IF;
END;
$$;

-- Backfill customers who have reusable addresses but never received a main row.
INSERT INTO public.tb_address_main (userid, addressid)
SELECT a.userid, MIN(a.addressid)
FROM public.tb_address a
WHERE a.addressstatus = '1'
  AND public.is_customer_delivery_address_usable(
    a.addressstatus, a.addressname, a.addresslastname, a.addresstel, a.addresstel2,
    a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode
  )
GROUP BY a.userid
ON CONFLICT (userid) DO NOTHING;

-- Keep an existing, valid last-used address (and the explicit PCS pickup
-- sentinel). Repair only blank/invalid legacy values to the canonical main.
-- ⚠️ FIX (เดฟ · integration review 2026-07-21): `tb_users` เป็นตาราง legacy ที่คอลัมน์
-- เป็น camelCase มี quote จริงใน DB ("userID" · "userAddressID") — เขียน u.userid /
-- useraddressid แบบไม่ quote จะโดน Postgres fold เป็นตัวเล็กแล้ว error
-- `column u.userid does not exist` ทั้ง migration (คลาสเดียวกับบั๊ก mig-0113 ที่เคยทำ
-- ฟอร์มย้ายเซลใช้ไม่ได้ทั้งหน้า). ทุกจุดที่แตะ tb_users ต้องใส่ quote.
UPDATE public.tb_users u
SET "userAddressID" = m.addressid::text
FROM public.tb_address_main m
WHERE m.userid = u."userID"
  AND btrim(COALESCE(u."userAddressID", '')) <> 'PCS'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tb_address a
    WHERE a.userid = u."userID"
      AND a.addressstatus = '1'
      AND a.addressid::text = btrim(COALESCE(u."userAddressID", ''))
      AND public.is_customer_delivery_address_usable(
        a.addressstatus, a.addressname, a.addresslastname, a.addresstel, a.addresstel2,
        a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode
      )
  );

-- 2. Reject every future dangling/deleted/cross-user main pointer at the DB
-- boundary, including writes that bypass the Next.js actions.
CREATE OR REPLACE FUNCTION public.guard_customer_main_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_address a
    WHERE a.addressid = NEW.addressid
      AND a.userid = NEW.userid
      AND a.addressstatus = '1'
      AND public.is_customer_delivery_address_usable(
        a.addressstatus, a.addressname, a.addresslastname, a.addresstel, a.addresstel2,
        a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode
      )
  ) THEN
    RAISE EXCEPTION 'main address % must be active and owned by customer %', NEW.addressid, NEW.userid
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_customer_main_address ON public.tb_address_main;
CREATE TRIGGER trg_guard_customer_main_address
BEFORE INSERT OR UPDATE OF userid, addressid
ON public.tb_address_main
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_main_address();

-- 3. The first active address becomes the default atomically. The unique index
-- makes concurrent first-address inserts converge instead of creating twins.
CREATE OR REPLACE FUNCTION public.ensure_first_customer_address_is_main()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.addressstatus = '1' AND public.is_customer_delivery_address_usable(
    NEW.addressstatus, NEW.addressname, NEW.addresslastname, NEW.addresstel, NEW.addresstel2,
    NEW.addressno, NEW.addresssubdistrict, NEW.addressdistrict, NEW.addressprovince, NEW.addresszipcode
  ) THEN
    INSERT INTO public.tb_address_main (userid, addressid)
    VALUES (NEW.userid, NEW.addressid)
    ON CONFLICT (userid) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_first_customer_address_is_main ON public.tb_address;
CREATE TRIGGER trg_ensure_first_customer_address_is_main
AFTER INSERT OR UPDATE OF addressstatus ON public.tb_address
FOR EACH ROW EXECUTE FUNCTION public.ensure_first_customer_address_is_main();

-- 4. A deliberate default change is also the next checkout's selected address.
-- Clearing/moving a pointer clears the old customer's stale last-used value only
-- when it still points at that exact address.
CREATE OR REPLACE FUNCTION public.sync_customer_main_to_last_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.tb_users
    SET "userAddressID" = ''
    WHERE "userID" = OLD.userid
      AND "userAddressID" = OLD.addressid::text
      AND (TG_OP = 'DELETE' OR OLD.userid IS DISTINCT FROM NEW.userid);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.tb_users
    SET "userAddressID" = NEW.addressid::text
    WHERE "userID" = NEW.userid;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_customer_main_to_last_used ON public.tb_address_main;
CREATE TRIGGER trg_sync_customer_main_to_last_used
AFTER INSERT OR DELETE OR UPDATE OF userid, addressid
ON public.tb_address_main
FOR EACH ROW EXECUTE FUNCTION public.sync_customer_main_to_last_used();

-- 5. A main address cannot be hard-deleted, soft-deleted, or reassigned. The
-- caller must select another main address first, so downstream MOMO/import
-- creation never inherits a dead pointer.
CREATE OR REPLACE FUNCTION public.protect_customer_main_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tb_address_main m
    WHERE m.userid = OLD.userid
      AND m.addressid = OLD.addressid
  ) AND (
    TG_OP = 'DELETE'
    OR NEW.userid IS DISTINCT FROM OLD.userid
    OR NEW.addressstatus IS DISTINCT FROM '1'
  ) THEN
    RAISE EXCEPTION 'select another main address before removing address % for customer %', OLD.addressid, OLD.userid
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_customer_main_address ON public.tb_address;
CREATE TRIGGER trg_protect_customer_main_address
BEFORE DELETE OR UPDATE OF userid, addressstatus
ON public.tb_address
FOR EACH ROW EXECUTE FUNCTION public.protect_customer_main_address();

COMMENT ON INDEX public.ux_tb_address_main_userid IS
  '0270: exactly one usable, active, owned default-address pointer per customer';
COMMENT ON FUNCTION public.is_customer_delivery_address_usable(text, text, text, text, text, text, text, text, text, text) IS
  '0270: delivery completeness predicate used by tb_address writes, default repair, and main-pointer guards';
COMMENT ON FUNCTION public.guard_customer_main_address() IS
  '0270: reject dangling, deleted, or cross-customer tb_address_main pointers';
COMMENT ON FUNCTION public.ensure_first_customer_address_is_main() IS
  '0270: atomically make the first active reusable customer address the default';
COMMENT ON FUNCTION public.sync_customer_main_to_last_used() IS
  '0270: a deliberate main-address change becomes tb_users.userAddressID for the next checkout';
COMMENT ON FUNCTION public.protect_customer_main_address() IS
  '0270: select another default before deleting, disabling, or reassigning the current default address';
