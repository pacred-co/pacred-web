# 📦 TAM (iTAM/แต้ม) + MOMO container dataset + the MOMO shortfall — reference (2026-06-29)

> Owner dropped fresh packing-lists (updated 2026-06-29 17:01) + the MOMO cost invoices + 4 LINE
> chats. This doc synthesizes (1) the container dataset, (2) the MOMO shortfall + its explanation,
> (3) what is ingestable into the Pacred DB. Source files on เดฟ's machine:
> - `C:\Users\Admin\Desktop\Packing List\TAM - Packing List\` — the iTAM (แต้ม) packing-lists (TRUTH source)
> - `C:\Users\Admin\Desktop\Packing List\MOMO - Packing List\` — the MOMO-side packing-lists
> - `C:\Users\Admin\Desktop\วางบิลต้นทุน MOMO\` — the MOMO supplier cost invoices (ฮุย-ไท่ต๋า)
> - `C:\Users\Admin\Desktop\[LINE] การแชทของ Momo+Pacred เช็คสถานะ.txt` — status-chase chat
> - `C:\Users\Admin\Desktop\Packing List\TAM - Packing List\[LINE]PR x TISO นำเข้าสินค้าจากจีน.txt` — TAM packing-list chat

---

## 0. Data model — who's the truth (confirmed by the chats + by the files)

- **iTAM (แต้ม / Tam TISO-ai.com)** sends per-container packing-lists. Sheet `Shipment Report`,
  one row per tracking, with a per-container totals row. Columns:
  `[0]Container Name · [1]Trans · [2]SM Date · [7]Type · [8]Code(PR) · [9]Tracking ·
  [13]Total Parcel · [16]Total Wt · [17]Total Vol · [24]etd · [25]eta`.
  **iTAM is the AUTHORITATIVE weight/CBM/box source** (per mig 0195 + owner directive
  *"ยึดของ iTAM เป็นหลัก, MOMO ชอบมั่ว"*). iTAM does NOT give container numbers in the file
  (deliberately — *"ผมจะไม่ได้ให้หมายเลขตู้คอนเทนเนอร์ไป"*); the GZS code IS the container key.
- **MOMO** sends a per-batch packing-list (`PR<yyyymmdd>-SEA0x`). Sheet `PACKING LIST`, a summary
  header block on top + per-tracking detail below. MOMO **over-counts** (lists the bill-header
  tracking + the box rows → ~2× the real trackings; confirmed: GZS260620-2 MOMO = 14 box vs
  iTAM 7, exactly 2×; GZS260622-1 MOMO 9 trk vs iTAM 7 = +2 header rows on identical 32box/7219kg).
  MOMO is **FALLBACK/COMPARE only**.
- **The MOMO routing-batch ID `PR<date>-SEA0x` (a.k.a. SEA0x) ≠ a container.** It's the routing
  batch *before* the container closes; after closing it becomes a real `GZS<yyMMdd>-N` code. This is
  already modeled (CLAUDE.md / momo-bill-header.ts / mig 0195 store keyed by `fCabinetNumber`).
- **Container-code → transport mode** (existing SOT `lib/forwarder/cabinet-transport.ts`):
  `GZS/SEA = เรือ` · `GZE/EK = รถ` · `GZA/AIR = อากาศ`. All containers here are GZS (sea) except
  one GZE (truck).
- **Container-close date is encoded in the code:** `GZS260628-1` → closed 2026-06-28, batch #1.

---

## 1. The container dataset (iTAM truth, per-container rollup)

From the **iTAM per-container files** (the authoritative weight/box/CBM). 21 real containers across
the new TAM files. Box/weight/CBM = sum of the iTAM line rows; trk = distinct tracking count;
ETD/ETA = empty in every xlsx (see §3 — ETD/ETA live only in chat/close-date, NOT in the files).

| Container | Close date | Mode | Boxes | Weight kg | CBM | Trackings | PR codes | iTAM file |
|---|---|---|---:|---:|---:|---:|---|---|
| GZS260524-1 | 2026-05-24 | เรือ | 178 | 4,480.9 | 16.3392 | 94 | 40 (PCS+PR mixed) | PR x TISO GZS260524-1 |
| GZS260617-1 | 2026-06-17 | เรือ | 7 | 510.0 | 1.5693 | 3 | PR10190·PR049·PR002 | PACRED-GZS260617-1 |
| GZS260620-1 | 2026-06-20 | เรือ | 21 | 567.5 | 0.6174 | 2 | 2 | PR-TISO-GZS260620-1 |
| GZS260620-2 | 2026-06-20 | เรือ | 7 | 1,565.5 | 6.1049 | 7 | PR012·PR10634 | PR-GZS260620-2 |
| GZS260622-1 | 2026-06-22 | เรือ | 32 | 7,219.0 | 8.0092 | 7 | 4 | PR-TISO/PR-GZS260622-1 |
| GZE260624-1 | 2026-06-24 | **รถ** | 2 | 18.5 | 0.1745 | 2 | 1 | PR-GZE260624-1 |
| GZS260624-1 | 2026-06-24 | เรือ | 27 | 530.0 | 1.0680 | 11 | 3 | PR x TISO GZS260624-1 |
| GZS260626-1 | 2026-06-26 | เรือ | 15 | 2,897.5 | 10.7668 | 14 | 5 | PR - GZS260626-1 |
| GZS260628-1 | 2026-06-28 | เรือ | 173 | 2,855.8 | 17.4568 | 59 | 14 (PCS+PR mixed) | PCS x PR-GZS260628-1 |
| GZS260628-2 | 2026-06-28 | เรือ | 136 | 3,634.6 | 15.7535 | 30 | 10 (PCS+PR mixed) | PCS x PR-GZS260628-2 |

Older containers (518→614) appear only in the **MOMO batches** + the iTAM "Pacred 2026-06-19.xlsx"
overview sheet (a tracking-by-tracking reconciliation status sheet, NOT a clean per-container list).
MOMO batch → container map:

| MOMO batch | container | MOMO file |
|---|---|---|
| PR20260527-SEA02 | GZS260529-1 | PR20260527-SEA02(1) |
| PR20260529-SEA01 | GZS260530-1 | PR20260529-SEA01 |
| PR20260530-SEA01 | GZS260601-1 | PR20260530-SEA01 |
| PR20260601-SEA01 | GZS260602-1 | PR20260601-SEA01 |
| PR20260605-SEA01/03 | GZS260605-1 | PR20260605-SEA01/03 |
| PR20260605-SEA02 | GZS260606-1 | PR20260605-SEA02 |
| PR20260605-SEA04 | GZS260528-1 | PR20260605-SEA04 |
| PR20260610-SEA01 | GZS260610-1 | PR20260610-SEA01 |
| PR20260610-SEA02 | GZS260612-1 | PR20260610-SEA02 |
| PR20260612-SEA01 | GZS260614-1 | PR20260612-SEA01 |
| PR20260614-SEA01 | GZS260617-1 | PR20260614-SEA01 |
| PR20260616-SEA01 | GZS260530-1 | PR20260616-SEA01 |
| PR20260618-SEA01 | GZS260618-1 (กระสอบรวม) | PR20260618-SEA01 |
| PR20260620-SEA01 | GZS260620-1 | PR20260620-SEA01 |
| PR20260620-SEA02 | GZS260620-2 | PR20260620-SEA02 |
| PR20260620-SEA03 | GZS260622-1 | PR20260620-SEA03 |

**iTAM-vs-MOMO discrepancies (truth = iTAM):**
- MOMO **double-counts trackings/boxes/weight/CBM** (lists bill-header + box rows). GZS260620-2:
  MOMO 14box/3131kg/12.21cbm vs iTAM **7box/1565.5kg/6.10cbm** = MOMO ≈ 2×. Always de-dup MOMO by
  base-tracking before trusting it (the `momo-bill-header.ts countableGroupMembers` discipline).
- GZS260622-1: MOMO and iTAM agree EXACTLY on box/wt/cbm (32/7219/8.0092) — MOMO only added 2 header
  trk rows. Where they agree, fine; where they diverge, take iTAM.
- The "Pacred 2026-06-19.xlsx" iTAM overview sheet marks every tracking it can't resolve with a Thai
  note: `ยังไม่ปิดตู้ออกมาเลยไม่ทราบข้อมูลนอกจาก momo` (container not closed → no data except MOMO),
  `กระสอบรวม` (sack-consolidated), `ซ้ำกับ 1/6` / `ซ้ำกับ 1/8` (duplicate of a -N/M box line),
  `ไม่พบข้อมูล สักแหล่งข้อมูลเลย` (no data anywhere). These are TAM's hand-annotations of the gap.

---

## 2. The MOMO SHORTFALL — what it is, what MOMO said, what it means

There are **TWO distinct shortfalls** in this dataset — do not conflate them:

### 2a. The API DATA shortfall (the headline — "30-40% หาย")
From the **PR x TISO chat (22/06 10:44–10:56)**, TAM (Tam TISO-ai.com):
> *"api momo ตอนนี้ รายการเข้าโกดังจีนก็อาจจะส่งมาไม่ครบนะครับ ตั้งแต่วันที่ 16/06/26 พี่แจ้ง momo แล้ว
> pcs กับ jmf มีอาการ … ขาดไปหลายรายการเริ่มจะ 30-40% ละ … ฝั่ง jmf พี่เจอ 30 กว่าแทรค ตั้งแต่
> 16/06/26 มีหายไปทุกวัน · ฝั่ง pcs ก็หายไป ตั้งแต่ 17/06/26 น่าจะ 20 กว่าแทรค"*

- **What:** the MOMO **API** (`api.momocargo.com:8080/api/func/get/import/track/{date}` +
  `…/container/closed/{date}` + `…/sack/get/info/{batch}`) has been **silently dropping
  warehouse-arrival records** since 16/06/26 — **30+ trackings on the JMF feed, 20+ on the PCS feed,
  ~30-40% of items missing**, growing daily.
- **What MOMO said:** essentially nothing actionable — *"เรื่องข้อมูล api ไม่ส่งมา เขาก็อ่านแต่ตอบเรื่อง
  อื่น"* (they read but reply about other things), *"พอแจ้งไปอีกทีก็อ่านไม่ตอบ"* (then go silent). MOMO
  has not fixed it.
- **TAM's workaround:** TAM is now **building his own ingest** — capturing data at the
  *goods-arrive-China-warehouse* event himself and **maintaining an Excel he updates by hand** to
  replace the broken API feed (*"ตอนนี้พี่กำลังทำ excel ไว้วางเองแล้วอัปเดตรายการแทน"*,
  *"พี่เริ่มขึ้นโครงแล้ว"*). The fresh per-container TAM files (GZS260620…628) ARE that hand-maintained
  replacement — they're more reliable than the MOMO API right now.
- **Reconciliation/billing impact:** Pacred's MOMO cron (`get/import/track`) is under-feeding
  `tb_forwarder` since 16/06 → measured kg/cbm missing → **bills under-charge** (no measured weight =
  ฿0 freight) AND goods sit "not-arrived" though physically in the China warehouse. The TAM packing-
  lists are the truth to backfill from. (Cross-ref `momo-status-drift-2026-05-30.md`,
  `taem-reconcile-review-2026-06-19.md`, and the CLAUDE.md #10 MOMO carryover SF0219344032022.)

### 2b. The PHYSICAL stuck/short containers (the "4 ตู้" cluster)
The Momo+Pacred status-chase chat shows a cluster of containers **physically held / split / arriving
incomplete** in late May–June. There is no literal "MOMO ส่งตู้ขาด 4 ตู้" line; the "short" framing
maps to this set of problem containers (held at China customs / scanned-and-held at Laem Chabang by
กองปราบ / arrived split with missing boxes). The clearest 4 problem containers:

1. **GZS260429-1** (คุณติ๊) — held: *"กองปราบ สแกนตู้และตรวจตู้ … คาดว่าจะปล่อยได้ปลายสัปดาห์หน้า"*
   (Thai-customs special-investigation scan-and-hold; repeatedly chased 30/5→4/6, slow release).
2. **GZS260509-2** — **stuck at China customs** the longest: *"ตู้ GZS260509-2 ด่านจีนยังไม่ปล่อย
   ออกมา"* (24/06, 26/06 still not released) — *"ทางด่านแจ้งว่าจะปล่อยตู้ออกมาภายในสัปดาห์นี้"*.
3. **GZS260519-1** (คุณย้ง) — the most-chased; owner (Pop_visit) escalated hard
   (*"เขาเอาเราตายแน่"*); was stuck at Laem Chabang awaiting inspection-release, finally cleared +
   entered the system ~9/06.
4. **The 6-container held batch** flagged 27/05 by AUDIT DOC ~Win: `GZS260429-1 · GZS260503-1 ·
   GZS260507-1 · GZS260509-1 · GZS260512-1 · GZS260513-1` — *"6 ตู้ที่ติด"* (29/05); benz: shipping
   *"วันศุกร์จะเริ่มเคลียร์ปล่อยตู้ได้"* — a shipper-side payment/clearance hold.

**Split-container short shipments (the gap-box pattern that bites billing):** the SAME shipment gets
**split across containers with wrong box counts/weights** — confirmed by เดฟ in the TAM chat:
*"ชิปเม้นเดียว แยกปิดตู้กัน จำนวนกล่องผิด และ น้ำหนัก ของชิปเม้น ขนาดกล่อง คาดเคลื่อน"*. Concrete cases
in the Momo+Pacred chat:
- **PR005** `60527103087` — declared 48 boxes but *"แบ่งตู้มา 12 กล่อง"* (only 12 came in GZS260530-1,
  the rest split; later all found). The cost invoice INV-20260618-0003 shows this exactly:
  line 8 `60527103087` 624kg/48qty + line 9 `60527103087-2` 156kg/**12qty** (the split-off 12 boxes).
- **PR10601** `1779955936` — 72 boxes, **1 box short** in GZS260529-1 (later found).
- **PR017 ↔ PR107** — China shipper **mis-labeled** goods (PR017's goods filed under PR107) →
  customers got each other's parcels (24/06, unresolved in chat).

### 2c. The PCS↔PR contamination (a billing-loss vector, related to the shortfall)
The recurring root issue (TAM chat 18/06, dev): **PR goods land in the PCS branch** because the China
warehouse files by tracking-prefix, and if a customer writes only "P" (not "PR") it routes to PCS.
The new `PCS x PR-GZS260628-1/-2` files literally mix PCS + PR codes in one container. dev's 3-step
fix in chat: (1) tell sales/CS to make customers label clearly **PR**; (2) audit trackings for PR-
that-went-to-PCS and request a move; (3) **must request the move BEFORE payment** (can't move after
paid). Until moved, those PR items can't be billed by Pacred. This is why the iTAM files are
"PCS x PR" — TAM is surfacing the contaminated containers so Pacred can pull its PR items back.

---

## 3. What's ingestable into the Pacred DB (build/ingest plan)

### 3a. ⚠️ ETD/ETA → `taem_container_etd_eta` (mig 0195) — NOTE: the xlsx files DO NOT carry ETD/ETA
**Key finding:** the `etd`/`eta` columns exist in the iTAM Shipment-Report header but are **empty in
every file** (verified across all 13 TAM files). ETD/ETA only appear:
- in the **LINE chat announcements** (e.g. `[LINE]PR x TISO`: "GZS260617-1 วันที่ปิดตู้ 2026-06-17 ·
  คาดว่าจะถึงไทย 2026-07-01"), and
- derivably from the **GZS close-date** (the code's date = ETD≈close; ETA = chat's "ถึงไทย").

→ So the `taem_container_etd_eta` ingest cannot be auto-filled from these xlsx. Options:
  - **ETD = the container close-date parsed from the GZS code** (deterministic, free) — good default.
  - **ETA = manual from the LINE close announcement** (e.g. GZS260617-1 → 2026-07-01), or MOMO
    `container/closed` API fallback. Surface a small admin field to set ETA per container from chat.
  - Keep MOMO as the compare/fallback per mig 0195's design.

### 3b. Per-tracking box/weight/CBM → the forwarder reconcile (the HIGH-VALUE ingest)
The iTAM per-container line data (`tracking → boxes/weight/CBM`) is exactly what the broken MOMO API
is failing to feed. **Backfill `tb_forwarder` from the iTAM packing-lists** via the existing audited
reconcile path (`lib/admin/taem-reconcile-parser.ts` + `actions/admin/taem-reconcile.ts`). The parser
already targets this layout (`Container Name` + `Tracking` header, base-tracking aggregation for the
`-N/M` box rows). Feed the 10 new containers (esp. the 30-40% the API dropped). **Money-adjacent**
(fvolume→price) → gate + test. Aggregate the `-N/M` box rows to the base tracking before matching
MOMO's combined header rows (the documented `momo-bill-header.ts` discipline).

### 3c. MOMO COST → `tb_forwarder.fcosttotalprice` (cost-billing ingest, already has a tool)
The 4 ฮุย-ไท่ต๋า supplier invoices (`/admin/api-forwarder-momo/invoice-cost` ingest path) — cost =
**2,500/CBM** (matches mig 0194), `คิดตาม CBM`, per-tracking, matched by `ftrackingchn`. VAT 7% +
customs incl.; WHT 1% deducted at invoice total. Cost is editable any status (COST แก้ได้ · SELL ล็อก).
The 4 invoices (after the cost-rate edit applied in the วางบิลต้นทุน MOMO folder):
| Invoice | Date | Lines | Sub-total | WHT 1% | Grand Total |
|---|---|---:|---:|---:|---:|
| INV-20260618-0003 | 18/06 | 12 | 23,097.30 | 230.97 | **22,899.33** |
| INV-20260618-0004 | 18/06 | 8 | 6,893.25 | 68.93 | **6,824.32** |
| INV-20260623-0006 | 23/06 | 19 | 8,385.00 | 83.85 | **8,301.15** |
| INV-20260625-0003 | 25/06 | 9 | 28,175.00 | 281.75 | **27,893.25** |

⚠️ **Cost-rate edit caught (reconciliation-relevant):** the `TAM - Packing List` copy of
INV-20260618-0003 prices tracking `0004065` at **4,700/unit → 11,830.37** (sub-total 28,634.92), while
the `วางบิลต้นทุน MOMO` copy prices it at **2,500/unit → 6,292.75** (sub-total 23,097.30). Same invoice
number, two versions — the วางบิลต้นทุน folder is the **corrected/final** one to ingest (2,500/CBM is
the canonical MOMO cost per mig 0194). Don't double-ingest both copies.

### 3d. The reconciliation status sheet → an admin "gap queue"
The iTAM "Pacred 2026-06-19.xlsx" overview (tracking + status annotation) is the manual gap list TAM
maintains. Worth surfacing as an admin reconciliation view: per tracking, show the iTAM annotation
(`ยังไม่ปิดตู้/กระสอบรวม/ซ้ำ/ไม่พบข้อมูล`) so warehouse/CS can chase the API-dropped items. Cross-ref
the `tracking_id.csv` (89 PR trackings — the Pacred tracking list Got sent TAM to reconcile against).

---

## 4. TL;DR for the parent

- **21 real containers** parsed from the new iTAM files (10 with full per-container truth:
  524/617/620-1/620-2/622/GZE624/624/626/628-1/628-2). iTAM = authoritative box/weight/CBM; MOMO
  ≈ 2× over-counts (header+box rows) → always de-dup MOMO by base-tracking.
- **The shortfall is primarily a MOMO-API data outage**, not a literal 4-container short-ship: since
  **16/06/26 the MOMO API drops 30-40% of warehouse-arrival records** (JMF 30+ trk, PCS 20+ trk);
  MOMO reads-but-doesn't-fix; **TAM now hand-maintains the Excel packing-lists to replace the feed** —
  those files ARE the reliable source now.
- **The 4 physically-stuck containers** (the "short" cluster): `GZS260429-1` (กองปราบ scan-hold),
  `GZS260509-2` (China-customs hold, longest), `GZS260519-1` (Laem Chabang inspection, owner-escalated),
  + the 27/05 **6-container held batch** (`260429/260503/260507/260509/260512/260513`-1, shipper
  clearance hold). Plus **split-container short-ships** (PR005 −12 boxes, PR10601 −1 box, PR017↔PR107
  mis-label) and **PCS↔PR contamination** (PR goods filed under PCS — can't bill until moved, must
  move before payment).
- **Ingest priorities:** (1) backfill `tb_forwarder` weight/CBM from the iTAM packing-lists via the
  existing reconcile (fills the API gap · money-adjacent · gate+test) → (2) ingest the 4 ฮุย-ไท่ต๋า
  cost invoices (2,500/CBM, use the วางบิลต้นทุน final copy, not the TAM 4,700 draft) → (3) ETD from
  GZS close-date + ETA from chat into `taem_container_etd_eta` (xlsx has NO ETD/ETA) → (4) surface
  the iTAM gap-status sheet as an admin reconciliation queue.
