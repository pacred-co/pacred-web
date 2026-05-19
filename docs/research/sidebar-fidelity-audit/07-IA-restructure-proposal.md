# Audit G — Sidebar IA restructure proposal (ภูม's design ask)

> **For:** ภูม + เดฟ + พี่ป๊อป
> **Synthesizes:** [`04-workspace-inventory.md`](04-workspace-inventory.md) ·
> [`05-sidebar-map.md`](05-sidebar-map.md) ·
> [`06-legacy-menu-structure.md`](06-legacy-menu-structure.md) ·
> [`_MASTER-FIX-PLAN.md`](_MASTER-FIX-PLAN.md) (Wave A/B already shipped).
>
> **The owner rule (verbatim 2026-05-19):** *"ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน
> แล้วเราค่อยพัฒนาให้เหนือยิ่งกว่า"* — copy the original to 100% sameness FIRST, then improve.
> Wave A/B แก้ "link ผิด" แล้ว · นี่คือเอา **โครงสร้าง sidebar เอง** ให้ตรง legacy.

---

## 0. The picture in one screen

```
129 workspaces (page.tsx)  ←→  268 sidebar items (across 7 role menus)
                                ↓
       ┌──────── 26 actionable duplicates ────────┐
       │  · 13 same href · 2+ sidebar items       │
       │  · 13 same workspace · different ?query  │
       └──────────────────────────────────────────┘
                                ↓
       ┌──────── 17 orphan workspaces ────────────┐
       │  · 10 dead pre-D1 routes → delete        │
       │  ·  6 operational deep-links → keep      │
       │  ·  1 high-impact UX gap (/admin/admins) │
       └──────────────────────────────────────────┘
                                ↓
       ┌──────── Pacred IA lost from legacy ──────┐
       │  · 6 fixed EN section headers gone       │
       │  · ad-hoc Thai groups in their place     │
       │  · live-count badges ~half wired         │
       │  · search items collapsed to inline      │
       │  · ระบบบัญชี split (Cargo+Freight) merged │
       └──────────────────────────────────────────┘
```

**ตัวอย่างที่ภูม flag = canonical cases:**
- **Popup ประกาศลูกค้า + ทั่วไป + ประเภทสมาชิก VIP → settings dump** (3 sidebar → 2 routes,
  ทั้ง 2 routes แสดง config-dump เดียวกัน · legacy มี `popup-customer.php` + `customer-rate-vip.php` แยก)
- **บันทึกเวลาเข้างาน อยู่ใน sidebar จองห้องประชุม** (`/admin/hr/attendance?tab=meeting-room`
  page อ่าน `?tab=` ทิ้ง · ห้องประชุม UI ไม่มีอยู่จริง)
- **บัญชี Freight nested 3-level** ที่ภูม screenshot ให้เห็น —
  legacy เป็น **flat 1-level top-bar** (`acc-system-cargo.php` / `acc-system-freight.php`)

---

## 1. The 3 problems (rolled up)

### 1.1 🔴 Duplicates (sidebar promises 2+ destinations · workspace is 1)

**Class A — same href, 2 sidebar labels** (BETA §2.a · 13 clusters):
| href | Labels | Why bad |
|---|---|---|
| `/admin/settings/business-config` | "Popup ประกาศลูกค้า" + "ประเภทสมาชิก VIP" | Both render the feature-flag dump |
| `/admin/wallet?kind=deposit&status=pending` | "รายการเติมเงิน" × 2 (wallet block + acc block) | Cross-link is fine but the duplicate row clutters |
| `/admin/freight/declarations` | "ใบแจ้งหนี้" + "ใบขนสินค้า" | Invoice ≠ declaration; one is wrong |
| `/admin/driver-runs` | "งานขนส่งคนขับรถ" + "พนักงานขับรถ" | Different intents (report vs payout) → same page |
| `/admin/reports/monthly-orders` | "ฝากสั่งซื้อ" + "รายงานฝากสั่ง" | Operational vs accounting framing same page |
| ... (8 more) | | |

**Class B — same workspace, different `?query`** (BETA §2.b · 13 clusters):
| Workspace | # query-carrier sidebar items | Filter state |
|---|---|---|
| `/admin/customers` | **9** (groups + segment + search + bare) | Wave A wired `?group=` ✅ · `?segment=` still dropped |
| `/admin/barcode` | **7** (8-mode family minus 1) | All silently dropped |
| `/admin/learning` | **5** topics | Wave B wired ✅ |
| `/admin/forwarders` | **5** (`?q=note`/`q=6`/etc.) | `?q=` is text-search not status filter — wrong shape |
| `/admin/reports/monthly-orders` | 4 (3 SLA + bare) | Wave B wired (label-only chip) ✅ |
| ... (8 more) | | |

### 1.2 👻 Orphan workspaces (page.tsx exists · sidebar doesn't link)

**Dead code (DELETE in cleanup PR — 10 routes):**
- `/admin/orders/*` (7 routes) — pre-D1 unified-orders namespace
- `/admin/forwarder` + `/admin/forwarder/pending` — singular (vs plural `forwarders`)
- `/admin/payment` — pre-D1 unified payment route

**High-impact UX gap (FIX IMMEDIATE):**
- **`/admin/admins`** — RBAC console with no sidebar item · super-admin ใช้งานไม่ได้

**Operational deep-links (KEEP orphan):**
- `/admin/system/{crons,notifications}` · `/admin/csv-imports{,/upload}` ·
  `/admin/migration/pcs-customers` · `/admin/accounting/{container-costs,periods}`

**Phase-C revisit (orphan today, sidebar wiring deferred):**
- `/admin/board` + `/admin/board/inbox` — Tier-2 work board
- `/admin/contact-messages` — Tier-0 lead inbox

### 1.3 🔵 Pacred IA drifted from legacy

| Aspect | Legacy | Pacred today | Fidelity gap |
|---|---|---|---|
| Top-level grouping | **6 fixed EN section headers** (Cargo & Freight · Freight · Cargo · Settings · Learning · Extension) | Ad-hoc Thai groups (ภาพรวม / กระดานงาน / รีพอร์ตเฉพาะกิจ / …) | 🔴 muscle memory broken |
| Nesting depth | 3-level max · most 1-2 | 3-level same · uses accordion | 🟢 OK |
| Sidebar shape | ~22 disjoint per-role sidebars (PHP `require_once`) | 1 array + 7-role `roles?.some(...)` filter | 🟢 OK (pragmatic) |
| **Live badges** | On **every queue item** — staff's "work radar" | `BadgeKey` type modeled · ~half rendered | 🔴 **#1 daily-flow regression** (per d1-fidelity-admin §1.4) |
| Search items | **Dedicated sidebar rows** (users-search.php · shop-search.php · forwarder-search.php) | Collapsed to inline `?focus=search` (Wave A made this worse) | 🟠 Wave A may need revisit |
| `ระบบบัญชี` | TWO separate parents (Cargo + Freight) | Merged `/admin/accounting` | 🟠 |
| `ย้ายเซลล์` placement | Under QA section | Under จัดการลูกค้า | 🟠 |
| Extension section | 8 daily-used tools (juristic + 5 carrier audits + booking + history) | Scattered · half missing | 🟠 |

---

## 2. The 3 fix options (recommend Option 3)

### Option 1 — Faithful overhaul (~40h)
Rewrite `lib/admin/sidebar-menu.ts` from scratch using legacy's 6-section IA · keep EN section headers ·
mirror per-section item order from `06-legacy-menu-structure.md` §2 · build missing dedicated pages.
- ✅ Maximum fidelity · matches owner's "100% same first"
- ❌ High effort · single big-bang PR · breaks active workflows for 1-2 sprints

### Option 2 — Targeted patches (~6h)
Just fix the duplicates + orphans listed in §1.1/§1.2 · don't touch top-level shape.
- ✅ Low effort · ship in 1 session
- ❌ Owner rule violation (IA still ad-hoc) · staff still retraining

### Option 3 — Hybrid (~16-20h split across 3 sub-waves) — RECOMMENDED
- **Wave R1 (~4h):** introduce the 6 legacy EN section headers as the new top-level grouping
  (additive — no item moves yet). Drop the ad-hoc Thai headers. Visual change only · zero workflow impact.
- **Wave R2 (~6h):** delete the 10 dead orphans + wire `/admin/admins` + collapse the 13 Class-A duplicate clusters per the §3 plan below.
- **Wave R3 (~8h):** re-flow items into the legacy sections per `06.md` §2 · split `accounting` into Cargo/Freight ·
  move `ย้ายเซลล์` to QA · expand Extension section · wire the remaining ~14 badges.

After R1+R2+R3 = full IA fidelity. Each wave is shippable independently.

---

## 3. Per-cluster fix recommendations (Wave R2 detail)

### 3.1 The 13 Class-A duplicate clusters (BETA §2.a)

| # | href | Resolution |
|---|---|---|
| 1 | `/admin/settings/business-config` × "Popup" + "VIP tiers" | **BUILD** `/admin/settings/announcements` (popup editor) + `/admin/settings/vip-tiers` (tier editor) · point each label at its real page. Legacy: `popup-customer.php` + `customer-rate-vip.php`. (~4h combined) |
| 2 | `/admin/wallet?kind=deposit&status=pending` × "wallet block" + "acc block" | **KEEP** — cross-block link is intentional (legacy puts รายการเติมเงิน in both menu-wallet + menu-acc). |
| 3 | `/admin/wallet?kind=withdraw&status=pending` × 2 | **KEEP** — same pattern. |
| 4 | `/admin/yuan-payments` × 2 | **KEEP** — same pattern. |
| 5 | `/admin/freight/declarations` × "ใบแจ้งหนี้" + "ใบขนสินค้า" | **REPOINT** `accCargo.invoice` to a real invoice page (or BUILD `/admin/freight/invoices`). Legacy: `acc-forwarder.php → hs-forwarder-invoice.php`. (~3h) |
| 6 | `/admin/tax-invoices` × accCargo + accFreight | **KEEP** — same workspace serves both accounting blocks. |
| 7 | `/admin/driver-runs` × "report" + "payout" | **SPLIT** — `?view=runs` (default report) vs `?view=payout` (payout list) on same page, OR build separate `/admin/driver-payouts` route. Lean toward the split route — legacy has 2 PHP files. (~2h) |
| 8 | `/admin/reports/monthly-orders` × "report" + "accounting" | **REPOINT** `accCargo.shop` to `/admin/accounting/shop` (the income view); leave `report.shop` on monthly-orders. (~1h if `/admin/accounting/shop` exists; else build) |
| 9 | `/admin/reports/forwarder-volume` × "report" + "accounting" | **SAME** as #8 — repoint `accCargo.total` to accounting view. |
| 10 | `/admin/reports` × "report.payment" + "accFreight.overview" | **BUILD** `/admin/reports/payments` (the payment-specific report); leave overview pointing at hub. (~2h) |
| 11 | `/admin/forwarders` × "search" + "list all" | **KEEP** as 2 sidebar rows (per legacy fidelity) · `?focus=search` on the search row. Already half-wired in Wave A. |
| 12 | `/admin/service-orders` × "search" + "list all" | **SAME** as #11. |
| 13 | `/admin/sales-payouts` × "commission" + "goods" | **BUILD** `/admin/sales-payouts/goods` (the เบิกเงินค่าสินค้า workflow) OR repoint goods to `/admin/wallet?kind=payout&category=goods` if data model supports. Wave-B scope. |

### 3.2 The 13 Class-B query-carrier clusters (BETA §2.b)

| Workspace | Status | Action |
|---|---|---|
| `/admin/customers` (9) | Wave A wired `?group=` ✅ | Wire `?segment=freight` (low effort · ~1h) |
| `/admin/barcode` (7) | None wired (all silently dropped) | **8-mode `?mode=` switching** · part of Wave-C / B-7 |
| `/admin/learning` (5) | Wave B wired ✅ | Done |
| `/admin/forwarders` (5 `?q=`) | `?q=` is text-search, wrong shape | **Migrate to `?status=`** plumbing (~3h) |
| `/admin/reports/monthly-orders` (4) | Wave B wired (label-only banner) ✅ | Backfill real SLA SQL when legacy thresholds confirmed |
| `/admin/wallet` (3) | Works correctly | Done |
| `/admin/inventory` (3) | Page = `redirect("/admin/barcode")` | **Delete** the redirect-stub · repoint sidebar items at `/admin/barcode?mode=…` directly |
| `/admin/reports/containers-awaiting-th` (2) | Wave B wired ✅ | Done |
| `/admin/reports/pending-payments` (2) | Wave B wired ✅ | Done |
| `/admin/accounting/disbursements` (2) | Wave A wired `?kind=` ✅ | Done |
| `/admin/hr/attendance` (2) | `?tab=meeting-room` silently dropped | **BUILD** `/admin/hr/meeting-room/` (calendar UI) · legacy `booking-meeting-room.php`. ภูม's "บันทึกเวลาเข้างาน ใน sidebar จองห้องประชุม" case (~4h) |
| `/admin` (3 `?c=`) | Unknown if `?c=` honored | **VERIFY** + wire if needed (~1h) |
| `/admin/sales-payouts` (2) | `?kind=shop-goods` dropped | Covered in §3.1 #13 |

### 3.3 The 17 orphans (BETA §4)

**DELETE in cleanup PR (10 routes):**
```
app/[locale]/(admin)/admin/orders/         # 7 leaf routes
app/[locale]/(admin)/admin/forwarder/      # 2 leaf routes
app/[locale]/(admin)/admin/payment/        # 1 leaf route
```

**WIRE TO SIDEBAR (1 route):**
- `/admin/admins` → add to `blockSettingsCargo` (super-only) — legacy: `admin-table.php`

**KEEP orphan (operational deep-links — 6 routes):** already noted in BETA §4.

**Phase-C revisit (3 routes):** `/admin/board`, `/admin/board/inbox`, `/admin/contact-messages` — these are Tier-2 features deferred under D1.

---

## 4. The new IA — proposed sidebar tree (Wave R1 + R3 detail)

Adopt legacy's 6 EN section headers. CEO (super) sees all 6; per-role menus include 1-3 sections.

```
👤 [avatar block] — adminID / role badge / dropdown
─────────────────────────────────
📊 Dashboard  [All ▾ / Freight / Cargo]

════ Cargo & Freight ════
👥 ฝ่ายทรัพยากรบุคคล             (11 items, 3-deep)
🛡 QA & QC                       (12 SLA queues, badge-driven)
👤 จัดการลูกค้า                   (Cargo + Freight customer entries)
💵 รายการเบิกเงิน                 (8 items — Freight 1 + Cargo 7)
🏢 ทรัพย์สินบริษัท                (9 items: ซ่อมบำรุง, จัดซื้อ, สต๊อก, เครื่องมือ)

════ Freight ════
📒 ระบบบัญชี Freight             (6 items, 2-deep)
👥 ลูกค้า Freight                 (1 item)

════ Cargo ════
👛 กระเป๋าสตางค์                  (6 items)
🛒 บริการฝากสั่งสินค้า             (6 items + dedicated search)
📦 บริการฝากนำเข้า                (12 items + sub-API tree)
💴 บริการฝากโอน/ชำระ              (2 items)
📷 สแกนบาร์โค้ด                   (8 items: 4 task × 2 input)
📈 ออกรายงาน                      (11 items)
📒 ระบบบัญชี Cargo                (~14 items, 2-deep)
👥 สมาชิก Cargo                   (8 items: 7 segments + dedicated search)

════ Settings ════
⚙️ ตั้งค่าระบบ Cargo              (7 items inc. announcements + popup + VIP tiers + rates)
🔐 จัดการ Admin                   (NEW — wire `/admin/admins` here)

════ Learning ════
📚 กฏระเบียบและสัญญา / การอบรม / newsfeed / TOS (~6 items)

════ Extension ════
🧰 เช็คนิติบุคคล / เช็คขนส่งไทย(5) / จองห้องประชุม / ประวัติทำรายการ (~8 items)
```

**Per-role visibility (matching legacy):**
| Role | Sections shown |
|---|---|
| super (CEO) | ALL 6 |
| accounting | Cargo & Freight (รายการเบิกเงิน only) + Freight + Cargo + Settings + Learning + Extension |
| ops | Cargo & Freight (HR/QA only) + Cargo + Learning + Extension |
| sales_admin | Cargo & Freight (จัดการลูกค้า/QA) + Cargo (wallet/purchasing/forwarder/payment) + Learning + Extension |
| warehouse | Cargo & Freight (HR only) + Cargo (forwarder/barcode) + Learning + Extension |
| driver | Cargo (barcode/driver tasks) + Learning + Extension |
| interpreter | Cargo (commissions) + Learning + Extension |

---

## 5. Wave A retrospective — what to revisit

### ✅ Right calls
- Stub `forwarders/container-cost-check` (Phase-C eligible per d1-fidelity §6.3)
- Wallet 5 dead-wires fix (now lands on filtered view)
- Customers `?group=` filter (6 branches · survives Wave-2 swap)
- Migration 0089 (`container_lease` enum) · 17 label drifts
- Wave B partial: `?sla=` label chip + `?topic=` per-topic routing (defensive — no wrong SQL)

### 🟠 Revisit — search collapse (A-2)
- Wave A rewired `/admin/customers/search` → `/admin/customers?focus=search`
- Same for `/admin/forwarders/search` + `/admin/service-orders/search`
- **Legacy has search as DEDICATED sidebar rows** (users-search.php + shop-search.php + forwarder-search.php) — Pacred collapsed muscle memory.
- **Recommended hybrid:** keep the inline `?focus=search` URL but **keep the dedicated sidebar row** (label: "ค้นหารหัสสมาชิก" · "ค้นหาฝากสั่งซื้อ" · "ค้นหานำเข้า"). Best of both worlds. The Wave A A-2 work is preserved; we just add back the explicit row that lands on the focused inline search.

### ⚠️ Discovered after Wave A
- **`/admin/sales-payouts` `?kind=shop-goods` filter is incomplete** (column doesn't exist) — flagged in ALPHA. The Wave A label-only chip + warning banner is the right interim · Wave-B build adds the real column.
- **`/admin` root has no `<h1>`** — 1-line a11y/fidelity fix · Wave R1 candidate.

---

## 6. Implementation sequencing

### Wave R1 — Section headers + IA shell (~4h)
- Replace ad-hoc Thai headers in `sidebar-menu.ts` with the 6 legacy EN sections
- Per-role menu definitions match the per-role visibility matrix in §4
- No item moves yet (just regroup)
- Add `<h1>` to `/admin` root page
- Visual change only · zero workflow impact

### Wave R2 — Cleanup + duplicates + 1 high-impact orphan (~6h)
- Delete the 10 dead orphan routes (`/admin/orders/*` + `/admin/forwarder/*` + `/admin/payment`)
- Wire `/admin/admins` into Settings section
- Collapse the 13 Class-A duplicate clusters per §3.1 (most "KEEP", a few REPOINT, 4 small BUILDs)
- Add search dedicated rows back (per §5 revisit)
- Wire `?segment=freight` filter on customers/page.tsx (low effort follow-on to Wave A `?group=`)
- Delete `/admin/inventory` redirect-stub · repoint inventory sidebar items at `/admin/barcode?mode=…`

### Wave R3 — Re-flow + missing badges + accounting split (~8h)
- Split `/admin/accounting` into Cargo + Freight parents (or add 2 top entries)
- Move `ย้ายเซลล์` from จัดการลูกค้า → QA section
- Expand Extension section: build the 5 Thai-carrier audit pages (`check-customer-maomao-*`, `check-customer-shipby-freedom`, `check-price-flash`, `check-shipby`, `check-payMethod`)
- Build `/admin/hr/meeting-room/` (legacy `booking-meeting-room.php`)
- Wire the remaining ~14 badges (every queue item shows live count — closes the #1 daily-flow regression)

### Wave R4 — Out-of-scope today (Wave B + C continuation)
- `/admin/wallet/{pay-user,add,history}` builds (~12h · GATED on เดฟ's Wave 2 ghost-customer fix)
- `/admin/forwarders/{combine-bill,new,warehouse-history}` (~17h)
- 8-mode barcode (~8h · bundled with B-7)
- `?status=` migration for forwarders `?q=` text-search (~3h)

---

## 7. Decisions — ภูม answered 2026-05-19 evening

| # | Question | Decision |
|---|---|---|
| Q1 | 6 EN section headers — keep English or translate? | ✅ **EN ตาม legacy** (zero retraining · per owner rule) |
| Q2 | Search as dedicated row (hybrid: keep ?focus=search URL + bring back row) | ✅ **เอากลับมา** |
| Q3 | `ระบบบัญชี` split Cargo + Freight as 2 parents? | ✅ **แยก 2 parents** (per legacy + fixes Freight 3-level dropdown) |
| Q4 | Dead orphans — delete in R2 or separate PR? | ✅ **Delete in R2** (couples cleanup with IA reset) |

### Defaults taken for Q5-Q8 (no explicit answer · using proposal recommendations)
| # | Question | Default applied |
|---|---|---|
| Q5 | `accCargo.invoice` destination | (a) BUILD `/admin/freight/invoices` page — Wave-R3 build · legacy `hs-forwarder-invoice.php` |
| Q6 | driver-runs report vs payout — split vs `?view=`? | SPLIT route — `/admin/driver-payouts` (Wave-R2) · legacy = 2 PHP files |
| Q7 | `/admin/inventory` redirect — delete + repoint? | DELETE + repoint sidebar items at `/admin/barcode?mode=…` (Wave-R2) |
| Q8 | Per-role visibility matrix — review with ก๊อต/เดฟ before R1 | **Flag for เดฟ visibility check** (see §10) — R1 ships without blocking unless ก๊อต flags |

---

## 8. Coordination with active Phase-B work

- **เดฟ's Wave 2 bundle** (0088 ghost-customer backfill + bridge extension + §7 swap diffs) — touches `actions/` + a few page reads. **No file conflict with this proposal.** Wave R1-R3 can run in parallel.
- **Wave A + B already shipped** (a51e338 · d0319f5) — survives this proposal. The search collapse from A-2 is the only thing this proposal partially reverts (add back dedicated rows · keep the URL).
- **Migration 0089** — applied to dev ✅ (ภูม). prod apply pending.

---

## 9.5. 📨 Handoff brief — เดฟ + ก๊อต please read

> ภูม asked me to surface this work clearly so you can see + coordinate.

### What's shipped today on `Poom` (4 commits — already in `origin/Poom`)
- `d27cf6c` — R&D 8-specialist QC notes
- `80a6aab` — Sidebar fidelity audit (4 docs · 73% mismatch finding) — the audit ภูม flagged
- `a51e338` — **Wave A** — 38-item sidebar fidelity fix (12 files · 4 parallel agents · tsc+lint clean)
  - 7 href rewires + 1 stub (cost-check) + 5 wallet/disbursement fixes + customers `?group=` filter + 17 label drifts
  - Migration `0089_disbursement_kind_extend.sql` (renumbered from 0088 to reserve เดฟ's slot for `pcs_profiles_backfill`)
- `d0319f5` — **Wave B partial** — `?sla=` (9 items) + `?topic=` (5 items) filter implementations (defensive label-only banner pattern · no wrong-SQL risk)

### What this proposal adds (Wave R1-R3 · ~16-20h split across 3 sub-waves)
The above fixed individual links. **The IA itself is broken** — 268 sidebar items → 74 unique workspaces (3.6× over-pointing) + Pacred lost legacy's 6 fixed EN section headers + ~14 badges not wired + search items collapsed.

| Wave | Effort | Owner | Workflow risk |
|---|---|---|---|
| **R1** | ~4h | ภูม | **Zero** — section headers only, no item moves |
| **R2** | ~6h | ภูม | Low — delete dead orphans + wire 1 high-impact (`/admin/admins`) + collapse 13 duplicate clusters |
| **R3** | ~8h | ภูม | Medium — accounting split + Extension expansion + 14 badge counters |

### Coordination with เดฟ's Wave 2 (ghost-customer fix)
**No file conflicts.** Wave R1-R3 touch:
- `lib/admin/sidebar-menu.ts` (R1-R3)
- `actions/admin/sidebar-counts.ts` (R3 badges)
- A few page.tsx files (R2 duplicate fixes + R3 builds)
- No migration files (the disbursement `0089` is in `Poom`; if `dave` lands a `0088_pcs_profiles_backfill` later it can sit at `0088` cleanly)

Wave 2 touches: actions data sources + bridge auth + a few page reads. Different surface.

### What needs เดฟ + ก๊อต before R1 ships
- **Q8 — per-role visibility matrix (§4)**: my proposed per-role section visibility might miss role-specific needs. Quick 5-min skim by ก๊อต (RBAC owner) + เดฟ (integrator) would catch any "we need X visible to ops too" gaps before R1 ships.
- **Wave R3 5-build scope** (5 Thai-carrier audit pages + meeting-room): ภูม-buildable, but if เดฟ's Wave 2 brings in ports for any of these, coordinate to avoid double work.

### Open follow-ups (not blocking R1)
- Migration `0089` applied to dev ✅ (ภูม ran in Supabase) · prod apply pending
- Wave B remaining ~13h (wallet builds) — GATED on เดฟ's Wave 2

---

## 9. Cross-references

- 🧭 **D1 ADR:** [`../../decisions/0017-pacred-faithful-pcs-port.md`](../../decisions/0017-pacred-faithful-pcs-port.md)
- 🗺 **Legacy admin spec (canonical IA source):** [`../d1-fidelity-admin.md`](../d1-fidelity-admin.md)
- 📂 **Companion audits (this folder):**
  - [`01-broken-links.md`](01-broken-links.md) — 15 broken hrefs
  - [`02-wallet-withdrawal-pattern.md`](02-wallet-withdrawal-pattern.md) — wallet/withdrawal sub-pattern
  - [`03-mislinks.md`](03-mislinks.md) — 46 mislinks (page ≠ label)
  - [`04-workspace-inventory.md`](04-workspace-inventory.md) — 129 page.tsx inventory
  - [`05-sidebar-map.md`](05-sidebar-map.md) — 268-item sidebar map · duplicates + orphans
  - [`06-legacy-menu-structure.md`](06-legacy-menu-structure.md) — legacy 6-section IA tree
  - [`_MASTER-FIX-PLAN.md`](_MASTER-FIX-PLAN.md) — original Wave A/B/C fix plan
- 👷 **ภูม brief:** [`../../briefs/poom.md`](../../briefs/poom.md)

---

_End of proposal. Wave R1-R3 await ภูม's Q1-Q8 decisions before implementation begins._
