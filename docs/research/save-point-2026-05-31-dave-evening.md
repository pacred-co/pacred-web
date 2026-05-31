# 🟢 Save-point — 2026-05-31 evening · เดฟ (review + integrate + pre-stage · before rest)

**State:** `main` = `dave-pacred` = **`a7e69375`** (0/0 · prod · Vercel auto-deploys) · all pushed · gates GREEN (`pnpm verify` EXIT 0 · `pnpm build` EXIT 0).

This session: เดฟ reviewed the team's work, integrated ภูม's end-of-day batch, and **pre-staged the genuinely-remaining ภูม work** (deep-audited from legacy source) while ภูม ran his final batch — so the next session executes in minutes, not re-derive.

---

## ✅ Shipped to main this session

**Integrated ภูม Poom-pacred end-of-day (`f53dfa7e` → `8709754f`):**
- `f53dfa7e` sitting-H-fix 1/4 — consolidate forwarder-invoice → receipts (retire old 3-status list; new PEAK 7-tab is canonical; old query-params redirect)
- `ef0b666f` sitting-H-fix 2/4 — (a) mPDF **data-gap fallback** on `forwarder-invoice/[id]` (receipt items missing but header `ramount`>0 → surface header total + amber screen-only banner; print stays clean); (b) **reachability fix** — ใบกำกับภาษีขาย moved from orphan sidebar Extension entry → accounting menubar "รายรับ" (PEAK · §0d) in both menuSuper + menuManager
- `8709754f` ภูม end-of-day save-point doc

**เดฟ pre-stage pack (docs-only, zero collision):** `docs/port-specs/poom-prep-2026-05-31/` — 4 deep-audit specs + `_INDEX.md`.
**Learning:** `docs/learnings/ci-and-deploy-gotchas.md` — `rm -rf .next` while dev server runs → Turbopack corruption (false 500).

**Review verdict:** ภูม's batch is clean, faithful, well-commented (reachability + defensive data-gap handling both follow house rules). ปอน (InwPond007/podeng) = **0 new** (all prior work already integrated).

---

## 🔑 HEADLINE — the 2026-05-30 gap audit is ~60% STALE on ภูม's lane

Deep-audit (AGENTS.md §0b) of all ภูม "remaining" P0/P1 found most **already shipped** — DO NOT re-implement (dup-write landmine, root-cause #2):

| ✅ VERIFIED DONE (skip) | Evidence |
|---|---|
| P0-10 yuan bulk UUID (`resolveLegacyAdminId`) · P0-11 per-row form (mounted) · P0-14 cancel-on-legacy-view (Wave 31) · P1-10 Tab-4 spawn | live code + tests |
| P0-20 5 reports→tb_* · P0-21 closing→tb_receipt by rdate | commits ffd5a142 / 00abfafb |
| P0-22 (3 crons retargeted) · P1-1/2/4/5 forwarder bulk + earn-trigger | 2026-05-30-night |

### 🟡 ACTUALLY OPEN (pre-spec'd in the pack · all ภูม lane)
1. 🔴 **Reports reachability** — 5 profit/report pages are ORPHANS, no hub link (§0d). **browser-confirmed this session** (`/admin/reports` renders 200, 16 links, none to forwarder-profit/shops-profit/yuan-profit/sales-monthly/otp-success).
2. **P0-12** yuan manual-create self-approve `paystatus:'2'`→`'1'` + customer + staff notify (`yuan-payments-tb.ts:201`)
3. **Reports vat7 fidelity** (drop forwarder/yuan; RESTORE shops + recompute shops profit)
4. **P1-12** 8 missing shop header-edit handlers + UI
5. **sales-monthly** revenue/date-key/rep-source divergence (+ `tb_sales_report` backfill Q)
6. **P1-6/7/9** forwarder (single-container cnt-payment w/ slip · bill-to-customer 4→5 · saveNote)
7. **P1-11 GAP2** mark-paid actions send no customer notify

### ⚠️ NEW money finding (verified from source)
`adminMarkForwarderPaid` (`actions/admin/forwarders.ts:257`) reads rebuilt empty `forwarders` + `wallet_transactions`; **NO `-tb` twin**; imported by `/admin/forwarders/[fNo]/update-form.tsx`. On prod's real forwarders → `not_found`; admin can't record a forwarder payment. = symptom of **P1-3** (dual-mode `[fNo]`). Fix WITH the P1-3 rewrite, wiring the ADR-0018 wallet contract (`tb_forwarder` + `tb_wallet`/`tb_wallet_hs`). Coordinate with ภูม (adm-09 lane, big).

---

## ❓ 9 owner questions before the M-effort report work
In `docs/port-specs/poom-prep-2026-05-31/_INDEX.md §open-questions`. Key: VAT7 = shops-only? · `tb_sales_report` populated on prod or empty? · daily-profit graph back or delete? · closing juristic split = `corporatetype` (snapshot) vs `userCompany` (live)?

---

## 🔑 3 activation items still pending owner/teammate (unchanged)
1. owner set **`LINE_STAFF_GROUP_ID`** → P1-24 staff notify fires
2. ภูม create 13 admins (`/admin/admins/new`) → P1-15 sales-rep assign fires
3. ปอน migrate 3 customer-UI corporate readers (ADR-0021) → rebuilt `corporate` write removable

---

## ▶️ RESUME (next session)
```bash
cd /Users/dev/pacred-web
git fetch origin --prune
git checkout dave-pacred && git pull origin main --no-edit
git rev-list --left-right --count origin/main...HEAD          # expect 0  0
cat docs/port-specs/poom-prep-2026-05-31/_INDEX.md            # what's REALLY left for ภูม
cat docs/research/save-point-2026-05-31-dave-evening.md       # this file
# dev server: preview "pacred-1to1" standby on :3000
```
**Teammates first:** ภูม Poom-pacred `git pull origin main` (was 29 behind) · ปอน InwPond007 (55 behind) — all their work already on main.

**Pickup options:**
- **A** — get owner answers to the 9 questions, then execute the ภูม-lane open list per the spec pack (reports reachability is the cheapest/highest-leverage start)
- **B** — เดฟ enters ภูม lane (with go-ahead) for P1-3 forwarder `[fNo]` dual-mode rewrite (fixes `adminMarkForwarderPaid` money hole too · ~3-4h)
- **C** — reconcile preserved WIP branches (cust-03 forwarder `worktree-agent-a6ce5501`)
