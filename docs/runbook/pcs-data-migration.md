# PCS Cargo → Pacred — Data Migration Runbook

> **Status (2026-05-27):** ✅ **Phase A COMPLETE.** Pipeline validated · all
> 117 tables loaded on dev + prod Supabase · Supabase **Pro upgrade done** (ก๊อต)
> · 3 log tables (`tb_web_hs`/`tb_history_key`/`tb_history`) backfilled post-Pro
> · **customer image + storage files uploaded to Supabase S3 production**
> (`pcsracgo/public/member`) by ภูม 2026-05-24 · auth bridge live. The runbook
> below is preserved as the historical record of the migration approach + the
> post-cutover refresh procedure (re-run §6 against a fresh `pcsc_main` dump
> if needed).
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

`pcsc_main.sql` (MySQL dump) → local MySQL → pgloader (MySQL→PostgreSQL) →
local PostgreSQL → PCS→PR rebrand → `pg_dump` → migrations `0081`-`0083` +
a data file → dry-run load + reconcile → (review) → production. Reading from
a live local MySQL — rather than text-munging the 898 MB dump — gives clean
values and free row-count reconciliation.

## 4. Status — pipeline validated · `0081`-`0083` committed

**2026-05-19 — re-run end-to-end on Mac (เดฟ + Claude), pgloader pipeline**,
against the `2026-05-18-1358` dump. The three migrations are authored +
committed to `dave`:

- ✅ **Schema → `0081`-`0083`** — `0081_pcs_legacy_schema.sql` (117 tables +
  PKs + RLS), `0082_pcs_legacy_indexes.sql` (18 unique indexes + sequence
  resync), `0083_pcs_legacy_member_seq.sql` (`next_pr_member_code()`).
  Faithful: legacy table names kept verbatim; `tb_`/`tas_` → no collision
  with Pacred's own tables.
- ✅ **Conversion** — pgloader MySQL→PostgreSQL: **3,780,238 rows, 0 load
  failures**; zero-dates → NULL; NUL bytes handled; UTF-8 (Thai) intact.
- ✅ **PCS→PR rebrand** — **2,297,341** `userid`/`useridmain` values
  rebranded `PCS<n>`→`PR<n>`. Case-normalised: MySQL's collation is
  case-insensitive, so mixed-case codes (`pcs1791`, `Pcscargo`) fold to one
  canonical uppercase form — else PostgreSQL (case-sensitive) breaks the
  joins. `PW`/`JET`/`FCL`/`AIGA` left verbatim. (The earlier Windows
  Python-converter run reported 2,288,128 on an earlier snapshot — the delta
  is normal customer activity between exports, §6.1.)
- ✅ **Dry-run** — `0081` → data → `0082` → `0083` applied to a fresh
  PostgreSQL 17.10: all 117 tables reconcile MySQL ↔ PostgreSQL exactly
  (3,780,238 rows · 0 mismatches); cross-table `userid` joins, sequence
  resync, `next_pr_member_code()`, Thai text, the 8,898 `userpass` hashes —
  all verified.
- ✅ **Auth bridge** — `lib/auth/pcs-legacy-password.ts` (`passTam` /
  `verifyLegacyPassword`) — the 79-char `d+b+c` hash matches every migrated
  `tb_users.userpass` row.
- ✅ **Loaded to dev + prod Supabase (2026-05-19 · Option B)** — `0081` →
  business data → `0082` → `0083` → `0087` applied to **both** the dev
  (`pprrlabgebrnocthwdmg`) and prod (`yzljakczhwrpbxflnmco`) projects.
  **114 of 117 tables reconcile MySQL ↔ Supabase exactly**; 8,898 `tb_users`
  rows with intact 79-char login hashes; prod DB 252 MB.
- ✅ **3 log tables BACKFILLED** — Supabase free tier capped a database at
  500 MB; the full legacy data is 1.02 GB. The 3 oversized history/log tables
  (`tb_web_hs` · `tb_history_key` · `tb_history`, 779 MB) were created empty
  on the initial load. **ก๊อต completed the Supabase Pro upgrade** and the
  3 log tables were backfilled post-Pro to full fidelity (per เดฟ —
  "production จริง ต้องอัพครบทั้งหมด"). **Prod now carries all 117 tables.**
- ✅ **Customer image + storage files** — ภูม uploaded the legacy
  `pcsracgo/public/member` image + storage files into **Supabase S3 production**
  on 2026-05-24 — no further legacy migration needed for storage parity.

**Judgement calls in this run** (flag if any need revisiting):
(1) **RLS enabled** on all 117 tables, no policies — Supabase exposes
`public` to `anon`, and these tables hold PII + `tb_users.userpass`; locked
to `service_role` is the secure default, Phase B adds policies.
(2) Identifiers **lowercased** (PostgreSQL-idiomatic).
(3) The rebrand **case-normalises** member codes (see above).

**Issues handled:** legacy `datetime NOT NULL` columns hold `0000-00-00` →
temporal columns made nullable; NUL bytes (`\x00`) in text → stripped
(PostgreSQL text cannot store NUL).

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

**2026-05-19 Mac re-run** — artifacts in `/tmp/pcs-migration/` (outside the
repo): `pcs.load` (pgloader config), `assemble.py` (builds the migration
files), `pcs-legacy-data.sql` (the ~785 MB rebranded data file — **customer
PII, never commit**; this is what loads into Supabase in §6.4). The schema
itself is now **in the repo** — `supabase/migrations/0081`-`0083` (no PII).

## 6. Production-load runbook

> **✅ COMPLETE.** The initial load (steps 3-7) ran 2026-05-19 against dev +
> prod with the 2026-05-18 dump — business data only (114 tables, the 3 log
> tables empty); the 3 log tables were backfilled post-Pro-upgrade by ก๊อต
> (see §4). Customer image + storage files uploaded to Supabase S3 production
> by ภูม 2026-05-24. The steps below are the **historical procedure** —
> re-run against a fresh cutover dump if a future refresh is needed.

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

## 7. Open / pending — ✅ all resolved (2026-05-24)

> **แต้ม hand-over — CLOSED.** ก๊อต confirmed the **JMF API spec is no longer
> needed from แต้ม** — ก๊อต reverse-engineers / builds the JMF API himself
> (Phase C). The customer image/file storage dependency was resolved when
> **ภูม uploaded the legacy `pcsracgo/public/member` files directly to
> Supabase S3 production** on 2026-05-24. No further แต้ม dependency for
> Phase A. (A fresh `pcsc_main` cutover dump remains optional — only needed
> if a future refresh is wanted; the current loaded data plus live writes is
> the active state.)

- ✅ **Customer upload files** — ภูม uploaded the legacy `pcsracgo/public/member`
  image + storage files into Supabase S3 production 2026-05-24. Migrated
  customers have their order history + their documents in place.
- ✅ **8 special userIDs** — `PCSTT` / `PCSCARGO` / `PCSARNON` / `PCSFAM`
  (PCS + letters) and `PW` / `JET` / `FCL` / `AIGA` (no PCS prefix).
  **DECIDED (เดฟ 2026-05-18 · Q3):** rewrite the `PCS<letters>` group to
  `PR<letters>`; keep the no-prefix group verbatim.
- ✅ **New-customer numbering** — **DECIDED (เดฟ 2026-05-18 · Q4):**
  lowest-vacant — a new signup fills the smallest unused `PR<n>` from `PR1`
  up (`next_pr_member_code()`); the first post-migration signups land at
  `PR1`-`PR5`. **Refined post-launch via migrations `0095`-`0103`** after
  live use revealed sequence drift + numeric-pad collisions (lowest-vacant +
  min-3-digit pad + legacy-anchor restore).

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

**DB-2 — This legacy port** (§1-§8). 🟢 **✅ COMPLETE.** Migrations
`0081`-`0083` + `0087` applied + the business data (114 tables · 8,898
customers) loaded to both Supabase projects 2026-05-19; **ก๊อต completed the
Supabase Pro upgrade** and the **3 oversized log tables (779 MB) were
backfilled post-Pro** — prod now carries **all 117 tables**. **ภูม uploaded
the customer image + storage files** to Supabase S3 production
(`pcsracgo/public/member`) 2026-05-24. The `tb_*` namespace does NOT collide
with the rebuilt schema, so DB-1 and DB-2 are independent — though an
internal table-naming cleanup between rebuilt-era and `tb_*` schemas remains
as a separate task (เดฟ + ภูม).

**Numbering.** Migration files `0001`-`0111` exist (`0065` is an intentional
gap). `0081`-`0083` = this legacy port (schema · indexes · member-seq);
`0084`-`0086` = ภูม's booking/credit-note/chat batch; `0087` = the
`v_pcs_migration_status` security-invoker fix; `0089`-`0090` + `0095`-`0103`
= member-code refinements (sequence drift / numeric-pad collisions);
`0101` = LINE Notify per-user (Gap #3); `0104`-`0106` = shop-wallet + LINE
Notify dispatch; `0108` = PCS legacy hot indexes (perf); `0109`-`0111` =
payment slip / reconciliation / invoice adjustments. The next free number
for new Phase-B work is **`0112`**.
