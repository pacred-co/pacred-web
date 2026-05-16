# MOMO-1 — call prep + JMF reverse-engineered reference (MOMO-2)

> **Status:** ✅ Pre-call doc by เดฟ (MOMO-2 preempted for ก๊อต P0.5). When ก๊อต calls MOMO dev → use the question list (§3) + the JMF reference contract (§2) to anchor the conversation. Skip 2-3 round-trips by pre-asking the right questions.
> **Date:** 2026-05-16 night · **Source:** PORT_PLAN Part S2 ก๊อต queue items MOMO-1 + MOMO-2.
>
> **Read with:**
> [`docs/integrations/momo-jmf.md`](momo-jmf.md) (current MOMO state — token captured, endpoints pending this call) ·
> [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) §"Partner integration notes" (MOMO context from chat) ·
> [`docs/audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) §9 (legacy carrier integrations).

---

## 1. What we already know about MOMO (don't ask these — confirm only)

From [chat audit](../audit/chat-analysis-2026-05-16.md) + [integrations/momo-jmf.md](momo-jmf.md):

- **MOMO** = the warehouse + auto-tracking provider that **replaced TISO Auto-Tracking on 2026-04-06**
- BBOY = MOMO dev (point of contact)
- **API endpoint observed in chat:** `https://api-cn.alilogisticshub.com/?api=container-list`
- **Auth:** Bearer JWT (HS256), `MOMO_JMF_TOKEN` captured 2026-05-14, set in `.env.local`
- **Known issues from chat:**
  - Initial Auto Tracking broke on integration day (2026-04-06)
  - Single-device login was default → multi-device added 2026-04-08
  - Container splits → `qty=1` bug ("ข้อจำกัดของแอปรับเข้าไทย") — V-D4 / U1-5 covers this on Pacred side
  - Mismatched sizes/weights → customer overcharged → BBOY fixes manually
- **MOMO does NOT give PCS backend write access** — read-only API only
- **Owner ask (chat 2026-05-08):** "ระบบ momo หลังบ้านเราเข้าได้ไหมครับ ลองขอเขาดูนะ" — **ก๊อต should ask in call** whether read access to MOMO backend is possible (otherwise stays API-only via the endpoint above)
- **The 9 canonical statuses** (per PCS DEV chat 2026-05-02): see [`docs/learnings/pacred-domain-knowledge.md`](../learnings/pacred-domain-knowledge.md) "MOMO JMF canonical 9-status enum"

---

## 2. JMF reference contract — what to expect from MOMO

JMF is the closest analog partner integration (also forwarder + tracking, also PHP-based, also bearer-token auth). Reverse-engineered from `/Users/dev/Desktop/pcscargo/member/pcs-admin/api/update-forwarder/JMFCARGO/`:

### 2.1 Two integration patterns

PHP system uses BOTH patterns with JMF — MOMO likely does ONE (or both):

| Pattern | Direction | Trigger | Used for |
|---|---|---|---|
| **A. Pull (GET)** | PCS → JMF | Admin clicks "ดึงข้อมูล" in admin UI · or cron | Get user balance · fetch container list · poll status |
| **B. Push (PUT/POST receiver)** | JMF → PCS | JMF webhook fires on each shipment update | Real-time tracking update · status flips · container assignments |

**Recommendation:** ask MOMO which pattern(s) they support. **Push is preferred** for real-time UX (customer sees status flip within seconds, not next-cron). Pull-only works but requires Pacred to schedule polling.

### 2.2 JMF PUT receiver contract (the 25+ fields they pushed)

From `member/pcs-admin/api/update-forwarder/JMFCARGO/PUT/index.php`:

```
Headers:
  Content-Type: application/x-www-form-urlencoded  (PHP POST body)

Body fields (per shipment update):
  token              (auth — Bearer-equivalent in body; replace w/ JWT for MOMO)
  userIDSub          (PCS customer code — e.g. PCS10005; for MOMO this would be Pacred PR001)
  fTrackingCHN       (China-side tracking number — the key)
  fStatus            (numeric status code — JMF custom enum)
  fDateStatus2       (timestamp for status 2 transition)
  fDateStatus3       (timestamp for status 3 transition)
  fWarehouseChina    (China warehouse code: 'GZ' / 'YW' / etc.)
  fWarehouseName     (free-text warehouse name)
  fTransportType     (truck/sea/air code)
  fCabinetNumber     (Pacred-side container number)
  fIDorCO            (??)
  fDateContainerClose (วันที่ปิดตู้ — V-C3 territory)
  fAmount            (count of items in this shipment)
  fCover             (cover image URL)
  fIMG1-4            (4 image URLs)
  fProductsType      (cargo type code — A/M/X/O/Z; MOMO might use G/T/F per V-D2)
  fWeight            (kg)
  fWidth · fLength · fHeight  (dimensions cm)
  fVolume            (m³ — CBM)
  fCrate             (boolean — crating service flag)
  fCostTotalPriceSheet (override cost, optional)
```

### 2.3 JMF GET caller contract (PCS pulling)

```
POST https://jmfcargo.com/jmf-cargo/jmf-admin/api/forwarder/PCSCARGO/GET/userID/index.php
Body (form-encoded):
  token   <bearer>
  userID  <PCS customer code | 'PP' for all>
  date    <YYYY-MM-DD | '' for all>

Response (JSON, JSON_UNESCAPED_UNICODE):
  {
    "data": [
      { ...shipment fields... }
    ]
  }
```

### 2.4 Auth pattern observed (JMF)

JMF uses a static 64-char token concatenated from Tiso/TechSol creds: `dZWm4pQICIEqtLFfBBhFIxHZgiIWFT7mwz390ddx9cHeslPlYhQzelL7YR8Q3jFu`. Pre-shared, never rotates.

**MOMO uses JWT HS256** (per audit) — that's an upgrade (allows expiry + signature verification). Pacred token captured + stored as `MOMO_JMF_TOKEN` env var.

---

## 3. The MOMO-1 call — question list for ก๊อต

Pre-organized; ask in this order. Estimated 30-45 minutes total.

### 3.1 Endpoints + integration shape (~10 min)

1. **Confirm the endpoint:** `https://api-cn.alilogisticshub.com/?api=container-list` — is this the canonical base URL? Are there other endpoints (e.g. `?api=shipment-detail` / `?api=user-balance`)?
2. **Pull vs Push:** Does MOMO support webhook push (you POST to Pacred when status changes)? Or pull-only?
3. **If push:** what's the expected receiver URL format? Pacred can expose `https://pacred.co/api/webhooks/momo-jmf`. What's the signature/auth header MOMO will send (HMAC over body? same JWT as bearer?).
4. **If pull:** what's the rate limit? (per second / per minute / per hour). Cron interval recommendation?
5. **List of all endpoints** — please share full API docs / Postman collection / OpenAPI spec.
6. **Response shapes** — sample JSON for each endpoint (container-list, container-detail if exists, shipment-tracking).

### 3.2 Auth + tokens (~5 min)

7. **JWT lifetime:** how long does the JWT live? When do we rotate? Is there a refresh-token flow?
8. **Backend read access** (chat 2026-05-08 owner ask): can Pacred have **read-only access to MOMO admin backend** (web UI)? Critical for debugging when API behaves strangely.
9. **IP allowlist needed?** Pacred runs on Vercel — egress IPs are not stable. If MOMO requires fixed IPs, we need a workaround (Vercel Pro static IP add-on, or self-hosted proxy).

### 3.3 Data model + edge cases (~10 min)

10. **Container splits** (the chat U1-5 bug): how does MOMO send a shipment that's split across 2 containers? Single message with `qty=2`? Two separate messages? This bug currently makes received_qty = 1 erroneously.
11. **Status enum** — confirm the 9 statuses (loading_container · ek_left_china_border · ek_arrived_vietnam_border · in_transit · sea_leaving_china · sea_arrived_thailand_port · ek_arrived_mukdahan · unloading_in_thailand · unloaded_completed) are the ONLY values MOMO emits. Any future additions?
12. **Cargo type:** what code system? PCS API used `A/M/X/O/Z`; China manifest uses `G/T/F`. Which does MOMO use? Pacred will normalize either way via `lib/warehouse/cargo-type.ts::toCanonicalCargoType()`.
13. **Container number vs Pacred code** (V-D3): MOMO sends carrier container number (e.g. `BLOU2025012`) — does it also send Pacred's `GZE`/`GZS` code? Or are they decoupled?
14. **Weight + CBM** — multiple sources reported in chat (received vs queue vs manifest). Which source does MOMO's API return? Pacred V-D1 stores per-source CBM; need to know MOMO's authoritative answer.

### 3.4 Webhook + retry behavior (~5 min)

15. **Idempotency:** if MOMO retries the same status update, is the payload identical? Does it include a unique event_id so Pacred can dedupe?
16. **Retry policy** (if push): timeout? backoff? Will MOMO give up after N retries?
17. **Delivery guarantees** — at-least-once or exactly-once? Out-of-order updates possible? (e.g. status=3 arrives before status=2)
18. **Backfill** — if Pacred webhook is down for 1 hour, can MOMO replay missed events? Or does Pacred need to do a catch-up GET poll?

### 3.5 Operational (~5 min)

19. **Support contact** — who at MOMO (besides BBOY) can answer API questions? Slack / LINE / email?
20. **Status page** — does MOMO have a public status/incident page? Pacred `/status` (per chat L-1) should surface MOMO degradation.
21. **Sandbox environment** — does MOMO offer a non-prod sandbox for Pacred to test against without polluting real data?
22. **Notification on breaking changes** — how does MOMO announce API changes? Pacred needs N days advance notice to update integration.

### 3.6 Strategic (~5 min, only if MOMO open to it)

23. **Long-term:** Pacred plans to own warehouse eventually (post-revenue). What does MOMO's contract look like for that transition? Notice period? Data export?
24. **Reverse webhook:** can Pacred PUSH updates TO MOMO? (e.g. customer marks "delivery complete" in Pacred app — does MOMO want to know?)

---

## 4. Post-call Pacred-side wiring plan (after MOMO-1 lands)

Once ก๊อต has the answers, ภูม implements `lib/integrations/momo-jmf/sync.ts` body. Skeleton already scaffolded (per `briefs/poom.md`).

### 4.1 If MOMO supports webhook push

```ts
// app/api/webhooks/momo-jmf/route.ts
import { verifyMomoSignature } from "@/lib/integrations/momo-jmf/auth";

export async function POST(request: Request) {
  // 1. Verify signature (HMAC or JWT — confirmed in call Q3)
  // 2. Parse payload
  // 3. Upsert into cargo_containers + cargo_shipments + cargo_shipment_tracking
  //    (per the V-D1/D2/D3 schema — per-source CBM, canonical cargo_type)
  // 4. Normalize cargo_type via toCanonicalCargoType()
  // 5. Map MOMO 9-status → Pacred 6-status via MOMO_STATUS_TO_PACRED
  // 6. Idempotency: dedupe via event_id (Q15) or upsert with on-conflict
  // 7. Fire customer notification if status changed to a customer-visible state
  // 8. Audit log to admin_audit_log (action: 'momo.webhook_received')
  // 9. Return 200 OK quickly (< 500ms)
}
```

### 4.2 If MOMO is pull-only

```ts
// app/api/cron/momo-jmf-sync/route.ts
// (already in vercel.json scaffolded; cron interval per Q4)
export async function GET(request: Request) {
  // Check CRON_SECRET header
  // Call client.listContainers(updatedSince: last_sync_timestamp)
  // For each container in response:
  //   - upsert into cargo_containers (per V-D)
  //   - fetch its shipment details (separate endpoint? confirm Q5)
  //   - upsert shipments + tracking events
  // Update last_sync_timestamp
  // Return summary { synced: N, failed: M }
}
```

### 4.3 Demo-mode fallback (already implemented)

`lib/integrations/momo-jmf/client.ts` returns `{ ok: false, error: "not_configured" }` when `MOMO_JMF_BASE_URL` env not set. Production now defaults to this safe state until ก๊อต ships post-call.

### 4.4 Status-mapping verification

`lib/integrations/momo-jmf/types.ts::MOMO_STATUS_TO_PACRED` already maps the 9 MOMO statuses → 6 Pacred statuses. **Verify against MOMO's spec** post-call (might have additional statuses or different semantics).

---

## 5. Open Pacred-side decisions (after call data lands)

Per the call answers, ก๊อต + เดฟ decide:

1. **Cron vs webhook** — adopt push if MOMO supports + signature is verifiable; else cron every 15 min (per audit L-2 fix recommendation).
2. **Demo-mode timeline** — when to remove demo-mode + go live (= when Pacred-side wiring + first-customer test pass).
3. **Sentry alert on MOMO sync failure** — wire after Sentry signup (DV-1a).
4. **Status divergence handling** — when MOMO says "in_transit" but warehouse staff entered "arrived_th" earlier: who wins? Recommend: staff-override wins, log divergence (per `architecture/container-centric-model.md` "Open questions" #3).

---

## 6. Verification — proof MOMO integration works

After ภูม wires per call answers:

- [ ] Test container `GZE260516-1` (a real recent container) syncs into `cargo_containers` table with correct status
- [ ] Customer with shipment in that container sees status update in `/shipments/[code]` within 5 min of MOMO event (push) or next cron run (pull)
- [ ] Status flip triggers LINE push to customer (post DV-2 LIFF + LIFF ID set)
- [ ] Sentry receives error on webhook signature mismatch (auth verification working)
- [ ] Admin audit log shows `momo.webhook_received` entries

---

## 7. Cross-references

- Current MOMO integration spec → [`docs/integrations/momo-jmf.md`](momo-jmf.md)
- Chat audit context → [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) §Partner integration notes
- Canonical 9-status enum → [`docs/learnings/pacred-domain-knowledge.md`](../learnings/pacred-domain-knowledge.md)
- Legacy JMF integration audit → [`docs/audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) §9
- Legacy JMF PHP source → `/Users/dev/Desktop/pcscargo/member/pcs-admin/api/update-forwarder/JMFCARGO/`
- Pacred MOMO scaffold → `lib/integrations/momo-jmf/{client,sync,types,index}.ts`
- Cutover tracker → [`docs/runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md) F1-5
- Container schema spine → [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- Container model V-D extensions → [`docs/port-specs/cargo-volume-reconciliation.md`](../port-specs/cargo-volume-reconciliation.md)
- ภูม pickup after call → `briefs/poom.md` CT-5 + CT-6

**End of MOMO-1 prep.** ก๊อต: walk through §3 question list with MOMO dev — record answers inline in `docs/integrations/momo-jmf.md`. ภูม picks up §4 wiring once answers land.
