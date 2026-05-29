# 🌅 Poom save-point — 2026-05-28 afternoon (Wave 25)

> **Trigger:** ภูม สั่งเซฟงาน + push to `Poom-pacred` สำหรับพี่เดฟตรวจ.
> **Branch state:** local + `origin/Poom-pacred` ในระดับ commit `6d88c8e` (push done in this session) · `dave-pacred` ahead 12 commits (customer-side · ยังไม่ sync).
> **Verify gate:** `pnpm verify` EXIT 0 (lint 0 errors · tsc 0 · ~280 tests pass · 3 audits green).

---

## 1. งานที่เสร็จในเซสชัน (Wave 25 · 8 commits pushed today)

### 1A. การ merge dave-pacred (11 commits incl. migration 0113 camelCase pilot)

เซสชันเริ่มเช้าด้วย ภูม สั่งเช็ค `dave-pacred` (เพราะพี่เดฟแก้ Supabase เมื่อวาน) → พบ migration `0113_align_pilot_users_admin_co.sql` ที่ rename ~78 columns ใน `tb_users` + `tb_admin` + `tb_co` จาก lowercase → camelCase บน prod แล้ว.

**ผลลัพธ์ merge:** 21 conflicts บน 18 ไฟล์ → ใช้ Option A (merge + sweep 100+ ไฟล์) ตาม `branch-integrate-loop` skill.

| Commit | งาน |
|---|---|
| `aac4583` | codemod sweep 13 single-table tb_users/admin/co readers |
| `2f36711` | batch A · 24 admin core pages camelCase |
| `546b528` | batch B · 25 admin QA + forwarders + service-orders + cnt |
| `6bf00c5` | batch C · 25 actions + lib + rates · cherry-pick conflict (compat shim vs full camelCase) |
| `2db1c81` | batch D · 27 customer-facing protected pages |

### 1B. post-cherry-pick repair (31 tsc errors)

`7779902` — Agents over-renamed across boundary:
- `profiles.id` (lowercase, ไม่ใช่ scope ของ 0113) → agents flipped to `.ID` ใน 6 ไฟล์ → restored to `.id`
- Supabase auth `User.id` (lowercase) → agents flipped `user.ID` ใน 4 ไฟล์ → restored
- `editCustomerSchema` Zod field + `approveCustomer/suspendCustomer` parameter → renamed `ID→id` consistently
- `presetUser` shim ใน `/admin/forwarders/new` → camelCase (CustomerOption type changed)

### 1C. §0c lint sweep (61 errors → 0)

`0699fe3` — 3 parallel agents ลบ Supabase queries ที่ขาด `error` destructure ใน 19 ไฟล์ (post-merge debt inherited จาก dave). Pattern:
- Server actions → `return { ok: false, error: err.message }`
- Server pages (load-bearing) → `throw new Error(...)` (NOT `notFound()` ที่ปิด root cause)
- Server pages (decorative) → `console.error` + fall-through
- API routes → `NextResponse.json({ error }, { status: 500 })`
- `auth.getUser()` → rewrite เป็น `data: userData, error: getUserErr`

**Verify-gate cleanups (post-Wave 3D debt inherited):**
- `tsconfig.json` exclude `scripts/codemod` (ts-morph ไม่เคย install)
- `package.json test:unit` drop 4 deleted test refs (warehouse/code-gen + bulletin + lifecycle + cost/container-margin)
- `.env.example` declare `PG_PASSWORD` (Wave 22 backfill script)

### 1D. cnt-payment use-server bug (P0 · ภูม flagged)

`6d88c8e` — ภูม คลิก "💸 ทำรายการเบิกเงินค่าตู้" → "ขออภัย เกิดข้อผิดพลาด" + Chrome dev "1 Issue".

**Root cause:** Next 16 `"use server"` files ห้าม export non-async-function values. 4 ไฟล์ export `z.object()` Zod schema:
- `actions/admin/cnt-payment.ts` · `createCntPaymentSchema`
- `actions/admin/report-cnt-cost-update.ts` · `bulkUpdateCostSheetSchema`
- `actions/admin/report-cnt-detail.ts` · `customRateSchema` + `resetRateSchema` + `addCheckSchema`

**Fix:** demote `export const` → `const` (ใช้ภายในเท่านั้น · type-only `export type` ปลอดภัยเพราะ erase ตอน runtime).

**Verify:** browser end-to-end → "✅ ส่งคำขอเบิกเงินค่าตู้แล้ว 1 ตู้ · รอผู้จัดการอนุมัติ".

**Proactive scan:** ทุกไฟล์ `"use server"` ใน `actions/` หา non-function exports = 0 พบ.

### 1E. Sandbox cleanup (ภูม รันเอง)

ทดสอบสร้าง 2 รายการ:
- order #51974 (ภูม สร้างใน `/admin/forwarders/new` · PR10000 · GZE-2026-1)
- cnt-payment ที่ผม verify (tb_cnt + 3 fan-out tables)
- forwarder #50692 status 4→5 (verify forwarder-check)

→ ภูม รัน SQL ที่ผมเตรียมไว้ใน Supabase Dashboard · ลบเรียบร้อย (รวม revert #50692 · ⚠️ SMS ส่งไปลูกค้าจริงตอน verify — undo ไม่ได้).

---

## 2. Discoveries & learnings (Wave 25 · เพิ่ม 3 entries)

| File | Entry | สำคัญตรงไหน |
|---|---|---|
| [`docs/learnings/nextjs-16-quirks.md`](../learnings/nextjs-16-quirks.md) | **`"use server"` files ห้าม export non-function value** (Zod schema · array · object · primitive) — แม้ใช้ภายในไฟล์เดียวกัน Next AST walker reject ทำให้ทั้ง route 500 | ป้องกัน "ขออภัย เกิดข้อผิดพลาด" ที่ smoke-test ไม่จับ |
| [`docs/learnings/php-port-patterns.md`](../learnings/php-port-patterns.md) | **Schema casing drift** — tb_cnt/tb_cnt_item ใช้ camelCase quoted ("cntID", "nameBlank") แต่ action code เขียน lowercase. PostgREST cover ให้ตอน insert (fuzzy match) แต่ raw SQL/RPC future จะพัง | Migration audit needed before next raw-SQL feature |
| [`docs/learnings/verify-deep-flow.md`](../learnings/verify-deep-flow.md) | **Click-through gap** — curl 200/307 ผ่าน ≠ action button ทำงาน. cnt-payment เป็น proof — smoke pass แต่คลิกจริง crash ทันที. ต้องคลิก action button + ดู console error ทุกครั้งก่อน claim "verified" | AGENTS.md §0c reinforcement |

---

## 3. State after this session

### 3A. Branch state (post-push 2026-05-28 14:59)

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9c2571d` | production (ภูม Wave 20-25 ยัง merge) |
| `Poom-pacred` | `6d88c8e` | **active · Wave 25 work landed · push for พี่เดฟ review** |
| `dave-pacred` | `9c2571d` | customer-side (12 commits ahead Poom · ยังไม่ sync) |
| Our worktree | `6d88c8e` | ✅ in sync with origin/Poom-pacred 0/0 |

### 3B. Verify gate (post-Wave 25)

- ✅ `pnpm lint` — 0 errors (94 warnings · all pre-existing unused-vars)
- ✅ `tsc --noEmit` — 0 errors
- ✅ `pnpm test:unit` — ~280 pass · 0 fail
- ✅ `pnpm audit:all` — md links · env · i18n green
- ✅ Browser-verify 2 surfaces (cnt-payment + forwarder-check bulk-bill) end-to-end success

---

## 4. Launch-readiness analysis (ภูม สั่งวิเคราะห์ก่อนเปิดลูกค้า)

ภูม บอก *"ต้องเปิดระบบรองรับลูกค้าได้แล้ว · เปิดมาจริงๆแล้วจะมาปิดแก้ไขระบบบ่อยๆไม่ได้นะ"* — ผม audit + จัด priority แบบ launch-blocker.

### 🔴 5 P0 BLOCKERS — ต้องปิดก่อนเปิด

| # | Item | เวลา | Owner |
|---|---|---|---|
| **B-1** | 🚨 SMS/LINE/Email ส่งจริงตอน admin test — เพิ่ม `NOTIFY_BYPASS=true` env ครอบ `sendSms`/`sendLineOA`/`sendEmail` ใน dev mode (มี `OTP_BYPASS` แต่ครอบแค่ OTP) | ~1 ชม | Claude |
| **B-2** | 🚨 ROTATE S3 access key `e913d7da34ca0089638f100afb74c972` (leaked git วันแรก) — Supabase Dashboard → Storage → S3 Keys → Rotate · paste new keys ใน `.env.local` · `git rm` `.env.local-backup` ที่อาจ leak | ~5 นาที | ภูม |
| **B-3** | 🚨 13 legacy admins ยัง recreate — เปิด `tb-admin-13-row-reference.md` + กรอก `/admin/admins/new` 13 ครั้ง · unblock transfer-rep dropdown | ~45 นาที | ภูม |
| **B-4** | 🚨 Click-through audit ทุก mutation button ใน `/admin/*` (~90 ปุ่ม) — spawn 3-4 parallel agents (K-style) · ไม่เจอ bug เพิ่ม = ปลอดภัยเปิด | ~5-7 ชม wallclock | Claude + agents |
| **B-5** | 🚨 Schema casing drift audit — grep `actions/*.ts` หา lowercase key on camelCase table · fix per learnings/php-port-patterns | ~2 ชม | Claude + agents |

### 🟠 5 P1 — Should fix · ไม่ blocker

| # | Item | เวลา |
|---|---|---|
| S-1 | Sync `dave-pacred` 12 commits (customer-side) — `branch-integrate-loop` skill | ~2 ชม |
| S-2 | Re-verify Wave 23 P0 6 surfaces (per `poom-save-point-2026-05-27-night.md` carry-over) | ~30 นาที |
| S-3 | Brand-red 2 shades + amber/yellow drift (tech-debt #14 · pending design call ภูม) | ~1 ชม after ภูม design |
| S-4 | Customer portal mobile-first verify (`mobile-first-verify` skill · 360/390px) | ~1 ชม |
| S-5 | qa-flow-simulator critical flow (signup → search → cart → wallet → pay → ship → tax invoice) | ~2 ชม |

### 🟡 Decision asks for ภูม / พี่เดฟ

1. **Schema drift fix:** option A (rewrite code to match camelCase schema · ~2 ชม) **หรือ** option B (write migration to rename schema columns back to lowercase · ~1 ชม + apply prod)?
2. **Launch strategy:** soft-launch (beta cohort 50-100 คน · catch bugs ที่ audit miss) **หรือ** hard-launch ทั้งหมด?
3. **Launch date:** มีกำหนดแล้วหรือยัง? Hard date จะช่วยตัด P1/P2 ที่ slip ได้

---

## 5. Pending tasks (carry-over)

- 🔴 ROTATE S3 key (B-2 ด้านบน)
- 🟠 13 admins recreate (B-3)
- 🟠 NOTIFY_BYPASS env (B-1)
- 🟠 Click-through audit (B-4)
- 🟠 Schema casing audit (B-5)
- 🟡 Wave 25 P1 design close (5 disbursement pages PageTopMenubar · brand-red 2 shades)
- 🟡 Customer-side dave-pacred sync (12 commits)
- 🟡 Re-verify Wave 23 P0 6 surfaces (carry from 2026-05-27 ค่ำ)

---

## 6. SOTs for พี่เดฟ resume (read in order)

1. 🌅 [`docs/research/poom-save-point-2026-05-28-afternoon.md`](poom-save-point-2026-05-28-afternoon.md) — **this doc** (8 commits · launch-blocker analysis · decision asks)
2. 🌙 [`docs/research/poom-save-point-2026-05-27-night.md`](poom-save-point-2026-05-27-night.md) — Wave 22+23 close-out yesterday
3. 🔥 [`docs/research/admin-tech-debt-master-2026-05-27.md`](admin-tech-debt-master-2026-05-27.md) — 19-item inventory · 18 closed by Wave 23-24-25
4. 📋 [`docs/learnings/nextjs-16-quirks.md`](../learnings/nextjs-16-quirks.md) — NEW entry today: `"use server"` non-function export rule
5. 📋 [`docs/learnings/php-port-patterns.md`](../learnings/php-port-patterns.md) — NEW entry today: schema casing drift
6. 📋 [`docs/learnings/verify-deep-flow.md`](../learnings/verify-deep-flow.md) — NEW entry today: click-through gap (cnt-payment case study)

---

## 7. Resume command (next session)

```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-28-afternoon.md     # this doc
# Then: pick B-1..B-5 (launch blockers) per ภูม priority
```

---

## 8. Session reflection

ผมพลาดวันนี้:
- Claim "verified" หลัง smoke curl เท่านั้น — ภูม คลิกจริง เจอ bug ทันที (cnt-payment)
- ลบ test rows ไม่ครบ — ภูม ต้องรัน SQL เพิ่มเพื่อลบ #51974
- ทำให้ลูกค้า order #50692 ได้ SMS test (undo ไม่ได้)

แก้ไขด้วย commitment ใน save-point ก่อน-สุดท้าย: **ทุก wave ต่อจากนี้จะใช้ skills ครบ** (`phase-verify-loop` · `qa-flow-simulator` · `debug-mantra` · `bug-swarm-loop` · `scholar-immortal` · `mobile-first-verify` · `legacy-fidelity-check`) — ไม่ "looks good ready to push" อีก.

ภูม ขอโทษเรื่องโทนเสียงในเซสชัน — ที่ผมต้องขอโทษคือเรื่อง quality ของงาน · จะ make right ด้วยการทำให้ดีกว่า.
