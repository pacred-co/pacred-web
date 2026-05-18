# D1 Phase-B — Legacy PCS vs Pacred workflow gap map

> **Purpose:** the canonical input for **Phase B** of [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md)
> — reworking the Pacred app so its workflow + UI match the legacy PCS
> Cargo system exactly (zero retraining for staff + customers).
>
> Source: a read-only audit of the legacy PHP (`C:\xampp\htdocs\pcscargo`)
> vs the current rebuilt Pacred app. Each gap below is a Phase-B rework item.
> Legacy = `member/` (customer portal) + `member/pcs-admin/` (admin).
>
> **🔬 Rigorous per-area detail (2026-05-19 fidelity audit):** this doc is the
> overview — the screen / button / loop-level gap maps are
> [`d1-fidelity-customer.md`](d1-fidelity-customer.md) ·
> [`d1-fidelity-admin.md`](d1-fidelity-admin.md) ·
> [`d1-fidelity-workflow.md`](d1-fidelity-workflow.md). Build Phase B to those.

---

## 1. Menu / navigation

### Customer portal
**Legacy** (`member/menu.php`) — one dashboard screen: a wallet card, the
assigned sales-rep card (photo + phone), then a **flat 9-icon grid** —
ฝากสั่งสินค้า · ฝากนำเข้าสินค้า · ประวัติใบเสร็จรายการนำเข้า · ฝากชำระ/โอน ·
เป๋าตัง · เติมเงิน · ถอนเงิน · ที่อยู่จัดส่งสินค้า · ออกจากระบบ. No persistent
sidebar — it is an icon launcher.

**Pacred** — a collapsible left sidebar with nested accordion groups.

**Gap → rework:** restore the **9-icon launchpad home** as the customer
landing surface. ~8,898 customers have muscle memory for the icon grid.
Pacred *added* Dashboard / Freight / Shipments / Commissions / Refunds /
Notifications and demoted เติมเงิน/ถอนเงิน into a Wallet sub-menu — re-flatten.

### Admin back-office
**Legacy** (`member/pcs-admin/include/left-menu.php`) — the sidebar is
RBAC-switched by a `company / department / section` triple (~40 role files
under `include/pages/left-menu/`); each role gets a hand-built menu of OOP
partials. Sections: Cargo / Freight / Cargo&Freight / Settings / Learning /
Extension. Every menu item carries a live count **badge**.

**Pacred** — one flat `items[]` array filtered by a 7-role enum.

**Gap → rework:** the role models are incompatible. Legacy = a per-role
purpose-built screen (~14 distinct menus); Pacred = one array minus
role-gated rows. Phase B must rebuild **per-role admin sidebars** with
**live-count badges**. Legacy items Pacred lacks: Learning centre, the
Extension tools (juristic check · time-attendance · meeting-room · work
tools), note queues (หมายเหตุฝากสั่ง/นำเข้า), container-cost Sheet check,
VIP/SVIP/นิติบุคคล/เครดิต member segmentation.

---

## 2. Job / order statuses

### Shop orders — `tb_header_order.hStatus`
Legacy: `1`รอดำเนินการ · `2`รอชำระเงิน · `3`สั่งสินค้า · `4`รอร้านจีนจัดส่ง ·
`5`สำเร็จ · `6`ยกเลิก. **Pacred matches this well** (mapped 1:1 to readable
strings) — low rework.

### Import / forwarder — `tb_forwarder.fStatus`
Legacy: `1`รอสินค้าเข้าโกดังจีน · `2`สินค้าถึงโกดังจีน · `3`กำลังส่งมาไทย ·
`4`ถึงไทยแล้ว · `5`รอชำระเงิน · `6`เตรียมส่ง · `7`ส่งแล้ว.

**Gap → rework (important):** the legacy flow is **ship → arrive → THEN
pay** (`รอชำระเงิน` at slot 5, *after* goods reach Thailand) — the cargo COD
model: the customer pays once weight/volume is known at the Thai warehouse.
Pacred puts `pending_payment` **first** (pay-then-ship). This is a real
workflow inversion staff will trip on — Phase B restores the legacy order.
Pacred also dropped the `fStatusCarOn/Off` truck load/unload sub-states.

### Containers — `tb_cnt.cntStatus`
Legacy: a 2-value flag — `1` รอจ่ายเงิน / `2` จ่ายแล้ว. `tb_cnt` is literally
*"ตารางจ่ายเงินค่าตู้"* — a container-**payment** record. Pacred models a
container as a rich logistics state-machine entity — see §3.

---

## 3. Container (ตู้) workflow

**Legacy** — four payment-centric tables:
- `tb_cnt` — one row per container payment: `cntName` (เลขตู้), `cntStatus`
  (paid/unpaid), `cntAmount`, `cntImagesSlip` (slip image).
- `tb_cnt_item` — links each container's `fCabinetNumber` strings to a `cntID`.
- `tb_cnt_pay_idorco` / `tb_cnt_pay_trackingchn` — the PK/CO numbers and
  China tracking numbers covered by each payment.

The loop (`report-cnt.php`): each `tb_forwarder` row carries a free-text
`fCabinetNumber`; staff group forwarders by that string; a payment INSERTs
`tb_cnt` + fans the member forwarders' `fIDorCO` / `fTrackingCHN` into the
two `tb_cnt_pay_*` tables. The container is a **loose label** that ties
forwarder rows together for a bulk China-side payment + cost reconciliation;
"close" = a `fDateContainerClose` timestamp on the forwarder rows.

**Pacred** — `cargo_containers` is a first-class entity with its own status
machine, history log, ETA.

**Gap → rework:** completely different mental models. Phase B must reproduce
the `tb_cnt` **payment-slip ledger** keyed by container (the slip image,
`cntAmount`, the paid/unpaid badge feeding the accounting menu) and the
`tb_cnt_pay_*` fan-out — Pacred currently has no equivalent.

---

## 4. The logic loop (per role)

- **Customer** — legacy: 9-icon home → cart (`tb_cart`, 151-item cap) →
  `tb_header_order` at `hStatus=1` → a **tab-per-status list** (6 tabs) →
  pay-from-wallet flips status. Pacred replaced the tab-per-status list and
  now shows **three** status vocabularies (order 6-state, forwarder 7-state,
  shipment 8-state) — Phase B reconciles them onto the legacy set.
- **Warehouse** — legacy `barcode-d-import.php`: set a shelf `location`,
  scan each box, **auto-flip `fStatus`→4 once scanned count ≥ `fAmount`**;
  green = matched, orange + sound = unmatched. Phase B must verify Pacred's
  `/admin/barcode` reproduces the scan-to-auto-flip + shelf capture + audio.
- **Scanner** — legacy has a `barcode-d-*` / `barcode-c-*` family (~8 scan
  modes: find / warehouse-in / prepare / from-box-face, device vs camera).
  Pacred collapsed to one `/admin/barcode` — re-expand.
- **Accounting** — legacy: ใบแจ้งหนี้ · ประวัติใบเสร็จ · รวมบิล (multi-order
  consolidation) · container-payment (`report-cnt`) · รับรู้รายได้. Pacred
  lacks the container-payment slip screen + รวมบิล consolidation.
- **Audit / QA** — legacy has a dedicated `QAAndQC` department with a
  `tb_check_forwarder` check-queue. Pacred `/admin/audit` is a system audit
  *log*, not a goods-checking queue — Phase B adds the QA-check workflow.

---

## 5. Legacy admin visual base

The legacy admin UI is built on the **ThemeForest "Modern Admin — clean
Bootstrap 4 dashboard" v4.0** template (stock `la la-*` / `ft-*` icons,
Bootstrap-4 markup, `dropify` / `cropper` / `magnific-popup` plugins). The
template zip is in `newrealdatapcs/`. Phase-B frontend should use it as the
visual reference for the admin look.

---

## 6. Biggest reworks (Phase-B priority order)

1. **Customer portal paradigm** — restore the 9-icon launchpad home.
2. **Forwarder status order** — restore ship→arrive→THEN-pay.
3. **Container = payment ledger** — rebuild the `tb_cnt` slip ledger.
4. **Three customer status vocabularies** — reconcile onto the legacy set.
5. **Admin RBAC** — per-role hand-built sidebars + live-count badges.
6. **Missing modules** — Learning centre · Extension tools · QA-check queue ·
   note queues · member segmentation · multi-order bill consolidation · the
   8-variant barcode-scan family.
