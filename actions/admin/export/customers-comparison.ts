"use server";

/**
 * Export the ENTIRE CPS (ค่าเทียบ) customer list as CSV rows — for the
 * "⬇ CSV ทั้งหมด" button on /admin/customers/comparison.
 *
 * Drift-free contract (owner directive 2026-06-07): this MUST reproduce the
 * EXACT filtered query the page renders — `tb_users WHERE userComparison='1'`
 * ordered by `userID` desc, joined to the lowest active `tb_address` row per
 * customer — and emit the SAME 12 columns the page's on-screen CsvButton emits.
 * The page is already un-paginated (it lists every CPS member), so the only
 * difference here is the safety cap + the audited "ทั้งหมด" download path.
 *
 * Writes an admin_export_log audit row (PII walk-off trail — this surface
 * exports phone/email/LINE/Facebook + main address for every CPS customer).
 *
 * RBAC: same gate as the page (super + accounting + sales_admin).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";

// Safety cap for the "export all" path. The CPS segment is small (low
// hundreds), so 10,000 covers it in one file with margin; `truncated` flags
// the rare overflow so the operator knows the file is incomplete.
const EXPORT_CAP = 10000;

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

type AddressRow = {
  addressid: number;
  userid: string;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
};

/** Compact one-liner for the customer's main tb_address row (page-identical). */
function summarizeAddress(a: AddressRow | undefined): string {
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

export async function exportCustomersComparisonAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  await requireAdmin(["super", "accounting", "sales_admin"]);
  const admin = createAdminClient();

  // ── Same filter as the page: WHERE userComparison='1', userID desc ────────
  const { data: rowsRaw, error: rowsErr } = await admin
    .from("tb_users")
    .select(
      "userID, userName, userLastName, userCompany, userTel, userEmail, userLineID, userFacebook, userStatus, userRegistered, userComparisonValue, adminIDSale",
    )
    .eq("userComparison", "1")
    .order("userID", { ascending: false })
    .limit(EXPORT_CAP);
  if (rowsErr) {
    console.error(`[export comparison list] failed`, {
      code: rowsErr.code,
      message: rowsErr.message,
    });
    return { rows: [], truncated: false };
  }
  const userRows = (rowsRaw ?? []) as UserRow[];
  const userIds = userRows.map((r) => r.userID);

  // ── Main address per visible customer (lowest active addressid) ───────────
  const addressByUser = new Map<string, AddressRow>();
  if (userIds.length > 0) {
    const { data: addresses, error: addressesErr } = await admin
      .from("tb_address")
      .select(
        "addressid, userid, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
      )
      .in("userid", userIds)
      .eq("addressstatus", "1")
      .order("addressid", { ascending: true });
    if (addressesErr) {
      console.error(`[export comparison tb_address] failed`, {
        code: addressesErr.code,
        message: addressesErr.message,
      });
    }
    for (const a of (addresses ?? []) as unknown as AddressRow[]) {
      if (!addressByUser.has(a.userid)) addressByUser.set(a.userid, a);
    }
  }

  // ── Same column mapping as the page's CsvButton (12 cols) ─────────────────
  const rows: CsvRow[] = userRows.map((r) => ({
    userID: r.userID,
    fullName: `${r.userName ?? ""} ${r.userLastName ?? ""}`.trim() || "—",
    isJuristic: r.userCompany === "1" ? "นิติบุคคล" : "บุคคล",
    tel: r.userTel ?? "",
    email: r.userEmail ?? "",
    lineId: (r.userLineID ?? "").trim(),
    facebook: (r.userFacebook ?? "").trim(),
    address: summarizeAddress(addressByUser.get(r.userID)),
    registered: r.userRegistered ? r.userRegistered.slice(0, 10) : "",
    comparisonValue: Number(r.userComparisonValue ?? 0),
    adminIDSale: r.adminIDSale ?? "",
    deleted: r.userStatus === "0" ? "ลบบัญชี" : "ใช้งาน",
  }));

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "customers-comparison",
    filters: { userComparison: "1" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
