# Freight web apps + workflow + systems — decoded (2026-06-01)

**Cluster:** FREIGHT WEB APPS + WORKFLOW + SYSTEMS.
**Source:** `/Users/dev/Desktop/olddata dev/data งานเก่า/Project dev/`.
**Scope decoded:** the AXELRA booking/job web UIs · the Google-Apps-Script (GAS) sheet backbone (the LIVE production freight ERP) · the documented work-flow · the CargoThai scrape + clones + the AX↔TTP↔CargoThai↔MOMO↔JMF↔PCS relationships · the formal Prisma data model · the WordPress customer portal.

> **Headline:** This folder is **AXELRA (Thailand) Co., Ltd.** — the owner's *international freight + customs-brokerage + domestic-trucking* business (registration `0105564077716`; "AXELRA" rebrands from the prior PCS-era freight side). It is operationally run on **Google Sheets driven by Apps Script** (not the PHP cargo system, not Pacred). The HTML files are mostly *prototype/redesign mockups* of where the freight ERP was heading. **CargoThai (`cargothai.tech`)** is the China-warehouse SaaS that AXELRA's partners (TTP, JMF, MOMO, CARGO CENTER) all key into — it is the SAME system the `pacred demo cargothai.html` blueprint is cloned from. **`momo = jmf`, `psc(pcs) = ttp`** (verbatim from `เคลียร์งานแอร์.txt`).

---

## §1 — The business this reveals (AXELRA freight, vs PCS cargo)

PCS/Pacred = **China→Thailand cargo consolidation** (ฝากสั่ง/ฝากนำเข้า/ฝากโอน, LCL consolidation by weight/CBM, the customer self-serves a cart + wallet). **AXELRA = the FREIGHT + CUSTOMS-BROKERAGE side** — a higher-touch, sales-led, per-shipment B2B operation that PCS never covered:

- **FCL (full-container) + LCL + AIR (general/express/DG) + cross-border TRUCK** (Mukdahan / Laos transit) — full Incoterm spectrum (EXW · FOB · CIF · DDP), not just NON-doc cargo.
- **Real customs brokerage** — ยิงใบขน (file customs entry via NETBAY/e-Customs), ตัวแทนออกของ (licensed broker), D/O exchange with shipping lines (MSC/COSCO/RCL/CUL/Evergreen), ตรวจปล่อย (inspect-release at port), Form E / ACFTA, FE, license-gated goods (มอก./กสทช./อย./กรมเกษตร/กรมมลพิษ), tax-refund, export.
- **Two billing entities, multi-brand:** `AXELRA` and `NNB` (THE N N B TRADING CO., LTD. — reg `0115567039173`, the sister juristic used for some imports). The GAS `generateJobId` mints **`A{yyMM}{5}`** for AXELRA, **`GZS{yyMM}{5}`** for NNB sea, **`GZE{yyMM}{5}`** for NNB truck.
- **Internal P&L per shipment** — cost vs revenue vs profit + a **multi-tier sales commission** engine (5% + 5% + 1% on freight/customs/doc legs, minus 3% WHT) + DOC commission + a "PC" (pricing) commission. This is the heart of the system and is far richer than PCS's `tb_user_sales`.
- **Workflow = a 5-stage hand-off pipeline** across **4 departments**: `PRICING → SALES → DOC → ACC` (+ DONE). Each shipment is a job that walks the departments — totally unlike PCS's order-status flow.

---

## §2 — The freight WEB UIs (prototype layer — the UX spec, not the live system)

These HTML files are **standalone design prototypes** (mock data, no real backend wiring — `submitBooking()` just shows a modal; AX JOB's data is a hard-coded JS object). They are the **redesign target** for the GAS system below.

### 2.1 `AX BOOKING.html` (+ 2 byte-identical "Copy" variants) — public quote wizard
A 5-step "Smart Booking" funnel (navy + AXELRA-orange theme, Bebas Neue / Sarabun). Captures a **lead/quote request**, NOT a confirmed job:
1. **ประเภทลูกค้า** (บุคคล / นิติบุคคล) + **ประเภทบริการ** (นำเข้า · ส่งออก · ออกใบขน · ฝากสั่ง/NON · เคลียร์ด่าน · ฝากโอนหยวน).
2. **Transport** (เรือ/แอร์/รถ) + **Incoterm** (EXW/FOB/CIF/DDP) + **POD** (กรุงเทพ-PAT / แหลมฉบัง-LCB / อื่นๆ) + **carrier picker** (AXELRA "best rate" pushed first, then COSCO/Maersk/MSC/TG/Air China…).
3. **Goods** — FCL (20GP/40GP/40HC/45HC + qty + tonnage) · LCL (CBM + weight + dims) · AIR (real vs **volumetric weight = CBM×167**, chargeable = max) · special-flags checklist (มอก./กสทช./อย./ลิขสิทธิ์…) · origin (CN cities) + USD goods value.
4. **Add-on services** (หัวลาก ฿2,500 · แรงงาน · ประกัน · warehousing · packing · fumigation · ล่ามจีน) + a **document checklist that mutates by customer-type × Incoterm × service** + a **YY-matching / import-registration** section that appears only for EXW/FOB.
5. **Instant quote** (client-side `calcQuote()` — e.g. LCL sea ฿2,000/CBM, ฝากสั่ง/DDP ฿3,500/CBM, truck ฿5,500/CBM, FCL flat per size, +฿1,500 customs +฿500 docs) → contact form / call-me / LINE → ref `AX-YYYY-#####`.

> **Insight:** this is a far more sophisticated quote engine than Pacred's `/start-order` — it encodes Incoterm logic, doc-requirements-by-context, volumetric air weight, and a live price waterfall. **This is the spec for a Pacred freight-booking front-end.**

### 2.2 `AX JOB.html` — internal operations pipeline (the ops cockpit)
A role-switched **Kanban pipeline** (columns `PRICING · SALES · DOC · ACC/BILLING · สำเร็จ`), with a top role-bar (`ADMIN / PRICING / SALES / DOC / ACC`) and a left tool-rail (Pipeline · Kanban · ตารางงาน · Pricing Queue · Sales Deals · Documents · Messenger · Accounting · Reports). Each shipment is a card (badge SEA/AIR/TRUCK, product, client, member-id, carrier, % progress bar, assigned-staff avatars, urgency chip). Clicking opens a **stage-aware detail panel**:
- **PRICING** view → editable cost/sell/profit table per cost-line (Ocean Freight, Customs Clearance, Doc Handling, Trucking) + commission preview → "ส่ง Quote → SALES".
- **SALES** view → member/agent/POD/quotation/status + a Sales checklist (send quote → call-confirm → customer-confirm → attach INV/PL → hand to DOC) + file upload.
- **DOC** view → carrier/BL/container/seal/ETD/ETA/CBM/KGM + a **Document checklist** (B/L · D/O แลกแล้ว · ใบขน · ผ่านพิธีศุลกากร · ตรวจปล่อย · ขึ้นตู้ · ส่งสินค้า · Invoice วางบิล) + **Messenger** dispatch rows (แมส แลก D/O · ส่งสินค้าลูกค้า) + DOC cost breakdown.
- **ACC** view → invoice/receipt refs, **P&L breakdown** (ยอดขาย − ต้นทุน = กำไรสุทธิ), **commission calc** (5%+5%+1% − 3% WHT), and an ACC checklist (ปิด AP · AR วางบิล · HR จ่ายค่าคอม SALES/DOC).
- `advanceStage()` walks `pricing→sales→doc→acc→done`.

> **Insight:** this is a **per-shipment workflow + RBAC + P&L + commission cockpit** — the single most valuable artifact in the cluster. Pacred's admin has nothing like a department hand-off pipeline; this is what a Pacred "freight" admin module should look like.

### 2.3 Other UI files
- `PC SEA FRIEGHT.html` — a **freight-rate intelligence infographic** (Chart.js): China→TH ocean rates Mar-2025→Feb-2026, 20'/40' PAT vs LCB, seasonality (peak Nov-Dec pre-CNY $965-1,350/TEU, trough Aug-Sep $400). A pricing-reference dashboard, not transactional.
- `Login.html` — dual-tab auth: **Staff** (username/password) vs **ลูกค้า/Member** (Member ID `AX###`/`NNB###` + password) with a self-register flow.
- `Index.html`/`Javascript.html`/`Stylesheet.html` — the GAS web-app SPA shell (the front-end that `Code.gs` serves).
- `WEB DEV/` — an **older snapshot** of the same GAS app (Code.gs/Index/Javascript/Login/Stylesheet, Feb 2026) — predecessor of the root files.
- `main pond/` — a generic logistics landing mockup (mockup.html + style.css + script.js).

---

## §3 — The GAS sheet backbone (THE LIVE SYSTEM — this is what they actually run)

Two distinct Apps Script projects, both backed by the **same Google Sheets**:

### 3.1 `Code.gs` (3,212 lines) — the AXELRA SHIPPING ERP web-app backend
A `doGet`-routed HtmlService web app (pages: login · track · supplier · sea_freight · main ERP) reading/writing Google Sheets. CONFIG pins **3 spreadsheets**:
- **Main** `1gwqNOUW…WpNA0` — 13 tabs incl. `2.SALE BOOKING / SHIPMENT / COMMISSION` (the master job table), `1.MEMBER SALE`, `3.DOC DATA`, `3.1DOC PLAN SUP`, `4.STATEMENT axelra`, `4.1ACC axelra DATA SHIPMENT`, `MESSENGER`.
- **ACC** `1Z0QY…LLL4` · **PRICING** `10LZp…nbK4`.

Functions (≈22 modules): `getDashboardData` · `filterJobs` (server-side multi-field filter on the 34-col booking sheet) · `getJobCard` · `saveBooking` (mints job id + **auto-assigns staff** + auto-creates a Drive folder + emails staff) · `updateJobStatus` (+ remark audit log + status-change email) · member CRUD · DOC/ACC/PRICING/MESSENGER readers · **full Gmail integration** (inbox/thread/reply/search-by-shipment — email is a first-class data source) · per-user settings + user-management (passwords in `PropertiesService`, sessions in `CacheService`, 8h TTL) · ETA notifications by role · **public tracking** (`getTrackingByShipment` → status + the pricing/doc/acc pipeline) · **supplier portal** (truck/messenger/warehouse suppliers see + accept jobs).

**Booking sheet schema (34 cols A–AH, decoded from `getJobCard`):** date · member · pricingOrderNo · **shipment(D, HYPERLINK to Drive folder)** · quotation · invoice · agent · **company(AXELRA/NNB)** · **type(SEA/AIR/TRUCK/EK CARGO/SEA CARGO)** · sales · pricing · doc_cs · doc_billing · acc_ap · acc_ar · paytype · **consignee · product** · consignee_addr · shipper · shipper_addr · exim(IM/EX) · term(Incoterm) · add_service · pod · size · truck_type · **status** · etd · eta · ship_date · vat_doc · closed · remark.

**Status vocabulary (the real freight flow):** `รอคอนเฟิร์ม → รอ ENTER → รอตรวจปล่อย → แลก D/O → รอค่าใช้จ่าย D/O → อยู่ลาวรอเข้าไทย → เวียดนาม → รอยิงใบขน → สำเร็จ / ยกเลิก` (+ supplier sets `กำลังจัดส่ง`). Note: free-text status, not an enum — fragile.

**Auto-assign matrix** (`CONFIG.AUTO_ASSIGN`, keyed `COMPANY_TYPE`): e.g. `AXELRA_SEA → {pricing:WEB, doc_cs:WIN, doc_billing:TOP}`, `AXELRA_TRUCK → {doc_cs:DEV, doc_billing:POOM}`, `NNB_SEA → {doc_cs:WIN, doc_billing:PLOY}`. Staff = POP/WIN/DEV/POOM/GRING/AOM/NUN/PLOY/WEB/BAM/PURE/KAE.

### 3.2 `SCRIPT GG SHEET - รหัส.gs` (v6.1) — the spreadsheet-bound TRIGGER engine
The other half: an `onEdit`-driven automation living **inside** the Sheet (menu "☁️ ระบบอัปโหลด" / "⚙️ เครื่องมือ Admin"). It is the real glue:
- **PRICING → SALE transfer:** a checkbox in `ส่งสอบถามราคา PRICING` (col 23 TRUE) pushes a confirmed quote into `2.SALE BOOKING`.
- **Two-way CTNS/CBM/KGM sync** between `2.SALE` ↔ `3.DOC DATA`.
- **IV/RT (invoice/receipt) sync** `2.SALE` ↔ `4.1ACC` (col-mapped, preserves HYPERLINKs).
- **Commission sync** `2.SALE` ↔ `ตรวจ COMMISSION` (20 cols 14-33 ↔ 42-61 — the commission columns that AX JOB's ACC view summarizes).
- **Drive-folder auto-create** per `COMPANY|TYPE` (`FOLDER_MAP` — separate Drive roots for AXELRA/NNB × AIR/SEA/TRUCK/ใบขนทางรถ/ใบขนทางเรือ/EK CARGO/SEA CARGO/ขอคืนภาษี/ออกใบกำกับภาษี).
- **Google Calendar sync** of ETD/ATD/ETA/ATA/Delivery to per-brand + messenger + 3 warehouse calendars (CUS/TTP/TTW).
- Shipment-ID normalize, slip/doc upload to the job's Drive folder.

> **The whole AXELRA ERP = Google Sheets + Apps Script + Gmail + Drive + Calendar.** No real database, free-text statuses, column-index coupling (the v6.1 changelog is all "insert a column → renumber 30 mappings" — extremely brittle). **This is the #1 thing Pacred could replace with a real schema.**

### 3.3 `(hub)Code.gs` — the CargoThai bridge (the live AX↔CargoThai link)
A small hub web app that (a) **calls CargoThai's REST API** `https://cargothai.tech/api/service/{GetContainer|GetDetail}?_token=…` to pull containers/details, and (b) **receives CargoThai webhooks** (`?page=cargothai_webhook` POST → logs `{dataStatus, sm_code, ct_status}` to a sheet). So CargoThai pushes status events to AXELRA — exactly the inverse of what Pacred wants to PROVIDE.

### 3.4 Integration stubs in `Code.gs §22` (the partner/gov surface)
- **CargoThai** — both an Excel-upload parser (Chinese/English dual-header, key cols ReceivingNo `CG000xxxxx`/CTNS/Weight/CBM/customer-remark) AND a REST client (`cargothai.tech/api/service/*`, token-auth).
- **NETBAY** (`api.netbay.co.th`) — the **customs e-filing gateway** (ยิงใบขน to กรมศุลกากร). Credentials blank = wired but not activated.
- **PEAK** (`api.peakaccount.com/api/v1`) — accounting API (the same PEAK ภูม is targeting on the Pacred side).

---

## §4 — The CargoThai clones + scrape (the warehouse-SaaS layer)

The folder contains **CargoThai itself, reverse-engineered**:
- **`cargoT/`** — a full authenticated **scrape of `cargothai.tech/backoffice`** (`scrape.py` uses a real `laravel_session` cookie): 1,442 dynamic pages, 722 images, `full_backup_advanced.json` (106MB). It walks **container → bags → shipments → tracking → SM (Manage) → history_logs** and the **sticker / edit / manage** pages. CargoThai = a **Laravel** app.
- **`src cg/containers.csv`** — 999 scraped containers. **Branch distribution proves the multi-tenant model: TTP 475 · JMF 215 · MOMO 170 · CARGO CENTER 104 · ALI/LIYING/SHIBA/TTW** — i.e. all of AXELRA's China-side partners are **tenants inside ONE CargoThai instance**. Schema: `id, sm_code (SMA…-{BRAND}{cust#}), branch, transport (EK/SEA), sm_date, box_total, box_weight, box_cbm, status, printed`. Transport: EK(air) 762 · SEA 221.
- **`CGTH/`** — a working **Vercel + Supabase rebuild** of CargoThai's public side: `tracking.html` (search by SM-code or tracking#) backed by `/api/tracking`, `/api/containers`, `/api/container/[id]` — Supabase tables **`containers` + `products`** (`products.product_tracking`, `containers.sm_code/branch_id/transport_name`) + a `backoffice.html`. This is a **proof-of-concept of the exact "public `/track/{code}`" USP** in the CargoThai blueprint, already on the Pacred stack (Supabase).
- **`MOCKUP AX/`** — `main cargo thai 2-5.html` (warehouse worker-app redesigns) + **`SAMPLE CARGO TH/`** = live screen captures of CargoThai's real screens (`smp_backoffice/receive/arrival/bag/tracking/transport/all status/note tracking`) — the source the `pacred demo cargothai.html` was built from. Worker views: home · allstatus · receive (รับของ) · transport · arrival · notetracking · bag (กระสอบ) · tracking.
- **`MOCKUP AX/AXELRA_project_context MD`** — documents **`axelra.global/my-account/`**, a **WordPress (BA Book Everything plugin) customer portal**: order tracking with statuses `pending(รอรับตู้) → loaded(ขึ้นเรือ) → in_transit → arrived_port → out_delivery`, container/port/country/fee management, member IDs `AX001`. Confirmed by `axglobal/` (full WP install: plugins `ba-book-everything`, `booking-sea-cards`, `cargothai-cache`, `cargo-port-map`, `container_type`, polylang, GTM).

---

## §5 — System / API relationship map (AX ↔ TTP ↔ CargoThai ↔ MOMO ↔ JMF ↔ PCS)

```
CHINA WAREHOUSES (consolidators / partners)        ← all key into ONE CargoThai instance (Laravel)
  TTP(=PCS) · JMF(=MOMO) · CARGO CENTER · ALI · LIYING · TTW   (branch_id per tenant)
        │  container→bags→shipments→product tracking→history
        ▼
  CargoThai (cargothai.tech)  ── REST /api/service/{GetContainer,GetDetail} (token) ──▶  pulled by AXELRA
        │  webhook {dataStatus, sm_code, status} ───────────────────────────────────▶  AXELRA (hub)Code.gs
        ▼
  AXELRA freight ERP  =  Google Sheets + Apps Script + Gmail + Drive + Calendar
     · 2.SALE BOOKING (jobs)  · pipeline PRICING→SALES→DOC→ACC  · commission/P&L  · member portal (WP my-account)
        │  ── NETBAY ──▶  กรมศุลกากร (file ใบขน / e-Customs)
        │  ── PEAK   ──▶  accounting
        │  D/O exchange ──▶ shipping lines (MSC/COSCO/RCL/CUL/Evergreen) ; AIR via BFS/WFS/Thai Cargo
        ▼
  Thailand customs-cleared → trucking/messenger → delivered ; AR billing + sales commission paid
```

**Verbatim equivalences (from `เคลียร์งานแอร์.txt`):** `momo = jmf`, `psc(pcs) = ttp`. So: **TTP and PCS are the same China-side operation; MOMO and JMF (ไอแต้ม) are the same**. Pacred today *consumes* MOMO's API (`momo_*` tables) to learn container/cabinet status — i.e. Pacred is one of CargoThai's downstream consumers, the same role AXELRA's hub plays.

**Brand split timeline:** AX + TTP ran freight together (closed containers together, fired status APIs to each other) then split; AXELRA now closes containers with **MOMO** instead of TTP — mirroring the Pacred-side `MOMO instead of TTP` switch. Same partner shuffle, two product lines (PCS cargo, AXELRA freight).

---

## §6 — What Pacred LACKS to do freight (gap vs current cargo system)

Pacred = a faithful PCS **cargo** port. It has **zero** of the freight/brokerage spine:

1. **No per-shipment department pipeline** — Pacred orders have a single status; AXELRA needs `PRICING→SALES→DOC→ACC` hand-offs with per-stage checklists, assignees, and a Kanban (AX JOB.html).
2. **No quote/booking funnel for freight** — `/start-order` is cargo-only; no Incoterm logic, no FCL/LCL/AIR-DG modeling, no carrier picker, no context-driven document requirements, no volumetric-weight calc (AX BOOKING.html).
3. **No customs-brokerage objects** — ใบขน, D/O exchange, ตรวจปล่อย, Form E/ACFTA, HS-code, license-gating (มอก./กสทช./อย.), NETBAY e-filing. None exist in `tb_*`.
4. **No freight P&L + commission engine** — AXELRA tracks cost/sell/profit per cost-line + multi-tier sales/doc/PC commission − WHT. Pacred's `tb_user_sales` is single-tier cargo commission only.
5. **No multi-entity billing** (AXELRA + NNB) — Pacred is single-company.
6. **No supplier/messenger dispatch portal** — AXELRA dispatches truckers/messengers/warehouses who self-accept jobs.
7. **No second-customer portal pattern** — AXELRA has its own WP `my-account` (AX### members) separate from Pacred's PR customers.
8. **No CargoThai PROVIDER side** — Pacred only *consumes* MOMO; AXELRA (via hub) also consumes CargoThai. Neither *provides* the API (the blueprint's lease goal).
9. **No freight-rate intelligence** — seasonal ocean-rate tracking (PC SEA FRIEGHT) is pure spreadsheet today.

**What Pacred CAN reuse / already overlaps:** Supabase (CGTH proves the public-track pattern works on it) · the `momo_*` consume pattern (= CargoThai consume) · PEAK target (shared with ภูม's lane) · barcode/QR/Quagga stack · `tb_forwarder`/`tb_cnt`/`momo_sack` spine maps onto CargoThai container/bag/shipment (per the CargoThai blueprint §2).

---

## §7 — Max potential / how to build it BETTER (the CEO "expand + improve")

1. **Kill the spreadsheet ERP — port AXELRA to a real schema.** The cleanest target already exists: **`PJ-BOOK/axelra-erp/`** — a Next.js 16 + Prisma + Postgres app (next-auth, neon/pg adapters) with a **10-model schema converted straight from the booking workbook**: `User · Customer · Shipment · DocData · DocPlan · Messenger · PricingRequest · AccStatement · AccShipment · PricingStatus`. This is the formal data model for everything in §3 — adopt it (or port it into Pacred's Supabase as a `freight_*` schema family) to escape the col-index brittleness. The `Shipment` model already has every field incl. ETD/ATD/ETA/ATA, full commission columns, and HR-payout fields.
2. **Build the freight booking funnel + ops pipeline as Pacred modules** — AX BOOKING.html = the quote-wizard spec (with the Incoterm/doc/volumetric logic intact); AX JOB.html = the `(admin)/admin/freight/*` pipeline cockpit spec (PRICING→SALES→DOC→ACC, RBAC, P&L, commission). These two HTML files are production-grade UX specs — wire them to the Prisma/Supabase schema.
3. **Own the CargoThai layer instead of scraping it.** The team is *already* scraping CargoThai (cookie-based `scrape.py`) and *already* rebuilt its public track on Supabase (CGTH). This is the strongest evidence for the CargoThai-blueprint plan: stand up our own warehouse-intake + **become the API provider** (the `containers/products` Supabase model in CGTH is the seed) so partners (TTP/JMF/MOMO/CARGO CENTER) key into **us**, not cargothai.tech.
4. **Real customs-brokerage automation** — wire NETBAY (e-ใบขน) + a HS-code/ACFTA/license engine (the `ท่า Port.txt` + customs-AI prompt show the domain depth: port codes, DO costs per warehouse, Form E, ACFTA blocks). This is a genuine moat — no Thai cargo competitor offers self-serve customs filing.
5. **Unify the two customer portals + the two product lines.** One Pacred login → cargo (PCS) *and* freight (AXELRA) under one account, one wallet, one tracking surface. The public `/track/{code}` (already prototyped in CGTH) becomes the single front door for both.
6. **Freight-rate intelligence as a live feature** (PC SEA FRIEGHT) — pull/seasonalize ocean rates to power the booking quote + a "book-now-vs-wait" advisor.

> **Bottom line:** AXELRA is a *whole second business* (international freight + customs brokerage + trucking) currently held together by Google Sheets. Pacred has the platform (Supabase/Next) but none of the freight domain objects. The highest-leverage move is to (a) adopt the PJ-BOOK Prisma schema as the freight data model, (b) ship AX BOOKING + AX JOB as real Pacred modules, and (c) execute the CargoThai-provider plan so the whole partner network (TTP/JMF/MOMO) keys into Pacred — closing the import-export loop end-to-end.
