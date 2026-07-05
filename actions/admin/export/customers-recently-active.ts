"use server";

/**
 * Export-all + PII audit for /admin/customers/recently-active.
 *
 * Mirrors the /admin/leads golden reference (actions/admin/leads.ts ·
 * exportLeadsAll): the "⬇ CSV ทั้งหมด" button re-runs the page's EXACT filtered
 * query unpaginated (one capped page instead of the 500-row window) and writes
 * one admin_export_log row (migration 0147) — the PII walk-off trail for the
 * customer contact list (phones + emails) handed to sales reps / external VAs.
 *
 * DRIFT-FREE: the page query (recently-active/page.tsx) is
 *   tb_users
 *     .select("userID,userName,userLastName,userTel,userEmail,userCompany,userLastLogin,userRegistered,adminIDSale")
 *     .order("userLastLogin", { ascending: false, nullsFirst: false })
 *     .limit(500)
 *   + type filter: personal → .neq("userCompany","1") · juristic → .eq("userCompany","1")
 * This helper replicates it byte-for-byte; the ONLY difference is the .limit()
 * (EXPORT_CAP instead of 500). The CSV columns + value mapping below match the
 * page's CsvButton 1:1.
 *
 * RBAC: same roles the page gates to (ops · sales_admin · accounting) — a
 * PDPA/PII surface; reads use createAdminClient (RLS-bypass).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "../export-log";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

const ROLES = ["ops", "sales_admin", "accounting"] as const;

// Safety cap for the "export all filtered" path (owner directive 2026-06-07).
// 10,000 bounds the in-memory build; if the slice ever exceeds it the export
// flags `truncated` so the operator knows to narrow the type filter.
const EXPORT_CAP = 10000;

type ActType = "all" | "personal" | "juristic";

type Row = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
  userCompany: string | null;
  userLastLogin: string | null;
  userRegistered: string | null;
  adminIDSale: string | null;
};

export type RecentlyActiveExportRow = Record<
  string,
  string | number | null | undefined
>;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86_400_000);
}

/**
 * Export the ENTIRE filtered recently-active list (capped at EXPORT_CAP) as CSV
 * rows. Re-runs the page's EXACT filtered query unpaginated so the export can
 * never drift from the on-screen table, and writes the admin_export_log audit
 * row.
 */
export async function exportRecentlyActiveAll(filter: {
  type?: string;
}): Promise<{ rows: RecentlyActiveExportRow[]; truncated: boolean }> {
  // Gate to the same roles as the page before touching PII.
  await requireAdmin([...ROLES]);

  const type: ActType =
    filter.type === "personal" || filter.type === "juristic"
      ? filter.type
      : "all";

  const admin = createAdminClient();

  // ── byte-for-byte the page query, only the .limit() differs ──
  let q = admin
    .from("tb_users")
    .select(
      "userID,userName,userLastName,userTel,userEmail,userCompany,userLastLogin,userRegistered,adminIDSale",
    )
    .order("userLastLogin", { ascending: false, nullsFirst: false })
    .limit(EXPORT_CAP);

  if (type === "personal") q = q.neq("userCompany", "1");
  if (type === "juristic") q = q.eq("userCompany", "1");

  const { data: rowsRaw, error: rowsRawErr } = await q;
  if (rowsRawErr) {
    console.error(`[exportRecentlyActiveAll] tb_users list failed`, {
      code: rowsRawErr.code,
      message: rowsRawErr.message,
    });
    return { rows: [], truncated: false };
  }
  const data = (rowsRaw ?? []) as Row[];

  // นิติบุคคล → company name (not the contact person). One batched .in() lookup.
  const corpNames = await fetchCorporateNameMap(admin, data.map((r) => r.userID));

  // ── identical CSV value mapping to the page's CsvButton ──
  const rows: RecentlyActiveExportRow[] = data.map((r) => {
    const days = daysSince(r.userLastLogin);
    return {
      userID: r.userID,
      fullName: resolveBillingIdentity({
        userCompany: r.userCompany,
        userName: r.userName,
        userLastName: r.userLastName,
        corp: corpRowFromName(corpNames.get(r.userID)),
      }).name,
      type: r.userCompany === "1" ? "นิติบุคคล" : "บุคคล",
      tel: r.userTel ?? "",
      email: r.userEmail ?? "",
      adminIDSale: r.adminIDSale ?? "",
      registered: r.userRegistered ? r.userRegistered.slice(0, 10) : "",
      lastLogin: r.userLastLogin ? r.userLastLogin.slice(0, 10) : "",
      daysDormant: days === null ? "" : days,
      bucket:
        days === null
          ? "ยังไม่เคย login"
          : days > 90
            ? "หายไป > 90 วัน"
            : days > 30
              ? "หายไป > 30 วัน"
              : "ใช้งานล่าสุด ≤ 30 วัน",
    };
  });

  const truncated = rows.length >= EXPORT_CAP;
  await logAdminExport({
    dataset: "customers-recently-active",
    filters: { type },
    rowCount: rows.length,
    truncated,
  });
  return { rows, truncated };
}
