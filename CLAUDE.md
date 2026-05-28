@AGENTS.md

---

# 🌃 2026-05-28 ดึก — NEW BRANCH MODEL + ปอน MOMO LANDED · read FIRST (supersedes 2026-05-28 ค่ำ below)

เดฟ session **ดึกวันนี้** — พี่เดฟอัพเดท branch ownership ใหม่ + ปอน push งาน MOMO API + TAMIT เสร็จเข้า podeng → เดฟ merge เข้า main + apply migration 0116 + sync InwPond007 ให้ตรง main.

**🗺 BRANCH OWNERSHIP ใหม่ (2026-05-28 ดึก — read FIRST):**

| Branch | คน | งาน |
|---|---|---|
| `main` | (ก๊อต/เดฟ gates) | production · Vercel auto-deploy |
| `dave-pacred` | **เดฟ** | integrator → main (= main ตลอด) |
| `InwPond007` | **ปอน หลัก** | website + customer member back-office · **ปอน main lane** |
| `podeng` | **ปอน sub-task** | งาน MOMO API (เสร็จแล้ว · จะกลับมาทำ InwPond007 ต่อ) |
| `Poom-pacred` | **ภูม** | admin lane · V3 enhancements |

**📦 3 commits ดึกนี้ (push range `7a4a449d..05e7e30e` on main):**

| Commit | งาน | Source |
|---|---|---|
| `91ddb369` | merge `origin/podeng` — ปอน MOMO + TAMIT (resolved 2 §0c conflicts in tracking-page.tsx) | ปอน → เดฟ |
| `05e7e30e` | apply-pilot-migration.mjs → point at 0116 | เดฟ |
| (migration `0116_momo_isolated_tables.sql` applied to prod in 152ms) | 4 NEW isolated tables · NO legacy touch | ปอน |

**🟢 ปอน's MOMO Admin Sync — landed + applied to prod:**
- `supabase/migrations/0116_momo_isolated_tables.sql` — 4 new tables (`momo_import_tracks` + `momo_container_closed` + `momo_sack_infos` + `momo_sync_logs`) · service_role-only RLS · NO FK to legacy · **applied to prod 2026-05-28 ดึก (152ms)**
- `lib/integrations/momo-isolated/` — parallel client (NOT touching existing `momo-jmf/`) · 14 statuses × 3 phases · real-API verified live
- `app/[locale]/(admin)/admin/api-forwarder-momo/sync/` — admin page · date range + sack lookup + 5 buttons + preview + DB snapshot + counter dashboard
- `/api/admin/momo/{import-track,container-closed,sack-info,sync-preview,sync}` — admin-gated proxies
- 14 new files / +2234 LOC · entirely isolated (zero risk to revenue path)

**🟢 ปอน's TAMIT URL paste + SearchBar fix:**
- SearchBar wrapped in `<form action="/search" method="GET">` — Enter + submit work now
- `/service-import/table` legacy header restyle (matches legacy PCS · pink→orange gradient · 9 status pills)
- `/search?url=…` MODE A URL-paste wired (best-effort — TAMIT vendor was down at push time)

**🗺 Branch state (post-push · 2026-05-28 ดึก):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `05e7e30e` | **production · all today's work landed** |
| `dave-pacred` | `05e7e30e` | = main |
| `InwPond007` | `05e7e30e` | **force-synced to main** (ปอน's primary lane · clean base for next sprint) |
| `podeng` | `d3898012` | 2 commits behind (cosmetic — sub-task done, can be deleted or kept for ref) |
| `Poom-pacred` | `123a3409` | **13 commits behind** — ภูม ต้อง `git pull origin main` ก่อนงานใหม่ |

**📋 สรุปงานต่อให้แต่ละคน (next-steps brief):**

### 🟢 ปอน (lead: InwPond007)
- ✅ งาน MOMO เสร็จแล้ว · landed บน main · prod applied
- ✅ InwPond007 sync = main แล้ว — clean base
- ▶️ ขั้นต่อไป: กลับมาทำ InwPond007 ตามที่บอก (website + customer member back-office)
- 🟡 Pending verify: click-test `/admin/api-forwarder-momo/sync` ที่ prod หลัง Vercel rebuild (~3 นาที)
- 🛠 Resume:
  ```bash
  cd <your-pacred-clone>
  git checkout InwPond007
  git pull origin InwPond007    # = main, includes MOMO + ภูม wave-25 + เดฟ surgical merges
  ```

### 🟢 ภูม (lead: Poom-pacred)
- ✅ Wave-25 #194-#196 ของ ภูม ถูก surgical-merge เข้า main เรียบร้อย (per `docs/audit/poom-wave-25-merge-audit-2026-05-28.md`)
- 🟠 Poom-pacred ตามหลัง main **13 commits** — pull ก่อนงานใหม่:
  ```bash
  git checkout Poom-pacred
  git pull origin main          # absorb เดฟ's batch 2a + ปอน's MOMO + ปอน's LCL + fidelity fixes
  git push origin Poom-pacred   # publish
  ```
- ▶️ ขั้นต่อไป (จาก ภูม's afternoon save-point):
  - **B-1** NOTIFY_BYPASS env (1 ชม)
  - **B-2** 🔴 ROTATE S3 key (5 นาที · ภูม) — carry-over
  - **B-3** 13 legacy admins recreate via `/admin/admins/new` (45 นาที · ภูม)
  - **B-4** Click-through audit ทุก mutation button (~90 ปุ่ม · 5-7 ชม)
  - **B-5** Schema casing drift decision (Option A camelCase vs B revert · ~2 ชม)
- 🟡 Heads-up: เดฟ pick Option A (camelCase) เพราะตรงกับ ก๊อต spec. tb_forwarder family (~177 renames) เป็นงาน batch 2b ที่รอ — ทำ page-by-page ดีกว่า big-bang

### 🟢 เดฟ (lead: dave-pacred → main)
- ✅ Integrator role done · all 3 lanes merged · build + lint green
- ▶️ ขั้นต่อไป:
  - Coordinate ก๊อต API switchover (PCS/TTP brand split per `docs/runbook/pcs-scrub-plan.md`)
  - Pick up next camelCase batch (tb_forwarder ↑ or smaller — wallet/payment family ~60 renames)
  - 4 LOAD-BEARING fidelity gaps (owner-decide)

**🎯 SOTs for next session — read in order:**
1. 🌃 **THIS top section** — new branch model + ปอน MOMO landed
2. 🌙 `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` — surgical-merge playbook (reference for future ภูม pulls)
3. 📋 `docs/audit/fidelity-auth-screens-2026-05-28.md` — 4 LOAD-BEARING fidelity gaps pending owner
4. 🌅 `docs/research/poom-save-point-2026-05-28-afternoon.md` — ภูม's 5 launch-blockers + decision asks

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/main   # should be 0/0
head -100 CLAUDE.md                                    # this top section
# Pick from per-developer "ขั้นต่อไป" above
```

---

# 🌙 2026-05-28 ค่ำ — INTEGRATION COMPLETE (mid-session · superseded by ดึก above)

เดฟ session **ค่ำวันนี้** — รับงาน ภูม (Wave 25 #194-#196) + ปอน (LCL tracking pages c6ca71fb) มา **surgical-merge เข้า main** หลังจากปอน flag "หน้าของผมหายไปไหนหมด" + ภูม push 9 commits ใหม่ที่เดฟยังไม่ได้ merge.

**📦 12 commits today (push range `227231a2..337183d5` on main):**

| Commit | งาน | Source |
|---|---|---|
| `1845fff2` | jQuery load-order fix (legacy chrome) | เดฟ |
| `125369a0` | register mobile + error-visibility fix | เดฟ |
| `7a4a4750` | register juristic parallel uploads + progress | เดฟ |
| `a8af737d` | register hard-nav post-signup | เดฟ |
| `54c7b22d` | camelCase **batch 2a** (`tb_cnt + tb_cnt_item + tb_check_forwarder` = 19 renames · migration 0115 applied prod) | เดฟ |
| `d5f46290` | /login fidelity + protected-CSS prefetch-leak fix | เดฟ |
| `9c2571da` | docs: prefetch-leak learning | เดฟ |
| `227231a2` | §0c lint sweep (20 files) | เดฟ |
| `51a7f408` | **🟢 ปอน LCL tracking restore** — cherry-pick `c6ca71fb` (9 files / 1243 lines · /service-import/{truck,sea,air} + _tracking/*) | ปอน → เดฟ |
| `61a87bff..341466ff` | **🟢 ภูม wave-25 surgical merge** — 9 cherry-picks (#194 codemod + 4 batches + post-fix + #195 lint + #196 Zod demote + close-out) | ภูม → เดฟ |
| `337183d5` | lint §0c fix on ปอน's tracking-page.tsx | เดฟ |

**🟢 ที่ทำได้ในรอบนี้:**
1. **ปอน restore** — Audit agent ยืนยัน 1 commit / 9 ไฟล์ / byte-identical กับ podeng. รากปัญหา: ปอน commit ทั้ง `podeng` + `InwPond007` ในวันเดียว แต่เดฟ merge แค่ InwPond007 (commit `80528602`)
2. **ภูม wave-25 surgical merge** — Audit doc `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` ระบุ 20 HARD conflicts + ภูม 1 bug (`adminConvertToJuristic` `.eq("ID", ...)`). ใช้ Option A surgical cherry-pick → ปกป้องทั้ง batch 2a camelCase + ภูม's wave-25 sweep + เดฟ's prefetch leak fix + เดฟ's fidelity work
3. **Build + lint green** — `pnpm build` (Turbopack) + `pnpm lint` 0 errors, 94 warnings (CI ยอม)

**🟢 Schema state (prod Supabase yzljakczhwrpbxflnmco):**
- Batch 1 (2026-05-27): `tb_users` + `tb_admin` + `tb_co` = 80 renames camelCase
- Batch 2a (2026-05-28): `tb_cnt` + `tb_cnt_item` + `tb_check_forwarder` = 19 renames camelCase
- Total renamed: **99 columns** across 6 tables. **102 tables / ~897 renames remain** (tb_forwarder family deferred as batch 2b — needs page-by-page approach)

**🗺 Branch state (post-push · 2026-05-28 ค่ำ):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `337183d5` | **production · all today's work landed** |
| `dave-pacred` | `337183d5` | = main (post-2026-05-24 model: dave-pacred = integration → main) |
| `Poom-pacred` | `123a3409` | **11 commits behind** — ภูม ควร `git pull origin main` ก่อนงานใหม่ |
| `podeng` | `c6ca71fb` | **24 commits behind** — ปอน ควร `git pull origin main` ก่อนงานใหม่ |
| `InwPond007` | = main | already merged earlier this week |

**📋 Audit/research docs created this session:**
- `docs/audit/fidelity-auth-screens-2026-05-28.md` — agent audit · 40 divergences (/login + /register + /forgot-password vs legacy PCS PHP) · 4 LOAD-BEARING top picks
- `docs/audit/podeng-lost-pages-2026-05-28.md` — agent audit · ปอน lost work investigation · confirmed 1 commit only, restore complete
- `docs/audit/poom-wave-25-merge-audit-2026-05-28.md` — agent audit · 9-commit ภูม integration playbook (used to drive the surgical cherry-pick)
- `docs/research/poom-save-point-2026-05-28-afternoon.md` — ภูม save-point + launch-blocker analysis

**🎯 SOTs for next session — read in order:**
1. 🌙 **THIS top section** — what's just shipped + branch state
2. 📋 [`docs/audit/poom-wave-25-merge-audit-2026-05-28.md`](docs/audit/poom-wave-25-merge-audit-2026-05-28.md) — the 9-commit ภูม surgical-merge playbook (reference for future ภูม merges)
3. 📋 [`docs/audit/fidelity-auth-screens-2026-05-28.md`](docs/audit/fidelity-auth-screens-2026-05-28.md) — fidelity gap list for /login + /register + /forgot-password (4 LOAD-BEARING items pending owner decision)
4. 🌅 [`docs/research/poom-save-point-2026-05-28-afternoon.md`](docs/research/poom-save-point-2026-05-28-afternoon.md) — ภูม's 5 launch-blocker analysis + 5 decision asks
5. 📋 NEW learnings (5 entries today):
   - `docs/learnings/nextjs-16-quirks.md` × 3 (jQuery script-order · `<Link>` prefetch CSS leak · `"use server"` non-async-export rejection)
   - `docs/learnings/php-port-patterns.md` × 1 (schema casing drift)
   - `docs/learnings/verify-deep-flow.md` × 1 (round-2 case study)
   - (`docs/learnings/_index.md` updated 2026-05-28 evening consolidated)

**🟡 Pending decisions for next session:**
1. **Schema casing drift** (ภูม flag): rewrite code to camelCase **A** or write migration to lowercase **B**. Current direction = A (camelCase everywhere — ก๊อต's spec north-star)
2. **camelCase batch 2b** — tb_forwarder family (~177 renames / 18 customer-facing pages) — needs page-by-page approach, not big-bang
3. **5 launch-blockers** from ภูม's afternoon save-point:
   - B-1 `NOTIFY_BYPASS` env (1 ชม · Claude)
   - B-2 🔴 ROTATE S3 key (5 นาที · ภูม) — carry-over
   - B-3 13 legacy admins recreate (45 นาที · ภูม)
   - B-4 Click-through audit ทุก mutation button (~90 ปุ่ม · 5-7 ชม)
   - B-5 Schema casing drift audit (~2 ชม · Claude)
4. **Top 5 fidelity gaps** from auth audit (4 LOAD-BEARING — owner decisions):
   - Login remember-me wiring (M ~1.5h)
   - Register channel=8 "ผู้ใช้งานแนะนำ" referral input (S ~30m)
   - Forgot-password as same-route toggle vs separate route (L ~4h — owner-decide)
   - Forgot-password email mode keep or hide (30m if hidden)

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/hopeful-almeida-359e44
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/main   # should be 0/0
head -120 CLAUDE.md                                    # this top section
cat docs/audit/poom-wave-25-merge-audit-2026-05-28.md  # if more ภูม commits to merge
# Pick from "Pending decisions" above
```

---

# 🌅 2026-05-28 afternoon — WAVE 25 SHIPPED (mid-session · superseded by ค่ำ above)

ภูม session **บ่ายวันนี้** — เริ่มเช้าด้วย sync `dave-pacred` (เพราะพี่เดฟแก้ Supabase เมื่อวาน · migration 0113 rename ~78 columns ตู้/admin/co lowercase → camelCase บน prod) → merge + sweep → fix tsc + lint → ภูม click-test เจอ P0 bug → ปิดแล้ว push เก็บงานให้พี่เดฟ review.

**📦 8 commits today (push range `6ec9d7b..6d88c8e` on Poom-pacred):**

| Commit | งาน |
|---|---|
| `aac4583` | Wave 25 #194 codemod (13 single-table tb_users/admin/co readers) |
| `2f36711` | batch A (24 admin core pages camelCase) |
| `546b528` | batch B (25 admin QA + forwarders + service-orders + cnt) |
| `6bf00c5` | batch C (25 actions + lib + rates) |
| `2db1c81` | batch D (27 customer-facing protected pages) |
| `7779902` | post-cherry-pick repair · 31 tsc errors (profiles.id + auth.user.id over-rename) |
| `0699fe3` | Wave 25 #195 · 61 §0c lint sweep (19 files) + tsconfig/package/.env verify-gate cleanups |
| `6d88c8e` | Wave 25 #196 · **cnt-payment P0 bug fix** (demote 4 Zod schema exports from `"use server"`) |

**🟢 Verify state (post-Wave 25 close):**
- `pnpm verify` EXIT 0 (lint 0 errors · tsc 0 · ~280 tests · audits green)
- Browser-verify 2 surfaces end-to-end success: `/admin/report-cnt` cnt-payment + `/admin/forwarder-check` bulk-bill
- Schema casing drift discovered + documented (tb_cnt* camelCase quoted vs action lowercase keys · PostgREST fuzzy-matches but raw SQL/RPC future bug)

**🔴 5 launch-blockers identified (ภูม สั่งวิเคราะห์ Phase 1 launch-readiness):**
1. **B-1** SMS/LINE/Email ส่งจริงตอน admin test — ต้องเพิ่ม `NOTIFY_BYPASS` env (~1 ชม · Claude)
2. **B-2** ROTATE S3 key `e913d7da34ca0089638f100afb74c972` (carry-over · ~5 นาที · ภูม)
3. **B-3** 13 legacy admins recreate via `/admin/admins/new` (~45 นาที · ภูม)
4. **B-4** Click-through audit ทุก mutation button ใน `/admin/*` (~90 ปุ่ม · ~5-7 ชม wallclock · 3-4 parallel agents)
5. **B-5** Schema casing drift audit + fix (~2 ชม · Claude + agents)

**🟡 Decision asks for ภูม / พี่เดฟ:**
1. Schema drift fix: **A) rewrite code** to match schema camelCase OR **B) write migration** rename columns to lowercase
2. Launch strategy: **soft-launch beta cohort** (50-100 คน) OR hard-launch
3. Launch date — ถ้ามี hard date จะช่วยตัด P1/P2 ที่ slip

**🎯 SOTs for resume — read in order:**
1. 🌅 [`docs/research/poom-save-point-2026-05-28-afternoon.md`](docs/research/poom-save-point-2026-05-28-afternoon.md) — **this session's canonical resume** (8 commits · launch-blocker analysis · decision asks · 5 B-items + 5 S-items prioritized)
2. 🌙 [`docs/research/poom-save-point-2026-05-27-night.md`](docs/research/poom-save-point-2026-05-27-night.md) — Wave 22+23 close-out yesterday
3. 🔥 [`docs/research/admin-tech-debt-master-2026-05-27.md`](docs/research/admin-tech-debt-master-2026-05-27.md) — 19-item inventory (18 closed by Wave 23-24-25 · 1 deferred design call)
4. 📋 NEW learnings (3 entries today):
   - [`docs/learnings/nextjs-16-quirks.md`](docs/learnings/nextjs-16-quirks.md) [2026-05-28] — `"use server"` files reject ALL non-async-function value exports
   - [`docs/learnings/php-port-patterns.md`](docs/learnings/php-port-patterns.md) [2026-05-28] — Schema casing drift (tb_cnt* camelCase quoted vs action lowercase)
   - [`docs/learnings/verify-deep-flow.md`](docs/learnings/verify-deep-flow.md) [2026-05-28] — round-2 case study · cnt-payment click-through gap · hardened protocol added

**🗺 Branch state (post-push · 2026-05-28 14:59):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9c2571d` | production (ภูม Wave 20-25 ยัง merge) |
| `Poom-pacred` | `6d88c8e` | **active · Wave 25 work landed · awaiting พี่เดฟ review** |
| `dave-pacred` | `9c2571d` | customer-side (12 commits ahead Poom · ยังไม่ sync) |
| Our worktree | `6d88c8e` | ✅ in sync 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-28-afternoon.md     # canonical resume
# Then: pick B-1..B-5 (launch blockers) per ภูม decision
```

---

# 🌙 2026-05-27 ค่ำ — WAVE 22 + WAVE 23 P0 SHIPPED · read FIRST (supersedes 2026-05-26 ค่ำ below)

ภูม mega-session วันนี้ — เช้า/บ่าย Wave 22 (perf root-cause + tb_admin merge) · ค่ำ ภูม flag 4 bugs → 3 audit agents → master tech-debt doc → Wave 23 P0 batch 1 ครบ 4 fixes. ภูม กลับบ้านจาก work computer → resume ที่บ้าน.

**📦 28+ commits today (push range `22d5e37..<see save-point>` on Poom-pacred):**

**Wave 20-22 sweep (เช้า/บ่าย):**
- Wave 20 P1 batch 2 (wallet/add · yuan-payments/new · reports/{payment,shop,forwarder}) — Tailwind chrome
- Wave 21 P0 — shop→forwarder auto-spawn · Wave 21 deferred admin-profile jQuery → native dialog
- Wave 21 P2 — migration 0109 (23 partial indexes · applied to prod · /admin warm 1.88s vs cold 2.6s confirmed) + Phase A 4 quick wins
- NEW skills (`debug-mantra` + `management-talk` · 16 total) + learning (`debug-discipline.md` · "2 Issues" case study)
- **Wave 22 tb_admin → admins merge** (5 phases · migration 0110 + 3 intel docs + list page + CRUD forms + pre-existing bug fix · 10+ agents)
- **PostgREST PGRST200 cross-embed fix** (4 files · captured as learning in `supabase-rls-patterns.md`)

**Wave 22 close-out (ค่ำ · ภูม 4-issue flag):**
- fix · sanitize 9 placeholders (พี่ป๊อป's name leaked into form examples · my brief mistake)
- fix · sidebar 4 icons missing (Banknote · KanbanSquare · Smartphone · Save) + dev-only console.warn
- fix · 2 dangling-Bootstrap modals (organization-email + barcode/driver/import) + extract shared `components/ui/pacred-dialog.tsx`
- docs · master tech-debt inventory `admin-tech-debt-master-2026-05-27.md` (19 items prioritized · 6 closed in-session)

**Wave 23 P0 batch 1 (ค่ำ · 4 critical fixes per master tech-debt):**
- `0dce2b9` Agent O — `/admin/customers` suspend + Approve confirm wrapper (no more instant mutate)
- `f48dea8` Main — `/admin/accounting` menubar 96+ 404 leaves → catch-all stub "🚧 Wave 24+" + 4 placeholder no-op fixes
- `cddeea3` Agent N — `/admin/admins/[uuid]` detail rewrite (admins JOIN profiles JOIN admin_contact_extras · -83 LOC · 5 sidecar areas banner'd as Wave 23 follow-up)
- `19ae7ff` Agent P — `/admin/forwarders/combine-bill` 4 bugs FIXED (built ใบส่งสินค้า A4 print route · bill# clickable · items column root-cause = PGRST200 family · ลบรายการ PacredDialog confirm)

**🟢 Wave 23 P0 done · awaiting ภูม browser-verify ที่บ้าน (6 surfaces):**
1. /admin/customers suspend/Approve → confirm dialog
2. /admin/accounting menubar → ทุก dropdown ไป stub (no 404)
3. /admin/organization-email "เพิ่มใหม่" + "คำอธิบายระบบ" modal
4. /admin/barcode/driver/import "คำอธิบายระบบ" modal
5. /admin/admins/[uuid] detail
6. /admin/forwarders/combine-bill (list + print + delete confirm)

**⚠️ Pending ภูม manual actions (carried over):**
1. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (carry over many sessions)
2. **#136** cleanup test row #51972:
   ```sql
   DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';
   ```
3. **Browser-verify Wave 23 P0 6 surfaces** above

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-27-night.md`](docs/research/poom-save-point-2026-05-27-night.md) — **canonical resume** (28+ commits · 13 agents · Wave 23 P0 ครบ)
2. 🔥 [`docs/research/admin-tech-debt-master-2026-05-27.md`](docs/research/admin-tech-debt-master-2026-05-27.md) — **THE NEXT-SESSION SOT** · 19 items prioritized · 10 closed today · 9 P1 + 4 P2 remain (~12-18h dev sprint)
3. 📋 3 audit reports (`admin-click-through-audit` · `admin-ui-design-audit` · `admin-sidebar-and-disbursement-audit` — all 2026-05-27)
4. 📋 Wave 22 intel trio (`tb-admin-merge-intel` · `tb-admin-code-audit` · `tb-admin-13-row-reference` — all 2026-05-27)
5. 📋 [`docs/learnings/debug-discipline.md`](docs/learnings/debug-discipline.md) + [`docs/learnings/supabase-rls-patterns.md`](docs/learnings/supabase-rls-patterns.md) (PGRST200 entry NEW today)
6. 🛠 [`.claude/skills/debug-mantra/SKILL.md`](.claude/skills/debug-mantra/SKILL.md) + [`management-talk`](.claude/skills/management-talk/SKILL.md) + [`components/ui/pacred-dialog.tsx`](components/ui/pacred-dialog.tsx) — NEW today

**🟡 Pickup options for next session:**
- **A** Wave 23 P1 batch (9 items · ~5-7h wallclock with parallel agents) — withdrawals param drop · ดู/แก้ไข labels mislead · cnt-hs GZE overflow · 2 dead routes · 9 Bootstrap chrome pages · disbursement header drift · brand-red 2 shades · PCS Freight legacy port gap
- **B** Wave 23 P2 polish (~6-8h) — 4 form-legacy pages · /admin/reports V-G6 cards wire-up · admin-profile-client form-control verify
- **C** Wave 21 P2 Phase C RPC consolidation (~4h) — get_admin_sidebar_counts() + 2 more RPCs (unlocks 3 Phase A TODO SUM cards)
- **D** Browser-verify ภูม เอง (~30-45min) — 6 Wave 23 P0 surfaces ที่บ้าน

**🗺 Branch state (post-push · 2026-05-27 ค่ำ final):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม Wave 20+22+23 ยัง merge) |
| `Poom-pacred` | `19ae7ff` (+ save-point) | **active · all Wave 20-21-22-23-P0 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel lane) |
| Our worktree | `19ae7ff` (+ save-point) | ✅ in sync |

**Resume command (ที่บ้าน):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # ต้อง 0/0
cat docs/research/poom-save-point-2026-05-27-night.md
cat docs/research/admin-tech-debt-master-2026-05-27.md
pnpm dev   # port 3000
# Then pick option A/B/C/D from above
```

---

# 🌅 2026-05-27 เย็น — WAVE 22 PERF-FIX + tb_admin MERGE SHIPPED (mid-session · superseded by ค่ำ above)

ภูม กลับมา session เย็น · Wave 22 = perf root-cause kill + 5+2 parallel agents (10 total this session) + 2 new skills + tb_admin → admins consolidation Phase 1-5.

**📦 13 commits today (push range `22d5e37..1a40af6` on Poom-pacred):**
- **Wave 20 P1 batch 2** — wallet/add · yuan-payments/new (`fc9aabe`) + reports/{payment,shop,forwarder} (`f47c179`) Tailwind chrome
- **Wave 21 P0** — shop→forwarder auto-spawn (`fe98da3` · closes taxonomy §6 gap)
- **Wave 21 deferred (Task #128)** — admin-profile-client jQuery → native dialog (`003439b` · 5 modals + 2 confirms · 3 inline helpers `PacredDialog` + `DialogFooter` + `useConfirmDialogs`)
- **Wave 21 P2 perf fix** — query survey (`cbed382`) → migration 0109 (`5372346` · 23 partial indexes) → Phase A 4 quick wins (`5b065c6` · 3 TODOs + 1 real fix on `report-cnt`). **Applied to prod** → admin chrome 1.5-3s → 100-300ms confirmed (/admin warm 1.88s vs cold 2.6s)
- **NEW skills** — `debug-mantra` + `management-talk` (`8050eef` · 16 total)
- **Learnings** — `debug-discipline.md` case study of today's "2 Issues" misdiagnosis (`c9b5446`)
- **Off-target fix kept as evidence** — `a2e7b25` (image qualities · doc'd in debug-discipline)
- **🆕 Wave 22 tb_admin → admins merge (Phase 1-5)** — migration 0110 + 3 intel docs (`09f410d`) + list page rewrite (`f2e731d`) + pre-existing bug fix (`7a9e019`) + CRUD forms (`1a40af6` · 1734 LOC new · 5 server actions)

**🟢 Verified working (post-0109):**
- /admin home — 1.88s warm (was 2.6s)
- /admin/customers list — 0.52-0.72s
- /admin/wallet/add + /admin/yuan-payments/new (Tailwind chrome · BS4 form-island banner-flagged)
- /admin/reports/{payment,shop,forwarder} — full Tailwind · prod data flowing
- /admin/admins/[id] modal port — code clean (jQuery/BS4 zero · all 7 modals native `<dialog>`)

**🟠 Wave 22 tb_admin → admins merge — code shipped · awaits 2 actions ภูม:**
1. **Apply migration 0110** in Supabase Dashboard SQL Editor (paste `0110_admin_contact_extras_legacy_bridge.sql` · ~50ms · 0-row table)
2. **Recreate 13 legacy admins via `/admin/admins/new`** form (use reference doc `docs/research/tb-admin-13-row-reference.md` alongside · ~45-60 min)
- After both: /admin/admins shows 4 native + 13 new admins · transfer-rep dropdown works · all 24 legacy tb_admin readers eventually swap to admins (gradual decommission over future sessions)

**⚠️ Pending ภูม manual actions (priority order):**
1. 🟠 **Apply migration `0110`** in Supabase SQL Editor — unblocks /admin/admins (currently 500)
2. 🟠 **Recreate 13 admins via `/admin/admins/new`** form — open reference doc + sip coffee · 45-60 min
3. 🔴 **ROTATE S3 access key** `e913d7da34ca0089638f100afb74c972` (still not done · leaked วันแรก)
4. **#136** cleanup test row #51972 — `DELETE FROM tb_forwarder WHERE id=51972 AND ftrackingchn='TEST-SPAWN-WAVE21-A';`

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌅 [`docs/research/poom-save-point-2026-05-27-evening.md`](docs/research/poom-save-point-2026-05-27-evening.md) — **canonical resume** (13 commits · 10 agents output · verified pages · pickup options A-E)
2. 🔥 [`docs/research/wave-21-p2-query-survey.md`](docs/research/wave-21-p2-query-survey.md) — perf root-cause + 3-phase plan (Phase B done · Phase A done · Phase C waits)
3. 🔧 [`docs/research/tb-admin-merge-intel-2026-05-27.md`](docs/research/tb-admin-merge-intel-2026-05-27.md) + [`docs/research/tb-admin-code-audit-2026-05-27.md`](docs/research/tb-admin-code-audit-2026-05-27.md) + [`docs/research/tb-admin-13-row-reference.md`](docs/research/tb-admin-13-row-reference.md) — Wave 22 merge intelligence (read together · the 13-row reference is the action checklist for ภูม)
4. 📋 [`docs/learnings/debug-discipline.md`](docs/learnings/debug-discipline.md) — **NEW** "2 Issues" case study · pair with debug-mantra skill
5. 🛠 [`.claude/skills/debug-mantra/SKILL.md`](.claude/skills/debug-mantra/SKILL.md) + [`.claude/skills/management-talk/SKILL.md`](.claude/skills/management-talk/SKILL.md) — **NEW skills** (16 total)

**🟡 Pickup options for next session (ภูม pick when resuming):**
- **A** Wave 22 Phase 6 + cleanup leftovers (~1-2h · after 13-admin recreate) — rewrite `/admin/admins/[id]` detail page (Task #150 · still queries tb_admin · row-click 404 now) · avatar upload (Wave 23 deferred · Agent J) · #136 cleanup
- **B** Phase C RPC consolidation (~4h) — `get_admin_sidebar_counts()` + `get_dashboard_kpi()` + `get_wallet_system_totals()` (cuts 22 RTTs → 1 + unlocks the 3 TODO surfaces from Phase A)
- **C** Wave 21 batch 3 — `/admin/service-orders/cart` + `cart/add` (port `cart.php`)
- **D** Wave 21 P1 follow-ups — #137 paginate /reports/forwarder · combine-bill PDF print · warehouse-history bulk-print
- **E** Migrate remaining 16 `resolveLegacyAdminId` callers (~2h · Agent G audit) — swap to query admins+admin_contact_extras · cuts files for eventual `DROP TABLE tb_admin CASCADE`

**🗺 Branch state (post-push · 2026-05-27 เย็น):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม Wave 20+22 ยัง merge) |
| `Poom-pacred` | `1a40af6` (or later) | **active · all Wave 20+21+22 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel) |
| Our worktree | `1a40af6` | ✅ in sync with Poom-pacred 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-27-evening.md       # canonical resume
pnpm dev   # port 3000 (if not running)
# Then: pick option A/B/C/D/E from above
```

---

# 🚨 2026-05-26 ค่ำ — WAVE 20 ALL DONE · read FIRST (supersedes 2026-05-25 below)

ภูม **mega-session วันนี้ · 30+ commits บน `Poom-pacred`** (เกือบทั้งวัน). ที่ผ่านมา Wave 19 ปิด BUG #1-4 เสร็จ → วันนี้ดำเนินการ Wave 20 ครบทั้ง 5 layer (P0 schema swaps + P0-4 reports + P1 batch 1 Tailwind rewrites + qw1/qw2 + bonus). **ทุกหน้า browser-verified §0c** (ไม่ใช่แค่ route smoke).

**📦 30+ commits today (push range `2ab967b..22d5e37`):**
- **§0c sprint** — codemod 244 files + ESLint rule `pacred/no-bare-supabase-data-destructure`
- **4 bugs** — BUG #1 PR10899 500 · #2 forwarders badge · #3 wallet/[id] type-aware · #4 paydeposit slip join
- **Wave 20 P0-1..3** — customers/[id] · accounting hub (+ unified PEAK chrome) · KPI dashboard — all → tb_*
- **Wave 20 P0-4** — reports hub + 5 sub-reports (credit-pending 143 · pending-payments 1,470 · refunds 60 · monthly-orders ฿1.8M+ · debtors 0+banner)
- **Wave 20 P1 batch 1 (7 หน้า)** — notes (+ schema swap) · transfer-rep · admins + [id] · warehouse-history (+ helpers) · combine-bill + add
- **Wave 20 fixes** — qw1 fcover URL rewriter + smart placeholder · qw2 warehouse-history 7d default · forwarders avatar revert · 2× menubar link wiring for /notes
- **Bonus** — /admin/service-orders → tb_header_order (21,950 rows) · /admin/accounting/cargo redirect
- **Docs** — admin pages audit (175) · marketplace thumbnails research · order taxonomy · **agent orchestration learnings (NEW)**

**🟢 23 pages verified working with real prod data:**
- /admin/accounting (฿35M+ cards), /accounting/cargo (redirect)
- /admin/customers/PR10899, /customers/transfer-rep
- /admin/kpi (฿6.8M MTD), /service-orders (200 rows)
- /admin/forwarders + /[fNo] enhanced detail, /warehouse-history, /notes (500 rows), /combine-bill (997 rows), /combine-bill/add
- /admin/admins (13), /admins/admin_nat (identity + KPI)
- /admin/reports (5 tabs) + credit-pending (143) + pending-payments (4) + refunds (60) + monthly-orders + debtors
- /admin/wallet/105410 (topup+slip), /wallet/105411 (partner slip via paydeposit join)

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-26-night.md`](docs/research/poom-save-point-2026-05-26-night.md) — canonical resume (30+ commits · verified pages · pickup options · resume commands)
2. 📋 [`docs/learnings/agent-orchestration.md`](docs/learnings/agent-orchestration.md) — **NEW** 6 lessons from running 8 parallel agents (stale base · dual-write · API timeout · 1000-row cap · PEAK chrome · §0c click-through)
3. 📋 [`docs/audit/admin-pages-audit-2026-05-25-night.md`](docs/audit/admin-pages-audit-2026-05-25-night.md) — 175-page audit (Wave 21 backlog source)

**🟡 Pickup options for next session (ภูม pick when resuming):**
- **A** Wave 20 P1 batch 2 (~2-3h) — wallet/add · yuan-payments/new · reports/{payment,shop,forwarder} · service-orders/cart
- **B** Wave 21 P0 task #106 (~3-4h) — port shop→forwarder auto-spawn (legacy shops.php L1675-1721) — biggest backlog impact (spawn chip ready)
- **C** Browser-verify ภูม เอง (~30min) on prod surfaces before going further
- **D** Wave 21 P1 follow-ups (~2h) — task #128 admin-profile-client modals + combine-bill backend stubs

**⚠️ Pending ภูม manual actions (carried over · ยัง):**
1. 🔴 **ROTATE S3 access key** — Dashboard → Project Settings → Storage → S3 Access Keys (key `e913d7da34ca0089638f100afb74c972` leaked วันที่แรก)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` ถ้ายังไม่ apply

**🗺 Branch state (post-push · 2026-05-26 ค่ำ):**

| Branch | HEAD | สถานะ |
|---|---|---|
| `main` | `9d8467b` | production (ภูม wave 20 ยังไม่ merge) |
| `Poom-pacred` | `22d5e37` | **active · all Wave 20 work landed** |
| `dave-pacred` | `26cf183` | customer-side port (don't merge — parallel lane) |
| Our worktree | `22d5e37` | ✅ in sync with Poom-pacred 0/0 |

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-26-night.md         # canonical resume
pnpm dev   # port 3000 (if not running)
# Then: pick option A/B/C/D from above
```

---

# 🚨 2026-05-25 ค่ำ — WAVE 15 + 16 + 17 ALL DONE · read FIRST (supersedes 2026-05-24 below)

ภูม **mega-session วันนี้ · 18 commits บน `Poom-pacred`** (16:00 → 23:30). ภูม catch ผม audit ผิวเกินไป (compared HTML paste only · missed 2 huge pages) → dispatched 4+3+3 parallel agents ในชุดต่างๆ. ผลลัพธ์: 5 P0 + 3 P0 follow-ups + UX fix + 3 P1 + close-out · **~7,200 LOC** ลง production-ready Cargo flow.

**📦 18 commits today (16:00 → 23:30):**
- **Wave 15** — 3 P0 fidelity fixes (wallet balance summary · yuan 60d filter · forwarders ยอดค้างชำระ)
- **Wave 16 prep** — `docs/audit/cargo-flow-deep-audit-2026-05-25.md` (44 legacy PHP vs ~70 Pacred · 47 gaps) + new `AGENTS.md §0b` rule + `docs/learnings/audit-discipline.md`
- **Wave 16 P0 (5)** — `/admin/report-cnt/[fNo]` per-container detail (1601 LOC) · `/admin/forwarder-check` bulk-bill (1572) · inline cost-edit modal · stub cleanup · barcode schema-split
- **Wave 16 follow-ups (3)** — **8,886 profiles UUIDs provisioned** (LINE+email channels enabled) · internal cost-update tab (no Sheets) · dual-mode cost-rate modal (CBM+Weight all carriers)
- **Wave 17 ux-fix** — report-cnt inline checkbox + modal + "ทำรายการเบิกเงินค่าตู้" wording (legacy used "เบิก" in cnt-hs.php · our "บันทึก" was wrong)
- **Wave 17 P1 (3)** — MOMO + CN manual entry · api-sheets quartet (CTT/Sang/MK/MX) · barcode AJAX writer (auto-flips fStatus=4 when fi2Amount >= fAmount)
- **Close-out** — wired deferred LINE in `actions/admin/forwarders.ts:538` (Agent A side-finding)

**🟢 Browser-test queue (~30 min next session):**
1. `/admin/report-cnt?page=succeed` — ติ๊กตู้ + เปิด modal เบิกเงิน
2. `/admin/report-cnt/<fNo>` — drill-down + cost-edit + cost-update tab
3. `/admin/forwarder-check` — 3 tabs + bulk-bill
4. `/admin/api-forwarder-momo/manual` + `/admin/api-forwarder-cn/manual`
5. `/admin/api-sheets-sang` (live preview ค่าขนส่ง · Sang's PCSE rule)
6. `/admin/barcode/driver/import` — USB scanner · auto-flip status

**🟡 Phase C — Defer:** JMF/GOGO API · real Sheets API (`check-sang-cost`) · MOMO/CN/JMF cron jobs · standalone `forwarder-driver` · MOMO Sack API · CargoCenter `containerReport` (legacy ยังไม่เคยทำ).

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-25-night.md`](docs/research/poom-save-point-2026-05-25-night.md) — canonical resume (Wave 15 done + Wave 16 plan + branch state + resume commands)
2. 📋 [`docs/audit/cargo-flow-deep-audit-2026-05-25.md`](docs/audit/cargo-flow-deep-audit-2026-05-25.md) — Wave 16 gap report (44 legacy PHP vs ~70 Pacred) · P0/P1/P2 prioritized
3. 🛠 [`docs/learnings/audit-discipline.md`](docs/learnings/audit-discipline.md) — **NEW** the lesson from today (audit from PHP source, not HTML paste)
4. 🧭 [`AGENTS.md`](AGENTS.md) §0b — **NEW** rule: deep-audit-from-source protocol
5. 📝 [`docs/research/poom-save-point-2026-05-24-night.md`](docs/research/poom-save-point-2026-05-24-night.md) — Wave 14 context

**⚠️ ภูม manual actions pending (carried over · ยัง):**
1. 🔴 **ROTATE S3 access key** — Dashboard → Project Settings → Storage → S3 Access Keys (key `e913d7da34ca0089638f100afb74c972` leaked วันแรก)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` ถ้ายังไม่ apply
3. (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน

**🗺 Branch state map (post-fetch · 2026-05-25 ค่ำ):**

| Branch | HEAD | vs main | vs Poom-pacred | สถานะ |
|---|---|---|---|---|
| `main` | `9d8467b` | — | -127 | production · ปอน frontend landed |
| `Poom-pacred` | `152add3` (Wave 15) | +127 | — | **active · ภูม admin port** |
| `dave-pacred` | `26cf183` | +40 | +12, -99 | **active · เดฟ customer port** |
| `dave` | (frozen) | (old V3) | — | FROZEN per 2026-05-19 pivot |
| `podeng` | `9d8467b` | (= main) | — | merged into main |
| `faithful-port` | `e8a0ba0` | — | — | customer 12/24 transcription |
| Our worktree (`claude/adoring-chandrasekhar-0f8ad7`) | `152add3` | (= Poom-pacred) | 0/0 | ✅ in sync |

**dave-pacred has 12 commits Poom-pacred doesn't** = customer-side D1 (cart end-to-end · OTP TTL · PromptPay QR fix). **ไม่ต้อง merge** — parallel lanes per `docs/runbook/faithful-port-plan.md`.

**Resume command (next session):**
```bash
cd /c/Users/Admin/pacred-web/.claude/worktrees/adoring-chandrasekhar-0f8ad7
git fetch origin --prune
git rev-list --left-right --count HEAD...origin/Poom-pacred   # should be 0/0
cat docs/research/poom-save-point-2026-05-25-night.md         # canonical resume
# Then: browser-test 7 surfaces above OR start Phase C (JMF/GOGO/cron)
```

---

# 🌙 2026-05-24 EVENING — WAVE 14 COMPLETE (read FIRST · supersedes 2026-05-22 below)

ภูม session ที่บ้านวันนี้. **1 new commit** บน `Poom-pacred` (`d287992`).
พักก่อน · พรุ่งนี้ว่ากันใหม่.

**📦 What landed tonight (Wave 14 · 3 parallel streams):**
- **Agent D** — Wave 12-C ภาค 2: forwarder edit dimensions (4 files · ~860 LOC ·
  `actions/admin/forwarders-edit.ts` + `[fNo]/edit/{page,edit-form}.tsx` +
  detail page entry button). Pure Tailwind UI per §0a — admin กรอก weight/CBM/
  crate AFTER goods arrive China warehouse.
- **Agent B** — Fidelity audit: `docs/audit/fidelity-gap-2026-05-24.md` (282 LOC ·
  **47 gaps** documented: 18 🔴 workflow · 22 🟠 polish · 7 🟢 keep). Top 3 P0
  ranked with file paths + LOC estimates.
- **Me (orchestration)** — 10 routes smoke + 3 Chrome screenshots verified
  brand-red theme + Wave 12-D inline edit + Wave 12-C v2 form. **Phantom
  discovered:** Phase A migration `tb_priceuser_*` ไม่เคยมี · Wave 9 ภูมิรู้แล้ว ·
  ของจริง `tb_rate_vip_*` + `tb_hs_rate_custom_*` ทั้งหมดบน prod แล้ว.

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🌙 [`docs/research/poom-save-point-2026-05-24-night.md`](docs/research/poom-save-point-2026-05-24-night.md) — canonical resume (1-commit summary · top 3 P0 queue · 6 decision options)
2. 📋 [`docs/audit/fidelity-gap-2026-05-24.md`](docs/audit/fidelity-gap-2026-05-24.md) — 47-gap inventory with line citations to legacy PHP
3. 📝 [`docs/research/poom-save-point-2026-05-23-night.md`](docs/research/poom-save-point-2026-05-23-night.md) — yesterday's context (Wave 9-13 details)

**⚠️ Pending ภูม manual actions (carried over):**
1. 🔴 ROTATE S3 access key (security · `e913d7da34ca0089638f100afb74c972` leaked)
2. (Optional) Apply migration `0094_view_sales_by_rep.sql` via Supabase dashboard
3. (Optional) แจ้งลูกค้า 4 คน PR เปลี่ยน

**Top pickup ลำดับแนะนำ:** D (5 นาที cleanup) → B (yuan date filter, 30 นาที)
→ A (Top 3 P0, 3 ชม). หรือเลือก option อื่นจาก 6 ตัวเลือกใน save-point §"พรุ่งนี้ตัดสิน".

---

# 🚨 2026-05-22 EVENING — WAVE 7.3 + WAVE 8 COMPLETE (read FIRST · supersedes 2026-05-20 below)

ภูม ran tonight's session at the home computer. **4 new commits**
land on `Poom-pacred` (`245e206..01fdebc`). Machine change tonight
(home → work tomorrow).

**📦 What landed tonight (19 surfaces · ~3,800 LOC):**
- **Wave 7.3** (`11ebcbc`) — wired the last 12 orphan admin pages
  into sidebar (`ระบบ` + `เครื่องมือ` Settings groups) + 4 page
  top-menubars (cargo/forwarders/wallet/reports). Closes the
  re-audit-2026-05-21-night 🔴 DEAD list.
- **Wave 8 Group A** (`9fccdd2`) — 3 bulk-approve bars on `tb_*` schema:
  wallet · yuan · customer-pending. Browser-verified on PROD data
  (1,470 wallet pending rows show checkbox each).
- **Wave 8 Group B+C** (`01fdebc`) — admin manual entry forms (wallet/add
  + yuan/new + customers/transfer-rep) + reports SQL rewrites
  (sales-by-rep · user-sales-history × 2) + Postgres view
  `vw_sales_by_rep` (migration 0094).

**⚠️ ภูม manual steps before next session:**
1. Apply migration `supabase/migrations/0094_view_sales_by_rep.sql` via
   Supabase dashboard (idempotent · `create or replace view`).
2. Browser-test the 4 new Wave 8 surfaces with small entries on PROD.
3. Re-install Claude for Chrome extension on the work computer.

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-22-night.md`](docs/research/poom-save-point-2026-05-22-night.md) — the canonical resume doc (commit list · env state · pending actions · resume commands)
2. 📋 [`docs/audit/page-inventory-2026-05-21-night.md`](docs/audit/page-inventory-2026-05-21-night.md) — page-by-page checklist (Wave 7.3 rows now all ✅)
3. 🛠 [`docs/audit/re-audit-2026-05-21-night.md`](docs/audit/re-audit-2026-05-21-night.md) — P0/P1/P2 list (P0 + P1 + most-P2 closed by Wave 7.3+8)

**Top next pickup:** Phase A migration backlog (`tb_priceuser_*`
unblock rates pages · 2-3 ชม · ภูม+ก๊อต).

---

# 🚨 2026-05-20 EVENING — PHASE 1 PUSH (read FIRST · supersedes 2026-05-19 below)

ภูม ran a 12-hour Phase 1 push tonight. 8 commits land on `Poom-pacred`
(`b584c22..90c1dbe` + this save-point commit). Customers tapping in from
running ads — the sprint is "rip the band-aid before they hit the rough edges".

**🔥 Env change:** Pacred is now **Supabase prod only** —
`https://yzljakczhwrpbxflnmco.supabase.co` (ก๊อต took dev project for
other work · Pro plan upgraded). `.env.local` updated locally (gitignored
so backup at `.env.local.dev-backup-2026-05-20`). **Resume on a new
machine → manually update `NEXT_PUBLIC_SUPABASE_URL` +
`NEXT_PUBLIC_SUPABASE_ANON_KEY` per the save-point doc.**

**📦 What landed today:** Wave 1 (faithful port of `report-cnt.php` +
11-button audit menu + 9 audit queues + spine list tombstoned) · Wave 2
(8 barcode routes faithful-ported · gateway routing · `tb_cnt` cnt-payment
flow · 3 audit queues wired with `tb_header_order` + 41-ZIP free-shipping
list · 8 spine scan routes deleted) · Wave 3 (Quagga2 installed ·
DataTables-Responsive added · iOS auto-zoom fixed on register · 4 audits
landed: fidelity / mobile / pcs-complete-analysis / pcs-admin-roles /
pcs-business-flow). Spine retirement migration `0090` written but DEFERRED
(14 cargo_* consumers still need cleanup · Wave 4).

**🎯 SOTs for tomorrow's resume — read in order:**
1. 🚨 [`docs/research/poom-save-point-2026-05-20-night.md`](docs/research/poom-save-point-2026-05-20-night.md) — the canonical resume doc (env-change steps · 8-commit summary · open questions · resume commands)
2. 📋 [`docs/audit/pcs-master-synthesis-2026-05-20.md`](docs/audit/pcs-master-synthesis-2026-05-20.md) — P0/P1/P2 action list from 5 audits (6 P0 items remain · ~14-21 ชม)
3. 🛠 [`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md) — Option A locked · Wave 2 done · Wave 3 partial · Wave 4 backlog
4. 🧰 [`docs/audit/fidelity-2026-05-20.md`](docs/audit/fidelity-2026-05-20.md) — element-by-element diff of 7 admin screens vs legacy

**🚨 Top P0 for next session:** rewrite `/admin/forwarders` to read
`tb_forwarder` (currently reads the REBUILT `forwarders` table — staff
will read wrong status to customers). 4-6 ชม.

**Critical discovery — newrealdatapcs:** ภูม pointed at
`C:\Users\Admin\Downloads\newrealdatapcs\` as พี่เดฟ's "real latest"
PCS Cargo update. The PHP code there is BYTE-IDENTICAL to our existing
snapshot (16,184 files · 0 hash diffs). The real value = พี่เดฟ's 5
markdown analysis docs at `N'POOM - PCS LEARNNING/` (6,826L combined),
which we've digested into the 4 audits above.

---

# 🚨 2026-05-19 EVENING — DIRECTION SHIFT

The team pivoted from V3 (the `main → dave → Poom` loop where Wave A/B/R1
sidebar-fidelity work shipped this morning) to a **literal 1:1 transcription**
of legacy PHP → Next.js per the owner's "100% sameness FIRST" rule.

**New branch loop:**
- **`Poom-pacred`** (ภูม · admin transcription · 187 `pcs-admin/*.php` files)
- **`dave-pacred`** (เดฟ · customer transcription + integrates)
- **`podeng`** (ปอน · customer-portal frontend)
- → **`faithful-port`** (integration target · เดฟ-owned)
- → ก๊อต production gate → **`main`** (Vercel auto-deploy)

V3 branches (`Poom`, `dave`) are **FROZEN** — preserved + already merged into
`faithful-port`, so today's morning work isn't lost — but no new commits land
there until further notice.

**Method:** 1:1 transcription · same HTML markup · same SQL · `PCS → PR` branding
only · zero design decisions. Legacy source on ภูม's machine at
`C:\Users\Admin\pcscargo\` (187 admin + 42 customer-portal `.php` files).

**Status (2026-05-19 night):** register/login fix shipped to `main` · customer
portal **7/~24** screens transcribed 1:1 on `dave-pacred` (`menu`→dashboard ·
china-address · account-settings · search · wallet · addresses · cart) · admin
pilot done (`admin-table`→`/admin/admins`) · Bootstrap-4 + jQuery + FontAwesome
vendor JS being staged for 1:1 interactivity. Full status + the 4-person
work-split → [`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md).

**Authoritative SOTs (read in order):**
1. 🚨 [`docs/research/poom-save-point-2026-05-19-night.md`](docs/research/poom-save-point-2026-05-19-night.md) — the direction-shift save-point · branch state · per-role lanes · PCS→PR table · resume commands
2. 📋 [`docs/runbook/faithful-port-plan.md`](docs/runbook/faithful-port-plan.md) — the plan · branch model · 4-person work-split · status · cross-cutting infra
3. 🛠 [`docs/runbook/faithful-port-transcription.md`](docs/runbook/faithful-port-transcription.md) — the canonical method · 1:1 transcription steps + admin pattern §8
4. 🧰 [`.claude/skills/legacy-php-sweep/SKILL.md`](.claude/skills/legacy-php-sweep/SKILL.md) — supporting skill
5. 🗺 [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) — Phase A data load (the `tb_*` table inventory)

**Pattern references (read before transcribing your first screen):**
- Customer pilot: `app/[locale]/(protected)/dashboard/page.tsx` + `public/legacy/pcs/menu.css`
- Admin pilot: `app/[locale]/(admin)/admin/admins/page.tsx` + `public/legacy/pcs/admin/admin-base.css`

The D1 phase doc + per-role briefs below are still authoritative for company
context · the SHIFT only changes the **work-loop** and the **method**, not the
goal. Goal stays: faithful PCS Cargo port · zero retraining · D1.

---

# 🧬 Pacred DNA (load-bearing — read once, internalise forever)

**Company:** บริษัท แพคเรด (ประเทศไทย) จำกัด · **Pacred (Thailand) Co., Ltd.** · ทะเบียน `0105564077716` · **Slogan: "เร็ว ไว ไม่มีคำว่าทำไม่ได้"** · Owner **พี่ป๊อป Visit** (second-tier: เดฟ + ก๊อต).

**Scope:** ecosystem ของ import-export-customs-cargo-logistics (เคลียร์ศุลกากร · นำเข้า-ส่งออก · ขนส่งระหว่างประเทศ + ในประเทศ · ฝากสั่งซื้อ-ฝากโอน-ฝากขาย · ใบกำกับภาษี · ใบขนสินค้า · ขอคืนภาษี · ฟูมิเกชัน · แมสเซ็นเจอร์ · "และอื่นๆ ทั้งวงการ"). Markets ลำดับ: ไทย → จีน → ญี่ปุ่น → เกาหลี → มาเล → อินโด → เมกา → อื่นๆ.

**Vision:** ทำให้ทุกคน (แม้ไม่รู้อะไรเลย) สามารถนำเข้า-ส่งออกได้ ง่ายๆแค่ปลายนิ้ว. Full-loop service ดึงลูกค้าไว้ในระบบ ไม่ปล่อย handover ที่อื่น.

**Brand-split context (DON'T preempt cleanup):** Pacred = บริษัทใหม่ กำลังแยกจาก **PCS CARGO + TTP + ไอแต้ม**. บาง API ยัง "ยืม" เจ้าเก่าใช้ — ลบ reference เหล่านี้ **หลัง** ก๊อต confirm API switchover เสร็จ (ไม่ใช่ก่อน). Tracked in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

📋 **Full SOT:** [`docs/pacred-info.md`](docs/pacred-info.md) — addresses, phones, emails (7 depts), LINE OA, social, sales reps, JSON-LD code consumers
🧠 **Memory:** `pacred_company_dna` + `cash_burning_p0_emergency` (load via /memories)

---

# 🧭 CURRENT DIRECTION — D1: Pacred is a faithful port of PCS Cargo (2026-05-18)

**The direction changed on 2026-05-18.** The owner (พี่ป๊อป) reviewed the rebuilt-from-scratch Pacred app and **rejected it** — neither the UI nor the workflow logic-loop matches the legacy **PCS Cargo** system that staff and **~8,898 existing customers** use every day. Rebuilding fresh would force everyone to retrain.

**New direction (decision "D1"):** Pacred **becomes the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`.** Not a reinterpretation; a faithful port. The canonical source of truth is **[ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)** — read it in full before any D1 work. It supersedes the "V2 = rebuilt owner-pleaser" framing of [ADR-0010](docs/decisions/0010-v2-v3-version-strategy.md).

**⚠️ Owner mandate (2026-05-19, verbatim):** *"ต้องเอาของเดิมมา copy ให้ได้ ให้เหมือนทั้งหมด 100% ก่อน แล้วเราค่อยพัฒนาให้เหนือยิ่งกว่า"* — copy the original to **100% sameness FIRST**, then improve. The owner scolded the team on 2026-05-19 for screens still diverging from legacy PCS. Faithful first; improvements are Phase C only. Every Phase-B port runs through the `legacy-fidelity-check` skill.

**Three phases:**
- **Phase A — Data migration. ✅ DONE.** Ported the legacy `pcsc_main` (117 tables, ~8,898 customers, years of orders) into Pacred's PostgreSQL/Supabase. `PCS<n>` → `PR<n>` keeping the exact running number; custom auth so customers sign in with their existing password (no reset). *Status: Supabase **Pro upgrade done** (ก๊อต) · **all 117 tables loaded on dev + prod**, incl. the 3 log tables `tb_web_hs`/`tb_history_key`/`tb_history` backfilled post-Pro · **customer image + storage files uploaded to Supabase S3 prod** (`pcsracgo/public/member`) by ภูม 2026-05-24 · migrations `0081`-`0083`+`0087` on `main`.* Runbook: [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md).
- **Phase B — Workflow fidelity.** Rework the Pacred app — customer portal + admin back-office — so its menus, job statuses, container (ตู้) flow, and end-to-end logic-loop **match the legacy PCS system exactly**. Goal: staff + customers need *zero* retraining. *Status: **wave 1 done + integrated on `dave`** (customer 9-icon launchpad · order flow · admin per-role RBAC sidebar + badges · admin container `tb_cnt` payment ledger · legacy-auth bridge) — first-pass, not yet fidelity-verified. Waves 2+ in progress.*
- **Phase C — Pacred enhancements.** *Only after* the faithful port works, layer Pacred's own improvements on top. **Deferred — not cancelled.**

**What this means for prior work:**
- The launched rebuilt app (2026-05-17 production deploy) and its `profiles` + launch-era schema **coexist** with the ported `tb_*` schema during the transition, then retire.
- The **Tier 0/1/2/3 capability roadmap** and the **Phase-2 build queue** (booking flow · customer-intelligence · internal-chat · disbursement · china-ops · platform-observability) are **deferred to Phase C — not cancelled**, re-sequenced *after* the faithful port. [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) is the **D1 master phase plan** (current state · stages · work-lanes); its Phase-C appendix + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) describe that deferred work.
- In-flight pre-D1 feature work (e.g. BK-1 booking flow, freight V-E1.1) **pauses**; the team pivots to Phase A/B.

**Decision lens (every task):** does this make the port **more faithful to PCS Cargo** — closer to *zero retraining* for staff and customers? Prefer work that moves Phase A (data migration) or Phase B (workflow fidelity) forward. De-prioritise anything that extends the rejected rebuild or belongs to the deferred Phase-C enhancements.

**Anti-patterns (under D1):**
- Extending the rejected rebuilt app or building Phase-C enhancements before the faithful port works
- Reinterpreting / "improving" the PCS workflow during Phase B — fidelity first; enhancements are Phase C
- V3 architecture redesign in this repo (V3 = `pacred-DPX`, separate repo — append ideas to `docs/v3-wishlist.md`)
- Shipping a stage before the quality gate is green (`pnpm verify` + build smoke + a functional pass)
- Scrub PCS/TTP/ไอแต้ม **before** ก๊อต API switchover (would break the revenue path)

---

# 🛑 STOP — Read your role brief FIRST (force-read every Claude Code session)

ทุก dev ใช้ Claude Code ทำงาน async บน worktree ของตัวเอง. ก่อนแตะ code หรือตอบคำถาม — **เปิด brief ของคุณก่อน**:

| ถ้าคุณคือ… | เปิดไฟล์นี้ก่อนทุกอย่าง | คุณจะรู้ทันที |
|---|---|---|
| **ก๊อต** (Senior Advisor / Production Watcher) | [`docs/briefs/got.md`](docs/briefs/got.md) | P0/P1, ADRs ที่ต้อง lock, partner/tools picks |
| **เดฟ** (Project Lead / Integrator) | [`docs/briefs/dave.md`](docs/briefs/dave.md) | landing pivot, backend prep for ภูม, hardening |
| **ภูม** (Backend / Customer Portal / Admin) | [`docs/briefs/poom.md`](docs/briefs/poom.md) | container model, tax invoice, admin workflows |
| **ปอน** (Frontend / Landing / SEO / Marketing) | [`docs/briefs/podeng.md`](docs/briefs/podeng.md) | owner critiques, L-5 polish, SEO research |

📂 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map + onboarding flow + brief shape
📋 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (admin UI / RBAC system design)

**Why force-read?** แต่ละ brief สรุปว่า:
- คุณ own อะไร / ห้ามแตะอะไร (scope boundaries)
- งานต่อไปลำดับไหน (priority list — ไม่ต้อง re-derive จาก PORT_PLAN ทุกครั้ง)
- ติดอะไรอยู่ → ทำอะไรแทน (blockers + alternatives)
- Hand-off เข้า/ออก คุยกับใคร

อ่าน brief ก่อน → conversation รอบนี้ตรงเป้าตั้งแต่ tool call แรก. ข้าม brief = หลงเดิน.

---

# 👉 START HERE — ทีมงานทุกคน อ่านก่อนเริ่ม

📘 **[`docs/HANDBOOK.md`](docs/HANDBOOK.md)** = entry point — มี documentation map + quick start

**Canonical docs (อ่านครั้งเดียว ใช้ตลอด):**
- 👥 [`docs/team.md`](docs/team.md) — roles + permissions + branch + merge policy + daily workflow + §3.0 push-frequency cost rule (STRICTER — save-points only) + §6 self-directed mode + §9 Claude Code async collab
- 📐 [`docs/conventions.md`](docs/conventions.md) — code style + commit format + naming + DB rules + §13 docs rules (every .md ≤ 2000 lines · no duplication) + §14 pre-deploy smoke gate
- 🔐 [`docs/env.md`](docs/env.md) — every env var explained + production checklist (incl. §19 MOMO JMF)
- 🏢 [`docs/pacred-info.md`](docs/pacred-info.md) — company info SOT (addresses + phones + emails + LINE OA + sales reps)

**Role briefs (force-read — see top of file):**
- 🧑‍💻 [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md) — routing map for which brief is yours
- [`docs/briefs/got.md`](docs/briefs/got.md) · [`docs/briefs/dave.md`](docs/briefs/dave.md) · [`docs/briefs/poom.md`](docs/briefs/poom.md) · [`docs/briefs/podeng.md`](docs/briefs/podeng.md)
- 👷 [`docs/briefs/ops-roles.md`](docs/briefs/ops-roles.md) — 14 STAFF role workspaces (system design input)

**🎯 Master strategy (single-read consolidation — all briefs + ADRs + plans condensed):**
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session, refer back as needed

**🛠 Skills kit (playbooks the agent follows when triggered):**
- [`.claude/skills/INDEX.md`](.claude/skills/INDEX.md) — 16 skills: phase-verify-loop · bug-swarm-loop · debug-mantra · management-talk · audit-kpi-dashboard · test-coverage-writer · refactor-readability · performance-hunter · scholar-immortal · copyist-unlimited · legacy-php-sweep · qa-flow-simulator · branch-integrate-loop · mobile-first-verify · legacy-fidelity-check · landing-conversion-audit

**📚 Learnings (compounding knowledge — read before re-debugging):**
- [`docs/learnings/_index.md`](docs/learnings/_index.md) — every agent / dev adds new entries via `scholar-immortal` skill

**Living docs (เดฟ updates):**
- 🧭 [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) — **THE current direction (D1)** — faithful PCS Cargo port, Phase A/B/C. Start here for "what's next".
- 🚀 [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) — **the D1 master phase plan** — current state + the stages (A-final → B-0 → B-waves → C) + the work-lanes. The canonical "what's next" sequencing doc; deferred Phase-C/Tier detail kept as a labelled appendix.
- 🚚 [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) — **Phase A runbook ✅ DONE** — the `pcsc_main` (117 tables) → Supabase data migration; all 117 tables loaded on dev + prod (incl. 3 log tables backfilled post-Pro), customer images on S3 prod.
- 📋 [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) — sprint history + cargo/gap-hunt backlogs (Parts O–W; Part V = cargo-forensics, Part W = gap-hunt; ~1825 lines — watch the 2000-line cap)
- 📚 [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) — historic survey (Parts A–N — moved out to keep PORT_PLAN under 2000-line agent ceiling)
- 🏗 [`docs/architecture.md`](docs/architecture.md) — system diagrams + DB schema + auth + security
- 🏗 [`docs/architecture/container-centric-model.md`](docs/architecture/container-centric-model.md) — **NEW** warehouse/container/shipment spine (4 tables, RLS, status enums, CT-1..CT-8 implementation)
- 🤝 [`docs/integrations/momo-jmf.md`](docs/integrations/momo-jmf.md) — MOMO partner API spec (JWT, endpoint inventory TBD)
- 🧠 [`docs/PACRED-SECOND-BRAIN.md`](docs/PACRED-SECOND-BRAIN.md) — context notes + gotchas

**Reference (open เมื่อจำเป็น):**
- [`AGENTS.md`](AGENTS.md) — Next 16 breaking changes (สำหรับ Claude/AI)
- [`docs/decisions/*.md`](docs/decisions/) — ADRs (incl. 0010 V2/V3 version strategy, 0006 tax invoice, 0007 analytics, 0014 state transitions, 0015 withholding tax, 0016 freight value model)
- [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) — **NEW** LINE chat audit (จุดรั่ว + MOMO status enum canonical + workflows team really uses)
- [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) — **NEW** PHP cleanup sweep (~115 dead-code files + 6 NEW critical security findings + 5 minor port gaps)
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) — **NEW** decoded cargo/freight ops model (GZE truck / GZS sea · A/M/X/O/Z types · Form E / D-O / invoice-value engineering) + ไอแต้ม-chat problem catalog → PORT_PLAN Part V
- 🆕 [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md) — capability synthesis (growth / operating-system / build-vs-buy) → the Tier 0/1/2/3 roadmap. **Deferred to Phase C by D1** ([ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md)) — not the current "what's next".
- 🆕 [`docs/research/PACRED-MASTER-STRATEGY.md`](docs/research/PACRED-MASTER-STRATEGY.md) — **chained gap-hunt synthesis** — rolls the 5 source-code gap docs ([`docs/research/`](docs/research/_index.md)) into 4 problems: a 🔴 P0 security keystone (`driver`/`warehouse` RLS reach all money tables — fix launch-week), the 🔴 wallet-leak chain, the "islands with no bridges" flow-wiring workstream, and **[PORT_PLAN Part W](docs/PORT_PLAN.md)** backlog
- [`docs/audit/owasp-2026-05.md`](docs/audit/owasp-2026-05.md) — pre-launch security posture (note: superseded on RLS-vs-role-model by the master strategy §1)
- [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) — deep legacy PHP integrations audit (companion to legacy-cleanup-2026-05-16)
- [`docs/runbook/*.md`](docs/runbook/) — operational runbooks (PCS scrub + OTP rotation + cron + cargo smoke test T-D1)
- [`docs/setup/*.md`](docs/setup/) — onboarding guides (OAuth/Supabase/Vercel/LINE)
- [`supabase/migrations/README.md`](supabase/migrations/README.md) — migration runbook

**ทำงานครั้งแรก:**
1. **เปิด YOUR brief จาก [`docs/briefs/`](docs/briefs/)** ก่อนทุกอย่าง (force-read — see top of file)
2. อ่าน [`docs/HANDBOOK.md`](docs/HANDBOOK.md) → [`docs/team.md`](docs/team.md) → [`docs/conventions.md`](docs/conventions.md)
3. `cp .env.example .env.local` + fill values (ถามเดฟ) — รายละเอียดทุก var ใน [`docs/env.md`](docs/env.md)
4. รัน migration ที่ยังไม่ได้รัน — ดู [`supabase/migrations/README.md`](supabase/migrations/README.md)
5. หางานของตัวเอง: brief ของคุณ + [`docs/decisions/0017-pacred-faithful-pcs-port.md`](docs/decisions/0017-pacred-faithful-pcs-port.md) §"Work-split" (current per-role D1 work)
6. Sync branch ตามวิธีใน [`docs/team.md`](docs/team.md) §3 (น้อง pull จาก `dave` ไม่ใช่ `main`!) + §3.0 push-frequency rule (save-points only — sleep / machine change / location change / big batch done; per memory `push_frequency_strict`)

---

# Project Snapshot — pacred-web

Last updated: 2026-05-19 (D1 — Phase A data loaded to dev + prod · Phase B wave-1 integrated — see [ADR-0017](docs/decisions/0017-pacred-faithful-pcs-port.md) + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md))

> **Pacred** — ระบบเว็บไซต์บริษัทนำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน
> Marketing site + landing pages + customer member portal + admin back-office. The rebuilt app launched 2026-05-17, but on **2026-05-18 the owner redirected the project (D1)** — Pacred is now a **faithful port of the legacy PCS Cargo system** (`PCS` → `PR`). Current work: **Phase A ✅ DONE** (legacy `pcsc_main` fully loaded to prod Supabase — all 117 tables incl. 3 log tables backfilled post-Pro · customer images on S3 prod) → **Phase B in progress** (workflow fidelity — wave 1 integrated on `dave-pacred`, 1:1 transcription continues on customer + admin lanes — wave-17+ work also accumulating on `Poom-pacred` for V3 features). See the "CURRENT DIRECTION — D1" section at the top of this file + [`docs/UPGRADE_PLAN.md`](docs/UPGRADE_PLAN.md) for the full phase plan.

> 🎯 **Live state** — ดูที่ [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The "Auth & Backend State" section below and STRATEGY.md §9 describe the **rebuilt** app — that work is preserved + coexists with the ported `tb_*` schema during the D1 transition, but the rebuilt schema/workflow is no longer the target; the legacy PCS workflow is. Phase B reworks the app to match it.

## Stack
- Next.js **16.2.6** (App Router) — **โปรดอ่าน AGENTS.md: เวอร์ชันนี้มี breaking changes จาก training data**
- React 19.2.4
- TypeScript 5 (strict)
- Tailwind CSS v4 (`@theme inline` ใน [app/globals.css](app/globals.css) — ไม่มี tailwind.config.js)
- ESLint 9 (flat config, eslint-config-next)
- **next-intl** ^4.11.1 — i18n (th/en) แบบ namespace ใน [messages/](messages/)
- **next-themes** ^0.4.6 — light/dark mode
- **lucide-react** ^1.14.0 — icons (Lucide outline-style ทั้งโปรเจกต์)
- Package manager: **pnpm**

> หมายเหตุ: middleware อยู่ที่ [proxy.ts](proxy.ts) (ไม่ใช่ `middleware.ts` — เป็นรูปแบบของ Next 16)

## Scripts
- `pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`

## Conventions

📐 Full convention rules → [`docs/conventions.md`](docs/conventions.md) (CANONICAL — code style + commit format + naming + DB rules + §13 docs rules ≤2000 lines · no duplication + §14 pre-deploy smoke gate).

**Hot tips you'll trip on:**
- Path alias `@/*` → `./*`; locale prefix `as-needed`; default locale TH; `Link` from `@/i18n/navigation` (NOT `next/link`)
- Tailwind v4 → `@theme inline` in [`app/globals.css`](app/globals.css) (no `tailwind.config.js`); brand red = `primary-600` (#B30000)
- Component split: section-level → [`components/sections/`](components/sections/); reusable UI → [`components/ui/`](components/ui/); default Server Component unless state needed
- i18n: TH+EN parity in [`messages/th.json`](messages/th.json) + [`messages/en.json`](messages/en.json); `pnpm audit:i18n` enforces

## Folder Structure

📁 **Live tree** is the authoritative source — `ls app/[locale]/` to see actual routes. High-level shape:

- `app/[locale]/(public)/` — marketing site + landing pages (no auth)
- `app/[locale]/(auth)/` — login/register/forgot — guests only; auto-redirect signed-in to `/`
- `app/[locale]/(protected)/` — customer portal (dashboard / orders / wallet / shipments / etc.) — `requireAuth()` gate
- `app/[locale]/(admin)/admin/*` — admin back-office — `requireAdmin()` gate per [ADR-0002](docs/decisions/0002-admin-architecture.md)
- `actions/` — Server Actions (`actions/auth.ts`, `actions/wallet.ts`, etc.); admin variants in `actions/admin/*`
- `lib/` — `supabase/{client,server,admin}.ts` · `auth/*` · `sms/gateway.ts` · `notifications/*` · `validators/*` (Zod) · `pdf/*` · `forwarder/calc-price.ts`
- `supabase/migrations/` — 0001..0087 numbered migrations (`0065` is an intentional unused gap; `0081`-`0083` = the D1 legacy `tb_*` schema/indexes/member-seq, applied to dev + prod; `0087` = a migration-view security fix — see [`docs/runbook/pcs-data-migration.md`](docs/runbook/pcs-data-migration.md) §9; next free number `0088`); see [`supabase/migrations/README.md`](supabase/migrations/README.md)
- `proxy.ts` (NOT `middleware.ts` — Next 16 rename) at repo root

## Auth & Backend State (rebuilt app — coexists during the D1 transition)

> ⚠️ **D1 note:** this section describes the **rebuilt** app's auth/backend (Phase 1-5 pre-D1). Under D1 it **coexists** with the ported legacy `tb_*` schema and the legacy-auth bridge (`lib/auth/pcs-legacy-bridge.ts` — migrated PCS customers sign in with their existing password, no reset) during the transition, then retires. Phase-B work reworks these surfaces onto the `tb_*` schema.

### What works
- **Supabase Auth** — email/phone + password. Social login (Google/Facebook OAuth + LINE) is gated OFF by default behind `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` → the buttons render greyed-out "COMING SOON" (legacy PCS was password-only; D1 defers social login to Phase C)
- **Legacy-auth bridge** — `lib/auth/pcs-legacy-password.ts` + `pcs-legacy-bridge.ts` — migrated PCS customers sign in with their **existing** PCS password (no reset) via a "เชื่อมต่อบัญชี PCS CARGO" login; the 79-char legacy hash is verified against the ported `tb_users.userpass`
- **DB** — profiles (auto-gen `PR001` member_code — PR + min-3-digit running no.), documents, otp_codes, orders
- **Storage** — `member-docs/` private bucket, RLS = owner-only
- **OTP** — custom via ThaiBulkSMS, hashed (sha256+pepper), TTL 5min, rate-limited 3/hour
  - **`OTP_BYPASS=true`** in dev → skip SMS + accept any code
- **Sessions** — `proxy.ts` middleware refreshes tokens; cookies set by `@supabase/ssr`
- **Route guards** — `(auth)` redirects logged-in users; `(protected)` redirects guests + incomplete profiles
- **NavBar** — auto-aware: shows login/register buttons OR user menu (avatar + dropdown) based on session

### Pages live + current state

📊 **Live state snapshot** is in [`docs/STRATEGY.md`](docs/STRATEGY.md) §9 (shipped vs pending — updated each save-point). The lists below were Phase 1-5 historic — **current state lives in STRATEGY.md §9, not here**.

Shipped + in production: customer portal (`/service-order` · `/service-import` · `/service-payment` · `/wallet` +deposit/+history/+withdraw · `/refunds` · `/sales` · `/notifications` · `/shipments` +[code]) · `/admin/*` (60+ routes incl. accounting/container-costs · disbursements · refunds · migration/pcs-customers · search · system/crons · system/notifications) · tax-invoice flow · pay-from-wallet self-serve · customer credit line · staff RBAC console. **Post-launch U1/U2/U4 + Tier 0/1/2 features shipped on `dave`** — incl. `/contact` lead funnel · `/start-order` + `QuoteCTA` buy-bridge · `/admin/kpi` exec dashboard · `/admin/board` + `/admin/inbox` work-board. See STRATEGY.md §9 + [`docs/research/capability-tools-strategy-2026-05-18.md`](docs/research/capability-tools-strategy-2026-05-18.md).

## Architecture & Roadmap

📐 **Blueprint:** [`docs/architecture.md`](docs/architecture.md) — full diagrams, DB schema, auth flows, security model.

🎯 **Master strategy (single-read consolidation):** [`docs/STRATEGY.md`](docs/STRATEGY.md) — read once per session.

📋 **Locked decisions (ADRs):** [`docs/decisions/`](docs/decisions/) — 17 ADRs + drafts. The high-leverage ones:
- **ADR-0017 — D1: Pacred = faithful PCS Cargo port** (the current direction — supersedes the "V2 = rebuilt owner-pleaser" framing of ADR-0010)
- ADR-0001 LINE Notify → Messaging API push (creds set; LIFF pending DV-2)
- ADR-0002 admin architecture (`is_admin()` SECURITY DEFINER + `admins` table)
- ADR-0003 China-search Option E (Track G code, prod=demo mode)
- ADR-0004 PromptPay-only pre-beta; Omise/2C2P/Stripe = post-beta ([decision matrix](docs/decisions/d7-payment-gateway-decision-matrix.md) ready)
- ADR-0006 tax invoice (RD Code 86)
- ADR-0007 GTM + Clarity + cookie A/B
- ADR-0010 V2 vs V3 (`pacred-dpx`) — note: the "V2 = rebuilt owner-pleaser" definition is superseded by ADR-0017 (V2 is now the faithful PCS port); V3 unaffected
- ADR-0014 customer self-service state transitions (admin-client-after-ownership-verify)
- ADR-0015/0016 ✅ Accepted 2026-05-16 (WHT model + freight value model)
- ADR-0011/0012/0013 (DRAFT — V3 RBAC granular + ERP shell + V2→V3 migration; deferred T+30d)

🌱 **Infra stack:** Vercel + Supabase Cloud · `proxy.ts` middleware · ThaiBulkSMS OTP (`OTP_BYPASS` flag) · `member_code` = `PR001` running — **PR + minimum 3 digits**, overflow-safe past PR999 (Postgres trigger `generate_member_code`, migration `0060`; **NO compat with PHP `PCS<num>`** — Pacred is new company).

---

# 🌐 Pacred Ecosystem (brand + service catalogue)

> **Pacred** = บริษัทใหม่ (ไม่ใช่ PCS Cargo เดิม) — เป็น **all-in-one shipping/customs/cargo platform** ที่กินรวบทุกบริการในห่วงโซ่นำเข้า-ส่งออก
>
> ระบบ PHP เก่าครอบคลุมเฉพาะฝั่ง **Cargo** (จีน-ไทย ฝากสั่ง/ฝากนำเข้า/ฝากโอน) เท่านั้น — Pacred ขยายไปฝั่ง **Freight** (FCL/LCL ระหว่างประเทศ + customs/clearance/export) ครบทั้ง ecosystem

## Brand & social channels
- **Company:** Pacred
- **LINE OA:** https://lin.ee/Yg3fU0I  *(แทน LINE Notify เดิม — LINE Notify EOL Apr 2025)*
- **YouTube:** https://www.youtube.com/@PacredShipping
- **Facebook:** https://www.facebook.com/PacredShippingCustomsClearanceImportExport/
- **TikTok:** https://www.tiktok.com/@pacred.co
- **Instagram:** https://www.instagram.com/pacred.co/

## Service catalogue

แต่ละบริการมี **landing page ของตัวเอง** ที่ `/services/<slug>` (public, ไม่ต้อง login) — กดจาก landing เพื่อ "ใช้บริการ" → redirect เข้าระบบหลังบ้าน (`/(protected)/...`) ที่ตรงกับ service นั้น

| # | Service (TH) | slug | กลุ่ม | สถานะ in PHP เดิม | Backend module (Next.js) |
|---|---|---|---|---|---|
| 1 | จับคู่ลงทะเบียนกรมศุล / ตัวแทนออกของ (YY) | `customs-broker-matching` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 2 | ฝากสั่งซื้อสินค้า (China shopping cart) | `shop-order` | cargo | ✅ shops.php / cart.php | `(protected)/service-order/` |
| 3 | ฝากโอนชำระสินค้า (Yuan transfer / Alipay) | `yuan-transfer` | cargo | ✅ payment.php | `(protected)/service-payment/` |
| 4 | ฝากนำเข้าสินค้า — **FCL / LCL ทุกเทอม** (รถ/เรือ/แอร์) + **Cargo** (รถ/เรือ/แอร์) | `import` | both | 🟡 เฉพาะ cargo (forwarder.php) | `(protected)/service-import/` (รองรับ multi-mode) |
| 5 | ขอคืนภาษี (Tax refund) | `tax-refund` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 6 | เคลียร์สินค้าติดด่าน (รถ/เรือ/แอร์) | `customs-clearance` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 7 | ออกใบกำกับภาษี (Tax invoice) | `tax-invoice` | freight | partial (admin only ใน PHP) | TBD (ต่อยอดจาก receipts) |
| 8 | ออกใบขนสินค้า (Customs declaration form) | `shipping-document` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 9 | ส่งออกสินค้า (Export) | `export` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 10 | บริการฟูมิเกชัน (Fumigation) | `fumigation` | freight | ❌ ใหม่ทั้งหมด | TBD |
| 11 | บริการฝากขายสินค้า (Consignment) | `consignment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 12 | บริการฝากจ่ายบริการ (Pay-on-behalf services) | `bill-payment` | new | ❌ ใหม่ทั้งหมด | TBD |
| 13 | ขนส่งภายในประเทศ + ต่างประเทศ + แมสเซ็นเจอร์ (Logistics + Messenger) | `logistics` | both | ❌ ใหม่ทั้งหมด | TBD |

**กลุ่ม:**
- 🟦 **cargo** = ระบบเดิมจาก PHP `pcs-cargo` (จีน→ไทย, ฝากสั่ง/นำเข้า/โอน)
- 🟧 **freight** = ส่วนขยายใหม่ของ Pacred (international FCL/LCL, customs broker, export)
- 🟪 **both** = บริการที่ครอบคลุมทั้งสองฝั่ง
- ⬜ **new** = ฟีเจอร์ใหม่ที่ไม่เคยมีในเครือเดิม

## Routing convention (planned)

```
app/[locale]/(public)/
├─ page.tsx                       # home (มีแล้ว)
└─ services/
   ├─ page.tsx                    # ภาพรวมทุกบริการ (service grid)
   └─ [slug]/page.tsx             # landing แต่ละบริการ (dynamic, content จาก CMS หรือ MDX)

app/[locale]/(protected)/         # หลังบ้าน (ลูกค้า)
├─ service-order/                 # = slug shop-order
├─ service-payment/               # = slug yuan-transfer
├─ service-import/                # = slug import (รองรับ FCL/LCL/Cargo modes)
└─ ... (modules ใหม่ตาม service catalogue)
```

**หมายเหตุ:** อาจใช้ MDX-per-service หรือ Sanity/Payload CMS ถ้า marketing ต้องแก้ landing บ่อย — ตัดสินใจตอนเริ่ม Phase H (rebrand)

---

# 👥 Team & Branch workflow

> ⚠️ **CANONICAL doc moved to [`docs/team.md`](docs/team.md)** — full role/branch/merge policy + daily workflow + safety rules
> ห้าม duplicate รายละเอียดที่นี่ — อ่านที่ `docs/team.md` ครั้งเดียว ที่เดียว

**TL;DR:**

| คน | บทบาท | Branch | Push to main |
|---|---|---|---|
| **ก๊อต** | Senior Advisor | (review only) | ✅ |
| **เดฟ** | Project Lead | `dave` | ✅ |
| **ปอน** | Frontend & SEO | `podeng` | ❌ (own branch) |
| **ภูม** | Backend & Cargo Port | `Poom` | ❌ (own branch) |

**Daily sync (every morning):**
```bash
git checkout main && git pull origin main
git checkout <my-branch> && git merge main && git push origin <my-branch>
```

**Conflict / safety:** อย่าใช้ `--force` / `reset --hard` ถ้าไม่แน่ใจ — full safety rules ใน [`docs/team.md`](docs/team.md) §5

---

## Working with this codebase

### Add a section to home
- New component in [components/sections/](components/sections/)
- Import in [app/[locale]/(public)/page.tsx](app/[locale]/(public)/page.tsx)

### Add a new feature/system (pattern)
1. SQL: add table + RLS in `supabase/migrations/NNNN_<name>.sql`
2. Validator: Zod schema in `lib/validators/<name>.ts`
3. Server Action: mutations in `actions/<name>.ts` (`"use server"`)
4. Pages: under `app/[locale]/(protected)/<name>/` (auth-guarded)
5. i18n: add keys in [messages/th.json](messages/th.json) + [messages/en.json](messages/en.json) namespace
6. (optional) Realtime: subscribe via `supabase.channel(...)` in `"use client"` component

→ See [actions/orders.ts](actions/orders.ts) + [app/[locale]/(protected)/orders/](app/[locale]/(protected)/orders/) as a working reference

### Common edits
- Locale string → both `messages/th.json` + `messages/en.json`
- Theme color → `@theme inline` in [app/globals.css](app/globals.css)
- Auth check on a page → `await requireAuth()` from `lib/auth/require-auth.ts`
- Get current user → `await getCurrentUserWithProfile()` from `lib/auth/get-user.ts`
- Mutate Supabase from Server Action → `await createClient()` from `lib/supabase/server.ts`
- Bypass RLS (admin only) → `createAdminClient()` from `lib/supabase/admin.ts`

---

# 📋 Legacy PHP Port Plan (in progress)

> **Goal:** Port ทั้งระบบ PHP เดิม (`/Users/dev/Desktop/pcscargo/member/` บน Mac · `C:\xampp\htdocs\pcscargo\member\` บน Windows) มาเป็น Next.js + Supabase
> **Strategy:** เอา **logic + structure** มาก่อน ไม่ต้อง migrate data → ค่อย rebrand UI/UX + จัดกลุ่มใหม่ในเฟสถัดไป
> **Order:** ฝั่งลูกค้าก่อน (member portal) → ฝั่ง admin (back office)
>
> ⚠️ **Scope reminder:** PHP เดิมครอบทั้ง **cargo** (services #2, #3, #4-cargo-mode) **+ freight** (ใน `pcs-admin/include/pages/{home/Freight, home/CargoAndFreight, hs-forwarder-invoice, forwarder-quotation, withdraw-commission-*}`) — services อื่น (`#1, #5-13`) ต้อง **build ใหม่ทั้งหมด** ในเฟสถัดไป (Phase I+)
>
> 🆕 **AUTHORITATIVE gap status (2026-05-16 night):** [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) — เดฟ-led 4-agent deep-sweep against 20,331 .php files + verification pass. Found **17 NEW DB tables** + **12 freight subdirs** + **24 admin polish items** that the prior `legacy-cleanup-2026-05-16` audit §6 missed. The deep-sweep audit replaces §6 "should-port" assessment; tables below remain useful as **customer-side / admin-side historical reference** but for current Sunday-night blockers + V2 long-phase backlog **read the deep-sweep doc + [PORT_PLAN Part V](docs/PORT_PLAN.md) V-E6..V-E12 / V-G / V-H**.

## Survey snapshot (สำรวจแล้ว 2026-05-12; updated 2026-05-16 deep-sweep)

- **PHP source:** `/Users/dev/Desktop/pcscargo/member/` (Mac) · `C:\xampp\htdocs\pcscargo\member\` (Windows) — 20,331 .php files / 2.2 GB
- **DB:** MySQL `pcsc_main` (110+ tables; full schema in legacy SQL dumps)
- **member_code เดิม:** `PCS<int>` (PHP) — **ทิ้งไม่ใช้**; Pacred ใช้ `PR001` running (PR + ขั้นต่ำ 3 หลัก)
- **Stack PHP:** mysqli plain SQL, mPDF (THSarabunNew), PHPMailer, Bootstrap 4

## Customer-side / Admin-side feature maps + migration concerns + integrations

**Authoritative live docs (read these, not duplicates below):**

| What you need | Where it lives |
|---|---|
| Per-feature port status + tasks | [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (most active) + archive Parts A-N |
| Master gap audit (20k file sweep) | [`docs/audit/php-deep-sweep-2026-05-16.md`](docs/audit/php-deep-sweep-2026-05-16.md) |
| Deep integrations + secrets inventory | [`docs/audit/php-pcscargo-integrations.md`](docs/audit/php-pcscargo-integrations.md) (TAMIT, JMF, LINE Notify, SMS, OAuth, mPDF) |
| Dead-code + security findings (S-1..S-6) | [`docs/audit/legacy-cleanup-2026-05-16.md`](docs/audit/legacy-cleanup-2026-05-16.md) §1-5 (§6 superseded by deep-sweep) |
| Cargo ops decoded (GZE/GZS / A-M-X-O-Z / Form E / D-O / "แผน VAT") | [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) |
| Chat-derived workflows (W-1..W-9) + leak holes (L-1..L-10) | [`docs/audit/chat-analysis-2026-05-16.md`](docs/audit/chat-analysis-2026-05-16.md) |
| Cutover dependency burn-down (F1-1..F1-8) | [`docs/runbook/legacy-cutover-tracker.md`](docs/runbook/legacy-cutover-tracker.md) |
| Per-task implementation specs (V-D / V-E / V-G / etc.) | [`docs/port-specs/`](docs/port-specs/) — 10 spec docs |
| Per-task ADR decisions | [`docs/decisions/`](docs/decisions/) — 16 ADRs + 5 plans/matrices |

## Phased roadmap

> **Historic Phase A-I list moved to:** [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) Parts O-V (live) + [`docs/sprints/archive-a-to-n.md`](docs/sprints/archive-a-to-n.md) (Phase A-N historic).
>
> **Current state (2026-05-16):** Phase A-F ✅ shipped · Phase G admin back-office ~98% HR + ~50% ops + 60+ routes shipped · Phase H polish ongoing · Phase I expansion = V2 long-phase post-Monday-launch ([port-specs/](docs/port-specs/) for V-E6..V-E12 freight stack + V-G admin polish).

## Key references (อย่าลืม consult)

- **PHP source:** `/Users/dev/Desktop/pcscargo/` (Mac) · `C:\xampp\htdocs\pcscargo\` (Windows)
- **Admin source:** `<root>/member/pcs-admin/` (187 entry .php + 85 business-logic subdirs under `include/pages/`)
- **Helper catalogue:** `<root>/member/include/function.php` (2451 LOC) + `<root>/member/pcs-admin/include/function.php` (3500 LOC)
- **Schema dump:** legacy SQL dumps (see `docs/audit/legacy-cleanup-2026-05-16.md` §7)
- **Use legacy-php-sweep skill** (`.claude/skills/legacy-php-sweep/SKILL.md`) when porting any feature
