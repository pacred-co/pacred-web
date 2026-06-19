# Cargo ops — automation plan from the real LINE chats (2026-06-19)

Source: two real operator chats the owner handed over —
`[LINE]โกดัง Pacred.txt` (warehouse รับ/ส่ง group, 2026-06-14→18) +
`[LINE]ตามงาน Pacred shipping.txt` (billing/shipping group, 2026-06-18).
Owner directive: *"ทุกอย่างควรทำให้ออโต้ได้ถ้าข้อมูลครบถูกต้อง · เอามาอุด เอามาเสริมระบบ."*

This is the ground truth of how the cargo business actually runs day-to-day. The
chats are a manual workaround for gaps the platform should close.

---

## 1. The end-to-end operation (decoded)

```
China shop → MOMO/ฮุย ไท่ต๋า consolidation warehouse (กวางโจว)
   → loaded into a CONTAINER (ตู้)  {MODE}{YYMMDD}-{seq}
        GZS = ทางเรือ (sea) · GZE/EK = ทางรถ (road) · GZA = ทางอากาศ (air)
   → ships to TH → Pacred Thai warehouse (สมุทรสาคร)  [or picked up from MOMO/PCS]
   → INBOUND: scan in (ยิงเข้าระบบ) + measure (kg + W×L×H→CBM) + box-count check
   → PRICE/BILL: cost = CBM×rate (or kg if kg>คิว) → ใบวางบิล → customer pays
   → OUTBOUND: ส่งเหมาๆ (Pacred delivers) OR รับเอง (self-pickup)
```
Money side: MOMO invoices Pacred 2,500/CBM (the COST). WHT 1% on juristic only.
Docs side (freight): BL / customs inspection / Form-E.

---

## 2. Pain points (each = a real chat quote = an automation gap)

**P1 — PCS↔Pacred tracking leak (the biggest manual burden).** Pacred goods labeled
just "P" (or on PCS's China account) land in PCS's system/warehouse, not ours. CS
manually tracks them in chat:
> "PR10190 พัสดุของPacred เข้าระบบPCS … 616035273 = 2 ลัง ตู้ GZS260528-1 (ถึงโกดัง PCS แล้ว) · 801738086049 = 1 ลัง ตู้ GZS260524-1 (ยังไม่เข้าโกดังไทย)"
> "ถ้าเจอของเราเอากลับมาด้วยนะคะ" · "โดนตีกลับ เปลี่ยนเลขตู้ใหม่" · "สินค้าติดที่ซุปเปอร์มาร์เก็ตคุนหมิง"
Today: 100% manual chat. **No tool.**

**P2 — Hand-calculated price = money leak (owner scolded twice).**
> Pop: "เมยรายการนี้ที่เรา ลบ กิโลลงเอง มันถูกต้องแล้วนะ · รอบหน้าห้ามคิดกันเองเด็ดขาด · หายไปหลายบาทเลย" · "@Pacred CS Ploy ห้ามคิดราคาเอง" · "เดียวพี่เร่งแก้ไขระบบให้ @dev"
The price must come from the real warehouse measurement + the system rate, never a
human's mental math.

**P3 — The bill can't be issued in-system (manual outside).**
> Pop: "สรุปตอนนี้คือกดให้ลูกค้าชำระไม่ได้ใช่ไหม · ต้องวางบิลข้างนอกใช่ไหม · หรือข้อมูลมาไม่ตรง"
> "ใส่คิวกับกิโลเข้าไป ทุกบิล · เขาต้องนั่งทำมือกัน" → sales hand-fill kg+cbm on every bill.
The measured kg+cbm doesn't auto-flow into the bill.

**P4 — Measurement is the gate, and it's verbal.**
> "SF1562783666170 4.10kg / 0.00220 CBM กว้าง61×ยาว12×สูง3 ถูกต้องตามระบบ"
> "ขนาด dimension ของที่เอามาไม่ได้นะ" · box-count: "ขาด3กล่อง" "ขาด12กล่อง" "1กล่องหาเจอแล้ว"
W×L×H→CBM + box-count reconciliation happen in chat/photos.

**P5 — Outbound dispatch is verbal.**
> "PR10601 ลูกค้าขอส่งวันนี้ 222/69 LKB … คุณพี 086-1172774 · ตามรอบส่งได้ช่วงไหน"
> ส่งเหมาๆ vs รับเอง decided per-item in chat; driver address/phone/date passed by message.

**P6 — Daily ops handoff is a hand-typed list** (Win, every night):
> "สรุปงานพรุ่งนี้ · ฝาก PCS รับของที่ MOMO: PR106 [6 tracks] PR014 [1] PR107 [1] · ฝากเซล/cs เก็บเงิน + แจ้ง (วันส่ง/โลเคชั่น/เบอร์) · PR121 ส่งเหมาๆ อยู่โกดังเรา 1 ชิ้น · PR005 อยู่โกดังเรา 12 ชิ้น …"
A perfect candidate for a generated dashboard.

---

## 3. What EXISTS vs the GAP (grounded in the codebase)

| Capability | Exists? | Gap |
|---|---|---|
| Container code → transport mode | ✅ NEW `lib/forwarder/cabinet-transport.ts` (this turn) | — (done) |
| MOMO cost (2,500/CBM) ingestion | ✅ `/admin/api-forwarder-momo/invoice-cost` + mig 0194 (this session) | — (done) |
| Forwarder→shop-order status sync | ✅ `advance-linked-shop-order` (this session) | wire into warehouse scan + MOMO gate (owner flip) |
| Warehouse worker-app (scan/measure) | ✅ `/admin/warehouse/worker/{intake,measure,sacks,shipping}` | measure → does it auto-write fweight/fvolume + recompute cost? **(verify/connect)** |
| Billing-run (ใบวางบิล) | ✅ `/admin/billing-run/{add,[id]}` | **does NOT auto-pull measured kg+cbm → hand-entry (P3)** |
| Driver delivery app | ✅ `/admin/drivers/{[id],work,new}` | auto-create dispatch task on payment (P5) |
| PCS↔Pacred tracking reconcile | ❌ none | **build (P1)** |
| Daily ops dashboard | ❌ none (chat list) | **build (P6)** |

**Key insight: most building blocks EXIST but are not CONNECTED into one auto-flow,
and two tools (P1 reconcile, P6 daily board) are missing entirely.**

---

## 4. The automation plan (priority order)

**A. Close the scan→measure→cost→bill chain (kills P2+P3+P4 — the owner's #1 pain).**
The warehouse `measure` step must write `fweight` + `fvolume` (from W×L×H) onto the
forwarder row, recompute cost (CBM×rate, kg-if-kg>คิว — the existing resolve-rate /
doc-tier logic), and the billing-run must READ those measured values (never let a
human type kg/cbm). Result: scan + measure once → the bill is exact + auto, sales
can't hand-calc. Connects to the cost work already shipped (MOMO 2,500/CBM, report-cnt
live cost). *This is what Pop explicitly asked dev to fix.*

**B. PCS↔Pacred tracking reconcile board (P1).** A screen listing Pacred trackings
detected in the PCS/MOMO system but not yet in Pacred: tracking · customer (PR) ·
container · status (ถึงโกดัง PCS / ยังไม่เข้าไทย / ไม่มีข้อมูล / ขอย้ายแล้ว) · a
"request move" action. Replaces the daily manual chat lists. Needs the PCS data feed
(API or a paste/import like the MOMO invoice ingestion).

**C. Daily ops dashboard (P6).** Generate today's three lists from system state:
(1) pickup-from-MOMO (trackings at MOMO not yet received), (2) collect-payment
(arrived, billed, unpaid), (3) deliver/pickup (paid → ส่งเหมาๆ with address/phone OR
รับเอง). One screen replaces Win's nightly hand-typed summary.

**D. Outbound dispatch auto-task (P5).** On payment, auto-create a delivery task
(address + phone + date from the order) or a self-pickup flag; assign a driver; notify
the customer. Wire the existing driver app to the payment event.

**E. Status sync — flip the MOMO gate (done in code).** The propagation is built +
ungated on the manual path. Owner flips `MOMO_SYNC_PROPAGATE_STATUS=true` for the
automatic MOMO path (Option B review already satisfied for status-only).

---

## 5. Shipped this turn / session toward these gaps
- Container decode correction (EK=road) + auto-derive at write-time + display.
- MOMO cost ingestion (2,500/CBM) — the COST source of truth.
- Forwarder→shop-order status sync (links by reforder OR tracking).
- report-cnt live cost + per-shipment pay + status naming.

**Next build (owner pick):** A (scan→bill chain) is the highest-value — it directly
kills the hand-calc money leak. B (PCS reconcile) removes the biggest manual burden.

---

## 6. Build status (2026-06-19 turn 2)

**✅ Shipped:**
- **P6 — Logistics Center board** `/admin/logistics-board` (`warehouse.logisticsBoard` in the
  sidebar) — Win's cross-department overview: the whole pipeline by fstatus (ยังไม่ถึงไทย →
  ถึงไทย/วัด·บิล → รอชำระ → เตรียมส่ง → ส่งแล้ว) with per-stage count + Σ sell + responsible
  dept + next-action + tool link; money lens (need-bill/collect, juristic-WHT-1%, credit);
  manual-feed entry ("ป้อนของเข้าระบบ" → /admin/forwarders) = the **P1 preliminary** feed.
  Read-only · gated super/manager/ops/accounting (+god).
- **Container decode** corrected (EK=road) + auto-derive + display (`cabinet-transport.ts`).
- **Status-sync** forwarder→shop-order (reforder OR tracking) + the **flow-continuity card**
  now also matches by tracking (MOMO rows show).

**⏭ Next dedicated builds (money-path — spec'd, NOT rushed):**

**A — scan→measure→cost→bill auto (the #1 pain).** Trace finding: the plumbing largely
EXISTS (warehouse worker `/measure` + `warehouse-intake`/`warehouse-history` write
tb_forwarder; `report-cnt` computes live cost from fvolume×rate; `billing-run` reads
tb_forwarder). The remaining gap = make the `measure` step write `fweight`+`fvolume`
(from W×L×H, also on the box sticker) onto the forwarder, and make `billing-run`
AUTO-pull those measured values + auto-compute cost (kg-vs-คิว rule) so sales never
hand-type kg/cbm or hand-calc price — **with a manual-edit override at every field**
(owner: "ออโต้ แต่แก้มือได้ทุกจุด"). This is a focused money-path build: read
`actions/admin/billing-run.ts` end-to-end first, add the auto-pull + the override, gate +
adversarial money-review before prod. *Do as its own change, not bundled.*

**B — PCS↔Pacred reconcile board (P1 full).** ✅ SHIPPED (2026-06-19, local) as the
**แต้ม reconcile tool** — the owner provided แต้ม's authoritative feed (`Pacred
2026-06-19.xlsx` · sheet "MOMO Pacred"). `/admin/api-forwarder-momo/warehouse-reconcile`:
paste the sheet → match by ftrackingchn → preview the diff (container/transport/box/
wt/vol) → apply on NON-BILLED rows + auto re-price. `lib/admin/taem-reconcile-parser.ts`
(+test) + `actions/admin/taem-reconcile.ts`. Dry-run over the 89-row feed: 32 already
match · 24 non-billed alignable (incl. ~6 real undercounts) · 1 BILLED under-bill
(#52089) → owner decision · 31 note-rows (แต้ม no data yet). Owner applies via the
preview tool (not auto-applied — money path).

## 7. Build status (2026-06-19 turn 4 — แต้ม feed)

- ✅ **B — แต้ม reconcile tool** (above).
- ✅ **D — pending-dispatch alert** (not blind auto-dispatch). `lib/admin/pending-dispatch.ts`
  (fstatus=6 not in an open driver batch). Alert on the logistics board + the /admin/drivers
  banner → "จัดรถ (เฟิมบันทึก)" → /admin/drivers/new (the existing human confirm-save). Owner's
  rule: *"รอขึ้นแจ้งเตือน · โกดัง/แพลนนิ่งไปเฟิมบันทึก"* — alert auto, dispatch human.
- ✅ **E — MOMO status-sync DEFAULT-ON.** `MOMO_SYNC_PROPAGATE_STATUS` gate flipped to
  `!== "false"` (status-only · no money · no notify). Disable with env=false. Owner: don't
  make me remember the env.
- 🔴 **Owner decisions from the reconcile dry-run:** #52089 (616035273) is BILLED but
  undercounted (charged half-volume) → re-bill or accept; 1779955936 is missing its split
  sub-rows (-2..-5 ≈1098kg) in Pacred (the tool updates existing rows, can't create them).
