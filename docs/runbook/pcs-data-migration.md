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
3. **Schema (`0081`)** — apply `0081_pcs_legacy_schema.sql` (the 117 `tb_*`
   tables + PKs) to prod Supabase **before** the data load — the bulk COPY
   runs much faster index-free. The `tb_*` tables coexist with Pacred's
   existing tables; nothing is dropped. (Per Q1 the legacy schema is split
   into 3 — `0081` schema · `0082` indexes · `0083` member-seq — see §9.)
4. **Data** — load each `data/NNN_*.copy.sql` into prod via `psql`.
5. **Indexes (`0082`)** — apply `0082_pcs_legacy_indexes.sql` (indexes + FKs +
   triggers) *after* the data is in — one-shot index build + FK validation on
   the loaded rows.
6. **Member-code generator (`0083`)** — apply `0083_pcs_legacy_member_seq.sql`
   — the member-code generator + the lowest-vacant `next_pr_member_code()`
   gapfill.
7. **Reconcile** — prod-PostgreSQL row counts ↔ source MySQL must match all
   117 tables before declaring the load done.
8. **Files** — migrate the customer upload folders into Supabase Storage
   (§7 — pending แต้ม).

## 7. Open / pending — needs เดฟ or แต้ม

> **แต้ม hand-over (reduced 2026-05-18).** ก๊อต confirmed the **JMF API spec
> is no longer needed from แต้ม** — ก๊อต reverse-engineers / builds the JMF
> API himself. The remaining แต้ม dependency is **two items**: (1) the
> customer image/file storage below, and (2) the final `pcsc_main` cutover
> dump (§6.1).

- 🔴 **Customer upload files** — `images/users`, `images/shops`,
  `storage/file`, `storage/slip` live on the legacy production server (held
  by แต้ม). ก๊อต fetches these from แต้ม → dumped into Pacred so migrated
  customers keep continuity (their order history + their documents). Needed
  for §6.8.
- ✅ **8 special userIDs** — `PCSTT` / `PCSCARGO` / `PCSARNON` / `PCSFAM`
  (PCS + letters) and `PW` / `JET` / `FCL` / `AIGA` (no PCS prefix).
  **DECIDED (เดฟ 2026-05-18 · Q3):** rewrite the `PCS<letters>` group to
  `PR<letters>`; keep the no-prefix group verbatim.
- ✅ **New-customer numbering** — **DECIDED (เดฟ 2026-05-18 · Q4):**
  lowest-vacant — a new signup fills the smallest unused `PR<n>` from `PR1`
  up (`next_pr_member_code()`); the first post-migration signups land at
  `PR1`-`PR5`.

## 8. Supersedes

The pre-D1 PCS-customer-migration approach — migration
`0067_pcs_customer_migration.sql`, the `u2-1-pcs-customer-migration.md`
runbook, and `actions/admin/pcs-migration.ts` — migrated *customers only*
into the rebuilt `profiles` table via Supabase Auth, with a password reset.
**D1 replaces that** with this full-system port (all 117 tables · custom auth
· no reset). เดฟ to decide the fate of the superseded files.

## 9. The bigger picture — all prod-Supabase DB work, sequenced

This legacy port is one of **three** prod-DB workstreams. Run them in order:

**DB-0 — Verify what prod already has. ✅ RESOLVED 2026-05-18.**
A direct prod-Supabase REST probe (project `yzljakczhwrpbxflnmco`) on
2026-05-18 confirmed migrations `0058`-`0080` are **ALL applied to prod** —
the marker tables `refund_requests` (0058), `cargo_sacks` (0068),
`container_costs` (0069), `platform_incidents` (0077), `work_items` (0080)
all exist on prod. **prod is verified at `0080`.** Owner was: เดฟ.

**DB-1 — Apply the backlog (`0058`-`0080`) to prod. ✅ DONE
(verified 2026-05-18).** All 22 idempotent, additive migrations (`0065` is an
intentional gap) are on prod — confirmed by the DB-0 probe above. This
includes the launch-integrity money/security guards `0060`-`0064` — the S-1
RLS keystone (`0062`), the wallet-overdraw floor (`0064`), the
money-idempotency guards (`0061`/`0063`) — so **prod carries NO open money
hole; there is no P0 here.** `0081`-`0083` are left free for DB-2;
`0084`-`0086` (ภูม's Phase-C batch) remain **frozen** — NOT on prod, not
applied until Phase B ships, per Q5 in
[poom-d1-open-questions.md](../research/poom-d1-open-questions.md).
`0067_pcs_customer_migration` is on prod but superseded by this runbook
(§8) — the feature it backs is dead. Owner was: ภูม. DB-1 being done
unblocks any `dave→main` deploy.

**DB-2 — This legacy port** (§1-§8) — the 117-table `tb_*` schema as migrations
**`0081`-`0083`** (schema · indexes · member-seq — Q1) + the data load. Gated
on แต้ม's final dump, เดฟ's go, and ก๊อต's
production-load gate. The `tb_*` namespace does NOT collide with the rebuilt
schema, so DB-1 and DB-2 are independent — the legacy port does not wait on
the backlog, and vice versa.

**Numbering.** Migration files `0001`-`0086` exist; `0065` is an intentional
gap and `0081`-`0083` are reserved for this legacy port (DB-2 — schema +
follow-ups). ภูม renumbered his booking/credit-note/chat batch to `0084`-`0086`
(commit `a248696`) to free that block. The next free number for new Phase-B
work is **`0087`**.
