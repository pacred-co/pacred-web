# Fidelity audit — `/login`, `/register`, `/forgot-password` vs legacy PCS Cargo

**Date:** 2026-05-28 · **Auditor:** Claude (legacy-fidelity-check skill, D1 lens) · **Scope:** 3 customer-facing auth screens
**Pacred branch:** `dave-pacred` (post-2026-05-28 register fixes a8af737d / 7a4a4750 / 125369a0)
**Legacy source:** `C:\xampp\htdocs\pcscargo\member\login.php`, `register.php`, `regis-tam.php`, `register-id.php`, `include/pages/login/recover.php`

---

## §0 TL;DR — the 5 highest-leverage fixes

These are the LOAD-BEARING divergences a returning PCS customer will trip over. Fix in this order:

| # | Pacred file:line | Legacy behaviour | Pacred today | Severity | Fix complexity |
|---|---|---|---|---|---|
| **1** | `app/[locale]/(auth)/login/page.tsx:55,196-206` | "จำฉันไว้ในระบบ" checkbox sets 10-year cookies (`member_login` / `member_password` / `pcs_logged` / `pcs_userID` / `pcs_userPicture`) and prefills the next visit's login form | UI-only — `rememberMe` state never reaches the server; `signIn` action ignores it; no persisted cookie; no prefill on return. Comments in code admit this. | **LOAD-BEARING** (legacy customer expects "I logged in last week, my phone number is still there") | **M** — wire to Supabase persistent session + a `last_login_identifier` cookie |
| **2** | `app/[locale]/(auth)/register/register-client.tsx:91-176` (`SOURCES`) + `messages/th.json:413-419` | `<select name="channel">` has **10** options (Google / FB-IG / Youtube / Banner / Tiktok / Twitter / Friend / `8=ผู้ใช้งานแนะนำ โปรดระบุรหัสผู้แนะนำ` / Pantip / Booth-seminar). **Option 8 dynamically shows a `userRecom` referral-code input** | Pacred ships 8 sources (Line / FB / Google / Youtube / Tiktok / IG / Friend / โฆษณา). **No "ผู้ใช้งานแนะนำ + รหัสผู้แนะนำ" path** — `userRecom` is captured only via the URL `?recom=` query param, not via the form's how-know dropdown. Missing options: Pantip, Booth/seminar. New (extra) option: Line (legacy didn't have it as a channel). | **LOAD-BEARING** (sales-attribution data shape changes + the only way a customer can self-declare a referrer in legacy is gone) | **S** — add 2 missing options + the conditional `userRecom` input |
| **3** | `app/[locale]/(auth)/login/page.tsx:140-148` + `messages/th.json:376-377` | Login identifier field: **`type="text"` + `maxlength="20"` + `placeholder="เบอร์โทรศัพท์หรือรหัสสมาชิก"`** | Pacred: no maxLength (unbounded), placeholder hard-coded as i18n key `"0812345678 หรือ PR001"` (an instruction, not the legacy verbatim). Label matches OK. | **VISIBLE** (a returning PCS customer sees a different placeholder & might paste a stale super-long string the legacy form would have truncated) | **trivial** — set `maxLength={20}` + change `emailPlaceholder` to `"เบอร์โทรศัพท์หรือรหัสสมาชิก"` |
| **4** | `app/[locale]/(auth)/register/register-client.tsx:1057-1122` (ServiceChips list) | **No "บริการที่สนใจ" field at all on legacy register.php** — legacy only has shopUser (1=ซื้อไปใช้เอง / 2=ซื้อไปขาย) + channel (10 options). Service-of-interest is gathered at admin/sales-call time, not signup. | Pacred adds a multi-select `ServiceChips` (5 services). **This is an extra**, not a legacy mismatch — but it crowds the legacy form (extra required-looking dropdown) and changes the "fastest path to account" muscle memory. | **VISIBLE** (🟢 extra — legacy customer trained to skip-past in 2 dropdowns now sees 3) | **S** — keep but mark de-emphasised / collapse-by-default; or move to post-signup onboarding |
| **5** | `app/[locale]/(auth)/forgot-password/page.tsx` (entire screen) | Lives **inside** `login.php` as `#form-resetpass` (slide-toggled from the login form via `#to-recover` jQuery handler) — same URL, same card, slide-up/slide-down toggle. Legacy: single phone field → OTP screen with 6-box input → confirm-OTP → set new password (`userPass2`) form. **No email path.** | Pacred makes it a **separate `/forgot-password` route** with phone-mode + **email-mode** toggle. Different layout. The email-mode is Pacred-original (Supabase magic link). | **LOAD-BEARING for layout/navigation** (legacy customer clicks "ลืมรหัสผ่าน?" expecting an inline toggle; gets a route change) + **🟢 extra** for the email mode (allowed — Phase C improvement that snuck in early) | **L** — to true legacy parity: collapse onto login route with a slide-toggle, hide the email-mode behind a "more options" disclosure (or owner-approve the email tab as a deferred Phase-C extra) |

Below are the full per-screen audits.

---

## §1 `/login` audit

**Pacred file:** `app/[locale]/(auth)/login/page.tsx` (310 lines, `"use client"`)
**Legacy file:** `C:\xampp\htdocs\pcscargo\member\login.php` (673 lines — handles login, recover OTP request, and resetPass in one file)
**Server action(s) consumed:** `signIn`, `signInWithOAuth` (in `actions/auth.ts`)
**i18n namespace:** `messages/{th,en}.json` → `login.*`

### Side-by-side

| Aspect | Legacy `login.php` | Pacred `/login` |
|---|---|---|
| **Title** | `<h4>เข้าสู่ระบบ</h4>` | `<h1>{t("title")}</h1>` → "เข้าสู่ระบบ" ✅ match |
| **Logo** | `<img src=".../logo-text-dark.png" alt="PCS Cargo logo">` | `<Image src="/images/pacred-logo-red.png" alt="Pacred">` ✅ intentional rebrand |
| **"No account" subtitle** | `<p>ยังไม่มีบัญชีผู้ใช้งาน? <a href=".../register/">สร้างบัญชี</a></p>` — link text **"สร้างบัญชี"**, positioned **above the form** | `<p>{t("noAccount")} <Link>{t("registerLink")}</Link></p>` — link text **"สมัครสมาชิก"**, positioned **below the form** | 
| **Identifier field — label** | `<label>เบอร์โทรศัพท์หรือรหัสสมาชิก</label>` | `{t("emailLabel")}` = "เบอร์โทรศัพท์หรือรหัสสมาชิก" ✅ match |
| **Identifier field — input** | `name="userTelORuserID" type="text" maxlength="20" placeholder="เบอร์โทรศัพท์หรือรหัสสมาชิก"` + a `ft-user` icon on the left | `id="identifier" type="text"` (no maxLength) + placeholder = `"0812345678 หรือ PR001"` (instruction) + no left icon |
| **Identifier prefill** | If `$_SESSION['userTelORuserIDERROR']` or `$_COOKIE["member_login"]` set, prefill the field | No prefill |
| **Password — label** | `<label>รหัสผ่าน</label>` | "รหัสผ่าน" ✅ match |
| **Password — input** | `name="userPass" type="password" minlength="6" maxlength="20" placeholder="รหัสผ่านใหม่เพื่อเข้าสู่ระบบ 6-20 ตัวอักษร"` + `ft-lock` icon + eye-toggle SVG on the right | `id="password" type="password"` (no min/max) + placeholder `"••••••••"` + eye-toggle (Eye/EyeOff Lucide icons) |
| **Password prefill** | If `$_COOKIE["member_password"]` set, prefill (plaintext cookie — legacy security antipattern, **do NOT port**) | No prefill ✅ correct hardening |
| **"Forgot password?" link** | `<a href="javascript:void(0)" id="to-recover">ลืมรหัสผ่าน?</a>` — opens an **in-card slide-toggle** to the recovery form | `<Link href="/forgot-password">{t("forgotPassword")}</Link>` — navigates to a separate route |
| **Remember-me** | `<input type="checkbox" name="remember" value="1" checked> <label>จำฉันไว้ในระบบ </label>` — **functional** (sets 10-year cookies; prefills next visit) | UI checkbox, **checked by default** ✅ for visual parity, but `rememberMe` state never sent to server. Code comments admit this. |
| **Submit button** | `<button name="login" class="btn btn-main btn-block"><i class="ft-user-login"></i> เข้าสู่ระบบ</button>` | `<button type="submit">{t("submit")}</button>` → "เข้าสู่ระบบ" ✅ label match; no leading icon |
| **Language dropdown** | Inline TH/EN/CH dropdown under the submit button | Not present on login page itself (NavBar / global) |
| **Social login** | None (PHP had FB OAuth code in `register.php` for signup only, not login) | **3 social buttons** (Google / LINE / Facebook) **gated OFF** by `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` — when off renders greyed-out COMING SOON. ✅ intentional + correctly disabled by default per ADR-0017 |
| **Successful login UI** | SweetAlert popup `"ยินดีต้อนรับเข้าสู่ PCS Cargo"` + "บริการด้วยใจ ฉับไวตรงเวลา" timed 3000ms, then `location.href = $basePath` | Silent `router.replace(dest)` (no welcome popup); dest is `/admin` for admins, `?next=` if present, else `/dashboard` |
| **Failed login UI** | SweetAlert `"ผิดพลาด"` / "กรุณาล็อกอินใหม่อีกครั้ง!!!" → reload page | Inline `error` div in red-50 bg ("อีเมล/เบอร์/รหัสไม่ถูกต้อง") |
| **Post-login redirect** | `header("location:$basePath")` to `/member/` (the index — server-side check `pcs_logged` cookie) | `/dashboard` (or `?next=`) |
| **Locale toggle** | TH/EN/CH (3 langs) | TH/EN (2 langs) — Chinese removed |
| **Captcha** | None | hCaptcha — wired into the password-reset request only (`HCaptchaInvisible` in `forgot-password/page.tsx`), **not on login itself**. ✅ intentional hardening, not on login screen. |
| **OTP rate-limit** | 5/day per phone + 5/day per IP (only on forgot-password kick, not on login submit) | Inherited via the OTP utility action; same shape ✅ |

### Divergence table — `/login`

| Severity | Pacred file:line | Legacy does | Pacred does | Fix complexity |
|---|---|---|---|---|
| 🟠 LAYOUT/POSITION | `app/[locale]/(auth)/login/page.tsx:296-305` | "Sign up" link sits in the **header card area, ABOVE the form** ("ยังไม่มีบัญชีผู้ใช้งาน? สร้างบัญชี") | Sits **BELOW the form** ("ยังไม่มีบัญชี? สมัครสมาชิก") | **S** — move the `<p>{t("noAccount")}...</p>` block up to right under the `<h1>` |
| 🟠 LAYOUT/POSITION | `messages/th.json:385` | Link label = **"สร้างบัญชี"** | Label = **"สมัครสมาชิก"** (same as the page header — slight redundancy) | **trivial** — change `registerLink` to "สร้างบัญชี" |
| 🟡 MISSING | `app/[locale]/(auth)/login/page.tsx:140-148` | `maxlength="20"` on the identifier; placeholder verbatim = "เบอร์โทรศัพท์หรือรหัสสมาชิก" | No maxLength; placeholder is `"0812345678 หรือ PR001"` (instruction text, more helpful but not legacy) | **trivial** — `maxLength={20}` + update `emailPlaceholder` i18n to `"เบอร์โทรศัพท์หรือรหัสสมาชิก"` |
| 🟡 MISSING | `app/[locale]/(auth)/login/page.tsx:336-345` (legacy) | Legacy password placeholder = **"รหัสผ่านใหม่เพื่อเข้าสู่ระบบ 6-20 ตัวอักษร"** (instruction with length spec) | Placeholder = `"••••••••"` (visual mask). | **trivial** — change `passwordPlaceholder` to legacy string |
| 🟡 MISSING | `app/[locale]/(auth)/login/page.tsx:140-148, 167-175` | Both identifier + password inputs have a leading `ft-user` / `ft-lock` icon (Bootstrap-icon set, **inside** the input box) | No leading icons — Pacred relies on the eye-toggle on right and no left adornment | **trivial** — add `User`/`Lock` Lucide icons on left (matches the register.tsx pattern already in use) |
| 🔴 PARADIGM | `app/[locale]/(auth)/login/page.tsx:55,196-206` | Remember-me is **functional** — submits to PHP, sets `member_login`/`member_password`/`pcs_logged` cookies for 10 years, **prefills the identifier on the next visit** | Remember-me is **cosmetic** — state captured, never sent to `signIn`, no cookie set, no prefill | **M** — pass `rememberMe` to `signIn` action; when true, set a small `last_login_identifier` cookie (NOT plaintext password) and use it on initial load; rely on Supabase's `persistSession` for the actual long-session |
| 🟡 MISSING | `app/[locale]/(auth)/login/page.tsx:42-83` | On invalid credentials, the legacy preserved the entered identifier (in `$_SESSION['userTelORuserIDERROR']`) so the user retypes only the password | Error path clears nothing but doesn't preserve identifier either (it's React state — preserved). ✅ Actually handled correctly by React. |
| 🟢 EXTRA | `app/[locale]/(auth)/login/page.tsx:242-293` | (no social login on legacy `login.php`) | 3 greyed-out social buttons + COMING SOON badge | OK — gated, correctly disabled |
| 🟢 EXTRA | `app/[locale]/(auth)/login/page.tsx:35-39` | (no open-redirect concern) | `safeNext()` guard on `?next=` | OK — intentional hardening |
| ⚪ COSMETIC | `app/[locale]/(auth)/login/page.tsx:552-565` | Legacy uses **SweetAlert** for both success ("ยินดีต้อนรับเข้าสู่ PCS Cargo / บริการด้วยใจ ฉับไวตรงเวลา") AND failure | Silent success (immediate redirect); inline error box on failure | **S** — owner has not explicitly asked for SweetAlerts; silent redirect is arguably better UX. **Defer Phase C** — flag only if owner objects. |
| ⚪ COSMETIC | `app/[locale]/(auth)/login/page.tsx` | No leading icon on submit button | Legacy has `<i class="ft-user-login">` before "เข้าสู่ระบบ" | trivial — add a `LogIn` Lucide icon |
| 🟢 EXTRA | `app/[locale]/(auth)/login/page.tsx:67-69` | Legacy login.php only checks userTel + userID (rebuilt-era added member_code) | Pacred detects `PR…` prefix for member_code analytics tag | OK — intentional |

### `/login` verdict

**Not faithful — 1 🔴 (remember-me), 4 🟠/🟡 layout/missing**.
Must-fix before D1 ship: **fix #1, #3, #5** at minimum.
Owner-deferrable: success-SweetAlert (cosmetic).

---

## §2 `/register` audit — BOTH tabs (personal + juristic)

**Pacred files:**
- `app/[locale]/(auth)/register/page.tsx` (Server Component wrapper — handles juristic-resume from incomplete profile)
- `app/[locale]/(auth)/register/register-client.tsx` (1389 lines — `"use client"`, both tabs + 3-step juristic flow)

**Legacy files:**
- `C:\xampp\htdocs\pcscargo\member\register.php` (1020 lines — the **CURRENT** unified personal+juristic form with `customer=1/2` radio toggling corporate fields, file uploads, OTP)
- `C:\xampp\htdocs\pcscargo\member\regis-tam.php` (444 lines — **OLD** juristic-only form, **not radio-driven**, **no file uploads**, **no OTP** — superseded by register.php)
- `C:\xampp\htdocs\pcscargo\member\register-id.php` (338 lines — **OLDEST** personal-only register, retired)

> **Decision:** legacy SOT for the personal+juristic comparison is `register.php`. `regis-tam.php` was the older juristic variant before the unified form was built; auditing against it would re-derive an outdated layout. (The prompt's mention of "the 3-step นิติบุคคล flow with DBD lookup" maps to **Pacred's** new UX — there's no DBD-lookup-in-3-steps in legacy; legacy's juristic is a single tall form on `register.php` with the corporate radio toggled.) Confirmed by grep: no `dbd|tin\.go\.th|business\.go\.th` reference in any legacy `regis*.php` file.

**Server action(s) consumed:** `registerPersonal`, `registerJuristicStep1`, `saveJuristicStep2`, `uploadJuristicDoc`, `completeJuristicRegistration`, `requestOtp`
**i18n namespace:** `messages/{th,en}.json` → `register.*`

### Side-by-side — PERSONAL form

| Aspect | Legacy `register.php` (with `customer=1` radio) | Pacred `/register` PERSONAL tab |
|---|---|---|
| **Tab/Mode picker** | A **radio-group** at top of form: `<input type="radio" name="customer" value="1" checked>บุคคลธรรมดา</input> <input type="radio" value="2">นิติบุคคล</input>` — toggling shows/hides `.corporation` block via jQuery `.fadeIn/Out` | A **tab pill** at top: 2 buttons "บุคคลธรรมดา" / "นิติบุคคล" — clicking swaps between `<PersonalForm>` / `<JuristicForm>` components |
| **Title** | `<h4>สมัครสมาชิก</h4>` + `<p>มีบัญชีอยู่แล้ว? <a>เข้าสู่ระบบ</a></p>` | "สมัครสมาชิก" + "มีบัญชีอยู่แล้ว? เข้าสู่ระบบ" ✅ match |
| **Affiliate code from `?recom=`** | URL `?recom=THADA|SIN|OOAEOM|SWAN` → readonly field "รหัสตัวแทนกลุ่ม" + persisted to `tb_users.coID` | URL `?recom=<code>` → sanitised → orange-tinted attribution badge "คุณกำลังสมัครภายใต้กลุ่ม **CODE**" (not a form field). Persisted to `profiles.customer_group`. ✅ functional, layout differs |
| **First / Last name (2 cols)** | `<input name="userName">` + `<input name="userLastName">` — labels "ชื่อจริง" / "นามสกุล" | ✅ match |
| **Phone** | `<input type="tel" id="userTel" data-intl-tel-input-id="0">` — uses **intl-tel-input** with `preferredCountries: ["th"]` + validates via `iti.isValidNumber()` + AJAX dedupe-check on focusout via `checkTelUser.php` | `<PhoneInput>` — manual `🇹🇭 +66` prefix + `+66 …` text input. **No intl-tel-input**; no client-side validation against the iti error-code map. Dedupe-check happens server-side at OTP submit. |
| **Email (optional)** | `<input type="email" name="userEmail">` — placeholder "อีเมล (ไม่ต้องกรอกก็ได้)"; AJAX dedupe-check on focusout via `checkEmailUser.php` | `<input>` with placeholder "อีเมล (ไม่ต้องกรอกก็ได้)" ✅ — but **no live dedupe-check**, dedupe happens server-side at submit |
| **Password** | `name="userPass" type="password" placeholder="รหัสผ่านใหม่เพื่อเข้าสู่ระบบ 6-30 ตัวอักษร"` + eye-toggle SVG | placeholder = `"รหัสผ่าน 6-30 ตัวอักษร"` (close but not verbatim). Eye-toggle ✅ |
| **"ซื้อสินค้า" (shopUser)** | `<select name="shopUser">` with 2 options: `1=ซื้อไปใช้เอง` / `2=ซื้อไปขาย` | ✅ `<ShopUserSelect>` with same 2 options. Required per legacy. Field label "ซื้อสินค้า" matches. |
| **"รู้จักเราจากช่องทางใด" (channel)** | `<select name="channel">` with **10 options**: 1=Google / 2=FB-IG / 3=Youtube / 4=Banner / 5=Tiktok / 6=Twitter / 7=Friend / 8=ผู้ใช้งานแนะนำ / 9=Pantip / 10=Booth-seminar | `<SourceChips>` with **8 options**: line / fb / google / youtube / tiktok / ig / friend / ad. **Different identifier set**: TH→line/ig are NEW; legacy 4=Banner, 6=Twitter, 9=Pantip, 10=Booth are GONE. |
| **Referral code input (conditional)** | When `channel=8`, jQuery dynamically appends a `<input name="userRecom" placeholder="รหัสผู้ใช้งานที่แนะนำ ex PCS999" required>` below the channel select | **MISSING** — no equivalent. `userRecom` is captured only via URL `?recom=`, not form. |
| **Service-of-interest** | **No such field** on legacy register.php | **EXTRA** — `<ServiceChips>` multi-select dropdown with 5 services (import/export/customs/order/payment) |
| **Terms checkbox** | `<input type="checkbox" name="termsOFService" value="1" required> ฉันเข้าใจและยอมรับ <a>เงื่อนไขการใช้บริการ</a> <span>และ</span> <a>นโยบายความเป็นส่วนตัว</a>` | `<AgreeRow>`: ✅ same wording. **But T&S/Privacy links are `href="#"`** (placeholder hrefs) — legacy linked to `terms-of-service/` + `privacy-policy/` |
| **Submit button** | `<button name="registerOTP">สมัครสมาชิก</button>` with `<i class="ft-user-plus">` icon — single button kicks the OTP flow | `<SubmitBtn>` labelled **"ขอรหัส OTP"** (with `MessageSquare` icon) — explicit OTP-first phrasing |
| **Help text above submit** | None | "กดเพื่อรับรหัส OTP 6 หลักทาง SMS — ยืนยันเบอร์แล้วสมัครเสร็จในขั้นถัดไป" ✅ extra clarity (🟢) |
| **OTP screen** | Same card slides into OTP UI: `<h3>ยืนยันเบอร์โทรศัพท์</h3> <h4>กรุณากรอก OTP ที่คุณได้รับทาง SMS ทางหมายเลข <phone></h4>` + warning "อย่า Refresh" + 6-box input + countdown timer + (ref:<refno>) + button "ยืนยันเบอร์โทรศัพท์" + "ไม่ได้รับ OTP? ส่ง OTP ให้ฉันอีกครั้ง" | `<OtpStep>`: 📱 emoji + "ยืนยันเบอร์โทรศัพท์" + "ส่งรหัส OTP 6 หลักไปยัง <phone>" + `<OtpInput>` 6-box + resend countdown + 2 buttons "ย้อนกลับ" / "ยืนยันรหัส" |
| **OTP timeout warning** | "รหัส OTP จะหมดอายุในอีก M:SS นาที" + "และกรุณาอย่า Refresh หรือปิดหน้าจอ" | **No countdown timer + no "อย่า refresh" warning** |
| **OTP ref number** | Displays `(ref : <refno>)` so a user phoning support can quote it | **No ref number visible** |
| **OTP submit success popup** | SweetAlert "สมัครสมาชิกสำเร็จ" + member code + assigned sales agent's photo+name+phone "ทีมเซลล์จะโทรเข้าไปแนะนำเรื่องการบริการ ผ่านเบอร์โทร XXX" | Silent redirect to `/dashboard` |

### Side-by-side — JURISTIC form

| Aspect | Legacy `register.php` (with `customer=2` radio) | Pacred `/register` JURISTIC tab |
|---|---|---|
| **Form structure** | **Single tall form** — corporate fields appear above the personal fields when radio = 2 | **3-step wizard** with StepIndicator (ข้อมูลติดต่อ → ข้อมูลบริษัท → เอกสาร) |
| **Tax ID lookup (DBD)** | **No DBD lookup** — user types tax-id manually | **DBD auto-fill** via `/api/dbd/[taxId]` — debounces 500ms, fetches company name + address. ✅ extra, but legacy customer doesn't expect it (positive surprise) |
| **Tax ID field** | `<input name="corporateNumber" maxlength="13" placeholder="เลขประจำตัวผู้เสียภาษี">` | ✅ same maxLength + placeholder = "เลขประจำตัวผู้เสียภาษี 13 หลัก" (slightly different) |
| **Company name** | `<input name="corporateName" maxlength="300" placeholder="ชื่อบริษัท">` | ✅ same label / placeholder. **No 300-char maxLength** — unbounded |
| **Address — single field** | `<input name="addressName" maxlength="300" placeholder="บ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่*">` — single line | `<input>` with placeholder "บ้านเลขที่ ถนน ซอย ชื่อหมู่บ้านและหมู่ที่" ✅ — no 300 maxLength |
| **Address — subdistrict/district/province/postcode** | 4 fields, **with jQuery.Thailand auto-complete** (`db.json` lookup) — type subdistrict → autofills others. Section "ที่อยู่บริษัท" header. | 4 manual fields. **No jQuery.Thailand auto-complete equivalent** — user types all 4. Section header ✅ "ที่อยู่บริษัท" |
| **Company affidavit upload** | `<input type="file" name="corporateFile" class="dropify" accept="image/*,.pdf" data-max-file-size="5M">` — REQUIRED for juristic (jQuery makes it required when radio=2) — **5 MB max** | `<UploadField>` for `docCompany`. accept = `".pdf,image/*"`. **10 MB max** per `docNote` (file-size diff). Required ✅ |
| **VAT certificate (ภพ20) upload** | `<input type="file" name="corporateFile20" class="dropify" accept="image/*,.pdf" data-max-file-size="5M">` — **REQUIRED for juristic** per jQuery | `<UploadField>` for `docVAT`. **OPTIONAL** in Pacred (no required check). 10 MB max. |
| **Director ID upload** | **None on legacy** (`tb_register.corporateFile` + `corporateFile20` only — no national-ID slot) | **EXTRA** — `docID` field (บัตรประชาชนกรรมการ), **required**. ✅ likely correct (legacy missed it; modern KYC needs it) — but flag as a deviation owner should explicitly own. |
| **Submit on legacy** | Same as personal — single button "สมัครสมาชิก" kicks OTP flow once everything's filled | 3-step buttons: Step1 "ขอรหัส OTP" → Step2 "ถัดไป" → Step3 "สมัครสมาชิก" |
| **Per-step OTP** | OTP is at the END of the whole form (one OTP for the whole juristic submission) | OTP is at the **END OF STEP 1** (before company info & file uploads). Different timing. |

### Divergence table — `/register`

| Severity | Pacred file:line | Legacy does | Pacred does | Fix complexity |
|---|---|---|---|---|
| 🔴 PARADIGM | `register-client.tsx:91-176` + `messages/th.json:413-419` | Channel dropdown has **10 options** including `8=ผู้ใช้งานแนะนำ` which **dynamically reveals** a referral-code text input `<input name="userRecom" placeholder="รหัสผู้ใช้งานที่แนะนำ ex PCS999" required>` | 8 different chip-options; **no "ผู้ใช้งานแนะนำ" option**; no conditional `userRecom` input | **S** — add 2 missing options (Pantip, Booth) + the "ผู้ใช้งานแนะนำ" option + conditional referral-code field |
| 🟠 LAYOUT | `register-client.tsx:250-271` | Tab/mode = **radio button** at top of one continuous form (`บุคคลธรรมดา` / `นิติบุคคล`) | Tab/mode = **pill tabs** that swap entire form bodies | **M** — could leave as-is (pill-tabs is cleaner) OR convert to radio for muscle-memory parity; owner-deferrable |
| 🟠 LAYOUT | `register-client.tsx:804-991` (juristic) | Juristic = **single tall form** | Juristic = **3-step wizard** with StepIndicator | **L** — bigger change. ✅ Genuine UX improvement (file upload on step 3 avoids re-uploading on validation failure), but it changes the migrated-customer's mental model. Owner-deferrable as Phase-C extra. |
| 🟡 MISSING | `register-client.tsx:1021-1034` (PhoneInput) | `intl-tel-input` library with `preferredCountries: ["th"]` + `iti.isValidNumber()` + per-error-code Thai messages | Manual `🇹🇭 +66` prefix + plain `<input type="tel">`. No validation feedback before submit. | **M** — add Thai-only phone shape validation (digits/length); intl-tel-input is heavy (skip the library, mimic the regex check) |
| 🟡 MISSING | `register-client.tsx` (personal+juristic) | Live AJAX dedupe-check on **phone** + **email** focusout (`checkTelUser.php` / `checkEmailUser.php`) — disables submit + shows red "is-invalid" if taken | No live dedupe — dedupe error surfaces only on OTP submit (`signup_failed: "สมัครไม่สำเร็จ — เบอร์นี้อาจสมัครไปแล้ว"`). Customer wastes OTP. | **M** — add 2 server-action lookups (`checkPhoneAvailable`, `checkEmailAvailable`) + hook on `onBlur` |
| 🟡 MISSING | `register-client.tsx:1174-1187` (AgreeRow) | T&S / Privacy links → `terms-of-service/` and `privacy-policy/` (real pages) | Both `<Link href="#">` (placeholder hrefs) — customer can't actually read the terms | **S** — wire to `/terms-of-service` + `/privacy-policy` routes (the Pacred public-site already has them) |
| 🟡 MISSING | `register-client.tsx:1313-1388` (OtpStep) | OTP screen shows: **countdown timer** "รหัส OTP จะหมดอายุในอีก M:SS นาที" + **bold red warning** "และกรุณาอย่า Refresh หรือปิดหน้าจอ" + **ref number** "(ref : XXX)" | No countdown timer, no "อย่า refresh" warning, no ref number | **S** — add countdown (`useState` + `useEffect` interval), refresh-warning paragraph, ref-number display |
| 🟡 MISSING | `register-client.tsx` (success path) | SweetAlert popup with member code + sales-agent photo+name+phone "ทีมเซลล์จะโทรเข้าไปแนะนำเรื่องการบริการ ผ่านเบอร์โทร XXX" | Silent redirect to `/dashboard`. Customer doesn't see their assigned sales rep. | **M** — add a 1-screen success step before redirecting (or a modal); fetch assigned admin from `signup_failed` action's success payload |
| 🟢 EXTRA | `register-client.tsx:569-635` (juristic, DBD lookup) | (no DBD on legacy) | DBD auto-fill from tax ID | OK — Phase-C-ish improvement, low-friction. Keep. |
| 🟢 EXTRA | `register-client.tsx:309-409` (PersonalForm) | (single submit kicks OTP) | OTP-first explicit phrasing ("ขอรหัส OTP" → OtpStep → "ยืนยันรหัส") | OK — clearer UX |
| 🟢 EXTRA | `register-client.tsx:944-965` (Step 3) | (no director ID upload) | `docID` (บัตรประชาชนกรรมการ) required | OK — modern KYC; flag in audit so owner explicitly approves |
| 🟢 EXTRA | `register-client.tsx:454-460, 1057-1122` | (no service-of-interest field) | `<ServiceChips>` 5-option multi-select dropdown | **VISIBLE divergence** — this isn't in legacy; it adds a field a returning customer doesn't expect. Reduce visual weight (collapse-by-default already done) OR move post-signup. |
| 🟡 MISSING | `register-client.tsx` (Pacred) | jQuery.Thailand subdistrict→district→province→postcode autocomplete (`db.json` lookup); section "ที่อยู่บริษัท" header | 4 manual fields. No autocomplete. Section header ✅. | **M** — port the autocomplete behaviour (use `react-thailand-address-autocomplete` or roll the same `db.json`) |
| ⚪ COSMETIC | `messages/th.json:401` | Password placeholder = "รหัสผ่านใหม่เพื่อเข้าสู่ระบบ 6-30 ตัวอักษร" | "รหัสผ่าน 6-30 ตัวอักษร" | trivial — string match |
| ⚪ COSMETIC | `register-client.tsx:466,836` ("ซื้อสินค้า") | shopUser field label = "ซื้อสินค้า"; placeholder text on `<select>` = first option default ("ซื้อไปใช้เอง") | Label ✅; placeholder = "เลือกประเภทการซื้อสินค้า" (an instruction) | trivial — could keep the legacy default-to-first-option pattern; current is fine. |
| 🟠 LAYOUT | `register-client.tsx:280-282` | Personal+juristic share a single form, with the corporate block fading in/out — affiliate-code `coIDC` field at the very top when `?recom=` is set | Tab swap separates them entirely; affiliate code is a badge, not a top-of-form field | **S** — owner-deferrable. Pill-tabs argued cleaner. |
| 🟡 MISSING | `register-client.tsx:740-746` (Step 3 onSubmit) | Legacy file size limit = **5 MB** per upload (dropify `data-max-file-size="5M"`) | Pacred = **10 MB** per upload (per `docNote`). Larger = OK for customers but legacy expectation was 5 MB; not a fidelity concern per se. | trivial — owner-deferrable. |
| 🟢 EXTRA | `register-client.tsx:46-92` (page.tsx) | (no juristic resume) | Mid-flow resume — if signed-in user has `profile.status='incomplete'`, jump to Step 2 or 3 | OK — needed bug-fix per 2026-05-25 P0; correctly engineered. |

### `/register` verdict

**Not faithful — 1 🔴 (missing "ผู้ใช้งานแนะนำ" channel + userRecom input), 3 🟠 (tab pattern, juristic 3-step, recom-code position), 8 🟡 (intl-tel, dedupe-check, terms links, OTP countdown/warning/refno, success popup, Thailand-autocomplete, password placeholder)**.

Must-fix before D1 ship: **the 🔴** (#2 in TL;DR) at minimum.
Several 🟡 are quick wins (terms links, OTP refresh-warning, password placeholder).
The 🟠 layout changes (pill-tabs, 3-step juristic) are arguably better UX but are paradigm-different vs legacy — owner-deferrable as Phase-C extras with explicit owner approval.

---

## §3 `/forgot-password` audit

**Pacred file:** `app/[locale]/(auth)/forgot-password/page.tsx` (325 lines, `"use client"`)
**Legacy file:** `C:\xampp\htdocs\pcscargo\member\login.php` (lines 62-141, 366-407, **embedded inside login.php**) + `C:\xampp\htdocs\pcscargo\member\include\pages\login\recover.php` (the set-new-password sub-screen, returned as AJAX HTML)
**Server action(s) consumed:** `requestPasswordResetByPhone`, `confirmPasswordResetByPhone`, `requestPasswordResetByEmail`
**i18n namespace:** `messages/{th,en}.json` → `forgot_password.*`

### Side-by-side

| Aspect | Legacy (inside `login.php`) | Pacred `/forgot-password` |
|---|---|---|
| **URL** | Same as login — `/login/`; the form is slide-toggled inside the login card via `#to-recover` (jQuery `slideUp/fadeIn`) | Separate route `/forgot-password`; navigated to via `<Link href="/forgot-password">` from login |
| **Trigger from login** | Tap "ลืมรหัสผ่าน?" link → form slides in-place (`#form-login` slides up, `#form-resetpass` fades in) | Tap "ลืมรหัสผ่าน?" → router navigates to new route |
| **Recovery channels** | **Phone only** (SMS OTP) | **2 toggle buttons** — "📱 ใช้เบอร์โทร" / "📧 ใช้อีเมล" |
| **Email path** | None — legacy `tb_users.userEmail` exists but no email-based recovery flow | Email mode → calls `requestPasswordResetByEmail` (Supabase magic-link); success screen "✅ ส่งลิงก์รีเซ็ตเรียบร้อย / ตรวจอีเมล {email} แล้วคลิกลิงก์เพื่อตั้งรหัสผ่านใหม่ / หากไม่พบในกล่องจดหมาย กรุณาเช็คโฟลเดอร์สแปม" |
| **Phone path Step 1 — title** | (No special title — the slide form has no h-tag; uses the same "เข้าสู่ระบบ" card title) | `<h1>ลืมรหัสผ่าน?</h1>` + kicker "รีเซ็ตรหัสผ่าน" + subtitle "เลือกช่องทางที่สะดวก เราจะส่งวิธีกู้คืนรหัสผ่านให้" |
| **Phone path Step 1 — phone field** | `<input name="userTel" maxlength="10" placeholder="เบอร์โทรศัพท์" required>` + `ft-user` icon left | `<input inputMode="tel" maxLength={10} placeholder="0812345678">` + label "เบอร์โทรศัพท์ที่ใช้ลงทะเบียน" + hint "ขึ้นต้น 0 เช่น 0812345678" |
| **Phone path Step 1 — submit** | `<button name="recover" class="btn btn-danger">ขอรหัสผ่านใหม่</button>` + `ft-user-login` icon | `<Button>{pending ? "กำลังส่ง..." : "ขอรหัส OTP"}</Button>` |
| **Phone path Step 1 — "back to login" link** | "ลงชื่อเข้าใช้งาน" link below the submit | `<Link href="/login">← กลับไปหน้าเข้าสู่ระบบ</Link>` at bottom of card |
| **Phone path Step 2 — OTP entry** | After successful OTP send → form replaced with 6-box OTP input (same layout as register OTP) + ref number + 15-min countdown timer + warning "อย่า Refresh" + "ยืนยัน OTP" button | Single `<input maxLength={6} inputMode="numeric" placeholder="000000">` (NOT 6-box layout) + green success banner "ส่งรหัส OTP ไปยัง {phone} แล้ว (หมดอายุใน 5 นาที)" |
| **OTP timeout** | **15 minutes** (`var remainingTime = 900000`) | **5 minutes** (per the success banner string) |
| **Phone path Step 3 — set new password** | Separate step (`include/pages/login/recover.php` AJAX-replaces the form) — only the password field is shown: `<input id="userPass2" name="userPass2" minlength="6" maxlength="20" placeholder="รหัสผ่านใหม่เพื่อเข้าสู่ระบบ 6-20 ตัวอักษร" required>` + eye-toggle + "ตั้งรหัสผ่านใหม่" button (`name="resetPass"`) | Same screen as Step 2 — OTP input + new-password input visible simultaneously: `<input minLength={6} maxLength={30} placeholder="••••••••">` + show/hide button + "ตั้งรหัสผ่านใหม่" button |
| **Phone path success** | SweetAlert `"สำเร็จ!!!" / "กรุณาล็อกอินเข้าสู่ระบบ"` + 4s timer → redirect to `/login/` | `router.push("/dashboard")` (auto-signs in via the action, doesn't bounce through login) |
| **Captcha** | None | hCaptcha (`HCaptchaInvisible`) on both phone-request + email-request steps |
| **Rate-limit** | 5/day per phone + 5/day per IP (same shape as register) — exceeded → "วันนี้คุณขอ OTP เกิน 5 ครั้งแล้ว" SweetAlert | Inherited via OTP utility action ✅ |
| **OTP-bypass dev flag** | None (legacy didn't have a bypass) | `EMERGENCY_OTP_BYPASS=true` server-side → returns `data.bypass:true` → client hides OTP input + auto-fills "000000" → customer skips straight to new-password set. Banner "ระบบ SMS อยู่ระหว่างปรับปรุง — กรุณาตั้งรหัสผ่านใหม่ของท่านเลย" |
| **Locale toggle** | TH/EN/CH inline | TH/EN (global) |

### Divergence table — `/forgot-password`

| Severity | Pacred file:line | Legacy does | Pacred does | Fix complexity |
|---|---|---|---|---|
| 🔴 PARADIGM | `app/[locale]/(auth)/forgot-password/page.tsx` (whole route) + `login/page.tsx:160-166` | Forgot-password is **embedded in login.php** as a slide-toggle (`#to-recover` → `#form-resetpass`). Same URL, same card, JavaScript-driven swap. | Forgot-password is a **separate route** `/forgot-password`. Click takes user away from the login card. | **L** — to true legacy parity: collapse the route onto login, slide-toggle the form. Owner may approve current separation as Phase-C improvement (deep-link to forgot is shareable). |
| 🔴 PARADIGM | `app/[locale]/(auth)/forgot-password/page.tsx:123-142` | Recovery channel = **phone only** | 2-channel toggle (phone / email — Supabase magic link) | **M** — 🟢 EXTRA technically (Pacred adds the email path). To match legacy, hide the email tab behind a "more options" disclosure, OR remove it entirely until Phase C. Otherwise owner-approve the email tab as a Phase-C improvement. |
| 🟠 LAYOUT | `app/[locale]/(auth)/forgot-password/page.tsx:170-231` | After OTP send, the form replaces step entirely → 6-box OTP grid → on verify success, a NEW form (`recover.php`) loads with the password field. **2-screen flow.** | OTP step and new-password field are on the SAME screen at the same time — user types OTP + new password together. | **S** — split into 2 screens to match legacy (verify OTP first → then show new-password form). Owner-deferrable (the single-screen is faster). |
| 🟡 MISSING | `app/[locale]/(auth)/forgot-password/page.tsx:184-190` | OTP input is a **6-box grid** (each box `maxlength=1`, auto-advances) — same component as register OTP | OTP input is a **single text field** `maxLength={6}`. **No 6-box UX.** | **S** — re-use the `<OtpInput>` component already used in register (`components/auth/otp-input.tsx`) |
| 🟡 MISSING | `app/[locale]/(auth)/forgot-password/page.tsx:170-231` | OTP screen has: countdown timer "M:SS นาที" (15-min), **bold red** "อย่า Refresh หรือปิดหน้าจอ" warning, **(ref : XXX)** number | No countdown, no refresh warning, no ref number | **S** — same fix as register OTP — add countdown + warning + ref display |
| 🟡 MISSING | `app/[locale]/(auth)/forgot-password/page.tsx:465 i18n` | Timeout = **15 minutes** (legacy `var remainingTime = 900000`) | Banner says "หมดอายุใน 5 นาที" (5 minutes) — and the underlying server action TTL is 5 min per `lib/auth/otp.ts` | **M** — set the server-side OTP TTL to 15 minutes for password-reset (legacy parity); OR keep 5 min and accept the divergence. Note: 5 min is industry standard / safer; explicitly owner-approve the deviation. |
| 🟡 MISSING | `messages/th.json:471` + form `<input maxLength={30}>` | Password maxLength = **20** ("6-20 ตัวอักษร") | maxLength = **30** ("6-30 ตัวอักษร") | trivial — owner choice. Register form is also 6-30; 6-20 is the legacy login.php constraint. Decide one limit and apply everywhere. |
| 🟡 MISSING | `app/[locale]/(auth)/forgot-password/page.tsx:155, 192` | Phone placeholder = "เบอร์โทรศัพท์"; password placeholder = "รหัสผ่านใหม่เพื่อเข้าสู่ระบบ 6-20 ตัวอักษร" (instruction) | Phone placeholder = "0812345678"; password placeholder = "••••••••" (visual mask) | trivial — change `phoneLabel`/`newPasswordLabel` placeholders to legacy strings |
| 🟡 MISSING | `app/[locale]/(auth)/forgot-password/page.tsx:90-92` | Legacy success: SweetAlert "สำเร็จ!!! / กรุณาล็อกอินเข้าสู่ระบบ" + 4s timer → redirect to `/login/` (forces re-login with new password) | Auto signs the user in + redirects to `/dashboard` (skips re-login) | owner-deferrable. Auto-sign-in is genuinely better UX, but breaks the "old password is dead, log back in" mental model legacy customers have. **M** — add a 1-screen "✅ รหัสผ่านใหม่ตั้งเรียบร้อย กำลังพาเข้าสู่ระบบ..." that's just visual reassurance |
| 🟡 MISSING | `app/[locale]/(auth)/forgot-password/page.tsx` (header) | Card title is still "เข้าสู่ระบบ" (it's a slide-in section of the login card) | Has its own title "ลืมรหัสผ่าน?" + kicker "รีเซ็ตรหัสผ่าน" + subtitle | OK — necessary since it's a separate route. ⚪ cosmetic (won't bother a legacy customer) |
| 🟢 EXTRA | `app/[locale]/(auth)/forgot-password/page.tsx:60, 65, 98-99` | (no captcha on legacy) | hCaptcha invisible on both submit paths | OK — intentional hardening |
| 🟢 EXTRA | `app/[locale]/(auth)/forgot-password/page.tsx:172-180` | (no OTP-bypass concept) | `otpBypass` UI for `EMERGENCY_OTP_BYPASS` server flag — hides OTP input + lets user reset password during SMS outage | OK — intentional emergency hatch |

### `/forgot-password` verdict

**Not faithful — 2 🔴 (separate route + email path), 1 🟠 (2-screen → 1-screen collapse), 6 🟡 (6-box OTP, countdown/warning/refno, TTL, placeholders, re-login-after-reset)**.

The 2 🔴 paradigm divergences (separate route + email mode) are the **biggest legacy-fidelity gap of any of the 3 screens**. A migrated PCS customer hits "ลืมรหัสผ่าน?" expecting a slide-toggle, gets a route change + an email option they never had — feels like a different product.

Must-fix before D1 ship: at least pull out the 🟡 quick wins (6-box OTP, OTP countdown + refresh warning + ref number). Owner-decide the 🔴 paradigm calls (the email tab in particular is a sensible Phase-C improvement that may be allowed to stay if owner explicitly approves).

---

## §4 Ranked pickup list — fixes by Severity × Complexity (smallest LOAD-BEARING first)

| Rank | Severity | Complexity | Fix | Estimated effort |
|---|---|---|---|---|
| 1 | 🟡 VISIBLE | **trivial** | Login: set `maxLength={20}` on identifier + change `emailPlaceholder` → "เบอร์โทรศัพท์หรือรหัสสมาชิก" + `passwordPlaceholder` → "รหัสผ่านใหม่เพื่อเข้าสู่ระบบ 6-20 ตัวอักษร" | 5 min |
| 2 | 🟠 LAYOUT | **trivial** | Login: change `registerLink` i18n string from "สมัครสมาชิก" to **"สร้างบัญชี"** | 2 min |
| 3 | 🟠 LAYOUT | **S** | Login: move the "ยังไม่มีบัญชี? สร้างบัญชี" paragraph from below-form to **above the form** (under the title) | 10 min |
| 4 | 🟡 MISSING | **S** | Login: add left-side `<User/>` and `<Lock/>` Lucide icons on identifier + password inputs (matches register form pattern) | 10 min |
| 5 | 🟡 MISSING | **S** | Register: wire `<AgreeRow>` terms links to `/terms-of-service` + `/privacy-policy` (replace `href="#"`) | 5 min |
| 6 | 🔴 LOAD-BEARING | **S** | Register: add "ผู้ใช้งานแนะนำ" option to `SOURCES` + reveal `userRecom` input when picked (legacy channel=8 behaviour). Optionally add Pantip + Booth-seminar to round out the 10 options. | 30 min |
| 7 | 🟡 MISSING | **S** | Forgot-password: replace single `<input maxLength={6}>` with the `<OtpInput>` 6-box component already in `components/auth/otp-input.tsx` | 15 min |
| 8 | 🟡 MISSING | **S** | Forgot-password + Register OTP step: add **countdown timer**, **"อย่า refresh"** red warning paragraph, **`(ref : <refno>)`** display. Re-use one shared component. | 45 min |
| 9 | 🟡 MISSING | **S** | Register: replace placeholder hrefs on T&S/Privacy links (same as #5, applies to register file too) | already in #5 |
| 10 | 🔴 LOAD-BEARING | **M** | Login: make remember-me **functional** — wire `rememberMe` into `signIn` action; on true, set a `last_login_identifier` cookie + use it as `useState` initial on next mount | 1.5 h |
| 11 | 🟡 MISSING | **M** | Register: add server-action **dedupe lookups** for phone + email — `checkPhoneAvailable` / `checkEmailAvailable`; hook on `onBlur`. Show inline red message + disable submit when taken. | 2 h |
| 12 | 🟡 MISSING | **M** | Register: add Thai-phone shape validation (regex / length 10 digits starting 0) — feedback under the phone field, like legacy intl-tel-input did | 30 min |
| 13 | 🟡 MISSING | **M** | Register: port jQuery.Thailand subdistrict→district→province→postcode autocomplete (or use `react-thailand-address-autocomplete`) | 1.5 h |
| 14 | 🟡 MISSING | **M** | Register OTP success: show member code + assigned sales-agent photo + name + "ทีมเซลล์จะโทรเข้าไปแนะนำเรื่องการบริการ ผ่านเบอร์โทร XXX" before redirect | 1 h |
| 15 | 🟡 MISSING | **M** | Forgot-password OTP TTL: align with legacy 15 min OR explicitly owner-decide 5 min stays | 15 min (config flip) |
| 16 | 🟠 LAYOUT | **S** | Forgot-password: split into 2 screens (verify OTP → then show new-password form) — matches legacy 2-step | 30 min |
| 17 | 🔴 PARADIGM | **L** | Forgot-password: collapse onto `/login` as a slide-toggle (kill the separate route) — true legacy parity. **Owner-decide first** (deep-link convenience vs muscle memory). | 4 h |
| 18 | 🔴 PARADIGM | **L** | Forgot-password: hide email-mode tab behind a "more options" disclosure OR defer to Phase C. **Owner-decide.** | 30 min if hidden / N/A if owner-approved |
| 19 | 🟠 LAYOUT | **L** | Register juristic: convert 3-step wizard to single tall form (matching legacy radio-toggle pattern). **Owner-deferrable as Phase-C improvement.** | 4 h |
| 20 | 🟠 LAYOUT | **M** | Register: convert pill-tab to radio-button at top of one form. **Owner-deferrable.** | 1.5 h |

**Sequencing recommendation:**
- **Today** (≈ 2 hours): items 1-8 — every 🟡 trivial/S fix + the 🔴 channel-#2 fix
- **Tomorrow** (≈ 4 hours): items 10-14 — the 🟡 M-complexity work (functional remember-me + dedupe + phone validation + Thailand autocomplete + success popup)
- **Owner-decide before action** (defer until owner-confirms): items 17, 18, 19, 20 — paradigm changes the owner may have intentionally signed off (or not)

---

## §5 Notes on intentional divergences (NOT flagged)

Per the prompt, these are NOT divergences — the prompt explicitly carves them out:

- `PR<n>` member code rebrand (vs legacy `PCS<n>`) — INTENTIONAL D1 rebrand
- hCaptcha + OTP rate-limit additions — INTENTIONAL hardening (rebuilt-app baseline)
- Supabase Auth + legacy-bridge instead of mysqli — INTENTIONAL platform change
- Single `/register` route with tabs vs legacy 2 URLs (register.php + regis-tam.php) — INTENTIONAL consolidation (form bodies compared field-for-field above)
- Tailwind chrome vs Bootstrap 4 CSS — INTENTIONAL rebuild (ปอน's brand)

Other intentional divergences I observed (not flagging, but recording for completeness):

- **Pacred i18n** — TH+EN; legacy had TH+EN+CH. Chinese removed. ✅ correct (owner has not asked for Chinese).
- **Pacred `safeNext()` open-redirect guard** on `?next=` and `?recom=` URL params — legacy had no such guard (a security upgrade). ✅ correct hardening.
- **Pacred admin-vs-customer split at login** (`/admin` for admins, `/dashboard` for customers) — legacy was one role per user, no separate destination. ✅ intentional per ADR-0002.
- **Pacred `?next=` deep-link** routing (from booking calculator etc.) — legacy didn't have a routed booking calculator at all. ✅ intentional new flow.
- **Pacred juristic `docID` (บัตรประชาชนกรรมการ)** required — legacy didn't ask. Flag for **explicit owner approval**; this changes the documents a customer must prepare before signup. (Listed as 🟢 EXTRA in §2 — flag, don't drop.)

---

## §6 Cross-references

- ADR-0017 — D1: Pacred = faithful PCS Cargo port (the rule this audit enforces)
- `docs/research/d1-fidelity-customer.md` — broader gap map for customer screens (this audit is the auth slice)
- `docs/runbook/faithful-port-plan.md` — overall plan/branch model
- `docs/runbook/faithful-port-transcription.md` — the canonical 1:1 method
- Same-day related commits on `dave-pacred`:
  - `a8af737d` fix(register): hard-navigate after signup
  - `7a4a4750` fix(register-juristic): parallelise uploads + visible progress + catch silent throws
  - `125369a0` fix(register): mobile-unreachable submit + invisible juristic step-3 errors
  - (These are the 2026-05-28 register usability fixes — they DON'T address fidelity gaps, only UX bugs on the existing layout. The fidelity gaps above remain after those commits.)

---

**End of audit.** Total divergences flagged: **40** (🔴 = 4, 🟠 = 6, 🟡 = 18, 🟢 = 8, ⚪ = 4). Verdict per screen: all 3 currently **not faithful** under the D1 "100% sameness first" rule. Quickest wins to ship: §4 items 1-9 (≈2 hours of trivial / S work clears the 9 quickest gaps including the only register-side 🔴).
