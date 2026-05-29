# 🚀 Hand-off 2026-05-30 — ส่งงานต่อทุกคน · แยกย้ายรันงาน
**By:** เดฟ · **Plan:** single-repo (pacred-web) · owner final · pacred-admin-next แขวนไว้

---

## 🗺 Branch model (จำให้ขึ้นใจ)

```
InwPond007 (ปอน) ──┐
Poom-pacred (ภูม) ──┼─→ dave-pacred (เดฟ verify) ─→ main ─→ Vercel (pacred.co.th)
podeng (ปอน MOMO) ─┘                                  production
```
ทุกคน sync **dave-pacred** · dave-pacred sync **main** · main = production.

---

## 🔄 MOMO sync — ที่เดียว = main (ตัดสินแล้ว)

Single-repo → **1 deploy (main) → 1 cron**. momo-sync ดึงจาก MOMO API **ที่เดียวบน main** เท่านั้น — ไม่มี double-pull.
- **ภูม's MOMO sync = canonical** (Poom-pacred · cron auto-pull ทุก 10 นาที · commit-tracking UI)
- ไหลเข้า main ทาง: Poom-pacred → dave-pacred → main
- ปอน's podeng MOMO Phase A-D (data foundation) = ตาราง apply prod แล้ว · consuming code reconcile กับ ภูม ตอน integrate (อย่าสร้าง cron ซ้ำตัวที่ 2)
- ตอน integrate: ใช้ `*/10 * * * *` momo-sync ของ ภูม (ตัวเดียว) ใน vercel.json main

---

## 🟢 ปอน — InwPond007 (หน้าบ้าน + member ลูกค้า)

**Sync:**
```bash
cd <pacred-clone>
git checkout InwPond007
git pull origin dave-pacred --no-edit    # = main ล่าสุด
pnpm dev                                  # :3000
```
**งาน:** หน้าบ้านเว็บไซต์ + หลังบ้าน member ลูกค้า **ทั้งหมด**
**Scope:** `app/[locale]/(public,auth,protected)/**` · `components/**` · `messages/**`
**MOMO:** podeng = LOCKED · เอาแค่ MOMO มาต่อ (ถ้ามี update MOMO → cherry-pick เฉพาะ MOMO commit เข้า InwPond007 หรือบอกเดฟ integrate)
**Push:** `git push origin InwPond007` → เดฟ verify → main

---

## 🟠 ภูม — Poom-pacred (Admin หลังบ้านพนักงาน · owner approved)

**⚠️ ทำก่อนอื่น — renumber migration (กัน collision กับ main):**
```bash
git checkout Poom-pacred
git mv supabase/migrations/0118_admins_role_manager.sql supabase/migrations/0123_admins_role_manager.sql
git mv supabase/migrations/0119_momo_commit_tracking.sql  supabase/migrations/0124_momo_commit_tracking.sql
git commit -m "chore(migrations): renumber 0118→0123, 0119→0124 (collision w/ main ปอน MOMO)"
git pull origin dave-pacred --no-edit     # ได้ ปอน's 0118-0122 + งาน main ล่าสุด (resolve ถ้าชน)
git push origin Poom-pacred
pnpm dev                                  # :3000 (admin routes /admin/*)
```
> ภูม 0118+0119 apply prod เองแล้ว · renumber = แค่เปลี่ยนชื่อไฟล์ · ไม่ต้อง run migration ซ้ำ

**migration ใหม่ต่อจากนี้:** ใช้ **0125+** (เช็ค `docs/runbook/migration-ledger.md` ก่อนเสมอ · บอกเดฟ)
**งาน:** Admin หลังบ้านพนักงาน ต่อจาก Wave 30 (owner approved)
**Scope:** `app/[locale]/(admin)/admin/**` + admin actions/lib
**Push:** `git push origin Poom-pacred` → เดฟ integrate → main

---

## 🟢 เดฟ — dave-pacred (integrator → main)

**งาน integrator (ลำดับ):**
1. **Integrate Poom-pacred → main** (ภูม admin 46 commits · หลัง ภูม renumber + push)
   - `branch-integrate-loop` skill · verify migration 0123/0124 ไม่ชน · build + lint green
2. **Integrate podeng MOMO → main** (9 commits · surgical cherry-pick MOMO only · podeng 36 behind · LOCKED except MOMO) · reconcile MOMO sync = ภูม's เป็นหลัก (ไม่ซ้ำ cron)
3. **ก๊อต infra ส่งต่อ:** CRON_SECRET (cron 11 jobs ตาย 401) + S3 rotate (leaked) — `docs/runbook/got-vercel-cloudflare-admin2-setup.md` §1/§6
4. **P0 backlog:** 3 BIG cluster D (search · 5 reports · containers-hs) + 4 LOAD-BEARING fidelity gaps

**own branch own งาน:** dave-pacred = main (clean) · เริ่ม integrate ได้เลย

---

## 📊 State ตอนส่งงาน (2026-05-30)

| Branch | HEAD | vs main | งานค้าง integrate |
|---|---|---|---|
| main | `6fb332e2` | — | production |
| dave-pacred | `6fb332e2` | 0/0 | = main |
| InwPond007 | `6fb332e2` | 0/0 | = main (ปอน clean base) |
| podeng | `b2bf7ef4` | 36/9 | MOMO Phase A-D (cherry-pick) |
| Poom-pacred | `1e2104cc` | 3/46 | Admin Wave 27-30 (renumber + integrate) |

**Prod migration:** 0001-0122 (ปอน MOMO) + ภูม 0118/0119 → **next = 0125** (`docs/runbook/migration-ledger.md`)

---

## 🔗 อ่านเพิ่ม
- Migration: `docs/runbook/migration-ledger.md` (canonical · เลขถัดไป · renumber)
- Strategy reset เต็ม: `docs/review-2026-05-30-strategy-reset.md`
- B-4 audit (10 P0 + 33 P1): `docs/audit/b4-click-through-cluster-{a,b,c,d}-2026-05-28.md`
- 4 fidelity gaps: `docs/audit/fidelity-auth-screens-2026-05-28.md`
