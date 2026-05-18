# 📚 `docs/research/` — R&D folder index

> **What this folder is.** R&D / audit / gap-hunt docs produced 2026-05-17 by
> parallel sub-agents, decoding the legacy PCS / AXELRA / NNB / TTP / CargoThai /
> MOMO systems from LINE-chat exports, scraped HTML, legacy PHP + Apps Script,
> a pre-launch audit of `pacred-web` itself, and a 5-angle source-code gap-hunt.
> They are the raw evidence base for Pacred's next-phase functional build-out —
> **the "why" behind the roadmap.**

## How to use this folder

1. **Start with [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md)** — the
   top-level synthesis. It chains the 5 gap-hunt docs + the prior 19-item
   roadmap into **4 problems** (the P0 security keystone, the wallet-leak chain,
   the "islands with no bridges" theme, and the consolidated **Part W**
   backlog). Read it first.
2. **Then [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)** — the earlier
   synthesis (the `R-1..R-19` roadmap) that the master strategy extends. It
   rolls the 8 R&D/audit docs into one leak-hole list + Pacred coverage map.
3. **The 5 `gap-*.md` docs** are the source-code gap-hunt the master strategy
   chains — open one when you need the per-finding detail.
4. **Source docs are evidence, not plans.** Each decodes one slice of the legacy
   operation. They cite chat dates + file names so a claim can be traced.
5. **These are lessons to ADAPT, not a system to copy.** The legacy chats expose
   gray-channel / declared-value / tax-evasion patterns. Those must **never**
   enter Pacred code — see the "Pacred identity guardrail" in the gap analysis.
6. **Scheduling lives elsewhere.** Roadmap items feed [`../PORT_PLAN.md`](../PORT_PLAN.md)
   Part V + Part W. This folder does not track task status.

## Index — one line per doc

### Synthesis (read these first)

| Doc | Topic | Date |
|---|---|---|
| [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md) | **Master synthesis** — chains the 5 gap-hunt docs + the R-1..R-19 roadmap into 4 problems: the P0 security keystone, the wallet-leak chain, the "islands with no bridges" theme, and the consolidated **Part W** backlog | 2026-05-17 |
| [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) | **Earlier synthesis** — leak holes + Pacred coverage map + prioritized next-phase roadmap `R-1..R-19` (integrations + monitoring) | 2026-05-17 |
| [`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md) | **Post-launch capability & tools master synthesis** — chains the growth-acquisition + operating-system + tools-build-vs-buy analyses: Pacred's bottleneck is CONNECTION not capability; customer-acquisition Tier-0 (switch on analytics + wire ContactForm) = #1; build-in-house over buy; the unified Tier 0/1/2 roadmap | 2026-05-18 |

### Source-code gap-hunt (5-angle drill)

| Doc | Topic | Date |
|---|---|---|
| [`gap-customer.md`](gap-customer.md) | Customer-side gap-hunt — credit-line dead UI, no claim/refund loop, stacked-pending-debit overdraw; G-C1..G-C6 + H-1..H-6 | 2026-05-17 |
| [`gap-admin.md`](gap-admin.md) | Admin/back-office gap-hunt — missing read-side authz on 11 finance pages, no audit-log search, no RBAC console; G-1..G-10 + H-1..H-7 | 2026-05-17 |
| [`gap-revenue-flow.md`](gap-revenue-flow.md) | Revenue-flow gap-hunt — quote→order→billed→closed has no edges: container status never propagates, freight chain is stubs, no auto-close; Stage 1-9 + H-1..H-8 | 2026-05-17 |
| [`gap-integrations-tools.md`](gap-integrations-tools.md) | Integrations & monitoring gap-hunt — 5 tools installed-and-forgotten (env-gated no-ops), MOMO sync has no cron/caller; G-1..G-13 | 2026-05-17 |
| [`gap-schema-security.md`](gap-schema-security.md) | Schema & security gap-hunt — `warehouse`/`driver` RLS privilege escalation, IDOR-fragile admin-client pattern, no DB-level audit; S-1..S-8 + G-1..G-7 | 2026-05-17 |

### Evidence base (decode + audit)

| Doc | Topic | Date |
|---|---|---|
| [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) | Dev/IT chat decode — single-dev bottleneck, web outages, MOMO read-only API, HS/VAT desk, leak holes DI-1..DI-16 | 2026-05-17 |
| [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) | Ops/transport chat decode — China→Mukdahan truck + sea route, "ของอยู่ไหน" status-relay failure, leak holes OT-1..OT-14 | 2026-05-17 |
| [`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md) | Sales/pricing/HR chat decode — 3-human quote relay, lead ownership, commission disputes, leak holes SP-1..SP-8 | 2026-05-17 |
| [`legacy-chat-datanew-2026-05-17.md`](legacy-chat-datanew-2026-05-17.md) | `datanew` drop decode (launch-eve) — **corrects the MOMO API host/format** (`api.momocargo.com:8080` REST, not `alilogisticshub.com/?api=`), day-1 billing acceptance script, billing-reconciliation gap proven by screenshots, new items DN-1..DN-5 | 2026-05-17 |
| [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) | MOMO partner API decode — `?api=` endpoints, 9-status enum, wallet/credit Pay-Later pivot (2026-05-15), 6 known data bugs | 2026-05-17 |
| [`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) | TTP + CargoThai decode — carrier partners (not APIs), the `booking.php` 8-tab quote-calculator formulas (exact) | 2026-05-17 |
| [`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md) | AXELRA/NNB accounting decode — AR/AP dual ledger, เบิกเงิน + กองกลาง float, PEAK/NetBay stubs, 10 money-handling risks | 2026-05-17 |
| [`audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md) | Pre-launch money audit of `pacred-web` — 2 P0 money-loss bugs, 5 P1s, money-math verification, gateway-readiness gap | 2026-05-17 |
| [`audit-system-2026-05-17.md`](audit-system-2026-05-17.md) | Pre-launch whole-system audit of `pacred-web` — build/verify green, 155 routes smoked, 1 contained 502, GO verdict | 2026-05-17 |
| [`prelaunch-verification-2026-05-17.md`](prelaunch-verification-2026-05-17.md) | Pre-launch code-level verification audit — traced all 5 launch-critical paths (auth · wallet/money · admin RLS · order/forwarder · tax/WHT); confirmed W-1/W-3/S-3/S-4 + migrations 0062/0063/0064/0053 landed correctly line-by-line; 🟢 GO, 3 non-blocker findings F-1..F-3 | 2026-05-17 |
| [`qa-flow-run-2026-05-17.md`](qa-flow-run-2026-05-17.md) | First functional QA pass (post-launch, `qa-flow-simulator` skill) — 3 pass / 0 fail / 8 blocked; 0 code defects; dev Supabase `gnortvyazfmocvcbvfbs` found DELETED (blocks local QA); **production Supabase `yzljakczhwrpbxflnmco` probed + verified ALIVE** — launch confirmed fine | 2026-05-17 |
| [`review-u1-u2-2026-05-18.md`](review-u1-u2-2026-05-18.md) | Read-only code review of ภูม's U1 + U2 batches (refund money path · billing-gate · container unify · freight chain · PCS migration · cargo_sacks · migrations 0058/0059/0066/0067/0068) — 1 P0 (refund has no amount cap / no paid-status check) + 5 P1 + 7 P2; 🟡 ship-with-follow-up, P0-1 + P1-1 block next prod deploy | 2026-05-18 |
| [`audit-core-2026-05-18.md`](audit-core-2026-05-18.md) | Read-only rigorous audit of the CORE launch code (everything before U1/U2) — auth · wallet · order/forwarder pay · freight 0050-0057 · tax/WHT · W-1 RLS. All prior P0s (P0-1/P0-2/S-1/G-3/F-2/F-3) confirmed FIXED line-by-line; 1 NEW P1 (`wallet_tx_insert_self_serve` has no amount-sign check) + 4 P2; 🟢 core sound | 2026-05-18 |
| [`predeploy-verify-2026-05-18.md`](predeploy-verify-2026-05-18.md) | Pre-deploy verification of `dave` @ `1b763b0` for the `main` deploy — cargo test-run (`qa-flow-simulator`: 6 pass / 0 fail / 8 blocked-on-deleted-dev-DB) + money-review of code NOT in the prior reviews (U4-2 credit line · U4-1 RBAC console + global search · migration 0072 C-1 fix) — 0 P0 + 2 P1 + 3 P2; both prior deploy-blockers (U1 refund P0-1, core C-1) verified fixed; **🟢 GO** | 2026-05-18 |

### Capability & tooling research (recommend only)

| Doc | Topic | Date |
|---|---|---|
| [`frontend-tooling-2026-05-18.md`](frontend-tooling-2026-05-18.md) | Frontend dev-experience research for ปอน — ranked tooling/technique recommendations (data-driven landing template · component preview workbench · responsive testing · image optimization · i18n key workflow · Tailwind v4 aids); highest-leverage = the data-driven landing-page template; RECOMMEND-only, nothing installed | 2026-05-18 |
| [`growth-acquisition-strategy-2026-05-18.md`](growth-acquisition-strategy-2026-05-18.md) | Customer acquisition + conversion analysis — get-found ~80% ready but convert/buy/measure are built-and-disconnected: analytics env-gated off (ads run blind), `ContactForm` rendered on no public page + `/contact` stub, no calculator→กดซื้อ bridge; top-5 ranked BUILD/BUY moves | 2026-05-18 |
| [`operating-system-analysis-2026-05-18.md`](operating-system-analysis-2026-05-18.md) | Internal operating-system analysis — every department/role; status-visibility half-delivered (customer ✓, staff ✗ — no cross-department board); 8 gaps all → BUILD, centrepiece = the `work_items` job-assignment spine + `/admin/board` + per-role inbox | 2026-05-18 |
| [`tools-strategy-build-vs-buy-2026-05-18.md`](tools-strategy-build-vs-buy-2026-05-18.md) | Tools inventory + build-vs-buy decision matrix — "tools off, not absent"; connect-free now (9 monitoring env vars + GSC / Google Business / Meta Business) · build-in-house (KPI dashboard · MOMO sync · CI pipeline · CPC panel) · Empeo HR-SaaS rejected | 2026-05-18 |

### Forward-build system designs (2026-05-18)

> Six system design docs — four the owner (พี่ป๊อป) named after the capability synthesis, plus the **booking flow** & **customer-intelligence** systems designed for the customer-acquisition push. These are **Phase 2** of the roadmap — see [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

| Doc | Topic | Date |
|---|---|---|
| [`internal-chat-system-2026-05-18.md`](internal-chat-system-2026-05-18.md) | **Internal org-chat — shipment/job-scoped work-comms** — a `work_item_messages` thread layer + `work_item_message_mentions` + a `waiting_for` block (`blocked_on_role` / `blocked_on_admin` / `waiting_reason`) on `work_items`; staff talk *on the job*, the job *shows why it is stuck* — the structural cure for "ของอยู่ไหน / รอใครเฟิม". MVP **IC-1** = migration `0081` + actions + `<WorkItemThread>` + board badges + inbox; rides on the shipped `0080` work-board | 2026-05-18 |
| [`disbursement-system-2026-05-18.md`](disbursement-system-2026-05-18.md) | **Disbursement / payment system (เบิก-จ่าย)** — `disbursement_requests` + per-recipient `disbursement_lines` + `disbursement_allocations` + `disbursement_fund` (กองกลาง) + outbound `wht_certificates` (50-ทวิ, 1%/3%); flow `draft→pending_approval→approved→paid→reconciled`; claim modes เบิกขาด/เบิกเกิน/เบิกด่วน; money-OUT fail-closed safeguards copying `checkRefundCeiling` + the `0064` floor; migrations `0073`-`0075` | 2026-05-18 |
| [`china-ops-container-closing-2026-05-18.md`](china-ops-container-closing-2026-05-18.md) | **China-ops / container-closing (ปิดตู้)** — a `cn_warehouse` role + `warehouses` table + `(cn)/cn/*` portal; the receive → measure → barcode → close-sack → close-container → hand-to-freight ceremony (MOMO / CargoThai pattern); migrations `0073+`; **volume-gated** — build once Pacred's cargo queue is large enough to consolidate its own containers | 2026-05-18 |
| [`platform-observability-system-2026-05-18.md`](platform-observability-system-2026-05-18.md) | **Platform observability — รายงานสถานะ Platform** — the capture rails (Sentry/GA4/Clarity) are wired-but-off; the *system on top* is net-new. `platform_incidents` (auto-captured errors with a user-visible `open→acknowledged→in_progress→resolved` lifecycle — **no submit button**) + `platform_events` (unified cross-surface log) + audience-scoped KPI views (admin/dept/partner/customer/overseas) + a marketing funnel rollup + a status page. **CONNECT** the 3 free rails · **BUILD** everything that holds the data. Staged **IO-1** (MVP auto-incident triage) → IO-2 → IO-3 → IO-4. เดฟ-lane (monitoring/measurable) | 2026-05-18 |
| [`booking-flow-system-2026-05-18.md`](booking-flow-system-2026-05-18.md) | **Booking flow — the real "เปิดออเดอร์ / กดซื้อ" surface** — Trip.com-style: a booking detail page per service/route + a sticky itemized quotation panel + live-recompute option selectors (labor · tractor · pickup/dropoff pins · document handling) + an auth gate that gates *commit* not *exploration*; submit → a `work_item` job to the Sales + Pricing desk. `bookings`/`booking_options`/`booking_rates` tables; feeds ภูม's R-3 lead-inbox + R-5 quote-calculator. Staged BK-1 → BK-2 → BK-3. **Top revenue priority.** | 2026-05-18 |
| [`customer-intelligence-system-2026-05-18.md`](customer-intelligence-system-2026-05-18.md) | **Customer intelligence — รู้จักลูกค้าทุกอย่าง** — LINE-webhook ingestion (both-sides chat capture + which sales answered + won/lost) + the customer-360 record (channel · OA-add date · first-contact · profile · message count) + an in-admin chat preview + IP-anchored web behavior tracking. Sibling of platform-observability — CONNECT the free rails (LINE webhook · Clarity · GA4 · Meta Pixel) · BUILD the in-house data layer. | 2026-05-18 |

## Cross-references

- 📋 Task scheduling → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V (cargo backlog) + Part W (gap-hunt backlog)
- 🔬 Prior audits this set extends → [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) · [`../audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) · [`../audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md)
- 🔐 Security audits the gap-hunt corrects → [`../audit/owasp-2026-05.md`](../audit/owasp-2026-05.md) · [`../audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md)
- 🤝 Partner-API spec → [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- 🎯 Project master strategy → [`../STRATEGY.md`](../STRATEGY.md)
