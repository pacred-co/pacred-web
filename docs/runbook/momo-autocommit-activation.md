# MOMO auto-commit — activation runbook

> **Status:** the code is shipped + safety-hardened. The feature is **OFF by
> default**. Flipping it ON is an owner action — follow this runbook end-to-end
> before turning the switch.
>
> **Last reviewed:** 2026-06-09 (Wave 30.7 — added user-company / duplicate /
> daily-cap / plausibility predicates + rejection-rate alert + LINE ping)

---

## Why this exists (the money-path risk)

When `MOMO_CRON_AUTOCOMMIT=true`, the cron at `app/api/cron/momo-sync/route.ts`
calls `autoCommitEligibleMomoRows` after every MOMO pull. That helper
**INSERTs rows into `tb_forwarder` unattended**, owned by the customer derived
from MOMO's `user_group` + `user_code`.

If the partner data is wrong:

- Wrong `user_code` → wrong customer billed (the forwarder row goes to the
  wrong PR account; the customer is later invoiced for cargo that isn't theirs).
- Wrong `user_group` → wrong company class (individual vs juristic) → wrong
  tax-invoice rules at billing time.
- Duplicate tracking landing twice → two `tb_forwarder` rows, both billable.
- A burst of mis-tagged rows → one customer gets dozens of mystery shipments
  on their dashboard.

The cron writes `ftotalprice=0` + `fcosttotalprice=0` so **no money is debited
at INSERT time** — but the row IS billable from the moment admin sets a price.
A wrong row that survives long enough to be priced = a wrong bill.

**The safety net** layers 4 defensive predicates on top of the original
user-code-must-exist check, and adds a per-run health alert. All live in
`lib/admin/auto-commit-momo-safety.ts` (pure functions, unit-tested in
`lib/admin/auto-commit-momo-safety.test.ts`).

---

## Pre-flip checklist (run for 7 days BEFORE flipping)

The point of the soak is to confirm MOMO data quality is high enough that
auto-commit won't bill the wrong customer. Do this with the cron still in
**pull-only** mode (`MOMO_CRON_AUTOCOMMIT` unset or `false`).

### Daily for 7 days

1. Open `/admin/api-forwarder-momo/review` — the manual-review queue
   (uncommitted MOMO rows).
2. Pick a random sample of **20 rows per day** (mix of `user_group` values).
3. For each row, eyeball:
   - **user_code → tb_users mapping correct?** Does the resolved `PR####`
     actually belong to the customer who would receive this shipment?
     (Cross-check against `raw.images[]` if MOMO captured a label photo —
     the human-written PR on the label is ground truth · see
     `docs/learnings/partner-apis-quirks.md` finding #1.)
   - **user_group matches?** "PR" → individual; "AIGA" → company. If the
     resolved tb_users row has `userCompany="1"` but `user_group="PR"` →
     mismatch · admin must NOT commit.
   - **Tracking already in tb_forwarder?** Check via the search box —
     if the same `ftrackingchn` appears with `fstatus > 0`, it's a duplicate
     · do NOT commit again.
   - **Plausible weight / cbm?** A single row at 15,000 kg or 300 cbm is
     partner unit-confusion · do NOT commit until partner re-sends.

### Pass criteria

| Metric | Target |
|---|---|
| User-code → tb_users mapping accuracy | **≥ 95 %** |
| User-group → userCompany matches | **100 %** (no mismatches in sample) |
| Duplicate tracking incidents | **0** |
| `$` / amount errors at later pricing step | **0** |
| Total sampled | **≥ 140 rows** (20/day × 7 days) |

If any metric misses → extend the soak by 7 days OR call MOMO to fix data
quality, then re-sample. **Do not flip the env until criteria are met.**

---

## How to flip ON

> ⚠️ Coordinate with ภูม before flipping — once on, every 10-min cron tick
> may auto-commit up to 100 rows. The Vercel deploy is instant but the next
> cron tick is up to 10 minutes away.

1. **Vercel Dashboard** → project `pacred-web` → Settings → Environment Variables.
2. Add or edit:
   - Key: `MOMO_CRON_AUTOCOMMIT`
   - Value: `true`
   - Environments: ☑ Production only (do not enable on Preview).
3. Redeploy the latest production deployment (or push any commit — auto-deploy).
4. Wait for the next cron tick (`*/10 * * * *`) — within 10 minutes the
   summary at `/admin/system/crons` will show `auto_commit_enabled: true`
   + non-zero counts.
5. Watch `/admin/api-forwarder-momo/review` — auto-committed rows disappear
   from the queue; non-eligible rows stay for manual review.
6. Spot-check **the first 5 auto-committed `tb_forwarder` rows** within the
   first hour (search for `adminid='momo-cron'`) — confirm customer + cabinet
   are correct.

---

## How to roll back FAST

If anything looks wrong (wrong customer · duplicate · burst of mis-tagged
rows · partner schema change):

1. **Vercel Dashboard** → Settings → Environment Variables → edit
   `MOMO_CRON_AUTOCOMMIT` → `false` (or delete the key).
2. Redeploy. The very next cron tick is back to pull-only.
3. **Existing auto-committed rows stay** — rolling back does NOT delete them.
   They live in `tb_forwarder` with `adminid='momo-cron'`.
4. If a row is provably wrong:
   - ภูม opens `/admin/forwarders/<fNo>` → "ยกเลิก" → row's `fstatus → 0`.
   - This frees the tracking-no so the next auto-commit (or a manual one)
     can land it under the correct customer.
   - For bulk mistakes, run a one-off SQL script via the migration ledger
     pattern (`dry-run` first, then `--apply`).
5. Post-mortem: `docs/learnings/<incident-name>.md` per `scholar-immortal`.

---

## What the safety net catches

Eight outcome codes (see `AutoCommitOutcome` in `lib/admin/auto-commit-momo.ts`).
Anything `skipped_*` stays at `/review` for human triage.

| Outcome | Predicate | Why we skip |
|---|---|---|
| `committed` | all checks pass | row inserted into `tb_forwarder` |
| `skipped_no_userid` | `user_group + user_code` empty | nothing to map |
| `skipped_unknown_user` | derived `PR####` not in `tb_users` | wrong account; partner mistag |
| `skipped_user_company_mismatch` | `user_group` class ≠ `tb_users.userCompany` class | tax-invoice rules diverge — needs human eyes |
| `skipped_duplicate_tracking` | tracking already in `tb_forwarder` with `fstatus > 0` | prevents double-billing |
| `skipped_daily_per_user_cap` | this customer already has 30 cron-committed rows today | suggests partner is bulk-mis-tagging to one user |
| `skipped_implausible_weight` | raw weight > 10,000 kg | unit confusion (kg vs g, decimal shift) |
| `skipped_implausible_volume` | raw cbm > 200 | same |
| `failed` | DB write threw | crash isolated to this row; cron continues |

---

## Monitoring

### `/admin/system/crons`

Every `momo-sync` cron run records a `cron_invocations` row with the summary.
Look for these fields:

- `auto_commit_enabled` — sanity check the flag is on.
- `auto_commit_scanned` — rows considered this tick.
- `auto_commit_succeeded` — rows landed in `tb_forwarder`.
- `auto_commit_skipped` — rows refused by a safety predicate.
- `auto_commit_failed` — rows that threw a DB error mid-commit.
- `auto_commit_rejection_rate` — `(skipped + failed) / scanned` (0..1).
- `auto_commit_alerted` — `true` when this run pinged the LINE staff group.

### Per-row details

The `result_summary` JSON of each `momo-sync` row dumps the per-row outcome
+ reason code. Use this to find which `momo_import_tracks.id` got skipped
and why — useful when a customer asks "ทำไมไม่มีแทรกกิ้ง X ใน dashboard ผม".

### LINE staff alert (auto-fires)

When `rejection_rate > 0.5` AND `scanned >= 10` in a single run, the cron
sends a Flex card to the staff group (`LINE_STAFF_GROUP_ID`) with a deep
link to `/admin/api-forwarder-momo/review`. The text reads:

```
⚠️ MOMO auto-commit rejection rate สูงผิดปกติ
รอบนี้ NN/MM rows ถูกข้าม (XX%)
ตรวจสอบ /admin/api-forwarder-momo/review เพื่อหาสาเหตุ
```

Best-effort — never fails the cron · no-op when `LINE_PUSH_BYPASS=true` or
the group/token env vars aren't set.

---

## When NOT to flip / when to flip OFF

- **Incident-day** — anything in the money-path is shaky (Supabase outage ·
  Vercel rolling deploy gone wrong · DB migration in flight). Keep manual
  review until ops sign off.
- **MOMO API change** — partner releases a new schema field or changes the
  meaning of `user_group`. Re-soak (the 7-day checklist) before re-enabling.
- **New partner onboarding** — a new MOMO sub-partner adds new
  `user_group` values our `checkUserGroupMatchesCompany` doesn't know
  about. Extend the predicate (add the group → company-class mapping) +
  test BEFORE enabling auto-commit for that source.
- **Sustained alert** — if `auto_commit_alerted` fires on more than 2 cron
  runs in any hour, flip OFF + investigate at `/review` before re-enabling.

---

## Code map

- `lib/admin/auto-commit-momo.ts` — orchestrator (batch fetch → per-row
  evaluate → commit · the consumer of the safety predicates).
- `lib/admin/auto-commit-momo-safety.ts` — pure predicates (testable;
  no `server-only` import).
- `lib/admin/auto-commit-momo-safety.test.ts` — 58 unit assertions.
- `lib/admin/commit-momo-row-core.ts` — the auth-agnostic 51-column
  `tb_forwarder` INSERT (`commitMomoRowSystem` is the cron entry point).
- `app/api/cron/momo-sync/route.ts` — the gated caller
  (`MOMO_CRON_AUTOCOMMIT === "true"` check at L104).
- `lib/notifications/staff-group.ts` — the LINE-push helper.

---

## Quick env reference

| Env var | Default | Effect |
|---|---|---|
| `MOMO_CRON_AUTOCOMMIT` | unset / `false` | pull-only · admin commits manually at `/review` |
| `MOMO_CRON_AUTOCOMMIT=true` | (Vercel prod) | cron auto-commits eligible rows |
| `LINE_STAFF_GROUP_ID` | unset | LINE alerts skipped (no-op) |
| `LINE_PUSH_BYPASS=true` | unset | also skips LINE alerts (dev safety) |
