/**
 * <ForwarderPerTrackingEditor> — the SERVER fetcher for the per-แทรคกิง dimension/
 * price editor (owner ภูม 2026-06-18: "ออเดอร์มี 2 แทค แต่ฟอร์มกรอกมีแถวเดียว ·
 * ถ้าแต่ละแทคมีขนาดต่างกัน มันจะคิดผิด").
 *
 * The legacy single-row <AdminForwarderEditForm> only ever persisted ONE
 * tb_forwarder row — a split parcel's other trackings were never editable (their
 * dims/price stayed at create-time). This component fetches EVERY sibling
 * tracking (the same group the items-table + list page show, via baseTracking +
 * userid + filterCountableForwarderRows) and renders one editable row PER
 * tracking through <PerTrackingEditorClient>, which persists every row by calling
 * the EXISTING audited per-row action (adminUpdateForwarderDimensions) once per
 * tracking — no new money-write path; each row reprices on its OWN famount/dims.
 *
 * Sibling fetch MIRRORS forwarder-import-items-table.tsx so the editor rows and
 * the read-only items table agree row-for-row.
 *
 * Async server component — fetches inline, then hands a plain PerTrackingRow[]
 * to the client editor.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  baseTracking,
  trackingSuffix,
  filterCountableForwarderRows,
} from "@/lib/admin/momo-bill-header";
// 2026-06-19 (ภูม · #1 revise) — the live SYSTEM/PROFILE rate engine. Resolved
// READ-ONLY here so the client preview can show the REAL คิดตามน้ำหนัก/ปริมาตร when
// the "คิดราคาแบบกำหนดเอง" toggle is OFF (the client alone can't reach the rate
// cards). Uses the EXACT same waterfall the save runs → preview == save (no drift).
import { resolveLiveForwarderRate, type PricingRowContext } from "@/lib/forwarder/live-rate";
import { isMaoCarrier } from "@/lib/forwarder/mao-fee";
// 2026-07-02 (ภูม · per-box dims) — a tracking split by MOMO into N different-size
// boxes stores its AGGREGATE on ONE tb_forwarder row (ก×ย×ส blank). Read the per-box
// breakdown MOMO's Live scrape captured (momo_box_detail) so the editor can SHOW each
// box's real size under that one blank dims input. READ-ONLY · display only.
import { getBoxDetailsForBaseTrackings, type MomoBoxDetailView } from "@/lib/integrations/momo-web/box-detail";
import { PerTrackingEditorClient, type PerTrackingRow } from "./per-tracking-editor-client";

// The landed row passed from page.tsx (carries userid for the sibling lookup).
type SeedRow = {
  id: number;
  userid?: string | null;
  ftrackingchn?: string | null;
  fstatus?: string | null;
};

type Props = {
  r: SeedRow;
  // ORDER-level shared rate toggles — seeded from the landed row's pricingInit so
  // they reflect what the order currently uses (applied to every row on save).
  customRateInit: "0" | "1";
  customRateKgInit: number;
  customRateCbmInit: number;
  customComparisonInit: "0" | "1";
  customComparisonValueInit: number;
  /** ภูม 2026-06-19 — everyone may set ค่าเทียบ EXCEPT warehouse staff. */
  canEditComparison: boolean;
};

// Per-sibling columns we need to seed each editable row.
type Row = {
  id: number;
  userid?: string | null;
  ftrackingchn: string | null;
  reforder: string | null;
  fdetail: string | null;
  fproductstype: string | null;
  famount: number | string | null;
  famountcount: number | string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  fwarehousechina: string | null;
  fwarehousename: string | null;
  // 2026-06-19 (#1 revise) — needed for the system-rate lookup tuple
  // (warehouse × transport × product). The single-row form reads it from the
  // landed row; each sibling carries its own.
  ftransporttype: string | null;
  ftransportprice: number | string | null;
  fdiscount: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fshippingservice: number | string | null;
  fshipby: string | null;
};

const SIBLING_SELECT =
  "id, userid, ftrackingchn, reforder, fdetail, fproductstype, famount, famountcount, " +
  "fweight, fvolume, fwidth, flength, fheight, fwarehousechina, fwarehousename, ftransporttype, " +
  "ftransportprice, fdiscount, ftransportpricechnthb, priceother, fshippingservice, fshipby";

const VALID_PRODUCT = ["1", "2", "3", "4"];
const VALID_WH_TH = ["1", "2", "3", "4", "5", "6", "7", "8"];

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

export async function ForwarderPerTrackingEditor({
  r,
  customRateInit,
  customRateKgInit,
  customRateCbmInit,
  customComparisonInit,
  customComparisonValueInit,
  canEditComparison,
}: Props) {
  const admin = createAdminClient();

  // ── Gather the sibling tracking rows (mirror items-table) ──
  // A split parcel = several tb_forwarder rows sharing (baseTracking, userid).
  // Narrow by a prefix ILIKE, keep only EXACT baseTracking matches, drop the
  // MOMO หัวบิล. On any error / empty result, fall back to the single row.
  const base = baseTracking(r.ftrackingchn);
  let rows: Row[] = [];
  if (base && r.userid) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(SIBLING_SELECT)
      .eq("userid", r.userid)
      .ilike("ftrackingchn", `${base}%`)
      .limit(200);
    if (error) {
      console.error(`[ForwarderPerTrackingEditor siblings]`, {
        code: error.code, message: error.message, base, userid: r.userid,
      });
    } else {
      const exact = ((data ?? []) as unknown as Row[]).filter(
        (row) => baseTracking(row.ftrackingchn) === base,
      );
      if (exact.length > 0) rows = exact;
    }
  }

  // If the sibling fetch found nothing usable, fetch the single landed row so the
  // editor still renders ONE row (never empty — staff must always be able to edit).
  if (rows.length === 0) {
    const { data, error } = await admin
      .from("tb_forwarder")
      .select(SIBLING_SELECT)
      .eq("id", r.id)
      .maybeSingle();
    if (error) {
      console.error(`[ForwarderPerTrackingEditor single]`, {
        code: error.code, message: error.message, id: r.id,
      });
    }
    if (data) rows = [data as unknown as Row];
  }

  // Drop the MOMO หัวบิล (bare zero-weight bill-header) — same filter as the
  // list/items-table Σ, so editor rows == display rows. Then order by box number.
  const countable = filterCountableForwarderRows(rows, {
    tracking: (row) => row.ftrackingchn,
    weight: (row) => num(row.fweight),
    userid: (row) => row.userid ?? "",
  });
  const display = (countable.length > 0 ? countable : rows)
    .slice()
    .sort(
      (a, b) =>
        trackingSuffix(a.ftrackingchn) - trackingSuffix(b.ftrackingchn) || a.id - b.id,
    );

  // ── Item names for the รายละเอียด label, batched across siblings ──
  // shop-spawned (tb_order by reforder→hno) preferred, else tb_forwarder_item by fid.
  const reforders = Array.from(
    new Set(display.map((row) => (row.reforder ?? "").trim()).filter((s) => s !== "")),
  );
  const fids = display.map((row) => row.id);

  const namesByHno = new Map<string, string[]>();
  if (reforders.length > 0) {
    const { data, error } = await admin
      .from("tb_order")
      .select("hno, ctitle")
      .in("hno", reforders)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      console.error(`[ForwarderPerTrackingEditor tb_order]`, { code: error.code, message: error.message });
    } else {
      for (const it of (data ?? []) as { hno: string | null; ctitle: string | null }[]) {
        const hno = (it.hno ?? "").trim();
        const name = (it.ctitle ?? "").trim();
        if (hno === "" || name === "") continue;
        const list = namesByHno.get(hno);
        if (list) list.push(name);
        else namesByHno.set(hno, [name]);
      }
    }
  }

  const namesByFid = new Map<number, string[]>();
  if (fids.length > 0) {
    const { data, error } = await admin
      .from("tb_forwarder_item")
      .select("fid, productname")
      .in("fid", fids)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      console.error(`[ForwarderPerTrackingEditor tb_forwarder_item]`, { code: error.code, message: error.message });
    } else {
      for (const it of (data ?? []) as { fid: number | null; productname: string | null }[]) {
        if (it.fid == null) continue;
        const name = (it.productname ?? "").trim();
        if (name === "") continue;
        const list = namesByFid.get(it.fid);
        if (list) list.push(name);
        else namesByFid.set(it.fid, [name]);
      }
    }
  }

  // ── Build the editable rows ──
  const editorRows: PerTrackingRow[] = display.map((row) => {
    const reforder = (row.reforder ?? "").trim();
    const itemNames =
      reforder !== "" && namesByHno.has(reforder)
        ? namesByHno.get(reforder)!
        : (namesByFid.get(row.id) ?? []);
    const tracking = (row.ftrackingchn ?? "").trim();
    const detail =
      row.fdetail && row.fdetail.trim() !== "" && row.fdetail.trim() !== "..."
        ? row.fdetail.trim()
        : itemNames.length > 0
          ? itemNames[0]
          : tracking;

    return {
      id: row.id,
      tracking,
      detail,
      boxes: num(row.famount),
      // weight/dims are RAW per-row values (the editable CBM is the raw fvolume —
      // the action recomputes cbmProduct = famountcount==='1' ? cbm : cbm*famount,
      // matching the single-row form which seeds from raw fvolume too).
      weight: num(row.fweight),
      width: num(row.fwidth),
      length: num(row.flength),
      height: num(row.fheight),
      cbm: num(row.fvolume),
      productType: (VALID_PRODUCT.includes(row.fproductstype ?? "")
        ? row.fproductstype
        : "1") as PerTrackingRow["productType"],
      warehouseChina: (row.fwarehousechina === "2" ? "2" : "1") as PerTrackingRow["warehouseChina"],
      warehouseName: (VALID_WH_TH.includes(row.fwarehousename ?? "")
        ? row.fwarehousename
        : "1") as PerTrackingRow["warehouseName"],
      fTransportPrice: num(row.ftransportprice),
      fDiscount: num(row.fdiscount),
      fTransportPriceChnThb: num(row.ftransportpricechnthb),
      priceOther: num(row.priceother),
      fShippingService: num(row.fshippingservice),
    };
  });

  // ── 2026-06-19 (#1 revise · owner "เรท default profile ให้ดึงมา auto คำนวณมาเลย
  //    แจงยอดเท่าไรเลย") — resolve the customer's PROFILE/SYSTEM rate SERVER-SIDE so
  //    the client preview shows the REAL คิดตามน้ำหนัก/ปริมาตร/ระบบเลือก (not ฿0)
  //    when the "คิดราคาแบบกำหนดเอง" toggle is OFF. ────────────────────────────
  //
  // The client can't reach the rate cards, so it can only show ฿0 with manual
  // OFF. We resolve here using the SAME engine + inputs the save runs
  // (resolveLiveForwarderRate, customRateSwitch=false = system pricing), per
  // DISPLAY row, and sum the transport subtotals — exactly the basis-on-the-
  // order-total math the save does. READ-ONLY: no write, no mutation; the save
  // still recomputes authoritatively (this only feeds the preview).
  //
  // We resolve per-row (each row prices on its OWN dims) with the ORDER-TOTAL
  // ค่าเทียบ ratio for the KG-vs-CBM basis decision — mirroring the per-tracking
  // save (forwarder-edit comparisonKgPerCbm). The summed subtotal is the real
  // "ระบบเลือก" number; the chosen unit rate + basis of the (first) row labels the
  // breakdown line. If no rate card matches the tuple → profileRateMissing, and
  // the client falls back to the legacy "ใช้เรทระบบ — คำนวณจริงตอนบันทึก" note.
  //
  // 2026-06-20 (#1 refine · owner ภูม "คิดตามน้ำหนัก ไม่เห็นขึ้นเลย · ต้องคิดตามคิว
  // เป็น default · ถ้าอยากเปลี่ยนค่อยกดติ๊ก") — we ALSO sum the kg-basis AND cbm-basis
  // amounts (Σ rowWeight×rowKgRate · Σ rowCbm×rowCbmRate) from the SAME engine, so
  // the preview shows a REAL number on BOTH lines (the non-chosen line was blank).
  // CBM stays the system's chosen basis (per ค่าเทียบ); only the chosen one drives
  // "ราคารวมสุทธิ". A basis with no rate card on any row → null amount → "—".
  let profileTransportTotal = 0;
  let profileRate = 0;
  let profileBasis: "kg" | "cbm" = "cbm";
  let profileRateMissing = false;
  let profileResolved = false;
  // Per-basis display amounts (Σ over rows) + a uniform unit rate to label the
  // "× rate" multiplier when every row shares it (typical single-row order).
  let kgAmount = 0;          // Σ rowWeight × rowKgRate
  let cbmAmount = 0;         // Σ rowCbm × rowCbmRate
  let kgAnyRate = false;     // at least one row had a kg rate card
  let cbmAnyRate = false;    // at least one row had a cbm rate card
  let kgUnitRate: number | null = null;   // uniform kg unit rate (null if rows differ)
  let cbmUnitRate: number | null = null;  // uniform cbm unit rate (null if rows differ)
  let kgRateUniform = true;
  let cbmRateUniform = true;
  if (r.userid && display.length > 0) {
    // Σweight / Σcbm across display rows — the order-total ค่าเทียบ ratio (same
    // aggregate the client preview box sums). cbmProduct per row = famountcount==1
    // ? fvolume : fvolume*famount (legacy L1935-1941).
    let sumWeight = 0;
    let sumCbm = 0;
    for (const row of display) {
      const fAmountCount = row.famountcount == null ? null : String(row.famountcount);
      const fAmount = num(row.famount);
      const fVolume = num(row.fvolume);
      sumWeight += num(row.fweight);
      sumCbm += String(fAmountCount ?? "").trim() === "1" ? fVolume : fVolume * fAmount;
    }
    const orderKgPerCbm = sumCbm > 0 ? sumWeight / sumCbm : 0;

    // userComparison / userComparisonValue (tb_users · camelCase) — same read the
    // save does, so the basis decision matches.
    const { data: cmpRow, error: cmpErr } = await admin
      .from("tb_users")
      .select("userComparison, userComparisonValue")
      .eq("userID", r.userid)
      .maybeSingle<{ userComparison: string | number | null; userComparisonValue: number | string | null }>();
    if (cmpErr) {
      console.error(`[ForwarderPerTrackingEditor: tb_users comparison]`, { code: cmpErr.code, message: cmpErr.message, userid: r.userid });
    }
    const userComparison = String(cmpRow?.userComparison ?? "0").trim() === "1";
    const userComparisonValue = num(cmpRow?.userComparisonValue);

    let allMissing = display.length > 0;
    let firstSet = false;
    for (const row of display) {
      const fAmountCount = row.famountcount == null ? null : String(row.famountcount);
      const fAmount = num(row.famount);
      const fVolume = num(row.fvolume);
      const cbmProduct = String(fAmountCount ?? "").trim() === "1" ? fVolume : fVolume * fAmount;
      const ctx: PricingRowContext = {
        userid:           r.userid,
        fwarehousechina:  String(row.fwarehousechina ?? "").trim() || "1",
        ftransporttype:   String(row.ftransporttype ?? "").trim(),
        fproductstype:    String(row.fproductstype ?? "").trim() || "1",
        weightKg:         num(row.fweight),
        cbmProduct,
        famountcount:     fAmountCount,
        famount:          fAmount,
        reforder:         row.reforder,
        // SYSTEM pricing (preview the toggle-OFF case) — NO manual override.
        customRateSwitch: false,
        customRateKg:     0,
        customRateCbm:    0,
        userComparison,
        userComparisonValue,
        // Decide the KG-vs-CBM basis on the ORDER TOTAL (matches the save).
        comparisonKgPerCbm: orderKgPerCbm > 0 ? orderKgPerCbm : undefined,
      };
      const res = await resolveLiveForwarderRate(admin, ctx);
      if ("error" in res) {
        console.error(`[ForwarderPerTrackingEditor: resolve]`, { fid: row.id, error: res.error });
        continue;
      }
      const rr = res.resolved;
      if (!(rr.rateMissing || rr.rate <= 0)) {
        allMissing = false;
        profileTransportTotal += rr.transportSubtotal;
        if (!firstSet) {
          profileRate = rr.rate;
          profileBasis = rr.basis;
          firstSet = true;
        }
      }
      // ── Per-basis display amounts (both lines, owner ภูม 2026-06-20) ──
      // Accumulate Σ rowWeight×rowKgRate and Σ rowCbm×rowCbmRate from the SAME
      // engine, so the weight line is never blank when CBM is the chosen basis.
      const { kgRate, cbmRate } = res.unitRates;
      const rowWeight = num(row.fweight);
      if (kgRate != null && kgRate > 0) {
        kgAmount += rowWeight * kgRate;
        kgAnyRate = true;
        if (kgUnitRate == null) kgUnitRate = kgRate;
        else if (kgUnitRate !== kgRate) kgRateUniform = false;
      } else {
        // a row missing a kg card means the "× rate" label can't be uniform.
        kgRateUniform = false;
      }
      if (cbmRate != null && cbmRate > 0) {
        cbmAmount += cbmProduct * cbmRate;
        cbmAnyRate = true;
        if (cbmUnitRate == null) cbmUnitRate = cbmRate;
        else if (cbmUnitRate !== cbmRate) cbmRateUniform = false;
      } else {
        cbmRateUniform = false;
      }
    }
    profileRateMissing = allMissing;
    profileResolved = true;
  }

  // เหมาๆ (Pacred PRF) — when ANY tracking ships via the เหมาๆ carrier, the in-Thailand
  // delivery is the flat MAO_FLAT_FEE. Surface it explicitly (owner 2026-06-23).
  const isMao = rows.some((row) => isMaoCarrier(row.fshipby));

  // ── Per-box breakdown for BLANK-dim rows (ภูม 2026-07-02) ──
  // A tb_forwarder row whose ก×ย×ส is blank AND whose tracking MOMO split into
  // several different-size boxes → show each box's real dims (read-only) under the
  // single dims input so staff can SEE the sizes they can't enter as one number.
  // Only rows that need it (blank dims) get a breakdown, keyed by the row id.
  const blankDimBases = Array.from(
    new Set(
      display
        .filter((row) => !(num(row.fwidth) > 0) && !(num(row.flength) > 0) && !(num(row.fheight) > 0))
        .map((row) => baseTracking(row.ftrackingchn))
        .filter((b): b is string => !!b),
    ),
  );
  const boxDetailByBase =
    blankDimBases.length > 0
      ? await getBoxDetailsForBaseTrackings(admin, blankDimBases)
      : new Map<string, MomoBoxDetailView[]>();
  // Attach the detail to each blank-dim row (by id). A row with >1 box gets the panel.
  const boxDetailByFid: Record<number, MomoBoxDetailView[]> = {};
  for (const row of display) {
    const hasDims = num(row.fwidth) > 0 || num(row.flength) > 0 || num(row.fheight) > 0;
    if (hasDims) continue;
    const base = baseTracking(row.ftrackingchn);
    const boxes = base ? boxDetailByBase.get(base) : undefined;
    // Show the breakdown only when MOMO actually split it into >1 box (the case a
    // single blank dims input can't represent). A 1-box detail adds no value here.
    if (boxes && boxes.length > 1) boxDetailByFid[row.id] = boxes;
  }

  return (
    <PerTrackingEditorClient
      rows={editorRows}
      isMao={isMao}
      boxDetailByFid={boxDetailByFid}
      customRateInit={customRateInit}
      customRateKgInit={customRateKgInit}
      customRateCbmInit={customRateCbmInit}
      customComparisonInit={customComparisonInit}
      customComparisonValueInit={customComparisonValueInit}
      canEditComparison={canEditComparison}
      profileRate={profileRate}
      profileBasis={profileBasis}
      profileTransportTotal={Math.round(profileTransportTotal * 100) / 100}
      profileRateMissing={profileRateMissing}
      profileResolved={profileResolved}
      // BOTH per-basis amounts (display) — null when no rate card matched that
      // basis on any row (the client shows "—" for that line only).
      profileKgAmount={kgAnyRate ? Math.round(kgAmount * 100) / 100 : null}
      profileCbmAmount={cbmAnyRate ? Math.round(cbmAmount * 100) / 100 : null}
      // a uniform unit rate to label "× rate" (only when every priced row shared
      // it — else the client omits the multiplier and shows just the Σ amount).
      profileKgUnitRate={kgRateUniform ? kgUnitRate : null}
      profileCbmUnitRate={cbmRateUniform ? cbmUnitRate : null}
    />
  );
}
