# MOMO status drift — diagnosis 2026-05-30 evening

> **ภูม's question (verbatim 2026-05-30):**
> *"เรื่องตู้อะว่าทำไม pcs เป็นอีกสถานะแล้วแต่ของเรายังไม่เป็น แล้วเวลาดึงจาก momo จะเช็คยังไง ว่าไม่ได้ตกหล่นอะ ... แกไปเช็คไอ้ระบบ การทำงาน momo ออเดอร์รายการพวกนี้มาให้เรียลทาร์มกับ เว็บ PCS ตอนนี้เลยได้รึป่าว หรือติดตรงไหน"*

## TL;DR (the headline finding)

**Pacred MOMO cron IS scheduled every 10 min and IS firing — but every recent run is failing because the MOMO API credentials are missing on Vercel production.** 5+ hours of MOMO updates have already been silently dropped.

```
Last cron success:   2026-05-29 03:58 UTC   (status=success, 6 rows upserted)
07:10 UTC onwards:   11 consecutive cron runs ALL failed
Error per run:       MOMO_NOT_CONFIGURED — "MOMO API config missing
                     — set MOMO_API_BASE_URL + MOMO_API_TOKEN (or
                     MOMO_JMF_* aliases) in env"
```

This is silent because:
- Cron writes a `momo_sync_logs` row each run (with `status: "failed"`) but nobody reads that table.
- The /review page only shows rows that DID make it in (filter: `committed_at IS NULL`). Failed syncs → no row → nothing to show → looks empty/quiet.
- `pnpm verify` / `pnpm build` don't touch env vars on production.

## State of MOMO data on prod (2026-05-30)

| Table | Rows | Notes |
|---|---|---|
| `momo_import_tracks` | 9 | All uncommitted. 0 match any `tb_forwarder.ftrackingchn`. |
| `momo_container_closed` | 1 | |
| `momo_sack_infos` | 0 | |
| `momo_sync_logs` | 17 | Last 11 = `status=failed` (MOMO_NOT_CONFIGURED). Last success was 2026-05-29 03:58 UTC. |

`momo_tracking_no` has a UNIQUE constraint + upserts use `onConflict: "momo_tracking_no"` → **the dup-guard ภูม asked about is in place. Syncing the same tracking twice updates the row, doesn't double-insert.** Same for `momo_container_no` (containers) and `momo_sack_no` (sacks).

## Why PCS vs Pacred drift — ภาษาคน

PCS Cargo legacy had ZERO automation: admin opened `pcs-admin/api-forwarder-momo.php?page=updateAPI` and clicked it whenever they wanted fresh data. The status felt "real-time" because admins clicked all day. There was ONE single tb_forwarder table; every status update wrote there directly.

Pacred made it more sophisticated — and accidentally created a 2-stage pipeline:

```
Stage 1: MOMO API → momo_import_tracks         (cron every 10 min — currently BROKEN)
Stage 2: momo_import_tracks → tb_forwarder     (admin clicks "สร้างใหม่" on /review,
                                                OR cron auto-commit, currently OFF)
```

Three separate failure modes feed the drift ภูม sees vs PCS:

### Failure 1 — Stage 1 broken (today's hot fire)
Cron firing → 401 from MOMO API → write error to `momo_sync_logs` → no upsert. Nothing flows in. **Fix: restore the 2 env vars on Vercel. ~30 seconds.**

### Failure 2 — No match-by-tracking propagation (the architectural gap)
Even when Stage 1 works, sync only writes into the isolated `momo_*` tables. If a customer ALREADY has a `tb_forwarder` row with that tracking number (because they entered it manually before MOMO scanned it), nothing in the current pipeline updates that existing row. Customer sees `fstatus = 1` for days while MOMO says "ถึงไทย". This is the structural gap ภูม flagged for A2 (match-by-tracking propagation, greenlit).

### Failure 3 — /review only shows pending, not drift
The page filters `committed_at IS NULL` — i.e. "what hasn't been committed yet". It does NOT surface rows that DID commit but whose tb_forwarder counterpart now disagrees with MOMO (drift after commit). Admin can't see drift unless they query the DB manually.

## How to check "ไม่ตกหล่น" (the "ภูม's safety question")

What ภูม actually wants is a **MOMO health dashboard**. Right now there's none. Three concrete metrics it should show, on `/admin/api-forwarder-momo`:

1. **Sync freshness.** "Last successful cron sync: X minutes/hours ago" (red if > 30 min). Pulled from `momo_sync_logs.created_at` filtered by `status='success'`.
2. **Cron failure streak.** Number of consecutive FAILED runs since last success. If > 0 with the MOMO_NOT_CONFIGURED error → big banner: "MOMO API env vars missing — call ก๊อต".
3. **Drift count.** Number of `tb_forwarder` rows whose `ftrackingchn` matches a `momo_import_tracks.momo_tracking_no` where MOMO has the row "ถึงไทย/arrived" but `tb_forwarder.fstatus IN ('1','2','3')`. (Same heuristic the diagnosis script uses.) These are the "ตกหล่น" rows ภูม cares about.

## Recommended fix sequence

| # | What | Where | Who | ETA |
|---|---|---|---|---|
| 🔴 **P0** | Set `MOMO_API_BASE_URL` + `MOMO_API_TOKEN` (or `MOMO_JMF_BASE_URL` + `MOMO_JMF_TOKEN` aliases) in Vercel production env | Vercel project settings | ก๊อต / ภูม | 30s |
| 🟠 **P1** | Build "MOMO health" widget on `/admin/api-forwarder-momo` (3 metrics above) | new component + server-side query | Claude (Wave 30.6) | 2-3 h |
| 🟠 **P1** | Wire match-by-tracking propagation into `runMomoSync` — after Stage 1 upsert, for every uncommitted tracking that matches an existing `tb_forwarder.ftrackingchn`, UPDATE the matching forwarder with the MOMO-derived status + cabinet (A2, greenlit) | `lib/integrations/momo-isolated/sync.ts` | Claude (Wave 30.6) | 3-4 h |
| 🟡 **P2** | Alert when cron fails (Slack/LINE/email webhook) so silent failures surface within 10 min, not 5 hours | `lib/cron/instrument.ts` (add hook for "failed" status) | Claude | 1-2 h |
| 🟡 **P2** | Optional — enable `MOMO_CRON_AUTOCOMMIT=true` on Vercel after eyeballing /review for a week (Wave 30.5 already shipped the path, just gated by env) | Vercel env | ภูม | 30s after monitor |

## Dup-guard (ภูม's question 2.1) — answer = ✅

```sql
-- supabase/migrations/0116_momo_isolated_tables.sql (applied to prod)
-- (and migration 0119+ for the secondary keys)
CREATE UNIQUE INDEX ... ON momo_import_tracks(momo_tracking_no);
CREATE UNIQUE INDEX ... ON momo_container_closed(momo_container_no);
CREATE UNIQUE INDEX ... ON momo_sack_infos(momo_sack_no);
```

And the upsert calls:
```ts
admin.from("momo_import_tracks").upsert(upRows, { onConflict: "momo_tracking_no" });
admin.from("momo_container_closed").upsert(upRows, { onConflict: "momo_container_no" });
admin.from("momo_sack_infos").upsert(row,    { onConflict: "momo_sack_no" });
```

So if MOMO returns the same tracking number twice (within a sync OR across syncs), the second call **updates the existing row** with fresh status — it does NOT create a duplicate. Verified empirically: prod has 9 unique tracking strings out of 9 sampled rows; 0 dups.

## Cross-links

- `app/api/cron/momo-sync/route.ts` — the cron endpoint
- `lib/integrations/momo-isolated/sync.ts` — the orchestrator
- `app/[locale]/(admin)/admin/api-forwarder-momo/review/page.tsx` + `review-client.tsx` — the /review grid
- `supabase/migrations/0116_momo_isolated_tables.sql` + 0119-0122 — schema
- `docs/runbook/momo-cron-runbook.md` (TBD — should be written once env is restored)
