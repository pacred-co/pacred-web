# cust-01-auth — Legacy ↔ Pacred fidelity gap audit

> Lane: **cust-01-auth** (customer side) · Owner-mandate audit ("ห้าม death", legacy is the spec, flow-ORDER must match)
> Author: เดฟ-spawned audit agent · 2026-05-30
> Legacy source: `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/`
> Pacred: `/Users/dev/pacred-web` @ `dave-pacred`

---

## Overview

### Legacy scope (the spec)
The legacy PCS customer-auth subsystem is a single-entry `?page=` router + `include/pages/<dir>/` AJAX handlers + `api/` endpoints. The **page bodies** (`login.php` / `register.php` / `profile.php` / `account-settings.php`) are NOT in this code extract — only the `member/` infrastructure (`include/function.php` 190 KB, `include/pages/`, `api/`) was captured. The full business logic of register→OTP→account-creation IS present and is the source of truth:

| Legacy workflow | Canonical file(s) | What it does |
|---|---|---|
| Register staging | `register.php` (body absent) → writes `tb_register` | Stage personal/juristic signup into `tb_register` w/ `token`+`userTel`; send SMS OTP |
| Register OTP-verify → account creation | `api/otp/check-otp-register.php`, `api/otp/verify-otp.php` | On OTP success: gen `userID='PCS'.(max+1)`, **round-robin `adminIDSale`** (by companyType/department/section), if `type==2` insert `tb_corporate`, insert `tb_users`, **DELETE `tb_register`**, seed `tb_users_otp` + **`tb_wallet`** + **`tb_cash_back`**, set session |
| Juristic auto-fill | `api/check-juristic-person/index.php` | Tax-ID → DBD `openapi.dbd.go.th/api/v1/juristic_person` (fallback `dataapi.moc.go.th`) → company name + EN/TH full-address breakdown + branch + objective |
| Login | `login.php` (body absent), `include/headerLogin.php`, `include/all-scriptLogin.php` | phone/member-code + `pass_tam()` password; remember-me checked by default; **no social, no email-first** |
| Password (`pass_tam`) | `include/encryptPass.php` | `strrev(md5(p)) . substr(md5(p),0,15) . md5(substr(md5(p),0,15))` = 79-char hash |
| Forgot password | `include/pages/login/recover.php` | `userRecoverKey` + `userRecoverDate > NOW()-15min` → set new pass form |
| Profile edit | `profile.php` (body absent), `include/pages/profile/check{Email,Tel}User.php` | Update tb_users fields; phone-change → wipe `tb_users_otp` |
| Account settings | `account-settings.php` (body absent) | Old-pass verify vs `tb_users.userPass` → write `userPass` + `pcs_logged` → logout |
| OTP send/verify | `api/otp/*` | Providers: `sms.tiso-ai.com/api/SMS` (TISO), `tam-i-t.com/api/sms-otp`, thaibulksms — `customerID='PCSCargo'` |
| Register uniqueness | `include/pages/register/check{Email,Tel}User.php` | `WHERE … AND userStatus<>'0'` (soft-deleted excluded) |
| Sales-activation queue | `pcs-admin/.../usersActive.php` | pending list = **`WHERE userActive=''`** (empty), approve → `userActive='1'` |

### Pacred scope (the port)
- Routes: `app/[locale]/(auth)/{login,register,forgot-password}/*` + `(protected)/{profile,account-settings,profile/security/change-phone}/*`
- Actions: `actions/{auth,otp,security}.ts` + `(protected)/{profile,account-settings}/actions.ts`
- Auth lib: `lib/auth/{pcs-legacy-bridge,pcs-legacy-password,legacy-bridge-tb-users,get-user,require-auth,require-admin}.ts`
- DBD: `app/api/dbd/[taxId]/route.ts` + `lib/dbd/parse-juristic.ts`

### % complete (this lane)
**~72% faithful.** Login, password hashing (`passTam` exact), forgot-password, profile-edit, account-settings password-change, OTP verify, and the legacy-bridge first-login are genuinely strong 1:1 ports. The **register account-creation pipeline** is architecturally **inverted** (Pacred writes the rebuilt `profiles`/`auth.users` as canonical and best-effort *mirrors* into `tb_users`; legacy `tb_users` IS canonical) and three legacy register-time side-effects are **missing or relocated** (`adminIDSale` round-robin, `tb_wallet`/`tb_cash_back` seeding, `userActive` value semantics). Plus a live **security hole** (`EMERGENCY_OTP_BYPASS = true` hardcoded).

---

## Workflow-by-workflow gap table

| # | Legacy flow | Pacred equivalent | Status | Flow-order correct? | Owner |
|---|---|---|---|---|---|
| 1 | **Register: stage → OTP → promote** (`tb_register` → verify → `tb_users`) | `registerPersonal` / `registerJuristicStep1`: create `auth.users`+`profiles` directly, then best-effort mirror `tb_users` | 🟡 functional but **inverted** | ❌ **No staging table; creation order reversed** | เดฟ |
| 2 | **`adminIDSale` round-robin at register time** (companyType/dept/section rule) | `approveCustomer` assigns at **approval time** via "fewest-owned" count | 🟡 present but **relocated + diff algorithm** | ❌ **register-time → approval-time** | เดฟ |
| 3 | **Seed `tb_wallet` on signup** | none on native signup (wallet created lazily elsewhere) | ❌ missing | ❌ | เดฟ |
| 4 | **Seed `tb_cash_back` on signup** | none on native signup | ❌ missing | ❌ | เดฟ |
| 5 | **Seed `tb_users_otp` (verified-identity log) on signup** | not seeded at register; written only on profile phone-change | 🟡 partial | ❌ | เดฟ |
| 6 | **`userActive` pending semantics** — legacy new = `''`, queue `WHERE userActive=''`, approve→`'1'` | Pacred native signup = `userActive='0'`; pending queue reads `'0'` | 🟡 **value mismatch** | ❌ migrated(`''`) vs native(`'0'`) split | ภูม |
| 7 | **Juristic: insert `tb_corporate`** on OTP-verify | `saveJuristicStep2` upserts rebuilt `corporate` table (+ mirror profiles) | 🟡 dead-write to rebuilt table | ❌ wrong table | เดฟ |
| 8 | **Juristic auto-fill** tax-ID → DBD company name+address | `/api/dbd/[taxId]` (CKAN) wired into register-client step 2 | 🟢 present (endpoint modernised — legacy v1 API retired) | ✅ | ก๊อต |
| 9 | **Login** phone/member-code + `pass_tam` | `signIn` native Supabase + legacy bridge fallback | 🟢 strong | ✅ | เดฟ |
| 10 | **Password hash `pass_tam()`** | `passTam()` in `pcs-legacy-password.ts` | 🟢 **exact** (verified char-for-char) | ✅ | — |
| 11 | **Legacy first-login bridge** (verify 79-char hash → provision Supabase) | `bridgeLegacyLogin` | 🟢 strong (well-documented edge cases) | ✅ | เดฟ |
| 12 | **Forgot password** phone OTP + `userRecoverKey` | `requestPasswordResetByPhone`/`confirm…` (+ email magic-link bonus) | 🟢 present (recoverKey replaced by `otp_codes`) | ✅ | เดฟ |
| 13 | **Profile edit** (tb_users update + OTP wipe on phone change) | `updateProfileAction` → writes `tb_users` 1:1 | 🟢 **faithful** (writes real tb_users) | ✅ | เดฟ |
| 14 | **Account-settings password change** (verify old vs tb_users.userPass → write userPass+pcs_logged → logout) | `updatePasswordAction` → verify vs Supabase + mirror tb_users.userPass/pcs_logged → logout | 🟢 **faithful-by-behaviour** (documented split) | ✅ | เดฟ |
| 15 | **check{Email,Tel}User** uniqueness AJAX (`userStatus<>'0'`) | `checkEmailTaken`/`checkTelTaken` → tb_users `neq userStatus '0'` | 🟢 **exact** (incl. legacy typo "เบอรฺ") | ✅ | เดฟ |
| 16 | **OTP send/verify** (TISO/tam-i-t/thaibulksms, customerID PCSCargo) | `requestOtp`/`verifyOtp` (ThaiBulkSMS via `lib/sms/gateway`) | 💀 **BYPASSED — hardcoded `EMERGENCY_OTP_BYPASS=true`** | n/a | ก๊อต |
| 17 | **Identity guard on re-register** | `findLegacyUserIdByPhone` blocks dup-phone re-signup (`phone_exists`) | 🟢 Pacred improvement (prevents orphan PR005) | ✅ | เดฟ |
| 18 | **Remember-me** checkbox checked by default | added to `/login` (UI-only — Supabase session is server-controlled) | 🟢 present | ✅ | ปอน |
| 19 | **Social login (fb-callback / LINE)** | gated OFF (`NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED`), greyed "COMING SOON" | 🟢 D1-correct (legacy had none) | ✅ | ปอน |
| 20 | **Register form shape** — one page, juristic via inline radio, post-OTP rep popup | tabs (personal/juristic) + 3-step juristic wizard; **no sales-rep popup** | 🟠 different mental model | ⚪ UI | ปอน |
| 21 | **"ซื้อไปใช้เอง/ซื้อไปขาย" `shopUser` select** | schema + mapping exist; **verify it renders** in register-client | 🟡 backend ready, UI parity TBD | ✅ | ปอน |

---

## Death-flows (P0/P1 detailed)

### 💀 P0-1 — OTP verification is dead (hardcoded bypass) — SECURITY HOLE
`actions/otp.ts:42` — `const EMERGENCY_OTP_BYPASS = true;` (NOT env-gated). Both `requestOtp` (returns `{ok:true,bypass:true}` without sending SMS) and `verifyOtp` (returns `true` unconditionally) short-circuit. **Anyone can register/reset with any phone, no verification.** The legacy never shipped without OTP. The code itself flags this as a "production blocker" (`docs/env.md §3`). This is the single most important fidelity + security gap in the lane.
**Fix:** restore `process.env.OTP_BYPASS === "true"` gating + flip the constant to `false` the moment the ThaiBulkSMS route is fixed. Owner: **ก๊อต** (partner-API + production gate). Severity **P0**.

### 💀 P0-2 — Register account-creation model is INVERTED (canonical-table inversion)
Legacy: OTP-verify INSERTs into **`tb_users`** (the table holding all 8,898 customers) — `tb_users` IS the customer. Pacred: `registerPersonal`/`registerJuristicStep1` create `auth.users` + `profiles` as canonical, then call `insertLegacyTbUserRow` as a **best-effort mirror** that logs-but-doesn't-roll-back on failure (and silently no-ops on any phone/userID collision). Net effect: a Pacred-native customer's *real* identity lives in `profiles`, and their `tb_users` row may be **absent or stale** — yet every customer-side `tb_*` query (orders, wallet, forwarder, receipts) joins on `tb_users.userID = member_code`. A native signup whose mirror silently no-op'd is a **functional orphan** in the legacy data plane. This is the auth-side root of the same "dead-write to rebuilt table" pattern the prior audits flagged for orders/forwarders/yuan.
**Fix (architecture decision):** make `tb_users` the canonical write on signup (insert `tb_users` first, then provision Supabase auth keyed to it), OR make the mirror transactional + fail-closed. Owner: **เดฟ** (integration spine / cross-cutting). Severity **P0**.

### 🔴 P1-3 — Sales-rep `adminIDSale` assignment moved register-time → approval-time + different algorithm
Legacy assigns `adminIDSale` **inside the OTP-verify INSERT** using a deterministic round-robin over `tb_admin WHERE adminStatusA='1' AND adminTMP<>'2' AND (companyType IN 1,3) AND (department IN 1,5) AND (section IN 18,1,2)` advancing past the last-assigned rep. Pacred has **no rep at signup**; `approveCustomer` (admin action) assigns later via a "fewest-owned-rows" count over a different candidate set (`admins` joined to `admin_contact_extras`). Two divergences: **(a) timing** — legacy customer has a rep the instant they sign up (the post-register popup promises "ทีมเซลล์จะโทรหา"); Pacred customer has none until an admin approves; **(b) algorithm** — sequential-rotation vs least-loaded, and a different eligibility filter. For "zero retraining," sales expects every new lead to already carry a rep.
**Fix:** reproduce the legacy register-time round-robin (same companyType/department/section filter, same advance-past-last cursor) at signup. Owner: **เดฟ** (customer-backend). Severity **P1**.

### 🔴 P1-4 — `tb_wallet` + `tb_cash_back` not seeded on native signup
Legacy seeds both on OTP-verify (`INSERT INTO tb_wallet (userID)…` + `INSERT INTO tb_cash_back (userID)…`). Pacred native signup seeds neither (confirmed: no `tb_wallet`/`tb_cash_back` reference in `actions/auth.ts` or `legacy-bridge-tb-users.ts`). A native customer with no `tb_wallet` row → wallet balance reads/credits may 0-row-fail or lazily create with wrong defaults; cash-back accrual has no ledger root.
**Fix:** seed `tb_wallet` + `tb_cash_back` (keyed `userID=member_code`) in the same place the canonical `tb_users` row is created. Owner: **เดฟ**. Severity **P1**.

### 🔴 P1-5 — `userActive` value mismatch splits the pending-approval queue
Legacy new customer = `userActive=''` (empty — the register INSERT omits the column; admin queue `usersActive.php` = `WHERE userActive=''`). Pacred native signup = `userActive='0'` (`legacy-bridge-tb-users.ts:175`). So **migrated/legacy-truth pending customers (`''`) and Pacred-native pending customers (`'0'`) are two disjoint sets**, and whichever value the Pacred admin pending-queue filters on will silently miss the other half. Need to confirm which value `/admin/customers/pending` filters (audited in the admin lane) and unify.
**Fix:** standardise the pending sentinel to legacy `''` (faithful), or migrate the queue + all readers to `'0'` consistently. Owner: **ภูม** (admin back-office reads the queue). Severity **P1**.

### 🔴 P1-6 — Juristic company data dead-writes to rebuilt `corporate`, not `tb_corporate`
Legacy OTP-verify inserts `tb_corporate (userID, corporateNumber, corporateName, corporateAddress, corporateFile, corporateFile20, corporateStatus)`. Pacred `saveJuristicStep2` upserts the **rebuilt `corporate`** table (profile_id, tax_id, company_name, company_address) + mirrors a couple fields to `profiles`. Same silent-dead-write class as P0-2: juristic identity for legacy-consuming admin screens (tax-invoice eligibility reads `tb_corporate`) won't see Pacred-native juristic signups. Also drops `corporateFile`/`corporateFile20` (the affidavit + VAT-20 file refs the legacy stored on the corporate row — Pacred puts them only in `documents`).
**Fix:** write `tb_corporate` (keyed by member_code) as canonical for juristic signups. Owner: **เดฟ**. Severity **P1**.

---

## Flow-order divergences (the owner's specific concern)

1. **Register creation order reversed** (P0-2): legacy = `tb_register` → OTP → `tb_users` (one INSERT is the customer). Pacred = `auth.users` → `profiles` → *(mirror)* `tb_users`. No staging table used; canonical table inverted.
2. **Sales-rep assignment relocated** (P1-3): register-time (legacy) → approval-time (Pacred). Breaks the "rep already assigned, will call you" expectation.
3. **Account activation semantics** (P1-5): legacy `userActive` is a *sales-contacted* flag (`''`→`'1'`) that never gated login; Pacred reframes `'0'`→`'1'` as a pending-**approval** gate (different meaning, different value, and a queue split).
4. **Juristic side-effects timing**: legacy creates `tb_corporate` atomically in the same OTP-verify step as the user. Pacred splits it across Step 1 (auth+profile) → Step 2 (corporate) → Step 3 (docs) → complete. Multi-step is fine for UX, but the corporate row lands in the wrong table (P1-6) and there's a window where a juristic user exists with `status='incomplete'` and no corporate row.
5. **Wallet/cash-back seeding dropped** (P1-3/4): legacy seeds them in the creation step; Pacred defers/omits.

These are real flow-order gaps even though most individual pieces exist — exactly the class the mandate calls out.

---

## Modals / AJAX / cron / print inventory (auth lane)

| Type | Legacy artifact | Pacred equivalent | Status |
|---|---|---|---|
| AJAX | `register/checkEmailUser.php` | `checkEmailTaken` (auth.ts/profile actions) | 🟢 |
| AJAX | `register/checkTelUser.php` | `checkTelTaken` | 🟢 |
| AJAX | `profile/checkEmailUser.php` (excl. own) | `checkEmailTaken` (excludes own) | 🟢 |
| AJAX | `profile/checkTelUser.php` (excl. own) | `checkTelTaken` (excludes own) | 🟢 |
| AJAX | `login/recover.php` (recoverKey panel) | `/forgot-password` page (server actions) | 🟢 (route vs inline panel) |
| API | `api/otp/check-otp-register.php` | `verifyOtp` + `registerPersonal` | 🟡 bypassed (P0-1) |
| API | `api/otp/verify-otp.php` (no-token fallback) | (folded into verifyOtp) | 🟡 |
| API | `api/otp/check-otp.php` (logged-in re-verify) | (none — covered by change-phone OTP) | ⚪ |
| API | `api/otp/check-otp-recover.php` | `confirmPasswordResetByPhone` | 🟢 |
| API | `api/check-juristic-person/index.php` (DBD v1+moc fallback) | `/api/dbd/[taxId]` (CKAN opendata) | 🟢 endpoint modernised |
| API | `api/linenotify/callback/` (social/LINE) | none (social gated off) | ⚪ Phase C |
| Modal | post-register **sales-rep intro popup** (photo+name+"ทีมเซลล์จะโทรหา") | **none** | 🟡 P1-3 (tied to rep assignment) |
| Modal | `account-settings` success → `window.location.replace('logout/')` | `accountSettingsLogoutAction` after `sPass` | 🟢 |
| Cron | none in auth lane | — | — |
| Print | none in auth lane | — | — |

**Notes:** Pacred *adds* a password-gated 2-step **change-phone** flow (`actions/security.ts` + `(protected)/profile/security/change-phone`) the legacy lacked (legacy changed phone inline in profile.php with an OTP-wipe). This is a security improvement, not a gap — but it is Phase-C-flavoured (extra surface beyond legacy). Legacy phone-change behaviour itself IS reproduced inside `updateProfileAction` (wipes `tb_users_otp` + syncs Supabase phone). Forgot-password adds an **email magic-link** path the legacy lacked (legacy was phone-OTP + recoverKey only) — additive, acceptable.

---

## Recommended fixes (ranked, with owner)

| Rank | Fix | Owner | Severity | Effort |
|---|---|---|---|---|
| 1 | **Restore OTP gating** — revert `EMERGENCY_OTP_BYPASS` to env-gated + `false` once ThaiBulkSMS route fixed (P0-1). Coordinate the SMS-route fix first. | **ก๊อต** | P0 | S (once SMS fixed) |
| 2 | **Decide + fix the register canonical-table model** (P0-2): make `tb_users` the canonical signup write (or make the mirror transactional fail-closed). Unblocks P1-3/4/6 since they all hang off "where/when the canonical customer row is created". | **เดฟ** | P0 | L (architecture) |
| 3 | **Reproduce register-time `adminIDSale` round-robin** with the exact legacy filter (companyType 1,3 / dept 1,5 / section 18,1,2 / advance-past-last) (P1-3). | **เดฟ** | P1 | M |
| 4 | **Seed `tb_wallet` + `tb_cash_back`** in the canonical signup step (P1-4). | **เดฟ** | P1 | S |
| 5 | **Write `tb_corporate`** (incl. corporateFile/File20 refs) for juristic signups instead of rebuilt `corporate` (P1-6). | **เดฟ** | P1 | M |
| 6 | **Unify `userActive` pending sentinel** (legacy `''` vs Pacred `'0'`) across signup + the admin pending queue + every reader (P1-5). Confirm queue filter in admin lane first. | **ภูม** | P1 | M |
| 7 | **Add post-register sales-rep intro popup** (rep photo+name+"ทีมเซลล์จะโทรหา") once rep is assigned at signup (P1-3 dependent). | **ปอน** | P2 | S |
| 8 | **Register UI fidelity** — consider single-page + inline-radio juristic reveal; confirm `shopUser` select renders; keep personal path one screen (gap #20/#21). | **ปอน** | P2 | M |

---

### Verification notes (trust-but-verify done)
- `passTam()` checked char-for-char against `include/encryptPass.php` — **exact** (79-char `strrev(md5)+substr15+md5(substr15)`).
- `userActive` legacy default verified: register INSERT (`check-otp-register.php`) contains **0** occurrences of `userActive` (defaults to `''`); admin queue `usersActive.php` confirmed `WHERE userActive=''`. The "0 vs ''" mismatch is real.
- `tb_register` exists in Pacred schema (`0081`) but is **not referenced** by any register action — staging pattern abandoned.
- DBD endpoint divergence is **benign**: route comment + code confirm legacy `opendata.dbd.go.th/api/v1/*` was retired 2026-05-17; CKAN `datastore_search` is the working replacement.
- `tb_wallet`/`tb_cash_back` seeding absence confirmed by grep of `actions/auth.ts` + `legacy-bridge-tb-users.ts` (zero hits).
- profile-edit + account-settings + check{Email,Tel} ports read as genuine 1:1 transcriptions writing the **real `tb_users`** — these are the high-fidelity parts of the lane.
