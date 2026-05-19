/**
 * Admin > Wallet > "เพิ่มรายการเติมเงิน" (legacy /wallet/add).
 *
 * Legacy source: pcs-admin/wallet.php with $_GET['page']=='add' branch
 * (L8-... — uploads slip + INSERT into tb_wallet_hs + recompute balance).
 *
 * Pacred mapping: a focused form that calls
 * `adminCreateManualWalletEntry` (actions/admin/wallet.ts) — inserts one
 * wallet_transactions row with status='completed', the balance trigger
 * auto-recomputes wallet.balance for the chosen bucket.
 *
 * Restricted to accounting/super (money page · audit-logged).
 * Sidebar item `wallet.add` was dead before this commit (route 404).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { AdminWalletAddForm } from "./form";

export const dynamic = "force-dynamic";

type ProfileLite = {
  id: string;
  member_code: string | null;
  first_name:  string | null;
  last_name:   string | null;
  phone:       string | null;
};

export default async function AdminWalletAddPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; q?: string }>;
}) {
  await requireAdmin(["accounting"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Pre-fill candidate: if ?profile=<uuid> or ?q=<member_code|phone> is set,
  // resolve the matching profile so the form can default the customer.
  let preset: ProfileLite | null = null;
  if (sp.profile) {
    const { data } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name, phone")
      .eq("id", sp.profile)
      .maybeSingle<ProfileLite>();
    preset = data ?? null;
  } else if (sp.q) {
    // search by member_code (exact) or phone (exact) — keep it simple
    const term = sp.q.trim();
    const { data } = await admin
      .from("profiles")
      .select("id, member_code, first_name, last_name, phone")
      .or(`member_code.eq.${term},phone.eq.${term}`)
      .limit(1)
      .maybeSingle<ProfileLite>();
    preset = data ?? null;
  }

  // Recent active members to suggest in the autocomplete dropdown.
  const { data: recent } = await admin
    .from("profiles")
    .select("id, member_code, first_name, last_name, phone")
    .not("member_code", "is", null)
    .order("last_login_at", { ascending: false, nullsFirst: false })
    .limit(20)
    .returns<ProfileLite[]>();

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <title>เพิ่มรายการเติมเงิน | PR Admin</title>

      <main className="p-6 lg:p-8 space-y-5 max-w-3xl">
        {/* Breadcrumb */}
        <div className="text-sm text-muted space-x-2">
          <Link href="/admin" className="hover:underline">หน้าแรก</Link>
          <span>›</span>
          <Link href="/admin/wallet" className="hover:underline">เป๋าตัง</Link>
          <span>›</span>
          <span className="font-semibold">เพิ่มรายการเติมเงิน</span>
        </div>

        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">WALLET</p>
          <h1 className="mt-1 text-2xl font-bold">เพิ่มรายการเติมเงิน</h1>
          <p className="mt-1 text-sm text-muted">
            บันทึกรายการเข้า wallet โดยตรง (เช่น สลิปลูกค้าที่ระบบ auto-verify ไม่ผ่าน)<br />
            สถานะจะตั้งเป็น <span className="font-semibold">สำเร็จ</span> ทันที — ยอดในกระเป๋าจะปรับตามอัตโนมัติผ่าน trigger
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-6">
          <AdminWalletAddForm
            preset={preset}
            recent={recent ?? []}
          />
        </div>

        {/* Quick link back to the list views */}
        <div className="flex gap-3 text-xs">
          <Link href="/admin/wallet" className="text-primary-500 hover:underline">← กลับหน้ารายการ wallet</Link>
          <span className="text-muted">·</span>
          <Link href="/admin/wallet/history" className="text-primary-500 hover:underline">ดูประวัติรายการ</Link>
        </div>
      </main>
    </div>
  );
}
