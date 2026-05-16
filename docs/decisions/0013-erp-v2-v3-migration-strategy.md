# ADR-0013 — V2→V3 ERP migration strategy

**Status:** 🟡 **DRAFT** — เดฟ scaffold 2026-05-16 night. ก๊อต to review + lock.
**Date:** 2026-05-16 night
**Phase:** V3 prep · Sprint 7+ Track D
**Owner:** เดฟ (scaffold) · ก๊อต (review + lock) · ภูม + ทีม (executes when V3 starts)

> **Reservation slot:** ADR-0013 follows ADR-0011 (RBAC) + ADR-0012 (frontend shell). Together this triad covers the "how do we get from V2 to V3" question.

---

## Context

Per [ADR-0010 V2/V3 strategy](0010-v2-v3-version-strategy.md):

> V2 = owner-pleaser. Iterate fast until พี่ป๊อป has nothing more to add.
> V3 = employee masterpiece. Mature, "system that 14 ops staff love."

When V2 reaches owner-saturation (estimate: 6-12 months post-Monday-launch), we shift focus to V3. V3 = full ERP per [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md): 14 staff role workspaces, granular RBAC ([ADR-0011](0011-erp-rbac-granular.md)), per-module workflows, employee self-serve.

**The question this ADR locks:** how does Pacred actually GET from V2 to V3 without breaking the revenue path?

Constraints:
- V2 stays in production THROUGHOUT V3 build (no downtime).
- V3 development happens incrementally — features ship per-module, not big-bang.
- Customer-facing UX (cargo portal, landing, wallet) MUST NOT regress.
- Internal admin staff retrain gradually — both V2 + V3 admin paths active during overlap.
- Pacred's small dev team (ภูม + ก๊อต + เดฟ on this project) cannot run 2 separate codebases at production-grade quality simultaneously without process discipline.

---

## Options considered

### Option A — Big-bang rewrite (cut date)
Pick a date. Until that date V2 is sole production. On that date V3 replaces V2. Manual data migration + customer comms.

- ➕ Clean cutover. No "which version?" confusion.
- ➖ All risk concentrated at one moment. If V3 has a regression on cutover day, no fallback.
- ➖ Customer behavioral disruption — they relearn everything overnight.
- ➖ Migration testing must be perfect before flip — no real production validation.
- ❌ **Rejected.** This is exactly the pattern Pacred avoided when migrating from PHP → Pacred (per [`docs/runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md): "borrow first, switch later" — gradual). Repeating big-bang here ignores that lesson.

### Option B — Module-by-module migration (strangler fig) ✅ recommended
V3 grows alongside V2. Each ERP module (per [ADR-0009 schema sketch](0009-erp-schema-sketch.md): M1..M14) ships in V3 incrementally. When module N is V3-ready + production-tested + admin staff trained: traffic for that module redirects from V2 to V3. V2 module retires. Repeat.

- ➕ Each module migrates with full production validation BEFORE V2 retires.
- ➕ Rollback per module = trivial (flip redirect back).
- ➕ Staff retrain per module = small chunks, manageable.
- ➕ Pacred dev team can pace migration to capacity.
- ➖ Long overlap window (12-24 months). Both versions in production simultaneously.
- ➖ Data integrity: changes in V2 must propagate to V3 (until V2 module retires); requires careful event-bus or shared-DB design.
- ➖ UX inconsistency during transition — staff may see V2 + V3 admin in the same workday.
- **Mitigation for data drift:** **single Supabase DB shared between V2 + V3** (per [ADR-0012](0012-erp-frontend-shell.md) phase 1 = same app + same DB). Write paths converge at the DB layer; V2 + V3 read consistent state.

### Option C — Hybrid: V2 stays for customer side forever, V3 only replaces admin/ERP
Customer-facing routes (landing / portal) STAY on V2. V3 ERP is admin-only — replaces only `/admin/*` and back-office systems.

- ➕ Clear scope. Customer UX is stable (V2's strength).
- ➕ V3 effort focuses on what actually needs it (ERP for ops staff).
- ➕ Two codebases, but clean separation: V2 owns customer; V3 owns admin.
- ➖ Long-term, V2's customer code drifts (no major refactors planned); V3 admin can't easily share UI patterns.
- 🤔 Actually this is **Option B + ADR-0012 split timeline** — strangler fig only on admin side. **Recommended as the operational reading of Option B.**

### Option D — Parallel teams (V2 maintain + V3 rebuild)
One team patches V2; a different team builds V3 from scratch. Cutover by date when V3 ready.

- ➕ Clean separation of concerns.
- ➖ Pacred has 1 backend dev (ภูม) + 1 advisor (ก๊อต) + 1 project lead (เดฟ). No team-scaling possible for parallel work.
- ❌ **Rejected.** Doesn't fit Pacred's actual headcount.

---

## Decision

**Adopt Option B (module-by-module strangler fig)** with **Option C scoping** (V2 customer side stays; V3 replaces admin/ERP only).

Concrete sequence — per [ADR-0009 ERP schema sketch](0009-erp-schema-sketch.md) M1..M14 modules:

### Migration order (recommended)

Rationale: start with modules that have CLEAREST staff role boundaries (so RBAC granular per [ADR-0011](0011-erp-rbac-granular.md) is tested in low-risk module first) and FEWEST V2 surface dependencies.

| Phase | Module | Why first/later |
|---|---|---|
| **V3 P1** | **M14 Inventory beyond cargo** (storage / warehouse goods-on-hand) | NEW capability — no V2 surface to retire. Low risk to validate V3 patterns. |
| **V3 P2** | **M12 AP (Accounts Payable)** | NEW capability. Pacred + suppliers (carriers / brokers / vendors). Tests V3 accounting integration. |
| **V3 P3** | **M13 Vendor mgmt** | Pairs with M12. Builds vendor directory + payment terms tracking. |
| **V3 P4** | **HR-side V2 → V3 migration** | V2 has 100% HR shipped (per CLAUDE.md). Migrate as test case — staff already use it, low risk of customer impact. |
| **V3 P5** | **M1 Sales + CRM** | Replaces V2's `/admin/customers/*` + `team_leaders` + `sales-payouts`. High-value, high-risk because revenue path. Run V2+V3 in parallel for 4-8 weeks during migration. |
| **V3 P6** | **M2 Operations** (forwarder + service-order + container) | Replaces V2's `/admin/forwarders/*` + `/admin/service-orders/*` + `/admin/warehouse/*`. Biggest module. Parallel run 4-8 weeks. |
| **V3 P7** | **M3 Accounting + finance** | Replaces V2's `/admin/accounting/*` + `/admin/wallet/*` + `/admin/yuan-payments/*` + V-E* freight billing. Highest stakes — finance team trained extensively before flip. |
| **V3 P8** | **Remaining modules** (HR refresh / IT-DT / reporting / etc.) | Polish phase. |

### Per-module migration playbook

For each module:

1. **Pre-migration (1-2 weeks):**
   - Spec the V3 module (port-spec doc in `pacred-dpx/docs/port-specs/`)
   - Build V3 module in `(admin)/admin/v3/<module>/*` (per [ADR-0012](0012-erp-frontend-shell.md) phase 1)
   - Add feature flag `NEXT_PUBLIC_V3_MODULE_<NAME>=true` to gate visibility
   - Internal QA — 1-2 staff "champion users" test V3 module daily

2. **Parallel run (4-8 weeks per module):**
   - V3 module visible to **20% of staff** (admins with `v3_pilot=true` flag)
   - V2 module remains primary; V3 mirrors all changes via shared DB
   - Daily monitoring: `admin_audit_log` shows V2 vs V3 usage split per action
   - Bug fix in V3 = fast iterate; V2 untouched

3. **Cutover (1 day per module):**
   - Set feature flag `V3_<MODULE>_PRIMARY=true` — all staff see V3 module as default
   - V2 module stays accessible via `/admin/legacy/<module>` for 30-day grace period
   - Customer notification (LINE / email): "V3 ops upgrade complete; bookmark new URL if needed" (customer-facing changes only if any)

4. **Post-cutover (30-day grace):**
   - V2 module = read-only (writes redirect to V3)
   - Monitor admin tickets — any "I can't find X" → fix V3 or extend grace
   - 30 days clean → V2 module retires

5. **V2 module retirement:**
   - Delete `(admin-legacy)/<module>` routes
   - Drop V2-only DB columns if any
   - Update `docs/PORT_PLAN.md` historical note
   - Commit `chore(v3): retire V2 <module> after successful V3 migration`

### Data migration strategy

Per [ADR-0012](0012-erp-frontend-shell.md): same Supabase DB during V3 phases 1-2. **No data migration required.** V3 reads/writes the SAME tables V2 reads/writes.

**Implications:**
- V3 schema EXTENDS V2 schema additively (new tables for new capabilities; new columns for V3 features).
- V3 NEVER deletes V2 columns until V2 module retires.
- Existing V2 RLS policies stay; V3 RLS policies layer on top with `has_permission()` per [ADR-0011](0011-erp-rbac-granular.md).

If [ADR-0012](0012-erp-frontend-shell.md) Phase 3 split-to-subdomain triggers fire later, that's a separate migration (move repo, not move data) — DB stays unified per [ADR-0012] design choice.

### Rollback per module

If V3 module shows regression mid-parallel-run:
1. Flip `V3_<MODULE>_PRIMARY=false` → V2 becomes default again
2. Investigate
3. Re-flag pilot users
4. Resume parallel run when fixed

If after cutover (during 30-day grace):
1. Flip flag → admins use V2 again
2. V3 retires the bad code path
3. Investigate + re-ship + cutover again

---

## Consequences

**Positive**
- Each module migrates with full production validation BEFORE V2 retires (revenue safety).
- Per-module rollback = trivial.
- Pacred dev team capacity respected — no parallel teams needed.
- Customer-side untouched (Option C scoping).
- Staff retrain per module, not all at once.

**Negative**
- **Long overlap window** (estimate 12-24 months total V3 migration time).
- Two admin UIs exist during overlap — staff may toggle between them per task.
- Codebase carries both V2 + V3 code paths during overlap.
- Feature-flag noise — many `if (v3Module) ... else ...` branches during transition.

**Neutral**
- Same DB simplifies data integrity; complexifies schema migrations (must be V2-compatible AND V3-compatible).

---

## Migration risks (top 5)

| # | Risk | Mitigation |
|---|---|---|
| 1 | V3 module ships with bug → revenue disruption | Feature flag default-off + 4-8 wk parallel run before flip |
| 2 | Same DB schema serves both V2 + V3 — V3 schema change breaks V2 | Schema-additive rule: V3 NEVER drops V2 columns. CI test runs V2 + V3 against same DB. |
| 3 | Staff confusion (which UI for what?) | Sidebar shows V3 as default; V2 menu items prefixed "(legacy)". Comms + training per module cutover. |
| 4 | Customer support impacted (rep can't find customer in new UI) | Per-module cutover includes customer-support runbook update + 1-day training. |
| 5 | V3 development distracts from V2 owner-requests (the things keeping พี่ป๊อป happy) | **Hard rule per [ADR-0010](0010-v2-v3-version-strategy.md): V3 work pauses if V2 owner-need surfaces.** V3 = parallel track, not priority track. |

---

## Open questions for ก๊อต (lock these)

1. **Trigger to START V3:** what's the signal that V2 reached "owner-saturation"? Recommend: 30 consecutive days with zero new feature requests from พี่ป๊อป + a positive system-health review.
2. **Per-module estimate accuracy:** the 4-8 wk parallel run window — confirm sufficient? Or should some modules (M3 accounting) get longer (8-12 wk)?
3. **Schema-shared-DB risk** — does ก๊อต agree V2 + V3 share one Supabase? Or separate DBs with replication? Recommend shared (per ADR-0012).
4. **V2 retirement criteria** — 30-day grace post-cutover is a guess. Adjust based on observed support-ticket volume? Recommend: extend grace until 7 consecutive days of zero "where is X in V3?" tickets.
5. **External communication strategy** — when each module retires, do customers know? Or only staff? Recommend: customer notifications only if customer-facing URLs change (most won't).
6. **Sunset of V2 customer-side** — Option C says V2 customer side stays. EVENTUALLY does V3 also replace customer? Recommend: revisit in 24 months; until then, V2 customer = stable.

---

## Cross-references

- V2/V3 high-level strategy → [ADR-0010](0010-v2-v3-version-strategy.md)
- V3 RBAC story → [ADR-0011](0011-erp-rbac-granular.md)
- V3 frontend shell → [ADR-0012](0012-erp-frontend-shell.md)
- DPX ERP phase 2 → [ADR-0008](0008-dpx-erp-phase-2.md)
- ERP schema (M1..M14) → [ADR-0009](0009-erp-schema-sketch.md)
- Ops roles inventory → [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md)
- V2 PHP cutover analog (proves strangler-fig works for Pacred) → [`docs/runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md)

**End of ADR-0013 (DRAFT).** ก๊อต: review, answer 6 open Qs, flip Status → Accepted. Together ADRs 0011 + 0012 + 0013 lock V3 direction; actual V3 work won't start until V2 reaches owner-saturation per [ADR-0010](0010-v2-v3-version-strategy.md).
