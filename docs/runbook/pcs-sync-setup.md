# PCS ↔ Pacred Sync — Setup Runbook

**Owner:** เดฟ · **Target reader:** ภูม
**Created:** 2026-06-02

Pulls recent `tb_forwarder` edits from the **PCS server**
(`pcscargo.com/api/pacred-sync.php`) into our `tb_forwarder` every 10 min,
so when PCS staff edit a status / cabinet / driver / tracking on the legacy
PHP system, those edits land in Pacred without anyone re-keying.

## Architecture (1 paragraph)

PHP endpoint on the PCS server returns recent `tb_forwarder` changes as
JSON. Pacred Vercel cron pulls every 10 min, merges into our `tb_forwarder`
under a 3-tier conflict policy (PCS-wins for staff-edited fields, MOMO-wins
for warehouse fields when Pacred has a value, PCS-wins for dimensions).
Match by `tb_forwarder.id` only — Pacred never creates new rows from PCS
(separate sequence).

## Files

| Path | Purpose |
|---|---|
| `supabase/migrations/0135_pcs_sync_state.sql` | `pcs_sync_state` + `pcs_sync_logs` tables |
| `lib/integrations/pcs-sync/client.ts` | Fetcher → calls PHP endpoint |
| `lib/integrations/pcs-sync/merge.ts` | Per-row conflict policy |
| `lib/integrations/pcs-sync/sync.ts` | Orchestrator (shared by cron + manual) |
| `app/api/cron/pcs-sync/route.ts` | Vercel cron handler — runs every 10 min |
| `actions/admin/pcs-sync.ts` | Admin manual-trigger Server Actions |
| `app/[locale]/(admin)/admin/system/pcs-sync/page.tsx` | Dashboard UI |
| `lib/admin/sidebar-menu.ts` | Sidebar link (Settings → System → PCS↔Pacred Sync) |
| `vercel.json` | Cron schedule `*/10 * * * *` |

## Setup (3 steps)

### 1. Apply migration 0135

Open Supabase Dashboard → SQL Editor → paste contents of
`supabase/migrations/0135_pcs_sync_state.sql` → Run.

The migration is idempotent (safe to re-run). It creates 2 tables, seeds
the singleton state row (with `last_sync_at = now() - 24h`), and locks
RLS to service_role only.

**Verify:**

```sql
select * from public.pcs_sync_state;
-- expect 1 row: id=1, last_sync_at=<24h ago>, last_run_at=null, last_error=null

select count(*) from public.pcs_sync_logs;
-- expect 0
```

### 2. Set Vercel env vars

Vercel Dashboard → `pacred-web` project → Settings → Environment Variables
→ add **two** to **all three environments** (Production / Preview / Dev):

| Name | Value | Notes |
|---|---|---|
| `PCS_SYNC_URL` | `https://pcscargo.com/api/pacred-sync.php` | Confirm with ก๊อต — adjust if PCS host differs |
| `PCS_SYNC_TOKEN` | (the shared secret) | **MUST match** the `X-Pacred-Token` value the PHP endpoint expects |

`CRON_SECRET` should already be set from previous cron work — verify it's
present (Settings → Env vars) before redeploying.

After saving, **redeploy** (Production tab → ⋯ → Redeploy → no cache).

### 3. Verify on prod

After the redeploy goes live:

1. Browse `https://pacred.co.th/admin/system/pcs-sync` (logged in as super
   or accounting role).
2. Check the 3 state cards: should show **cursor = 24 hours ago**, **last
   run = (empty)**, **error = ไม่มี**.
3. Click **"Trigger sync ตอนนี้"** — confirm dialog → wait.
4. Expected outcome:
   - **Green toast** like `✓ ดึง N แถว · เขียน M · ข้าม X · fail 0 · 1234ms`
   - The "ประวัติการรัน" table now shows 1 row.
   - Cursor advances to "now-ish".
5. Click **"Test endpoint (1 hr ล่าสุด)"** — should show the raw JSON
   response from the PHP endpoint expanded below the button. This lets
   you sanity-check the contract.

If you see any error, check it against this table:

| Error | Likely cause |
|---|---|
| `PCS_NOT_CONFIGURED` | env vars missing on Vercel (step 2 didn't take or wasn't redeployed) |
| `PCS_AUTH_INVALID` | `PCS_SYNC_TOKEN` doesn't match the PHP endpoint's expected value |
| `PCS_NOT_FOUND` | `PCS_SYNC_URL` wrong (typo / wrong host / endpoint not deployed) |
| `PCS_UPSTREAM_ERROR` | PHP endpoint returned 5xx — check the PHP server logs |
| `PCS_NETWORK_ERROR` | DNS / connectivity from Vercel → PCS server blocked |
| `PCS_TIMEOUT` | PHP endpoint took >30s — investigate slow query on PCS side |
| `PCS_PARSE_ERROR` | PHP endpoint returned non-JSON or wrong shape — check the contract |

## Once it's running

The cron fires every 10 min automatically (Vercel scheduler). Each run:

1. Reads `pcs_sync_state.last_sync_at` (the cursor)
2. Calls `pacred-sync.php?since=<cursor>&limit=500`
3. For each row → `applyPcsRowToTbForwarder` per the conflict policy
4. Writes a `pcs_sync_logs` row with the summary
5. Advances the cursor to `response.now` **only on success**

If any run fails, the cursor stays put, so the next run retries the same
window — **no data loss**.

The dashboard at `/admin/system/pcs-sync` shows:
- Current cursor + last run + last error (top cards + red banner if error)
- 50 most-recent runs (since/until window, rows seen/upserted/skipped/failed, ms, error)

The same cron also appears on `/admin/system/crons` (cron-health overview).

## Conflict policy reference

When a PCS row collides with a Pacred row of the same `id`:

| Field | Rule | Reason |
|---|---|---|
| `fcabinetnumber` | PCS wins | Staff in PCS owns cabinet assignment |
| `fstatus` | PCS wins | Status flow lives in PCS workflow |
| `fdatestatus3..7` | PCS wins | Status timestamps owned by PCS |
| `fdriverid` | PCS wins | Driver assignment from PCS |
| `fnotedriver` | PCS wins | Driver notes from PCS |
| `ftrackingth` | PCS wins | TH tracking number assigned in PCS |
| `adminidupdate` | PCS wins | Last-toucher attribution |
| `fwarehousename` | MOMO-protected | Pacred-non-null wins (MOMO may have set it authoritatively) |
| `fdatecontainerclose` | MOMO-protected | Pacred-non-null wins (MOMO container_closed feed) |
| `fweight` | PCS wins | Dimensions update both ways; PCS most-recent |
| `fvolume` | PCS wins | Same |
| `famount` | PCS wins | Same |

Match by `id` only. If PCS sends an `id` that doesn't exist in Pacred,
we skip (no_match) — do NOT create from PCS (Pacred has separate seq).
