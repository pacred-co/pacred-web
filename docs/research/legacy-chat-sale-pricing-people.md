# Legacy Chat Research — Sales · Pricing · Audit · People

**Date:** 2026-05-17 · **Auditor:** Claude R&D sub-agent
**Source:** ~20 LINE chat exports (Oct 2025 → May 2026) — sales follow-up, AX Pricing+SALE+Doc, AXELRA rate-check, audit, HR, marketing, per-person DMs.
**Scope:** how pricing/quotes worked · sales follow-up + leak points · audit findings · people/HR friction.

> **Companion docs — extend, don't repeat:** [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) (the MOMO/cargo-ops chat audit — leak holes L-1..L-10, MOMO status enum, workflows W-1..W-9). This doc covers the **other** chat corpus: the freight/pricing side (AXELRA/NNB), the sales process, the auditors, and the human/HR layer that the prior audit did not touch.

---

## 1. Summary

The legacy operation ran **three brand fronts off one team**: **AXELRA** (เฟรท — proper FCL/LCL freight, customs declaration, tax invoice) · **NNB / "เหมาภาษี"** (gray-channel "all-in tax-included" import, no documents to customer) · **PCS Cargo** (China shopping/transfer cargo). Pacred is the consolidation of all three.

The whole quote-to-cash pipeline was **a LINE group acting as a CRM**. Every quote was a hand-typed multi-field block; pricing was assembled by 3 separate roles each filling a slice; the owner (พี่ป๊อป / `Pop_visit`) personally gate-kept rates, personally chased leads, and personally re-typed quotes at night. There was **no system** — the "system" was พี่ป๊อป's attention, a stack of Google Sheets, and a brittle PHP backend. When he was busy, deals stalled.

The dominant, repeated owner instruction: **"สู้ทุกเรท เพื่อให้ได้งาน — งานหลุดทั้งยวง"** (match every rate or lose the whole pipeline) and **"ตอบเร็ว / อย่ารอ / งานถ้ารอไม่ได้งาน"** (speed wins, waiting loses). Slow quotes were the #1 self-diagnosed leak. The team was openly in **"ลองผิดลองถูก"** mode — owner's words: *"แบบนี้ลงทุนแต่ละระบบไม่ต้องเสียเงิน เราลองผิดลองถูกได้"*.

---

## 2. Pricing / quote model decoded

### 2.1 The quote object (the real "schema")
Every freight quote in the AX Pricing chat was a fixed text template. Decoded fields:

```
✅ AXELRA / NNB  <IMPORT|EXPORT>   ← brand front decides doc behavior
Order = YYMMDD-NNN                ← date-prefixed running number (loose, often skipped)
TERM   = EXW | FOB | CIF | DDP     ← Incoterm; also "DDP เหมาภาษี" = NNB gray mode
SEA/AIR/TRUCK + FCL 20/40 | LCL    ← mode
AGENT / CONSIGNEE
SALE block:    POL, POD, goods name, sender addr, receiver addr, INV+PACKING (มี/ไม่มี)
               D/O, RENT, "ราคาที่นำเสนอ" (offered), "ราคาที่ต้องการ" (target)
DOC/AUDIT block: พิกัด (HS code), ใบอนุญาต (permits), Status, transport, ภาษี (tax)
PRICING block:  เจ้าหน้าที่ (officer/clearance fee), ค่าขนส่ง (TH transport), ค่าเฟรท
→ output: "ราคาสุทธิที่ขาย" or "ใบเสนอราคาชั่วคราว" (provisional quote)
```

**This template is the de-facto spec for Pacred's freight quote builder.** It already separates SALE / DOC / PRICING responsibilities — port it as form sections, not free text.

### 2.2 Who set prices — a 3-role relay (the bottleneck)
Pricing was deliberately **split across three roles**, each owning part of one quote (พี่ป๊อป, 2026-10-27):

| Role | Fills | Notes |
|---|---|---|
| **SALE** (Bam, Fon, May, Best) | D/O fee, RENT (port demurrage), offered price, target price | front-line, talks to customer |
| **DOC / AUDIT** (Win) | HS code (พิกัด), permits (อย./มอก./เกษตร/กสทช.), tax estimate, "should we clear with officer?" | the HS-code brain |
| **PRICING** (Web, Gus, Nan, Mind) | clearance-officer fee, overseas freight (EXW/FOB), TH transport | talks to freight agents + truck partners |

A quote was only "done" when all three filled their slice. **In practice this serialized everything** — the chat is full of `@Pricing ขอราคา`, `@AUDIT ขอพิกัด`, `ขอราคาในวันนี้ได้ไหมคะ ลูกค้าตามค่ะ`. Round-trips of hours-to-a-day per quote. The owner kept escalating: *"งาน CIF ต้องได้งาน"* x3, *"เซลต้องตามงานนะ ราคาเจ้าหน้าที่ CIF มันง่ายมาก ต้องเร่ง"*.

### 2.3 Rate sources (where numbers came from)
- **Overseas freight (per-port CBM/KGM):** a fixed China-port → BKK price table pasted into the group periodically (Xiamen 20'฿15k/40'฿25k · Shenzhen 20'฿8k · Guangzhou 20'฿8k · Tianjin 20'฿25k, etc). Provisional only — "กรุณาระบุ PORT".
- **Cargo (China→TH) rate card** (พี่ป๊อป, NNB mode):
  - กว่างโจว: ทั่วไป รถ ฿5,000/21 · เรือ ฿3,000/12 · พิเศษ รถ ฿7,000/40 · เรือ ฿5,000/30
  - อี้อู: ทั่วไป รถ ฿5,500/23 · เรือ ฿3,500/12 · พิเศษ รถ ฿7,500/40 · เรือ ฿5,500/30
  - Conversion rule: **1 CBM = 300 KGM** (volumetric).
- **Truck head-haul (หัวลาก):** quoted ad-hoc by external partners (คุณแบงค์/KMC, NINE SPEED/คุณนา) per LINE — "Laem Chabang → X = ฿10,500, +฿1,000 if >25 tons", port-surcharge "C3 +฿2,000". 100% relationship pricing, no rate table; partner is paid per shipment, 1% withholding deducted.
- **Yuan transfer rate:** **owner-only**. "ต่อไปนี้ เรทหยวนขอที่พี่เท่านั้น" (2026-04-18). Example: 60,000 RMB × 4.8 = ฿288,000.
- **Clearance-officer fee (ค่าเจ้าหน้าที่ / "ราคาเจ้าหน้าที่"):** negotiated per shipment with customs officers — "5,000×3", "30,000–60,000 เพื่อเคลียร์ออก". This is the gray-zone cost; see §4.

### 2.4 Margin model — owner-controlled floor + "add ฿200 to everyone"
- Margins were **not formula-based**. The owner set them by decree:
  - "อย่าลืมบวกทุกเจ้า 200 นะ ... ต้นทุนมาสูงมากตอนนี้" (2026-04-17) — a blanket ฿200 markup ordered company-wide overnight.
  - Fuel surcharge ฿100/CBM (per the prior audit's policy log).
  - Floors/ceilings dictated ad-hoc: "แจ้งลูกค้า 4900 ได้ไหม 4700 ไม่ได้แล้ว".
- SALE was given **discretion to discount within a table** ("SAlE สามารถลดราคาได้ตามตารางที่บริษัทกำหนด") — but the table lived in พี่ป๊อป's head / a Google Doc, not a system.
- The quote carried **two numbers** — `ราคาที่นำเสนอ` (what we float) vs `ราคาที่ต้องการ` (target net) — and an explicit `Idea rate` vs `ที่ขายลูกค้า` (e.g. idea 135k / sold 155k → settled 145k). **Negotiation headroom was a first-class field.**
- NNB gray-mode quotes: owner said **don't even send a quotation doc** — "ส่งเป็นข้อความเลย ... 155,000 ขอลดได้ไหม / 145,000 ทำได้". Plain chat haggling.

### 2.5 What Pacred should take
The 3-field price (`freight + clearance-officer + TH-transport`), the two-price negotiation model, the per-port rate table, the 1-CBM=300-KGM rule, the per-customer override, and the owner-only yuan rate are all **real, decoded, portable**. The *process* (3-human relay over chat) is the thing to kill.

---

## 3. Sales process + leak points

### 3.1 How a lead actually flowed
1. Customer DMs a LINE OA (or a sales rep's personal LINE), or owner forwards a screenshot into the group: **"ลูกค้าใครครับ"**.
2. Reps claim it: "ลูกค้าพลอยค่ะ". Often 1–2 mins of "who owns this?".
3. SALE pastes the quote template → tags DOC + PRICING.
4. 3-role relay fills it (hours).
5. SALE sends provisional quote, follows up, haggles.
6. On win → booking → (truck booking template) → audit/doc → ใบขน → invoice.
7. Owner monitors the whole thing live and pokes anyone who's slow.

### 3.2 Leak points (where leads/deals were lost)

| # | Leak | Evidence | Severity |
|---|---|---|---|
| **SP-1** | **Slow quote turnaround** — the 3-role chat relay. Owner's #1 complaint. "ลูกค้าตามค่ะ" / "อย่าปล่อยไว้" recur constantly; nightly "ได้ราคาหมดยัง" at 01:33. | AX Pricing chat throughout | **HIGH** |
| **SP-2** | **No lead ownership / dedup** — "ลูกค้าใคร" asked weekly; owner threatens to take the customer himself if a rep can't fix it fast ("ถ้าแก้ปัญหาเฉพาะหน้าไม่ได้ พี่จะเอาลูกค้าเจ้านี้มาดูแลเอง"). | ตามงาน SALE 04-27 | **HIGH** |
| **SP-3** | **Owner is the single point of sale** — personally re-types quotes, personally chases, personally gate-keeps yuan rate, "คืนนี้กุเฝ้าฐานเอง" (sits the LINE OA inbox alone at night). The business does not scale past his waking hours. | การตลาด 05-07, AX Pricing 01:33 | **HIGH** |
| **SP-4** | **No customer self-serve, no system of record** — quotes/jobs tracked in ≥5 Google Sheets (`ชีทลงงาน`, `ชีทเบิก`, commission sheets). Data "ไม่มาเลยซักหน้า" — sheet formulas silently broke; commissions disputed (see §5). | Aom DMs 04-30/05-04 | **HIGH** |
| **SP-5** | **Quotes are provisional & re-quoted repeatedly** — "รออัพเดตราคาจากเว็บเสนอใหม่อีกครั้ง" appears for nearly every container in the work-in-progress list. Factory delays → re-quote → customer cools off. No price-validity / auto-refresh. | g DMs 05-08 backlog | **MED** |
| **SP-6** | **D/O fee & RENT discovered late** — quoted after the goods land, re-billed by chat + slip. Customer surprised by post-delivery charges. | AX Pricing (D/O fields blank at quote time) | **MED** |
| **SP-7** | **Channel sprawl at launch** — ad spend fired across FB/Line/TikTok/IG/YouTube/Google at once, but reps had no FB accounts, no canned replies, no banners ("กาสเซลก็ไม่มี ... ข้อความและคีย์เวิร์ดรับลูกค้า มันไม่ดี"). Leads arrived faster than the team could answer; owner sat the inbox solo. | การตลาด 05-07 | **MED** |
| **SP-8** | **Permit/clearance unknowns kill late-stage deals** — e.g. the live-dog import (ติดปศุสัตว์, customer's flight already booked) and battery imports stalled because permit feasibility was discovered mid-quote, not upfront. | AX Pricing 10-24/25 | **MED** |

### 3.3 What the team self-identified as the fix (owner's own words)
- "ระบบงาน CRM หลังบ้าน เราจะสไล (scale) ถ้าระบบเราดี" — they *know* a real CRM is the unlock.
- The intended end-state (พี่ป๊อป, 2026-05-10): **SALE closes only**; **CS** owns operations/booking and repeat-customer contact; **Pricing** owns rate; **ล่ามจีน** (China interpreter) communicates by chat-only "เพื่อให้มีหลักฐานตรวจสอบย้อนหลัง" (so there's an audit trail). Commission split 50/50 SALE↔CS.
- "กำหนดราคาขายวิธีการต่างๆ ... ที่หน้าเว็ป และเอาตรงหน้าเว็ปมาสอนเซล ขาย จบ" — put pricing rules on the website so reps stop re-deriving them.

---

## 4. Audit findings

Two auditors appear: **Win** (`AUDIT DOC ~Win` — document/HS-code/customs audit) and **Mew** (`AUDIT PCS - MEW` — PCS cargo operations/finance audit). A third, **Mark** (`Audit Warehouse Mark`), audits the warehouse.

### 4.1 What Mew flagged (cargo ops / money)
- **Queue & weight anomalies:** owner: "ทำไมคิวกับกิโลเยอะจัง" — Mew confirmed "โดนกิโลค่ะ" (overcharged on volumetric weight). The volumetric-weight billing is error-prone and customer-visible. → Pacred: show the weight calc transparently; flag outliers.
- **Refund-vs-payout race:** Mew nearly paid a China shop *after* a refund was already in flight ("กำลังจะโอนให้ร้านแล้ว ... ไม่ทันแล้วหรอ"). MOMO/PCS approval ("พี่ป๊อป กับ พี่แนท คอนเฟิร์ม") had to clear first. → Pacred needs an explicit **payment-hold / approval state** so ops can't double-spend.
- **Tax-invoice volume pressure:** owner kept pushing Mew — "เปิด 1 ใบค่ะ" → "เร่งลูกเปิดเยอะๆ ... ไม่งั้นเราเปิดเจ้านี้ไม่ได้ ยอดจะไม่ถึง" — declared volume had to hit a threshold to keep the issuing entity viable. → Pacred: tax-invoice issuance must track an entity-level running total.

### 4.2 What Win flagged (documents / customs / HS code)
- **HS-code is the leverage point and the risk.** Win's job: pick พิกัด, decide permit exposure, decide "เคลียร์เจ้าหน้าที่ or not", and **engineer the declared name/HS to dodge permits**. The pinned AI prompt (DOC ~Win, 2026-04-22) is explicit:
  > *"...มีเล่ห์เหลี่ยมแพรวพราวในการซอกแซก ... บางงานติดใบอนุญาต ... แนะนำ HS CODE ที่ไม่ติด ... เปลี่ยนชื่อ เปลี่ยนพิกัดได้เลย ... เราแฮปปี้ ลูกค้าก็แฮปปี้"*
  This is a **deliberate gray-area workflow** ("เลี่ยงชื่อเข้า", "สำแดงส่วนประกอบโทรศัพท์" for whole phones, "ทำราคา/ไม่ทำราคา" two-track tax figures). NNB mode = "ไม่รับเอกสาร" (customer gets *no* documents) precisely so the engineering isn't visible.
- **FE / form-E cost drift:** Win flagged that pooled-declaration FE cost rose 150→200 RMB/set — costs the team must re-pass to customers; no system absorbed it.
- **"ทำราคา vs ไม่ทำราคา":** for the same shipment Win/Pricing produced two tax outcomes (e.g. "ไม่ทำราคา ภาษี 300,000 / ทำราคา ภาษี 30,000") — the customer chooses the risk/price tradeoff. A real decision the quote builder must represent (without Pacred endorsing evasion).

### 4.3 Audit finding for Pacred itself (V2 build)
The owner's own pre-launch QA (via `Pasit`, `Pond`) found the PHP→Pacred cutover half-done: cart 500s (`Cannot modify header information`), `Not Found` on menu links, FB/YouTube/LINE still bound to PCS, SMS still sending as "PCS", logo/brand not swapped, pages "ช้ามากๆ". **This is exactly the unverified-deploy risk Pacred's own conventions (`AGENTS.md` §11) warn about** — confirmed in the wild.

> ⚠️ **Framing note for Pacred:** the gray-channel workflow (NNB "เหมาภาษี", HS re-coding, two-track tax) is a *legacy revenue stream*, not a recommendation. Pacred's stated identity (CLAUDE.md DNA) is the **opposite** — "เกราะป้องกันสรรพากร 100%, เอกสารครบ, ถูกต้องตามกฎหมาย". Build the quote/declaration tooling for the **legitimate** path; treat any "no-document / tax-included" product as a separate, clearly-bounded service line with its own risk ownership — do not bake evasion into shared code.

---

## 5. People / HR friction

The per-person DMs expose a small, overstretched, emotionally-loaded team running an emergency sprint.

### 5.1 Recurring friction
- **Firing/rehire churn (Jean & BbamM, early April).** Both signed resignation letters (backdated to the 30th), forfeited severance ("ไม่ถึง 120 วัน"), then asked เดฟ to plead with พี่ป๊อป to be re-hired. เดฟ's repeated line: *"มันเลยสเตปที่พี่ช่วยได้ไปแล้ว"* — he could not undo it; the staff had to self-advocate. A competitor ("พี่บี" / "พี่แบงค์") was actively poaching ("โดนพี่แบงค์ทำเขว"). → **lesson: no clear employment process; retention by personal favor.**
- **Commission disputes (Aom).** "ค่าคอมพี่แปลกๆป่าววะ ... รู้สึกไม่ถูกต้อง ... เหมือนมันน้อย". Commission lived in a Google Sheet whose formulas/data silently vanished ("ข้อมูลไม่มาเลยซักหน้า", "สูตรหาย"). CS commission for months 1–2 hadn't even been paid out. → **lesson: opaque, sheet-based, manual commission = constant trust erosion.** (The prior audit's L-9 hardcoded-commission finding is the system half of this; this is the human half.)
- **Pricing-model whiplash hits people.** Disabling VIP/SVIP tiers, the overnight "+฿200 ทุกเจ้า", "yuan rate = owner only", "match every rate" — all landed as abrupt LINE decrees with no written policy. Reps absorbed the churn live.
- **Owner pressure is intense and personal.** พี่ป๊อป + พี่บี ran "สายประชุม" calls that left junior staff in tears ("กดดันชิบหาย น้ำตาแตกเลยพี่", "โคตรกดดันเลยพี่"). Motivational-by-grudge messages: *"มึงจำมันนะว่าวันนี้มันทำอะไรกับเราบ้าง ... เก็บความแค้นนี้เป็นพลัง"*.
- **No work/personal boundary.** เดฟ's DMs mix shift logistics, after-hours errands, personal loans between staff ("ยืมสองพัน คืนเงินออก"), a car crash เดฟ had (staff covered costs, owner reimbursed), hospital trips, a junior dev (`Pasit`/ภูม) openly managing a **panic disorder** while shipping code ("เวลาเครียดมากๆ แม่งชัทดาวร่างกาย"), trading side-bets, even lottery wins. → **lesson: roles, hours, and personal/financial entanglement are completely blurred.** Async work happened at 00:00–03:00 routinely.
- **Onboarding is ad-hoc.** New emails handed out in 01:00 LINE messages; access granted by sharing logins; HR (`Vam`) chasing เดฟ for sign-up forms he lost ("พี่พับไปแล้วหาไม่เจอ"). HR also had to ask PCS's IT ("คุณแต้ม") to add a job-title to the *old* PHP backend because Pacred had none.
- **Knowledge in heads, not docs.** Customs-officer contacts, port lead-times, rate tables, HS tricks, which sheet is current — all tribal. When ภูม was out (grandfather critically ill) or เดฟ slept, work stalled.

### 5.2 Bonus/KPI model the team designed (HR chat, 2026-05-06)
HR drafted a company bonus structure worth capturing — Pacred can implement it as data:
- 5–10% of profit, every 3 months. Split 50% "customer/system creation" (Marketing 27% / Dev 18% / HR 3% / Acc 2%) ↔ 50% "operations" (Sales 15% / Pricing 10% / CS 10% / Doc 10% / Warehouse 5%).
- Monthly piece-rate: Sales = per closed deal · CS/Doc = ฿/job · Marketing = ฿/lead.
- Hard rule the team wrote for itself: **"ต้องมี KPI ทุกทีม ... ผูกกับคุณภาพงาน + กำไร ไม่ใช่แค่จำนวนงาน"**.

---

## 6. What Pacred must build / fix

Framed for Pacred's V2 (revenue-sprint) — concrete, adapted (not copied).

### P0 — directly unblocks cargo/freight revenue
1. **Freight quote builder = port the §2.1 template as a real form.** Sections SALE / DOC / PRICING; fields HS code, permits, D/O, RENT, freight, clearance-officer fee, TH transport. Output a clean provisional quote PDF/LINE block. Kills SP-1 (the 3-human chat relay) — the single biggest leak.
2. **Lead inbox with ownership + first-touch attribution.** Every inbound (LINE OA / FB / web form) becomes a lead record with an owner, source-channel, and timestamp. Ends "ลูกค้าใคร" (SP-2) and stops the owner from being the human router (SP-3).
3. **Quote = a record, not a chat message.** Provisional vs confirmed status, a price-validity window, and one-click "re-quote / refresh rate" for the constant factory-delay re-pricing (SP-5). Two price fields built in: `offered` and `target` (§2.4).
4. **Per-port rate table + cargo rate card as admin data.** China-port→BKK freight, the กว่างโจว/อี้อู cargo card, 1 CBM = 300 KGM, fuel surcharge, per-customer override, owner-only yuan rate as a locked field. No more pasting tables into a group; no more "+฿200 ทุกเจ้า" by decree — make markup a setting.
5. **Truck-booking module** (already flagged W-2 in the prior audit) — confirmed here as a high-frequency hand-typed block in the rate-check chats. Generate the LINE-paste booking text; store partner + per-route rate + 1% withholding.
6. **Production smoke gate before any `main` deploy.** The PHP→Pacred cutover QA found cart 500s, `Not Found` links, brand still = PCS. Pacred's own `AGENTS.md` §11 procedure exists *because of exactly this* — enforce `pnpm build && pnpm start` + curl every changed route.

### P1 — significant ops/trust wins
7. **Commission engine, not a spreadsheet.** Per-deal + per-job + per-lead piece rates, the 50/50 SALE↔CS split, the team's drafted bonus model (§5.2) as configurable rules. Visible to each staff member. Directly fixes the Aom-style "ค่าคอมแปลกๆ" trust leak and the L-9 hardcoded-whitelist problem.
8. **Post-delivery cost-adjustment flow** (D/O, RENT, FE drift) — quote a delta after landing, notify the customer, collect via slip/PromptPay. Removes the SP-6 surprise-billing friction.
9. **Permit / HS-code pre-check at quote entry.** Surface permit exposure (อย./มอก./เกษตร/กสทช./ปศุสัตว์) *before* a quote is sent, so deals don't die late (SP-8). Keep a human DOC validation step (don't fully automate — the prior audit's W-3 agrees).
10. **Customs-officer & port-contact directory with lead-times.** Currently tribal knowledge. Store per-port contact + typical "ตรวจคิว" delay so ETAs and clearance-fee estimates aren't guesses.
11. **Tax-invoice issuance with entity-level running totals.** Mew's "ยอดจะไม่ถึง" pressure means issuance must track volume per legal entity, with a dashboard.
12. **Sales-readiness kit shipped *before* ad spend.** Canned replies, rate quick-answers, service banners, per-rep contact — so a launch doesn't dump unanswerable leads on the owner (SP-7). Pricing rules published on the website double as the rep training material (owner's own plan).

### P2 — people/process (lower urgency, high compounding value)
13. **Lightweight HR/onboarding flow** — staff records, role assignment, structured access provisioning, employment-status tracking. Ends the 01:00-LINE-credential-handout and the resignation/rehire ambiguity.
14. **Move tribal knowledge into docs** — rate tables, port contacts, HS playbook, "which sheet is current" — so the business survives เดฟ sleeping or ภูม being out.
15. **Keep one LINE OA + intelligent routing** (the prior audit's L-7 / sales-feedback #6 reached the same conclusion) — don't fragment per service.

### Boundary the build (important)
The legacy revenue leaned on NNB "เหมาภาษี" gray-channel imports, HS-code/declared-name engineering, and two-track ("ทำราคา/ไม่ทำราคา") tax figures. Pacred's stated brand is the legitimate, document-complete, "เกราะป้องกันสรรพากร 100%" path. **Build quote/declaration/tax-invoice tooling for the legitimate flow.** If a "no-document / tax-included" product is kept for revenue continuity, isolate it as a clearly-bounded service line with explicit risk ownership — never wire evasion logic into shared quote/declaration code.

---

## Cross-links
- [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) — companion chat audit (MOMO, cargo ops, leak holes L-1..L-10, workflows W-1..W-9). This doc = the freight/pricing/sales/people half.
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) — decoded cargo ops model (GZE/GZS, A-M-X-O-Z, Form E).
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V — cargo revenue backlog; P0/P1 items above map here.
- [`AGENTS.md`](../../AGENTS.md) §11 — production smoke gate (P0 item 6 is the live confirmation of why it exists).
