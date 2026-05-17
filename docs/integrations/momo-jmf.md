# MOMO JMF — Thailand warehouse cargo container partner

> ⚠️ **API SURFACE CORRECTION (2026-05-17 night).** The MOMO API host/endpoints
> implied in this doc + decoded in [`../research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md)
> are **WRONG**. On launch eve the warehouse owner posted the **real** surface:
> base **`https://api.momocargo.com:8080`** · REST paths
> (`GET /api/func/get/import/track/{range}` · `GET /api/func/get/container/closed/{range}`
> · `GET /api/sack/get/info/{code}`) · date param `YYYY-MM-DD+YYYY-MM-DD`.
> Evidence + decode → [`../research/legacy-chat-datanew-2026-05-17.md`](../research/legacy-chat-datanew-2026-05-17.md)
> §0 / DN-1 (L-0). **Do not build the sync client from the old `?api=` /
> `api-cn.alilogisticshub.com` surface** — re-decode is [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)
> U1-7. Not launch-blocking — MOMO sync is post-launch.

**Status:** Token received 2026-05-16; integration spec pending dev-call with MOMO + reverse-engineering of legacy cargo-thai payload pattern
**Owner:** ก๊อต (per Track K — partner/tool selection); ภูม implements when spec is locked
**Read first:** [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) for the data model this integration writes into

---

## What MOMO JMF does for Pacred

Right now, Pacred does **not have enough cargo volume to close its own containers** in the Thailand warehouse. So we use **MOMO JMF** as our container-closing partner:

1. Pacred cargo customers ship goods from China → arrives at Thailand-side warehouse
2. MOMO's warehouse packs goods into a container (truck `GZE...` / sea / air)
3. MOMO closes the container, generates the manifest, issues invoice/packing-list/Form-E + customs declaration on Pacred's behalf
4. MOMO sends container status updates back to Pacred (this integration consumes those)
5. Pacred shows the status to customers via the admin warehouse view + customer-side tracking

**Long-term goal:** When Pacred has enough cargo / LCL volume → close containers in-house → unlock these in-house functions:

- In-house invoice + packing list
- In-house Form-E (ใบขนสินค้า)
- In-house Tax Invoice (VAT 7% via [ADR-0006](../decisions/0006-tax-invoice-flow.md))
- In-house customs declaration (ใบขน)
- In-house rate setting (via the `pricing` role's `/admin/rates`)

Until then: MOMO does it, Pacred consumes the data.

## Authentication

```
Header: Authorization: Bearer <MOMO_JMF_TOKEN>
```

The `MOMO_JMF_TOKEN` is a JWT (HS256). Stored in `.env.local` (gitignored) + Vercel env (when ก๊อต ready to flip on).

JWT payload (decoded for reference, not for trust — Pacred doesn't verify signature; MOMO does on their side):

```json
{
  "user_id": 68,
  "_id": "69fda549349f205edba23de1",
  "last_online": "2026-05-14 10:21:26",
  "iat": 1778725325
}
```

> **Rotation:** When MOMO rotates their key or Pacred ends partnership → request new token via partner channel, swap `MOMO_JMF_TOKEN` in Vercel, redeploy. Note: legacy "cargo-thai" pattern (used by PCS Cargo prior) sent similar JWT — see `docs/audit/php-pcscargo-integrations.md` for the wire format ภูม can reverse if MOMO's API mirrors it.

## Endpoint inventory (TBD — reverse from legacy cargo-thai + MOMO dev confirm)

Pacred legacy PHP used `cargo-thai` (now renamed MOMO) — the wire pattern lives in `D:\xampp\htdocs\pcscargo\member\pcs-admin\api-forwarder-{cn,jmf,ttp}\*.php`. ก๊อต / ภูม reverse-engineer from there + confirm with MOMO dev.

Expected endpoints (per legacy):

| Endpoint | Purpose |
|---|---|
| `GET /containers?status=...` | List containers with current status (open / packing / closed / in-transit / arrived) |
| `GET /containers/{containerCode}` | Container detail — manifest, weight, cbm, transport-mode (truck/sea/air), departure/arrival ETA |
| `GET /containers/{containerCode}/manifest` | List shipments (per Pacred customer) inside the container |
| `GET /shipments/{shipmentCode}/tracking` | Box-level scan history (received, packed, sealed, in-transit, arrived, delivered) |
| `POST /webhook/status-change` (inbound) | MOMO pushes status updates to Pacred — Pacred receives + updates DB |

Endpoint paths above are placeholders. ก๊อต: confirm with MOMO dev → fill the inventory + update this file.

## Data flow into Pacred's DB

Per [container-centric-model.md](../architecture/container-centric-model.md):

1. **Sync job** (Vercel cron, every 15 min) — calls `GET /containers?updated_since=<last_sync>` → upserts into `containers` table.
2. **Container detail** — when a customer opens a container view, on-demand fetch `GET /containers/{code}` → cache 5min.
3. **Webhook** — MOMO POSTs to `/api/webhooks/momo-jmf/status` → verify JWT signature (using MOMO_JMF_TOKEN's secret if MOMO shares; else trust IP allowlist) → write into `container_status_history`.
4. **Customer-side view** — read from `containers` + `shipments` joined per customer ID.

## Implementation roadmap

| Step | Owner | When |
|---|---|---|
| **1. Confirm endpoint inventory** (call MOMO dev + reverse `pcs-admin/api-forwarder-jmf/*.php`) | ก๊อต | First — unblocks rest |
| **2. Migrate schema** — `containers`, `shipments`, `container_status_history` (per container-centric ADR) | ภูม (schema) | After step 1 |
| **3. Implement `lib/integrations/momo-jmf/*.ts`** — typed client + parsers + idempotent upsert | ภูม | After step 2 |
| **4. Wire sync cron** `app/api/cron/momo-jmf-sync/route.ts` | ภูม | After step 3 |
| **5. Wire webhook receiver** `app/api/webhooks/momo-jmf/route.ts` | ภูม | After step 3 |
| **6. Customer-side view at `/service-import/[fNo]/container`** | ภูม | After step 4 |
| **7. Admin-side container view at `/admin/warehouse/containers/[code]`** | ภูม | After step 4 |
| **8. Webhook signature verification + IP allowlist** | ก๊อต (decide) + ภูม (impl) | Before flipping on in prod |

## Env / secret checklist

- [x] `MOMO_JMF_TOKEN` documented in `.env.example` + present in `.env.local` (gitignored, set 2026-05-16)
- [ ] `MOMO_JMF_BASE_URL` confirmed with MOMO dev — currently commented out
- [ ] `MOMO_JMF_WEBHOOK_SECRET` (if MOMO supports signed webhooks) — request via partner channel
- [ ] Vercel env (Production + Preview) updated when flipping on

## Cross-references

- Container data model: [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- Legacy audit (cargo-thai wire format reference): [`docs/audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md)
- Env var spec: [`docs/env.md`](../env.md) §19
- Partner side context: memory `staff_roles_pacred` (load via /memories — not in repo)
