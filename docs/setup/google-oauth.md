# Google OAuth Setup

วิธีเปิดให้ user signin/signup ด้วย Google account

## 1. สร้าง project ที่ Google Cloud Console

1. ไป <https://console.cloud.google.com>
2. คลิก project selector ด้านบน → **New Project**
3. ตั้งชื่อ: `pacred-web` → Create

## 2. เปิด OAuth consent screen

1. **APIs & Services → OAuth consent screen**
2. เลือก **External** (อนุญาต Google account ทั่วไป) → Create
3. กรอก:
   - **App name:** Pacred
   - **User support email:** your-email@pacred.com
   - **App logo:** logo Pacred (optional แต่ดูดีกว่า)
   - **App domain:** `https://your-domain.com`
   - **Authorized domains:** `pacred.com`, `supabase.co`
   - **Developer contact:** your-email@pacred.com
4. **Save and Continue**
5. **Scopes:** เพิ่ม `email`, `profile`, `openid` → Save and Continue
6. **Test users** (ตอนยังไม่ publish): เพิ่ม email ที่จะใช้ทดสอบ
7. **Back to Dashboard**

## 3. สร้าง OAuth Client ID

1. **APIs & Services → Credentials**
2. **+ Create Credentials → OAuth client ID**
3. **Application type:** Web application
4. **Name:** Pacred Web
5. **Authorized JavaScript origins:**
   - `http://localhost:3000`
   - `https://your-domain.com` (production)
6. **Authorized redirect URIs:**
   - **`https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`** ← ตัวสำคัญ! Supabase จัดการ OAuth
7. **Create**
8. Copy **Client ID** และ **Client Secret**

## 4. Configure ที่ Supabase

1. ไป Supabase Dashboard → **Authentication → Providers → Google**
2. **Enable Google provider:** ON
3. ใส่:
   - **Client ID:** จาก step 3
   - **Client Secret:** จาก step 3
4. **Authorized Client IDs** (สำหรับ One-Tap หรือ mobile): ใส่ Client ID ตัวเดิมก็ได้
5. **Save**

## 5. Test

1. `pnpm dev`
2. ไป `/login` → กดปุ่ม **Google**
3. → redirect ไป Google → auth → กลับมา `/auth/callback`
4. ครั้งแรก: profile ถูกสร้าง status=`incomplete` → redirect `/complete-profile`
5. ครั้งถัดไป: redirect `/dashboard`

## 6. Publish app (production)

ตอน dev ใช้ใน "Testing mode" ได้เลย (จำกัด 100 test users) — production ต้องเปลี่ยนเป็น "In production":

1. **OAuth consent screen → Publish App**
2. ถ้า scope = standard (email/profile/openid) ผ่านได้เลย ไม่ต้อง verify
3. ถ้าต้องการ scope อื่น (เช่น Drive) ต้อง submit verification

## 🔧 env vars

ไม่ต้องเพิ่ม env ใน `.env.local` — Supabase จัดการ Client ID/Secret ฝั่งตัวเอง

แต่ต้อง update:
```env
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```
ให้ตรงกับ production URL (ใช้ใน OAuth `redirectTo`)

## 🆘 Troubleshooting

### "redirect_uri_mismatch"
- redirect URI ที่ Google Console ต้องเป็น **Supabase callback URL** ไม่ใช่ของแอปเรา
- รูปแบบ: `https://<project-ref>.supabase.co/auth/v1/callback`

### กลับมาแล้วแต่ไม่มี session
- Supabase `redirect URLs` allow list ไม่มี `http://localhost:3000/**` → ดู [supabase.md](./supabase.md) Step 4.4

### "This app isn't verified"
- ปกติตอน dev (Testing mode) — เพิ่ม email user ใน "Test users"
- Production: publish app

### Profile ไม่ถูกสร้าง
- ดู [`app/auth/callback/route.ts`](../../app/auth/callback/route.ts) — ตรวจ logs
- ถ้า `profiles_insert_own` policy fail = บัค (เพราะตอนนั้นมี session แล้ว)
