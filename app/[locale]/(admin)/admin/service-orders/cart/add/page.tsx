import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminAddCartForm from "./add-form";

/**
 * Admin > เพิ่มสินค้าในรถเข็น — CS staff manual add-to-cart form.
 *
 * Wave 23 P1 #11.c (2026-05-27 ค่ำ · Agent E): full Tailwind rewrite —
 * dropped `.pcs-legacy` chrome + Bootstrap-4 chrome per AGENTS.md §0a.
 * Form contract / Server Action signature unchanged
 * (`adminAddItemToCart` in actions/admin/cart, Zod schema in
 * lib/validators/admin-cart) — the AdminAddCartForm island keeps its
 * existing name/value contract for backwards compatibility.
 *
 * Field set + Server Action contract are documented in `add-form.tsx`.
 * RBAC: super + ops + sales_admin.
 */

export const dynamic = "force-dynamic";

type SP = { userid?: string; userID?: string };

export default async function AdminCartAddPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { user } = await requireAdmin(["super", "ops", "sales_admin"]);
  const sp = await searchParams;

  // Resolve current admin's legacy adminid for the form's fallback cart owner.
  const admin = createAdminClient();
  let myAdminId = "";
  if (user.email) {
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminid")
      .eq("adminemail", user.email)
      .maybeSingle<{ adminid: string }>();
    if (error) {
      console.error(`[tb_admin lookup] failed`, { code: error.code, message: error.message });
    }
    myAdminId = data?.adminid ?? "";
  }

  const initialUserId = (sp.userid ?? sp.userID ?? "").trim();

  return (
    <main className="p-6 lg:p-8 max-w-4xl mx-auto space-y-5">
      <title>เพิ่มสินค้าในรถเข็น | PR Admin</title>

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/service-orders" className="hover:text-primary-600">ฝากสั่งสินค้า</Link>
        <span>/</span>
        <Link href="/admin/service-orders/cart" className="hover:text-primary-600">รถเข็น</Link>
        <span>/</span>
        <span className="text-foreground">เพิ่มสินค้า</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold">เพิ่มสินค้าในรถเข็น (กำหนดเอง)</h1>
          <p className="mt-1 text-sm text-muted">
            ใช้เมื่อ URL จาก 1688/Taobao scrape ไม่ขึ้น · กรอกฟิลด์เองทีละชิ้น
          </p>
        </div>
        <Link
          href={
            initialUserId
              ? { pathname: "/admin/service-orders/cart", query: { userID: initialUserId } }
              : "/admin/service-orders/cart"
          }
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt"
        >
          ← กลับสู่รถเข็น
        </Link>
      </div>

      {/* How-to */}
      <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-medium mb-1.5">วิธีใช้</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>กรอกรหัสสมาชิก (เจ้าของรถเข็น) — เว้นว่าง = รถเข็นแอดมินตัวคุณเอง</li>
          <li>กรอกลิงก์/ชื่อสินค้า + รายละเอียดให้ครบ</li>
          <li>ระบุราคา (¥) + จำนวนชิ้น แล้วกด "เพิ่มในรถเข็น"</li>
          <li>ระบบจะ redirect กลับหน้ารถเข็นพร้อม preselect ลูกค้าที่กรอก</li>
        </ol>
      </section>

      {/* Form card — wraps the existing wired client island */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <AdminAddCartForm initialUserId={initialUserId} myAdminId={myAdminId} />
      </section>
    </main>
  );
}
