"use server";

/**
 * MOMO packing-list (.xlsx) → tb_forwarder reconcile.
 *
 * The MOMO warehouse exports a per-container "PACKING LIST" .xlsx when it CLOSES a
 * container (ปิดตู้ = goods now shipping to Thailand). The list breaks a shipment into
 * box-suffixed sub-rows (SF1567683726553 · SF1567683726553-2) — MOMO/tb_forwarder key
 * the shipment on the BASE tracking. Upload it → AGGREGATE the sub-rows per base →
 * match each base to tb_forwarder → PREVIEW the diff → apply the measurement basis
 * (Σ Total Weight / Σ Total CBM / Σ box count) + the container + advance the status.
 * Bases MISSING from the system can be CREATED (opt-in per row · re-priced).
 *
 * Money-safety (fweight/fvolume is the SELL measurement basis → drives the price):
 *  - preview-before-apply; APPLY RE-PARSES the uploaded file server-side (never trusts a
 *    client-passed parse — the client only sends the raw file base64 + an opt-in list of
 *    which missing bases to create).
 *  - AGGREGATION is an exact Σ over the sub-rows; the basis write targets EXACTLY ONE
 *    non-billed row (writeFid). A base whose system side has >1 non-billed sibling
 *    (a split shipment) is "multi_row" → the basis is NEVER auto-written (writing the
 *    aggregate onto several split rows would multiply the charge); it's reported for a
 *    human. Status-only advance still runs on those rows (safe).
 *  - writes the basis + container ONLY on NON-BILLED rows (fstatus ∉ {5,6,7}); a billed
 *    row is FROZEN to its issued bill and is reported as skipped, never written.
 *  - famountcount forced to "1" because MOMO's Total CBM IS the aggregate total (so the
 *    CBM reads fvolume directly, never fvolume×famount — the 2026-06-16 double-count rule).
 *  - after the basis write it re-derives the SELL price via the canonical
 *    computeAndFillForwarderImportRate (writes ONLY frefrate/frefprice/ftotalprice, never
 *    a silent ฿0). This action NEVER hand-writes a price column.
 *  - CREATE-MISSING is OPT-IN per row (createMissingBases allowlist) — never automatic —
 *    and delegates to createMissingMomoForwarderRow, which runs its OWN money guards
 *    (base-tracking dedup + member-validate + best-effort reprice + audit).
 *  - STATUS advance is ONLY 1/2 → "3" (ปิดตู้ = กำลังส่งมาไทย · SOT lib/admin/forwarder-status.ts);
 *    guarded so it can never downgrade a 3/4 row and never touches a billed 5/6/7 row.
 *  - Format B (empty / "คิวมั่ว") → aggregated:[] → apply writes nothing.
 *
 * Gated ops/super/warehouse (+ god via withAdmin). Idempotent + audit-logged.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { parseMomoPackingXlsx } from "@/lib/admin/momo-packing-xlsx-parser";
import { baseTrackingOf } from "@/lib/admin/momo-raw-helpers";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";
import { createMissingMomoForwarderRow } from "./momo-add-missing";

// base64 of a ≤~35MB file (~47MB base64) sits under the 50mb serverActions body limit.
// createMissingBases = the OPT-IN allowlist of missing bases the admin ticked "สร้าง".
const schema = z.object({
  fileBase64: z.string().min(1).max(70_000_000),
  createMissingBases: z.array(z.string().max(60)).max(500).optional(),
});

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

/** createMissingMomoForwarderRow returns this exact prefix on a GUARD-1 dup → "ข้าม". */
const ALREADY_EXISTS_PREFIX = "พัสดุนี้มีในระบบแล้ว";

export type MomoPackingPreviewRow = {
  baseTracking: string;
  subCount: number;            // how many sub-rows the packing list split this base into
  code: string | null;
  productType: string | null;
  cg: string | null;
  // packing (authoritative measurement — Σ across the sub-rows)
  packingBoxes: number | null; // Σ parcelCount
  packingWeight: number | null; // Σ Total Weight
  packingCbm: number | null;   // Σ Total CBM
  // container (meta — every row inherits it)
  container: string | null;
  transportMode: "1" | "2" | "3" | null; // derived from the container name
  // pacred current (SYSTEM aggregate across matched siblings)
  matched: boolean;
  fids: number[];              // every matched sibling id
  nonBilledFids: number[];     // matched siblings not in {5,6,7}
  writeFid: number | null;     // the single non-billed target (null if 0 or >1)
  advanceFids: number[];       // non-billed siblings currently at fstatus 1/2
  userid: string | null;
  fstatus: string | null;      // representative (writeFid's / first non-billed / first)
  curWt: number | null;        // Σ fweight
  curVol: number | null;       // Σ fvolume
  curAmt: number | null;       // Σ famount (system box count)
  curCab: string | null;
  isBilled: boolean;           // matched but EVERY sibling is billed (frozen)
  statusStale: boolean;        // real container but a non-billed sibling still 1/2
  willAdvanceTo: string | null; // "3" when ≥1 non-billed sibling is early
  // diff + verdict
  wtDiff: boolean;
  volDiff: boolean;
  cabDiff: boolean;
  amtDiff: boolean;
  verdict: "ok" | "update" | "box_short" | "billed" | "missing" | "multi_row";
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
    willUpdate: number;    // non-billed writable rows (update + box_short)
    boxShort: number;      // 🟠 system under-counts boxes/weight
    willAdvance: number;   // non-billed sibling fids that will move 1/2 → 3
    billedDiffer: number;  // 🔒 fully-billed rows (skipped)
    alreadyOk: number;
    missing: number;       // 🔴 in the file but not in tb_forwarder
    multiRow: number;      // 🟣 split shipment (>1 non-billed) — never auto-write
    statusStale: number;   // 📦 real container but a sibling still early
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

  // Match by BASE: a stored ftrackingchn may be the bare base OR a "-N" suffixed
  // split child. Query on both the aggregated bases AND every raw sub tracking,
  // then GROUP the returned rows by baseTrackingOf() so split siblings collapse
  // under the same base as the packing aggregate.
  const candidates = Array.from(
    new Set([
      ...parsed.aggregated.map((a) => a.baseTracking),
      ...parsed.rows.map((r) => r.tracking),
    ].filter(Boolean)),
  );
  const sysByBase = new Map<string, FwdRow[]>();
  if (candidates.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fweight, fvolume, famount, fcabinetnumber, ftransporttype, userid")
      .in("ftrackingchn", candidates)
      .limit(5000);
    if (error) console.error("[momo-packing match] failed", { code: error.code, message: error.message });
    for (const r of (data ?? []) as FwdRow[]) {
      const b = baseTrackingOf(r.ftrackingchn ?? "");
      if (!b) continue;
      const arr = sysByBase.get(b);
      if (arr) arr.push(r);
      else sysByBase.set(b, [r]);
    }
  }

  // The container is meta-level (every parcel row inherits it) — derive the mode once.
  const container = parsed.container;
  const containerMode = container ? resolveTransportMode(container, null) : null;

  const rows: MomoPackingPreviewRow[] = parsed.aggregated.map((a) => {
    const siblings = sysByBase.get(a.baseTracking) ?? [];
    const matched = siblings.length > 0;
    const nonBilled = siblings.filter((s) => !BILLED.has(String(s.fstatus)));
    const nonBilledFids = nonBilled.map((s) => s.id);
    const writeFid = nonBilled.length === 1 ? nonBilled[0].id : null;
    const advanceFids = nonBilled.filter((s) => isEarlyFstatus(s.fstatus)).map((s) => s.id);
    const primary = nonBilled[0] ?? siblings[0] ?? null;

    // SYSTEM aggregate across ALL matched siblings.
    const sumOrNull = (pick: (s: FwdRow) => number | null): number | null => {
      let acc: number | null = null;
      for (const s of siblings) {
        const v = pick(s);
        if (v != null) acc = (acc ?? 0) + v;
      }
      return acc;
    };
    const curWt = sumOrNull((s) => num(s.fweight));
    const curVol = sumOrNull((s) => num(s.fvolume));
    const curAmt = sumOrNull((s) => num(s.famount));
    const curCab = primary?.fcabinetnumber ?? null;
    const isBilled = matched && nonBilled.length === 0;

    let verdict: MomoPackingPreviewRow["verdict"];
    let wtDiff = false, volDiff = false, cabDiff = false, amtDiff = false;
    if (!matched) {
      verdict = "missing";
    } else if (isBilled) {
      verdict = "billed";
    } else if (nonBilled.length > 1) {
      verdict = "multi_row"; // split shipment — never auto-write the aggregate
    } else {
      wtDiff = a.totalWeight != null && (curWt == null || Math.abs(curWt - a.totalWeight) > WT_EPS);
      volDiff = a.totalCbm != null && (curVol == null || Math.abs(curVol - a.totalCbm) > VOL_EPS);
      cabDiff = !!container && container.trim() !== (curCab ?? "").trim();
      amtDiff = a.parcelCount != null && curAmt != null && curAmt !== a.parcelCount;
      const boxShort =
        (a.parcelCount != null && curAmt != null && curAmt < a.parcelCount) ||
        (a.totalWeight != null && (curWt == null || curWt + WT_EPS < a.totalWeight));
      const anyDiff = wtDiff || volDiff || cabDiff || amtDiff;
      verdict = boxShort ? "box_short" : anyDiff ? "update" : "ok";
    }

    const statusStale = matched && !!container && advanceFids.length > 0;
    const willAdvanceTo = advanceFids.length > 0 ? "3" : null;

    return {
      baseTracking: a.baseTracking,
      subCount: a.subTrackings.length,
      code: a.code,
      productType: a.productType,
      cg: a.cg,
      packingBoxes: a.parcelCount,
      packingWeight: a.totalWeight,
      packingCbm: a.totalCbm,
      container,
      transportMode: containerMode,
      matched,
      fids: siblings.map((s) => s.id),
      nonBilledFids,
      writeFid,
      advanceFids,
      userid: primary?.userid ?? null,
      fstatus: primary?.fstatus ?? null,
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
      willUpdate: rows.filter((r) => r.verdict === "update" || r.verdict === "box_short").length,
      boxShort: rows.filter((r) => r.verdict === "box_short").length,
      willAdvance: rows.reduce((n, r) => n + r.advanceFids.length, 0),
      billedDiffer: rows.filter((r) => r.verdict === "billed").length,
      alreadyOk: rows.filter((r) => r.verdict === "ok").length,
      missing: rows.filter((r) => r.verdict === "missing").length,
      multiRow: rows.filter((r) => r.verdict === "multi_row").length,
      statusStale: rows.filter((r) => r.statusStale).length,
    },
  };
}

/** Read-only preview — parse + aggregate + match + diff. NO writes. */
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
  updated: number;        // rows whose measurement basis was written (update + box_short)
  boxShort: number;       // of those, how many were box-short under-counts
  repriced: number;       // of the basis writes, how many had the SELL price re-derived
  repriceFailed: number;  // basis written but no rate card → set price manually
  advanced: number;       // sibling rows moved 1/2 → 3 (ปิดตู้ → กำลังส่งมาไทย)
  created: number;        // 🆕 missing bases created (opt-in)
  createSkipped: number;  // asked-to-create but already existed (GUARD 1)
  createFailed: number;   // asked-to-create but failed (bad member / db error)
  skippedBilled: number;  // 🔒 fully-billed rows, left frozen
  multiRow: number;       // 🟣 split shipments — basis never auto-written
  notFound: number;       // 🔴 in the file but not created (not opted-in)
  total: number;
  warnings: string[];
};

/**
 * Apply — RE-PARSES the uploaded file server-side (never trusts a client parse),
 * writes the aggregate basis on the single non-billed row of each differing/box-short
 * base + re-derives the sell price, advances 1/2 → 3 on non-billed early siblings, and
 * (opt-in only) CREATES the ticked missing bases. Idempotent + audit-logged.
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
    const wantCreate = new Set(parsed.data.createMissingBases ?? []);

    let updated = 0, boxShort = 0, repriced = 0, repriceFailed = 0, advanced = 0;
    let created = 0, createSkipped = 0, createFailed = 0;
    const repriceFailedTracks: string[] = [];

    // ── Loop 1: BASIS write (non-billed · update|box_short · single target) + reprice ──
    for (const r of preview.rows) {
      if (r.verdict !== "update" && r.verdict !== "box_short") continue;
      if (r.writeFid == null) continue; // multi_row / no single target → never write
      const transport = r.container ? resolveTransportMode(r.container, null) : null;
      const updates: Record<string, unknown> = { famountcount: "1" };
      if (r.packingWeight != null) updates.fweight = r.packingWeight;
      if (r.packingCbm != null) updates.fvolume = r.packingCbm;
      if (r.packingBoxes != null) updates.famount = r.packingBoxes;
      if (r.container) updates.fcabinetnumber = r.container;
      if (transport) updates.ftransporttype = transport;

      // TOCTOU: re-assert non-billed in the WHERE so a row billed between preview and
      // apply is never overwritten.
      const { data: upd, error: updErr } = await admin
        .from("tb_forwarder")
        .update(updates)
        .eq("id", r.writeFid)
        .not("fstatus", "in", "(5,6,7)")
        .select("id")
        .maybeSingle<{ id: number }>();
      if (updErr) {
        console.error("[momo-packing apply] basis update failed", { fid: r.writeFid, code: updErr.code, message: updErr.message });
        continue;
      }
      if (!upd) continue; // became billed → skipped by the guard
      updated += 1;
      if (r.verdict === "box_short") boxShort += 1;

      const priced = await computeAndFillForwarderImportRate(admin, r.writeFid);
      if (priced.wrote) repriced += 1;
      else { repriceFailed += 1; repriceFailedTracks.push(r.baseTracking); }
    }

    // ── Loop 2: STATUS advance 1/2 → 3 (ปิดตู้ = กำลังส่งมาไทย) ──────────────────
    // Per non-billed early sibling. `.in("fstatus", ["1","2"])` guarantees it NEVER
    // downgrades a 3/4 row and NEVER touches a billed 5/6/7 row (guardrail 4). Runs
    // even for multi_row shipments (status-only · no money).
    const nowIso = new Date().toISOString();
    for (const r of preview.rows) {
      for (const fid of r.advanceFids) {
        const { data: adv, error: advErr } = await admin
          .from("tb_forwarder")
          .update({ fstatus: "3", fdatestatus3: nowIso })
          .eq("id", fid)
          .in("fstatus", ["1", "2"])
          .select("id")
          .maybeSingle<{ id: number }>();
        if (advErr) {
          console.error("[momo-packing apply] status advance failed", { fid, code: advErr.code, message: advErr.message });
          continue;
        }
        if (adv) advanced += 1;
      }
    }

    // ── Loop 3: CREATE missing (OPT-IN only) ────────────────────────────────────
    // Only bases the admin ticked (createMissingBases) whose MOMO code is a real PR
    // are created — delegating to createMissingMomoForwarderRow, which runs its own
    // dedup + member-validate + reprice + audit money guards.
    for (const r of preview.rows) {
      if (r.verdict !== "missing" || !wantCreate.has(r.baseTracking)) continue;
      if (!r.code || !/^PR\d+$/i.test(r.code)) { createFailed += 1; continue; }
      const boxCount = r.packingBoxes != null && r.packingBoxes > 0 ? r.packingBoxes : undefined;
      const shipBy = preview.transportHint === "SEA" ? "ship" : preview.transportHint === "EK" ? "car" : undefined;
      try {
        const res = await createMissingMomoForwarderRow(
          {
            tracking: r.baseTracking,
            cabinet: preview.container ?? "",
            memberCode: r.code,
            weightKg: r.packingWeight ?? 0,
            cbm: r.packingCbm ?? 0,
            boxCount,
            shipBy,
          },
          adminId,
        );
        if (res.ok) created += 1;
        else if (res.error.startsWith(ALREADY_EXISTS_PREFIX)) createSkipped += 1;
        else createFailed += 1;
      } catch (e) {
        createFailed += 1;
        console.error("[momo-packing apply] create-missing threw", { base: r.baseTracking, error: e });
      }
    }

    // ── G1 combo-flow (2026-07-08): STAMP the packing reconcile (mig 0245) ──────
    // Records that THIS real container's กล่อง/น้ำหนัก basis is now reconciled, so the
    // billing-run gate can refuse (acknowledgeably) an un-reconciled container and the
    // ตรวจตู้ / forwarder-check lists can badge it. Write-only to the reference table —
    // NO money / tb_forwarder touch. Best-effort (never fails the apply). Skipped for
    // Format B ("คิวมั่ว") — no real container to stamp. `nowIso` from Loop 2 above.
    const containerNo = (preview.container ?? "").trim();
    if (containerNo) {
      const { error: stampErr } = await admin
        .from("container_packing_reconcile")
        .upsert(
          {
            container_no:   containerNo,
            reconciled_at:  nowIso,
            reconciled_by:  adminId ? String(adminId).slice(0, 20) : null,
            rows_updated:   updated,
            boxes_short:    boxShort,
            advanced,
            tracking_count: preview.totals.trackingCount ?? null,
            source:         "momo_packing",
          },
          { onConflict: "container_no" },
        );
      if (stampErr) {
        console.error("[momo-packing apply] reconcile stamp failed", {
          container: containerNo, code: stampErr.code, message: stampErr.message,
        });
      }
    }

    await logAdminAction(adminId, "momo_packing.apply", "tb_forwarder", "", {
      container: preview.container,
      updated, boxShort, repriced, repriceFailed, advanced,
      created, createSkipped, createFailed,
      skippedBilled: preview.summary.billedDiffer,
      multiRow: preview.summary.multiRow,
      notFound: preview.summary.missing,
      repriceFailedTracks: repriceFailedTracks.slice(0, 50),
    });

    return {
      ok: true,
      data: {
        updated,
        boxShort,
        repriced,
        repriceFailed,
        advanced,
        created,
        createSkipped,
        createFailed,
        skippedBilled: preview.summary.billedDiffer,
        multiRow: preview.summary.multiRow,
        notFound: preview.summary.missing - created - createSkipped,
        total: preview.rows.length,
        warnings: preview.warnings,
      },
    };
  });
}
