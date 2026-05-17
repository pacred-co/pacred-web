# 📖 Pacred Glossary

> One-line definitions for terms that appear across the codebase + docs + UI.
> Cross-link this from any doc/comment introducing one of these terms.
> Last reviewed: 2026-05-18.

## Documents (เอกสาร)

| Term | Thai | Definition | Where used |
|---|---|---|---|
| **WHT** | ภาษีหัก ณ ที่จ่าย | Withholding Tax. Customer deducts 1% (cargo) or 3% (freight) from invoice before paying — Pacred receives net, customer files the cert with their books. | `actions/admin/wht.ts` · `withholding_tax_entries` table |
| **50-ทวิ** | หนังสือรับรองการหักภาษี ณ ที่จ่าย | The physical/PDF Withholding Tax Certificate (Revenue Code Form ภงด.53/3). Juristic customer issues it; Pacred stores under `wht-certs` storage bucket. | WHT panel · `getFreightReceiptGate()` |
| **ใบกำกับภาษี** | tax invoice | Thai RD-mandated invoice (Code 86) for VAT-registered customers. Pacred issues only after payment confirmed. | `actions/admin/tax-invoices.ts` · `tax_invoices` table · ADR-0006 |
| **Form E** | ฟอร์มอี | ASEAN Certificate of Origin (used for ASEAN trade tariff preference). Pacred prepares when customer requests. | `components/pdf/freight-form-e.tsx` |
| **D/O** | ใบรับสินค้า | Delivery Order — the carrier's authorisation slip the consignee presents at the terminal to release cargo. | `components/pdf/freight-do-letter.tsx` |
| **ใบขนสินค้า** | customs declaration | The customs-cleared declaration document (NetBay output OR Pacred-prepared). | `customs_declarations` table · V-E11 |

## Cargo / Freight measurements

| Term | Thai | Definition | Where used |
|---|---|---|---|
| **CBM** | ลูกบาศก์เมตร | Cubic Meter — volume measurement for cargo billing. 1 CBM = 1 m³. Cargo billing uses MAX(weight_kg / cbm-conversion-factor, actual cbm). | `cargo_containers.total_cbm` · `cargo_shipments.received_cbm` |
| **ตัดตู้** | container cut-off | The forward-looking deadline after which a container stops accepting new shipments. Set on `cargo_containers.close_at`. After cut-off, attach actions reject. | V-C3 · `adminAttachShipmentToContainer` |
| **กระสอบรวม / sack** | consolidated bag | A bag bundling multiple small customer parcels inside one container. Code namespace `CBX<YYMMDD>-EK<NN>` (e.g. `CBX251111-EK04`). MOMO measures the OUTSIDE; PCS measures the INSIDE goods — diff = reconciliation gap. | `cargo_sacks` table · `lib/warehouse/sacks.ts` · U2-5 |

## Codes / IDs

| Code format | What it identifies | Example |
|---|---|---|
| **PR + min-3-digit** | `profiles.member_code` — customer member code | `PR001`, `PR123`, `PR10594` |
| **F + YYMMDD-N** | `forwarders.f_no` — cargo-import order (ฝากนำเข้า) | `F260518-1` |
| **H + YYMMDD-N** | `service_orders.h_no` — China-shop order (ฝากสั่งซื้อ) | `H260518-1` |
| **A2600...** | `freight_shipments.job_no` — international freight shipment | `A2600518-001` |
| **GZE / GZS** | `cargo_containers.code` prefix — Guangzhou Eastbound (truck) / Sea | `GZE260518-1` (truck), `GZS260518-1` (sea container) |
| **CBX...-EK..** | `cargo_sacks.code` — consolidated bag (MOMO-issued or Pacred via `next_sack_code()`) | `CBX260518-EK01` |
| **TI-YYMMDD-N** | `tax_invoices.invoice_no` | `TI-260518-1` |
| **RF-YYMMDD-NNNN** | `refund_requests.request_no` | `RF-260518-0001` |
| **CD-YYMMDD-NNNN** | `customs_declarations.declaration_no` | `CD-260518-0001` |
| **CN-YYMMDD-N** | legacy `containers.container_no` (pre-U1-1 unify; mirrored into `cargo_containers.legacy_container_no` after migration 0059) | `CN-260513-01` |

## Cargo categorisation (V-D2)

| Pacred canonical | Legacy PCS API | Legacy China manifest | Description |
|---|---|---|---|
| `general` | `A` | `G` | สินค้าทั่วไป — no special clearance |
| `electrical` | `M` | `T` | สินค้าไฟฟ้า — requires มอก. / Thai industrial standards check |
| `food_drug` | `X` | `F` | อาหาร/ยา — requires อย. clearance |
| `brand` | `O` | — | สินค้ายี่ห้อ — brand-authenticity check |
| `controlled` | `Z` | — | สินค้าควบคุม — special licences/permits |

Normaliser: `lib/warehouse/cargo-type.ts`.

## Lifecycle statuses

### Container (spine, 0033)
`packing → sealed → in_transit → arrived → unloading → closed`

### Container (legacy 0016 — read-only after U1-1)
`preparing → sealed → in_transit → arrived_port → cleared_customs → delivered → cancelled`

### cargo_shipments
`received_cn → packed_cn → sealed_in_container → in_transit → arrived_th → unloaded → out_for_delivery → delivered`

### forwarders
`pending_payment → shipped_china → in_transit → arrived_thailand → out_for_delivery → delivered → cancelled`

### service_orders (China shop)
`pending → awaiting_payment → ordered → awaiting_chn_dispatch → completed`

### refund_requests
`pending → approved → paid` (or `pending → rejected`); terminal states locked by trigger (migration 0066).

## RBAC (7 admin roles)

| Role | Workspace | Can write |
|---|---|---|
| **super** | everything | yes (full) |
| **ops** | forwarders + service_orders + warehouse | money: no |
| **accounting** | wallet + tax_invoices + WHT + refunds + credit | money: yes |
| **sales_admin** | customers + sales team + commission payouts | sales-only |
| **warehouse** | container ตัดตู้ + intake scan + sacks | warehouse-only |
| **driver** | own driver-runs + scan deliveries | driver-only |
| **interpreter** | ล่ามจีน commission ledger | interpreter-only |

W-1 keystone (migration 0062): every admin-write RLS uses explicit role array — never bare `is_admin()`.

## Forbidden legacy terms (DON'T port to Pacred)

These exist in PCS legacy ops but are Pacred-prohibited per `docs/research/PACRED-MASTER-STRATEGY.md` §5.5:

| Term | What it was | Why forbidden |
|---|---|---|
| **เหมาภาษี** | "tax-included no-doc" — customer paid an inclusive fee, got no real ใบกำกับภาษี | RD compliance breach — Pacred = "เกราะป้องกันสรรพากร 100%" |
| **ตั๋วพ่วง** | shared/borrowed customs ticket for unauthorised cargo | Customs broker licence breach |
| **แผน VAT** | declared-value engineering to lower VAT | Tax fraud |
| **HS-code re-coding** | swapping HS code to a lower-duty category | Customs fraud |
| **"ทำราคา / ไม่ทำราคา"** | two-track invoicing | Tax fraud |

If you see these in legacy code/data: **flag, do not port**.

## Cross-refs

- `docs/architecture/container-centric-model.md` — full container/shipment FSM diagrams
- `docs/decisions/0006-tax-invoice-flow.md` — ใบกำกับภาษี issuance rules
- `docs/decisions/0015-withholding-tax-model.md` — WHT cert workflow
- `docs/decisions/0016-freight-value-model.md` — Form-E / declared-value rules
- `docs/research/PACRED-MASTER-STRATEGY.md` §5.5 — identity guardrail (forbidden patterns)
