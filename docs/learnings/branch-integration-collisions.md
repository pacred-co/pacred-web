# Learning — the two real collisions when integrating parallel teammate branches

**Date:** 2026-06-22 · **Author:** เดฟ · **Trigger:** integrating Poom-pacred (8 commits) + InwPond007 (1) into dave-pacred. Both classes the new [`team-collision-check`](../../.claude/skills/team-collision-check/SKILL.md) skill + [`docs/team-worklog.md`](../team-worklog.md) exist to prevent — and both still happened this round because the work was done in parallel before the registry was used. Captured so the registry actually gets used next time.

## Collision 1 — same migration number (0199) grabbed by two devs
ภูม added `0199_customer_quotations.sql`; I had already shipped `0199_admin_code_scheme_ad.sql` (applied prod). Git does NOT conflict on this — both files just coexist after the merge, both numbered 0199. A duplicate migration number is a silent landmine (ambiguous ledger, reconcile scripts double-count, "which 0199?").

**Resolution:** the one already APPLIED to prod keeps its number; rename the not-yet-applied one to the next free (`git mv 0199_customer_quotations.sql 0200_…`), then APPLY the renamed migration to prod+dev (ภูม's `customer_quotations` table wasn't on prod yet — the /q feature would 500 without it). Bump NEXT FREE in the ledger + worklog.

**Prevent:** reserve the migration number in [`docs/team-worklog.md`](../team-worklog.md) + [`docs/runbook/migration-ledger.md`](../runbook/migration-ledger.md) the moment you start a migration — not at commit time. The registry's whole job.

## Collision 2 — same FEATURE built twice (price-save → auto-advance 4→5)
The owner asked BOTH ภูม and me (different turns) to make "ตั้งราคาเสร็จ กดบันทึก → รอชำระเงิน." We each built it:
- ภูม: inside `adminUpdateForwarderDimensions` (forwarders-edit.ts · server-side, per-row, on every save) — **canonical** (covers every caller).
- me: a separate `adminAdvanceForwarderToWaitPayment` action called from the editor's `onSaveAll`.
Git didn't conflict (different files), but at runtime BOTH ran → a double-advance (harmless only because 4→5 is idempotent; my success-toast was about to lie about whether it advanced, because ภูม's had already moved it to 5 before my call checked).

**Resolution:** keep the canonical (server-side, at the source) version; remove the redundant call + its import. A duplicate that's "harmless because idempotent" is still a latent bug (wrong toast, two mechanisms to reason about). The standalone action can stay as a dormant primitive only if it's genuinely reusable + clearly not the wired path.

**Prevent:** before building anything the owner asked for, `git log origin/dave-pacred..origin/<teammate>` + grep the feature keywords — the owner often drip-feeds the same ask to two people.

## The cheap merge that's actually expensive
The big one this round was `quote-tab.tsx`: ภูม EXTRACTED the render to a shared `components/quote/quote-paper.tsx` (reused by the public `/q/[token]`) + added a share-link; ปอน kept it INLINE + added รหัสลูกค้า + a receipt palette. Two architectures of one file → a ~375-line conflict. Resolved by taking the better base (ภูม's shared+share-link) and **grafting the concrete missing field** (ปอน's รหัสลูกค้า) into the SHARED component so both the admin tab AND the public page get it — not by picking one side wholesale (that loses the other's real work). When two devs diverge an architecture, keep the better structure + port the other's concrete user-facing additions into it.

Related: [[parallel-agent-sprints]] · [[audit-discipline]] · the `branch-integrate-loop` skill.
