# 📡 LINE / comms ecosystem — analysis + ต่อยอด strategy (2026-06-01 · เดฟ)

Written after gaining Cloudflare + Vercel API access (owner-provided) and reading ปอน's live
infrastructure end-to-end. This is the "วิเคราะห์กลยุทธ์" the owner asked for — what exists, what's
the gap, and the prioritized build-on-top roadmap.

---

## 🗺 What actually exists (mapped from source, not guessed)

| Piece | Owner | Where | State |
|---|---|---|---|
| **LINE OA push (outbound)** | เดฟ/Pacred | `lib/notifications/*` → `api.line.me/.../push` | ✅ live · token `@pacred` · staff-notify now wired (P1-24) |
| **LINE webhook (inbound)** | ปอน | Cloudflare Worker `podenglineworker` (acct natmeena8@gmail) | ✅ live · HMAC-verified · writes `Podeng_*` Supabase tables |
| **LINE customer data** | ปอน | `Podeng_customers_line` (52) · `Podeng_line_messages` (212) · `Podeng_line_webhook_events` (269) | ✅ collecting · **but app never read it until now** |
| **LINE inbox dashboard** | เดฟ | `/admin/line-inbox` (this session) | 🟡 building — surfaces ปอน's data in admin |
| **LIFF link** | ปอน | `actions/line-settings.ts` · `/liff/link` | ✅ customer links line_user_id → profiles |
| **FB CRM chat** | ปอน | Cloudflare Worker `facebookcrmchat` (same acct) | ⬜ exists · unexplored · likely a parallel FB-inbound pipeline |
| **Migration 0131 `line_*` tables** | ปอน(?) | Supabase | ⚪ created but **0 rows** — superseded by `Podeng_*` · dead schema |

**Key insight:** the inbound pipeline is **excellent and already running** (ปอน built it well — HMAC verify,
race-safe upserts, raw-event audit trail, profile enrichment). The gap was purely that **the Pacred app
never consumed that data**. So the highest-leverage ต่อยอด = *read + act on* ปอน's data, not rebuild it.

---

## 🔌 The integration seam (build-on-top, don't replace)
```
LINE  ──(webhook)──▶  ปอน Worker  ──▶  Supabase Podeng_*  ◀──(read)──  Pacred app  ──(push)──▶  LINE
                       (inbound · ปอน lane)                              (admin UI + notify · เดฟ lane)
```
- Outbound (push) is fully ours + independent of the webhook → we can notify freely.
- Inbound is ปอน's Worker → we **read** `Podeng_*` (shared Supabase, service-role). No need to touch his Worker.
- Optional future: ปอน adds a best-effort fan-out to our `/api/webhooks/line` for real-time (today we poll the table). Not needed yet.

---

## 🚀 ต่อยอด roadmap (prioritized)

**Wave 1 — this session (shipping):**
1. ✅ Staff-notify live (P1-24) — groupId resolved + Flex cards + deep-links.
2. 🟡 LINE inbox dashboard `/admin/line-inbox` — read `Podeng_*`, show customers + threads + stats.

**Wave 2 — high value, low risk (next):**
3. **Admin reply-from-inbox** — let staff reply to a LINE customer from `/admin/line-inbox` via OA push
   (we already have push). Closes the loop: read + reply in one place. (~medium · เดฟ + coord ปอน on `agent_id`/`direction` write-back.)
4. **Link LINE customer ↔ Pacred member** — match `Podeng_customers_line.line_user_id` to `profiles.line_user_id`
   (LIFF already links some) → show member code / orders next to the LINE chat. (~small · pure read/join.)
5. **Lead attribution** — `Podeng_line_messages` + `line_lead_sources` (add-friend URL → channel) → which ad/source
   drove each LINE lead → a marketing dashboard. (Data's there; ~medium.)

**Wave 3 — broader:**
6. **FB CRM** — explore `facebookcrmchat` Worker → unify FB + LINE into one admin inbox. (~larger · coord ปอน.)
7. **Schema reconcile** — drop/merge the dead `line_*` (0131) vs live `Podeng_*`. Decide one naming. (cleanup · ปอน lane.)
8. **Notify breadth** — extend Flex deep-link pings to more events (shop order, refund request, withdraw) — same `notifyStaffGroup(text, {url})` pattern, just add call sites.

---

## ⚠️ Findings to action (from this session)
- **Prod env gaps fixed:** 5 china-search vendor vars (LAONET/AKUCARGO/TAMIT) were missing from Vercel prod →
  reverse-image search / china search / tracking were broken in prod → **added** (see `docs/runbook/env-inventory.md`).
- **Held for owner:** `NEXT_PUBLIC_YUAN_RATE` (price-sensitive · confirm value) · `MOMO_TOKEN` (verify prod usage).
- **OTP_BYPASS / OTP_PEPPER** — untouched (owner: ห้ามแตะจนคอนเฟิม).
- **Tokens** (CF + Vercel) owner-provided · machine-local · never committed · revocable.

> Lane rule honored throughout (owner: ต่อยอด ไม่ปิดกั้นน้อง): we READ ปอน's data + ADD admin surfaces;
> we do NOT repoint his webhook, rewrite his Worker, or move his Cloudflare account.
