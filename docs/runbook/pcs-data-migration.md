# PCS Cargo → Pacred — Data Migration Runbook

> **Status (2026-05-19):** pipeline validated · **business data loaded to
> dev + prod Supabase** (Option B — 114 of 117 tables; the 3 oversized log
> tables wait for the Supabase Pro upgrade — see §4).
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
- ⏳ **3 log tables pending the Pro upgrade** — Supabase **free tier caps a
  database at 500 MB**; the full legacy data is **1.02 GB**. The 3 oversized
  history/log tables — `tb_web_hs` (657 MB) · `tb_history_key` (62 MB) ·
  `tb_history` (59 MB), 779 MB total — are created **empty**. The 230 MB of
  business data (114 tables — customers, orders, wallets, ตู้, forwarders,
  receipts) fits the free tier and is loaded. After the Supabase **Pro**
  upgrade the 3 log tables + the customer image/file storage (§7) backfill
  to full fidelity (per เดฟ — "production จริง ต้องอัพครบทั้งหมด").

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

> **Done 2026-05-19 (Option B):** steps 3-7 ran against dev + prod with the
> 2026-05-18 dump — business data only (114 tables, the 3 log tables empty),
> see §4. The steps below are the FULL procedure for the post-Pro-upgrade
> load (a fresh cutover dump · the 3 log tables · the customer images).

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

**DB-2 — This legacy port** (§1-§8). 🟢 **Business data LOADED to dev + prod
(2026-05-19).** Migrations `0081`-`0083` + `0087` applied + the 230 MB of
business data (114 of 117 tables · 8,898 customers) loaded to both Supabase
projects; 114/114 business tables reconcile exactly. 🟡 **Remaining:** the 3
oversized log tables (779 MB) + the customer images — they need the Supabase
**Pro** upgrade (free tier caps at 500 MB; full data is 1.02 GB). Gated on
the Pro-upgrade decision (เดฟ + ก๊อต + the owner) + แต้ม's image storage.
The `tb_*` namespace does NOT collide with the rebuilt schema, so DB-1 and
DB-2 are independent.

**Numbering.** Migration files `0001`-`0087` exist (`0065` is an intentional
gap). `0081`-`0083` = this legacy port (schema · indexes · member-seq);
`0084`-`0086` = ภูม's booking/credit-note/chat batch (commit `a248696`);
`0087` = the `v_pcs_migration_status` security-invoker fix. The next free
number for new Phase-B work is **`0088`**.
