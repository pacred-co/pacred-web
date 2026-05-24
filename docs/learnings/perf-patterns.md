# Learnings — performance patterns

Topics: LCP wins, bundle size reductions, Supabase query optimizations, cache strategy successes.

---

## L-perf-01 · D1 legacy `tb_*` port — secondary indexes are NOT included by 0082 (Sprint-8c+, 2026-05-24)

**Trigger.** Customer reported "หลังบ้านลูกค้า กดแต่ละเมนู โหลดช้ามากๆ กว่าจะไป" — every protected nav was taking **5+ seconds**. After shipping the 30-second chrome cache (Sprint-8b) and the React `cache()` auth memoization (Sprint-8c) the click cost was still 4–5 s on uncached hits.

**Smoking-gun command.** EXPLAIN ANALYZE on a single chrome counter against prod:

```sql
EXPLAIN ANALYZE SELECT COUNT(*) FROM tb_forwarder
  WHERE userid='PR321' AND fcredit='1';
```

```
 Aggregate (cost=5694.92..5694.93 rows=1) (actual time=2832.448..2832.448 rows=0)
   ->  Seq Scan on tb_forwarder
         Filter: ((userid)='PR321' AND fcredit='1')
         Rows Removed by Filter: 47626
 Execution Time: 2832.598 ms
```

**Root cause.** `supabase/migrations/0082_pcs_legacy_indexes.sql` faithfully ports the 18 **UNIQUE** indexes that the legacy MySQL schema declared — and nothing else. Comment in 0082:

> "the legacy MySQL schema carries no non-unique secondary indexes — none are added here (faithful port; Phase-B perf indexes, if needed, land at 0087+)."

The legacy PCS Cargo MySQL DB *itself* had no secondary indexes — it ran on a tiny historic dataset and never noticed. On the ported Supabase project (8,898 customers, 104,591 wallet history rows, 47,626 forwarder rows, …) every `WHERE userid='PR…'` is a **sequential scan** of the entire table. The protected layout's chrome (`lib/legacy/pcs-chrome.ts`) fires 17 of those per uncached load. The math:

```
17 queries × 200–2800 ms per seq-scan = 3.4 – 47 s of DB time per uncached chrome
```

**Fix.** Migration `0108_pcs_legacy_hot_indexes.sql` — 13 btree indexes on `(userid)` / `(userid, fstatus|fcredit|hstatus|id DESC)` for the hot tables (`tb_wallet`, `tb_wallet_hs`, `tb_cash_back`, `tb_credit`, `tb_forwarder`, `tb_header_order`, `tb_payment`, `tb_cart`, `tb_rate_custom_cbm`, `tb_keyword_product`). `ANALYZE` immediately after so the planner picks them up without waiting on autovacuum.

**Measured.** Same EXPLAIN ANALYZE after the indexes:

| Query | Before | After | Speedup |
|---|---|---|---|
| `tb_forwarder COUNT(userid, fcredit)`     | 2832 ms | **6 ms**  | 470× |
| `tb_header_order COUNT(userid, hstatus)`  | 1024 ms | **3.5 ms** | 290× |
| `tb_wallet_hs ORDER BY id DESC LIMIT 50`  |  606 ms | **13 ms** |  46× |
| Chrome 9-counter fan-out (one round-trip) | 4496 ms | **119 ms** | 37× |

**Lesson — faithful-port lens conflicts with index needs.** "Copy 100% first" (ADR-0017) does NOT mean "copy the index list" — the legacy MySQL schema's index list was a bug, not a feature. When porting a `tb_*` table that the customer portal will query on a non-PK column, **add the matching index in the same sprint as the port**. The migration's `ON COLUMN` comment is preserved (faithful); the additional `CREATE INDEX` is the obvious local fix.

**When this pattern fires again.** Any new `tb_*` query landing in a customer Server Component → EXPLAIN ANALYZE against prod BEFORE shipping. If `Seq Scan` shows up with a `userid=` filter, add the index in the same migration. The cost of an oversight here is hidden until the customer feels the lag.

**Cross-links.** `supabase/migrations/0082_pcs_legacy_indexes.sql` (intentional gap) · `supabase/migrations/0108_pcs_legacy_hot_indexes.sql` (the fix) · `lib/legacy/pcs-chrome.ts` (the 17-query chrome).

---

## L-perf-02 · React 19 `cache()` collapses duplicate `supabase.auth.getUser()` per render (Sprint-8c, 2026-05-24)

**Trigger.** Same customer complaint. After indexes (L-perf-01) the chrome DB cost dropped 37× but the layout/sub-layout/page tree was still firing 3–4 independent `supabase.auth.getUser()` round-trips per nav, each Asia-region ~150–400 ms.

**The duplicate-call storm.** A typical `/sales` nav with the OLD code:

```
proxy.ts middleware             →  auth.getUser()    (~250 ms)
(protected)/layout requireAuth  →  auth.getUser() + profiles SELECT (~500 ms)
ImpersonationBanner             →  auth.getUser() (DUPLICATE — different fn)
(protected)/sales/layout        →  auth.getUser() + profiles SELECT (DUPLICATE)
(protected)/sales/page          →  auth.getUser() + profiles SELECT (DUPLICATE)
```

Each helper (`getCurrentUser`, `getCurrentUserWithProfile`, `getEffectiveUser`, plus admin equivalents) was a plain `export async function` — fresh I/O on every call.

**Fix.** Two-step:

1. **Wrap each helper in `cache()` from React.** `cache()` memoises per-server-render (Next.js guarantees no cross-request leakage). Layout + sub-layout + page calling the *same* helper now share one I/O round-trip.

2. **Chain the helpers through `getCurrentUser()`.** Because `cache()` keys on the wrapped function identity, `getCurrentUserWithProfile` and `getEffectiveUser` each still fired their own `auth.getUser()` — fixed by having them both call `await getCurrentUser()` first.

```ts
import { cache } from "react";

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
});

export const getCurrentUserWithProfile = cache(async () => {
  const user = await getCurrentUser();  // ← shared call
  if (!user) return null;
  // … profile fetch
});

export const getEffectiveUser = cache(async () => {
  const user = await getCurrentUser();  // ← shared call
  if (!user) return null;
  // … impersonation check
});
```

Same pattern for `lib/auth/require-admin.ts` (shared `getAdminUserAndRoles` cache + chained through `getCurrentUser`).

**Result.** Per protected nav, auth round-trips dropped from 3–4 to 1 (plus the middleware's separate one, which is needed for cookie refresh and can't share the render-scoped cache).

**Lesson — Server-Component helpers that touch I/O are call-by-call by default.** Until you wrap with `cache()` (or memoise yourself), every component on the page that calls the same helper pays for the same I/O. Pattern rule: **any server helper that wraps an `await supabase.foo` should be `cache(async () => …)` from `react`** — there is essentially no downside (the cache is per-render, freed after).

**Gotcha to watch.** `cache()` keys on (function identity, args). Two *different* functions that both fetch the same data won't share. The chain-through-getCurrentUser pattern fixes that. If you ever see a "why is this still firing twice?" — check it's not two different cached helpers each making the same underlying call.

**Cross-links.** `lib/auth/get-user.ts` · `lib/auth/require-admin.ts` · React docs on `cache` (only available in Server Components / RSC).

---

## L-perf-03 · `unstable_cache` keyed on user makes per-page chrome free after first hit (Sprint-8b, 2026-05-24)

**Trigger.** Before any other fix, every nav re-ran the legacy PCS chrome's 17 Supabase queries (sidebar badges, top-menu keyword strip, VIP/Corporate badges, wallet/cashback/credit totals). Even when the DB is fast (post-L-perf-01) the 17 round-trip cost dominates.

**Fix.** Wrap the chrome loader in `unstable_cache` keyed on `memberCode` with a 30-second TTL + the tag `pcs-chrome`:

```ts
export const loadPcsChromeData = unstable_cache(
  loadPcsChromeDataUncached,
  ["pcs-chrome"],
  { revalidate: 30, tags: ["pcs-chrome"] },
);
```

**Effect.** First nav after sign-in (or every 30 s of idle): pays the 17 queries. Every other nav within 30 s: <10 ms cache hit. Tagged so future Server Actions that change wallet/cart/forwarder counts can call `revalidateTag("pcs-chrome")` to refresh the badge counts immediately.

**Lesson.** Any "render-shared, refreshes occasionally" derived data is a good `unstable_cache` candidate. 30 s is short enough that badges feel live but long enough to absorb a normal click-around-the-portal session.

**Cross-links.** `lib/legacy/pcs-chrome.ts`.

---

## L-perf-04 · Sentry SDK is 474 KB even if unused — full no-op `instrumentation-client.ts` until DSN ships (Sprint-8, 2026-05-24)

**Trigger.** Bundle-analyzer showed `@sentry/nextjs` as ~474 KB uncompressed (~150 KB gzipped) — the single biggest dependency in the customer-portal bundle. The project has `NEXT_PUBLIC_SENTRY_DSN` unset (pre-launch). So the SDK was loading but doing nothing.

**The trap.** A dynamic `import("@sentry/nextjs")` inside `if (dsn) { … }` STILL emits a chunk containing the SDK — the bundler can't prove the branch never fires. Conditional dynamic import was not enough.

**Fix.** Two halves:

1. **`instrumentation-client.ts`** becomes a literal no-op. No `import "@sentry/nextjs"` at all. Just an empty `onRouterTransitionStart` export so the file still satisfies the Next 16 client-instrumentation contract.

2. **`next.config.ts`** wraps with `withSentryConfig` ONLY when the DSN env var is set:

   ```ts
   export default process.env.NEXT_PUBLIC_SENTRY_DSN
     ? withSentryConfig(baseConfig, sentryBuildOptions)
     : baseConfig;
   ```

Both halves needed — `withSentryConfig` injects its own webpack hooks that pull the SDK in even if the client file is empty.

**Restore-time procedure.** When ก๊อต sets `NEXT_PUBLIC_SENTRY_DSN` on Vercel, restore the original `Sentry.init({...})` body in `instrumentation-client.ts`. (Original body preserved as a code-comment in the file's docblock.) The build-time gate flips automatically when the env var appears.

**Lesson.** "Dynamic import is enough" is wrong for bundlers that can't prove the branch is dead. If a 500 KB dep is conditional, gate it at the BUILD config level (where you can omit the plugin entirely), not at the runtime import.

**Cross-links.** `instrumentation-client.ts` · `next.config.ts`.

---

## L-perf-05 · Server-only i18n namespaces should NOT be in `NextIntlClientProvider` (Sprint-8, 2026-05-24)

**Trigger.** `messages/th.json` is 202 KB on disk. Every namespace serialized into the RSC payload adds bytes to every customer's HTML download.

**Fix.** Split namespaces into "client uses `useTranslations(...)` for this" vs "server-only `getTranslations(...)`". Only the former needs to cross the RSC boundary:

```ts
const SERVER_ONLY_NAMESPACES = new Set([
  "admin", "bookingPage", "credit", "dashboard", "footer",
  "footerExtras", "freightReceipt", "hero", "register", "sales",
  "seo", "serviceData", "shipments", "walletShop", "work_chat",
]);

const clientMessages = Object.fromEntries(
  Object.entries(messages).filter(([ns]) => !SERVER_ONLY_NAMESPACES.has(ns)),
);

<NextIntlClientProvider messages={clientMessages}>
```

**Result.** ~20 KB raw / ~5–7 KB gzipped saved on every page boot.

**Audit when adding a new client component.** Grep `useTranslations` — if a client component starts calling `useTranslations("seo")`, move `seo` off the server-only set or the hook throws `MISSING_MESSAGE`. The audit:

```
grep -rE 'useTranslations\(["\x27]NAMESPACE' app components
```

**Lesson.** RSC payload size is a stealth tax — every byte ships on every page render. Splitting client-needs-only vs server-only is one of the cheapest perf wins (no functional change, just bundling discipline).

**Cross-links.** `app/[locale]/layout.tsx`.
