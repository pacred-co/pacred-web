/**
 * /admin/yuan-payments/new — admin-initiated yuan payment (Wave 8).
 *
 * Faithful port of the legacy `pcs-admin/payment-add.php` flow. Writes
 * to legacy `tb_payment` via `adminCreateYuanPaymentManual` in
 * actions/admin/yuan-payments-tb.ts.
 *
 * Wave 20 P1 batch 2-a (2026-05-26): UI rewrite ONLY — drop
 * `.pcs-legacy` scope + `<link>` to admin-base.css + Bootstrap-4
 * markup → Pacred Tailwind v4 (chrome modeled on
 * `/admin/customers/transfer-rep/page.tsx` and
 * `/admin/forwarders/combine-bill/add/page.tsx`).
 *
 * Existing wired functionality preserved:
 *   - AdminYuanPaymentNewForm — client island with controlled inputs +
 *     adminCreateYuanPaymentManual. The form's Bootstrap-4 class chrome
 *     renders unstyled here (no `.pcs-legacy` scope) but is fully
 *     functional; Wave 21 will restyle that island in Tailwind.
 *
 * Query-param prefill: `?q=PR1234` to pre-select a customer.
 * Default rate pulled from tb_settings.rsdefault (sell-rate default).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminYuanPaymentNewForm, type CustomerLite } from "./form";

export const dynamic = "force-dynamic";

type SP = { q?: string };

export default async function AdminYuanPaymentNewPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Preselect customer from ?q=PR1234.
  let preset: CustomerLite | null = null;
  const qRaw = (sp.q ?? "").trim();
  if (qRaw) {
    const candidate = qRaw.toUpperCase();
    const { data, error } = await admin
      .from("tb_users")
      .select("userid, username, userlastname, usertel, useremail")
      .eq("userid", candidate)
      .maybeSingle<CustomerLite>();
    if (error) {
      console.error(`[tb_users list] failed`, { code: error.code, message: error.message });
    }
    preset = data ?? null;
  }

  // Recent customers (cap 20).
  const { data: recentRaw, error: recentRawErr } = await admin
    .from("tb_users")
    .select("userid, username, userlastname, usertel, useremail")
    .eq("userstatus", "1")
    .order("userregistered", { ascending: false })
    .limit(20);
  if (recentRawErr) {
    console.error(`[tb_users list] failed`, { code: recentRawErr.code, message: recentRawErr.message });
  }
  const recent = (recentRaw ?? []) as unknown as CustomerLite[];

  // Default rate from tb_settings (single-row config). rsdefault = sell-rate default.
  const { data: settingsRaw, error: settingsRawErr } = await admin
    .from("tb_settings")
    .select("rsdefault")
    .limit(1)
    .maybeSingle<{ rsdefault: number | null }>();
  if (settingsRawErr) {
    console.error(`[tb_settings list] failed`, { code: settingsRawErr.code, message: settingsRawErr.message });
  }
  const defaultRate = Number(settingsRaw?.rsdefault ?? 5);

  return (
    <main className="p-6 lg:p-8 max-w-5xl mx-auto space-y-5">
      <title>เพิ่มรายการฝากโอนหยวน | PR Admin</title>

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/yuan-payments" className="hover:text-primary-600">ฝากโอนหยวน</Link>
        <span>/</span>
        <span className="text-foreground">เพิ่มรายการ</span>
      </nav>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ฝากโอนหยวน</p>
        <h1 className="mt-1 text-2xl font-bold">เพิ่มรายการฝากโอนหยวน</h1>
        <p className="mt-1 text-sm text-muted">
          บันทึกรายการแทนลูกค้า · เขียนลงตาราง{" "}
          <code className="rounded bg-surface-alt px-1 text-xs">tb_payment</code> ในสถานะ &ldquo;อนุมัติ&rdquo; ทันที
        </p>
      </div>

      {/* Wave 20 status banner */}
      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-start gap-2">
        <span aria-hidden>ℹ️</span>
        <div className="flex-1">
          <span className="font-medium">Wave 20 P1 status:</span>{" "}
          ✅ Tailwind page chrome · breadcrumb · role gate · form wired ·{" "}
          <span className="opacity-75">
            ⏳ Wave 21: restyle form island (Bootstrap-4 → Tailwind)
          </span>
        </div>
      </div>

      {/* How-to card */}
      <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-medium mb-1.5">วิธีใช้</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>ใช้เมื่อต้องสร้างรายการแทนลูกค้า (เช่นลูกค้าโทรมาขอ admin บันทึก)</li>
          <li>
            เรทดีฟอลต์อ่านจาก{" "}
            <code className="rounded bg-white px-1 py-0.5">tb_settings.rsdefault</code> — เปลี่ยนได้
          </li>
          <li>เมื่อบันทึก รายการจะอยู่ในสถานะ &ldquo;อนุมัติ&rdquo; ทันที (admin เป็นผู้ยืนยัน)</li>
        </ol>
      </section>

      {/* Form card — wraps the existing wired client island */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <AdminYuanPaymentNewForm
          preset={preset}
          recent={recent}
          defaultRate={defaultRate}
        />
      </section>
    </main>
  );
}
