/**
 * /admin/wallet/add — admin-initiated manual wallet entry (Wave 8).
 *
 * Faithful port of the legacy `pcs-admin/wallet.php?page=add` admin
 * branch. Writes to `tb_wallet_hs` (with side-effect on `tb_wallet`)
 * via `adminCreateWalletHsManual` in actions/admin/wallet-hs.ts.
 *
 * Replaces the Wave 7.2 "ยังไม่เปิด" banner stub. The previous version
 * of this page wrote to the rebuilt `wallet_transactions` table which
 * is empty on prod; the new flow uses the same `tb_wallet_hs` table
 * the dashboard / /admin/wallet list / /admin/wallet/[id] detail read.
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
      .select("userid, username, userlastname, usertel, useremail")
      .eq("userid", candidate)
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
    .eq("userstatus", "1")
    .order("userregistered", { ascending: false })
    .limit(20);
  if (recentRawErr) {
    console.error(`[tb_users list] failed`, { code: recentRawErr.code, message: recentRawErr.message });
  }
  const recent = (recentRaw ?? []) as unknown as CustomerLite[];

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <title>เพิ่ม Topup ด้วยมือ | PR Admin</title>

      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/admin">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/wallet">กระเป๋าสตางค์</Link>
                    </li>
                    <li className="breadcrumb-item active">เพิ่มรายการด้วยมือ</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body body-new">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <h2 className="text-color-main">เพิ่มรายการ Wallet ด้วยมือ</h2>
                        <div className="pcs-sequence">
                          <ol>
                            <li>ใช้เมื่อ auto-verify จับสลิปลูกค้าไม่ได้ · หรือต้องการปรับยอดด้วยมือ</li>
                            <li>เลือกประเภท เติมเงิน / ถอนเงิน / ปรับยอด แล้วใส่จำนวนเงินที่ตรงกับสลิป</li>
                            <li>เมื่อบันทึกสำเร็จ ยอด <code>tb_wallet.wallettotal</code> ของลูกค้าจะถูกอัปเดตอัตโนมัติ</li>
                          </ol>
                        </div>

                        <AdminWalletAddForm preset={preset} recent={recent} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
