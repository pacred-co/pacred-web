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
import { PerTrackingEditorClient, type PerTrackingRow } from "./per-tracking-editor-client";

// The landed row passed from page.tsx (carries userid for the sibling lookup).
type SeedRow = {
  id: number;
  userid?: string | null;
  ftrackingchn?: string | null;
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
  ftransportprice: number | string | null;
  fdiscount: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fshippingservice: number | string | null;
};

const SIBLING_SELECT =
  "id, userid, ftrackingchn, reforder, fdetail, fproductstype, famount, famountcount, " +
  "fweight, fvolume, fwidth, flength, fheight, fwarehousechina, fwarehousename, " +
  "ftransportprice, fdiscount, ftransportpricechnthb, priceother, fshippingservice";

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

  return (
    <PerTrackingEditorClient
      rows={editorRows}
      customRateInit={customRateInit}
      customRateKgInit={customRateKgInit}
      customRateCbmInit={customRateCbmInit}
      customComparisonInit={customComparisonInit}
      customComparisonValueInit={customComparisonValueInit}
    />
  );
}
