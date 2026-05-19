# Wave-1 fidelity audit — B-6 `tb_cnt` per-container payment-slip ledger

> **Audit-only.** Read-only review of the B-6 slice. Verifies ภูม's save-point
> claim that "tb_cnt payment ledger → ✅ uses the legacy `tb_cnt*` tables
> faithfully". Source-of-truth: [`d1-fidelity-admin.md`](../d1-fidelity-admin.md)
> §6.3 + [`d1-phase-b-gap-map.md`](../d1-phase-b-gap-map.md) §3. Legacy ground
> truth: `pcs-admin/report-cnt.php` (the `addPay` flow).

---

## 1. Files audited

| Path | Lines | Role |
|---|---|---|
| `actions/admin/pcs-container-payments.ts` | 475 | NEW — list/detail/create/set-paid + double-pay guard + slip upload + signed URL |
| `app/[locale]/(admin)/admin/accounting/container-payments/page.tsx` | 237 | NEW — ledger list + filter chips + summary stats + addPay form panel |
| `app/[locale]/(admin)/admin/accounting/container-payments/[id]/page.tsx` | 224 | NEW — payment detail + 3 fan-out lists + slip viewer + status flip |
| `…/payment-create-form.tsx` | 275 | NEW (client) — addPay form + dup-warn confirm-once flow |
| `…/payment-row-controls.tsx` | 68 | NEW (client) — paid ↔ unpaid flip button |
| `…/slip-viewer.tsx` | 86 | NEW (client) — on-demand 1h signed URL preview (image inline / PDF link) |
| `…/constants.ts` | 19 | NEW — shared `PCS_CNT_STATUS = {UNPAID:"1", PAID:"2"}` (the literal varchar(1) codes) |
| `supabase/migrations/0081_pcs_legacy_schema.sql` | (lines 1003–1180) | EXISTING — defines all 4 `tb_cnt*` tables with legacy column types preserved |

Single commit on dave: `8f6054c feat(d1): admin container tb_cnt payment ledger (Phase B)` (2026-05-19).

## 2. Data-source check — does it read all 4 legacy tables? ✅✅✅✅

| Legacy table | Read in actions? | Written in actions? | Score |
|---|---|---|---|
| `tb_cnt` (header) | ✅ list (L96) · detail (L138) · status flip (L334) · signed URL (L415) | ✅ INSERT addPay (L247) · UPDATE cntstatus (L345) | ✅ 100% |
| `tb_cnt_item` (fcabinetnumber → cntid) | ✅ detail (L146) | ✅ INSERT fan-out (L271) | ✅ 100% |
| `tb_cnt_pay_idorco` (PK/CO numbers) | ✅ detail (L147) · dup check (L198) | ✅ INSERT fan-out (L286) | ✅ 100% |
| `tb_cnt_pay_trackingchn` (China tracking) | ✅ detail (L148) · dup check (L190) | ✅ INSERT fan-out (L294) | ✅ 100% |

All four tables exist in `migration 0081` with the legacy column names + types (`cntstatus varchar(1)`, `cntname varchar(1000)`, `cntimagesslip varchar(200)`, etc.). The action file's row type comments explicitly note the legacy-quirk preservation ("`cntstatus`: varchar(1) — `1` = ยังไม่จ่ายเงิน, `2` = จ่ายเงินแล้ว"). Bigint PKs preserved (no uuid-conversion).

## 3. Fan-out loop fidelity — matches legacy `report-cnt.php addPay`? ✅ (with one safe deviation)

`adminCreatePcsContainerPayment` (L230–310) reproduces the legacy `addPay` exactly:

1. Build `cntname` = comma-join of de-duped `cabinet_numbers` ✅ (L242–243 — matches legacy free-text comma string)
2. INSERT one `tb_cnt` header with all 11 NOT-NULL columns + the slip path ✅ (L246–263, NULL→"" coercion at L444–457)
3. Fan-out 1: INSERT N `tb_cnt_item` rows linking each `fcabinetnumber` → `cntid` ✅ (L270–272)
4. Fan-out 2: INSERT N `tb_cnt_pay_idorco` rows with `fcabinetnumber = cntname` ✅ (L286–287 — same comma-joined key as legacy)
5. Fan-out 3: INSERT N `tb_cnt_pay_trackingchn` rows with same `fcabinetnumber` key ✅ (L294–295)
6. Pre-submit double-pay guard (`checkPcsContainerDoublePay`, L174–208) counts existing fan-out rows and warns "กำลังจะจ่ายซ้ำ" ✅ — legacy `report-cnt.php` does the same count
7. `revalidatePath` after write ✅ (L307)

**Safe deviation:** L274–279 best-effort rolls back the `tb_cnt` header if `tb_cnt_item` INSERT fails. Legacy PHP has no transaction either; this is a strict improvement that avoids stranding a headerless payment. Comment is explicit and the divergence is justified.

## 4. Status rendering — legacy 1/2 enum? ✅

The shared `constants.ts` exports `PCS_CNT_STATUS = {UNPAID: "1", PAID: "2"}` — the literal varchar(1) codes the legacy DB uses. The page (L111) and detail (L51) compare strictly to that constant, render `t("statusPaid") / t("statusUnpaid")` (which resolve to *จ่ายแล้ว* / *รอจ่ายเงิน* per legacy labels), and use the legacy two-state amber/green pill. Filter chips offer `all / unpaid / paid` only — no extra rebuilt enum bleed-in.

## 5. Slip image — uploaded + rendered? ✅

`uploadPcsContainerPaymentSlip` (L368–393) uploads to `slips` bucket → returns a path; the form (L58–71) wires that into `slip_path` of the create call. Form-validation forces a slip (L85, "ต้องแนบสลิปการจ่ายเงิน") — legacy `cntimagesslip` is NOT NULL so this is correct. `adminGetPcsContainerPaymentSlipUrl` (L404–437) returns a 1h signed URL with MIME inference; `slip-viewer.tsx` renders PNG/JPG inline + PDF as a download link. The optional `cntfile` extra-doc column is also handled (L150–155 of detail page).

## 6. Accounting menu integration — badge surfaced? 🟠 partial

- The route `/admin/accounting/container-payments` is built and reachable directly. ✅
- A separate dave commit `71f4737 feat(admin-nav): add /admin/accounting/container-payments sidebar item` adds the menu entry under การเงิน — **but that commit is on `worktree-agent-a7f827818b84fcd3b` and not yet merged into `dave`**. On today's `origin/dave` the sidebar has no link → the page is **discoverable only by typing the URL**. Mergeable as-is, low risk.
- The unpaid-count badge wiring is **NOT done**. `listPcsContainerPayments` returns `unpaidCount`, and the page renders it as a top-of-page stat chip, but `actions/admin/sidebar-counts.ts` L119 still has `const cnt = 0; // tb_cnt container-payment ledger not yet ported (Phase B §6)`. That hard-zero means the legacy `cnt-hs` ⑤-badge on the sidebar will never light up. One-line fix: SELECT `count(*) FROM tb_cnt WHERE cntstatus='1'` and assign to `cnt`.

## 7. Fidelity gaps vs legacy `report-cnt.php`

| Gap | Severity | Notes |
|---|---|---|
| Sidebar menu entry not on `dave` yet | 🟡 | Commit `71f4737` exists, just needs to merge in |
| Sidebar unpaid-count badge hard-zero | 🟠 | `sidebar-counts.ts` L119 needs ~3-line fix; the badge IS the legacy `cnt-hs` UX |
| `cnt-hs.php` *approval queue* separate from payment ledger | 🟡 | Legacy splits "อนุมัติรายการ ⑤" and "ประวัติรายการ"; Pacred folds both into the one filterable ledger. Functionally equivalent (filter chip = unpaid) but staff with PCS muscle memory will look for two menu items. Phase-B follow-up. |
| No PDF/print of the ledger ("รายงานตู้สินค้า") | 🟡 | Legacy `report-cnt.php` is also a print/report; Pacred currently has list + detail only. Defer to Phase C unless staff ask. |
| `forwarders.fDateContainerClose` write-back on `mark_paid` | 🟡 | Legacy "close" sets `fDateContainerClose` on the covered forwarder rows. Pacred only flips `cntstatus`. Phase B follow-up if accounting workflow needs it; not load-bearing for the ledger surface itself. |
| Server-side dup check is post-form (not blocking) | 🟢 | The action *re-checks* dup-pay inside `withAdmin` only if the user already saw the warning client-side. Acceptable: legacy was also client-side, and the second click consciously proceeds. |
| Logging | ✅ | All mutations call `logAdminAction` with structured payload — better than legacy. |
| RBAC | ✅ | All actions gated by `withAdmin(["super","accounting"])` — matches the finance territory (ADR-0005 K-7 / W-1). |

## 8. Severity overall — 🟡 (yellow — ship-as-is with two stickies)

The DB-shape + write-loop + render are fully faithful — this slice **is** the best Wave-1 work. The two stickies (sidebar entry on a separate branch · badge count hard-zero) are pure menu-plumbing and don't affect correctness of any row written or read.

## 9. Recommendation — **SHIP this slice**, queue two trivial follow-ups

- ✅ **SHIP** `8f6054c` as-is — the ledger is correct, faithful, RBAC-gated, and logged.
- 📌 **Follow-up 1 (≤ 5 min):** merge `71f4737` (or re-add the sidebar entry once the source branch lands) so staff don't have to hand-type the URL.
- 📌 **Follow-up 2 (≤ 10 min):** replace `actions/admin/sidebar-counts.ts` L119 `const cnt = 0;` with a real `SELECT count(*) FROM tb_cnt WHERE cntstatus='1'` to surface the legacy `cnt-hs` ⑤-badge. The query is already written and tested inside `listPcsContainerPayments` L109–112 — just lift it.

These are menu-discovery polish, not fidelity gaps in the data plane. Phase-B Wave-1 verdict for B-6: **confirmed best-in-batch**.
