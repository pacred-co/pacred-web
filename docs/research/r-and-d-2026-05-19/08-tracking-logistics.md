# R&D — Tracking · Logistics · Documents (Dr. Tracking)

> **Sweep date:** 2026-05-19 · **Branch:** `dave` (post-launch 2026-05-17)
> **Owner:** Dr. Tracking (R&D agent)
> **Audience:** post-launch Phase 1/2 roadmap — Pacred is live; this doc identifies the gap between *what ships today* and *what owner asked for* in the tracking/logistics/document domain.
>
> **Lens applied to every recommendation:**
> *"Does this make it easier for a customer to see their stuff on one screen?"*
>
> If the answer is "no", it's tagged Tier 3 or moved out of scope.

---

## 0. TL;DR (read this first)

1. **The bones are good.** Container-centric spine (`cargo_containers` / `cargo_shipments` / `cargo_shipment_tracking` / `cargo_container_status_history`) is shipped + RLS-correct + atomic-cascade RPC + freshness pill + V-E10 QA inspection panel + V-D4 received-vs-expected progress bar. The customer detail page (`/shipments/[code]`) is the most polished single tracking surface in any logistics company we have seen at this stage. ภูม built it well.
2. **But the spine has 5 missing arms.** (a) No **unified customer landing** ("ของฉันทุกชิ้น" single screen) — `/shipments` exists but is invisible from the dashboard 9-icon grid; (b) no **public tracking link** (no-login, share-by-link) — the highest-leverage marketing surface in any logistics product; (c) no **MOMO sync running** (W-4: code scaffolded, cron unwired → every container is hand-typed); (d) no **map/timeline visualisation** (the timeline is text-only — China truck route + Mukdahan border + TH port has no visual); (e) no **document lifecycle** view ("invoice issued? Form E ready? customs cleared?" — these documents exist as separate admin pages but the customer's tracking page never surfaces them).
3. **The owner's #1 ask = customer-facing unified tracking** — answer the LINE chat question *"ตู้ X เข้าเมื่อไหร่"* in 1 click instead of a chat message. T-1 in this doc directly attacks that. It is shippable in ~10h (high ratio).
4. **Documents are scattered across 5 admin pages** (forwarder receipt · service-order receipt · tax invoice · freight invoice · freight quote · Form E placeholder · D/O placeholder). Customer sees only forwarder + tax invoice. The unified-tracking page needs a "documents" tab.
5. **Public tracking link** (T-2) is the most under-rated SEO + viral move: a customer pastes `/track/SH-GZE260516-PR005-01` into LINE → recipient sees the timeline + Pacred brand + CTA without logging in. Every freight company that scales has this. Pacred doesn't.

---

## 1. Current state — what's shipped

### 1.1 The container-centric spine (migration 0033 + 0040 + 0042 + 0059 + 0078)

| Table | Shipped | RLS | Purpose |
|---|---|---|---|
| `cargo_containers` | ✅ | customer reads via shipment ownership · admin via `is_admin(['super','ops','warehouse'])` | physical truck/sea/air unit |
| `cargo_shipments` | ✅ | customer reads own (`profile_id = auth.uid()`) · admin writes | one customer's portion of a container — links to `forwarders.f_no` or `service_orders.h_no` |
| `cargo_shipment_tracking` | ✅ | customer reads via parent shipment ownership · admin/driver writes | per-shipment event timeline (scan_receive / scan_pack / scan_seal / scan_unload / etc.) |
| `cargo_container_status_history` | ✅ | admin-only read+write | high-level container state log |
| `cargo_sacks` (0068) | ✅ | admin-only | MOMO sack-level rollup (the L-3 reconciliation key) |
| `freight_shipments` (0050) | ✅ | per-row | freight (FCL/LCL single-consignee) parallel spine |
| `freight_qa_inspections` (V-E10) | ✅ | customer reads own | QA/QC pass/fail/damage — surfaced on shipment detail page |

**Status enum (cargo_shipments):**
`received_cn → packed_cn → sealed_in_container → in_transit → arrived_th → unloaded → out_for_delivery → delivered`

**Status enum (cargo_containers spine):**
`packing → sealed → in_transit → arrived → unloading → closed`

**Cascade RPC (migration 0078, P1-5 fix):** `cascade_container_status(container_id, status, admin_id)` — SECURITY DEFINER, atomic, forward-only, writes audit rows. When admin flips a container's status, the RPC cascades atomically to:
- every shipment in the container (per `CONTAINER_TO_SHIPMENT` map)
- the parent forwarder (per `SHIPMENT_TO_FORWARDER` map)
- the parent service_order (per `SHIPMENT_TO_SERVICE_ORDER` map — only on delivered → completed)

This is one of the strongest pieces of code in the repo. If any hop fails, the whole TX rolls back — no half-state.

### 1.2 Customer-side tracking surfaces

| Route | Purpose | Quality | Discoverable from |
|---|---|---|---|
| `/shipments` | List of customer's cargo shipments (cards · freshness pill · per-shipment status badge · transport-mode icon · ETA · received/expected box count + progress bar) | 🟢 strong — best polish in the repo | sidebar (yes); dashboard 9-icon grid (**NO**) |
| `/shipments/[code]` | Single shipment detail (hero status · container card · QA panel · received/expected progress · timeline newest-first · freshness pill · stale-data nudge) | 🟢 strong — only place that shows the full timeline | from `/shipments` only (no direct link from forwarder or service-order detail) |
| `/service-import/[fNo]` | Forwarder (cargo-import) detail | 🟢 — has WHT-upload panel, delivery-ack panel | dashboard grid (yes via "ฝากนำเข้า" icon) |
| `/service-import/[fNo]/receipt` | Forwarder receipt PDF | 🟢 | from forwarder detail |
| `/service-order/[hNo]` | China-shop order detail | 🟢 | dashboard grid (yes via "ฝากสั่ง" icon) |
| `/freight/page.tsx` + `/freight/shipments/[id]` | Freight (FCL/LCL) — separate from cargo spine | 🟡 V-E6 V1 shipped — quotation works; PDF + customer portal polish pending | sidebar (yes); dashboard grid (**NO**) |

**Verdict:** the *content* is there. The *discoverability* is not.

### 1.3 Customer self-service (U4-3a, migration 0073)

`forwarders.acknowledged_at` + `service_orders.acknowledged_at` columns + `<DeliveryAckPanel>` component:
- After status = `delivered` (forwarder) or `completed` (service order), the customer can press "ยืนยันรับสินค้าครบถ้วน" + optional note ("ของครบดี" / "กล่อง 3 บุบเล็กน้อย").
- Closes the "ของถึงไม่ครบ chasing" leak.
- Not surfaced on `/shipments/[code]` directly — only on the parent forwarder / service-order page.

### 1.4 Admin tracking surfaces

| Route | Status | Notes |
|---|---|---|
| `/admin/warehouse/containers` | 🟢 spine-list with status filter chips, mode filter, code-search, ตัดตู้ visibility, shipment count per container | the right shape; used by ops + warehouse roles |
| `/admin/warehouse/containers/[code]` | 🟢 detail view with status flip + cascade | uses `adminSetContainerStatus` → RPC cascade |
| `/admin/warehouse/qa-inspections` | 🟢 V-E10 inspection list + per-shipment QA record | freshly-shipped, customer-visible status flows through |
| `/admin/warehouse/bulletin` | 🟢 daily container summary auto-generator (W-1 from chat-analysis) | LINE-pasteable format |
| `/admin/containers` | 🟡 legacy 0016 phase-H page still alive (read-only) | U1-1 unify migration 0059 mirrors legacy rows into spine — still need to sunset the legacy UI |
| `/admin/forwarders/bulk-search` | 🟢 multi-line tracking paste (preserves the W-9 PHP `forwarder-search-muti.php` pattern) | 200 numbers per submit |
| `/admin/driver-runs` | 🟢 CT-7 driver landing — own assignments + accept/complete buttons | self-row only via RLS |
| `/admin/barcode` | 🟢 camera + manual entry barcode scanner (BarcodeDetector API · 3 modes: intake/prepare/driver · beep · session log) | mobile-first design |
| `/admin/freight` + sub-routes | 🟢 V-E6 quotation V1 + V-E1 invoice V1 shipped | freight admin journey works end-to-end up to delivered |

**Verdict:** admin coverage is dense. Notable strengths: (a) atomic cascade RPC; (b) bulk-search; (c) barcode scanner with native `BarcodeDetector` (no JS library); (d) ตัดตู้ deadline visibility on the container list.

### 1.5 Partner integrations

| Partner | Status | Direction | Token |
|---|---|---|---|
| **MOMO JMF** (cargo container warehouse partner) | 🔴 **scaffolded but not running** | Pacred pulls (`GET` only) — 3 endpoints (`import/track`, `container/closed`, `sack/get/info`) | JWT in `.env.local` since 2026-05-16; `MOMO_JMF_BASE_URL` confirmed `https://api.momocargo.com:8080` |
| **TAMIT** (product API for 1688/Taobao) | 🟢 wired (lib/china-search) | Pacred pulls | no auth |
| **AkuCargo** (keyword + image search) | 🟢 wired | Pacred pulls | no auth |
| **Laonet** (image-similar) | 🟢 wired | Pacred pulls | email-as-key |
| **JMFCARGO** (sister cargo company) | 🔴 not wired | Pacred PUSH on shipment-changes (PHP did this) | legacy concat token |
| **CargoThai TTP/CN** (container API) | 🔴 not wired | Pacred PULL container details by SM code | legacy `_token` query param |
| **DBD juristic person** | 🟢 wired (`app/api/dbd/[taxId]`) | Pacred pulls | no auth |
| **LINE Messaging API** (push) | 🟢 channel + token set 2026-05-14 | Pacred pushes | OA channel `2009931373` |

**The big one: MOMO sync is scaffolded but not running.** `lib/integrations/momo-jmf/{client.ts, sync.ts, types.ts}` exist; the spec doc `momo-jmf-api-spec.md` is correct. But:
- No cron registered in `vercel.json`
- No upsert loop in `sync.ts`
- No webhook receiver
- No `cargo_containers.reconciliation_note` column for the L-3 ≥5% sack-CBM gap
- So **every container is currently hand-entered by warehouse staff** — chat-analysis L-2 ("Tracking ↔ container sync — manual, lagging, error-prone") is still a live wound.

This is `W-4` in PORT_PLAN. From a tracking-domain lens it is the #1 *backend* blocker — without it the customer's tracking page can never show *fresh* data.

### 1.6 Document lifecycle today

| Document type | Where it's generated | Where customer sees it | Where admin sees it |
|---|---|---|---|
| Forwarder receipt (cargo-import) | `@react-pdf` server-render | `/service-import/[fNo]/receipt` | `/admin/forwarders/[fNo]` |
| Service-order receipt (China-shop) | `@react-pdf` server-render | `/service-order/[hNo]` (link) | `/admin/service-orders/[id]` |
| Tax invoice (ใบกำกับภาษี, RD Code 86) | server-render (ADR-0006 + migration 0034) | request-panel component on portal | `/admin/tax-invoices/[id]` |
| WHT 50-ทวิ upload (V-A6) | customer uploads | `<CustomerWhtUploadPanel>` on portal | admin gates receipt issuance |
| Freight invoice (V-E1, A{YY}NNNNN) | shipped V1 | not yet on portal | `/admin/freight/[id]` |
| Freight quotation (V-E6) | shipped V1 | not yet on portal | `/admin/freight/quotes/[id]` |
| Form E (V-E3 — ASEAN-China FTA C/O) | **not built** | — | — |
| D/O exchange letter (V-E4) | **not built** | — | — |
| Customs declaration ใบขนสินค้า (V-E11) | **not built** (internal-only V2) | — | — |
| Packing list | extends Invoice (V-E1) | — | — |

**Verdict:** the document set is fragmented across many routes; there is no per-shipment "documents tab" that gathers them all. Customers asking "ของฉันออกใบกำกับภาษีหรือยัง" still has to click through 3 different routes to find out.

### 1.7 ETA + maps + photos

| Capability | Status |
|---|---|
| ETA on container | ✅ `cargo_containers.eta` (date column) — hand-typed by warehouse |
| ETA computation from origin + transit time | 🔴 **not implemented** — no rules engine; staff manually pick a date |
| Map of journey (CN warehouse → Mukdahan / Laem Chabang → TH warehouse → customer) | 🔴 **not implemented** — only text labels in the timeline |
| Photo proof on scan events | 🔴 **not implemented** — `cargo_shipment_tracking` has no `photo_url` column |
| Photo proof on delivery (signature / parcel-handed-over photo) | 🔴 **not implemented** |
| Damage photos | 🟢 via QA inspection (V-E10) — can attach via `freight_qa_inspections` |
| Public tracking by reference code (no login) | 🔴 **not implemented** |

---

## 2. Gaps

> Ranked by the lens: *"does this make it easier for a customer to see their stuff on one screen?"* — 🟢 = directly attacks that · 🟡 = strong indirect impact · 🟪 = backend prerequisite

### 2.1 GAP-TR-1 — Unified customer tracking landing 🟢 (the #1 ask)

**Symptom.** Customer logs into Pacred → dashboard shows a 9-icon launchpad copied from PCS Cargo. Tracking is **not on the grid**. The only ways to reach the unified tracking view (`/shipments`) are: (a) sidebar (which is hidden on the mobile launchpad), (b) typing the URL. Most customers will never find it.

**Evidence.**
- `components/sections/pcs-icon-grid.tsx` — 9 tiles: shop · import · receipts · payment · wallet · top-up · withdraw · address · logout. No tracking tile.
- chat-analysis L-2: "Tracking ↔ container sync — manual, lagging, error-prone" was the #1 chat-frequency leak.
- chat-analysis pain theme #1: "ตู้ X เข้าเมื่อไหร่" — the most common single question across all groups.

**Owner's intent.** "ติดตามตู้สินค้า · ติดตามชิปเม้น · ติดตามสินค้า · ติดตามสถานะเอกสาร" — one screen. Today this requires 4 separate clicks across 3 unconnected routes.

**Gap.** No single screen where the customer sees:
- Active shipments (today's `/shipments` cards) — ✅ exists
- Active forwarders (cargo-import orders) — only on `/service-import`
- Active service-orders (China shopping) — only on `/service-order`
- Active freight jobs — only on `/freight`
- Outstanding documents (tax invoice pending? receipt available? Form E ready?) — scattered
- Most-recent activity / fresh events — ✅ on `/shipments` but stops there

### 2.2 GAP-TR-2 — Public tracking link (no login) 🟢

**Symptom.** Customer texts a colleague: "ตู้ของเรามาถึงไหนแล้ว?". The colleague has no Pacred account. There is no public link to share.

**Standard.** Every freight company that scales has this — DHL, FedEx, J&T, Flash. Paste `https://track.dhl.com/AWB12345` into any chat → see the timeline + ETA + carrier brand + CTA, no login.

**Why it matters for Pacred.**
- LINE-paste viral surface — every shared link is a brand impression.
- SEO surface — public tracking pages rank for "[carrier name] tracking" + "ตู้ GZE260516-1".
- Customer acquisition — colleague sees the timeline, eventually becomes a customer.
- Recipient (sometimes the actual end-customer, not the importer) gets a self-serve experience.

**Gap.** No `/track/[code]` public route exists. No tracking-link share button on the protected page either.

### 2.3 GAP-TR-3 — MOMO sync not running 🟪

**Symptom.** Container statuses in the customer's `/shipments` page only move when a warehouse staff member manually clicks "in_transit" → "arrived". MOMO has live data; we are not pulling it.

**Evidence.** [`docs/integrations/momo-jmf-api-spec.md`](../../integrations/momo-jmf-api-spec.md) §3.1 lists 4 files needed: `client.ts` (✅) + `types.ts` (✅) + `sync.ts` (🔴 body stubbed) + `reconcile.ts` (🔴 missing). PORT_PLAN W-4 (P0).

**Why it's a tracking-domain blocker.** Without MOMO sync, the customer's freshness pill always shows "stale" or "very-old" unless a human staff member taps the status flip every few hours. The whole point of the freshness UX (U1-7) — "ข้อมูลล่าสุด: 5 นาทีที่แล้ว" — depends on a sync running.

### 2.4 GAP-TR-4 — Document lifecycle visibility 🟡

**Symptom.** Customer ปอน asks "ใบกำกับภาษีของตู้ GZE260507-1 ออกหรือยัง?". Today she has to: (a) open the forwarder · (b) check the receipt tab · (c) separately open the tax-invoice request panel · (d) email/chat ทีม if it's not visible. The shipment detail page does NOT surface documents.

**Gap.** No "documents" tab on `/shipments/[code]` or `/service-import/[fNo]`. The data exists (multiple tables); the UI doesn't join them.

### 2.5 GAP-TR-5 — Per-event photo proof 🟡

**Symptom.** Customer reports "กล่อง 3 บุบ" via U4-3a delivery-ack. Staff have no photo on file to dispute / approve. QA inspection (V-E10) covers it after-the-fact for freight; cargo per-scan events have no `photo_url`.

**Gap.** `cargo_shipment_tracking` has no `photo_url` column. Driver-run completion has no signature photo. Intake scan has no carton photo.

### 2.6 GAP-TR-6 — Map visualisation 🟡

**Symptom.** Customer sees "in_transit · 📍 Mukdahan" as text. No visual of the China truck route → Vietnam-Laos transit → Mukdahan border → BKK warehouse.

**Gap.** Timeline is text-only. No map layer. (Note: this is a "polish later" gap — the operational value is low; the trust value is moderate. Use this for marketing pages too, not just tracking.)

### 2.7 GAP-TR-7 — ETA computation 🟡

**Symptom.** ETA is hand-typed at container-create time. When the container slips (boat delayed, customs hold), nothing recomputes. Customer sees the stale ETA.

**Gap.** No rules engine for ETA. Should be: `eta = sealed_at + transit_lead_time[transport_mode][origin→destination] + customs_buffer + last_mile_lead_time`. Then auto-shift when sealed_at changes.

### 2.8 GAP-TR-8 — Missing-item / damage report channel 🟡

**Symptom.** `/my-issues` exists but doesn't link from `/shipments/[code]`. Customer who finds a missing box has to navigate away to file. PORT_PLAN W-5 covers refund-with-claim but the claim CHANNEL is half-built.

**Gap.** No "report issue" button on the shipment detail page that pre-fills the issue type + shipment ref.

### 2.9 GAP-TR-9 — Cross-shipment combined view ("ตู้นี้มีของฉันกี่ชิ้น") 🟡

**Symptom.** A customer with 4 shipments in container `GZE260516-1` sees 4 separate cards. There is no "view by container" group that says "ตู้ GZE260516-1 · 4 shipments · 47 boxes · 4.2 CBM total · ETA 2026-05-22".

**Gap.** `/shipments` does not group by container. Adding a `?groupBy=container` toggle is ~2h.

### 2.10 GAP-TR-10 — Public ETA/freshness on landing pages 🟪

**Symptom.** The `/services/import-china` page has no live snippet — no "ขณะนี้กำลังขนส่ง 18 ตู้ · ตู้ล่าสุดเข้าวันที่ 17/05" social proof. The data exists.

**Gap.** Marketing surfaces don't read from the tracking spine. Live counters would build trust + SEO.

### 2.11 GAP-TR-11 — Driver scan flow incomplete 🟡

**Symptom.** `/admin/barcode` scanner exists. `/admin/driver-runs` shows assignments. The two don't connect — a driver can't tap "scan delivery for assignment A2600200036" and have it auto-flip the row + insert tracking event + capture photo.

**Gap.** The barcode scanner is mode-aware (intake/prepare/driver) but driver-mode doesn't capture photo + GPS at delivery time.

### 2.12 GAP-TR-12 — Tracking JSON-LD for SEO 🟪

**Symptom.** Google's structured data for parcel tracking (`ParcelDelivery`) exists. Pacred public tracking pages (when they exist) should emit this so search results show "[Pacred] ตู้ GZE260516-1 · ETA 22 พ.ค. · In transit".

**Gap.** No `ParcelDelivery` schema in `components/seo/schemas.ts`. Would add SEO leverage to GAP-TR-2 once shipped.

### 2.13 GAP-TR-13 — Legacy `public.containers` table coexistence drift 🟪

**Symptom.** Migration 0059 unified data into `cargo_containers` but kept legacy `containers` table read-only. `/admin/containers` legacy UI still alive. Future migration must drop legacy once all readers point at spine.

**Gap.** Cleanup migration not yet authored. Tracked in PORT_PLAN U1-1 follow-up.

### 2.14 GAP-TR-14 — Bulk admin tracking-rebind UI 🟡

**Symptom.** chat-analysis "Re-bind tracking → container" (~10 asks per 6 weeks) currently requires SQL by hand. The admin "ค้นหา tracking หลายเลข" exists but the rebind action does not.

**Gap.** A page that takes (tracking_no list, target container_code) and bulk-attaches.

### 2.15 GAP-TR-15 — `shipment_tracking.photo_url` + Supabase Storage bucket 🟡

**Symptom.** Closely related to GAP-TR-5 but the schema gap is its own task — add column + create `tracking-photos/` bucket + signed URLs + RLS.

### 2.16 GAP-TR-16 — Carrier-handoff tracking (Lalamove / SPX / J&T / Flash) 🟡

**Symptom.** chat-analysis W-8 — Pacred dispatches with Lalamove and other 3rd-party last-mile carriers. Their tracking URL is sometimes pasted into chat. No field captures it on the shipment.

**Gap.** `cargo_shipments.last_mile_carrier` + `last_mile_tracking_url` columns missing.

### 2.17 GAP-TR-17 — Booking-flow → container link 🟪

**Symptom.** `/start-order` lands a quote. The quote → forwarder transition is wired. But the **forwarder → container assignment** moment ("ของคุณถูกจัดเข้าตู้ GZE260516-1 แล้ว") never notifies the customer.

**Gap.** No "container_attached" event fires a LINE push.

---

## 3. Recommendations

> Ranked by the lens. Effort estimates assume ภูม + Tracking-domain-grade work; multiply by 1.5 if it lands during a sprint with a launch.

### Tier 0 — Customer tracking unification (ship next, ~10h total)

#### T-1 — Add "ติดตาม" tile to the 9-icon launchpad + route to `/shipments` (🟢 the #1 ask, ~30min)

**Why first.** The unified view exists. It's just invisible. A 30-minute change makes the entire `/shipments` work discoverable.

**Implementation.**
- Add 10th tile to `components/sections/pcs-icon-grid.tsx`: icon `Truck` (from lucide), tone `text-blue-500`, href `/shipments`, key `tileTracking`.
- Add Thai + English to `messages/th.json` + `messages/en.json` under `pcsHome.tileTracking = "ติดตามสินค้า"`.
- Show unread/in-transit count badge (re-use the wallet badge component) for `received_cn|packed_cn|sealed_in_container|in_transit|arrived_th|unloaded|out_for_delivery` statuses.

**Decision lens.** Direct hit. Highest effort-to-impact ratio in this whole doc.

#### T-2 — Public tracking page `/track/[code]` (🟢 viral + SEO, ~4h)

**Implementation.**
- Route: `app/[locale]/(public)/track/page.tsx` (input form) + `app/[locale]/(public)/track/[code]/page.tsx` (read-only timeline).
- Accept multiple ref formats: `shipment_code` (canonical), `tracking_chn` (forwarders), `tracking_th`, `container.code`, `f_no`, `h_no`. Server action `getPublicTracking(code)` does a discriminated lookup.
- Render **a sanitised version of the timeline** — no customer name, no phone, no profile_id leakage. Only: container code, transport mode, origin → destination, status, ETA, public events (scan_pack / scan_arrive / scan_deliver — not internal staff notes).
- Brand the page — Pacred logo + slogan + LINE OA CTA + "สมัครเพื่อดูทั้งหมด" sign-up CTA.
- Emit `ParcelDelivery` JSON-LD (T-7 below).
- Rate limit by IP — 60 calls per minute (use existing rate-limit lib).
- Mobile-first — most people open these links from LINE.

**Decision lens.** Direct hit. Marketing leverage compounds — every share = brand impression.

#### T-3 — "Combined active" landing widget on `/dashboard` (🟢, ~2h)

**Implementation.**
- New section on `/dashboard` titled "📦 กำลังเดินทาง" between the wallet card and the icon grid.
- Server-aggregate count: open shipments + open forwarders + open service-orders + open freight (statuses NOT IN `delivered|closed|cancelled|completed`).
- Three big tiles: "ตู้กำลังเดินทาง", "พัสดุที่ปลายทาง", "เอกสารที่รอ".
- Each tile links to a pre-filtered view of `/shipments`.

**Decision lens.** Direct hit. Becomes the "single screen" the owner asked for, at the entry point.

#### T-4 — `/shipments` group-by-container toggle (🟢, ~2h)

**Implementation.**
- Add `?groupBy=container` query param to `/shipments`. When set, group shipment cards by `container.code` — show a container summary card with: code, transport_mode, ETA, # of shipments, total boxes/CBM, status — and a nested expandable list of the customer's shipments inside it.
- Default to ungrouped (current view); admin sidebar links to grouped.

**Decision lens.** Direct hit. Answers "ตู้ของฉันมีกี่ชิ้น" inline.

#### T-5 — "Documents" tab on `/shipments/[code]` (🟡, ~3h)

**Implementation.**
- Below the timeline, add a "📄 เอกสาร" card with rows for each linked document:
  - Forwarder receipt → "พร้อมดาวน์โหลด" + link to `/service-import/[fNo]/receipt`
  - Service-order receipt
  - Tax invoice → status pill: "ออกแล้ว" / "รออัพโหลด 50 ทวิ" / "ยังไม่ขอออก" + request button
  - Freight invoice (if `freight_shipment_id` set)
  - Freight quotation
  - WHT 50-ทวิ upload state
  - QA inspection report (✅ exists, just surface here too)
  - Form E (later — V-E3)
  - D/O letter (later — V-E4)
- Each row: status pill + action link. Server action `getShipmentDocuments(shipment_id)` joins forwarders + service_orders + tax_invoice_requests + freight tables in one query.

**Decision lens.** Direct hit. Closes the "ใบกำกับภาษีออกหรือยัง" leak.

### Tier 1 — Backend prerequisites (≤2 weeks)

#### T-6 — Wire MOMO JMF sync (🟪 the freshness pre-condition, ~12h = PORT_PLAN W-4)

This is already specced in `momo-jmf-api-spec.md` §3 and listed as W-4 in PORT_PLAN. Re-stated here only to flag it as a tracking-domain blocker. **Without it, the `/shipments` freshness pill stays "very-old" most of the time.**

**Sequence.**
1. `sync.ts` upsert loop (pulls `container/closed` + `import/track` + `sack/get/info`)
2. `reconcile.ts` per-sack outside-vs-inside diff
3. `app/api/cron/momo-jmf-sync/route.ts` wrapped in `instrumentCron()`
4. 7th cron in `vercel.json` (`*/15 * * * *`)
5. Migration `0081_momo_reconciliation` — add `cargo_containers.reconciliation_note text`

**Tracking-domain "would be nice":** also implement webhook receiver `/api/webhooks/momo-jmf/status` for push events, but the spec doc says MOMO might be pull-only — confirm in MOMO-1 call (open question §3.5).

#### T-7 — `ParcelDelivery` JSON-LD on public tracking + service landing pages (🟢, ~1h)

**Implementation.**
- Add `parcelDeliverySchema(shipment)` to `components/seo/schemas.ts`. Schema fields per [schema.org/ParcelDelivery](https://schema.org/ParcelDelivery): `trackingNumber`, `trackingUrl`, `carrier` (Pacred), `originAddress`, `deliveryAddress` (sanitised), `expectedArrivalUntil`, `deliveryStatus` (in_transit / available / in_progress / delivered).
- Emit on `/track/[code]` (paired with T-2).
- Also emit on `/services/import-china` aggregate stat snippets.

**Decision lens.** Indirect hit. Pacred-as-carrier shows up in Google parcel-tracking widgets when someone googles a container code.

#### T-8 — Photo proof column on `cargo_shipment_tracking` + tracking-photos bucket (🟡 GAP-TR-5/15, ~3h)

**Implementation.**
- Migration `0082_tracking_event_photo.sql`: `alter table cargo_shipment_tracking add column if not exists photo_url text`.
- New Supabase Storage bucket `tracking-photos/` — RLS: warehouse + driver + ops can upload; customers read via shipment ownership.
- Wire `/admin/barcode` driver mode to capture from camera (the BarcodeDetector + getUserMedia is already there — re-use the stream).
- Surface in customer `/shipments/[code]` timeline events.

**Decision lens.** Trust-building. Customer sees the actual photo of their carton being unloaded.

#### T-9 — Tracking-link share button on `/shipments/[code]` (🟢, ~1h)

**Implementation.**
- "Share" button below the hero status card. Uses `navigator.share()` on mobile (Web Share API) + clipboard fallback on desktop. Copies the **public** `/track/[shipment_code]` link.
- Pairs with T-2.

**Decision lens.** Direct hit. The customer's natural flow ("ส่งให้คนรับ") becomes one-tap.

#### T-10 — Carrier-handoff tracking field (🟡 GAP-TR-16, ~2h)

**Implementation.**
- Migration `0083_cargo_shipments_last_mile.sql`:
  ```sql
  alter table cargo_shipments
    add column if not exists last_mile_carrier text,
    add column if not exists last_mile_tracking_url text,
    add column if not exists last_mile_dispatched_at timestamptz;
  ```
- Admin can fill via cargo-shipment detail page. Customer sees an outbound-link button when `last_mile_tracking_url is not null`.
- Add to the QA-flow-simulator checklist.

**Decision lens.** Closes a real chat-analysis gap (W-8 Lalamove dispatch). Sets up integrations for SPX/J&T when those carriers come online.

#### T-11 — `cargo_shipments.last_seen_at` + freshness sort (🟡, ~1h)

**Implementation.**
- Computed via a `last_seen_at` denorm on insert/update of `cargo_shipment_tracking` (a trigger pattern that already exists in this repo). Lets us sort the `/shipments` list by "most recent event" rather than `created_at`.
- Surface "freshly updated" badge on cards updated <15min ago.

**Decision lens.** Continues the freshness-trust UX line.

#### T-12 — Issue-reporting CTA on `/shipments/[code]` (🟡 GAP-TR-8, ~1.5h)

**Implementation.**
- "🚨 รายงานปัญหา" button at the bottom of the timeline.
- Routes to `/my-issues/new?shipment_id=<id>&type=damage|missing|delay`.
- Pre-fills shipment code + photos picker.

**Decision lens.** Closes the loop on the "ตกหล่น" pain theme (chat-analysis #6).

### Tier 2 — Visualisation + intelligence (later)

#### T-13 — Map visualisation on `/shipments/[code]` (🟡 GAP-TR-6, ~6h)

**Implementation choice — recommend Mapbox over Google Maps.**

| Aspect | Mapbox | Google Maps |
|---|---|---|
| Price (≤50k loads/month) | free | free (300k loads/month for "dynamic maps", but stricter quotas elsewhere) |
| Static map API (server-rendered tiles) | excellent — `mapbox-gl-static` + GeoJSON polyline | OK but heavier-weight |
| Customisation (Pacred red theme + minimal POIs) | strong | weaker |
| Static-image fallback (for PDF receipts) | trivial | trivial |
| Asia-Pacific coverage | good | best |
| Privacy / no tracking JS | toggle-able | tracks heavily |
| Vendor lock-in | low (open-source stack) | high |

**Recommendation:** Mapbox. Pacred's brand fits the Mapbox theme better; the budget is well within free tier; no Google-tracking JS leaks; and static tiles can be used in PDFs (receipt journey-map).

**Scope.**
- Static-map widget on `/shipments/[code]` showing a polyline: origin warehouse → border crossing → destination warehouse → customer.
- Marker positions interpolated from `cargo_shipment_tracking` events (the latest `scan_*` location → place an "🚛 here" marker).
- Don't try real-time GPS — too complex; we don't have it.
- Use simplified routes (manual stored polyline per `(origin, destination, transport_mode)` triple in a new `route_paths` table; not actual road-routing).

**Decision lens.** Trust amplifier; not a unification fix. Tier 2.

#### T-14 — ETA recomputation rules engine (🟡 GAP-TR-7, ~4h)

**Implementation.**
- Table `transit_lead_times`: `(origin text, destination text, transport_mode text, business_days int)`.
- Function `computeEta(container)`: `eta = COALESCE(sealed_at, packed_at) + transit_lead_time + 1d customs buffer + 1d last-mile`.
- Auto-recompute when `sealed_at` changes (trigger).
- Display "ETA · เลื่อน 2 วันจาก 20/05" if the auto-ETA differs from the hand-typed one.

**Decision lens.** Subtle trust. Tier 2.

#### T-15 — Public service landing live counters (🟪 GAP-TR-10, ~2h)

**Implementation.**
- Add `<LiveTrackingStats />` to `/services/import-china`: "ขณะนี้กำลังขนส่ง 18 ตู้ · ตู้ล่าสุดเข้าวันที่ 17/05 · ลูกค้าใหม่ 23 คนสัปดาห์นี้".
- Server-aggregate; cache 5min; use the existing `lib/cron/instrument.ts` pattern.

**Decision lens.** SEO + trust. Tier 2.

#### T-16 — Container `last MOMO sync` pill on admin warehouse list (🟪, ~1h)

**Implementation.**
- Surface `cargo_containers.updated_at` filtered by `source = 'momo'` as a freshness pill on `/admin/warehouse/containers`. Helps ops see when a sync is failing without opening the cron-health panel.

**Decision lens.** Operational hygiene. Tier 2.

#### T-17 — Admin tracking-rebind bulk UI (🟡 GAP-TR-14, ~3h)

**Implementation.**
- `/admin/warehouse/containers/[code]/rebind` — paste a multi-line list of tracking numbers + select target container + bulk-attach.
- Audit each rebind.
- Companion to T-6 (MOMO sync) — when MOMO misses a parcel.

**Decision lens.** Closes a recurring chat ask (~10/6 weeks). Tier 2.

### Tier 3 — Document generators (V2 long phase)

These are already in PORT_PLAN as V-E3 / V-E4 / V-E11 — re-stated here so the tracking-domain story is complete.

| Doc | Task | Lib choice |
|---|---|---|
| Form E (ASEAN-China FTA C/O) | V-E3 | @react-pdf (already in repo) |
| D/O exchange letter (sea) | V-E4 | @react-pdf |
| ใบขนสินค้า / Customs declaration (internal V2) | V-E11 | @react-pdf |
| Customs Trader Portal integration | future Phase III | TBD |

**Library decision: continue with `@react-pdf`.** We considered Puppeteer/Chromium-headless (for HTML→PDF) but it's heavier on Vercel functions and Pacred's Sarabun-font rendering pipeline already works. Stay on @react-pdf.

### Tier 3.5 — Driver completion flow polish (🟡 GAP-TR-11, ~4h)

**Implementation.**
- Wire `/admin/driver-runs` "complete" action through `/admin/barcode` driver-mode scanner.
- Capture: photo of carton at delivery, GPS coordinates, signature canvas, customer-name input.
- Write to `cargo_shipment_tracking` with `event='scan_deliver'`, `photo_url`, `note` containing the GPS + signature path.

**Decision lens.** Operational quality. Tier 2/3.

---

## 4. Deeper research

### 4.1 What every great logistics tracking page does (research synthesis)

Open the great consumer tracking pages — DHL, FedEx, Maersk, J&T, Lalamove — and they all share these structural elements:

1. **Hero status** ("Out for delivery · ETA 5pm today")
2. **Progress bar** with milestones (5-7 steps max)
3. **Map** (some show real-time vehicle position; most show route polyline)
4. **Timeline** (newest first, with location + timestamp)
5. **Documents tab** (invoice, packing list, customs, proof of delivery)
6. **"Where is my package now?"** answer at-a-glance
7. **Share button** (public link)
8. **Contact carrier** (chat / phone)
9. **Action buttons** (reschedule · change address · report issue · request signature waiver)
10. **ETA reasoning** ("Delayed by customs hold" / "On schedule")

Pacred has 1, 2 (partial), 4, fragment of 5, 9 (issue-report, but disconnected), and almost-10 (the U1-7 freshness pill is in the family). **Missing:** 3, 6 (no instant-answer summary line), 7, 8.

**Recommendation:** the order of investment is 1 → 6 → 5 → 7 → 8 → 3. Map (3) is last because it's pretty but the *informational* value is lowest.

### 4.2 Schema decision — should we add an event-type taxonomy?

Today `cargo_shipment_tracking.event` is a free-text column. Real values seen: `scan_receive`, `scan_pack`, `scan_seal`, `scan_depart`, `scan_arrive`, `scan_unload`, `scan_deliver`. The customer page has a label map for each.

**Issue.** MOMO sync may insert events with different names. Without a CHECK constraint, the label map silently misses unknown values.

**Recommendation.** Add a CHECK constraint or enum-table for event types. Migration `0084_cargo_event_taxonomy.sql`:

```sql
create table if not exists public.cargo_event_types (
  event       text primary key,
  label_th    text not null,
  label_en    text not null,
  customer_visible boolean not null default true
);
-- seed: scan_receive, scan_pack, scan_seal, ..., scan_deliver,
--       momo_sync, customs_hold, container_split, etc.

alter table cargo_shipment_tracking
  add constraint cargo_shipment_tracking_event_fk
  foreign key (event) references cargo_event_types(event);
```

Why a table not an enum: easier i18n + admin can add events without a migration.

### 4.3 Mapbox vs Google Maps deep dive

(Decision in §3 T-13 — Mapbox.) Additional context:
- Mapbox uses a vector style + GeoJSON; we can theme the map in Pacred-red + grey out unused countries → very polished look.
- Mapbox static image API is **trivial** to embed in @react-pdf receipts: a "delivery journey" map at the bottom of every cargo receipt would be a powerful trust signal.
- Mapbox is open-source — the day Vercel adds an MCP for Maps, Pacred has zero vendor lock-in.
- Google Maps' main edge is *real-time* (traffic) — irrelevant for Pacred's grain (week-level transits).

### 4.4 Barcode / QR generation — should we move beyond `qrcode` lib?

We use `qrcode` (1.5.4) — fine for static QR (PromptPay etc.). For tracking-label printing (per-box stickers with `CG000231541-001` barcode), recommend:
- Add `bwip-js` (server-side barcode rendering, multi-format) — Code 128 for box labels, Code 39 for legacy CG codes, QR for newer.
- Render server-side via @react-pdf as image-embeds.
- Owner ask: printable labels for warehouse staff to slap on cartons during ตัดตู้.

Effort: ~4h to add label generator at `/admin/warehouse/containers/[code]/labels`.

### 4.5 Real-time push — Supabase Realtime or SSE?

Today the customer's `/shipments` page is a Server Component — no live updates. Customer has to refresh.

Two options:
1. **Supabase Realtime** — subscribe to `cargo_shipment_tracking` inserts on the customer's shipments. Pros: turn-key. Cons: a `'use client'` component is needed for the badge updates; the customer's tab has to be open.
2. **LINE OA push on milestone events** — already wired (`lib/notifications/index.ts`). The owner's chat preference is LINE OA, not the web — so this is probably the higher-leverage path.

**Recommendation.** Both, but in this order: (a) ensure LINE OA push fires on every customer-visible milestone (sealed_in_container · arrived_th · out_for_delivery · delivered) — verify this is the case (low effort, high impact); (b) add Realtime for the in-portal live badge counter (medium effort, modest impact).

### 4.6 Partner integration resiliency

Coordinate with Backend Dr. — both domains share the need for retry/circuit-breaker on outbound HTTP calls.

Specific to tracking:
- MOMO API returns 401 → don't retry; alert ops to refresh token.
- MOMO API returns 5xx → retry with exponential backoff, max 3.
- MOMO API returns 200 but JSON parse fails → log + skip; do not poison `cargo_containers` with garbage.
- Per-sack endpoint missing for a known container → flag `reconciliation_note = 'sack_data_missing'`.

### 4.7 Document generation pipeline

Today: `@react-pdf/renderer` + Sarabun font + server-side render in a Next 16 route handler.

Concerns:
- @react-pdf has poor support for variable-width tables (the Packing List has 6-10 columns of varying widths). Workaround: render at fixed widths; truncate gracefully.
- Form E (V-E3) has a 12-box specific layout — going to need ~6-8h to pixel-match the gov form.
- D/O letter (V-E4) is the simplest — a normal A4 letter format.

**Alternative considered: Puppeteer/Chromium-headless.** Render HTML to PDF. Pros: easier CSS, full Sarabun + variable columns. Cons: Vercel function size + 30s cold-start risk + serverless concurrency cost. **Reject** — sticking with @react-pdf is the right call.

### 4.8 China-carrier API integrations (SF / YTO / Yunda)

The chat-analysis identified W-5 (tracking number batch ingest from WeChat) — China warehouse staff post 100+ tracking nrs in WeChat → manually parse → admin SQL.

Direct integration with China carriers (SF Express / YTO / Yunda / STO) is **not** the right move for Pacred V2. Reasons:
- The China-side workflow is WeChat-centric; the carriers' tracking APIs are mostly Chinese-language + B2B-contract gated.
- MOMO is our intermediary; let them aggregate the data and push it to us.
- Direct integration would duplicate MOMO's work.

**However:** when Pacred grows, this becomes a Tier 3 V3 task. Pacred-DPX could integrate at the carrier level.

### 4.9 Tracking-link share — implementation note (Web Share API)

`navigator.share({ title, text, url })` is supported on iOS Safari, Android Chrome, and desktop Edge/Chrome (with fallback to clipboard on the rest). Will gracefully degrade:

```tsx
async function share() {
  const url = `${origin}/track/${shipment.code}`;
  if (navigator.share) {
    await navigator.share({ title: 'Pacred · ติดตามสินค้า', url });
  } else {
    await navigator.clipboard.writeText(url);
    toast('คัดลอกลิงก์แล้ว');
  }
}
```

Surface a "Share" button on `/shipments/[code]` and on every order detail page that has a tracking ref.

### 4.10 Tracking timeline library choice

Today the timeline is hand-coded HTML/CSS (ordered list with absolute-positioned dots + before-pseudo-vertical-line). It works. We **do not** recommend adopting `react-vertical-timeline-component` or any 3rd-party library — the hand-coded version is leaner, easier to mobile-tune, and matches the Pacred theme tokens.

If we later add per-event photo carousel, we'd add a tiny `<EventPhotoGrid>` component — no library needed.

### 4.11 Customer authentication for public tracking

If we ship T-2 (public `/track/[code]`), we need to *not* leak PII:
- Don't show customer name. Do show "ลูกค้า PR0***" (last 4 masked).
- Don't show customer phone or address.
- Don't show the full forwarder.tracking_chn.
- Do show: container code (it's public anyway), origin → destination, status, ETA, public events.
- Rate-limit by IP (60/min) + by shipment_code (10 views/min to prevent enumeration).
- Add `noindex` meta on the public tracking page (it's still indexable via the `/track/` landing page if we want it).

### 4.12 Cross-domain — what overlaps

| Domain | Overlap with Tracking |
|---|---|
| Backend Dr. | MOMO/JMF retry, schema migrations, cron jobs |
| Customer-portal Dr. | dashboard 9-grid placement; `/shipments` polish |
| Mobile UX Dr. | barcode scanner, signature canvas, GPS capture |
| Marketing Dr. | landing-page live counters, public tracking SEO |
| Admin/Employee Dr. | driver-runs, warehouse, ops, QA inspection roles |
| Billing Dr. | container cost ledger drives margin; tax invoice issuance gates on tracking-delivered |
| DevOps Dr. | MOMO sync as a cron-instrumented job; tracking JSON-LD as SEO instrumentation |

Tracking is the *spine* — every other domain reads or writes through it. The recommendations here should be referenced by every other R&D doc.

### 4.13 What we are NOT recommending (and why)

| Idea | Why not |
|---|---|
| In-app live chat | LINE OA already serves this. Adding another channel = lead split |
| Real-time GPS vehicle tracking | We don't operate the trucks. MOMO doesn't expose it |
| AI ETA prediction (ML) | Not enough data; ETA is dominated by customs which is human-judged |
| Direct China carrier API (SF/YTO/Yunda) | MOMO is the aggregator; duplicate work |
| Tracking widget for embed on customer's own site | B2B feature; not needed pre-launch traction |
| Phone-based tracking IVR | Not in DNA; LINE OA covers it |
| Email tracking digest cron | LINE OA push is the right channel for this market |

### 4.14 Owner-pleaser checklist (deliberate)

Owner asks specifically for "การติดตามทุกอย่างในจอเดียว". The thing that earns the most goodwill in one demo:
1. T-1 dashboard tile (instant — they see it within 30 seconds of demo).
2. T-3 dashboard "กำลังเดินทาง" widget (the unified count is visceral).
3. T-2 public tracking link (the share gesture lands).
4. T-5 documents tab (closes the recurring "ใบกำกับภาษีออกหรือยัง" chat thread).

These four alone = a tracking story that owners can sell.

### 4.15 The L-3 reconciliation reminder

The single most-revenue-protecting tracking task is L-3 (sack-CBM ≥5% gap flag), specced in the MOMO API spec doc. It is NOT a customer-visible feature but it is the only way to stop the GZE260422-1-style "16.79 vs 21.28 CBM" billing dispute that legacy customers complained about for 8 months. Worth flagging here because the tracking-domain spine is where the reconciliation note lives. **Ship as part of T-6 (MOMO sync).**

---

## 5. References

### 5.1 In-repo

- [`docs/architecture/container-centric-model.md`](../../architecture/container-centric-model.md) — the spine ADR
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md) — decoded GZE/GZS + Form E + D/O + cargo-type taxonomy
- [`docs/audit/chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md) — W-1..W-9 workflows, L-1..L-10 leak holes, MOMO canonical status enum
- [`docs/audit/php-pcscargo-integrations.md`](../../audit/php-pcscargo-integrations.md) — TAMIT, JMF, TTP, ThaiBulkSMS legacy wire formats
- [`docs/integrations/momo-jmf.md`](../../integrations/momo-jmf.md) — partner overview
- [`docs/integrations/momo-jmf-api-spec.md`](../../integrations/momo-jmf-api-spec.md) — canonical 3-endpoint spec
- [`docs/PORT_PLAN.md`](../../PORT_PLAN.md) Part V (cargo-forensics V-A..V-H) + Part W (gap-hunt W-1..W-8)
- `actions/admin/warehouse.ts` — atomic cascade RPC caller
- `actions/admin/cargo-shipments*.ts`, `actions/admin/forwarder-drivers.ts`, `actions/admin/freight-shipments.ts`
- `actions/shipments.ts` — customer-side tracking actions
- `lib/warehouse/*` — typed clients
- `lib/integrations/momo-jmf/*` — partner client (scaffolded)
- `app/[locale]/(protected)/shipments/page.tsx` + `[code]/page.tsx` — customer surfaces
- `app/[locale]/(admin)/admin/warehouse/*` — admin surfaces
- `app/[locale]/(admin)/admin/barcode/scan-form.tsx` — barcode scanner (BarcodeDetector API)
- `app/[locale]/(admin)/admin/driver-runs/page.tsx` — driver landing
- `supabase/migrations/0033_containers.sql` — initial spine
- `supabase/migrations/0040_cargo_type_and_carrier_container.sql` — V-D2 + V-D3
- `supabase/migrations/0050_freight_shipments.sql` — V-E1 freight spine
- `supabase/migrations/0059_container_unify.sql` — U1-1 unify
- `supabase/migrations/0073_delivery_acknowledgement.sql` — U4-3a customer self-confirm
- `supabase/migrations/0078_warehouse_cascade_rpc.sql` — P1-5 atomic cascade

### 5.2 External

- [schema.org/ParcelDelivery](https://schema.org/ParcelDelivery) — JSON-LD vocabulary for tracking
- [Web Share API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) — `navigator.share()`
- [Mapbox Static Images API](https://docs.mapbox.com/api/maps/static-images/) — server-rendered tiles
- [BarcodeDetector API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector) — Chrome/Android native barcode reader
- [bwip-js](https://github.com/metafloor/bwip-js) — server-side multi-format barcode renderer
- [@react-pdf/renderer](https://react-pdf.org/) — current PDF stack (keep)

### 5.3 Adjacent R&D docs (this sweep)

- `06-customer-portal.md` — overlaps on `/shipments` polish + dashboard placement
- `01-mobile-ux-scanning.md` — overlaps on barcode scanner enhancements
- `07-admin-employee-portal.md` — overlaps on warehouse + driver + ops roles
- `04-backend-architecture-integrations.md` — overlaps on MOMO sync, retry/circuit breaker, cron infrastructure

---

**End of Dr. Tracking sweep.** The decision lens (*"easier for a customer to see their stuff on one screen?"*) sorted everything; T-1 + T-2 + T-3 + T-5 = the four moves that earn the owner-pleaser title in this domain. T-6 (MOMO sync) is the silent backend pre-condition without which the customer-facing surfaces stay stale. Everything else is polish.
