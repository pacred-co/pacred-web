"use server";

/**
 * แต้ม (ไอแต้ม) warehouse-reconcile → tb_forwarder.
 *
 * The owner (2026-06-19): *"ข้อมูลรายละเอียดงานที่ถูกต้องที่ชัวร์ เราจะเอาจากฝั่งแต้ม ·
 * เอาไปอัพเดทข้อมูลให้ตรงกับที่แต้มอัพเดทมา"*. แต้ม keeps the authoritative per-tracking
 * container / transport / box-count / total-weight / total-volume in a Google Sheet.
 * Paste it here → match each tracking to tb_forwarder → PREVIEW the diff → apply.
 *
 * Money-safety (this is the SELL-side measurement basis — fvolume drives the price):
 *  - preview-before-apply; apply RE-PARSES the same text server-side (never trusts a
 *    client-passed value).
 *  - writes the measurement basis (fweight/fvolume/famount/famountcount/fcabinetnumber/
 *    ftransporttype) ONLY on NON-BILLED rows (fstatus ∉ {5,6,7}) — a billed row's basis
 *    is locked to its issued bill; those are surfaced as ⚠ for the owner, never written.
 *  - famountcount is forced to "1" because แต้ม's Total Vol. IS the aggregate total
 *    (so the CBM reads fvolume directly, never fvolume×famount — the 2026-06-16 CBM
 *    double-count rule).
 *  - AFTER updating the basis it re-derives the SELL price via the canonical
 *    computeAndFillForwarderImportRate (so ftotalprice can't go stale) — and honours
 *    any manual rate / per-order ค่าเทียบ override inside that resolver ("แก้มือได้ทุกจุด").
 *  - rows where แต้ม has no data yet (กระสอบรวม / ยังไม่ปิดตู้ / ซ้ำ / ไม่พบ) are flagged
 *    note-only and skipped. Idempotent + audit-logged.
 *
 * Gated to ops/super/warehouse (+ god) — the warehouse/ops reconcile workflow.
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAdmin, logAdminAction, type AdminActionResult } from "./common";
import { parseTaemReconcile } from "@/lib/admin/taem-reconcile-parser";
import { collectContainerEtdEta } from "@/lib/admin/taem-etd-eta";
import { transportModeFromCabinetName } from "@/lib/forwarder/cabinet-transport";
import { computeAndFillForwarderImportRate } from "@/lib/forwarder/live-rate";

const schema = z.object({ text: z.string().min(5).max(500_000) });

const BILLED = new Set(["5", "6", "7"]);
const WT_EPS = 0.01;
const VOL_EPS = 0.000001;

export type TaemReconcileRow = {
  tracking: string;
  isData: boolean;
  note: string | null;
  // แต้ม (authoritative)
  taemContainer: string | null;
  taemTrans: string | null;
  taemCode: string | null;
  taemParcel: number | null;
  taemWt: number | null;
  taemVol: number | null;
  taemEtd: string | null;   // ETD from แต้ม packing-list (ISO yyyy-mm-dd | null)
  taemEta: string | null;   // ETA from แต้ม packing-list (ISO yyyy-mm-dd | null)
  // classification (มก. 0218 · reference capture — never feeds price)
  taemCg: string | null;          // CG. (col T) — แต้ม HS / customs classification
  taemBoxMark: string | null;     // Remark Number (col S) — box marking
  taemProductType: string | null; // Type (col H) — raw product type string
  // pacred current
  matched: boolean;
  fid: number | null;
  userid: string | null;
  fstatus: string | null;
  curWt: number | null;
  curVol: number | null;
  curCab: string | null;
  curAmt: number | null;
  curBoxMark: string | null;        // tb_forwarder.fbox_mark
  curTaemHsCode: string | null;     // tb_forwarder.ftaem_hs_code
  curProductType: string | null;    // tb_forwarder.fproductstype (price-feeding · read only)
  // diff + verdict
  wtDiff: boolean;
  volDiff: boolean;
  cabDiff: boolean;
  amtDiff: boolean;
  // classification will-write / mismatch flags (reference only · no price impact)
  hsWillWrite: boolean;     // ftaem_hs_code is empty/equal → safe to fill
  hsConflict: boolean;      // แต้ม CG. differs from a stored non-empty ftaem_hs_code
  boxMarkWillWrite: boolean;
  boxMarkConflict: boolean;
  productTypeMismatch: boolean; // แต้ม Type maps to a fproductstype ≠ the stored one (manual review)
  isBilled: boolean;
  verdict: "update" | "billed" | "ok" | "no-match" | "note";
};

export type TaemReconcilePreview = {
  rows: TaemReconcileRow[];
  summary: {
    total: number;
    dataRows: number;
    noteRows: number;
    willUpdate: number;
    billedDiffer: number;
    alreadyOk: number;
    noMatch: number;
    // classification capture (reference only · no price impact)
    classWillWrite: number;   // rows where ftaem_hs_code / fbox_mark will be filled
    classConflict: number;    // rows where แต้ม HS/box-mark differs from a stored value
    productTypeMismatch: number; // rows where แต้ม type ≠ the price-feeding fproductstype
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
  userid: string | null;
  fbox_mark: string | null;
  ftaem_hs_code: string | null;
  fproductstype: string | null;
};

const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

const str = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

/**
 * Map แต้ม's raw "Type" string → the Pacred fproductstype enum index for a
 * MISMATCH check only (we never write fproductstype — it feeds the price).
 * Legacy enum: 1=ทั่วไป · 2=มอก. · 3=อย. · 4=พิเศษ (function.php nameProductsType).
 * แต้ม encodes the same three in CN/TH/letter:
 *   普通货物 / ทั่วไป / A        → 1
 *   电器   / มอก.  / M / TIS   → 2
 *   药和食物 / อย.  / O / FDA   → 3
 * Returns null when แต้ม's type is blank or unrecognised (→ no mismatch flag).
 */
function taemTypeToFproductstype(taemType: string | null): string | null {
  const t = (taemType ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("普通") || t.includes("ทั่วไป") || /(^|\/| )a($|\/| )/.test(t)) return "1";
  if (t.includes("电器") || t.includes("มอก") || t.includes("tis") || /(^|\/| )m($|\/| )/.test(t)) return "2";
  if (t.includes("药") || t.includes("食物") || t.includes("อย") || t.includes("fda") || /(^|\/| )o($|\/| )/.test(t)) return "3";
  if (t.includes("พิเศษ") || t.includes("special")) return "4";
  return null;
}

async function buildPreview(text: string): Promise<TaemReconcilePreview> {
  const { rows: parsed } = parseTaemReconcile(text);
  const admin = createAdminClient();

  // Match ALL trackings (data + note) so note rows still show whether Pacred has them.
  const trackings = Array.from(new Set(parsed.map((r) => r.tracking)));
  const fByTracking = new Map<string, FwdRow>();
  if (trackings.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fweight, fvolume, famount, fcabinetnumber, userid, fbox_mark, ftaem_hs_code, fproductstype")
      .in("ftrackingchn", trackings);
    if (error) console.error("[taem-reconcile match] failed", { code: error.code, message: error.message });
    for (const r of (data ?? []) as FwdRow[]) {
      // first match per tracking wins (1:1 incl -N splits)
      if (r.ftrackingchn && !fByTracking.has(r.ftrackingchn)) fByTracking.set(r.ftrackingchn, r);
    }
  }

  const rows: TaemReconcileRow[] = parsed.map((t) => {
    const f = fByTracking.get(t.tracking) ?? null;
    const matched = !!f;
    const curWt = f ? num(f.fweight) : null;
    const curVol = f ? num(f.fvolume) : null;
    const curAmt = f ? num(f.famount) : null;
    const curCab = f?.fcabinetnumber ?? null;
    const curBoxMark = f ? str(f.fbox_mark) : null;
    const curTaemHsCode = f ? str(f.ftaem_hs_code) : null;
    const curProductType = f ? str(f.fproductstype) : null;
    const isBilled = !!f && BILLED.has(String(f.fstatus));

    // Classification capture (mig 0218 · reference only · never feeds price).
    const taemCg = t.cg;
    const taemBoxMark = t.boxMark;
    const taemProductType = t.type;

    let verdict: TaemReconcileRow["verdict"];
    let wtDiff = false, volDiff = false, cabDiff = false, amtDiff = false;

    if (!t.isData) {
      verdict = "note";
    } else if (!matched) {
      verdict = "no-match";
    } else {
      wtDiff = t.totalWt != null && (curWt == null || Math.abs(curWt - t.totalWt) > WT_EPS);
      volDiff = t.totalVol != null && (curVol == null || Math.abs(curVol - t.totalVol) > VOL_EPS);
      // Only a cabinet diff when แต้ม actually HAS a container value. Continuation
      // rows (1779955936-2..-5) carry an empty container cell (they inherit the
      // parent's), so an empty แต้ม container must NOT flag-diff against Pacred's real
      // cabinet — else those rows would show "จะอัปเดต" forever (and the apply guard
      // skips the cabinet write anyway). Pacred's cabinet is authoritative there.
      cabDiff = !!t.container && t.container.trim() !== (curCab ?? "").trim();
      amtDiff = t.parcel != null && curAmt != null && curAmt !== t.parcel;
      const anyDiff = wtDiff || volDiff || cabDiff || amtDiff;
      verdict = !anyDiff ? "ok" : isBilled ? "billed" : "update";
    }

    // Classification will-write / conflict flags (reference fields only · §0e).
    // We FILL ftaem_hs_code / fbox_mark only when empty or already equal (never
    // silently overwrite a different stored value — that gets a conflict flag for
    // staff to reconcile). fproductstype is NEVER written; we only surface a
    // mismatch between แต้ม's mapped type and the stored price-feeding enum.
    let hsWillWrite = false, hsConflict = false;
    let boxMarkWillWrite = false, boxMarkConflict = false;
    let productTypeMismatch = false;
    if (matched) {
      if (taemCg) {
        if (curTaemHsCode == null || curTaemHsCode === taemCg) hsWillWrite = curTaemHsCode == null;
        else hsConflict = true;
      }
      if (taemBoxMark) {
        if (curBoxMark == null || curBoxMark === taemBoxMark) boxMarkWillWrite = curBoxMark == null;
        else boxMarkConflict = true;
      }
      const mapped = taemTypeToFproductstype(taemProductType);
      if (mapped != null && curProductType != null && mapped !== curProductType) {
        productTypeMismatch = true;
      }
    }

    return {
      tracking: t.tracking,
      isData: t.isData,
      note: t.note,
      taemContainer: t.container,
      taemTrans: t.trans,
      taemCode: t.code,
      taemParcel: t.parcel,
      taemWt: t.totalWt,
      taemVol: t.totalVol,
      taemEtd: t.etd,
      taemEta: t.eta,
      taemCg, taemBoxMark, taemProductType,
      matched,
      fid: f?.id ?? null,
      userid: f?.userid ?? null,
      fstatus: f?.fstatus ?? null,
      curWt, curVol, curCab, curAmt,
      curBoxMark, curTaemHsCode, curProductType,
      wtDiff, volDiff, cabDiff, amtDiff,
      hsWillWrite, hsConflict, boxMarkWillWrite, boxMarkConflict, productTypeMismatch,
      isBilled,
      verdict,
    };
  });

  return {
    rows,
    summary: {
      total: rows.length,
      dataRows: rows.filter((r) => r.isData).length,
      noteRows: rows.filter((r) => !r.isData).length,
      willUpdate: rows.filter((r) => r.verdict === "update").length,
      billedDiffer: rows.filter((r) => r.verdict === "billed").length,
      alreadyOk: rows.filter((r) => r.verdict === "ok").length,
      noMatch: rows.filter((r) => r.verdict === "no-match").length,
      classWillWrite: rows.filter((r) => r.hsWillWrite || r.boxMarkWillWrite).length,
      classConflict: rows.filter((r) => r.hsConflict || r.boxMarkConflict).length,
      productTypeMismatch: rows.filter((r) => r.productTypeMismatch).length,
    },
  };
}

/** Read-only preview — parse + match + diff. No writes. */
export async function previewTaemReconcile(input: unknown): Promise<AdminActionResult<TaemReconcilePreview>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin<TaemReconcilePreview>(["ops", "super", "warehouse"], async () => {
    return { ok: true, data: await buildPreview(parsed.data.text) };
  });
}

export type TaemApplyResult = {
  basisUpdated: number;   // rows whose measurement basis was written
  repriced: number;       // of those, how many had the SELL price re-derived
  repriceFailed: number;  // basis written but no rate card → needs manual price
  skippedBilled: number;
  total: number;
  etdEtaUpserted: number; // distinct containers whose ETD/ETA was stored from แต้ม
  classUpdated: number;   // rows whose HS(CG.)/box-mark/raw-type reference was written
  classConflicts: number; // rows skipped because แต้ม HS/box-mark differs (manual review)
};

/** Apply — re-parses the SAME text, writes the basis on non-billed differing rows,
 *  then re-derives the sell price. Idempotent + logged. */
export async function applyTaemReconcile(input: unknown): Promise<AdminActionResult<TaemApplyResult>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid_input" };
  return withAdmin<TaemApplyResult>(["ops", "super", "warehouse"], async ({ adminId }) => {
    const preview = await buildPreview(parsed.data.text);
    const admin = createAdminClient();

    let basisUpdated = 0, repriced = 0, repriceFailed = 0;
    let classUpdated = 0, classConflicts = 0;
    const repriceFailedTracks: string[] = [];

    for (const r of preview.rows) {
      if (r.verdict !== "update" || r.fid == null) continue;

      const transport = r.taemContainer ? transportModeFromCabinetName(r.taemContainer) : null;
      const updates: Record<string, unknown> = {
        // แต้ม's Total Vol. IS the aggregate → store as total + force famountcount=1 so
        // CBM reads fvolume directly (the 2026-06-16 double-count rule).
        famountcount: "1",
      };
      if (r.taemWt != null) updates.fweight = r.taemWt;
      if (r.taemVol != null) updates.fvolume = r.taemVol;
      if (r.taemParcel != null) updates.famount = r.taemParcel;
      if (r.taemContainer) updates.fcabinetnumber = r.taemContainer;
      if (transport) updates.ftransporttype = transport;

      // TOCTOU: re-assert non-billed in the WHERE so a row that got billed between
      // preview and apply is never overwritten.
      const { data: updated, error: updErr } = await admin
        .from("tb_forwarder")
        .update(updates)
        .eq("id", r.fid)
        .not("fstatus", "in", "(5,6,7)")
        .select("id")
        .maybeSingle<{ id: number }>();
      if (updErr) {
        console.error("[taem-reconcile apply] update failed", { fid: r.fid, code: updErr.code, message: updErr.message });
        continue;
      }
      if (!updated) continue; // became billed → skipped by the guard
      basisUpdated += 1;

      // Re-derive the SELL price from the NEW basis (honours manual rate + ค่าเทียบ
      // override inside the resolver). Never persists a silent ฿0.
      const priced = await computeAndFillForwarderImportRate(admin, r.fid);
      if (priced.wrote) repriced += 1;
      else { repriceFailed += 1; repriceFailedTracks.push(r.tracking); }
    }

    // ── Classification capture (mig 0218 · CG.→ftaem_hs_code · Remark→fbox_mark ·
    //    raw Type→ftaem_product_type) — REFERENCE ONLY, never feeds price. ───────
    // Runs over ALL matched non-billed data rows (incl. `ok` rows that only have a
    // classification to fill), separate from the basis loop. We FILL a field only
    // when it's empty (never silently overwrite a different stored HS/box-mark — a
    // conflict is surfaced in the preview for manual reconcile + counted here). The
    // raw แต้ม Type is always stored verbatim as reference (ftaem_product_type) —
    // it does NOT touch the price-feeding fproductstype.
    for (const r of preview.rows) {
      if (!r.isData || r.fid == null || !r.matched || r.isBilled) continue;
      const classUpdates: Record<string, unknown> = {};
      if (r.hsWillWrite && r.taemCg) classUpdates.ftaem_hs_code = r.taemCg;
      if (r.boxMarkWillWrite && r.taemBoxMark) classUpdates.fbox_mark = r.taemBoxMark;
      // Always store แต้ม's raw type verbatim as reference (idempotent). NOTE:
      // ftaem_product_type is a SEPARATE reference column — the price-feeding
      // fproductstype is intentionally NEVER written here (a mismatch is only
      // surfaced in the preview for manual review).
      if (r.taemProductType) classUpdates.ftaem_product_type = r.taemProductType;
      if (r.hsConflict || r.boxMarkConflict) classConflicts += 1;
      if (Object.keys(classUpdates).length === 0) continue;

      // TOCTOU: re-assert non-billed in the WHERE (same guard as the basis write).
      const { data: cu, error: cErr } = await admin
        .from("tb_forwarder")
        .update(classUpdates)
        .eq("id", r.fid)
        .not("fstatus", "in", "(5,6,7)")
        .select("id")
        .maybeSingle<{ id: number }>();
      if (cErr) {
        console.error("[taem-reconcile apply] class update failed", { fid: r.fid, code: cErr.code, message: cErr.message });
        continue;
      }
      if (cu) classUpdated += 1;
    }

    // ── Persist ETD/ETA per container (report-cnt #4) ──────────────────────
    // แต้ม (iTAM) is AUTHORITATIVE for ETD/ETA (owner 2026-06-19/20: "ยึดของแต้ม
    // เป็นหลัก, MOMO มาเทียบ"). Store into the dedicated taem_container_etd_eta
    // table (keyed by the container code report-cnt groups by). MOMO's own etd/eta
    // on momo_import_tracks are LEFT UNTOUCHED → the resolver can show แต้ม first +
    // fall back to MOMO. Independent of the basis-update guard: an `ok` row (already
    // matching) can still carry fresh etd/eta. Best-effort — never fails the apply.
    let etdEtaUpserted = 0;
    const etdEtaRows = collectContainerEtdEta(preview.rows.filter((r) => r.isData));
    if (etdEtaRows.length > 0) {
      const nowIso = new Date().toISOString();
      const { error: upErr } = await admin
        .from("taem_container_etd_eta")
        .upsert(
          etdEtaRows.map((r) => ({
            container_no: r.container_no,
            etd: r.etd,
            eta: r.eta,
            source: "taem",
            updated_by: adminId,
            updated_at: nowIso,
          })),
          { onConflict: "container_no" },
        );
      if (upErr) {
        console.error("[taem-reconcile apply] etd/eta upsert failed", { code: upErr.code, message: upErr.message });
      } else {
        etdEtaUpserted = etdEtaRows.length;
      }
    }

    await logAdminAction(adminId, "taem_reconcile.apply", "tb_forwarder", "", {
      basisUpdated, repriced, repriceFailed, etdEtaUpserted, classUpdated, classConflicts,
      candidates: preview.summary.willUpdate,
      repriceFailedTracks: repriceFailedTracks.slice(0, 50),
    });

    return {
      ok: true,
      data: {
        basisUpdated,
        repriced,
        repriceFailed,
        skippedBilled: preview.summary.billedDiffer,
        total: preview.summary.willUpdate,
        etdEtaUpserted,
        classUpdated,
        classConflicts,
      },
    };
  });
}
