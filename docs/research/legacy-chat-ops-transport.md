# 🚚 Legacy Chat Analysis — Operations / Transport / Warehouse

> **Captured:** 2026-05-17 · **Source:** ~18 LINE/WeChat group exports from the
> old PCS Cargo / Axelra / NNB / TTP operating teams (Nov 2025 → May 2026),
> covering truck/sea/air freight ops, the China→Mukdahan border route, container
> closing (ปิดตู้), domestic trucking, and the customs doc team.
>
> **Read this with** — [`cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
> (decoded GZE/GZS codes, A/M/X/O/Z types, Form E / D/O / "แผน VAT" — this doc
> **extends it**, does not repeat). Forensics decoded the *documents*; this doc
> decodes the *movement workflow* and where shipments lose visibility.
>
> Scope = operations only. Customer-facing + accounting chats covered elsewhere.

---

## 1. Summary

The legacy "system" for moving a shipment is **a relay of ~8 LINE groups + 1
WeChat group, run entirely by humans copy-pasting status text**. There is no
shared shipment record — a container's state lives only as the last LINE message
a staff member happened to type. Every actor (China warehouse, China broker,
Vietnam transit agent, Lao agent, Mukdahan border crew, Thai doc team, tractor
booker, customer) sees a *different fragment*, so the most-repeated message in
every single ops chat is a variant of **"ตู้นี้อยู่ไหน / มีอัปเดตไหม"** ("where
is this container / any update?").

Three operating companies are tangled into one flow: **Axelra** (the doc/customs
broker arm + the `AXELRA DOC` team), **NNB / THE N N B TRADING** (the importer-of-
record on B/Ls and Form E), and **PCS / TTP / JMF / MOMO** (warehouses that
receive containers in Thailand). Pacred is the new brand consolidating all of it.

Two physical pipelines run in parallel under the same `GZ*` code namespace:
- **Truck (`GZE`)** — Guangzhou → Pingxiang/Youyiguan → Vietnam (Móng Cái) →
  Laos (Savannakhet) → **Mukdahan** border → transload to Thai 6-wheel/trailer →
  TTP / JMF / MOMO / อาลี่ warehouse.
- **Sea (`GZS`)** — Nansha → **Laem Chabang / Bangkok Port (Kerry ICD, B.3, C3,
  T1)** → D/O exchange → tractor (หัวลาก) booking → customer.

The single biggest operational truth: **the China leg is opaque and the border
is the bottleneck.** Customs random-inspection in China ("โดนเปิดตรวจ"),
Vietnam/Laos transit queueing, truck breakdowns, and Thai holiday truck-shortages
routinely add 2–10 unplanned days — and the only way anyone learns of a delay is
by pinging the chat.

---

## 2. The real ops workflow, decoded

### 2.1 Truck route (GZE) — China → Mukdahan → Thai warehouse

```
[China warehouse — 燕子 Yanzi / Guangzhou]
  └ pack container → produce 装柜明细 loading manifest (.xlsx) + photos
  └ Axelra sends DRAFT FE → China broker (柏盛/PLT) issues FORM E (same-day scan)
        ↓  declared at China customs (直报 direct-report; needs ~500 small-parcel
           tracking numbers OR "封门" sealed-door goods correctly labelled)
[China customs — Dongxing / Youyiguan]
  └ 放行 "released"  ── OR ──  查验 random inspection → reload → re-export (delay)
        ↓
[China–Vietnam border]  → 吊柜 crane container onto Vietnam truck (new VN plate/mooc)
        ↓  transit Vietnam (Móng Cái) → "TRANSHIP/TRANSIT เวียดนาม"
[Vietnam–Laos border]  → "TRANSIT ลาว"
        ↓
[Laos — Savannakhet (扎罗 Zaro / Chalo)]  → Lao agent notified
        ↓
[MUKDAHAN border, Thailand]  ── "เข้ามุกดาหาร / รอตรวจปล่อย" → "ตรวจปล่อย"
  └ transload: container → Thai 6-wheel พ่วงคอก or 45ft trailer
  └ Axelra DOC posts: เลขตู้(carrier no) · ทะเบียนหัว/หาง · คนขับ · เบอร์ · ออกเวลา
        ↓  ~14–15 hr drive Mukdahan → Bangkok area
[Thai warehouse — TTP / JMF(MOMO) / อาลี่ / TTW]
  └ "ลงตู้เสร็จเรียบร้อย" + photos → goods now at warehouse
        ↓
[customs declaration (ใบขน) by Axelra DOC team] → [last-mile to customer]
```

Daily rhythm seen in `[LINE]ตู้รถ EK CARGOTHAI...`: every morning a TTP/warehouse
staffer (Nutwara / พลอย HR) asks **"วันนี้มีตู้ไหนอัปเดตเข้ามุกบ้างไหม"**, and
the Axelra route auditor (**AUDIT AX DOC ~Win** / **AXELRA DOC ~ DEV** /
**Doc_Gring**) replies with a hand-typed status block, e.g.:

```
GZE251031-1 (TTP) ประมาณการรถเข้ามุกดาหาร 7/11  สถานะ : ข้ามมามุกดาหารรอตรวจปล่อย
GZE251104-1 (TTP) ...                            สถานะ : ตู้โดนตรวจสอบที่ด่านจีน
GZE251201-1 (-)  ยังไม่มีประมาณการ               สถานะ : โหลดสินค้าอยู่จีน
```

That free-text block **is the tracking system.** There is no structured status,
no ETA field, no per-container history — it is re-typed from memory every day.

### 2.2 "CARGOTHAI" and the EK truck route

"EK" is the truck-cargo product line; the group `ตู้รถ EK CARGOTHAI SHIPPING
GZคุณอาลี่` is the **status-broadcast room for the Guangzhou→Mukdahan truck
route**. CARGOTHAI / "คุณอาลี่" (MR.Wang-อาลี่) is the **China-side line-haul
operator / consolidator** — they own the truck slots ("ของพี่ดำ ตู้เยอะ วันละ 30
ตู้ขึ้น"), pack the containers, and hand the route off through the
Vietnam→Laos→Mukdahan agents. The Mukdahan group `Tran Ngoc กลุ่มแจ้งสถานะเข้า
มุกดาหาร` is the **handoff bridge**: Vietnamese supplier (Tran Ngoc), Lao agent
(thavone, ຄຳປະເສີດ), and the Thai border crew (🐝 B•E•E) coordinate the physical
crane-transfer in Vietnamese/Chinese/Thai/Lao mixed together. Axelra's role is
the **Thai customs+doc layer bolted onto CARGOTHAI's line-haul**.

### 2.3 Container closing ("ปิดตู้") — the document-birth event

`ปิดตู้` = the China warehouse finishes packing + seals the door. At that moment
the China side produces and sends:
1. **装柜明细 loading manifest** (`广州-路运装柜明细 GZE######-柜号-车牌.xlsx`)
2. **Truck/driver info** (CN plate, trailer, container no, customs no, driver ID)
3. **DRAFT FE → real Form E** (China broker stamps it)

The Thai side (`เอกสารปิดตู้ งานคุณบี Doc EK มุขดาหาร`) then races to draft the
**commercial Invoice + Packing List** before the truck arrives — chat is full of
"ตู้ปล่อยจากจีนแล้วมั้ยคะ กลัวตู้ถึงจะไม่ทันค่ะ" (will the docs be ready before
the container arrives?). Doc work is **a deadline race against a moving truck**,
with no buffer.

### 2.4 ตั๋วพ่วง (piggyback declaration) — a quota-driven cost workaround

A heavily-used, never-systematised process. The legacy operation runs two kinds
of import declaration (ใบขน):
- **ตั๋วหลัก** (main ticket) — the real declaration, carries the customer's VAT.
- **ตั๋วพ่วง** (piggyback ticket) — *extra* declared value attached onto a
  **different importer's container that has spare customs quota** ("ใช้ตู้พี่ดำ
  … ตู้ของผม ผมใช้เต็มโควต้าอยู่แล้ว").

`[LINE]งานตั๋วพ่วง ตู้รถ พี่ดำ` shows the doc team batching 17–22 PDF declaration
drafts at a time, "ยิงใบขน" (firing declarations) against พี่ดำ's containers, then
the border partner (คุณบี / ศบ.) scans back blue receipts (ใบเสร็จสีฟ้า). It is
manual, batch-based, and the "value engineering" is explicit: staff negotiate
how low the declared อากร+VAT can be pushed ("ลดต่ำสุดได้เท่านี้ค่ะ 60,843+44,472
= 105,315"). **There is no system object for a piggyback ticket, its quota
source container, or its receipt** — it is run on LINE + zip files + Excel.
→ Extends forensics §E2 "invoice value engineering".

### 2.5 Sea route (GZS) + domestic tractor (หัวลาก) booking

For sea containers the flow adds: **D/O exchange** (จดหมายแลก D/O) to release the
box from the shipping line → **หัวลาก booking**. `จองรถหัวลากแหลม` shows the
booking template Axelra DOC sends to the tractor company (CRT / Nine Speed):

```
POD : KERRY (2839) ICD ...        ตู้ : JXLU7841241   BL : GOSUGZH0649040
จำนวน : 790 Cartons   น้ำหนัก : 12,410 KGs
ส่งวันที่ 23/12  เวลา 09.30   ส่งที่ TTP   เบอร์หน้างาน / เบอร์ชิปปิ้ง / หมุด GPS
```

The tractor company (Pim Pa / เอ็ม / jintara) then replies the truck plate +
driver, photographs the container at each stage (รับตู้ → ถึงหน้างาน → เปิดตู้ →
ลงสินค้าเสร็จ), and the cycle has a hard real-world constraint repeated dozens
of times: **"รถเต็มเลยครับ"** — tractor capacity is the bottleneck on weekends
and pre-holiday. Empty-container return ("คืนตู้หนัก") and the deposit slip
(ใบมัดจำตู้ / หน้า D/O) are also part of the booking and routinely missing.

### 2.6 Air freight (สุวรรณภูมิ)

`AIR IMPORT- สุวรรณภูมิ` is a tighter, document-heavy loop: customer's broker
(gring/doc-gring) collects **D/O (UPS/FedEx/DHL/การบินไทย) + AWB + Form E + TISI
permit + power-of-attorney**, drafts the ใบขน, customer "ตัดภาษี" (pays the
duty), then the airport agent (Good System / Bird) physically pulls the goods
and a Lalamove/4-wheel ("เรียกแก๊ป") delivers. Friction here: documents shuttled
by motorbike courier ("ปักหมุดให้ LINE MAN วิ่งเอาเอกสาร"), goods stuck waiting
for an importer-side **email confirmation** ("ติดคอนเฟิร์ม … ลีโอยังรับไม่ได้"),
and warehouse storage fees ("ค่าโกดัง") accruing while everyone waits.

---

## 3. Friction & leak points

Severity: 🔴 stalls revenue / loses goods · 🟠 daily pain · 🟡 fix soon.
Numbered `OT-#` (Ops-Transport) for the build backlog.

- 🔴 **OT-1 — No shared shipment record; status lives in chat text.** Every
  container's state is the last LINE message someone typed. Re-typed daily from
  memory across ~8 groups. No ETA field, no history, no audit. *This is the root
  cause of almost every other item.*

- 🔴 **OT-2 — Lost / missing goods only surface days later, manually.** The
  Tran Ngoc group carries an explicit lost-goods bulletin (Vietnamese + Thai):
  parcels listed against `GZE260103-1 / 260106-1 / 260110-1 / 260114-1` that
  "went with the truck but aren't at the destination warehouse, and aren't at
  origin either." With no per-box scan-in/scan-out at each transload, shrinkage
  is invisible until a customer complains. (Forensics D4 split-receipt is the
  same gap, deeper.)

- 🟠 **OT-3 — China leg is a black box.** Status granularity is whatever the
  China broker volunteers: "โหลดสินค้าที่จีน → ศุลกากรจีนขาออก → โดนเปิดตรวจ →
  เข้าเวียดนาม → TRANSIT ลาว → เข้ามุก". Customers ask "เพราะอะไรถึงล่าช้า" and
  staff often cannot answer for hours/days. No tracking integration with the
  China operator (CARGOTHAI/柏盛).

- 🟠 **OT-4 — Customs random inspection ("โดนเปิดตรวจ/สุ่มตรวจ") is unmodelled
  but routine.** It happens at China customs, Vietnam, and Thai "ปราบปราม"
  (suppression-unit lock). It re-orders the whole plan and can re-export a
  container. The legacy plan has no "held / under inspection" state and no way
  to surface it to the customer proactively.

- 🟠 **OT-5 — Tractor / transload capacity is the silent throughput cap.**
  "รถเต็มเลยครับ" recurs constantly; weekend + pre-Songkran/Chinese-New-Year
  truck shortages strand containers in Laos accruing demurrage. No capacity
  calendar, no booking system — booking is a free-text LINE message.

- 🟠 **OT-6 — Container-rental / demurrage ("ค่าจอด/压车费/ค่าโกดัง") is
  reactive.** When a box arrives during a Thai warehouse closure, fees accrue
  (¥500/day quoted) and are negotiated ad-hoc on chat. No demurrage clock, no
  warning before it starts.

- 🟠 **OT-7 — Document-prep is a deadline race against a moving truck.** Invoice
  + Packing List + Form E must be ready before the container reaches the border.
  Repeated panic: "กลัวตู้ถึงจะไม่ทัน", "ไม่ทันเสียภาษี". A close-date /
  doc-deadline derived from ETA would remove the panic. (Forensics C3 "ตัดตู้
  needs close-date" is the system-side of this.)

- 🟠 **OT-8 — Two container identifiers, loosely linked.** The Pacred code
  (`GZE251217-1`) and the carrier's physical container no (`WTLU2025511`) are
  pasted together by hand in every message; mismatches happen ("แก้ไขเลขตู้ค่ะ").
  Sea adds B/L + Booking + Seal + reverse-empty-container no — 5 IDs, no link.
  Confirms forensics D3.

- 🟠 **OT-9 — Form E rework loop with China.** Form E is rejected/"卡审"
  (review-blocked) and must be re-issued by bumping the invoice number
  (`-1 → -B → -B5`). Wrong HS code, wrong customer name, wrong amount, wrong unit
  ("KMT = kilometre? no, fabric") cause repeated re-draft cycles — all manual
  WeChat back-and-forth, each costing hours near a customs deadline.

- 🟠 **OT-10 — Loading-manifest CBM never reconciles with billed CBM.** China
  sends 装柜明细 with a packed-volume figure; "internal 97 CBM, can pack 94".
  This is a *third* CBM number on top of forensics D1 (API-receive vs queue-sum).
  Disputes follow.

- 🟡 **OT-11 — Driver/vehicle data is unstructured free text.** Plate, trailer,
  driver name, phone, depart-time, ETA are typed as a prose block per container.
  No driver directory; the same drivers recur but are re-keyed every trip.
  Wrong/duplicate GPS pins cause trucks to go to the wrong site
  ("คนรถใช้พิกัดเดิม", "ไปผิดที่").

- 🟡 **OT-12 — Holidays / warehouse closures aren't in any calendar.** Songkran
  & Chinese New Year truck-stoppages and warehouse-closed dates are discovered
  by asking on chat ("ช่วยเช็ควันหยุดโกดัง"). Predictable, plannable, untracked.

- 🟡 **OT-13 — Cross-language coordination is unaided.** Mukdahan handoff mixes
  Thai + Chinese + Vietnamese + Lao in one group; staff hand-translate via the
  chat ("请直接跟越中方协调…"). No structured handoff form that each agent reads
  in their own language.

- 🟡 **OT-14 — Multi-warehouse routing is implicit.** A container's Thai
  destination (TTP / JMF·MOMO / อาลี่ / TTW) is decided per-container in chat
  ("ของพี่อ๋อง รับเป็น JMF"); no routing rule, easy to send a container/booking
  to the wrong group ("วิน อย่าส่งงานตู้ของเรามาห้องนี้").

---

## 4. Status-visibility gaps — where "ลูกค้าถามว่าของอยู่ไหน"

This is the dominant failure mode. The customer's question travels **up a relay**
and frequently dead-ends:

```
customer → sales → warehouse staff (Nutwara/พลอย) → Axelra route auditor (Win)
         → China broker (柏盛/PLT) → CN truck dispatcher (赵🐮) / VN agent (Tran Ngoc)
```

Each hop is a human, a LINE message, and a wait. Concrete recurring evidence:

| Where status is lost | Quote from the chats |
|---|---|
| Daily, every morning | "วันนี้มีตู้ไหนอัปเดตเข้ามุกดาหารบ้างไหม" — asked *every day* |
| Customer escalating | "ลูกค้าเร่งขอคำตอบ", "ลูกค้าตามหนักมากเลย", "ลูกค้าติดตามสถานะมาค่ะ" |
| Reason for delay unknown | "เพราะอะไรถึงล่าช้านะคะ", "ตู้ถูกตรวจใช่ไหมคะ" |
| China leg invisible | "ยังไม่มีแจ้งเข้ามุกดาหารครับ", "ยังไม่สามารถกำหนดเวลาคร่าวๆ ได้" |
| ETA is a guess that slips | "ประมาณการเข้ามุก 3-5" → "อาจจะมีส่งวันที่ 4-6" → re-quoted daily |
| "Is my parcel at the warehouse?" | "แทรคกิ้ง 78955105110233 … มีของที่โกดังไหมคะ" → staff manually eyeballs the warehouse, sends a photo |
| Truck arrived, nobody knows | "พี่โทรหา พนข ไม่รับ หลับหรือเปล่า" — driver/site can't reach each other |

**The core gap:** the customer has *zero self-service visibility*. Every status
check is a staff ticket, and a staff member can only answer by pinging the next
human upstream. There is no "track my container" surface, and even staff have no
single screen — they reconstruct status from chat scrollback.

Secondary gap: **status has no source of truth**, so two staff give two answers
(plan re-typed from memory; "แจ้งแพลนรถผิดกระจุยเลย" — the plan was broadcast
wrong). And **proactive notification doesn't exist** — the customer is never told
"your container cleared Mukdahan" unless they ask first.

---

## 5. What Pacred must build / fix

Framed for Pacred's container-centric model
([`architecture/container-centric-model.md`](../architecture/container-centric-model.md))
and the `service-import` module. Ordered by the revenue lens — *does this let
Pacred take cargo customers faster?*

### P0 — kills the "ของอยู่ไหน" relay (the #1 revenue leak)

1. **One shipment/container record as the single source of truth** (OT-1).
   Every `GZE`/`GZS` container = one row with: Pacred code, carrier container no,
   B/L, seal, route mode (truck/sea/air), origin warehouse, Thai destination
   warehouse, current status, ETA, and a **status-history log** (who/when, per
   ADR-0014 audit pattern). Status must never live in a chat message again.

2. **A canonical container status enum covering the *whole* China→TH route.**
   The legacy free-text states map cleanly onto a fixed timeline — model them:
   `China warehouse / packing` → `closed (ปิดตู้)` → `China customs export` →
   `China inspection (held)` → `Vietnam transit` → `Laos transit` →
   `at Mukdahan (awaiting release)` → `released, in transit TH` →
   `at TH warehouse` → `customs declaration` → `out for delivery` → `delivered`.
   Sea variant swaps the border legs for `at TH port` → `D/O exchange`. Include
   explicit **`held / under inspection`** and **`delayed`** flags (OT-3, OT-4) —
   these are routine, not exceptions.

3. **Customer-facing "track my shipment" page** keyed on the Pacred code (OT-5
   of forensics, the whole of §4). Show the status timeline + ETA + last update
   time. This single page deletes the daily "มีอัปเดตไหม" ticket load and is the
   strongest "ทุกคนนำเข้าได้ง่ายๆแค่ปลายนิ้ว" proof-point for the landing pages.

4. **Proactive status notifications** (LINE OA / in-app) on every status change —
   especially `at Mukdahan`, `released`, `at TH warehouse`, `held`. The customer
   should never be the one who asks first.

### P1 — operational unblockers (staff stop relaying by hand)

5. **Internal ops dashboard / container board** — every in-transit container,
   its status, ETA, destination warehouse, and which are `held` or `delayed`.
   Replaces the re-typed daily LINE status block. Staff edit status here;
   customers and notifications read from it.

6. **Warehouse intake (รับเข้า) + per-box scan** at each transload point
   (China pack, Mukdahan transload, TH warehouse receive) (OT-2). Expected vs
   received box count per container surfaces shrinkage *immediately* instead of
   days later via a customer complaint. Ties to forensics D4 / migration `0037`.

7. **Truck/tractor booking as a record, not a chat message** (OT-5). A booking
   object: container, route, pickup point/POD, destination + GPS pin, requested
   date/time, driver+vehicle, status (requested → confirmed → picked up →
   delivered). Capture the photo checkpoints (รับตู้/ถึงหน้างาน/เปิดตู้/ลงเสร็จ).

8. **ETA + document-deadline engine** (OT-7). Derive a doc-prep deadline from the
   container close-date / ETA so Invoice+PL+Form E are flagged "due" before the
   truck moves — kills the "กลัวตู้ถึงไม่ทัน" panic. Pair with forensics C3
   (ตัดตู้ requires close-date).

9. **Demurrage / container-rental clock** (OT-6). When a box waits past free
   time (port, or arrives during a warehouse closure), auto-start a fee clock and
   warn staff + customer *before* charges accrue.

10. **Driver / vehicle directory** (OT-11). Reusable driver+plate records;
    booking picks from the list instead of re-keying. Validate GPS pins (one
    canonical delivery location per customer site) to stop "ไปผิดที่".

### P2 — net-new, structures money & cross-border coordination

11. **ตั๋วพ่วง (piggyback declaration) as a first-class object** (OT-9, §2.4).
    Model: piggyback ticket → links to its **quota-source container** + its
    **main ticket** + declared value + the printed receipt (`QEUT…`). Today this
    is zip files + LINE. Extends forensics E2 — Pacred's freight model must store
    `real_value` / `declared_value` / `vat_plan` *and* the piggyback linkage.

12. **Form E generator + status tracking** (OT-9). Generate the 12-box Form E
    from the shipment record; track per-Form-E state
    (`draft → submitted → 卡審 blocked → issued`) and the invoice-number bump
    convention. Cuts the WeChat re-draft loop.

13. **CBM reconciliation view** (OT-10). Store CBM from all three sources —
    API-receive, queue-sum, 装柜明细 manifest — on the container and surface the
    delta to staff *before* billing. Extends forensics D1.

14. **Structured cross-border handoff record** (OT-13). One handoff form per
    container (CN truck, VN truck, Lao agent, Mukdahan crew, seal, reverse-empty
    container) that each party reads — replaces the Thai/Chinese/Vietnamese/Lao
    free-text scramble in the Mukdahan group.

15. **Warehouse + holiday calendar** (OT-12). TH warehouse open/closed dates +
    CN/TH holiday truck-stoppages, visible to planning so containers aren't
    stranded predictably.

### Guardrails (from the legacy pain)

- Multi-warehouse routing (TTP / JMF·MOMO / อาลี่ / TTW) must be an explicit
  field with a routing rule, not a per-container chat decision (OT-14).
- Container identity: link Pacred code ↔ carrier container no ↔ B/L ↔ booking ↔
  seal in **one** record so a mismatch is impossible to introduce (OT-8).
- Every status change writes an audit row (who/when) — per ADR-0014.
- This whole flow today depends on humans being awake and on LINE; the system
  must let status update without a human relay (API ingest from the China
  operator where possible; otherwise one staff edit that fans out everywhere).

---

## 6. Cross-references

- 🧾 Decoded documents (GZE/GZS, A/M/X/O/Z, Form E, D/O, แผน VAT) →
  [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
  — this doc extends its §3–§5 with the *movement* layer.
- 🏗 Schema spine (containers / shipments / warehouses / RLS) →
  [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 💬 Customer-facing chat audit (W-1..W-9 workflows, L-1..L-10 leaks) →
  [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md)
- 📋 Task scheduling → [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V — the `OT-#`
  items above are candidates to fold into Part V.
- 🔁 State-change audit pattern →
  [`docs/decisions/0014-customer-self-service-state-transitions.md`](../decisions/0014-customer-self-service-state-transitions.md)
- 🚢 Freight value / piggyback model →
  [`docs/decisions/0016-freight-value-model.md`](../decisions/0016-freight-value-model.md) (DRAFT)
