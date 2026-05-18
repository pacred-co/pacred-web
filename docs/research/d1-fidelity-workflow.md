# D1 — Workflow-loop fidelity audit (legacy PCS Cargo vs Pacred)

> **Purpose / จุดประสงค์:** A rigorous, loop-by-loop comparison of the legacy
> **PCS Cargo** end-to-end workflow *logic* against Pacred's current
> implementation — so a Phase-B builder knows **exactly where Pacred's logic
> diverges** and what the fidelity fix is.
>
> This is the **workflow-logic companion** to
> [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md) (which covers menu / nav /
> visual gaps). Where that doc says *"the status order is wrong"*, this doc
> draws the **full state diagram** for each loop and gives a row-level
> `legacy | Pacred today | gap → fidelity fix`.
>
> **Decision being served:** [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md)
> (**D1**) — Pacred must reproduce the legacy PCS workflow faithfully;
> `PCS`→`PR` rebrand only, **no logic reinterpretation**.
>
> **Sources audited (read-only):**
> - Legacy PHP — `/Users/dev/Desktop/pcscargo/member/` (customer portal) +
>   `member/pcs-admin/` (admin). Status enums decoded from
>   `member/include/function.php` + `member/pcs-admin/include/function.php`;
>   transitions decoded from the page flow (`shops.php`, `cart.php`,
>   `forwarder.php`, `payment.php`, `pcs-admin/forwarder.php`,
>   `pcs-admin/report-cnt.php`, `pcs-admin/forwarder-import-warehouse.php`,
>   `register.php` / `register-id.php` / `login.php`, `include/encryptPass.php`).
> - Pacred — this repo: `supabase/migrations/0010,0011,0033,0048,0059,0068`,
>   `actions/forwarder.ts`, `actions/service-order.ts`, `lib/forwarder/billing-gate.ts`.
> - Decoded evidence — [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md),
>   [`../audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md).
>
> **Scope note:** this audits the **cargo / shop-order loops the legacy PHP
> actually had**. Pacred's net-new freight modules (FCL/LCL booking,
> Form E, D/O) have no legacy counterpart to be faithful *to* — they are
> Phase-C territory and are only noted where they collide with a cargo loop.

---

## 0. TL;DR — the five biggest workflow divergences

Ranked by retraining cost + revenue risk. Each is expanded in its section.

| # | Divergence | Where | Severity |
|---|---|---|---|
| **1** | **Forwarder pay-point inverted.** Legacy bills *after* goods reach Thailand (`fStatus=5` รอชำระเงิน sits at slot **5**, post-arrival — the cargo COD model). Pacred bills *first* (`pending_payment` at slot **1**, pay-then-ship). Customer self-pay (`payForwarderFromWallet`) is hard-gated to `status==='pending_payment'`. | §2 | 🔴 inverts the core money loop |
| **2** | **Forwarder status vocabulary reinterpreted.** Legacy 7 states are *warehouse-progress* labels (รอเข้าโกดังจีน → ส่งแล้ว). Pacred renamed them to *logistics* labels AND reordered them so payment is first. Slot-for-slot the two enums disagree. | §2 | 🔴 staff read the wrong state |
| **3** | **Container = three competing models.** Legacy `tb_cnt` is a **payment-slip ledger** (`cntStatus` 1 unpaid / 2 paid). Pacred has `cargo_containers` (6-state logistics machine) *and* legacy `containers` (7-state) *and* `cargo_sacks` — none of which is a China-side payment ledger. | §3 | 🔴 the container-payment loop has no home |
| **4** | **Three customer status vocabularies on one screen.** Pacred shows order (6-state), forwarder (7-state), AND `cargo_shipments` (8-state `received_cn`…`delivered`). Legacy showed customers exactly **two** (order + forwarder). The shipment enum is a net-new third vocabulary. | §3, §6 | 🟠 confusing, un-legacy |
| **5** | **Status rollback is absent in the customer model; legacy has the `99` mechanism.** Legacy admin `forwarder.php` has a documented `fStatus=99` park-and-restore (`tb_log_forwarder_status` keeps `fStatusOld`). Pacred's `forwarder_status_log` is append-only audit with **no restore path** — the chat's #1 ops complaint (A2 "ถอยสถานะ"). | §2.4, §7 | 🟠 revenue freezes when a bill is wrong |

**Loops mapped in this doc:** 6 — (1) shop-order lifecycle, (2) cargo
forwarder/import lifecycle, (3) container ตู้ flow, (4) billing / payment /
receipt, (5) member-code + login/auth, (6) wallet + yuan-transfer.

---

## 1. Loop 1 — Shop-order lifecycle (ฝากสั่งซื้อ / China shopping cart)

**Legacy customer-facing flow:** 9-icon home → `cart.php` (a `tb_cart` cart,
hard cap **151 items**) → "place order" in `shops.php` writes a
`tb_header_order` header at `hStatus=1` + `tb_detail_order` line items →
customer sees a **6-tab status list** (one tab per `hStatus`) → admin prices
it → customer pays → status advances.

### 1.1 Legacy state diagram — `tb_header_order.hStatus`

Decoded from `member/include/function.php::statusOrderBadge()` +
`shops.php` transition code.

```
 [1] รอดำเนินการ          pending — order placed, awaiting admin price
   │   (admin enters CNY prices + yuan rate → moves to 2)
   ▼
 [2] รอชำระเงิน           awaiting_payment — priced, hDatePayment timer set
   │   (customer pays: shops.php UPDATE hStatus='3' — wallet/topup)
   │   (timer hDatePayment expires → shops.php UPDATE hStatus='6')
   ▼
 [3] สั่งสินค้า            ordered — Pacred has bought from the China shop
   │   (admin advances once the China shop confirms)
   ▼
 [4] รอร้านจีนจัดส่ง       awaiting_chn_dispatch — waiting for the shop to ship
   │   (admin advances when goods leave the China shop)
   ▼
 [5] สำเร็จ               completed — terminal success
       (this hands off to a forwarder for the actual import)

 [6] ยกเลิกออเดอร์         cancelled — terminal; from 1 or 2, or timer expiry
```

**Triggers:** `1→2` admin (price entry). `2→3` **customer** (pay — `shops.php`
sets `hStatus='3'`, `paydeposit='1'`, `hDate3=NOW()`). `2→6` system (the
`hDatePayment` timer) or customer/admin cancel. `3→4`, `4→5` admin. The legacy
self-cancel rule: a customer may cancel only while `hStatus<3`
(`shops.php` `WHERE hStatus<3`).

### 1.2 Pacred implementation — `service_orders.status`

Migration `0011_service_order.sql`. Pacred **deliberately mapped the legacy
codes 1:1 to readable strings** and the migration header documents the mapping
explicitly:

```
pending → awaiting_payment → ordered → awaiting_chn_dispatch → completed
                                                              cancelled
```

`payServiceOrderFromWallet` (`actions/service-order.ts`) requires
`status==='awaiting_payment'`, debits the wallet, flips to **`ordered`** +
`date_ordered` — i.e. legacy `2→3`. Self-cancel allowed while
`status in ('pending','awaiting_payment')` — i.e. legacy `hStatus<3`. The
151-item cart cap is reproduced as a Postgres trigger (`cart_items_cap`).

### 1.3 Gap map — shop-order loop

| Aspect | Legacy behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Status set | 6 numeric (`1`-`6`) | 6 strings, 1:1 mapped | ✅ **Faithful.** Keep. (Display the Thai label set verbatim.) |
| Pay transition | `2→3` (`hStatus='2'`→`'3'`) | `awaiting_payment→ordered` | ✅ Faithful. |
| Payment timer | `hDatePayment` → auto-cancel to `6` | `payment_due_at` + `awaiting_payment` index; auto-cancel job | ✅ Modelled. **Verify** the cron actually flips expired rows to `cancelled` (the index exists; confirm a job consumes it). |
| Self-cancel window | `hStatus < 3` | `status in (pending, awaiting_payment)` | ✅ Faithful. |
| `paydeposit` flag | `paydeposit='1'` on pay | `paydeposit_pending boolean` | ✅ Modelled. |
| Status **tab list** UI | 6 tabs, one per `hStatus`, with live count badges | Pacred portal uses a list, not the 6-tab control | 🟠 **Gap.** Phase B: restore the **6-tab status list** with per-tab count badges (legacy `shops.php` `SELECT COUNT(ID)…hStatus='N'`). Customers navigate by tab. |
| Order **number** | `P` + auto-increment id (`P18926`) | `O{YYMMDD}-{seq}` | 🟡 **Cosmetic divergence.** D1 = `PCS`→`PR` rebrand. The faithful choice is `P{n}` (or `PR`-flavoured); `O{YYMMDD}-{seq}` is a Pacred invention. Decide with ก๊อต — low risk, but it is a visible code customers quote. |

**Verdict:** the shop-order loop is the **most faithful** of the six. Two
items: re-add the 6-tab status list (UI), and reconcile the order-number
format. Logic is sound.

---

## 2. Loop 2 — Cargo forwarder / import lifecycle (ฝากนำเข้าสินค้า) 🔴

This is the **biggest divergence in the entire system** and the loop ADR-0017
was triggered by. The legacy forwarder status enum and Pacred's
`forwarders.status` enum **disagree on both the order and the meaning** of
every slot.

### 2.1 Legacy state diagram — `tb_forwarder.fStatus`

Decoded from `member/include/function.php::statusForwarderBadge()` /
`statusForwarderAll2..4()` + `pcs-admin/forwarder.php` +
`member/forwarder.php` transition code.

```
 [1] รอสินค้าเข้าโกดังจีน    pending — job created, goods not yet at the CN warehouse
   │   (warehouse receives the goods)
   ▼
 [2] สินค้าถึงโกดังจีนแล้ว   arrived at China warehouse
   │   (goods leave China — loaded into a container)
   ▼
 [3] กำลังส่งมาประเทศไทย     in transit to Thailand (truck/sea)
   │   (warehouse-import scan in TH → AUTO-flip, see §2.3)
   ▼
 [4] สินค้าถึงประเทศไทยแล้ว  arrived at the Thai warehouse
   │   (admin computes weight/CBM → price → moves to 5)
   ▼
 [5] รอชำระเงิน             AWAITING PAYMENT  ◀── the bill is raised HERE,
   │                                            AFTER the goods are in TH
   │   (customer pays from wallet → member/forwarder.php sets fStatus='6')
   ▼
 [6] เตรียมส่ง / กำลังจัดส่ง  preparing dispatch — split by fStatusDriver:
   │     fStatusDriver=0 → "เตรียมส่ง"
   │     fStatusDriver=1 → "กำลังจัดส่ง" (a driver run is assigned)
   │   (driver delivers → admin/driver advances)
   ▼
 [7] ส่งแล้ว                delivered — terminal

 [99]  parked / rollback intermediate (admin-only — see §2.4)
```

**Plus two orthogonal sub-states** (legacy `fStatusCarOn` / `fStatusCarOff`,
the truck load/unload flags) and `fStatusDriver` (derived from the
`tb_forwarder_driver_item` join — drives the `6` → "กำลังจัดส่ง" relabel).

**Triggers:** `1→2` warehouse/admin (CN receive). `2→3` admin (container
loaded). `3→4` **auto** (TH warehouse scan — §2.3) or admin. `4→5` admin
(after pricing — *this is the billable point*). `5→6` **customer** (pay from
wallet — `member/forwarder.php` `WHERE (fStatus='5' OR fCredit='1')` →
`UPDATE fStatus='6', paydeposit='1', fDateStatus6=NOW()`). `6→7` driver/admin.

### 2.2 Pacred implementation — `forwarders.status`

Migration `0010_forwarder.sql`. Pacred defined a **different 7-state enum**
(the migration header documents the intended mapping, but the *labels* and
*order* were reinterpreted):

```
[1] pending_payment    รอชำระเงิน        ◀── PAYMENT IS FIRST
[2] shipped_china      สินค้าออกจากจีน
[3] in_transit         ขนส่งกลางทาง
[4] arrived_thailand   สินค้าเข้าโกดังไทย
[5] out_for_delivery   กำลังจัดส่ง
[6] delivered          ส่งสำเร็จ
[7] cancelled          ยกเลิก
```

`payForwarderFromWallet` (`actions/forwarder.ts`) requires
`status==='pending_payment'`, debits the wallet, flips to **`shipped_china`**.
A new forwarder is inserted at `pending_payment` and RLS only lets the
customer edit a forwarder while `status==='pending_payment'`.

### 2.3 The pay-point inversion — the headline finding 🔴

Slot-for-slot the two enums:

| Slot | Legacy `fStatus` | Pacred `forwarders.status` | Same concept? |
|---|---|---|---|
| 1 | รอสินค้าเข้าโกดังจีน (await CN warehouse) | `pending_payment` (await payment) | ❌ **opposite** |
| 2 | สินค้าถึงโกดังจีนแล้ว (at CN warehouse) | `shipped_china` (left China) | ❌ off-by-one |
| 3 | กำลังส่งมาไทย (in transit) | `in_transit` | 🟡 ~matches |
| 4 | สินค้าถึงไทยแล้ว (at TH warehouse) | `arrived_thailand` | ✅ matches |
| 5 | **รอชำระเงิน (await payment)** | `out_for_delivery` | ❌ **opposite** |
| 6 | เตรียมส่ง / กำลังจัดส่ง | `delivered` | ❌ off-by-one |
| 7 | ส่งแล้ว (delivered) | `cancelled` | ❌ different concept |

**The two enums agree on exactly ONE slot (4).** This is the workflow-logic
divergence ADR-0017 exists to fix.

**The semantic core:** legacy is **cargo COD** — the customer pays *after* the
goods physically reach Thailand and weight/CBM are measured (`fStatus=5`,
post-arrival). The bill cannot be known earlier because cargo is billed by
measured weight/volume, and the measurement happens at the Thai warehouse.
Pacred made it **pay-then-ship** — `pending_payment` is slot 1, the customer
pays an order-time *estimate* before anything ships.

Pacred's own code shows the team half-knew this: `lib/forwarder/billing-gate.ts`
(U1-3) bolts on a *post-arrival* "arrival→billing gate" that blocks a
wallet debit on an `arrived_thailand` / `out_for_delivery` forwarder until the
container's CBM is finalised. **That gate is a patch re-deriving the legacy
`fStatus=5` semantics** on top of an inverted enum. The faithful fix removes
the need for the patch.

| Aspect | Legacy behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Pay-point | `fStatus=5` — **post-arrival**, after weight/CBM measured | `pending_payment` = slot 1 — **pre-ship**, on order-time estimate | 🔴 **Restore post-arrival billing.** The forwarder status enum must place "await payment" *after* "arrived at TH warehouse". Pay transition becomes `arrived/await-payment → preparing-dispatch`. |
| Customer self-pay guard | `WHERE fStatus='5' OR fCredit='1'` | `status==='pending_payment'` | 🔴 Re-point `payForwarderFromWallet` to the post-arrival status. |
| Pay → next status | `fStatus='6'` (เตรียมส่ง) | `shipped_china` | 🔴 Pay should flip to **เตรียมส่ง** (dispatch-prep), not "shipped from China". |
| Billing gate | not needed — billing *is* post-arrival by construction | `billing-gate.ts` U1-3 patch | 🟡 Once the enum is faithful, the billing gate's job folds into the status machine. Keep the CBM-reconciliation logic; drop the "status-inversion compensation" framing. |
| Order-time price | legacy stores an estimate but **does not bill on it** | Pacred bills on the order-time `total_price` | 🔴 Estimate at order time, bill on measured figures at `fStatus=5`-equivalent. |

### 2.4 Status vocabulary reinterpretation

Even ignoring the order, the **labels** were rewritten. Legacy labels describe
**warehouse progress** ("รอสินค้าเข้าโกดังจีน" — *awaiting goods into the
China warehouse*). Pacred labels describe **logistics legs** ("สินค้าออกจาก
จีน" — *left China*). A staff member trained on legacy reads Pacred's slot 2
"shipped_china" and thinks *goods already left China*, when the legacy concept
they expect at that point is *goods just arrived at the China warehouse*.

| Aspect | Legacy | Pacred | Gap → fidelity fix |
|---|---|---|---|
| Slot 1 label | รอสินค้าเข้าโกดังจีน | รอชำระเงิน | 🔴 Restore "รอสินค้าเข้าโกดังจีน" as the entry state. |
| Slot 2 label | สินค้าถึงโกดังจีนแล้ว | สินค้าออกจากจีน | 🔴 Restore "สินค้าถึงโกดังจีนแล้ว". |
| Slot 6 split | `6` relabels to "กำลังจัดส่ง" when `fStatusDriver=1` | single `out_for_delivery` | 🟠 Reproduce the **driver-derived relabel**: status `6` shows "เตรียมส่ง" or "กำลังจัดส่ง" depending on whether a driver run is assigned. |
| Truck sub-states | `fStatusCarOn` / `fStatusCarOff` (load / unload onto truck) | dropped | 🟠 Re-add the load/unload sub-flags (orthogonal to `fStatus`). Used by warehouse + driver. |

### 2.5 Status rollback — the `99` mechanism

Legacy `pcs-admin/forwarder.php` (lines 4-60) implements a documented
**park-and-restore**:

- `moveStatusTo99` — `UPDATE tb_forwarder SET fStatus='99'` + writes a
  `tb_log_forwarder_status` row capturing the prior status.
- `removeStatusTo99` — reads the most recent `tb_log_forwarder_status` row for
  the job, restores `fStatus` to its `fStatusOld` (falls back to `3` if no
  history). This is how staff *reverse* a job to fix a wrong rate/price.

Pacred's `forwarders` table has `forwarder_status_log` (a status-change audit
table + trigger) — but it is **append-only**, with **no restore action and no
`99` parked state**. There is no customer-or-admin path to roll a forwarder
back. This is **A2 "ถอยสถานะ"** — the single most-repeated ops complaint in
the legacy chat ([cargo-ops-forensics §4 A2](../audit/cargo-ops-forensics-2026-05-16.md)):
*"once an order advances, staff cannot reverse it… revenue frozen"*.

| Aspect | Legacy | Pacred | Gap → fidelity fix |
|---|---|---|---|
| Parked state | `fStatus=99` | none | 🟠 Add a parked/`99`-equivalent status (or an admin "rollback" action). |
| Restore | `removeStatusTo99` reads `fStatusOld`, restores | not possible | 🟠 Build the restore: read `forwarder_status_log`, set status back to `status_old`, write an audit row. |
| Audit table | `tb_log_forwarder_status` (`fStatusOld`,`fStatusNew`,`adminIDChange`) | `forwarder_status_log` (`status_old`,`status_new`,`admin_id`) | ✅ Schema is faithful — it just needs the *restore* consumer. |

### 2.6 Warehouse auto-flip — `fStatus 3→4`

Legacy `pcs-admin/forwarder-import-warehouse.php` (line 8-29): when a TH
warehouse scan registers boxes against a forwarder
(`SELECT fAmount … WHERE fStatus<5`), it sets `fStatus=4`,
`fDateStatus4=NOW()` and captures the shelf `fPallet`. Box-count match/mismatch
is shown (`fi2Amount` vs `fAmount` → "ขาดอีก N กล่อง" / "เกินมา N กล่อง").
The `d1-phase-b-gap-map.md` §4 also notes the green/orange + audio feedback in
`barcode-d-import.php`.

| Aspect | Legacy | Pacred | Gap → fidelity fix |
|---|---|---|---|
| Auto-flip on scan | scan count vs `fAmount` → auto `fStatus=4` | `cargo_shipments` has `received_qty`/`expected_qty` (mig 0037) but the auto-flip of the *forwarder* status on scan is not reproduced | 🟠 Wire `/admin/barcode` so a complete scan auto-advances the linked forwarder to the "arrived TH" status + records the shelf location + over/under-count. |
| Shelf location | `fPallet` captured at scan | `forwarder_items.location_wth` exists | 🟡 Confirm the scanner UI writes it. |

---

## 3. Loop 3 — Container (ตู้) flow 🔴

The legacy and Pacred container models are **fundamentally different mental
models**, and Pacred actually carries **three** container-ish tables to
legacy's payment-centric set.

### 3.1 Legacy model — a payment-slip ledger

Legacy has no "container state machine". A "container" is a **loose text
label** (`tb_forwarder.fCabinetNumber`, a free-text เลขที่ตู้) that ties
forwarder rows together, plus a **payment ledger** built by
`pcs-admin/report-cnt.php`:

| Table | Role |
|---|---|
| `tb_cnt` | one row **per container payment** — `cntName` (เลขตู้), `cntStatus` (**`1` ยังไม่จ่ายเงิน / `2` จ่ายเงินแล้ว**), `cntAmount`, `cntImagesSlip` (the China-side payment **slip image**), `cntFile`. |
| `tb_cnt_item` | links each `fCabinetNumber` string → a `cntID`. |
| `tb_cnt_pay_idorco` | the PK/CO numbers (`fIDorCO`) covered by a payment. |
| `tb_cnt_pay_trackingchn` | the China tracking numbers (`fTrackingCHN`) covered by a payment. |
| `tb_cost_container` | per-container cost reconciliation by product type (`fProductsType1..4`). |

The loop (`report-cnt.php`): staff group forwarders by their free-text
`fCabinetNumber`; a payment **INSERTs `tb_cnt`** (with the slip image +
amount) and **fans out** the member forwarders' `fIDorCO` / `fTrackingCHN`
into the two `tb_cnt_pay_*` tables. **"Close" = a `fDateContainerClose`
timestamp** written onto the forwarder rows (`tb_forwarder.fDateContainerClose`).
There is **no container status enum** — the only container "status" is
`cntStatus` (the **payment** paid/unpaid flag). `report-cnt.php` even detects
"กำลังจะจ่ายซ้ำ" (about to double-pay) by counting `tb_cnt_pay_trackingchn`
rows.

So legacy ตู้ = **`fCabinetNumber` free-text label + a China-side
payment-slip ledger + a `fDateContainerClose` timestamp**. That is the whole
model.

### 3.2 Pacred model — three first-class entities

Pacred has **three** tables, none of which is the legacy payment ledger:

| Table | Mig | Shape |
|---|---|---|
| `containers` (legacy/0016) | 0016 | ops-tracking: `container_no`, `vessel`, `carrier`, `cost_thb`, 7-state enum `preparing/sealed/in_transit/arrived_port/cleared_customs/delivered/cancelled`. **Deprecated by U1-1**. |
| `cargo_containers` (spine/0033) | 0033, +0059 unify | first-class logistics machine: `code`, `transport_mode`, **6-state enum** `packing/sealed/in_transit/arrived/unloading/closed`, ETA, `cargo_container_status_history`. |
| `cargo_sacks` (0068) | 0068 | "กระสอบรวม" consolidation bag — `code` `CBX…-EK…`, outside weight/CBM (a MOMO concept). |

Pacred's `cargo_containers.status` is a **logistics state machine**
(`packing → sealed → in_transit → arrived → unloading → closed`) — a model
the legacy system **never had**. Legacy container "closing" is a *timestamp on
forwarder rows*; Pacred "closing" is a *status enum value on a container
entity*. Pacred has **no `tb_cnt` equivalent** — no place to record a
China-side payment slip image against a container, no paid/unpaid container
badge, no `tb_cnt_pay_*` fan-out.

### 3.3 Gap map — container loop

| Aspect | Legacy behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Container identity | free-text `fCabinetNumber` on each forwarder | `cargo_containers.code` (a real entity) | 🟡 Pacred's entity is *better* — but Phase B must keep the **free-text `cabinet_number`** on forwarders too (`forwarders.cabinet_number` exists ✅), because staff group by that string. |
| Container "status" | `cntStatus` = **payment** flag (`1` unpaid / `2` paid) | `cargo_containers.status` = 6-state **logistics** machine | 🔴 The legacy ตู้ status staff know is *paid/unpaid*. Phase B must surface a **container-payment paid/unpaid badge** — see next row. |
| **Container-payment ledger** | `tb_cnt` (slip image, amount, paid flag) + `tb_cnt_pay_*` fan-out | **absent** | 🔴 **Build the `tb_cnt` equivalent** — a container-payment record: slip image, `amount`, paid/unpaid status, and the PK/CO + CN-tracking fan-out tables. This feeds the accounting menu (§4) and the China-cost reconciliation. |
| "Close container" | `fDateContainerClose` timestamp on forwarder rows | `cargo_containers.close_at` (mig 0042) + status `closed` | 🟡 Both exist. Faithful semantics: closing must (a) be a date and (b) be the gate for "ตัดตู้" (assigning forwarders to the container — see C3 below). |
| **"ตัดตู้" prerequisite** | assigning a forwarder to a container needs `fDateContainerClose` set first; UI does not enforce → fails silently ("ค้นหาไม่เจอ" — chat C3) | not reproduced | 🟠 Reproduce + **fix**: block container-assignment until the container has a close-date, with an explicit error (not silent). |
| Double-pay guard | `report-cnt.php` counts `tb_cnt_pay_trackingchn` → "จ่ายซ้ำ" warning | absent | 🟡 Re-add the about-to-double-pay detection when the container-payment ledger is built. |
| Cost reconciliation | `tb_cost_container` per product type | `0069_container_costs_disbursements` (per-container cost ledger) | 🟡 Pacred has a cost ledger — verify it reconciles per product type the way `tb_cost_container` does. |
| CBM source tracking | implicit (one number) | `cargo_shipments` CBM-per-source (0039), `cargo_sacks` outside-CBM | ✅ Pacred is *ahead* here — keep. (This is the D1/D2 reconciliation work from cargo-ops-forensics.) |

**Verdict:** Pacred's logistics container entity is a genuine improvement and
should be **kept** — but D1 fidelity requires *also* reproducing the legacy
**container-payment slip ledger** (`tb_cnt`), because that ledger is what the
accounting team's workflow runs on, and it currently has **no home in
Pacred**.

---

## 4. Loop 4 — Billing / payment / receipt

How a cargo job becomes billable → paid → receipted.

### 4.1 Legacy flow

The legacy money record is **`tb_wallet_hs`** (wallet history) — every topup,
payment, withdraw, and refund is a row, typed by `type` / `typeNew` /
`typeService` / `status`.

**Cargo forwarder payment** (decoded from `member/forwarder.php` lines
252-349):
1. The job reaches `fStatus=5` (รอชำระเงิน) — *post-arrival*, priced.
2. Customer selects jobs to pay. The bill is computed from the forwarder
   columns: `fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService
   + priceCrate + fTransportPriceCHNTHB + priceOther − fDiscount`.
3. **Juristic 1% WHT:** if the customer is นิติบุคคล and the total ≥ ฿1000,
   `pricePayAll = pricePayAll * 0.99` and `fUserCompany='1'` is set on the
   forwarder. (This is the only WHT the legacy code *automatically* handled —
   the chat A6 shows it was inadequate.)
4. Payment writes `tb_wallet_hs` rows (`type='4'` debit, `typeNew='6'`,
   `typeService='2'`, `status='1'`; topup-with-payment writes a paired
   `type='1'` row) and **`UPDATE tb_forwarder SET fStatus='6',
   paydeposit='1', fDateStatus6=NOW()`** — i.e. paid → เตรียมส่ง.
5. **Credit customers:** `fCredit='1'` lets a job be paid on credit — the pay
   query is `WHERE (fStatus='5' OR fCredit='1')`, and a credit payment clears
   `fCredit`.
6. **Receipt:** issued admin-side (`pcs-admin/create-f-receipt.php`,
   `hs-receipt-forwarder.php`, `tb_receipt` + `tb_receipt_item`). The printed
   receipt number is `FRC{YYMM}-{NNNNN}-{N}`.

**Shop-order payment** — `shops.php` `hStatus 2→3`, similar wallet-hs write.
**Yuan-transfer payment** — `tb_payment`, separate enum (§6).

### 4.2 Pacred flow

Pacred's money record is **`wallet_transactions`** (one row per movement,
`kind` + `status` + `reference_type`/`reference_id`). `payForwarderFromWallet`
/ `payServiceOrderFromWallet` insert a negative `wallet_transactions` row
(`kind='import_payment'` / `'order_payment'`, `status='completed'`) then flip
the order/forwarder status. Idempotency is enforced by partial-unique indexes
(`0049`, `0061`). Pacred has: `0044_withholding_tax`, `0034_tax_invoices`,
`0071_customer_credit_line`, `0056_accounting_periods`,
`0069_container_costs_disbursements`.

### 4.3 Gap map — billing loop

| Aspect | Legacy behaviour | Pacred today | Gap → fidelity fix |
|---|---|---|---|
| Ledger shape | `tb_wallet_hs` rows typed `type`/`typeNew`/`typeService` | `wallet_transactions` rows typed `kind`/`reference_type` | ✅ Conceptually faithful (one row per movement). |
| Forwarder billable point | `fStatus=5` (post-arrival) | `pending_payment` (pre-ship) — see §2.3 | 🔴 **Same inversion as §2** — a job becomes "billable" at the wrong point. |
| Bill formula | sum of 7 forwarder price columns − discount | computed `total_price` column | 🟡 Verify the Pacred formula sums the *same* components (transport + price-update + service-fee + crate + CN-domestic + other − discount). |
| Auto 1% WHT (juristic ≥ ฿1000) | `pricePayAll * 0.99` + `fUserCompany='1'` | `0044_withholding_tax` — a fuller WHT model | 🟡 Pacred is *ahead* (A6 fix). **But** confirm the *auto-1%-on-pay for juristic ≥ ฿1000* path is preserved — legacy customers expect the deduction to happen at pay time. |
| Credit-line payment | `fCredit='1'` → `WHERE (fStatus='5' OR fCredit='1')`; cleared on pay | `0071_customer_credit_line` + `credit_used` flag on forwarders | 🟡 Pacred has a credit model — verify a credit job is *payable* and that paying clears the credit, matching `fCredit` semantics. |
| Receipt number | printed `FRC{YYMM}-{NNNNN}-{N}` | `tax_invoices` / receipt PDF route | 🟠 **Reproduce the `FRC{YYMM}-{NNNNN}-{N}` printed-receipt numbering** (chat A7 — staff explicitly ask for "เลขที่ใบเสร็จแบบพิม"). Keep a system-id vs printed-number distinction. |
| Multi-order bill consolidation (รวมบิล) | legacy accounting consolidates many orders onto one bill | absent | 🟠 Phase B: add the รวมบิล multi-order consolidation (also in `d1-phase-b-gap-map.md` §4). |
| Payment timestamp | must reflect the **slip's** transfer time, not approval-click time (chat A1) | `0043_slip_transferred_at` exists | ✅ Modelled — verify the receipt + accounting read `slip_transferred_at`. |

---

## 5. Loop 5 — Member-code + login / auth

### 5.1 Legacy

- **Member code = `tb_users.userID`**, format **`PCS` + integer**
  (`PCS10005`). Generation (`register-id.php` line 42-43):
  `userID = 'PCS' . (preg_replace('/[^0-9]/','', lastUserID) + 1)` — i.e.
  strip non-digits from the latest `userID`, increment, re-prefix. A custom
  branch lets staff hand-pick a code below `PCS2500`.
- **`coID`** — a company/agent tag on the user (`PCS` default, plus VIP agent
  groups `THADA.VIP`, `SIN.VIP`, `OOAEOM.VIP`, `SWAN`). Drives a VIP badge.
- **Login** (`login.php` line 18-19): `SELECT … FROM tb_users WHERE
  userPass='$userPass' AND userStatus='1' AND (userID='$x' OR userTel='$x')`
  — login by **member-code OR phone**, password matched as a transformed
  hash.
- **Password hash** (`include/encryptPass.php::pass_tam()`):
  `a=md5(pw); b=a[0:15]; c=md5(b); d=strrev(a); userPass = d.b.c` — a
  deterministic **unsalted** scheme.
- Registration is **OTP-gated** (`tb_users_otp_hs`, 5/day per user) and
  creates the `tb_users` row + a `tb_wallet` row + a `tb_cash_back` row.

### 5.2 Pacred

- **Member code = `profiles.member_code`**, format **`PR` + min-3-digit
  running number** (`PR001`), Postgres trigger `generate_member_code`
  (mig `0060`), overflow-safe past `PR999`.
- **Auth = Supabase Auth** (email/phone + password). The legacy `pass_tam()`
  hash is **already re-implemented** — `lib/auth/pcs-legacy-password.ts`
  (`passTam` / `verifyLegacyPassword`) — so migrated PCS customers sign in
  with their existing password (the "เชื่อมต่อบัญชี PCS CARGO" bridge), with
  login-time lazy re-hash. `0067_pcs_customer_migration` scaffolds the import.

### 5.3 Gap map — member-code + auth

| Aspect | Legacy | Pacred | Gap → fidelity fix |
|---|---|---|---|
| Code prefix | `PCS<n>` | `PR<n>` | ✅ **Exactly D1's intent** — `PCS`→`PR` rebrand. |
| Running number | strip-digits-of-latest + 1, no zero-pad (`PCS10005`) | min-3-digit zero-padded (`PR001`) | 🟠 **Divergence.** D1 = "keep the exact running number". Legacy `PCS10005` should migrate to `PR10005`, **not** be re-padded. Confirm `0067` migration preserves the legacy integer 1:1 and the `generate_member_code` trigger only applies to *brand-new* post-migration signups. |
| Login identifier | member-code **OR** phone | Supabase (email/phone + password) | 🟠 Confirm a migrated customer can still log in **by member-code** (`PR<n>`), not only phone/email — legacy customers type their code. |
| Password scheme | `pass_tam()` unsalted MD5 | re-implemented + lazy upgrade on login | ✅ **Faithful** — `lib/auth/pcs-legacy-password.ts`. Good. |
| `coID` / VIP agent groups | `coID` tag + VIP badge (`THADA.VIP` etc.) | not modelled | 🟠 The legacy VIP/agent segmentation (also `d1-phase-b-gap-map.md` §1) needs a home — `coID` drives a customer-visible badge + agent grouping. |
| Registration side-effects | creates `tb_wallet` + `tb_cash_back` rows | profile creation flow | 🟡 Verify a new Pacred profile gets the equivalent wallet (and cash-back, if that loop survives D1). |
| OTP gate | `tb_users_otp_hs`, 5/day | custom OTP, hashed, 3/hour, `OTP_BYPASS` dev flag | 🟡 Faithful intent; rate-limit numbers differ (legacy 5/day vs Pacred 3/hr) — align if staff/customers notice. |

---

## 6. Loop 6 — Wallet + yuan-transfer (ฝากโอน / Alipay)

### 6.1 Legacy

- **Wallet** — `tb_wallet` holds the running `walletTotal`; every movement is
  a `tb_wallet_hs` row. Topup (`wallet.php`) writes a `type='1'` pending row;
  withdraw writes a `type='3'` row and **decrements `walletTotal`** when
  approved (`UPDATE tb_wallet SET walletTotal = walletTotal − amount`).
  `tb_wallet_hs.type` families seen: `1`=topup, `2/4/6/7`=debits/spends,
  `3`=withdraw, `5`=free-shipping settle. `status` `1`/`2`/`3` =
  pending/success/fail (`statusWalletShopBadge`).
- **Yuan-transfer** — a **separate** table `tb_payment` (ฝากโอนชำระค่าสินค้า /
  Alipay transfer). `payment.php`: customer submits `payYuan`, `payRate`,
  `payTHB`, `payType` (`1` จ่ายผ่านเว็บไซต์จีน / `2` โอน Alipay ร้านค้าจีน /
  `3` อื่นๆ). Status `payStatus`: **`1` รอดำเนินการ / `2` สำเร็จ /
  `3` ไม่สำเร็จ** — a 3-state enum **distinct** from both the order and
  forwarder enums.

### 6.2 Pacred

- **Wallet** — `0007_wallet.sql`: `wallet_transactions` rows; `wallet.balance`
  is a trigger-maintained sum of `status='completed'` rows. Self-serve
  deposit / withdraw / history pages live. Overdraw + sign guards
  (`0064`, `0072`).
- **Yuan-transfer** — `0008_payment_yuan.sql` + `actions/payment.ts`.

### 6.3 Gap map — wallet + yuan-transfer

| Aspect | Legacy | Pacred | Gap → fidelity fix |
|---|---|---|---|
| Wallet ledger | `tb_wallet` total + `tb_wallet_hs` rows | `wallet_transactions` + trigger-summed balance | ✅ Faithful (Pacred's trigger-sum is cleaner than legacy's mutate-the-total). |
| Wallet movement types | `type` 1..7 numeric families | `kind` strings | 🟡 Verify every legacy `type` has a Pacred `kind` (topup, spend-order, spend-forwarder, withdraw, refund-to-wallet, free-shipping-settle). The `cReWallet` / refund-to-wallet path especially. |
| Withdraw flow | `type='3'` row + decrement on approval | self-serve withdraw + admin approve | ✅ Faithful intent. |
| Yuan-transfer status enum | `payStatus` **3-state** (`1` รอดำเนินการ / `2` สำเร็จ / `3` ไม่สำเร็จ) | `0008` `tb_payment`-equivalent | 🟠 **Confirm the yuan-transfer status enum is the legacy 3-state set** with the verbatim Thai labels — and that it is a *separate* vocabulary, not folded into the order/forwarder enums. |
| Yuan-transfer `payType` | `1`/`2`/`3` (web-CN / Alipay / other) | check `actions/payment.ts` | 🟡 Verify the 3 pay-type options + labels are preserved. |
| `certifiedTrueCopy` | legacy `tb_payment` column | — | 🟡 Minor — check if the certified-true-copy field is carried. |

---

## 7. Cross-cutting: status-rollback as a system-wide gap

The legacy `99`/`fStatusOld` rollback (§2.5) is the **forwarder** instance of
a system-wide capability the chat shows staff need everywhere:

- **A2** — "ถอยสถานะ" — no rollback on forwarders → can't fix a wrong rate.
- **A3** — paid-but-unpaid desync — needs a reconcile/correct action.
- **C1** — no refund path once a job is "preparing to ship".
- **C2** — bill-header (buyer name) not editable post-submit.

Pacred has the **audit half** (`forwarder_status_log`, status-change
triggers, `wallet_transactions` history) but not the **action half** (a
gated, audited "roll this back" / "correct this" operation). Phase B should
treat **"every status machine gets a rollback action, every rollback writes
an audit row"** as a single cross-cutting workstream — it is faithful to
legacy `99` *and* fixes the chat's top operational complaints. Pattern:
[ADR-0014](../decisions/0014-customer-self-service-state-transitions.md).

---

## 8. Phase-B fidelity priority order

Ordered by retraining cost + revenue risk (mirrors `d1-phase-b-gap-map.md` §6,
extended with the loop-logic detail above):

1. 🔴 **Restore the forwarder pay-point** (§2.3) — re-order + relabel
   `forwarders.status` so "await payment" is post-arrival; re-point
   `payForwarderFromWallet`; fold `billing-gate.ts` into the faithful machine.
   *This is the single highest-leverage fix — it is the loop ADR-0017 names.*
2. 🔴 **Restore the forwarder status vocabulary** (§2.4) — legacy warehouse-
   progress labels, slot-for-slot, incl. the `fStatusDriver` relabel of slot 6
   and the `fStatusCar*` sub-states.
3. 🔴 **Build the container-payment ledger** (§3.3) — the `tb_cnt` equivalent:
   slip image, amount, paid/unpaid badge, `tb_cnt_pay_*` fan-out. Keep
   `cargo_containers` as the logistics entity alongside it.
4. 🟠 **Reconcile the customer-facing status vocabularies** (§0 #4) — the
   customer should see legacy's **two** (order + forwarder), not three; demote
   or hide the `cargo_shipments` 8-state enum from customer surfaces.
5. 🟠 **Add the status-rollback action** (§2.5, §7) — the `99` park-and-restore
   for forwarders, generalised as a cross-cutting audited-rollback workstream.
6. 🟠 **Restore the printed-receipt numbering** `FRC{YYMM}-{NNNNN}-{N}` +
   **รวมบิล** multi-order consolidation (§4.3).
7. 🟠 **Member-code fidelity** (§5.3) — confirm `0067` keeps the legacy
   running integer 1:1 (`PCS10005`→`PR10005`, no re-padding) and member-code
   login works for migrated customers.
8. 🟠 **Warehouse scan auto-flip** (§2.6) — scan-complete auto-advances the
   forwarder; shelf-location capture; over/under box-count surfacing.
9. 🟡 **Verify the smaller faithful items** — shop-order 6-tab list, payment
   timer cron, yuan-transfer 3-state enum, wallet `kind` coverage, auto-1%-WHT
   on juristic pay.

---

## 9. Cross-references

- 🧭 **Menu / nav / visual gap map** → [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md)
  (the sibling of this doc — read both for Phase B).
- 📜 **The decision** → [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md) (D1).
- 🔬 **Decoded cargo ops + the problem catalog (A1-F3)** →
  [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
  — esp. A2 (rollback), A3 (paid desync), A6 (WHT), C1/C3, D1/D2 (CBM).
- 💬 **Chat-derived workflows + leak holes** →
  [`../audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md).
- 🚚 **Container-centric model design** →
  [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md).
- 🔁 **State-change audit pattern** →
  [ADR-0014](../decisions/0014-customer-self-service-state-transitions.md).
- 🗃 **Data migration runbook** → [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md).
- 🧠 **Phase-B backend prep / open questions** →
  [`poom-phase-b-prep.md`](poom-phase-b-prep.md), [`poom-d1-open-questions.md`](poom-d1-open-questions.md).

> **A note on Pacred's container model:** §3 flags the container mental-model
> divergence — but `cargo_containers` (a real logistics entity with ETA +
> status history + per-source CBM) is genuinely *better* than legacy's
> free-text `fCabinetNumber`, and the cargo-ops-forensics doc's D1/D2 work
> *wants* exactly that. Faithfulness here does **not** mean deleting
> `cargo_containers` — it means *also* reproducing the legacy `tb_cnt`
> payment-slip ledger so the accounting workflow has a home. Keep both;
> the entity is the logistics spine, the ledger is the money record.
