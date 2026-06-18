# China packing-list (Shipment Report) pattern + daily-warehouse-entry API requirement

> Owner 2026-06-18: ภูม (แต้ม) จะส่ง Excel packing list ของจีน "ที่ถูกต้อง" **ก่อนปิดตู้** มาในแพทเทินนี้เสมอ — จำไว้ + ใช้เป็น source-of-truth ตอน import/verify ตู้. Sample: `/Users/dev/Documents/PACRED-GZS260617-1.xlsx`.

## The Excel shape (sheet "Shipment Report")
One row per **tracking** + a **totals row** at the bottom of each container. Columns:

| col | header | meaning |
|---|---|---|
| A | Container Name | e.g. `GZS260617-1` (only on the first row of the container) |
| B | Trans | `SEA` / `EK` (air) — the China→TH mode |
| C | SM Date | **the date the parcel ENTERED the China warehouse** (e.g. 2026/06/13) — load-bearing for the API below |
| D | SM Number | |
| E | Branch | `PACRED` (the partner) |
| F | Product | Chinese product name (铝箔盒 / 吊牌 / 裤子) |
| G | Dum | |
| H | Type | `普通货物/ทั่วไป/A` (general) etc. = product type |
| I | **Code** | **customer member code** (`PR10190`, `PR049`, `PR002`) — maps to tb_users / tb_forwarder.userid |
| J | **Tracking** | the China tracking no. (`1781309805`, `79011530668428`) = tb_forwarder.ftrackingchn |
| K/L/M | W. / L. / H. | per-box dims (cm) |
| N | Total Parcel | box count (famount) |
| O | Wt. | per-box weight |
| P | Vol. | per-box volume (CBM) — **6 decimals** (e.g. 0.073834) |
| Q | Total Wt. | row total weight |
| R | Total Vol. | row total volume |
| S | Remark Number | box range (e.g. `1-5`) |
| T | CG. | the carrier CG number (`CG81337997530`) = the ID/CO axis |
| U–AA | Note / Service fee / status / return / etd / eta | |

Totals row (blank A–M): Total Parcel / Total Wt. / Total Vol. = the container Σ. GZS260617-1 sample = **7 boxes · 510 kg · 1.569334 CBM** across 3 trackings (PR10190 1.05 / PR049 0.4455 / PR002 0.073834).

## Verification done 2026-06-18 (this Excel + owner-given tracking lists vs prod)
- **GZS260617-1** ✅ in prod, 3 trackings match, 7 boxes / 510 kg. CBM = prod 1.56933 vs Excel 1.569334 — prod `tb_forwarder.fvolume` stores **5 decimals**, the packing list has **6** (0.073834 → 0.07383). Δ 0.000004 CBM (negligible) but: **to be exact, widen the import precision to 6dp** (the report-cnt CBM cell already shows 5dp via fmtCbm; the stored value is the 5dp truncation).
- **CBX260616-SEA01** 🔴 NOT in prod (0 rows) — the 12 trackings absent.
- **CBX260616-EK08** 🔴 NOT in prod (0 rows) — YT7626791024034 absent.
  → **CBX is a carrier Pacred does NOT auto-ingest** (only MOMO has a live API). This is the gap the API below fills.

## 🔴 REQUIREMENT (ภูม/แต้ม) — daily warehouse-entry ingestion API
For the Pacred side, a container can be a **กระสอบรวม (bulk-sack)** (e.g. GZS260618-1) where the per-tracking dimensions are NOT knowable at close time from one packing dump. So the system must **capture size data EVERY DAY as goods enter the China warehouse** (the `SM Date` axis), accumulating per-tracking W/L/H/Wt/Vol, so that at close we can say exactly which tracking is how big. Build:
1. A daily ingestion (API/import) that records each tracking's warehouse-entry row (Code, Tracking, dims, Wt, Vol, CG, SM Date, container) as it arrives — not just at close.
2. Then the packing-list Excel (this pattern) = the authoritative reconcile/verify at close (compare accumulated vs the China-sent list).
3. Cover the carriers we don't yet ingest (CBX SEA/EK · others), the same way MOMO is ingested.

Owner phrasing: *"ฝั่ง pacred แต้มต้องเขียนระบบ api เก็บข้อมูลทุกวันที่สินค้าเข้าโกดังจีนไว้เองก่อน ถึงจะบอกขนาดให้ได้ว่าแทรคไหนเท่าไหร่ … แต้มจะส่ง excel packing list ของจีนที่ถูกต้องก่อนปิดตู้มา ข้อมูลจะถูกส่งมาเป็นแพทเทินแบบนี้"*.
