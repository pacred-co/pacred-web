# 🛠 Legacy Chat R&D — Dev / IT / System / MOMO Integration

> **Captured:** 2026-05-17 · **Source:** 13 LINE chat exports from เดฟ's `data งานเก่า/` covering
> the PCS/Axelra dev+IT teams, the MOMO warehouse partner integration, the HS-code/VAT desk,
> and project-approval threads (Mar–May 2026).
>
> **Scope of this doc:** the *internal IT/dev/system* angle — bugs the team hit, the MOMO API
> as actually used in production, back-office workflow decisions, HS-code/VAT handling, and
> the "leak holes" where money/data/status fell through cracks.
>
> **Read alongside (do NOT duplicate — this doc extends them):**
> [`cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) (cargo ops model + problem catalog A–F) ·
> [`chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) (customer-facing leak holes L-1..L-10, MOMO status enum) ·
> [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md) (the partner-API doc this feeds).

---

## 1. Summary

The dev/IT chats confirm and *sharpen* what the two prior audits found, and add hard new
facts. The headline picture:

- The legacy PCS cargo system is a **single-developer PHP monolith** run by one freelancer
  (ไอแต้ม / "Tam", `info@tiso-ai.com`, `TISO-ai.com`). Every config change — add a courier,
  toggle a withdrawal rule, fix a receipt, top up SMS, rebind a tracking number — is a chat
  ticket to him. The `ทีม IT PCS CARGO` group is, end to end, **48 such tickets in 6 weeks**.
- **"เว็ปล่ม" (web down) appears ~20 times** in the IT group alone between 09 Apr and 15 May,
  each auto-answered by a bot ("รอ 1-2 นาที แล้วเข้าเว็บใหม่"). Outages are treated as routine
  weather.
- The **MOMO integration** (warehouse + auto-tracking partner, live since 06 Apr 2026) is the
  single biggest new fact-source. It is a **read-only pull API** — Pacred/PCS has no write
  access; every data correction goes through MOMO's own dev (`BBOY`). Decoded details in §3.
- A whole second team — the **HS-code / VAT desk** — runs the freight money math by hand in
  LINE + Google Sheets, with no system support at all. This is net-new territory for Pacred
  (§4.3).
- The legacy team itself decided (28 Apr) to **rebrand PCS → Pacred and rebuild the back
  office from scratch** — i.e. Pacred-web is the sanctioned replacement, not a side project.

The strategic conclusion is unchanged from the forensics audit but now better-evidenced:
**the migration's #1 job is to delete the human bottleneck.** Almost every chat below is a
task that should have been a button.

---

## 2. System pain points + leak holes found

Severity: 🔴 blocks revenue · 🟠 daily pain · 🟡 fix soon.
IDs prefixed `DI-` (Dev/IT) to stay distinct from the forensics audit's `A–F` and the
customer audit's `L-` series. Cross-refs noted where they overlap.

### DI-1 🔴 Single-developer bottleneck — every change is a chat ticket
Extends forensics **F1** with the raw evidence. In `ทีม IT PCS CARGO` + `PCS DEV`, ไอแต้ม
is personally asked to: add couriers (SPX, J&T, EMS, Flash, Lalamove — asked **5×**: 04 Apr,
12 May ×2, 13 May), top up OTP SMS credit (24 Apr), fix a withholding-tax receipt (16 Apr),
fix square-box Thai chars in a receipt (12 May), unlock a one-off wallet withdrawal (06 Apr),
re-key a wrong container number (24 Apr), and rebind dozens of trackings→containers. He also
openly rations himself: *"อันนี้พี่ขอทำเรื่อง momo ให้เรียบร้อยก่อน… หลายเรื่องพร้อมกันไม่ทันครับ"*
(07 Apr) — features queue behind one person.
→ **Pacred fix:** admin self-serve for *all* of the above (couriers table, SMS-balance alert,
receipt re-gen, wallet rules, tracking rebind). None should ever be a dev task.

### DI-2 🔴 Web instability — "เว็ปล่ม" ~20× in 6 weeks
Extends customer audit **L-1** with the dev-side count. Dates in the IT group: 09 Apr, 20 Apr
(×3 in 6 min), 22 Apr (×3), 24 Apr (×2), 27 Apr, 05 May, 06 May (×3), 07 May, 08 May (×2),
12 May (×3), 15 May (×2). The auto-reply bot "รอ 1-2 นาที" is a *symptom-management* tool, not
a fix. Root cause = shared PHP hosting, no scaling, billed through a 3rd party on a pay-or-die
basis (forensics F3).
→ **Pacred fix:** Vercel + Supabase managed scaling (✅ in place). Add a public uptime page +
LINE alert. The mere *absence* of "เว็ปล่ม" will be a visible competitive win for sales.

### DI-3 🔴 Registration fails silently when OTP SMS credit runs dry
Extends customer audit **L-3**. Timeline is now exact: 22 Apr 18:52 a customer "เด้งออก" on
sign-up → 23 Apr two more reports → 23 Apr 22:12 owner escalates at night → **24 Apr 08:42
ไอแต้ม: "อันนี้ต้องเติม sms นะครับ"** then tops it up. ~14 hours of dead registration =
direct lost signups during an ad push. Recurs 15 May ("ใส่รหัสเกิดล้มเหลว").
→ **Pacred fix:** daily SMS-balance cron + LINE alert when low; explicit "OTP failed —
contact support" UX, never a silent bounce; `OTP_BYPASS` for dev (✅). Consider LINE OA
messaging as a cheaper OTP fallback.

### DI-4 🔴 Tracking↔container desync — staff cannot press "charge customer"
The most-repeated *operational* failure. Pattern, verbatim and constant: goods physically
arrive, MOMO closes the container, but the PCS system still shows "เข้าโกดังจีน" / no
container number → **"กดให้ลูกค้าชำระเงินไม่ได้เลยครับ"** (Pop, 02 May). Until a container
number is attached, the order cannot be billed → revenue frozen at the finish line.
ไอแต้ม's stopgap is to **hand-paste a multi-line tracking search URL** and manually reconcile
(see DI-12). Overlaps customer audit L-2 / L-4 and forensics C3.
→ **Pacred fix:** event-driven MOMO sync (not manual), an admin **"rebind tracking →
container"** screen, and a billing model that can attach a container the moment status data
arrives.

### DI-5 🔴 Status ≠ container number — data internally contradictory
28 Apr, tracking `KK300134218162`: the system shows transport-mode **truck**, the customer
*chose* truck, but MOMO's data says it is on a **sea** container. ไอแต้ม: *"สถานะกับเลขตู้
ไม่ตรงกันครับ"*. The two fields are populated from different feeds and nothing reconciles
them. A customer billed on a contradictory record will dispute it.
→ **Pacred fix:** treat transport-mode + container assignment as one validated unit; flag
mismatches to staff *before* the record is billable. Pairs with forensics D1/D2.

### DI-6 🔴 Container split → quantity collapses to `1`
13 May, `PCS8289` tracking `1083767`: 85 boxes, 40 received, system shows **QTY = 1**.
MOMO dev BBOY confirms: *"เป็นข้อจำกัดของแอปรับเข้าไทย"* — the Thai-warehouse receiving app
cannot represent a partial / split parcel, so it writes `1`. The split half becomes a new
suffixed tracking (`1083767-2`). Already known to migration `0037` but the chat shows it is
**still live and customer-visible** ("ในระบบขึ้นจำนวนสินค้าแค่ 1"). Overlaps forensics D4,
customer audit L-2.
→ **Pacred fix:** first-class `expected_qty` / `received_qty` per shipment item; model the
`-N` split-tracking suffix explicitly; never collapse to 1.

### DI-7 🟠 "ตกหล่น" (missing items) has no system representation
Recurring in the MOMO group: `760224087537` — 5 pieces shipped, 4 arrived, 1 lost (02 May);
`GZE260429-1` — 1 piece short (08 May); plus several "ขาด 1 ชิ้น" with photos. Resolution is
100% chat: photograph, ask the warehouse, hope. There is no missing-item record, no
customer-facing flag, no audit trail.
→ **Pacred fix:** a missing-item / discrepancy report object on the shipment, with
expected-vs-received counts, photos, status (searching / found / written-off), and customer
notification. Pairs with DI-6.

### DI-8 🟠 Withholding-tax receipt breaks
16 Apr, `PCS9930` tracking `888067732484`: *"ใบเสร็จไม่หัก ณ ที่จ่ายให้"* — the receipt
failed to apply the customer's withholding-tax deduction; ไอแต้ม hand-fixed it and re-issued
(`printReceipt.php?id=FRC2604-00039`). Confirms forensics **A6** (WHT unmodelled) and customer
audit **L-5** from the IT side.
→ **Pacred fix:** WHT as a first-class field on the invoice/receipt (gross → wht 1%/3% →
net). See forensics A6 + ADR-0015.

### DI-9 🟠 PDF receipt renders Thai as squares (□□□)
12 May, `PCS10366`, a Bang Khun Thian address: *"ในใบเสร็จเป็นสี่เหลี่ยมแทน"* — the mPDF
font cannot render certain Thai characters; ไอแต้ม hand-fixes per-receipt. Confirms customer
audit **L-5 / L-10**.
→ **Pacred fix:** `@react-pdf/renderer` + Sarabun (✅); unit test receipt rendering with
real Thai addresses + special chars.

### DI-10 🟠 China product-search returns incomplete option sets
06 May: *"ลูกค้านำลิงค์สินค้ามาวาง แต่ตัวเลือกไม่ครบ"* — a customer pastes a Taobao/1688
product link into ฝากสั่งซื้อ and the SKU variant options come back incomplete. This is the
**ไอแต้ม-billed "API สินค้าจีน รายปี"** (the China-product API, annual fee, "pay today or
ฝากสั่งซื้อ stops working" — forensics §2) misbehaving. A broken option set = wrong order =
wrong charge.
→ **Pacred fix:** when porting ฝากสั่งซื้อ, treat the China-product API as untrusted —
validate the returned variant tree, and degrade to a "let staff complete this order
manually" path instead of submitting a half-parsed SKU.

### DI-11 🟡 Login fails on desktop with correct credentials
13 May, `PCS10251`: *"ไม่สามารถเข้าระบบในคอมได้ รหัสและชื่อถูกต้อง"* — login works on mobile,
fails on desktop. ไอแต้ม's diagnostic question ("เบอร์โทรศัพท์หรือ รหัสสมาชิก") suggests the
login form is ambiguous about whether the identifier is a phone number or a member code.
→ **Pacred fix:** one unambiguous identifier field with a clear label; device-agnostic
sessions (Supabase Auth ✅). See also DI-15.

### DI-12 🟢 (preserve) Multi-line bulk tracking-search URL
ไอแต้ม routinely pastes
`pcscargo.co.th/member/pcs-admin/forwarder-search-muti.php?fTracking=AAA%0D%0ABBB%0D%0A...`
to look up 10+ trackings at once (02 May, 22 Apr). Confirms customer audit **W-9** — this
pattern *works* and staff depend on it.
→ **Pacred fix:** keep a multi-line paste box in `/admin/forwarders` search. Do not lose it.

### DI-13 🟡 Bilingual / custom-label data system was bolted on late
18 Apr ไอแต้ม: he stood up a fresh MVC skeleton at `backoffice.pcscargo.co.th` and
*"ปรับให้รองรับแบบหลายภาษาที่เรากำหนดคำเองได้… ไว้ทำระบบคีย์สินค้าที่จีน"* — i.e. multi-language
with operator-defined terms was retrofitted, specifically so the China warehouse could key
goods. Pacred already has next-intl (th/en) but the lesson holds: **the China-warehouse
keying surface needs its own term/label config** (Chinese ⇄ Thai), or §3's type-code chaos
(A/M/X/O/Z vs G/T/F, forensics D2) repeats.

### DI-14 🟡 No file/document store — China manifests are loose files
02 May ไอแต้ม: *"แต่หลังจากนี้ผมจะทำระบบไว้เก็บไฟล์ทุก[ตู้]… ใส่ฐานข้อมูลกลางให้หมด"* — there
was **no central store** for the per-container WeChat 装柜明细 manifests; they lived as loose
files he had to dig through ("มันหลายไฟล์ละ"). When a tracking is disputed he literally
cannot find the source doc.
→ **Pacred fix:** every container gets a documents bucket (manifest, invoice, packing list,
Form E, D/O) attached to the `containers` record from day one.

### DI-15 🟡 Single-device login was the default (now historical)
08 Apr, MOMO's web: *"ระบบ Login ได้แค่ทีละเครื่อง"* → MOMO dev added multi-device same day.
Customer audit **L-6**. Noted only so Pacred never re-introduces single-session by default
(Supabase ✅).

### DI-16 🟠 Rate-control & price-edit history gaps (project-approval thread)
The `Project Approval` chat is a long negotiation over a "one-button adjust all import
rates" feature. Two concrete gaps surface: (a) ไอแต้ม **refuses to add an old-value column**
to the price-change history — *"ราคาเดิมพี่ทำให้ไม่ไหวครับ… มีประมาณ 200-300 รหัสลูกค้า"* —
so the audit trail of *what a rate was before* a change does not exist; (b) per-customer
rate overrides are scattered across 200–300 profiles with no dashboard. The owner's response
was to **scrap the VIP/SVIP tier system entirely** (keep tiers only as a "label", not a
price) and fall back to a flat default + per-customer overrides.
→ **Pacred fix:** rate changes must be a proper audited table (old value → new value → who →
when — cheap in Postgres); a rates dashboard showing current settings per group *and* the
list of per-customer overrides. Pairs with customer audit "rate flexibility" feedback.

---

## 3. MOMO integration facts decoded

This is the most valuable new material. MOMO (เจ้าของ = "PRINCE"; dev = "BBOY"; ops = "benz",
"Aong") became PCS's **China + Thailand warehouse and auto-tracking partner on 02–06 Apr
2026**, replacing the older TISO auto-tracking. The legacy `[`momo-jmf.md`](../integrations/momo-jmf.md)`
doc's endpoint list is *expected/placeholder* — here is what the chats actually prove.

### 3.1 The API — confirmed
- **Endpoint (confirmed, in chat):** `https://api-cn.alilogisticshub.com/?api=container-list`
  — note the domain **alilogisticshub.com** and the **`?api=<name>` query-style routing**
  (not REST path style). Other operations are almost certainly `?api=<other-name>` on the
  same host.
- **`container-list`** returns containers with a status field. ไอแต้ม built this endpoint's
  consumer himself on the morning of 02 May (*"ผมเพิ่งทำ api รายงานตู้เสร็จเมื่อเช้า"*).
- **Sync cadence:** ไอแต้ม pulls **every 15 minutes** into the PCS DB
  (*"ตอนนี้ทุก 15 นาทีผมอัปเดตให้ครับ"*, 06 Apr) — this is where the momo-jmf.md "15-min
  cron" number originates; it is a real observed value, not a guess.
- **Auth:** the project-approval chat contains a raw **HS256 JWT** (14 May) decoding to
  `{"user_id":68,"_id":"69fda549349f205edba23de1","last_online":"2026-05-14 10:21:26","iat":1778725325}`
  — i.e. an opaque session-style bearer token, MongoDB ObjectId user id. This matches the
  `MOMO_JMF_TOKEN` already recorded in momo-jmf.md.
- **Backing store:** the `_id` ObjectId + the forensics audit's ObjectId-suffixed filenames
  confirm MOMO's backend is **MongoDB**.

### 3.2 The container-status enum — confirmed verbatim
ไوแต้ม posted MOMO's 9-value status set on 02 May. It is **identical** to the enum already
in customer audit `chat-analysis-2026-05-16.md` §"MOMO canonical status enum" and mapped in
`lib/integrations/momo-jmf/types.ts`. Reconfirmed here so the two audits agree:
`loading_container · ek_left_china_border · ek_arrived_vietnam_border · in_transit ·
sea_leaving_china · sea_arrived_thailand_port · ek_arrived_mukdahan · unloading_in_thailand ·
unloaded_completed`. **No new values appeared** in 6 weeks of MOMO chat → the 9-value enum
is stable; Pacred can rely on it.

### 3.3 What MOMO does NOT give us — the integration's hard limits
- **No write access.** *"ข้อมูลแต้มไม่ได้เข้าถึงหลังบ้านเขาได้ครับ"* (02 May). Every data
  correction — wrong size, missing container number, split parcel — is filed to MOMO's dev
  BBOY in chat and *he* fixes it on MOMO's side. The owner explicitly asks on 08 May:
  *"ระบบ momo หลังบ้านเราเข้าได้ไหมครับ ลองขอเขาดูนะ"* — write access was still being
  negotiated. **Pacred must design for read-only.**
- **The API lags MOMO's own website.** ไอแต้ม repeatedly finds the `container-list` API and
  the MOMO web UI disagree (*"ที่เช็คค่อนข้างไม่ตรงกันเยอะ"*, 08 Apr) and that MOMO keeps
  *"ปรับแก้ตัวแปร"* (changing their variables/schema) under him without notice.
- **Items exist in the API but not the MOMO web, and vice-versa** (e.g. `888068221970`
  "ไม่พบในระบบ momo แต่มีใน api"; `PCS8963` "ในไฟล์ปิดตู้มี… แต่ใน api และหน้าเว็บ momo ไม่มี").
  The API is not authoritative on its own.
- **China-side keying is the upstream gate.** *"ยกเว้นทางจีนยังไม่คีย์เข้าระบบ อันนี้จะไม่มี"*
  — if the Guangzhou warehouse has not keyed a parcel, it appears nowhere. China keys via
  WeChat; closing-the-container ("ปิดตู้") is tracked by ไอแต้ม watching a **WeChat group**,
  not via API.
→ **Pacred design rules for the MOMO integration:**
1. Treat MOMO as an **eventually-consistent read replica**, never the source of truth for
   billing without a staff confirm.
2. Store a **`last_synced_at`** per container and show it (customer audit L-4).
3. Build the **admin rebind/correct UI** on the Pacred side — you cannot rely on writing
   back to MOMO; you can only annotate locally and chase BBOY.
4. Reconcile API vs (eventually) MOMO web vs China manifest, and surface the diff —
   do not silently pick one (forensics D1).
5. Expect the `?api=` query-routed, JWT-bearer, MongoDB-shaped payloads; build the client
   tolerant of MOMO changing field names.

### 3.4 The daily container bulletin — a real artifact to reproduce
MOMO ops (benz) posts a fixed-format daily summary into the group, e.g.:
```
22/04/26 สรุปรายการ — รวม 3ตู้ ครับ
#ค้าง
1.-GE260412-1  ถึงมุกดาหารแล้ว รอคอนเฟิร์มรถขนถ่ายวันนี้
2.-GE260414-1  ...
##ใหม่
3.-GE260416-1  ...
```
This matches customer audit **W-1**. Pacred should auto-generate this LINE-pastable bulletin
from container status — it is the artifact ops actually communicate with.

---

## 4. Workflow / decisions

### 4.1 Project-approval / sign-off culture
ไอแต้ม created a dedicated `Project Approval PCS x TISO` group *"จะสร้างเรื่อง confirm งานกัน…
พี่อยากให้แต่ละอย่างที่ทำมีความชัดเจน"* — he wanted written sign-off before building, and
shared an SRS doc folder. Lesson for Pacred: keep the **ADR / spec-before-build** discipline
(already in `docs/decisions/`); the legacy team learned the hard way that verbal scope =
rework.

### 4.2 The PCS → Pacred rebrand decision (the most important workflow fact)
- **28 Apr** the owner (Pop) decides: one website pointed at **`pacred.co`**, a brand-new
  LINE OA, and the whole back office cloned fresh for the new company — splitting customers
  PCS vs Pacred between himself and his brother.
- **02 May** `pacred.co` is live (WordPress + Elementor front; the `member/pcs-admin/` PHP
  back office cloned under it).
- **12 May** role split fixed: **ปอนด์ = front-end webpages** (FCL/LCL/clearance/ฝากสั่ง/
  ฝากโอน + ใบขน/ใบกำกับ), **ภูมิ = staff back office**, **เดฟ = customer back office**.
- The first launch ask (02 May): registration (just phone + name + "which service" +
  "where did you find us"), the sales back office, the main site, a clearance landing page,
  the LINE OA, reviews.
This is the genesis of the current Pacred-web team structure — the migration is **sanctioned
by the business**, and ports must respect the cargo (PCS-side) vs freight (new) split.

### 4.3 The HS-code / VAT desk — an entire manual workflow with zero system support
The `HS.CODE - VAT - PCS - PACRED` chat reveals a back-office function neither prior audit
covered in depth. Day to day:
- Sales/CS posts a **product photo + name**; a senior doc officer replies with **HS code +
  อากร (duty) % + Form-E eligibility + whether a tax invoice / ใบขน can be issued**.
  Real examples: ribbon → `9612.10.90`, duty 10%, FE 0%; artificial flowers → `6702.90.90`,
  duty 20%; shoe insoles → `6406.9099`, duty 10%; current sensor → `9030.3390`, duty 0%;
  laser welder → `8515.80.90`.
- **Yuan-rate quoting is also manual:** a "Web" account posts the day's Alipay transfer rate
  in bands (e.g. 12 May: ≤฿10k → 4.85, >฿10k → 4.84; rate is chased and re-quoted through
  the day). Confirms forensics' rate-volatility pain.
- **VAT math is done by hand in chat**, e.g.
  `57300 × 4.84 = 277,332` → `× 7% = 19,413.24` → total `296,735.24` → `× 50% = 148,367.62`
  (a 50%-deposit job). When the rate moved between the two deposit dates, staff decided to
  **split into two tax invoices** so each half uses its own rate — a real, recurring
  decision made entirely in LINE.
- **"แผน VAT" / declared-value engineering** is visible: a customer's real goods value is
  7,200 USD but the declaration sums to 525 USD, so staff "make up the difference" as a
  6,675-USD line under a chosen HS code (`84813040`) — and check whether duty+tax would breach
  a ฿13,000 threshold. This is exactly forensics **E2** (real vs declared value), seen here
  as a live conversation.
- Decision logged 13 May: **HS-code questions must go in the group, never DM** ("ห้ามส่ง
  ส่วนตัวค่ะ") — they want a searchable shared record. Pacred should give them one.
→ This is **net-new build territory** for Pacred — see §5 recommendations 5–6.

### 4.4 Policy decisions captured (system-relevant)
- 05 Apr — fuel surcharge **฿100/CBM** for everyone; implemented as a manual add/subtract
  **button**, not a rule, because rule-based was "too hard" with the VIP tiers (which were
  then scrapped — §DI-16).
- 06 Apr — wallet **withdrawal-without-prior-import** was toggled on, then locked back to a
  single customer — i.e. business rules were flipped per-incident with no policy surface.
- 06 Apr — default rates settled at **5500/3500** after VIP removal; special ceilings
  รถ 7500/45, เรือ 6500/40; floor อี้อู 5000(รถ)/3000(เรือ), กว่างโจว 4700(รถ)/2700(เรือ).
  (Same numbers as customer audit "Decisions made" — reconfirmed from the dev side.)

---

## 5. What Pacred must build / fix

Framed for Pacred (the new company), revenue-lens ordered. These **extend** the forensics
Part-V backlog and the customer-audit Part-U items — they do not replace them.

### Tier 1 — close the cargo money loop (revenue-blocking)
1. **Billing must not depend on a dev or on MOMO write-back.** Build the admin
   **tracking↔container rebind + correct** screen (DI-4, DI-5). A staff member must be able
   to attach/fix a container number and *then* press "charge customer" — today that whole
   chain is a chat ticket and revenue freezes at the finish line.
2. **Model partial / split / missing goods as first-class data** (DI-6, DI-7). `expected_qty`
   + `received_qty` per shipment item, an explicit `-N` split-tracking concept, and a
   discrepancy/"ตกหล่น" record with photos + status. Never collapse a quantity to `1`.
3. **OTP SMS-balance alerting** (DI-3). Daily cron + LINE alert when low; never let
   registration fail silently during an ad spend.
4. **Withholding-tax as a first-class invoice/receipt field** (DI-8) — see forensics A6 +
   ADR-0015. Gate receipt issuance on the WHT certificate upload.

### Tier 2 — kill the dev-ticket queue (operational unblockers)
5. **Self-serve admin for everything ไอแต้ม did by hand** (DI-1): a `carriers` table with
   CRUD (SPX/J&T/Flash/EMS/Lalamove), receipt re-generation, wallet-rule toggles, manual
   rate adjustment line, manual tracking entry. Each is a recurring chat ticket in the logs.
6. **Audited rate engine + rates dashboard** (DI-16): a price-change history table that
   *does* keep old→new values (trivial in Postgres — the legacy refusal was a PHP-effort
   issue, not a real constraint), plus a dashboard of current group rates and the list of
   per-customer overrides.
7. **Robust PDF receipts** (DI-9): `@react-pdf/renderer` + Sarabun (✅) with a unit test
   covering real Thai addresses + special characters + optional WHT.

### Tier 3 — the MOMO integration, built defensively
8. Implement the MOMO client per §3.3's five rules: read-only, `?api=`-query routing against
   `api-cn.alilogisticshub.com`, JWT bearer, 15-min sync, `last_synced_at` shown to
   customers, tolerant of field-name drift. Reconcile API vs China-manifest CBM and surface
   the diff (forensics D1).
9. Auto-generate the **daily container bulletin** in MOMO's `สรุปรายการ / #ค้าง / ##ใหม่`
   format for LINE paste (§3.4, customer audit W-1).
10. Give every container a **documents bucket** from creation (DI-14) — manifest, invoice,
    packing list, Form E, D/O — so a disputed parcel always has a retrievable source doc.

### Tier 4 — net-new: the HS-code / VAT desk (freight side, post-cargo-launch)
11. Build an **HS-code lookup workspace** (§4.3): product photo + Thai/Chinese name in →
    HS code + duty % + Form-E eligibility + tax-invoice/ใบขน flag out. Keep the senior-doc
    human in the loop (don't auto-decide); cache lookups by product name/image; make it
    searchable (the team explicitly wants a shared record, not DMs).
12. Build a **VAT / declared-value calculator** for the freight money math (§4.3): yuan-rate
    bands, the `value × rate × 7%` chain, deposit-split handling when the rate moves between
    payments, and explicit `real_value` / `declared_value` / `vat_plan` fields (forensics E2,
    ADR-0016). This is an owner/staff tool — not customer-facing in V2.
13. Add a **bilingual term/label config** for the China-warehouse keying surface (DI-13) so
    the A/M/X/O/Z ⇄ G/T/F cargo-type-code split (forensics D2) is configured once, not
    re-invented per system.

### Guardrails (apply to everything above)
- Treat **all external API data as untrusted** — the China-product API returns incomplete
  SKUs (DI-10) and MOMO drifts its schema (§3.3); validate and range-guard every import
  (forensics E5's int32-overflow garbage is the same lesson).
- Every state change (status, rate, container assignment, refund) writes an **audit row**
  (ADR-0014).
- The success metric for the migration is simple: **the `ทีม IT PCS CARGO` chat should go
  quiet.** Each silenced ticket type = one dependency removed.

---

## 6. Cross-references

- 🔬 Cargo ops model + problem catalog A–F → [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
- 💬 Customer-facing leak holes L-1..L-10 + MOMO status enum + workflows W-1..W-9 → [`../audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md)
- 🤝 MOMO partner-API doc (this doc supplies the confirmed endpoint + auth + limits) → [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- 🏗 Container schema spine for DI-4..DI-7, DI-14 → [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 💸 Withholding-tax model (DI-8) → [`../decisions/0015-withholding-tax-model.md`](../decisions/0015-withholding-tax-model.md)
- 🚢 Freight value model (§4.3 declared-value, recommendation 12) → [`../decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md)
- 🧾 Tax-invoice flow (§4.3 HS/VAT desk) → [`../decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md)
- 🔁 State-change audit pattern → [`../decisions/0014-customer-self-service-state-transitions.md`](../decisions/0014-customer-self-service-state-transitions.md)
- 📋 Scheduling — fold DI-* items into → [`../PORT_PLAN.md`](../PORT_PLAN.md) Parts U & V
- 🛑 Don't scrub PCS/TTP/ไอแต้ม refs before API switchover → [`../runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)
