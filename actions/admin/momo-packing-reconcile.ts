"use server";

/**
 * MOMO packing-list (.xlsx) → tb_forwarder reconcile.
 *
 * The MOMO warehouse exports a per-container "PACKING LIST" .xlsx when it CLOSES a
 * container (ปิดตู้ = goods now shipping to Thailand). Upload it → match each Tracking to
 * tb_forwarder → PREVIEW the diff → apply the per-tracking measurement (already summed:
 * Total Weight / Total CBM / parcel count) + the container + advance the status.
 *
 * Money-safety (fweight/fvolume is the SELL measurement basis → drives the price):
 *  - preview-before-apply; APPLY RE-PARSES the uploaded file server-side (never trusts a
 *    client-passed parse — the client only sends the raw file as base64).
 *  - writes the basis + container ONLY on NON-BILLED rows (fstatus ∉ {5,6,7}); a billed
 *    row is FROZEN to its issued bill and is reported as skipped, never written.
 *  - famountcount forced to "1" because MOMO's Total CBM IS the aggregate total (so the
 *    CBM reads fvolume directly, never fvolume×famount — the 2026-06-16 double-count rule).
 *  - after the basis write it re-derives the SELL price via the canonical
 *    computeAndFillForwarderImportRate (so ftotalprice can't go stale from a new fvolume) —
 *    it writes ONLY frefrate/frefprice/ftotalprice and never persists a silent ฿0. This
 *    action itself NEVER hand-writes a price column.
 *  - STATUS advance is ONLY 1/2 → "3" (ปิดตู้ = กำลังส่งมาไทย · SOT lib/admin/forwarder-status.ts);
 *    guarded so it can never downgrade a 3/4 row and never touches a billed 5/6/7 row.
 *  - Format B (empty / "คิวมั่ว") → rows:[] → apply writes nothing.
 *
 * Gated ops/super/warehouse (+ god via withAdmin). Idempotent + audit-logged.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { parseMomoPackingXlsx } from "@/lib/admin/momo-packing-xlsx-parser";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";

// base64 of a ≤~35MB file (~47MB base64) sits under the 50mb serverActions body limit.
const schema = z.object({ fileBase64: z.string().min(1).max(70_000_000) });

const BILLED = new Set(["5", "6", "7"]);
const WT_EPS = 0.01;
const VOL_EPS = 0.000001;

const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** A closed container ⇒ the row should be ≥ "3"; an early 1/2 status is stale. */
function isEarlyFstatus(fstatus: string | null | undefined): boolean {
  const s = (fstatus ?? "").trim();
  return s === "1" || s === "2";
}

export type MomoPackingPreviewRow = {
  tracking: string;
  code: string | null;
  productType: string | null;
  // MOMO (authoritative measurement — already aggregated per tracking)
  parcelCount: number | null;
  weightKg: number | null;
  cbm: number | null;
  totalWeight: number | null;
  totalCbm: number | null;
  cg: string | null;
  // container (meta — every row inherits it)
  container: string | null;
  transportMode: "1" | "2" | "3" | null; // derived from the container name
  // pacred current
  matched: boolean;
  fid: number | null;
  userid: string | null;
  fstatus: string | null;
  curWt: number | null;
  curVol: number | null;
  curAmt: number | null;
  curCab: string | null;
  isBilled: boolean;
  statusStale: boolean;        // real container but fstatus still early (1/2)
  willAdvanceTo: string | null; // "3" when non-billed + fstatus∈{1,2}
  // diff + verdict
  wtDiff: boolean;
  volDiff: boolean;
  cabDiff: boolean;
  amtDiff: boolean;
  verdict: "update" | "billed" | "ok" | "no-match";
};

export type MomoPackingPreview = {
  listTitle: string | null;
  container: string | null;
  containerCode: string | null;
  totals: { trackingCount: number | null; qty: number | null; totalWeight: number | null; totalCbm: number | null };
  transportHint: "SEA" | "EK" | null;
  warnings: string[];
  rawGrid?: { header: string[]; rows: (string | number | null)[][] };
  rows: MomoPackingPreviewRow[];
  summary: {
    total: number;
    willUpdate: number;    // non-billed rows whose basis differs
    willAdvance: number;   // non-billed rows that will move 1/2 → 3
    billedDiffer: number;  // ⚠ billed rows with a diff (skipped)
    alreadyOk: number;
    noMatch: number;       // 🔴 in the file but not in tb_forwarder
    statusStale: number;   // 📦 real container but fstatus still early
  };
};

type FwdRow = {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  famount: number | string | null;
  fcabinetnumber: string | null;
  ftransporttype: string | null;
  userid: string | null;
};

async function buildPreview(bytes: Uint8Array): Promise<MomoPackingPreview> {
  const parsed = parseMomoPackingXlsx(bytes);
  const admin = createAdminClient();

  const trackings = Array.from(new Set(parsed.rows.map((r) => r.tracking).filter(Boolean)));
  const fByTracking = new Map<string, FwdRow>();
  if (trackings.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fweight, fvolume, famount, fcabinetnumber, ftransporttype, userid")
      .in("ftrackingchn", trackings);
    if (error) console.error("[momo-packing match] failed", { code: error.code, message: error.message });
    for (const r of (data ?? []) as FwdRow[]) {
      if (r.ftrackingchn && !fByTracking.has(r.ftrackingchn)) fByTracking.set(r.ftrackingchn, r);
    }
  }

  // The container is meta-level (every parcel row inherits it) — derive the mode once.
  const container = parsed.container;
  const containerMode = container ? resolveTransportMode(container, null) : null;

  const rows: MomoPackingPreviewRow[] = parsed.rows.map((t) => {
    const f = fByTracking.get(t.tracking) ?? null;
    const matched = !!f;
    const curWt = f ? num(f.fweight) : null;
    const curVol = f ? num(f.fvolume) : null;
    const curAmt = f ? num(f.famount) : null;
    const curCab = f?.fcabinetnumber ?? null;
    const isBilled = !!f && BILLED.has(String(f.fstatus));

    let verdict: MomoPackingPreviewRow["verdict"];
    let wtDiff = false, volDiff = false, cabDiff = false, amtDiff = false;
    if (!matched) {
      verdict = "no-match";
    } else {
      wtDiff = t.totalWeight != null && (curWt == null || Math.abs(curWt - t.totalWeight) > WT_EPS);
      volDiff = t.totalCbm != null && (curVol == null || Math.abs(curVol - t.totalCbm) > VOL_EPS);
      cabDiff = !!container && container.trim() !== (curCab ?? "").trim();
      amtDiff = t.parcelCount != null && curAmt != null && curAmt !== t.parcelCount;
      const anyDiff = wtDiff || volDiff || cabDiff || amtDiff;
      verdict = !anyDiff ? "ok" : isBilled ? "billed" : "update";
    }

    const statusStale = matched && !!container && isEarlyFstatus(f?.fstatus);
    const willAdvanceTo = matched && !isBilled && isEarlyFstatus(f?.fstatus) ? "3" : null;

    return {
      tracking: t.tracking,
      code: t.code,
      productType: t.productType,
      parcelCount: t.parcelCount,
      weightKg: t.weightKg,
      cbm: t.cbm,
      totalWeight: t.totalWeight,
      totalCbm: t.totalCbm,
      cg: t.cg,
      container,
      transportMode: containerMode,
      matched,
      fid: f?.id ?? null,
      userid: f?.userid ?? null,
      fstatus: f?.fstatus ?? null,
      curWt, curVol, curAmt, curCab,
      isBilled,
      statusStale,
      willAdvanceTo,
      wtDiff, volDiff, cabDiff, amtDiff,
      verdict,
    };
  });

  return {
    listTitle: parsed.listTitle,
    container: parsed.container,
    containerCode: parsed.containerCode,
    totals: parsed.totals,
    transportHint: parsed.transportHint,
    warnings: parsed.warnings,
    rawGrid: parsed.rawGrid,
    rows,
    summary: {
      total: rows.length,
      willUpdate: rows.filter((r) => r.verdict === "update").length,
      willAdvance: rows.filter((r) => r.willAdvanceTo != null).length,
      billedDiffer: rows.filter((r) => r.verdict === "billed").length,
      alreadyOk: rows.filter((r) => r.verdict === "ok").length,
      noMatch: rows.filter((r) => r.verdict === "no-match").length,
      statusStale: rows.filter((r) => r.statusStale).length,
    },
  };
}

/** Read-only preview — parse + match + diff. NO writes. */
export async function previewMomoPacking(input: unknown): Promise<AdminActionResult<MomoPackingPreview>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin<MomoPackingPreview>(["ops", "super", "warehouse"], async () => {
    let bytes: Uint8Array;
    try {
      bytes = Buffer.from(parsed.data.fileBase64, "base64");
    } catch {
      return { ok: false, error: "อ่านไฟล์ไม่สำเร็จ (base64 ไม่ถูกต้อง)" };
    }
    return { ok: true, data: await buildPreview(bytes) };
  });
}

export type MomoPackingApplyResult = {
  updated: number;        // rows whose measurement basis was written
  repriced: number;       // of those, how many had the SELL price re-derived
  repriceFailed: number;  // basis written but no rate card → set price manually
  advanced: number;       // rows moved 1/2 → 3 (ปิดตู้ → กำลังส่งมาไทย)
  skippedBilled: number;  // ⚠ billed rows with a diff, left frozen
  notFound: number;       // 🔴 in the file but not in tb_forwarder
  total: number;
  warnings: string[];
};

/**
 * Apply — RE-PARSES the uploaded file server-side (never trusts a client parse),
 * writes the basis + container on non-billed differing rows and re-derives the sell
 * price, then advances 1/2 → 3 on non-billed early rows. Idempotent + audit-logged.
 */
export async function applyMomoPacking(input: unknown): Promise<AdminActionResult<MomoPackingApplyResult>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin<MomoPackingApplyResult>(["ops", "super", "warehouse"], async ({ adminId }) => {
    let bytes: Uint8Array;
    try {
      bytes = Buffer.from(parsed.data.fileBase64, "base64");
    } catch {
      return { ok: false, error: "อ่านไฟล์ไม่สำเร็จ (base64 ไม่ถูกต้อง)" };
    }
    const preview = await buildPreview(bytes);
    const admin = createAdminClient();

    let updated = 0, repriced = 0, repriceFailed = 0, advanced = 0;
    const repriceFailedTracks: string[] = [];

    // ── Loop 1: BASIS write (non-billed rows whose measurement differs) + reprice ──
    for (const r of preview.rows) {
      if (r.verdict !== "update" || r.fid == null) continue;
      const transport = r.container ? resolveTransportMode(r.container, null) : null;
      const updates: Record<string, unknown> = { famountcount: "1" };
      if (r.totalWeight != null) updates.fweight = r.totalWeight;
      if (r.totalCbm != null) updates.fvolume = r.totalCbm;
      if (r.parcelCount != null) updates.famount = r.parcelCount;
      if (r.container) updates.fcabinetnumber = r.container;
      if (transport) updates.ftransporttype = transport;

      // TOCTOU: re-assert non-billed in the WHERE so a row billed between preview and
      // apply is never overwritten.
      const { data: upd, error: updErr } = await admin
        .from("tb_forwarder")
        .update(updates)
        .eq("id", r.fid)
        .not("fstatus", "in", "(5,6,7)")
        .select("id")
        .maybeSingle<{ id: number }>();
      if (updErr) {
        console.error("[momo-packing apply] basis update failed", { fid: r.fid, code: updErr.code, message: updErr.message });
        continue;
      }
      if (!upd) continue; // became billed → skipped by the guard
      updated += 1;

      const priced = await computeAndFillForwarderImportRate(admin, r.fid);
      if (priced.wrote) repriced += 1;
      else { repriceFailed += 1; repriceFailedTracks.push(r.tracking); }
    }

    // ── Loop 2: STATUS advance 1/2 → 3 (ปิดตู้ = กำลังส่งมาไทย) ──────────────────
    // SEPARATE write so the guard is exact: `.in("fstatus", ["1","2"])` guarantees it
    // NEVER downgrades a 3/4 row and NEVER touches a billed 5/6/7 row (guardrail 4).
    const nowIso = new Date().toISOString();
    for (const r of preview.rows) {
      if (r.willAdvanceTo == null || r.fid == null) continue;
      const { data: adv, error: advErr } = await admin
        .from("tb_forwarder")
        .update({ fstatus: "3", fdatestatus3: nowIso })
        .eq("id", r.fid)
        .in("fstatus", ["1", "2"])
        .select("id")
        .maybeSingle<{ id: number }>();
      if (advErr) {
        console.error("[momo-packing apply] status advance failed", { fid: r.fid, code: advErr.code, message: advErr.message });
        continue;
      }
      if (adv) advanced += 1;
    }

    await logAdminAction(adminId, "momo_packing.apply", "tb_forwarder", "", {
      container: preview.container,
      updated, repriced, repriceFailed, advanced,
      skippedBilled: preview.summary.billedDiffer,
      notFound: preview.summary.noMatch,
      repriceFailedTracks: repriceFailedTracks.slice(0, 50),
    });

    return {
      ok: true,
      data: {
        updated,
        repriced,
        repriceFailed,
        advanced,
        skippedBilled: preview.summary.billedDiffer,
        notFound: preview.summary.noMatch,
        total: preview.rows.length,
        warnings: preview.warnings,
      },
    };
  });
}
