# Save-point — sitting-I (continuation) · v4 · CEO pricing directive closed · 2026-06-02

> **Purpose:** Continuation save-point from prior v3 (sitting-I-PEAK module close-out). This v4 closes the **CEO pricing directive** (the explicit "pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool" duo from 2026-06-01 ceo-directives).
>
> **Branch state:** `Poom-pacred = 06feb98e` · synced กับ origin · was at `a57e8df5` ตอนเริ่ม continuation
>
> **Total this run:** 3 commits (2 surfaces + 1 lint fix) — Margin Monitor (retrospective) + Sales Quote Comparison (forward-looking)

---

## 🎯 3 commits ที่ landed ใน continuation run

| # | SHA | Brief task | งาน |
|---|---|---|---|
| 14 | (folded into 15) | A-tier polish | `prefer-const` lint fix in margin-monitor (was hold from prior compaction) |
| 15 | `3096df7f` | **CEO directive A** | **Margin Monitor** — retrospective profit-cap monitor (≤฿15k/ตู้ policy) · buckets 0/0-5k/5-10k/10-15k/15k+ · top-20 over-cap + top-20 negative + per-rep leaderboard · CSV export |
| 16 | `06feb98e` | **CEO directive B** | **Sales Quote Comparison** — forward-looking pricing tool · 9-carrier side-by-side · sale rate resolved via SVIP→VIP→general waterfall · cost rates from tb_settings · CEO cap warnings · sharable GET-URL quotes |

**Net diff:** ~+1,175 LOC across 5 files (2 actions + 2 pages + menubar)

---

## 🎖 CEO pricing directive — FULLY CLOSED

CLAUDE.md PM section quote: *"pricing profit-cap ≤15k฿/ตู้ + sales quote-comparison tool"*

| Half | Tool | Path | Status |
|---|---|---|---|
| 🔁 **Retrospective** | Margin Monitor | `/admin/accounting/margin-monitor` | ✅ shipped 3096df7f |
| 🔮 **Forward-looking** | Sales Quote Comparison | `/admin/accounting/quote-compare` | ✅ shipped 06feb98e |

**Pair coverage:**

```
              ┌────────────────────────────────┐
              │  CEO Directive 2026-06-01      │
              │  "≤฿15k/ตู้ + quote tool"        │
              └────────────────────────────────┘
                   ↓                  ↓
        ┌──────────────────┐  ┌──────────────────┐
        │ Margin Monitor   │  │ Quote Comparison │
        │ (after delivery) │  │ (before commit)  │
        │                  │  │                  │
        │ tb_forwarder     │  │ tb_rate_g/vip/   │
        │ WHERE fstatus=7  │  │   custom_*       │
        │                  │  │ tb_settings.fcost│
        │ Buckets:         │  │                  │
        │ neg/0-5/5-10/    │  │ Same buckets     │
        │ 10-15/15k+       │  │ + carrier table  │
        │                  │  │                  │
        │ Sales rep        │  │ Sales rep        │
        │ review tool      │  │ pitch tool       │
        └──────────────────┘  └──────────────────┘
```

---

## 📋 Margin Monitor (`3096df7f`) — detail

**Server action:** `actions/admin/margin-monitor.ts` (~225 LOC)
- Reads `tb_forwarder` WHERE `fstatus='7'` (delivered · realised margin) in date range
- Computes `margin = ftotalprice − fcosttotalprice − fdiscount`
- Bucket function: `negative / 0-5k / 5-10k / 10-15k / 15k+`
- Per-rep attribution via `tb_sales_report.sradminidsale` JOIN

**Page:** `app/[locale]/(admin)/admin/accounting/margin-monitor/page.tsx` (~315 LOC)
- Date-range form (default 90 days)
- 3 headline stats (totalRows · totalMargin · avgMargin)
- 5 color-coded bucket cards (with % of total)
- Top-20 over-cap section (>฿15k) with CSV export — for review
- Top-20 negative-margin section — for leak detection
- Per-rep leaderboard (top 20 by total margin + over-cap count)

**Menubar:** `การบัญชี → "Margin Monitor (CEO ≤ ฿15k cap)"`

**Roles:** super | accounting | sales_admin

---

## 📋 Sales Quote Comparison (`06feb98e`) — detail

**Server action:** `actions/admin/quote-comparison.ts` (~245 LOC)
- Input: warehouse · transport · product type · basis · weight + CBM · optional customer ID
- SALE rate waterfall (matches `lib/forwarder/resolve-rate.ts`):
  - SVIP probe → `tb_rate_custom_*`
  - VIP group (by coID) → `tb_rate_vip_*`
  - General (coID='PCS') → `tb_rate_g_*` (tiered)
- COST: reads 9 cells from `tb_settings.fcost{car|ship}{1-4}default{carrier}{city}`
  - Imports `CARRIERS` + `costColumn` from existing forwarder-costs/costs-model.ts
- Per-carrier margin + bucket (negative/low/mid/good/over_cap)
- Best/worst recommendation + cap-warning + loss-warning counters

**Page:** `app/[locale]/(admin)/admin/accounting/quote-compare/page.tsx` (~315 LOC)
- Input form (8 fields · all required dimensions + optional customer)
- Big SALE-PRICE headline (customer-facing single source of truth)
- 4 counter stats (active carriers / best / worst / warnings)
- 9-carrier side-by-side table — sorted best→worst margin
- Sales advisory panel:
  - 🔴 if N carriers losing → don't route through them
  - 🚨 if N carriers over-cap → CEO says lower the rate
  - ✅ if best carrier within cap → recommend route + showcase margin
- URL is sharable (GET params) — bookmark + LINE forward

**Menubar:** `การบัญชี → "Sales Quote Comparison"` (under Margin Monitor)

**Roles:** super | accounting | sales_admin

---

## 🟡 Deferred to Phase-C (documented in commit messages)

### Margin Monitor follow-ups
- **Auto-flag cron** — notify ผู้บริหาร when delivered margin > ฿15k (every 1h scan)
- **Per-customer cap tracking** — ลูกค้าประจำ deserve lower margin (CRM signal)
- **Per-route benchmarking** — compare avg margin per (warehouse, transport, product) tuple

### Quote Comparison follow-ups
- **Save quote** → write `tb_quotation` row (currently ephemeral compute)
- **Customer-facing version** — show partner names but unified Pacred price
- **Auto-flag** — "this cell looks under-priced for THIS lane" warnings

---

## 🟢 ภูม brief priority matrix (poom-wave-2026-06-01.md) — UPDATED

| # | Task | Eff | Pri | Status |
|---|---|---|---|---|
| **1** | Potemkin commission repoint | M | **P0** | ✅ shipped 2602a0da (v1) |
| **5a** | Commission-SOT ADR | S | **P0** | ✅ shipped 2602a0da (ADR-0026) |
| **2** | Batch payouts port | L | P1 | 🟡 MVP read-only · ⚠️ CREATE+PAY defer (ก๊อต co-sign) |
| **3** | PEAK module (5 sub-surfaces) | L | P1 | ✅ **5/5 DONE** (v3) |
| **4** | AR-aging cockpit | M | P1 | ✅ shipped 5b6cbc0a (v1) |
| **5b** | Auto-commission accrual trigger | M | P1 | ⏸ defer (touches wallet · เดฟ coord) |
| **6** | TH-transport grouping | M | P1 | 🟡 MVP read-only · ⚠️ CREATE defer |
| 🎖 | **CEO pricing directive** | L | **P0** | ✅ **BOTH halves shipped this run** |

**Coverage:** 5 fully done (incl. PEAK + CEO pricing) · 3 MVP-shipped (write side deferred) · 1 needs-coord.

---

## 🗺 Pickup options for next session (ภูม pick)

### A) ใบขนสินค้า cargo customs-declaration MVP — CEO 3-tax-doc trio close
3 tax-doc modes per CEO brief: **ใบกำกับ** (✅ done) · **ใบขน** (⏸ NEXT) · **ไม่รับเอกสาร** (✅ existing default).
- Effort: L (~6-8 h · port ใบขนสินค้า template + form + RD Form-86 backend)
- Value: closes the 3rd revenue-recognition path · ฝากนำเข้า full-customs cases

### B) Auto-flag margin > ฿15k cron + notify
Surfaces Margin Monitor finding into LINE staff group when over-cap delivery lands.
- Effort: S (~1-2 h · existing `notifyStaffGroup()` + cron `/api/cron/margin-flag`)
- Value: closes the "CEO directive review loop" — staff sees over-cap orders without opening dashboard

### C) Per-customer margin baseline tracker (CRM signal)
Add a section to `/admin/customers/[id]` showing this customer's historical avg margin + over-cap count → so sales know to bid LOWER on ลูกค้าประจำ.
- Effort: M (~3-4 h · query + UI section + maybe ADR)
- Value: feeds CEO "ลูกค้าประจำควรได้ราคาดีกว่า" directive · CRM data activation

### D) PEAK API integration (CEO Phase-C deferred originally)
Per ภูม's "PEAK API ข้ามไปก่อนนะ" directive — skip for now.

### E) ก๊อต co-sign Tier B (write sides)
B1 §2 batch payout CREATE write side · B2 §6 TH-transport batch CREATE — both need ก๊อต architectural review on wallet writes + race-guards.

### F) เดฟ coord Tier C
C1 §5b auto-accrual trigger — touches wallet flow → needs เดฟ wallet SOT alignment.

---

## ⚠️ Known issues (NOT introduced this run · pre-existing)

`pnpm typecheck` reports 5 errors in:
- `actions/admin/etax-export.ts` (line 125)
- `actions/admin/forwarder-tran-th.ts` (line 212)
- `actions/admin/wht-cert.ts` (line 95)
- `actions/admin/withdraw-comm-batch.ts` (lines 178, 247)

All TS2352 "Conversion of type 'GenericStringError[]'" — caused by dynamic `.select(stringConcat)` losing the result type narrowing. **My new files use `.maybeSingle<Record<...>>()` to provide explicit types and don't trigger this.**

Recommend follow-up: refactor the 4 pre-existing files to either:
- Use static select strings (let PostgREST type inference work), OR
- Add `.returns<MyType>()` to each query (per Supabase docs)

---

## 🔄 Resume commands (next session)

```bash
cd C:/Users/Admin/pacred-web/pacred-web
git -C . fetch origin --prune
git -C . rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
head -60 CLAUDE.md                                                  # latest PM section + master plan
cat docs/research/poom-save-point-2026-06-02-sitting-I-v4-ceo-pricing.md  # this file
# Pick from §"Pickup options" above (A-F)
```

---

## 🎉 Closing remark

**3 sessions ago = PEAK module §3 fully closed (5/5)**
**2 sessions ago = ภูม brief tasks 4/8 done**
**This continuation = CEO pricing directive both halves shipped**

The next high-leverage close-out targets:
1. **D7 ใบขนสินค้า** (close CEO 3-tax-doc trio · ~6-8h)
2. **CRM activation** (per-customer margin tracker → ลูกค้าประจำ pricing rule · ~3-4h)
3. **Tier B write sides** with ก๊อต (batch CREATE flows · ~2-3 sittings each)

ภูม pick when resuming. ⚡
