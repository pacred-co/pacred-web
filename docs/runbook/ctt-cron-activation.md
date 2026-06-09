# 🚚 CTT cron — DRY-RUN → LIVE activation runbook

**Last updated:** 2026-06-09 (ภูม handoff round 7 P1 #2)
**Owner:** ภูม (operations) · ก๊อต (env)
**Adapter:** [`lib/integrations/google-sheets/ctt-adapter.ts`](../../lib/integrations/google-sheets/ctt-adapter.ts) · helpers + tests in [`ctt-helpers.ts`](../../lib/integrations/google-sheets/ctt-helpers.ts) + [`ctt-adapter.test.ts`](../../lib/integrations/google-sheets/ctt-adapter.test.ts)
**Route:** [`/api/cron/sheets-sync-ctt`](../../app/api/cron/sheets-sync-ctt/route.ts)
**Schedule:** hourly (`0 * * * *`)
**Dashboard:** `/admin/system/crons` → look for the **"Sync sheet CTT warehouse"** card

---

## 0. Why this cron exists

The CTT warehouse partner maintains a Google Sheet (`CTT-New` tab in spreadsheet `15g49hwP…` — Pacred provisions its own copy via ก๊อต) where their warehouse staff types in cabinet codes + arrival dates + free-text status as boxes physically arrive. Customer-facing Pacred dashboards lag behind that sheet by hours/days unless we propagate it back into `tb_forwarder`.

Legacy PCS Cargo had an admin-per-row commit page (`pcs-admin/api-sheets-ctt.php`) where staff manually pasted each row in — a high-touch process that lost rows when staff got busy. Pacred ports the **match-and-update** path instead: the cron pulls the sheet hourly, matches each row to an existing `tb_forwarder` by tracking number, and applies **forward-only** writes. New rows (no existing `tb_forwarder`) still go through the manual entry form at `/admin/api-sheets-ctt` (file: `app/[locale]/(admin)/admin/api-sheets-ctt/page.tsx`) — that part is unchanged.

The propagation pattern is byte-identical to the proven MOMO writer ([`lib/integrations/momo-isolated/propagate.ts`](../../lib/integrations/momo-isolated/propagate.ts)) — same safety rules, same forward-only discipline, same `fcabinet_locked` respect.

---

## 1. The DRY-RUN → LIVE flip protocol

The adapter ships **default-OFF**. To activate:

### Step 1 — Pre-flip checks (do these BEFORE flipping)

1. **Service-account JSON is provisioned** — Vercel `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` is set (ก๊อต task). Confirm via Settings → Environment Variables.
2. **Sheet ID is set** — Vercel `GOOGLE_SHEETS_CTT_ID` matches the Pacred-owned CTT spreadsheet (NOT the legacy PCS one).
3. **Sheet is shared with the service account** — open the sheet → Share → paste the service account email (`xxx@yyy.iam.gserviceaccount.com`) as Viewer. Without this, the adapter returns `auth_failed`.
4. **Review 5 DRY-RUN runs at `/admin/system/crons`** — open the CTT card's "last summary" detail. Confirm:
   - `mode = "dry-run"`
   - `newRowCount > 0` (the sheet has content)
   - `propagate.scanned > 0` (the tracking column is parsing correctly)
   - the `sampleNewRow` array looks like a real row (tracking + cabinet + date + status are in plausible positions)
5. **If the column layout is wrong**, set the column-index overrides — DO NOT redeploy code:
   - `CTT_COL_TRACKING` (default `1` = column B)
   - `CTT_COL_CABINET` (default `2` = column C)
   - `CTT_COL_ARRIVAL` (default `3` = column D)
   - `CTT_COL_STATUS` (default `4` = column E)
   - Trigger another DRY-RUN via the cron-health page's "Trigger now" button; re-check the `sampleNewRow` mapping.
6. **Verify `fcabinet_locked` is honoured on at least one test row** — pick a `tb_forwarder` with `fcabinet_locked=true` AND a matching tracking in the sheet, confirm DRY-RUN logs `cabinet-write SKIPPED (locked)`.

### Step 2 — Flip ON (cabinet + arrival writes)

1. Vercel → Settings → Environment Variables → add `CTT_CRON_LIVE=true` (Production).
2. Redeploy (or wait for the next push — env changes take effect on the next cold start).
3. Wait for the next scheduled cron tick (top of next hour) or trigger manually from `/admin/system/crons`.
4. Open the CTT card on `/admin/system/crons` → expand "last summary". Confirm:
   - `mode = "live"`
   - `propagate.matched > 0` (existing `tb_forwarder` rows were found by tracking)
   - `propagate.cabinetWrites + propagate.arrivedWrites > 0` (real updates happened)
   - `propagate.errors = []` (no per-row failures)
   - `propagate.statusAdvanceSkippedByGate > 0` is EXPECTED at this stage — fstatus advance is a separate gate (next step).

### Step 3 — (Optional) flip fstatus advance ON

`fstatus` writes can trigger customer-facing side-effects (the legacy notification path) so they are a **second gate**. Only flip after ภูม has watched the DRY-RUN→cabinet runs for at least a day and the `statusAdvanceSkippedByGate` counts look reasonable.

1. Vercel → add `CTT_CRON_PROPAGATE_STATUS=true` (Production).
2. Redeploy.
3. After the next tick, confirm `propagate.statusAdvanceWrites > 0` and `propagate.statusAdvanceSkippedByGate` drops to 0.

---

## 2. Rollback

Same place, same speed:

- **Stop writing fstatus** — set `CTT_CRON_PROPAGATE_STATUS=false` (or delete the var) → redeploy. Cabinet + arrival writes continue.
- **Stop all writes (full revert to DRY-RUN)** — set `CTT_CRON_LIVE=false` (or delete) → redeploy. Adapter goes back to log-only mode within the next cold start.

Rollback is safe because **every write is forward-only + idempotent**. Re-running the same sheet rows produces no change (cabinet write requires empty current; arrival write requires no current date; fstatus write requires strictly higher rank). The cursor advance (`tb_notify_sheet_ctt.numrow`) is a perf optimisation, not a correctness gate.

---

## 3. Safety rules (the writes ARE constrained to these)

| Column | Write condition | Skip condition |
|---|---|---|
| `fcabinetnumber` | Sheet `cabinet` non-empty AND current value is EMPTY/NULL AND `fcabinet_locked` is NOT true | Existing manual cabinet present (never overwrite) · `fcabinet_locked=true` (admin's defensive belt · backlog #259 · migration 0150) |
| `fdatetothai` | Sheet `arrival` parses to a date AND current value is NULL or `'0000-00-00'` | Date already set (forward-only) |
| `fstatus` | Sheet `status` label maps to a known fstatus AND target rank strictly > current rank AND `CTT_CRON_PROPAGATE_STATUS=true` | Roll-back attempt · unknown status label (never guesses) · env gate off (counted as `statusAdvanceSkippedByGate`) |

**Never touched:** money columns (`ftotalprice`, `paydeposit`, `fcredit`, …), `userid` (a wrong customer match would bill the wrong customer), `admin_*` audit fields. INSERTing brand-new tb_forwarder rows is also out of scope — that remains the manual carrier form's job.

---

## 4. Monitoring

- **`/admin/system/crons`** — the CTT card shows last fire time + status badge + 7-day success rate + the full propagation summary in the expandable details. The same page renders MOMO + CargoThai + the rest of the cron health — one place for every cron.
- **`cron_invocations` table** — `result_summary` jsonb column has every run's full counts. Useful for ad-hoc SQL:
  ```sql
  select fired_at, result_summary
  from cron_invocations
  where cron_path = '/api/cron/sheets-sync-ctt'
  order by fired_at desc
  limit 20;
  ```
- **Per-row errors** — `propagate.errors[]` lists any per-row failures (with tracking number + supabase error code). Use the manual entry form to fix them; the cron does not retry — best-effort on each run.
- **Server logs** — `logger.info("ctt-sync", …)` writes structured JSON in prod. Locked-cabinet skips also log `cabinet-write SKIPPED (locked)` via `console.info` so they're easy to grep.

---

## 5. Cross-references

- **The MOMO pattern this mirrors:** [`lib/integrations/momo-isolated/propagate.ts`](../../lib/integrations/momo-isolated/propagate.ts) (same safety rules, same forward-only writes).
- **The legacy intake paths catalogue:** [`docs/research/legacy-deep-dive/01-tb-forwarder-intake-paths.md`](../research/legacy-deep-dive/01-tb-forwarder-intake-paths.md) §5 (the CTT sheet is intake path #7).
- **Admin manual CTT form** (out-of-scope for this cron — handles NEW rows): `/admin/api-sheets-ctt` (file: `app/[locale]/(admin)/admin/api-sheets-ctt/page.tsx`).
- **Schema:** `tb_forwarder` (migration `0081_pcs_legacy_schema`) + `tb_forwarder.fcabinet_locked` (migration `0150_tb_forwarder_cabinet_locked`).
- **Cron registry:** [`lib/cron/registry.ts`](../../lib/cron/registry.ts) — schedule + label + description.
