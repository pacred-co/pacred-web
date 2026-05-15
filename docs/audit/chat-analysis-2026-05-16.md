# LINE Chat Analysis — PCS Cargo → Pacred migration findings

**Date:** 2026-05-16
**Auditor:** Claude sub-agent (LINE chat analyzer)
**Source:** 7 LINE chat exports (~507KB, Nov 2025 → May 2026, exported 2026-05-15)
**Purpose:** distill what the team **really** does day-to-day + what the OLD PCS system did poorly → directly informs Pacred upgrade priorities

> **Cross-link:** [`legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) (parallel PHP cleanup audit) · [`docs/PORT_PLAN.md`](../PORT_PLAN.md) **Part U** (action items from these findings) · [`docs/STRATEGY.md`](../STRATEGY.md) (master plan reflecting these findings)

---

## Executive findings (top 5)

1. **PHP system unreliable** — "เว็ปล่ม" (web down) **24+ times in 6 weeks**. TISO Tech Solutions has an **auto-reply bot** "รอ 1-2 นาที แล้วเข้าเว็บใหม่อีกครั้ง". Sales staff treat outages as routine.
2. **Tracking data lives in 3 disconnected silos** — PHP / MOMO partner / WeChat China-side. Customer-visible status late hours-to-days. Every step needs manual sync.
3. **MOMO integration half-finished** (started 2026-04-06). Tracking-without-container, wrong sizes/weights, qty=1 on container splits, "ตกหล่น" items, no admin rebind UI.
4. **OTP SMS credit silently depletes** → registration fails → owner escalates at night. Critical revenue leak.
5. **TISO already rebuilding the PHP system in parallel** ("ระบบที่พี่รื้อใหม่หมดครับ" 2026-05-09 on `backoffice.pcscargo.co.th`). Pacred Next.js is the **third** rewrite attempt — there's competitive pressure to finish first.

---

## 🔴 Top จุดรั่ว (leak holes ranked — what Pacred MUST fix)

### L-1: PHP system instability ("เว็ปล่ม")
**Frequency:** 24+ in 6 weeks · **Severity:** HIGH
**Root cause:** shared hosting overload, DB connection saturation, no caching/CDN.
**Impact:** sales reps stop work, customers can't register, owner stress 🔥
**Pacred fix:** Vercel + Supabase managed scaling (✅ in place) · public `/status` page · graceful degradation (✅ PromptPay soft-degrade pattern, extend to other features) · uptime monitoring + LINE alert when down.

### L-2: Tracking ↔ container sync — manual, lagging, error-prone
**Frequency:** 30+ "ไม่ขึ้นในระบบ" mentions · **Severity:** HIGH
**Root cause:** 3 stores (PHP DB / MOMO API / WeChat), no event-driven sync. Container splits become `qty=1` because "เป็นข้อจำกัดของแอปรับเข้าไทย".
**Impact:** customers can't pay (no container yet), staff manually reconcile hours/day, IT (พี่แต้ม + BBOY) edits DB by hand.
**Pacred fix:** single canonical `cargo_containers` table (✅ migration 0033) · cron sync from MOMO API every 15min (scaffolded in `lib/integrations/momo-jmf/sync.ts`, ภูม fills body) · **admin "rebind tracking → container" UI** (NEW — was SQL-by-hand) · `received_qty / expected_qty` per shipment item so "40 of 85 received" works · webhook receiver `app/api/webhooks/momo-jmf/`.

### L-3: OTP SMS credit silent depletion
**Frequency:** 1 documented (2026-04-22 to 24) · **Severity:** HIGH
**Root cause:** ThaiBulkSMS prepaid runs out, no balance alert, registration vague "เด้งออก".
**Impact:** customers can't sign up → direct revenue loss.
**Pacred fix:** daily SMS-balance cron check + LINE alert when balance < 1000 messages · explicit "OTP failed — please contact support" UX (no silent fail) · `OTP_BYPASS=true` for dev (✅) · consider LINE Messaging API as cheaper fallback for LINE-linked customers.

### L-4: Customer-facing tracking page reliability
**Frequency:** ~10 "ไม่ขึ้น" complaints in MOMO group · **Severity:** HIGH
**Root cause:** data freshness depends on slow manual ingestion + China-side cooperation.
**Impact:** customer trust eroded, sales reps act as human-API.
**Pacred fix:** show **last-sync timestamp** on every tracking page · "request status update" button → manual nudge to admin · server-side scheduled sync every 15min (matches what แต้ม does by hand).

### L-5: Receipt PDF brittleness
**Frequency:** 2 documented · **Severity:** MED
**Root cause:** mPDF fragile — withholding-tax field optional fails, special chars in Thai address → squares.
**Impact:** each broken receipt = manual fix by IT.
**Pacred fix:** `@react-pdf/renderer` with Sarabun font (✅) · unit tests with Thai address + special chars + optional withholding tax (TODO — ภูม Phase test-coverage).

### L-6: Single-device login default
**Frequency:** 1 partner ask, fixed Apr 8 · **Severity:** MED (was HIGH before fix)
**Pacred fix:** never single-session by default. Supabase Auth handles this (✅).

### L-7: Sales rep deduplication / lead routing
**Frequency:** weekly "ลูกค้าใคร?" · **Severity:** MED
**Root cause:** single LINE OA inbox, no CRM, no routing rule.
**Impact:** leads dropped or duplicated.
**Pacred fix:** lead-source tracking per service slug · first-touch attribution · per-rep specialty matching (e.g. "battery import" keyword routing). Owner decision pending (2026-04-25): one LINE OA vs split per service.

### L-8: Carrier dropdown hardcoded
**Frequency:** 4 asks for SPX/J&T/Flash/EMS/Lalamove in 6 weeks · **Severity:** MED
**Pacred fix:** `carriers` table with admin CRUD (no dev required).

### L-9: Hardcoded sales commission whitelist
**Frequency:** ongoing (PCS888/2000/352/2678/4155 baked in source) · **Severity:** MED
**Pacred fix:** `team_leaders` table with commission % (✅ in PORT_PLAN F1; partial done).

### L-10: Address special-character handling in PDFs
**Frequency:** recurring · **Severity:** LOW (per-customer hand fix)
**Pacred fix:** test suite covers Thai special chars in Sarabun font rendering.

---

## 🌐 MOMO canonical status enum (port verbatim)

From PCS DEV chat 2026-05-02 — API endpoint `https://api-cn.alilogisticshub.com/?api=container-list`:

```
loading_container         ← China warehouse packing into the container
ek_left_china_border      ← truck/road: departed China border (Ek = EK route)
ek_arrived_vietnam_border ← truck/road: at Vietnam border
in_transit                ← generic transit (also sea-truck combo)
sea_leaving_china         ← sea: departed Chinese port
sea_arrived_thailand_port ← sea: at TH port (e.g. Laem Chabang)
ek_arrived_mukdahan       ← truck/road: at Mukdahan border (TH entry)
unloading_in_thailand     ← unloading at TH warehouse
unloaded_completed        ← all shipments out, container retired
```

**Pacred mapping (in `lib/integrations/momo-jmf/types.ts::MOMO_STATUS_TO_PACRED`):**

| MOMO status | Pacred `cargo_containers.status` (per 0033) |
|---|---|
| `loading_container` | `packing` |
| `ek_left_china_border`, `sea_leaving_china` | `in_transit` |
| `ek_arrived_vietnam_border` | `in_transit` (intermediate; map as comment) |
| `in_transit` | `in_transit` |
| `sea_arrived_thailand_port`, `ek_arrived_mukdahan` | `arrived` |
| `unloading_in_thailand` | `unloading` |
| `unloaded_completed` | `closed` |

**ภูม action:** confirm this mapping when ก๊อต MOMO-1 endpoint inventory lands; adjust `types.ts` and `MOMO_STATUS_TO_PACRED` if MOMO returns additional values not in this enum.

---

## 🟡 Workflows the team REALLY uses (vs documented)

### W-1: Daily container summary bulletin (recurring in MOMO + DOC SHIPPING)

**Format that staff use:**
```
DD/MM/YY สรุปรายการ — รวม X ตู้ครับ
#ค้าง
1. [container code] [status / note]
2. ...
##ใหม่
3. ...
```

**Pacred should support:** per-container status feed auto-generated; bulletin printable for LINE-paste; expose to both customers + ops simultaneously. Owner can post once + reach customers + staff.

### W-2: "จองรถ" (truck booking) template (DOC SHIPPING, dozens/week)

**Fields that staff paste manually:** SHIPMENT · ตู้# · Dimension(CBM) · จำนวน(cartons) · น้ำหนัก(KGs) · POD(port) · ต่อเร้นถึง · วันส่ง · เวลา · ส่งที่(address) · maps URL · เบอร์หน้างาน · เบอร์ชิปปิ้ง · ยานพาหนะ.

**Pacred should support:** a real form. Output the LINE-paste block automatically. Could ship as `/service-import/add` enhancement.

### W-3: HS code & customs lookup chat (DOC SHIPPING, daily)

**Workflow:** sales/buyer pastes product name → senior DOC types HS code + tariff + form-E eligibility + tax-invoice yes/no.

**Pacred should:** keep AI-assisted lookup (already piloted Jan 2026) + cache lookups by Thai name + product image. **Don't replace the human** — keep senior DOC validation step.

### W-4: D/O fee / gateway fee / weight rebill post-collection (AIR IMPORT)

**Flow:** fee discovered after delivery → quoted in chat → slip-upload via LINE → re-bill manually.

**Pacred should:** post-shipment cost-adjustment workflow with customer notification + slip-upload step. Add to forwarder admin page.

### W-5: Tracking number batch ingest from WeChat (IT + PCS DEV)

**Flow:** China warehouse posts 100+ tracking nrs in WeChat → screenshot/copy → paste in LINE → manually parse → admin SQL.

**Pacred should:** WeChat→Supabase ingest endpoint OR scheduled CSV import with admin-review step. **Multi-line bulk-search URL** like the existing PHP `forwarder-search-muti.php?fTracking=...%0D%0A...` (preserve this pattern!).

### W-6: Cross-rep "ลูกค้าใคร?" lookup (Sale chat)

**Flow:** screenshot customer DM → ask group → 1-2 reps confirm.

**Pacred should:** customer-phone search in admin → show owner-rep + last contact + first-touch attribution.

### W-7: Manual VAT rebalancing for ใบขนพ่วง (DOC SHIPPING 2025-12-27)

**Flow:** evening huddle of 3 staff, recomputing VAT split between main + 4 attachment declarations to hit a target.

**Pacred should:** **NOT replace this in V2.** Provide a calculator UI for staff. Owner-level optimization, not customer-facing.

### W-8: Lalamove ad-hoc courier dispatch (AIR IMPORT, every other day)

**Flow:** original documents dispatched via Lalamove office → airport agent.

**Pacred should:** courier dispatch tracking field on shipment ("Lalamove tracking URL").

### W-9: Multi-line bulk tracking search URL (PCS DEV)

**Pattern:** `pcscargo.co.th/member/pcs-admin/forwarder-search-muti.php?fTracking=AAA%0D%0ABBB%0D%0ACCC`

**Pacred should:** preserve this multi-line search box (staff routinely paste 10+ trackings). Add to `/admin/forwarders` search.

---

## 💬 Customer pain themes (ranked by chat frequency)

1. **"ตู้ X เข้าเมื่อไหร่"** — most common single question across all groups. Customer can't see ETA. Pacred container tracking view + ETA display fixes this.
2. **"ในระบบไม่ขึ้น"** — tracking not visible after physically arrived. Admin rebind UI fixes this.
3. **"ลูกค้ารีบใช้สินค้า / ลูกค้าตามค่ะ / รอ 7 วันแล้ว"** — perceived delays during normal customs/transit. Pacred timeline UI with each milestone fixes the *perception* even if physical delay unchanged.
4. **OTP not arriving** — silent SMS credit failure. Daily alert + multi-provider fallback fixes this.
5. **Wrong receipt / withholding tax missing / special chars broken** — receipt re-gen self-serve fixes this.
6. **"ตกหล่น" (missing items)** — physical/system mismatch. First-class missing-item reporting flow needed.

---

## 🤝 Partner integration notes

### MOMO (warehouse + Auto Tracking provider — replaces old TISO Auto-Tracking from 2026-04-06)
- **Stack:** MOMO has own backend (BBOY = MOMO dev) + own web ("MOMO ระบบ"). PCS pulls via API.
- **API endpoint observed:** `https://api-cn.alilogisticshub.com/?api=container-list`
- **Auth:** Bearer JWT (HS256), token received 2026-05-14 (`MOMO_JMF_TOKEN`)
- **Known issues:**
  - Initial Auto Tracking broke on integration day (2026-04-06)
  - Single-device login was default — multi-device added on Apr 8 by request
  - Container splits → `qty=1` bug ("ข้อจำกัดของแอปรับเข้าไทย")
  - Mismatched sizes/weights → customer overcharged → fix-via-admin (BBOY)
  - **MOMO does NOT give PCS backend write access** — adjustments via MOMO dev
- **Owner ask (2026-05-08):** "ระบบ momo หลังบ้านเราเข้าได้ไหมครับ ลองขอเขาดูนะ" — **ก๊อต may need to negotiate read access** for Pacred direct sync (otherwise stays read-only via API).

### Customs broker(s) / นายตรวจ (TTP / TTW / อาลี่ / Mukdahan)
- Multi-port handling, each port has its own contact ("พี่บี / พี่ขวัญ / พี่นัท") with phone in DOC's head
- 100% LINE + phone, no API
- Per-port "ตรวจคิว" delays measured in hours
- **Pacred should:** store per-port contact + lead-times. **Avoid trying to fully automate** — human relationships are the core value.

### China-side warehouse (MOMO / former PCS warehouse)
- WeChat-only communication
- No 2-way sync — China-side has zero visibility into Thai delivery
- **Pacred should:** provide read-only China-side dashboard if MOMO opens backend; else maintain WeChat→manual workflow with batch CSV import.

### Banks / PromptPay
- Customers slip-upload via LINE → admin manually reconciles
- **Pacred plan:** PromptPay-only beta (per ADR-0004) — preserve slip-upload as fallback for non-PromptPay customers.

### Customs broker matching (Pacred ecosystem service #1)
- Currently informal: "YY ชาเขียว" (the green-tea broker) referenced as a known person
- Pacred ecosystem #1 needs to formalise: broker directory + contact + workload visibility.

### LINE OA
- Used for: customer support, OTP-like notifications, sales lead intake, slip uploads, document photos
- Cross-cutting: lead routing manual ("ลูกค้าใคร" pattern).

---

## 💬 Recurring dev/IT requests (asks-per-6-weeks)

| Ask | Count | Pacred status |
|---|---|---|
| Add new carriers (SPX, J&T, Flash, EMS, Lalamove) | 4 | 🟡 hardcoded dropdown — add `carriers` table admin CRUD |
| Add tracking not in DB | ~15 | 🔴 needs admin UI (NEW gap) |
| Re-bind tracking → container | ~10 | 🔴 needs admin UI (NEW gap) |
| Update item dimensions/weight | 5+ | 🟡 admin can edit forwarder; needs audit log + customer notify |
| Edit a single receipt | 2 | ✅ Pacred can re-generate via PDF route |
| Withdraw cash for customer w/o forwarder | 1 | ✅ business logic shouldn't block; flag suspicious |
| Add fuel surcharge | 1 | ✅ rate adjustment system exists |
| Multi-device login | 1 | ✅ Supabase default |

---

## 📈 Sales feedback themes

1. **Rate flexibility (2026-04-18):** "ต่อไปนี้ เรทหยวนขอที่พี่เท่านั้น แล้วต้องขายให้ได้ทุกเจ้า" — owner wants central rate control + reps must close. Pacred: admin-settable margin floor; quote-builder picks within range.
2. **Owner-broadcast leads (recurring):** owner forwards customer DMs to chat — needs proper lead-routing.
3. **Bulk-add ใบกำกับภาษี / ใบขนพ่วง (2026-04-10, 21):** owner wants more declared-volume + offered 10% commission. Pacred: explicit "issue tax invoice" + "attach to declaration" workflow.
4. **Pricing wars (2026-04-17 to 18):** "ถ้าเราไม่สู้ทุกเรทเพื่อให้ได้งาน งานหลุดทั้งยวง" — needs fast quote turnaround.
5. **Battery import (2026-04-17):** owner spotted opportunity + manually routed to right rep. Pacred: keyword-based lead routing.
6. **LINE OA handler matching design (2026-04-25):** "หน้าระบบ ใครทำบริการอะไรได้ตอนเลือกเซล... ไลน์แอดควรแยกไหม" — recommendation: keep ONE LINE OA + intelligent routing; don't fragment per-service early.

---

## ⚙️ Decisions made (became policy)

| Date | Decision |
|---|---|
| 2026-04-05 | Fuel surcharge ฿100/CBM all customers (popup) |
| 2026-04-06 | Disable VIP/SVIP tiers; single basic rate + per-customer overrides |
| 2026-04-06 | Special rate ceilings: รถ 7500/45 · เรือ 6500/40 |
| 2026-04-06 | อี้อู floor: 5000(รถ)/3000(เรือ) · กว่างโจว floor: 4700(รถ)/2700(เรือ) |
| 2026-04-17 | "พ่วงทุกตู้ ใบขน 10% คอม" — pooled declaration commission |
| 2026-04-18 | Rate negotiations centralized to owner |
| 2026-04-25 to 27 | Office + warehouse address change (28/40 หมู่บ้านสิริ + 48/3 อ้อมน้อย) |
| 2026-04-29 | New THB/CNY/USD/EUR/JPY/HKD rates for May |
| 2026-05-01 | Sales now follow Pacred brand (replacing PCS prefixes) |

These should be captured in `docs/pacred-info.md` and `lib/forwarder/calc-price.ts` settings.

---

## ✅ Things PHP did right (preserve in Pacred)

1. **Multi-line bulk-search URL** `forwarder-search-muti.php?fTracking=AAA%0D%0ABBB` — staff paste 10+ tracking nrs at once
2. **Customer code prefix+sequential** (PCS<n>) — mentally cheap; Pacred continues with `PR<n>` (already done)
3. **Single multi-line announcement format** — match in Pacred auto-bulletin generator
4. **Open-ended notes field** on declarations — staff use heavily; don't over-structure
5. **Form-based admin organization** by domain (forwarder/cart/wallet/payment/sales) — keep routing convention
6. **Customer-code lookup by tracking** — easy to share via URL

---

## 🎯 Recommendations for Pacred upgrade

### Must-fix (block beta launch)
1. **Health checks + `/status` page** — match PHP's bad reputation by transparency
2. **OTP SMS balance alerting + multi-provider fallback** — daily cron + LINE alert when low
3. **Tracking → container rebind admin UI** — daily admin need; can't be SQL-only
4. **Multi-device login** — Supabase default (✅)
5. **Container `received_qty / expected_qty` per shipment** — split case must work (40 of 85)
6. **MOMO status enum (9 values)** — port verbatim into `cargo_containers.status` + i18n labels
7. **Manual tracking entry + receipt re-generation** — both currently dev escalations
8. **Address special-char handling** — Sarabun font + unit tests
9. **Last-sync timestamp** on tracking pages — UX trust

### Should-fix (significant UX/ops)
1. **จองรถ form** with LINE-paste output
2. **HS code lookup tool** (cached + AI + DOC-validated)
3. **Lead routing in LINE OA** — keyword + service-slug-aware first-touch
4. **Carrier admin CRUD** — no dev required for SPX/J&T/Flash
5. **Daily container bulletin auto-generator** — system creates LINE-pastable summary
6. **Lalamove dispatch tracking field** per shipment
7. **Customer slip upload UX** — drop in chat → admin review + auto-OCR optional
8. **Per-port lead times stored** — TTP/TTW/Bangkok/Laem Chabang config for ETA quotes
9. **Cost adjustment workflow (D/O fee post-delivery)** — common in AIR IMPORT

### Could-fix (defer post-revenue)
1. **AI-assisted ใบขน drafting** — long-tail; chat workflow ok for now
2. **VAT rebalancing calculator** for ใบขนพ่วง — niche staff tool
3. **Cross-rep customer attribution dashboard** — owner can look at LINE OA inbox for now
4. **Auto-translate Thai/EN/CN product names** in HS lookups
5. **Customer-facing chat widget on tracking page** — LINE OA serves this for now

---

## 🚦 Cross-link to action plan

- [PORT_PLAN Part U](../PORT_PLAN.md) — these findings turned into trackable T-U* tasks
- [STRATEGY §9](../STRATEGY.md) — revenue-readiness DoD updated with must-fix items
- [team-status doc](../runbook/team-status-2026-05-16.md) — ภูม + ก๊อต dispatch items
- [container-centric-model.md](../architecture/container-centric-model.md) — `cargo_containers` schema where MOMO status enum maps
- [`lib/integrations/momo-jmf/`](../../lib/integrations/momo-jmf/) — scaffold ready, JSDoc TODO references this canonical enum
