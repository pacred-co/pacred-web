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
 *   • COD column = computeForwarderCollectTotal for paymethod='2' (ปลายทาง) ONLY.
 *     A prepaid (ต้นทาง) parcel → BLANK COD (never a phantom COD on a parcel the
 *     customer already paid upfront). This is lockstep with the collect helper's
 *     own domestic-leg zeroing for COD rows.
 *   • The juristic 1% lever inside computeForwarderCollectTotal reads
 *     tb_users.userCompany (NOT the row's fusercompany — the BUG-2b rule), so we
 *     join tb_users for userCompany.
 *   • CSV is formula-injection-safe (escapeCsvCell neutralises a leading =+-@\t\r)
 *     + UTF-8 BOM (Thai). Bounded EXPORT_CAP=500. Admin-gated.
 *
 * NOTE: the Thai header labels below MAP to the Flash Import "ข้อมูลผู้รับ"
 * columns — the owner can rename any label to match the exact Flash back-office
 * template if Flash changes it (the ORDER + meaning are what Flash imports).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { logAdminExport } from "@/actions/admin/export-log";
import { escapeCsvCell } from "@/lib/csv/escape";
import {
  computeForwarderCollectTotal,
  type ForwarderCollectRow,
} from "@/lib/forwarder/forwarder-collect-total";
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

type UserCompanyRow = { userID: string; userCompany: number | string | null };

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

  // ── Join tb_users for userCompany (the juristic 1% lever · BUG-2b) ──
  const userIds = Array.from(
    new Set(rows.map((r) => (r.userid ?? "").trim()).filter(Boolean)),
  );
  const userCompanyById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: userData, error: userErr } = await admin
      .from("tb_users")
      .select("userID, userCompany")
      .in("userID", userIds);
    if (userErr) {
      console.error("[exportFlashPickupCsv tb_users] failed", {
        code: userErr.code,
        message: userErr.message,
      });
    }
    for (const u of (userData ?? []) as unknown as UserCompanyRow[]) {
      userCompanyById.set(u.userID, String(u.userCompany ?? ""));
    }
  }

  // ── Build the data rows in the Flash recipient shape ──
  const dataLines: string[] = rows.map((r) => {
    const userId = (r.userid ?? "").trim();
    const isCod = toNum(r.paymethod) === 2;

    // COD amount = the customer collect total, computed by the SINGLE-SOURCE
    // helper, for paymethod='2' ONLY. Prepaid → blank (no phantom COD).
    let cod = "";
    if (isCod) {
      const collectRow: ForwarderCollectRow = {
        fshipby: r.fshipby,
        ftransportprice: r.ftransportprice,
        paymethod: r.paymethod,
        faddressdistrict: r.faddressdistrict,
        ftotalprice: r.ftotalprice,
        fpriceupdate: r.fpriceupdate,
        fshippingservice: r.fshippingservice,
        pricecrate: r.pricecrate,
        ftransportpricechnthb: r.ftransportpricechnthb,
        priceother: r.priceother,
        fdiscount: r.fdiscount,
      };
      const { total } = computeForwarderCollectTotal([collectRow], {
        userId,
        userCompany: userCompanyById.get(userId) ?? "",
      });
      cod = String(Math.round(total));
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
