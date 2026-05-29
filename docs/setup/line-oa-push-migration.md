# LINE OA push — migration from LINE Notify (Apr 2025 EOL)

> LINE Notify is shut down (April 2025). Pacred needs to migrate every notification path that used LINE Notify to use **LINE Official Account Messaging API push** instead. The OA is already live: https://lin.ee/Yg3fU0I

## Why migrate

- LINE Notify uses a per-user OAuth token · LINE shuts down the issuer endpoint April 2025
- LINE OA push uses a single channel access token + per-customer `userId` · works as long as the LINE OA is alive
- LINE OA push is also a STRONGER channel — customers get rich messages, action buttons, can reply back

## What changes

| Aspect | LINE Notify (old) | LINE OA Push (new) |
|---|---|---|
| Auth | per-user OAuth token (`tb_users.userLineNotify`) | one channel access token (env var) |
| Recipient identifier | (built into token) | LINE `userId` (`tb_users.userLineIDOA`) |
| API endpoint | `https://notify-api.line.me/api/notify` | `https://api.line.me/v2/bot/message/push` |
| Message shape | plain text + optional sticker/image | flex messages · rich layouts · action buttons |
| Onboarding | customer clicks "Allow" on LINE Notify OAuth page | customer adds Pacred LINE OA as friend + (optional) opens LIFF to link `userId` ↔ Pacred `userID` |
| Rate limit | 1000 msg/hour per token | 500 msg/sec channel-wide · 1000 msg/min per user |

## Setup steps

### 1. Get the LINE channel + tokens

You probably already have a LINE OA from when ก๊อต set it up. If not:

- Go to https://developers.line.biz
- Login with the LINE account that owns the Pacred OA (https://lin.ee/Yg3fU0I)
- **Providers** → **Pacred** (or your provider name) → channel **Pacred OA**
- If no channel exists, **Create new channel** → **Messaging API** (NOT LINE Login)
  - Channel name: `Pacred`
  - Channel description: `Pacred shipping & customs notifications`
  - Category: `Shopping & Retail`
  - Region: Thailand
  - Privacy policy URL: `https://pacred.co.th/privacy`
  - Terms of use URL: `https://pacred.co.th/terms`

### 2. Get the credentials

In the channel page:
- **Basic settings** tab → copy:
  - `Channel ID` (numeric)
  - `Channel secret` (32-char alphanumeric)
- **Messaging API** tab → scroll down → **Channel access token (long-lived)**:
  - Click **Issue** if no token exists
  - Copy the long token (starts with letters · ~170 chars)
  - **This is your push auth credential · save it safely**

### 3. Configure the webhook (for receiving user IDs)

In the channel → **Messaging API** tab:
- **Webhook URL** → `https://pacred.co.th/api/webhooks/line-oa`
- **Use webhook** → ON
- Disable **Auto-reply messages** + **Greeting messages** (Pacred handles its own greeting via the webhook)

The webhook needs to be implemented in Pacred:
- Route: `app/api/webhooks/line-oa/route.ts`
- Handles `follow` event (customer just added the OA · save their `userId` to `tb_users.userLineIDOA`)
- Handles `unfollow` event (clear `userLineIDOA` so we stop sending)
- Handles `message` event (link to LIFF or send help message)

(If not implemented yet · home computer Claude can do this as a separate task.)

### 4. Add credentials to Pacred env

**Local dev (`.env.local`):**
```bash
# LINE OA Messaging API
LINE_OA_CHANNEL_ID=2001234567
LINE_OA_CHANNEL_SECRET=abcdef0123456789abcdef0123456789
LINE_OA_CHANNEL_ACCESS_TOKEN=ABCdef.../+0123456789...XYZ=

# Public OA add-friend link (already in components/seo/site.ts)
NEXT_PUBLIC_LINE_OA_URL=https://lin.ee/Yg3fU0I
```

**Vercel prod:**
- Same 3 env vars on https://vercel.com/pacred-co/pacred-web/settings/environment-variables
- Production + Preview + Development scopes

### 5. Link customer `userID` ↔ LINE `userId`

A LINE customer is identified by `userId` (e.g. `Ua1b2c3d4e5f6...` 33-char string). Pacred needs to know which LINE `userId` belongs to which Pacred customer (`PR9602`, `PR10601`, etc.).

3 ways to capture this mapping (use any/all):

**A. LIFF login flow** (best customer experience)
- Customer logs in to Pacred web/app via LINE Login (LIFF SDK)
- Backend extracts their LINE `userId` from the ID token
- Store in `tb_users.userLineIDOA` for that customer
- Pacred already has LINE LIFF set up — see [`docs/setup/line-liff-create-guide.md`](line-liff-create-guide.md)

**B. Follow webhook** (passive · works for all customers who already added the OA)
- When customer adds the OA as friend, LINE fires a `follow` event
- The event payload has the customer's `userId`
- Pacred webhook can't match it to a `PR####` code by itself · needs a hint:
  - Send a "Welcome! Reply with your PR code to link" message
  - OR send a LIFF link inside the welcome message
  - OR if the customer arrived via a specific marketing campaign link with `?source=PR9602`, the webhook can correlate

**C. Manual admin entry** (fallback for migrated customers)
- Admin opens `/admin/customers/PR9602`
- Pastes the LINE `userId` from a support conversation
- Saves to `tb_users.userLineIDOA`

### 6. Replace LINE Notify code with LINE OA push

The existing notification helper is in `lib/notifications/line.ts` (or similar). Look for places that POST to `https://notify-api.line.me/...` and replace with:

```typescript
async function sendLineOAMessage(userId: string, message: string) {
  const token = process.env.LINE_OA_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn("[line-oa] LINE_OA_CHANNEL_ACCESS_TOKEN not set · skipping push");
    return { ok: false, error: "NOT_CONFIGURED" };
  }
  if (!userId) {
    return { ok: false, error: "NO_USER_ID" }; // customer hasn't linked LINE yet
  }
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text: message }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("[line-oa] push failed", res.status, body);
    return { ok: false, error: `HTTP_${res.status}`, body };
  }
  return { ok: true };
}
```

### 7. Verify

- Send yourself (or a test admin account) a notification
- Should appear in your LINE chat with the Pacred OA (NOT as a LINE Notify message)
- If you get "No friend relationship" error → the recipient hasn't added the OA yet
- If you get "Invalid signature" → channel access token is wrong

## Rate limits + monitoring

- **Push messages: 500 messages/second channel-wide** (more than enough for Pacred)
- **Multicast/broadcast: 60 calls/hour** (use for bulk notifications)
- **Per-user: 1000 messages/min** (one customer can receive 1000 in a minute)
- Monitor usage in LINE Developers Console → **Messaging API** tab → **Statistics**

## Fallback strategy

For customers without `userLineIDOA` (no LIFF login + no friend follow):
- Try LINE OA push first
- If `NO_USER_ID` error → fall back to SMS via ThaiBulkSMS (existing path)
- If SMS also fails → fall back to email
- Log every failed delivery so admins can manually re-link

## Reference

- LINE Messaging API docs: https://developers.line.biz/en/reference/messaging-api/
- Pacred existing LINE setup: [`docs/setup/line.md`](line.md) · [`docs/setup/line-liff-create-guide.md`](line-liff-create-guide.md)
- Pacred OA add-friend URL: `https://lin.ee/Yg3fU0I` (constant in `components/seo/site.ts`)
