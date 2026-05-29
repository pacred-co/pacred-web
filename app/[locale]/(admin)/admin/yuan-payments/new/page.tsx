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
 * Default rate pulled from tb_settings.rpdefault (ฝากชำระ/transfer-rate
 * default — เรทฝากชำระสินค้า). Tier A6 fix (2026-05-29): was previously
 * reading `rsdefault` (shop sell-rate, ฝากสั่งสินค้า) which is the WRONG
 * column for ฝากโอนหยวน — legacy `pcs-admin/payment.php` L25, L129, L132
 * reads `rpDefault` for this surface; `rsDefault` belongs to /cart /search
 * /service-order (shop yuan-rate). Mixing the two = mis-priced yuan
 * transfers (cost-side vs sell-side rate, ~5% margin error).
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
  type UserRow = {
    userID: string;
    userName: string | null;
    userLastName: string | null;
    userTel: string | null;
    userEmail: string | null;
  };
  const toCustomerLite = (u: UserRow): CustomerLite => ({
    userid: u.userID,
    username: u.userName,
    userlastname: u.userLastName,
    usertel: u.userTel,
    useremail: u.userEmail,
  });

  let preset: CustomerLite | null = null;
  const qRaw = (sp.q ?? "").trim();
  if (qRaw) {
    const candidate = qRaw.toUpperCase();
    const { data, error } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel, userEmail")
      .eq("userID", candidate)
      .maybeSingle<UserRow>();
    if (error) {
      console.error(`[tb_users list] failed`, { code: error.code, message: error.message });
    }
    preset = data ? toCustomerLite(data) : null;
  }

  // Recent customers (cap 20).
  const { data: recentRaw, error: recentRawErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail")
    .eq("userStatus", "1")
    .order("userRegistered", { ascending: false })
    .limit(20);
  if (recentRawErr) {
    console.error(`[tb_users list] failed`, { code: recentRawErr.code, message: recentRawErr.message });
  }
  const recent = ((recentRaw ?? []) as unknown as UserRow[]).map(toCustomerLite);

  // Default rate from tb_settings (single-row config). rpdefault = ฝากชำระ
  // transfer-rate default. Tier A6 fix (2026-05-29): switched from `rsdefault`
  // (shop sell-rate · ฝากสั่งสินค้า) to `rpdefault` (transfer-rate · ฝากชำระ
  // สินค้า). Legacy `pcs-admin/payment.php` L25, L129, L132 confirms this
  // surface reads `rpDefault`; the previous code was reading the wrong column,
  // causing yuan transfers to be priced at the shop rate (typically ~5%
  // off from the transfer rate). Fallback 5.0 mirrors legacy default.
  const { data: settingsRaw, error: settingsRawErr } = await admin
    .from("tb_settings")
    .select("rpdefault")
    .limit(1)
    .maybeSingle<{ rpdefault: number | null }>();
  if (settingsRawErr) {
    console.error(`[tb_settings list] failed`, { code: settingsRawErr.code, message: settingsRawErr.message });
  }
  const defaultRate = Number(settingsRaw?.rpdefault ?? 5);

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
            <code className="rounded bg-white px-1 py-0.5">tb_settings.rpdefault</code> — แก้ที่{" "}
            <Link href="/admin/settings/legacy-rates" className="underline">ตั้งค่าเรทระบบ (tb_settings)</Link>
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
