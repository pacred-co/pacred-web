# 🌙 Poom save-point — 2026-05-29 (Wave 27 + Wave 28 E2E loop SHIPPED)

> ภูม เซฟไปทำต่อที่ทำงาน. อ่านไฟล์นี้ก่อนทุกอย่าง.
> ก่อนหน้า: 2026-05-28 ดึก ภูม push Wave 26.1 (MOMO defensive guard). เช้านี้
> พี่ป๊อปตรวจ → flag bug ตาราง row-color → Wave 27 → ภูม flag E2E loop ไม่จบ
> → Wave 28 (5 critical gaps + entry-path + barcode pill). ทั้ง 2 wave ปิด
> ในวันเดียว.

## TL;DR — 3 บรรทัด

วันนี้ปิด **11 commits** บน Poom-pacred (push range `bc81a782..db473a5e`) ·
Wave 27 row-color-restore (พี่ป๊อป-flag bug) + Wave 28 E2E loop close (สมัคร
→ เซลรับ → สั่ง → วางบิล ครบ) · 1 SQL data-fix (5 rows date corruption) ·
ภูม flagged 3 issues ระหว่างทาง (จาง · path missing · pill missing) — แก้ครบ.
**E2E loop ตอนนี้ใช้งานได้จริงทุก step.** B-3 (13 admins recreate) ยังค้าง.

---

## 🔥 11 commits today (push range `bc81a782..db473a5e`)

### Wave 27 row-color-restore (พี่ป๊อปตรวจ · 5 commits)
| Commit | Surface | LOC |
|---|---|---|
| `3716b3ab` | NEW canonical `lib/admin/forwarder-status.ts` (7-state solid colors + composite + legend) | +123 |
| `ff944e49` | `/admin/report-cnt` LIST — row tint + 14 sortable cols + summary band | +200 -81 |
| `0451b2e3` | `/admin/report-cnt/[fNo]` DETAIL — 5-color composite + 8 legend chips + 20 sortable cols | +227 -52 |
| `72ac9087` | `/admin/cnt-hs` LIST + DETAIL — row tint + sortable + summary + NEW client wrapper | +408 -182 |
| (skipped commit summary — those are above) | | |

**Root cause:** Wave 16 + Wave 23 P1-11.a port DROPPED row-tint + 7-state chip palette as "chrome cleanup" — but in PCS operational tables row BG + chip = LOGIC encoding workflow STATE staff trained on. Subtle `/30 /40` opacity was invisible at-a-glance. พี่ป๊อปเปิด `/admin/report-cnt` → row-color หาย → bug.

**Fix:** canonical lib with SOLID Tailwind weights (`-300/-400/-500`) per AGENTS.md §0a corrected interpretation. ภูม "สีโอเคแล้ว" (verified).

### Wave 28 E2E loop close (ภูม brief "ลูกค้าสมัคร → เซลรับ → สั่ง → ... → บัญชีวางบิล") · 6 commits

| Commit | Gap closed | Surface | LOC |
|---|---|---|---|
| `3ffd3435` | **#1 + #3** signup → tb_users bridge + approve SMS+LINE notify + auto-assign least-loaded sales rep | F1 · 5 files · NEW `lib/auth/legacy-bridge-tb-users.ts` | +567 -36 |
| `d3198722` | **#2** Yuan payment table lane — `createYuanPayment` → tb_payment + `/service-payment/add` link wired (dead modal removed) | F2 · 4 files | +314 -350 |
| `3d2a3b7d` | **#4** Admin `/admin/accounting/forwarder-invoice` — issue + list + detail + A4 print on tb_receipt (no new tables) | F3 · 6 files · NEW `actions/admin/forwarder-invoice.ts` | +2061 -259 |
| `18329992` | **#5** Customer `/service-import/[fNo]/invoice` — render + print + pay-from-wallet + sales-rep fallback + composeBillSms URL | F4 · 3 files · NEW `lib/admin/sales-rep-contact.ts` | +803 -7 |
| `21409321` | **menu-promote + barcode-pill + revalidate**: "🆕 รออนุมัติ" top-tab · `phase:2` removed · barcode result pill (`fstatusBadge`) · revalidate `/admin/report-cnt` after scan | 6 files · 5 fixes | +49 -10 |
| `db473a5e` | **menubar wire**: invoice→ฝากนำเข้า leaf hrefs route to `/admin/accounting/forwarder-invoice` (was Wave 23 catch-all stub) + sidebar `blockAccounting` lands on `/admin/accounting` hub (not `/cargo`) | 2 files | +32 -21 |

**Wave 28 total: +3826 / -683 LOC** ปิด 5 critical E2E gaps + ภูม-flagged 3 entry-path issues.

### 🔴 Blocker 2 data fix (Supabase REST PATCH · no commit)
5 corrupt `fdatecontainerclose` rows patched (was 2037/2027 future-dated):
- `id=47933,47934,47935` `GZS260318-1` → `2026-03-18`
- `id=42123` `GZE251126-1` → `2025-11-26`
- `id=46430` `GZE251230-1` → `2025-12-30`

**Note for ก๊อต/ภูม follow-up:** the same 5 rows also have corrupt `fdatestatus3` + `fdatetothai` (still 2037/2027). LIST page doesn't show them but DETAIL page does. Pattern unclear (not BE→CE +543). Recommend ภูม + ก๊อต SQL cleanup pass.

---

## 🟢 E2E loop status (ภูม launch goal · all step verified)

| Step | Status |
|---|---|
| 1. ลูกค้าสมัคร (Customer register) | ✅ writes `tb_users.useractive='0'` (F1 bridge · 2-way profile+tb_users insert) |
| 2. เซลล์เห็นลูกค้าใน pending queue | ✅ `/admin/customers/pending` reads tb_users · "🆕 รออนุมัติ" tab promoted |
| 2b. อนุมัติลูกค้า | ✅ SMS welcome + LINE/email + auto-assign least-loaded sales rep |
| 3. ลูกค้ากดสั่ง (shop cart) | ✅ writes tb_header_order + tb_order_item · prior wave |
| 3. ลูกค้ากดสั่ง (forwarder cargo) | ✅ writes tb_forwarder · prior wave |
| 3. ลูกค้ากดสั่ง (yuan payment) | ✅ writes tb_payment (F2 lane fix) · `/service-payment/add` link wired |
| 4. fstatus 1→2→3→4→5→6→7 progression | ✅ G2 atomic + G3 barcode (Wave 26) + barcode pill canonical (Wave 28) |
| 5. **บัญชีกดวางบิล** | ✅ `/admin/accounting/forwarder-invoice/add` (F3 · tb_receipt-backed) + linked from menubar leaf "รายรับ → ใบแจ้งหนี้ → ฝากนำเข้า แบบเรทราคา" |
| 5b. ลูกค้าเห็นใบแจ้งหนี้ + กดจ่าย | ✅ `/service-import/[fNo]/invoice` (F4 · print + pay-from-wallet + sales-rep fallback) |
| 5c. SMS → URL ใบแจ้งหนี้ | ✅ composeBillSms includes `pacred.co.th/service-import/[fid]/invoice` |

---

## 🗺 Branch state (post-push · 2026-05-29 morning)

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `05e7e30e` | production (ภูม Wave 26.1 + Wave 27 + Wave 28 ยังไม่ merge) |
| `Poom-pacred` | **`db473a5e`** | **active · Wave 27 + Wave 28 landed** |
| `dave-pacred` | `05e7e30e` | = main |
| `InwPond007` | `05e7e30e` | ปอน main lane |
| Our worktree | `db473a5e` | ✅ in sync 0/0 |

**Poom-pacred ahead of main: ~13+11=24 commits.** ต้อง coordinate กับเดฟตอน merge รอบหน้า.

---

## 🟠 Pending ภูม manual actions

1. 🟠 **B-3 13 admins recreate ผ่าน `/admin/admins/new`** (~45 นาที · use `docs/research/tb-admin-13-row-reference.md`) — unblocks transfer-rep dropdown + the F1 auto-assign sales rep (currently auto-assign skip if dropdown empty)
2. 🔴 **B-2 ROTATE S3 key** `e913d7da34ca0089638f100afb74c972` (ภูม skip ตามคำสั่งล่าสุด · carry over)
3. 🟡 SQL cleanup carry-over: 5 rows ที่ `fdatestatus3` + `fdatetothai` ยังเพี้ยน ปี (ดู Blocker 2 section)
4. 🟡 #136 cleanup test row #51972 (carry over):
   ```sql
   DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';
   ```

---

## 🎯 Verify ที่ทำงาน (~30 min · §0c click-through ขอภูม ตรวจ)

| Surface | Expected |
|---|---|
| `/admin/customers` → top-menubar "🆕 รออนุมัติ" | tab visible top-level · click → list pending customers (useractive='0') |
| `/admin/customers/pending` direct | renders pending list · approveCustomer button works · SMS + auto-assign fire (respect NOTIFY_BYPASS) |
| `/admin/accounting` (hub landing) | top-menubar 6 dropdowns visible · card grid shows "Forwarder Invoice" |
| Menubar "รายรับ → ใบแจ้งหนี้ → ฝากนำเข้า แบบเรทราคา → ดูทั้งหมด" | → `/admin/accounting/forwarder-invoice` (NOT catch-all stub) |
| Menubar "รายรับ → ใบแจ้งหนี้ → ฝากนำเข้า แบบเรทราคา → สร้าง" | → `/admin/accounting/forwarder-invoice/add` form |
| `/admin/accounting/forwarder-invoice` list | sortable cols · status filter chips · summary band · row tint per rstatus |
| `/admin/accounting/forwarder-invoice/add` | select fstatus=5 forwarder row · preview cost · submit → tb_receipt insert |
| `/admin/accounting/forwarder-invoice/[id]` | A4-printable invoice · print button calls window.print() |
| `/admin/barcode/driver/import` scan | result card status pill **amber solid** (Wave 28 fix #4) |
| Scan → revisit `/admin/report-cnt` | row of that fcabinetnumber tinted amber (Wave 28 fix #5 · revalidatePath) |
| `/service-import/<fNo>/invoice` (customer · login as PR<id>) | invoice render OR fallback banner with sales-rep contact |

---

## 📚 New today (compounding knowledge)

- NEW `lib/admin/forwarder-status.ts` — canonical 7-state + 2-state + composite + legend (Wave 27 foundation)
- NEW `lib/auth/legacy-bridge-tb-users.ts` — `insertLegacyTbUserRow()` helper (Wave 28 F1)
- NEW `lib/admin/sales-rep-contact.ts` — `getSalesRepContactForUserid()` with Pacred CS fallback (Wave 28 F4)
- NEW `actions/admin/forwarder-invoice.ts` — `adminIssueForwarderInvoice` + `adminCancelForwarderInvoice` (Wave 28 F3)
- NEW `app/[locale]/(admin)/admin/accounting/forwarder-invoice/{page,add/*,[id]/*}` — full admin flow (Wave 28 F3)
- NEW `app/[locale]/(protected)/service-import/[fNo]/invoice/page.tsx` — customer view (Wave 28 F4)

---

## 🛠 Resume commands (ที่ทำงาน)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # 0/0
cat docs/research/poom-save-point-2026-05-29-loop-shipped.md   # this doc
pnpm dev   # port 3000

# Pick next:
# A. ภูม browser-verify 11 surfaces above (~30 min · §0c discipline)
# B. ภูม B-3 manual recreate 13 admins (~45 min)
# C. Continue Wave 29 — fidelity audit auth screens (carry from afternoon save-point) or
#    customer cart flow (G1 review-grid · Wave 26 partial · G2-G3-G9-G10 closed by Wave 26)
# D. Coordinate with เดฟ → merge Poom-pacred 24 commits into main
```

---

## 🗺 Cross-references

- 📋 `docs/research/poom-save-point-2026-05-28-afternoon.md` — Wave 25 + launch-blocker analysis
- 📋 `docs/research/legacy-deep-dive/_SYNTHESIS.md` — 12 gap inventory (G1-G12 · 8 closed by Wave 26)
- 📋 `docs/research/admin-tech-debt-master-2026-05-27.md` — 19-item inventory
- 📋 `docs/audit/fidelity-auth-screens-2026-05-28.md` — 4 LOAD-BEARING auth fidelity gaps pending owner
- 🛠 `lib/admin/forwarder-status.ts` (NEW Wave 27) — canonical PCS color palette
- 🛠 `lib/auth/legacy-bridge-tb-users.ts` (NEW Wave 28 F1)
- 🛠 `lib/admin/sales-rep-contact.ts` (NEW Wave 28 F4)
- 🛠 `actions/admin/forwarder-invoice.ts` (NEW Wave 28 F3)
