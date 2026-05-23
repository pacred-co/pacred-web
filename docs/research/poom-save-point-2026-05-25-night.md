# 🌙 ภูม save-point — 2026-05-25 ค่ำ (Wave 15 done · Wave 16 prep · ภูมสั่ง deep audit)

> **อ่านไฟล์นี้ก่อนทุกอย่าง** session ถัดไป. ครอบคลุม: Wave 15 (3 P0 fixes ของวานนี้) · Wave 16 prep (deep audit Cargo flow + plan 8 tasks) · branch state · resume commands

---

## 🚨 Session highlight — ภูม catch + deep audit ที่ใหญ่กว่า fidelity audit เดิม

วันนี้ ภูม catch ผมว่า fidelity audit ที่ภูมส่งมาเช้านี้ **audit ผิวเกินไป** — comparison แค่จาก HTML ที่ภูม paste มาให้ดู ไม่ได้เปิด legacy PHP source จริง. ผมพลาด 2 หน้าใหญ่:
- `report-cnt.php?id=<container>` (mode-b · 2502 LOC · per-container drill-down + cost edit modal + 6 status filter chips + 25-col DT + bulk-check submit)
- `forwarder-check.php` (728 LOC · 3 tabs ทั้งหมด/เครดิต/ปกติ + bulk "แจ้งชำระเงินลูกค้า" button — เป็น revenue-pipeline crucial)

ภูมเลยสั่ง: **"ไล่ deep audit เพิ่มด่วนเลย อยากส่งงานแล้วโดน Owner ไล่กลับบ้านหรือไง"**

ผมเลย dispatch 4 parallel agents — 2 enumerate legacy PHP (`pcs-admin/forwarder*.php` + `report-cnt*.php` + `cnt-hs*.php` + `forwarder-action.php` + `api-forwarder-*.php` + `barcode-*.php`), 2 enumerate Pacred Next.js. ออกมาเป็น **44 ไฟล์ legacy vs ~70 Pacred routes**. Audit doc → [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](../audit/cargo-flow-deep-audit-2026-05-25.md).

---

## 📦 Wave 15 (วานนี้ เช้านี้) — 1 commit `152add3` บน `Poom-pacred`

`feat(wave-15): Top 3 P0 fixes from fidelity audit (wallet + yuan + forwarders)`

3 P0 fixes ตาม fidelity-gap-2026-05-24:
1. **`/admin/wallet`** — per-customer balance summary view (default) + tab dispatcher (`?view=balance|tx`); paradigm fix ตาม legacy
2. **`/admin/yuan-payments`** — default 60-day date window + `?all=1` escape hatch + date inputs + status chip
3. **`/admin/forwarders`** — ยอดค้างชำระ red-bold column + weight/CBM/วัด stack; `lib/forwarder/outstanding.ts` port of `calPriceForwarderMain()`

Browser-verified ทั้ง 3 fix บน localhost ก่อนรายงาน. ภูม ack แล้ว.

---

## 🗺 Branch state map (วันนี้ post-fetch)

| Branch | HEAD | vs main | vs Poom-pacred | สถานะ |
|---|---|---|---|---|
| `main` | `9d8467b` (3D glossy buttons) | — | -127 | production · ปอน frontend landed |
| `Poom-pacred` | `152add3` (Wave 15) | +127 | — | **active · ภูม admin port** |
| `dave-pacred` | `26cf183` (/service-import tidy) | +40 | +12, -99 | **active · เดฟ customer port** |
| `dave` | (frozen) | (old V3) | — | V3 lane FROZEN per 2026-05-19 pivot |
| `podeng` | `9d8467b` | (= main) | — | ปอน landing/SEO · merged |
| `faithful-port` | `e8a0ba0` | — | — | customer 12/24 transcription |
| `hotfix/auth-unblock` | `3912ad2` | (old) | — | superseded |
| `claude/*` worktrees (7) | various | — | mostly stale | mine = `adoring-chandrasekhar-0f8ad7` ✅ sync |

**dave-pacred 12 commits ที่ Poom-pacred ไม่มี:** ทั้งหมด customer-side D1 (`/service-import/[fNo]` tidy, `/cart` end-to-end, OTP TTL 5→15min, SMS routing fixes, forwarder bulk-payment modal, PromptPay QR fix). **ไม่ต้อง merge เข้า Poom-pacred** — parallel lanes per `docs/runbook/faithful-port-plan.md`.

**Our worktree:** HEAD = 152add3 = same as origin/Poom-pacred. 0 ahead, 0 behind. 

---

## 🎯 Wave 16 plan — 5 P0 + 3 P1 (Tasks #76-83 ใน TaskList)

### 🔴 P0 — Owner-blocking (~10 ชม รวม · 1 day)

| # | งาน | Legacy ref | LOC | เวลา |
|---|---|---|---|---|
| **P0-1** | `/admin/report-cnt/[fNo]/page.tsx` per-container detail (summary card · cost-edit modal · 6 status filters · 25-col DT · bulk-check) | `report-cnt.php?id=` mode-b | 2502 | 2-3 ชม |
| **P0-2** | `/admin/forwarder-check/page.tsx` (3 tabs · bulk "แจ้งชำระเงินลูกค้า" → SMS+LINE+email · status 4→5) | `forwarder-check.php` | 728 | 2 ชม |
| **P0-3** | Inline cost-edit modal (editCost / editCost2 from S / editCostSheet) | `include/pages/report-cnt/editForm.php` | 69 | 45 นาที |
| **P0-4** | DELETE 89-LOC stub `/admin/forwarder-import-warehouse` → redirect → `/admin/forwarders/warehouse-history` (1140 LOC faithful) | duplicate | — | 15 นาที |
| **P0-5** | Schema-split fix — barcode gateway query `forwarders` vs `tb_forwarder` | — | — | 1 ชม |

### 🟠 P1 — Workflow + revenue (~12-15 ชม · 1.5 days)

| # | งาน | LOC | เวลา |
|---|---|---|---|
| **P1-1+2** | MOMO + CN manual-entry forms (defer API call sub-pages) | 1070 | 3 ชม |
| **P1-3..6** | api-sheets quartet (CTT/Sang/MK/MX — ⚠️ ชื่อหลอก เป็น carrier entry forms) | 5230 | 6 ชม |
| **P1-7** | Finish `barcode/driver/import` AJAX wiring | 236 | 1.5 ชม |

### 🟡 P2 — Defer Phase C

JMF/GOGO API · Sheets real API (check-sang-cost) · MOMO/CN/JMF cron jobs · standalone forwarder-driver · MOMO Sack API · CargoCenter containerReport (legacy ยังไม่เคยทำ).

---

## 🔐 Security flags ติดมาจาก audit

1. **API tokens hardcoded plaintext** ใน legacy: TTP `a807f4fe...`, CN `aea07c4d...`, JMF `dZWm4pQI...3JFu`. Port → env vars เมื่อ Phase C
2. **Legacy api-forwarder + barcode = cookie check เฉยๆ** (ไม่มี `departmentKey` gate). Pacred port ต้องใส่ `requireAdmin([...])` ทุกหน้า
3. **S3 leak จาก 2026-05-24** ยังไม่ rotate — Dashboard → Project Settings → Storage → S3 Access Keys (key `e913d7da34ca0089638f100afb74c972`)

---

## 📋 Resume commands พรุ่งนี้

```bash
# 1. Sync
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git status
git log --oneline -5

# 2. Confirm we're on Poom-pacred-tracking branch + up-to-date
git rev-parse --abbrev-ref HEAD                # = claude/adoring-chandrasekhar-0f8ad7
git rev-list --left-right --count HEAD...origin/Poom-pacred   # both 0 = synced

# 3. (Optional) Re-read this save-point + the audit
cat docs/research/poom-save-point-2026-05-25-night.md
cat docs/audit/cargo-flow-deep-audit-2026-05-25.md

# 4. Open next P0 task
# Task #76 (Wave 16 P0-1) is recommended start — biggest payoff
```

### 🛡 Safety reminders

- Push ไป Poom-pacred ผ่าน refspec: `git push origin HEAD:Poom-pacred` (worktree branch = claude/adoring-chandrasekhar-0f8ad7 · push target = Poom-pacred)
- **อย่า merge dave-pacred เข้า Poom-pacred** — parallel lanes ภูม vs เดฟ. คนละ scope.
- Save-point only: ก่อนนอน · เปลี่ยนเครื่อง · จบ big batch (per `push_frequency_strict` memory)

---

## 📚 Related docs

- 🚨 [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](../audit/cargo-flow-deep-audit-2026-05-25.md) — full Wave 16 gap report
- 📋 [`docs/audit/fidelity-gap-2026-05-24.md`](../audit/fidelity-gap-2026-05-24.md) — Wave 14 47-gap audit (still valid)
- 📝 [`docs/research/poom-save-point-2026-05-24-night.md`](poom-save-point-2026-05-24-night.md) — วานนี้ context (Wave 14)
- 🧭 [`AGENTS.md`](../../AGENTS.md) §0b (new) — deep-audit-from-source rule
- 🛠 [`docs/learnings/audit-discipline.md`](../learnings/audit-discipline.md) (new) — lesson: don't claim faithful from HTML paste
