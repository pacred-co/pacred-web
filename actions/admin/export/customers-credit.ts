"use server";

/**
 * Export-all for /admin/customers/credit — "ลูกค้าเครดิต".
 *
 * The credit page is NOT paginated: it renders EVERY tb_users row with
 * userCredit='1' (no .range()/.limit(), no search/status filter). So there is
 * no shared paginated fetch to parameterize — instead this action replicates
 * the page's query byte-for-byte (same WHERE userCredit='1', same tb_credit +
 * tb_address joins, same column mapping) so the export can NEVER drift from the
 * on-screen rows. It only adds the EXPORT_CAP safety bound + the audit row.
 *
 * Mirrors the golden reference (actions/admin/leads.ts → exportLeadsAll):
 *   - capped at EXPORT_CAP rows (flags `truncated` if hit)
 *   - SAME column keys/labels/value-mapping as the page CsvButton
 *   - writes one admin_export_log row (PII + money walk-off trail · owner
 *     directive 2026-06-07) via logAdminExport.
 *
 * RBAC: super + accounting (identical to the page's requireAdmin gate — this is
 * a money line + PII surface, RLS-bypass).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "../export-log";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// Safety cap for the "export all" path. The credit segment is small (members
// granted a credit line), so 10,000 comfortably covers it in one file while
// bounding the in-memory build. If ever exceeded the export flags `truncated`.
const EXPORT_CAP = 10000;

const DATASET = "customers-credit";

/** One CSV row for the credit export (matches the on-screen CsvButton columns). */
export type CreditExportRow = Record<string, string | number | null | undefined>;

// ── Mirror of the page's address summariser (must stay byte-identical) ──────
function summarizeAddress(
  a:
    | {
        addressno: string | null;
        addresssubdistrict: string | null;
        addressdistrict: string | null;
        addressprovince: string | null;
        addresszipcode: string | null;
      }
    | undefined,
): string {
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

type AddressRow = {
  addressid: number;
  userid: string;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
};

/**
 * Export the ENTIRE credit member list (capped at EXPORT_CAP) as CSV rows for
 * the "⬇ CSV ทั้งหมด" button. The page renders every credit member already, so
 * "all" == "the same list" — but we still cap + AUDIT (the credit list carries
 * phones/addresses + credit limits = money, so every export must be logged).
 */
export async function exportCustomersCreditAll(): Promise<{
  rows: CreditExportRow[];
  truncated: boolean;
}> {
  // Same RBAC gate as the page (super + accounting).
  await requireAdmin(["super", "accounting"]);
  const admin = createAdminClient();

  // ── The credit member list (legacy: WHERE userCredit=1) — byte-for-byte the
  //    page query, plus the EXPORT_CAP bound. ───────────────────────────────
  const { data: rowsRaw, error: rowsErr } = await admin
    .from("tb_users")
    .select(
      "userID, userName, userLastName, userCompany, userTel, userEmail, userLineID, userFacebook, userStatus, userRegistered, userCreditValue, userCreditDate, adminIDSale",
    )
    .eq("userCredit", "1")
    .order("userID", { ascending: false })
    .limit(EXPORT_CAP);
  if (rowsErr) {
    console.error(`[exportCustomersCreditAll list] failed`, {
      code: rowsErr.code,
      message: rowsErr.message,
    });
    return { rows: [], truncated: false };
  }
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
      console.error(`[exportCustomersCreditAll tb_credit] failed`, {
        code: creditsErr.code,
        message: creditsErr.message,
      });
    }
    for (const c of (credits ?? []) as {
      userid: string;
      creditvalue: number | string | null;
    }[]) {
      outstandingByUser.set(c.userid, Number(c.creditvalue ?? 0));
    }
  }

  // ── Main address per visible customer (lowest active addressid) ──────
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
      console.error(`[exportCustomersCreditAll tb_address] failed`, {
        code: addressesErr.code,
        message: addressesErr.message,
      });
    }
    for (const a of (addresses ?? []) as unknown as AddressRow[]) {
      if (!addressByUser.has(a.userid)) addressByUser.set(a.userid, a);
    }
  }

  // นิติบุคคล → company name (not the contact person). One batched .in() lookup.
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // ── Project to the SAME columns the page CsvButton emits ──────────────
  const rows: CreditExportRow[] = userRows.map((r) => {
    const limit = Number(r.userCreditValue ?? 0);
    const outstanding = outstandingByUser.get(r.userID) ?? 0;
    const remaining = limit - outstanding;
    return {
      userID: r.userID,
      fullName:
        resolveBillingIdentity({
          userCompany: r.userCompany,
          userName: r.userName,
          userLastName: r.userLastName,
          corp: corpRowFromName(corpNames.get(r.userID)),
        }).name || "—",
      isJuristic: r.userCompany === "1" ? "นิติบุคคล" : "บุคคล",
      tel: r.userTel ?? "",
      email: r.userEmail ?? "",
      lineId: (r.userLineID ?? "").trim(),
      address: summarizeAddress(addressByUser.get(r.userID)),
      registered: r.userRegistered ? r.userRegistered.slice(0, 10) : "",
      creditDays: Number(r.userCreditDate ?? 0),
      creditLimit: limit.toFixed(2),
      outstanding: outstanding.toFixed(2),
      remaining: remaining.toFixed(2),
      adminIDSale: r.adminIDSale ?? "",
      deleted: r.userStatus === "0" ? "ลบบัญชี" : "ใช้งาน",
    };
  });

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: DATASET,
    // The page has no on-screen filters (it always lists every userCredit=1
    // member) — record the constant segment for the audit trail.
    filters: { segment: "credit", userCredit: "1" },
    rowCount: rows.length,
    truncated,
  });
  return { rows, truncated };
}
