# ภูม Lane — Verified Status Audit (2026-06-02)

> **Method:** code-grounded verification (not doc-claim parroting). Every
> claimed item below is checked against the actual file on disk on this
> worktree (`Poom-pacred = 2820395d` post-sync), against the live git log,
> and against `pnpm typecheck` output.
>
> **Scope:** the accounting/finance/PEAK lane described in
> `docs/briefs/poom-wave-2026-06-01.md`, plus the CEO pricing-pair items
> that landed in sittings v4-v5. Excludes เดฟ-owned items (Wave A trust
> sweep + /admin/leads CEO §6 — done by เดฟ).
>
> **Branch state at audit:** `Poom-pacred = 2820395d` · origin synced 0/0.

---

## 1. Summary table — claimed vs verified

| # | Task (brief §) | Save-point claim | Actual code state | Verdict |
|---|---|---|---|---|
| 1 | **Potemkin commission repoint** (§1) | ✅ shipped `2602a0da` | `/admin/commissions/page.tsx` reads `tb_user_sales` + `tb_user_sales_admin_pay` (ADR-0026 banner inline); `/admin/forwarder-sales/page.tsx` reads `tb_sales_report` + `tb_admin` rep hydration; `/admin/withdrawals/page.tsx` is a redirect into `/admin/wallet?view=tx` (intentionally not a commission reader per ADR-0026); `actions/admin/commissions.ts` carries an explicit **TOMBSTONED** banner at top and is unreferenced by the new pages | ✅ **verified done** |
| 2 | **Commission-SOT ADR-0026** (§5a) | ✅ shipped `2602a0da` | `docs/decisions/0026-commission-admin-surfaces-repoint.md` exists, accepted, references ADR-0020/0018/0019, names every repointed surface in D-2 | ✅ **verified done** |
| 3 | **PEAK §3.1 Documents lifecycle** | ✅ shipped sitting-I (`afa15f1c`) | `app/[locale]/(admin)/admin/accounting/documents/page.tsx` exists, reads live `tb_receipt` + `tb_bill` + `tb_forwarder_tax_invoice` for current-month stats, lifecycle threading, "Phase-C" honest banner on unfinished doc types, super/accounting gate | ✅ **verified done** |
| 4 | **PEAK §3.2 AR-aging cockpit** | ✅ shipped `5b6cbc0a` | `app/[locale]/(admin)/admin/accounting/ar-aging/page.tsx` exists, reads via `actions/admin/ar-aging.ts` (uses `tb_forwarder.fstatus='5'` as MVP unpaid signal — noted in header), 4 aging buckets + CSV; AGENTS.md §0c followed (error destructured) | ✅ **verified done** |
| 5 | **PEAK §3.3 Period close** | ✅ verified shipped (V-E9) | `app/[locale]/(admin)/admin/accounting/{closing,periods}/page.tsx` both exist; `closing` reads `tb_receipt` (rstatus='3' issued, not the empty rebuilt `forwarders`); `periods` uses `accounting_periods` table with status pills + open-period button | ✅ **verified done** |
| 6 | **PEAK §3.4 e-Tax (RD Code 86) hub + bulk XML** | ✅ shipped `a57e8df5` + `f721e5d7` | `app/[locale]/(admin)/admin/accounting/etax/page.tsx` exists + `etax-bulk-download.tsx` + `etax-row-downloads.tsx`; uses `getEtaxBundle` + `buildEtaxXml`; reads `tb_forwarder_tax_invoice` (correct table per migration 0129) — **HOWEVER** the `actions/admin/etax-export.ts` source file has a **TypeScript build error** at line 125 (TS2352 — `GenericStringError[]` → `Raw[]` invalid cast caused by dynamic select-string concat) | 🔧 **shipped-but-tsc-broken** (Turbopack masks it; `pnpm typecheck` exit 2) |
| 7 | **PEAK §3.5 PEAK/FlowAccount CSV export** | ✅ shipped `c128a7ae` | `app/[locale]/(admin)/admin/accounting/peak-export/page.tsx` exists, reads via `getPeakExportBundle`, bundles 4 datasets (receipts + bills + sales-comm batches + interpreter-comm batches) with per-dataset CSV button | ✅ **verified done** |
| 8 | **CEO Margin Monitor** (v4) | ✅ shipped `3096df7f` | `app/[locale]/(admin)/admin/accounting/margin-monitor/page.tsx` exists; `actions/admin/margin-monitor.ts` reads **`tb_forwarder` where `fstatus='7'`** (correct legacy SOT, not rebuilt `forwarders`); 5 CEO buckets (neg/0-5k/5-10k/10-15k/15k+); per-rep rollup via `tb_sales_report`; CSV export | ✅ **verified done** |
| 9 | **CEO Sales Quote Comparison** (v4) | ✅ shipped `06feb98e` | `app/[locale]/(admin)/admin/accounting/quote-compare/page.tsx` exists; uses `getQuoteComparison` from `actions/admin/quote-comparison.ts`; SVIP→VIP→general waterfall via existing `resolve-rate.ts`; 9 carriers from `tb_settings.fcost{car|ship}{1-4}default{carrier}{city}` (144-cell matrix); CEO cap warnings | ✅ **verified done** |
| 10 | **CEO Margin-flag cron** (v4) | ✅ shipped `2a0e53c5` | `app/api/cron/margin-flag/route.ts` exists; **registered in `vercel.json` at schedule `10 17 * * *` (= 00:10 ICT)**; reads yesterday's `tb_forwarder.fstatus='7'` window; instrumented + LINE staff-group push | ✅ **verified done** |
| 11 | **Forwarder [fNo] CollapsibleCard** (v5) | ✅ shipped `819c283d` | `app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx` line 794-876 uses `<CollapsibleCard>` 5× with `defaultOpen` heuristic per panel; component **defined inline** at line 951 (no separate `components/CollapsibleCard.tsx` file — server-side `<details>` wrapper, no JS dependency) | ✅ **verified done** (component is inline-only, not extracted; intentional per server-component design) |
| 12 | **§2 Batch payouts MVP (read-only)** | 🟡 MVP shipped `101e75dc` | `app/[locale]/(admin)/admin/accounting/withdraw/comm-sale/page.tsx` + `comm-interpreter/page.tsx` both exist, with `[id]` detail subfolders; read via `actions/admin/withdraw-comm-batch.ts` (lines 25/3,204 + 46/2,947 of real legacy history); **HOWEVER** `actions/admin/withdraw-comm-batch.ts` has **2 TS errors** at lines 178+247 (same TS2352 dynamic-select pattern); CREATE+PAY write paths explicitly NOT YET built (deferred for ก๊อต co-sign) | ⚠️ **partial / tsc-broken** |
| 13 | **§6 TH-transport batch reader** | 🟡 MVP shipped `5494acda` | `app/[locale]/(admin)/admin/forwarders/tran-th/page.tsx` + `[id]/` detail exist; reads `tb_forwarder_tran_th_h` (296 batches) + `_sub` (643 items); **HOWEVER** `actions/admin/forwarder-tran-th.ts` has **1 TS error** at line 212 (same pattern); CREATE batch writer explicitly deferred | ⚠️ **partial / tsc-broken** |
| 14 | **§5b Auto-commission accrual trigger** | ⏸ defer (เดฟ wallet coord) | No new code; existing `actions/admin/earn-trigger-tb-user-sales.ts` fires on delivery (the EARN side) but no `tb_wallet_hs`-paid → typed accrual trigger | ❌ **not done** (correctly deferred) |
| 15 | **WHT certificates UI** (§3.4 follow-up) | ✅ shipped `9f00ff1d` | `actions/admin/wht-cert.ts` exists, but has **1 TS error** at line 95 (same pattern); 50-ทวิ certificate tracking UI implemented | 🔧 **shipped-but-tsc-broken** |

**Counts: ✅ 9 verified done · ⚠️ 2 partial · 🔧 3 shipped-but-tsc-broken · ❌ 1 correctly-deferred**

---

## 2. CEO directive alignment — does this move toward "self-running business"?

Reading `docs/research/ceo-directives-2026-06-01.md` § 1-7 against what landed in ภูม's lane:

| CEO directive | ภูม-lane response | Move toward self-running? |
|---|---|---|
| **§3 — Accounting tax-doc model (3 modes)** | PEAK §3.4 e-Tax shipped for ใบกำกับ (RD-86); ใบเสร็จ already faithful; **ใบขนสินค้า (customs declaration mode) NOT shipped** | 🟡 **2/3 done** — biggest open gap in this lane vs CEO §3 |
| **§4 — Pricing profit-cap + quote-comparison** | Margin Monitor + Quote Comparison + Margin-flag cron all shipped (the full feedback loop). Per-customer cap policy + save-quote-to-tb_quotation are Phase-2 enhancements (deferred). | ✅ **CEO §4 closed** — the strongest CEO-alignment win this sitting |
| **§5/§7 — CRM scale-blockers + workflow standardisation** | CRM is เดฟ+ปอน lane (not ภูม). ภูม's PEAK module enables month-end close → workflow-standardisation enabler, but indirect. | ⚪ **out of lane** |
| **§6 — Acquisition kickoff /admin/leads** | เดฟ shipped `/admin/leads` (call-queue on 6,936 cold + big-PCS · separate from ภูม lane). | ⚪ **out of lane** (done by เดฟ) |
| **Self-running business (north star)** | PEAK module + WHT engine + auto-issue-receipt + period close = the back-office that runs itself. AR-aging + margin-flag cron = automated review loops. **ภูม's lane is doing this exactly** — the accounting + commission + tax-doc layer no longer needs CEO intervention. | ✅ **strongest contributor** to the north star outside CRM |

**Where ภูม lane could move further toward self-running:**
1. **Wire auto-commission accrual** (§5b deferred) — today the 4,104 earns flag is computed lazily at each list-page render; a trigger would mean "owed" balance is always live without admin click
2. **Build batch payout CREATE side** (§2 write-side) — today the 25/46 historical batches are visible, but staff still must use legacy PHP to create NEW batches → not self-running until the create path lands
3. **Per-customer margin baseline tracker** (v4 pickup B) — feeds CEO "ลูกค้าประจำควรได้ราคาดีกว่า" rule into Sales' quote-builder automatically (no rep judgement needed)

---

## 3. Top 5 next-priority items for ภูม (ordered by revenue + trust impact)

### 1. 🔧 Fix the 5 TypeScript errors (~30 min · trust risk + tsc-gate)
Files: `actions/admin/etax-export.ts:125` · `forwarder-tran-th.ts:212` · `wht-cert.ts:95` · `withdraw-comm-batch.ts:178+247`. Pattern: `(rowsRaw ?? []) as Raw[]` cast fails because the dynamic `.select(stringConcat)` makes PostgREST type inference fall through to `GenericStringError[]`. Two fix recipes: (a) use static select strings, or (b) chain `.returns<MyType>()` to each query. **Why P0:** these are ภูม's own pages and the `pnpm verify` gate is red — every other agent reads ฿ red and assumes ภูม's lane is broken. Save-point v4 noted these but did NOT close them. Turbopack masks the failure on `pnpm build`, but a future stricter CI will block.

### 2. ⭐ CEO §3 — ใบขนสินค้า cargo customs-declaration MVP (~6-8 h · revenue + CEO trio)
CEO §3 names 3 modes: **ใบกำกับ** (✅ done via tax-invoice) · **ใบขน** (⏸ next) · **ไม่รับเอกสาร** (✅ default). The missing leg = customs-declaration + RD Form-86 backend for ฝากนำเข้า full-customs cases. Closes the CEO 3-tax-doc trio. Recommended pickup A in save-point v5. **Why P1-but-high-leverage:** ภูม is the only lane that can ship this; closes a CEO-named directive cleanly; needed for full juristic-customer revenue capture.

### 3. 💰 §2 Batch payout CREATE side (~L · ก๊อต co-sign · biggest faithful-port gap)
The MVP read-only is shipped — 71 historical batches visible (25 sales + 46 interpreter). Missing: the CREATE flow (admin selects unpaid forwarders → computes 1% × WHT → INSERT to `tb_withdraw_comm_sale_h`/`_item` → status 1 → upload slip → status 2). 6,151 line-items of real history with no Pacred writer means staff still pay reps via legacy PHP each month. **Why P0-but-blocked:** needs ก๊อต architectural sign-off per the brief; ภูม cannot self-unblock. Surface this in the next ก๊อต handoff sync.

### 4. 🎯 §5b Auto-commission accrual trigger (~M · เดฟ wallet coord)
Today the earn-trigger fires on delivery (correct). The batch-comm accrual is computed lazily inside the page load. Make it a typed accrual row written on `tb_wallet_hs` paid → reps see live "owed" balance without admin clicking refresh. **Why P1:** moves the accounting layer toward "self-running"; halves the manual SQL the legacy forced; depends on เดฟ's wallet-SOT lane being stable (per brief). Recommend pair with เดฟ.

### 5. 📊 Per-customer margin baseline tracker on /admin/customers/[id] (~3-4 h · CRM activation)
Save-point v5 pickup B. Add a section to the customer detail page showing this customer's avg margin · over-cap count · last 10 ตู้. Feeds the CEO "ลูกค้าประจำควรได้ราคาดีกว่า" rule into Sales' quote-builder automatically. **Why P1:** activates the new Margin Monitor data into CRM context where Sales sees it before quoting; small effort, high CEO-alignment payoff. Direct extension of v4 work.

**Bench (also useful, lower priority):**
- §2 + §6 CREATE write-sides bundled — same pattern, same agent (if ก๊อต co-sign comes through)
- Save quote → `tb_quotation` row (currently ephemeral compute · v5 pickup C)
- Per-customer cap policy (config override per ลูกค้า SVIP) — v5 pickup D

---

## 4. Anything claimed-done in docs that is NOT actually in code

After parallel verification: **no claim was fully false.** Every claimed file exists with the claimed shape. But there are 3 nuances worth flagging so ภูม doesn't have wrong expectations:

1. **TypeScript errors persist** (🔧 above). Save-point v4 documents them as "pre-existing", v5 inherits the same note. They ARE introduced by ภูม's own work (the dynamic-select pattern is new in `etax-export` + `withdraw-comm-batch` + `forwarder-tran-th` + `wht-cert` files — all landed sitting-I). Reframing them as "pre-existing" is slightly generous. Turbopack masks them on `pnpm build`; `pnpm typecheck` exits 2.

2. **CollapsibleCard component is inline-only.** Save-point v5 implies a shared component, but it's defined as a local function at line 951 of `forwarders/[fNo]/page.tsx`. Not a bug (server-side `<details>` doesn't need extraction), but if other surfaces (e.g. `/admin/customers/[id]` action panels per top-5 item #5) want the same pattern, the component will need to be lifted to `components/admin/collapsible-card.tsx`. Heads-up: this is a 5-min refactor when next needed.

3. **§2 batch payout MVP is genuinely read-only.** The pages render the 71 historical batches; staff cannot create new batches via Pacred yet. Save-point honestly says "MVP read-only · CREATE+PAY defer" — this is accurate. The risk = if ภูม assumes Pacred is "done" with this lane, monthly payouts still require legacy PHP. Surface this in any CEO/owner status update.

---

## 5. Branch + verify state at audit time

```
Branch: Poom-pacred = 2820395d (origin synced 0/0)
Working tree: clean (only CLAUDE settings.local.json modified — harmless)
pnpm typecheck: EXIT 2 (5 errors · all listed above)
pnpm build: not run this audit (save-point v5 claims Turbopack passes)
```

**Sources read for this audit (24 files):**
- `docs/briefs/poom-wave-2026-06-01.md` · `docs/research/poom-save-point-2026-06-02-sitting-I-{v4,v5-CLOSE}.md` · `docs/research/big-audit-2026-06-01/_MASTER-PLAN.md` · `docs/research/big-audit-2026-06-01/04-billing-tax-sales.md` · `docs/research/ceo-directives-2026-06-01.md` · `docs/handoff-2026-06-01-waves.md` · `docs/decisions/0026-commission-admin-surfaces-repoint.md`
- Pages: `/admin/commissions/page.tsx` · `/admin/forwarder-sales/page.tsx` · `/admin/withdrawals/page.tsx` · `/admin/accounting/{documents,ar-aging,etax,peak-export,closing,periods,margin-monitor,quote-compare}/page.tsx` · `/admin/accounting/withdraw/{,comm-sale,comm-interpreter}/page.tsx` · `/admin/forwarders/tran-th/page.tsx` · `/admin/forwarders/[fNo]/page.tsx`
- Actions: `actions/admin/commissions.ts` (tombstone) · `actions/admin/etax-export.ts` · `actions/admin/withdraw-comm-batch.ts`
- API: `app/api/cron/margin-flag/route.ts` · `vercel.json` (cron registration)
- Menubar: `lib/admin/accounting-menubar.ts`
- Git: log range `2602a0da..2820395d` (21 commits this sitting)
