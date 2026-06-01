# Save-point — sitting-I (poom-wave-2026-06-01 lane) · 2026-06-02

> **Purpose:** ปิดวัน · ส่งต่อให้พรุ่งนี้. งานที่ landed ใน 1 sitting + remaining queue + resume commands.
>
> **Branch state:** `Poom-pacred = c128a7ae` · synced กับ origin · was at `55ec389b` ตอนเริ่ม session
>
> **Total:** **11 commits today** (initial 6 features + 1 save-point + 2 menubar fixes + 1 PEAK CSV export + this final save-point update)

---

## 🎯 11 commits ที่ landed วันนี้ (range `55ec389b..c128a7ae`)

| # | SHA | Brief task | งาน |
|---|---|---|---|
| 1 | `2602a0da` | **§1 + §5a** | Potemkin commission repoint (`/admin/commissions` + `/admin/forwarder-sales`) → `tb_user_sales*` + `tb_sales_report` + ADR-0026 SOT lock |
| 2 | `101e75dc` | **§2 MVP** | Batch payouts read-only — 25 sale + 46 interpreter batches via `/admin/accounting/withdraw/comm-{sale,interpreter}/` |
| 3 | `5b6cbc0a` | **§4** | AR-aging cockpit — 457 ลูกหนี้ค้างชำระ buckets 0-30/30-60/60-90/90+ |
| 4 | `df337e0b` | §4 fix | Next-16 'use server' rejects non-async const export — internal-only `AGING_BUCKETS_INTERNAL` |
| 5 | `5494acda` | **§6 MVP** | TH-transport batches read-only — 296 historical batches · 643 forwarders + sidebar leaf + th/en i18n |
| 6 | `afa15f1c` | **§3.1** | PEAK Documents Lifecycle hub — 5-stage chain (quote→invoice→receipt→tax→credit/debit) · honest "🚧 Phase-C" stubs |
| 7 | `323ee03c` | docs | Initial save-point sitting-I close-out |
| 8 | `71c72624` | sitting-I-fix #1 | menubar cascade-trap fix attempt #1 + wire 4 orphan pages into CARGO_MENUBAR (รายจ่าย + การบัญชี) |
| 9 | `459f5984` | sitting-I-fix #2 | menubar fix attempt #2 — depth-gate `group-hover` (L1 hover-open · L2+ click-only state) ← **THE working fix** |
| 10 | `c128a7ae` | **§3.5** | PEAK / FlowAccount CSV export hub — 4 datasets · date range · download buttons |
| 11 | (this commit) | docs | Save-point doc rev — sitting-I close-out v2 |

**Net diff:** ~+3,500 LOC across 23 files (5 actions + 9 pages + menubar component + 2 docs + i18n/sidebar)

---

## ✅ ภูม brief priority matrix (poom-wave-2026-06-01.md) — UPDATED

| # | Task | Eff | Pri | Status |
|---|---|---|---|---|
| **1** | Potemkin commission repoint | M | **P0** | ✅ shipped 2602a0da |
| **5a** | Commission-SOT ADR | S | **P0** | ✅ shipped 2602a0da (ADR-0026) |
| **2** | Batch payouts port | L | P1 | 🟡 MVP read-only · ⚠️ CREATE+PAY write side defer (ก๊อต co-sign) |
| **3** | PEAK module (5 sub-surfaces) | L | P1 | 🟡 **3/5 done** · §3.1 lifecycle hub ✅ · §3.2 AR-aging = §4 ✅ · §3.3 period close ✅ (already shipped V-E9) · §3.4 e-Tax · §3.5 PEAK export ✅ |
| **4** | AR-aging cockpit | M | P1 | ✅ shipped 5b6cbc0a |
| **5b** | Auto-commission accrual trigger | M | P1 | ⏸ defer (touches wallet flow · เดฟ coord) |
| **6** | TH-transport grouping | M | P1 | 🟡 MVP read-only · ⚠️ CREATE write side defer |

**Coverage:** 3 fully done · 3 MVP-shipped (write side deferred) · **§3 sub-surfaces 4/5 done** (only §3.4 e-Tax remains)

---

## 🐛 Bug fixes shipped today (ภูม flagged)

### Bug #1 — Submenu Panel cascade trap
- **Symptom:** Hover ใบลดหนี้ but submenu of ฝากนำเข้า appeared instead · "เป็นหลายอัน" (multiple panels stacked)
- **Root cause:** CSS `group-hover:block` on L2+ DropdownPanel cascaded from L1 TopItem's `group` class → ALL L2 panels visible simultaneously when L1 opened
- **Fix (459f5984):** Depth-gate visibility class:
  - L1 (depth=1) → `hidden group-hover:block` (CSS hover, unchanged)
  - L2+ (depth≥2) → only `hidden`/`block` via state-controlled `isPinned` from parent's `activeChildIdx` (no CSS hover)
- **Also:** Added `DropdownPanelWithActiveChild` helper that owns per-level activeChildIdx · `onMouseEnter` triggers `onActivate` → sibling auto-deactivates
- **Browser-verified:** Single panel per cascade level · ใบลดหนี้ hover shows ONLY ใบลดหนี้'s 4 services

### Bug #2 — Orphan pages with no nav entry
- **Symptom:** ภูม "หาทางเข้า /admin/accounting/documents + /ar-aging ไม่เจอ"
- **Root cause:** I added pages to `ACCOUNTING_HUB_CARDS` (hub-page cards) but FORGOT CARGO_MENUBAR top-bar leaves · ภูม had no breadcrumb · AGENTS.md §0d nav-in-same-diff violation
- **Fix (71c72624 + c128a7ae):** Wired 5 nav entries into CARGO_MENUBAR:
  - **รายจ่าย** + เบิกค่าคอม Sales (batch) + เบิกค่าคอมล่าม (batch)
  - **การบัญชี** + เอกสารบัญชี (Lifecycle) + ลูกหนี้ค้างชำระ + ส่งออก CSV (PEAK/FlowAccount)

---

## ⏸ Write-side deferred queue (ต้อง coord)

### ต้อง ก๊อต co-sign (money-safe)
1. **§2 CREATE batch + PAY slip** for `tb_withdraw_comm_{sale,interpreter}_*`
2. **§6 CREATE batch** for `tb_forwarder_tran_th_h/_sub` (money-neutral, multi-row selector)

### ต้อง เดฟ coord (touches wallet flow)
3. **§5b Auto-commission accrual trigger** — INSERT typed accrual row on `tb_wallet_hs` paid

### Brief §3 remaining
4. **§3.4 e-Tax XML/PDF export** — `tb_forwarder_tax_invoice*` RD Code 86 XML + PDF + submit-to-RD stub (L · needs RD format spec)

---

## 🎯 Recommended pickup order (next sitting)

### Tier 1 (low-risk · ship-able solo)
- **§3.4 e-Tax XML/PDF** — list issued tax-invoices · CSV bundle in RD-86 column shape · XML generation per Code 86 schema · submit-to-RD stub workflow

### Tier 2 (needs ก๊อต/legacy source)
- **§2 + §6 CREATE write sides** — pair with ก๊อต on money-safe contract (server-recompute · dedup-guard · status-guard against double-pay)

### Tier 3 (needs เดฟ coord)
- **§5b auto-accrual trigger** — extend earn-trigger to fire on tb_wallet_hs.status='2' (instead of fstatus=7 only)

---

## 🛠 Resume commands (พรุ่งนี้)

```bash
cd /c/Users/Admin/pacred-web/pacred-web
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ควรเป็น 0/0
git log --oneline -15                                          # ดู 11 commits ของวันนี้
cat docs/research/poom-save-point-2026-06-02-sitting-I.md      # this doc
cat docs/briefs/poom-wave-2026-06-01.md                        # ภูม wave brief (still canonical)

# Quick browser-verify all 8 new/updated surfaces (admin login required):
#   /admin/commissions                            (§1 · 4,104 earns context · 999 THADA.VIP visible)
#   /admin/forwarder-sales                        (§1 · sales attribution leaderboard)
#   /admin/accounting/withdraw/comm-sale          (§2 · 25 batches)
#   /admin/accounting/withdraw/comm-interpreter   (§2 · 46 batches)
#   /admin/accounting/ar-aging                    (§4 · 457 outstanding)
#   /admin/forwarders/tran-th                     (§6 · 296 batches)
#   /admin/accounting/documents                   (§3.1 · lifecycle hub)
#   /admin/accounting/peak-export                 (§3.5 · 4 CSV downloads NEW)

# Menubar verify (after sitting-I-fix 459f5984):
#   Hover รายรับ → ใบลดหนี้ → submenu ของ ใบลดหนี้ คนเดียว (no cascade)
#   Hover รายจ่าย → เบิกค่าคอม Sales/ล่าม (batch) visible
#   Hover การบัญชี → เอกสารบัญชี + AR Aging + ส่งออก CSV visible

pnpm dev   # port 3000 if not running
```

---

## 🟠 Carry-over manual actions (ภูม)

1. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (still pending many sessions)
2. (Optional) Browser-click-through all 8 new pages on prod after Vercel deploys (~5 min · just spot-check the data renders + dropdowns work)

---

## 📝 Lessons captured this sitting (compounding)

- **Next-16 `'use server'` rejects non-async const exports** — even typed arrays crash at module-evaluation. Workaround: rename to `_INTERNAL` suffix · export only the public TYPE. (docs/learnings/nextjs-16-quirks.md updated · today's df337e0b is fresh real-world hit.)
- **AGENTS.md §0d reachability = nav entry SAME diff** — adding ACCOUNTING_HUB_CARDS card alone isn't enough; the CARGO_MENUBAR top-bar leaves are the canonical nav surface. ภูม flagged this · I had to retro-wire 5 entries. Next time: check BOTH sidebar AND CARGO_MENUBAR before shipping a new admin page.
- **Menubar `group-hover` cascade trap** — at L2+ depth, CSS `group-hover:block` inherits from L1 TopItem's `group` class · ALL siblings open simultaneously. Fix: depth-gate the className. L1 can use CSS hover · L2+ MUST use JS state-controlled visibility coordinated by parent. Pattern: `DropdownPanelWithActiveChild` owns `activeChildIdx` per level · `onMouseEnter` on child <li> → activates that one + deactivates siblings.

---

_เซฟงานพอแล้ว ภูม. 8 surfaces live (+ 2 bug fixes verified in browser). 1 brief task (§3.4 e-Tax) remains in PEAK module. พรุ่งนี้เจอใหม่._
