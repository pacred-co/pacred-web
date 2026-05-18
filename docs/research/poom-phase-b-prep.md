# ภูม — Phase-B prep spec (per-stage current-files + legacy refs + acceptance)

> **Purpose:** ภูม's own actionable input for D1 Phase B — for each
> B-stage I own (B-0 · B-auth · B-2 · B-3 · B-4..B-9), this lists the
> specific Pacred files to touch, the legacy PCS reference, the
> acceptance bar, and the schema mapping needed.  Built from
> [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md) + the new poom brief.
>
> **Source of truth:** [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md)
> + [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md) + Phase-A runbook
> [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md).
>
> **Status:** drafted 2026-05-18 by ภูม while waiting for Phase A prod-load.
> Nothing here is coded yet — this is the spec that unblocks immediate
> code work the moment `tb_*` schema lands in dev Supabase.

---

## 0. Migration numbering — coordinated with เดฟ

| Slot | Owner | What |
|---|---|---|
| `0081_pcs_legacy_schema.sql` | **เดฟ** (Phase A) | The 117-table `tb_*` faithful port |
| `0082` · `0083` | **เดฟ** (Phase A follow-ups) | Reserved (member-code gapfill · cutover steps) |
| `0084_booking_documents.sql` | ภูม (Phase C — already in branch) | BK-1.5 doc attach (deferred to Phase C) |
| `0085_tax_invoices_credit_note_for.sql` | ภูม (Phase C — already in branch) | G2e-2 credit note (deferred to Phase C) |
| `0086_work_item_messages.sql` | ภูม (Phase C — already in branch) | IC-1 work-chat (deferred to Phase C) |
| `0087+` | TBD | Phase B reworks (e.g. status enum reconcile, RLS on `tb_*`) |

Free slot for Phase B's first migration = **`0087`**.

---

## 1. Schema coexistence model (the load-bearing principle)

The `tb_*` ported tables coexist with the rebuilt `profiles`-era schema during the transition.  No drops.  The rules:

- **Read primary** — Phase-B server actions read from `tb_*` (the legacy truth).  Rebuilt-era tables (`profiles` / `service_orders` / `forwarders` / `cargo_*` / `wallet*` / `notifications` / …) stay as written-but-not-read shims during Phase B.
- **Write fan-out** — when a Phase-B action MUTATES legacy state, it writes `tb_*` first (the truth), then best-effort fans the change into the rebuilt-era table (so any not-yet-reworked surface keeps rendering).  Failure of the fan-out logs + continues.
- **Identity bridge** — the legacy `userID` (e.g. `PR1234`) is the join key.  Pacred's `profiles.id` (uuid) gets a `legacy_user_id text` column added (already added by `0067` PCS migration scaffold — superseded but the column survives).
- **Auth bridge** — `lib/auth/pcs-legacy-password.ts:verifyLegacyPassword()` lets a migrated customer sign in with their existing PCS password.  No reset.

When a Phase-B action is fully reworked + verified, the corresponding rebuilt-era table is retired (DROP in a later cleanup migration).

---

## 2. Per-stage prep — what ภูม owns

Each stage below lists:
1. **Current Pacred files** (to touch / rework)
2. **Legacy PHP reference** (`C:\xampp\htdocs\pcscargo\member\…`) — read via `legacy-php-sweep` skill on the machine that has the source
3. **`tb_*` tables involved** (the legacy schema this stage operates on)
4. **Acceptance bar** (what "done" looks like)
5. **Estimated effort**

---

### B-0 — Data foundation (re-point lib/supabase + actions at `tb_*`)

**Owner:** ภูม + เดฟ — coordinate.

**Current Pacred files:**
- `lib/supabase/{client,server,admin}.ts` — Supabase client factories (unchanged shape, but the actions they serve will read `tb_*`)
- `lib/auth/get-user.ts` · `lib/auth/require-auth.ts` · `lib/auth/require-admin.ts` — identity lookups (return both `profiles.id` AND `legacy_user_id` post-bridge)
- `actions/auth.ts` — customer signup / signin (wire `verifyLegacyPassword` — see B-auth)
- `actions/profile.ts` — profile read/update (read `tb_user` first, fall back to `profiles`)

**`tb_*` tables involved:**
- `tb_user` (the customer header — `userID`, `userName`, `userPhone`, `userEmail`, `userPass`, plus segmentation flags VIP/SVIP/นิติบุคคล/เครดิต)

**Acceptance bar:**
- `getCurrentUserWithProfile()` returns a unified shape that includes the legacy fields the customer portal renders (member tier, sales rep, wallet balance) sourced from `tb_user` not `profiles`
- Any existing action that mutates `profiles` ALSO writes to `tb_user` (write-through pattern) until the surface is reworked

**Effort:** ~8h (sensitive — every protected page reads through this)

**Blocker:** waits for เดฟ Phase A migration `0081_pcs_legacy_schema.sql` applied to dev Supabase

---

### B-auth — Wire legacy-password login

**Owner:** ภูม (auth bridge code shipped by เดฟ `2b1c958`).

**Current Pacred files:**
- `actions/auth.ts:signInWithPassword` — add a "legacy fallback" branch:
   1. Try Supabase `signInWithPassword` first (Pacred-native + post-migration customers)
   2. If that fails → look up user by phone/email in `tb_user`; if found AND `verifyLegacyPassword(plain, tb_user.userPass)` true → create a Supabase auth session for them (via service-role admin client `auth.admin.createUser` or `updateUserById` to set a password we know, then sign in)
- `app/[locale]/(auth)/login/page.tsx` — add "เชื่อมต่อบัญชี PCS CARGO" hint subtitle + the legacy login path

**`tb_*` tables involved:**
- `tb_user` (read `userPass` to call `verifyLegacyPassword`)

**Acceptance bar:**
- A migrated customer enters their existing PCS phone+password on `/login` → signs in successfully → lands on the 9-icon launchpad home (B-1)
- The verify test from `lib/auth/pcs-legacy-password.test.ts` continues to pass
- New (Pacred-native) customers still sign in via Supabase normal path (no regression)

**Effort:** ~3h.  Test plan needs a migrated row in dev Supabase — wire now, test post-Phase-A.

**Blocker:** can wire NOW; can't end-to-end test until ≥1 migrated row exists in dev.

---

### B-2 — Status vocabulary reconcile (3 → legacy 1)

**Owner:** ภูม backend + ปอน UI in parallel.

**Current Pacred files (status writers + readers):**
- Orders: `lib/validators/cart.ts` + `actions/service-order.ts` + `actions/admin/service-orders.ts` — status enum
- Forwarders: `lib/validators/forwarder.ts` + `actions/forwarder.ts` + `actions/admin/forwarders.ts` — status enum
- Shipments: `lib/warehouse/shipments.ts` + `actions/shipments.ts` + `actions/admin/warehouse.ts` — status enum

**Legacy reference status enums:**
- `tb_header_order.hStatus` — 1=รอดำเนินการ · 2=รอชำระเงิน · 3=สั่งสินค้า · 4=รอร้านจีนจัดส่ง · 5=สำเร็จ · 6=ยกเลิก
- `tb_forwarder.fStatus` — 1=รอสินค้าเข้าโกดังจีน · 2=สินค้าถึงโกดังจีน · 3=กำลังส่งมาไทย · 4=ถึงไทยแล้ว · 5=รอชำระเงิน · 6=เตรียมส่ง · 7=ส่งแล้ว
  - Plus sub-states `fStatusCarOn/Off` (truck load/unload)
- `tb_cnt.cntStatus` — 1=รอจ่ายเงิน · 2=จ่ายแล้ว

**Acceptance bar:**
- Pacred status enums for orders / forwarders / shipments all map 1:1 to the legacy integer status (admin sees the same number = same screen as legacy)
- Customer "tab-per-status" lists on `/service-order` and `/service-import` show the 6/7 legacy tabs (not the current grouped/flat list)
- The current 8-state shipment vocabulary collapses into the 7-state forwarder vocab where they overlap

**Effort:** ~6h backend + UI alignment with ปอน

**Migration needed:** `0087_status_vocab_reconcile.sql` — extend CHECK constraints on `service_orders.status` etc to ALSO accept the integer legacy codes (`'1'`..`'7'`) during transition

---

### B-3 — shop-order / forwarder / payment / wallet → legacy logic-loop

**Owner:** ภูม backend + ปอน UI.  Largest customer-track stage.

**Current Pacred files (4 sub-flows):**

**(a) shop-order:** `app/[locale]/(protected)/service-order/**` + `actions/service-order.ts`
- Legacy ref: `member/shops.php` · `member/cart.php` (151-item cap) · `member/payment.php`
- `tb_*` tables: `tb_header_order` · `tb_order_item` · `tb_cart` · `tb_shop`
- Legacy loop: 9-icon home → 🛒 → cart cap 151 → `tb_header_order(hStatus=1)` → 6-tab list

**(b) forwarder (import):** `app/[locale]/(protected)/service-import/**` + `actions/forwarder.ts`
- Legacy ref: `member/forwarder.php`
- `tb_*` tables: `tb_forwarder` · `tb_forwarder_item`
- Legacy loop: ship → arrive THEN pay (the inversion fix)

**(c) payment (yuan):** `app/[locale]/(protected)/service-payment/**` + `actions/payment.ts`
- Legacy ref: `member/payment.php` (yuan-transfer + slip flow)
- `tb_*` tables: `tb_payment` · `tb_payment_slip`

**(d) wallet:** `app/[locale]/(protected)/wallet/**` + `actions/wallet.ts`
- Legacy ref: `member/wallet.php` · `member/deposit.php` · `member/withdraw.php`
- `tb_*` tables: `tb_wallet` · `tb_wallet_transaction`

**Acceptance bar:**
- Customer sees the exact same screens / button labels / status colors as legacy
- The order in which steps happen matches legacy (esp. forwarder ship→arrive→pay)
- 151-item cart cap enforced on cart writes
- Pay-from-wallet flows match legacy auth + status flips

**Effort:** ~12-16h (split across 4 flows)

**Migration needed:** likely none for B-3 itself — read/write `tb_*` directly per the coexistence model

---

### B-4 — Per-role admin sidebars + live-count badges

**Owner:** ภูม.

**Current Pacred files:**
- `components/sections/admin-sidebar.tsx` — the flat `items[]` array filtered by 7-role enum (one array, role-gated rows)

**Legacy reference:**
- `member/pcs-admin/include/left-menu.php` — RBAC-switched by `company / department / section` triple
- `member/pcs-admin/include/pages/left-menu/*` — ~40 role files, each hand-built menu

**`tb_*` tables involved:**
- `tb_admin` (the admin user header — drives role/department/section)
- Plus per-menu-item count queries (`tb_header_order WHERE hStatus = X`, `tb_check_forwarder WHERE status = pending`, etc.)

**Acceptance bar:**
- ~14 distinct per-role admin sidebars (Cargo super / Cargo accounting / Cargo warehouse / Freight super / Freight accounting / Cargo&Freight admin / Settings / etc.)
- Every menu item carries a live count badge (queried server-side per role)
- Legacy section grouping preserved: Cargo / Freight / Cargo&Freight / Settings / Learning / Extension

**Effort:** ~8-10h

**Migration needed:** likely `0088_admin_role_triple.sql` — extend `admins.role` enum into the legacy `company/department/section` triple shape

---

### B-5 — Restore ship→arrive→THEN-pay forwarder + truck load/unload sub-states

**Owner:** ภูม.

**Current Pacred files:**
- `lib/validators/forwarder.ts` — forwarder status enum (currently `pending_payment` is FIRST — wrong order)
- `actions/admin/forwarders.ts` — admin status transitions (the writes that move status forward)
- `actions/forwarder.ts` — customer-side wallet-pay action
- `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` — admin detail status panel
- `app/[locale]/(protected)/service-import/[fNo]/page.tsx` — customer detail status

**Legacy reference:**
- `member/forwarder.php` (customer side) + `member/pcs-admin/include/pages/forwarder/*` (admin side)
- `tb_forwarder.fStatus` = 7-value enum, `รอชำระเงิน` at slot 5
- `tb_forwarder.fStatusCarOn / fStatusCarOff` = truck load/unload sub-states (separate columns, boolean-ish)

**Acceptance bar:**
- New forwarders default to `fStatus=1` (รอสินค้าเข้าโกดังจีน), NOT `pending_payment`
- Customer pays only AFTER goods reach Thailand (`fStatus=4` → `5`)
- Truck load/unload sub-states render + are mutable separately

**Effort:** ~5-6h (status order is small; sub-states are net-new schema)

**Migration needed:** `0089_forwarder_status_legacy_order.sql` — re-order enum values + add `fStatusCarOn` / `fStatusCarOff` columns

---

### B-6 — `tb_cnt` per-container payment-slip ledger

**Owner:** ภูม.

**Current Pacred files:**
- `lib/warehouse/containers.ts` — current rich-state container model
- `app/[locale]/(admin)/admin/warehouse/containers/**` — admin pages
- `app/[locale]/(admin)/admin/accounting/container-costs/page.tsx` — closest existing surface (but uses different schema)

**Legacy reference:**
- `member/pcs-admin/report-cnt.php` — the payment-loop
- `tb_cnt` (one row per container payment: `cntName` · `cntStatus` · `cntAmount` · `cntImagesSlip`)
- `tb_cnt_item` (links `fCabinetNumber` strings → `cntID`)
- `tb_cnt_pay_idorco` / `tb_cnt_pay_trackingchn` (PK/CO + China tracking fan-out)
- "close" = `fDateContainerClose` timestamp on the forwarder rows

**Acceptance bar:**
- A new `/admin/containers/payments` page renders the `tb_cnt` ledger (paid/unpaid badge + slip image preview)
- "Make payment" flow inserts `tb_cnt` + fans member forwarders' PK/CO into the two `tb_cnt_pay_*` tables
- Accounting menu surfaces the unpaid-container count badge (B-4 wires)

**Effort:** ~6-8h

**Migration needed:** none — `tb_cnt*` are ported by Phase A

---

### B-7 — Warehouse barcode scan family (8 variants)

**Owner:** ภูม.

**Current Pacred files:**
- `app/[locale]/(admin)/admin/barcode/page.tsx` (the current single-mode scan UI)
- `actions/admin/barcode.ts` — the scan action

**Legacy reference:**
- `member/pcs-admin/barcode-d-import.php` (warehouse-in scan — the canonical)
- `member/pcs-admin/barcode-d-*` family + `member/pcs-admin/barcode-c-*` family (~8 modes: find / warehouse-in / prepare / from-box-face × device vs camera)
- Scan logic: set shelf `location`, scan each box, **auto-flip `fStatus → 4` once scanned count ≥ `fAmount`**; green = matched, orange + sound = unmatched

**Acceptance bar:**
- `/admin/barcode` becomes a hub with 8 mode entry points (or 8 separate routes — match legacy URL shape)
- Each scan increments a counter; reaching `fAmount` auto-flips `fStatus`
- Visual: green when match · orange + audio chime when mismatch
- Shelf location input persists per scan session

**Effort:** ~8-10h

**Migration needed:** likely none — the 4-table warehouse spine (`cargo_containers` / `cargo_shipments` / `cargo_shipment_tracking`) already exists; reads `fAmount` + writes `fStatus` against `tb_forwarder`

---

### B-8 — Accounting (multi-order รวมบิล + container-payment + รับรู้รายได้)

**Owner:** ภูม.

**Current Pacred files:**
- `app/[locale]/(admin)/admin/accounting/**` — partial surface; lacks multi-order consolidation + container-payment screen
- `actions/admin/accounting/*` — actions

**Legacy reference:**
- `member/pcs-admin/include/pages/accounting/*` — ใบแจ้งหนี้ · ประวัติใบเสร็จ · รวมบิล (multi-order consolidation) · container-payment (`report-cnt`) · รับรู้รายได้
- `tb_*`: `tb_invoice` · `tb_receipt` · `tb_invoice_consolidation` · `tb_cnt` (B-6 overlap) · `tb_revenue_recognition`

**Acceptance bar:**
- รวมบิล (consolidation) screen lets accountant select N orders for one customer and emit a single combined invoice
- Container-payment screen (overlap with B-6) renders the payment ledger
- รับรู้รายได้ (revenue recognition) screen lists shipments awaiting recognition + flips them with a click

**Effort:** ~10-14h

**Migration needed:** depends on what Phase A loads — likely the `tb_invoice*` tables come over and we operate directly on them

---

### B-9 — QA queue + note queues + Learning centre + Extension + member segmentation

**Owner:** ภูม.

**Current Pacred files:**
- (mostly net-new pages — Pacred lacks these)

**Legacy reference:**
- QA queue: `member/pcs-admin/include/pages/QAAndQC/*` + `tb_check_forwarder` table — pre-billing gate for damaged/missing items
- Note queues: `tb_note_order` / `tb_note_forwarder` (หมายเหตุฝากสั่ง / หมายเหตุนำเข้า — staff-internal notes pinned to orders)
- Learning centre: `member/pcs-admin/learning-*` — internal training docs (Wiki-like)
- Extension tools: juristic check (DBD lookup) · time-attendance · meeting-room booker · work tools — `member/pcs-admin/extension/*`
- Member segmentation: VIP / SVIP / นิติบุคคล / เครดิต flags on `tb_user` drive different views/policies

**Acceptance bar:**
- `/admin/qa` — QA check queue with pass/fail outcomes that gate billing (legacy `tb_check_forwarder` flow)
- `/admin/notes` — internal note queues for orders + forwarders (a tiny inbox per object)
- `/admin/learning` — Wiki-like knowledge base for staff
- `/admin/extension` — juristic check / time-attendance / meeting-room / tools
- Member segmentation visible on every customer-touching admin page

**Effort:** ~14-18h (multiple net-new modules)

**Migration needed:** all the `tb_check_*` / `tb_note_*` / `tb_learning_*` / `tb_extension_*` tables come over via Phase A

---

## 3. Cross-stage concerns

### 3.1 `tb_*` schema reads — pattern
Every action that reads legacy data uses the admin client (service-role) for simplicity, because Phase A's `tb_*` schema does NOT (yet) carry Pacred-style RLS — it carries legacy MySQL-translated access (none / by-role table joins).  The Phase-B server actions are the ACL gate.

Per-call pattern:
```ts
const admin = createAdminClient();
const { data, error } = await admin
  .from("tb_user")
  .select("userID, userName, userPhone, userEmail, userType, userPass")
  .eq("userID", legacyUserId)
  .maybeSingle<TbUser>();
```

### 3.2 Identity join
Until B-0 fully ships, the join between Pacred `profiles.id` and legacy `tb_user.userID` lives on either:
- `profiles.legacy_user_id text` (column added by `0067` PCS migration scaffold — kept post-D1)
- OR a lookup view (Phase A may ship one — `vw_user_identity`)

### 3.3 Write-through
When a Phase-B action mutates `tb_*`, also fan to the rebuilt-era table:
```ts
// Read truth from tb_*, mutate tb_*, then best-effort fan to rebuilt
await admin.from("tb_header_order").update({ hStatus: 3 }).eq("hID", legacyOrderId);
try {
  await admin.from("service_orders").update({ status: "ordered" }).eq("h_no", pacredOrderH);
} catch (e) {
  logger.warn("phaseb", "rebuilt-fanout failed", { error: e });
}
```
This keeps not-yet-reworked surfaces showing the right state during transition.

### 3.4 Quality gate per stage
Each B-stage MUST pass before the next:
1. `pnpm tsc --noEmit` exit 0
2. `pnpm lint` exit 0
3. `pnpm test:unit` exit 0 (add stage-specific tests where applicable)
4. `pnpm audit:i18n` exit 0
5. Functional smoke against `pnpm dev` — exercise the legacy workflow end-to-end with a migrated test row

---

## 4. Sequencing — what I can do NOW (pre-prod-load)

| When | Action |
|---|---|
| **NOW (no prod load needed)** | (a) Sweep the legacy PHP on the machine that has the source (use `legacy-php-sweep` skill) to fill in the per-stage "Legacy reference" lines above with line numbers · (b) Write B-auth code (wire `verifyLegacyPassword` into `actions/auth.ts`) — can't end-to-end test but the code is ready · (c) Write B-2 status-reconcile migration `0087_status_vocab_reconcile.sql` as a draft · (d) Draft `0088_admin_role_triple.sql` schema for B-4 |
| **After Phase A loads in dev Supabase** | B-0 read-path swap → B-auth verify → B-2 cutover → B-3..B-9 in priority order |
| **After Phase A loads in prod** | The whole Phase-B sequence repeats against prod with the cutover runbook |

---

## 5. Open questions for เดฟ / ก๊อต

1. **The `tb_*` schema migration filename** — confirm `0081_pcs_legacy_schema.sql` (or `0081_pcs_legacy_schema_part1.sql` + `0082_part2.sql` if size requires splitting)
2. **Auth-bridge session creation** — `auth.admin.createUser({ password: <known> })` and rotate, or use Supabase magic-link as the bridge?  ก๊อต may have a preferred pattern
3. **8 special userIDs** (`PCSTT` / `PCSCARGO` / …) — keep as `PCSTT` post-rename, or rewrite to `PR<letters>`?
4. **New-customer numbering** — `PR1`..`PR5` lowest-vacant, or strict monotonic after the highest migrated row?
5. **Phase-C migrations (`0084`-`0086`)** — apply during the transition or freeze until Phase B done?  (Currently apply order would be `0080` → `0081` Phase A → `0084`/`0085`/`0086` mine.  If Phase A is delayed, mine can apply first.)
6. **Member segmentation flags** — do `tb_user.userType` values (VIP/SVIP/นิติบุคคล/เครดิต) carry over 1:1 or do we re-map?

---

## 6. Cross-references

- 🧭 The pivot ADR → [`../decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
- 🗺 The Phase-B gap map → [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md)
- 🛠 The Phase-A runbook → [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)
- 🔐 The auth bridge code → `lib/auth/pcs-legacy-password.ts` (+ `.test.ts`)
- 📋 The phased plan → [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) Phase B section
- 👷 My brief → [`../briefs/poom.md`](../briefs/poom.md)
- 🔬 The legacy decoded → [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) · [`gap-admin.md`](gap-admin.md) · [`gap-customer.md`](gap-customer.md) · [`gap-revenue-flow.md`](gap-revenue-flow.md)
