import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { PageTopMenubar, type MenubarItem } from "@/components/admin/page-top-menubar";
import { ComparisonTable, type ComparisonRow, type CustomerPick } from "./comparison-table";

// ────────────────────────────────────────────────────────────────────
// /admin/customers/comparison — "ลูกค้าคิดราคาตามค่าเทียบ (CPS)"
// Faithful port of legacy pcs-admin `users-comparison.php`:
//   list every tb_users WHERE userComparison='1' with the legacy columns
//   (รหัส · ชื่อ · ที่อยู่หลัก · ติดต่อ · วันสมัคร · ค่าเทียบ) + per-row
//   edit/remove (adminSetUserComparison / adminRemoveUserComparison from
//   actions/admin/users-pricing.ts) + an "เพิ่มสมาชิกค่าเทียบ" dialog.
//
// userComparisonValue is the kg-per-CBM DENSITY THRESHOLD the pricing engine
// reads (see users-pricing.ts header) — legacy default seed = 150.
//
// RBAC: super + accounting + sales_admin (the per-customer editor actions gate
// the same set). Reads tb_users via createAdminClient (RLS-bypass) — PII surface.
// ────────────────────────────────────────────────────────────────────

const CUSTOMERS_MENUBAR: MenubarItem[] = [
  { label: "หน้าหลัก", href: "/admin/customers" },
  { label: "+ เพิ่มลูกค้า", href: "/admin/customers/new" },
  { label: "🆕 รออนุมัติ", href: "/admin/customers/pending" },
  { label: "ค่าเทียบ (CPS)", href: "/admin/customers/comparison" },
  { label: "เครดิต", href: "/admin/customers/credit" },
  { label: "ค้นหา", href: "/admin/customers?focus=search" },
];

/** Compact one-liner for the customer's main tb_address row. */
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

export default async function AdminCustomerComparisonPage() {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const admin = createAdminClient();

  // ── The CPS member list (legacy: WHERE userComparison=1) ──────────────
  const { data: rowsRaw, error: rowsErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userCompany, userTel, userEmail, userLineID, userFacebook, userStatus, userRegistered, userComparisonValue, adminIDSale")
    .eq("userComparison", "1")
    .order("userID", { ascending: false });
  if (rowsErr) {
    console.error(`[comparison list] failed`, { code: rowsErr.code, message: rowsErr.message });
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
    userComparisonValue: number | string | null;
    adminIDSale: string | null;
  };
  const userRows = (rowsRaw ?? []) as UserRow[];
  const userIds = userRows.map((r) => r.userID);

  // ── Main address per visible customer (lowest active addressid) ───────
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
      console.error(`[comparison tb_address] failed`, { code: addressesErr.code, message: addressesErr.message });
    }
    for (const a of (addresses ?? []) as unknown as AddressRow[]) {
      if (!addressByUser.has(a.userid)) addressByUser.set(a.userid, a);
    }
  }

  const rows: ComparisonRow[] = userRows.map((r) => ({
    userID: r.userID,
    fullName: `${r.userName ?? ""} ${r.userLastName ?? ""}`.trim() || "—",
    isJuristic: r.userCompany === "1",
    tel: r.userTel ?? "",
    email: r.userEmail ?? "",
    lineId: (r.userLineID ?? "").trim(),
    facebook: (r.userFacebook ?? "").trim(),
    address: summarizeAddress(addressByUser.get(r.userID)),
    registered: r.userRegistered,
    comparisonValue: Number(r.userComparisonValue ?? 0),
    adminIDSale: r.adminIDSale ?? "",
    deleted: r.userStatus === "0",
  }));

  // ── Customer picker for the "เพิ่มสมาชิกค่าเทียบ" dialog ───────────────
  // Legacy lets you pick any customer NOT already in the CPS segment (the
  // getUserIDCPS handler excludes WHERE userComparison=1). We pre-load active
  // candidates (cap 1000) so the dialog's combobox is instant. The set is
  // userID-keyed; the customer must be a real tb_users row (the action verifies).
  const picks: CustomerPick[] = [];
  {
    const { data: candRaw, error: candErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, coID")
      .neq("userComparison", "1")
      .neq("userStatus", "0")
      .order("userID", { ascending: false })
      .limit(1000);
    if (candErr) {
      console.error(`[comparison candidate list] failed`, { code: candErr.code, message: candErr.message });
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
      <PageTopMenubar items={CUSTOMERS_MENUBAR} activeHref="/admin/customers/comparison" />
      <main className="p-6 lg:p-8 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ลูกค้า</p>
            <h1 className="mt-1 text-2xl font-bold">ลูกค้าคิดราคาตามค่าเทียบ (CPS)</h1>
            <p className="mt-1 text-sm text-muted">
              ลูกค้าที่คิดค่าขนส่งตาม “ค่าเทียบ” (ความหนาแน่น กก./คิว) — เกินค่าเทียบคิดตามกิโล ต่ำกว่าคิดตามคิว · ค่าเริ่มต้น 150
            </p>
          </div>
          <Link href="/admin/customers" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-alt">← ลูกค้าทั้งหมด</Link>
        </div>

        <ComparisonTable rows={rows} picks={picks} />
      </main>
    </>
  );
}
