# Save-point — sitting-I (poom-wave-2026-06-01 lane) · 2026-06-02

> **Purpose:** ปิดวัน · ส่งต่อให้พรุ่งนี้. งานที่ landed ใน 1 sitting + remaining queue + resume commands.
>
> **Branch state:** `Poom-pacred = afa15f1c` · synced กับ origin · was at `55ec389b` ตอนเริ่ม session

---

## 🎯 6 commits ที่ landed วันนี้ (range `55ec389b..afa15f1c`)

| # | SHA | Brief task | งาน |
|---|---|---|---|
| 1 | `2602a0da` | **§1 + §5a** | Potemkin commission repoint (`/admin/commissions` + `/admin/forwarder-sales`) → `tb_user_sales*` + `tb_sales_report` + ADR-0026 SOT lock |
| 2 | `101e75dc` | **§2 MVP** | Batch payouts read-only — 25 sale + 46 interpreter batches surface via `/admin/accounting/withdraw/comm-{sale,interpreter}/` + actions/admin/withdraw-comm-batch.ts |
| 3 | `5b6cbc0a` | **§4** | AR-aging cockpit — 457 ลูกหนี้ค้างชำระ bucket 0-30/30-60/60-90/90+ · top customers + rep attribution |
| 4 | `df337e0b` | §4 fix | Next-16 'use server' rejects non-async const export — internal-only `AGING_BUCKETS_INTERNAL` |
| 5 | `5494acda` | **§6 MVP** | TH-transport batches read-only — 296 historical batches · 643 forwarders + sidebar leaf + th/en i18n |
| 6 | `afa15f1c` | **§3.1** | PEAK Documents Lifecycle hub — 5-stage chain (quote→invoice→receipt→tax→credit/debit) · honest "🚧 Phase-C" stubs |

**Net diff:** ~+2,900 LOC across 19 files (4 actions + 8 pages + 4 docs/menubars + 3 i18n/sidebar)

---

## ✅ ภูม brief priority matrix (poom-wave-2026-06-01.md)

| # | Task | Eff | Pri | Status |
|---|---|---|---|---|
| 1 | Potemkin commission repoint | M | **P0** | ✅ shipped 2602a0da |
| 5a | Commission-SOT ADR | S | **P0** | ✅ shipped 2602a0da (ADR-0026) |
| 2 | Batch payouts port | L | P1 | 🟡 MVP read-only · ⚠️ CREATE+PAY write side defer |
| 3 | PEAK module (5 sub-surfaces) | L | P1 | 🟡 1/5 done (lifecycle hub) · 4 remain (period-close · e-Tax · PEAK export · doc-lifecycle deep) |
| 4 | AR-aging cockpit | M | P1 | ✅ shipped 5b6cbc0a |
| 5b | Auto-commission accrual trigger | M | P1 | ⏸ defer (touches wallet flow · เดฟ coord) |
| 6 | TH-transport grouping | M | P1 | 🟡 MVP read-only · ⚠️ CREATE write side defer |

**Coverage:** 3 fully done · 3 MVP-shipped + write side deferred · 1 not started

---

## ⏸ Write-side deferred queue (ต้อง coord)

### ต้อง ก๊อต co-sign (money-safe)
1. **§2 CREATE batch + PAY slip** สำหรับ `tb_withdraw_comm_{sale,interpreter}_*`
   - มี mirror combine-bill's tb_bill pattern (เดฟ ทำไว้แล้ว)
   - Server-recompute · dedup-guard · status-guard
   - ต้องดู legacy PHP source `withdraw-commission-{sale,interpreter}.php` ก่อนเขียน
2. **§6 CREATE batch** สำหรับ `tb_forwarder_tran_th_h/_sub`
   - Multi-row selector UI
   - Dedup-guard: fid ห้ามอยู่ใน 2 batches
   - Money-neutral แต่ยังต้อง TX-wrap rollback

### ต้อง เดฟ coord (touches wallet flow)
3. **§5b Auto-commission accrual trigger** — INSERT typed accrual row on `tb_wallet_hs` paid → reps เห็น live "owed" balance

### Pure UI/data (low risk)
4. **§3 PEAK module sub-surfaces 2-5:**
   - 3.2 ✅ AR-aging cockpit (done in §4)
   - 3.3 Period close — wire `accounting_periods` + `period_close_event` (snapshot totals · lock month)
   - 3.4 e-Tax readiness — `tb_forwarder_tax_invoice*` PDF+XML export + RD submit stub
   - 3.5 PEAK/FlowAccount CSV/API export

---

## 🎯 Recommended pickup order (next sitting)

### Tier 1 (low-risk · high-value)
- **§3.3 Period close** — wire month-lock logic for `accounting_periods` (table exists, 0 rows · 1 page + 1 action)
- **§3.5 PEAK export** — CSV/API export of `tb_receipt` + `tb_bill` + `tb_withdraw_comm_*` to PEAK FlowAccount format (read-only · just download)

### Tier 2 (needs ก๊อต/legacy source)
- **§2 + §6 CREATE write sides** — pair-program with ก๊อต on the money-safe contract

### Tier 3 (needs เดฟ coord)
- **§5b auto-accrual trigger** — extend `earn-trigger-tb-user-sales.ts` to fire on `tb_wallet_hs.status='2'` paid (instead of fstatus=7 delivery only)

---

## 🛠 Resume commands (พรุ่งนี้)

```bash
cd /c/Users/Admin/pacred-web/pacred-web
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ควรเป็น 0/0
git log --oneline -10                                          # ดู 6 commits ของวันนี้ + บริบท
cat docs/research/poom-save-point-2026-06-02-sitting-I.md      # this doc
cat docs/briefs/poom-wave-2026-06-01.md                        # ภูม wave brief (still canonical)
# Quick browser-verify all 6 surfaces (admin login required):
#   /admin/commissions                            (§1 · should show real earns/queue · 4,104 row context)
#   /admin/forwarder-sales                        (§1 · sales attribution leaderboard)
#   /admin/accounting/withdraw/comm-sale          (§2 · 25 batches)
#   /admin/accounting/withdraw/comm-interpreter   (§2 · 46 batches)
#   /admin/accounting/ar-aging                    (§4 · 457 outstanding)
#   /admin/forwarders/tran-th                     (§6 · 296 batches)
#   /admin/accounting/documents                   (§3.1 · lifecycle hub)
pnpm dev   # start at port 3000 if not running
```

---

## 🟠 Carry-over manual actions (ภูม)

1. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (still pending many sessions)
2. (Optional) Browser-click-through all 7 new pages on prod after Vercel deploys (~5 min · just spot-check the data renders)

---

## 📝 Lessons captured this sitting (compounding)

- **Next-16 `'use server'` rejects non-async const exports** — even typed arrays crash at module-evaluation (`A "use server" file can only export async functions, found object`). Workaround: keep value-exports inside the module (rename to `_INTERNAL` suffix) + export only the public TYPE. Already documented in `docs/learnings/nextjs-16-quirks.md`; today's df337e0b is a fresh real-world hit. (Original ADR-0026 commit 2602a0da used `WITHDRAWAL_STATUSES` from validators which is fine because it's in a non-'use server' file.)
- **Browser MCP navigation buffering** — sometimes Tab Context shows old URL even after `navigate` because Next streaming hasn't completed. Force-refresh via `key: F5` flushes. Will add to learnings if it recurs.

---

_เซฟงานพอแล้ว ภูม. 6 surfaces live + 1 deferred queue. พรุ่งนี้เจอใหม่._
