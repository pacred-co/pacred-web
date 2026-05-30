# ADR-0021 — Juristic-Corporate Source-of-Truth = legacy `tb_corporate`

**Status:** Accepted 2026-05-31 (เดฟ — ratifies what P0-18 already shipped; this batch finishes the reader migration)
**Supersedes (on the corporate/juristic domain only):** the rebuilt-era `corporate` table (migration `0004`, keyed by `profile_id` UUID) as a READ source. The rebuilt table is retired-in-progress — frozen as a SOT, kept only until the last customer-UI reader migrates.
**Closes audit gate:** the "Potemkin village" silent-dead-read pattern ([`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../research/legacy-gap-2026-05-30/_MASTER.md) §5 #1) for the juristic domain — migrated juristic customers invisible on every surface that read the empty rebuilt `corporate`.
**Sibling ADR:** [ADR-0018](0018-wallet-sot.md) (wallet SOT = legacy `tb_wallet`) — same "ratify the legacy half that already holds the 8,898 customers' data" decision, applied to the corporate domain.

## Context

The 8,898 migrated PCS customers' juristic (นิติบุคคล) company data — tax number, company name, address, the หนังสือรับรอง + ภ.พ.20 documents, and the verify/reject status — lives in the LEGACY **`tb_corporate`** table, keyed by **`userid`** (= the customer's `member_code`, e.g. `PR2791`). This is the same table the legacy PHP `pcs-admin/users.php?page=corporation` flow read.

Pacred's rebuilt era also created a **`corporate`** table (migration `0004`), keyed by `profile_id` (UUID), with columns `tax_id` / `company_name` / `company_address` / `status` (`'pending'`/`'verified'`/`'rejected'`). On production this table is **mostly empty** — only a handful of Pacred-native juristic signups ever wrote to it. Every admin/customer surface that read `corporate` therefore showed **nothing** for the 8,898 migrated juristic customers: invisible in the juristic-review queue, unverifiable, blank company name on receipts/bill-to.

This is the juristic instance of the audit's #1 "silent dead-read/write" pattern: the FAITHFUL data is in the legacy `tb_*` table; the LIVE code read the rebuilt empty twin.

**The SOT was already decided in shipped code (P0-18).** `/admin/juristic-check`, `verifyJuristic`, `rejectJuristic`, `adminConvertToJuristic`, and `lookupDbdJuristic` were all re-pointed to `tb_corporate` (keyed by `userid`). The customer-side juristic signup (`auth.ts::saveJuristicStep2`, P1-16) was made a **dual-write** — rebuilt `corporate` (for the customer-UI readers) PLUS `tb_corporate` (the SOT). But several other `corporate` readers were left on the rebuilt table → migrated juristic customers stayed invisible on those surfaces. **This ADR ratifies `tb_corporate` as canonical and tracks the reader migration to completion.**

### Schema (verified from the shipped `/admin/juristic-check` reader + `actions/admin/customers.ts`)

`tb_corporate` is **all-lowercase** (NOT in the migration-0113 camelCase batch — only `tb_users`/`tb_admin`/`tb_co` are camelCase on prod; every other `tb_*` is lowercase):

| Column | Meaning |
|---|---|
| `userid` | the key = `member_code` (`PR####`) — the join key the juristic actions use |
| `corporatenumber` | 13-digit tax/corporate number ( ↔ rebuilt `tax_id`) |
| `corporatename` | company name ( ↔ rebuilt `company_name`) |
| `corporateaddress` | full address string ( ↔ rebuilt `company_address`) |
| `corporatestatus` | `'1'`=รอตรวจสอบ (pending) · `'2'`=อนุมัติแล้ว (verified) · `'3'`=ไม่ผ่าน (rejected) — statusComp (`function.php:530`) ( ↔ rebuilt `status` keyword) |
| `corporatefile` | หนังสือรับรองบริษัท filename (legacy `file` bucket) |
| `corporatefile20` | ภ.พ.20 filename (legacy `file` bucket) |
| `cpdatecreate` | row create timestamp (DEFAULT CURRENT_TIMESTAMP) |

**Column + status map (rebuilt `corporate` → `tb_corporate`):**
`tax_id`→`corporatenumber` · `company_name`→`corporatename` · `company_address`→`corporateaddress` · `status`(`'pending'`/`'verified'`/`'rejected'`)→`corporatestatus`(`'1'`/`'2'`/`'3'`) · key `.eq("profile_id", uuid)`→`.eq("userid", memberCode)`.
The numeric mapping `1=pending 2=verified 3=rejected` is verified verbatim from how `verifyJuristic` writes `CORP_STATUS.VERIFIED` (`'2'`) and `rejectJuristic` writes `CORP_STATUS.REJECTED` (`'3'`) (`lib/admin/customer-identity.ts` + `actions/admin/customers.ts`).
Docs: the rebuilt readers fetched signed URLs from the `documents` table + `member-docs` storage; `tb_corporate` carries its own bare-filename columns resolved via `resolveLegacyUrl(…, "file")` (the legacy `file` bucket) — same as the shipped `/admin/juristic-check` page.

## Decision

### D-1 — Canonical juristic-corporate SOT: **`tb_corporate`** (legacy), keyed by `userid` (= `member_code`)

Every admin + customer-side READ of juristic company data (company name, tax id, address, status, docs) reads `tb_corporate` keyed by `userid`. Where a reader only has a `profile_id`, it resolves `member_code` via `profiles.member_code` first, then keys the `tb_corporate` read on that.

The rebuilt `corporate` table is **frozen** as a SOT — no new readers. It retires when the last customer-UI reader migrates (a follow-up; NOT a launch blocker — see the checklist).

### D-2 — Customer-side write stays a DUAL-WRITE until the customer-UI readers migrate

The two customer-side corporate WRITERS — `auth.ts::saveJuristicStep2` (signup step 2, P1-16) and `actions/profile.ts::upsertCorporate` (profile self-edit, **this batch**) — write **BOTH** tables:
- the rebuilt `corporate` (keyed by `profile_id`) — so the 3 customer-UI readers still on rebuilt `corporate` keep working;
- the legacy `tb_corporate` (keyed by `member_code`, via `lib/auth/legacy-bridge-tb-users.ts::upsertLegacyCorporate`) — so the customer's self-entered/edited company data reaches the admin SOT (juristic-review queue + verify/reject).

**Removing the rebuilt write before the 3 customer-UI readers migrate = a death gap** (the customer's company details would vanish from their own receipt/payment/register surfaces). So the dual-write is the transitional contract, NOT a swap. `upsertLegacyCorporate` preserves an existing row's `corporatestatus` on re-edit (its UPDATE branch never touches the status column) — so a customer editing their address does not reset a `verified` company to `pending`.

### D-3 — `tb_corporate` is RLS-locked to service_role → reads go through `createAdminClient`

`tb_corporate` (like all `tb_*`) is service-role-only; customer-side readers use the admin client and gate ownership by the signed-in customer's own `member_code` (a customer can only ever read their own `PR####` corporate row). Always destructure `error` from every query (§0c).

## Reader-migration checklist

**✅ Done (on `tb_corporate`, keyed by `userid`):**
- `/admin/juristic-check` (page + `JuristicActions`) — the review queue (P0-18)
- `actions/admin/customers.ts` — `verifyJuristic` · `rejectJuristic` · `adminConvertToJuristic` · `lookupDbdJuristic` (P0-18)
- `auth.ts::saveJuristicStep2` — DUAL-WRITE (rebuilt + `tb_corporate`) at signup step 2 (P1-16)
- **THIS batch (P0-21):**
  - `app/[locale]/(admin)/admin/customers/page.tsx` — BOTH reads: the inline juristic-enrichment bundle + the pending-juristic review QUEUE (re-keyed profile_id→userid; status numeric→keyword; docs from `corporatefile`/`corporatefile20`; identity from `tb_users`)
  - `app/[locale]/(admin)/admin/service-orders/[hNo]/page.tsx` — juristic bill-to default name
  - `actions/service-order.ts::getServiceOrderForReceipt` — juristic receipt header (company name / tax id / address)
  - `actions/profile.ts::upsertCorporate` — now a DUAL-WRITE (rebuilt + `tb_corporate`), mirroring `saveJuristicStep2`

**☐ Remaining — ปอน's lane (customer-UI readers on rebuilt `corporate`; DO NOT migrate without coordinating the dual-write retirement):**
- `app/[locale]/(protected)/service-payment/[id]/page.tsx` (~L76)
- `app/[locale]/(protected)/service-import/[fNo]/receipt/page.tsx` (~L71)
- `app/[locale]/(auth)/register/page.tsx` (~L67)

These read the rebuilt `corporate` (by `profile_id`) for the customer's OWN company display. They are fed by the dual-write (D-2). Migrating them to `tb_corporate` is the trigger for retiring the rebuilt write — do all three + the write-retirement in ONE change, or migrated juristic customers' company data breaks on these surfaces.

**☐ FINAL (after the 3 ปอน-lane readers migrate):**
1. Remove the rebuilt `corporate` write half from `auth.ts::saveJuristicStep2` + `actions/profile.ts::upsertCorporate` (leave only the `tb_corporate` write).
2. Backfill pre-P1-16 native-juristic orphans: any row in rebuilt `corporate` whose `profile_id`→`member_code` has NO matching `tb_corporate.userid` → copy it across (the handful of Pacred-native juristic signups created before the dual-write landed). One-off migration/script.
3. Drop the rebuilt `corporate` table (+ its `0004` RLS/trigger) in one migration.

## Consequences

**Closes:** migrated juristic customers now surface on the admin customer list (inline review + pending queue), the service-order detail bill-to default, and the shop-order receipt header — all of which previously showed blank for the 8,898 migrated juristic customers.

**Reachability (AGENTS.md §0d):** no new entry points needed — these surfaces are already reachable (`/admin/customers` sidebar leaf · `/admin/service-orders` row → detail · the customer's own receipt). The migration only fixes WHICH table they read; the buttons/links were already there.

**Does NOT change:**
- The juristic signup flow shape (3-step register) — unchanged; only the write target gained the `tb_corporate` mirror (already done at step 2).
- `tb_users.userCompany` (the `'1'` = company flag) — orthogonal; the juristic queue + verify path keep it consistent on approve (existing behaviour).

**Verification:** `actions/corporate-readers-tb.test.ts` (sentinel-guarded, opt-in DB test) seeds a `tb_corporate` row for a sentinel `member_code` and asserts the migrated read-path SQL (the same `.from("tb_corporate").eq("userid", …)` shape the four surfaces now use) returns it — i.e. a migrated juristic customer now surfaces where the rebuilt-table reads previously returned nothing.

## References

- Audit master: [`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../research/legacy-gap-2026-05-30/_MASTER.md) §5 #1 (silent dead-read pattern)
- Shipped SOT readers (the schema authority): `app/[locale]/(admin)/admin/juristic-check/page.tsx` + `actions/admin/customers.ts` (verifyJuristic/rejectJuristic/adminConvertToJuristic)
- Status code map: `lib/admin/customer-identity.ts` (`CORP_STATUS` = `{ PENDING:'1', VERIFIED:'2', REJECTED:'3' }`) ← legacy `statusComp()` (`pcs-admin/include/function.php:530`)
- Dual-write helper: `lib/auth/legacy-bridge-tb-users.ts::upsertLegacyCorporate`
- Legacy source: `pcsc/public_html/member/pcs-admin/users.php?page=corporation` → `include/pages/users/user-corporation.php`
- Casing landmine: `docs/learnings/php-port-patterns.md` (tb_users/tb_admin/tb_co camelCase; all other tb_* incl. tb_corporate lowercase)
- ADR-0017 (D1 faithful port): this ADR is its corporate-domain crystallisation.
