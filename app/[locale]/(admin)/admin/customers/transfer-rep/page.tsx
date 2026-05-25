/**
 * /admin/customers/transfer-rep — ย้ายเซลล์ผู้ดูแลลูกค้า (bulk).
 *
 * Faithful port of the legacy `pcs-admin/user-transfer-sales.php` flow
 * (D1 / ADR-0017 Phase-B). Replaces the Wave 7.2 "ยังไม่เปิด" banner.
 *
 * The bulk form lets a sales-admin/super UPDATE `tb_users.adminidsale`
 * across many customers in one shot via `adminBulkTransferSalesRepTb`.
 *
 * Reads:
 *   - Recent customers (cap 100, optionally filtered by ?currentRep=PR0001)
 *     for the multi-select source list.
 *   - All active admins from `tb_admin` (the legacy source-of-truth for
 *     sales-rep assignment) for the target dropdown.
 *
 * Query-params:
 *   - ?currentRep=PR0001 → filter the source list to customers currently
 *     assigned to that admin (useful when reassigning a leaving rep's
 *     portfolio).
 *   - ?q=John → free-text filter on customer name / member code.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import {
  TransferRepForm,
  type CustomerLite,
  type TbAdminLite,
} from "./transfer-form";

export const dynamic = "force-dynamic";

type SP = { q?: string; currentRep?: string };

export default async function TransferSalesRepPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requireAdmin(["sales_admin", "super"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Build the customer list query.
  let q = admin
    .from("tb_users")
    .select("userid, username, userlastname, usertel, adminidsale")
    .eq("userstatus", "1")
    .order("userregistered", { ascending: false })
    .limit(100);

  if (sp.currentRep) {
    q = q.eq("adminidsale", sp.currentRep.toUpperCase());
  }

  const qFree = (sp.q ?? "").trim();
  if (qFree) {
    // Free-text: try userid match first (case-insensitive), else fall back to name ilike.
    if (/^PR\d+$/i.test(qFree)) {
      q = q.eq("userid", qFree.toUpperCase());
    } else {
      const pat = `%${qFree.replace(/[%_]/g, "\\$&")}%`;
      q = q.or(`username.ilike.${pat},userlastname.ilike.${pat},usertel.ilike.${pat}`);
    }
  }

  const { data: customersRaw, error: customersRawErr } = await q;
  if (customersRawErr) {
    console.error(`[tb_users list] failed`, { code: customersRawErr.code, message: customersRawErr.message });
  }
  const customers = (customersRaw ?? []) as unknown as CustomerLite[];

  // Active admins from tb_admin for the target dropdown.
  const { data: adminsRaw, error: adminsRawErr } = await admin
    .from("tb_admin")
    .select("adminid, adminnickname, adminname, adminlastname, department, section")
    .eq("adminstatusa", "1")
    .order("adminnickname", { ascending: true })
    .limit(500);
  if (adminsRawErr) {
    console.error(`[tb_admin list] failed`, { code: adminsRawErr.code, message: adminsRawErr.message });
  }
  const admins = (adminsRaw ?? []) as unknown as TbAdminLite[];

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <title>ย้ายเซลล์ผู้ดูแลลูกค้า | PR Admin</title>

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
                      <Link href="/admin/customers">ลูกค้า</Link>
                    </li>
                    <li className="breadcrumb-item active">ย้ายเซลล์ผู้ดูแล (bulk)</li>
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
                        <h2 className="text-color-main">ย้ายเซลล์ผู้ดูแลลูกค้า (bulk)</h2>
                        <div className="pcs-sequence">
                          <ol>
                            <li>
                              ตัวกรองรายชื่อ — กรอกชื่อ/รหัส PR หรือใส่
                              <code>?currentRep=PR0001</code> ใน URL เพื่อกรองตามเซลล์ปัจจุบัน
                            </li>
                            <li>เลือกลูกค้า (multi-select) แล้วเลือก admin ปลายทาง</li>
                            <li>กด &quot;ยืนยันการย้าย&quot; → <code>tb_users.adminidsale</code> จะถูกอัปเดตทุกราย</li>
                          </ol>
                        </div>

                        <TransferRepForm
                          customers={customers}
                          admins={admins}
                          initialQuery={qFree}
                          initialCurrentRep={sp.currentRep ?? ""}
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
