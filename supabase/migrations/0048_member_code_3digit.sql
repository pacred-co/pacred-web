-- 0048_member_code_3digit.sql
-- Member code pattern change: PR00001 (5-digit fixed) → PR001 (min-3-digit).
--
-- Numbered 0048 (after ภูม's Phase-I2 batch 0044-0047) — this migration is
-- independent (only the generate_member_code function + a profiles backfill),
-- so apply-order relative to 0044-0047 does not matter. Applies cleanly last.
--
-- Per ลูกพี่ 2026-05-17: รหัสลูกค้าต้องเป็นแพทเทิน PR001 — ขั้นต่ำ 3 หลัก,
-- รันต่อไปเรื่อย ๆ ได้, เกินหลักร้อย (PR1000, PR12345) ก็รันได้ปกติ ห้ามเออเร่อ.
--
-- `lpad(n, 3, '0')` pads to a MINIMUM of 3 chars and NEVER truncates — so:
--   n=1     → '001'   → PR001
--   n=42    → '042'   → PR042
--   n=999   → '999'   → PR999
--   n=1000  → '1000'  → PR1000   (already ≥3 chars, lpad leaves it alone)
--   n=12345 → '12345' → PR12345
-- The running counter (member_code_seq) is unbounded — no overflow, no error.
--
-- Idempotent: re-running `create or replace` + the backfill is safe.

-- 1) Generator function — lpad 5 → 3 -----------------------------------------
create or replace function public.generate_member_code() returns trigger as $$
begin
  if new.member_code is null then
    new.member_code := 'PR' || lpad(nextval('public.member_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

-- 2) Backfill existing rows to the new padding --------------------------------
-- The running NUMBER is preserved; only the zero-padding changes.
--   PR00001 → PR001 · PR00042 → PR042 · PR01000 → PR1000
-- `substring(member_code from 3)` drops the 'PR' prefix; `::int` strips the
-- leading zeros (so '00001' → 1); re-`lpad`-ed to the new 3-min pattern.
-- The `~ '^PR\d+$'` guard skips any non-standard codes. member_code is
-- `unique` but the underlying numbers stay unique, so no collision.
-- (member_code is not referenced as a foreign key anywhere — verified — so
--  rewriting it does not orphan any row.)
update public.profiles
set member_code = 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0')
where member_code ~ '^PR\d+$';

-- 3) member_code_seq is untouched — `nextval` continues from its current
--    value, so the next signup picks up right after the existing rows.
