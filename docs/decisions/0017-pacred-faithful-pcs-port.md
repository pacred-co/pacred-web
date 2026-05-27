# ADR-0017 — Pacred becomes a faithful port of the PCS Cargo system

**Status:** Accepted + ratified 2026-05-18 (เดฟ, on the team's behalf) —
owner decision (พี่ป๊อป), confirmed by เดฟ 2026-05-18. Supersedes the
"V2 = rebuilt owner-pleaser" framing of
[ADR-0010](0010-v2-v3-version-strategy.md).

## Context

Pacred was being built as a **rebuilt-from-scratch** Next.js app — a fresh
"owner-pleaser" with its own schema, its own workflow, and a forward roadmap
of new capability tiers (Tier 0/1/2/3) and a Phase-2 build queue (booking
flow, customer-intelligence, internal-chat, disbursement, china-ops,
platform-observability).

On **2026-05-18 the owner reviewed it and rejected it**: both the UI *and*
the logic-loop of the workflow look nothing like the legacy **PCS Cargo**
system the business actually runs on. The cost of that divergence is
concrete — every operating role (customers, warehouse staff, scanners,
receiving / shipping, accounting, audit) plus **~8,898 existing customers**
would have to be retrained on an unfamiliar system.

The legacy PCS Cargo system is a working PHP + MySQL application (database
`pcsc_main`, 117 tables, ~8,898 customers, years of orders) that staff and
customers already know and use daily.

## Decision (referred to as **D1**)

**Pacred becomes the legacy PCS Cargo system, faithfully — rebranded
`PCS` → `PR`.** Not a reinterpretation; a faithful port. Three phases:

- **Phase A — Data migration. ✅ DONE.** Ported the legacy `pcsc_main`
  (117 tables, all data) into Pacred's PostgreSQL / Supabase. `PCS<n>` →
  `PR<n>`, keeping the exact running number. Custom auth so customers sign in
  with their existing password — no reset.
  *Status: Supabase **Pro upgrade done** (ก๊อต) · **all 117 tables loaded** on
  dev + prod (incl. the 3 log tables `tb_web_hs`/`tb_history_key`/`tb_history`
  backfilled post-Pro) · **customer image + storage files uploaded to Supabase
  S3 production** (`pcsracgo/public/member`) by ภูม 2026-05-24 · migrations
  `0081`-`0083` + `0087` on `main`.* Runbook:
  [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md).
- **Phase B — Workflow fidelity.** Rework the Pacred app — customer portal
  and admin back-office — so its menus, job statuses, container (ตู้) flow,
  and end-to-end logic-loop **match the legacy PCS system exactly**. Goal:
  staff and customers need *zero* retraining.
- **Phase C — Pacred enhancements.** *Only after* the faithful port works,
  layer Pacred's own improvements on top.

## Consequences

- The **Tier 0/1/2/3 capability roadmap** and the **Phase-2 build queue**
  (booking flow, customer-intelligence, internal-chat, disbursement,
  china-ops, platform-observability) are **deferred to Phase C** — not
  cancelled, re-sequenced *after* the faithful port.
- **In-flight pre-D1 feature work pauses.** Work that extends the rejected
  rebuild (e.g. BK-1 booking flow, freight V-E1.1) stops; the team pivots to
  Phase B.
- [ADR-0010](0010-v2-v3-version-strategy.md): the "V2 = rebuilt
  owner-pleaser" definition is superseded — V2 is now **"faithful PCS
  port"**. V3 (`pacred-DPX`, separate repo) is unaffected.
- The pre-D1 PCS-customer-migration scaffolding — migration `0067`, the
  `u2-1-pcs-customer-migration.md` runbook, `actions/admin/pcs-migration.ts`
  — is superseded by the Phase-A full-system port.
- The rebuilt schema (`profiles` + the launch-era migrations) coexists with
  the ported `tb_*` schema during the transition, then retires.
- All four roles re-task — see the updated briefs.

## Work-split

| Role | D1 work |
|---|---|
| **เดฟ** | Phase A — drive the data migration to production · integrate · coordinate Phase B |
| **ภูม** | Phase B backend — rework admin + customer-portal backend onto the ported `tb_*` schema + legacy workflow |
| **ปอน** | Phase B frontend — rework the customer-facing UI to match the legacy PCS look + flow |
| **ก๊อต** | ✅ ADR ratified · ✅ Supabase Pro upgrade done · 1:1 admin back-office lane (NEW 2026-05-24) · build the JMF API himself (reverse-engineered, Phase C) · production-load gate. *Customer image/file storage handover handled by ภูม uploading directly to S3 prod 2026-05-24.* |

## References

- Migration runbook → [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)
- Legacy-vs-Pacred workflow gap map → `docs/research/` (Phase-B input)
- Faithful-port discipline → memory `feedback_legacy_port_fidelity`
