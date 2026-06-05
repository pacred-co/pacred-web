import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { CreditTable, type CreditRow, type CustomerPick } from "./credit-table";

// ────────────────────────────────────────────────────────────────────
// /admin/customers/credit — "ลูกค้าเครดิต"
// Faithful port of legacy pcs-admin `users-credit.php`:
//   list tb_users WHERE userCredit='1' LEFT JOIN tb_credit, columns
//   รหัส · ชื่อ · ที่อยู่หลัก · ติดต่อ · วันสมัคร · จำนวนวันเครดิต
//   (userCreditDate) · วงเงิน (userCreditValue) · คงเหลือ (userCreditValue −
//   tb_credit.creditvalue) + per-row แก้ไขเครดิต / ลบเครดิตออก
//   (adminSetUserCredit / adminRemoveUserCredit from
//   actions/admin/users-pricing.ts) + an "เพิ่มสมาชิกเครดิต" dialog.
//
// SOT (ADR-0023): วงเงิน = tb_users.userCreditValue (camelCase per userID);
// outstanding = tb_credit.creditvalue (lowercase per userid). userCreditDate =
// the default credit term in days. Remove refuses while outstanding > 0.
//
// RBAC: super + accounting (the credit editor actions gate the same set —
// stricter than comparison because this is a money line). PII surface (RLS-bypass).
// ────────────────────────────────────────────────────────────────────

const CUSTOMERS_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/customers" },
  { label: "+ เพิ่มลูกค้า", href: "/admin/customers/new" },
  { label: "🆕 รออนุมัติ", href: "/admin/customers/pending" },
  { label: "ค่าเทียบ (CPS)", href: "/admin/customers/comparison" },
  { label: "เครดิต", href: "/admin/customers/credit" },
  { label: "ค้นหา", href: "/admin/customers?focus=search" },
];

function summarizeAddress(a: {
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
} | undefined): string {
  if (!a) return "—";
  const parts = [
    a.addressno,
    a.addresssubdistrict ? `ต.${a.addresssubdistrict}` : "",
    a.addressdistrict ? `อ.${a.addressdistrict}` : "",
    a.addressprovince ? `จ.${a.addressprovince}` : "",
    a.addresszipcode,
  ]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "—";
}

export default async function AdminCustomerCreditPage() {
  await requireAdmin(["super", "accounting"]);
  const admin = createAdminClient();

  // ── The credit member list (legacy: WHERE userCredit=1) ───────────────
  const { data: rowsRaw, error: rowsErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userCompany, userTel, userEmail, userLineID, userFacebook, userStatus, userRegistered, userCreditValue, userCreditDate, adminIDSale")
    .eq("userCredit", "1")
    .order("userID", { ascending: false });
  if (rowsErr) {
    console.error(`[credit list] failed`, { code: rowsErr.code, message: rowsErr.message });
  }
  type UserRow = {
    userID: string;
    userName: string | null;
    userLastName: string | null;
    userCompany: string | null;
    userTel: string | null;
    userEmail: string | null;
    userLineID: string | null;
    userFacebook: string | null;
    userStatus: string | null;
    userRegistered: string | null;
    userCreditValue: number | string | null;
    userCreditDate: number | string | null;
    adminIDSale: string | null;
  };
  const userRows = (rowsRaw ?? []) as UserRow[];
  const userIds = userRows.map((r) => r.userID);

  // ── Outstanding per customer (tb_credit.creditvalue · lowercase userid) ──
  const outstandingByUser = new Map<string, number>();
  if (userIds.length > 0) {
    const { data: credits, error: creditsErr } = await admin
      .from("tb_credit")
      .select("userid, creditvalue")
      .in("userid", userIds);
    if (creditsErr) {
      console.error(`[credit tb_credit] failed`, { code: creditsErr.code, message: creditsErr.message });
    }
    for (const c of (credits ?? []) as { userid: string; creditvalue: number | string | null }[]) {
      outstandingByUser.set(c.userid, Number(c.creditvalue ?? 0));
    }
  }

  // ── Main address per visible customer (lowest active addressid) ──────
  type AddressRow = {
    addressid: number;
    userid: string;
    addressno: string | null;
    addresssubdistrict: string | null;
    addressdistrict: string | null;
    addressprovince: string | null;
    addresszipcode: string | null;
  };
  const addressByUser = new Map<string, AddressRow>();
  if (userIds.length > 0) {
    const { data: addresses, error: addressesErr } = await admin
      .from("tb_address")
      .select("addressid, userid, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode")
      .in("userid", userIds)
      .eq("addressstatus", "1")
      .order("addressid", { ascending: true });
    if (addressesErr) {
      console.error(`[credit tb_address] failed`, { code: addressesErr.code, message: addressesErr.message });
    }
    for (const a of (addresses ?? []) as unknown as AddressRow[]) {
      if (!addressByUser.has(a.userid)) addressByUser.set(a.userid, a);
    }
  }

  const rows: CreditRow[] = userRows.map((r) => {
    const limit = Number(r.userCreditValue ?? 0);
    const outstanding = outstandingByUser.get(r.userID) ?? 0;
    return {
      userID: r.userID,
      fullName: `${r.userName ?? ""} ${r.userLastName ?? ""}`.trim() || "—",
      isJuristic: r.userCompany === "1",
      tel: r.userTel ?? "",
      email: r.userEmail ?? "",
      lineId: (r.userLineID ?? "").trim(),
      address: summarizeAddress(addressByUser.get(r.userID)),
      registered: r.userRegistered,
      creditDays: Number(r.userCreditDate ?? 0),
      creditLimit: limit,
      outstanding,
      remaining: limit - outstanding,
      adminIDSale: r.adminIDSale ?? "",
      deleted: r.userStatus === "0",
    };
  });

  // ── Customer picker for the "เพิ่มสมาชิกเครดิต" dialog ─────────────────
  const picks: CustomerPick[] = [];
  {
    const { data: candRaw, error: candErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, coID")
      .neq("userCredit", "1")
      .neq("userStatus", "0")
      .order("userID", { ascending: false })
      .limit(1000);
    if (candErr) {
      console.error(`[credit candidate list] failed`, { code: candErr.code, message: candErr.message });
    }
    for (const c of (candRaw ?? []) as { userID: string; userName: string | null; userLastName: string | null; coID: string | null }[]) {
      picks.push({
        userID: c.userID,
        fullName: `${c.userName ?? ""} ${c.userLastName ?? ""}`.trim(),
        coID: (c.coID ?? "").trim(),
      });
    }
  }

  return (
    <>
      <PageTopMenubar items={CUSTOMERS_MENUBAR} activeHref="/admin/customers/credit" />
      <main className="p-6 lg:p-8 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ลูกค้า</p>
            <h1 className="mt-1 text-2xl font-bold">ลูกค้าเครดิต</h1>
            <p className="mt-1 text-sm text-muted">
              ลูกค้าที่ได้รับวงเงินเครดิตค่าขนส่ง — วงเงิน / จำนวนวันเครดิต / ยอดคงเหลือ (วงเงิน − ยอดค้างชำระ)
            </p>
          </div>
          <Link href="/admin/customers" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt">← ลูกค้าทั้งหมด</Link>
        </div>

        <CreditTable rows={rows} picks={picks} />
      </main>
    </>
  );
}
