# LINE Login Setup

เปิดให้ user signin/signup ด้วย LINE account ผ่าน Supabase custom OIDC

> 💡 **สถานะปัจจุบัน:** ปุ่ม LINE ใน UI = mocked (alert "กำลังจะมาเร็วๆ นี้")
> ทำตามคู่มือนี้แล้ว wire จริงเสร็จ ค่อย uncomment code ใน [`actions/auth.ts`](../../actions/auth.ts) `signInWithOAuth`

## Concept

LINE ไม่ใช่ provider ที่ Supabase รองรับ native — ต้องใช้ **Custom OAuth/OIDC** หรือผ่าน middleware เอง

มี 2 ทางเลือก:

| วิธี | Pros | Cons |
|---|---|---|
| **A. Custom OIDC ที่ Supabase** | จัดการ session ได้เหมือน OAuth ทั่วไป | Supabase Pro plan ($25/m) |
| **B. Manual flow ผ่าน Server Action** | Free tier ใช้ได้ | เขียน callback handler เพิ่ม |

แนะนำ **B** ตอนเริ่ม → migrate ไป A เมื่อขึ้น Pro

## ทางเลือก B: Manual flow (free tier)

### 1. สร้าง LINE Login Channel

1. ไป <https://developers.line.biz/console>
2. ล็อกอินด้วย LINE Business account
3. กด **Create a new provider** (หรือใช้ provider เดิมของ LINE Official Account)
4. ใน provider → **Create a new channel → LINE Login**
5. กรอก:
   - **Region:** Thailand
   - **Channel name:** Pacred Login
   - **Channel description:** Sign-in with LINE for Pacred
   - **App types:** ✅ Web app
   - **Email address:** your-email
   - ติ๊ก agreement
6. Create

### 2. Configure callback URL

1. ใน channel → **LINE Login → Callback URL**
2. ใส่:
   - `http://localhost:3000/auth/line/callback` (dev)
   - `https://your-domain.com/auth/line/callback` (prod)

### 3. Get credentials

1. **Basic settings → Channel ID + Channel secret**
2. ใส่ใน `.env.local`:
   ```env
   LINE_LOGIN_CLIENT_ID=<channel-id>
   LINE_LOGIN_CLIENT_SECRET=<channel-secret>
   ```

### 4. Implement (TODO)

ยังไม่ได้ทำในโค้ด — ต้องเพิ่ม:

#### `actions/auth.ts` — เพิ่ม `signInWithLine()` function
```ts
export async function signInWithLine(): Promise<ActionResult<{ url: string }>> {
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  // เก็บ state ใน cookie (httpOnly) เพื่อ verify ตอน callback

  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.LINE_LOGIN_CLIENT_ID!);
  url.searchParams.set("redirect_uri", `${process.env.NEXT_PUBLIC_SITE_URL}/auth/line/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "profile openid email");
  url.searchParams.set("nonce", nonce);
  return { ok: true, data: { url: url.toString() } };
}
```

#### `app/auth/line/callback/route.ts` — handler
```ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // 1. Exchange code → access_token + id_token (POST to https://api.line.me/oauth2/v2.1/token)
  // 2. Verify id_token JWT (signature + nonce + aud)
  // 3. Get user profile (GET https://api.line.me/v2/profile)
  // 4. Use admin.createUser() with email/phone (from id_token email claim) + insert profile
  // 5. signInWithPassword OR generate magic link
  // 6. Set session cookie + redirect /
}
```

#### `app/[locale]/(auth)/login/page.tsx` — เปลี่ยน `handleLineLogin`
```ts
// แทนที่ alert ด้วย:
const res = await signInWithLine();
if (res.ok && res.data) window.location.href = res.data.url;
```

### 5. Test (เมื่อ implement เสร็จ)

1. กดปุ่ม LINE
2. → LINE auth (ขอ permission profile + email)
3. กลับ `/auth/line/callback?code=...&state=...`
4. → app verify + create/login user
5. → redirect `/dashboard` หรือ `/complete-profile`

---

## ทางเลือก A: Custom OIDC ที่ Supabase (Pro plan)

ถ้ามี Supabase Pro:

1. **Authentication → Providers → Custom OIDC** (Enterprise feature, อาจอยู่ใน Pro plan)
2. กรอก:
   - **Discovery URL:** `https://access.line.me/.well-known/openid-configuration`
   - **Client ID:** Channel ID
   - **Client Secret:** Channel secret
   - **Scopes:** `profile openid email`
3. Save
4. ในแอป: `supabase.auth.signInWithOAuth({ provider: "line" as any, ... })` — type cast เพราะ Supabase ยังไม่มี LINE ใน type definitions

⚠️ ตอนเขียนคู่มือนี้ Supabase ยังไม่มี LINE เป็น native provider — ตรวจ docs ล่าสุดอีกครั้ง

## 🆘 Troubleshooting

### "invalid_client"
- Channel ID/Secret ผิด

### "redirect_uri_mismatch"
- Callback URL ที่ LINE Console ต้องตรงกับใน code ทุกตัวอักษร (รวม trailing slash)

### Email ว่าง
- LINE ไม่บังคับ email — user ที่ไม่ verify email จะไม่มี email claim
- Pacred ต้องเก็บข้อมูลเพิ่มที่ `/complete-profile`

### Token verification fail
- nonce ไม่ตรง = ผิด CSRF — generate ใหม่ทุกครั้ง

## 📚 References

- LINE Login docs: <https://developers.line.biz/en/docs/line-login/>
- LINE OpenID Connect: <https://developers.line.biz/en/docs/line-login/integrate-line-login/#using-openid-connect>
- Supabase Custom OIDC: <https://supabase.com/docs/guides/auth/social-login/auth-custom-oidc>
