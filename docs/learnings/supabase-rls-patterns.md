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
