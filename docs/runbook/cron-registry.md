# 🕒 Vercel Cron Registry

**Last updated:** 2026-05-16 evening
**Source of truth:** [`vercel.json`](../../vercel.json) `"crons"` array
**Pre-flight check:** `jq '.crons | length' vercel.json` — must be ≤ Vercel plan limit

> **Plan limit:** Hobby = 2 crons + 24h min interval · Pro ($20/mo) = 100 crons + any schedule · see [`vercel-cron-plan.md`](vercel-cron-plan.md) for full plan analysis.

---

## Active cron routes (in vercel.json — 5)

| Path | Schedule (UTC) | Schedule (ICT) | Purpose | Source |
|---|---|---|---|---|
| `/api/cron/auto-cancel-orders` | `*/15 * * * *` | every 15 min | Sweep `service_orders` where `status='awaiting_payment' AND payment_due_at < now()` → flip to `cancelled`. Mirrors PHP legacy auto-cancel of orders past the 24h payment window. | P-Phase E E6 |
| `/api/cron/expire-driver-assignments` | `0 * * * *` | every hour | Sweep `forwarder_driver` where `status=1 (assigned) AND fd_date < now()-17h` → flip to `status=3 (expired)`. Driver had 17h to accept job; auto-release after timeout. | P-18 |
| `/api/cron/refresh-active-customers` | `0 1 * * *` | 08:00 daily | Recompute `profiles.is_active` based on activity (orders placed, wallet activity in last N days). | legacy `api/autorun/update-active-customers` |
| `/api/cron/expire-probation` | `0 2 * * *` | 09:00 daily | HR module — sweep employees whose probation date passed → flag for review. | HR module spec |
| `/api/cron/sales-daily-digest` | `5 17 * * *` | 00:05 daily ICT (next day) | Aggregate yesterday's paid sales totals across 3 streams (shop-order/forwarder/yuan), build LINE-pastable message, dispatch via `sendNotification` to admins opted-in (`notify_channels.daily_digest=true`). | chat W-1 mirror |

**Cron count: 5 (Hobby max 2 — Pacred MUST be on Pro plan)**

---

## Scaffolded but NOT yet in vercel.json (1)

| Path | Proposed schedule (UTC) | Purpose | Status | Action |
|---|---|---|---|---|
| `/api/cron/sms-balance-check` | `0 23 * * *` (= 06:00 ICT) | Daily ThaiBulkSMS balance check; alert admins (`notify_channels.sms_balance_alert=true`) when balance < `SMS_LOW_THRESHOLD` (default 100). Closes chat L-3 silent OTP credit depletion. | 🟡 code shipped (commit `f5f357e`); not in `vercel.json` yet | เดฟ confirms Pro plan + ก๊อต confirms ThaiBulkSMS balance endpoint URL → then add to vercel.json |

When ready, append to `vercel.json`:
```json
{
  "path": "/api/cron/sms-balance-check",
  "schedule": "0 23 * * *"
}
```
This would bring active count to **6** — still under Pro plan's 100 limit.

---

## Auth pattern (all 6 follow this)

Every cron route accepts either:
1. **Vercel cron header** — `x-vercel-cron: 1` (set automatically by Vercel's scheduler)
2. **Bearer CRON_SECRET** — for manual testing or external schedulers

```ts
const isProd     = process.env.NODE_ENV === "production";
const vercelCron = request.headers.get("x-vercel-cron") === "1";
const authHeader = request.headers.get("authorization");
const secret     = process.env.CRON_SECRET;
const bearerOk   = !!secret && authHeader === `Bearer ${secret}`;

if (isProd && !vercelCron && !bearerOk) {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
```

In dev, auth check is skipped so you can curl/test freely.

---

## Manual test (any environment)

```bash
# Local dev — auth check is off, just call:
curl http://localhost:3000/api/cron/auto-cancel-orders

# Staging/prod — with CRON_SECRET:
curl https://pacred.co/api/cron/auto-cancel-orders \
  -H "Authorization: Bearer ${CRON_SECRET}"

# Check Vercel-cron schedule confirmation (Vercel dashboard):
#   Project → Settings → Cron Jobs → see registered crons
```

---

## Adding a new cron — checklist

1. Create route handler at `app/api/cron/<name>/route.ts`
2. Copy auth pattern from any existing cron (`sales-daily-digest` is the most-complete reference)
3. Implement business logic + `logger.info(...)` for observability
4. Add entry to `vercel.json` `"crons"` array
5. **Verify cron count is still under Pacred Vercel plan limit** (`jq '.crons | length' vercel.json`)
6. Update THIS file with the new entry
7. (Optional) add Sentry / LINE alert for cron failure (when DV-1 Sentry ready)
8. Deploy → wait 1 cycle → verify in Vercel dashboard the cron registered + first-run succeeded

---

## Cross-links

- [`vercel-cron-plan.md`](vercel-cron-plan.md) — Vercel plan limits + Pacred footprint analysis
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part U U1-2 — SMS balance check action item
- [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) L-3 — silent OTP fail context
- Vercel Cron docs: https://vercel.com/docs/cron-jobs
