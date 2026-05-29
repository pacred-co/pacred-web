# 2-Repo Workflow — ปอน + ภูม
**Created:** 2026-05-28 ดึก-2 (เดฟ)
**Status:** Active · ใช้ทันที post-2-repo architecture

ตั้งแต่ 2026-05-28 ดึก-2 — admin work ย้ายจาก `pacred-web` ไปอยู่ใน repo แยก `pacred-admin-next` ตาม ก๊อต directive. ปอน ยังอยู่ pacred-web เหมือนเดิม.

---

## 🗺 Big picture

```
┌─────────────────────────────────────────────┐  ┌─────────────────────────────┐
│ pacred-web                                  │  │ pacred-admin-next           │
│ → frontend + customer member portal         │  │ → admin back-office only    │
│                                             │  │                             │
│  InwPond007 (ปอน)  ───┐                    │  │  admin (ภูม)                │
│  podeng (sub-task)    │                    │  │   ↓ ก๊อต baseline + ภูม fill │
│  dave-pacred (เดฟ)  ──┴→ main → Vercel    │  │  main → Vercel              │
│                                             │  │                             │
│ Shared: Supabase prod pprrlabgebrnocthwdmg │←→│ Same DB · same env · same   │
└─────────────────────────────────────────────┘  └─────────────────────────────┘
            pacred.co.th                          (admin sub-domain TBD)
```

**สำคัญ:** ทั้ง 2 repo **ชี้ Supabase prod เดียวกัน** → schema/data มีชุดเดียว · ใครแก้อะไรไม่ชนกันเพราะ code-base แยกกัน.

---

## 🟢 ปอน — pacred-web / InwPond007

### Setup (ครั้งแรกหรือเครื่องใหม่)
```bash
git clone https://github.com/pacred-co/pacred-web
cd pacred-web
bash scripts/setup-podeng.sh        # auto: checkout InwPond007 + pull dave-pacred + pnpm install
# ขอ .env.local จากเดฟ
```

### Daily workflow
```bash
cd pacred-web
git checkout InwPond007
git pull origin dave-pacred --no-edit  # absorb งาน main ล่าสุด
pnpm dev                               # → http://localhost:3000

# ... ทำงาน, commit ไปเรื่อยๆ ...

git push origin InwPond007             # save-point only
```

### Scope
| ✅ ทำได้ | ❌ ห้ามแตะ |
|---|---|
| `app/[locale]/(public)/**` | `app/[locale]/(admin)/admin/**` (ย้ายไป pacred-admin-next) |
| `app/[locale]/(auth)/**` | `supabase/migrations/**` (บอกเดฟก่อน) |
| `app/[locale]/(protected)/**` | |
| `components/sections/**` + `components/ui/**` | |
| `messages/{th,en}.json` | |

---

## 🟠 ภูม — pacred-admin-next / admin (NEW repo)

### Setup (ครั้งแรก — repo ใหม่ ไม่ใช่ pacred-web)
```bash
cd C:\Users\Admin                                 # หรือที่ไหนก็ได้
git clone https://github.com/pacred-co/pacred-admin-next
cd pacred-admin-next
echo "engine-strict=false" > .npmrc               # bypass Node 22 lock
pnpm install
# ขอ .env.local จากเดฟ
pnpm dev --port 3001                              # → http://localhost:3001
```

### Daily workflow
```bash
cd pacred-admin-next
git checkout admin
git pull origin admin --no-edit        # ตอนนี้ ภูม ทำคนเดียว ปกติไม่มีอะไรใหม่
# (occasional) git pull origin main --no-edit  ถ้า ก๊อต patch main
pnpm dev --port 3001                   # → http://localhost:3001 (DEV_BYPASS=true)

# ... ทำงาน, commit ไปเรื่อยๆ ...

git push origin admin                  # save-point only
```

### Scope
- เป้า: **246 admin pages 1:1** จาก ก๊อต baseline (มี real impl 63% แล้ว)
- Routes ไม่มี `/admin` prefix — ทั้ง repo คือ admin app:
  - `/dashboard` · `/admins` · `/accounting` · `/api-forwarder-momo`
  - `/barcode` · `/acc-payment` · `/acc-shop` · ฯลฯ
- **เปิด 3 windows ควบกัน:**
  1. `pacred-admin-next` (กำลังแก้)
  2. `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\*.php` (legacy reference per AGENTS.md §0b)
  3. `C:\Users\Admin\pacred-web\` (Pacred infra reference — Supabase helpers · auth helpers · i18n)
- **ห้ามแก้ schema เอง** — บอกเดฟก่อน (migrations อยู่ที่ `pacred-web/supabase/migrations/` ที่เดียว)

---

## 🔗 Schema / Migrations — ที่เดียวเท่านั้น

⚠️ **กฎเหล็ก:** Migrations อยู่ที่ `pacred-web/supabase/migrations/` ที่เดียว.

| ใคร | อยากแก้ schema | ทำยังไง |
|---|---|---|
| ปอน | เพิ่ม column ให้ tb_users | บอกเดฟ → เดฟเขียน migration 0119 + apply prod |
| ภูม | เพิ่ม table ใหม่ admin_logs | บอกเดฟ → เดฟเขียน migration 0119 + apply prod |
| ภูม | rename column tb_forwarder (batch 2b) | บอกเดฟ → คุยกันก่อน (page-by-page approach) |

หลัง apply prod → **ทั้ง 2 repo เห็นทันที** (เพราะ DB เดียวกัน) · ไม่ต้อง pull migration เข้า pacred-admin-next.

---

## 🧪 Test integration

ทดสอบว่า 2 repo "เชื่อมกัน" จริงๆ:
1. เปิดทั้ง 2 server localhost:3000 (web) + localhost:3001 (admin)
2. ที่ web → register customer ใหม่ชื่อ `test_20260529`
3. ที่ admin → ไปที่ `/admins` หรือ `/customers` → เจอ row ใหม่
4. แก้ status ที่ admin → กลับมาที่ web → refresh dashboard → เห็นผล

---

## 📤 Production deploy

| Stage | pacred-web | pacred-admin-next |
|---|---|---|
| Dev branches | InwPond007 (ปอน) · dave-pacred (เดฟ) · podeng (dormant) | admin (ภูม) |
| Production gate | main (ก๊อต/เดฟ) | main (ก๊อต/เดฟ) |
| Vercel | https://pacred.co.th | (sub-domain TBD) |
| When | merge → main | merge → main |

ลูกค้าจริงเห็น = pacred-web/main บน Vercel · Staff ใช้ admin = pacred-admin-next/main บน Vercel แยก.
