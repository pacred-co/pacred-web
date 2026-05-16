# Vercel cron — plan limits + Pacred footprint

**Last updated:** 2026-05-17 (เดฟ — Pro plan confirmed)
**Status:** ✅ RESOLVED — Pacred is on Vercel **Pro**. All 6 crons wired + within limit.

## Pacred current cron footprint (`vercel.json`)

| Path | Schedule | Cron expr | Frequency |
|---|---|---|---|
| `/api/cron/auto-cancel-orders` | every 15 min | `*/15 * * * *` | 96/day |
| `/api/cron/sales-daily-digest` | 17:05 daily | `5 17 * * *` | 1/day |
| `/api/cron/refresh-active-customers` | 01:00 daily | `0 1 * * *` | 1/day |
| `/api/cron/expire-probation` | 02:00 daily | `0 2 * * *` | 1/day |
| `/api/cron/expire-driver-assignments` | hourly | `0 * * * *` | 24/day |
| `/api/cron/sms-balance-check` | 06:00 ICT daily | `0 23 * * *` | 1/day |

**Total: 6 cron jobs, ~124 invocations/day.** Well within the Pro 100-cron ceiling.

## Vercel plan limits (per [Vercel Cron Jobs docs](https://vercel.com/docs/cron-jobs))

| Plan | Concurrent crons | Frequency |
|---|---|---|
| **Hobby (free)** | 2 cron jobs | min interval 24h (= once per day each) |
| **Pro ($20/user/mo)** | 100 cron jobs | min interval **none** (any cron expr OK) |
| **Enterprise** | unlimited | none |

## Diagnosis — ✅ resolved 2026-05-17

**Pacred is on Vercel Pro** (เดฟ confirmed 2026-05-17). The Pro ceiling is 100
concurrent crons at any frequency. Pacred runs **6** → ~94 crons of headroom.
No consolidation needed — every cron runs at its true schedule, so
`auto-cancel-orders` keeps sweeping every 15 min and the `awaiting_payment`
SLA stays tight.

**Action items — all done:**

- [x] **เดฟ** confirmed Vercel project plan = **Pro** (2026-05-17)
- [x] `sms-balance-check` wired into `vercel.json` (cron #6, `0 23 * * *` = 06:00 ICT)
- [x] No Hobby consolidation needed — Pro covers all 6 + headroom

> **If the project is ever downgraded to Hobby:** 6 crons > the 2-cron Hobby
> limit → Vercel would silently drop crons #3-6 + cap the rest to once/day.
> The fix would be to consolidate: fold the 4 daily crons into one
> `/api/cron/daily-batch` + the 2 sub-daily (`auto-cancel-orders` +
> `expire-driver-assignments`) into one `/api/cron/hourly-batch`. **Not needed
> while on Pro** — documented here only as the downgrade contingency.

## Pre-flight check before next deploy

```bash
# Local sanity (count entries):
jq '.crons | length' vercel.json
# Returns 6; must be ≤ 100 (Pro plan limit)
```

## References

- Vercel Cron docs: https://vercel.com/docs/cron-jobs
- Vercel pricing: https://vercel.com/pricing
- Pacred crons added in: commits `e440a31` (sales-daily-digest), `0479949` (expire-probation), `8bd04b7` (expire-driver-assignments), plus 2 pre-existing
