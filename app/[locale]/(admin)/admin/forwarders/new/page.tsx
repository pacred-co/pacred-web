/**
 * /admin/forwarders/new — admin-initiated forwarder create (Wave 12-C).
 *
 * Wave 11.1 follow-up: the previous version of this page bannered "Wave
 * 12 backlog" + told staff to use legacy PHP or impersonate. Wave 12-C
 * replaces that with the REAL form — the operator picks a customer,
 * fills in tracking/dimensions/address, and submits.
 *
 * Faithful-port wiring:
 *   - Legacy ref: `pcs-admin/forwarder.php?page=add` (part of the 2,661-LOC
 *     god-page) — the admin branch of the customer-side /service-import/add
 *     form.
 *   - Writes via `adminCreateForwarder` in `actions/admin/forwarders-new.ts`
 *     → INSERT tb_forwarder with `adminidcreator=<this admin>` so the new
 *     row badges "ฝากนำเข้า · admin" in the list (matches Wave 11 source-badge
 *     convention).
 *   - Storage: optional cover image lands in the `forwarder-covers` Supabase
 *     bucket via `lib/storage/upload.ts` (Group A's helper, shipped Wave 12-A).
 *
 * UI design (per docs/learnings/pacred-design-philosophy.md):
 *   Tailwind cards + clean section headings — NOT the legacy plain-Bootstrap
 *   form. Customer picker is a combobox-style searchable dropdown (50 recent
 *   active customers). Sticky submit at the bottom of the form.
 *
 * Query-param prefill: `?q=PR1234` to pre-select a customer (matches the
 * existing /admin/wallet/add + /admin/yuan-payments/new pattern).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminForwarderNewForm, type CustomerLite } from "./form";

export const dynamic = "force-dynamic";

type SP = { q?: string };

export default async function AdminForwarderNewPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Preselect from ?q=PR1234.
  let preset: CustomerLite | null = null;
  const qRaw = (sp.q ?? "").trim();
  if (qRaw) {
    const candidate = qRaw.toUpperCase();
    const { data } = await admin
      .from("tb_users")
      .select("userid, username, userlastname, usertel, useremail")
      .eq("userid", candidate)
      .maybeSingle<CustomerLite>();
    preset = data ?? null;
  }

  // Recent active customers (cap 50 — bigger than wallet/add since
  // forwarders are higher-volume and operators want a wider pick list
  // before resorting to ?q=PR####).
  const { data: recentRaw } = await admin
    .from("tb_users")
    .select("userid, username, userlastname, usertel, useremail")
    .eq("userstatus", "1")
    .order("userregistered", { ascending: false })
    .limit(50);
  const recent = (recentRaw ?? []) as unknown as CustomerLite[];

  return (
    <main className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">
          Admin
        </Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">
          ฝากนำเข้า
        </Link>
        <span>›</span>
        <span className="text-foreground font-medium">เพิ่มรายการให้ลูกค้า</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-500">
          ADMIN · ฝากนำเข้า · เพิ่มรายการให้ลูกค้า
        </p>
        <h1 className="mt-1 text-2xl font-bold">เพิ่มรายการ ฝากนำเข้า ให้ลูกค้า</h1>
        <p className="mt-1.5 text-sm text-muted">
          ใช้เมื่อลูกค้าโทรมาขอให้แอดมินเพิ่มรายการให้ — รายการที่สร้างจะติด badge
          <span className="mx-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
            ฝากนำเข้า · admin
          </span>
          ในรายการ
        </p>
      </header>

      {/* Hint card */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-1.5">
        <p className="font-medium">วิธีใช้:</p>
        <ol className="list-decimal pl-5 space-y-0.5 text-blue-800">
          <li>เลือก customer จากรายชื่อล่าสุด หรือใช้ <code className="rounded bg-blue-100 px-1.5 py-0.5">?q=PR1234</code> เพื่อระบุตรง</li>
          <li>เลือกโกดังจีน + รูปแบบขนส่ง · กรอกเลข tracking</li>
          <li>(ไม่บังคับ) แนบรูปสินค้า + ขนาด/น้ำหนัก</li>
          <li>กรอกที่อยู่ปลายทางในไทย → กดบันทึก</li>
        </ol>
      </div>

      <AdminForwarderNewForm preset={preset} recent={recent} />

      {/* Footer back link — for operators who clicked into here by mistake */}
      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการฝากนำเข้า
        </Link>
      </div>
    </main>
  );
}
