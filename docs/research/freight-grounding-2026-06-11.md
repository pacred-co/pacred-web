# Freight grounding — legacy AXELRA (axglobal/cargoT) vs Pacred freight stack — 2026-06-11

**Method:** §0b deep-audit-from-source. Opened the actual files in
`C:/Users/Admin/AppData/Local/Temp/pacred-freight/olddata dev/data งานเก่า/Project dev/`
(`axglobal/` · `cargoT/` · `src cg/` · `pacred demo cargothai.html`) and cross-referenced
the live Pacred worktree (`app/[locale]/(admin)/admin/freight/**`, `lib/freight/**`,
`actions/admin/freight-*.ts`, `supabase/migrations/00*_freight_*.sql`). Built on the
existing synthesis in `docs/learnings/freight-erp-model.md` +
`docs/learnings/customs-brokerage-kit.md` — did **not** re-derive what those cover.

---

## TL;DR — how built is Pacred freight vs the legacy AX system?

**Pacred freight ≈ 80–85% built relative to what the *extracted* legacy reveals — and AHEAD of it on the cost/profit math the owner cares about most.**

The headline (and a correction to the brief's premise): **the `axglobal/` extract is NOT the AX JOB cost→profit ERP cockpit.** It is the **AXELRA WordPress marketing + booking-LEAD funnel + freight master-data manager** (built on the *BA Book Everything* / "babe" booking plugin). Its "pricing" is a **single stored display-price per route-card** (`$X starting from` → "Book Now" / "ติดต่อผู้ดูแลระบบ") — a lead-gen quote teaser, **with no cost / margin / profit / commission math anywhere in the code that was extracted**. The real cost→sell→profit engine the CLAUDE.md "AX JOB PRICING→SALES→DOC→ACC" refers to is the **Google-Sheets / AXELRA `.xlsx` rate-cards**, which were already mined into `lib/freight/rate-model.ts` (and documented in `freight-erp-model.md`). Pacred has faithfully transcribed those numbers and **wired them end-to-end** (compose → persist P&L → snapshot on shipment), which the WordPress system never did.

So the genuine remaining gap is **NOT** "port the AX profit engine" (Pacred already has a better one). It is:
1. **Freight master-data tables** (ports / carriers / container types+sizes / route rate-cards) — the WP system has structured tables for these; Pacred keys rates by **free-text** `pol/pod/carrier` strings and the lookup **ignores the route entirely** (most-recent-effective row wins). ⚠️ *This is the biggest cost/profit accuracy risk* (owner: "ห้ามเดา").
2. **Public freight booking/rate-card browse** (the `[booking_sea_cards]` route-card sliders → a real "browse routes & rates" customer surface). Pacred's public side is a quote *wizard* only.
3. Polish: commission rates owner-confirmation, FCL/AIR sell-card transcription, export reverse-flow — all already tracked in `freight-erp-model.md` §6 correction.

> ⚠️ **What I did NOT cover (flag for follow-up):** the **freight DB dump body was skipped** — there is in fact **NO `.sql` / `.csv` / `.xlsx` / `containers.csv`** anywhere in this extract (verified: `find … -name '*.sql' -o '*.csv' -o '*.xlsx'` → 0 hits outside wp-core). The `containers.csv` the brief mentioned is absent. Likewise the extract is **code-shell-only and PARTIAL**: every custom plugin's *entry* `.php` is present but its `includes/` / `class/` / `templates/` implementation files are **missing** (e.g. `booking-custom/class/sea.php`, `wp-transport-booking/includes/*`, the entire `ba-book-everything/includes/*` are referenced-but-absent). **A schema read IS needed** to confirm the master-data column shapes before building the Pacred port — request the AXELRA WP DB dump (the `wp_ports` / `wp_containers` / `wp_container_*` / `wp_size_con` tables) OR the missing plugin `class/` bodies. The schema below is reconstructed from the SQL embedded in the *card-renderer* (`booking-sea-cards.php`), which is reliable for column names but not full DDL.

---

## 1. Legacy AXELRA system map (what `axglobal/` actually is)

WordPress 6.7 site (brand `axelra.global`), theme `tourio`, booking core **BA Book Everything 1.7.24** (`ba-book-everything/babe-bootstrap.php:6`), Thai/EN via Polylang. The freight logic is a set of **custom plugins** that extend babe:

| Custom plugin | file:line | What it does | Cost/profit? |
|---|---|---|---|
| **Booking Sea Cards** | `booking-sea-cards/booking-sea-cards.php:33-636` | Renders sliding **rate cards** (`[booking_sea_cards]`/`booking_air_cards`/`booking_car_cards`/`*_trendingRoutes_*`) — route + container + **stored `price`** ("$X starting from") → "Book Now" | ❌ display price only |
| **Management_data** | `Management_data/Management_data.php:9-194` | Admin CRUD for the freight **master data** via AJAX: `BABE_Ports`, `BABE_Country`, `BABE_Container_Size`, `BABE_Container_Type`, `BABE_Container` (the class bodies are missing) | ❌ master data |
| **Container Type Manager** | `container_type/container_type.php:13-449` | WP-admin pages "Container Types" + "Add Container" (type_name/description; size/name joins) | ❌ master data |
| **Transport Booking System** | `wp-transport-booking/wp-transport-booking.php:22-36` | `transport_booking` CPT + **Sale notification** + booking-form handler + order metabox (`includes/*` missing) — the **lead→sale alert** path | ❌ lead capture |
| **CS-service-add** | `cs-service-add-on/cs-service.php:13-32` | Adds a "Customer-Service / ADD_ON" account-nav tab (body in missing `booking-custom/class/service.php`) | ❌ add-on nav |
| **Booking-Allfeight** | `booking-custom/sea-flight.php:13-32` | Adds "All Booking 2" (sea) account-nav tab (body in missing `class/sea.php`) | ❌ nav |
| **TTP Orders Mock** | `ttp-orders-mock/ttp-orders-mock.php:21-43` | "Orders Mock … เหมือน WooCommerce แต่ไม่ต้องใช้ WooCommerce" — a mock orders list/detail (`[orders_mock]`) (templates missing) | ❌ order UI mock |
| **BA Book List (ListTrd)** | `ListTrd/listTrd.php:30-68` | `[ba_book_list]` lists `to_book` LCL posts ("Less container load … 7 Hrs") | ❌ list |
| **Order Formula Manager** | `wp-formula-manager/order-formula-manager.php:11-218` | A **generic** formula CPT: `(subtotal * exchange_rate) + service_fee + shipping_fee`, vars from order_field/order_meta/fixed, default FX `34.5`, fee `100` (`:63-88`) | 🟡 a *generic* total formula — NOT a freight cost/profit model |

**Verdict on the AX "pricing model":** the only price math in the extracted code is (a) the stored per-route `price` on each booking card, and (b) the generic Order-Formula `subtotal×fx + fees`. **There is no cost field, no margin, no profit, no commission, no incoterm-scoped pricing in the WordPress code.** Those live in the AXELRA spreadsheets (already in `rate-model.ts`).

### `cargoT/` and `pacred demo cargothai.html` — not freight
- **`cargoT/dynamic_pages/*.html`** (1,520 files) = saved static renders of a **"BACKOFFICE | Logistic"** cargo order-EDIT screen, named `edit_<orderId>_<status>.html` (status 1–12). This is the **CARGO backoffice** (the pcscargo order/forwarder model already grounded) — no freight P&L; a grep for กำไร/ต้นทุน/profit returned no cost fields. Treat as cargo reference, out of freight scope.
- **`pacred demo cargothai.html`** = "PCS CARGO | New Workflow System" — a **warehouse sticker / ใบรับสินค้า (SM code)** workflow demo (the CargoThai supply-chain tool). Out of freight scope.
- **`src cg/`** = just `package.json` with `@supabase/supabase-js` — an empty scaffold, nothing to mine.

---

## 2. The legacy freight master-data schema (reconstructed from `booking-sea-cards.php`)

From the embedded SQL in `booking-sea-cards.php:99-114` + `:226-237` (column names reliable; not full DDL — **request the dump to confirm types/keys**):

| Legacy table | Columns seen (file:line) | Pacred equivalent |
|---|---|---|
| `wp_ports` | `id_port`, `port_name` (`:99-100`) | ❌ none — `tb_freight_rate.pol/pod` are **free-text** strings |
| `wp_containers` | `id_con`, `container_name`→`id_con_name`, `container_size`→`id_size` (`:103-109`) | ❌ none |
| `wp_container_name` | `id_con_name`, `con_name` (`:104`) | ❌ none |
| `wp_size_con` | `id_size`, `size` (`:105`) | ❌ none |
| `wp_container_types` | `id`, `type_name` (`:114`) | ⚠️ `TRANSPORT_MODES` const only (sea_fcl/sea_lcl/air/truck) |
| route rate-card | `wp_postmeta` `booking_sea`/`booking_air` JSON: `port_start`, `port_end`, `price`, `brand_id`, `container_type`, `transit_unit` (`:66-97`) | 🟡 `tb_freight_rate` (mode,pol,pod,carrier,cost_usd,unit,fx) — but no route master + lookup ignores route |
| carrier/brand | a WP post (`brand_id`) + `post_tag` icon (`:69-95`) | ⚠️ `tb_freight_rate.carrier` free-text |

**Takeaway:** the AX system models ports/containers/carriers as **first-class, ID-keyed, admin-editable** records and prices each *(route × container × carrier)* card. Pacred prices by free-text mode/route and the route is currently **dropped** in the lookup (`rate-lookup.ts:34-43` orders by `effective_from` then `pol`, `.limit(1)` — so any-route default beats a specific route, and pod/carrier are unused). That's the cost-accuracy gap.

---

## 3. The cost / sell / profit model — exact formulas

### 3a. Legacy (WordPress) — there isn't one
- Card price: `$price = floatval($data['price'])` → displayed verbatim (`booking-sea-cards.php:68, 143`). No cost, no margin.
- Generic order total (Order Formula Manager): `(subtotal * exchange_rate) + service_fee + shipping_fee`, default `exchange_rate=34.5`, `service_fee=100` (`order-formula-manager.php:63-88`). This is a *configurable WooCommerce-style order total*, **not** a freight cost/profit calc — and it operates on a generic `subtotal`, not a freight cost base. **Nothing here computes profit = sell − cost.**

### 3b. Pacred — the real cost→sell→profit engine (ported from the AXELRA `.xlsx`, NOT from this WP)
All in `lib/freight/rate-model.ts` + `rate-engine.ts`, verified by `rate-engine.test.ts` against real sheet totals (CIF AIR 4W = 10,211 · CIF SEA LCL 4W = 13,511):

| Formula | file:line |
|---|---|
| **Per-line COST + SELL** (Thai-local lines, `cost`/`sell`, sell may vary by 4W/6W truck) | `rate-model.ts:93-112` (`THAI_LOCAL_LINES`) |
| **China-side freight/origin lines**, 3-tier sell (retail/regular/wholesale), per cbm/kgm/container/set | `rate-model.ts:131-150` (`FREIGHT_LINES`) |
| **Incoterm → billed scope** (CIF/FOB=Thai-only; CFR/EXW/DDP… include freight/origin) | `rate-model.ts:49-61` (`INCOTERM_SCOPE`) |
| **`incursChinaFreightCost(incoterm)`** — gate for folding China cost | `rate-model.ts:71-75` |
| **China cost = `cost_usd × fx × units`** (units by rate.unit; degrade→null if no usable rate) | `rate-lookup-math.ts:33-48` |
| **`localCost = Σ line.cost`**; **`subtotalCost = localCost + chinaFreightCostThb`** | `rate-engine.ts:225-228` |
| **`subtotalSell = Σ line.sell`**; **`profit = subtotalSell − subtotalCost`** | `rate-engine.ts:229-230` |
| **`vat = subtotalSell × 7%`**; **`total = subtotalSell + vat`** | `rate-engine.ts:231-232` |
| **Margin cap (advisory) = capPerContainer × containers**, `marginExceedsCap = profit > cap`; cap default 15,000/ตู้, config-overridable | `rate-engine.ts:237-242`, `rate-model.ts:155` |
| **`chinaCostPending`** honesty flag → profit shown as GROSS "ก่อนหักต้นทุนเฟรทจีน" when a freight/origin line has unmodelled cost | `rate-engine.ts:251-255` |
| **Commission split** = freight 1% + customs 5% + doc 5%, − 3% WHT (per-scope on sell) | `rate-engine.ts:257-268`, `rate-model.ts:159-164` |
| **Markup tiers** 30/25/20/15/10% (live from `business_config freight.markup_*`, const fallback) | `rate-model.ts:206-211`, `rate-engine.ts:175-182` |

**End-to-end wiring (the part the owner cares about — "ตั้งต้นทุน กำไร สำคัญมาก"):** the compose ACTION actually threads it: `incursChinaFreightCost` → `lookupChinaFreightCostThb` → `composeFreightQuote(...)` → **persists** `profit_margin_thb` / `cost_total_thb` / `margin_exceeds_cap` on `freight_quotes` and **snapshots** them onto `freight_shipments` at convert (`actions/admin/freight-quotes.ts:314-439, 872-927`; persistence schema `migrations/0165_freight_pnl_margin.sql`). Money-safe by design — P&L cols are DISPLAY/ANALYTICS, never touch wallet/invoice/declared value (`0165` header + col comments).

**ADR-0016 3-number discipline is honoured:** SELL (customer-billed +VAT) · COST (internal, the cost cols) · DECLARED (มูลค่าสำแดง, separate audited field on the shipment value block, super+accounting-only) are kept distinct — see `freight-erp-model.md` §2 + `customs-brokerage-kit.md` §3. The DECLARED value **never** auto-equals SELL.

---

## 4. Capability table — legacy → Pacred → verdict

| Capability | Legacy (axglobal) file:line | Pacred path | Verdict |
|---|---|---|---|
| Public route **rate-card browse** (sea/air/car sliders, $price, Book Now) | `booking-sea-cards.php:33-636` | — (only a quote *wizard*: `lib/freight/public-estimate.ts`, `/freight-quote`) | 🔴 **gap** — no "browse routes & rates" customer surface |
| Public **quote wizard / estimate** | — (AX uses static cards) | `lib/freight/public-estimate.ts` + `actions/freight-quote.ts` + RFQ lead `freight_quote` (mig 0134) | ✅ Pacred ahead |
| RFQ **lead → sale notification** | `wp-transport-booking` Sale-Notification (`:29`, body missing) | `actions/admin/freight-leads.ts` + `/admin/freight/leads` (triage, mig 0151) | ✅ |
| **Quotation** (admin, line items, approval, convert) | TTP Orders Mock only (`ttp-orders-mock.php`, mock UI) | `freight_quotes`/`_items` (0048) + `/admin/freight/quotes` + compose engine | ✅ Pacred ahead |
| **Cost→sell→profit math** | ❌ none (display price only) | `rate-model.ts` + `rate-engine.ts` + P&L persist (0165) | ✅ **Pacred far ahead** |
| **Shipment / JOB** lifecycle + P&L snapshot | TTP Orders Mock (UI shell) | `freight_shipments` (0050) + `/admin/freight/shipments/[id]/p-and-l` | ✅ |
| **Ops cockpit** PRICING→SALES→DOC→ACC Kanban | (the Sheets "AX JOB", not in WP) | `freight_job_operations`/`_stage_checklists` (0163/0164) + `/admin/freight/operations` | ✅ |
| **Commission ledger** | ❌ none | `freight_commission_*` (0167) — DORMANT behind flag | ⚠️ rates need owner sign-off |
| **Customs declaration / ใบขน** | ❌ none in WP | `customs_declarations` (0057) + `/admin/freight/declarations` | ✅ |
| Doc set (CI/PL/Form-E/D-O/LOI) | ❌ none in WP | `components/pdf/*` + customs-doc-kit (W11) | ✅ (see `customs-brokerage-kit.md`) |
| **Ports master** (id_port/port_name) | `wp_ports` (`booking-sea-cards.php:99`) + `BABE_Ports` CRUD | — `pol/pod` free-text | 🔴 **gap** |
| **Container master** (type/size/name) | `wp_container*` + `container_type.php` + `BABE_Container*` CRUD | — `unit` enum only | 🔴 **gap** |
| **Carrier/brand master** | WP post + `post_tag` icon | — `carrier` free-text | ⚠️ gap |
| **Route-specific rate lookup** (port×carrier matrix) | per-card `price` keyed by port_start/end/brand | `tb_freight_rate` HAS pol/pod/carrier cols **but lookup ignores them** | 🔴 **accuracy gap** (`rate-lookup.ts:34-43`) |
| FX (monthly, manual) | Order-Formula `exchange_rate` default 34.5 (`:63-88`) | `business_config freight.fx_rate_thb_per_usd` (def 35) + `tb_freight_rate.fx_thb_per_usd` snapshot + `/admin/freight/rates` FX control | ✅ |
| **Master-data admin UI** | babe account-nav tabs (Management_data) | only `/admin/freight/rates` (rate rows) | 🔴 gap (no ports/containers UI) |
| Export reverse-flow | (WP is import-card-centric) | schema import-only | ⚠️ known gap (`freight-erp-model.md` §6) |

---

## 5. Sequenced gap-closing build plan (smallest money-risk first)

**G1 — Route-aware China-cost lookup (🔴 highest cost/profit-accuracy, LOW money risk).**
`rate-lookup.ts:34-43` drops pol/pod/carrier — a generic default rate can silently mis-price a specific route → wrong NET profit (violates "ห้ามเดา"). Fix: pass the shipment's `pol/pod/carrier` into the lookup, prefer the most-specific match (exact → wildcard `''` fallback), keep the degrade-to-null + `chinaCostPending` honesty path. Pure-function-testable; touches no money path (P&L is display-only). **Do first.**

**G2 — Freight master-data tables + admin UI (🔴 accuracy foundation, LOW risk, additive).**
Add `tb_freight_port` (id, name, country, mode) · `tb_freight_carrier` (id, code, name, logo) · `tb_freight_container_type`/`_size` (mirrors `wp_ports`/`wp_container*`). Convert `tb_freight_rate.pol/pod/carrier` free-text → FK (keep text fallback during migration). Build a small `/admin/freight/master-data` CRUD (reuse the `/admin/freight/rates` client pattern). Additive migration, no money write. **Request the AXELRA WP dump first to seed real port/carrier lists.**

**G3 — Public "browse routes & rates" surface (🟠 revenue/UX, LOW risk, customer-safe).**
Port `[booking_sea_cards]` as a Pacred public page: list route cards (POL→POD, container, **SELL-only** "เริ่มต้น ฿X", carrier logo) → CTA into the existing quote wizard / LINE. Reads G2 master + a published-rate view. Strictly SELL-only (never cost/margin) — mirror `public-estimate.ts`'s customer-safe contract.

**G4 — FCL + AIR sell-card transcription completeness (🟠 accuracy, owner-data-blocked).**
`rate-model.ts` flags LCL+truck as fully grounded but FCL/AIR sell-cards as "representative". Close by transcribing the remaining IMPORT `.xlsx` FCL/AIR columns. **Blocked on the AXELRA xlsx** (binary; request the numbers in writing).

**G5 — Export reverse-flow (🟠 scope, MEDIUM, deferred).** Schema is import-only; add export direction to shipment/declaration. Tracked in `freight-erp-model.md` §6.

### Owner-policy-blocked (do NOT build blind)
- **Commission rates** (1%/5%/5% − 3% WHT; flat 20฿ DOC; 25฿ messenger) — `FREIGHT_COMMISSION` const + `freight_commission_*` ledger ship **DORMANT** behind `business_config commission.freight_enabled` (0/4 tiers confirmed). **Owner must confirm rates in writing + flip the flag.** (`rate-model.ts:159-164`.)
- **≤15k/ตู้ margin cap** — advisory only; owner decides hard-gate (`0165` comments).
- **Monthly FX rate** — manual refresh (no FX API); owner/accounting sets `freight.fx_rate_thb_per_usd`.
- **มูลค่าสำแดง (DECLARED) policy** — ADR-0016; accounting sign-off on VAT base before issuance.
- **NETBAY e-filing** — hard external blocker (creds + payload schema); see `customs-brokerage-kit.md` §6.

---

## 6. What this audit did NOT cover (explicit)
- **The freight DB dump body — skipped, and in fact ABSENT** from the extract (no `.sql`/`.csv`/`.xlsx`; no `containers.csv`). **A schema read is needed** → request the AXELRA WordPress DB dump (esp. `wp_ports`, `wp_containers`, `wp_container_name`, `wp_size_con`, `wp_container_types`, and the `wp_postmeta booking_sea/booking_air` rate rows) before building G2.
- **Missing plugin implementation bodies** — every custom plugin's `includes/`/`class/`/`templates/` was not extracted (only entry `.php`). If the AX system *does* have hidden cost/profit logic, it would be in `booking-custom/class/sea.php` + `wp-transport-booking/includes/*` + `ba-book-everything/includes/class-babe-prices.php` / `class-babe-order.php` — **none present**. Request these if a deeper AX pricing audit is wanted (low expected value — the spreadsheets are the source of truth, already ported).
- **cargoT (1,520 order-edit renders)** — read structurally (CARGO backoffice, status 1–12), not row-by-row; out of freight scope.
- **Did not run** `pnpm verify` / browser checks — this is a READ-ONLY grounding doc; no non-doc file was changed.
