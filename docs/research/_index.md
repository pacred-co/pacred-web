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

## Cross-references

- 📋 Task scheduling → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V (cargo backlog) + Part W (gap-hunt backlog)
- 🔬 Prior audits this set extends → [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) · [`../audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) · [`../audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md)
- 🔐 Security audits the gap-hunt corrects → [`../audit/owasp-2026-05.md`](../audit/owasp-2026-05.md) · [`../audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md)
- 🤝 Partner-API spec → [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- 🎯 Project master strategy → [`../STRATEGY.md`](../STRATEGY.md)
