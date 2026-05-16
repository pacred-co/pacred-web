# Pacred Web — Second Brain (AI Team Reference)

> อ่านไฟล์นี้ก่อนแตะโค้ดทุกครั้ง  
> อัปเดตล่าสุด: 2026-05-12

---

## สารบัญ

1. [[#ภาพรวมโปรเจค]]
2. [[#Tech Stack]]
3. [[#โครงสร้าง Folder]]
4. [[#Routing & Pages]]
5. [[#ระบบ Auth]]
6. [[#Database Schema]]
7. [[#Server Actions]]
8. [[#API Routes]]
9. [[#Components]]
10. [[#i18n — ภาษาไทย/อังกฤษ]]
11. [[#Environment Variables]]
12. [[#Patterns — วิธีเพิ่ม Feature ใหม่]]
13. [[#Known Issues & Gotchas]]
14. [[#สิ่งที่ยังไม่ได้ทำ (Backlog)]]

---

## ภาพรวมโปรเจค

**Pacred** คือระบบเว็บไซต์บริษัทนำเข้า-ส่งออก / ชิปปิ้ง / เคลียร์ศุลกากร / ฝากสั่งซื้อสินค้าจากจีน  
มีทั้ง marketing site + member portal สำหรับลูกค้า

### บริการหลัก
| รหัส | บริการ |
|---|---|
| `import` | นำเข้าสินค้า (รถ/เรือ/แอร์) |
| `export` | ส่งออกสินค้า (รถ/เรือ/แอร์) |
| `clear` | เคลียร์สินค้าติดด่าน |
| `customs` | พิธีการศุลกากร |
| `order` | ฝากสั่งซื้อสินค้า (1688/Taobao) |
| `payment` | ฝากโอนชำระสินค้า |

### Hosting
- **Frontend/Backend:** Vercel (Next.js serverless)
- **Database + Auth + Storage:** Supabase Cloud
- **Domain:** TBD (ใช้ Vercel preview ตอนนี้)

---

## Tech Stack

| Layer | Package | Version | หมายเหตุ |
|---|---|---|---|
| Framework | `next` | 16.2.6 | App Router — **อ่าน AGENTS.md ก่อน** |
| UI | `react` / `react-dom` | 19.2.4 | |
| Language | TypeScript | 5 strict | |
| Styling | `tailwindcss` | ^4 | `@theme inline` ใน globals.css — ไม่มี tailwind.config.js |
| i18n | `next-intl` | ^4.11.1 | th/en, namespace-based |
| Theme | `next-themes` | ^0.4.6 | light/dark ผ่าน `.dark` class |
| Icons | `lucide-react` | ^1.14.0 | outline style ทั้งโปรเจค |
| Validation | `zod` | ^4.4.3 | ทุก Server Action ต้อง validate |
| Auth/DB | `@supabase/supabase-js` | ^2 | |
| Cookie Session | `@supabase/ssr` | ^0.10.3 | |
| Package Manager | `pnpm` | — | ห้ามใช้ npm/yarn |

### Critical Next.js 16 Breaking Changes

> [!WARNING]
> Next.js 16 มี breaking changes จาก training data ของ AI:
> - **Middleware อยู่ที่ `proxy.ts`** ไม่ใช่ `middleware.ts`
> - อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด
> - Turbopack config ตั้งที่ root level: `turbopack: { root: path.resolve(__dirname) }`

---

## โครงสร้าง Folder

```
pacred-web/
├── app/
│   ├── [locale]/
│   │   ├── (public)/                  # ไม่ต้อง login
│   │   │   └── page.tsx               # หน้า home
│   │   ├── (auth)/                    # redirect → / ถ้า login แล้ว
│   │   │   ├── layout.tsx             # requireGuest()
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx      # 3-step juristic + personal
│   │   ├── (protected)/               # redirect → /login ถ้าไม่ login
│   │   │   ├── layout.tsx             # requireAuth()
│   │   │   ├── dashboard/page.tsx
│   │   │   └── orders/
│   │   │       ├── page.tsx           # list (ตัวอย่าง pattern)
│   │   │       └── new/page.tsx       # create form (ตัวอย่าง pattern)
│   │   ├── complete-profile/page.tsx  # auth required, allow incomplete
│   │   └── layout.tsx                 # NextIntl + LocaleHtmlLang
│   ├── api/
│   │   └── dbd/[taxId]/route.ts       # proxy → CKAN API (company lookup)
│   └── auth/                          # ⚠️ ไม่มี locale prefix
│       ├── callback/route.ts          # OAuth callback handler
│       └── signout/route.ts           # POST signout
│
├── actions/                           # "use server" — ทุก mutation ต้องผ่านที่นี่
│   ├── auth.ts                        # signIn, signOut, register, OAuth
│   ├── otp.ts                         # requestOtp, verifyOtp
│   └── orders.ts                      # ตัวอย่าง CRUD pattern
│
├── components/
│   ├── sections/                      # section-level (ใหญ่)
│   │   ├── navbar.tsx                 # "use client" — มี state
│   │   ├── hero-section.tsx
│   │   ├── service.tsx
│   │   ├── blog.tsx
│   │   ├── partner.tsx
│   │   ├── footer.tsx
│   │   └── floating-tabs.tsx
│   ├── ui/                            # reusable UI
│   │   ├── button.tsx
│   │   ├── service-carousel.tsx       # 3 variants (items/imageItems/blogItems)
│   │   ├── promo-carousel.tsx
│   │   └── sales-carousel.tsx
│   └── icons/
│       └── social-icons.tsx           # Google/LINE/Facebook SVG components
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  # browser anon client
│   │   ├── server.ts                  # server client + cookies (มี RLS)
│   │   └── admin.ts                   # service-role (bypass RLS — server only!)
│   ├── auth/
│   │   ├── get-user.ts                # getCurrentUserWithProfile()
│   │   └── require-auth.ts            # requireAuth() / requireGuest()
│   ├── sms/
│   │   └── gateway.ts                 # ThaiBulkSMS adapter
│   ├── utils/
│   │   └── phone.ts                   # normalizePhone() + detectIdentifier()
│   └── validators/
│       ├── auth.ts                    # Zod schemas สำหรับ auth actions
│       └── orders.ts                  # Zod schemas สำหรับ orders
│
├── messages/
│   ├── th.json                        # Thai translations (default)
│   └── en.json                        # English translations
│
├── i18n/
│   ├── request.ts                     # next-intl config
│   ├── routing.ts                     # locale: as-needed, default: th
│   └── navigation.ts                  # Link, useRouter, redirect (locale-aware)
│
├── supabase/
│   ├── schema.sql                     # initial tables + RLS + Storage
│   └── migrations/0002_orders.sql    # demo orders table
│
├── docs/
│   ├── architecture.md                # technical blueprint (diagrams)
│   └── PACRED-SECOND-BRAIN.md        # ← ไฟล์นี้
│
├── proxy.ts                           # Middleware (Next 16 — ไม่ใช่ middleware.ts!)
├── next.config.ts
├── app/globals.css                    # Tailwind v4 theme + CSS vars
└── .env.local                         # (gitignored)
```

---

## Routing & Pages

### URL Structure
- Default locale: **th** — ไม่มี prefix เช่น `/login`
- Locale prefix: `as-needed` — ภาษาอังกฤษใช้ `/en/login`
- Auth routes (`/auth/callback`, `/auth/signout`) — ไม่มี locale prefix เลย

### Pages ที่มีอยู่แล้ว

| Route | ไฟล์ | สถานะ | Guard |
|---|---|---|---|
| `/` | `app/[locale]/(public)/page.tsx` | ✅ UI complete | ไม่มี |
| `/login` | `app/[locale]/(auth)/login/page.tsx` | ✅ wired | requireGuest |
| `/register` | `app/[locale]/(auth)/register/page.tsx` | ✅ wired (personal + juristic 3-step) | requireGuest |
| `/dashboard` | `app/[locale]/(protected)/dashboard/page.tsx` | ✅ placeholder | requireAuth |
| `/complete-profile` | `app/[locale]/complete-profile/page.tsx` | ✅ placeholder | requireAuth (allowIncomplete) |
| `/orders` | `app/[locale]/(protected)/orders/page.tsx` | ✅ demo pattern | requireAuth |
| `/orders/new` | `app/[locale]/(protected)/orders/new/page.tsx` | ✅ demo pattern | requireAuth |
| `/auth/callback` | `app/auth/callback/route.ts` | ✅ OAuth handler | — |
| `/auth/signout` | `app/auth/signout/route.ts` | ✅ POST handler | — |

### Route Guards

```typescript
// lib/auth/require-auth.ts

// ใช้ใน layout.tsx ของ (protected):
await requireAuth()
// → redirect "/login" ถ้าไม่มี session
// → redirect "/complete-profile" ถ้า profile.status = "incomplete"

// ใช้ใน (protected) pages ที่อนุญาต incomplete:
await requireAuth({ allowIncomplete: true })

// ใช้ใน layout.tsx ของ (auth):
await requireGuest()
// → redirect "/" ถ้า login อยู่แล้ว
```

### การใช้ Link/Router ใน i18n

```typescript
// ✅ ถูก — ใช้จาก @/i18n/navigation
import { Link, useRouter, redirect } from "@/i18n/navigation";

// ❌ ผิด — locale จะหาย
import Link from "next/link";
```

---

## ระบบ Auth

### ภาพรวม

```
Supabase Auth (JWT)
  ↕ cookies (httpOnly, managed by @supabase/ssr)
proxy.ts middleware — refresh token ทุก request
```

### Register — Personal (Flow)

1. User กรอก firstName, lastName, phone, password, services, howKnow, email (optional)
2. Client เรียก `registerPersonal()` Server Action
3. Server verify OTP (หรือ bypass ถ้า `OTP_BYPASS=true`)
4. `admin.auth.admin.createUser({ phone, password, phone_confirm: true })`
5. `admin.from("profiles").insert({ ... status: "active" })`
6. `supabase.auth.signInWithPassword()` → set session cookie
7. Client redirect `/`

### Register — Juristic (3-Step Wizard)

> [!CRITICAL] Pattern สำคัญมาก
> **ห้ามเรียก server action ที่สร้าง session (createUser + signIn) ระหว่าง step**  
> เพราะ Next.js App Router detect cookie change → re-run server layout → `requireGuest()` redirect ออกไป  
> **วิธีแก้: defer ALL server calls ไปที่ step 3 final submit เท่านั้น**

```
Step 1 (client-only): กรอก phone, password, services, howKnow → validate → setStep(2)
Step 2 (client-only): กรอก taxId, companyName, address → validate → setStep(3)
Step 3 (final submit): เรียก server actions ทีเดียวเลย:
  → registerJuristicStep1()   (createUser + signIn — session เกิดที่นี่)
  → saveJuristicStep2()       (update profile: tax_id, company_name, address)
  → uploadJuristicDoc() × 3  (upload ไฟล์เอกสาร)
  → completeJuristicRegistration() (status → "active")
  → router.replace("/")
```

### Tax-ID Auto-fill (DBD)

- เมื่อกรอก taxId 13 หลักครบ → debounce 600ms → `GET /api/dbd/{taxId}`
- Server proxy เรียก CKAN API ของ DBD: `opendata.dbd.go.th/api/3/action/datastore_search`
- Resource ID: `f092da60-5f9a-4ef4-813c-0b1395778a76`
- **ข้อจำกัด**: dataset มีเฉพาะบริษัทที่จดทะเบียนใหม่รายเดือน (~4 ปีล่าสุด) ไม่ใช่ฐานข้อมูลทั้งหมด
- ถ้าหาไม่เจอ = **ไม่แสดง error** ผู้ใช้กรอกเอง (silent best-effort)

### Sign In Flow

รองรับ 3 format:
- `identifier` มี `@` → ใช้ email
- `identifier` ขึ้นต้น `0` หรือ `+` → normalize เป็น phone (+66...)
- `identifier` ขึ้นต้น `PR` → member_code → lookup phone/email จาก profiles แล้ว signIn

### OAuth (Google / Facebook)

```
1. คลิกปุ่ม → signInWithOAuth() → redirect ไป provider
2. Provider redirect กลับ → /auth/callback?code=...
3. exchangeCodeForSession(code) → session
4. ถ้า profile ยังไม่มี → insert profile (status='incomplete')
5. redirect → /complete-profile หรือ /dashboard
```

LINE Login = UI มีแล้วแต่ยังไม่ได้เชื่อม channel จริง (มี TODO)

### Session Refresh

`proxy.ts` → ทุก request → check token → ถ้าหมดอายุ → `updateSession()` → set cookie ใหม่

### OTP System

- Custom — ไม่ใช้ Supabase phone auth
- SMS Gateway: **ThaiBulkSMS** (เปลี่ยนได้ผ่าน `SMS_PROVIDER` env)
- Code: 6 หลัก, hashed SHA-256 + pepper, TTL 5 นาที
- Rate limit: 3 ครั้ง/ชั่วโมง/เบอร์
- **Dev bypass**: `OTP_BYPASS=true` → ข้าม SMS, รับ OTP อะไรก็ได้

---

## Database Schema

### Tables

#### `public.profiles`

| Column | Type | หมายเหตุ |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `account_type` | text | `personal` หรือ `juristic` |
| `member_code` | text unique | `PR001` auto-gen โดย trigger (PR + ขั้นต่ำ 3 หลัก) |
| `first_name` | text | personal เท่านั้น (juristic ว่าง) |
| `last_name` | text | personal เท่านั้น |
| `phone` | text | normalized `+66...` |
| `email` | text | optional |
| `services` | text[] | รหัสบริการที่สนใจ |
| `how_know` | text | แหล่งที่รู้จัก |
| `tax_id` | text | juristic เท่านั้น |
| `company_name` | text | juristic เท่านั้น |
| `address` | jsonb | `{ line, subdistrict, district, province, postcode }` |
| `status` | text | `incomplete` / `active` / `suspended` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-update trigger |

member_code format: `PR` + ขั้นต่ำ 3 หลัก (`PR001`, `PR002`, … `PR999`, `PR1000`, …) — overflow-safe, รันต่อได้ไม่มี cap
Auto-gen โดย `generate_member_code()` trigger ก่อน INSERT (migration `0044`)

#### `public.documents`

| Column | Type | หมายเหตุ |
|---|---|---|
| `id` | uuid PK | |
| `profile_id` | uuid FK | → profiles.id |
| `doc_type` | text | `company_affidavit` / `vat` / `national_id` |
| `storage_path` | text | path ใน bucket `member-docs` |
| `mime_type` | text | |
| `size_bytes` | bigint | max 10MB |
| `uploaded_at` | timestamptz | |

#### `public.otp_codes`

| Column | Type | หมายเหตุ |
|---|---|---|
| `id` | uuid PK | |
| `phone` | text | normalized |
| `code_hash` | text | SHA-256 + pepper |
| `purpose` | text | `register` / `login` / `reset` |
| `expires_at` | timestamptz | now + 5 min |
| `used` | boolean | mark ใช้แล้ว |
| `attempts` | int | ≥5 → force mark used |

#### `public.orders` (demo)

Demo CRUD สำหรับเป็น pattern reference เท่านั้น — ดูที่ `supabase/migrations/0002_orders.sql`

### Row-Level Security

| Table | Policy |
|---|---|
| `profiles` | `auth.uid() = id` (read/insert/update) |
| `documents` | `auth.uid() = profile_id` (read/insert/delete) |
| `otp_codes` | ไม่มี policy → deny all; ใช้เฉพาะ admin client |

### Storage

- Bucket: `member-docs` (private)
- Path pattern: `{user_id}/{doc_type}/{timestamp}.{ext}`
- Policy: user เข้าถึงได้เฉพาะ folder ที่ชื่อตรงกับ `auth.uid()`

---

## Server Actions

ทุก mutation **ต้องผ่าน Server Action** เท่านั้น ห้าม call Supabase โดยตรงจาก client

### `actions/auth.ts`

| Function | ทำอะไร |
|---|---|
| `signIn(input)` | email/phone/memberCode + password login |
| `signOutAction()` | signOut + redirect "/" |
| `registerPersonal(input)` | สร้าง user personal + insert profile + signIn |
| `registerJuristicStep1(input)` | สร้าง user juristic + insert profile (incomplete) + signIn |
| `saveJuristicStep2(input)` | update profile: tax_id, company_name, address |
| `uploadJuristicDoc(formData)` | upload ไฟล์ไปยัง Storage + insert documents row |
| `completeJuristicRegistration()` | update profile.status = "active" |
| `signInWithOAuth(provider)` | Google/Facebook OAuth redirect URL |

### `actions/otp.ts`

| Function | ทำอะไร |
|---|---|
| `requestOtp(phone, purpose)` | gen 6-digit, hash, store, send SMS |
| `verifyOtp(phone, code, purpose)` | ตรวจสอบ hash + TTL + mark used |

### Return Type Pattern

ทุก Server Action return `ActionResult<T>`:
```typescript
type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };
```

---

## API Routes

### `GET /api/dbd/[taxId]`

ไฟล์: `app/api/dbd/[taxId]/route.ts`  
Proxy สำหรับ lookup ข้อมูลบริษัทจาก Thai DBD Open Data

**Request:** `GET /api/dbd/1234567890123`

**Response (200):**
```json
{
  "name": "บริษัท ตัวอย่าง จำกัด",
  "address": "123 ถนนสุขุมวิท",
  "subdistrict": "คลองเตย",
  "district": "คลองเตย",
  "province": "กรุงเทพมหานคร",
  "postcode": "10110"
}
```

**Response errors:**
- `400 { error: "invalid_id" }` — ไม่ใช่ 13 หลัก
- `404 { error: "not_found" }` — ไม่พบในฐานข้อมูล
- `502 { error: "api_error" }` — upstream error

**ข้อจำกัด (สำคัญ):** DBD dataset มีเฉพาะบริษัทจดทะเบียนใหม่ ~4 ปีล่าสุด บริษัทเก่าจะไม่พบ

### `GET /auth/callback`

OAuth callback handler — ดูที่ `app/auth/callback/route.ts`  
รับ `code` จาก provider → `exchangeCodeForSession` → สร้าง profile ถ้า first-time → redirect

### `POST /auth/signout`

Sign out handler → clear cookies → redirect "/"

---

## Components

### NavBar (`components/sections/navbar.tsx`)

- `"use client"` — มี state สำหรับ mobile menu, user dropdown
- Auto-detect session: ถ้า login = แสดง avatar + dropdown; ถ้าไม่ = Login/Register buttons
- Dropdown: บัญชีของฉัน, Dashboard, โปรไฟล์, ออกจากระบบ

### ServiceCarousel (`components/ui/service-carousel.tsx`)

รองรับ 3 variants ผ่าน props:
```typescript
// Variant 1: rate cards
<ServiceCarousel items={ServiceItem[]} />

// Variant 2: image cards (red bg + heart)
<ServiceCarousel imageItems={ImageCardItem[]} />

// Variant 3: blog cards (full red bg + title overlay)
<ServiceCarousel blogItems={BlogCardItem[]} />

// No props = 6 placeholder cards
<ServiceCarousel />
```

### Social Icons (`components/icons/social-icons.tsx`)

```typescript
import { GoogleIcon, LineIcon, FacebookIcon } from "@/components/icons/social-icons";
// ใช้ className="h-[18px] w-[18px]" สำหรับขนาดปกติ
```

### Theme Colors (globals.css)

```css
/* Red brand palette */
--color-primary-50 through --color-primary-950
/* Brand color: primary-600 = #B30000 */

/* Semantic tokens */
--color-foreground     /* text หลัก */
--color-background     /* bg หลัก */
--color-surface        /* bg card/modal */
--color-border         /* เส้นขอบ */
--color-muted          /* text รอง */
```

Dark mode: ใช้ `.dark` class จาก next-themes  
Font: `var(--font-prompt)` (Prompt จาก Google Fonts)

### Register Page (`app/[locale]/(auth)/register/page.tsx`)

`"use client"` — ทั้งหน้า

Sub-components ที่สำคัญ:
- `ServiceChips` — 2 hero cards ใหญ่ (import/export) + 4 compact grid
- `SourceChips` — 8 chips 4-column (LINE/FB/Google/YouTube/TikTok/IG/Friend/Ad)
- `StyledInput` — custom input, **ใช้ `borderWidth/borderStyle/borderColor` แยกกัน** (ไม่ใช้ `border` shorthand เพราะ React warning)
- `PhoneInput` — 🇹🇭 +66 prefix box
- `PasswordInput` — 🔒 icon + 👁/🙈 toggle
- `StepIndicator` — 3-step progress bar (active/done/idle states)

---

## i18n — ภาษาไทย/อังกฤษ

### Namespaces ที่มี

| Namespace | ใช้ที่ |
|---|---|
| `nav` | Navbar |
| `sidebar` | Sidebar (protected area) |
| `heroTabs` | Hero section tabs |
| `hero` | Hero section |
| `heroStats` | Hero stats row |
| `promotion` | Promotion section |
| `service` | Service section |
| `sales` | Sales/CTA section |
| `blog` | Blog section |
| `partner` | Partner section |
| `login` | Login page |
| `register` | Register page |
| `footer` | Footer |

### วิธีใช้

```typescript
// Server Component
import { getTranslations } from "next-intl/server";
const t = await getTranslations("register");

// Client Component
import { useTranslations } from "next-intl";
const t = useTranslations("register");

// ใช้
t("title")                         // → "สมัครสมาชิก"
t("stepOf", { current: 1, total: 3 }) // interpolation
```

### เพิ่ม key ใหม่

แก้ทั้ง `messages/th.json` และ `messages/en.json` ทุกครั้ง

---

## Environment Variables

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...         # ปลอดภัยให้ client เห็นได้
SUPABASE_SERVICE_ROLE_KEY=eyJ...             # ⚠️ server-only, ห้าม commit, ห้ามส่ง client

# App URL (required for OAuth redirect)
NEXT_PUBLIC_SITE_URL=https://pacred.com      # local: http://localhost:3000

# OTP / SMS
OTP_BYPASS=true                              # dev: skip SMS, accept any code
SMS_PROVIDER=thaibulksms                     # thaibulksms | dummy
SMS_API_KEY=...
SMS_API_SECRET=...

# LINE OAuth (ยังไม่ได้ใช้)
LINE_OAUTH_CLIENT_ID=...
LINE_OAUTH_CLIENT_SECRET=...
```

### Supabase Clients

| Client | ไฟล์ | Key | ใช้ตรงไหน |
|---|---|---|---|
| Browser | `lib/supabase/client.ts` | anon | `"use client"` เท่านั้น |
| Server | `lib/supabase/server.ts` | anon + cookies | Server Actions, Route Handlers |
| Admin | `lib/supabase/admin.ts` | service-role | Server-only, bypass RLS |

---

## Patterns — วิธีเพิ่ม Feature ใหม่

### Pattern มาตรฐาน

```
1. SQL:      supabase/migrations/NNNN_<name>.sql — table + RLS + indexes
2. Zod:      lib/validators/<name>.ts — input schemas
3. Actions:  actions/<name>.ts — "use server", mutations
4. Pages:    app/[locale]/(protected)/<name>/ — UI (auth-guarded)
5. i18n:     messages/th.json + messages/en.json — เพิ่ม namespace
```

### ตัวอย่าง: เพิ่มหน้า Profile Settings

```typescript
// 1. SQL — ไม่ต้องเพิ่ม table (profiles มีอยู่แล้ว)

// 2. Validators — lib/validators/profile.ts
export const updateProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

// 3. Server Action — actions/profile.ts
"use server";
export async function updateProfile(input) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // ...update profiles where id = user.id
}

// 4. Page — app/[locale]/(protected)/profile/page.tsx
import { requireAuth } from "@/lib/auth/require-auth";
export default async function ProfilePage() {
  const { user, profile } = await requireAuth();
  // ...render form
}
```

### ตัวอย่าง: เพิ่ม Section ในหน้า Home

```typescript
// 1. สร้าง components/sections/my-section.tsx (Server Component)
export function MySection() { ... }

// 2. Import ใน app/[locale]/(public)/page.tsx
import { MySection } from "@/components/sections/my-section";
```

### ดูตัวอย่าง Pattern ที่ทำงานได้จริง

```
actions/orders.ts
app/[locale]/(protected)/orders/
```

---

## Known Issues & Gotchas

### 1. `requireGuest()` fires mid-flow

**ปัญหา:** ถ้า Server Action ที่อยู่ใน route group `(auth)` สร้าง session → Next.js detect cookie change → re-run server layout → `requireGuest()` → redirect ออก

**วิธีแก้:** ใน multi-step form ที่ต้องสร้าง session ให้ defer server calls ทั้งหมดไปที่ step สุดท้าย

### 2. React border shorthand warning

**ปัญหา:** `style={{ border: "1.5px solid #ECEEF2" }}` → React warning

**วิธีแก้:**
```typescript
style={{
  borderWidth: "1.5px",
  borderStyle: "solid",
  borderColor: "#ECEEF2",
}}
```

### 3. DBD API ไม่เจอบริษัทเก่า

**ปัญหา:** CKAN dataset มีเฉพาะบริษัทจดทะเบียนใหม่รายเดือน ไม่ใช่ full database

**วิธีแก้:** Auto-fill เป็น silent best-effort — ถ้าหาไม่เจอ ไม่แสดง error ผู้ใช้กรอกเอง

### 4. Turbopack workspace root warning

**ปัญหา:** Windows อาจมี `package-lock.json` ใน home directory → Next.js detect wrong workspace root

**วิธีแก้:** ตั้งแล้วใน `next.config.ts`:
```typescript
turbopack: { root: path.resolve(__dirname) }
```

### 5. pnpm dev ไม่ขึ้น

**ปัญหา:** มี dev server ค้างอยู่

**วิธีแก้:** `Get-Process -Name node | Stop-Process -Force` แล้ว `pnpm dev` ใหม่

### 6. Upload TypeScript error

**ปัญหา:** `r1.error` อาจ type error

**วิธีแก้:**
```typescript
(r1 as { ok: false; error: string }).error
```

---

## สิ่งที่ยังไม่ได้ทำ (Backlog)

### Priority สูง
- [ ] `/complete-profile` — form จริง (ตอนนี้ยังเป็น placeholder)
- [ ] `/profile` — settings page (แก้ชื่อ, เบอร์, รหัสผ่าน)
- [ ] OTP UI — เพิ่ม OTP input ใน register/login (ตอนนี้ซ่อนไว้ `OTP_BYPASS=true`)

### Priority กลาง
- [ ] LINE Login — เชื่อม LINE Login Channel จริง (ต้องสร้าง channel ที่ developers.line.biz)
- [ ] Dashboard — ข้อมูลจริง (orders, tracking, wallet)

### Priority ต่ำ / Future
- [ ] ระบบ Orders จริง (ตอนนี้มีแค่ demo pattern)
- [ ] Realtime tracking ผ่าน `supabase.channel()`
- [ ] Full DBD company lookup (ไม่มี free API ที่ครอบคลุมทั้งหมด)
- [ ] Tests (unit + integration)
- [ ] Rate limiting login (Upstash Redis)
- [ ] `/about`, `/pricing`, `/warehouse`, `/blog` pages

---

## คำสั่งที่ใช้บ่อย

```bash
# dev
pnpm dev

# build
pnpm build

# lint
pnpm lint

# kill stale dev server (Windows PowerShell)
Get-Process -Name node | Stop-Process -Force
```

---

## Security Checklist

ก่อน deploy production:
- [ ] `SUPABASE_SERVICE_ROLE_KEY` ไม่ได้อยู่ใน git
- [ ] `OTP_BYPASS=false` (หรือลบ env var ออก)
- [ ] Supabase RLS เปิดอยู่ทุก table
- [ ] `member-docs` bucket ตั้งเป็น private
- [ ] OAuth redirect URLs ตั้งใน Supabase Dashboard ถูกต้อง
- [ ] `NEXT_PUBLIC_SITE_URL` ชี้ production URL
- [ ] Rate limit สำหรับ login/OTP ทำงาน

---

*ไฟล์นี้เป็น living document — อัปเดตทุกครั้งที่มีการเปลี่ยนแปลงสถาปัตยกรรมหรือ decision สำคัญ*
