# Audit — 258 commits home-Claude pushed to `Poom-pacred` (2026-06-02)

> **Range:** `59c585ac..2820395d` · **519 files changed · +86,423 / −14,330 LOC**
>
> **Trigger:** ภูม flagged *"AI คอมที่บ้านทำงานค่อนข้างมั่ว ลองตรวจแบบละเอียดดู มีตรงไหนจัดวางไม่ถูกต้อง มีตรงไหนยังบัค ยังตกหล่นอีกบ้าง"*.
>
> **Auditor:** Claude work-computer · sandbox session 2026-06-02 ดึก.
>
> **Methodology:** sample top-impact files from `git diff --stat`, trace claimed-shipped surfaces against code reality, verify migration ledger claims, run `tsc --noEmit`, scan for Potemkin/silent-dead-write patterns per `docs/learnings/verify-deep-flow.md`, check auth gates on new server actions, look for stale docs.

---

## 0. Summary

| Severity | Count | Headline |
|---|---:|---|
| 🔴 Blocking (build/prod) | **3** | Vercel build broken · 4 tsc errors all relate to missing Supabase type regen for migration 0129's `tb_forwarder_tax_invoice` family |
| 🟠 Sloppy / shipped-but-broken | **5** | Tier-A "fix" closed only the bulk path — `adminUpdateForwarder` + 2 sibling write-paths still dead-write rebuilt tables · `/commissions/me` STILL reads dead `commission_*` tables (the "Potemkin tombstone" is incomplete) · `/admin/forwarders/[fNo]` reads rebuilt forwarders as PRIMARY (tb_forwarder is just a fallback) · the `actions/admin/commissions.ts` file is marked "tombstoned" but 4 surfaces still import live |
| 🟡 Stale / weak claims | **3** | save-point v5 says HEAD=`147105e5` but real HEAD=`2820395d` (1 commit ahead · ok-ish) · numerous "Wave X+ deferred" banners on shipped pages · 19 one-off `.mjs` debug/probe scripts left in `scripts/` |
| 🟢 Verified-true claims | **6** | Margin Monitor / Quote Compare / LINE inbox / margin-flag cron / collapsible `[fNo]` panels / freight quote wizard all genuinely exist and read live tables |

The 258 commits split roughly into 3 themes: (a) accounting tooling for the CEO directive (margin / quote / e-Tax / PEAK / WHT / AR-aging — all real and wired into the menubar), (b) ad-hoc Potemkin repoints (commissions / forwarder-sales) — **only half-done**, (c) plumbing (LINE webhook · freight quote · reviews · 10 new migrations all applied). The themes that finished cleanly are the new-feature ones; the themes that drag are the Potemkin tombstones — they leave live nav links pointing at dead tables. **None of the new surfaces themselves are dead-writes** — the dead-writes are pre-existing surfaces (`/admin/forwarders/[fNo]` detail · `adminUpdateForwarder` · `/commissions/me`) that the commit batch did NOT pivot.

---

## 1. 🔴 Blocking bugs (build broken · prod-impacting)

### 1.1 Vercel build broken — 4 tsc errors (all from missing Supabase type regen)

`pnpm build` and `npx tsc --noEmit` fail with **4 TypeScript errors**, all of pattern `TS2352: Conversion of type 'GenericStringError[]' to type 'XxxRow[]' may be a mistake`. PostgREST cannot infer the row shape because the generated Supabase types don't include the tables migration 0129 added (`tb_forwarder_tax_invoice` · `tb_forwarder_tax_invoice_item` · `tb_forwarder_wht_entry`) nor `tb_forwarder_tran_th_*` nor `tb_withdraw_comm_*`.

**Affected files (all on the recent commits):**

| File:Line | Table | Notes |
|---|---|---|
| `actions/admin/wht-cert.ts:95` | `tb_forwarder_wht_entry` (mig 0129) | hydrate-by-IN; cast `unknown as Raw[]` would unblock |
| `actions/admin/withdraw-comm-batch.ts:178` | `tb_withdraw_comm_sale_h` / `tb_withdraw_comm_interpreter_h` | bulk list rendering |
| `actions/admin/withdraw-comm-batch.ts:247` | same table family | detail row read |
| `actions/admin/forwarder-tran-th.ts:212` | `tb_forwarder` IN-query inside the TH-transport reader | Pacred has types for `tb_forwarder` but the embed shape isn't recognised |

**User-prompt already noted** `etax-export.ts:125`, `etax-export.ts:154`, `wht-cert.ts:103`, `forwarder-tax-invoice.ts:196`, `forwarder-tax-invoice.ts:229` — but those have already been silenced inline with the `unknown` cast trick (see `etax-export.ts:111` for the comment). The 4 errors above are the **remaining unfixed ones**.

**Fix in 5 minutes:** add `as unknown as XxxRow[]` to those 4 lines OR regenerate Supabase types via the SDK (whichever the team prefers as the canonical fix). Vercel cannot deploy from this HEAD.

### 1.2 The `actions/admin/commissions.ts` file is half-tombstoned

`actions/admin/commissions.ts` header now reads `⚠️⚠️⚠️ TOMBSTONED 2026-06-02 per ADR-0026 — DO NOT CALL ⚠️⚠️⚠️`, but the file body is unchanged and **4 surfaces still import live**:

```
app/[locale]/(protected)/commissions/me/request-withdrawal-client.tsx:14  → staffRequestWithdrawal
app/[locale]/(admin)/admin/commissions/[id]/withdrawal-actions-client.tsx:16  (declared unreachable; verify)
app/[locale]/(admin)/admin/commissions/tiers/tier-form.tsx:5  → adminUpsertCommissionTier
app/[locale]/(admin)/admin/commissions/tiers/row-actions.tsx:5  → adminUpsertCommissionTier
```

Every one of those imports calls a function that writes to `commission_accruals` / `commission_withdrawals` / `commission_tiers` — the **rebuilt tables that are 0-rows on prod** per ADR-0020 + 0026. Staff who try to "request a withdrawal" or "edit a commission tier" will get a green toast (writes ok against empty table) but **the row is invisible to admin** (the admin queue reads `tb_user_sales*` per the new ADR-0026 repoint).

**This is a silent dead-write to the customer-side surface** (`(protected)/commissions/me/request-withdrawal-client.tsx`) — exactly the pattern AGENTS.md §0e and `docs/learnings/verify-deep-flow.md` warn about. The tombstone header is misleading because the file is still wire-live.

### 1.3 `(protected)/commissions/me` reads dead `commission_*` tables

`app/[locale]/(protected)/commissions/me/page.tsx:77-87` does:
```ts
const { data: accrualsRaw } = await supabase
  .from("commission_accruals")
  .select(...)
  .eq("earner_admin_id", user.id)
  ...
```

→ Returns 0 rows on prod (table empty). The customer (staff in this case — eligible roles = `interpreter`/`sales_admin`/`super`) sees an empty "unpaid balance: ฿0" page even when their `tb_user_sales` carries real earned amounts. The page is linked from `components/sections/protected-sidebar.tsx:123` so it's clickable from the live nav.

ADR-0026 declares the canonical staff withdrawal flow is `/sales/report/add`. Per that ADR the `/commissions/me` page should either redirect there OR be repointed to read `tb_user_sales` directly. **Currently it does neither.**

---

## 2. 🟠 Sloppy / shipped-but-broken (false "DONE" claims)

### 2.1 Tier-A "bulkCancelForwarders pivots → tb_forwarder" is partial

Commit `ae08c72c fix(tier-a/A3): bulkCancelForwarders pivots from forwarders (empty) → tb_forwarder (real)` claimed the dead-write closed. Reality:

- ✅ `actions/admin/forwarders-bulk.ts` — pivoted (the bulk cancel call path verified)
- ❌ `actions/admin/forwarders.ts:62 adminUpdateForwarder` — **STILL writes `.from("forwarders").update(...)`** (line 117-119)
- ❌ `actions/admin/forwarders.ts:170 adminBulkUpdateForwarderStatus` — **STILL writes `.from("forwarders")...in("f_no", f_nos)`** (line 196-199)
- ❌ `actions/admin/barcode.ts:110` — **STILL writes `.from("forwarders").update(...)`** for the warehouse-driver USB-scanner flip

When an admin opens `/admin/forwarders` (list reads tb_forwarder — correct) and clicks a row → detail edit form → status change, the write hits **rebuilt forwarders (empty)** → toast says "ok" → customer sees no status change. Exactly the bug ภูม flagged in 2026-05-25 ค่ำ that birthed AGENTS.md §0c.

### 2.2 `/admin/forwarders/[fNo]` reads rebuilt forwarders as PRIMARY

`app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx:45-74` queries `forwarders` (rebuilt empty) first; only falls back to `renderLegacyForwarderView` (which reads `tb_forwarder`) if the rebuilt query returns null. Since the list page sends rows from `tb_forwarder` (so `fNo` is real but the rebuilt has no matching row), **every row click goes to the fallback path**.

The fallback path renders a minimal read-only view (per line-66 comment) and bypasses the full edit form / cost adjustments / driver assign / bill-to override that the primary path exposes. So even after `819c283d` shipped the collapsible action panels, ภูม opening a row gets the *legacy* simple view, not the polished collapsible-with-actions one.

**Net effect for ภูม:** the new UX improvement only fires on a code path that's never reached in practice.

### 2.3 `service-orders.ts adminMarkPaid` writes to rebuilt `service_orders`

`actions/admin/service-orders.ts:342-381` reads + writes `.from("service_orders")` — rebuilt table, empty on prod. Tier-A A4 commit `8d20b86b` claimed `adminUpdateServiceOrder` was pivoted to `tb_header_order`, but **`adminMarkPaid` and `adminMarkOrdered` in the same file are NOT pivoted** — they still operate on the dead rebuilt table.

### 2.4 `yuan-payments.ts adminBulkApprove*` writes to rebuilt `yuan_payments`

`actions/admin/yuan-payments.ts:307-329` (bulk-approve) and `:760-771` (set-slip-transferred-at) still hit `.from("yuan_payments")` — Tier-A A5 commit `38cac4fd` claimed `adminUpdateYuanPayment` was pivoted to `tb_payment`, leaving the bulk path and the slip-meta path stuck on the empty rebuilt table.

### 2.5 `actions/admin/refunds.ts` parent lookups use rebuilt schemas

`actions/admin/refunds.ts:383-419` (`verifyRefundSourceRef`) and `:466-478` (`resolveRefundCeiling`) read the rebuilt `forwarders` / `service_orders` / `yuan_payments` tables to validate refund parents. On prod those tables are empty → **every refund mark-paid hits the fail-closed "not_found" branch** → admin can never mark a refund paid on a tb_*-only customer. This is pre-existing but unaddressed by the 258 commits despite the refund-modal repoint commit `fix(P1-13)` claiming it was pivoted.

### 2.6 `actions/admin/invoice-adjustments.ts` resolveInvoiceTarget reads rebuilt

`actions/admin/invoice-adjustments.ts:62-104` does the same pattern for invoice-adjustment target lookups. Quietly fails on every tb_*-only customer.

---

## 3. 🟡 Stale docs / save-points / cleanup

### 3.1 Save-point v5 says `HEAD=147105e5`, real HEAD is `2820395d`

`docs/research/poom-save-point-2026-06-02-sitting-I-v5-CLOSE.md:5` declares `Branch state: Poom-pacred = 147105e5 · pushed · origin synced (0/0)`. The actual HEAD is one commit ahead — `2820395d docs(save-point): v5 final update — รวม MOMO Q1+Q2 + resume commands`. Minor (the commit IS the save-point itself updating itself), but a reader trusting line 5 will look at the wrong HEAD.

### 3.2 Many one-off `.mjs` debug scripts left in `scripts/`

The 258-commit range added 9 new probe / investigate / backfill scripts:
- `scripts/backfill-orphan-tb-users.mjs`
- `scripts/investigate-pr99-candidate.mjs`
- `scripts/probe-bridge-insert-error.mjs`
- `scripts/probe-bridge-insert2.mjs`
- `scripts/probe-bridge-rows.mjs`
- `scripts/probe-inactive-customers.mjs`
- `scripts/probe-profile-cols.mjs`
- `scripts/rename-userid-to-pr99.mjs`
- `scripts/verify-backfill.mjs`

These are useful one-shot ops scripts but have no `scripts/README.md` entry explaining what they did or when to use them. Two of them are obviously named for a single-occurrence debug (`probe-bridge-insert-error` + `probe-bridge-insert2`). Recommend either consolidating them under `scripts/ops/legacy-bridge-2026-06-02/` with a README, or deleting the ones that already ran their job.

### 3.3 Tombstone messaging is misleading

Multiple files now contain `⚠️ TOMBSTONED · DO NOT CALL ⚠️` headers but their callers were not deleted/redirected. A future agent reading the header will assume the file is dead — but the imports compile, run, and quietly dead-write. Either commit to the rename (delete the dead callers), or remove the misleading tombstone header.

---

## 4. 🟢 Verified-working (claims that ARE true)

| Claim | Verified at | Notes |
|---|---|---|
| Margin Monitor exists + queries `tb_forwarder` | `app/[locale]/(admin)/admin/accounting/margin-monitor/page.tsx` + `actions/admin/margin-monitor.ts:52` | reads `tb_forwarder` where `fstatus='7'` — correct table |
| Quote Compare exists + reads VIP/SVIP/general | `app/[locale]/(admin)/admin/accounting/quote-compare/page.tsx` + `actions/admin/quote-comparison.ts:32-33` | reads `tb_settings.fcost*` + `tb_rate_g_*` — correct tables |
| `/api/cron/margin-flag` exists + registered in `vercel.json` | `app/api/cron/margin-flag/route.ts` + `vercel.json:44-47` | schedule `10 17 * * *` |
| `/admin/line-inbox` exists + reads `Podeng_customers_line` + `Podeng_line_messages` | `app/[locale]/(admin)/admin/line-inbox/page.tsx` + `actions/admin/line-inbox.ts:35-36` | tables marked applied prod in ledger 0131 |
| Forwarder `[fNo]` collapsible panels (`819c283d`) | `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` (inline `<details>`-based CollapsibleCard) | Pure UI per commit msg · works in PRIMARY branch only (see §2.2 — fallback branch is what users actually hit) |
| Freight quote MVP (`b7dfa030` + migration 0134) | `app/[locale]/(public)/freight-quote/page.tsx` + `components/freight-quote/FreightQuoteWizard.tsx` (632 LOC) + `lib/validators/freight-rfq.ts` + `actions/freight-quote.ts` | New public funnel · table `freight_quote` (singular · not the existing plural `freight_quotes`) applied prod 2026-06-01 per ledger |
| `/admin/forwarder-sales` repointed to `tb_sales_report` | `app/[locale]/(admin)/admin/forwarder-sales/page.tsx` | Reads 17,027-row legacy attribution table correctly |
| `/admin/commissions` LIST page repointed to `tb_user_sales` | `app/[locale]/(admin)/admin/commissions/page.tsx:82-99` | Top-earners now correct · BUT see §1.2/1.3 for the gap in sibling pages |
| `/admin/commissions/[id]` is now a redirect to `/admin/sales-payouts/[id]` | `app/[locale]/(admin)/admin/commissions/[id]/page.tsx:34-37` | Numeric ids → sales-payouts · non-numeric → list |
| Migrations 0125-0134 applied to prod | `docs/runbook/migration-ledger.md:32-41` (claim) | Could not run live probe but ledger marks all 10 applied with timings · cross-referenced with action files referencing those tables → no schema-vs-code mismatch found |

---

## 5. ⚡ Quick fixes (≤30 min each)

1. **Fix the 4 tsc errors** by adding `as unknown as RowType[]` casts to the 4 lines in §1.1. **Unblocks Vercel build.** (5 min)
2. **Redirect or repoint `/commissions/me`** — easy option: `redirect("/sales/report/add")` like `/admin/commissions/[id]` does. (10 min, +1 ADR note)
3. **Delete tombstone-header from `actions/admin/commissions.ts`** OR add a build-time error guard preventing imports. The current "do not call" comment is unenforced. (10 min)
4. **Remove `/commissions/me` from `components/sections/protected-sidebar.tsx:123`** until the page is actually repointed. (2 min)
5. **Rename or delete the 2 obvious one-shot debug scripts** `scripts/probe-bridge-insert-error.mjs` + `scripts/probe-bridge-insert2.mjs`. Move other probes under `scripts/ops/<date>/`. (15 min)
6. **Update save-point v5 line 5** to reflect HEAD=`2820395d`. (2 min)

---

## 6. Recommended fix order

| Order | Item | Rationale |
|---|---|---|
| 1 | §1.1 — fix 4 tsc errors | Vercel deploys are blocked. Highest impact, smallest change. |
| 2 | §2.1, §2.3, §2.4 — pivot the remaining `forwarders` / `service_orders` / `yuan_payments` writers | These are SILENT money-path dead-writes. Single biggest fidelity bug class in the audit. ~3-4 ชม total |
| 3 | §2.2 — flip `/admin/forwarders/[fNo]` primary read from `forwarders` → `tb_forwarder` | Unlocks ภูม's UX improvement work + closes a major silent path. ~1 ชม |
| 4 | §1.2, §1.3 — finish the commission tombstone (redirect `/commissions/me` + tiers) | Customer-facing dead surface. Prevents future "I requested withdrawal but got nothing" confusion. ~30 min |
| 5 | §2.5, §2.6 — refunds + invoice-adjustments parent lookups | Lower urgency (admin-only · refund flow rarely used) but same pattern. ~1 ชม |
| 6 | §3.* — docs cleanup | Hygiene. Do whenever. |

---

## 7. Methodology notes (for reproducibility)

- Sampled 30 highest-impact files by `git diff --stat` LOC.
- Cross-checked 11 claimed-shipped surfaces against actual code paths (Grep + Read).
- Ran `npx tsc --noEmit` — captured 4 errors.
- Ran `git log --format="%s" 59c585ac..HEAD | grep -i "fix\|defer\|stub"` for commit-message scan.
- Pattern-scanned all new admin action files for `.from("<rebuilt-table-name>")` writes per `docs/learnings/verify-deep-flow.md`.
- Did NOT probe prod DB directly (sandbox blocked PowerShell/node script execution) — relied on `docs/runbook/migration-ledger.md` for applied state.
- Did NOT run `pnpm test:unit` (Windows shell bracket-in-path bug noted in user prompt).
- Verified 4 cron files for register status in `vercel.json`.

Total audit time: ~40 min · ~30 file reads · ~20 Grep queries.
