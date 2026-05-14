# `OTP_PEPPER` rotation runbook

Last reviewed: 2026-05-16

> Source decision: OWASP audit 2026-05-16 (`docs/audit/owasp-2026-05.md` A02
> P1 recommendation). Codifies a quarterly + on-incident rotation cadence
> so the pepper doesn't sit forever in a single shared secret.

---

## What `OTP_PEPPER` does

`actions/otp.ts` hashes every OTP code as `sha256(code + OTP_PEPPER)`
before storing in the `otp_codes` table. The pepper is server-only —
attackers who exfiltrate the DB still need the running env to brute-force
codes, and codes expire in 5 minutes anyway.

If the pepper leaks (committed to git accidentally, copy-pasted into a
support ticket, etc.), any captured DB snapshot becomes brute-forceable
within the OTP TTL window. **Rotation limits the blast radius.**

---

## Cadence

| Trigger | Action |
|---|---|
| **Quarterly** (Mar 1, Jun 1, Sep 1, Dec 1) | Routine rotation — even with no incident |
| **Incident** — pepper suspected leaked (commit, ticket, screen-share) | Immediate rotation; rotate within 1 hour |
| **Hire churn** — anyone with prod env access leaves the team | Within 24 hours of departure |
| **Vercel project ownership transfer** | Before transfer completes |

Quarterly dates are calendar-locked so missing a rotation is visible
(the runbook should match the env's last-rotated stamp; see "Verification" below).

---

## Procedure (dual-pepper accept window)

OTP codes have a 5-minute TTL. A naïve cutover (single secret swap) would
invalidate every in-flight code at the rotation instant, breaking customers
mid-OTP. To avoid that, we run a **dual-pepper accept window**:

### Step 1 — Generate the new pepper

```bash
openssl rand -hex 32
# Example output: 9f1c8a2e0b4d... (64 hex chars)
```

Save it locally (1Password / Bitwarden / `pass`) labelled `OTP_PEPPER YYYY-MM`.

### Step 2 — Stage as `OTP_PEPPER_NEXT`

In Vercel → Project → Settings → Environment Variables (Production env):

- Add new var `OTP_PEPPER_NEXT` = the new value.
- Keep `OTP_PEPPER` = old value.

Redeploy. Server now accepts codes hashed under EITHER pepper (per
`actions/otp.ts::verifyOtp` — if the `OTP_PEPPER_NEXT` env is present,
it tries both hashes).

> **NOTE (impl prerequisite):** `actions/otp.ts::verifyOtp` must be
> extended to read `OTP_PEPPER_NEXT` and try both hashes. As of
> 2026-05-16 this is NOT yet implemented. Track as `actions/otp.ts`
> follow-up before the first rotation. The current code uses only
> `OTP_PEPPER`. ADR-style proposal:
> ```ts
> const peppers = [process.env.OTP_PEPPER, process.env.OTP_PEPPER_NEXT].filter(Boolean) as string[];
> const candidates = peppers.map(p => sha256(input.code + p));
> if (!candidates.includes(row.code_hash)) return { ok: false, error: "invalid_otp" };
> ```

### Step 3 — Wait the TTL window

Wait at least **1 hour** (12× OTP TTL). All codes issued under the old
pepper expire; new codes minted use whichever pepper is the "primary"
(see step 4).

### Step 4 — Promote new pepper to primary

In Vercel env:
- Set `OTP_PEPPER` = new value (was in `OTP_PEPPER_NEXT`)
- **Delete** `OTP_PEPPER_NEXT`

Redeploy. From here on, `actions/otp.ts::requestOtp` hashes new codes
under the new pepper, and `verifyOtp` accepts only the new pepper
(since `OTP_PEPPER_NEXT` is gone).

### Step 5 — Verify

- Run a smoke OTP flow end-to-end in production (request OTP on a test
  number, receive SMS, enter code, confirm signup).
- Update this runbook's "Last rotated" stamp below.

### Step 6 — Burn the old pepper

- Delete from password manager (one-month grace period is fine; after
  that, treat as fully destroyed).
- If the rotation was incident-driven, also rotate `SUPABASE_SERVICE_ROLE_KEY`,
  `SENTRY_AUTH_TOKEN`, and any other secrets that may have been seen
  alongside the leaked `OTP_PEPPER`.

---

## Rollback

If step 4 (the cutover) breaks production OTP unexpectedly:

1. Restore `OTP_PEPPER_NEXT` = the new pepper, `OTP_PEPPER` = old pepper.
2. Redeploy — back to dual-accept mode.
3. Investigate the discrepancy (likely a corrupted hash row in `otp_codes`
   that didn't expire — manually mark `used=true` for affected rows).
4. Resume from step 2 after diagnosis.

---

## Verification (independent of the runbook)

Two cheap signals that rotation is current:

1. **Vercel env var "last modified" timestamp** on `OTP_PEPPER` — should
   be within the last 90 days. Vercel surfaces this in the env settings
   page.
2. **DB age of oldest unused OTP** — `select max(now() - created_at)
   from otp_codes where used = false and expires_at > now()` — should
   be < 5 minutes (the TTL). If this is older, the pepper was probably
   rotated mid-window and some codes got orphaned; benign but worth
   investigating.

---

## Last rotated

| Date | Initiator | Reason | Notes |
|---|---|---|---|
| (initial value set 2026-05-XX by เดฟ) | เดฟ | initial deployment | Pre-launch placeholder; rotate before first real customer signs up |

Append a row here after every rotation.

---

## Future improvement — automated rotation

Manual rotation is fine for the first ~2 years of Pacred. Once we have
10+ active deployments per quarter (preview branches included), consider:

- Vercel cron at first-day-of-quarter that calls a route handler with
  `Authorization: Bearer ${CRON_SECRET}` to flip the env via the Vercel API
- Slack notification to the team channel on rotation success
- Sentry alert if rotation fails or skips a quarter

Track as a `K-sec-5` ADR if Pacred scales there.

---

## References

- OWASP audit 2026-05-16 — `docs/audit/owasp-2026-05.md` A02 P1 recommendation
- `actions/otp.ts` — current single-pepper implementation
- `docs/env.md` §3 — `OTP_PEPPER` documentation
- ADR-0001 — LINE Notify replacement (OTP context)
