# 🌏 MASTER full-scope re-plan — Cargo + FREIGHT + CEO directives (2026-06-01)

Synthesis of the 4 freight-knowledge cluster docs (`01-line-chats-ops` · `02-pricing-booking-model` ·
`03-freight-web-systems` · `04-customs-docs-accounting`) × the big-audit (`../big-audit-2026-06-01/_MASTER-PLAN.md`)
× CEO directives (`../ceo-directives-2026-06-01.md`). This is the "re-plan scope สั้น/ยาว" the CEO asked for after
absorbing the freight side. **The freight side is now fully decoded — it's a BUILD, not a discovery.**

---

## §1 — The complete picture (what Pacred actually is)

**Pacred = ONE legal entity (`0105564077716`) running TWO product lines on ONE shared partner network.**

| | **CARGO** (PCS) | **FREIGHT** (AXELRA / NNB) |
|---|---|---|
| What | China→TH consolidation (ฝากสั่ง/นำเข้า/โอน) · self-serve wallet · per-kg/CBM | B2B FCL/LCL/AIR/cross-border-truck + **customs brokerage** · sales-led · per-shipment |
| Customer | retail, 8,928 `tb_users` (PR codes) | company importers (AX###/PR codes) · higher-margin (3k–20k฿ profit/job) |
| Status in our system | **PORTED** (legacy PHP → `tb_*` · money loop closed · ~90%) | **UN-BUILT** (runs on Google Sheets + Apps Script today) |
| Tax-doc | receipt | **3 modes** ใบกำกับ/ใบขน/ไม่รับเอกสาร (CEO §3 · confirmed from real docs) |

**The partner net (verbatim equivalences decoded): `psc(pcs)=ttp` · `momo=jmf(ไอแต้ม)`.** TTP/JMF/MOMO/CARGO
CENTER/ALI all key into **ONE CargoThai (Laravel · `cargothai.tech`) instance** (proven by `containers.csv`: TTP 475
· JMF 215 · MOMO 170 · CARGO CENTER 104). AXELRA *consumes* CargoThai's API; Pacred *consumes* MOMO's API — **we
are a downstream consumer of the same warehouse SaaS.** NNB (`0115567039173`) = the borrowed importer-of-record /
bill-to for no-doc jobs. AX+TTP closed containers together → split → AXELRA now closes with MOMO (mirrors Pacred's
"MOMO instead of TTP" switch). **JMF/ไอแต้ม (TISO) = the dev shop that built PCS-web + runs the MOMO status-API** —
the single-point-of-failure ("เว็บล่ม" constantly) we must replace.

## §2 — READY assets (we are NOT starting from scratch — huge head-start)

| Asset | Where | What it gives us |
|---|---|---|
| **PJ-BOOK/axelra-erp/** Prisma schema | the folder | **10-model freight schema** (User·Customer·**Shipment**·DocData·DocPlan·Messenger·PricingRequest·AccStatement·AccShipment·PricingStatus) converted straight from the booking workbook — adopt as Pacred `freight_*`. Shipment already has ETD/ATD/ETA/ATA + full commission + HR-payout cols. |
| **AX BOOKING.html** | the folder | production-grade UX spec for the **freight quote wizard** (5-step · Incoterm logic · doc-by-context · volumetric air weight `CBM×167` · carrier picker · live price waterfall) |
| **AX JOB.html** | the folder | UX spec for the **ops cockpit** — PRICING→SALES→DOC→ACC Kanban + per-stage checklists + per-shipment P&L + commission calc (5%+5%+1% −3%WHT) |
| **CGTH/** | the folder | a working **Vercel+Supabase rebuild of CargoThai public `/track`** (`containers`+`products` tables + `/api/tracking`) — proof the USP runs on OUR stack |
| **AXELRA Cost&Profit + booking + IMPORT-quote xlsx** | the folder | the full **rate cards** (SEA-FCL per-container · LCL per-CBM · AIR per-KG breaks · truck) + Incoterm×mode price book + 3-tier sell + the per-job P&L ledger |
| **FORM/ doc kit** | the folder | every customs doc template (DO-LOI ZIM/RCL/COSCO/HEDE/FUJIT/UPS · Form-E · ZIM Split-DO · 45-day waiver · POA · amend · port codes) |
| **P'BEE tax-invoice template** | the folder | the **3-tab Sales→ใบขน-keyer→Accounting pipeline wired to PEAK** — maps onto ภูม's PEAK lane exactly |
| **เครื่องมือสรุปการโทรออก.xlsx** | the folder | the **call-CDR → per-rep call-queue** model (3CX-style) — the acquisition-engine spec |

## §3 — RE-PLANNED SCOPE

### 🔴 SHORT (now → ~4 weeks · the CEO "scale in 3-4 months" + revenue-now)
*(threads the existing big-audit Wave A/C — these stay, plus the acquisition + freight-entry)*
1. **Acquisition engine** (CEO §6 · revenue NOW) — `/admin/leads` call-queue on the **6,936 callable cold-leads** + big-PCS ranking + day-1 phone→notify→close; ingest the call-CDR model for per-rep KPI. (เดฟ) ← the thing the CEO wants tomorrow.
2. **Cargo trust-sweep + money** (Wave A — in progress) — Potemkin sweep done (VIP/yuan), credit-line + cashback (await ADR-0023/0025), config (ADR-0024).
3. **CRM core** (scale-blocker #1) — omni-inbox (LINE+FB) + lead funnel + customer-360 + rep-routing (the CEO §5 "no-handoff" ask). (เดฟ+ปอน)
4. **Freight quote-funnel MVP** — port **AX BOOKING.html** → a public freight quote wizard at `/services/import` (Incoterm × mode × the rate cards) → creates a `freight_quote` lead. This opens the freight revenue line + feeds the pipeline. (เดฟ+ปอน)
5. **Pricing guard + comparison** (CEO §4) — profit-cap **≤15k฿/ตู้** margin-guard in the rate engine + the sales quote-comparison (รถ/เรือ/แอร์) tool.
6. **BI** (Wave C — profit + SLA shipped) → add AR-aging + exec cockpit. (เดฟ)
7. **Accounting 3-tax-doc modes + PEAK** (ภูม) — implement ใบกำกับ/ใบขน/ไม่รับเอกสาร VAT bases + ฝากโอน-eligibility gate + PEAK push (the P'BEE pipeline) + repoint the Potemkin commission pages.

### 🟢 LONG (months · the full platform · "สุดยอดผลงาน")
8. **FREIGHT ERP (Theme 8 — the whole second business)** — adopt the **PJ-BOOK Prisma schema** as Pacred `freight_*` (Supabase); ship **AX JOB.html** as `(admin)/admin/freight/*` — the PRICING→SALES→DOC→ACC pipeline cockpit + per-shipment RBAC + P&L + the multi-tier freight commission engine (1%+5%+5% · DOC flat-20 · PC bonus · 25/loc messenger · −3%WHT).
9. **Customs-brokerage automation (the moat)** — `freight_declaration` (ใบขน) + **NETBAY** e-filing + **Form-E/ACFTA** eligibility + **HS-code AI-assist** (the `ท่า Port.txt` prompt is a ready system-prompt) + **DO-release LOI generator** (templated from FORM/) + **ตั๋วพ่วง** container-share cost-split + the customs-letter kit (45-day/amend/POA/lost-doc) + port-code master. *No Thai cargo competitor offers self-serve customs filing.*
10. **Freight P&L + disbursement ledger** — the `freight_disbursement` (outbound vendor ledger · category · WHT · whose-receipt · pay-status · reconciled to quote) = the real freight P&L + AR/AP + the ≤15k margin-guard data + 4-part doc-set close.
11. **CargoThai PROVIDER platform (Theme 7 · now grounded)** — own-warehouse intake worker-app (CargoThai blueprint) + public **`/track/{code}`** (CGTH proves it on Supabase) + partner-portal (TTP/JMF/MOMO key into US) + API-as-a-service lease. We stop *consuming* CargoThai and *become* it.
12. **Unify portals + holding** — ONE Pacred login → cargo (PCS) + freight (AXELRA) · one wallet · one `/track` front door. Multi-company books for the **Global Trade Group** (Pacred Service/Marketplace/Logistics/Pacgold/PacBrand/Pacgreen).
13. **De-risk** — bring status-sync + receipt/doc generation in-house (replace TISO single-point); keep MOMO/JMF/CargoThai partner APIs as *inputs*, not the system of record.

## §4 — Ownership
- **เดฟ:** acquisition call-queue · CRM core · freight quote-funnel + the `freight_*` schema adoption (PJ-BOOK) + AX JOB cockpit · BI · pricing margin-guard.
- **ภูม:** accounting (3 tax-doc modes + PEAK + P'BEE pipeline) · freight P&L + disbursement ledger · commission engine (cargo+freight unified) · ตั๋วพ่วง.
- **ปอน:** freight booking wizard (AX BOOKING) + public `/track` + CRM omni-inbox UI + marketing/SEO/ad-ROAS.
- **ก๊อต:** customs-brokerage integrations (NETBAY/Form-E) · CargoThai provider-API + partner-portal · the partner-API consolidation.

## §5 — The one-paragraph thesis (for the CEO)
Pacred already owns the platform (Supabase/Next) and has **ported the cargo half**. The folder proves the **freight
half is a fully-specified BUILD** — there's a ready Prisma schema, two production-grade UX prototypes, a working
Supabase `/track` rebuild, complete rate cards, and the entire customs-doc kit. The win is to (a) launch the
**acquisition engine + CRM** now (revenue + the CEO scale-blockers), (b) open the **freight quote funnel** to start
freight revenue, then (c) build the **freight ERP + customs-brokerage automation + CargoThai-provider** so Pacred
becomes the **full-loop import-export platform** — cargo *and* freight, self-serve customs filing, partners keying
into us — the "runs-itself" business the CEO wants. **Nothing here is unknown anymore; it's execution.**

> Compliance note (flagged in 01/04): the chats contain duty-avoidance/value-engineering + "ราคาเจ้าหน้าที่"
> facilitation. Build the **compliant core** (HS lookup, Form-E, genuine VAT/WHT, NETBAY) — record gray-area
> mechanics as data, don't automate-and-advertise them.
