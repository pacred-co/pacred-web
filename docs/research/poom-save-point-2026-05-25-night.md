# 🌙 ภูม save-point — 2026-05-25 ค่ำ (Wave 15-18 ALL DONE · ไปทำต่อที่ทำงาน)

> **อ่านไฟล์นี้ก่อนทุกอย่าง** session ถัดไป. ครอบคลุม: Wave 15 (3 P0 fixes ของวานนี้) ·
> Wave 16 (5 P0 + 3 follow-ups · cargo flow deep audit + UX fix) · Wave 17 (4 P1 ·
> MOMO/CN/Sheets carriers + barcode AJAX) · **Wave 18 (orphan wires + 5/7 cols)** ·
> **Wave 18 follow-up (2 bugs ภูม caught · §0c rule new)** · branch state · resume commands.

**Session tagline:** ภูม catch ผม ตอนทำ fidelity audit ผิว → spawn 4 agents เทียบ deep audit → 5 P0 + 3 follow-ups + UX fix + 4 P1 ทั้งหมด **18 commits** ลง `Poom-pacred`. **Later same evening: ภูม catch ผมอีก — Wave 18 ผมเคลม "clean" แต่ตกหล่น 2 bugs → fix + เขียน §0c rule กันเกิดซ้ำ.**

---

## 🔥 Wave 18 + follow-up (last 4 commits · 2026-05-25 ค่ำ later)

**Wave 18 batch (3 commits · `9a9c0ed..606be13`):**
- `9a9c0ed feat(wave-18)` — 2 orphan wires (`/admin/momo-lcl` + `/admin/cargothai`) + customer 5 fidelity cols (VIP/birthday/LINE/Facebook/main-address) + forwarder 7 fidelity cols (elapsed chip · VIP/SVIP/SaleAdmin badges · ETA range · cabinet-number link · print-status · pallet · 30d window) + password-reset action + dashboard layout fix
- `309de7b fix(admin/dashboard)` — tab strip 1 row ALWAYS (compacted px/gap)
- `606be13 fix(admin/layout)` — `min-w-0 + overflow-x-hidden` on main wrapper (root cause: flex children default `min-width:auto`)

**Wave 18 follow-up (1 commit · `3a278aa` · the ภูม-catch):**
- ผมเคลม "Wave 18 clean · no bugs · no dead flows" หลัง smoke-test routes
- ภูม เปิด `/admin/customers` ที่ทำงาน → ตารางขาด + คลิก eye-icon → 404 → **2 bugs ภายใน 60 วินาที**
- Bug 1: 14-col table overflow ~1583/1676 บน 1920px + Windows Chrome ซ่อน scrollbar default → ภูม ไม่รู้ scrollable. **Fix:** `.scrollbar-x-visible` class (globals.css · always-visible 10px thumb · light+dark) + "เลื่อนซ้าย-ขวา ⇆" hint
- Bug 2: `/admin/customers/PR10899` intermittent 404 — `legacy-view.tsx` L79 destructure แค่ `data` → silent Supabase error → `notFound()`. **Fix:** destructure `error` + log + throw → real error boundary แทน 404 หลอก
- **Process fix:** AGENTS.md §0c new rule "verify-deep-flow protocol" (5-step mandatory click-through · destructure-error-every-supabase-query · explicit verified-vs-not reporting) + `docs/learnings/verify-deep-flow.md` case-study

**Total Wave 18 + follow-up: ~1,700 LOC across ~25 files** · TSC clean · 0 new lint warnings.

---

---

## 📦 Commits today (16:00 → 23:30) — 18 commits on Poom-pacred

```
(close-out) wire deferred LINE in forwarders bulk-update
0138497 merge(wave-17 P1-1+2): MOMO + CN manual entry forms — combined sidebar
8f467dc merge(wave-17 P1-7): barcode/driver/import AJAX wiring
6115a0e feat(wave-17 P1-1+2): MOMO + CN manual entry forms
7966187 feat(wave-17 P1-3..6): api-sheets quartet (CTT/Sang/MK/MX manual entry)
05e72d1 feat(wave-17 P1-7): barcode/driver/import AJAX wiring (+tb_forwarder_import2)
7f5c5b3 fix(wave-17 ux): report-cnt inline checkbox + modal · เบิกเงิน wording
53b073a merge(wave-16 follow-up B): internal cost-update view
b07761a merge(wave-16 follow-up A): provision profiles UUIDs + LINE/email channels
4f4b0ad feat(wave-16 follow-up A): provision UUIDs (8,886 created!)
10723f0 feat(wave-16 follow-up B): cost-update view (no Sheets)
7db9d18 feat(wave-16 follow-up C): dual-mode cost-rate modal
e11435e merge(wave-16 P0-1): /admin/report-cnt/[fNo] per-container detail
5e970df merge(wave-16 P0-4): collapse forwarder-import-warehouse stub
ef24e2c feat(wave-16 P0-1): report-cnt detail (Agent A)
01edff0 feat(wave-16): integrate P0-3 modal + P0-5 barcode schema-split fix
864cf53 feat(wave-16 P0-3): cost-edit modal + actions (Agent C)
ec83886 feat(wave-16 P0-2): forwarder-check bulk-bill queue (Agent B)
c1b9bf9 fix(wave-16 P0-4): collapse stub → warehouse-history (Agent D)
9d76159 docs(wave-16-prep): cargo flow deep audit + plan
152add3 feat(wave-15): 3 P0 fixes (wallet + yuan + forwarders)
```

**Total: ~7,200 LOC added across 50+ files** · tsc + eslint + i18n parity all clean.

---

## ✅ What landed today

### Wave 15 — 3 P0 fidelity fixes
- `/admin/wallet` per-customer balance summary (paradigm fix · was tx-list default)
- `/admin/yuan-payments` 60-day default window + `?all=1` escape
- `/admin/forwarders` ยอดค้างชำระ red-bold column + `lib/forwarder/outstanding.ts`

### Wave 16 deep audit (the ภูม catch)
ภูม saw ผม audit ผิว (compared HTML paste only) — missed 2 huge pages → dispatched 4 parallel agents to enumerate **44 legacy PHP vs ~70 Pacred routes**. Output:
- `docs/audit/cargo-flow-deep-audit-2026-05-25.md` (282 LOC · 47 gaps)
- `docs/learnings/audit-discipline.md` (NEW · 6-step protocol for future fidelity questions)
- `AGENTS.md §0b` (NEW rule · "audit from PHP source, not HTML paste")

### Wave 16 P0 (5 items · ~3,800 LOC)
- **P0-1** `/admin/report-cnt/[fNo]` per-container detail (4 files · 1,601 LOC · cost summary · cost-rate modal · 6 status filters · 25-col DT · bulk-check button)
- **P0-2** `/admin/forwarder-check` bulk-bill-customer queue (3 files · 1,572 LOC · status 4→5 + SMS/LINE/email)
- **P0-3** Inline `<ForwarderCostEditButton>` modal (3 variants · 796 LOC · drop-in for any forwarder row)
- **P0-4** Deleted duplicate `/admin/forwarder-import-warehouse` stub → redirect → `warehouse-history`
- **P0-5** Barcode schema-split fix (`forwarders` REBUILT empty → switched to `tb_forwarder.fstatus` numeric)

### Wave 16 follow-ups (3 items)
- **A** Provisioned **8,886 profiles UUIDs** for tb_users orphans (synthetic `.invalid` email · no welcome emails fired) + wired LINE + email channels in adminCallPriceUser
- **B** Internal "ปรับต้นทุนตู้ใหม่" tab (no Google Sheets) · CSV upload + bulk edit fcosttotalpricesheet
- **C** Dual-mode cost-rate modal (CBM/Weight toggle · works on ALL carriers incl. MX/Sang · uses existing `tb_forwarder.fRefPrice`)

### Wave 17 ux-fix (ภูม catch · flow + wording)
ภูม saw หน้า list ติ๊กไม่ได้ + ปุ่ม submit ใช้คำ "บันทึก" (ผิด — implies fait accompli) → built:
- `cnt-list-table.tsx` — client component, checkboxes per unpaid row on succeed tab
- `cnt-payment-modal.tsx` — in-page modal (legacy AJAX pattern, no navigation)
- Submit button: **"ทำรายการเบิกเงินค่าตู้"** (เบิก = pending approval per cnt-hs.php title)
- `/admin/report-cnt/pay` retired → redirects to home

### Wave 17 P1 (3 items · ~4,613 LOC)
- **P1-1+2** MOMO + CN manual entry forms (shared `<ApiForwarderManualForm>` · carrier-parametrized)
- **P1-3..6** api-sheets quartet (CTT/Sang/MK/MX · shared form · `lib/carrier/registry.ts` · PCSE/PCSF pricing rule found to apply to all 4 not just Sang)
- **P1-7** barcode/driver/import AJAX wiring (port of `barcode-import/index.php` · 376-LOC action · 3-card visual · auto-flip fStatus=4 when fi2Amount >= fAmount)
- **merge** combined sidebar: "อัปเดตฝากนำเข้า" → MOMO + CN + "ปรับรายการ Sheet" sub-group → CTT/Sang/MK/MX

### Close-out
- `actions/admin/forwarders.ts:538` `adminBulkUpdateForwarderTbStatus` — TODO deferred-LINE wired (uses Wave 16 resolver `resolveProfileIdsForLegacyUserids` + sendNotification + try/catch per row)

---

## 🗺 Branch state (post-push · 2026-05-25 ค่ำ)

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production · ปอน frontend landed (-149 vs Poom) |
| **`Poom-pacred`** | **`3a278aa`** | **active · +149 vs main · 22 commits today (18 Wave 15-17 + 4 Wave 18+followup)** |
| `dave-pacred` | `4fe0480` | เดฟ active · pulled 2 new commits today (customer-side D1) |
| `dave` (frozen) · `faithful-port` · `podeng` | various | secondary lanes |
| Our worktree (`claude/adoring-chandrasekhar-0f8ad7`) | sync 0/0 | ✅ pushed |

---

## ⚠️ Pending ภูม manual actions (carry forward)

1. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (leak from 2026-05-24 · Dashboard → Project Settings → Storage → S3 Access Keys)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` if not yet applied
3. (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน

---

## 🟢 Browser-test queue (recommend 30 นาที พรุ่งนี้)

7 หน้าใหม่จาก Wave 15-17 + 5 หน้าจาก Wave 18 (12 total) ที่ควร smoke ก่อน demo:
```
# Wave 15-17 batch
/admin/report-cnt?page=succeed       — ติ๊กตู้ + modal เบิกเงิน
/admin/report-cnt/<fNo>              — per-container detail + cost-edit + cost-update
/admin/forwarder-check               — 3 tabs + bulk-bill button
/admin/api-forwarder-momo/manual     — MOMO manual entry
/admin/api-forwarder-cn/manual       — CargoCenter manual entry
/admin/api-sheets-sang               — Sang carrier (live preview ค่าขนส่ง)
/admin/barcode/driver/import         — USB scanner · auto-flip fStatus=4

# Wave 18 batch (per §0c · click-through MANDATORY · ไม่ใช่แค่ load)
/admin/customers                     — 14 cols · scrollbar visible? · คลิก row → detail 200? · คลิก ResetPwd → toast?
/admin/customers/PR<id>              — load 200 always? (ลอง reload 5 ครั้งกัน intermittent 404)
/admin/forwarders                    — 7 new cols visible? · 30d window default? · ?all=1 escape works?
/admin/momo-lcl                      — page renders? (orphan wired Wave 18)
/admin/cargothai                     — page renders? (orphan wired Wave 18)
```

**🚨 §0c reminder:** สำหรับทุกหน้าด้านบน — ห้ามเคลม "clean" ถ้าแค่ load 200. ต้องคลิก row + action button + วัด table overflow + รายงาน per-surface verified-vs-not. ผมพลาด Wave 18 แบบนี้ — กฎเขียนแล้ว ใช้ไล่ผมได้.

---

## 🟡 Phase C — Defer (P2 backlog)

- `api-forwarder-jmf` (5 sub-pages · token `dZWm4pQI...`)
- `api-forwarder-gogo` (JSON cache + portal link)
- `check-sang-cost` real Google Sheets API (`googleapis` dep needed)
- MOMO/CN/JMF cron jobs (vercel.json)
- `forwarder-driver` standalone bulk-assign page (per-row form already exists in [fNo]/driver-assign-form.tsx)
- CargoCenter `containerReport` sub-page (legacy เอง ยังไม่เคยทำ)

---

## 📋 Resume commands (next session)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git status

# Verify sync (should be 0/0):
git rev-list --left-right --count HEAD...origin/Poom-pacred

# Read save-point + recent audit:
cat docs/research/poom-save-point-2026-05-25-night.md
cat docs/audit/cargo-flow-deep-audit-2026-05-25.md

# OPTIONS for next session:
# A. Browser-test 7 surfaces above (30 min)
# B. Phase C planning — JMF API integration (token + retry design)
# C. Address any new ภูม-flagged issues
```

### Safety reminders
- Push: `git push origin HEAD:Poom-pacred` (worktree branch = claude/adoring-* · push target = Poom-pacred)
- **อย่า merge dave-pacred เข้า Poom-pacred** — parallel lanes ภูม vs เดฟ
- Save-points only: ก่อนนอน · เปลี่ยนเครื่อง · จบ big batch

---

## 📚 Related docs

- 🚨 [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](../audit/cargo-flow-deep-audit-2026-05-25.md) — full 47-gap report
- 🛠 [`docs/learnings/audit-discipline.md`](../learnings/audit-discipline.md) — the lesson + 6-step protocol (audit from source)
- 🆕 [`docs/learnings/verify-deep-flow.md`](../learnings/verify-deep-flow.md) — **NEW** Wave 18 follow-up · 2-bug case-study + 5-step click-through protocol + safe Supabase destructure pattern + visible-scrollbar pattern
- 📝 [`docs/research/poom-save-point-2026-05-24-night.md`](poom-save-point-2026-05-24-night.md) — yesterday's context (Wave 14)
- 🧭 [`AGENTS.md`](../../AGENTS.md) §0b — deep-audit-from-source rule
- 🧭 [`AGENTS.md`](../../AGENTS.md) §0c — **NEW** verify-deep-flow rule (click row · destructure error · explicit verified-vs-not)
- 📋 [`docs/audit/fidelity-gap-2026-05-24.md`](../audit/fidelity-gap-2026-05-24.md) — Wave 14 47-gap (still relevant for non-cargo modules)
