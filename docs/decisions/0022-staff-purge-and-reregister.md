# ADR-0022 — Staff purge + re-register: remap-then-deactivate, never hard-delete

**Status:** PROPOSED 2026-05-31 (เดฟ — plan for owner review; **nothing executed**). Awaiting owner go-ahead + the OLD→NEW code map before any SQL runs.
**Owner directive (2026-05-31, verbatim):** *"เรายังไม่ได้เปลี่ยน/โล๊ะ พนักงานเก่าออกเลย — พนักงานทั้งหมดที่ไม่ใช่ลูกค้า (ทั้ง sale และ cs) เปลี่ยนหมด — เดี๋ยวต้องไล่ลบ เซลเก่า + admin เก่าออกทั้งหมด สมัครใหม่ดีกว่า"* — purge ALL legacy staff (sales + CS/admin, **NOT customers**) and re-register the new team.
**Source:** decision #5 in the 2026-05-31 re-sweep ([`docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md`](../research/legacy-resweep-2026-05-31/_MASTER-FRESH.md) §Staff-purge).
**Executable companion:** [`docs/runbook/staff-purge-fk-remap-2026-05-31.md`](../runbook/staff-purge-fk-remap-2026-05-31.md) — the FK landscape + DRAFT remap SQL (REVIEW-ONLY).
**Read-only probe:** [`scripts/staff-purge-analysis.mjs`](../../scripts/staff-purge-analysis.mjs) — re-print the FK landscape + mismatch on demand. Never mutates.
**Unblocks:** P1-15 (sales-rep auto-assign) — `pickLeastLoadedSalesRep` (`lib/admin/assign-sales-rep.ts`) returns `null` today because `admin_contact_extras` has **0 rows**, so no active rep carries a `legacy_admin_id`.

> ⚠️ **DATA-DESTRUCTIVE territory.** This ADR is a PLAN. No DELETE/UPDATE has been run on prod. Every number below was gathered with read-only SELECT/count requests (`scripts/staff-purge-analysis.mjs`) on 2026-05-31 against prod `yzljakczhwrpbxflnmco`.

---

## Context

### The three admin tables (verified on prod)

| Table | Rows (prod) | Key | What it is |
|---|---:|---|---|
| `tb_admin` | **13** | `adminID` (varchar, e.g. `admin_pop`) | LEGACY staff identity (camelCase cols: `adminID`/`adminName`/`adminEmail`/`adminStatusA`/`adminDel`…). The ported PCS roster. |
| `admins` | **3** | `profile_id` (UUID → `profiles`) | REBUILT Pacred-auth role grant (`role`/`is_active`). All 3 are `super`. This is what `requireAdmin()` checks. |
| `admin_contact_extras` | **0** | `profile_id` | The BRIDGE table (migration 0110) — holds `legacy_admin_id` + `nickname`. **Empty** → the bridge between Pacred auth and the legacy `adminID` codes does not exist yet. |

`tb_users` (8,926 rows) is the **customer** table — **out of scope, never touched** by this plan. (Staff are NOT customers; the directive says non-customer staff only.)

### The core problem the re-register must fix — a three-way code mismatch (already orphaned TODAY)

The legacy column that says "who is this customer's sales rep" (`tb_users.adminIDSale`) and the report snapshot (`tb_sales_report.sradminidsale`) both store a legacy **`adminID` varchar code**. But the codes in the *data* no longer match the codes in *`tb_admin`*. Verified counts:

- **`tb_admin.adminID` (the current 13-row roster):** `admin_pop`, `admin_nat`, `admin_pond`, `admin_admin_win`, `admin_admin_web`, `admin_admin_ploy`, `admin_admin_jane`, `admin_admin_dev`, `admin_admin_gring`, `admin_admin_aom`, `admin_admin_pee`, `admin_ploypr01`, `admin_Warehouse`.
- **`tb_users.adminIDSale` (8,890 customers carry a rep):** 13 distinct codes — `admin_mew` (430), `admin_sarai` (270), `admin_ploy` (83), `admin_but` (75), `admin_fogus` (64), `admin_may` (44), … **ZERO of them exist in `tb_admin`.**
- **`tb_sales_report.sradminidsale` (16,954 of 17,027 rows carry a rep):** 4 distinct codes — `admin_jeen`, `admin_kan`, `admin_baipor`, `admin_nin`. **ZERO of them exist in `tb_admin`.**
- **`tb_forwarder.adminid` (audit stamp, 41,004 rows):** ~32 distinct codes in a 1,000-row sample, **31 of which are not in `tb_admin`** (years of historical staff — `admin_numf`, `admin_koy`, `admin_pant`, `admin_aumm`, …).

So the rep name is **already blank** on reports and on customer records — not because of a future purge, but because the roster drifted away from the data over years of staff churn. This is exactly the symptom the re-sweep flagged ("reports show no rep name"). **The re-register is the chance to fix it — but ONLY if we remap the data, not orphan it further.**

### What a naive hard-delete would destroy

If we `DELETE FROM tb_admin` (and/or the `admins`/`profiles` rows) without remapping first:
- **8,890 customers** lose their sales-rep pointer → blank rep, no one owns the lead, P1-15 auto-assign can't re-derive who they belonged to.
- **16,954 sales-report rows** point at a code that resolves to nothing → the commission/performance history is unreadable.
- **41,004 + 45,696 + 46,770** forwarder stamps, **20,323** order stamps, **93,384 + 97,700** wallet-ledger stamps, **11,909** receipt-print stamps, etc. all become dangling "who did this" audit references → the audit trail of every historical transaction loses its actor.

These are **soft references** (varchar codes, **not** DB-level foreign keys with `ON DELETE CASCADE`), so a delete won't *error* — it will **silently orphan**. That's worse: no failure, just quietly broken history. (Verified: no FK constraint enforces these; they are application-level joins on a varchar code.)

---

## Decision

### D-1 — **Remap-then-deactivate. Never hard-delete the old rows.**

The procedure is, in strict order:
1. **Snapshot/backup first** (the old `tb_admin` + `admins` + `admin_contact_extras` + the FK columns — see runbook §Backup).
2. **Build the NEW 13 admins FIRST** via `/admin/admins/new` — this creates `profiles` + `admins` + `admin_contact_extras` rows and assigns each a **new `legacy_admin_id`** (the bridge value). Capture each new code. (Use [`docs/research/tb-admin-13-row-reference.md`](../research/tb-admin-13-row-reference.md) as the data checklist.)
3. **REMAP the FK columns** — UPDATE every referencing column from the OLD code → the NEW code, per an owner-supplied OLD→NEW map. This is run **BEFORE** any delete/deactivate, so no row is ever orphaned.
4. **Only then RETIRE the old staff** — and even then, **prefer DEACTIVATE over DELETE**: flag the old `tb_admin` rows inactive (`adminStatusA='0'` / set `adminDel` + `dateDel`) and the old `admins` rows `is_active=false`. This **preserves history/audit** (the old code still resolves to a name when reading ancient rows) while removing login + assignment eligibility.

**Why deactivate, not delete:** the stamp columns (`adminid`/`adminidcreator`/`adminidupdate`/`adminidprint`/…) are pure audit history. Their value is "this old code = this person's name when you look at a 2024 forwarder." If we delete the old `tb_admin` row, that lookup returns nothing forever. Deactivation keeps the name resolvable, costs nothing (a flag), and is reversible. A hard delete is irreversible and buys nothing.

### D-2 — Remap scope: split "live ownership" from "historical audit"

Not all FK columns need the same treatment. Two tiers:

- **Tier 1 — LIVE ownership / reporting (MUST remap):** `tb_users.adminIDSale` (current rep) and — owner's call — `tb_sales_report.sradminidsale` (rep performance history). These drive live behaviour (who owns the lead, whose number it counts toward). Remap these to the NEW rep codes so the new team inherits their book of business and the reports read.
- **Tier 2 — HISTORICAL audit stamps (remap OPTIONAL — default LEAVE AS-IS + keep the old rows resolvable via deactivation):** `adminid`/`adminidcreator`/`adminidupdate`/`adminidcreate`/`adminidip`/`payadminidcreator`/`admincreate`/`adminidcrate`/`adminidprint`/`adminidprintcopy`/`adminIDCreate`/`adminIDUpdate` across `tb_forwarder`/`tb_header_order`/`tb_payment`/`tb_wallet_hs`/`tb_receipt`/`tb_cnt`. These say "who did this in the past." Rewriting a 2024 forwarder to say a 2026 new-hire created it would be a **lie in the audit trail**. **Default: do NOT remap these — leave the old code in place, kept resolvable because we deactivate (not delete) the old `tb_admin` row.** The runbook still provides the UPDATE statements for these, gated behind an explicit owner opt-in, in case the owner wants a clean re-attribution for a *specific* person (e.g. a rename, not a new hire).

> The distinction matters: **Tier 1 = "this lead is yours now"** (forward-looking, remap). **Tier 2 = "this is who touched it back then"** (backward-looking, preserve). Conflating them corrupts history.

### D-3 — The OLD→NEW map is owner-supplied; the SQL is parameterized around it

The script/runbook can enumerate the OLD codes (done — see above), but **only the owner knows the OLD→NEW person mapping** (is `admin_mew`'s book inherited by a specific new hire, redistributed round-robin, or retired?). So:
- The runbook ships the remap as a **parameterized template** with an explicit `(old_code, new_code)` map the owner fills in.
- Where a customer's old rep has **no successor** (the person genuinely left and their leads should be re-pooled), the recommended move is to set those `tb_users.adminIDSale` to a sentinel (or leave blank) and let **P1-15 auto-assign** re-distribute them to the new team — rather than forcing a wrong mapping.

### D-4 — Sequencing guard: re-register UNBLOCKS, purge is LAST

The build-new-first ordering also fixes P1-15 for free: the moment the 13 new admins exist with `admin_contact_extras.legacy_admin_id` populated and `is_active=true`, `pickLeastLoadedSalesRep` starts returning a real rep (today it returns `null` — 0 rows in `admin_contact_extras`). So new signups get a rep **before** we touch any old data. The purge of old rows is the **last** step, after remap + verification.

---

## Consequences

**Positive:**
- Zero orphans — every customer keeps a resolvable rep; every historical stamp stays attributable.
- Reversible — deactivation is a flag flip; a snapshot backs the whole operation.
- Fixes the pre-existing blank-rep bug (the data already drifted) as a side effect of the remap.
- Unblocks P1-15 the moment the new admins are created (before any delete).

**Negative / risks (mitigated in the runbook):**
- **Casing trap:** `tb_cnt` uses camelCase (`adminIDCreate`/`adminIDUpdate`); the others use lowercase (`adminid`/…). SQL must quote camelCase identifiers. (Documented per-column in the runbook.)
- **varchar(10) clip:** legacy `adminid*` columns are `varchar(10)` (see `lib/auth/safe-legacy-admin-id.ts`). NEW codes longer than 10 chars (e.g. `admin_admin_gring` = 17) will **not fit** the Tier-2 stamp columns. → Tier-2 remap is opt-in precisely because the new long codes may not fit; Tier-1 columns (`adminIDSale`, `sradminidsale`) must be verified to accept the new code length before remap. (Runbook §Pre-flight checks the column widths.)
- **No DB-level FK:** these are soft refs, so the DB won't protect us — the **order** (remap before retire) is the only safety. The runbook enforces it.
- **`tb_users` blast radius:** the Tier-1 `tb_users.adminIDSale` UPDATE touches the customer table. It only writes the rep column (never identity/wallet), but it is the highest-blast-radius statement — run inside a transaction, count-verify before commit.

**Explicitly NOT decided here (owner calls, captured in the runbook):**
- The actual OLD→NEW person map.
- Whether to remap `tb_sales_report.sradminidsale` (history rewrite) or leave it and accept that pre-purge months read against old codes.
- Whether any departed rep's customers re-pool to P1-15 vs map to a named successor.

---

## Alternatives considered

- **A — Hard-delete old rows, let refs dangle.** Rejected: silently orphans 8,890 customers + 100k+ audit stamps; irreversible; destroys the lead book and the audit trail. This is the anti-pattern the directive's "สมัครใหม่ดีกว่า" could be naively read as.
- **B — Keep old rows, add new alongside, never remap.** Rejected: leaves the pre-existing blank-rep bug unfixed and the new team with no book of business; doesn't satisfy "เปลี่ยนหมด."
- **C — Remap-then-deactivate (chosen).** Preserves data + audit, fixes the drift, reversible, unblocks P1-15.
- **D — Rename old codes in `tb_admin` in place (no new rows).** Rejected: the directive is to re-register a *new team* through the proper UI (which also creates the Pacred-auth `profiles`/`admins`/bridge rows); an in-place rename wouldn't create the auth identities or let the new people log in.
