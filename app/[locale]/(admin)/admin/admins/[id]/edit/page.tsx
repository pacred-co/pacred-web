/**
 * /admin/admins/[id]/edit — edit an existing Pacred admin's HR fields.
 *
 * Wave 22 Phase 4 (Agent J · 2026-05-27) — backs the form that lets
 * ภูม fill in HR sidecar data + toggle is_active + change role on a
 * Pacred-native admin (one created via /admin/admins/new). Does NOT
 * change email or password (separate flow).
 *
 * Resolution — the [id] segment is a Pacred profile UUID (from the
 * admins list eye-icon · `/admin/admins/[id]` detail). It is NOT a
 * legacy `tb_admin.adminid` string; the existing /admin/admins/[id]
 * detail page (Wave 20 P1) still reads tb_admin by adminid, but the
 * NEW /edit subroute reads `profiles` + `admin_contact_extras` by UUID.
 *
 * Auth gate — super only (matches adminUpdateProfileFields).
 *
 * Server side: `loadAdminForEdit(profileId)` returns the joined row.
 * Client side: AdminEditForm posts to `adminUpdateProfileFields` +
 * `adminToggleActive` + `adminChangeRole`.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { loadAdminForEdit } from "@/actions/admin/admins";
import { AdminEditForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function AdminEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super"]);

  const { id: profileId } = await params;

  // Defensive — the page only makes sense for a UUID. The legacy detail
  // page accepts a `tb_admin.adminid` string at the same URL shape; if
  // the caller landed here with a string id, send them back to the
  // legacy view (which is the safe display surface).
  if (!/^[0-9a-f-]{32,36}$/i.test(profileId)) {
    notFound();
  }

  const load = await loadAdminForEdit(profileId);
  if (!load.ok) {
    // Surface the DB error rather than 404 — per AGENTS §0c we never
    // hide a transient DB problem as "not found".
    throw new Error(`loadAdminForEdit failed: ${load.error}`);
  }
  const row = load.data?.row;
  if (!row) notFound();

  const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim() || "(ไม่มีชื่อ)";

  return (
    <main className="p-4 lg:p-8 max-w-3xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/admins" className="hover:text-primary-600">รายชื่อพนักงาน</Link>
        <span>›</span>
        <Link
          href={`/admin/admins/${profileId}`}
          className="hover:text-primary-600 max-w-[12rem] truncate"
          title={fullName}
        >
          {fullName}
        </Link>
        <span>›</span>
        <span className="text-foreground font-medium">แก้ไข</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · พนักงาน · แก้ไข
        </p>
        <h1 className="mt-1 text-2xl font-bold">{fullName}</h1>
        <p className="mt-1 flex items-center gap-2 flex-wrap text-xs text-muted">
          <span className="font-mono">{row.member_code ?? "(no member_code)"}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{row.email ?? "(no email)"}</span>
          {row.legacy_admin_id && (
            <>
              <span aria-hidden>·</span>
              <span className="rounded-full bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px]">
                legacy: {row.legacy_admin_id}
              </span>
            </>
          )}
        </p>
      </header>

      {/* Wave 22 Phase 4 banner */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 leading-relaxed">
        <strong>✅ Wave 22 Phase 4:</strong>{" "}
        แก้ไข HR + role + is_active ได้.
        {" "}<span className="font-medium">เปลี่ยน email/password ต้องไปทำที่ flow แยก</span>
        {" "}(ยังไม่ port — เปิด Supabase Dashboard ก่อน).
      </div>

      {/* Form */}
      <AdminEditForm initial={row} />

      {/* Footer */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href={`/admin/admins/${profileId}`}
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับหน้ารายละเอียด
        </Link>
        <Link
          href="/admin/admins"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          รายชื่อพนักงาน
        </Link>
      </div>
    </main>
  );
}
