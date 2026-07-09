import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminAddCartForm from "./add-form";
import { AdminLinkPasteSearch } from "./link-paste-search";
import { getCustomsFxRates, fxRateMap } from "@/lib/admin/customs-fx";

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
    // 2026-05-28 B-4 P0 fix: tb_admin cols are camelCase quoted post-batch-1
    // (migration 0113). Sister page at .../cart/page.tsx:136 already uses
    // adminID/adminEmail correctly — this one missed the sweep.
    const { data, error } = await admin
      .from("tb_admin")
      .select("adminID")
      .eq("adminEmail", user.email)
      .maybeSingle<{ adminID: string }>();
    if (error) {
      console.error(`[tb_admin lookup] failed`, { code: error.code, message: error.message });
    }
    myAdminId = data?.adminID ?? "";
  }

  // Live yuan exchange rate (tb_settings.rsdefault) — feeds the link-paste
  // panel's ฿ preview. Defaults to 5.0 if unset (legacy posture).
  const { data: settings, error: settingsErr } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .limit(1)
    .maybeSingle<{ rsdefault: number | string | null }>();
  if (settingsErr) {
    // Soft-fail: a missing rsdefault just means the ฿ preview shows the
    // fallback rate — doesn't block cart-add itself, so don't throw.
    console.error(`[tb_settings lookup] failed`, { code: settingsErr.code, message: settingsErr.message });
  }
  const rsDefault = Number(settings?.rsdefault ?? 0) || 5.0;

  // customs.fx_rates (THB per 1 unit) — the manual price currency selector.
  const fxRates = fxRateMap(await getCustomsFxRates());

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
        <p className="font-medium mb-1.5">วิธีใช้ — มี 2 ทาง</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>
            <strong>(แนะนำ)</strong> วางลิงก์ 1688/Taobao/Tmall ในกล่องด้านบน → ระบบดึงรูป/ชื่อ/ราคามาให้
            → ปรับจำนวน → กด <em>+ เพิ่มในรถเข็น</em>
          </li>
          <li>
            <strong>กรอกเอง</strong> (ใช้เมื่อ URL ดึงไม่ขึ้น หรือเป็นสินค้า custom) — กรอกฟิลด์ทีละช่องในฟอร์มด้านล่าง
          </li>
        </ol>
      </section>

      {/* 1️⃣ LINK-PASTE PANEL — recommended path · auto-fetch from marketplace */}
      <section className="rounded-2xl border border-primary-200 bg-white dark:bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="rounded-full bg-primary-100 text-primary-700 px-2.5 py-0.5 text-[11px] font-semibold">
            แนะนำ
          </span>
          <h2 className="text-sm font-semibold tracking-wide">🔍 วางลิงก์สินค้า (1688 / Taobao / Tmall)</h2>
        </div>
        <AdminLinkPasteSearch
          initialUserId={initialUserId}
          myAdminId={myAdminId}
          rsDefault={rsDefault}
        />
      </section>

      {/* 2️⃣ MANUAL FORM — fallback when scrape fails / custom product */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="rounded-full bg-surface-alt text-muted px-2.5 py-0.5 text-[11px] font-medium">
            สำรอง
          </span>
          <h2 className="text-sm font-semibold tracking-wide">✏️ กรอกฟิลด์เองทีละชิ้น</h2>
        </div>
        <AdminAddCartForm initialUserId={initialUserId} myAdminId={myAdminId} fxRates={fxRates} rsDefault={rsDefault} />
      </section>
    </main>
  );
}
