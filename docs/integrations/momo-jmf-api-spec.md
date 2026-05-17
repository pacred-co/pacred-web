# MOMO JMF — API specification (canonical, post-correction)

> **Status:** ✅ canonical reference (replaces the wrong `?api=` decode in
> [`../research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md)).
> Last updated: 2026-05-18 (U1-7 doc-fix prep).
>
> **Read first:** [`momo-jmf.md`](momo-jmf.md) (what MOMO is) ·
> [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md)
> (where the sync writes) · [`../research/legacy-chat-datanew-2026-05-17.md`](../research/legacy-chat-datanew-2026-05-17.md)
> §0 / DN-1 / L-0 (the chat evidence this correction comes from).

This doc is the **single source of truth** for the MOMO API surface
Pacred consumes. When ภูม or any agent implements `U1-7 MOMO sync`,
use THIS file — not the older `momo-jmf-api-decoded.md` `?api=`
sketches (which were reconstructed from a data-less Angular shell).

---

## 1. Connection

| Field | Value |
|---|---|
| **Base URL** | `https://api.momocargo.com:8080` (note the explicit `:8080`) |
| **Auth** | `Authorization: Bearer <MOMO_JWT>` — JWT stored in `MOMO_JMF_TOKEN` env |
| **Date param format** | `YYYY-MM-DD+YYYY-MM-DD` (start-date `+` end-date, both inclusive — URL-encode the `+` as `%2B` OR pass raw `+` if the upstream tolerates it; verify on first call) |
| **Format** | REST + JSON responses (NOT GraphQL, NOT the legacy `?api=<name>` query routing) |
| **Method** | `GET` for all 3 endpoints below; no write endpoints exposed to Pacred |

### Environment variables (already wired in `.env.example` § MOMO)

```
MOMO_JMF_BASE_URL=https://api.momocargo.com:8080
MOMO_JMF_TOKEN=<the JWT from MOMO — owner has it>
```

⚠️ Do NOT fall back to `api-cn.alilogisticshub.com` or any URL with
`?api=<resource>` — that surface was a misread of the public Angular
SPA. The chat-confirmed real surface is REST under `api.momocargo.com:8080`.

---

## 2. Endpoints (3 GET endpoints — full inventory)

### 2.1 Per-tracking import data
```
GET /api/func/get/import/track/{date-range}
```

- **Example:** `https://api.momocargo.com:8080/api/func/get/import/track/2025-12-23+2025-12-23`
- **Purpose:** Returns every parcel-level event (status updates, scans, weights, CBM measurements) in the date range
- **Response shape (inferred — confirm on first call):** array of tracking events with `tracking_no` · `event` · `weight_kg` · `cbm` · `timestamp` · `container_code` · `sack_code` (when consolidated)
- **Pagination:** unknown — first-call task is to verify whether the date range itself is the only pagination mechanism (1-day chunks recommended)
- **Use:** populate `cargo_shipments` + `cargo_shipment_tracking` rows; reconcile per-shipment weight/CBM with the customer-typed declaration

### 2.2 Closed-container list
```
GET /api/func/get/container/closed/{date-range}
```

- **Example:** `https://api.momocargo.com:8080/api/func/get/container/closed/2025-12-23+2025-12-23`
- **Purpose:** Lists every container that MOMO sealed (`closed` from MOMO's perspective) in the date range
- **Response shape:** array of containers with `container_code` (e.g. `GZE251223-1`) · `total_weight_kg` · `total_cbm` · `sealed_at` · `eta` · per-sack rollup
- **Use:** populate / update `cargo_containers` rows; status='closed' from this endpoint maps onto our spine status='closed'

### 2.3 Per-sack detail (the RECONCILIATION endpoint)
```
GET /api/sack/get/info/{sack_code}
```

- **Example:** `https://api.momocargo.com:8080/api/sack/get/info/CBX251111-EK04`
- **Purpose:** Returns the sack-level **outside-of-bag** measurement (weight + CBM) — the reconciliation reference per datanew L-3
- **Response shape:** `{ sack_code, outside_weight_kg, outside_cbm, container_code, sealed_at, items: [...] }`
- **Use:** populate `cargo_sacks` (migration 0068 — already shipped); MOMO outside = `cargo_sacks.cbm`; PCS inside (sum of `cargo_shipments.received_cbm`) is compared via `reconcileSack()` helper in `lib/warehouse/sacks.ts`
- **THE KEY ENDPOINT for billing reconciliation** — see datanew L-3 (~31% CBM discrepancy per container)

---

## 3. Sync architecture (U1-7 implementation plan)

### 3.1 Files to build

```
lib/integrations/momo-jmf/
├── client.ts          → fetch helpers + Bearer auth + 30s timeout
├── types.ts           → TypeScript types for the 3 response shapes
├── sync.ts            → orchestrator: pulls each endpoint, upserts into spine
└── reconcile.ts       → per-sack outside-vs-inside diff helper
```

### 3.2 Cron entry (the 7th cron, vercel.json)

```json
{ "path": "/api/cron/momo-jmf-sync", "schedule": "*/15 * * * *" }
```

The cron pulls **yesterday + today** (`YYYY-MM-DD+YYYY-MM-DD`) on every fire — handles late events without backfill complexity. Per-fire flow:

1. `GET /api/func/get/container/closed/{yesterday}+{today}` → upsert into `cargo_containers` keyed on `code` (existing `upsertContainerByCode` helper in `lib/warehouse/containers.ts`)
2. `GET /api/func/get/import/track/{yesterday}+{today}` → walk events, upsert `cargo_shipments` keyed on `tracking_no` (sub-task: map MOMO 9-status enum to spine 8-status enum per `chat-analysis-2026-05-16.md` §"MOMO canonical status enum")
3. For each newly-discovered `sack_code` in the response: `GET /api/sack/get/info/{sack_code}` → upsert via `upsertSackByCode` (in `lib/warehouse/sacks.ts`)
4. Each step writes a `cron_invocations` row via the `instrumentCron()` wrapper (migration 0070, already shipped) so `/admin/system/crons` shows last-fire / success-rate / error
5. Use `lib/cron/instrument.ts` wrapper for auth + invocation logging — mirrors the 6 existing crons

### 3.3 Status enum mapping (from `chat-analysis-2026-05-16.md`)

| MOMO status | Pacred spine status |
|---|---|
| `received` | `received_cn` |
| `packed` | `packed_cn` |
| `loaded` | `sealed_in_container` |
| `departed_china` | `in_transit` |
| `arrived_thailand` | `arrived_th` |
| `unloaded` | `unloaded` |
| `dispatched` | `out_for_delivery` |
| `delivered` | `delivered` |
| `cancelled` | (skip — only one-way enum; cancel must come from Pacred) |

Stored in `lib/warehouse/cargo-type.ts` style normaliser at `lib/integrations/momo-jmf/status-map.ts`.

### 3.4 Reconciliation (the L-3 fix)

Per-container post-sync:
1. Sum `cargo_shipments.received_cbm` for all shipments in this container
2. Sum `cargo_sacks.cbm` for all sacks (the MOMO outside measurement)
3. If the two diverge >5%, flag in `cargo_containers.reconciliation_note` for staff review (column to add via `0081_momo_reconciliation` migration when U1-7 ships)
4. The U1-3 billing gate (`getCargoBillingGate` in `lib/forwarder/billing-gate.ts`) ALREADY blocks mark-paid for non-closed containers — once MOMO sync writes `status='closed'`, the gate unblocks naturally

### 3.5 Open questions for the MOMO-1 call

Track these in [`momo-1-call-prep.md`](momo-1-call-prep.md):

1. Pagination — is date-range chunking the only paging? Any cursor?
2. Rate limit — is there one? Default backoff?
3. Webhook push — does MOMO push, or pull-only? (If push, we need a `/api/webhooks/momo-jmf` route — U3-6 webhook harness applies)
4. JWT refresh — manual rotation, or refresh-token endpoint?
5. Error response shape — what does a 401/404/500 look like? (For instrument.ts → cron_invocations.error_message)
6. Sack-without-container — possible? (If yes, sync order matters: sacks before containers)

---

## 4. Implementation checklist for U1-7

- [ ] **Correct the 2 wrong docs first** — already banner-warned, but consider deleting the wrong `?api=` sections from `momo-jmf-api-decoded.md` § "API surface" once U1-7 ships (keep the state-machine / wallet-flow analysis from the same doc — those are still useful)
- [ ] `MOMO_JMF_TOKEN` set in Vercel env (already documented in `.env.example`)
- [ ] Build the 4 files in `lib/integrations/momo-jmf/` per §3.1
- [ ] Cron route in `app/api/cron/momo-jmf-sync/route.ts` wrapped via `instrumentCron()`
- [ ] Add 7th cron entry to `vercel.json` with `*/15 * * * *` (every 15 min)
- [ ] Add `cargo_containers.reconciliation_note` text column via migration `0081_momo_reconciliation.sql` for the L-3 ≥5% gap flag
- [ ] Wire the admin UI: surface "Last MOMO sync" pill on `/admin/warehouse/containers` list + per-container reconciliation flag on detail page
- [ ] Integration test against a one-call recording (curl `GET` + replay)
- [ ] Document MOMO 9-status enum + Pacred mapping in `docs/glossary.md`

---

## 5. What NOT to do

- ❌ Do not call `api-cn.alilogisticshub.com` — that was the wrong host
- ❌ Do not pass `?api=<resource>` query parameters — that routing pattern was misread from the public SPA
- ❌ Do not skip the per-sack endpoint (`/api/sack/get/info/{code}`) — without it, no MOMO-vs-PCS reconciliation, billing gate stays blind, datanew L-3 stays open
- ❌ Do not implement the sync before the MOMO-1 call confirms pagination + rate-limit — wasted effort if shape changes
- ❌ Do not write the response data straight into `cargo_containers` without going through `upsertContainerByCode` — the helper has the idempotency + status-history side effects

---

## Cross-refs

- [`momo-jmf.md`](momo-jmf.md) — what MOMO is / why we use it
- [`momo-1-call-prep.md`](momo-1-call-prep.md) — open questions for the partner call
- [`../research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md) — the SUPERSEDED original decode (state-machine + wallet-flow sections still useful; ignore `?api=` host/paths)
- [`../research/legacy-chat-datanew-2026-05-17.md`](../research/legacy-chat-datanew-2026-05-17.md) §0 / DN-1 / L-0 — the evidence chain for this correction
- [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) §1 U1-7 — the upgrade-plan item
- [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md) — the spine tables this sync writes
- [`../glossary.md`](../glossary.md) — CBX sack code format · GZE / GZS container code formats
