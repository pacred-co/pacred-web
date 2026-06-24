# Migrated PCS customer auth/identity — the 4 traps (2026-06-24, the PR050 fire)

> Owner: *"ลูกค้าเก่าเข้าไม่ได้ … แก้ให้จบอย่าให้เกิดเรื่องนี้อีก เรื่องรหัสเนี่ย … อย่าให้ลูกค้าเจออีก ทั้งใหม่ และ เก่า pcs"*. PR050 reset a password but couldn't log in; fixing that surfaced a chain of identity bugs that hit **all ~8,890 migrated PCS customers**. This is the durable record so it never recurs.

## How a migrated customer logs in (the model you must hold)

A migrated PCS customer's `auth.users` row was bulk-provisioned with a **synthetic email** `pcs-legacy-<member_code>@users.pacred.invalid` and **NO phone** (the real phone lives only on `profiles.phone`). The authoritative identity link is **`profiles.member_code` → `profiles.id` = `auth.users.id`** (Phase-A 1:1).

`actions/auth.ts:signIn` → native `signInWithPassword` first; on miss → `lib/auth/pcs-legacy-bridge.ts:bridgeLegacyLogin`, which verifies the typed password against **`tb_users."userPass"`** (the legacy `passTam` hash) and signs the customer in. Login **by phone** ALWAYS lands on the bridge (auth row has no phone → native phone signIn misses).

## The 4 traps (each was live in prod)

1. **Password reset only updated Supabase Auth, never `tb_users."userPass"`.** So a customer who logs in by phone (→ bridge → checks `userPass`) could never use a reset password — the reset was inert on that path. Every reset path was affected (`adminResetCustomerPassword`, `confirmPasswordResetByPhone`, `updatePasswordAfterRecovery`, `changePassword`). **Fix:** `lib/auth/sync-legacy-userpass.ts::syncLegacyUserPass(userid, plaintext)` writes `passTam(plaintext)` → `tb_users."userPass"`, wired into ALL reset paths. Faithful to legacy `pcs-admin/users.php` (which always wrote `userPass`).

2. **The bridge re-derived the synthetic email and `createUser`'d → DUPLICATE auth users.** Migration `0103` padded member_codes to ≥3 digits (PR50→PR050) but `auth.users.email` kept the OLD form (`pcs-legacy-pr50`); ~34 customers' emails were even scrambled (PR045→`pcs-legacy-pr121`). `legacySyntheticEmail(member_code)` therefore no longer matched the real auth email → `createUser` made a NEW auth user with an EMPTY profile → the customer was bounced to `/complete-profile` and shown the synthetic email. **Fix:** the bridge now resolves the EXISTING auth user via `profiles.member_code` and signs in with its REAL email; it only `createUser`s when no profile exists, and never creates a second user.

3. **Migration left 6,931 migrated profiles at `status='incomplete'`** though `tb_users` had their full name/phone/address → `requireAuth` bounced them to `/complete-profile` on every login ("ก็มีหมดแล้ว ยังต้องตั้งใหม่ทำไม"). **Fix:** bulk-backfilled incomplete→active on prod (where a name exists) + `ensureLegacyProfile` now heals incomplete→active on login.

4. **Synthetic email leaked to the customer** (navbar fell back to `user.email` when `profile` was null — the dup case) + **2 customers had no profile at all** (PR005, PR080) = locked out. **Fix:** navbar never renders an `@users.pacred.invalid` address; created the 2 missing profiles.

## Durable RULES (do not regress)

- **Any password reset/change MUST call `syncLegacyUserPass`** so `tb_users."userPass"` stays in sync. Auth-only updates are inert for phone-login migrated customers.
- **Never re-derive a migrated customer's auth email to find/create their user.** Resolve via `profiles.member_code` (authoritative). Re-deriving + `createUser` is what made the dups.
- **A migrated customer's `auth.users.email` MUST equal `legacySyntheticEmail(member_code)`.** A mismatch is a latent dup landmine (and breaks the member-code native fast-path).
- **Migrated customers are `status='active'`** — they already have their data; never force `/complete-profile`.
- **Never show `@users.pacred.invalid` to a customer.** It's an internal auth placeholder, not their address.
- The column is the quoted mixed-case **`tb_users."userPass"`** / **`"userID"`**; in raw SQL the profiles PK is lowercase **`profiles.id`** (PostgREST maps `.select("ID")` to it — don't copy that casing into raw SQL).

## Invariant audit (run these — all must be 0)

```sql
-- locked out: active legacy customer with no profile
select count(*) from tb_users u where u."userStatus"='1'
  and not exists (select 1 from profiles p where p.member_code=u."userID");
-- synthetic orphan: auth user with no profile
select count(*) from auth.users a where a.email like 'pcs-legacy-%@users.pacred.invalid'
  and not exists (select 1 from profiles p where p.id=a.id);
-- email mismatch: migrated auth email != derived form  (dup landmine)
select count(*) from profiles p join auth.users a on a.id=p.id where p.migrated_from_pcs=true
  and a.email like 'pcs-legacy-%@users.pacred.invalid'
  and a.email <> ('pcs-legacy-'||lower(p.member_code)||'@users.pacred.invalid');
-- forced re-profile: migrated customer still incomplete
select count(*) from profiles where migrated_from_pcs=true and status='incomplete';
```

As of 2026-06-24 all four = **0** on prod. Backups: `/tmp/pr050-userpass-backup.txt`, `/tmp/incomplete-migrated-backup-2026-06-24.json`, `/tmp/realign34-backup-2026-06-24.json`.

Related: [[pacred-domain-knowledge]] · [[php-port-patterns]] (port-added-guard surfacing a latent data flaw).
