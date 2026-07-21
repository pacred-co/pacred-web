"use server";

/**
 * Export-file for the Express (external-courier) delivery tab — the Flash
 * "Import ข้อมูลผู้รับ" CSV so the warehouse can drop it into the Flash web
 * back-office and Flash comes to pick up the parcels at the โกดัง.
 *
 * The Express tab (drivers/new?tab=express) lists external-courier deliveries
 * (Flash / Kerry / J&T / …) for tb_forwarder rows at fstatus='6'. The page
 * query does NOT carry the recipient/paymethod/pricing fields, so this action
 * re-reads tb_forwarder by the currently-filtered forwarder ids (bounded ≤500)
 * and builds the Flash import shape.
 *
 * ── MONEY / DATA SAFETY ──────────────────────────────────────────────────
 *   • EXPORT / READ-ONLY — SELECT tb_forwarder + tb_users + a best-effort
 *     admin_export_log audit insert. NO write to any tb_* money/status field.
 *   • COD column = the DOMESTIC leg (ftransportprice · the ค่าส่งไทย the courier collects
 *     at the door) for paymethod='2' (ปลายทาง) ONLY (D2 · 2026-07-13). A prepaid (ต้นทาง)
 *     parcel → BLANK COD (never a phantom COD on a parcel the customer already paid upfront),
 *     and a COD row whose ftransportprice is still ฿0 → BLANK (never ask Flash to collect ฿0
 *     — the ค่าส่งไทย gate should have caught it at bill time). Was: computeForwarderCollectTotal
 *     (freight+fees, which EXCLUDES the domestic leg for COD) → told Flash to COD-collect the
 *     already-paid freight AND omitted the actual door fee (unambiguously wrong).
 *   • CSV is formula-injection-safe (escapeCsvCell neutralises a leading =+-@\t\r)
 *     + UTF-8 BOM (Thai). Bounded EXPORT_CAP=500. Admin-gated.
 *
 * NOTE: the Thai header labels below MAP to the Flash Import "ข้อมูลผู้รับ"
 * columns — the owner can rename any label to match the exact Flash back-office
 * template if Flash changes it (the ORDER + meaning are what Flash imports).
 */

import { resolveThShippingAutoPrice } from "@/lib/forwarder/domestic-shipping";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { escapeCsvCell } from "@/lib/csv/escape";
import { CONTACT, ADDRESSES } from "@/components/seo/site";

/** Safety cap — the Express tab exports the currently-filtered rows, bounded. */
const EXPORT_CAP = 500;

/** tb_forwarder columns needed for the Flash recipient shape + COD calc. */
type FlashFwdRow = {
  id: number;
  userid: string | null;
  fshipby: string | null;
  paymethod: number | string | null;
  fweight: number | string | null;
  faddressname: string | null;
  faddresslastname: string | null;
  faddresstel: string | null;
  faddresstel2: string | null;
  faddressno: string | null;
  faddresssubdistrict: string | null;
  faddressdistrict: string | null;
  faddressprovince: string | null;
  faddresszipcode: string | null;
  faddressnote: string | null;
  ftrackingchn: string | null;
  fwidth: number | string | null;
  flength: number | string | null;
  fheight: number | string | null;
  // pricing components for computeForwarderCollectTotal (COD amount)
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
};

/** Thai header labels — map 1:1 to the Flash Import "ข้อมูลผู้รับ" columns. */
const FLASH_HEADERS = [
  "ชื่อผู้รับ",
  "เบอร์โทร",
  "ที่อยู่",
  "ตำบล/แขวง",
  "อำเภอ/เขต",
  "จังหวัด",
  "รหัสไปรษณีย์",
  "น้ำหนัก(kg)",
  "COD",
  "วิธีชำระ",
  "หมายเหตุ",
] as const;

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build the Flash "ข้อมูลผู้รับ" CSV for the given forwarder ids (the Express
 * tab's currently-filtered external-courier deliveries). Returns the CSV string
 * (UTF-8 BOM, formula-injection-safe). Writes an admin_export_log audit row.
 */
export async function exportFlashPickupCsv(input: {
  forwarderIds: number[];
}): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
  await requireAdmin(["super", "ops", "warehouse"]);

  // Sanitize + bound the id set.
  const ids = Array.from(
    new Set((input.forwarderIds ?? []).filter((n) => Number.isInteger(n) && n > 0)),
  );
  const truncated = ids.length > EXPORT_CAP;
  const boundedIds = truncated ? ids.slice(0, EXPORT_CAP) : ids;
  if (boundedIds.length === 0) {
    return { csv: "", rowCount: 0, truncated: false };
  }

  const admin = createAdminClient();

  // ── Read tb_forwarder rows (recipient + paymethod + pricing) ──
  const { data: fwdData, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, fshipby, paymethod, fweight, faddressname, faddresslastname, " +
        "faddresstel, faddresstel2, faddressno, faddresssubdistrict, faddressdistrict, " +
        "faddressprovince, faddresszipcode, faddressnote, ftrackingchn, ftotalprice, " +
        "ftransportprice, fpriceupdate, fshippingservice, pricecrate, " +
        "fwidth, flength, fheight, " +
        "ftransportpricechnthb, priceother, fdiscount",
    )
    .in("id", boundedIds);
  if (fwdErr) {
    console.error("[exportFlashPickupCsv tb_forwarder] failed", {
      code: fwdErr.code,
      message: fwdErr.message,
    });
    return { csv: "", rowCount: 0, truncated: false };
  }
  const rows = (fwdData ?? []) as unknown as FlashFwdRow[];

  // ── Build the data rows in the Flash recipient shape ──
  const dataLines: string[] = rows.map((r) => {
    const userId = (r.userid ?? "").trim();
    const isCod = toNum(r.paymethod) === 2;

    // D2 (2026-07-13 · MONEY) — COD amount = the DOMESTIC leg (ftransportprice · the
    // ค่าส่งไทย the courier collects at the door) for paymethod='2' (ปลายทาง) ONLY. The
    // freight + fees were paid upfront (row is fstatus≥6); Flash collects only the
    // in-Thailand delivery fee. If ftransportprice is ฿0 (manual carrier's cost not
    // entered — should be blocked at bill time by the ค่าส่งไทย gate) → BLANK, never
    // 0/freight+fees. Prepaid (ต้นทาง) → blank (no phantom COD on an already-paid parcel).
    // 🔒 owner 2026-07-21 — a COD row now STORES ค่าส่งไทย ฿0 (Pacred ไม่เก็บค่าส่งไทย
    // ในบิลเมื่อเก็บปลายทาง · lib/forwarder/pay-method.ts). But the courier still has to
    // be told WHAT to collect at the door, so the COD column falls back to the SAME live
    // Flash quote the auto-fill uses (zip + kg + girth) when the stored charge is ฿0.
    // Behaviour at the door is therefore UNCHANGED by the zeroing; only Pacred's stored
    // charge moved. A row we cannot quote (unmeasured) stays BLANK — never a fake 0.
    let cod = "";
    if (isCod) {
      const stored = Math.round(toNum(r.ftransportprice));
      if (stored > 0) {
        cod = String(stored);
      } else {
        const sizeCm =
          (toNum(r.fwidth) || 0) + (toNum(r.flength) || 0) + (toNum(r.fheight) || 0);
        const quoted = resolveThShippingAutoPrice({
          zip: r.faddresszipcode,
          kg: toNum(r.fweight),
          sizeCm,
        });
        cod = quoted != null && quoted > 0 ? String(Math.round(quoted)) : "";
      }
    }

    const recipient = `${r.faddressname ?? ""} ${r.faddresslastname ?? ""}`.trim();
    const tel = (r.faddresstel && r.faddresstel !== "-" ? r.faddresstel : null) ?? r.faddresstel2 ?? "";
    const payLabel = isCod ? "COD ปลายทาง" : "ต้นทาง (ชำระแล้ว)";
    const note = [r.faddressnote ?? "", userId ? `PR${userId}` : "", r.ftrackingchn ?? ""]
      .filter((s) => s !== "")
      .join(" · ");

    const cells = [
      recipient,
      tel,
      r.faddressno ?? "",
      r.faddresssubdistrict ?? "",
      r.faddressdistrict ?? "",
      r.faddressprovince ?? "",
      r.faddresszipcode ?? "",
      toNum(r.fweight).toFixed(2),
      cod,
      payLabel,
      note,
    ];
    return cells.map(escapeCsvCell).join(",");
  });

  // ── ผู้ส่ง note row (Flash takes ผู้ส่ง once — a leading comment row the
  //    owner can delete if the Flash importer is strict on row 1 = header). ──
  const wh = ADDRESSES.warehouseTh;
  const senderNote = escapeCsvCell(
    `# ผู้ส่ง: Pacred (${wh.warehouseName}) ${wh.full} · โทร ${CONTACT.phoneCompanyDisplay} ` +
      `— กรอกผู้ส่งครั้งเดียวในเวป Flash แล้วลบแถวนี้ได้`,
  );
  const headerLine = FLASH_HEADERS.map(escapeCsvCell).join(",");

  const csvBody = [senderNote, "", headerLine, ...dataLines].join("\r\n");
  const csv = "﻿" + csvBody;

  await logAdminExport({
    dataset: "flash-pickup",
    filters: { requested: ids.length, exported: dataLines.length },
    rowCount: dataLines.length,
    truncated,
  });

  return { csv, rowCount: dataLines.length, truncated };
}
