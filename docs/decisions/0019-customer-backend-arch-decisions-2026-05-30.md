# ADR-0019 — 3 customer-backend architecture decisions (the เดฟ→ภูม handshakes)

**Status:** Decided 2026-05-30 (เดฟ — these are the 3 decisions the [`handoff-2026-05-30-night-resplit.md`](../research/handoff-2026-05-30-night-resplit.md) §4 says gate ภูม's Sprint-2/3 work). Resolved so ภูม's agent can proceed on P0-13 / P0-14 / P1-3 / P1-5 / P1-17 without waiting on a chat round-trip.
**Source:** master gap audit `legacy-gap-2026-05-30/_MASTER.md` §3-5.

---

## D-A — Detail-page id model: **legacy `hNo`/`fNo` is canonical; retire the rebuilt-UUID-first dual mode**

**The problem (verified).** `(admin)/admin/service-orders/[hNo]/page.tsx` SELECTs the rebuilt `service_orders` FIRST (L29), and only on miss falls back to `renderLegacyServiceOrderView` reading `tb_header_order` (L95). The rebuilt table is empty on prod → **every real order hits the legacy fallback**, where the page renders near-read-only (the full editor mounts only on the rebuilt branch). Same dual-mode on `forwarder/[fNo]` (P1-3).

**Decision.** The legacy table is the canonical PRIMARY read. For `[hNo]`: read `tb_header_order` by `hno` directly (drop the rebuilt-first SELECT + the UUID fallback). For `[fNo]`: read `tb_forwarder` by the legacy numeric `id`/`fNo` directly. The full editor (status-flip, cancel, note, driver, cost, bill) renders on this one legacy path — no dual mode.

**What it unblocks for ภูม:**
- **P0-14** — render `AdminServiceOrderUpdateForm` in `legacy-view.tsx` (it's now THE view, not a fallback). ~1h.
- **P0-13** — the 5-tab shop UPDATE workflow mounts on the legacy `[hNo]` page directly. No "which branch am I on" guard.
- **P1-3** — the `forwarder/[fNo]` mega-editor renders on every real row.

**Migration note:** keep the rebuilt `service_orders`/`forwarders` reads as a tombstone for one sprint (don't delete the legacy-view import path); just make the legacy read primary + unconditional. The rebuilt tables retire with the other dead twins (end of Sprint 3).

---

## D-B — Commission: **Path A faithful `tb_user_sales` is canonical; retire the rebuilt `sales_commissions`/`sales_payouts`**

**The problem (P0-23).** Two competing commission stacks: Path A `/sales/*` reads the real `tb_user_sales` but has ZERO write (no earn-trigger); Path B `/commissions` + `sales_commissions`/`sales_payouts` is full CRUD but was never backfilled from `tb_user_sales` (no `INSERT…SELECT` migration exists). Result: the 4 partner agents see/withdraw nothing.

**Decision.** **Path A (`tb_user_sales`) is canonical** — it holds the real migrated commission rows. The earn-trigger writes `tb_user_sales`; the withdraw + the `/sales` views read it. **Retire Path B** (`/commissions` + `sales_commissions`/`sales_payouts` + `actions/commissions.ts` + `sales-payouts.ts`) as the dead twin (tombstone one sprint).

**The earn-trigger spec (for ภูม P1-5).** On the forwarder delivery transition (`fStatus → '7'`), for the 4 hardcoded agent codes (THADA / SIN / OOAEOM / SWAN — confirm the exact codes + the commission % from legacy `forwarder-driver/takePhoto.php` + `report-user-sales/getListForwarder.php`, **READ them, don't guess**), INSERT a `tb_user_sales` row (the 1% − 3% WHT math + the per-forwarder link). Mount the trigger in `actions/admin/driver-work.ts` deliver cascade + `forwarders.ts::adminBulkUpdateForwarderTbStatus` (the two paths that flip to '7'). The withdraw side (min 1,000, ID-card PDF) reuses the ADR-0018 wallet contract.

**What it unblocks for ภูม:** P1-5 earn-trigger (now has a target table + a spec). เดฟ owns the `/sales` read-side + the withdraw architecture; ภูม owns the earn-trigger INSERT.

---

## D-C — `tb_users.userActive` native-signup value = **`''` (empty, legacy-faithful)**

**The problem (P1-17).** Legacy new customer = `userActive=''` (the register INSERT omits the column; the admin pending-queue `usersActive.php` filters `WHERE userActive=''`). Pacred native signup writes `userActive='0'` (`legacy-bridge-tb-users.ts:175`). So migrated-pending (`''`) and native-pending (`'0'`) are two disjoint sets — whichever value the queue filters on silently misses the other half. Legacy `userActive` is a **sales-contacted flag** (`''→'1'`), NOT an approval gate.

**Decision.** Native signups write `userActive=''` (match legacy). The admin pending-queue filters `WHERE userActive=''` — catching BOTH migrated and native pending in one set. Do NOT reframe `userActive` as an approval gate (that was a Pacred-original divergence; legacy never gated login on it).

**Pair-work (do in ONE sitting, not two guesses):**
- **เดฟ (P1-16):** change the register-write (`actions/auth.ts` / `legacy-bridge-tb-users.ts:175`) `'0'` → `''`.
- **ภูม (P1-17):** align the pending-queue filter to `WHERE userActive=''` (+ verify any active-customer report/segment that reads `userActive`).
Align on the value together so a native signup lands in the same queue a migrated one does.

---

## Consequences

- ภูม can start P0-14 (D-A) + P1-5 (D-B) + P1-17 (D-C) immediately — these were the 3 blocked items in the handoff §4.
- เดฟ owns: the `[hNo]`/`[fNo]` page read-pivot (D-A, customer-adjacent), the `/sales` read-side + withdraw (D-B), the register-write (D-C P1-16). ภูม owns the admin handlers built on top.
- All three follow D1 faithful-first: legacy table canonical, rebuilt twin retires.

**Cross-link:** handoff [`handoff-2026-05-30-night-resplit.md`](../research/handoff-2026-05-30-night-resplit.md) §4 (these resolve the 3 handshakes) + `_MASTER.md` §3 (P0-13/14/23, P1-3/5/17).
