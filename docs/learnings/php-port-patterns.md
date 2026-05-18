# Learnings — legacy PHP port patterns

Topics: porting `D:\xampp\htdocs\pcscargo\` → Pacred Next.js. Schema mappings · auth pattern · validation · RBAC · PDF · helpers.

> Seed file. Skill that writes here: [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md).
>
> Expected first entries (post-emergency sprint): `function.php` helper port catalogue · ratesheet engine port · mPDF→react-pdf migration patterns · auto-cancel cron pattern.

---

## 2026-05-16 — V-A7 receipt-number "-N suffix" is N/A in Pacred (ภูม)

**What:** PORT_PLAN Part V row V-A7 ("Receipt-number cleanup — one canonical number, drop the error-prone `-N` suffix") describes a legacy PCS Cargo PHP problem where receipts could spawn `R-12345-1`, `R-12345-2`, etc. variants for re-issues — error-prone because staff and customers kept different numbers in their records.

**Status in Pacred:** **Already designed out from day 1, no port work needed.**
- Forwarder receipts use the raw `f_no` (one-to-one with the forwarder row)
- Service-order receipts use the raw `h_no` (one-to-one with the service_order row)
- Tax invoices use atomic `INV-YYYYMM-NNNN` from `next_tax_invoice_serial()` (migration `0034`); re-issues = cancel + new serial (per ADR-0006 §7 RD Code 86 immutability)
- No `receipt_no` / `receipt_seq` column anywhere; no codepath that appends `-N`

**Why this matters:** Future agents auditing Part V might be tempted to "fix" something that isn't broken. The clean design is intentional and well-suited to Pacred's e-receipt model.

**Verification path:** `grep -rE "receipt_no|receipt_number|receipt_seq" pacred-web/` returns zero application-code hits (matches in docs only). `next_tax_invoice_serial()` is canonical + idempotent.

**If you ever see a `-N`-style suffix appear:** it's a regression. Hunt the codepath, don't add the suffix to schema.

---

## 2026-05-18 — MySQL → PostgreSQL port: three gotchas that fail a COPY load (เดฟ/Claude)

**Context:** the D1 PCS→Pacred data migration — `pcsc_main` (117 tables) MySQL → PostgreSQL. The approach that worked: load the dump into local MySQL (XAMPP MariaDB), then a Python converter reads from the *live* DB (`pymysql`) and writes PostgreSQL `COPY` text-format files. Reading a live DB beats text-munging the 898 MB dump — clean typed values, no MySQL-escape parsing, free row-count reconciliation. A throwaway portable PostgreSQL (EDB binaries zip, `initdb` into a temp folder, no install) is enough for a dry-run.

Three legacy-data gotchas — each fails a Postgres `COPY`, none caught by `build`/`verify`, only at load time:

**1. NUL bytes (`\x00`) in legacy `varchar` data.** Some values carried a stray NUL. PostgreSQL `text`/`varchar` cannot store `\x00`. The symptom is misleading — `ERROR: extra data after last expected column` (the NUL truncates psql's C-string line read and scrambles field parsing), NOT an obvious bad-byte error. Fix: strip `\x00` from every string in the converter.

**2. Legacy `datetime NOT NULL` columns hold `'0000-00-00'`.** MySQL's `NOT NULL` does NOT block the zero-date sentinel. Keeping `NOT NULL` while mapping `0000-00-00` → `NULL` (Postgres has no zero-date) fails with a not-null violation. Fix: every `date`/`time`/`timestamp` column must be NULLABLE in the Postgres port — zero-date ↔ NULL.

**3. When a COPY row-count looks right but psql still rejects the row,** inspect raw bytes (`open(f,'rb')` + `repr`), not decoded text — a naive tab-count per line said the file was clean while gotcha #1 was hiding at the byte level.

**Also:** spawned sub-agents could NOT do network downloads (WebFetch/PowerShell/Bash network egress denied); the main session can (`pip install`, `Invoke-WebRequest` work). Do fetch/download work from the main session, not a sub-agent.

**Full migration runbook:** [`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md).

---

## 2026-05-19 — MySQL → PostgreSQL via pgloader: 5 more gotchas (เดฟ/Claude)

**Context:** the D1 migration re-run end-to-end on a Mac with **pgloader**
(vs the 2026-05-18 Python converter — both reach the same validated result:
3,780,238 rows, 117/117 tables reconcile). Toolchain via Homebrew: `mysql` +
`postgresql@17` + `pgloader`. pgloader is the faster path — one command does
schema + data + indexes + sequence reset (~29 s for 3.78 M rows).

**1. pgloader connects to MySQL 9.x fine — no `caching_sha2_password` workaround.**
A common worry: MySQL 8.4+/9.x dropped `mysql_native_password` and an old
MySQL driver can't speak `caching_sha2_password`. Not true for pgloader
3.6.10 — it connects to MySQL 9.6 over TCP with no extra config. Don't waste
time creating native-password users (MySQL 9.x removed that plugin anyway).

**2. One pgloader CAST rule kills the zero-date NOT-NULL trap.**
The 2026-05-18 gotcha #2 (legacy `datetime NOT NULL` holds `0000-00-00`) is
solved declaratively in the `.load` file:
`CAST type datetime to timestamp drop not null using zero-dates-to-null`.
The `drop not null` is the essential half — without it the zeroed value
maps to NULL then fails the NOT NULL constraint. NUL bytes: pgloader's
batch loader absorbed them with 0 rejects (no manual strip needed).

**3. MySQL's default collation is case-INSENSITIVE — PostgreSQL is not.**
Legacy `utf8mb3_general_ci` means `'pcs1791' = 'PCS1791' = 'Pcscargo'` all
join/compare EQUAL; the legacy PHP relied on this unknowingly. PostgreSQL
`text`/`varchar` is case-SENSITIVE. So any identifier-like column used in
joins (here the `userid` member code) MUST be **case-normalised** in the
port — else joins that silently worked in MySQL silently break in PG. The
PCS→PR rebrand folds every code to one canonical case:
`'PR' || substring(upper(userid) from 4) WHERE upper(userid) LIKE 'PCS%'`.
Check the source for case-collision dupes FIRST (`GROUP BY upper(col)
HAVING count(*)>1`) — a collision would fail a PK/unique UPDATE.

**4. `notnull` / `isnull` are PostgreSQL postfix operators — never bare aliases.**
`SELECT count(*) FILTER (WHERE x IS NOT NULL) notnull FROM t` does NOT alias
the count — PG parses it as `(count(...)) NOTNULL` (i.e. `IS NOT NULL`) → a
**boolean**. Symptom: the column returns `t`/`f`, and a UNION with an int
literal fails `UNION types boolean and integer cannot be matched`. Fix: any
other alias (`nn`) or quote it (`AS "notnull"`).

**5. A Supabase data load needs the Postgres password — the API keys can't.**
The `anon` / `service_role` / `sb_publishable_*` keys authenticate to
**PostgREST** (the REST layer) — CRUD on existing tables, RLS-gated. They
CANNOT run DDL (`CREATE TABLE`) or a bulk `COPY`. A schema+data migration
needs a real Postgres connection —
`postgresql://postgres:<DB-PASSWORD>@db.<ref>.supabase.co:5432/postgres` —
and the DB password is a separate dashboard secret (Project Settings →
Database), NOT any API key. Plan the migration around obtaining it.
