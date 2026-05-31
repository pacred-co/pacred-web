# 🟢 Save-point — 2026-05-31 · เดฟ parallel-wave close-out

**State:** `main` = `dave-pacred` = **`0361dc6c`** (0/0 · prod · Vercel auto-deploys) · all pushed · every commit gated `pnpm verify` EXIT 0 + `pnpm build` EXIT 0 + browser-checked (no prod mutation).

Owner: *"ไล่ทำหมดนี่เลย ทยอยแยกร่างทำได้ตามความเหมาะสม"* → ran a 4-parallel-worktree-agent wave + solo finish. **8 of 9 list items shipped; 1 deferred (bill-to — needs a schema decision).**

---

## 🚀 This session's full arc (main `2da000cc` → `0361dc6c`)
1. Integrate ภูม end-of-day + comprehensive re-sweep (`_MASTER-FRESH.md`: 2026-05-30 "23 P0" ~80% stale) + 9 owner decisions.
2. **Theme A** forwarder `[fNo]` editor (money dead-write tombstone + payment + address/transport/cover/owner/cost-adjust/fShipBy/amountCount/**fCredit**).
3. **Theme B** general-rate editor → `tb_rate_g_*` (engine tables).
4. **Reports** VAT7 shops-only + 5-orphan reachability + daily-graph + shops-recompute + sales-monthly.
5. **Settings** 144-cell forwarder default-cost matrix editor.
6. **staff-purge** ADR-0022 + FK-remap runbook (review-only).

## ✅ Owner "ไล่ทำหมด" list — 8/9 shipped
| # | Item | Status |
|---|---|---|
| 1 | daily-profit graph | ✅ from-scratch SVG (no chart lib) on forwarder/yuan/shops reports |
| 2 | shops profit recompute-live | ✅ `(htotalpricechn+hshippingchn)*hrate − hratecost*hcostall`, roundUp=ceil, hcostall≠0 gate |
| 3 | sales-monthly faithful | ✅ `tb_sales_report` (17,027 prod rows) JOIN tb_forwarder+tb_admin, 3-col revenue + idempotent `backfillSalesReport` |
| 4 | fCredit credit-out | ✅ faithful + **UPSERT fixes legacy silent-drop** (76/8,898 had a row) + headroom gate + rollback |
| 5 | staff-purge | ✅ ADR-0022 + runbook + read-only analysis script (NO execute) |
| 6 | cost-adjust | ✅ fpriceupdate/priceother/fdiscount manual edit (Pacred-blessed) |
| 7 | fShipBy carrier | ✅ PCS-family reprice (PCSF→0/PCSE→vol×120≥50/PCS→0) + verbatim PCS depot address |
| 8 | 128-cell cost-matrix | ✅ 144-col tb_settings editor (car/ship×1-4×9 carriers×กวางโจว/อี้อู) reachable 2 clicks |
| 9 | **bill-to-override** | ⏸ **DEFERRED** — tb_forwarder has NO bill-to column; Pacred-original; needs owner schema pick (new column on 47k rows vs side-table) |

## 🔑 Key findings surfaced
- **`admin_contact_extras` is EMPTY** on prod → P1-15 sales-rep auto-assign returns null today (the bridge holding `legacy_admin_id` is unpopulated).
- **ZERO overlap** between `tb_admin.adminID` roster (13) and the admin codes in live data (`tb_users.adminIDSale` 8,890 customers / `tb_sales_report.sradminidsale` 16,954 rows) → rep names already blank on reports. The re-register (ADR-0022) is the fix — remap-then-deactivate, never hard-delete (no DB-level FKs = silent orphan risk).
- `tb_sales_report` is populated (17,027 rows) — sales-monthly works now.
- Legacy `round_up` = `ceil` (not round-half-up) — verified in function.php.

## ⏸ Remaining (genuinely needs owner/lane)
- **bill-to schema decision** (owner) — then ~30min to implement.
- **staff-purge execution** (owner + ภูม) — run ADR-0022: create 13 admins → remap FKs → deactivate old. `docs/runbook/staff-purge-fk-remap-2026-05-31.md` + `scripts/staff-purge-analysis.mjs`.
- **13-admin recreate** (ภูม) — unblocks P1-15 + sales-monthly rep names.
- **LINE_STAFF_GROUP_ID** (owner) — add @pacred bot to the real group (currently 404).
- ภูม/ปอน lanes: driver-assign, tb_notify_wp broadcast, the bigger settings config (~120 fields), HR-on-tas_*, printAll, monitoring reports.

## ▶️ RESUME
```bash
cd /Users/dev/pacred-web && git fetch origin --prune && git checkout dave-pacred && git pull origin main --no-edit
git rev-list --left-right --count origin/main...HEAD   # expect 0 0
cat docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md
cat docs/decisions/0022-staff-purge-and-reregister.md
# dev: preview "pacred-1to1" on :3000
```
**Teammates:** ภูม Poom-pacred + ปอน InwPond007 → `git pull origin main`.
