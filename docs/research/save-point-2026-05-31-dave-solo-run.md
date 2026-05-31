# 🟢 Save-point — 2026-05-31 · เดฟ solo-run close-out (Theme A + B + reports)

**State:** `main` = `dave-pacred` = **`a160c48d`** (0/0 · prod · Vercel auto-deploys) · all pushed · every commit gated `pnpm verify` EXIT 0 + `pnpm build` EXIT 0.

This session: reviewed team work → integrated ภูม end-of-day → pre-staged ภูม specs → comprehensive re-sweep (the 2026-05-30 "23 P0" is ~80% stale; canonical now = `docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md`) → captured 9 owner decisions → then **owner "ทำ solo ที่เหลือทั้งหมด"** → autonomous Theme A + B + reports.

---

## 🚀 Shipped this session (commits on main)

| Commit | What |
|---|---|
| `a7e69375` | integrate ภูม end-of-day (sitting-H mPDF fallback + tax-invoice menubar reachability) |
| `6f570b53` | re-sweep docs (`_MASTER-FRESH.md` + 4 quadrant ledgers) + 9 owner decisions |
| `af6486d8` | **Theme A P0:** tombstone `adminMarkForwarderPaid` money dead-write + `TbForwarderPaymentPanel` (faithful payment on real rows) |
| `d3f1c4e4` | **Theme A:** forwarder address re-pick + transport swap on real rows |
| `00e812d3` | **Theme A:** forwarder owner-reassign + cover-replace |
| `1d4022d1` | **Theme B P0:** repoint general-rate editor → `tb_rate_g_*` (the tables the engine reads) |
| `a160c48d` | **Reports:** VAT7 shops-only fidelity (owner #2) + wire 5 orphan reports into hub (§0d) |

### Theme A — forwarder `[fNo]` editor (was dead on real rows)
Closed the money dead-write (`adminMarkForwarderPaid` → tombstone; faithful path is `adminPayForwardersOnBehalf`) + built the real-row (legacy-view) editor. **Real-row `[fNo]` now covers:** dims+repricing · status/cabinet/tracking/note · **payment (ตัดกระเป๋า)** · address re-pick · transport swap · cover replace · owner-reassign — all faithful `tb_forwarder` writes, reachable §0d.
- New files: `tb-payment-panel.tsx`, `tb-edit-panel.tsx`, `actions/admin/forwarders-field-edits.ts`.

### Theme B — general-rate editor (admin edits did nothing)
`/admin/rates/general` wrote rebuilt-empty `rate_general`; engine reads `tb_rate_g_kg/cbm`. Repointed: new `adminUpdateGeneralRateCells` (rate-edits.ts, tiered, coid='PCS') + new matrix editor `general-rate-matrix.tsx` + deleted orphan `row-form.tsx`. Browser: reads 16 real cells. **Edits now hit the pricing engine.**

### Reports
VAT7 = legacy shops-only (owner #2): restore shops-profit `profit*0.07`, drop the column from forwarder/yuan. + wired all 5 orphan reports (forwarder/shops/yuan-profit, sales-monthly, otp-success) into `REPORTS_MENUBAR` (§0d).

---

## ⏸ Remaining — each genuinely needs a decision / dependency / lane (NOT clean-solo)
| Item | Why not solo-now |
|---|---|
| **daily-profit graph** (owner #1) | no chart lib in repo (no recharts/echarts) — needs a charting decision or scratch-built SVG |
| **shops profit recompute-live** (owner #3) | money-sensitive formula change (stored → CNY×rate) — wants care |
| **sales-monthly source rebuild** (owner #4) | needs `tb_sales_report` backfill decision (table may be empty on prod) |
| **fCredit credit-out** | money/debt + only 76/8,898 have a `tb_credit` row → needs credit-subsystem decision (M2 broken) |
| **forwarder cost-adjust** | NO faithful standalone legacy handler (only via re-price/pay) → would invent |
| **forwarder fShipBy (carrier)** | carrier-roster dependency (`getShipByOptions` ZIP logic) + PCS-address-copy — focused pass |
| **forwarder bill-to / driver-assign** | bill-to = Pacred-original (no tb_ home) · driver-assign = ภูม adm-09 lane (tb_forwarder_driver) |
| **128-cell default-cost matrix editor** (A2 #28, P0) | big build; solo-doable but large |
| **tb_notify_wp broadcast** (Theme C) | ปอน lane (M-1 notify) |
| **staff-purge** (owner #5) | needs ADR + FK-remap script before deleting old admins/sales |
| **LINE_STAFF_GROUP_ID** (owner #8) | BLOCKED — bot @pacred not in group `C61f…` (404); owner must add bot → real groupId |

---

## ▶️ RESUME
```bash
cd /Users/dev/pacred-web
git fetch origin --prune && git checkout dave-pacred && git pull origin main --no-edit
git rev-list --left-right --count origin/main...HEAD     # expect 0  0
cat docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md   # verified gap status
cat docs/research/save-point-2026-05-31-dave-solo-run.md       # this file
# dev: preview "pacred-1to1" on :3000
```
**Teammates:** ภูม Poom-pacred + ปอน InwPond007 → `git pull origin main` (all their work + this run integrated).

**Pickup options:** (A) daily-graph — decide chart lib vs scratch SVG · (B) 128-cell cost-matrix editor (big P0) · (C) fCredit/staff-purge — owner decisions first · (D) coord ภูม on driver-assign + reports remainder.
