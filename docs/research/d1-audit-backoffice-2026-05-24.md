# D1 Audit — `backoffice.pcscargo.co.th` (2026-05-24)

> **Source:** `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/backoffice.pcscargo.co.th/`
> **Scope:** every Controller · Model · Helper · View · Route · modal · AJAX · integration. Owner directive "ห้าม death" — bring everything in, rebrand `PCS` → `PR`.

---

## 1. Architecture overview

- **Framework:** custom PHP MVC (non-Laravel) — `index.php` dispatcher + `route-generated.txt` map
- **Purpose:** lean admin gateway that fronts the **MOMO Cargo LCL** integration; not the main pcscargo.co.th admin
- **Auth:** dual — `$_COOKIE[SYSTEM_NAME_KEY]` for pages + Bearer token (`tb_admin.bearer_token`) for API
- **Scale:** 3 page controllers, 1 API module (2 routes), 1 auth model, custom helpers — ~18 KB business code · 52 KB assets
- **DB:** shared `pcsc_main` (same as main pcscargo) — reads/writes `tb_admin` + `tb_tmp_forwarder_item_momo` + `tb_options`

---

## 2. Routes catalog

### Pages (via `index.php` dispatcher)
| Route | Controller | Auth | Purpose |
|---|---|---|---|
| `/` | `DashboardController.php` | cookie | Dashboard (stub — placeholder) |
| `/dashboard` | `DashboardController.php` | cookie | Dashboard (same stub) |
| `/login` | `LoginController.php` | none | Admin login form |
| `/logout` | `LogoutController.php` | none | Cookie expire + redirect |

### API (`app/Controllers/Api/api.php`)
| Endpoint | File | Method | Auth | Input | Output | Tables |
|---|---|---|---|---|---|---|
| `POST /login` | `Routes/auth/login.php` | POST | none (or localhost) | `{userId, password}` | `{adminID, adminName, adminEmail, adminPicture, bearer_token}` | `tb_admin` (read + write bearer) |
| `POST /check-sack-import-lcl` | `Routes/import-lcl-momo/check-tracks.php` | POST | Bearer token (or localhost) | `{sack: string\|array}` | `{tracks[], sackWeight, productCBMAllTotal, productWeightAllTotal}` | `tb_admin`, `tb_tmp_forwarder_item_momo` |

**API auth:** Bearer extracted from `Authorization: Bearer <token>` header → validated against `tb_admin.bearer_token`. Localhost or public route (`/login`) → skip Bearer check.

---

## 3. Controllers + Models + Helpers

### Controllers (`app/Controllers/Pages/`)
- **LoginController.php** — 2 lines · include of login view
- **DashboardController.php** — 2 lines · include of dashboard view (currently stub)
- **LogoutController.php** — 4 lines · expires cookie + redirects to login

### Models (`app/Models/`)
- **Authorization.php** (52 lines) — page-side auth middleware. Checks `$_COOKIE[SYSTEM_NAME_KEY]`. Loads full admin record from `tb_admin` into PHP vars (`$adminID`, `$adminName`, `$adminEmail`, `$adminStatus`, `$adminType`, `$adminDepartment`, `$section`, `$adminLang`, `$adminWorkZone`, `$startDate`, `$endDate`, `$profileImage`, `$adminLastLogin`). If invalid → redirect to `/login`.

### Helpers
- **`app/Helpers/functions.php`** (48 lines)
  - `adjustRequestParts($request)` — parse URI → route parts
  - `isLocalhost()` — server check
  - `breadcrumb($options)` — render breadcrumb HTML
- **`app/Controllers/Api/functions.php`** (32 lines)
  - `getBearerToken()` — extract from Authorization header
  - `pass_tam($password)` — **custom hash**: `md5(pw) → substr(0,15) → md5 → reverse → concat`

---

## 4. Views

| View | File | Renders | Forms | Modals | AJAX |
|---|---|---|---|---|---|
| Login | `Pages/login/login.php` | Admin login | `adminTelORadminID` + `adminPass` + `remember` | SweetAlert2 (3 instances) | `fetch POST /app/Controllers/Api/login/` |
| Dashboard | `Pages/dashboard/default.php` | Dashboard stub | None | References `#add-settings-vip` (NOT defined) | None |
| Logout | `Pages/logout/logout.php` | Redirect msg | None | None | `setTimeout` → `/login` |

**Login form details:**
- Method: AJAX (fetch), not traditional POST
- Validation: client-side empty-check
- On success: `setcookie(SYSTEM_NAME_KEY, adminID)` + redirect to `/dashboard`
- On error: SweetAlert2 error

**Dashboard:** single button referencing modal `#add-settings-vip` (placeholder — modal HTML missing)

---

## 5. Modal + AJAX + Form inventory

### Modals
- `#add-settings-vip` — referenced in dashboard view but **NOT defined** (placeholder — future feature)

### AJAX calls
- **Login** — `fetch POST /app/Controllers/Api/login/` with `{userId, password}` → JSON with `bearer_token`

### Forms
- **Login form** (`login.php`) — fields: `adminTelORadminID`, `adminPass`, `remember` (checkbox)

---

## 6. External integrations

### MOMO Cargo API (`https://api.momocargo.com:8080`)
- **Endpoint used:** `GET /api/sack/get/info/{sack}`
- **Auth:** Bearer token (⚠️ **hardcoded in source**):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoyNCwiX2lkIjoiNjkzYTc4NmZmODQ5ZTM5ZTA2YTc2NmY4IiwibGFzdF9vbmxpbmUiOiIyMDI1LTEyLTI0IDEwOjQyOjIwIiwiaWF0IjoxNzY2NTQ0NTg3fQ.SJNWigeK7kmEz8yfO-h_fXji8Anu9UuDFA25m4lSV9w
  ```
- **Use case:** fetch sack tracking info + CBM/weight
- **Data flow:**
  1. Frontend → `{sack: "CG123" | ["CG123", ...]}`
  2. API calls MOMO → `tracks[]` + `weight`
  3. Lookup each track in local `tb_tmp_forwarder_item_momo` (CG-prefixed = `productTracking` match)
  4. Aggregate CBM + weight
  5. Return `{tracks, sackWeight, productCBMAllTotal, productWeightAllTotal}`

**No other external APIs.**

---

## 7. Auth flow

```
User → /login → LoginController → login.php view
                                       ↓
                            fetch POST /app/Controllers/Api/login/
                                       ↓
                            ├─ Validate userId + password
                            ├─ Hash via pass_tam()
                            ├─ SELECT * FROM tb_admin WHERE adminID=? AND adminPass=?
                            ├─ Found:
                            │   ├─ Generate Bearer: bin2hex(random_bytes(16))
                            │   ├─ UPDATE tb_admin SET bearer_token=?
                            │   ├─ $_SESSION['adminID'] = adminID
                            │   ├─ setcookie(SYSTEM_NAME_KEY, adminID)
                            │   └─ Return 200 + user + bearer
                            └─ Else: Return 401

User → /dashboard → index.php → require Authorization.php
                                       ↓
                                ├─ if (!cookie) → redirect /login
                                ├─ SELECT * FROM tb_admin WHERE adminID=?
                                ├─ Found → extract into $adminID, $adminName, ...
                                └─ Else → expire cookie + redirect /login

User → /logout → LogoutController → setcookie(SYSTEM_NAME_KEY, '', past)
                                       ↓
                            logout.php → setTimeout(redirect /login, 2000)

API call → /check-sack-import-lcl → api.php
                                       ↓
                                ├─ if localhost OR public route → skip Bearer
                                ├─ else require Authorization Bearer
                                ├─ Validate against tb_admin.bearer_token
                                └─ Dispatch to route file
```

**Dual auth:** cookie for pages + Bearer for API. Session + cookie both set on login (redundant — investigate).

---

## 8. Tables touched

1. **`tb_admin`** (full record)
   - cols: adminID, adminPass, adminStatus, adminName, adminLastName, adminEmail, adminPicture, adminRegistered, adminTel, adminLastLogin, adminType, department, section, startDate, endDate, adminDel, dateDel, adminNickname, adminLang, workZone, **bearer_token**
   - written by: login (sets bearer_token); read by: Authorization, api.php
2. **`tb_tmp_forwarder_item_momo`** (MOMO LCL cache)
   - cols: productID, productTracking, productCBMAll, productWeightAll
   - read by: check-tracks
3. **`tb_options`** (config kv)
   - keys: `system_name_key`, `system_name`, `site_url`, `site_url_member`, `site_url_backoffice`
   - used by: `config/app.php` for defining constants

---

## 9. PORT CHECKLIST

| Item | Priority | Notes |
|---|---|---|
| **Auth system (login/logout + Bearer)** | 🔴 MUST | Custom `pass_tam()` must port exactly (md5→substr→reverse). Session + cookie + Bearer all required. |
| **API route framework (api.php)** | 🔴 MUST | Bearer validation + route dispatch + public/private logic. Design simple but must be exact. |
| **MOMO Cargo integration (check-tracks.php)** | 🔴 MUST | Move Bearer to env var. Port curl → fetch. Business: sack lookup + CBM/weight aggregation. |
| **Login form UI** | 🔴 MUST | React component + Swal alerts (or toast lib) + remember cookie. |
| **Sidebar menu (menu.php)** | 🔴 MUST | Dashboard · API MOMO (3 sub: Dashboard / Manual / History) · profile · logout. Update "Back to Old System" link. |
| **Helpers (`tam-it.js`)** | 🟡 SHOULD | Number formatting, validation, menu state. Port to TypeScript utilities. |
| **Breadcrumb helper** | 🟡 SHOULD | Low complexity; Next.js routing may cover. |
| **Dashboard page (stub)** | 🟡 SHOULD | Currently placeholder. Port structure for future fill. |
| **Login JS (login.js)** | ⚪ SKIP | Duplicate of `tam-it.js`. Consolidate. |
| **Logout view** | ⚪ SKIP | Can replace with API + Next redirect. |
| **Theme CSS + Bootstrap assets** | 🟡 SHOULD | **Owner directive:** follow ปอน's `podeng` theme/branding instead of porting legacy theme files. |
| **Icons + fonts** | ⚪ SKIP | Upgrade to modern (lucide-react already in pacred-web). |

---

## 10. Rebranding tasks (`PCS` → `PR`, follow ปอน's podeng style)

1. **Logos** (`assets/images/theme/`):
   - `logo-pcs-admin.png` → use `public/images/pacred-logo-red.png` (already in pacred-web)
   - `logo-text-dark.png` → use Pacred horizontal lockup (request from ปอน per brand-asset-swap doc — 🔴 missing)
2. **CSS / colors:**
   - Do NOT port legacy Bootstrap theme; use Tailwind + Pacred theme (`@theme inline` in `app/globals.css`) — primary-600 = `#B30000`
3. **Strings:**
   - `SYSTEM_NAME` config → "PR Admin" (was "PCS Admin")
   - Login title "เข้าสู่ระบบสำหรับ Admin" → "เข้าสู่ระบบสำหรับ PR Admin"
4. **DB config** (`tb_options`):
   - `system_name` → "PR Admin"
   - `site_url_backoffice` → `https://pacred.co.th/admin/momo/` (or similar — owner picks domain)
5. **Sidebar:**
   - Remove "Back to Old System" link (in pacred, single-source-of-truth — no old/new split)

---

## 11. Open questions

1. **Missing controllers** — `index.php` references `MembersController.php` + `404Controller.php` (don't exist). Are these planned, or dead refs?
2. **Dashboard incompleteness** — modal `#add-settings-vip` referenced but undefined. What VIP setting is supposed to live here?
3. **MOMO Bearer token** — hardcoded in source. Still valid? Or has it rotated? Get fresh from ก๊อต / MOMO partner.
4. **MOMO active?** — is `api.momocargo.com:8080` still the live endpoint? Or has it migrated (ie. JMF/different domain)?
5. **Session + cookie redundancy** — both set on login. Is `$_SESSION` actually used anywhere, or vestigial?
6. **API MOMO sub-pages** — sidebar menu shows "Dashboard / Manual / History" but only 1 endpoint exists. Are the other pages stub?
7. **Translation system** — views use `class="lang-*"`. Where are language files? If no lang files exist → just port Thai+English keys.

---

## 12. Summary

**Backoffice is intentionally minimal** — single-purpose admin shell around the MOMO LCL sack-tracking integration. NOT a full admin replacement (the main pcscargo.co.th `pcs-admin/` has all the 187 admin .php files — see `d1-audit-pcscargo-2026-05-24.md`).

**Port priority for pacred-web:**
- MUST: MOMO LCL sack-tracking endpoint + admin gate
- MUST: `pass_tam()` hash (for legacy admin password compatibility — already partially in `lib/auth/pcs-legacy-password.ts`)
- SHOULD: dashboard stub (build out features as spec firms up)
- SKIP: theme CSS (follow ปอน's brand instead)

**Estimated effort:** ~2-3 days (single MOMO endpoint + auth wiring). The bulk of admin work is in the MAIN pcs-admin/ port (ก๊อต's lane).

**Security:** rotate MOMO Bearer + move to env var (`MOMO_API_TOKEN`).
