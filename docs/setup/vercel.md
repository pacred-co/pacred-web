# Vercel Deployment

วิธี deploy Pacred-web ขึ้น production ด้วย Vercel

## Prerequisite

- Supabase project พร้อม + รัน SQL ครบ ([supabase.md](./supabase.md))
- Domain (optional แต่แนะนำ — Vercel มี subdomain `*.vercel.app` ให้ฟรี)
- GitHub/GitLab/Bitbucket repo

## 1. Connect repo

1. ไป <https://vercel.com>
2. **Add New → Project**
3. **Import Git Repository** → เลือก repo ของ Pacred
4. **Framework preset:** Next.js (auto-detect)
5. **Root Directory:** `./` (default)

## 2. Build settings

ปกติ default ของ Next.js ใช้ได้เลย:
- Build command: `pnpm build`
- Output directory: `.next`
- Install command: `pnpm install`

ถ้า detect ไม่ถูก: เลือก package manager = **pnpm** ใน Settings

## 3. Environment variables

ก่อน deploy ต้องเพิ่ม env vars ทั้งหมด:

**Project Settings → Environment Variables**

ใส่ทีละตัวตาม [`.env.example`](../../.env.example) (production values):

| Key | Value | Environment |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | จาก Supabase | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | จาก Supabase | All |
| `SUPABASE_SERVICE_ROLE_KEY` | จาก Supabase ⚠️ | All |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.com` | Production |
| `NEXT_PUBLIC_SITE_URL` | `https://your-preview.vercel.app` | Preview |
| `OTP_BYPASS` | `false` | Production |
| `OTP_BYPASS` | `true` | Preview, Development |
| `OTP_PEPPER` | random 32+ chars | All |
| `SMS_PROVIDER` | `thaibulksms` | Production |
| `THAIBULKSMS_API_KEY` | จาก ThaiBulkSMS | Production |
| `THAIBULKSMS_API_SECRET` | จาก ThaiBulkSMS | Production |
| `THAIBULKSMS_SENDER` | `Pacred` | All |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` ห้าม mark เป็น `NEXT_PUBLIC_` — ห้าม leak ไป client

## 4. Deploy

1. กด **Deploy**
2. รอ build ~2-3 นาที
3. หลังเสร็จ Vercel ให้ URL `https://pacred-web-xxx.vercel.app`
4. เปิดดู ทดสอบ

## 5. Custom domain

1. **Project Settings → Domains**
2. **Add Domain** → ใส่ `your-domain.com`
3. Vercel จะให้ DNS record (A หรือ CNAME) ไปตั้งที่ registrar
4. รอ SSL cert (auto-provision Let's Encrypt) ~1-5 นาที

## 6. Update Supabase URLs

หลัง deploy แล้ว update Supabase Auth:

1. Supabase → **Authentication → URL Configuration**
2. **Site URL:** `https://your-domain.com`
3. **Redirect URLs (allow list):**
   - `https://your-domain.com/auth/callback`
   - `https://your-domain.com/**`
   - (เก็บ localhost ไว้ด้วย)
4. Save

## 7. Update OAuth callback URLs

ถ้าเปิด Google/Facebook OAuth แล้ว → ไปที่แต่ละ provider:
- **Google:** [Cloud Console](https://console.cloud.google.com) → OAuth client → เพิ่ม `https://your-domain.com` ใน Authorized origins
- **Facebook:** [Meta Developers](https://developers.facebook.com) → App → ไม่ต้องแก้ (Supabase callback ตัวเดิม) แต่ต้อง toggle "Live"

ส่วน Supabase callback URL ไม่เปลี่ยน — ยังเป็น `https://<project>.supabase.co/auth/v1/callback` เหมือนเดิม

## 8. Auto-deploy

ทุก commit ที่ push เข้า:
- **`main` branch** → production deploy (ไป custom domain)
- **branch อื่นๆ** → preview deploy (URL เฉพาะ)
- **PR** → preview ใน comment ของ PR

## 9. Function regions (optional)

Server Actions รัน serverless edge — เลือก region ใกล้ user:
- **Project Settings → Functions → Region**
- เลือก **Singapore (sin1)** ↔ ใกล้ Supabase Singapore region สุด

> ⚠️ การวาง function region ห่างจาก DB region จะมี latency เพิ่ม 100-200ms ต่อ query

## 10. Monitoring

- **Logs:** Vercel Dashboard → Project → Logs (real-time)
- **Analytics:** เปิด **Vercel Analytics** (ฟรีจำกัด event)
- **Speed Insights:** เปิดได้ในแท็บ Project — track Core Web Vitals

## 🚦 Production checklist

ก่อน go-live ตรวจ:

- [ ] env vars ครบ ทุก environment (Production / Preview / Dev)
- [ ] `OTP_BYPASS=false` ใน Production
- [ ] `OTP_PEPPER` เป็น random string (ไม่ใช่ default)
- [ ] Supabase auth URLs update เป็น production domain
- [ ] OAuth callbacks update ครบ
- [ ] Test full register/login flow บน production URL
- [ ] Custom domain มี SSL (https) ทำงาน
- [ ] Logs ไม่มี error
- [ ] `next build` ผ่าน (ดู Build Logs)

## 🆘 Troubleshooting

### Build fail: "Module not found"
- เช็ค `package.json` มี deps ครบ
- ลบ `pnpm-lock.yaml` แล้ว reinstall: ปกติไม่ต้องทำ

### "Internal Server Error" หลัง deploy
- เช็ค Logs (Vercel) — มัก env var หาย
- ตรวจว่า `SUPABASE_SERVICE_ROLE_KEY` ใส่ถูก env

### Middleware (proxy.ts) error
- Edge runtime — บาง Node API ใช้ไม่ได้ (เช่น `crypto.randomInt`)
- Pacred ใช้แค่ Supabase + cookies — ปกติไม่มีปัญหา

### Slow first request
- Cold start ของ Serverless Function — ปกติ ~500ms
- ถ้าช้าเกินไป upgrade Pro plan (warm instances)

### "redirect URI mismatch" หลัง OAuth
- OAuth provider ยังไม่ update domain — ดู step 7
- หรือ `NEXT_PUBLIC_SITE_URL` ใน env ผิด

## 💰 Cost estimate (Vercel + Supabase)

| Item | Tier | Cost |
|---|---|---|
| Vercel Hobby | dev / personal projects | Free |
| Vercel Pro | production with team | $20/m/user |
| Supabase Free | dev | Free (500MB DB, 1GB Storage) |
| Supabase Pro | production | $25/m (8GB DB, 100GB Storage) |
| Domain | varies | ~300-500 บาท/ปี |
| ThaiBulkSMS | per SMS | ~0.20-0.40 บาท/SMS |

ตอนเริ่ม — Vercel Hobby + Supabase Free + custom domain = **~500 บาท/ปี**
