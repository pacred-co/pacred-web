# Learnings — Supabase RLS patterns

Topics: RLS policy that works for Pacred · `is_admin()` SECURITY DEFINER · admin-bypass via service role · customer self-access patterns.

---

## [2026-05-15] `is_admin()` SECURITY DEFINER is THE pattern for admin checks (per ADR-0002)

**Context:** Designing admin-gated routes + RLS for new admin features (container model · tax invoice · accounting port).

**Symptom (anti-pattern):** Putting `WHERE role = 'admin'` directly in RLS policies → tightly coupled to a `profiles.role` column. Changes to role taxonomy require migrating every policy.

**Root cause:** Mixing role granularity into every policy = brittle. Centralize.

**Fix:** Always use the SECURITY DEFINER function:
```sql
-- Policy on any admin-readable table:
CREATE POLICY "admins can read everything"
  ON containers FOR SELECT
  USING (is_admin(ARRAY['super', 'ops', 'warehouse']));
```

The `is_admin(text[])` function lives in the database, runs as DEFINER (bypasses callee's RLS to query the `admins` table), returns `true` if the calling auth.uid() has any of the requested roles in `admins.role`.

Server-side equivalent in code:
```typescript
import { requireAdmin } from "@/lib/auth/require-auth";
await requireAdmin(["super", "ops"]);
```

**Why this matters next time:** Don't ever write `WHERE role = ...` directly. Always go through `is_admin()`. If you need a new role → add it to the `admins.role` enum + redeploy. Policies don't change.

**Cross-links:**
- [ADR-0002](../decisions/0002-admin-architecture.md)
- [`lib/auth/require-auth.ts`](../../lib/auth/require-auth.ts)
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — uses this pattern

---

## [2026-05-15] Service role bypass is for trusted server actions ONLY

**Context:** Admin server action needs to read across customers (e.g., aggregating wallet topups).

**Symptom (anti-pattern):** Using `createClient()` (RLS-respecting) + relying on `is_admin()` policies → still requires admin user to be the authenticated identity. Cron jobs / server-only operations fail.

**Root cause:** RLS policies check `auth.uid()`. Cron jobs don't have a `auth.uid()`.

**Fix:** `createAdminClient()` from `lib/supabase/admin.ts` uses the service role (bypasses RLS entirely). Use ONLY in:
- Server actions wrapped in `withAdmin([roles])` (per ADR-0002 — the wrapper enforces the role check at API boundary instead of in DB)
- Vercel cron handlers (`app/api/cron/*`)
- Background jobs that need to operate across all rows

**Never** use service role in:
- Pages (let RLS protect)
- Public route handlers
- Client components (never — service role would be exposed)

**Why this matters next time:** When a query "should work but RLS denies" — first check: is this a server action with admin guard? Should it use admin client? If yes, switch to `createAdminClient()`. If no (it's a customer-facing route), the RLS denial is correct.

**Cross-links:**
- [`lib/supabase/admin.ts`](../../lib/supabase/admin.ts)
- [`lib/supabase/server.ts`](../../lib/supabase/server.ts)
- [`actions/admin/*`](../../actions/) — withAdmin pattern

---

## [2026-05-15] Owner-only access pattern (customer can read own rows)

Pacred recurring pattern:

```sql
-- Allow each customer to read their own rows
CREATE POLICY "customers read own rows"
  ON service_orders FOR SELECT
  USING (customer_id = auth.uid());

-- Allow admins to read all rows
CREATE POLICY "admins read all"
  ON service_orders FOR SELECT
  USING (is_admin(ARRAY['super', 'ops']));
```

`SELECT` policies OR each other (default Postgres behavior), so any policy passing → row allowed.

**Why this matters next time:** Each user-data table needs:
1. Owner-read policy (customer sees own)
2. Admin-read policy (staff sees all)
3. Insert: owner or admin
4. Update: usually admin only (or specific fields owner can update)
5. Delete: usually admin only (or soft-delete via status column)

Codify in migration template — see `.claude/skills/copyist-unlimited/SKILL.md` for the template approach.

**Cross-links:**
- [`supabase/schema.sql`](../../supabase/schema.sql) — initial RLS patterns
- Pacred migrations 0001..0032 — examples to copy from

---

## [2026-05-16] Admin client for customer-initiated cross-table mutations (verify-ownership-then-bypass)

**Context:** Customer-side "pay from wallet" action — customer needs to:
1. Verify their own order exists + is in `awaiting_payment` status
2. Insert a `wallet_transactions` row (debit)
3. Flip `service_orders.status` → `ordered`

Step 3 is a server-controlled state machine transition — RLS should NOT let a customer change `status='ordered'` directly (otherwise they'd skip payment entirely). But for a server action where we've ALREADY verified ownership server-side, the admin client is the clean way to bypass.

**Symptom (anti-pattern):** Trying to do everything through `createClient()` (RLS-respecting):
- Customer inserts wallet_tx → works if RLS allows own inserts
- Customer updates service_orders.status → BLOCKED by RLS (correctly — they shouldn't have direct update access)

So the action gets stuck.

**Root cause:** RLS protects against direct API access by malicious customers. But within a server action that runs server-only code (with full auth context), the admin client is appropriate AFTER the ownership check.

**Fix — secure pattern:**
```typescript
export async function payServiceOrderFromWallet(hNo: string) {
  // Step 1: RLS-protected fetch confirms ownership
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data: order } = await supabase
    .from("service_orders")
    .select("id, status, total_thb")
    .eq("h_no", hNo)
    .maybeSingle();
  if (!order) return { ok: false, error: "not_found" };  // RLS denied → null
  if (order.status !== "awaiting_payment") return { ok: false, error: "not_payable" };

  // Step 2+3: admin client for state-machine transition (ownership already confirmed)
  const admin = createAdminClient();
  const { data: tx } = await admin
    .from("wallet_transactions")
    .insert({ profile_id: user.id, amount: -order.total_thb, ... })
    .select("id")
    .single();
  await admin
    .from("service_orders")
    .update({ status: "ordered", date_ordered: now })
    .eq("id", order.id);

  return { ok: true, data: { tx_id: tx.id } };
}
```

**Pattern rule:**
- Fetch with RLS-respecting client → confirms ownership
- Mutate with admin client → bypasses RLS for state-machine transitions
- NEVER skip step 1 — RLS-bypass without ownership check = direct API exposure

**Why this matters next time:**
- Any "customer self-service" action that flips order status / triggers downstream effects follows this pattern
- Used in: `payServiceOrderFromWallet` (shop-order) + `payForwarderFromWallet` (forwarder) — both in commits `323906b` + `2be9eb5`
- Other future use cases: customer cancels order (flip to cancelled with refund), customer marks delivery received (flip to completed), customer requests tax invoice (insert tax_invoices row referencing service_orders row they own)

**Cross-links:**
- `actions/service-order.ts::payServiceOrderFromWallet` (canonical example)
- `actions/forwarder.ts::payForwarderFromWallet` (mirror)
- `docs/decisions/0002-admin-architecture.md`

---

## [2026-05-17] Check-then-act idempotency on a money path needs a DB unique index, not a SELECT

**Context:** T-D1 production smoke-gate re-audit of the cargo revenue path (เดฟ via Claude).

**Symptom (anti-pattern):** `payServiceOrderFromWallet` guarded against double-charging like this:

```ts
// 1. look for an existing completed payment
const { data: existingTx } = await supabase.from("wallet_transactions")
  .select("id").eq("reference_id", hNo).eq("kind", "order_payment")
  .eq("status", "completed").maybeSingle();
if (existingTx) return { ok: true, data: { already_paid: true } };
// 2. ... balance check ...
// 3. INSERT the -total_thb debit
```

Steps 1 and 3 are **not atomic**. Two requests racing through the gap (customer submits from 2 tabs, hits back-then-resubmit, or an API replay) both see "no existing tx" → both INSERT → **double debit**. A `disabled={pending}` button only blocks the *same* button instance, not a second tab / replay.

**The fix — let the DB enforce it.** A *partial unique index* makes the 2nd INSERT fail atomically:

```sql
create unique index if not exists wallet_tx_order_payment_uniq
  on public.wallet_transactions (reference_id)
  where kind = 'order_payment'
    and reference_type = 'order_header'
    and status = 'completed';
```

Then in the action, keep the cheap SELECT as a fast path but catch the unique-violation (`error.code === '23505'`) as the real backstop → re-SELECT → return `already_paid: true`.

**Rule:** any "insert exactly one of X" on a money / status path — the uniqueness must live in the DB (unique index / constraint), never only in an application `SELECT`-then-`INSERT`. The app check is a UX nicety; the DB constraint is the correctness guarantee.

**Cross-links:**
- Finding G9 → [`docs/runbook/cargo-smoke-test-T-D1.md`](../runbook/cargo-smoke-test-T-D1.md) §"Re-audit 2026-05-17"
- ภูม fix F-11 → [`docs/runbook/poom-handoff-2026-05-16.md`](../runbook/poom-handoff-2026-05-16.md)
- Same pattern to fix: `actions/admin/service-orders.ts::adminMarkServiceOrderPaid`

---

## [2026-05-17] `wallet.balance` is pending-blind — spend checks must use the available-balance helper

**Context:** Fixing gap-customer.md §H-1 — a customer-facing wallet overdraw hole. Migration 0064 + `lib/wallet/balance.ts`.

**Symptom:** `createWithdraw` (and wallet-paid `createYuanPayment`) insert their debit row as `status='pending'`, then guard with `wallet.balance < amount`. A customer could submit N withdraw requests, each individually ≤ balance, none rejected. When an admin later approved them all, the main balance went **negative** — Pacred pays out money it was never funded for.

**Root cause:** The 0007 balance trigger `wallet_recompute_balance` recomputes `wallet.balance` from `sum(amount) WHERE status='completed'` — pending rows are deliberately excluded (a pending deposit must not inflate the balance). The side effect: a pending *debit* doesn't reduce `wallet.balance` either. So every check that reads the raw `wallet.balance` column is blind to this customer's own not-yet-approved debits, and stacked pending requests each pass independently.

**Fix — two layers, one rule:** "available balance = completed rows + open pending DEBITS" (pending credits still don't count).
- App layer — `lib/wallet/balance.ts` `getWalletAvailableBalance()`. Every wallet-spend path (`createWithdraw`, `createYuanPayment`, `payServiceOrderFromWallet`, `payForwarderFromWallet`, the admin mark-paid actions, the freight wallet debit) now checks *that*, not `wallet.balance`.
- DB layer — migration 0064 `wallet_assert_no_overdraw` BEFORE INSERT/UPDATE trigger: a hard non-negative floor on customer pending main-bucket debits, with a `FOR UPDATE` row lock so it holds under concurrent submits. It deliberately does NOT block `status='completed'` debits (pay-from-wallet / admin `allow_overdraw` depend on writing those) or `kind='adjustment'`.

**Why this matters next time:** Any NEW code deciding "can this customer spend X" must call `getWalletAvailableBalance()` — never `select balance from wallet`. The raw column is correct for *display* but wrong as a *spend gate*. Early-warning sign: a `.from("wallet").select("balance")` followed by a comparison before an insert → that's the bug, use the helper. Note: pending→completed approval never trips the 0064 trigger (the status flip leaves available balance unchanged), so admin approval flows stay safe.

**Cross-links:**
- gap-customer.md §H-1 · migration `0064_wallet_overdraw_guard.sql` · `lib/wallet/balance.ts`
- Sibling money-path rule: the check-then-act entry above (0049 unique index)
- Out of scope here (separately tracked): money-audit P0-2 (yuan debit RLS-blocked) and P1-1 (concurrent pay-from-wallet on `completed` rows)

---

## [2026-05-23] `{rows.length}` is a LIE when the query has `.limit(N)` — use `count: "exact", head: true`

**Context:** ภูม flagged a screenshot showing `/admin/drivers/work` "ทั้งหมด" view at 0 รอขึ้นรถ but the per-driver filter showed 1 รอขึ้นรถ. Wider audit found 5 more QA-queue pages with the same family of bug, plus 1 in `/admin/rates/custom-hs` (Wave 9 my work) and 7 pre-existing.

**Symptom:** Counter chips on admin lists show capped/wrong totals:
- "200 รายการ" when there are actually 463 (the 200 limit hit the display window cap)
- "0 รายการ" when there are actually 72 (the limit window didn't reach far enough back to include the rare-status items)

**Root cause:** Two patterns both feed the same bug:

1. **Window-from-related-table** (worst case — `drivers/work`):
   ```ts
   const batches = await db.from("tb_forwarder_driver")
     .select(...).order("fddate", desc).limit(200);  // last 200 batches by date
   const items = await db.from("tb_forwarder_driver_item")
     .select(...).in("fdid", batches.map(b => b.id));
   const pending = items.filter(i => i.fdistatus === "").length;  // ❌ tiny number
   ```
   The 200-batch window slides forward in time as new batches arrive — old pending items fall off the back. A `{pending}` count built from this is window-bound, not global.

2. **Display-window-as-count** (most common — QA queues):
   ```ts
   const rows = await db.from("tb_forwarder")
     .select(...).eq("fstatus", "1").limit(200);
   return <div>{rows.length} รายการ</div>;  // ❌ caps at 200 even if 1000 breaching
   ```

**Fix:**
```ts
// Counter chip → separate exact-count query (head:true is index-only · cheap)
const { count: breachCount } = await db
  .from("tb_forwarder")
  .select("id", { count: "exact", head: true })
  .eq("fstatus", "1")
  .lt("fdate", cutoff);

// Display list → keep the limit · operator scrolls top 200 most-urgent
const { data: rows } = await db
  .from("tb_forwarder")
  .select(/* full row */)
  .eq("fstatus", "1")
  .lt("fdate", cutoff)
  .order("fdate", { ascending: true })  // most-overdue first
  .limit(200);

return (
  <>
    <span>{breachCount ?? rows.length} รายการ</span>
    {breachCount && breachCount > rows.length && (
      <span>· แสดง {rows.length} ล่าสุด</span>
    )}
    {/* … table */}
  </>
);
```

**Why this matters next time:** Anytime you write a count chip on a list page, ask "does my data query have `.limit(N)` AND can the real total exceed N?" If both yes → add a separate `count: "exact", head: true` query before the chip. The cost is one extra index-only query (sub-millisecond). The bug shape is invisible until prod data crosses the limit threshold — your dev DB with 50 rows looks fine.

For `.or()` conditions (e.g. `userid IS NULL OR userid = ''`), push the OR into BOTH queries so the count matches the data shape:
```ts
const [{ data }, { count }] = await Promise.all([
  db.from("t").select(...).or("a.eq.,a.is.null").limit(200),
  db.from("t").select("id", { count: "exact", head: true }).or("a.eq.,a.is.null"),
]);
```

**Cross-links:**
- Commits `39c1407` (drivers/work) + `9303994` (5 QA queues Group B) + `546e835` (rates/custom-hs) — all part of the same fix wave
- Existing good pattern: `/admin/qa/credit-overdue` (Agent A Group A) — see how it does the separate count query alongside the data query
- Still-buggy pre-existing pages (deferred · tech debt): `accounting/container-costs` · `audit` · `forwarders/notes` · `incidents` · `juristic-check` · `reports/monthly-orders` · `service-orders/notes`
- Related family of "verify green ≠ prod" — this bug passes tsc/lint/build cleanly + only surfaces with real-volume data

---

## [2026-05-23] PgBouncer + PostgreSQL sequence cache = unfixable through ALTER — use MAX()+1 instead

**Context:** Wave 13 collision fix on prod — Pacred-web `profiles.member_code` was generated by a sequence trigger (migration 0060) that started at 1 with no awareness of legacy `tb_users.userid` (PR1..PR10899). 4 new customer signups (PR120..PR124) collided with 4 different 2021-vintage legacy customers. The migration to shift the sequence past the legacy range and add a collision-safe trigger looked simple — it was a **4-hour debug loop**.

**Symptom — "impossible" inconsistency between Dashboard query and trigger fire:**
- `select last_value from public.member_code_seq` → 11000 ✓
- `select nextval('public.member_code_seq')` → 11073 ✓ (sequence is at the new high range)
- INSERT triggering `generate_member_code()` (which calls the **same** `nextval('public.member_code_seq')`) → emits PR100..PR110 every time, errors after 10 retries
- Reproduces in Supabase SQL Editor AND via supabase-js (both hit the same pooler)
- Restart of `CREATE OR REPLACE FUNCTION` confirmed function body uses `public.member_code_seq` (no schema-resolution issue)
- `pg_proc` shows only ONE `generate_member_code` (no shadowing)

**Root cause — PgBouncer pool sessions cache pre-allocated sequence batches that ALTER does not invalidate.**

PostgreSQL sequences have a `CACHE` parameter (default 1; may be set higher to reduce contention). On every `nextval()` from a fresh session, the backend pre-allocates a batch of `CACHE` values and serves them locally without going back to the sequence object. So:
- A pool session opens when sequence is at 100, `nextval()` allocates 100..149 to that session (if CACHE=50)
- ALTER SEQUENCE RESTART WITH 11000 happens — the sequence object resets, but the existing session **still has its 100..149 in memory**
- That session keeps emitting 100, 101, 102, ... until its 50 cached values are exhausted
- New sessions started after the ALTER will get 11000+ values
- Supabase pool keeps sessions alive for hours → cached batches persist for hours

**What DOES NOT invalidate the pool's cached batches** (we tested all of these):
- `ALTER SEQUENCE RESTART WITH N`
- `ALTER SEQUENCE CACHE 1` (applies to *future* allocations only)
- `DROP SEQUENCE ... CASCADE; CREATE SEQUENCE ...` (sessions might keep their pre-DROP cached values until the next allocation attempt errors)
- `SELECT setval(seq, N, false)`

**What WOULD invalidate them:** restarting the Supabase API server (Dashboard → Project Settings → Database → "Restart") so the pool recycles all sessions. But this is a ~30-second downtime + ภูม didn't want that.

**Fix — abandon the sequence entirely.** Replace the trigger function with a `MAX()+1` query across both tables:

```sql
create or replace function public.generate_member_code() returns trigger as $$
declare
  next_num int;
  candidate text;
begin
  if new.member_code is not null then
    return new;
  end if;

  -- MAX across BOTH tables + floor (PR11099 → minimum next = PR11100)
  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles
              where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 3))::int)
              from public.tb_users
              where userid ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 4))::int)
              from public.tb_users
              where userid ~ '^PCS[0-9]+$'), 0),
    11099
  ) + 1 into next_num;

  -- Walk forward for race-safety (UNIQUE constraint also catches it,
  -- but the explicit walk is faster than catching a constraint violation)
  loop
    candidate := 'PR' || next_num::text;
    if not exists (select 1 from public.tb_users where userid = candidate)
       and not exists (select 1 from public.profiles where member_code = candidate) then
      new.member_code := candidate;
      return new;
    end if;
    next_num := next_num + 1;
  end loop;
end;
$$ language plpgsql;
```

- ✅ No sequence at all → no pool cache to worry about
- ✅ Deterministic — every call computes from current table state
- ✅ Race-safe via `profiles.member_code UNIQUE` + the inline walk
- ⚠ Cost — 3 indexed `MAX()` queries per insert. On Pacred this is <1ms (profiles has 24 rows, tb_users 8,890 — both with indexed userid/member_code columns). Acceptable; signup rate is not high-throughput.

**Rule going forward:** Never use a Postgres sequence for any value that downstream code needs to *predict* under a pooled connection. Use sequences only for "give me a unique number, I don't care what" cases (e.g., audit log primary keys). For predict-value-required logic (PR codes, invoice numbers, anything that has to be ≥ some floor): use `MAX()+1` + a UNIQUE constraint.

**Early-warning sign in code review:** any `ALTER SEQUENCE ... RESTART WITH` or `ALTER SEQUENCE ... CACHE` on a sequence read by application code → flag it; in a pooled environment this won't behave the way it does on a single-connection psql.

**Cross-links:**
- Migration `0095_pr_sequence_shift_collision_fix.sql` — the rewrite
- Commits: `f6922dd` (initial sequence-based attempt) → `4123f86` (4 renames applied) → `bac69fa` (final MAX()+1 rewrite)
- Diagnostic scripts: `scripts/survey-pr-sequence.ts` · `scripts/survey-pr-collisions.ts` · `scripts/verify-0095.ts`
- Companion lesson — backfill-image flow leaned on the same Supabase pool but didn't hit this trap because uploads don't read sequences. Worth knowing the trap exists before the next migration touches sequences.

---

## [2026-05-27] PostgREST cross-embed PGRST200 — two tables sharing a parent FK ≠ direct FK

**Context:** Wave 22 tb_admin → admins merge. Wrote queries like `admins.select("*, extras:admin_contact_extras!profile_id(*)")` to JOIN the role grant with HR sidecar in one call. Page 500 on prod immediately.

**Symptom:** `PGRST200: Could not find a relationship between 'admins' and 'admin_contact_extras' in the schema cache. Searched for a foreign key relationship between 'admins' and 'admin_contact_extras' using the hint 'profile_id' in the schema 'public', but no matches were found.`

**Root cause:** `admins.profile_id` FK → `profiles(id)`. `admin_contact_extras.profile_id` FK → `profiles(id)`. Both tables FK to the same parent, but **neither has a FK to the other.** PostgREST embed syntax (`!profile_id`) is a hint for which FK to use, NOT a way to bridge tables through a common parent. Without a direct FK, PostgREST rejects — schema-cache reload (`NOTIFY pgrst, 'reload schema'`) doesn't help; the relationship literally doesn't exist.

**Fix (the pattern that works):** Replace the cross-embed with 2-3 separate queries + JS merge. The forward FK embed (`profile:profiles!profile_id(...)`) still works because that IS a direct FK.

```ts
// ❌ FAILS — no direct FK between admins and admin_contact_extras
const { data } = await admin
  .from("admins")
  .select(`
    profile_id, role, is_active,
    profile:profiles!profile_id (...),       // ✅ works — direct FK
    extras:admin_contact_extras!profile_id (...) // 💥 PGRST200
  `);

// ✅ WORKS — 3 queries + JS merge
const adminGrants = await admin.from("admins").select("profile_id, role, is_active").returns<...>();
const profileIds = [...new Set(adminGrants.data?.map(g => g.profile_id) ?? [])];
const [profiles, extras] = await Promise.all([
  admin.from("profiles").select("*").in("id", profileIds),
  admin.from("admin_contact_extras").select("profile_id, *").in("profile_id", profileIds),
]);
const profilesMap = new Map(profiles.data?.map(p => [p.id, p]) ?? []);
const extrasMap   = new Map(extras.data?.map(e => [e.profile_id, e]) ?? []);
const rows = adminGrants.data?.map(g => ({
  ...g,
  profile: profilesMap.get(g.profile_id) ?? null,
  extras:  extrasMap.get(g.profile_id)  ?? null,
}));
```

**Why this matters next time:** Pacred's admin storage is **deliberately split into 3 tables** (profiles · admins · admin_contact_extras · per ADR-0002). The composite-PK on `admins` (profile_id, role) means even adding a FK from extras → admins is awkward (one profile can have multiple roles). The split is right; the query shape needs to accept it. **Anytime you embed two child tables that share a parent FK, ask: is there a DIRECT FK between them?** If not — split into separate queries.

**Early-warning signs in code review:**
- `from("tableA").select("..., somename:tableB!shared_col(...)")` where `shared_col` is a FK on BOTH A and B pointing to a third table C, NOT a FK between A and B
- PostgREST error mentioning "Could not find a relationship between 'X' and 'Y'"
- Pages that 500 with "schema cache" wording — check FK shape, NOT just the cache

**Detection — TypeScript narrowing gotcha post-fix:** After splitting, Supabase's `{ data, error }` discriminated union widens via `error: true` so `(data ?? []).map(p => p.id)` will TS2352 unless you narrow first. Pattern: `const arr = (res.data ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>;` after the `if (res.error) throw` guard. Or define explicit per-row types and cast through `unknown`.

**Cross-links:**
- Commit `61696d3` — the 4-file fix (page.tsx + actions + hr + transfer-rep)
- Commit `f2e731d` — Agent I's original (with the broken cross-embed pattern)
- `docs/research/tb-admin-merge-intel-2026-05-27.md` — the architecture context (why admins + admin_contact_extras are split tables)
- ADR-0002 admin-architecture — the design rationale for the 3-table split
