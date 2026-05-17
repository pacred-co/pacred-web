# MOMO JMF — API + flows decoded (R&D)

> ⚠️ **SUPERSEDED ON THE API SURFACE (2026-05-17 night).** The API host +
> endpoint format decoded in this doc are **WRONG** — reconstructed from a
> data-less Angular SPA shell (see §0 below). On launch eve the warehouse owner
> posted the **real** surface: base **`https://api.momocargo.com:8080`** · REST
> paths (`GET /api/func/get/import/track/{range}` · `GET /api/func/get/container/closed/{range}`
> · `GET /api/sack/get/info/{code}`) · date param `YYYY-MM-DD+YYYY-MM-DD`.
> Correct decode + evidence → [`legacy-chat-datanew-2026-05-17.md`](legacy-chat-datanew-2026-05-17.md)
> §0 / DN-1 (L-0). The state-machine / wallet-flow / data-field analysis below
> may still be directionally useful, but the `?api=` query-routing and the
> `api-cn.alilogisticshub.com` host are **not real** — do not build the sync
> client from them. Full re-decode → [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) U1-7.

**Status:** ⚠️ SUPERSEDED on the API surface (see banner above). R&D decode (2026-05-17, เดฟ-requested).
**Scope:** Decode the MOMO partner system — API, order state machine, wallet flows, payment-transport, data fields — so `lib/integrations/momo-jmf/` can be built native (not the legacy "borrow" pattern).
**Read with:** [`momo-jmf.md`](../integrations/momo-jmf.md) (current state) · [`momo-1-call-prep.md`](../integrations/momo-1-call-prep.md) (open questions) · [`../audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) §"MOMO canonical status enum".

---

## 0. ⚠️ Read this first — what the scraped material actually is

The 16 `pcsxmomo*.html` / `pacredxmomo*.html` files at `~/Desktop/project dev/data งานเก่า/` are **NOT 16 distinct page captures**. They are **16 byte-identical copies of one file** — the `momocargo.com` Angular SPA `index.html` (verified: same size 32,757 B, same content). Renaming a file `pcsxmomo dispute.html` does not change it; the SPA serves the same shell for every route and renders client-side.

**Consequence:** the HTML files contain **zero embedded API data** — no fetch URLs, no payloads, no JSON, no status enums. The real API logic is in the **un-scraped webpack bundles** referenced by the shell:

```
runtime-es2015.169edeac2c32e0ab6dea.js
polyfills-es2015.7a81f4867ae9bdf8dd19.js
scripts.9084ba378a5fd48782a5.js
main-es2015.18254d352dbb39d65a87.js   ← all routing + HTTP calls live here
```

To extract the *exact* MOMO API surface, the next step is to capture **`main-es2015.18254d352dbb39d65a87.js`** (download from `https://www.momocargo.com/main-es2015.18254d352dbb39d65a87.js`) and grep it for `alilogisticshub`, `api=`, `httpClient`, `Bearer`. **Alternatively** — and faster — open DevTools → Network on the live MOMO panel and record the XHR calls. That gives ground truth in 5 minutes.

**What this doc decodes instead:** the MOMO system *behaviour* — reconstructed with high confidence from (a) the one confirmed endpoint, (b) 8 weeks of the `MOMO x PCS` LINE operations channel (`[LINE]MOMO x PCS.txt`, 1165 lines — the real MOMO↔PCS dev + ops log), and (c) the legacy JMF PHP contract (the closest analog partner). The endpoint *paths* below marked **(inferred)** must be confirmed against the JS bundle / DevTools / MOMO-1 call before going live.

---

## 1. The system — what MOMO is

| Fact | Value | Source |
|---|---|---|
| MOMO public site | `https://www.momocargo.com` (Angular SPA) | HTML `<base>` / canonical |
| MOMO legal entity | บริษัท โมโม อินดัสทรี จำกัด | HTML JSON-LD `legalName` |
| MOMO contact | `momocargo88@gmail.com` · `+66-64-256-5525` | HTML JSON-LD |
| API host | `https://api-cn.alilogisticshub.com` | PCS DEV chat 2026-05-02 (confirmed) |
| Auth | `Authorization: Bearer <JWT>` (HS256) | chat audit + `momo-jmf.md` |
| Role for Pacred | **read-only** consumer — MOMO does not grant write/backend access | `MOMO x PCS` chat 2026-05-08 |
| Sync cadence (legacy) | API ingest **every 15 min**; China-side keys data first | chat 2026-04-06 (Tam) |
| Replaced | TISO Auto-Tracking, on 2026-04-06 | chat + audit |
| MOMO dev contact | "BBOY" (the only person who fixes data/qty bugs) | chat throughout |

MOMO is Pacred's **China-warehouse + container-closing + cross-border transport partner**. Pacred customers' goods land at MOMO's China warehouse → MOMO packs them into a container → MOMO trucks (EK route via Vietnam→Mukdahan) or ships (sea) it to Thailand → MOMO unloads at the TH warehouse → Pacred sends trucks to collect. MOMO's app/API is the **only digital source of container + per-tracking status**; the legacy PCS web pulls it via API and mirrors it.

---

## 2. API endpoints

### 2.1 Confirmed

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `https://api-cn.alilogisticshub.com/?api=container-list` | List containers + each container's current status. Polled every 15 min by the legacy sync. |

The API uses a **`?api=<name>` query-string router** (single host, action selected by the `api` param) — not REST path segments. This is the JMF/Ali-logistics-hub house style.

### 2.2 Inferred — confirm against JS bundle / DevTools / MOMO-1

Given the SPA renders the routes below (dashboard / pending / waiting / arrival-warehouse-CN / sending-thai / order-detail / dispute / auction / follow-product / wallet-CN-transfer / wallet-alipay-topup / payment-transport), the panel must call **at least** these. Names follow the `?api=` convention:

| Method | Endpoint (inferred) | Purpose | Feeds SPA route |
|---|---|---|---|
| `GET` | `?api=container-list` | container list + status (confirmed) | dashboard |
| `GET` | `?api=container-detail&code=<GZE...>` | one container — manifest, weight, CBM, ETA, mode | container view |
| `GET` | `?api=tracking-list&status=<state>` | per-tracking rows filtered by lifecycle state | pending / waiting / arrival / sending-thai / success |
| `GET` | `?api=tracking-detail&tracking=<no>` | one parcel — dims, weight, photos, container, type | order-detail (`po.041223-2687`) |
| `GET` | `?api=order-list` / `?api=import-order` | China-purchase orders (shop-order leg) | import order detail |
| `GET` | `?api=user-balance` | wallet balance for the authed account | dashboard / wallet |
| `GET` | `?api=wallet-transaction` | wallet ledger (topup + transfer history) | wallet pages |
| `POST` | `?api=wallet-topup` (Alipay) | create an Alipay top-up intent | wallet alipay topup |
| `POST` | `?api=wallet-cn-transfer` | CN-side yuan transfer / pay-supplier | wallet CN transfer |
| `POST` | `?api=payment-transport` | pay a container/transport invoice (credit/Pay-Later) | payment transport |
| `GET` | `?api=dispute-list` / `POST ?api=dispute-create` | open / list disputes (missing item, wrong size) | dispute |
| `GET` | `?api=auction-list` | unclaimed-goods auction listings | auction product |
| `GET`/`POST` | `?api=follow-product` (+`-history`) | watchlist add / list / history | follow product |

> JMF analog (legacy PHP, `pcs-admin/api/update-forwarder/JMFCARGO/`) confirms the **two-pattern** shape: a **GET caller** (`.../GET/userID/index.php`, body `token`+`userID`+`date`) and a **PUT receiver** (`.../PUT/index.php`, MOMO pushes ~25 form-encoded fields). MOMO may expose **pull-only** (the 15-min cron) or **also push** — open MOMO-1 question. Pacred should design for pull and add a webhook receiver if push is offered.

### 2.3 Auth

```
Authorization: Bearer <MOMO_JMF_TOKEN>
```

JWT, HS256. Captured token decodes to: `{ "user_id": 68, "_id": "69fda549349f205edba23de1", "last_online": "2026-05-14 10:21:26", "iat": 1778725325 }`. **No `exp` claim observed** → token may be long-lived / non-expiring (confirm — affects rotation). Pacred does **not** verify the signature (MOMO signs; Pacred is the client). The `user_id`/`_id` identify Pacred's MOMO partner account — every call is scoped to that account's shipments.

**Operational quirk (chat 2026-04-08):** MOMO's login was single-device by default; multi-device was enabled on request. For an API token this is moot, but it signals MOMO may bind sessions — if a 401 appears, a re-issue (not a refresh flow) is likely the fix.

---

## 3. Order / container lifecycle state machine

Two coupled state machines: **container-level** (the box) and **tracking-level** (one customer parcel inside the box). The SPA route names *are* the lifecycle stages.

### 3.1 Container statuses — the canonical 9

Confirmed in PCS DEV chat 2026-05-02 from the `container-list` response. Already encoded in `lib/integrations/momo-jmf/types.ts` (`MomoContainerStatus`):

```
loading_container          → packing at China warehouse
ek_left_china_border       → truck: departed China border
ek_arrived_vietnam_border  → truck: at Vietnam border (intermediate)
in_transit                 → generic transit
sea_leaving_china          → sea: departed Chinese port
sea_arrived_thailand_port  → sea: at TH port (Laem Chabang)
ek_arrived_mukdahan        → truck: at Mukdahan border (TH land entry)
unloading_in_thailand      → unloading at TH warehouse
unloaded_completed         → all parcels out, container retired
```

**Real transitions observed in chat** (PRINCE/benz status reports map cleanly to these):
`เคลียร์แล้วรอรถหัวลาก` → cleared, awaiting prime-mover · `เข้ามุกดาหาร รอเคลียร์` = `ek_arrived_mukdahan` · `อยู่ด่านเวียดนาม` = `ek_arrived_vietnam_border` · `เพิ่งส่งออก` = `ek_left_china_border`. Sea path uses `GZS` codes and `sea_*` statuses; the **05-15 Vietnam-border crackdown** forced an all-traffic switch truck→sea (`ทางบริษัทขอปรับ...เป็น "ทางเรือ" ชั่วคราว`) — so a single shipment **can change transport mode mid-flight**; the integration must not assume mode is immutable.

### 3.2 Tracking (parcel) lifecycle — maps to SPA routes

```
            ┌──────── (China purchase / shop-order leg) ────────┐
   [order]  →  goods bought, awaiting arrival at CN warehouse
      │
      ▼
   PENDING            parcel expected, not yet scanned in CN warehouse   → route: pending
      │  (CN warehouse receives + scans)
      ▼
   WAITING            in CN warehouse, awaiting container assignment     → route: waiting
      │  (packed into a container; container closes = "ปิดตู้")
      ▼
   ARRIVAL KODANG     in a sealed container, China-side                  → route: arival kodang
      │  (container transits — see §3.1 container states)
      ▼
   SENDING THAI       container in transit to / arrived in Thailand      → route: sending thai
      │  (TH warehouse unloads + sorts "คัดแยก" + scans "ยิงโค้ด")
      ▼
   SUCCESS            sorted, ready for customer pickup / delivered      → route: order status success
```

**Branch states (not on the happy path):**
- **DISPUTE** — opened for `ตกหล่น` (missing item: "85 boxes, received 40"), wrong size/weight, parcel-not-in-system. Chat shows these are MOMO-side adjustments today; the dispute route is where a customer would file one. → route: `dispute`
- **AUCTION** — long-unclaimed goods auctioned off. → route: `auction product`
- **FOLLOW PRODUCT** — a customer watchlist (`follow product` + `follow product history`), parallel to the lifecycle, not a state.

Pacred's own `cargo_shipments.status` enum (migration 0033) is the **8-state** target: `received_cn / packed_cn / sealed_in_container / in_transit / arrived_th / unloaded / out_for_delivery / delivered`. Map MOMO's route-stage → these.

### 3.3 Container → Pacred status mapping (verify post-decode)

Already in `types.ts::MOMO_STATUS_TO_PACRED`. Pacred `cargo_containers.status` is the 6-state enum `packing / sealed / in_transit / arrived / unloading / closed`:

| MOMO container status | → Pacred `cargo_containers.status` |
|---|---|
| `loading_container` | `packing` |
| `ek_left_china_border`, `sea_leaving_china` | `in_transit` |
| `ek_arrived_vietnam_border`, `in_transit` | `in_transit` |
| `sea_arrived_thailand_port`, `ek_arrived_mukdahan` | `arrived` |
| `unloading_in_thailand` | `unloading` |
| `unloaded_completed` | `closed` |

Note MOMO has **no `sealed`** value — `cargo_containers.status='sealed'` is set Pacred-side from the `sealed_at` timestamp / "ปิดตู้" event, not from a MOMO status.

---

## 4. Wallet flows

The SPA exposes a wallet with **two funding rails**. MOMO operates a **prepaid wallet / credit account** for the partner (Pacred), and as of **2026-05-15** *requires* container/transport charges to be paid through it.

### 4.1 Alipay top-up (`wallet alipay topup`)
Customer/partner adds funds to the MOMO wallet via **Alipay**. Inferred: `POST ?api=wallet-topup` returns an Alipay payment intent (QR or redirect URL); MOMO confirms async and credits the wallet. Ledger row appears in wallet history.

### 4.2 CN transfer (`wallet CN tranfer`)
A **China-side yuan transfer** — pay a Chinese supplier / move yuan inside China (the "ฝากโอน" / yuan-transfer service leg). Inferred: `POST ?api=wallet-cn-transfer` with `{ amount_cny, recipient, ... }`, debits the wallet.

### 4.3 The credit / Pay-Later pivot — **load-bearing, dated 2026-05-15**

BBOY, `MOMO x PCS` chat 2026-05-15 15:28 (translated):
> "Container sea-420, truck-509, and **all containers after these** — please have the PCS side **pay as credit / Pay Later** in the system. This makes MOMO's warehouse work easier and faster. The credit system will **issue an invoice, a goods-receipt note, and a payment due date**. Outstanding trackings stuck in the system will be cleared."

15:29: "Add a bank account into the system before paying via credit."

**Meaning:** MOMO shifted the financial model from per-parcel cash to a **partner credit ledger**. MOMO's wallet/credit module now generates **invoice + receipt-of-goods + due date** — this is exactly the data Pacred's freight receipt + payment ledger (migration 0052, E7) consumes. The `payment transport` route is where these invoices get paid; the `wallet` is the credit account they're billed against.

---

## 5. Payment-transport flow (`payment transport`)

The route where a partner pays a **container's transport/freight invoice**. Sequence (reconstructed):

1. MOMO closes a container + computes freight (by CBM/weight × rate).
2. MOMO issues an **invoice** against the partner credit account (§4.3) — invoice + goods-receipt note + due date.
3. Partner opens `payment transport`, sees outstanding invoices.
4. Partner pays — from **wallet credit balance** (post 05-15 model) or marks **Pay Later**.
5. On payment, the parcels in that container are **released/cleared** in the system ("เคลียร์สำเร็จ") → they progress to the next lifecycle state.

**Integration implication:** parcel status flow is **gated on payment**. A container can be physically `arrived_th` but its parcels stay blocked until the transport invoice is settled. Pacred's sync must read an invoice/payment-status field, not just the physical status — otherwise a customer sees "arrived" but cannot collect.

---

## 6. Data field inventory

No raw JSON was capturable (§0). Fields below are reconstructed from chat usage + the JMF PUT contract — the **names** need confirming against the JS bundle / a real response.

### 6.1 Container object (`container-list` / `container-detail`)

| Field | Type | Notes / chat evidence |
|---|---|---|
| `code` | string | `GZE260516-1` (truck) / `GZS260422-1` (sea). **`GZ`+`E`/`S`+`YYMMDD`+`-seq`**. `E`=EK truck route, `S`=sea. |
| `transport_mode` | enum | `truck` / `sea` / `air`. Mutable mid-flight (05-15 truck→sea switch). |
| `carrier_container_no` | string | physical carrier number, e.g. `HSDU9868713`, `BLOU...` — **distinct from `code`** (chat 2026-05-02: "ตู้:HSDU9868713"). |
| `status` | enum(9) | §3.1. |
| `closed_date` / `ปิดตู้` | date | container-close date — drives Pacred `sealed_at`. |
| `eta` | date | estimated TH-warehouse arrival. |
| `actual_arrival` | datetime | when it reached the TH warehouse. |
| `total_boxes`, `total_weight_kg`, `total_cbm` | number | denorm rollups. |
| `updated_at` | datetime | for incremental `updated_since` polling. |

### 6.2 Tracking / parcel object (`tracking-list` / `tracking-detail`)

| Field | Type | Notes / chat evidence |
|---|---|---|
| `tracking_no` | string | China courier tracking, e.g. `1083767`, `78997476275328`, `SF0217590685446`, `JYM800111184957`, `435106740726170`. Mixed formats — treat as opaque string. |
| `tracking_suffix` | — | **split parcels get `-N`**: `1083767` → `1083767-2` for the part in another container (BBOY 2026-05-13: "คนละขนาดกัน ทางจีนเลยแยกเป็นแทร็ก"). |
| `customer_ref` / `userIDSub` | string | the customer code. Legacy = `PCS10005`, `PCS9512`; **Pacred = `PR001`-series**. Resolve → `profile_id` at upsert. |
| `container_code` | string | which `GZE/GZS` container — may be null before container assignment ("ไม่มีเลขตู้ = ยังไม่ส่ง"). |
| `qty` / `fAmount` | number | box count. **⚠️ see §7 — the `qty=1` bug.** |
| `received_qty` | number | boxes physically received vs expected (chat: "85 boxes, received 40"). Pacred needs `received_qty`/`expected_qty` separately. |
| `cargo_type` / `fProductsType` | string | type code. Chat shows TH labels `มอก.` (TISI-controlled), `ทั่วไป` (general). Legacy API used `A/M/X/O/Z`; China manifest `G/T/F`. **Normalize via `toCanonicalCargoType()`** — exact code system is an open MOMO-1 question. |
| `weight_kg` / `fWeight` | number | e.g. `2886.00`, `0.1`. |
| `width`, `length`, `height` | number (cm) | e.g. `41*29*26`, `18*10*1`. **⚠️ §7 — measurement-error bug.** |
| `volume_cbm` / `fVolume` | number | e.g. `3.48`, `6.87`, `5.11501`. |
| `cn_warehouse_in_date` | date | arrival date at the CN warehouse. |
| `cover` + `img1..img4` | string(URL) | parcel photos (warehouse-shot). |
| `crate` / `fCrate` | bool | wood-crating service flag ("ตีลังไม้"). |
| `status` | enum | the lifecycle stage (§3.2). |

### 6.3 Wallet / invoice object

| Field | Type | Notes |
|---|---|---|
| `balance` | number | partner credit balance. |
| `currency` | enum | `THB` / `CNY` (Alipay topup vs CN transfer). |
| `txn_type` | enum | `topup` / `cn_transfer` / `transport_payment`. |
| `invoice_no`, `invoice_amount`, `due_date` | — | from the §4.3 credit system. |
| `goods_receipt_no` | string | the "ใบรับสินค้า" issued with the invoice. |
| `status` | enum | `unpaid` / `paid` / `pay_later`. |
| `bank_account` | object | the deposit account registered before credit payment (05-15). |

---

## 7. Known data bugs — design defensively against these

From the `MOMO x PCS` operations log — these are *recurring* failures the integration must absorb:

1. **`qty` collapses to `1` on container splits.** When a parcel splits across two containers, the legacy panel showed `qty=1` instead of the real count ("85 boxes, received 40" displayed as `1 QTY`). BBOY: *"ข้อจำกัดของแอปรับเข้าไทย"* (a TH-receiving-app limitation). **Fixed by MOMO from container `GZS260429-1` onward** (BBOY 2026-05-15 12:11). → Pacred must store `received_qty` vs `expected_qty` separately and **never trust a lone `qty=1`** for pre-`GZS260429` data.
2. **Split parcels = sibling tracking numbers.** A split creates `<tracking>-2` (`-3`...) — distinct rows, same root. Sync must group by tracking-root, not treat `-2` as a new shipment.
3. **Measurement errors → customer over-billed.** Chat 2026-05-06: warehouse measured `41*299*26` vs real `41*29*26` (a typo'd 299) → customer charged for ~10× the volume. Corrections are manual via BBOY. → Pacred needs an **admin dims/weight override** + a sanity check (flag absurd CBM).
4. **Status ≠ container number mismatch.** Chat 2026-04-28: a parcel marked "truck" but the container number was a sea container. → Reconcile `transport_mode` against `code` prefix (`GZE`=truck, `GZS`=sea); flag mismatches.
5. **"ในระบบไม่ขึ้น" — physically arrived, not in system.** ~10+ complaints. China-side hadn't keyed the data, or the 15-min sync hadn't run. → Pacred needs an **admin "rebind tracking → container"** tool and must show *sync freshness* ("last MOMO sync: 4 min ago").
6. **Payment-gated release.** Post 05-15, parcels do not clear until the transport invoice is paid (§5). → Sync the invoice/payment status, not only physical status.

---

## 8. Pacred integration plan — how `lib/integrations/momo-jmf/` should consume this

Current scaffold: `client.ts` (typed fetch + demo-mode), `types.ts` (9-status enum + maps — **good, keep**), `sync.ts` (skeleton, body deferred), `index.ts` (barrel). Gap-closing steps:

### 8.1 Get ground truth first (blocks everything)
Capture `main-es2015.18254d352dbb39d65a87.js` (or DevTools-record the live panel) → confirm the §2.2 endpoint names + real response JSON. Until then `client.ts` endpoint paths stay **placeholders**. This single step unblocks the rest — pair it with the MOMO-1 call ([`momo-1-call-prep.md`](../integrations/momo-1-call-prep.md)).

### 8.2 `client.ts` — expand beyond containers
Today it has `listContainers / getContainer / getContainerManifest / getShipmentTracking`. Add (once §2.2 confirmed): `getTrackingList(status)`, `getUserBalance()`, `getWalletTransactions()`, `listInvoices()` (payment-transport), `listDisputes()`. Keep the `?api=<name>` query-router convention — set `MOMO_JMF_BASE_URL=https://api-cn.alilogisticshub.com` and build `?api=...`. Keep demo-mode (`not_configured`).

### 8.3 `types.ts` — extend
- Container enum (9) + `MOMO_STATUS_TO_PACRED` — **correct, keep**.
- **Add** a tracking-status enum for the §3.2 lifecycle and a `MOMO_TRACKING_STATUS_TO_PACRED` map → `cargo_shipments.status` (8-state).
- **Add** `MomoInvoice` / `MomoWalletTxn` types for §4–5.
- `MomoShipmentSummary` already flags `cargo_type` must pass `toCanonicalCargoType()` — keep that.
- Add `expected_qty` + `received_qty` to `MomoShipmentSummary` (don't model a single `qty`).

### 8.4 `sync.ts` — fill the skeleton
Implement the documented upsert loop: `cargo_containers` (keyed `code`) → log transitions to `cargo_container_status_history` → sub-fetch manifest → upsert `cargo_shipments` (keyed `shipment_code`, resolve `customer_ref`→`profile_id`, normalize `cargo_type`) → tracking events. **Add:** group split siblings (`-2`) by root; reconcile `transport_mode` vs `code` prefix; persist `momo_jmf_last_sync` in `public.settings`. Cron: `app/api/cron/momo-jmf-sync/route.ts`, **every 15 min** (matches legacy cadence).

### 8.5 New: invoice/payment sync (was not scoped)
The 05-15 credit pivot means Pacred must ingest MOMO **invoices** and join payment status to parcel release. Wire `?api=...invoice` into the sync; surface unpaid container invoices in `/admin/warehouse`; **block "ready for pickup"** on the customer side until the container's transport invoice is `paid`. Cross-reference the E7 freight receipt + payment ledger (migration 0052).

### 8.6 Webhook receiver — only if MOMO offers push
`app/api/webhooks/momo-jmf/route.ts` — verify signature (HMAC or shared JWT — MOMO-1 Q6) + IP allowlist; same upsert path as sync; idempotent by `event_id`. If MOMO is pull-only, skip — the 15-min cron suffices.

### 8.7 Defensive layer (the §7 bugs)
- Reject/flag absurd CBM (e.g. any dimension > 250 cm → admin review) — catches the `299` typo class.
- Admin **rebind UI** for "in system but unlinked" parcels.
- Show **sync freshness** on every container/shipment view.
- Treat MOMO data as advisory: **warehouse-staff override wins** over a MOMO status (per `container-centric-model.md` open-question #3) — log the divergence.

### 8.8 Doc updates to make
`momo-jmf.md` §"Endpoint inventory (TBD)" — replace with §2 here once the JS bundle confirms paths. `momo-jmf.md` says "set `MOMO_JMF_BASE_URL`" — the value is `https://api-cn.alilogisticshub.com`.

---

## 9. Open questions for MOMO-1 (decode could not answer)

Carry these into [`momo-1-call-prep.md`](../integrations/momo-1-call-prep.md):

1. Full `?api=` endpoint list + sample JSON for each (the JS bundle answers this too).
2. Push (webhook) vs pull-only — and if push, the signature scheme.
3. JWT lifetime — no `exp` claim seen; is it permanent? Refresh flow?
4. `cargo_type` code system MOMO emits — `A/M/X/O/Z` vs `G/T/F` vs Thai labels (`มอก.`/`ทั่วไป`)?
5. Container splits post-`GZS260429-1` — exact `qty` + sibling-tracking payload shape now.
6. Authoritative weight/CBM field for billing (manifest vs received).
7. Invoice/credit API shape (the 05-15 model) — endpoint, fields, payment-confirm callback.
8. Rate limit on the GET API (drives cron interval).
9. Read-only access to MOMO's backend web UI (owner ask, chat 2026-05-08).

---

## 10. Cross-references

- Current MOMO spec → [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- MOMO-1 call prep (24 Qs) → [`docs/integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md) · BBOY call script → [`docs/runbook/momo-1-bboy-call-script.md`](../runbook/momo-1-bboy-call-script.md)
- Chat audit (status enum + workflows) → [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md)
- Container data model → [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- Legacy JMF wire format → [`docs/audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) §9
- Partner-API quirks learnings → [`docs/learnings/partner-apis-quirks.md`](../learnings/partner-apis-quirks.md)
- Pacred scaffold → `lib/integrations/momo-jmf/{client,sync,types,index}.ts`
- Primary decode source → `~/Desktop/project dev/data งานเก่า/[LINE]MOMO x PCS.txt` (1165 lines)

**End of decode.** The behavioural model is solid; the exact `?api=` paths + JSON shapes need one capture of `main-es2015.18254d352dbb39d65a87.js` or a DevTools recording — that is step 8.1 and it blocks the wiring.
