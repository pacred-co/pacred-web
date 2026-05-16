# Parity audit — `forwarder-driver.php` → Pacred driver flow

> **V-G7 audit verification** — compare PHP `forwarder-driver.php` feature surface vs Pacred driver shipment (`/admin/drivers` + `/admin/forwarders/[fNo]/driver-assign-form` + `/admin/barcode/driver` + `/admin/driver-runs`).
> **Date:** 2026-05-16 night-5 (ภูม via Claude)
> **Source PHP:** `C:\xampp\htdocs\pcscargo\member\pcs-admin\include\pages\forwarder-driver.php` + DB tables `tb_forwarder_driver` + helpers.
> **Pacred surfaces:**
> - `app/[locale]/(admin)/admin/drivers/page.tsx` (driver registry)
> - `app/[locale]/(admin)/admin/forwarders/[fNo]/driver-assign-form.tsx` (admin assigns)
> - `app/[locale]/(admin)/admin/barcode/driver/page.tsx` (driver scan tool)
> - `app/[locale]/(admin)/admin/driver-runs/page.tsx` (driver self-serve home — CT-7 ภูม night-5)
> - `actions/admin/forwarder-drivers.ts` (admin actions + new driver-self actions)
> **Verdict:** 🟢 **covered** — Pacred covers PHP capability and adds spine-aware drill-in (CT-7) + auto-expiry cron.

---

## Side-by-side feature checklist

| PHP capability | Pacred surface | Status |
|---|---|---|
| `tb_forwarder_driver` table (assignments) | `forwarder_driver` (mig 0028) — same shape, status enum 1/2/3/4 | 🟢 covered |
| Admin assigns driver to forwarder | `DriverAssignForm` on `/admin/forwarders/[fNo]` + `adminAssignDriverToForwarder` (T-P1 ภูม) | 🟢 covered |
| Status 1=มอบหมาย / 2=รับงาน / 3=หมดเวลา / 4=ส่งเสร็จ | Same enum + Thai labels in `STATUS_LABEL` | 🟢 covered |
| Driver accepts own assignment | NEW: `/admin/driver-runs` "✓ รับงาน" button → `driverUpdateOwnAssignmentStatus({action:'accept'})` (CT-7) | 🟢 covered (Pacred-new) |
| Driver completes own assignment | NEW: `/admin/driver-runs` "✅ ยืนยันส่งสำเร็จ" → `driverUpdateOwnAssignmentStatus({action:'complete'})` (CT-7) | 🟢 covered (Pacred-new) |
| Driver-self landing showing own runs | NEW: `/admin/driver-runs` 2 sections (active + done-today); sidebar gated `roles:['driver','super','ops']` | 🟢 covered (Pacred-new) |
| Scan flow (สแกนออก → สแกนส่ง) | `/admin/barcode/driver` + `ScanForm` | 🟢 covered |
| Bulk-driver report (admin) | `/admin/drivers` list — admins see all drivers + per-driver detail at `/admin/drivers/[id]` | 🟢 covered |
| Auto-expiry of unaccepted 17h+ assignments (status 1 → 3) | Cron route `app/api/cron/expire-driver-assignments/route.ts` (per migration 0028 + team-status) | 🟢 covered (Pacred-new) |
| Admin override transition (ops can update any driver's status) | `adminUpdateDriverAssignmentStatus` gated `withAdmin(['ops'])` | 🟢 covered |
| Audit log (who changed status, when) | `admin_audit_log`: `forwarder_driver.update_status` (admin) + `forwarder_driver.driver_accept`/`driver_complete` (driver-self with `by_self: true` flag) | 🟢 covered (+ improved per audit viewer /admin/audit) |
| Driver profile lookup (driver name, phone, member_code) | `profiles.member_code` + driver embed in `/admin/forwarders/[fNo]` `DriverAssignForm` | 🟢 covered |
| Cargo container drill-in from driver row | NEW: `/admin/driver-runs` shows cargo_container code + 🚚 ดู timeline → `/shipments/[code]` (CT-7) | 🟢 covered (Pacred-new spine link) |
| Customer notification on assignment | `sendNotification(customer, ...)` in `adminAssignDriverToForwarder` (per T-P1) | 🟢 covered |
| Self-row enforcement (driver can't update others) | `driverUpdateOwnAssignmentStatus` checks `existing.profile_id === adminId` (super/ops bypass) | 🟢 covered (Pacred-new) |

---

## Gap list

### 🟡 Partial — Bulk driver-action on multiple forwarders
**PHP behavior:** Admin can select N forwarders + assign one driver to all OR bulk-update status across multiple driver assignments at once.

**Pacred current:** Per-forwarder assignment only. V-G1 (admin polish bundle) covers "bulk forwarder actions" including bulk-assign driver — not yet shipped (Phase I2 post-launch).

**Impact:** Ops staff currently clicks one-at-a-time. Workflow speed reduced when warehouse has 20+ forwarders ready-to-ship at once.

**Recommendation:** **defer to V-G1 (Phase I2 post-launch).** Spec already written in `admin-polish-bundle.md`. ~3-4h.

### 🟡 Partial — Driver scan integration with status flips
**PHP behavior:** Scan event auto-transitions status (scan-out → 2; scan-deliver → 4).

**Pacred current:** Scan via `/admin/barcode/driver` updates forwarder.status (out_for_delivery / delivered) but doesn't auto-flip forwarder_driver.status. Driver must manually click "✅ ยืนยันส่งสำเร็จ" on `/admin/driver-runs`.

**Impact:** Mild — driver does 2 actions instead of 1 (scan + click). Acceptable for V2.

**Recommendation:** **defer to V2.1 polish.** Wire `appendTrackingEvent` to also flip latest `forwarder_driver` row to status 4 when event = `scan_deliver` AND that driver matches the assignment. ~30 min.

---

## Recommendation

✅ **Ship driver flow as-is for V2 launch.** Pacred matches PHP feature parity + adds 4 net-new capabilities (driver-self home page, audit log with by_self flag, auto-expiry cron, cargo container spine drill-in).

Bulk-driver action deferred to V-G1 (Phase I2 post-launch) — not a launch blocker.

**Cross-links:**
- CT-7 commit `fe05c3a` — driver home page
- T-P1 commit `121ea0d` — admin driver assignment
- Migration 0028 — forwarder_driver table
- Cron route `app/api/cron/expire-driver-assignments/route.ts`
- V-G1 spec in `docs/port-specs/admin-polish-bundle.md` §V-G1

---

**End of audit.** No action required pre-launch.
