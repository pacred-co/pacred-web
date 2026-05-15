# ADR-0014 — Customer self-service state-machine transitions (admin-client-after-ownership-verify pattern)

**Status:** Accepted (canonicalised after 2× shipping evidence, 2026-05-16 evening)
**Date:** 2026-05-16
**Phase:** Cargo loop closure (Part T2 emergency sprint + Part U U1 batch)
**Owner:** เดฟ (pattern author) · ภูม (mirror in admin domain)

> **Reservation note:** ADR-0011 (ERP RBAC granular roles), ADR-0012 (ERP frontend shell), ADR-0013 (V2→V3 ERP migration) are **reserved for ก๊อต Sprint 7+ Track D**. This ADR slots in at 0014.

---

## Context

Pacred V2 cargo loop closure (evening of 2026-05-16) required customer self-service for two payment flows:

1. **`payServiceOrderFromWallet(hNo)`** — China-shop order pay (shipped commit `323906b`)
2. **`payForwarderFromWallet(fNo)`** — cargo-import order pay (shipped commit `2be9eb5`)

Before these shipped, every order paid required an admin to manually run `adminMarkServiceOrderPaid` / its forwarder mirror → per-order admin bottleneck → owner stress + slow cash flow.

The functional requirements:

- Customer initiates the action (NOT admin)
- Wallet must debit atomically
- Order state-machine transitions (e.g. `awaiting_payment` → `ordered`)
- Idempotent (re-click safe)
- Notify customer
- Audit trail preserved on partial failure

But these touch protected tables: `wallet_transactions` (customer can insert via RLS) AND `service_orders.status` / `forwarders.status` (customer should NOT update freely — server-controlled state machine).

## The dilemma

**Option A — Pure RLS-respecting (customer client)**
- Customer inserts wallet_tx → works (RLS allows own inserts)
- Customer updates `service_orders.status='ordered'` → **BLOCKED by RLS** (correctly — they could skip payment otherwise)
- Action gets stuck mid-flow

**Option B — Admin client throughout**
- Insert wallet_tx + update status with `createAdminClient()` (bypasses RLS)
- Problem: skipping ownership check exposes the action to any authenticated caller acting on someone else's order
- One missing `eq("profile_id", user.id)` = security incident

**Option C — Hybrid: verify-then-bypass (this ADR's decision)**
- Fetch row with RLS-respecting client → ownership confirmed (RLS returns null if not owned)
- THEN switch to admin client for the mutations
- Best of both: ownership enforced by RLS, state-machine bypass justified by server-side verification

## Decision

**Adopt Option C as the canonical pattern for customer-initiated state-machine transitions.**

### Pattern (TypeScript)

```typescript
"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications";
import { notify } from "@/lib/notifications/templates";

export async function customerActionExample(refId: string): Promise<ActionResult<{ ok: boolean }>> {
  // ── 1. Auth check ──
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // ── 2. Verify ownership + business preconditions via RLS-respecting fetch ──
  //    If user doesn't own row, RLS returns null → we error out cleanly.
  const { data: row } = await supabase
    .from("some_table")
    .select("id, status, /* other fields needed */")
    .eq("public_id", refId)
    .maybeSingle();
  if (!row) return { ok: false, error: "not_found" };
  if (row.status !== "expected_pre_state") return { ok: false, error: "wrong_state" };

  // ── 3. Idempotency check (if action has side effects) ──
  //    Key on (reference_type, reference_id, action_kind, status='completed').
  const { data: existingTx } = await supabase
    .from("side_effect_table")
    .select("id")
    .eq("reference_type", "some_table")
    .eq("reference_id", row.id)
    .eq("kind", "this_action")
    .eq("status", "completed")
    .maybeSingle();
  if (existingTx) return { ok: true, data: { ok: true } };  // short-circuit

  // ── 4. NOW switch to admin client for the mutations ──
  //    Justified by step 2 confirming ownership.
  const admin = createAdminClient();

  const { data: tx, error: txErr } = await admin
    .from("side_effect_table")
    .insert({ /* ... */, profile_id: user.id })
    .select("id")
    .single();
  if (txErr) return { ok: false, error: txErr.message };

  const { error: stateErr } = await admin
    .from("some_table")
    .update({ status: "expected_post_state" })
    .eq("id", row.id);
  if (stateErr) {
    // ── 5. Don't roll back side effect — preserve audit trail ──
    //    Admin reconciles manually if needed (mirror admin override action
    //    has `already_paid` short-circuit for this case).
    return { ok: false, error: `state update failed AFTER side-effect (id ${tx.id} stays): ${stateErr.message}` };
  }

  // ── 6. Notify + revalidate ──
  void sendNotification(user.id, notify.someChange({ /* ... */ }));
  revalidatePath(`/some-section/${refId}`);
  revalidatePath("/some-section");

  return { ok: true, data: { ok: true } };
}
```

### Rules (load-bearing)

1. **Step 2 must use RLS-respecting client** (`createClient()` not `createAdminClient()`). RLS confirms ownership; admin client would skip this.
2. **`.eq("profile_id", user.id)` is OPTIONAL** in step 2 when RLS policy on the table is `profile_id = auth.uid()` (RLS implicitly enforces). Explicit eq is OK as belt + suspenders.
3. **Step 4 mutations use admin client.** This is intentional. Don't fall back to customer client for the state update — it will be RLS-rejected (correct behavior, but blocks the legitimate flow).
4. **Step 3 idempotency check uses RLS-respecting client.** Catches replay attacks (customer trying to insert a duplicate tx).
5. **Step 5 — DO NOT roll back the side effect on state-update failure.** Preserve the audit trail; admin reconciles via the mirror admin action (`adminMarkServiceOrderPaid` etc. — has `already_paid: true` short-circuit).
6. **Notify with fire-and-forget `void`** (don't await). Notification failures should not block the action.

## Consequences

**Positive:**
- Customer self-service reduces admin bottleneck (closes chat audit L-2 / L-3 indirectly — admin focuses on exceptions, not routine ops)
- Security posture unchanged — RLS still enforces ownership at step 2; admin client used only after that gate
- Idempotency built in by default → safe for double-click, retry-on-network-fail
- Audit trail preserved on partial failure → admin can reconcile from `/admin/<entity>` mirror UI

**Negative:**
- Pattern is non-obvious to first-time readers (why two clients?). Mitigated by this ADR + `docs/learnings/supabase-rls-patterns.md` entry + JSDoc in canonical functions.
- Two clients per action = more imports. Minor.

**Neutral:**
- Customer can never *insert* a state-machine transition directly via API (RLS denies). Must go through a server action. Defensive but adds a layer.

## Canonical references (port + mirror this when adding new actions)

| Use case | Customer-initiated function | Admin override mirror |
|---|---|---|
| Pay shop-order from wallet | `actions/service-order.ts::payServiceOrderFromWallet` | `actions/admin/service-orders.ts::adminMarkServiceOrderPaid` |
| Pay forwarder from wallet | `actions/forwarder.ts::payForwarderFromWallet` | (pending ภูม mirror — noted in team-status evening-8) |
| Request tax invoice (juristic) | (pending T-P4 G2b) | `adminIssueTaxInvoice` (pending T-P4 G2c) |
| Cancel order (post-pay refund flow) | (future) | (future) |
| Mark delivery received (close shipment) | (future) | (future) |

## Migration / adoption guide

When adding a new customer self-service action:

1. Identify the state-machine transition (e.g. `pending → completed`)
2. Identify side-effect table(s) (wallet_transactions, tax_invoices, etc.)
3. Pick a stable `kind` value for the side-effect row (used for idempotency)
4. Follow the 6-step template above verbatim
5. Add admin mirror action for override path (cash-on-delivery, manual reconciliation)
6. Document in this ADR's "Canonical references" table
7. Add JSDoc to both functions linking back to this ADR

## Anti-patterns to reject

❌ **Customer client mutating state-machine columns** — RLS will block; trying to grant via RLS exposes bypass surface
❌ **Admin client without ownership verify** — `eq("profile_id", user.id)` AFTER admin client = security risk if developer forgets; verify BEFORE switching
❌ **Rolling back side effect on state failure** — destroys audit trail; admin needs the wallet_tx to exist to reconcile

## Cross-references

- Learning entry capturing the pattern with reasoning: [`docs/learnings/supabase-rls-patterns.md`](../learnings/supabase-rls-patterns.md) §"[2026-05-16] Admin client for customer-initiated cross-table mutations"
- Canonical implementation #1: [`actions/service-order.ts`](../../actions/service-order.ts) — `payServiceOrderFromWallet`
- Canonical implementation #2: [`actions/forwarder.ts`](../../actions/forwarder.ts) — `payForwarderFromWallet`
- Admin mirror: [`actions/admin/service-orders.ts`](../../actions/admin/service-orders.ts) — `adminMarkServiceOrderPaid` (T-P1, commit `121ea0d`)
- Pattern enabled by: [ADR-0002](0002-admin-architecture.md) `is_admin()` SECURITY DEFINER + admin client architecture
- Related learning: scholar-immortal pattern surfaces these — see [`docs/learnings/_index.md`](../learnings/_index.md)

---

**End of ADR-0014.** Future customer self-service actions must follow this pattern OR write a follow-up ADR explaining why they deviate.
