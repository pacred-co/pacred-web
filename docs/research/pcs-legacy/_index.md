# 📦 `docs/research/pcs-legacy/` — ภูม's PCS Cargo system research

> **What this folder is.** A 4-file research drop by **ภูม** (2026-05-19) decoding
> the legacy **PCS Cargo** PHP system — the source-of-truth Pacred is doing a 1:1
> faithful port of under **D1** ([ADR-0017](../../decisions/0017-pacred-faithful-pcs-port.md)).
> Copied **verbatim** into the repo so the whole team has them in-source.
>
> ⚠️ These are **ภูม's** research artifacts — they describe the legacy PCS system
> and a *target* Next.js/Prisma/NextAuth stack that ภูม sketched. **Pacred's actual
> stack is Supabase + Next 16 + custom auth**, not Prisma/NextAuth/MySQL. Treat the
> business logic + DB schema + workflows as authoritative; treat the "target
> architecture" sections as ภูม's notes, not Pacred's chosen stack.

## The 4 files

| File | What it is | Lines |
|---|---|---|
| [`BUSINESS_FLOW.md`](BUSINESS_FLOW.md) | The 3-service business flow (shopping / forwarding / payment) with ASCII sequence diagrams, status-code tables, wallet flow, credit-VIP rules, cancel/refund policy | ~188 |
| [`PCS_CARGO_COMPLETE_ANALYSIS.md`](PCS_CARGO_COMPLETE_ANALYSIS.md) | The full system spec — exec summary, RBAC, **complete `tb_*` DB schema** (11 core tables with columns + status enums + code maps), member system, admin system, business logic, calc formulas, API surface, UI/UX patterns, workflows. **⚠️ ~4,299 lines — over the 2000-line doc cap** (kept whole as a verbatim research dump per the capture instruction) | ~4299 |
| [`PCS_Cargo_Guidebook_TH.md`](PCS_Cargo_Guidebook_TH.md) | The Thai-language staff operations manual — per-department day-to-day workflow (CS, shopping ops, forwarding ops, payment ops, wallet, HR, QA, customer mgmt, China + Thailand warehouse) | ~531 |
| [`docs.md`](docs.md) | The condensed developer doc — project structure, DB schema (column tables), API endpoints, business logic/calculations, RBAC, notifications, integrations, glossary | ~508 |

## How to use

- **Doing a D1 Phase-B port?** This is the SOT for the legacy behaviour. Cross-check
  any screen/status/calc against these files before shipping (the `legacy-fidelity-check`
  skill gate).
- **Synthesized facts** (the durable load-bearing knowledge — flow, schema, gotchas)
  are in [`../../learnings/pacred-domain-knowledge.md`](../../learnings/pacred-domain-knowledge.md)
  (2026-05-19 entry) + [`../../learnings/php-port-patterns.md`](../../learnings/php-port-patterns.md).
  Read the synthesis first; come here for the full detail.

## Cross-references

- 🧭 D1 direction → [`../../decisions/0017-pacred-faithful-pcs-port.md`](../../decisions/0017-pacred-faithful-pcs-port.md)
- 🗺 D1 Phase-B fidelity audit → [`../d1-fidelity-customer.md`](../d1-fidelity-customer.md) · [`../d1-fidelity-admin.md`](../d1-fidelity-admin.md) · [`../d1-fidelity-workflow.md`](../d1-fidelity-workflow.md)
- 🔬 Prior cargo-ops decode → [`../../audit/cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md)
- 🚚 Phase-A data migration → [`../../runbook/pcs-data-migration.md`](../../runbook/pcs-data-migration.md)
- 📚 Learnings index → [`../../learnings/_index.md`](../../learnings/_index.md)
