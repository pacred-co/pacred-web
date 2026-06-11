/**
 * /admin/wallet/add — admin-initiated manual wallet entry (Wave 8).
 *
 * Faithful port of the legacy `pcs-admin/wallet.php?page=add` admin
 * branch. Writes to `tb_wallet_hs` (with side-effect on `tb_wallet`)
 * via `adminCreateWalletHsManual` in actions/admin/wallet-hs.ts.
 *
 * Wave 20 P1 batch 2-a (2026-05-26): UI rewrite ONLY — drop
 * `.pcs-legacy` scope + `<link>` to admin-base.css + Bootstrap-4
 * markup → Pacred Tailwind v4 (chrome modeled on
 * `/admin/customers/transfer-rep/page.tsx` and
 * `/admin/forwarders/combine-bill/add/page.tsx`).
 *
 * Existing wired functionality preserved:
 *   - AdminWalletAddForm — client island with controlled inputs +
 *     adminCreateWalletHsManual. The form's Bootstrap-4 class chrome
 *     renders unstyled here (no `.pcs-legacy` scope) but is fully
 *     functional; Wave 21 will restyle that island in Tailwind.
 *
 * Query-param prefill: pass `?q=PR1234` to pre-select a customer.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminWalletAddForm, type CustomerLite } from "./form";

export const dynamic = "force-dynamic";

type SP = { q?: string };

export default async function AdminWalletAddPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Preselect from ?q=PR1234 (case-insensitive)
  let preset: CustomerLite | null = null;
  const qRaw = (sp.q ?? "").trim();
  if (qRaw) {
    const candidate = qRaw.toUpperCase();
    const { data, error } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel, userEmail")
      .eq("userID", candidate)
      .maybeSingle<CustomerLite>();
    if (error) {
      console.error(`[tb_users list] failed`, { code: error.code, message: error.message });
    }
    preset = data ?? null;
  }

  // Recent customers — order by registered desc · cap 20 for the dropdown.
  const { data: recentRaw, error: recentRawErr } = await admin
    .from("tb_users")
    .select("userid, username, userlastname, usertel, useremail")
    .eq("userStatus", "1")
    .order("userRegistered", { ascending: false })
    .limit(20);
  if (recentRawErr) {
    console.error(`[tb_users list] failed`, { code: recentRawErr.code, message: recentRawErr.message });
  }
  const recent = (recentRaw ?? []) as unknown as CustomerLite[];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <title>เพิ่ม Topup ด้วยมือ | PR Admin</title>

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/wallet" className="hover:text-primary-600">กระเป๋าสตางค์</Link>
        <span>/</span>
        <span className="text-foreground">เพิ่มรายการด้วยมือ</span>
      </nav>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">กระเป๋าสตางค์</p>
        <h1 className="mt-1 text-2xl font-bold">เพิ่มรายการ Wallet ด้วยมือ</h1>
        <p className="mt-1 text-sm text-muted">
          เขียนแถวลงตาราง <code className="rounded bg-surface-alt px-1 text-xs">tb_wallet_hs</code> + อัปเดต{" "}
          <code className="rounded bg-surface-alt px-1 text-xs">tb_wallet.wallettotal</code> อัตโนมัติ
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
          <li>ใช้เมื่อ auto-verify จับสลิปลูกค้าไม่ได้ · หรือต้องการปรับยอดด้วยมือ</li>
          <li>เลือกประเภท ชำระเงิน / ถอนเงิน / ปรับยอด แล้วใส่จำนวนเงินที่ตรงกับสลิป</li>
          <li>
            เมื่อบันทึกสำเร็จ ยอด{" "}
            <code className="rounded bg-white px-1 py-0.5">tb_wallet.wallettotal</code>{" "}
            ของลูกค้าจะถูกอัปเดตอัตโนมัติ
          </li>
        </ol>
      </section>

      {/* Form card — wraps the existing wired client island */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <AdminWalletAddForm preset={preset} recent={recent} />
      </section>
    </main>
  );
}
