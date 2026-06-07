"use server";

/**
 * Export-all (CSV) for /admin/warehouse/qa-inspections — the QA/QC inspection
 * queue (P0 #2 rebuild on the tb_forwarder spine).
 *
 * The page (app/[locale]/(admin)/admin/warehouse/qa-inspections/page.tsx) lists
 * qa_inspections rows filtered by verdict (all|pass|fail|hold|fake_product) and a
 * free-text needle (matched against f_no / cabinet / userid / china tracking),
 * ordered by inspected_at DESC, then hydrated with the tb_forwarder row. The page
 * loads the full filtered set (limit 500) and renders it without DB pagination, so
 * the on-screen "⬇ CSV" downloads whatever the page shows; this action backs the
 * "⬇ CSV ทั้งหมด" button — the ENTIRE filtered set (capped at EXPORT_CAP) — then
 * writes an admin_export_log audit row.
 *
 * DRIFT-FREE: this re-runs the EXACT same query the page's loader
 * (adminListQaInspections) runs — verdict .eq filter, inspected_at DESC, the
 * tb_forwarder batch hydration, then the SAME in-memory free-text filter — only
 * difference is the higher cap (EXPORT_CAP via .range) + the audit log. The CSV
 * columns mirror the page's <thead> 1:1.
 *
 * RBAC matches the page: super / ops / warehouse / qa.
 *
 * PLACEMENT (avoid parallel-edit races · AGENTS rule D): new co-located file; the
 * page wires it via an inline "use server" closure capturing the active filters.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import type { CsvRow } from "@/components/admin/csv-button";
import type { QaVerdict } from "@/lib/validators/qa-inspection-rebuilt";

// Safety cap for the "export all filtered" path.
const EXPORT_CAP = 10000;

// Verdict label decoder — mirrors the page's t("verdict.*") Thai labels 1:1.
const VERDICT_LABEL: Record<string, string> = {
  pass: "ผ่าน",
  fail: "ตก",
  hold: "กักไว้",
  fake_product: "ของปลอม",
};

function verdictName(v: string | null): string {
  return VERDICT_LABEL[v ?? ""] ?? "-";
}

type InsRaw = {
  id: string;
  forwarder_id: number;
  verdict: string;
  notes: string | null;
  blacklist_shop: boolean | null;
  photo_urls: string[] | null;
  inspected_at: string;
};

type FwdRaw = {
  id: number;
  fcabinetnumber: string | null;
  userid: string | null;
  ftrackingchn: string | null;
};

/** Active filters the page passes through (the verdict tab + search needle). */
export type QaInspectionsExportFilter = {
  /** 'all' | QaVerdict — the page's resolved verdict tab. */
  verdict: "all" | QaVerdict;
  /** Free-text needle (f_no / cabinet / userid / tracking). */
  q?: string;
};

/**
 * Export the entire filtered QA-inspection queue (capped at EXPORT_CAP) as CSV
 * rows for the "⬇ CSV ทั้งหมด" button. Reuses the page loader's exact filtered
 * query (verdict .eq + inspected_at DESC + tb_forwarder hydration + the same
 * in-memory free-text filter), unpaginated. Writes an admin_export_log audit row.
 */
export async function exportQaInspectionsAll(
  filter: QaInspectionsExportFilter,
): Promise<{ rows: CsvRow[]; truncated: boolean }> {
  await requireAdmin(["super", "ops", "warehouse", "qa"]);

  const { verdict, q } = filter;
  const admin = createAdminClient();

  // ── Pass 1: pull the qa_inspections rows (filtered by verdict) ──────
  // SAME filter as the page loader; capped (fetch one extra to detect truncation).
  let query = admin
    .from("qa_inspections")
    .select("id, forwarder_id, verdict, notes, blacklist_shop, photo_urls, inspected_at")
    .order("inspected_at", { ascending: false })
    .range(0, EXPORT_CAP); // 0..EXPORT_CAP = up to EXPORT_CAP+1 rows
  if (verdict && verdict !== "all") {
    query = query.eq("verdict", verdict);
  }
  const { data: insRaw, error: insErr } = await query;
  if (insErr) {
    console.error(`[exportQaInspectionsAll qa_inspections] failed`, {
      code: insErr.code,
      message: insErr.message,
    });
    return { rows: [], truncated: false };
  }

  const all = (insRaw ?? []) as unknown as InsRaw[];
  const truncated = all.length > EXPORT_CAP;
  const insRows = truncated ? all.slice(0, EXPORT_CAP) : all;

  // ── Pass 2: hydrate the tb_forwarder rows in one batch lookup ───────
  // SAME join the page loader does (.in("id", fwdIds)).
  const fwdIds = Array.from(new Set(insRows.map((r) => r.forwarder_id)));
  const fwdById = new Map<number, FwdRaw>();
  if (fwdIds.length > 0) {
    const { data: fwdRaw, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select("id, fcabinetnumber, userid, ftrackingchn")
      .in("id", fwdIds);
    if (fwdErr) {
      console.error(`[exportQaInspectionsAll tb_forwarder] failed`, {
        code: fwdErr.code,
        message: fwdErr.message,
      });
    }
    for (const f of (fwdRaw ?? []) as unknown as FwdRaw[]) {
      fwdById.set(f.id, f);
    }
  }

  // ── Pass 3: same in-memory free-text filter the page loader applies ──
  let merged = insRows.map((r) => {
    const f = fwdById.get(r.forwarder_id);
    return {
      ...r,
      fwd_fcabinetnumber: f?.fcabinetnumber ?? null,
      fwd_userid: f?.userid ?? null,
      fwd_ftrackingchn: f?.ftrackingchn ?? null,
    };
  });

  if (q && q.trim().length > 0) {
    const needle = q.trim().toLowerCase();
    merged = merged.filter(
      (r) =>
        String(r.forwarder_id).toLowerCase().includes(needle) ||
        (r.fwd_fcabinetnumber ?? "").toLowerCase().includes(needle) ||
        (r.fwd_userid ?? "").toLowerCase().includes(needle) ||
        (r.fwd_ftrackingchn ?? "").toLowerCase().includes(needle),
    );
  }

  // SAME column keys + order as the page's <thead> / CsvButton cols.
  const rows: CsvRow[] = merged.map((r) => ({
    inspected_at: (r.inspected_at ?? "").slice(0, 16).replace("T", " "),
    forwarder_id: r.forwarder_id,
    cabinet: r.fwd_fcabinetnumber ?? "-",
    member: r.fwd_userid ?? "-",
    tracking: r.fwd_ftrackingchn ?? "-",
    verdict: verdictName(r.verdict),
    blacklist: r.blacklist_shop ? "Blacklist" : "-",
    photos: (r.photo_urls ?? []).length,
  }));

  await logAdminExport({
    dataset: "qa-inspections",
    filters: { verdict, q: q ?? "" },
    rowCount: rows.length,
    truncated,
  });

  return { rows, truncated };
}
