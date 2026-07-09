"use server";

/**
 * Export-all (CSV) for /admin/api-forwarder-momo/history — the per-customer MOMO
 * queue history (ภูม flag #D3: "ลูกค้าคนไหนออเดอร์ไหนสั่งเยอะ").
 *
 * The page (app/[locale]/(admin)/admin/api-forwarder-momo/history/page.tsx) reads
 * momo_import_tracks for a resolved date range (default = last 30 days), excludes
 * WAITING_SELLER_SHIP rows, groups by raw.user_code, sums CBM/kg/qty/rows + earliest
 * created_at, joins tb_users for the customer name/tel, and sorts by CBM desc. It
 * renders the FULL aggregated list (no DB pagination) — so this action re-runs that
 * EXACT same query + grouping unpaginated (capped at EXPORT_CAP) and writes an
 * admin_export_log audit row.
 *
 * DRIFT-FREE: same .gte/.lte on created_at, same WAITING_SELLER_SHIP skip, same
 * group-by-user_code + per-user sums, same tb_users join, same CBM-desc sort. The
 * CSV columns mirror the page's <thead> 1:1.
 *
 * RBAC matches the page: super / ops / warehouse.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file; the
 * page wires it via an inline "use server" closure capturing the resolved range.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { deriveMomoMemberCode } from "@/lib/admin/momo-raw-helpers";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  resolveBillingIdentity,
  fetchCorporateNameMap,
  corpRowFromName,
} from "@/lib/admin/customer-identity";

// Safety cap for the "export all filtered" path. The page itself caps the raw
// track read at 50_000 rows (.range(0, 49_999)); the aggregated per-customer
// output is far smaller, so EXPORT_CAP gates the OUTPUT rows.
const EXPORT_CAP = 10000;
const RAW_CAP = 49_999;

type PerUser = {
  userCode: string;
  guessedPr: string;
  customerName: string;
  customerTel: string;
  totalCbm: number;
  totalKgs: number;
  totalQty: number;
  totalRows: number;
  firstSeen: string;
};

/** Active filters the page passes through (the resolved ISO date range). */
export type MomoHistoryExportFilter = {
  /** Range start (ISO, e.g. "2026-05-06T00:00:00+07:00") — the page's resolved fromIso. */
  fromIso: string;
  /** Range end (ISO) — the page's resolved toIso. */
  toIso: string;
};

/**
 * Export the entire filtered per-customer MOMO history (the resolved date range,
 * output capped at EXPORT_CAP) as CSV rows for the "⬇ CSV ทั้งหมด" button. Reuses
 * the page's exact filtered query + grouping. Writes an admin_export_log audit row.
 */
export async function exportMomoHistoryAll(
  filter: MomoHistoryExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // Same gate as the page.
  await requireAdmin(["super", "ops", "warehouse"]);

  const { fromIso, toIso } = filter;
  const admin = createAdminClient();

  // SAME read the page does (momo_import_tracks · same columns · same date range).
  const { data, error } = await admin
    .from("momo_import_tracks")
    .select("cbm, weight_kg, quantity, shipment_status, raw, created_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .range(0, RAW_CAP);
  if (error) {
    console.error("[exportMomoHistoryAll momo_import_tracks] failed", {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }

  // SAME grouping the page does — by user_code, skip WAITING_SELLER_SHIP.
  const byUser = new Map<string, PerUser>();
  for (const r of (data ?? []) as Array<{
    cbm: number | string | null;
    weight_kg: number | string | null;
    quantity: number | string | null;
    shipment_status: string | null;
    raw: Record<string, unknown> | null;
    created_at: string;
  }>) {
    if (r.shipment_status === "WAITING_SELLER_SHIP") continue;
    const userCode = typeof r.raw?.user_code === "string" ? r.raw.user_code : "—";
    const userGroup = typeof r.raw?.user_group === "string" ? r.raw.user_group : "PR";
    // Normalise MOMO's mangled "PR+PR" group → "PR" (2026-07-09).
    const guessedPr = deriveMomoMemberCode(userGroup, userCode);

    const cbm = Number(r.cbm ?? 0);
    const kgs = Number(r.weight_kg ?? 0);
    const qty = Number(r.quantity ?? 0);

    const existing = byUser.get(userCode);
    if (existing) {
      existing.totalCbm += cbm;
      existing.totalKgs += kgs;
      existing.totalQty += qty;
      existing.totalRows += 1;
      if (r.created_at < existing.firstSeen) existing.firstSeen = r.created_at;
    } else {
      byUser.set(userCode, {
        userCode,
        guessedPr,
        customerName: "—",
        customerTel: "—",
        totalCbm: cbm,
        totalKgs: kgs,
        totalQty: qty,
        totalRows: 1,
        firstSeen: r.created_at,
      });
    }
  }

  // SAME tb_users join the page does (best-effort customer name/tel).
  const prCodes = [...byUser.values()].map((u) => u.guessedPr);
  if (prCodes.length > 0) {
    // Juristic → company-name map (batched, N+1-free) keyed on the guessed PR.
    const corpNames = await fetchCorporateNameMap(admin, prCodes);
    const { data: users, error: uErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userCompany, userTel")
      .in("userID", prCodes);
    if (uErr) {
      console.warn("[exportMomoHistoryAll · tb_users lookup]", uErr.message);
    } else {
      const userMap = new Map<string, { name: string; tel: string }>();
      for (const u of (users ?? []) as Array<{
        userID: string;
        userName: string | null;
        userLastName: string | null;
        userCompany: string | null;
        userTel: string | null;
      }>) {
        userMap.set(u.userID, {
          name:
            resolveBillingIdentity({
              userCompany: u.userCompany,
              userName: u.userName,
              userLastName: u.userLastName,
              corp: corpRowFromName(corpNames.get(u.userID)),
            }).name || "—",
          tel: u.userTel ?? "—",
        });
      }
      for (const pu of byUser.values()) {
        const m = userMap.get(pu.guessedPr);
        if (m) {
          pu.customerName = m.name;
          pu.customerTel = m.tel;
        }
      }
    }
  }

  // SAME sort the page does (CBM desc).
  const perUser = [...byUser.values()].sort((a, b) => b.totalCbm - a.totalCbm);

  const truncated = perUser.length > EXPORT_CAP;
  const capped = truncated ? perUser.slice(0, EXPORT_CAP) : perUser;

  // SAME column keys + ordering as the page's <thead> / CsvButton cols.
  const rows: CsvRow[] = capped.map((u, idx) => ({
    rank: idx + 1,
    momoCode: u.userCode,
    pacredId: u.guessedPr,
    customerName: u.customerName,
    customerTel: u.customerTel,
    cbm: u.totalCbm.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    kgs: u.totalKgs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    qty: u.totalQty.toLocaleString("en-US"),
    tracking: u.totalRows.toLocaleString("en-US"),
    firstSeen: u.firstSeen.slice(0, 10),
  }));

  await logAdminExport({
    dataset: "momo-history",
    filters: { fromIso, toIso, excludeStatus: "WAITING_SELLER_SHIP" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
