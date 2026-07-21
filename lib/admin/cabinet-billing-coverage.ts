/**
 * Cabinet billing coverage — "ตู้นี้ MOMO บิลครบยัง".
 *
 * MOMO bills us PER TRACKING in rounds; we pay/register per CONTAINER once. This answers,
 * per container, how many of its tb_forwarder rows have a REAL MOMO invoice line
 * (`momo_invoice_line` · mig 0267) out of the total — so an accountant can see, BEFORE
 * they คตัดจ่าย, whether MOMO has finished billing the container (paying the container
 * total while MOMO has only billed some rows = over-paying for rows still carrying an
 * ESTIMATED cost).
 *
 * TWO parts:
 *   - `computeCabinetBillingCoverage` — PURE (no I/O · unit-tested). Given a container's
 *     rows + their invoice lines, computes X/Y billed, Σ real vs Σ stored, and the state.
 *   - `loadCabinetBillingCoverage` — the fetch wrapper. Reads tb_forwarder + momo_invoice_line
 *     (FAIL-SOFT: a missing table / query error degrades to "ยังไม่มีข้อมูลใบ", never a 500 —
 *     mirrors the taem_container_etd_eta read in momo-container-resolve.ts, so a deploy that
 *     briefly precedes the 0267 migration is safe), then computes per container.
 *
 * 🔴 CRITICAL FAIL-SAFE (the "no fake ขาด" rule): a container costed BEFORE this table
 * existed (legacy / estimated cost) has ZERO invoice lines. That MUST render
 * "ยังไม่มีข้อมูลใบ (ลงต้นทุนก่อนมีระบบติดตาม)" — NEVER a fake "0/Y ขาด" that would wrongly
 * accuse MOMO of under-billing. Zero lines ⇒ state = no_invoice_data, always.
 *
 * Read-only. No money path. Takes the admin client as a param (type-only import → this
 * module is tsx-testable, never pulls a server-only runtime dep).
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { filterCountableForwarderRows } from "@/lib/admin/momo-bill-header";

type AdminClient = ReturnType<typeof createAdminClient>;

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** ครบ · ขาด X/Y · ยังไม่มีข้อมูลใบ. */
export type CabinetBillingState = "covered" | "partial" | "no_invoice_data";

export type CabinetBillingCoverage = {
  cabinet: string;
  /** Y — number of tb_forwarder rows currently in this container. */
  totalRows: number;
  /** X — rows with ≥1 real MOMO invoice line (deduped by fid). */
  billedRows: number;
  /** Σ of what MOMO actually billed (THB) — deduped per fid (max), so a re-bill on a
   *  new invoice_no can never inflate this. */
  billedForRealThb: number;
  /** Σ stored fcosttotalprice (THB) — MAY include estimated rows MOMO has not billed. */
  storedCostThb: number;
  state: CabinetBillingState;
  /** Short at-a-glance label ("ครบ" · "ขาด 3/7" · "ยังไม่มีข้อมูลใบ") — NEVER contains ฿
   *  (money figures are gated by showMoney at the presentation layer). */
  chipLabel: string;
  /** rows still lacking a real invoice line (partial only; 0 otherwise). */
  remainingRows: number;
};

/**
 * PURE core. Computes coverage for ONE container from its rows + invoice lines.
 *
 * - `rows`  — the container's CURRENT tb_forwarder rows (distinct by id) with their
 *   stored cost.
 * - `lines` — momo_invoice_line rows; only those whose `fid` is one of `rows` count
 *   (extra lines are ignored, so the caller need not pre-scope). Deduped per fid, taking
 *   the MAX amount (deterministic + order-independent + double-count-safe).
 */
export function computeCabinetBillingCoverage(input: {
  cabinet: string;
  rows: Array<{ fid: number; storedCost: number }>;
  lines: Array<{ fid: number; amount: number }>;
}): CabinetBillingCoverage {
  const rowFids = new Set(input.rows.map((r) => r.fid));
  const totalRows = input.rows.length;
  const storedCostThb = round2(input.rows.reduce((s, r) => s + (Number(r.storedCost) || 0), 0));

  // Scope lines to THIS container's rows, dedupe per fid (max amount).
  const amountByFid = new Map<number, number>();
  for (const l of input.lines) {
    if (!rowFids.has(l.fid)) continue;
    const amt = Number(l.amount) || 0;
    const prev = amountByFid.get(l.fid);
    amountByFid.set(l.fid, prev == null ? amt : Math.max(prev, amt));
  }
  const billedRows = amountByFid.size;
  const billedForRealThb = round2(Array.from(amountByFid.values()).reduce((s, a) => s + a, 0));

  let state: CabinetBillingState;
  let chipLabel: string;
  let remainingRows = 0;

  if (billedRows === 0) {
    // 🔴 zero invoice lines ⇒ NEVER a fake "0/Y ขาด". We have no provenance either way —
    // the stored cost may have come from a real invoice ingested before this table existed.
    state = "no_invoice_data";
    chipLabel = "ยังไม่มีข้อมูลใบ";
  } else if (billedRows >= totalRows) {
    state = "covered";
    chipLabel = "ครบ";
  } else {
    state = "partial";
    remainingRows = totalRows - billedRows;
    chipLabel = `ขาด ${billedRows}/${totalRows}`;
  }

  return {
    cabinet: input.cabinet,
    totalRows,
    billedRows,
    billedForRealThb,
    storedCostThb,
    state,
    chipLabel,
    remainingRows,
  };
}

/**
 * Fetch wrapper — coverage for a set of containers in one round-trip pair.
 *
 * FAIL-SOFT everywhere: if either read errors (e.g. momo_invoice_line not migrated yet),
 * the affected containers fall back to `no_invoice_data` (their storedCost still shows).
 * Never throws — an advisory read must not break a page or a payment.
 */
export async function loadCabinetBillingCoverage(
  admin: AdminClient,
  cabinets: string[],
): Promise<Record<string, CabinetBillingCoverage>> {
  const out: Record<string, CabinetBillingCoverage> = {};
  const cabs = Array.from(new Set(cabinets.map((c) => (c ?? "").trim()).filter(Boolean)));
  if (cabs.length === 0) return out;

  // (1) The container's CURRENT rows — id (= fid) + stored cost, grouped by cabinet.
  //     MOMO bare หัวบิล placeholders are DROPPED from the denominator via the same
  //     filterCountableForwarderRows helper every count surface uses (money accessor =
  //     fcosttotalprice: a bare-with-siblings row carrying NO cost is a placeholder MOMO
  //     will never invoice → counting it would render a perpetual false "ขาด" on every
  //     split container; a bare row that DOES carry cost is a real cost anchor → kept).
  const rowsByCab = new Map<string, Array<{ fid: number; storedCost: number }>>();
  const allFids: number[] = [];
  {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select("id, fcabinetnumber, fcosttotalprice, ftrackingchn, fweight, userid")
      .in("fcabinetnumber", cabs)
      .limit(50_000); // explicit cap — a silent PostgREST default truncation would undercount
    if (error) {                                   // rows → a FALSE "ครบ" (the dangerous direction).
      // Hard-fail on the base rows would leave us with nothing to report → degrade every
      // requested cabinet to no_invoice_data (still truthful: "we can't say").
      console.error("[cabinet-billing-coverage · rows] failed", { code: error.code, message: error.message });
    }
    type RawRow = {
      id: number;
      fcabinetnumber: string | null;
      fcosttotalprice: number | null;
      ftrackingchn: string | null;
      fweight: number | null;
      userid: string | null;
    };
    // Group raw rows per cabinet FIRST (the header rule is per parcel-group within a
    // cabinet), then drop headers per cabinet before feeding the pure core.
    const rawByCab = new Map<string, RawRow[]>();
    for (const r of (data ?? []) as RawRow[]) {
      const cab = (r.fcabinetnumber ?? "").trim();
      if (!cab) continue;
      let bucket = rawByCab.get(cab);
      if (!bucket) { bucket = []; rawByCab.set(cab, bucket); }
      bucket.push(r);
    }
    for (const [cab, raws] of rawByCab) {
      const countable = filterCountableForwarderRows(raws, {
        tracking: (r) => r.ftrackingchn,
        weight: (r) => r.fweight,
        userid: (r) => r.userid,
        money: (r) => r.fcosttotalprice, // COST context — cost is the keep-signal here
      });
      const bucket: Array<{ fid: number; storedCost: number }> = [];
      for (const r of countable) {
        const fid = Number(r.id);
        bucket.push({ fid, storedCost: Number(r.fcosttotalprice ?? 0) });
        allFids.push(fid);
      }
      rowsByCab.set(cab, bucket);
    }
  }

  // (2) The invoice lines for those rows — FAIL-SOFT (missing table → empty → no_invoice_data).
  const linesByFid = new Map<number, Array<{ fid: number; amount: number }>>();
  if (allFids.length > 0) {
    const { data, error } = await admin
      .from("momo_invoice_line")
      .select("fid, amount")
      .in("fid", allFids)
      .limit(50_000);
    if (error) {
      // The common reason during rollout: mig 0267 not applied yet (42P01). Degrade
      // silently to "ยังไม่มีข้อมูลใบ" for everything (mirrors taem fail-soft).
      console.warn("[cabinet-billing-coverage · momo_invoice_line] read failed → coverage unknown", {
        code: error.code,
        message: error.message,
      });
    }
    for (const l of (data ?? []) as Array<{ fid: number; amount: number | null }>) {
      const fid = Number(l.fid);
      let bucket = linesByFid.get(fid);
      if (!bucket) { bucket = []; linesByFid.set(fid, bucket); }
      bucket.push({ fid, amount: Number(l.amount ?? 0) });
    }
  }

  for (const cab of cabs) {
    const rows = rowsByCab.get(cab) ?? [];
    const lines = rows.flatMap((r) => linesByFid.get(r.fid) ?? []);
    out[cab] = computeCabinetBillingCoverage({ cabinet: cab, rows, lines });
  }
  return out;
}

/**
 * Roll several cabinets' coverage into ONE chip for a payment row (tb_cnt) that covers
 * multiple containers. Cabinet-count based (NOT a fake row-level X/Y) so it never accuses
 * a no-invoice-data cabinet of being "ขาด".
 */
export function rollupCabinetCoverages(covs: CabinetBillingCoverage[]): {
  state: CabinetBillingState;
  chipLabel: string;
  cabinets: number;
  coveredCabinets: number;
  partialCabinets: number;
  noDataCabinets: number;
} {
  const cabinets = covs.length;
  const coveredCabinets = covs.filter((c) => c.state === "covered").length;
  const partialCabinets = covs.filter((c) => c.state === "partial").length;
  const noDataCabinets = covs.filter((c) => c.state === "no_invoice_data").length;

  let state: CabinetBillingState;
  let chipLabel: string;
  if (cabinets === 0 || noDataCabinets === cabinets) {
    state = "no_invoice_data";
    chipLabel = "ยังไม่มีข้อมูลใบ";
  } else if (partialCabinets > 0) {
    state = "partial";
    chipLabel = cabinets === 1 ? covs[0]!.chipLabel : `ขาด ${partialCabinets}/${cabinets} ตู้`;
  } else if (noDataCabinets > 0) {
    // some covered, some with no invoice data — flag for review WITHOUT a false ขาด.
    state = "partial";
    chipLabel = `มีใบ ${coveredCabinets}/${cabinets} ตู้`;
  } else {
    state = "covered";
    chipLabel = cabinets === 1 ? "ครบ" : `ครบ ${cabinets} ตู้`;
  }
  return { state, chipLabel, cabinets, coveredCabinets, partialCabinets, noDataCabinets };
}

/**
 * ADVISORY message for the ครบ-gate at container-payment time. Non-blocking — describes,
 * for the containers being registered, what MOMO has actually billed (Σ real) vs the
 * stored cost (which may include estimates) and the once-only consequence. Returns null
 * when every container is fully covered / has no invoice data yet (nothing to warn).
 *
 * Owner: "ระบบให้ตัดจ่ายตู้ละครั้งเดียว · รอบหน้าที่ MOMO บิลส่วนที่เหลือจะบันทึกเข้าตู้นี้ไม่ได้".
 */
export function buildCoverageAdvisory(covs: CabinetBillingCoverage[]): string | null {
  const partial = covs.filter((c) => c.state === "partial");
  if (partial.length === 0) return null;
  const baht = (n: number) => `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines = partial.map(
    (c) =>
      `• ตู้ ${c.cabinet}: MOMO บิลจริงแล้ว ${c.billedRows}/${c.totalRows} แทรคกิ้ง ` +
      `(บิลจริง ${baht(c.billedForRealThb)} · ต้นทุนที่บันทึก ${baht(c.storedCostThb)} — อาจมีต้นทุนประเมินปนอยู่)`,
  );
  return (
    `⚠️ MOMO ยังบิลไม่ครบทั้งตู้:\n${lines.join("\n")}\n` +
    `ระบบให้ตัดจ่ายตู้ละครั้งเดียว · รอบหน้าที่ MOMO บิลส่วนที่เหลือจะบันทึกเข้าตู้นี้ไม่ได้ — ` +
    `ตรวจว่ายอดตรงกับที่ MOMO เรียกเก็บรอบนี้ก่อนยืนยัน`
  );
}
