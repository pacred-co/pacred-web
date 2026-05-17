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
