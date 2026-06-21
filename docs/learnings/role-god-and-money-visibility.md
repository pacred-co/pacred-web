# Learning — adding a god role + hiding money internals from `super` (2026-06-18)

Context: owner asked for a NEW god role "Ultra Admin Z" (`ultra`) that sees everything,
AND for `super` to LOSE visibility of cost/profit/margin/cost-rate-FX/declared-value/
commission everywhere in admin. Done on `InwPond007` (mig 0189). ~96 files. The
non-obvious traps below cost the most time — capture them so the next role change is cheap.

## 1. `super` is hardcoded as a god in ~75 scattered places, not just the central guards

`requireAdmin` / `hasRole` / `canAccessRoute` / `menuForRoles` / `pickPrimaryRole` are the
*central* god checks — but there are ~75 MORE inline `roles.includes("super")` /
`role === "super"` / `.eq("role","super")` checks in pages/actions/components/proxy that
each grant a privilege/visibility/action. A new god role that should equal super must be
added to ALL of them or it silently sees/does less than super (a completeness gap, not a
security hole). Fix pattern: a pure `isGodRole(roles)` helper (`lib/admin/god-role.ts`,
NO `server-only` so client components can import it too — the `AdminRole` import is
type-only) and replace every god-bypass `super` check with it. Re-export from
`require-admin` for server callers. A repo-wide grep is the only way to find them all.

## 2. Two different predicates — do NOT conflate them

- `isGodRole(roles)` = ultra OR super → use for NON-money privilege/visibility/action gates.
- `canViewCostProfit(roles)` = ultra/accounting/pricing ONLY (NOT super) → money internals.

The dangerous mistake: a variable named `showMoney` / `canSeeMargin` / `showMoneyColumns`
is a MONEY gate and must use `canViewCostProfit` (exclude super) — but a mechanical
"super → isGodRole" sweep wrongly keeps super in. We ran TWO sweeps (one for money
surfaces, one for super-bypass) and the super-sweep itself flagged the conflict in its
risk notes. ALWAYS read what a `showMoney`-style variable gates before choosing the helper
(grep the file for `fcosttotalprice`/`profit`/`ต้นทุน`/`กำไร` near it). billing-run
`showMoney` and forwarder-check `showMoneyColumns` LOOKED generic but both gate real cost
columns → canViewCostProfit.

## 3. `withAdmin([...roles])` / `requireAdmin([...roles])` are god-aware — the role list can't block super

`requireAdmin(["accounting"])` ADMITS super (god bypass: `isGodRole(roles) || ...`). So to
keep super OUT of a domain (cost writes), changing the role list does nothing. You must add
an explicit non-god predicate guard INSIDE the action:
`const roles = await getAdminRoles(); if (!canViewCostProfit(roles)) return {ok:false,error}`.
Applied to cargo-cost.ts (3) + container-costs.ts (3) + report-cnt-cost-update.ts cost writers.

## 4. Export / PDF server actions MUST self-validate — don't trust the page or a client flag

The adversarial leak-hunt's only confirmed leaks (3) were all export-all server actions:
- one trusted a client-passed `showMoneyColumns` boolean (a crafted call sets it true).
- one had no canViewCostProfit check at all (page gated the cols, action didn't gate the rows).
A page gating its display/cols is NOT enough — the server action is a separate callable
boundary. Every export action that can emit cost/profit/commission must resolve roles
itself and OMIT those keys from the row objects when `!canViewCostProfit`. Re-validate any
client-passed money flag: `const showMoney = clientFlag && canViewCostProfit(roles)`.

## 5. Hide at the DATA layer + the derived-value trap

- CSS blur / JSX-conditional that still SERIALIZES the value to the client = a LEAK
  (`components/admin/cost-reveal.tsx` is documented CSS-only shoulder-surf UX, never a
  boundary). Strip the field from the server→client payload / CSV / PDF data.
- profit = price − cost. Hiding cost while still showing profit (or service_fee =
  payUser − cost) LEAKS cost by subtraction. Hide cost AND every value derived from it.
- 7-term cost SUM (accounting/forwarder): suppress the DISPLAY only — never touch the
  aggregation, or you corrupt totals that feed other (selling) columns.

## 6. Method that worked: sweep → reconcile → implement → adversarial leak-hunt

Two read-only discovery sweeps (money surfaces · super-bypass) → I reconciled the
per-variable helper choice → one implementation workflow (disjoint file clusters) →
`pnpm verify` → an adversarial leak-hunt workflow that tried to PROVE a leak (default
leakFree=false). The hunt caught 3 real export leaks the implementation missed. For
money-critical work, the adversarial verify pass is not optional.

## 7. FOLLOW-UP 2026-06-18 ค่ำ — the sweep was INCOMPLETE; ultra got locked out in prod

The mig-0189/0193 implementation updated the central guards + ~96 files but MISSED two
whole classes. The owner hit it live as `ultra`: `/admin/api-forwarder-momo/sync` rendered
the data (page = `requireAdmin` → honors ultra) but every button → 403 (`guardAdmin()` did
a RAW `ALLOWED_ROLES.has(r)` with no `isGodRole` bypass). "data shows, action FORBIDDEN."

The two missed classes — neither is a `requireAdmin`/`.includes("super")` site, so the
grep that finds §1's ~75 sites does NOT find them:

- **Raw API/action gates with their own role Set.** `app/api/admin/momo/_shared.ts`
  `guardAdmin`, `forwarders/check-tracking`, `drivers/[id]/print` isOpsOverride,
  `crm/page.tsx` canRoute, `driver-work.ts` isAdminOverride, `freight-shipments.ts`
  declared-value. Fix = `isGodRole(roles) || <existing>`.
- **`.in("role", [...])` / `.eq("role","super")` DB filters** — the BIGGER blind spot.
  These pick notification RECIPIENTS + selection-list members, not access. The 8 ex-super
  admins silently STOPPED getting digests/alerts/lead-notifs: cron `sales-daily-digest`
  + `sms-balance-check`, `contact`/`bookings`/`freight` lead fan-out, observability
  `incident-store` (prod IO-1 alert target), rep pickers (`admins.ts`, `transfer-rep`,
  crm `REP_ROLES`). Fix = append `"ultra"` to every array where `"super"` appears.

**Two compounding rules for the NEXT role change:**
1. The sweep grep must also cover `\.in("role"`, `\.eq("role"`, and any role-array
   constant (REP_ROLES-style) — not just `requireAdmin`/`isGodRole`/`.includes("super")`.
   A Workflow whose finders are prompted around code patterns (`.includes`/`.has`) will
   systematically UNDER-cover Supabase query-filter role checks — the manual `.in("role")`
   grep caught what the 12-agent sweep missed. Tell finders explicitly to grep DB filters.
2. Money-internal WRITE gates are the one exception to "append ultra, keep super":
   declared-value (ADR-0016 Q3) we kept super via `isGodRole` (adds ultra, leaves super) —
   stripping super from a money WRITE is a separate owner decision, don't fold it in.
   Leave pure-cosmetic role labels (a "ผู้ดูแลระบบ" badge, incident actorRole tag) — flag,
   don't churn. Leave functional-role head-counts (`GO_LIVE_ROLE_KEYS`) — super isn't in them.

---

## 7. `/admin/admins` renders one row PER GRANT — dedupe to one row per PERSON (2026-06-21)

Owner: "ซ้ำซ้อน บัคมั่ว · เปลี่ยน role แล้วเบิ้ลเพิ่มแถว · ขึ้นปิดสิทธิ์มั่ว · มีพนักงานไม่กี่คน แถวเพียบ" (29 rows
for 24 people). Root cause is the `admins` table shape: **one row per `(profile_id, role)`
grant**, NOT one per person. Two ways a person accumulates rows:
- **Role change** — `adminChangeRole` UPSERTs the new role active + **soft-deletes the old**
  (`is_active=false`, kept for history). So after a change the person has 2 rows: new (active)
  + old (ปิดสิทธิ์). The list showed BOTH.
- **Multiple active grants** — `adminGrantRole`/`adminChangeRole` upsert on `(profile_id,role)`,
  so granting a *different* role never conflicts with the old → both stay active. 3 people had
  2 active roles (aom/jane ultra+super, tam fim+super).

The list (`page.tsx`) mapped one display row per grant → duplication. Also the default `?s`-unset
query showed ALL while the tab UI defaulted to "ยังทำงานอยู่" (count/display mismatch).

**Fix pattern (one row per person):**
1. Fetch ALL grants ordered `granted_at desc`, **dedupe by `profile_id` in JS** — effective role =
   the most-recent ACTIVE grant (else most-recent); person `is_active` = ANY grant active.
2. Person-level status, only TWO buckets: ยังทำงานอยู่ (active) + ลาออก/หมดเวลา (`ended_at` set OR no
   active grant). Drop the "ทั้งหมด" tab. Default active.
3. Mirror the SAME dedupe in the CSV export (`actions/admin/export/admins.ts`) so "CSV ทั้งหมด"
   stays byte-identical to the on-screen list.
4. **Data cleanup** (so the dropdown/toggle act per-person + display==reality): collapse people
   with >1 ACTIVE grant — keep the most-recent active, soft-deactivate the rest. Keep ultra over
   super (ultra ⊇ super → zero access loss). Dry-run + backup first
   (`scripts/collapse-multiactive-admins-2026-06-21.mjs`).

**Why the page-only dedupe isn't enough:** the per-row dropdown calls `adminChangeRole(old=effective)`
— if the person still has another hidden active grant, they keep that access invisibly. The data
cleanup makes "one active role per person" true, so the controls behave per-person. After: 24 people,
0 multi-active, 23 active, 1 resigned (a stale disabled placeholder profile, hidden in the resigned tab).
