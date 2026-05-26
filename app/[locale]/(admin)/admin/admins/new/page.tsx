/**
 * /admin/admins/new — create a brand-new Pacred admin.
 *
 * Wave 22 Phase 3 (Agent J · 2026-05-27) — backs the form ภูม uses to
 * manually recreate the 13 legacy `tb_admin` rows (Wave 22 plan).
 * Each row gets a fresh Pacred Supabase auth.user + `profiles` +
 * `admins` role grant + (optional) `admin_contact_extras` HR sidecar.
 *
 * Form fields + cascade rules → `AdminCreateNewForm` in `./new-form.tsx`.
 * Server action + Zod validators → `adminCreateNew` in
 * `actions/admin/admins.ts` + `lib/validators/admin-form.ts`.
 *
 * Auth gate — super only (admin RBAC mutation). The detail page link
 * `/admin/admins` shows the "+ เพิ่มพนักงานใหม่" CTA only when canMutate
 * (= super), so non-super admins reaching this URL get notFound() via
 * requireAdmin(["super"]).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { AdminCreateNewForm } from "./new-form";

export const dynamic = "force-dynamic";

type SP = { legacy?: string };

export default async function AdminCreatePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["super"]);
  const sp = await searchParams;

  // Optional preset: /admin/admins/new?legacy=admin_pop pre-fills the
  // legacy_admin_id field. Used when ภูม walks down the 13-row reference
  // doc and clicks a "recreate" link from a row in the audit list.
  const legacyPreset = (sp.legacy ?? "").trim() || null;

  return (
    <main className="p-4 lg:p-8 max-w-3xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/admins" className="hover:text-primary-600">รายชื่อพนักงาน</Link>
        <span>›</span>
        <span className="text-foreground font-medium">เพิ่มพนักงานใหม่</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · พนักงาน · สร้างใหม่
        </p>
        <h1 className="mt-1 text-2xl font-bold">เพิ่มพนักงานใหม่</h1>
        <p className="mt-1.5 text-sm text-muted leading-relaxed">
          สร้างบัญชี Pacred ใหม่ ครบทุก layer ในคลิกเดียว:
          {" "}<span className="font-medium text-foreground">Supabase Auth → profiles → admins → admin_contact_extras</span>.
          {" "}ระบบ generate member_code <span className="font-mono">PR&lt;n&gt;</span> ให้อัตโนมัติ.
        </p>
      </header>

      {/* Wave 22 Phase 3 banner */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 leading-relaxed">
        <strong>✅ Wave 22 Phase 3:</strong>{" "}
        ใช้ฟอร์มนี้สร้าง admin ใหม่ (พนักงานใหม่) หรือ recreate 13 admin
        จาก legacy tb_admin (กรอก <code className="rounded bg-emerald-100 px-1">legacy_admin_id</code>
        {" "}เพื่อเชื่อม <code className="rounded bg-emerald-100 px-1">tb_users.adminidsale</code> เดิม).
        ดู checklist ที่ <code className="rounded bg-emerald-100 px-1">docs/research/tb-admin-13-row-reference.md</code>.
      </div>

      {/* Form */}
      <AdminCreateNewForm legacyPreset={legacyPreset} />

      {/* Footer */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/admins"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายชื่อพนักงาน
        </Link>
      </div>
    </main>
  );
}
