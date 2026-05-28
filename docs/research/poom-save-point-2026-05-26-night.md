# 🌙 Poom save-point — 2026-05-26 ค่ำ (mega Wave 20 session)

> ภูม กำลังเปลี่ยน machine (จากที่ทำงาน → ที่บ้าน). อ่านไฟล์นี้ก่อนทุกอย่าง
> เพื่อ continue ได้ทันทีไม่หลุด context.

## TL;DR — 1 บรรทัด

วันนี้ Wave 20 ปิดทั้ง batch · **30+ commits** บน Poom-pacred · ทุกอย่าง browser-verified · พรุ่งนี้ pickup ที่ **Wave 20 P1 batch 2** หรือ **Wave 21 P0 (shop→forwarder auto-spawn)** ตามใจ.

---

## 🎯 Branch state (เช็คก่อน resume)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred  # ต้องเป็น 0/0
git log --oneline -5
```

**Expected HEAD:** `22d5e37` `fix(wave-20 P1): add /admin/forwarders/notes to forwarders top-menubar งาน group`

ถ้า HEAD ต่างจากนี้ = มีคนอื่นเพิ่ม commit (ภูมิจากที่บ้าน?) → merge + เช็ค.

---

## 📦 What landed today (30+ commits · ~3.5K LOC net)

Push range: `2ab967b..22d5e37` on `origin/Poom-pacred`

### Group 1: §0c sprint + bug fixes (morning)
| Commit | Surface |
|---|---|
| `b76e3cb..2ab967b` | §0c codebase audit (548 hits) + codemod (244 files) + ESLint rule `pacred/no-bare-supabase-data-destructure` |
| `ec30a90` | **BUG #1** /admin/customers/PR10899 500 (userimage → userpicture) |
| `3589a2a` | **BUG #2** forwarders 2-block badge port |
| `5c84cfe` + `2bf1b1f` | **BUG #3** /admin/wallet/[id] type-aware deposit-detail view |
| `f83cf7d` | **BUG #4** /admin/wallet/[id] partner-topup slip via paydeposit join |
| `5aeae95` | **P1** /admin/forwarders/[fNo] enhanced detail (timeline + product table) |
| `72aad0a` | **P2** marketplace thumbnails research doc |
| `5f2083d` | **P0 AUDIT** 175 admin pages bucket report |
| `35b74f6` | docs/learnings/pacred-order-taxonomy.md (208 LOC) |
| `4e9d6c7` | qw1 fcover URL rewriter + smart placeholder |
| `9cf775d` | qw2 warehouse-history default 7d filter |

### Group 2: P0 schema swaps (afternoon)
| Commit | Surface | Real prod data |
|---|---|---|
| `a5c81d1` | /admin/customers/[id] → tb_users | PR10899 + 8,898 customers reachable |
| `1a1b8d7` | /admin/accounting hub → tb_* | ฿35M+ cards (was ฿0) |
| `248bf60` | /admin/kpi dashboard → tb_* | ฿6.8M MTD + 8,898 + 21,950 + 47,587 |
| `64577d3` | /admin/accounting + /cargo unified (PEAK chrome) | sidebar lands on dashboard |
| `7feebb1` → `7f32dcb` | forwarders avatar trial + revert per ภูม | 📦 box icon back |
| `562babd` | **BONUS** /admin/service-orders → tb_header_order | 21,950 rows |

### Group 3: Wave 20 P0-4 reports (afternoon-evening)
| Commit | Surface | Real prod data |
|---|---|---|
| `32c1f6b` + `65c3d75` | reports/debtors → tb_wallet + cross-link to credit-pending | 0 + 🎉 |
| `5c6bf7e` | reports/credit-pending + pending-payments → tb_* | 143 + 1,470 |
| `8071a3d` | reports/refunds + monthly-orders → tb_* | 60 + ฿1.8M/฿4.2M/฿2.4M |
| `075921f` | reports/page.tsx hub rewrite → tb_* | 5 tabs (forwarder ฿946K · shop ฿8.3M · yuan ฿29.6M · payment ฿3.9M net) |

### Group 4: Wave 20 P1 batch 1 (evening)
| Commit | Surface | Notes |
|---|---|---|
| `c03c254` | forwarders/notes + customers/transfer-rep | notes bonus schema fix (0 → 500 rows) |
| `3b423c6` | admins + admins/[id] + warehouse-history Tailwind | -411 LOC across 3 files |
| `36ba8bc` | warehouse-history helpers (modal + row-actions) | helpers to match page |
| `0fc0334` | combine-bill + combine-bill/add Tailwind | -428 LOC |
| `5d78be5` + `22d5e37` | wire /admin/forwarders/notes link (ภูม flag) | 2 menubars updated |

---

## 🟢 Verified working pages (20 click-tested via Chrome MCP)

ทุกหน้าเปิดได้ + แสดงข้อมูลจริง (ไม่ใช่แค่ route 200):
1. /admin/accounting (h1 ระบบบัญชี · ฿35M+ cards · PageTopMenubar · cards grid)
2. /admin/accounting/cargo (server redirect → /admin/accounting)
3. /admin/customers/PR10899 (h1 PR10899 · wallet + address + forwarder sections)
4. /admin/customers/transfer-rep (h1 ย้ายเซลล์ · form renders)
5. /admin/kpi (฿6,807,740 + 8,898 + 21,950 + 47,587)
6. /admin/service-orders (h1 ฝากสั่งซื้อ · 200 rows P22305..P22301)
7. /admin/forwarders (📦 box icons + alicdn images on refOrder rows)
8. /admin/forwarders/51971 (status timeline 7 icons · cost breakdown · sale tag)
9. /admin/forwarders/51965 (refOrder row · cover image from alicdn)
10. /admin/forwarders/warehouse-history (h1 + 2 tables · no .pcs-legacy)
11. /admin/forwarders/notes (h1 + 500 rows · no .pcs-legacy)
12. /admin/forwarders/combine-bill (h1 + 997 rows)
13. /admin/forwarders/combine-bill/add (h1 + form)
14. /admin/admins (h1 + 13 admins)
15. /admin/admins/admin_nat (identity + KPI + 4 Wave 21 amber buttons)
16. /admin/reports (5 tabs all populated)
17. /admin/reports/credit-pending (143 rows)
18. /admin/reports/pending-payments (4 rows)
19. /admin/reports/refunds (60 rows)
20. /admin/reports/monthly-orders (฿1.8M+ bars)
21. /admin/reports/debtors (0 + cross-link banner — correct "all clear")
22. /admin/wallet/105410 (type-1 topup · slip)
23. /admin/wallet/105411 (type-4 spend · partner slip from #105410)

---

## 🎯 Pickup สำหรับพรุ่งนี้ (ลำดับแนะนำ)

### Option A — Wave 20 P1 batch 2 (~2-3 ชม · แนะนำ) 🟢
5 หน้าถัดไปจาก audit P1 traffic order:
1. `/admin/wallet/add` — manual topup form
2. `/admin/yuan-payments/new` — manual yuan entry
3. `/admin/reports/payment` — payment ledger
4. `/admin/reports/shop` + `/admin/reports/forwarder`
5. `/admin/service-orders/cart` + `/cart/add`

Dispatch 2-3 agents parallel แบบเดิม. Pattern Already proven (`5c6bf7e`, `0fc0334` precedent).

### Option B — Wave 21 P0 shop→forwarder auto-spawn (~3-4 ชม) 🟠
**Task #106** ใน task list. Spawn chip ready.
- Port legacy `shops.php` L1675-1721
- ลูกค้าจ่ายค่าฝากสั่ง → ระบบ auto-create 1 forwarder per cTrackingNumber
- ตอนนี้ admin ต้องสร้าง manual → biggest backlog impact

### Option C — Browser smoke + verify ที่บ้าน (~30 นาที) 🟢
เปิด `/admin/*` หน้าที่ใช้บ่อยจริงๆ ก่อน เผื่อเจอ bug ที่ Chrome MCP มองไม่เห็น:
- หน้า payment / wallet / forwarders flow ที่ใช้ทุกวัน
- ลอง click row + ลอง bulk action เห็นพฤติกรรมจริง

### Option D — Wave 21 P1 follow-ups (~2 ชม · light) 🟡
- Task #128: admin-profile-client.tsx 7 jQuery modals → native dialog
- combine-bill backend (PDF print · daterangepicker · bulk-select)
- warehouse-history backend (bulk-print · "mark as no-match" action)

---

## 📋 Backlog (tracked tasks)

| # | Status | What |
|---|---|---|
| 106 | pending | 🟠 Wave 20 P0: shop→forwarder auto-spawn |
| 128 | pending | 📋 Wave 21: admin-profile-client jQuery modals |
| — | unsticked | 24 more copy-only pages (~50-70 ชม กระจาย 5-8 sessions) |
| — | Phase C | FCL/LCL column · JMF/GOGO cron · check-sang real Sheets |

---

## ⚠️ Pending ภูม manual actions (อย่าลืม)

1. 🔴 **ROTATE S3 access key** — Dashboard → Project Settings → Storage → S3 Access Keys
   - Key `e913d7da34ca0089638f100afb74c972` leaked วันที่แรก
   - ยังไม่หมุน (carried over from 2026-05-25 night)
2. (Optional) Browser-verify Wave 20 surfaces บน prod ก่อนทำต่อ
3. (Optional) Apply migration `0094_view_sales_by_rep.sql` ถ้ายังไม่ apply

---

## 🛠 Resume commands (พรุ่งนี้)

```bash
# 1. Pull latest
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred  # ต้อง 0/0
cat docs/research/poom-save-point-2026-05-26-night.md   # อ่านไฟล์นี้

# 2. Start dev (ถ้ายังไม่เปิด)
pnpm dev   # port 3000 · auto-reload

# 3. หยิบ pickup option
# A: ลุยต่อ Wave 20 P1 batch 2 (5 pages) — dispatch agents
# B: ลุย Wave 21 P0 (shop→forwarder auto-spawn) — 1 big task
# C: Browser-verify 23 today-shipped pages บน prod ก่อน
```

---

## 🗺 Cross-references

- `docs/audit/admin-pages-audit-2026-05-25-night.md` — 175-page audit (P0/P1/P2 classification)
- `docs/learnings/pacred-order-taxonomy.md` — ฝากสั่ง/ฝากนำเข้า/ฝากโอน relationship (the foundation for Wave 21 auto-spawn)
- `docs/learnings/agent-orchestration.md` — **NEW today** — dual-write + stale base + scope-cut lessons
- `docs/research/marketplace-thumbnails-2026-05-25-night.md` — 1688/taobao API mechanism (URL pointer not scrape)
- `docs/research/poom-save-point-2026-05-25-night.md` — yesterday's save-point (Wave 19 BUG #3 baseline)
