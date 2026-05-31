---
name: legacy-fidelity-check
description: Verify a D1 Phase-B port screen/feature is a faithful copy of its legacy PCS Cargo original BEFORE shipping. Fires on "is this faithful to legacy", "check fidelity", "did I match PCS", "เหมือนของเดิมไหม", "ตรงกับ PCS เก่าไหม", "fidelity check", "ตรวจ fidelity", or before pushing/merging any D1 Phase-B customer-portal or admin rework. Audits element-by-element against the legacy original, builds a per-element gap table, and asserts no 🔴 paradigm / 🟠 layout gap ships unaddressed — the owner's "copy 100% identical first, then improve" gate.
---

# Legacy Fidelity Check

> **Why this exists.** On 2026-05-19 the owner reviewed the team's work and
> **scolded the whole team**: the rebuilt Pacred screens looked + behaved nothing
> like the legacy **PCS Cargo** system the ~8,898 existing customers and every
> staff role use daily. The owner's rule — verbatim, load-bearing, applies to
> everything:
>
> > **"ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน แล้วเราค่อย
> > พัฒนาให้เหนือยิ่งกว่า"** — copy the original to 100% sameness FIRST, *then*
> > improve beyond it.
>
> This skill is the gate that proves a screen is a faithful copy before it
> ships. It is the executable form of
> [ADR-0017](../../../docs/decisions/0017-pacred-faithful-pcs-port.md) (D1).

## When to fire

- Before pushing/merging ANY D1 Phase-B rework — a customer-portal screen, an
  admin module, a workflow loop.
- After reworking a screen to "match legacy" — to *prove* it actually does.
- When the user says "fidelity check", "เหมือนของเดิมไหม", "ตรงกับ PCS เก่าไหม",
  "did I match PCS", "check this against legacy".
- When a screen is *new* Pacred scope with no legacy equivalent — to confirm and
  record that (a 🟢 extra is allowed; an *unintended* divergence is not).

## The principle — fidelity before enhancement

D1 has three phases ([ADR-0017](../../../docs/decisions/0017-pacred-faithful-pcs-port.md)):
copy legacy faithfully (Phase A/B) → *then* enhance (Phase C). This skill
enforces the ordering. It catches two failure modes:

1. **Silent divergence** — a screen "looks done" but its layout / button
   positions / workflow order differ from legacy. The migrated customer hits
   unfamiliarity. *This is what got the team scolded.*
2. **Premature enhancement** — a "better" idea shipped *before* the faithful
   copy exists. Good idea, wrong phase → record it for Phase C, ship the
   faithful copy now.

"Faithful" means **structure**, rebranded: every `PCS` → `PR`, `PCS Cargo` →
`Pacred`, `PCS<num>` → `PR<num>`. Match legacy layout + positions + workflow
order; never copy the literal string `PCS`.

## The legacy source

The legacy PCS Cargo system (PHP) — the source of truth to copy:
- **Canonical 2026-05-24 extract (latest, full server, ~25GB):** `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/` — includes backoffice.pcscargo.co.th + pcs-seafreight.com + sms/ subdomains
- **Legacy git snapshot (May 21):** `/Users/dev/Desktop/pcscargo/` · **Windows:** `C:\Users\Admin\pcscargo\`
- Canonical path owned by [`legacy-php-sweep`](../legacy-php-sweep/SKILL.md) + CLAUDE.md.
- Customer portal = `member/*.php`; admin = `member/pcs-admin/*`.

If the legacy source is not on the machine, fall back to the **D1 fidelity gap
maps** — they already encode the legacy structure screen-by-screen:
- [`docs/research/d1-fidelity-customer.md`](../../../docs/research/d1-fidelity-customer.md) — customer portal, 11 screens, per-element
- [`docs/research/d1-fidelity-admin.md`](../../../docs/research/d1-fidelity-admin.md) — admin, 14 modules
- [`docs/research/d1-fidelity-workflow.md`](../../../docs/research/d1-fidelity-workflow.md) — the 6 workflow loops
- [`docs/research/d1-phase-b-gap-map.md`](../../../docs/research/d1-phase-b-gap-map.md) — the overview

## The loop

```
1. IDENTIFY  — the screen/feature under check + its legacy original
               (the .php file, or the gap-map row).
2. INVENTORY — list the legacy original's elements top→bottom:
               layout bands, every button + its position + label,
               every form field, the workflow/status order, navigation.
3. COMPARE   — for each legacy element find the Pacred equivalent.
               Build the per-element gap table (below).
4. GRADE     — tag every row with the severity legend.
5. VERDICT   — faithful (ships) or not (the must-fix list).
6. FIX       — close every 🔴 and 🟠. Re-run from step 3.
```

## The per-element gap table

| Legacy element | Legacy position / behaviour | Pacred today | Gap | Fix |
|---|---|---|---|---|

Severity legend (same as the d1-fidelity docs):
- 🔴 **paradigm gap** — whole screen/flow differs (wrong mental model). MUST fix before ship.
- 🟠 **layout/position gap** — elements moved / renamed / reordered. MUST fix before ship.
- 🟡 **missing element** — a legacy element absent in Pacred. Fix before ship unless owner-deferred.
- 🟢 **extra** — Pacred-only, no legacy equivalent. Allowed — record it, keep it de-emphasised so it does not crowd the legacy surface.
- ⚪ **cosmetic** — trivial (a title string, a corner radius). Fix opportunistically.

## The checklist — assert each

- [ ] **Layout matches** — bands/sections in the same order, same positions.
- [ ] **Every legacy button exists** — same label (rebranded), same position, same action.
- [ ] **Every legacy form field exists** — same fields, same order, same required/optional.
- [ ] **Workflow order matches** — status tabs, step order, and the pay-point all in the legacy sequence (e.g. import = ship → arrive → **pay**, never pay-first).
- [ ] **No dead-write trap (AGENTS.md §0e)** — for every write/edit surface, the table the WRITE targets == the table the CONSUMER reads. A reachable edit that writes a 0-row rebuilt twin while the reader reads the live `tb_*` = green-toast-no-effect (worse than missing). Grep both sides; repoint write→`tb_*`, or remove, or banner.
- [ ] **Navigation matches** — the menu / entry-point a legacy user reaches for is where they expect it.
- [ ] **Rebrand only** — `PCS`→`PR`/`Pacred` everywhere; no literal `PCS` left in customer-visible strings; no other "improvement" mixed in.
- [ ] **Extras are owned** — every 🟢 Pacred-only element is intentional, recorded, and not crowding the legacy surface.
- [ ] **No 🔴 / 🟠 unaddressed** — every paradigm + layout gap is fixed, or explicitly owner-approved with a note.

## Report

Report: the screen + its legacy original · the full per-element gap table ·
counts per severity · every 🔴/🟠 with its fix · final verdict —
**faithful (ship)** or **not faithful (must-fix list)**. If a genuine
improvement idea surfaced, do NOT ship it — record it for Phase C
([`UPGRADE_PLAN.md`](../../../docs/UPGRADE_PLAN.md)) and note it in the report.

## Anti-patterns

- **"It does the same thing."** Same *function*, different *layout* = still a
  fidelity fail. The customer navigates by muscle memory, not by feature list.
- **"This is better than legacy."** Maybe — but that is Phase C. Faithful copy
  first. (Owner's rule, 2026-05-19.)
- **Improving while porting.** Mixing an enhancement into the faithful copy
  hides divergence inside a "good-looking" diff. Port faithfully, enhance separately.
- **Skipping the legacy read.** Auditing from memory of "what PCS probably did"
  invents a divergence or misses one. Open the `.php` file or the gap-map row.
- **Treating 🟡 as optional.** A missing legacy element a customer relies on
  (a print button, a remember-me checkbox) is a fidelity fail unless owner-deferred.

## Cross-links

- [ADR-0017](../../../docs/decisions/0017-pacred-faithful-pcs-port.md) — D1, the faithful-port decision
- [`d1-fidelity-customer.md`](../../../docs/research/d1-fidelity-customer.md) · [`d1-fidelity-admin.md`](../../../docs/research/d1-fidelity-admin.md) · [`d1-fidelity-workflow.md`](../../../docs/research/d1-fidelity-workflow.md) — the gap maps
- [`legacy-php-sweep`](../legacy-php-sweep/SKILL.md) — find the legacy source for a feature
- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — the general verify loop this mirrors
- [`mobile-first-verify`](../mobile-first-verify/SKILL.md) — the sibling pre-ship customer-surface gate
