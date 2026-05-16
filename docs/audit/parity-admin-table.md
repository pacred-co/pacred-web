# Parity audit — `admin-table.php` → Pacred `/admin/admins`

> **V-G7 audit verification** — compare PHP `admin-table.php` (admin list + RBAC management) vs Pacred `/admin/admins`.
> **Date:** 2026-05-16 night-5 (ภูม via Claude)
> **Source PHP:** `C:\xampp\htdocs\pcscargo\member\pcs-admin\include\pages\admin-table.php` + `tb_admin` + tuple `(companyType, department, section)` × 40 sections (per CLAUDE.md "Critical migration concerns" #15).
> **Pacred surfaces:**
> - `/admin/admins/page.tsx` — admin list + grant/revoke role + activate/deactivate
> - `actions/admin/admins.ts` — admin management actions
> - `lib/auth/require-admin.ts::AdminRole` type
> - Sidebar entry (super only)
> **Verdict:** 🟢 **covered + simpler** — Pacred replaces PHP's 3-tuple-with-40-section model with a clean `AdminRole` enum (super / ops / accounting / sales_admin / warehouse / driver) + RLS-enforced `is_admin()` helper per ADR-0002.

---

## Side-by-side feature checklist

| PHP capability | Pacred surface | Status |
|---|---|---|
| Admin list view (all active admins) | `/admin/admins` table | 🟢 covered |
| Grant role to existing user | `adminGrantRole` action + UI | 🟢 covered |
| Revoke role from admin | `adminRevokeRole` action + UI | 🟢 covered |
| Activate / deactivate admin | `is_active` flag + toggle action | 🟢 covered |
| RBAC tuple `(companyType, department, section)` × 40 sections | **Redesigned** to clean enum `super / ops / accounting / sales_admin / warehouse / driver` | 🟢 covered (simplified per ADR-0002) |
| Section-level permission gates | RLS policies + `withAdmin([...roles])` per-action gate | 🟢 covered (cleaner — declarative not config) |
| Multiple roles per admin (PHP via multi-row) | `admins` table — multi-row per profile_id (one row per role) | 🟢 covered |
| `super` overrides everything | `withAdmin` first-role-check: if includes 'super' → bypass | 🟢 covered (in code) |
| RBAC config UI for new roles | ❌ NOT in Pacred V2 — enum change = code change + migration | 🟡 partial (intentional per ADR-0002 — "RBAC granular config" deferred to ADR-0011 V3 ERP) |
| Audit log on role change | `admin_audit_log`: `admin.grant_role` / `admin.revoke_role` / `admin.activate` / `admin.deactivate` | 🟢 covered (queryable via /admin/audit) |
| Search / filter admin by role | Filter chips by role on /admin/admins | 🟢 covered |
| Admin profile detail (edit name, phone, email) | `/admin/admins/[id]` per CLAUDE.md "Admin dashboard, customers, admins (grant/revoke roles)" | 🟢 covered |
| Show last login per admin | `profiles.last_login_at` displayed | 🟢 covered |
| Bulk admin actions (PHP: bulk-deactivate inactive 90d) | ❌ NOT in V2 | 🟢 not needed at Pacred scale (~10 admins) |
| 40-section permission matrix UI | ❌ NOT replicated (ADR-0002 chose simpler enum) | 🟢 intentional |

---

## Gap list

### 🟡 Partial — RBAC config UI for new roles (intentional)
**PHP behavior:** Admin can add new department/section via UI → new permission tuple available. Fully configurable RBAC.

**Pacred current:** Hard-coded `AdminRole` enum. Adding `interpreter` role (per E-5 in handoff) requires:
1. Migration extending `admins.role` CHECK constraint
2. TypeScript type update
3. Sidebar entries
4. Action `withAdmin` callers updated

**Impact:** Low for V2 — Pacred has 6 well-defined roles for current ops. New roles added in code (~30 min per addition). Trade-off: rigid for big org, simple for Pacred-scale.

**Recommendation:** **Keep simple enum for V2.** ADR-0011 (DRAFT — ERP-RBAC-granular per pre-launch-checklist) is the V3 redesign. No pre-launch action.

### 🟢 Not needed — Bulk admin actions / 40-section matrix
Pacred org size (~10 admins) doesn't need bulk-deactivate cron OR per-section permission matrix. PHP complexity was driven by 40+ sections × multi-role multi-dept staff. Pacred's flat 6-role enum is the right shape.

---

## Recommendation

✅ **Ship `/admin/admins` as-is for V2 launch.** Pacred covers PHP feature parity for current org scale + intentionally simplified RBAC per ADR-0002. RBAC config UI deferred to V3 (ADR-0011 DRAFT).

**Cross-links:**
- ADR-0002 — admin architecture (admins table + is_admin SECURITY DEFINER)
- ADR-0011 (DRAFT, ก๊อต lock pending) — ERP RBAC granular for V3
- `lib/auth/require-admin.ts` — AdminRole enum + withAdmin wrapper
- Migration 0015 — admin RBAC tables
- handoff E-5 — interpreter role addition (V-E8/H1/H2 dependency)

---

**End of audit.** No action required pre-launch. V3 ADR-0011 covers the structured-RBAC future.
