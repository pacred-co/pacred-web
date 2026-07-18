# 🩺 Data-Health Invariant Monitor — from reactive fixes to "on green" production

> Topic file (scholar-immortal). Created 2026-07-18 (session-4 · owner: "วิเคราะห์ทุกปัญหาที่ผ่านมา
> แล้วพัฒนาไม่ให้เกิดอีก · ระบบควรจะ on green สม่ำเสมอ · ลูกค้าจริงไม่ใช่หนูลองยา").

## [2026-07-18] The 4th defence layer — every past incident becomes a standing invariant check

**Context:** months of data bugs (เบิ้ลกล่อง PR050 · เก็บเงินซ้ำ PR107 · ฿0 bills · เครดิตค้าง ·
cost มั่ว · สถานะไม่เดิน · dangling staging ptrs) shared ONE meta-root: **customers found every
bug before we did.** Each root got fixed (write-guards + cron heals + one-off sweeps), but nothing
continuously verified the invariants stayed true — especially risky with `MOMO_CRON_AUTOCOMMIT=true`
writing billable rows unattended every 5 minutes.

**The layer stack that now exists (keep all four when fixing any future data bug):**
1. **Write-path guard** at the chokepoint (refuse the bad write — e.g. family-aware dedup 4a½).
2. **Cron heal** for states that slip through (e.g. pass-5 absorb — idempotent, self-healing).
3. **One-off sweep** for the backlog (dry-run → backup → apply — e.g. absorb-split-residue).
4. **Standing invariant check** in `lib/admin/data-health/checks.ts` so a RECURRENCE screams within
   the hour (cron `/api/cron/data-health` → deduped incident) and is drillable at `/admin/data-health`.
   **A fix without layer 4 is a fix you'll re-derive at the next owner escalation.**

**Design rules that made it work:**
- **READ-ONLY, absolutely** — the monitor never fixes anything. Auto-fix belongs to layer 2/3 with
  their own guards; a monitor that writes is a new bug source.
- **One shared scan** feeds all checks (tb_forwarder is small); every check bounded + **fail-visible**
  (a check that errors reports NOT-ok — a silent green is worse than no monitor).
- **Group(=shipment)-aware where per-row rules false-positive by design** — cost lives ONCE on the
  split anchor, so per-row cost/CBM is "wrong" there on purpose; the GROUP Σcost/Σcbm is the invariant.
- **Stable incident fingerprints** (wallet-reconcile pattern): one live incident per check-id whose
  occurrence_count climbs — counts/samples go in surface_meta, never the message.
- **Unattended writes get unattended verifies:** autocommit now re-checks the committed families
  (dup/residue) the same minute (post-commit verify in auto-commit-momo.ts step 8).

**The calibration lesson (first prod run):** a brand-new invariant check WILL mix real findings with
legit business shapes. First run found a "double-bill" `60527103087` on 2 paid invoices — probe showed
**two different LOTS** (bare 48pcs/624kg + "-2" 12pcs/156kg · disjoint weights · consistent ฿/kg) =
legitimate split-lot billing, NOT a double charge. The true double-bill signature is
**aggregate-covers-boxes overlap** (bare weight ≈ Σ box weight billed separately — 1780555730: 104≈104).
→ Rule: **run a new check against prod BEFORE shipping it, probe every red, and encode the
discriminator you learn into the check** — an alarm staff learn to ignore is worse than none.

**First full audit results (2026-07-18):** red = exactly the known accounting queue (2 billed residues
+ 1 confirmed double-bill FRI2606-00013↔24) · warn = 4 multi-container shipments (review) + 1 cost
ratio + 14 arrived-but-unscanned rows (โกดัง ops queue) · everything else green — i.e. the data layer
IS clean after the root fixes; the monitor now keeps it that way.

**Cross-links:** `docs/wip/plan-2026-07-18-data-health-invariants.md` (the 6-class retrospective) ·
[[partner-apis-quirks]] [2026-07-18] (the residue fix this generalises) · `app/api/cron/wallet-reconcile`
(the alerting pattern) · AGENTS.md §0e/§0f (the display/dead-write cousins).
