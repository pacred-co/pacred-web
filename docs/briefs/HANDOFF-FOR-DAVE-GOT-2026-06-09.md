# 🤝 Handoff for พี่เดฟ + พี่ก๊อต — 2026-06-09 PM

> Written by ภูม's session (Poom-pacred branch). Read when you pull branch for review.

---

## TL;DR

**Branch `Poom-pacred = 84602794`** = staff โกดังพร้อมใช้พรุ่งนี้เช้า · เก็บ P0 ครบ 6 rounds + agent A schema-swap driver-runs · ภูม รัน migrations 0152, 0154-0157 บน prod เรียบร้อย.

**ภูม ขอ merge Poom-pacred → main + push** ก่อน staff มาใช้พรุ่งนี้ — ตอนนี้ main = `c3214ef5` (ก่อนงาน warehouse RBAC) → pacred.co.th ใช้งานโดย warehouse role **จะ redirect ออก** (= โกดังเข้าระบบไม่ได้).

---

## 🔴 OWNER / DAVE / GOT ACTION ITEMS

### #1 Update `SUPABASE_DB_PASSWORD` in Vercel (พี่เดฟ หรือ พี่ก๊อต ทำ)

**Issue:** Password DB ใน Vercel ปัจจุบันอาจเป็นรหัสเก่า (`<old-pw-redacted>` ของ project Supabase เก่า `yzljakczhwrpbxflnmco`) · ถ้าไม่อัพเดต บาง direct-DB call จาก server-side scripts / migrations / cron จะ fail (REST API ผ่าน anon/service-role key ไม่กระทบ).

**Project:** Pacred main (Vercel dashboard → pacred-web → Settings → Environment Variables → `SUPABASE_DB_PASSWORD`)

**ค่าที่ต้องใส่ (พี่ก๊อตให้รหัสมา · ภูม verify แล้ว 2026-06-09):**

```
SUPABASE_DB_PASSWORD=<new value — ask ภูม / secure channel · scrubbed from git for security>
```
> 🔐 เดฟ scrubbed the literal password from this doc 2026-06-09 (committing a prod DB password to git = security risk; it's in `.env.local` which is gitignored). ⚠️ **Owner: rotate this DB password** — it was committed to `Poom-pacred` git history before this scrub.
> ⚠️ **CRITICAL — prod Supabase project mismatch (needs owner confirm):** this doc names prod as `lozntlidlqqzzcaathnm`, but the session `.env.local` + CLAUDE.md + the migration ledger + ALL of เดฟ's migrations (0158–0166) target `yzljakczhwrpbxflnmco`. **Which project does Vercel prod actually point at?** If Vercel `NEXT_PUBLIC_SUPABASE_URL` = `yzljakczhwrpbxflnmco`, the deep-source build is correct + safe to deploy. If it = `lozntlidlqqzzcaathnm`, เดฟ's migrations must be re-applied there before main deploy. **Confirm before pushing to main.**

✅ ทดสอบ connect prod DB (`lozntlidlqqzzcaathnm` · port 5432 · user `postgres`) ผ่านทันที 2026-06-09 PM.

**Local `.env.local`** ของ session นี้ update แล้ว (backup เก่าอยู่ `.env.local.bak.*`). ภูม รัน migration 0158 + 0159 ผ่าน prod เรียบร้อยด้วยรหัสนี้.

**Verify after Vercel update:** ลอง trigger cron manually (`curl https://pacred.co.th/api/cron/momo-sync -H 'authorization: Bearer $CRON_SECRET'`) → ต้อง 200 + log มี `propagation_updated > 0` ภายใน 10 นาที.

---

### #2 Merge Poom-pacred → main (พี่เดฟ — owner directive)

**Why urgent:** Staff โกดังพรุ่งนี้ใช้ pacred.co.th (= main branch) · main ยังเป็น `c3214ef5` (ก่อน warehouse round 1-6). ถ้าไม่ merge → warehouse role redirect ออกจาก /admin · ใช้งานไม่ได้.

**Branch contains (6 rounds + agent A merge):**
- Round 1 (`25b1f5a3`): Phase barcode + qa + 4 forwarders pages + 60 test guard for phase-access
- Round 2 (`fb0f8aa7`): driver-runs Phase removal + sidebar cleanup + dimensions save
- Round 3 (`35c860d4`): 13 inline-edit actions add "warehouse" role (`actions/admin/forwarders-field-edits.ts`)
- Round 4 (`da794874`): /admin warehouse-only redirect → /admin/forwarders/warehouse-history
- Round 5 (`7e68d0d2`): sales/qa/manager admin landing + scrollbar-x-visible + driver pre-provision (3 รายชื่อ)
- Round 6 (`a6d7c336` merged via `84602794`): /admin/driver-runs schema-swap from rebuilt empty `forwarder_driver` → live `tb_forwarder_driver_item` (29,782 rows)

**Verify ก่อน push main:**
```
git checkout main
git merge origin/Poom-pacred --no-edit
{ pnpm verify; } > /tmp/v.log 2>&1; echo "EXIT=$?"
# real exit must be 0 — NEVER pipe through | tail
pnpm build > /tmp/b.log 2>&1; echo "EXIT=$?"
git push origin main
```

**Migrations:** 0152, 0154-0157 ภูม รันแล้วบน prod (Supabase lozntlidlqqzzcaathnm) · `git push origin main` = แค่ deploy code ไม่ต้อง re-apply.

---

### #3 Briefing for พี่เดฟ when reviewing

**Schema-note (agent A finding ใน round 6):**
`tb_forwarder_driver_item` **ไม่มี per-item completed-at timestamp** · agent ใช้ `batch.fddate` (วันที่ batch สร้าง · last 7 days) เป็น proxy สำหรับ "ส่งสำเร็จล่าสุด" filter. Imprecise แต่ functional. → P1 plan = เพิ่ม column `fdicompletedat` ใน migration ใหม่ + update `markDriverItemDelivered` action (`actions/admin/driver-work.ts:414`) ให้เขียน timestamp ตอน flip fdistatus '1' → '2'.

**Driver pre-provision (round 5):** ป๊อด/แมน/พุด มี admin rows แล้ว (PR063/PR064/PR066) · ภูม assign งานพรุ่งนี้ผ่าน UI ได้ทันทีหลัง deploy.

**Dead-write fix (round 6):** เดิม `/admin/driver-runs` อ่าน rebuilt empty `forwarder_driver` (0 rows) → sales/accounting เห็นว่างเปล่า · swap แล้วเห็น 29,782 live rows + audience changed from "driver self-view" → "sales/accounting oversight" (kept DISBURSEMENT_MENUBAR).

---

## 🟢 P1 backlog (กำลังลุย — agent spawning ใน session ภูม)

ภูม session กำลังทำ parallel:
1. **MOMO_CRON_AUTOCOMMIT** safety toggle docs (gated env · default OFF · code พร้อม `app/api/cron/momo-sync/route.ts:104`)
2. **CTT cron** live mode wire-up (ปัจจุบัน DRY-RUN ใน `ctt-adapter.ts`)
3. **`fdicompletedat` column** migration ใหม่ + repoint code (schema gap จาก #3 บน)
4. (Browser test 3 new roles · ภูม manually พรุ่งนี้)

จะ push เพิ่มเติมเข้า Poom-pacred branch ก่อนพี่เดฟ merge.

---

🙏 ขอบคุณพี่เดฟ + พี่ก๊อต · ภูม
