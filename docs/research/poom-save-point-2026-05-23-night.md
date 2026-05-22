# 🏠 Save-point — 2026-05-23 ดึก (ก่อนกลับบ้าน)

> **อ่านไฟล์นี้ก่อนทุกอย่าง** ที่บ้าน. ครอบคลุม: 10 commits ของ session นี้ ·
> สถานะ prod (DB + Storage) · pending actions · resume commands

---

## 📦 10 commits ลง `Poom-pacred` แล้ว — `d2f5db1` → `bac69fa`

```
bac69fa fix(migration): 0095 final — abandon sequence, use MAX()+1 (no cache)
4123f86 chore(migration): apply 0095 step 1/2 — renamed 4 colliding profiles
f6922dd feat(migration): 0095 — PR sequence shift + 4-collision fix
855776e fix(admin): wallet-list slip URL + white sidebar with brand-red accents
044ac38 feat(storage): Wave 13 — wire 7 admin surfaces to legacy signed URLs
df8dfcc style(admin): re-theme brand chrome from indigo/purple to Pacred red
d702b36 feat(backfill): backfill 06 — add wp-prod + seafreight-wp rules
7616e2d feat(backfill): backfill 06 — full prod FTP upload via S3 protocol
39ae01f feat(backfill): backfill 05 — upload 732 more files from newrealdatapcs/pcscargo.rar
d2f5db1 fix(forwarders/new): Wave 12-C v2 — match legacy modal exactly + backfill slips
```

---

## ✅ สิ่งที่ shipped + browser-verified

| งาน | ผลลัพธ์ |
|---|---|
| **Wave 12-C v2** `/admin/forwarders/new` | 9 ช่องตรง legacy modal เปะๆ · cascading coid→user→address · PCS pickup hardcoded · browser-tested บน prod |
| **Backfill 02-06** Supabase Storage | **84,399 ไฟล์ · ~11.5 GB** บน prod (`yzljakczhwrpbxflnmco`) ครบทุก historic slip/cover/PDF/WP-media |
| **Wave 13** wire 7 admin surfaces | `wallet/[id]` · `cnt-hs/[id]` · `yuan-payments/[id]` · `customers/[id]` · `forwarders` (list+history+action) · `forwarders/forwarder-action` — รูปขึ้นครบ |
| **Wave 13.1** wallet list "ดู" 404 fix | บน prod กดเข้าสลิป OK |
| **Admin theme** indigo→purple → **Pacred red** | `PageTopMenubar` + KPI primary + booking submit + migration icon |
| **Sidebar** dark → **ขาว** + brand-red active | soft shadow ตัดกับ main content |
| **Migration 0095** PR collision fix | 4 profiles renamed PR120-124 → PR10900-10903 · trigger ใหม่ใช้ MAX()+1 (ไม่ใช้ sequence) · next signup → PR11100+ |

---

## 🚨 Pending actions ที่ภูมิต้องทำเอง

### 1. **Rotate S3 access key** (security · DO FIRST)

S3 key หลุดในแชท: `e913d7da34ca0089638f100afb74c972`

→ Supabase Dashboard → Project Settings → Storage → S3 Access Keys → **delete row นั้น**

แล้วลบ key เก่าออกจาก `.env.local` ของเครื่องที่บ้าน (ถ้ามี copy ไป):
```
SUPABASE_S3_ENDPOINT
SUPABASE_S3_REGION
SUPABASE_S3_ACCESS_KEY_ID
SUPABASE_S3_SECRET_ACCESS_KEY
```

(backfill 06 จบแล้ว · ไม่ต้องใช้ key นี้อีก)

### 2. (Optional) แจ้งลูกค้า 4 คนที่ member_code เปลี่ยน

ถ้าภูมิ/พี่ป๊อปอยากแจ้งลูกค้าใหม่ 4 คนนี้ว่าเลข PR เปลี่ยน:

| Old | New | ลูกค้า | เบอร์ |
|---|---|---|---|
| PR124 | PR10900 | อรยา แซ่เต็ง | +66980166376 |
| PR122 | PR10901 | TEST PASSOTP | +66921313786 |
| PR121 | PR10902 | พิสิฏฐ์ กุมมลลือ | +66841113178 |
| PR120 | PR10903 | Chitmg | +66457863641 |

(ถ้ายังไม่เคย login หรือใช้ PR-code → skip ได้เลย)

### 3. Deploy `Poom-pacred` → `main`

ผม push ทุก commit ขึ้น `Poom-pacred` แล้ว · พร้อม merge เข้า `main` เมื่อภูมิ + ก๊อตพร้อมรีวิว

---

## 🏠 Resume commands ที่บ้าน

```bash
# 1. Pull latest
cd ~/pacred-web         # หรือ C:\Users\Admin\pacred-web\
git fetch origin
git checkout Poom-pacred
git pull origin Poom-pacred
git log --oneline -5     # ต้องเห็น bac69fa อยู่บนสุด

# 2. Verify env.local (sync จากเครื่องนี้ ผ่าน LINE/Signal)
cat .env.local | grep NEXT_PUBLIC_SUPABASE_URL
# ต้องเป็น https://yzljakczhwrpbxflnmco.supabase.co (prod)

# 3. Install + dev
pnpm install
pnpm dev                  # localhost:3000

# 4. Browser smoke (optional)
# เปิด /admin/wallet → กดสลิปดู (ต้องเห็นรูป)
# เปิด /admin/forwarders → cover thumbnails ต้องขึ้น
# Sidebar ต้องเป็นสีขาว + brand-red accent
```

---

## 📚 Skills / docs ที่ session นี้สร้าง/อัพเดต

- `lib/storage/legacy-resolver.ts` — Helper `resolveLegacyUrl()` + `resolveLegacyUrlMap()` (smart filename→signed-URL mapper · 9 kinds: slip/cover/profile/admin-avatar/notify/file/csv/wp/profile-thumb)
- `scripts/backfill/06-upload-prod-ftp.ts` — S3 protocol bulk upload · 9 rules · resumable progress (`.progress/06-<rule>.json`)
- `scripts/backfill/07-verify-buckets.ts` — list 5 samples per bucket + signed URLs · ใช้ debug ได้ตลอด
- `scripts/survey-pr-sequence.ts` + `survey-pr-collisions.ts` + `apply-0095-renames.ts` + `verify-0095.ts` — PR collision survey + fix tools
- `supabase/migrations/0095_pr_sequence_shift_collision_fix.sql` — applied · live ใน prod แล้ว
- `docs/learnings/supabase-storage-bulk-upload.md` — backfill 02-06 pattern + S3 vs supabase-js + dev-sample-as-floor lesson

---

## 🧠 Learning ใหญ่ที่ควรจะ capture (ยังไม่ได้เขียน — ทำที่บ้าน)

**Topic:** `docs/learnings/supabase-rls-patterns.md` (เพิ่ม entry)

**"PostgreSQL sequence + Supabase PgBouncer = trap"**

- ALTER SEQUENCE RESTART / DROP+CREATE / CACHE=1 **ไม่ invalidate** session-cached batches ที่ PgBouncer pool ถืออยู่
- Pool session อายุยืน (หลายชม.) — cached values เก่าออกมาเรื่อยๆ
- Dashboard query (`select nextval()`) เห็นค่าใหม่ · แต่ trigger ใน pooled session เห็นค่าเก่า
- **Workaround:** อย่าใช้ sequence สำหรับ logic ที่ต้อง predict-value แม่นยำ — ใช้ `MAX()+1` query + UNIQUE constraint แทน
- **เสียเวลา 4 รอบ debug** ก่อนเจอ root cause → write up เพื่อไม่ให้ session ต่อไปเสียอีก

ไฟล์ที่จะอัพเดต:
- `docs/learnings/supabase-rls-patterns.md` — append entry
- `docs/learnings/_index.md` — bump "Last reviewed" + topic table

---

## 📊 รวมไฟล์บน prod Supabase Storage (after session นี้)

| Bucket / Prefix | ไฟล์ | ที่ใช้ |
|---|---|---|
| `slips/legacy/` | 35,515 | wallet topup slip + cnt-hs slip historic |
| `forwarder-covers/legacy-shops/` | 40,686 | shop logo + forwarder cover (legacy mixed) |
| `member-docs/legacy-images/{admin,users,notify}/` | 871 | staff/customer profile pics + notify images |
| `member-docs/legacy-uploads/{file,csv}/` | 1,251 | ID card + CSV imports |
| `member-docs/legacy-wp/uploads/` | 4,916 | pcscargo.com WordPress media |
| `member-docs/legacy-pcsfreight-wp/uploads/` | 252 | sister site WP media |
| `member-docs/legacy-shop/` | 32 | demo shop product photos |
| `member-docs/legacy-pcs-admin/` | 4 | f-receipt + include reference images |
| `member-docs/legacy-misc/{img,sms}/` | 2 | misc |
| **TOTAL** | **~83,529** | **~11.5 GB** |

---

## ⏭ งานต่อไป (ลำดับ priority)

1. **Rotate S3 key** (security · do first)
2. (Optional) แจ้งลูกค้า 4 คน
3. Capture learning เรื่อง PgBouncer sequence trap → `docs/learnings/supabase-rls-patterns.md`
4. Deploy `Poom-pacred` → `main` (ก๊อต review)
5. Wave 14 (next) — เลือกจาก:
   - QA flow simulator บน prod (test register → wallet topup → forwarder create → cnt-hs end-to-end)
   - Fidelity gap audit ที่ค้าง (ตาม `docs/audit/fidelity-gap-2026-05-23.md` ที่เขียนไว้ก่อนหน้านี้)
   - Phase A migration backlog (`tb_priceuser_*` unblock rates pages)

---

**Session นี้:** 4 ชั่วโมงครึ่ง · 10 commits · 84K files uploaded · 3 ภูม-flagged issues fixed · 1 long debug loop ที่ภูมิ patience สูงมาก 🙏
