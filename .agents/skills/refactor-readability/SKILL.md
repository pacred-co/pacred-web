---
name: refactor-readability
description: Use this skill when code is hard for a human to scan in 30 seconds. Triggers on "this is hard to read", "deeply nested", "refactor for humans", "อ่านยาก", "ทำให้อ่านง่ายขึ้น", "รีแฟคเตอร์ให้คนอ่านง่าย", or when an agent flags during phase-verify that a recently-touched file has gone over readability thresholds (function > 80 lines · nesting > 4 levels · params > 6). Refactors WITHOUT changing observable behavior — uses tests as the safety net (run test-coverage-writer first if no tests exist). Prefers structural fixes (extract function · extract type · early-return) over surface fixes (rename only).
---

# Refactor for Readability

> **Why this exists.** The user (เดฟ) said *"รีแฟคเตอร์ให้คนอ่านง่าย"*. Pacred has 4 humans + a rotation of Codex sessions reading every file every week. If a file is dense, every reader pays a tax. This skill is the systematic way to pay it down — without breaking what works.

## When to invoke

- ✅ Function > 80 lines
- ✅ Cyclomatic complexity > 10 (nested if/loops)
- ✅ Same constant appears in > 3 places (extract candidate)
- ✅ Parameter list > 6 items (extract input type)
- ✅ A reviewer says "I have to read this twice"
- ❌ A function that works, is short, and isn't touched often — leave it
- ❌ Speculative refactor "to be ready for future feature" — wait until that feature

## The rules

1. **Behavior is sacred.** Tests must pass identically before + after. No new behavior, no removed behavior. If tests don't exist for the target → write them first via `test-coverage-writer` skill.

2. **Prefer extraction over inlining.** Splitting a 100-line function into 3×30-line functions is almost always a win, even if you "could just read the original".

3. **Name like a teacher.** Function names should explain to a newcomer what the function does without reading its body. `processOrder` is bad. `applyJuristicDiscountAndAttachServiceFee` is good (long but useful).

4. **Early return over nested if.** Replace nested success/error logic with guard clauses at top.

5. **Extract magic numbers / strings into named constants** — at file top with a comment explaining the value.

6. **Don't change the public API** unless the caller is a single file you also refactor in the same commit.

7. **One refactor per commit.** "extract calcPrice() + rename users to customers + clean up imports" is 3 commits, not 1. Easier to revert + review.

8. **Comments answer WHY, not WHAT.** Per Pacred convention. If you find a WHAT comment → extract the function so the name carries the WHAT.

## The pattern

```
1. PICK target file. Confirm scope ownership (per team.md §1.3).
   · If outside your scope (e.g., ปอน refactoring lib/) → skip + flag to owner.

2. SAFETY NET first
   · Run pnpm test:unit, grep for tests of the target file.
   · If 0 tests → run test-coverage-writer skill on it first. Stop here.
   · If tests exist → record current pass count. This is the contract.

3. IDENTIFY refactoring opportunities (read the file once with this lens):
   a) Long functions (> 80 lines) → extract sub-functions
   b) Repeated patterns (3+ places) → extract helper
   c) Nested conditionals (> 3 deep) → guard clauses / early return
   d) Magic literals → named constants
   e) Long param lists (> 6) → input type
   f) Vague names → rename
   g) Useless / lying comments → delete or replace with named-extraction

4. RANK by reader-pain. Fix #1 first. Commit. Re-run tests.

5. REFACTOR one item at a time:
   · Make the change
   · Run pnpm test:unit
   · If green → commit with message `refactor(<scope>): <what> for readability`
   · If red → revert + investigate; the refactor wasn't behavior-preserving
   · Move to next item

6. CAPTURE refactor patterns that worked / didn't to docs/learnings/.
   Especially Pacred-specific quirks: i18n surface preservation, ADR
   compliance (e.g., admin guards must stay wrapped in withAdmin), etc.
```

## Pacred-specific gotchas

- **Server vs Client components.** A `"use client"` directive matters. Don't move client logic into a Server Component file or vice versa.
- **`@/i18n/navigation`** — `Link` must stay imported from here, not `next/link`.
- **`is_admin()` SECURITY DEFINER** — admin route guards via `requireAdmin([roles])`. Don't strip this in a refactor.
- **`actions/admin/*`** — must wrap in `withAdmin([roles])` + `logAdminAction()` + `sendNotification()` (per ADR-0002). Refactor must preserve the chain.
- **i18n keys** — if you rename a translation key, update `messages/th.json` AND `messages/en.json` AND every callsite. `pnpm audit:i18n` will catch parity.
- **Constants from `components/seo/site.ts`** — if you see hardcoded phone / email / address in a file → extract to import. Track in `pacred-info.md` L-contact-refactor.

## Reader-pain ranking (when prioritising)

| Pain | Why | Example |
|---|---|---|
| **🔴 Critical** | Reader can't tell what function does without 5+ min study | 100-line function with 4-level nesting + 8 params |
| **🟠 High** | Wrong-place comments, lying names | `// validates user` above code that validates an order |
| **🟡 Medium** | Magic numbers without explanation | `if (price > 1000)` — what's 1000? |
| **🟢 Low** | Unused imports, formatting drift | Cosmetic |

Don't waste a commit on 🟢 — wait until you're in the file anyway.

## Anti-patterns

- **Big-bang refactor** — touching 10 files in one PR. Impossible to review safely.
- **Refactor + feature in same commit** — separate them. Always.
- **Speculative abstraction** — extracting a "BaseService" class because "we might need it" → YAGNI until 3rd concrete use case.
- **Renaming for taste** — `users` → `members` because you prefer "members" is not refactor, it's churn. Skip unless there's a clear semantic reason (e.g., aligning with domain language).
- **Touching files outside your scope** — boundary violation per `team.md` §1.3.

## Output template (for refactor commit message)

```
refactor(<scope>): extract <function-name> for readability

The original <originalFn> grew to <N> lines mixing <concerns A, B, C>.
Pulling <concern A> out into <extractedFn> lets readers see <high-level
intent> without diving into <low-level mechanism>.

No behavior change. Tests pass identically (X pass / 0 fail, same as
before refactor — see `pnpm test:unit`).

Reader-pain: 🔴 → 🟢
```

## Cross-links

- [`test-coverage-writer`](../test-coverage-writer/SKILL.md) — write the safety net first
- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — verify post-refactor
- [`scholar-immortal`](../scholar-immortal/SKILL.md) — capture patterns
- [`docs/conventions.md`](../../../docs/conventions.md) — code style (commit format · naming · comments policy)
