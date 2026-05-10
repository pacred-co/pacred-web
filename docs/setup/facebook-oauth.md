# Facebook OAuth Setup

วิธีเปิดให้ user signin/signup ด้วย Facebook

## 1. สร้าง app ที่ Meta for Developers

1. ไป <https://developers.facebook.com>
2. ล็อกอินด้วย Facebook account ที่จะเป็น admin ของ app
3. **My Apps → Create App**
4. Use case: **Authenticate and request data from users with Facebook Login**
5. **App name:** Pacred → **Contact email:** your-email
6. Create

## 2. เปิด Facebook Login product

1. ใน app dashboard → **Add Product**
2. หา **Facebook Login → Set Up**
3. เลือก platform: **Web**
4. **Site URL:** `https://your-domain.com` (กดข้ามถ้ายัง dev อยู่)

## 3. Configure OAuth settings

1. ใน sidebar → **Facebook Login → Settings**
2. **Valid OAuth Redirect URIs:**
   - **`https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`** ← ตัวเดียวที่ต้องใส่
3. **Client OAuth Login:** ✅ ON
4. **Web OAuth Login:** ✅ ON
5. **Enforce HTTPS:** ✅ ON (production)
6. **Save changes**

## 4. Get App credentials

1. **App Settings → Basic**
2. Copy:
   - **App ID**
   - **App Secret** (กด "Show" + ใส่รหัสผ่าน)

## 5. Configure ที่ Supabase

1. Supabase Dashboard → **Authentication → Providers → Facebook**
2. **Enable Facebook provider:** ON
3. **Facebook client ID:** = App ID
4. **Facebook secret:** = App Secret
5. **Save**

## 6. App Review (production only)

ตอน dev สามารถใช้กับ user ที่เป็น admin/developer/tester ของ app ได้เลย — production ต้องผ่าน App Review:

1. **App Review → Permissions and Features**
2. ปกติใช้แค่ `public_profile` + `email` — ทั้งสองอนุมัติอัตโนมัติ
3. ถ้าใช้ scope พิเศษ ต้องส่ง screencast + use case explanation

## 7. Switch to Live mode

1. ตั้งแต่ dashboard ด้านบน toggle **In development → Live** (ขวาบน)
2. ต้องตั้ง:
   - Privacy Policy URL
   - Data Deletion URL (หรือ instructions)
   - App icon 1024×1024

## 8. Test

1. `pnpm dev`
2. `/login` → กด **Facebook**
3. → Facebook OAuth → กลับ `/auth/callback`
4. ครั้งแรก: profile incomplete → `/complete-profile`

## 🔧 env vars

ไม่ต้องเพิ่ม env — Supabase จัดการ App ID/Secret

ต้อง update `NEXT_PUBLIC_SITE_URL` ตอน production

## 🆘 Troubleshooting

### "URL Blocked: This redirect failed because the redirect URI is not whitelisted"
- ใส่ Supabase callback URL ใน "Valid OAuth Redirect URIs"
- รอ 1-2 นาทีให้ Facebook propagate setting

### "App not active"
- App ยังเป็น "In development" → ใช้ได้แค่ admin/dev/tester role
- Tester ต้อง accept invite ที่ **Roles → Roles** ก่อน

### User ไม่มี email
- Facebook ไม่บังคับ email ต้องมี — ถ้า user ใช้เบอร์โทรสมัคร FB จะไม่มี email
- Pacred profile ที่สร้างจะมี `email = null` — ต้องเก็บข้อมูลเพิ่มที่ `/complete-profile`

### Test ไม่ได้บนภายในเครือข่าย
- Facebook OAuth ต้องผ่าน HTTPS หรือ `localhost`
- ถ้าใช้ ngrok ใส่ ngrok URL ใน redirect URIs ด้วย
