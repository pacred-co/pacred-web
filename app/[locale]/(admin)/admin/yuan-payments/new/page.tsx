/**
 * /admin/yuan-payments/new — admin-initiated yuan payment (Wave 8).
 *
 * Faithful port of the legacy `pcs-admin/payment-add.php` flow. Writes
 * to legacy `tb_payment` via `adminCreateYuanPaymentManual` in
 * actions/admin/yuan-payments-tb.ts.
 *
 * Replaces the Wave 7.1 "ยังไม่เปิด" banner. The previous version did
 * a silent redirect to /admin/yuan-payments which made "+ เพิ่มรายการ"
 * feel broken. The new flow uses the same `tb_payment` table the list
 * + detail page read.
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
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <title>เพิ่มรายการฝากโอนหยวน | PR Admin</title>

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
                      <Link href="/admin/yuan-payments">ฝากโอนหยวน</Link>
                    </li>
                    <li className="breadcrumb-item active">เพิ่มรายการ</li>
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
                        <h2 className="text-color-main">เพิ่มรายการฝากโอนหยวน</h2>
                        <div className="pcs-sequence">
                          <ol>
                            <li>ใช้เมื่อต้องสร้างรายการแทนลูกค้า (เช่นลูกค้าโทรมาขอ admin บันทึก)</li>
                            <li>เรทดีฟอลต์อ่านจาก <code>tb_settings.rsdefault</code> — เปลี่ยนได้</li>
                            <li>เมื่อบันทึก รายการจะอยู่ในสถานะ &quot;อนุมัติ&quot; ทันที (admin เป็นผู้ยืนยัน)</li>
                          </ol>
                        </div>

                        <AdminYuanPaymentNewForm
                          preset={preset}
                          recent={recent}
                          defaultRate={defaultRate}
                        />
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
