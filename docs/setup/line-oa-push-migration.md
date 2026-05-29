# LINE OA push — STATUS + final setup

> **Status as of 2026-05-30 night:** Pacred's LINE push infrastructure is **already fully wired**. ภูม just shared the channel access token tonight; it was already in `.env.local` (ก๊อต set it 2026-05-18). Token verified working — pushes to "Pacred Shipping" (@pacred · `U6944beabcce5b64b2585789d976ca406`) succeed.
>
> **3 things left** before customers receive real LINE pushes:
> 1. Add LINE env vars to Vercel prod environment (5 min)
> 2. Set `LINE_PUSH_BYPASS=false` on Vercel prod ONLY (keep `true` in dev — protects test admins from spamming real customers)
> 3. Upgrade LINE OA quota plan (FREE = 300 msg/mo · Pacred needs Light 5,000 or Standard 25,000)

## What's already wired (no code changes needed)

### 1. Channel credentials in `.env.local` ✅
```bash
LINE_CHANNEL_ID=2009931373                # Pacred Shipping channel
LINE_CHANNEL_SECRET=51b428ebc490190e35660bfc816dc30a
LINE_CHANNEL_ACCESS_TOKEN=1qxyUSxktneCrpJ3UTH...  # long-lived token (170 chars)
LINE_PUSH_BYPASS=true                       # dev safety · keep true locally
```

### 2. Push helper `sendLinePush()` in `lib/notifications/index.ts:125` ✅
- POSTs to `https://api.line.me/v2/bot/message/push`
- Reads `LINE_CHANNEL_ACCESS_TOKEN` from env
- Recipient: `profiles.line_user_id` (set via LIFF link flow)
- Sends `text` message with title + body + optional link
- Returns boolean · caller marks `delivered_line_at` in `notifications` table

### 3. LIFF link flow `app/[locale]/liff/link/page.tsx` ✅
- Customer clicks "ลิงค์ LINE" inside Pacred → opens LIFF page
- LIFF returns the customer's LINE `userId` (33-char `U...` string)
- Server action saves to `profiles.line_user_id` for that Pacred customer
- One-time setup per customer · works on web + LINE in-app browser

### 4. `/line-settings` channel preference page ✅
- Customer can toggle ON/OFF for LINE / email channels
- Stored in `profiles.notify_channels` JSON column

### 5. Token verified working (probe 2026-05-30 night) ✅
```
GET https://api.line.me/v2/bot/info
HTTP 200
basicId = @683wolja
displayName = Pacred Shipping
premiumId = @pacred
chatMode = chat
Quota: 300 msg/month (FREE tier · ⚠️ UPGRADE NEEDED)
Used: 0
```

## What's NOT wired (and what they mean)

### Webhook URL
- LINE Developers Console → webhook URL is **ปอน's Cloudflare Worker** (`https://podenglineworker.natmeena8.workers.dev`)
- This handles INBOUND events (customer adds OA · sends message · unfollows)
- Pacred's PUSH direction does NOT use this — push works regardless of webhook
- If ปอน's worker forwards `follow` events to Pacred's DB (saving `line_user_id` automatically), great. If not, Pacred relies on the LIFF link flow above (customer-initiated)
- ✅ **No Pacred webhook route exists** at `app/api/webhooks/line-oa/route.ts` — not needed for push · the LIFF flow + ปอน's worker cover the inbound side

### LINE Notify
- Pacred does NOT use LINE Notify anywhere · the old `tb_users.userLineNotify` column was for legacy PCS reference only
- No code to remove · clean slate

## 3 things ภูม needs to do (when ready · home computer is fine)

### Step 1 — Add LINE env vars to Vercel prod (5 min)

Open https://vercel.com/pacred-co/pacred-web/settings/environment-variables

Add these 4 vars (Production + Preview + Development scope on all):

| Key | Value |
|---|---|
| `LINE_CHANNEL_ID` | `2009931373` |
| `LINE_CHANNEL_SECRET` | (the secret from `.env.local`) |
| `LINE_CHANNEL_ACCESS_TOKEN` | (the long token from `.env.local`) |
| `LINE_PUSH_BYPASS` | `false` (**production-only flip** · dev stays `true`) |

**⚠️ For `LINE_PUSH_BYPASS`:** check Production scope only · DO NOT check Preview/Development (otherwise PR previews and local dev would send real pushes). Add ANOTHER row of the same key with value `true` and Preview+Development scope.

Or simpler: don't add LINE_PUSH_BYPASS at all (default behavior is bypass=true) · just set `LINE_PUSH_BYPASS=false` for Production only.

Next deploy picks up the new vars automatically.

### Step 2 — Upgrade LINE OA quota plan (THIS WEEK · before launch)

FREE tier = 300 messages/month. Pacred has ~8,898 customers · easily hit this in a day at launch.

Open LINE OA Manager (https://manager.line.biz/) → **Pacred Shipping** channel → **Plan / プラン**:

| Plan | Messages/month | Approx. cost |
|---|---|---|
| Free (current) | 300 | ฿0 |
| **Light** | 5,000 | **~฿500/mo** ← good for soft-launch |
| **Standard** | 25,000 | **~฿1,500/mo** ← good for hard-launch + scaling |
| Premium | 200,000 | ~฿8,000/mo |

ภูม's recommendation: **Standard** if doing hard-launch · **Light** if doing soft-launch (50-100 beta first).

Upgrade is monthly · can downgrade any time.

### Step 3 — Verify after deploy

After Vercel redeploys:
1. Open `/profile` for a customer that has linked their LINE userId via LIFF
2. Trigger a notification (e.g., admin updates the customer's forwarder status)
3. Customer should receive a LINE message from Pacred Shipping OA within 1-2 seconds
4. Check `notifications.delivered_line_at` is populated for that row
5. Check LINE OA Manager quota dashboard shows usage incrementing

If push fails:
- Error log on Vercel: search for "LINE push failed" — shows the LINE API error code
- Common: `403 The user has not added the bot as a friend yet` → customer needs to add Pacred Shipping OA (via `https://lin.ee/Yg3fU0I` link)
- Common: `401 Invalid signature` → token in Vercel env doesn't match LINE Developers Console → re-issue

## How the push flow actually works (for understanding)

```
Admin action (e.g., update forwarder status to ส่งแล้ว)
       │
       ▼
Server Action calls sendNotification(profileId, { title, body, link_href })
       │
       ▼
1. INSERT row into `notifications` (append-only log)
       │
       ▼
2. Look up `profiles.line_user_id` for this customer
       │
       ├── Empty (customer never linked via LIFF) → skip LINE · try email fallback
       │
       └── Set (e.g., `Uabc...123`) → POST to api.line.me with channel token
              │
              ├── Customer receives LINE bubble from Pacred Shipping
              └── notifications.delivered_line_at = NOW()
```

## Monitoring after launch

- **LINE OA Manager** → quota usage · subscribers · delivery rate
- **Vercel logs** → search for "LINE push" — see success/fail rate
- **Pacred DB** → `SELECT COUNT(*) FROM notifications WHERE delivered_line_at IS NULL AND created_at > now() - interval '1 hour'` = recent push failures

## Reference

- LINE Messaging API docs: https://developers.line.biz/en/reference/messaging-api/
- Pacred LIFF link page: `app/[locale]/liff/link/page.tsx`
- Pacred push helper: `lib/notifications/index.ts:125`
- LINE OA add-friend: https://lin.ee/Yg3fU0I (constant in `components/seo/site.ts`)
- ปอน's webhook worker: `https://podenglineworker.natmeena8.workers.dev` (independent · handles inbound events)
