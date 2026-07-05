/**
 * /admin/customers/transfer-rep — ย้ายเซลล์ผู้ดูแลลูกค้า (bulk).
 *
 * Faithful port of the legacy `pcs-admin/user-transfer-sales.php` flow
 * (D1 / ADR-0017 Phase-B). Replaces the Wave 7.2 "ยังไม่เปิด" banner.
 *
 * The bulk form lets a sales-admin/super UPDATE `tb_users.adminIDSale`
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
import { resolveBillingIdentity, fetchCorporateNameMap, corpRowFromName } from "@/lib/admin/customer-identity";
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
    // mig 0113 renamed these tb_users cols to quoted camelCase → a lowercase SELECT
    // 400s and the form renders EMPTY. Alias camelCase→lowercase so the rows keep the
    // keys transfer-form.tsx reads (userid/username/…), no consumer change. (verified prod)
    .select("userid:userID, username:userName, userlastname:userLastName, usertel:userTel, adminidsale:adminIDSale, usercompany:userCompany")
    .eq("userStatus", "1")
    .order("userRegistered", { ascending: false })
    .limit(100);

  if (sp.currentRep) {
    q = q.eq("adminIDSale", sp.currentRep.toUpperCase());
  }

  const qFree = (sp.q ?? "").trim();
  if (qFree) {
    // Free-text: try userid match first (case-insensitive), else fall back to name ilike.
    if (/^PR\d+$/i.test(qFree)) {
      q = q.eq("userID", qFree.toUpperCase());
    } else {
      const pat = `%${qFree.replace(/[%_]/g, "\\$&")}%`;
      // camelCase column names (mig 0113) — a lowercase .or filter 400s like the SELECT did.
      q = q.or(`userName.ilike.${pat},userLastName.ilike.${pat},userTel.ilike.${pat}`);
    }
  }

  const { data: customersRaw, error: customersRawErr } = await q;
  if (customersRawErr) {
    console.error(`[tb_users list] failed`, { code: customersRawErr.code, message: customersRawErr.message });
  }
  type CustomerRaw = CustomerLite & { usercompany: string | null };
  const customersRawRows = (customersRaw ?? []) as unknown as CustomerRaw[];

  // Juristic display: batched tb_corporate name lookup (no N+1) so นิติบุคคล
  // customers show the company name in the picker, not the contact person.
  const corpNames = await fetchCorporateNameMap(admin, customersRawRows.map((c) => c.userid));
  const customers: CustomerLite[] = customersRawRows.map((c) => ({
    userid: c.userid,
    username: c.username,
    userlastname: c.userlastname,
    usertel: c.usertel,
    adminidsale: c.adminidsale,
    displayname: resolveBillingIdentity({
      userCompany: c.usercompany,
      userName: c.username,
      userLastName: c.userlastname,
      corp: corpRowFromName(corpNames.get(c.userid)),
    }).name,
  }));

  // Active admins from tb_admin for the target dropdown.
  const { data: adminsRaw, error: adminsRawErr } = await admin
    .from("tb_admin")
    // mig 0113 camelCase rename — alias back to the lowercase keys transfer-form.tsx reads.
    .select("adminid:adminID, adminnickname:adminNickname, adminname:adminName, adminlastname:adminLastName, department, section")
    .eq("adminStatusA", "1")
    .order("adminNickname", { ascending: true })
    .limit(500);
  if (adminsRawErr) {
    console.error(`[tb_admin list] failed`, { code: adminsRawErr.code, message: adminsRawErr.message });
  }
  const admins = (adminsRaw ?? []) as unknown as TbAdminLite[];

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Wave 20 P1 rewrite (2026-05-26): removed Bootstrap-4 `.pcs-legacy`
          chrome + jQuery `<link>` to admin-base.css. Pure Tailwind v4 now;
          same form logic + same `tb_users` / `tb_admin` queries. */}

      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/customers" className="hover:text-primary-600">ลูกค้า</Link>
        <span>/</span>
        <span className="text-foreground">ย้ายเซลล์ผู้ดูแล (bulk)</span>
      </nav>

      {/* Header */}
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">ย้ายเซลล์ผู้ดูแลลูกค้า (bulk)</h1>
        <p className="mt-1 text-sm text-muted">
          อัปเดต <code className="rounded bg-surface-alt px-1 text-xs">tb_users.adminIDSale</code> หลายรายในครั้งเดียว
        </p>
      </div>

      {/* How-to card */}
      <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="font-medium mb-1.5">วิธีใช้</p>
        <ol className="list-decimal list-inside space-y-1 text-xs">
          <li>
            ตัวกรองรายชื่อ — กรอกชื่อ/รหัส PR หรือใส่{" "}
            <code className="rounded bg-white px-1 py-0.5">?currentRep=PR0001</code> ใน URL เพื่อกรองตามเซลล์ปัจจุบัน
          </li>
          <li>เลือกลูกค้า (multi-select) แล้วเลือก admin ปลายทาง</li>
          <li>
            กด &ldquo;ยืนยันการย้าย&rdquo; → <code className="rounded bg-white px-1 py-0.5">tb_users.adminIDSale</code> จะถูกอัปเดตทุกราย
          </li>
        </ol>
      </section>

      {/* Form card */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <TransferRepForm
          customers={customers}
          admins={admins}
          initialQuery={qFree}
          initialCurrentRep={sp.currentRep ?? ""}
        />
      </section>
    </main>
  );
}
