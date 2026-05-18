# D1 — the 3 Excel files in `newrealdatapcs.zip`

> The 2026-05-18 legacy-PCS data drop (ไอแต้ม) shipped 3 `.xlsx` files alongside
> the SQL dump. This note records what each is and whether it is **migration
> data to load**. Verdict: **none of the three is loadable data** — the data
> migration is the 117-table `pcsc_main` SQL dump only (see
> [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)).

## 1. `แบ่งสั่งซื้อ+นำเข้า Pacred+Pcs_13.05.69_sent.xlsx` (60 KB)

One sheet `รวม` (551 rows). A **Pacred-vs-PCS-Cargo customer + profit split** —
columns: บริษัท · จำนวนลูกค้า · จำนวนครั้งนำเข้า · กำไรนำเข้า · จำนวนครั้งสั่งซื้อ ·
กำไรสั่งซื้อ · CBM รวม · กำไรรวม. Top rows: **รวม PACRED — 444 customers ·
฿2,903,327 total profit** · **รวม PCS CARGO — 98 customers · ฿2,904,904 total profit**.

→ **NOT a migration concern.** This is a family-business financial-allocation
sheet. The migration runbook §2 is explicit: bring **all** customers / all 117
tables, no filtering — the Pacred-vs-PCS split is a business matter, not a
migration filter.

## 2. `GZS260516-2.xlsx` (73 KB) + 3. `gzs-260516-PCS-…xlsx` (6.7 MB)

Operational **container shipment / sack reports** for the container
`GZS260516-2` (a GZS = sea-route consolidated container). Sheets: `summary`
(MOMO-vs-PCS weight/volume reconciliation per tracking), `Shipment Report`
(per-parcel manifest — tracking · product · W/L/H · customer code `PCS####`),
`sack` (กระสอบรวม close-out — tracking · เลขที่ตู้ · วันที่ปิดตู้ · ปริมาตร · น้ำหนัก · ค่าขนส่ง).
The 6.7 MB size of file 3 is embedded product photos.

→ **NOT migration data.** These are exported *reports* — the underlying records
already live in the dump's `tb_cnt*` / shipment tables. They are useful as
**reference for the workflow-fidelity audit** — a concrete example of the
legacy close-container → close-sack → MOMO-reconcile loop
([`d1-fidelity-workflow.md`](d1-fidelity-workflow.md)).

## Summary

| File | What | Load into DB? |
|---|---|---|
| `แบ่งสั่งซื้อ Pacred+Pcs` | Pacred-vs-PCS customer/profit split | ❌ business analysis |
| `GZS260516-2.xlsx` | container `GZS260516-2` shipment/sack report | ❌ report export |
| `gzs-260516-PCS.xlsx` | container shipment report (+ photos) | ❌ report export |

**The D1 Phase-A migration input = `2026-05-18-1358-pcsc_main.sql` (117 tables) only.**
