"use server";

/**
 * Export-all (CSV) for /admin/freight/declarations — the V-E11 ใบขนสินค้า
 * (customs declarations) list.
 *
 * The page (app/[locale]/(admin)/admin/freight/declarations/page.tsx) lists
 * customs_declarations rows, joined to freight_shipments (job_no) + profiles
 * (customer name), ordered by created_at DESC, paginated 50/page. It supports a
 * status filter chip + a free-text search (q) that matches declaration_no /
 * customs_control_no / broker_name via .or(), AND — when q looks like a job
 * (A2600…) — a secondary pass that pulls declarations of matching shipments.
 *
 * This action backs the "⬇ CSV ทั้งหมด" button: it re-runs the page's EXACT
 * filtered query UNPAGINATED (capped at EXPORT_CAP), replicates the job_no
 * augmentation + dedupe so the export matches what's on screen, maps to the
 * SAME CsvRow columns as the page's CsvButton (mirroring the <thead> 1:1),
 * then writes an admin_export_log audit row.
 *
 * DRIFT-FREE: same select, same .eq("status", …), same
 *   .or(declaration_no.ilike / customs_control_no.ilike / broker_name.ilike),
 *   same job_no secondary pass (when /^a\d/i), same .order("created_at", desc),
 *   same single-object normalisation of the FK joins, same dedupe. The ONLY
 *   differences vs the page are the EXPORT_CAP guard (no .range page window)
 *   and the audit log.
 *
 * RBAC matches the page: super / accounting.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file;
 * the page wires it via an inline "use server" closure capturing the resolved
 * { status, q } filters.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import {
  CUSTOMS_DECLARATION_STATUSES,
  CUSTOMS_DECLARATION_STATUS_LABEL,
  CUSTOMS_DECLARATION_TYPE_LABEL,
  type CustomsDeclarationStatus,
  type CustomsDeclarationType,
} from "@/lib/validators/customs-declaration";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

// SAME select the page uses (declaration cols + shipment.job_no + profile name).
const SELECT = `
  id, declaration_no, status, declaration_type, customs_office,
  customs_control_no, broker_name,
  total_declared_value_thb, total_duty_thb, total_vat_thb,
  submitted_at, created_at, freight_shipment_id,
  shipment:freight_shipments!freight_shipment_id (
    job_no,
    profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
  )
`;

type Profile = {
  member_code: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
};

type Row = {
  id: string;
  declaration_no: string | null;
  status: CustomsDeclarationStatus;
  declaration_type: CustomsDeclarationType;
  customs_office: string | null;
  customs_control_no: string | null;
  broker_name: string | null;
  total_declared_value_thb: number | null;
  total_duty_thb: number | null;
  total_vat_thb: number | null;
  submitted_at: string | null;
  created_at: string;
  freight_shipment_id: string;
  shipment: {
    job_no: string | null;
    profile: Profile | null;
  } | null;
};

/** Active filters the page passes through. */
export type FreightDeclarationsExportFilter = {
  /** Status chip filter (null = ทั้งหมด). */
  status: CustomsDeclarationStatus | null;
  /** Free-text search term (declaration_no / control_no / broker / job_no). */
  q: string;
};

/** Mirrors the page's `thb()` formatter ("฿1,234.56" / "—"). */
function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

/** Normalise PostgREST FK joins (returned as array even for to-one) to a Row. */
function normalise(raw: unknown[]): Row[] {
  type RawShipment = { job_no: string | null; profile: Profile | Profile[] | null };
  type RawRow = Omit<Row, "shipment"> & {
    shipment: RawShipment | RawShipment[] | null;
  };
  return (raw as RawRow[]).map((r) => {
    const s = Array.isArray(r.shipment) ? r.shipment[0] ?? null : r.shipment;
    if (!s) return { ...r, shipment: null } as Row;
    const profile = Array.isArray(s.profile) ? s.profile[0] ?? null : s.profile;
    return { ...r, shipment: { ...s, profile } } as Row;
  });
}

/**
 * Export the entire filtered customs-declarations list (capped at EXPORT_CAP)
 * as CSV rows for the "⬇ CSV ทั้งหมด" button. Re-runs the page's exact filtered
 * query unpaginated, replicates the job_no augmentation + dedupe, then writes an
 * admin_export_log audit row.
 */
export async function exportFreightDeclarationsAll(
  filter: FreightDeclarationsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  // RBAC matches the page — Phase 2 ops-workflow audit unlock 2026-06-05.
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);

  const status =
    filter.status && (CUSTOMS_DECLARATION_STATUSES as readonly string[]).includes(filter.status)
      ? filter.status
      : null;
  const q = (filter.q ?? "").trim();

  const admin = createAdminClient();

  // ── Primary filtered query (same as the page, unpaginated + capped) ─────
  let query = admin
    .from("customs_declarations")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(
      `declaration_no.ilike.%${q}%,customs_control_no.ilike.%${q}%,broker_name.ilike.%${q}%`,
    );
  }
  const { data: raw, error } = await query;
  if (error) {
    console.error(`[exportFreightDeclarationsAll customs_declarations] failed`, {
      code: error.code,
      message: error.message,
    });
    return { rows: [], truncated: false };
  }
  const primary = normalise((raw ?? []) as unknown[]);

  // ── Secondary job_no pass (same condition the page uses) ────────────────
  let extraJobMatches: Row[] = [];
  if (q && /^a\d/i.test(q)) {
    const { data: jobs, error: jobsErr } = await admin
      .from("freight_shipments")
      .select("id")
      .ilike("job_no", `%${q}%`)
      .limit(50);
    if (jobsErr) {
      console.error(`[exportFreightDeclarationsAll freight_shipments] failed`, {
        code: jobsErr.code,
        message: jobsErr.message,
      });
    }
    const shipIds = (jobs ?? []).map((j: { id: string }) => j.id);
    if (shipIds.length > 0) {
      let q2 = admin
        .from("customs_declarations")
        .select(SELECT)
        .in("freight_shipment_id", shipIds)
        .order("created_at", { ascending: false });
      if (status) q2 = q2.eq("status", status);
      const { data: extra, error: extraErr } = await q2;
      if (extraErr) {
        console.error(`[exportFreightDeclarationsAll customs_declarations job] failed`, {
          code: extraErr.code,
          message: extraErr.message,
        });
      }
      const extraNorm = normalise((extra ?? []) as unknown[]);
      const seen = new Set(primary.map((r) => r.id));
      extraJobMatches = extraNorm.filter((r) => !seen.has(r.id));
    }
  }

  const allRows = [...primary, ...extraJobMatches];
  const truncated = allRows.length > EXPORT_CAP;
  const finalRows = truncated ? allRows.slice(0, EXPORT_CAP) : allRows;

  // SAME column keys + values as the page's CsvButton (mirrors the <thead>).
  const rows: CsvRow[] = finalRows.map((r) => {
    const totalTax = Number(r.total_duty_thb ?? 0) + Number(r.total_vat_thb ?? 0);
    const customer =
      r.shipment?.profile?.company_name ??
      `${r.shipment?.profile?.first_name ?? ""} ${r.shipment?.profile?.last_name ?? ""}`.trim();
    return {
      declaration_no: r.declaration_no ?? "(ร่าง)",
      declaration_type: CUSTOMS_DECLARATION_TYPE_LABEL[r.declaration_type],
      job_no: r.shipment?.job_no ?? "—",
      customer: customer || "—",
      customs_office: r.customs_office ?? "—",
      customs_control_no: r.customs_control_no ?? "—",
      declared_value: thb(r.total_declared_value_thb),
      duty_vat: thb(totalTax),
      status: CUSTOMS_DECLARATION_STATUS_LABEL[r.status],
      submitted_at: r.submitted_at ? r.submitted_at.slice(0, 10) : "—",
    } satisfies CsvRow;
  });

  await logAdminExport({
    dataset: "freight-declarations",
    filters: { status: status ?? undefined, q: q || undefined },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
