# 🚨 OTP / signup emergency — 2026-05-23

Production signup broken; customers reported 3 failure modes. Full timeline,
root causes, fixes, and recovery scripts archived here so the next person who
hits a similar bug has a one-stop runbook.

## Symptoms (real-customer reports)

1. **"ติดความปลอดภัย"** — hCaptcha verify rejecting on the register form.
2. **"INVALID API"** — surfaced from the SMS gateway path.
3. **"OTP ไม่ส่ง"** — silent failure on resend.
4. After clicking "ขอ OTP" twice: **"Phone number already registered by another user"** (the screenshot Win Wat reported).

8,930 auth.users on prod, 8,921 profiles → 9 orphan customers half-registered (auth.user existed, no profiles row).

## Root causes (in dependency order)

| # | Cause | Where |
|---|---|---|
| 1 | `HCAPTCHA_SECRET_KEY` on Vercel prod = placeholder/wrong → `hcaptcha siteverify` returns `invalid-input-secret` | env |
| 2 | `THAIBULKSMS_API_KEY/SECRET` = `YOUR_API_KEY` (DV-3 still pending) → SMS gateway rejects → "INVALID API" | env |
| 3 | `actions/auth.ts:186` returned opaque `"profile_failed"` and DID NOT delete the orphan auth.user → 2nd retry blocked on duplicate phone | code |
| 4 | `generate_member_code` trigger on prod carried a broken **retry loop** that probed hardcoded candidates PR100..PR109 — every profile insert failed `P0001: could not find a free PR-code after 10 retries (last candidate PR109)` | DB trigger |
| 5 | Dev→prod project switch (2026-05-20, `pprrlabgebrnocthwdmg` → `yzljakczhwrpbxflnmco`) data was copied but the trigger function + sequence state did NOT match the canonical `schema.sql` / migration 0060 — the broken retry trigger was apparently a manual paste during the switch | infra |

The chain meant: even with OTP+captcha bypassed, every profile insert blew up at step 4 → orphan auth.user accumulated → blocked the same phone forever.

## Fixes applied (in this order)

| Commit / action | Layer | Effect |
|---|---|---|
| `2175437` (ก๊อต) | code | `EMERGENCY_OTP_BYPASS = true` hardcoded — short-circuits SMS path |
| `3c79d7a` (เดฟ) | code | `EMERGENCY_HCAPTCHA_BYPASS = true` hardcoded — short-circuits captcha verify |
| `94e0274` (เดฟ) | code | Surfaces the real `PostgrestError` to Vercel logs + auto-deletes the orphan auth.user when profile insert fails |
| SQL on Supabase (เดฟ ran) | DB | Replaced `generate_member_code` with a lowest-vacant scanner (mirrors migration 0083 `next_pr_member_code` on tb_users, applied to public.profiles) |
| `scripts/recover-orphan-profiles-v2.mts` | one-off | Inserted profiles for the 9 orphans with explicit `member_code` (bypassed the broken trigger) |
| `scripts/remap-recovered-to-low-vacant.mts` | one-off | Remapped PR20000-PR20008 → PR1-PR9 (lowest vacant in legacy gaps) |
| `scripts/test-signup-trigger.mts` | smoke test | End-to-end verify — created throwaway auth.user → profile insert → trigger assigned **PR201** (lowest-vacant in 1..10903) → cleanup. ✅ |

## Recovered customer roll (PR1-PR9)

| Code | Customer | Phone |
|---|---|---|
| PR1, PR2 | (no metadata — likely test) | — |
| PR3 | พัชรี ด่วนดี | 66802495932 |
| PR4 | อำนาจ กิจบุตร | 66843298409 |
| PR5 | สุรเสกข์ โกวิทวีรธรรม | 66993545459 |
| PR6 | Tadsakorn Nutteesri | — |
| PR7 | Pond007 podeng | 66958612835 |
| PR8 | Amintra Kraikittiwut | 66926616199 |
| PR9 | Win Wat | 66626030456 |

## Second wave (2026-05-23 evening — same incident, second cause)

After (1)-(5) above shipped, the customer "ช้อ ครั้ง / 0800588746" reported the SAME `บันทึกโปรไฟล์ไม่สำเร็จ` error. The smoke test (`scripts/test-signup-trigger.mts`) had earlier succeeded with PR201, so we suspected a live-payload shape difference.

**Diagnosis chain:**
1. `scripts/test-signup-trigger-live-shape.mts` — reproduced with full payload (phone, how_know, Thai name) → confirmed: `Key (member_code)=(PR201) already exists`.
2. `scripts/check-pr201.mts` — confirmed PR201 occupied by สุรเสกข์ (one of the remapped recoveries).
3. `scripts/probe-trigger-algorithm.mts` — 5 inserts in a row all picked PR201. Not a race; the algorithm consistently picks an occupied slot.
4. `scripts/check-tb-users.mts` — ruled out `tb_users` as the source. The trigger reads `profiles`.
5. Read of `supabase/migrations/0060_member_code_3digit.sql` — the active trigger is `nextval('member_code_seq') + lpad(…, 3, '0')`. **The lowest-vacant scanner I gave the user earlier never took** — the dollar-quote `$$` collided with the regex `$` end-anchor in markdown, producing broken SQL the user pasted.

**Root cause:** `member_code_seq` was setval'd to ~200 during recovery → `nextval` returns 201 every transaction (failed inserts don't advance) → PR201 is taken → unique violation every signup.

**Fix:** `supabase/migrations/0090_lowest_vacant_member_code.sql` — new generator function (advisory-locked, regex-anchored both ends as `^PR[0-9]+$`, bare integer no lpad). Uses `$fn$` dollar-quote tag so the regex `$` doesn't terminate the block.

**Apply path (Studio):**
```sql
create or replace function public.generate_member_code() returns trigger
language plpgsql
as $fn$
declare
  v_max_n integer;
  v_n     integer;
begin
  if new.member_code is null then
    perform pg_advisory_xact_lock(hashtext('public.profiles.member_code'));

    select coalesce(max((substring(member_code from 3))::int), 0)
      into v_max_n
      from public.profiles
     where member_code ~ '^PR[0-9]+$';

    select min(g)
      into v_n
      from generate_series(1, v_max_n + 1) as g
     where ('PR' || g) not in (
       select member_code
         from public.profiles
        where member_code ~ '^PR[0-9]+$'
     );

    new.member_code := 'PR' || v_n;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_generate_member_code on public.profiles;
create trigger trg_generate_member_code
  before insert on public.profiles
  for each row execute function public.generate_member_code();
```

**Verify:** `pnpm exec tsx --env-file=.env.recovery-prod scripts/verify-fix-and-probe.mts` → expect 5 ascending low PR codes (PR10, PR11, …) and no errors.

## Outstanding (post-emergency — do NEXT)

- [ ] **Apply migration 0090 to prod** — paste the SQL block above in Supabase Studio, then run `verify-fix-and-probe.mts`.
- [ ] **Provision DV-1c** — hCaptcha account, set `HCAPTCHA_SECRET_KEY` + `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` on Vercel (real values).
- [ ] **Provision DV-3** — ThaiBulkSMS account, set `THAIBULKSMS_API_KEY/SECRET` on Vercel + buy credit.
- [ ] **Revert `EMERGENCY_OTP_BYPASS`** → `false` in `actions/otp.ts` after DV-3 confirmed working.
- [ ] **Revert `EMERGENCY_HCAPTCHA_BYPASS`** → `false` in `lib/hcaptcha.ts` after DV-1c confirmed working.
- [x] ~~**Codify the trigger fix as a migration**~~ → done: `supabase/migrations/0090_lowest_vacant_member_code.sql`.
- [ ] **Rotate exposed secrets** — Supabase service-role keys (dev + prod), LINE channel secret + access token, LINE Login client secret, Supabase S3 keys — they landed in chat during the emergency.

## Reproducing the trigger fix (if needed again)

```sql
CREATE OR REPLACE FUNCTION public.generate_member_code() RETURNS trigger AS $$
DECLARE
  n integer;
  max_n integer;
BEGIN
  IF NEW.member_code IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('pcs_legacy.pr_member_code_profiles'));

    SELECT COALESCE(MAX((substring(member_code from 3))::int), 0) INTO max_n
    FROM public.profiles
    WHERE member_code ~ '^PR\d+$';

    SELECT MIN(g) INTO n
    FROM generate_series(1, max_n + 1) g
    WHERE ('PR' || g) NOT IN (
      SELECT member_code FROM public.profiles WHERE member_code ~ '^PR\d+$'
    );

    NEW.member_code := 'PR' || n;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

## Cross-links

- [`scripts/recover-orphan-profiles.mts`](../../scripts/recover-orphan-profiles.mts) · [`recover-orphan-profiles-v2.mts`](../../scripts/recover-orphan-profiles-v2.mts) · [`remap-recovered-to-low-vacant.mts`](../../scripts/remap-recovered-to-low-vacant.mts) · [`test-signup-trigger.mts`](../../scripts/test-signup-trigger.mts)
- [`supabase/migrations/0083_pcs_legacy_member_seq.sql`](../../supabase/migrations/0083_pcs_legacy_member_seq.sql) — the canonical `next_pr_member_code()` (on tb_users) that this trigger now mirrors for profiles
- [`docs/runbook/team-status-2026-05-16.md`](team-status-2026-05-16.md) — previous emergency log
