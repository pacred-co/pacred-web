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
