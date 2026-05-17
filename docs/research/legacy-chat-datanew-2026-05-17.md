# 📦 Legacy Chat R&D — `datanew` drop (decoded 2026-05-17)

> **Captured:** 2026-05-17, the eve of the Pacred production launch (2026-05-18).
> **Source:** a last-minute drop at `~/Desktop/datanew/` — 3 LINE chat `.txt`
> exports + 4 screenshots from the legacy **PCS Cargo** operation:
> `[LINE]ทีม IT PCS CARGO.txt` (the PCS IT-team group), `[LINE]Sys ระบบหลังบ้าน.txt`
> (the Pacred-build "backend" group — เดฟ/ก๊อต/ภูม/ปอนด์/ป๊อป), `[LINE]Jane💕🐳.txt`
> (a 1:1 between เดฟ and **Jane**, an accounting/admin staffer), and the 4 `messageImage_*.jpg`
> screenshots referenced in those chats.
>
> **What this doc is.** A *delta* on the existing R&D base — it captures only what
> is **NEW** vs the docs already in this folder. It does **not** repeat the
> single-dev-bottleneck / web-outage / OTP-SMS / split-`qty` material already
> decoded — those are confirmed-again here in one line each and cross-referenced,
> not re-explained.
>
> **Read alongside (this extends, does not duplicate):**
> [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) (DI-1..DI-16) ·
> [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) (the MOMO API decode this
> doc **corrects** — see §0.1 + §3) ·
> [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) (OT-1..OT-14) ·
> [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md) (the W-* backlog).
>
> **Pacred-identity guardrail.** The legacy operation leaned on gray-channel
> practice. Pacred is the legitimate, document-complete opposite. Everything below
> is an *operational* lesson (status visibility, billing reconciliation,
> integration shape, day-1 workflows) — **no compliance shortcut is proposed for
> porting.** See §6.

---

## §0. 🚨 LAUNCH-RELEVANT — read this tonight (launch is 2026-05-18)

The `datanew` drop **is not launch-blocking for the Pacred codebase itself** — it
contains no bug in `pacred-web`. But it contains **one hard correction and several
day-1 facts** the team is currently working from a *wrong* version of. Ranked:

### L-0 `[blocker-for-MOMO-wiring]` · 🔴 The MOMO API host + endpoint format on record is WRONG

**This is the single most important line in the drop.** `[LINE]Sys ระบบหลังบ้าน.txt`
line 449-457, posted by ป๊อป on **2026-05-17 13:48** (the launch eve), gives MOMO's
*actual* API surface:

```
[GET] https://api.momocargo.com:8080/api/func/get/import/track/{date}
      format date: 2025-12-23+2025-12-23
      example:  https://api.momocargo.com:8080/api/func/get/import/track/2025-12-23+2025-12-23

[GET] https://api.momocargo.com:8080/api/func/get/container/closed/{date}
      format date: 2025-12-23+2025-12-23
      example:  https://api.momocargo.com:8080/api/func/get/container/closed/2025-12-23+2025-12-23

      https://api.momocargo.com:8080/api/sack/get/info/CBX251111-EK04
```

Every existing Pacred doc — [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §2,
[`momo-jmf.md`](../integrations/momo-jmf.md), and by inheritance the
`lib/integrations/momo-jmf/` scaffold — says the host is
**`https://api-cn.alilogisticshub.com`** with a **`?api=<name>`** query-string
router. **That is wrong, or at best a second/older endpoint.** The truth from the
warehouse owner is:

| Field | Documented (wrong) | **Actual (from this drop)** |
|---|---|---|
| Host | `api-cn.alilogisticshub.com` | **`api.momocargo.com`** |
| Port | 443 (implicit) | **`:8080`** (explicit, non-standard) |
| Routing | `/?api=container-list` (query) | **`/api/func/get/<resource>/<...>`** (REST path) |
| Container-closed list | `?api=container-list` | **`GET /api/func/get/container/closed/{date}`** |
| Per-tracking import data | `?api=tracking-list&status=` | **`GET /api/func/get/import/track/{date}`** |
| Sack ("กระสอบรวม") detail | not modelled at all | **`GET /api/sack/get/info/{sackCode}`** — e.g. `CBX251111-EK04` |
| Date parameter | not specified | a **range**, format `YYYY-MM-DD+YYYY-MM-DD` (start `+` end, both inclusive) |

**Action — NOT a launch blocker for 2026-05-18 (the MOMO sync is post-launch
`W-4`), but a blocker the moment anyone wires `lib/integrations/momo-jmf/`:**
1. `momo-jmf-api-decoded.md` §2 and `momo-jmf.md` "Endpoint inventory (TBD)" must be
   **corrected to these three real endpoints** before any client code is written.
   The `?api=` decode in `momo-jmf-api-decoded.md` was reconstructed from an Angular
   shell with *zero embedded API data* (that doc says so itself, §0) — it was a
   best-guess and this drop supersedes it.
2. `MOMO_JMF_BASE_URL` = **`https://api.momocargo.com:8080`** (note the port).
3. The sync must call **two list endpoints** (`/import/track/{range}` for parcels,
   `/container/closed/{range}` for closed containers) **and** a per-sack lookup
   (`/api/sack/get/info/{code}`) — see §3 for why the sack endpoint is essential to
   billing reconciliation.
4. `MomoContainerStatus` (the 9-value enum in `types.ts`) — keep, the enum content
   is still corroborated; only the *transport* (host/path) was wrong.
5. The MOMO API works on **date ranges, not `updated_since`** — the sync's
   incremental-poll design must page by date window, not by a watermark timestamp.

### L-1 `[soon]` · 🔴 Day-1 customer demand is exactly two things: "status I can check" + "pay easily, get a bill"

ป๊อป states the launch bar **twice, plainly**, in `[LINE]Sys ระบบหลังบ้าน.txt`:
- 2026-05-16 11:08 — *"ขอ 2 อย่าง — สถานะ ตรวจสอบได้ · ชำระเงินได้ง่ายๆ ออกบิลได้"*
  ("I want 2 things: a checkable status, and easy payment that can issue a bill.")
- 2026-05-17 17:25 — the **exact day-1 billing workflow** he expects to be clickable
  the next morning (verbatim, decoded in §2.1): one button → debt notice + invoice
  to the customer → customer pays + attaches slip → staff (Jane) verifies
  date/time/amount on the slip → picks the bill no., saves → receipt is generated,
  printable by customer or staff.

**Launch implication:** the live system on 2026-05-18 must let a customer (a) see a
shipment status and (b) be billed → pay → get a receipt — **without a developer in
the loop.** Pacred-web already ships `/wallet`, `/shipments`, tax-invoice flow and
pay-from-wallet (per `STRATEGY.md` §9), so this is *covered* — but **§2.1 is the
acceptance script**: walk that exact 6-step flow on the deployed site tonight and
confirm each step has a real button. If the "one button → debt notice + invoice"
or the "verify slip → save → receipt prints" step is missing or broken, that **is**
a launch-day gap. This is the same need as master-strategy `R-1` (status board) +
the existing receipt flow — not new scope, but the drop pins it to a date.

### L-2 `[soon]` · 🟠 The PCS→Pacred customer migration is a launch-week task with a concrete spec

ป๊อป, `[LINE]Sys ระบบหลังบ้าน.txt` 2026-05-17 11:48, hands ก๊อต a customer-migration
job (decoded in §2.2): move the legacy PCS customers Pacred is taking over into the
Pacred system, **rewriting their member code from `PCS<n>` to `PR<n>`** (keeping the
number), and tell them "we rebranded". This **contradicts a standing Pacred
assumption** worth flagging tonight:

> `CLAUDE.md` DNA says member codes are `PR001`-running, **"NO compat with PHP
> `PCS<num>`"**. ป๊อป's instruction is *not* to keep `PCS` compat — it is a
> **one-time data migration that re-stamps** old `PCS1234` → `PR1234`. Those are
> different things; the Pacred rule still holds. But the migration is real, it is
> launch-week, and it means the `generate_member_code` trigger (migration 0060)
> must not collide with a backfilled block of `PR<n>` codes carried over from
> legacy `PCS` numbers. **Whoever runs the migration: reserve / offset the running
> sequence so a migrated `PR1234` and a freshly-generated `PR001` never clash.**

Not a 2026-05-18 blocker (it is launch-*week*), but the sequence-collision risk
should be checked before the backfill runs.

### L-3 `[soon]` · 🟠 The legacy billing/quote count is provably unreliable — Pacred must not inherit the reconciliation gap

The `datanew` screenshots are a **smoking gun**: MOMO and PCS disagree on container
volume/quantity on *every single container*, sometimes massively (see §3 — container
`GZS260516-2`: PCS total CBM **21.17** vs MOMO **14.56**, a **6.6 CBM / ~31%**
gap; tracking `1778894075` shows **40 boxes** at MOMO vs **60** at PCS). Billing ran
off whichever number a human typed. **Pacred-web's billing must be gated on a
reconciled figure** — this is master-strategy §3 "arrival→billing gate" (`W-3w`) and
`gap-revenue-flow` Stage 6, now with hard evidence. Not a 2026-05-18 code blocker
(cargo billing is staff-driven at launch), but the launch-day staff procedure
should be: **do not bill a cargo customer off the order-time estimate — bill off
the MOMO closed-container figure, and if they differ, reconcile first.**

### L-4 `[post-launch]` · 🟡 A "sack" / consolidation object (`กระสอบรวม`) is missing from the Pacred data model

The drop introduces a data entity no Pacred doc models: the **sack / consolidated
bag** (`กระสอบรวม`), with its own code namespace `CBX<YYMMDD>-EK<NN>` (e.g.
`CBX251111-EK04`, `CBX260511-EK07`) and its own MOMO endpoint
(`/api/sack/get/info/{code}`). A sack is a bag that bundles many small customer
parcels; MOMO measures the **outside of the bag**, PCS measures the **goods inside**
— this is reconciliation-gap root cause #1 (§3). Post-launch, the container model
([`container-centric-model.md`](../architecture/container-centric-model.md)) needs a
`sack` level between `container` and `shipment`. Tracked as a new item **DN-3**
below. Post-launch.

### L-5 `[post-launch]` · 🟡 Credentials + a raw JWT are sitting in these chat logs — rotate before/after launch

The drop **leaks live secrets in plaintext** (see §5): the `acc@pacred.co` /
`jutamanee.acc@pacred.co` mailbox passwords, a WordPress `admin_tam` / `123456`
login for `pacred.co/wp-admin`, the `axelra.global` document-mailbox password, and
the **same MOMO HS256 JWT** already noted in `momo-jmf-api-decoded.md`. None of these
are `pacred-web` (Supabase) credentials, so **not a 2026-05-18 blocker** — but
`pacred.co` (the WordPress marketing site) with `admin/123456` is a real exposure,
and any of these files reaching a repo or a wider channel is a breach. **Action:**
keep `datanew/` out of git (it is on the Desktop, fine); rotate the `pacred.co`
WordPress admin password this week; treat the MOMO JWT rotation per the existing
`momo-jmf.md` plan.

> **Net for tonight:** nothing here stops the 2026-05-18 deploy. The one urgent
> doc-correction is **L-0** (wrong MOMO API host/format on record — fix the two
> integration docs before anyone codes the sync). **L-1** gives the launch-day
> acceptance script — walk it on the deployed site. **L-2/L-3** are launch-week
> procedure notes. **L-4/L-5** are post-launch.

---

## §1. People & roles decoded (new names this drop adds)

The existing R&D docs name ไอแต้ม (Tam), BBOY, the owner ป๊อป, and the four Pacred
devs. This drop adds and pins down several more — useful because day-1 ops route
through them:

| Name in chat | Role decoded | Evidence |
|---|---|---|
| **Jane** (`Jane💕🐳`) | **Accounting / admin staff** at Pacred. Her email is `jutamanee.acc@pacred.co` (and the shared `acc@pacred.co`). She is the person ป๊อป names to **run the day-1 billing flow** — "เจน อัดหน้าจอ ตอนกดให้ลูกค้าชำระ" (2026-05-17). She maintains the **เบิกเงิน / payroll Google Sheet** (`[LINE]Jane💕🐳.txt` — "ชีทเบิก เด้งอีกแล้ว"). She also holds the company **bank-account + K-Shop QR** setup. | `[LINE]Jane💕🐳.txt` throughout |
| **Mark** (`Audit Warehouse Mark`) | **Warehouse audit** staff (PCS side). Files the "add this tracking", "add courier SPX/J&T/EMS/Flash/Lalamove", "change container to MOMO" tickets. | `[LINE]ทีม IT PCS CARGO.txt` |
| **Mew** (`AUDIT PCS - MEW`) | **PCS audit / CS** — handles withdrawals, the "change truck→sea" requests, container-number checks, fields registration failures. | IT chat |
| **But / Ploy** (`Sale-But PCS`, `Sale Ploy-PCS`) | **PCS sales** — the people who post customer complaints (login fails, receipt squares, missing options) into the IT group. | IT chat |
| **Koy** (`AUDIT ACC-PCS Koy`) | **PCS accounting** — co-owns withdrawal verification with Mew. | IT chat 2026-04-06 |
| **Pasit** (`Pasit` / "ภูมิ" / Poombaba) | Confirmed = **ภูม** the backend dev. Full name **Pasit Pappornpisit**, GitHub `skrttboy420`, email `Poombaba1441@gmail.com`. (Useful: ties the chat persona to the team brief.) | `[LINE]Sys`, `[LINE]Jane💕🐳` |
| **NAT** (`NAT💙` / `NAT🐱`) | **Accounting / HR / pricing** — added 2026-04-07, scope "บัญชี HR pricing". The person doing K-Shop QR identity verification (2026-05-17). | `[LINE]Sys` |
| **PRINCE / benz / Aong** | (already known) MOMO owner / ops — corroborated, not new. | — |
| **พี่บี (Khun B / ศบ.)** | The **Mukdahan border / customs partner**. Jane's note 2026-05-17 mentions "ยังไม่ได้สรุปแบ่งเงินพี่บี" — Khun B has a *revenue-share settlement* with the operation, run through the AX savings account. (Operational context only — not a Pacred port item.) | `[LINE]Jane💕🐳` 00:15 |

**Org fact (new, useful):** the Pacred build team's GitHub org is **`PCSCARGO`**,
repo **`pcspagesystemX`** (`[LINE]Sys` 2026-03-27). The legacy SQL was "ดูด"
(scraped) from the old system and handed to ภูม as `full_backup_advanced.json` to
reverse the table structure from. This confirms the Pacred schema was *derived
from* the legacy MySQL dump — relevant when reconciling enum/field names.

---

## §2. Workflows decoded

### 2.1 The day-1 billing flow — ป๊อป's exact acceptance script

`[LINE]Sys ระบบหลังบ้าน.txt`, 2026-05-17 17:23-17:25 — this is the **most
launch-relevant workflow in the drop**. ป๊อป describes, step by step, the billing
loop he expects live on 2026-05-18 (decoded + translated):

1. **One button → bill the customer.** Staff presses a single button; the system
   sends a *debt notice* (แจ้งหนี้) to the customer **and** produces an *invoice
   document* (ใบแจ้งหนี้). — *"มันกดปุ่มเดียวแจ้งหนี้ไปหาลูกค้าเลย และก็มีใบแจ้งหนี้ด้วย"*
2. **Customer pays + attaches slip.** The customer pays and uploads the transfer
   slip into the system.
3. **Staff verifies the slip.** Jane (named) checks the slip's **date / time /
   amount** against the bill. — *"เจนมันก็จะตรวจ สลิป วันที่/เวลา/ยอด"*
4. **Staff records it** — selects the **bill number**, saves.
5. **Receipt auto-generates.** On save the system issues a **receipt** (ใบเสร็จ)
   the customer can print from the web, or staff can print to keep as evidence.
6. (Implicit) the order/shipment is now settled.

ป๊อป also asks (17:23) whether the system *already has* a "แจ้งหนี้ / ใบแจ้งหนี้ /
ใบเสร็จ" surface and tells ภูม to "ลองเล่นจุดนั้นเลยนะ พรุ่งนี้" — i.e. **test that
exact path tomorrow**.

> **Pacred status:** Pacred-web ships a tax-invoice flow + pay-from-wallet +
> receipt PDF (`STRATEGY.md` §9 — "tax-invoice flow ครบ", "pay-from-wallet
> self-serve"). The flow above is *covered in shape*. The launch action is **not
> to build** — it is to **walk steps 1-6 on the deployed site tonight** and verify
> each has a working control. The slip-verification step (3-4) is the one most
> likely to be thin — confirm a staff user can open a customer-uploaded slip, see
> date/time/amount, and that "save against bill no." flips the invoice to paid +
> renders the receipt. This is the launch acceptance test for the money path.
> Matches master-strategy `R-1` + the existing receipt flow; no new ticket — but
> **walk it**.

A separate but related ป๊อป ask (2026-05-17 12:31): *"ระบบชำระเงิน อัติโนมัตราคาคิด
ยังไงครับ (ขอแบบแมนน่วลไว้ด้วย)"* — he wants the auto price-calculation **and a
manual override** kept side by side. This is exactly the legacy "manual add/subtract
button beside the rule" pattern (DI-16 / fuel surcharge). Pacred's billing UI must
keep a **manual amount-override** next to any computed total. Fold into the existing
rate-engine work (master-strategy, `R`-series) — re-confirmed, not new.

### 2.2 The PCS→Pacred customer migration — the launch-week data job

`[LINE]Sys ระบบหลังบ้าน.txt`, 2026-05-17 11:48 (ป๊อป → ก๊อต), decoded:

- Pacred is **splitting the legacy customer base** with ป๊อป's brother — some
  customers stay "PCS", some come to "Pacred" (the split ป๊อป first set on
  2026-04-28: *"แยก = pcs กับ Pacred ไปดูแล"*).
- The customers assigned to Pacred must be **moved wholesale into the Pacred
  system**, and **their member code re-stamped `PCS<n>` → `PR<n>`** keeping the
  number. — *"แก้ไขรหัสเดิมของเขา จากPCS เป็น PR แค่นั้น"*
- Customers get a **rebrand notice** ("เราจะแจ้งลูกค้าว่าเรารีแบรน").
- ป๊อป wants **all** of them moved if possible, so sales can phone-follow them.
- ป๊อป also re-states "เชื่อม API momo — แต้ม Ari" — the MOMO API wiring is on the
  same launch-week list.

This is the operational backdrop to L-2. **It does not change the Pacred
member-code rule** (`PR`-running, no `PCS` compat) — it is a one-off backfill that
*translates* old codes. The only technical caution is the sequence collision noted
in L-2.

### 2.3 "ขีด 2" — the split-tracking convention, now stated as a rule by the China side

The existing docs (DI-6, momo decode §7.2) note split parcels get a `-N` suffix.
This drop **upgrades that from an observation to an explicit operating rule** and
exposes its weakness. ไอแต้ม, 2026-04-05 19:53: *"แทรคที่แยกมา 2 โกดังผมขอเป็นแยก
รายการนำเข้าเป็น ขีด 2 นะครับ"* — when one customer's tracking is split between the
**old warehouse and MOMO**, it becomes two import rows, the second suffixed `-2`
("ขีด 2" = "dash 2").

Jane's note (`[LINE]Jane💕🐳.txt` 16:24, quoting ไอแต้ม) states the **failure mode
precisely** — and it is a *new, sharper* articulation than DI-6:

> *"แทรคกิ้งนั้น ปิดแบบแยกตู้กันมา อันนี้จะสร้างแทรคเป็น - คั่นไปก่อน แต่เสี่ยงที่เวลา
> ปิดตู้ถัดไปแล้วรายการจะไม่เจอ ต้องมีคนเช็คทุกครั้งที่ปิดตู้ว่าจำนวนคิวตรงกันไหม
> เพราะ หากเช็คหลังจาก momo วางบิล หากทาง pcs เก็บเงินลูกค้าไปแล้ว จะแยกออเดอร์เพื่อ
> ให้ตรงตามจำนวนคิวของตู้ไม่ได้"*

Decoded: when a tracking splits across containers, the system makes a `-2` row **as
a placeholder**. But when the *next* container closes, the system **cannot
re-associate** the `-2` row to it automatically — a human must check, **every time
a container closes**, that the quantities still line up. And the killer:

> **Once MOMO has billed and PCS has already collected money from the customer, you
> can no longer split the order to match the container's true quantity.**

i.e. **the order is effectively frozen at the moment of payment**, and any
quantity correction after that is impossible. ไอแต้ม even asks BBOY directly
(`[LINE]Jane💕🐳.txt`): "ถ้าผมสร้างเป็น `1778894075-2` ผมไม่แน่ใจนะว่าทำไงต่อให้
ทราบว่า เวลามีปิดตู้ถัดไป แล้วผมเชื่อมรายการได้" — *the dev himself does not know how
to re-link a `-2` row to its later container.*

> **NEW Pacred item — DN-1 (see §4).** This is more than DI-6's "model `expected/
> received_qty`". It is a **split-tracking re-association** problem: a `-N` shipment
> row must carry a *deferred link* to a container that may not exist yet, and the
> billing model must allow a **quantity correction after payment** (a post-bill
> adjustment / split), or it must **block billing until all of a tracking's splits
> are container-assigned**. Pacred's container model has no concept of a
> not-yet-linked split-shipment placeholder.

### 2.4 The four canonical causes of "quantity doesn't match" — a gift of a checklist

Jane's note (`[LINE]Jane💕🐳.txt` 16:24) reproduces ไอแต้ม's own root-cause list for
why **MOMO's billed quantity ≠ PCS's quantity** at v> billing time. This is the
single most useful artifact in the drop — it is the **complete failure taxonomy**
for cargo billing reconciliation, straight from the person who lived it. Decoded:

1. **กระสอบรวม (consolidated sacks).** PCS measures by the size of the *goods
   inside* the sack; MOMO measures the *outside of the sack*. → systematic CBM
   disagreement. (→ DN-3, the sack object.)
2. **MOMO has no container number for a tracking, but a LINE query found one.**
   The data is incomplete in the API; the real container no. exists but only as a
   chat message. Sub-note: *"แต้มน่าจะเจอแล้ว มาจากใน api กระสอบส่งเป็นเลข CG มา
   แต้มต้องเอาไปแปลงเป็นแทรคกิ้ง"* — **the sack API returns parcels as `CG`-prefixed
   codes that must be translated back into real tracking numbers.** (→ DN-2.)
3. **Split-tracking (`ขีด`) rows that lose their link** on the next container close
   — the §2.3 problem. (→ DN-1.)
4. **Size disagreement / customer-disputed size** that PCS then *edited* in its own
   system — so PCS's record no longer matches MOMO's. (→ the §3 reconciliation gate,
   `W-3w`.)

> **Use this list directly.** These four are the acceptance criteria for any
> Pacred "container reconciliation" feature: a reconciliation view must surface,
> per container, (1) sack-inside-vs-outside CBM deltas, (2) parcels MOMO can't
> place in a container, (3) split `-N` rows whose link is stale, (4) shipments
> whose dims were edited PCS-side after the MOMO figure arrived. This *is* the
> spec.

### 2.5 Smaller workflow facts (new, one line each)

- **"ปิดตู้" produces a per-container Google-Drive folder.** ไอแต้ม (`[LINE]Jane💕🐳`
  16:24): *"ผมจะมีไฟล์แบบนี้ให้ทุกครั้งที่ปิดตู้นะครับ"* + a Drive share link. This
  is DI-14 ("no central file store") seen as the *workaround* — every close drops a
  Drive folder. Pacred's per-container documents bucket (DI-14 fix) replaces this.
- **Transport-mode change is a real per-shipment event with a price consequence.**
  IT chat 2026-04-07: "ถ้าต้องการเปลี่ยนทางรถมาเรือ ต้องหมายเหตุตรงไหน". And
  2026-05-17 13:22 ไอแต้ม: a sack `CBX260511-EK07` from truck container `GZE260512-1`
  **had to move to sea container `GZS260516-2`**, and he asks an admin to "**กดอัปเดต
  เปลี่ยนเป็นราคาทางเรือให้ลูกค้า**" — the customer was originally quoted truck rate
  and must be **re-priced to sea rate**. Confirms `momo-jmf-api-decoded.md` §3.1
  ("mode mutable mid-flight") and adds: **a mode change must re-trigger pricing.**
- **Wood-crating ("ตีลังไม้")** is a per-tracking flag requested at order time (IT
  chat 2026-04-07) — corroborates the `crate` field already in the momo decode §6.2.
- **"กระสอบรวม CG → tracking" translation is a known dev chore.** ไอแต้ม 2026-05-17
  13:37: *"กระสอบรวมมีบางรายการทาง momo ใส่เลข CG มา ทำให้รอบแรกตกหล่นไป 3 แทรค"* —
  the CG-code translation step **silently dropped 3 trackings** on the first pass.
  → DN-2.

---

## §3. The screenshots decoded — hard evidence of the billing-reconciliation gap

The 4 `messageImage_*.jpg` files are the **evidence base for L-3**. Decoded:

### 3.1 `messageImage_1779002628487.jpg` — a MOMO "Shipment Report" Excel

An Excel titled `gzs-260516-PCS-cd7f8a3f6e397a3fa34a95e4.xlsx`, sheet "Shipment
Report", first column header **`Container Name` = `GZS260516-2`**. Rows are
individual parcels: `Trans` (all "EK"), `Branch` ("PCS"), `Product` (Chinese names),
`Dum Type` (`普通/拼A` style cargo-type strings), `Code` (`PCS<n>` customer codes),
`Tracking`, weight/volume columns, and a **`CG.` column** holding `CG7840...`-style
codes. **This is the raw MOMO closed-container export** — and it confirms §2.4
point 2: every parcel carries a parallel **`CG` code** alongside its real tracking.
The filename's ObjectId-style hash (`cd7f8a3f...`) again signals MOMO's MongoDB
backend.

### 3.2 `messageImage_1779002711810.jpg` — the "ข้อมูลเทียบตู้ PCS x MOMO" reconciliation sheet

A Google Sheet literally named **"ข้อมูลเทียบตู้ PCS x MOMO"** ("PCS × MOMO
container-comparison data"). Columns:
`เลขตู้ | จำนวนคิวที่ momo วางบิล | จำนวนคิวจากไฟล์ Packing list | จำนวนคิวจาก PCS |
จำนวนคิวจาก PCS หากปรับปรุงรายการแยกตู้ | หมายเหตุ`
— i.e. **"container no. | quantity MOMO billed | quantity from the packing list |
quantity from PCS | quantity from PCS if the split-container rows are adjusted |
notes"**. Five different quantity figures for one container. The rows:

| Container | MOMO billed (CBM) | from PCS (CBM) | gap |
|---|---|---|---|
| `GZE260422-1` | 21.281817 | 31.40671 | **+10.1** |
| `GZE260424-1` | 13.603308 | 13.603308 | 0 (matched) |
| `GZE260426-1` | 21.094256 | — | — |
| `GZE260427-1` | 23.066734 | 23.066734 | 0 (matched) |
| `GZE260429-1` | 33.122612 | — | — |
| `GZE260503-1` | 32.099464 | — | — |
| `GZE260505-1` | 20.563485 | — | — |
| `GZS260414-1` | 0.610543 | — | — |
| `GZS260417-1` | 4.538242 | — | — |

The same screenshot also shows a **hand-written ledger photo** of the identical
containers with a **third, hand-jotted CBM column** ("CMB/KG") — `GZE260422-1`
hand-written `31.40671` vs sheet-MOMO `21.281817`. The figures *do not agree across
sources*, and the operation keeps a **manual three-way comparison sheet** just to
reconcile them. This is `OT-10` (manifest CBM never reconciles) and the
`momo-jmf-api-decoded.md` "CBM reconciliation" point, now with a real artifact.

### 3.3 `messageImage_1779005236166.jpg` — the per-tracking diff for container `GZS260516-2`

The most damning screenshot. A side-by-side **MOMO vs PCS per-tracking table** for
container `GZS260516-2`, columns `Main Tracking | Total Parcel | Total Wt. | Total
Vol.` for **each side**, plus `Diff`, `Total boxes of tracking`, `Diff boxes of
tracking`, `Create New Track`. Decoded highlights:

- Container totals: **MOMO 183 parcels / 3,241 kg / 14.56 CBM** vs
  **PCS 4,661.5 kg / 21.17 CBM** — `Diff` **−6.60 CBM** (PCS over-counts CBM by
  ~31%), and a **boxes diff of −56**.
- Tracking **`1778894075`**: MOMO **40 boxes, 860 kg, 3.20 CBM** vs PCS **60 boxes,
  1,290 kg, 4.80 CBM** — a **20-box / 1.6-CBM** gap. The `Create New Track` column
  says **`1778894075-2`** → this tracking is being **split** (the §2.3 "ขีด 2"
  mechanism), and the diff is the part that belongs to a different container.
- Tracking **`1778829409`**: MOMO 4 boxes vs PCS 40 boxes — `Diff boxes -36`,
  `Create New Track` = `1778829409-2`.
- Most rows have `Diff` ≈ `0.000002` (floating-point noise) — i.e. **most parcels
  *do* match**; the gap is concentrated in the 2-3 trackings that need splitting.

**This is the clean proof for L-3 and DN-1.** When everything is keyed right the
numbers match to rounding error; the entire CBM/box discrepancy comes from a
*handful* of split trackings whose `-2` rows are not yet associated to their other
container. Bill off the un-reconciled PCS figure and you over-charge the customer by
~31%; bill off MOMO's and you under-collect. The reconciliation must happen
**before** billing, and it must be **tracking-level**, not container-level.

### 3.4 `messageImage_1779005257738.jpg` — the legacy customer "track my shipment" UI

A screenshot of the **legacy PCS `forwarder-search` result page** for tracking
`1778894075` — and it is a useful reference for what Pacred's customer-side tracking
should *at least* show. One result row, status banner **"กำลังส่งมาไทย"** (in
transit to Thailand), columns:
`วันที่สร้าง | ตู้สินค้า | รหัสสมาชิก | แทร็กกิ้ง | ประเภท | RMB(¥) | กว้าง | ยาว |
สูง | จำนวนชิ้น | KG รวม | CBM รวม | การขนส่ง | รูป | รายละเอียด`.
The decoded values: created `16/05/26`, container **`GZS260516-1`**, member
`10643`, type **`A` ทั่วไป** (the `A` cargo-type badge — confirms the A/M/X/O/Z
type system), dims `50×40×40`, `1` piece, `1,290 kg`, **`4.8000` CBM**, transport
badge **"รถ EK"**, plus thumbnail + detail icons.

> **Two cross-checks this screenshot gives for free:**
> 1. The customer-facing record shows **CBM `4.8000`** and **container
>    `GZS260516-1`** — but the §3.3 diff table shows MOMO has this tracking at
>    **3.20 CBM** and being split into `-2` for `GZS260516-2`. **The customer is
>    looking at the un-reconciled, over-stated number.** Pacred's "track my
>    shipment" page (master-strategy `R-1` / `legacy-chat-ops-transport` P0-3) must
>    show the *reconciled* figure, or it reproduces this exact defect customer-side.
> 2. The transport badge says **"รถ EK"** (truck) while the container code is
>    **`GZS...`** (the `S` = sea). This is `momo-jmf-api-decoded.md` §7 bug 4
>    ("status ≠ container number — truck vs sea mismatch") **caught live in a
>    screenshot.** Pacred must validate `transport_mode` against the `GZE`/`GZS`
>    prefix and refuse/flag the contradiction (the goods may genuinely have been
>    re-routed truck→sea per §2.5 — in which case the *mode* and *price* should
>    have been updated and weren't).

---

## §4. New build items this drop adds (DN-series)

Numbered `DN-` (DataNew) to stay distinct from `DI-`/`OT-`/`R-`/`W-`. These are the
**genuinely new** items; everything else in the drop corroborates an existing item
(cross-referenced inline above). Fold into [`PORT_PLAN.md`](../PORT_PLAN.md) Part V /
Part W when scheduling.

| ID | Sev | Item | Why it's new | Cross-ref |
|---|---|---|---|---|
| **DN-1** | 🟠 P1 | **Split-tracking (`-N`) re-association + post-bill quantity correction.** A `-N` shipment row must hold a *deferred* container link (the second container may not exist yet) and the system must re-link it automatically when that container later closes. Billing must either (a) allow a quantity correction *after* payment, or (b) **block billing of a tracking until all its `-N` splits are container-assigned**. | DI-6 only said "model expected/received qty". The drop shows the real problem is **re-association across a future container-close** + the **"can't fix it after payment" trap** — a different, harder requirement. §2.3, §2.4(3), §3.3. | extends DI-6, `gap-revenue-flow` Stage 6, master-strategy `W-3w` |
| **DN-2** | 🟠 P1 | **`CG`-code ↔ tracking-number translation table.** MOMO's sack/API returns parcels under `CG<n>` codes; they must be translated to the real China-courier tracking number before they can be matched to a PCS order. The legacy manual translation **silently dropped 3 trackings** in one pass. Pacred needs a stored `cg_code → tracking_no` map populated from the sack endpoint, and a sync that **counts in vs out** and flags any CG code it could not resolve. | No Pacred doc mentions `CG` codes at all. It is a concrete, lossy data-shape quirk of the real MOMO API. §2.4(2), §2.5, §3.1. | new; feeds the `W-4` MOMO sync |
| **DN-3** | 🟡 P2 | **A `sack` / consolidation entity in the data model.** Code namespace `CBX<YYMMDD>-EK<NN>`. Sits between `container` and `shipment`: one sack bundles many parcels; it has its own MOMO endpoint (`/api/sack/get/info/{code}`); MOMO bills by the **sack exterior** CBM while PCS counts the **goods interior** — the #1 reconciliation gap. Model the sack so the inside/outside CBM delta is a *stored, visible* number, not a surprise at billing. | The "sack" level is entirely absent from [`container-centric-model.md`](../architecture/container-centric-model.md). It is a real third tier of the cargo hierarchy. §0.L-4, §2.4(1), §3.1. | extends `container-centric-model.md`; new |
| **DN-4** | 🔴 (doc) | **Correct the MOMO API host + endpoint format in the two integration docs** before any sync code is written. Actual: `https://api.momocargo.com:8080`, REST paths `/api/func/get/import/track/{range}`, `/api/func/get/container/closed/{range}`, `/api/sack/get/info/{code}`; date param is a `YYYY-MM-DD+YYYY-MM-DD` range. | The documented `api-cn.alilogisticshub.com/?api=` surface is wrong (it was reconstructed from a data-less Angular shell). This drop has the owner-supplied truth. | §0.L-0; corrects `momo-jmf-api-decoded.md` §2, `momo-jmf.md` "Endpoint inventory" |
| **DN-5** | 🟡 P2 | **A container-reconciliation view** whose acceptance criteria are ไอแต้ม's 4-cause list (§2.4): per container, surface (1) sack inside-vs-outside CBM deltas, (2) parcels with no container / unresolved CG codes, (3) stale `-N` split rows, (4) shipments edited PCS-side after the MOMO figure landed. The "ข้อมูลเทียบตู้ PCS x MOMO" Google Sheet (§3.2) is the artifact this replaces. | The existing "CBM reconciliation" mention (`momo-jmf-api-decoded.md`, `OT-10`) is generic. The drop hands a **complete, field-tested 4-point spec** + a real screenshot of the manual tool. | extends `OT-10`, master-strategy `W-3w` |

**Re-confirmed (NOT new) — listed so the team knows the drop *strengthens* these,
not adds to them:** single-dev bottleneck = DI-1 (every "add SPX/J&T/EMS/Flash/
Lalamove courier", "fix WHT receipt FRC2604-00039", "fix Thai-squares receipt for
PCS10366 Bang Khun Thian", "unlock one-off withdrawal", "re-key container
HSDU9869601→GZE260420-1" ticket in the drop is DI-1 again) · ~20 "เว็ปล่ม" outages
= DI-2 (the drop adds 09 Apr, 20 Apr×3, 22 Apr×2, 24 Apr×2, 27 Apr, 05-08 May
several, 12 May×4, 15 May×2 — all the same `TISO Tech Solutions` "รอ 1-2 นาที" bot)
· OTP-SMS silent registration failure = DI-3 (the 22-24 Apr "สมัครไม่ได้ →
ต้องเติม sms" thread + 15 May "ใส่รหัสเกิดล้มเหลว" PCS10834) · split-`qty`/`qty=1`
= DI-6 · desktop-login-ambiguous-identifier = DI-11 (PCS10251 "เข้าระบบในคอมไม่ได้",
ไอแต้ม asks "เบอร์โทรศัพท์หรือ รหัสสมาชิก") · China-product-link incomplete options
= DI-10 (PCS, 06 May) · the multi-line bulk tracking-search URL
(`forwarder-search-muti.php?fTracking=AAA%0D%0ABBB...`) = DI-12 (used twice in the
drop) · fuel surcharge ฿100/CBM as a manual button = §4.4 of the dev-it doc.

---

## §5. Secrets / credentials exposed in the drop (rotate — see §0.L-5)

For completeness and so the team can act. **None are `pacred-web` / Supabase
credentials.** All appear in plaintext in the chat exports:

| Secret | Where | Action |
|---|---|---|
| `acc@pacred.co` / `Pacredacc40x.` (shared accounting mailbox) | `[LINE]Jane💕🐳.txt` 2026-04-26 | rotate; it is a live mailbox doing "ส่งสายเรือ คุยลูกค้า" |
| `jutamanee.acc@pacred.co` / `gNPK3nL*` then `DE2qSj<5LCXN8mD*` (Jane's mailbox) | `[LINE]Jane💕🐳.txt` 2026-04-20, 04-22 | rotate |
| `pacred.co/wp-admin` — user **`admin_tam`**, password **`123456`** | `[LINE]Sys` 2026-05-03 22:20 | **rotate this week** — trivially weak admin on the live WordPress marketing site |
| `axelra.global` document mailbox — `document@axelra.global` / `PGC%)ZC67yk%Vp*KA1o0Jq@8` | `[LINE]Sys` 2026-04-30 | legacy AXELRA system; rotate per the PCS-scrub timeline |
| MOMO HS256 JWT (`eyJhbGci…user_id:68…`) | `[LINE]Sys` 2026-05-14 | already known (`momo-jmf-api-decoded.md` §2.3); rotate per `momo-jmf.md` plan |
| `K-Shop` QR / K-biz company-bank linkage in progress | `[LINE]Jane💕🐳.txt` 2026-05-17 | not a credential leak, but note: company payment QR was **still being verified the day before launch** — confirm the PromptPay/K-Shop QR the live site shows customers is the *correct, verified* one |

**Company banking facts (operational, from `[LINE]Jane💕🐳.txt` 2026-05-16/17):**
Pacred's bank account = **Kasikorn (KBank) `225-2-91144-0`, "บจก. แพคเรด (ประเทศไทย)"**,
tax ID `0105564077716` (matches `CLAUDE.md` / `site.ts`). There are **both a savings
and a current account**; the savings account was historically the **AXELRA** in/out
account and "ยังไม่ได้สรุปแบ่งเงินพี่บี" (the Khun-B revenue split is unsettled on
it). **Launch note:** make sure the account shown to customers for transfers is the
**Pacred company account**, not the legacy AXELRA savings account.

---

## §6. Pacred-identity guardrail (restated for this drop)

The `datanew` chats are a legacy-operation record and they show the same
gray-channel context the earlier R&D flagged — most visibly in `[LINE]Sys` where
ป๊อป himself frames the *destination*: *"บริษัทเราจะยกระดับถูกต้องได้ 100% หมดปัญหา
พวกแกล้งตำรวจ… เพราะกลุ่มลูกค้าก็ต้องการเอกสารที่ถูกต้องเช่นกัน"* and *"ระบบที่ฝากสั่ง
เก็บ VAT 100% ลงใบขนถูกต้อง ชัดเจน"* (2026-04-19). Pacred's stated identity is the
**legitimate, full-VAT, document-complete** operation — the legacy system is the
thing being *retired*.

**Everything captured in this doc is an operational lesson, not a shortcut:**
- DN-1..DN-5 are about **billing-figure accuracy, status visibility, and integration
  data shape** — getting the customer billed the *correct* amount for the *actual*
  goods. That is the legitimate path.
- The reconciliation work (DN-5, §3) exists precisely so Pacred bills the **true,
  document-supported** CBM — the opposite of declared-value engineering.
- No piggyback-declaration, no `เหมาภาษี`, no HS-code-dodging, no two-track tax
  figure is proposed or ported. Those remain in the legacy system. Where the drop
  touches money or documents, the Pacred build is the **fully-audited, fully-
  documented** version only.

---

## §7. Cross-references

- 🛠 Dev/IT chat decode (DI-1..DI-16, MOMO §3, HS/VAT desk §4.3) →
  [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) — this drop
  **re-confirms** DI-1/2/3/6/10/11/12 and **adds** the DN-series.
- 🤝 MOMO API decode this doc **corrects** (host/path/format) →
  [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §2 + §0.L-0 above ·
  partner spec to fix → [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md).
- 🚚 Ops/transport decode (OT-1..OT-14, the "ของอยู่ไหน" relay, OT-10 CBM) →
  [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md).
- 🎯 Master strategy — DN items fold into the `W-3w` reconciliation/billing-gate
  and `W-4` MOMO-sync workstreams → [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md).
- 🏗 Container data model DN-3 (the `sack` tier) extends →
  [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md).
- 📋 Task scheduling — fold DN-1..DN-5 into → [`../PORT_PLAN.md`](../PORT_PLAN.md)
  Part V (cargo) / Part W (gap-hunt).
- 🛑 Don't scrub legacy PCS/TTP/AXELRA refs before API switchover →
  [`../runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md).

**End — `legacy-chat-datanew-2026-05-17.md`.** The launch-relevant headline: the
MOMO API host/format on record is wrong (L-0 / DN-4 — fix the docs), the day-1
billing acceptance script is §2.1 (walk it on the deployed site tonight), and the
billing-reconciliation gap is now backed by hard screenshots (L-3, §3). Five new
build items DN-1..DN-5; everything else corroborates the existing R-/DI-/OT- base.
