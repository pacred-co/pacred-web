# Parity audit — `admin-profile.php` → Pacred admin-self-service surface

> **V-G7 audit verification #6 of 6** — compare PHP `admin-profile.php` (1832 LOC personal-homepage for admin staff) vs Pacred Next.js admin self-service surfaces.
> **Date:** 2026-05-17 (ภูม via Claude)
> **Source PHP:** `C:/xampp/htdocs/pcscargo/member/pcs-admin/admin-profile.php` (1832 LOC) + `include/pages/admin-profile/{api/, deleteAccAdmin.php, deleteEducationAdmin.php}`.
> **Pacred surface:** `/admin/settings/notifications` (only self-service page) + `/admin/hr/employees/[id]` (super-only HR detail) + `/admin/admins` (super-only).
> **Verdict:** 🟡 **partial — self-service profile NOT implemented**. PHP gives every admin a personal page to edit own employment + contact + bank + education data; Pacred restricts all of those to super-admin. Notification preferences are the only self-editable field.

---

## Side-by-side feature checklist

| PHP capability | Pacred surface | Status |
|---|---|---|
| Personal profile view (name, email, tel, photo, status) | `/admin/hr/employees/[id]` — super-only, no `/admin/me` route | 🔴 gap (no self-view) |
| Edit own personal info (name, gender, marital, birthday, ID card) | None — must ask super | 🔴 gap (admin self-service blocked) |
| Edit own address | None | 🔴 gap |
| Edit own job position (type, dept, section, salary, dates) — CEO/Mgr/ITDT only | `adminUpsertEmployeeExtras` (`super` only — wider gate than PHP's CEO/Mgr/ITDT) | 🟡 partial (super-only vs PHP's role-split) |
| Toggle furlough/leave (CEO/Mgr only) | `adminSuspendEmployee` (super-only) | 🟡 covered (less granular role) |
| Profile picture upload + Croppie crop | None — no avatar surface for admins | 🔴 gap |
| Bank account list + add + delete | None — Pacred has no admin-bank-account table at all | 🔴 gap (entire feature missing) |
| Education background list + add + delete | None — no `tb_education_background` equivalent | 🔴 gap (entire feature missing) |
| Interpreter commission % setter (perCom) | Deferred to V-E8/H1/H2 commission (migration 0050) — covers via `commission_tiers` | 🟡 partial (different model) |
| Org-email/phone/line/wechat dropdown lookup | V-G5 spec'd (`org_contacts` table); not built yet | 🟡 deferred (V-G5) |
| Email uniqueness AJAX check | Server-action validation only (no real-time AJAX) | 🟢 covered (different UX, equivalent guarantee) |
| Phone uniqueness AJAX check | Same as email — server-action only | 🟢 covered |
| Department cascading dropdown | `admin_contact_extras.department / section` are free-text fields (no cascade) | 🟡 partial (simpler UX, no enforcement) |
| Audit log of changes (saveHistory ID=58/59) | `admin_audit_log` (richer) — every action audited per ADR-0014 | 🟢 covered (+ improved: queryable via `/admin/audit`) |
| Edit own notification channels | `/admin/settings/notifications` — `updateNotifyChannels` | 🟢 covered (only self-service in Pacred) |
| View own admin roles | RLS allows admin to read own `admins` rows; no dedicated UI | 🟡 partial (RLS yes, UI no) |

---

## Per-feature gap detail

### 🔴 Gap A — No self-service profile page (`/admin/me`)

**PHP behavior:** Every admin logs in and lands on `admin-profile.php` showing own data. Six tabs: personal · job position · address · bank accounts · education · interpreter commission. Most fields editable by self; sensitive fields (job position, leave) gated to CEO/Manager/ITDT.

**Pacred current:** No `/admin/me` route. The closest is `/admin/settings/notifications` (notification preferences only). To edit *anything else*, an admin must ask super to open `/admin/hr/employees/[id]` and make the change.

**Impact:**
- High friction for admin staff — basic info changes (changed phone, new address) require super-admin intervention.
- Super-admin bottleneck — every nickname change goes through one person.
- Worse audit story — when super changes someone else's record, it's harder to attribute intent.

**Recommendation:** Build `/admin/me` (route only for `authenticated admin`) as a follow-up V-G9 (~6-8h):
1. New page `/admin/me/page.tsx` — server-side reads own `profiles` + `admin_contact_extras` + `admins` rows.
2. Two forms:
   - Personal (own `profiles.first_name`, `last_name`, `phone`, `email`) — same Zod validators as `/profile`.
   - Display preferences (own `admin_contact_extras.display_name`, `nickname`, `direct_phone`, `work_email`).
3. Read-only sections: own admin roles (from `admins`), own org assignments (from `org_assignments`), own employment type (set by super).
4. Reuse existing `updateNotifyChannels`. Add new `updateMyAdminContactExtras` action (self-only, no role gate but writes only `profile_id = auth.uid()`).

**Why deferred:** Launch-blocker for ภูม Phase I2 — but launch can ship without it. Super-admin can handle the 5-10 admin profile changes/month manually.

---

### 🔴 Gap B — Profile picture / avatar

**PHP behavior:** Admin uploads JPG/PNG → Croppie modal → cropped image saved to `uploadNew.php` → file system folder. Shown in admin header + customer-facing sales-rep cards.

**Pacred current:** No avatar field for admins. Customer-facing sales-rep cards (`displaySalesRepCard`) show `display_name` + `direct_phone` only — no photo.

**Impact:** Medium for customer trust on sales-rep cards (photo > name+phone).

**Recommendation:** Defer to V-G10 (~4h):
1. Migration `0052_admin_avatars.sql` — bucket `admin-avatars` + RLS (public read for active admins, admin write own).
2. New action `adminUpdateAvatar(file)` — accepts JPG/PNG, server-side resize via sharp, writes path to `admin_contact_extras.avatar_path`.
3. Show on `/admin/me` page + sales-rep cards.

---

### 🔴 Gap C — Bank accounts (`tb_account_pcs`)

**PHP behavior:** Each admin can store multiple bank accounts (for payroll). Add modal (bank + account no + account name), list view, delete. Restricted to self or CEO/Manager/Accounting/ITDT.

**Pacred current:** No equivalent. Pacred today does payroll via spreadsheets — no DB model for staff bank accounts.

**Impact:** Low for V2 (Pacred has <20 admin staff, manual payroll is fine). High if Pacred ever ships automated payroll.

**Recommendation:** **DO NOT BUILD pre-launch**. Spec lives in commission-withdrawal port-spec for V-H2 sub-payment slip uploads — the slip itself replaces the need for bank account on-file. Revisit if Pacred decides to auto-bank-transfer salaries (post-V3).

---

### 🔴 Gap D — Education background (`tb_education_background`)

**PHP behavior:** Multi-row form: level / institution / faculty / department / graduate year / GPA. List, add, delete. Used for HR records.

**Pacred current:** No equivalent. HR records stored ad-hoc (Google Drive / paper files).

**Impact:** Very low. PHP feature was inherited from earlier HR system; no actual workflow uses this data downstream (no "view candidates with GPA > 3.5" report).

**Recommendation:** **DO NOT BUILD** — sunset on V3. The data has no consumer. If HR ever needs it, add a single `admin_contact_extras.education_summary text` column with free-form text.

---

### 🟡 Partial — Org-email/phone/line/wechat dropdown lookup (V-G5)

**PHP behavior:** Admin profile form lets you select an "org email" / "org phone" / "org LINE" / "org WeChat" from a master list (`tb_organization_email` etc.). The linked ID stored on `tb_org_email_ships`, `tb_org_tell_ships`, etc.

**Pacred current:** No `org_contacts` table; contact info hardcoded in `components/seo/site.ts`. V-G5 spec adds `org_contacts` (single table with `kind` discriminator) + admin CRUD + customer-facing read.

**Impact:** Medium — when V-G5 ships, this gap auto-closes for the *manage* side; the *link admin → org contact* side may still need a follow-up if Pacred wants "which admin owns which LINE OA" mapping.

**Recommendation:** Implement V-G5 first (~4-6h), then evaluate if the admin↔org_contact link is needed. Most likely a `admin_contact_extras.preferred_line_oa_id uuid` column suffices.

---

### 🟡 Partial — Department cascading dropdown

**PHP behavior:** Dept dropdown is AJAX-driven by `companyType`; section dropdown is AJAX-driven by `department`. Enforces valid combos (no "Sales→Warehouse-floor" nonsense).

**Pacred current:** `admin_contact_extras.department` and `section` are free-text fields. No enforcement.

**Impact:** Low — Pacred has ~5 departments × ~3 sections each = 15 valid combos. Free-text errors are rare and caught at HR-review time.

**Recommendation:** **DO NOT BUILD** — add a Zod-validated enum if needed: `department: z.enum([...known dept list]).optional()`. ~30 min, but bring it up when first typo is reported. Don't preempt.

---

### 🟡 Covered with simpler UX — Email/phone uniqueness check

**PHP behavior:** AJAX call on field blur → `api-check-adminEmail.php` / `api-check-adminTel.php` → returns `taken` / `available` → red/green inline hint.

**Pacred current:** Server-action validation runs on submit (Zod + DB check). User sees error after submit, not during typing.

**Impact:** Slightly worse UX (errors discovered later) but the data integrity guarantee is identical.

**Recommendation:** **Do not preempt**. Add `useFormStatus` + debounced server-side check (~2h) only when a real user complaint surfaces. The form-submit-only path is fine for V2.

---

### 🟢 Improved in Pacred — Audit log

**PHP behavior:** `saveHistory(ID=58)` for bank delete, `saveHistory(ID=59)` for education delete. Magic-number IDs. Other mutations logged inconsistently.

**Pacred current:** Every admin mutation calls `logAdminAction(adminId, action, targetType, targetId, payload)` per ADR-0014 — typed `action` strings (e.g. `admin.grant`, `employee.upsert_extras`), queryable via `/admin/audit`.

**Verdict:** Pacred is clearly better here.

---

## Recommendation matrix

| Gap | Priority | Effort | Phase |
|---|---|---|---|
| **Gap A** — `/admin/me` self-service page | 🟡 medium (unblock super-admin bottleneck) | ~6-8h | V-G9 (post-launch) |
| **Gap B** — admin avatar | 🟢 low | ~4h | V-G10 (post-launch, optional) |
| **Gap C** — bank accounts | ⚫ skip | — | Sunset; revisit only if auto-payroll ships |
| **Gap D** — education background | ⚫ skip | — | Sunset; no data consumer |
| **Org contact dropdown** | covered by V-G5 | — | V-G5 (already spec'd) |
| **Department cascade** | ⚫ skip | — | Don't preempt; add Zod enum if real typos surface |
| **Email/phone AJAX uniqueness check** | ⚫ skip | — | Don't preempt; current submit-validation works |

---

## What is needed for launch

**Nothing.** All real launch-blockers are addressed via super-admin manual edits on `/admin/hr/employees/[id]`. The 7 gaps above are quality-of-life improvements + features Pacred can sunset entirely.

The single recommended follow-up is **V-G9** (`/admin/me` self-service) — closes the super-admin bottleneck on basic profile changes. Schedule ~6-8h slot in Phase I2 after V-E10 / V-E6.

---

## Closes V-G7 bundle

This is audit **#6 of 6** in the V-G7 admin polish bundle. All audits complete:

| # | Audit | File | Verdict |
|---|---|---|---|
| 1 | hs-customrate | `parity-hs-customrate.md` | 🟢 covered |
| 2 | forwarder-driver | `parity-forwarder-driver.md` | 🟢 covered |
| 3 | settings-vip | `parity-settings-vip.md` | 🟢 covered |
| 4 | admin-table | `parity-admin-table.md` | 🟢 covered |
| 5 | time-attendance | `parity-time-attendance.md` | 🟢 covered |
| **6** | **admin-profile** | **this file** | 🟡 **partial (self-service gap)** |

**Bundle status:** ✅ shipped. V-G7 row in PORT_PLAN Part V → ✅.

---

## Cross-references

- Audit pattern → ADR-0014
- Self-service admin page recommendation → V-G9 (new — add to PORT_PLAN Part V)
- Org contact spec → V-G5 (`port-specs/admin-polish-bundle.md` §V-G5)
- Commission interpreter perCom → V-E8/H1/H2 commission spec
- PHP source path → `C:/xampp/htdocs/pcscargo/member/pcs-admin/admin-profile.php`
- Pacred source paths → `app/[locale]/(admin)/admin/{hr/employees,admins,settings/notifications}/`
