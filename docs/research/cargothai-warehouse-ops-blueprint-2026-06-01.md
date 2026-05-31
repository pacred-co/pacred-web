# 🏭 CargoThai warehouse-ops — blueprint analysis + Pacred integration plan (2026-06-01)

**Source:** owner+ภูม demo `pacred demo cargothai.html` (217KB SPA · "PCS CARGO New Workflow System").
**What it is:** the China-warehouse WORKER app — Chinese staff receive goods → key shipment + link customer
tracking → measure/weigh → pack small parcels into sacks → close tags → build shipments → load container →
advance status → print stickers/QR/sack-tags/slips/CSV. Multi-branch / multi-warehouse.

**Owner's vision (verbatim intent):** run this at our own China warehouse (hire Chinese workers, close
containers ourselves once queue volume is enough — "อีกไม่กี่เดือน") → then let **partner warehouses log in
as their own role/user** and key everything into OUR system (no external dependency) → **non-partners rent our
API** instead. **USP = real-time status of goods / container / job, anytime, no phone calls — "กินขาดทั้งตลาด."**
Full import-export loop · eco supply-chain system.

---

## §1 — The demo, decoded (blueprint level)

**Views (worker app, 7):** `dashboard` · `receiving` (รับของเข้า) · `dataentry` (ชั่ง/วัด/คีย์) · `sacks`
(งานกระสอบ) · `looseitems` (ของชิ้นเล็ก) · `shipments` (list) · `transit` (โหลดตู้/loading).

**Status flow (7):** `received → completed → ready-to-load → loaded → in-transit → arrived → delivered`
(warehouse-centric: received → keyed/measured → ready → loaded-into-container → shipping → reached-TH → delivered).

**Data model:**
- **SHIPMENT** — `sm_code` (`SM{yyMMdd}-{seq}-{customer_code}`) · `tracking` (China courier) · `customer_code`
  (PCS/TTP + number) · `branch` (TTP / CARGO CENTER / PCS = brand/partner) · `warehouse` (GZ=Guangzhou…) ·
  `transport` (SEA / EK[air, no whole-container] / car) · `status` · `number` · `amount` · `note`.
- **ITEM** — `name` (中文) · `type` (risk-class: 名牌ลิขสิทธิ์B / 普通货物ทั่วไปG / 药和食物อย.F) · `qty` · `dummy_qty`
  · `weight_per_unit` · `width/length/height` → CBM = w·l·h/1e6.
- **SACK** + **SackItem** (`sack_id, item_id, partial qty`) — pack loose items into a sack, auto-pack, print sack tag/QR.
- Calc engine + QR/sticker/slip/CSV print + split/move-back/merge item ops.

**Multi-tenant signal:** branch/warehouse selector + brand-prefixed customer codes (TTP/PCS) → the demo is
already brand/partner-aware (the seam where partner-login + API-lease plug in).

---

## §2 — Maps ONTO Pacred's existing schema (build on data we HAVE, not greenfield)

| Demo concept | Pacred existing | Note |
|---|---|---|
| SHIPMENT | **`tb_forwarder`** (114 cols · 47,636 rows) | `ftrackingchn`=tracking · `fidorco`=customer/order · `fwarehousename` · `fShipBy`=transport · `fstatus`=status · `fcabinetnumber`=container |
| ITEM | **`tb_forwarder_item`** (34 cols) | name · type · qty · weight · w/l/h (CBM cols exist) |
| SACK / SackItem | **`tb_cnt`/`tb_cnt_item`** + **`momo_sack_infos`/`momo_sack_tracks`** | MOMO already models sacks (sack_id, weight, cbm, total_parcel, closed, tracks[]) — exactly the demo's sack |
| status flow | **fstatus** (the 8-stage Pacred flow) | demo's 7 ≈ our รอเข้าโกดังจีน→ถึงโกดังจีน→กำลังส่งมาไทย→ถึงไทย→… |
| branch | the **PCS/TTP/CARGO CENTER brand split** | multi-brand already real in data |
| close-container | **`tb_cnt` cnt-payment + cabinet flow** | the ปิดตู้ ledger exists |
| inbound API (partner→us) | **MOMO/CargoThai/JMF sync** (`lib/integrations/momo-*`, `momo_*` tables) | **this is the INVERSE of what we want to LEASE** — we already CONSUME partner APIs this way; the demo is us PROVIDING that API |

**Conclusion:** ~80% of the data spine already exists. The demo is mainly a **new worker-facing front-end** +
a **multi-tenant + API-provider layer** on top of `tb_forwarder`/`tb_forwarder_item`/`tb_cnt`/`momo_sack_*`.

---

## §3 — What to BUILD (4 layers)

**Layer 1 — Warehouse-worker intake app** (our own China warehouse first).
A fast, scanner-first UI (the demo's 7 views) writing real `tb_forwarder` + `tb_forwarder_item` + sack tables.
Receiving (scan tracking → create/append shipment) · data-entry (weigh/measure → CBM) · sack-pack + tag/QR ·
build shipment → load container (`tb_cnt`) → advance fstatus → print stickers/sack-tags/slips. Mobile/scanner-first
(reuse the barcode/Quagga2 stack already in repo). Branch/warehouse scoped.

**Layer 2 — Multi-tenant partner portal + RBAC.**
Partner warehouses log in as their own tenant (branch/warehouse-scoped) + role (worker/supervisor). Row-level
scoping by `branch`/`warehouse`. Builds on the RBAC overhaul (master-plan P0-1 — recreate admins + proper roles)
+ a new `partner`/`warehouse_user` role class. They key + close containers themselves into our DB.

**Layer 3 — API-as-a-service (lease to non-partners).**
The INVERSE of our MOMO consumption: expose the same endpoints we consume (`import/track`, `container/closed`,
`sack/info`) as a PROVIDER — issued API keys, per-tenant scoping, rate-limit (Upstash Redis already in env),
usage metering/billing. A non-partner warehouse pushes shipments/sacks to us via key. (We already have the
client-side shape from MOMO — mirror it server-side.)

**Layer 4 — Real-time tracking surfaces (the USP — "no phone calls").**
- Customer: the existing `/service-import/[fNo]` tracking page (already live) — ensure every demo status maps to a
  customer-visible stage + ETA.
- Partner: a tenant dashboard (their shipments/containers/jobs live).
- Public: a `/track/{code}` no-login lookup (tracking number → status timeline) — the headline "ไม่ต้องโทรถาม."
- Push: status-change → LINE/SMS/webhook (reuse `notifyStaffGroup` + customer push + the propagation cron).

---

## §4 — Gaps vs current Pacred (what's missing for this)

- ✅ Have: the data spine (`tb_forwarder`/item/cnt/momo_sack), customer tracking page, barcode/QR stack, MOMO
  client (the API shape), Upstash rate-limit, notify infra.
- ❌ Lack: (1) the worker-intake UI (the 7 views) writing `tb_*`; (2) multi-tenant partner login + branch/warehouse
  row-scoping + partner role; (3) API-PROVIDER layer (key issuance + metering + the 3 provider endpoints);
  (4) public `/track/{code}` no-login page; (5) sack-tag/QR at warehouse scale; (6) per-tenant billing for API-lease.

---

## §5 — Phasing + sequencing (fits master-plan as **Theme 7 — Supply-chain platform / CargoThai**)

- **Phase 1 — Own-warehouse intake MVP (P0 · เดฟ+ภูม):** the 7-view worker app on `tb_forwarder`+`tb_forwarder_item`
  +sack, scanner-first, branch-scoped, status→fstatus, print sack-tag/QR/sticker. Goal: our China warehouse closes
  containers IN our system (replaces external dependency). Target: the "อีกไม่กี่เดือน" China deployment.
- **Phase 2 — Tracking USP (P0-value · เดฟ+ปอน):** public `/track/{code}` + customer ETA + status-change push.
  This is the market differentiator — ship alongside Phase 1.
- **Phase 3 — Multi-tenant partner portal (P1 · ภูม):** partner login + RBAC + branch/warehouse scoping → partners
  key their own data. Depends on RBAC overhaul (master-plan P0-1).
- **Phase 4 — API-as-a-service (P1 · ก๊อต+เดฟ):** provider endpoints + key issuance + Upstash rate-limit + usage
  metering + billing. Monetize non-partners.

**Ownership:** เดฟ+ภูม own it (their demo). Coordinate with ก๊อต on the API-provider + partner-API lane.
**Reuse, don't rebuild:** `tb_forwarder`/item/cnt + momo_sack schema · barcode/Quagga2 · MOMO client shape ·
Upstash · notify/propagation cron · the customer tracking page. The demo HTML = the UX spec for Phase 1.

> This theme is BOTH an internal efficiency play (own-warehouse self-sufficiency) AND the go-to-market moat
> (real-time tracking + partner SaaS + API-lease). It belongs at the TOP of the long-term roadmap next to BI.

---

## §6 — Immediate next step (when owner says go)
Stand up a Phase-1 skeleton: route group `(admin)/admin/warehouse/*` (or a dedicated `(warehouse)` shell) with the
7 views wired to real `tb_forwarder`/`tb_forwarder_item`/sack reads first (read-only mirror of the demo), then add
the receiving/data-entry/sack WRITE actions one view at a time (each verified against prod data, §0c). The demo
HTML is the pixel/UX reference; the data layer is already ours.
