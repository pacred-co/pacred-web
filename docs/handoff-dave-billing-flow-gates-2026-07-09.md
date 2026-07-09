# 🔴 Handoff → เดฟ · billing/เก็บเงิน flow "เละเทะ" (owner/ภูม 2026-07-09 · MONEY)

ภูม flagged (prod screenshots): the ตรวจตู้ → เก็บเงินลูกค้า → วางบิล flow is broken/confusing —
"ทำไมมันดูบัคเละเทะงี้ · legacy ยังไม่เป็นงี้เลย". She handed it to เดฟ to fix. This doc is the
full source-grounded diagnosis + her confirmed decisions so you can build directly.

## Repro data (PROD · read-only)
- **PR095 · tracking `DPK214010238058`** (base #**52189**) + `DPK214010238058-2/2` (split #**52412**) · container `GZE260701-1` (EK/รถ · MOMO).
- Both `fstatus=5` (รอชำระเงิน) · `fdatestatus4=18:57` · `fdatestatus5=21:56` (auto-advanced by ตรวจตู้ G4).
- #52189: fshipby=`ขนส่งเอกชน` · **ftransportprice=0** (ค่าส่งไทย) · paymethod=`2` (COD ปลายทาง) · ftotalprice=800.
- #52412: fshipby=`` (blank) · ftransportprice=0 · paymethod=`1` (ต้นทาง) · ftotalprice=130.
- `DPK*` = **NOT a MOMO tracking** (different carrier · just rides in the same container as MOMO's EK).

## The 4 problems (each = a Pacred-added gate/gap legacy never had)

### Bug 1 — ตรวจตู้ → ไม่สร้างบิล + หลุดคิว forwarder-check  ✅ decided
- report-cnt "เพิ่มในรายการตรวจสอบ" (`adminReportCntAddCheck`) + combo-flow G4 auto-advances fstatus 4→5.
- `/admin/forwarder-check` loads the tb_check_forwarder queue then filters `fstatus < 5`
  (`app/[locale]/(admin)/admin/forwarder-check/page.tsx` L245) → the just-advanced rows are excluded → the queue looks empty.
- No bill is auto-created → CS must open `/admin/billing-run/add` manually.
- **ภูม decision = OPTION 1 (ยึด legacy):** เรียกเก็บเงิน/ตรวจตู้ → **auto-create the ใบวางบิล** (one action, legacy-style).
  There's already `createForwarderOrderBill` (`actions/admin/billing-run.ts` L2006) that mints a bill for ONE
  order's base-tracking group (base + `-N/M` siblings via `ilike ${base}%`) — wire the tick/เรียกเก็บ to call it.

### Bug 2 — ค่าส่งไทย gate flags split-siblings + COD rows  ✅ decided
- `isThShippingCostMissing({fshipby, ftransportprice})` (`lib/forwarder/domestic-shipping.ts` L212) is PER-ROW:
  required unless fshipby=`PCS`; empty fshipby also counts as required. So #52189 (ขนส่งเอกชน, ฿0) +
  #52412 (blank, ฿0) BOTH flagged. Used in `actions/admin/billing-run.ts` L628 + L1092 + the add-client warning.
- **ภูม decision = BOTH:**
  1. **group by base tracking** — `-N/M` split siblings are the SAME shipment; check ค่าส่งไทย once on the
     base/anchor (suffix-0) row, never flag the split siblings. (baseTracking helper: `lib/admin/momo-bill-header.ts`.)
  2. **skip COD/ปลายทาง** — add `paymethod` to `isThShippingCostMissing`; when `paymethod==='2'` (ปลายทาง COD)
     the customer pays the courier at delivery → ค่าส่งไทย ฿0 is CORRECT → not "missing".

### Bug 3 — packing-list-reconcile gate blocks NON-MOMO (DPK) rows  🔴 the worst
- The bill button shows: "มี 2 รายการที่ตู้ยังไม่อัพ packing list (ยังไม่ยืนยันยอดกล่อง/น้ำหนัก): #52189, #52412 — กรุณาอัพ packing list ... หรือยืนยันออกบิลทั้งที่ยังไม่ reconcile".
- The gate expects a **MOMO** packing-list reconcile, but `DPK214010238058` is NOT a MOMO tracking → it will
  NEVER appear in a MOMO packing list → the gate blocks these rows **permanently**.
- **Suggested fix:** the packing-reconcile gate should apply **only to MOMO-sourced rows** (fwarehousename='8' /
  the MOMO source marker), and be a SOFT warning (never a hard block) — legacy never gated billing on this.
  (Confirm with ภูม whether to fully remove vs soft+MOMO-only — she leaned "ยึด legacy = บิลออกได้เสมอ".)

### Bug 4 — packing-upload has no confirm button when nothing to update
- `/admin/api-forwarder-momo/packing-upload` — the "ยืนยันเพิ่มเข้าระบบ (X แทรคกิ้ง)" button
  (`packing-upload-client.tsx` L274) renders only when `preview.summary.willUpdate > 0`. When every row is
  "วางบิลแล้ว"/"ไม่พบ" (willUpdate=0), no button shows → ภูม uploaded but "ไม่มีให้กดบันทึก · งง".
- **Fix:** always render a state (button OR a clear "ไม่มีอะไรต้องอัปเดต — ทุกแถววางบิล/ไม่พบแล้ว" note).

## The meta-principle (ภูม / owner)
Legacy PCS **let you create the bill, always** (adminCallPriceUser flipped 4→5, you print). The 3 Pacred gates
(ค่าส่งไทย · packing-reconcile · วัด/kg-฿0) should be **soft warnings with a confirm, never hard blocks**, and the
auto-bill should fire on เรียกเก็บ. Faithful-first: make the bill flow match legacy's continuity.

## Files to touch
- `lib/forwarder/domestic-shipping.ts` (isThShippingCostMissing + paymethod)
- `actions/admin/billing-run.ts` (th_ship grouping · packing-gate · auto-bill wiring · createForwarderOrderBill)
- `app/[locale]/(admin)/admin/forwarder-check/page.tsx` (fstatus filter / queue)
- `app/[locale]/(admin)/admin/forwarders/[fNo]/*` (the "สร้างใบวางบิล (เก็บเงินลูกค้า)" button + gate messages)
- `app/[locale]/(admin)/admin/api-forwarder-momo/packing-upload/packing-upload-client.tsx` (always-show state)

Prod DB pw chat-only. Money paths → dry-run + gate + unit-test each. Claude (Poom-pacred session) did the diagnosis only — no code changed for this bug.
