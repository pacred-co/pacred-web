# 🧠 Debug discipline — case studies

> Companion to [`.claude/skills/debug-mantra/SKILL.md`](../../.claude/skills/debug-mantra/SKILL.md).
> The skill is the protocol; this file is the **case studies** that prove why each step matters.
> When the skill fires (any bug session), grep here for similar past misses.

---

## [2026-05-27] "2 Issues" misdiagnosis — patched image qualities, real cause was stale chunks

**Context:** Wave 21 P0 + Wave 20 P1 batch 2 just shipped (commits `fe98da3`, `fc9aabe`, `f47c179`). ภูม opened http://localhost:3000/admin/forwarders, Next 16 dev overlay showed "2 Issues" badge. ภูม asked: *"มันมีขึ้น 2 Issues ลองเช็คดูหน่อย"*.

**Symptom:** "2 Issues" indicator in Next dev overlay (red number badge in corner of every page).

**What I did wrong:**
1. Did NOT open Chrome to actually click the "2 Issues" badge and read what the issues were
2. Hypothesized from CLAUDE.md context: *"Next 16 throws Issues per `<Image quality={N}>` when N isn't in the `images.qualities` allowlist"* — I had read this in `next.config.ts` minutes earlier
3. Committed `a2e7b25 fix(images): allowlist quality 95 + 100` based on the hypothesis
4. Claimed "fixed"
5. ภูม checked: *"ยังไม่หายเลย ทำไมไม่แก้ให้จบอะ นี่แกก็เชื่อมเห็นหน้าจอภูมิอยู่แท้ๆ"* (still not fixed, why didn't you fix it properly, you can see my screen through Chrome)

**Root cause (after I actually opened Chrome and clicked the badge):**
- Both issues were `Failed to fetch` errors on stale Turbopack chunk URLs
- We had restarted the dev server 3 times during the session (memory leaks, OOM cleanup)
- The browser still had old chunk URLs cached from the previous dev process
- Fix was `Ctrl+Shift+R` (hard refresh) — not a code change at all

**Why my fix was wrong:**
- Image quality warnings produce `Image quality "92" is not configured` — that's a CONSOLE warning, not an "Issues" badge entry
- My hypothesis felt plausible because of context proximity (just read next.config.ts) but I never proved the symptom matched
- The commit `a2e7b25` is technically harmless (allowlisting more qualities is fine) but it's noise in the commit log and burns ภูม's trust

**The debug-mantra lesson:**
- **#1 Reproduce reliably** — I should have opened Chrome FIRST and clicked the "2 Issues" badge to see what they actually said
- **#3 Falsify the hypothesis** — I should have asked: "what would disprove this is image qualities?" Answer: clicking the badge would show non-image text. I never asked.
- **#4 Every run is a breadcrumb** — there were no runs. I went symptom → hypothesis → fix → done. No ledger.

**Why this matters next time:**
- Whenever ภูม says "เช็คดูหน่อย" / "ลองดู" / "มันมี X" → that's a bug report. Trigger the debug-mantra skill. Recite the mantra. **Do NOT** skip to step 3 because the context feels obvious.
- When the dev server has been restarted recently, **stale browser chunks** are a very common cause of "Failed to fetch" + Next overlay issues. Hard-refresh BEFORE assuming code bug.
- If you have Chrome MCP available and the user has the Chrome extension connected, **always** open the page yourself before proposing a fix. The cost of "look at it" is 5 seconds; the cost of a wrong commit is trust + lint-run + push churn.

**Cross-links:**
- [`.claude/skills/debug-mantra/SKILL.md`](../../.claude/skills/debug-mantra/SKILL.md) — the discipline this was supposed to prevent
- Commit `a2e7b25` — the off-target fix (kept · technically harmless, leaving as evidence of the pattern)
- [`AGENTS.md §0c`](../../AGENTS.md) — verify-deep-flow rule (companion: click-through > curl smoke)
- [`verify-deep-flow.md`](verify-deep-flow.md) — the verify-side companion (verifying you shipped works); this file is the debug-side (finding what's broken)

---
