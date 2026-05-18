# PCS Cargo → Pacred — Data Migration Runbook

> **Status (2026-05-18):** pipeline built · **dry-run validated** · NOT yet
> loaded to production. The production load is gated on เดฟ's review + go.
>
> Decision basis: **D1** (เดฟ, 2026-05-18) — Pacred *becomes* the legacy PCS
> Cargo system, faithfully rebranded `PCS` → `PR`.

## 1. What this is

The owner rejected the rebuilt Pacred app for not matching the legacy PCS
Cargo system. The decision (**D1**): port the entire legacy system — schema,
data, and workflow — into Pacred, changing only `PCS` → `PR`.

This runbook covers the **data migration**: the legacy MySQL database
`pcsc_main` (117 tables · ~8,898 customers · the real 2026-05-18 export) →
Pacred's PostgreSQL (Supabase). Reworking the app UI/workflow to match the
legacy system ("workstream B") is tracked separately.

## 2. Scope (confirmed with เดฟ)

- **Bring everything** — all 117 tables, every row. No customer filtering.
  (The Pacred-vs-PCS-Cargo customer split in the `แบ่งสั่งซื้อ+นำเข้า` Excel
  is a family business matter — NOT a migration concern.)
- **`PCS<n>` → `PR<n>`** — keep the exact running number, swap the prefix
  only. Applied to member-code columns (`userID`, `userIDMain`) only — never
  to `coID` / `userRegisterWith` / `adminID*` / filenames / free text.
- **Custom auth** — migrated customers sign in with their *existing* password
  (no reset) via a "เชื่อมต่อบัญชี PCS CARGO" login.
- **WordPress `pcsc_cargo`** — the old marketing site; NOT migrated (the
  Pacred Next.js site replaces it).

## 3. Approach

`pcsc_main.sql` (MySQL dump) → local MySQL → Python converter → PostgreSQL
COPY files → dry-run load + reconcile → (review) → production. Reading from a
live local MySQL — rather than text-munging the 898 MB dump — gives clean
values and free row-count reconciliation.

## 4. Status — done + dry-run validated

- ✅ **Schema** — 117 tables ported MySQL→PostgreSQL (faithful: legacy
  names / types / even typos kept; `tb_` prefix → no collision with Pacred's
  own tables).
- ✅ **Converter** — 3,780,238 rows → COPY format; 2,288,128 `PCS→PR`
  transforms; zero-dates → NULL; NUL bytes stripped; encoding handled.
- ✅ **Dry-run** — into a throwaway PostgreSQL 17.10: all 117 tables load
  clean and every table's row count reconciles MySQL ↔ PostgreSQL exactly
  (0 load failures · 0 mismatches).
- ✅ **Auth bridge** — `lib/auth/pcs-legacy-password.ts` (`passTam` /
  `verifyLegacyPassword`) — verified against 7 real hashes + 5 vectors.
- ✅ **New-customer numbering** — `member-code-gapfill.sql`: fills the lowest
  vacant `PR<n>` first, then increments past max (เดฟ rule).

**Issues the dry-run caught + fixed:** (1) legacy `datetime NOT NULL` columns
hold `0000-00-00` → temporal columns made nullable. (2) NUL bytes (`\x00`) in
some `keysearch` values → stripped (PostgreSQL text cannot store NUL).

## 5. Artifacts

On เดฟ's machine, `C:\Users\Admin\Desktop\pcs-migration-work\` — **outside the
git repo** (the converted data is customer PII and must NOT be committed):

| File | What |
|---|---|
| `pcs-legacy-schema.draft.sql` | 117-table PostgreSQL schema (DDL, no PII) |
| `convert.py` | MySQL → PostgreSQL COPY converter |
| `dryrun.py` | dry-run loader + reconciler |
| `fix_schema.py` | temporal-column nullability patch |
| `member-code-gapfill.sql` | new-customer member-code generator |
| `data/` | 117 COPY files — **customer PII, never commit** |

In the repo (no PII): `lib/auth/pcs-legacy-password.ts` + its test.

## 6. Production-load runbook (run when เดฟ gives the go)

1. **Fresh dump** — get a final `pcsc_main` export from แต้ม at cutover (the
   2026-05-18 dump will be stale by then). Load into local MySQL.
2. **Convert** — `python convert.py` → regenerates `data/`.
3. **Schema** — apply `pcs-legacy-schema.draft.sql` to prod Supabase as a new
   migration **`0081_pcs_legacy_schema.sql`** (ภูม renumbered his booking /
   credit-note / chat batch up to `0084`-`0086` — commit `a248696` — to free
   `0081`-`0083` for exactly this; `0082`/`0083` stay open for legacy
   follow-up migrations if the port needs them — see §9). The 117 `tb_*`
   tables coexist with Pacred's existing tables; nothing is dropped.
4. **Data** — load each `data/NNN_*.copy.sql` into prod via `psql`.
5. **Member-code generator** — apply `member-code-gapfill.sql`.
6. **Reconcile** — prod-PostgreSQL row counts ↔ source MySQL must match all
   117 tables before declaring the load done.
7. **Files** — migrate the customer upload folders into Supabase Storage
   (§7 — pending แต้ม).

## 7. Open / pending — needs เดฟ or แต้ม

- 🔴 **Customer upload files** — `images/users`, `images/shops`,
  `storage/file`, `storage/slip` live on the legacy production server (held
  by แต้ม). Needed for §6.7; requested via the แต้ม hand-over list.
- 🟡 **8 special userIDs** — `PCSTT` / `PCSCARGO` / `PCSARNON` / `PCSFAM`
  (PCS + letters) and `PW` / `JET` / `FCL` / `AIGA` (no PCS prefix).
  Currently carried as-is. Decision for เดฟ: rewrite the `PCS<letters>` ones
  to `PR<letters>`?
- 🟡 **New-customer numbering** — the lowest vacant numbers are `PR1`–`PR5`,
  so the next new signups get `PR1`, `PR2`, … (per the fill-vacant rule).
  Confirm that is intended.

## 8. Supersedes

The pre-D1 PCS-customer-migration approach — migration
`0067_pcs_customer_migration.sql`, the `u2-1-pcs-customer-migration.md`
runbook, and `actions/admin/pcs-migration.ts` — migrated *customers only*
into the rebuilt `profiles` table via Supabase Auth, with a password reset.
**D1 replaces that** with this full-system port (all 117 tables · custom auth
· no reset). เดฟ to decide the fate of the superseded files.

## 9. The bigger picture — all prod-Supabase DB work, sequenced

This legacy port is one of **three** prod-DB workstreams. Run them in order:

**DB-0 — Verify what prod already has (do FIRST — it gates the rest).**
The launch (2026-05-17) shipped on migrations up to ~`0057`; everything
`0058`+ has accumulated on `dave` unapplied. Confirm the exact applied set
before planning any deploy — in the prod SQL Editor:
`select name from supabase_migrations.schema_migrations order by name;`
Owner: เดฟ. Nothing below sequences correctly without this.

**DB-1 — Apply the backlog (`0058`-`0080` + `0084`-`0086`) to prod (no
external blocker).** 25 idempotent, additive migrations on `dave` (`0065` is
an intentional gap; `0081`-`0083` are deliberately left free for DB-2).
They include the launch-integrity money/security guards `0060`-`0064` — the
S-1 RLS keystone (`0062`), the wallet-overdraw floor (`0064`), the
money-idempotency guards (`0061`/`0063`). If DB-0 shows those are not on
prod, **applying them is P0 regardless of D1** — prod carries open money
holes until they land. Apply in ascending number order (dependencies resolve
that way; all idempotent — safe to re-run). `0067_pcs_customer_migration` is
superseded by this runbook (§8) — harmless to apply, but the feature it backs
is dead. Owner: ภูม. Completing DB-1 is what unblocks any `dave→main` deploy.

**DB-2 — This legacy port** (§1-§8) — the 117-table `tb_*` schema as migration
**`0081`** + the data load. Gated on แต้ม's final dump, เดฟ's go, and ก๊อต's
production-load gate. The `tb_*` namespace does NOT collide with the rebuilt
schema, so DB-1 and DB-2 are independent — the legacy port does not wait on
the backlog, and vice versa.

**Numbering.** Migration files `0001`-`0086` exist; `0065` is an intentional
gap and `0081`-`0083` are reserved for this legacy port (DB-2 — schema +
follow-ups). ภูม renumbered his booking/credit-note/chat batch to `0084`-`0086`
(commit `a248696`) to free that block. The next free number for new Phase-B
work is **`0087`**.
