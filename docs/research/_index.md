# 📚 `docs/research/` — R&D folder index

> **What this folder is.** Eight R&D / audit docs produced 2026-05-17 by parallel
> sub-agents, decoding the legacy PCS / AXELRA / NNB / TTP / CargoThai / MOMO
> systems from LINE-chat exports, scraped HTML, legacy PHP + Apps Script, and a
> pre-launch audit of `pacred-web` itself. They are the raw evidence base for
> Pacred's next-phase functional build-out — **the "why" behind the roadmap.**

## How to use this folder

1. **Start with [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)** — the synthesis.
   It rolls the 8 source docs into one leak-hole list + Pacred coverage map +
   prioritized next-phase roadmap. Read that first; dive into a source doc only
   when you need the underlying evidence.
2. **Source docs are evidence, not plans.** Each decodes one slice of the legacy
   operation. They cite chat dates + file names so a claim can be traced.
3. **These are lessons to ADAPT, not a system to copy.** The legacy chats expose
   gray-channel / declared-value / tax-evasion patterns. Those must **never**
   enter Pacred code — see the "Pacred identity guardrail" in the gap analysis.
4. **Scheduling lives elsewhere.** Roadmap items feed [`../PORT_PLAN.md`](../PORT_PLAN.md)
   Part V (and a future Part W). This folder does not track task status.

## Index — one line per doc

| Doc | Topic | Date |
|---|---|---|
| [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) | **Synthesis** — leak holes + Pacred coverage map + prioritized next-phase roadmap (integrations + monitoring) | 2026-05-17 |
| [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) | Dev/IT chat decode — single-dev bottleneck, web outages, MOMO read-only API, HS/VAT desk, leak holes DI-1..DI-16 | 2026-05-17 |
| [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) | Ops/transport chat decode — China→Mukdahan truck + sea route, "ของอยู่ไหน" status-relay failure, leak holes OT-1..OT-14 | 2026-05-17 |
| [`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md) | Sales/pricing/HR chat decode — 3-human quote relay, lead ownership, commission disputes, leak holes SP-1..SP-8 | 2026-05-17 |
| [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) | MOMO partner API decode — `?api=` endpoints, 9-status enum, wallet/credit Pay-Later pivot (2026-05-15), 6 known data bugs | 2026-05-17 |
| [`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) | TTP + CargoThai decode — carrier partners (not APIs), the `booking.php` 8-tab quote-calculator formulas (exact) | 2026-05-17 |
| [`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md) | AXELRA/NNB accounting decode — AR/AP dual ledger, เบิกเงิน + กองกลาง float, PEAK/NetBay stubs, 10 money-handling risks | 2026-05-17 |
| [`audit-money-billing-2026-05-17.md`](audit-money-billing-2026-05-17.md) | Pre-launch money audit of `pacred-web` — 2 P0 money-loss bugs, 5 P1s, money-math verification, gateway-readiness gap | 2026-05-17 |
| [`audit-system-2026-05-17.md`](audit-system-2026-05-17.md) | Pre-launch whole-system audit of `pacred-web` — build/verify green, 155 routes smoked, 1 contained 502, GO verdict | 2026-05-17 |

## Cross-references

- 📋 Task scheduling → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V (cargo backlog)
- 🔬 Prior audits this set extends → [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) · [`../audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) · [`../audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md)
- 🤝 Partner-API spec → [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- 🎯 Master strategy → [`../STRATEGY.md`](../STRATEGY.md)
