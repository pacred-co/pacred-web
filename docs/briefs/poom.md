# ภูม — Backend / Customer Portal / Admin Back-Office / Cargo Port

Last reviewed: 2026-05-18 (post-launch — production live since 2026-05-17)
Branch: `Poom` (working) — push to own branch only; เดฟ merges into `dave`

## 🎯 Current state — POST-LAUNCH (production live since 2026-05-17)

🟢 Pacred launched. The canonical forward roadmap is [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) — read it first; the post-launch capability synthesis [`research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) seeded it and its §"Work split" table is ภูม's pickup list.

**ภูม now — pickup list (priority order):**

> ✅ Migrations applied — ภูม confirmed `0058`-`0080` are on prod Supabase; the `dave→main` deploy (`899ff18`) is live. ภูม's wave-2 polish batch (delivery-ack · yuan tax-invoice · super-tools · view-as-customer · business-config — migrations `0073`-`0076`) is integrated on `dave`.

1. **BUILD the booking-flow backend — TOP priority** — the customer-acquisition revenue surface. `bookings` / `booking_options` / `booking_rates` tables + the `work_item` hand-off (`entity_type='booking'`) + the R-3 lead-inbox / R-5 quote-calculator wiring. Design → [`research/booking-flow-system-2026-05-18.md`](../research/booking-flow-system-2026-05-18.md) (the **BK-1** MVP); ปอน builds the detail page in parallel.
2. **BUILD the Tier-3 systems, in order:**
   - **Internal org-chat IC-1** — the shipment/job-scoped work-comms MVP; rides on the shipped `0080` work-board. Design → [`research/internal-chat-system-2026-05-18.md`](../research/internal-chat-system-2026-05-18.md).
   - **Disbursement system (เบิก-จ่าย)** — `disbursement_requests` + lines + allocations + fund + outbound `wht_certificates`, money-OUT fail-closed safeguards. Design → [`research/disbursement-system-2026-05-18.md`](../research/disbursement-system-2026-05-18.md).
   - **China-ops / container-closing (ปิดตู้)** — `cn_warehouse` role + portal + close-sack/close-container ceremony. **Volume-gated**. Design → [`research/china-ops-container-closing-2026-05-18.md`](../research/china-ops-container-closing-2026-05-18.md).
3. **The LINE-webhook customer-intel backend** — webhook ingestion + the customer-360 store + the in-admin chat preview. Design → [`research/customer-intelligence-system-2026-05-18.md`](../research/customer-intelligence-system-2026-05-18.md).
4. **U1/U2 review follow-ups** — P1-2..P2-7 from [`research/review-u1-u2-2026-05-18.md`](../research/review-u1-u2-2026-05-18.md); + the U2-1 PCS-customer backfill.

**Migration numbering:** taken — `0073`-`0076` (ภูม wave-2) + `0080` (work_items). Free — `0077`-`0079` + `0081`+. The platform-observability migration is เดฟ-lane (เดฟ coordinates a number with ภูม).

**Carried-over backlog (not a current pickup):** the Phase I2 freight expansion (V-E6..V-E12 quotation / receipt / commission / monthly-closing / QA-QC / customs-declaration / role-dashboards) + the V-G admin bulk-ops bundle live in [`docs/PORT_PLAN.md`](../PORT_PLAN.md) **Part V** with per-task specs in [`docs/port-specs/`](../port-specs/). They are V2 long-phase work the [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) sequences — pick up after the Tier-3 systems.

---

## 🚀 Post-launch focus (read FIRST)

Pacred launched 2026-05-17 — the emergency "เผาเงิน" framing is over. **ภูม is still the single biggest backend lever** — the cargo path + the Tier-3 owner-requested systems are where the product gets deeper. The lens stays: more **true** / **billable** / **measurable** — and never ship a stage before the quality gate is green.

**ภูม post-launch priorities** — see the §"Current state" block above: clear the migration gate first (unblocks `dave→main`), then build internal-chat IC-1 → disbursement → china-ops (volume-gated).

**Defer:** Phase I (9 new ecosystem services) until revenue is stable. China-ops is volume-gated.

---

## 🔒 Force-read before any work

1. **[`docs/UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)** — THE canonical forward roadmap (post-launch phase/stage plan)
2. [`docs/research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) — the Tier 0/1/2/3 synthesis + work-split (your pickup list)
3. [`docs/STRATEGY.md`](../STRATEGY.md) — master strategy single-read
4. [`docs/team.md`](../team.md) §1 (your scope) + §3 (daily flow) + §10 (integration cycle)
5. [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S3 (ภูม hand-off triggers) + Part V (cargo/freight backlog)
6. [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — the warehouse + container + shipment data spine
7. [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner integration ก๊อต locks, you wire (the on-record API surface is wrong — wait for ก๊อต to clear it)
8. [`docs/decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) + [`0009-erp-schema-sketch.md`](../decisions/0009-erp-schema-sketch.md) + [`0015`](../decisions/0015-withholding-tax-model.md) + [`0016`](../decisions/0016-freight-value-model.md) — schema specs you implement
9. [`docs/pacred-info.md`](../pacred-info.md) — company DNA (tax ID + legal name for invoice/PDF templates)
10. [`.claude/skills/INDEX.md`](../../.claude/skills/INDEX.md) — skills kit; **`legacy-php-sweep`** is your bread-and-butter for cargo ports
11. [`docs/learnings/_index.md`](../learnings/_index.md) — scan for any new gotcha entries since last session
12. [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) — the decoded cargo/freight ops model behind Part V

## 📂 Legacy reference (your most-touched external source)

**`D:\xampp\htdocs\pcscargo\`** — read-only PHP source for everything in cargo. Use [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md) before every port. Specifically:
- `member/include/function.php` — 2451 LOC business helpers
- `member/include/header.php` — auth + dashboard precompute
- `member/pcs-admin/` — 187 admin files
- DB schema dump `C:\Users\Admin\Desktop\SQLWPPCS\somedata-2026-03-19-1348-pcsc_main.sql` (`Grep` only, never `Read` whole)

---

## Who you are

**100% หลังบ้าน + customer portal + admin back-office + cargo port.** You operate from `Poom`. You:

- Build server actions + DB schema + RLS policies + admin UI
- Bridge frontend ↔ customer backend ↔ admin backend
- Port the PHP `pcs-cargo` legacy to Pacred Next.js + Supabase (Phase 1 = port; Phase 2 = DPX ERP)
- Make the back-office **usable** — UX/UI = easy access, easy understanding
- Build per the container-centric data model — container is the spine

Per เดฟ brief 2026-05-16: "**ทำระบบหลังบ้านต่อ ให้เชื่อมโยงและใช้งานได้จริง และเข้าถึงใช้งานได้เข้าใจง่ายๆ UX UI ลิงค์ Theme เดียวกับหน้าบ้านทั้งหมด ส่วนหน้าฝั่ง Admin sidebar ด้านซ้าย BG ให้ใช้เป็นสีขาว ส่วน พื้นที่ที่เหลือให้ใช้ theme เดียวกับหน้าบ้านทั้งหมด**"

---

## Scope boundaries (per `team.md` §1.3)

✋ **You don't touch:** `app/[locale]/(public)/`, `components/sections/`, `components/booking/`, `components/knowledge/`, `messages/*.json` (ปอน owns)

✋ **You don't touch (lead-only):** `CLAUDE.md`, `docs/team.md`, `docs/conventions.md`, `docs/env.md`, `docs/PORT_PLAN.md`, `package.json`, `.github/`, `next.config.ts`, `eslint.config.mjs`, `proxy.ts`, `vercel.json`

✅ **You own:** `actions/`, `lib/`, `app/[locale]/(auth|protected|admin)/`, `supabase/migrations/`, `app/api/`, `components/admin/`, `components/pdf/`

---

## Current state of your domain

### 🟢 Shipped + in production

- **Customer portal** — `/login`, `/register` (personal + juristic 3-step + OTP), `/dashboard`, `/addresses`, `/service-order` (+ /add /cart /[hNo]), `/service-import` (+ /add /[fNo] /receipt /receipts), `/service-payment` (+ /add), `/wallet` (deposit/withdraw/history, soft-degrade), `/refunds`, `/notifications`, `/liff/link`, `/shipments` (+/[code]), `/forgot-password`
- **Admin back-office (60+ routes)** — HR full (org-chart, employees, recruitment, attendance, leaves, training, policies, audit) · dashboard, customers, admins (RBAC grant/revoke), drivers, csv-imports, hs-codes, containers · accounting (incl. container-costs) · reports · barcode · disbursements · refunds · migration/pcs-customers · global search · system crons + notifications
- **Container-centric model** — the 4-table warehouse/container/shipment spine + customer + admin views (CT-1..CT-8) shipped at launch
- **Tax-invoice issuance** (per ADR-0006) · pay-from-wallet self-serve (shop + forwarder) · receipt PDF · customer credit line · staff RBAC console
- **V-ADM1 admin UI polish** — left sidebar white (`bg-white dark:bg-surface`) · shared theme tokens · public red-cloud body background on the `/admin` shell
- **U1/U2/U4 + Tier 0/1/2** — wire-the-flow · revenue/margin · supervisory layer · `work_items` work-board (`0080` + `/admin/board` + `/admin/inbox`) — shipped on `dave`

### 🟡 In-flight / follow-up

- The migration-gate apply (`0058`-`0080` to prod) — pickup #1
- U1/U2 review follow-ups P1-2..P2-7 — pickup #3
- MOMO JMF sync — blocked: ก๊อต must clear the wrong-on-record MOMO API host/format first
- Xendit + K-Biz + K-Shop payment-gateway wire-up — T+30d, per [updated D-7 §5.3](../decisions/d7-payment-gateway-decision-matrix.md) (~16-22h, 3 channels); ลูกพี่ + พี่ป๊อป handle vendor signups in parallel

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| Can't apply migrations to prod (access issue) | Build internal-chat IC-1 — the design is ready; the migration starts at `0073` |
| MOMO endpoint inventory (ก๊อต clearing the API docs) | Disbursement system design is MOMO-independent — build it |
| A locked ADR question on a Tier-3 design | Move to the next Tier-3 system in the order, or take a U1/U2 review follow-up |

**Note back to เดฟ + ก๊อต when:** you need a partner API confirmed (MOMO), a new env var, an architectural choice, or an external service.

---

## Hand-offs IN

- **ก๊อต** ADRs (locked design contracts) → you implement
- **เดฟ** schema spec drafts + ADR scaffolds → you finalise + apply
- **ปอน** theme tokens + landing components → you reuse in admin UI

## Hand-offs OUT

- Schema migrations (`supabase/migrations/00NN_*.sql`) → applied to production Supabase (gates the `dave→main` deploy)
- Backend feature PRs in `Poom` → เดฟ merges into `dave`
- DECISIONS log entries (in commit messages) → ก๊อต/เดฟ adjust retroactively per `team.md` §6

---

## Push discipline (STRICTER per memory `push_frequency_strict`)

- Commit local freely during long backend sessions
- **Push to `origin/Poom` only at save-points** — end of session / before sleep / machine change / big batch done
- Per session: 1 push max
- เดฟ pulls from `origin/Poom` periodically to consolidate

## Cross-links

- [`docs/team.md`](../team.md) §1.3 — your scope boundaries
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V — cargo + freight backlog
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — your data spine
- [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner spec (blocked on ก๊อต)
- [`docs/decisions/`](../decisions/) — ADRs you implement
- [`docs/conventions.md`](../conventions.md) — code style, action shape, migration rules
- [`docs/briefs/ops-roles.md`](ops-roles.md) — staff role → admin workspace mapping
