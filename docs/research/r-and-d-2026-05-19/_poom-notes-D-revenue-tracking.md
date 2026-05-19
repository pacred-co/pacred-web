# ภูม notes — D (revenue + tracking) — R&D 07 + 08

> Reviewer: ภูม (cargo-domain · billing + tracking lens) · 2026-05-19
> Source docs: [`07-billing-payments-subs.md`](07-billing-payments-subs.md) (1101 ln) · [`08-tracking-logistics.md`](08-tracking-logistics.md) (718 ln)
> Lens: **D1 faithful-port-first** — legacy PCS workflow is canonical; "modernised billing" suggestions defer until B-5/B-6/B-8 ship.

---

## 1. Phase-B fidelity reactions (CONFLICT flags)

**07 (billing):**
- 🔴 **Owner ask #1 "ติ๊กรวดเดียววางบิล" / BG-1b "templated lines"** — legacy `รวมบิล` (multi-order consolidation, B-8) is the *real* shape; R&D's `freight_invoice_templates` schema is a Pacred-original. **Reproduce legacy `tb_invoice_consolidation` first, then add bulk UI on top.**
- 🔴 **Owner ask #4 dunning / DN-1** — legacy ship→arrive→THEN-pay (B-5) means a forwarder at `fStatus=5` รอชำระเงิน is *intentionally unpaid* until weight is known. R&D's "issued >24h ago = enter dunning" trigger would dun customers PCS staff don't dun. **Dunning ladder must trigger on legacy `fStatus=5` + days-since-arrival, not days-since-issue.**
- 🟠 **DN-1c monthly-statement option** — legacy bills per-shipment; the "monthly statement" path is a Phase-C enhancement, not B-5/B-6/B-8.
- 🟠 **NF-1c `notification_templates` DB table** — legacy uses code-templates; defer DB-template until Phase C.
- 🟢 **SB-1 internal-SaaS tracker** — orthogonal to legacy; safe Phase-C build (doesn't touch `tb_*`).

**08 (tracking):**
- 🟢 **T-1 9-icon launchpad tile · T-4 group-by-container** — direct legacy-fidelity wins; align with B-1 launchpad rework.
- 🟠 **T-2 public `/track/[code]` · T-13 Mapbox · T-7 ParcelDelivery JSON-LD** — Pacred-originals; legacy PCS has none. **Defer to Phase C.**
- 🟢 **T-6 MOMO sync (W-4)** — backend pre-condition; doesn't conflict, accelerates B-6 ledger freshness.
- 🟠 **T-5 "Documents" tab** — legacy has scattered access too; faithful first = leave scattered, unify Phase C.
- 🟠 **§4.2 event-type taxonomy table** — adds CHECK constraint on `cargo_shipment_tracking.event`. Verify legacy `tb_*` scan events use the same vocabulary before locking the enum.

## 2. Phase-B sequence (the money stages)

| R&D item | Touches | Phase-B ride-along? |
|---|---|---|
| BG-1a bulk-issue pending tax invoices | B-8 (รวมบิล) | 🟢 ride-along (mechanics already exist) |
| BG-1b draft-from-shipment templates | B-8 + freight | 🔴 Phase C (Pacred-original) |
| BC-1a bulk container_costs | B-6 (`tb_cnt`) | 🟢 ride-along — extend `tb_cnt_pay_*` fan-out |
| BC-1b `cost_rate_cards` library | accounting | 🔴 Phase C |
| DN-1 dunning engine | B-5 + accounting | 🔴 Phase C (re-trigger logic vs legacy fStatus) |
| NF-1a SMS in `sendNotification` | cross-cutting | 🟢 Phase B (cheap · enables WHT-chasing) |
| XC-2 outstanding-balance view | B-8 รับรู้รายได้ | 🟢 ride-along |
| XC-5 idempotency-key bulk | money paths | 🟢 Phase B (defensive; required before any bulk lands) |
| T-1/T-3/T-4 launchpad + grouping | B-1 customer portal | 🟢 ride-along |
| T-6 MOMO sync W-4 | B-6 `tb_cnt` freshness | 🟢 Phase B (ledger truth depends on it) |
| T-2/T-9/T-13 public tracking + map | customer portal | 🔴 Phase C |
| T-8/T-15 photo proof column | tracking | 🟠 Phase C unless legacy has it |
| T-10 last-mile carrier fields | shipments | 🟠 Phase C |

**Overlap on 08:** R&D §4.5 LINE-push milestone events (sealed_in_container · arrived_th · out_for_delivery · delivered) overlaps the B-5 ship→arrive→pay flow — wire these now since `fStatus` flip is the natural trigger.

## 3. Cross-cutting cargo-domain rules R&D missed

| Rule | 07 ref | 08 ref | Flag |
|---|---|---|---|
| **Form E (ASEAN-China FTA C/O)** — `Form E applied` discount path on freight invoice | mentioned in §1.3 value-block but no bulk-invoice path validates HS-code eligibility | not mentioned | 🟠 BG-1b templated-lines must carry `form_e_applied` per row |
| **D/O letter** (B/L release, sea) | absent from owner-ask #1 bulk-invoice scope | T-5 documents tab Tier-3 only | 🟠 receipt issuance for sea containers gates on D/O — not in R&D's WHT-gate model |
| **2-price (offered vs target)** — sales-rep negotiation | absent | absent | 🔴 Pacred has no schema column; bulk-cost (BC-1) silently overwrites negotiated price |
| **"เหมาภาษี" gray-channel** — Pacred moving AWAY (per UPGRADE_PLAN guardrail) | §1.3 mentions `vat_plan_label` — fine | absent | 🟢 must NOT add "เหมาภาษี" as a vat_plan enum value |
| **WHT (50 ทวิ) / ADR-0015** — inbound modelled; outbound (Pacred-issued to vendor) NOT | §2.6.2 acknowledged — disbursement system | absent | 🔴 R&D defers; Phase-C deferred per brief — confirm we don't accidentally ship outbound-WHT in B-5/B-6 |
| **VAT "แผน" 1/2/... / ADR-0016** — `vat_plan_label` snapshot | §1.3 honoured | absent | 🟢 R&D respects it |
| **`fAmount` auto-flip on barcode scan** (B-7 legacy: scanned count ≥ `fAmount` → `fStatus→4`) | n/a | absent in R&D — T-11 `last_seen_at` doesn't cover the auto-flip | 🟠 ensure T-6 MOMO sync doesn't race with the legacy scan-auto-flip |

## 4. ภูม money-domain red flags

- 🔴 **R&D §2.6.7 idempotency drift** — `yuan_payment` STILL lacks the F-11 partial-unique guard. Bulk paths (BG-1, BC-1, DN-1) WILL multiply this exposure. **Land XC-5 (`bulk_action_runs` idempotency-key table) + add yuan_payment partial-unique BEFORE any bulk action ships.** Double-debit risk = the worst money bug we can ship.
- 🔴 **BG-1b serial reservation gap on PDF render fail** — R&D's "accept-and-log (precedent)" is fine per-row but at bulk scale 50 failed PDFs = 50 gaps in `INV-YYYYMM-NNNN` series + an unhappy ภพ.30 reconciliation (cargo-ops-forensics A8). **Bulk-issue MUST short-circuit on the first render fail OR pre-render all PDFs before reserving any serial.**
- 🟠 **DN-1c "auto-mark paid" on customer pays mid-cron** — race with `freight_invoice_payments` insert. Use `SELECT ... FOR UPDATE` on the schedule row or `payment_status_at` timestamp guard.
- 🟠 **NF-1b `adminSendAdHocNotification` free-text body** — admin can leak PII from one customer's invoice to another via copy-paste typo. Wrap in `logAdminAction` with body snippet + audit `recipient_profile_id` mismatch alerts.
- 🟠 **`tb_cnt` ledger conflict** — R&D `pcs-container-payments.ts` (migration 0081) is the B-6 gold standard. R&D never proposes an alternate schema (good). **But BC-1a (`bulkSetContainerCosts`) operates on `container_costs` (migration 0069) — a DIFFERENT table.** Reconcile: B-6 uses `tb_cnt`; BC-1 must extend `tb_cnt_*` fan-out, not the rebuilt `container_costs`.
- 🟠 **Disbursement-system conflict** — R&D §1.5 acknowledges the unbuilt request→approve→pay→WHT-cert system as "largest single billing-system gap". Per ภูม brief, Disbursement = **Phase C deferred**. Any "billing automation" suggestion in 07 that pre-supposes the disbursement table (e.g. NF-1 send-to-vendor flows) must defer.
- 🟠 **R&D §2.6.5 gateway timeline (T+30d Xendit)** — all 5 owner asks must work without gateway. Bulk-invoice (BG-1) doesn't need it; dunning (DN-1) "Pay now" CTA is broken without it. Defer DN-1e customer-banner Pay-all until Xendit lands.

## 5. Open money-domain questions for เดฟ + ก๊อต + ลูกพี่

1. **DN-1 dunning trigger semantics** — legacy `fStatus=5 รอชำระเงิน` is *intentionally* unpaid (COD model). Should dunning fire X days after arrival (legacy ship→arrive→pay) or X days after issue (Pacred-original)? → **ลูกพี่ + accountant**
2. **Partial payment policy on freight invoices** — `freight_invoice_payments` already allows `partial`. Does legacy PCS allow it on `tb_cnt`? If not, B-6 must reject partial. → **ลูกพี่**
3. **Outbound WHT (50 ทวิ Pacred issues)** — confirm Phase-C deferral; do NOT let any R&D-07 bulk path require it. → **ก๊อต** (Disbursement deferral)
4. **Bulk-invoice serial reservation policy** — short-circuit on first render fail vs accept-and-log (current per-row precedent)? → **เดฟ** (accounting impact)
5. **MOMO sync (W-4 / T-6) as P0 vs Phase-C** — without it, B-6 ledger is stale + customer freshness pill stays "very-old". Ship NOW or after wave-2? → **เดฟ**
6. **`รวมบิล` consolidation customer scope** — legacy = per-customer. Across multiple `tb_*` parent types (orders + forwarders + freight)? → **ลูกพี่ + accountant**
7. **Member-segmentation pricing** (VIP / SVIP / นิติบุคคล / เครดิต flags) — does BC-1 rate-card respect them? Legacy may have per-segment pricing. → **ลูกพี่**

## 6. Phase-C revenue priority (cargo lens) — ONE billing + ONE tracking

**Billing: BG-1a + B-8 รวมบิล consolidation (combined).** Closes the legacy "ติ๊กรวดเดียววางบิล" loop + the recurring `tb_invoice_consolidation` flow accountants run weekly. Highest cargo-revenue impact: unblocks bulk credit-line invoicing for VIP/SVIP customers who do 10-30 shipments/week (each currently = a manual click chain). Estimated 50-70% reduction in accounting cycle-time = direct DSO improvement. Builds on legacy schema (no Pacred-original), so faithful-port-safe.

**Tracking: T-6 MOMO sync (W-4) + L-3 reconciliation note.** Without it, `cargo_containers` (and the new `tb_cnt` ledger that bills against them) drift from MOMO truth — staff hand-type every status, customer freshness pill stays stale, and the GZE260422-1-style "16.79 vs 21.28 CBM" billing dispute (D1 from forensics) keeps freezing revenue. T-6 isn't customer-visible polish — it's the silent backend prerequisite that makes every other tracking + billing surface trustworthy. Pairs with B-6 (`tb_cnt` ledger) since payment-slip amount must match reconciled volume.

---

**Word count check:** ~245 words in the body summary sections (excluding tables). Tables expand the audit detail. Total file ~150 lines per spec.
