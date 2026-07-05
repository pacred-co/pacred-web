"use server";

/**
 * Export-all (CSV) for /admin/qa/order-over-10min — the QA SLA-breach queue of
 * brand-new ฝากสั่ง orders parked on hstatus='1' for > 10 minutes.
 *
 * The page (app/[locale]/(admin)/admin/qa/order-over-10min/page.tsx) lists every
 * tb_header_order row with hstatus='1' (รอดำเนินการ) AND hdate < NOW() − 10 min,
 * joined to tb_users for the customer name/phone, ordered by hdate ASC. It then
 * DB-paginates 50/page for display. The on-screen "⬇ CSV หน้านี้" downloads only
 * the visible page; this action backs the 2nd "⬇ CSV ทั้งหมด" button — the ENTIRE
 * filtered set (capped at EXPORT_CAP) — then writes an admin_export_log audit row
 * (PII: customer name + phone — owner directive 2026-06-07).
 *
 * DRIFT-FREE: this re-runs the EXACT same filter the page runs
 *   .eq("hstatus","1")
 *   .lt("hdate", cutoff)          // cutoff = NOW() − 10 minutes (recomputed at export)
 *   .order("hdate",{ascending:true})
 * plus the same tb_users name join. The CSV columns mirror the page's CsvButton
 * cols 1:1. The page DB-paginates; the ONLY difference here is UNPAGINATED +
 * EXPORT_CAP guard + the audit log.
 *
 * The "10 minutes" cutoff is time-relative — recomputed here at export time
 * (same as the page recomputes it at render) so the export matches what staff
 * see on screen.
 *
 * RBAC matches the page: super (implicit) / ops / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// Safety cap for the "export all filtered" path (mirrors the proven pattern).
const EXPORT_CAP = 10000;

// SLA threshold — must match the page (10 minutes).
const SLA_MINUTES = 10;

type HRow = {
  id: number;
  hno: string | null;
  hdate: string | null;
  htitle: string | null;
  hcount: number | null;
  hstatus: string | null;
  htotalpricechn: number | null;
  hnote: string | null;
  hnoteuser: string | null;
  htransporttype: string | null;
  userid: string | null;
};

type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userTel: string | null;
};

/** Minutes since an ISO timestamp (mirrors the page's minutesSince). */
function minutesSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

/** Human age label — mirrors the page's "รอ" column (นาที / ชม. / วัน). */
function ageLabel(iso: string | null): string {
  const m = minutesSince(iso);
  if (m >= 60 * 24) return `${Math.floor(m / (60 * 24))} วัน`;
  if (m >= 60) return `${Math.floor(m / 60)} ชม.`;
  return `${m} นาที`;
}

/**
 * Export the entire QA SLA-breach queue (hstatus='1' + hdate < NOW()−10min,
 * capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button.
 * Reuses the page's exact filtered query, unpaginated. Writes an audit row.
 */
export async function exportQaOrderOver10MinAll(): Promise<{
  rows: CsvRow[];
  truncated: boolean;
}> {
  // Same gate as the page (ops / accounting; super implicit).
  await requireAdmin(["ops", "accounting"]);

  const admin = createAdminClient();

  // Recompute the time-relative cutoff exactly as the page does at render.
  const cutoff = new Date(Date.now() - SLA_MINUTES * 60 * 1000).toISOString();

  // ── Pass 1: pull the breaching header-order rows ────────────────
  // SAME filter as the page; capped (fetch one extra to detect truncation).
  const { data: rowsRaw, error } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hdate,htitle,hcount,hstatus,htotalpricechn,hnote,hnoteuser,htransporttype,userid",
    )
    .eq("hstatus", "1")
    .lt("hdate", cutoff)
    .order("hdate", { ascending: true })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (error) {
    console.error(`[exportQaOrderOver10MinAll tb_header_order] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (rowsRaw ?? []) as unknown as HRow[];
  const truncated = all.length > EXPORT_CAP;
  const headerRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: tb_users for the customer-name + phone display ───────
  // SAME join the page does.
  const userIds = Array.from(
    new Set(headerRows.map((r) => r.userid).filter(Boolean)),
  ) as string[];
  const userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: usersRaw, error: usersErr } = await admin
      .from("tb_users")
      .select("userID,userName,userLastName,userCompany,userTel")
      .in("userID", userIds);
    if (usersErr) {
      console.error(`[exportQaOrderOver10MinAll tb_users] failed`, {
        code: usersErr.code,
        message: usersErr.message,
      });
    }
    for (const u of (usersRaw ?? []) as unknown as URow[]) {
      userMap.set(u.userID, u);
    }
  }

  // นิติบุคคล → company name (not the contact person). One batched .in() lookup.
  const corpNames = await fetchCorporateNameMap(admin, userIds);

  // SAME row mapping + column keys as the page's CsvButton.
  const rows: CsvRow[] = headerRows.map((r) => {
    const u = r.userid ? userMap.get(r.userid) : undefined;
    const customerName = u
      ? resolveBillingIdentity({
          userCompany: u.userCompany,
          userName: u.userName,
          userLastName: u.userLastName,
          corp: corpRowFromName(r.userid ? corpNames.get(r.userid) : undefined),
        }).name || (r.userid ?? "")
      : r.userid ?? "";
    const row: CsvRow = {
      hno: r.hno ?? "",
      userid: r.userid ?? "",
      customer: customerName,
      tel: u?.userTel ?? "",
      hdate: (r.hdate ?? "").slice(0, 10),
      age: ageLabel(r.hdate),
      htitle: r.htitle ?? "",
      hcount: r.hcount ?? "",
      htransporttype: r.htransporttype ?? "",
      htotalpricechn: Number(r.htotalpricechn ?? 0).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      hnoteuser: r.hnoteuser ?? "",
    };
    return row;
  });

  await logAdminExport({
    dataset: "qa-order-over-10min",
    filters: { hstatus: "1", slaMinutes: SLA_MINUTES, cutoff },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
