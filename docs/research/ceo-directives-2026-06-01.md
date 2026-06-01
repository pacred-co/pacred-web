# 🎖 CEO directives (2026-06-01 · opening day) → Pacred tech work plan

The CEO/founder's strategic message on opening day. This **re-prioritises** the master plan
(`big-audit-2026-06-01/_MASTER-PLAN.md`): the North Star is now **"ธุรกิจที่รันได้เองโดย CEO ไม่ต้องลงมือ"**
— systematise so it self-runs — and **scale within 3-4 months** via 3 missing pieces. Read with the master plan.

> CEO verbatim north star: *"พี่อยากลองทำธุรกิจโดยไม่มีพี่ลงไปทำ"* + scale-blockers = **CRM ทั้งระบบ · การตลาด (SEO/ads/content) · อบรม+เซ็ตติ้งให้ทีมทำตามระบบมาตรฐาน**.

---

## §1 — Org structure (CEO chart) → RBAC + department workspaces
CEO → **Commercial & Growth** (Sales · Marketing · CS) · **Commercial Operations** (Pricing · China Trade) ·
**Customs & Compliance** (Customs Specialist · Shipping Doc · Customs Clearance) · **Freight Operations**
(Freight Doc · Freight Coordination) · **Transportation** (Fleet · Logistics Engineering) · **Warehouse** ·
**Technology** · **Finance & Admin** · **Future Business** (Sourcing · Export Development).
→ **Tech work:** the RBAC overhaul + the 13-admin recreate must map roles to THIS chart (departments + positions);
each department needs its admin workspace/queue. Threads `org_branches/sections/positions` (already in schema) +
master-plan Theme 6 (RBAC) + `docs/briefs/ops-roles.md`.

## §2 — Holding group (Global Trade Group) → multi-company (long-term)
**Pacred Holding** → Pacred Service · Pacred Marketplace · Pacred Logistics · Pacgold Trading · PacBrand
Thailand · Pacgreen Manufacturing. → Our system today = the Service/Logistics/Marketplace core. **Long-term:**
multi-company / multi-tenant architecture (each entity its own books + brand). Note for the platform roadmap;
the CargoThai partner-portal/API-as-a-service (Theme 7) is the same multi-tenant muscle.

## §3 — Accounting tax-doc model (CEO concrete SPEC — ภูม PEAK lane)
The 3 document modes per service (sharpens ADR-0006 + the WHT engine):
- **ฝากสั่ง (shop-order):** ใบกำกับ / ใบขน / ไม่รับเอกสาร.
- **ฝากโอน + ฝากนำเข้า (yuan-transfer + import):** ใบกำกับ / ใบขน / ไม่รับเอกสาร — **invoice eligibility rule:** to issue
  a ใบกำกับ the customer MUST ฝากโอน with us (we treat it as a domestic sale of the goods under our name).
- **บริการทางบัญชี (the VAT treatment):**
  - **ใบกำกับ (tax invoice):** buy goods from us · VAT 7% on goods value · entered on the import declaration under OUR name · pay import tax + book to stock · issue tax invoice.
  - **ใบขน (customs declaration):** customs-clearance service (import) · VAT 7% on the *service fee*.
  - **ไม่รับเอกสาร (no docs):** facilitation service (profit booked to tax) — payment convenience only.
→ **Tech work (ภูม):** the PEAK accounting module + `tb_forwarder_tax_invoice` (RD-86) must implement these 3 modes,
the per-service VAT base (goods-value vs service-fee), and the invoice-eligibility gate (ฝากโอน-with-us). Add to `docs/briefs/poom-wave-2026-06-01.md`.

## §4 — Pricing + quote-comparison (CEO sales/pricing directive)
- **Profit cap:** งานตู้ (container) **กำไรต้องไม่เกิน 15,000 ฿/ตู้** — customer max value. → a **margin-guard / profit-cap
  rule** in the rate/cost engine (extends the master-plan "margin-guard" P0). Pricing team sets, system enforces.
- **Quote-comparison tool (NEW · for Sales):** สร้างระบบทางเลือกให้เซลขายลูกค้า — compare รถ/เรือ/แอร์ + บริการเสริม,
  show the customer side-by-side options + price. → a sales-facing **quote builder** (threads `freight_quotes` +
  `getShipBy` carrier-picker + the rate engine). This is the #1 sales-enablement tool.
- Sales training / close techniques = process (CS/Sales lane), but the CRM must support scripts + funnel stages.

## §5 — The 3 scale-blockers (CEO · scale in 3-4 months) — TOP priority
1. **CRM ทั้งระบบ (full-workflow CRM)** — lead capture → assign rep → call-queue → funnel stages → omni-inbox
   (LINE+FB) → customer-360 → close. = master-plan Theme 2, now **CEO-priority #1**. (เดฟ + ปอน)
2. **Marketing (SEO / ads / content-clip + image + keywords)** — SEO (landing/JSON-LD exists) + **ad-ROAS tracking**
   (Podeng `meta_ads` + lead-sources) + content/keyword infra. (ปอน · Theme 2)
3. **Workflow-standardisation + training** — the system **enforces the standard process** so anyone follows it
   (the self-running-business north star) + onboarding/training surfaces. (เดฟ · Theme 6 + automation)

## §6 — Customer-acquisition kickoff (CEO: START NOW · พรุ่งนี้เช้า) ⚡
**Phase 1:** call ALL old **AX** customers + **only the big PCS** customers. **Phase 2:** ads → page/LINE + web
signups. **Rule:** follow up from the **day-1** the customer sends a phone → call to close.
→ **Tech support (the urgent build):** a **call-queue / lead-list** for Sales+CS:
- **Data ready NOW:** `tb_users.userActive=''` = **6,937 never-activated leads, 6,936 with a phone** (`userTel`) →
  the primary call list. Big-PCS = top owners across the 47,636 `tb_forwarder` orders (rank by order count/value).
- ⚠️ **Clarify (owner):** "AX" is NOT separable in the data — `userRegisterWith`='PCS' across the whole base. Need
  the AX-identifier (a coID? a separate list the sales team holds? a `channel` code?) to split AX vs PCS-big.
- **Build:** an admin **`/admin/leads` call-queue** — phone · name · last-order · lifetime-value · assigned rep ·
  call-status (called/closed/no-answer) — sales work it top-down; day-1 web/LINE phone-submits auto-enqueue +
  notify the rep. (= the lead win-back surface, now the revenue-critical acquisition engine.)

---

## §7 — Re-prioritised tech roadmap (what เดฟ does, in CEO order)
1. **NOW (revenue · acquisition):** the **call-queue/lead-list** (`/admin/leads`) on the 6,936 callable cold-leads +
   big-PCS ranking → so Sales+CS call tomorrow. + day-1 phone-capture→notify→close tracking.
2. **CRM core (scale-blocker #1):** omni-inbox + funnel + customer-360 (with ปอน).
3. **Pricing system:** profit-cap (≤15k/ตู้) margin-guard + the sales quote-comparison tool.
4. **Accounting spec (ภูม):** the 3 tax-doc modes + VAT bases + invoice-eligibility (§3) into the PEAK module.
5. **Marketing infra (ปอน):** ad-ROAS dashboard + SEO/content.
6. **RBAC org-structure + workflow-standardisation** (the self-running business).
7. **Then:** the BI/data-activation + CargoThai (master-plan Themes 1/7) feed all of the above.

> The audit's "activate the data" thesis + this CEO message agree: **the data + the system must turn the
> sales/ops process into something that runs itself.** Acquisition-engine + CRM + pricing + standardised-workflow
> are now ahead of pure BI in sequence (BI still informs them).
