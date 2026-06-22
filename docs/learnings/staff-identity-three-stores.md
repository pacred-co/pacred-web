# Learning — staff identity lives in THREE disconnected stores; the new create-flow only wrote two

**Date:** 2026-06-22 · **Author:** เดฟ · **Trigger:** owner — *"sales pupu หายไปไหน … เพิ่ม role sales → ให้เพิ่มการ์ดหน้าบ้าน + เพิ่มในระบบหลังบ้านด้วยเลย … ไม่ใช่เพิ่มแต่ account กลวงๆ"*

## The bug
The owner added a sales staff (pupu) but she appeared **nowhere** — not in the customer-360 sale-rep dropdown, not on the public sales cards. He read this as "data ไม่เชื่อมโยงกันจริง" (and he was right).

## Root cause — a Pacred staff identity is spread across 3 tables
1. **`profiles`** — the person (`member_code` PR####, `admin_login_id` e.g. `admin_pupu`, name, email).
2. **`admins`** — the RBAC grant (`role`, `is_active`). Keyed by `profile_id`.
3. **`tb_admin`** (LEGACY) — the staff record carrying the operational flags `adminStatusSale` (sales rep), `adminStatusCS` (CS rep), `adminStatusA` (active). Keyed by `adminID` = the login id.

`adminCreateNew` (the new /admin/admins/new flow) writes **only #1 + #2** (+ optional HR sidecar `admin_contact_extras`). It deliberately stopped writing `tb_admin` (the comment at the top of that block even says so). **But every sales surface still reads `tb_admin`:**
- `getActiveSalesReps` / `getPublicSalesRoster` (public cards · carousel)
- `listSalesAdmins` (customer-360 sale-rep dropdown)
- `assign-sales-rep` (round-robin pool)
- `listStaffSalesFlags` / `adminSetSalesRepFlag` (the sales-team toggle page)

…all filter `tb_admin WHERE adminStatusA='1' AND adminStatusSale='1'`. A staff with no `tb_admin` row is a **hollow account** — invisible to all of them, and the toggle can't even list/flag them (`UPDATE … WHERE adminID=?` hits 0 rows). pupu (+ 4 others) were hollow.

**Surprise that hid it:** the 3 *working* reps (toey/pee/may) are all RBAC `role=super`, NOT `sales`. The roster has **nothing to do with the role** — it's purely the legacy `adminStatusSale` flag. So "เพิ่ม role sales" never drove anything; the flag did.

## The fix (connect, don't rearchitect)
New reusable helper **`lib/admin/ensureLegacyAdminRow(admin, {adminID, name…, isSales})`** — clones a known-good active `tb_admin` row's shape (robust against ~30 NOT-NULL legacy columns incl. ones in no TS type, e.g. `bearer_token`), overrides identity + clears every secret/personal/CS field, sets PK `"ID"`=MAX+1 (the bulk load left the sequence behind) and a collision-free UNIQUE `adminTel`. Wired into:
- `adminCreateNew` — every new staff gets a `tb_admin` row (no more hollow accounts); sales-eligible roles auto-flagged.
- `adminChangeRole` — changing a staffer INTO a sales role auto-mirrors + flags.
- `adminSetSalesRepFlag` — flagging a staffer with no `tb_admin` row now mirrors them from their profile instead of failing 0-rows.
- Data-fix backfilled the 5 existing hollow staff (pupu flagged sales; ben/keetar/tam/wave connected, not flagged) → **0 hollow remaining**.

## Gotchas hit while data-fixing `tb_admin` directly
- PK is **`"ID"`** (uppercase, mixed-case) — `id` does not exist.
- The `"ID"` sequence is behind the bulk-loaded max → auto-gen collides; set `MAX("ID")+1` explicitly.
- UNIQUE on `adminEmail`, `adminID`, **`adminTel`** → a blank tel can collide; pick a free placeholder.
- Many NOT-NULL-no-default columns + at least one (`bearer_token`) that `information_schema` listing missed → **cloning a template row is safer than enumerating columns**, but then you MUST override every secret/per-staff field so you don't share a token/national-id.

## Follow-up (2026-06-22): admin code separated from customer PR (mig 0199)
Owner then asked to give admins their OWN code, separate from the customer PR pool (reverses 0184). Done via:
- **mig 0199** — `generate_member_code()` gains a staff branch: `employee_code` non-empty → mint `AD###` from its own advisory-lock + lowest-vacant scan; customer PR path kept byte-identical.
- **re-code script** — 22 existing staff PR→AD001–AD022 (ordered by employee_code, so AD001 = พี่ป๊อป), cascading the few stored refs: `tb_forwarder_driver.fdadminid`/`fdadmincreator` (driver batch ownership) + the 2 vestigial `tb_users` stubs. Verified driver ownership stays consistent (member_code == fdadminid post-recode).

**Landmine handled:** 2 staff (admin_poom, admin_pop=พี่ป๊อป-the-owner) had `tb_users` rows — but **0 customer transactional data** (probed orders/forwarder/wallet/payment/credit all = 0), so they were vestigial stubs, safe to re-code. **If a staff had been a real dual customer+staff account with orders, re-coding their member_code would have orphaned that customer data** — always probe the full customer footprint of an identity before changing its code. The freed PR slots (PR009 etc.) return to the customer pool via lowest-vacant.

## Rule to carry forward
When a faithful-port flow "moves off" a legacy table, **grep who still READS that table before dropping the WRITE** (§0e dead-write trap, inverted). Here the readers were never migrated, so dropping the `tb_admin` write created hollow staff. A staff/identity record must be written to **every store its consumers read**, or wired so the readers union the stores.

Related: [[audit-discipline]] · [[verify-deep-flow]] · §0e in AGENTS.md.
