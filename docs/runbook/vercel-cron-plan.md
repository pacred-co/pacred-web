# Vercel cron — plan limits + Pacred footprint

**Last updated:** 2026-05-15 (P-vercel-plan, ภูม)
**Action needed:** เดฟ confirm Pacred uses Vercel **Pro** plan (not Hobby).

## Pacred current cron footprint (`vercel.json`)

| Path | Schedule | Cron expr | Frequency |
|---|---|---|---|
| `/api/cron/auto-cancel-orders` | every 15 min | `*/15 * * * *` | 96/day |
| `/api/cron/sales-daily-digest` | 17:05 daily | `5 17 * * *` | 1/day |
| `/api/cron/refresh-active-customers` | 01:00 daily | `0 1 * * *` | 1/day |
| `/api/cron/expire-probation` | 02:00 daily | `0 2 * * *` | 1/day |
| `/api/cron/expire-driver-assignments` | hourly | `0 * * * *` | 24/day |

**Total: 5 cron jobs, ~123 invocations/day.**

## Vercel plan limits (per [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs))

| Plan | Concurrent crons | Frequency |
|---|---|---|
| **Hobby (free)** | 2 cron jobs | min interval 24h (= once per day each) |
| **Pro ($20/user/mo)** | 100 cron jobs | min interval **none** (any cron expr OK) |
| **Enterprise** | unlimited | none |

## Diagnosis

**Pacred has 5 cron jobs.**  Hobby allows **2**.  If Pacred ends up on Hobby:
- Vercel **silently drops** crons #3-5 (no error in deploy logs in some cases)
- Even crons #1-2 cap to once per day — `auto-cancel-orders` (intended every 15min) would only run once/day → orders sit pending in `awaiting_payment` for up to 24h before sweep, breaking the SLA we promise customers

**Action items:**

- [ ] **เดฟ:** confirm Vercel project plan in Vercel dashboard → Project → Settings → General → Plan
- [ ] If on Hobby:
  - **Option 1 (preferred):** Upgrade to Pro ($20/mo) — covers all 5 crons + future room
  - **Option 2 (no upgrade):** Consolidate 5 → 2 crons:
    - Combine all daily 1/day crons into `/api/cron/daily-batch` (digest + active-customers + probation expire) at 02:00
    - Combine `auto-cancel-orders` + `expire-driver-assignments` into one hourly `/api/cron/hourly-batch` (auto-cancel runs every 4 ticks = effective 4h interval — degraded SLA)
- [ ] If on Pro: ✅ no action; we have headroom for ~95 more crons before hitting limit

## Pre-flight check before next deploy

```bash
# Local sanity (count entries):
jq '.crons | length' vercel.json
# Returns 5; must be ≤ plan limit
```

## References

- Vercel Cron docs: https://vercel.com/docs/cron-jobs
- Vercel pricing: https://vercel.com/pricing
- Pacred crons added in: commits `e440a31` (sales-daily-digest), `0479949` (expire-probation), `8bd04b7` (expire-driver-assignments), plus 2 pre-existing
