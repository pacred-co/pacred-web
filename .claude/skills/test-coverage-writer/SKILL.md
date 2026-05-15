---
name: test-coverage-writer
description: Use this skill whenever the user wants tests written for existing functionality. Triggers on "เขียนเทสให้หน่อย", "no tests on this function", "raise test coverage", "test every function", "write unit tests for X", "ครอบ test ทุกฟังก์ชั่น" (the user's literal ask). Surveys an untested module, writes the unit + integration tests that exercise its public API, gets them passing on the existing test:unit harness, and documents the coverage gap delta. Defaults to focusing on revenue-critical paths first (cargo flow / wallet / OTP / signup / cart) when no specific target is named.
---

# Test Coverage Writer

> **Why this exists.** Untested code is the slowest part of any change later — every refactor risks unknown breakage. Pacred already has Track A integration tests (P-28..P-31: OTP / wallet / signup / cart-cap), but the rest of the codebase is mostly uncovered. The user said *"เขียนเทสมาให้ครบทุกฟังก์ชั่น"*. This skill does that systematically.

## When to invoke

- ✅ A function or module shipped without tests
- ✅ Coverage report shows a critical path < 60%
- ✅ "We need to refactor X" — write tests first, then refactor safely
- ✅ Pre-emptive: a function is revenue-critical (cargo / wallet / OTP / signup / pricing engine)
- ❌ One-off scripts / migrations — don't need tests
- ❌ UI-only components without logic — visual review beats unit test

## The pattern

```
1. SURVEY the target
   · Read the file. Identify exported functions / classes / route handlers.
   · For each export: what's the input shape? output shape? side effects?
   · Read the file's existing imports to understand fixtures / mocks needed.

2. CLASSIFY each export by test type
   · Pure function (no IO) → unit test (lib/<file>.test.ts)
   · Function that calls DB / network → integration test (mock the client)
   · Server Action → action test (use supertest pattern with Next adapter)
   · Route Handler → API test (request/response simulation)

3. AUDIT EXISTING patterns in the repo — match style
   Look at: lib/auth/otp.test.ts · lib/wallet/ledger.test.ts ·
            lib/service-order/cart-cap.test.ts · lib/analytics/*.test.ts
   Use the same: test harness (node --test) · file naming · assertion style.
   Don't introduce a new framework — match what works.

4. WRITE tests one export at a time
   For each export, write 3-5 tests covering:
   · Happy path
   · Each declared error case (Zod validation failures)
   · Boundary (empty input · max input · null · undefined)
   · Side-effect verification (did DB write happen? was log emitted?)
   · Regression for any past bug captured in docs/learnings/

5. RUN with the existing harness
   pnpm test:unit
   Make every new test pass. If a test exposes a real bug → flag to user,
   don't ship "skip" or "xit" silently.

6. REPORT
   · How many functions covered (delta)
   · How many lines covered (if coverage tool is wired — currently not, but
     can be added with @vitest/coverage or c8)
   · Time taken
   · Any latent bugs found
   · Any flaky tests added (rare — but mark them)

7. CAPTURE pattern to learnings if new
   If the test setup required a non-obvious mock pattern (e.g., mocking
   Supabase admin client) → write to docs/learnings/testing-patterns.md
   for next time.
```

## Pacred test stack

- **Test runner:** Node 24 built-in `node --test` (no Vitest / Jest)
- **Assertion library:** built-in `node:assert/strict`
- **TypeScript:** test files are `.ts` — run via `node --experimental-strip-types` or `tsx`
- **File location:** colocated with source (`lib/foo.ts` → `lib/foo.test.ts`)
- **Naming:** `<module-name>.test.ts`
- **Script:** `pnpm test:unit` (env-independent) vs `pnpm test` (includes placement integration, needs `.env.local`)

## Existing test inventory (as of 2026-05-15)

| File | Coverage |
|---|---|
| `lib/auth/otp.test.ts` | P-28 OTP hash / rate-limit / dual-pepper |
| `lib/auth/signup.test.ts` | P-30 signup validation |
| `lib/wallet/ledger.test.ts` | P-29 wallet ledger semantics |
| `lib/service-order/cart-cap.test.ts` | P-31 cart cap enforcement |
| `lib/analytics/dataLayer.test.ts` | GTM event emission |
| `lib/analytics/clarity.test.ts` | Clarity event emission |
| `lib/experiments/bucketing.test.ts` | A/B deterministic bucketing |
| `lib/experiments/exposure.test.ts` | A/B exposure beacon |

Total: 22 pass / 0 fail / ~240 assertions (per latest run).

## High-priority targets (untested or thin)

Suggest in order — revenue path first:

1. **`lib/forwarder/calc-price.ts`** — rate engine. Critical for service-import revenue. SVIP→VIP→General waterfall + juristic 1% off ≥1000 + +50 PCS service fee. Lots of boundary cases.
2. **`actions/auth.ts`** — `signIn`, `register*` server actions. Auth gate for everything.
3. **`actions/orders.ts`** + **`actions/cart.ts`** — cart cap + auto-cancel + order creation.
4. **`actions/wallet.ts`** — deposit / withdraw approve / soft-degrade. Money flow.
5. **`actions/payment.ts`** — yuan payment flow.
6. **`lib/promptpay.ts`** — QR generation + soft-degrade.
7. **`lib/notifications/`** — LINE push + soft-degrade.
8. **`lib/china-search/`** — RCGroup proxy + TAM API + label-change interim (ADR-0003).
9. **`actions/admin/*`** — every admin action wrapped in `withAdmin([roles])`.

## Template — unit test scaffold (no IO)

```typescript
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { theFunction } from "./theFunction.ts";

describe("theFunction", () => {
  test("happy path: returns expected output for nominal input", () => {
    const result = theFunction({ /* nominal */ });
    assert.deepEqual(result, { /* expected */ });
  });

  test("rejects empty input with Zod error", () => {
    assert.throws(() => theFunction({}), /required/);
  });

  test("boundary: max allowed input", () => {
    const result = theFunction({ amount: 999999 });
    assert.equal(result.ok, true);
  });

  test("regression: bug from 2026-05-XX captured in learnings", () => {
    // ... specific input that broke
  });
});
```

## Template — integration test scaffold (mocked Supabase)

```typescript
import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";

// Pacred pattern for mocking Supabase admin
const mockSupaInsert = mock.fn(async () => ({ data: { id: 1 }, error: null }));
const mockSupa = {
  from: () => ({ insert: mockSupaInsert, select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
};

mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => mockSupa } });

const { theAction } = await import("./theAction.ts");

describe("theAction", () => {
  test("writes record on valid input", async () => {
    const result = await theAction({ /* input */ });
    assert.equal(result.ok, true);
    assert.equal(mockSupaInsert.mock.callCount(), 1);
  });
});
```

## Anti-patterns

- **Testing implementation, not behavior** — assert outputs, not internal call counts.
- **Mocking too deep** — mock the boundary (Supabase client), not internal helpers.
- **Long test names that explain — write the why in the description, not the test name. `"happy path"` is fine if context is clear.**
- **Skipping with `xit` / `test.skip`** — either fix the bug or remove the test. Don't ship "we'll fix later".
- **Snapshot tests for changing UI** — too brittle. Use them only for stable formats (PDF / receipt / JSON-LD).

## Coverage measurement (when ก๊อต wires it)

Pacred doesn't have a coverage tool wired yet. Future work for ก๊อต:

```bash
pnpm add -D c8
# Add to package.json scripts:
# "coverage": "c8 --reporter=text --reporter=html pnpm test:unit"
```

This skill should output a coverage delta once that's wired. Until then, count: "N functions previously untested → N tested now".

## Cross-links

- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — run after writing tests
- [`scholar-immortal`](../scholar-immortal/SKILL.md) — capture mock patterns / Pacred test-stack quirks
- [`docs/PORT_PLAN.md`](../../../docs/PORT_PLAN.md) Part T2 ภูม "Defer Track A integration tests" — note: during emergency revenue sprint, tests are NOT P0 unless they unblock a revenue path. Revisit post-revenue.
