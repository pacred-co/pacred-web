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
  // pacred current
  matched: boolean;
  fid: number | null;
  userid: string | null;
  fstatus: string | null;
  curWt: number | null;
  curVol: number | null;
  curCab: string | null;
  curAmt: number | null;
  // diff + verdict
  wtDiff: boolean;
  volDiff: boolean;
  cabDiff: boolean;
  amtDiff: boolean;
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
};

const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

async function buildPreview(text: string): Promise<TaemReconcilePreview> {
  const { rows: parsed } = parseTaemReconcile(text);
  const admin = createAdminClient();

  // Match ALL trackings (data + note) so note rows still show whether Pacred has them.
  const trackings = Array.from(new Set(parsed.map((r) => r.tracking)));
  const fByTracking = new Map<string, FwdRow>();
  if (trackings.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus, fweight, fvolume, famount, fcabinetnumber, userid")
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
    const isBilled = !!f && BILLED.has(String(f.fstatus));

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
      matched,
      fid: f?.id ?? null,
      userid: f?.userid ?? null,
      fstatus: f?.fstatus ?? null,
      curWt, curVol, curCab, curAmt,
      wtDiff, volDiff, cabDiff, amtDiff,
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
      basisUpdated, repriced, repriceFailed, etdEtaUpserted,
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
      },
    };
  });
}
