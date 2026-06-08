# Duplicate identity across `profiles` and `tb_users` (cross-system phone dups)

**Date:** 2026-06-08 · **Author:** เดฟ · **Trigger:** owner found PR112 and PR10584 are the same person (Tadsakorn Nutteesri) with two member codes.

## The bug class

Pacred runs **two customer/identity systems side by side** during the D1 port:

| System | Table | Key | Who lives here |
|---|---|---|---|
| Rebuilt / auth | `profiles` | `member_code` (PR###) | admins + native-signup customers (Supabase auth) |
| Legacy PCS | `tb_users` | `userID` (PR####) | the ~8,900 migrated customers |

The join contract is **`profiles.member_code === tb_users.userID`** — one person, one code, present in whichever system(s) apply. When a person ends up with **a different code in each system**, they are duplicated: two identities, money/orders potentially split, staff confused.

## Root cause

The **customer**-creation paths already dedupe by phone before minting an identity:
- `registerPersonal` (`actions/auth.ts`) → `findLegacyUserIdByPhone` → blocks with `phone_exists:<id>`.
- `adminCreateCustomer` (`actions/admin/customer-admin.ts`) → same guard → `เบอร์นี้มีลูกค้าอยู่แล้ว: <id>`.

But the **admin**-creation path (`adminCreateNew`, `actions/admin/admins.ts`, backing `/admin/admins/new`) and the provisioning scripts did **NOT** check the phone against `tb_users`. So provisioning an admin for a person who was *already a (often migrated/cold) legacy customer* minted a SECOND `profiles` member_code — disconnected from their `tb_users` row.

PR112 = Tadsakorn's admin account (`profiles` + `admins` super, created 2026-05-11). PR10584 = the same phone's legacy customer row in `tb_users` (migrated 2026-03-17, `userActive=''` cold lead, `userNote='พี่เดฟ'`). Same person, two codes.

## Why it wasn't caught

- The two tables are queried by different keys in different surfaces — no single screen shows "this phone has 2 codes".
- A migrated cold lead (`tb_users`, never activated) is invisible in the auth/admin views, so the operator creating the admin never saw the existing customer.
- Phone formats differ (`profiles.phone` = `+66…` E.164; `tb_users.userTel` = `0…`), so a naive equality check misses them — you must normalize.

## The fix (root cause + พัฒนา)

1. **Guard `adminCreateNew`** (the missing dedupe): before provisioning, if `phone` matches a non-retired `tb_users` customer → refuse with `phone_exists_customer:<code>`. The create form (`new-form.tsx`) surfaces the existing code + a **confirm checkbox** (`allow_existing_phone`) so the operator can deliberately promote an existing customer to staff (the legitimate case) — non-blocking, but no longer *silent*.
2. **Detection tool** — `scripts/find-cross-system-phone-dups.mjs` (read-only, paginated) lists every `profiles ↔ tb_users` phone dup with a different code. First full run (2026-06-08): **37** flagged — a review backlog. NOT auto-merged: some are swap-pairs (codes crossed during an earlier PR-swap), some are test accounts. Each needs human judgment.
3. **Merge template** — `scripts/merge-dup-pr10584-into-pr112-2026-06-08.mjs` (dry-run + backup first, per AGENTS §11): retires the **empty** dup via `tb_users.userStatus='0'` (the same reversible soft-delete the customer-disable action uses), keeping the chosen code. For a dup *with data*, the script aborts — a manual move to the kept code is required first (mirror the `swap-userid-*` precedent which introspects `information_schema` for every userid column).

## Rules going forward

- **Any new identity-minting path must dedupe phone across BOTH `profiles` AND `tb_users`** — reuse `findLegacyUserIdByPhone(admin, normalizePhone(phone))`. Never check only your own table.
- **Normalize before comparing phones** — `+66…` vs `0…` are the same number; compare last 9 digits (or use `e164ToLegacyThaiPhone` / `normalizePhone`).
- **Retiring an identity = soft-delete (`userStatus='0'`), backup first, dry-run first.** Hard-delete only an exhaustively-confirmed-empty row.
- **Surface, don't silently block** — when an admin truly is an existing customer, let the operator confirm; don't make the legitimate promotion impossible.

## Files

- `actions/admin/admins.ts` — `adminCreateNew` cross-system guard (step 0).
- `lib/validators/admin-form.ts` — `allow_existing_phone` override flag.
- `app/[locale]/(admin)/admin/admins/new/new-form.tsx` — `phone_exists_customer:` handling + confirm checkbox.
- `scripts/find-cross-system-phone-dups.mjs` — detection tool.
- `scripts/merge-dup-pr10584-into-pr112-2026-06-08.mjs` — the PR112/PR10584 merge (applied).
