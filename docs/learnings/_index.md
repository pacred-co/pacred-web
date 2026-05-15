# 📚 Pacred Learnings — index

> Every agent / dev / session that learns something tricky writes it here.
> Future agents read this BEFORE re-discovering. Knowledge compounds.

> **Skill that writes here:** [`.claude/skills/scholar-immortal/`](../../.claude/skills/scholar-immortal/SKILL.md)
> **Protocol:** read SKILL.md; add a dated entry to the right topic file (or create a new topic file + add to this index).

Last reviewed: 2026-05-16 (testing-patterns +2 entries)

---

## Topic files

| Topic | What's captured | Last entry |
|---|---|---|
| [`ci-and-deploy-gotchas.md`](ci-and-deploy-gotchas.md) | GitHub Actions / Vercel / pnpm version pitfalls | 2026-05-15 |
| [`nextjs-16-quirks.md`](nextjs-16-quirks.md) | Next 16 behavior different from training data | 2026-05-15 |
| [`supabase-rls-patterns.md`](supabase-rls-patterns.md) | RLS policy patterns that work for Pacred | 2026-05-15 |
| [`i18n-pitfalls.md`](i18n-pitfalls.md) | next-intl / messages/*.json gotchas | 2026-05-15 |
| [`perf-patterns.md`](perf-patterns.md) | Performance wins + measurement | (empty seed — pending first entry) |
| [`testing-patterns.md`](testing-patterns.md) | Pacred-specific test mocks + harness quirks | 2026-05-16 |
| [`partner-apis-quirks.md`](partner-apis-quirks.md) | MOMO JMF / TAM / ThaiBulkSMS / LINE behavior | (empty seed) |
| [`php-port-patterns.md`](php-port-patterns.md) | Legacy `D:\xampp\htdocs\pcscargo` port gotchas | (empty seed) |
| [`pacred-domain-knowledge.md`](pacred-domain-knowledge.md) | Cargo flow business logic + juristic rules | (empty seed) |

---

## How to add an entry

```bash
# 1. Pick the right topic file. Create new if no fit.
# 2. Append to the END (chronological — never replace, never edit past entries).
# 3. Use the template from .claude/skills/scholar-immortal/SKILL.md.
# 4. Commit:
git commit -m "docs(learnings): <topic> — <short summary>"
```

---

## Re-read cadence

- **Every session start** — scan this index for any new topic / date you haven't seen.
- **Before fixing a bug** — grep `docs/learnings/` for the symptom keywords (see `bug-swarm-loop` hunter 5).
- **Weekly** — เดฟ skim through new entries on Friday integration window.

---

## Patterns to look for over time

As entries accumulate, watch for:
- **Repeated entries on same topic** → the underlying issue is systemic; consider an ADR or refactor
- **Topics that haven't gained entries** → either the area is stable OR no one's working there (worth investigating which)
- **Entries that contradict each other** → behavior changed; mark older entry as superseded with a forward pointer

---

## Why this directory exists

The user (เดฟ) described it as: *"นักปราชญ์ผู้เป็นอมตะ"* — immortal scholar. Every learning persists. Future Claude Code sessions inherit. Pacred-specific knowledge that no LLM training has = our compounding moat.

Cross-link: [`docs/STRATEGY.md`](../STRATEGY.md) §12 · [`.claude/skills/scholar-immortal/SKILL.md`](../../.claude/skills/scholar-immortal/SKILL.md).
