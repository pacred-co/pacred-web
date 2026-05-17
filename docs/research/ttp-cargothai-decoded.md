# 🔬 TTP + CARGOTHAI + Legacy Booking/CIF/FCL — Decoded

> **Captured:** 2026-05-17 · **Source material:** เดฟ handed over 1 TTP HTML capture,
> 3 legacy PHP files (`booking.php`, `full cif.php`, `full fcl.php`), 2 small JS apps
> (`cargoT/`, `CGTH/`), and 2 LINE operational chats (TTP CARGO + CARGOTHAI EK).
>
> **Purpose:** decode the two external partner systems (**TTP**, **CARGOTHAI**) +
> the legacy quote/CIF/FCL pricing logic so Pacred can bring those flows in-house.
>
> **Read with:** [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
> (the cargo/freight operating model — GZE/GZS, A/M/X/O/Z, Form E, D/O) ·
> [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V (the task backlog).

---

## 0. TL;DR

1. **TTP** = a separate company (`TTP (Thailand) Co., Ltd.`, `ttpcargo.com`) that runs a **WordPress + WooCommerce** site, an **Android app**, and a **physical warehouse + customs operation at Mukdahan**. The HTML capture is a *marketing landing page only* — no calculator, no public API. TTP's real value to Pacred is operational: warehouse intake + Thai customs clearance for the truck route.
2. **CARGOTHAI** (`cargothai.tech`) = a **Laravel** logistics app, the **carrier/forwarder running the EK truck route China→Mukdahan**. The two folders เดฟ handed over (`cargoT/`, `CGTH/`) are *Pacred's own scrape + rebuild* of CargoThai's container/tracking data — **not** CargoThai's source. There is no documented partner API; CargoThai data was scraped with a logged-in Laravel session cookie.
3. The only **real money-math** in the handover is `booking.php` — a WordPress shortcode multi-tab **quote estimator** (LCL/FCL/Truck/Air/Customs/Sourcing/Remit/Export). `full cif.php` and `full fcl.php` are marketing-only landing pages with **static** starting prices. All formulas are written out precisely in §4.
4. **Pacred must build:** an in-house quote calculator (port `booking.php` math + admin-editable rate tables), a container/tracking model (replace the CargoThai scrape), and keep TTP/CargoThai as *operational carrier partners* — not software dependencies.

---

## 1. TTP — decoded

### 1.1 What it is

| Fact | Value |
|---|---|
| Legal entity | `TTP (THAILAND) COMPANY LIMITED` (separate from PCS / Pacred) |
| Web | `https://ttpcargo.com` — WordPress **4.9.21** + WooCommerce **3.4.2** + WPML (th/cn) |
| Android app | `burin.srivilai.ttpcargo.itdev.co.th` (App Store id `1640220623`; built by `itdev.co.th`) |
| Contact | TEL 02-408-8105 / 082-062-8120 · LINE `@TTPCARGO` · `info@ttpcargo.com` |
| Service | "ขนส่งแบบปิดตู้" (full-container import) — sea / truck / air; China-import cargo |
| Physical ops | **Warehouse + customs clearance at Mukdahan** (per LINE chat) |

### 1.2 The HTML capture — what's actually in it

`ttp-FLC - truck sea.html` is a single WordPress page (`?p=1050`, the "บริการขนส่งแบบปิดตู้" page). It is **pure marketing** — built with WPBakery (`vc_*` classes). **No quote form, no calculator, no XHR/AJAX to a pricing endpoint.** Only two `<form>` elements exist, both the WP site-search (`method="get" name="s"`).

**Endpoints present (all generic WordPress, not a partner API):**
- `wp-admin/admin-ajax.php` — WP AJAX bus (Contact Form 7, popup-builder, woo add-to-cart, `line_noti_send` theme plugin)
- `wp-json/contact-form-7/v1` — CF7 REST submit
- `wp-json/` — generic WP REST root

**Useful business content the page does carry** (FLC = "Full-Load Container" / ปิดตู้):

| Incoterm offered | Meaning |
|---|---|
| EXW (Ex-Work) | TTP picks up at the China factory, packs the container, does all docs |
| FOB (Free On Board) | Seller delivers to origin port; TTP imports + clears + delivers |
| CIF (Cost-Insurance-Freight) | Seller delivers to Thai port; TTP clears + delivers |

**Container reference data (verbatim from the page — Pacred can reuse this table):**

| Container | Internal CBM | Net weight cap | Volume sold | Weight cap | Transit |
|---|---|---|---|---|---|
| 20 ft | 33.2 CBM | 2,200 kg tare | ~32 CBM | ≤21 ton | 13–25 d (sea) |
| 40 ft | 67.6 CBM | 3,730 kg tare | ~68 CBM | ≤25 ton | 13–25 d (sea) |
| 40 ft High-Cube | 76.2 CBM | 3,900 kg tare | — | — | — |
| 45 ft (truck) | — | — | ~75 CBM | 25 ton | 7–10 d (truck) |

Indicative full-container price ranges shown (marketing, not a formula): 20ft sea ฿60k–150k · 40ft sea ฿100k–270k · 45ft truck ฿300k–460k. Goods classed into just **2 types**: "ทั่วไป" (general) and "มอก." (TIS-cert / electrical).

### 1.3 TTP — operational role (from the LINE chat)

`[LINE]TTW _amp_ TTP CARGO.txt` is **container-status coordination**, not software. It shows TTP's actual function in the chain:
- TTP **operates the destination warehouse** — sets opening hours, prepares goods for customer pickup, does OT for after-hours collection.
- A planner ("Nutwara แพลนตู้ คุณนัท TTP") posts when each `GZE######-#` truck container **arrives + is unloaded** at the TTP warehouse.
- TTP/accounting issues the **freight bill per container, already net of withholding tax** — e.g. `GZE251120-1 = ฿49,995.00`, four-container batch total `฿275,328`, due-date enforced.
- The chat confirms `GZE` = truck containers cleared through **Mukdahan customs** before reaching the TTP warehouse — consistent with the cargo-forensics doc.

**TTP = a physical-ops partner (warehouse + Thai customs at Mukdahan), NOT an API.** Pacred's dependency on TTP is logistics, not code. Note the bill is "หัก ณ ที่จ่ายแล้ว" (WHT already deducted) — the exact withholding-tax pain catalogued as **A6** in cargo-ops-forensics.

---

## 2. CARGOTHAI — decoded

### 2.1 What it is

| Fact | Value |
|---|---|
| Web | `https://cargothai.tech` |
| Stack | **Laravel** (PHP) — confirmed by `laravel_session` + `XSRF-TOKEN` cookies |
| Role | Carrier / forwarder for the **EK truck route**: China (Guangzhou / Pingxiang) → **Mukdahan** |
| Identifies in chat as | "CARGOTHAI SHIPPING" — runs the `GZE` truck containers; posts box-level **stickers** |

The CARGOTHAI EK chat (`[LINE]ตู้รถ EK CARGOTHAI SHIPPING ...`) is the same kind of artifact as the TTP chat: per-container arrival posts, ETA-to-Thailand questions, per-box **sticker** images. CARGOTHAI is **upstream** of TTP — it physically trucks the consolidated container from China to the Mukdahan border; TTP receives it.

### 2.2 CARGOTHAI's data model — known via Pacred's scrape

There is **no published CargoThai partner API**. What เดฟ handed over is **Pacred's own reverse-engineering**:

**`cargoT/` — the scraper** (`scrape.py`, `scrapepic.py`):
- Authenticates to `cargothai.tech` with a **stolen/borrowed logged-in Laravel session cookie** (hardcoded `laravel_session` + `XSRF-TOKEN`).
- Pages `GET /backoffice?limit=50&page=N` and regex-extracts an inline `let containers = {...}` JSON blob from the HTML.
- Per container, fetches: `/sticker?container_id=`, `/backoffice/container/edit/{id}/{branch}` (carries inline `let bags`, `let shipments`, `let tracking` JSON), `/api/container/{id}/history` (the one real JSON endpoint), and `/Manage?SM={sm}`.
- Dumps everything to `full_backup_advanced.json` (101 MB) + downloads all images.

→ **This tells us CargoThai's domain model** (the fields Pacred must mirror): `container` (`id`, `sm`/`sm_code`, `branch_id`, `transport_name`, `sm_date`, `box_total`, `box_weight`, `box_cbm`, `last_status`) → has-many `products`/`bags`/`shipments` (`product_name`, `product_tracking`, `product_qty`, `product_weight_all`) + a `history` log. `transport_name` ∈ {`EK`, `SEA`}. Statuses seen: `arrived_cn`, `arrived`, `active`, `approved`.

**`CGTH/` — Pacred's rebuild** of that data on **Supabase + Vercel** (`@supabase/supabase-js`, Node serverless):
- `api/containers.js` — paginated list of `containers` + nested `products`, filter by `sm_code` / `transport` / `branch_id`.
- `api/tracking.js` — public tracking: look up by `sm_code` OR by `product_tracking`.
- `api/container/[id].js` — single container detail.
- `backoffice.html` / `tracking.html` — thin Bootstrap front-ends.

This `CGTH/` app **is the prototype of the Pacred in-house tracking module** — it already proves the schema (`containers` + `products`) and the two query paths (admin list + public tracking). It is not production (CORS `*`, anon key in env, no auth on `/backoffice`).

**CARGOTHAI = a carrier partner whose data Pacred scraped because there is no API.** The in-house replacement = a proper `cargo_containers` / `cargo_shipments` model fed by Pacred's own warehouse intake, not a scrape.

---

## 3. The legacy PHP files — what's calculator vs marketing

| File | Type | Has money math? |
|---|---|---|
| `booking.php` | WP shortcode `pcs_booking_cal2` — 8-tab **quote estimator** | ✅ **yes** — full client-side JS |
| `full cif.php` | WP shortcode `pcs_cif_landing` — customs-clearance landing | ❌ static prices only |
| `full fcl.php` | WP shortcode `pcs_fcl_service` — FCL service landing | ❌ marketing only |

`full cif.php` advertises **static** starting prices (`Service` schema): Air clearance ฿3,500 · Sea LCL/FCL ฿4,500 · Truck/border ฿3,500. `full fcl.php` has no prices at all — pure "contact us". **The only real engine is `booking.php`.**

---

## 4. `booking.php` — the quote-calculator formulas (PRECISE)

`booking.php` renders a card with 8 tabs. All math is **client-side JavaScript**, all rate constants are **hardcoded** (around line 1803). Each tab's result shows a point estimate **and a ±range** ("เซลล์ยืนยันราคาจริง" — sales confirms the real price). Money is THB unless noted.

### 4.1 Rate tables (hardcoded constants — port these to an admin-editable DB table)

```
LCL_RATES   = { kgRate: 10,  cbmRate: 2800, special:{ kgExtra:15, cbmExtra:2000 } }
FCL_BASE    = { '20ft':55000, '40ft':75000 }
FCL_TERM_DISC = { ddp:0, exw:-5000, fob:-12000 }
TRUCK_RATES = { share:{kgRate:17,cbmRate:4700}, full:{kgRate:18,cbmRate:5000} }
AIR_RATE    = 100        AIR_SVC = 500
CUST_BASE   = { general:3500, machinery:4500, fda:5500, tisi:5000, special:7000 }
CUST_PORT   = { bkk_airport:2000, dmk_airport:2000, laem_chabang:1500, bangkok_port:1000,
                icd:1500, land_border_mukdahan:2500, land_border_nakhonphanom:2500,
                land_border_aranyaprathet:2500, land_border_maesai:2500, unknown:1500 }
CUST_DOC    = { complete:0, incomplete:2000, hs_issue:3500, unknown:1500 }
CUST_CTRY   = { china:0, japan:500, korea:500, europe:1500, usa:1500, other:2000 }
SRC_RATES   = { truck:{kgRate:20}, sea:{kgRate:15}, air:{kgRate:120} }
EXP_BASE    = { general:2500, food:3000, machinery:4000, chemical:5500, special:6000 }
EXP_PORT    = { laem_chabang:1500, bangkok_port:1000, icd:1200, bkk_airport:2000,
                dmk_airport:2000, border_mukdahan:2500, border_aranya:2500, border_maesai:2500 }
EXP_MODE    = { sea:0, air:500, truck:300 }
SOURCING exchange rate (CNY→THB) = 4.85   (hardcoded in renderSourcing)
```

### 4.2 LCL (sea, shared container) — `renderLCL()`

```
isSpecial = (productType ∈ {special, machinery})
kr = LCL_RATES.kgRate  + (isSpecial ? 15   : 0)      // → 10 or 25 ฿/kg
cr = LCL_RATES.cbmRate + (isSpecial ? 2000 : 0)      // → 2800 or 4800 ฿/CBM
base   = max( CBM * cr , max(1, weightKg) * kr )      // whichever is greater
docAdj = (doc==='customs' ? +1500 : doc==='none' ? -2000 : 0)   // invoice = 0
total  = round(base + docAdj)
range  = [ round(total*0.90) , round(total*1.15) ]
```
Incoterm (`ddp`/`exw`/`fob`) is shown as a label only — **does not** change the LCL number.

### 4.3 FCL (full container) — `renderFCL()`

```
base = FCL_BASE[size] + FCL_TERM_DISC[term]          // size ∈ {20ft,40ft}; term ∈ {ddp,exw,fob}
if isSpecial: base += 8000
guard: if CBM > {20ft:32, 40ft:68}[size] → reject ("exceeds container capacity")
range = [ round(base*0.90) , round(base*1.12) ]
```
e.g. 20ft DDP general = 55000 · 40ft FOB general = 75000−12000 = 63000 · 20ft DDP machinery = 63000.

### 4.4 Truck (DDP, China→TH) — `renderTruck()`

```
r  = TRUCK_RATES[ trucksub ]                          // 'share' or 'full'
kr = r.kgRate  + (isSpecial ? 15   : 0)
cr = r.cbmRate + (isSpecial ? 2000 : 0)
kgP  = max(1, weightKg) * kr
cbmP = (CBM > 0) ? CBM * cr : 0
base = (CBM>0 && cbmP>kgP) ? cbmP : kgP               // greater-of, CBM wins ties
range = [ round(base*0.90) , round(base*1.15) ]
```
share = 17 ฿/kg or 4700 ฿/CBM · full = 18 ฿/kg or 5000 ฿/CBM (+15 / +2000 if special).

### 4.5 Air freight — `renderAir()`

```
volW       = (W*L*H > 0) ? (W * L * H) / 6000 : 0     // dimensional weight, cm, divisor 6000
chargeable = max( actualKg || 0.5 , volW || 0.5 )      // 0.5 kg floor
fee        = ceil( chargeable * 100 / 10 ) * 10 + 500  // AIR_RATE=100 ฿/kg, round up to ฿10, +AIR_SVC 500
range      = [ round(fee*0.90) , round(fee*1.20) ]
```

### 4.6 Customs clearance (CIF, import) — `renderCustoms()`

```
total = CUST_BASE[productType] + CUST_PORT[port] + CUST_DOC[docs] + CUST_CTRY[country]
range = [ round(total*0.85) , round(total*1.20) ]
```
Pure additive lookup. e.g. general + Suvarnabhumi + complete-docs + China = 3500+2000+0+0 = ฿5,500. **Excludes import duty/VAT** — labelled "ไม่รวมภาษีนำเข้า".

### 4.7 Sourcing (China shopping — 1688/Taobao) — `renderSourcing()`

```
thbGoodsValue = round( valueCNY * 4.85 )               // display only
r        = SRC_RATES[ mode ]                           // truck / sea / air
estShip  = (weightKg>0) ? round( max(1,weightKg) * (r.kgRate + (isSpecial?15:0)) ) : 0
```
The quoted number is **shipping only** (truck 20, sea 15, air 120 ฿/kg); the goods value is just converted at 4.85 for display. No commission line.

### 4.8 Export (FOB, outbound customs) — `renderExport()`

```
total = EXP_BASE[productType] + EXP_PORT[port] + EXP_MODE[mode]
range = [ round(total*0.90) , round(total*1.20) ]
```
Additive lookup, same shape as customs. Excludes freight ("ไม่รวมค่าระวาง").

### 4.9 Remit (T/T money transfer) tab

A tab exists (`data-mode="remit"`) but has **no render function / no formula** — it is a contact-only lead form. (Real yuan-transfer pricing lives in the PHP `payment.php` system, not here.)

### 4.10 Properties of the whole engine — for the in-house port

- **Greater-of weight-vs-volume** is the core cargo rule (LCL + truck): `base = max(CBM×cbmRate, kg×kgRate)`. Air uses dimensional weight `W×L×H/6000` instead.
- Every estimate is a **range, not a firm price** — multipliers `[0.85–0.90 low, 1.12–1.20 high]`. The page explicitly defers to a human ("เซลล์ยืนยันราคาจริง"). The calculator is a **lead-gen funnel**, not a checkout.
- All rates + exchange rate (4.85) are **hardcoded in JS** — no DB, no admin screen, no FX feed. Stale rate = wrong quote (matches forensics problem **A4** "rate-entry errors").
- "Special" surcharge = `productType ∈ {special, machinery}` everywhere; `doc` choice (`invoice`/`customs`/`none`) only adjusts LCL & Sourcing.

---

## 5. What Pacred must build (to replace these external deps)

### 5.1 Quote calculator — in-house, port `booking.php` (P1)

- **Port the 8-tab estimator** into `service-import` (and per-service landing pages). Mode set: LCL · FCL · Truck · Air · Customs · Sourcing · Export · (Remit = contact form). Formulas in §4 are exact — reuse them.
- **Move all rate tables out of code into a DB table** `quote_rates` (admin-editable) — `mode`, `key`, `kg_rate`, `cbm_rate`, `base`, `surcharge`, `valid_from`. Kills the "stale hardcoded rate" risk (forensics **A4**). Same for the CNY→THB rate — pull from one place, ideally an FX source.
- Keep the **range output + "sales confirms"** behavior — it is the legacy lead-gen pattern and matches Pacred's "ติดต่อทีม" CTA fallback. The calc gives an estimate; a Server Action records the lead.
- Reuse the **TTP container reference table** (§1.2) as Pacred's canonical container-capacity constants (20ft 33.2 / 40ft 67.6 / 40HC 76.2 / 45ft truck ~75 CBM) and the FCL capacity guard.

### 5.2 Container + tracking model — replace the CargoThai scrape (P1)

- `CGTH/` already prototypes it: `cargo_containers` (`sm_code`, `transport` EK/SEA, `branch_id`, `sm_date`, `box_total/weight/cbm`, `last_status`) has-many `cargo_shipments`/parcels (`product_name`, `product_tracking`, `qty`, `weight`). Promote it into the real Pacred schema — align with [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md).
- Public **tracking** = lookup by `sm_code` OR `product_tracking` (the CGTH `tracking.js` pattern). Add RLS, auth on `/backoffice`, drop CORS `*`.
- A **container status log** (CargoThai's `/history`) → maps to Pacred's state-transition audit ([ADR-0014](../decisions/0014-customer-self-service-state-transitions.md)).
- **Stop scraping `cargothai.tech`.** The Laravel-session scrape is fragile + unauthorized. Pacred's containers must be fed by Pacred's **own China-warehouse intake** (the 装柜明细 manifest flow in cargo-forensics §3.4), not a partner's back-office.

### 5.3 Treat TTP + CARGOTHAI as carrier partners, not software (P2)

- **TTP** = destination warehouse + Thai customs at Mukdahan. **CARGOTHAI** = the China→Mukdahan EK trucking carrier. Neither exposes an API. Model them as rows in a `carriers` / `partners` table; record the per-container freight bill TTP issues (already **WHT-deducted** — wire into the withholding-tax model, forensics **A6**).
- The China→Mukdahan→TTP-warehouse→customer flow is exactly the `GZE` truck lifecycle in cargo-forensics §3.4 — Pacred's container module should track each leg + ETA so staff stop asking partners "ตู้เข้าหรือยัง" in LINE.
- **Do not scrub** TTP / CARGOTHAI references until ก๊อต confirms the carrier relationships are replaced or formalized — per [`docs/runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md). They are real ongoing logistics partners, not just legacy brand names.

### 5.4 Net-new vs port — summary

| Capability | Source | Pacred action |
|---|---|---|
| Quote estimator (8 modes) | `booking.php` JS | **Port** formulas (§4) + rate tables → DB |
| Customs / FCL landing copy | `full cif.php`, `full fcl.php` | Reuse copy on `/services/*` landings |
| Container + parcel tracking | `CGTH/` prototype | **Promote** to real schema + auth + RLS |
| CargoThai data ingestion | `cargoT/` scraper | **Replace** with own warehouse intake — stop scraping |
| TTP warehouse + Mukdahan customs | LINE chat | Model as **carrier partner** + per-container billing |
| Withholding-tax on freight bills | TTP bill ("หัก ณ ที่จ่ายแล้ว") | Wire into WHT model (forensics A6 / [ADR-0015](../decisions/0015-withholding-tax-model.md)) |

---

## 6. Cross-references

- 🏗 Cargo/freight operating model (GZE/GZS, A/M/X/O/Z, Form E, D/O) → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
- 🏗 Container schema spine → [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 📋 Task backlog → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V
- 💸 Withholding-tax model → [`docs/decisions/0015-withholding-tax-model.md`](../decisions/0015-withholding-tax-model.md)
- 🚢 Freight value model → [`docs/decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md)
- 🛑 Don't scrub partner refs early → [`docs/runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)
