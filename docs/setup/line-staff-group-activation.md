# 🔔 LINE staff-group notify — activation (P1-24) · ✅ groupId RESOLVED

**Status (2026-06-01, เดฟ · verified live):** the real staff `groupId` is **found + push-tested 200**.
Code (`lib/notifications/staff-group.ts → notifyStaffGroup()`) is wired into both yuan-create paths
and fires with **zero code change** the moment the prod env below is set.

> Owner directive that shaped this: *"ดูการทำงานของ webhook ที่ปอน set ไว้ แล้วเราพัฒนาต่อยอด …
> อย่าไปปิดกั้นน้อง"* — and that's exactly how it resolved: **ปอน's Worker had already captured the
> groupId into Supabase; we just READ his data. No deploy, no edit to his Worker, zero collision.**

---

## ✅ THE ANSWER

```
LINE_STAFF_GROUP_ID = C09344be50f51abbfb8ca9fddb24e10f9     # "SA-MKT-PR Pacred" (staff group)
LINE_PUSH_BYPASS    = false                                 # Production scope
```

**Owner action (Vercel · the only step left):**
1. Vercel → Pacred app → Settings → Environment Variables (**Production** scope):
   - set `LINE_STAFF_GROUP_ID` = `C09344be50f51abbfb8ca9fddb24e10f9` (replaces the wrong `C61f…`)
   - set `LINE_PUSH_BYPASS` = `false`
2. Redeploy (or wait for next auto-deploy). Done — staff group starts getting "มีรายการฝากชำระใหม่ …" pings.

`.env.local` (this machine) already has the correct groupId · **kept `LINE_PUSH_BYPASS=true` for dev**
so local/dev never spams the real staff group.

---

## 🔬 How it was resolved (verified live · ไม่เดา)

1. **`C61f60d763a766e4f391812381281e3d9` (ID จาก URL chat.line.biz) → HTTP 404** from Messaging API —
   it's an OA-Manager chat-thread id, **NOT a pushable groupId**. (That's what was in prod env = wrong.)
2. Real `groupId` only arrives via webhook event → those go to **ปอน's Cloudflare Worker**
   `podenglineworker` (account `natmeena8@gmail` · `d06e3038…`).
3. Read ปอน's Worker source (via CF API token, owner-provided): it writes every event to
   **`Podeng_line_webhook_events`** (raw_payload, stored first) + `Podeng_customers_line` +
   `Podeng_line_messages`. **NB — these are `Podeng_`-prefixed tables, NOT** the `line_*` tables from
   migration 0131 (those are unused, 0 rows — a schema divergence to reconcile later).
4. Queried `Podeng_line_webhook_events` (269 rows) → **3 groups the bot is in**, all push-valid (200):

   | groupId | LINE groupName | members (API, excl. bot) | = |
   |---|---|---|---|
   | **`C09344be50f51abbfb8ca9fddb24e10f9`** | **SA-MKT-PR Pacred** | **14** (+bot = 15) | ✅ **staff group** |
   | `C3940c340d1f5fc20c0740da103bf3286` | คุณมอส Roofbox | 5 | customer group |
   | `C4101eac2a7d497afbe00a4c80e106b2e` | ส่งออกเนปาลเครื่องตัดหญ้า | 6 | customer group |

5. **2-way confirm it's the staff group:** (a) `C09344…` arrived via a **`memberJoined`** event at
   `2026-05-31 16:23Z` = **23:23 น. ไทย** = exactly matches the owner's screenshot of staff joining
   "SA PACRED(15)" at 23.22 น.; (b) API member count **14 + bot = 15** = the "(15)" in the screenshot.
6. **Test push → HTTP 200** (`sentMessages` id returned) — message landed in the staff group. End-to-end proven.

> Re-test any candidate: `TOKEN=$(grep ^LINE_CHANNEL_ACCESS_TOKEN= .env.local | sed -E 's/^[^=]+=//; s/"//g'); curl -s -w " [%{http_code}]" -H "Authorization: Bearer $TOKEN" https://api.line.me/v2/bot/group/<id>/summary` — 200 + name = pushable.

---

## 🏗 ปอน's architecture (สำรวจแล้ว · เคารพ lane เขา — ห้าม repoint/rewrite)
- **Inbound:** LINE → ปอน's Cloudflare Worker `podenglineworker` (ES-module · HMAC-SHA256 verify ·
  writes `Podeng_*` tables · observability+logs persisted). Bindings: `LINE_CHANNEL_ACCESS_TOKEN`,
  `LINE_CHANNEL_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (secrets) + `SUPABASE_URL` (plain).
- **Outbound (push):** Pacred app calls `api.line.me/v2/bot/message/push` directly with the token —
  independent of the webhook → push works even though the webhook lives on ปอน's Worker. ✅

---

## 💡 Findings / ต่อยอด opportunities (analysis — not yet implemented · ปอน lane)
1. **Schema divergence:** Worker → `Podeng_*` tables; our migration 0131 → parallel `line_*` tables (0 rows, unused). Reconcile to one set (ปอน + เดฟ) so the app's LINE-inbox surfaces read the live data.
2. **App could read `Podeng_*`** for a staff LINE-inbox / customer-LINE analytics dashboard (data's already there: 52 customers · 212 messages). Optional fan-out into OUR route is then unnecessary.
3. **`facebookcrmchat` Worker** exists on the same account — a FB CRM channel ปอน built (separate follow-up).
4. **Security note (low-urgency):** the company's `SUPABASE_SERVICE_ROLE_KEY` is bound on a **personal**
   Cloudflare account (`natmeena8@gmail`). For "managing Cloudflare properly", consider moving
   `podenglineworker` to the Pacred company account (`9e3147e5…`) + rotating that key. Owner call.
5. **CF API token** used here = read-only-in-effect (no deploy was needed). **Owner can Revoke it now**
   (My Profile → API Tokens). I never committed it; it's only in a machine-local temp file.
