/**
 * Admin > "ใบเสร็จรับเงิน" — print page (FAITHFUL PORT)
 *
 * Wave 29 P0 #3 · 2026-05-29.
 *
 * Replaces the prior generic "พิมพ์ใบแจ้งหนี้" surface with a 1:1 port of
 * legacy `pcs-admin/printReceipt.php` (the mPDF receipt). Two pages render:
 *   - Page 1 = ต้นฉบับ (Original)
 *   - Page 2 = สำเนา (Copy)
 * Per legacy convention. Browser `window.print()` produces both pages in
 * one go via CSS `page-break-after: always`.
 *
 * Workflow stolen from legacy printReceipt.php, polished with Tailwind chrome
 * (AGENTS.md §0a — workflow logic faithful · UI is our design). Element-by-
 * element parity with the PHP HTML table:
 *
 *   ✅ PCS Cargo logo (top-left band)
 *   ✅ บริษัท พีซีเอส คาร์โก้ จำกัด + PCS Cargo CO., LTD.
 *   ✅ ใบเสร็จรับเงิน (#8BC34A green)
 *   ✅ (ไม่ใช่ใบกำกับภาษี) red — mandatory disclaimer per Thai tax rules
 *   ✅ เลขที่ {rid}
 *   ✅ ต้นฉบับ / สำเนา stamp top-right per page
 *   ✅ Issuer block (PCS Cargo · TaxID 0105560160694 · address · tel)
 *   ✅ Customer block (name + corporateNumber + corporateAddress)
 *   ✅ 7-col items table (ลำดับ · เลขที่ออเดอร์ · Tracking · กล่อง · น้ำหนัก · ปริมาตร · จำนวนเงิน)
 *   ✅ Footer summary 6-line (Total · Delivery CHN · Delivery TH · Other · Discount · WHT 1% conditional)
 *   ✅ WHT 1% — auto-shown only if isCorporate AND totalbeforewithholding ≥ 1000
 *      (legacy `printReceipt.php:385-399` logic)
 *   ✅ Thai-word grand total — readThaiBaht()
 *   ✅ 4 signature boxes (ผู้ออก · ผู้อนุมัติ · ตราประทับ + sin-wandee.jpg · ผู้รับ)
 *   ✅ On print: flip tb_receipt.statusprint='1' + stamp adminidprint + rdateprint
 *
 * NOTE on branding — receipt uses PCS Cargo Co., Ltd. (legacy issuer of
 * record), NOT Pacred (Thailand) Co., Ltd. Receipts are historic legacy
 * accounting documents; the brand-split (CLAUDE.md "don't preempt brand
 * cleanup" + AGENTS.md §3) waits for ก๊อต to formally switch the company
 * of record for tax invoices. This file matches the legacy issuer.
 */

import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import Image from "next/image";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { Printer } from "lucide-react";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

// ── Raw DB types ─────────────────────────────────────────────

type RawReceipt = {
  id:                     number;
  rid:                    string;
  refid:                  string | null;
  rdate:                  string | null;
  rdatecreate:            string | null;
  issuedate:              string | null;
  ramount:                number | string | null;
  totalbeforewithholding: number | string | null;
  rstatus:                string;
  userid:                 string;
  adminid:                string | null;
  statusprint:            string | null;
  rdateprint:             string | null;
  adminidprint:           string | null;
  corporatetype:          string | null;
  recompnumber:           string | null;
  recompname:             string | null;
  recompaddress:          string | null;
  documentissuer:         string | null;
  documentapprover:       string | null;
};

type RawReceiptItem = {
  id:  number;
  rid: string;
  fid: number;
};

type RawForwarder = {
  id:                    number;
  userid:                string;
  ftrackingchn:          string | null;
  fcabinetnumber:        string | null;
  fid:                   string | null;
  famount:               number | null;
  fweight:               number | string | null;
  fvolume:               number | string | null;
  fdate:                 string | null;
  ftotalprice:           number | string | null;
  ftransportprice:       number | string | null;
  fpriceupdate:          number | string | null;
  fshippingservice:      number | string | null;
  pricecrate:            number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother:            number | string | null;
  fdiscount:             number | string | null;
};

type RawUser = {
  userID:       string;
  userName:     string | null;
  userLastName: string | null;
  userTel:      string | null;
  userEmail:    string | null;
};

type RawAddressJoin = {
  addressno:          string | null;
  addresssubdistrict: string | null;
  addressdistrict:    string | null;
  addressprovince:    string | null;
  addresszipcode:     string | null;
  addresstel:         string | null;
};

// ── Number / format helpers ──────────────────────────────────

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function fmt2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmt5(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  });
}

function fmt0(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

/** Format `dd/MM/yyyy` (legacy mPDF format — "%d/%m/%Y"). */
function fmtDateLegacy(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

/**
 * Build customer address from tb_address + tb_address_main main row.
 * Legacy: `<addressno> ตำบล/แขวง <subdistrict> อำเภอ/เขต <district>
 *          จังหวัด <province> <zipcode> โทร. <tel>`
 */
function composeMainAddress(row: RawAddressJoin | null | undefined): string {
  if (!row) return "";
  const parts: string[] = [];
  if (row.addressno) parts.push(row.addressno);
  if (row.addresssubdistrict) parts.push(`ตำบล/แขวง ${row.addresssubdistrict}`);
  if (row.addressdistrict) parts.push(`อำเภอ/เขต ${row.addressdistrict}`);
  if (row.addressprovince) parts.push(`จังหวัด ${row.addressprovince}`);
  if (row.addresszipcode) parts.push(row.addresszipcode);
  if (row.addresstel) parts.push(`โทร. ${row.addresstel}`);
  return parts.join(" ");
}

/**
 * One full-bleed receipt page (ต้นฉบับ OR สำเนา). The whole document is two
 * of these stacked with `page-break-after: always` between them — mirrors
 * legacy mPDF AddPageByArray that pushed 2 PDF pages.
 */
function ReceiptPage({
  label,             // "ต้นฉบับ" | "สำเนา"
  rid,
  issuerAddress,     // address line for PCS Cargo issuer band
  issueDate,
  rDateCreate,
  customerName,
  customerTaxId,
  customerAddress,
  items,
  totals,
  showWht,
  whtAmount,
  grandTotal,
  grandTotalThaiWord,
  documentIssuer,
  documentApprover,
  pageNumber,
  pageCount,
}: {
  label:               string;
  rid:                 string;
  issuerAddress:       string;
  issueDate:           string;
  rDateCreate:         string;
  customerName:        string;
  customerTaxId:       string;
  customerAddress:     string;
  items: Array<{
    no:           number;
    fid:          string;
    tracking:     string;
    famount:      number;
    fweight:      number;
    fvolume:      number;
    ftotalprice:  number;
  }>;
  totals: {
    fTotal:                 number;
    fTransportCHNTHB:       number;
    fTransport:             number;
    priceOther:             number;
    fDiscount:              number;
  };
  showWht:             boolean;
  whtAmount:           number;
  grandTotal:          number;
  grandTotalThaiWord:  string;
  documentIssuer:      string;
  documentApprover:    string;
  pageNumber:          number;
  pageCount:           number;
}) {
  return (
    <div className="receipt-page bg-white text-black mx-auto" style={{ width: "210mm", minHeight: "267mm" }}>
      <div className="p-2" style={{ padding: "4mm" }}>
        {/* ── Top band: logo + name + ต้นฉบับ/สำเนา stamp ── */}
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th colSpan={2} className="text-center align-middle p-1" style={{ width: "20%" }}>
                <Image
                  src="/legacy/pcs/logo.png"
                  alt="PCS Cargo"
                  width={76}
                  height={76}
                  unoptimized
                  style={{ width: "20mm", height: "auto", display: "inline-block" }}
                />
              </th>
              <th colSpan={2} className="text-center align-middle p-1">
                <div className="text-xl font-bold leading-tight">บริษัท พีซีเอส คาร์โก้ จำกัด</div>
                <div className="text-base font-semibold leading-tight">PCS Cargo CO., LTD.</div>
              </th>
              <th colSpan={3} className="text-center align-middle p-1" style={{ background: "#f2f2f2", lineHeight: "1.35em" }}>
                <div>{label}</div>
                <div className="font-bold" style={{ color: "#8BC34A", fontSize: "1.75em" }}>
                  ใบเสร็จรับเงิน
                </div>
                <div className="font-bold" style={{ color: "red", fontSize: "0.85em" }}>
                  (ไม่ใช่ใบกำกับภาษี)
                </div>
                <div className="font-bold" style={{ fontSize: "1.1em" }}>
                  เลขที่ : {rid}
                </div>
              </th>
            </tr>
          </thead>
        </table>

        {/* ── Divider ── */}
        <hr className="border-t border-gray-400 my-1" />

        {/* ── Issuer + date + page no. ── */}
        <table className="w-full border-collapse text-base">
          <tbody>
            <tr>
              <td colSpan={2} className="text-left align-top p-1" style={{ width: "28%" }}>
                <div>ผู้ออก / issuer : </div>
                <div>เลขผู้เสียภาษี / Tax ID : </div>
                <div>ที่อยู่ / Address : </div>
                <div><br /></div>
                <div>โทรศัพท์ / tel : </div>
              </td>
              <td colSpan={3} className="text-left align-top p-1">
                <div>บริษัท พีซีเอส คาร์โก้ จำกัด</div>
                <div>0105560160694</div>
                <div>{issuerAddress}</div>
                <div>02-444-7046</div>
              </td>
              <td colSpan={1} className="text-right align-top p-1" style={{ width: "12%" }}>
                <div>วันที่ / date : </div>
                <div>หน้า / page : </div>
              </td>
              <td colSpan={1} className="text-left align-top p-1" style={{ width: "12%" }}>
                <div>{issueDate}</div>
                <div>{pageNumber}/{pageCount}</div>
              </td>
            </tr>
          </tbody>
        </table>

        <hr className="border-t border-gray-400 my-1" />

        {/* ── Customer block ── */}
        <table className="w-full border-collapse text-base">
          <tbody>
            <tr>
              <td colSpan={2} className="text-left align-top p-1" style={{ width: "28%" }}>
                <div>ลูกค้า / Customer : </div>
                <div>เลขผู้เสียภาษี / Tax ID : </div>
                <div>ที่อยู่ / Address : </div>
              </td>
              <td colSpan={5} className="text-left align-top p-1">
                <div className="font-medium">{customerName}</div>
                <div>{customerTaxId || "-"}</div>
                <div style={{ minHeight: "20mm" }}>{customerAddress || "-"}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Items table (7 columns — exact legacy widths preserved as %) ── */}
        <table className="w-full border-collapse text-base mt-2" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th className="text-center p-1 border border-gray-700" style={{ width: "7%",  background: "#cbcbcb" }}>
                ลำดับ<br />No.
              </th>
              <th className="text-center p-1 border border-gray-700" style={{ width: "11%", background: "#cbcbcb" }}>
                เลขที่ออเดอร์<br />Order No.
              </th>
              <th className="text-center p-1 border border-gray-700" style={{ width: "39%", background: "#cbcbcb" }}>
                รหัสพัสดุ<br />Tracking
              </th>
              <th className="text-center p-1 border border-gray-700" style={{ width: "7%",  background: "#cbcbcb" }}>
                จำนวน<br />กล่อง
              </th>
              <th className="text-center p-1 border border-gray-700" style={{ width: "9%",  background: "#cbcbcb" }}>
                น้ำหนัก<br />Wt./kg
              </th>
              <th className="text-center p-1 border border-gray-700" style={{ width: "11%", background: "#cbcbcb" }}>
                ปริมาตร<br />Vol./CBM
              </th>
              <th className="text-center p-1 border border-gray-700" style={{ width: "12%", background: "#cbcbcb" }}>
                ค่าขนส่ง<br />Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center p-3 border border-gray-300 text-gray-500">
                  ไม่พบรายการ
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={`${pageNumber}-${row.no}`}>
                  <td className="align-top text-center p-1 border border-gray-300">{row.no}</td>
                  <td className="align-top p-1 border border-gray-300">{row.fid}</td>
                  <td className="align-top p-1 border border-gray-300 break-words">{row.tracking}</td>
                  <td className="align-top text-right p-1 border border-gray-300">{fmt0(row.famount)}</td>
                  <td className="align-top text-right p-1 border border-gray-300">{fmt2(row.fweight)}</td>
                  <td className="align-top text-right p-1 border border-gray-300">{fmt5(row.fvolume)}</td>
                  <td className="align-top text-right p-1 border border-gray-300">{fmt2(row.ftotalprice)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Footer summary + 4-signature row (only on LAST page of this side) ── */}
        {pageNumber === pageCount && (
          <div className="mt-4 text-base">
            <hr className="border-t border-gray-400" />
            <table className="w-full border-collapse">
              <tbody>
                <tr className="text-center">
                  <th
                    className="text-left align-top p-1 border border-gray-400 font-normal"
                    style={{ width: "60%" }}
                    rowSpan={3}
                    colSpan={2}
                  >
                    <b>หมายเหตุ : </b>
                    *ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ เมื่อได้รับเงินเรียบร้อยแล้ว
                    <br />
                    **This is an electronic display of receipt data.
                    <br />
                    <div>
                      <input type="checkbox" /> เงินสด_____________________ วันที่____________________________
                    </div>
                    <div>
                      <input type="checkbox" /> เช็คธนาคาร/สาขา_____________ วันที่________ เลขที่เช็ค____________
                    </div>
                    <div>
                      <input type="checkbox" defaultChecked /> โอนเข้าธนาคาร <b>กสิกรไทย</b> เลขที่{" "}
                      <b>064-174-3836</b> วันที่ {issueDate}
                    </div>
                    <div className="text-center">
                      จำนวนเงิน {fmt2(grandTotal)} บาท ผู้รับเงิน ________________________
                    </div>
                    <div className="text-right" style={{ background: "#f2f2f2" }}>
                      <b>({grandTotalThaiWord})</b>
                    </div>
                  </th>
                  <th className="text-right align-top p-1 border border-gray-400" style={{ width: "25%" }}>
                    <div>Total</div>
                    <div>Delivery Charge CHN</div>
                    <div>Delivery Charge TH</div>
                    <div>Other</div>
                    <div>Discount</div>
                    {showWht && <div>LESS WITHHOLDING TAX 1%</div>}
                  </th>
                  <th className="text-right align-top p-1 border border-gray-400" style={{ width: "15%" }}>
                    <div>{fmt2(totals.fTotal)} บาท</div>
                    <div>{fmt2(totals.fTransportCHNTHB)} บาท</div>
                    <div>{fmt2(totals.fTransport)} บาท</div>
                    <div>{fmt2(totals.priceOther)} บาท</div>
                    <div>{fmt2(totals.fDiscount)} บาท</div>
                    {showWht && <div>{fmt2(whtAmount)} บาท</div>}
                  </th>
                </tr>
                <tr className="text-center">
                  <th className="text-right p-1 border border-gray-400">Total Amount</th>
                  <th className="text-right p-1 border border-gray-400" colSpan={1}>
                    <div className="font-bold text-xl" style={{ color: "red" }}>
                      {fmt2(grandTotal)} บาท
                    </div>
                  </th>
                </tr>
              </tbody>
            </table>

            <hr className="border-t border-gray-400 my-2" />

            {/* ── 4 signature boxes side-by-side ── */}
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <th className="text-center align-top p-2 border border-gray-400" style={{ width: "25%" }}>
                    <div>ผู้ออกเอกสาร</div>
                    <Image
                      src="/legacy/pcs/assets/images/theme/sin-wandee.jpg"
                      alt="ลายมือชื่อ"
                      width={94}
                      height={48}
                      unoptimized
                      style={{ width: "25mm", height: "auto", display: "inline-block", margin: "4px 0" }}
                    />
                    <div className="text-sm">{documentIssuer}</div>
                    <div className="text-xs text-gray-600">{rDateCreate}</div>
                  </th>
                  <th className="text-center align-top p-2 border border-gray-400" style={{ width: "25%" }}>
                    <div>ผู้อนุมัติเอกสาร</div>
                    <Image
                      src="/legacy/pcs/assets/images/theme/sin-wandee.jpg"
                      alt="ลายมือชื่อ"
                      width={94}
                      height={48}
                      unoptimized
                      style={{ width: "25mm", height: "auto", display: "inline-block", margin: "4px 0" }}
                    />
                    <div className="text-sm">{documentApprover || "_________________"}</div>
                    <div className="text-xs text-gray-600">{rDateCreate}</div>
                  </th>
                  <th className="text-center align-top p-2 border border-gray-400" style={{ width: "25%" }}>
                    <div>ตราประทับ (ผู้ขาย)</div>
                    <Image
                      src="/legacy/pcs/assets/images/theme/stamp.png"
                      alt="ตราประทับ"
                      width={94}
                      height={94}
                      unoptimized
                      style={{ width: "25mm", height: "auto", display: "inline-block", margin: "4px 0" }}
                    />
                  </th>
                  <th className="text-center align-top p-2 border border-gray-400" style={{ width: "25%" }}>
                    <div>ผู้รับเอกสาร (ลูกค้า)</div>
                    <div className="py-6"></div>
                    <div>__/__/____</div>
                  </th>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page entry ───────────────────────────────────────────────

export default async function ForwarderInvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin(["super", "accounting"]);

  const { id: idStr } = await params;
  const receiptId = parseInt(idStr, 10);
  if (!Number.isFinite(receiptId) || receiptId <= 0) notFound();

  const admin = createAdminClient();

  // ── 1. Receipt header ────────────────────────────────────
  const { data: receiptData, error: rErr } = await admin
    .from("tb_receipt")
    .select(
      "id, rid, refid, rdate, rdatecreate, issuedate, ramount, totalbeforewithholding, " +
        "rstatus, userid, adminid, statusprint, adminidprint, rdateprint, corporatetype, " +
        "recompnumber, recompname, recompaddress, documentissuer, documentapprover",
    )
    .eq("id", receiptId)
    .maybeSingle<RawReceipt>();
  if (rErr) {
    console.error(`[tb_receipt read] failed`, { code: rErr.code, message: rErr.message });
    throw new Error(`Failed to load receipt: ${rErr.message}`);
  }
  if (!receiptData) notFound();
  const receipt = receiptData;

  // ── 2. Receipt items ─────────────────────────────────────
  const { data: itemRows, error: itemsErr } = await admin
    .from("tb_receipt_item")
    .select("id, rid, fid")
    .eq("rid", receipt.rid);
  if (itemsErr) {
    console.error(`[tb_receipt_item list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }
  const receiptItems = (itemRows ?? []) as unknown as RawReceiptItem[];

  // ── 3. Forwarder rows (line items) ───────────────────────
  const fids = receiptItems.map((it) => it.fid);
  let forwarders: RawForwarder[] = [];
  if (fids.length > 0) {
    const { data: fwdRows, error: fwdErr } = await admin
      .from("tb_forwarder")
      .select(
        "id, userid, ftrackingchn, fcabinetnumber, fid, famount, fweight, fvolume, fdate, " +
          "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
          "pricecrate, ftransportpricechnthb, priceother, fdiscount",
      )
      .in("id", fids);
    if (fwdErr) {
      console.error(`[tb_forwarder list] failed`, { code: fwdErr.code, message: fwdErr.message });
    }
    forwarders = (fwdRows ?? []) as unknown as RawForwarder[];
  }
  const forwardersById = new Map(forwarders.map((f) => [f.id, f]));

  // ── 4. Customer info ─────────────────────────────────────
  const { data: userRow, error: userErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail")
    .eq("userID", receipt.userid)
    .maybeSingle<RawUser>();
  if (userErr) {
    console.error(`[tb_users read] failed`, { code: userErr.code, message: userErr.message });
  }

  // ── 5. Main address fallback (only used when no corporate address) ──
  //    Legacy: SELECT CONCAT(...) FROM tb_address_main am LEFT JOIN
  //            tb_address a ON am.addressID=a.addressID WHERE userID=?
  let mainAddressRow: RawAddressJoin | null = null;
  if (!receipt.recompaddress) {
    const { data: addrMain, error: addrErr } = await admin
      .from("tb_address_main")
      .select("addressid")
      .eq("userid", receipt.userid)
      .maybeSingle<{ addressid: number | null }>();
    if (addrErr) {
      console.error(`[tb_address_main read] failed`, { code: addrErr.code, message: addrErr.message });
    }
    if (addrMain?.addressid) {
      const { data: addr, error: addrFullErr } = await admin
        .from("tb_address")
        .select("addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel")
        .eq("addressid", addrMain.addressid)
        .maybeSingle<RawAddressJoin>();
      if (addrFullErr) {
        console.error(`[tb_address read] failed`, { code: addrFullErr.code, message: addrFullErr.message });
      }
      mainAddressRow = addr ?? null;
    }
  }

  // ── 6. Customer name / tax-id / address resolution (legacy logic) ──
  const isCorporate = receipt.corporatetype === "1" && !!receipt.recompnumber;

  const fallbackPersonalName = userRow
    ? [userRow.userName, userRow.userLastName].filter(Boolean).join(" ").trim()
    : "";

  // Name: prefer recompname (legacy reCompName), then PCS<id>+corporate, then
  // PCS<id>+personal name, then bare userid.
  const customerName = (() => {
    if (receipt.recompname && receipt.recompname.trim()) {
      return `${receipt.userid} ${receipt.recompname.trim()}`;
    }
    if (fallbackPersonalName) {
      return `${receipt.userid} ${fallbackPersonalName}`;
    }
    return receipt.userid;
  })();

  const customerTaxId = receipt.recompnumber || "-";

  const customerAddress =
    (receipt.recompaddress && receipt.recompaddress.trim())
      ? receipt.recompaddress.trim()
      : composeMainAddress(mainAddressRow);

  // ── 7. Compute totals + WHT 1% (legacy printReceipt.php:357-399) ──
  const computedItems = receiptItems
    .map((it, idx) => {
      const f = forwardersById.get(it.fid);
      if (!f) {
        return null;
      }
      const fTotalPrice           = toNumber(f.ftotalprice);
      const fTransportPrice       = toNumber(f.ftransportprice);
      const fPriceUpdate          = toNumber(f.fpriceupdate);
      const fShippingService      = toNumber(f.fshippingservice);
      const fTransportPriceCHNTHB = toNumber(f.ftransportpricechnthb);
      const priceCrate            = toNumber(f.pricecrate);
      const priceOther            = toNumber(f.priceother);
      const fDiscount             = toNumber(f.fdiscount);

      // Line total (legacy: sum of all 7 components - discount)
      const totalPrice =
        fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService +
        fTransportPriceCHNTHB + priceCrate + priceOther - fDiscount;

      return {
        idx,
        no:           idx + 1,
        fid:          f.fid ?? String(f.id),
        tracking:     f.ftrackingchn ?? "",
        famount:      toNumber(f.famount),
        fweight:      toNumber(f.fweight),
        fvolume:      toNumber(f.fvolume),
        ftotalprice:  fTotalPrice,
        // running totals contribution
        _line: {
          fTotalPrice,
          fTransport:       fTransportPrice,
          fTransportCHNTHB: fTransportPriceCHNTHB,
          priceOther:       fPriceUpdate + fShippingService + priceCrate + priceOther,
          fDiscount,
          lineTotal:        totalPrice,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const totals = computedItems.reduce(
    (acc, row) => ({
      fTotal:           acc.fTotal           + row._line.fTotalPrice,
      fTransport:       acc.fTransport       + row._line.fTransport,
      fTransportCHNTHB: acc.fTransportCHNTHB + row._line.fTransportCHNTHB,
      priceOther:       acc.priceOther       + row._line.priceOther,
      fDiscount:        acc.fDiscount        + row._line.fDiscount,
      totalLineSum:     acc.totalLineSum     + row._line.lineTotal,
    }),
    {
      fTotal:           0,
      fTransport:       0,
      fTransportCHNTHB: 0,
      priceOther:       0,
      fDiscount:        0,
      totalLineSum:     0,
    },
  );

  // ── DATA-SYNC FALLBACK (2026-05-31 sitting-H-fix · ภูม flag #4) ──
  // ภูม screenshot of FRG2605-00219 showed "ไม่พบรายการ" + Total = 0.00 even
  // though the receipt header had a real ramount. Root cause: tb_receipt_item
  // rows are missing for that receipt (likely Wave 28 PR-format pollution OR
  // a legacy migration where items were stored differently). Without items,
  // the per-line `computedItems` reduce sums to 0, and the legacy receipt
  // chrome prints blank totals — useless to staff.
  //
  // Graceful degradation: when itemCount=0 BUT the receipt header itself
  // carries a non-zero amount (the source-of-record for the money), surface
  // the header amount on the totals row + flag the data gap with an
  // amber banner (only visible on screen, not in print — staff who reprint
  // see the warning; the customer copy stays clean).
  //
  // Sources of truth for the fallback:
  //   - tb_receipt.totalbeforewithholding = pre-WHT raw sum (preferred)
  //   - tb_receipt.ramount               = post-WHT net (what customer paid)
  // Both columns are populated by auto-issue-receipt.ts at insert time, so
  // when items go missing the header still has the answer.
  const headerTotalBefore  = toNumber(receipt.totalbeforewithholding);
  const headerRamount      = toNumber(receipt.ramount);
  const itemsMissing       = computedItems.length === 0 && (headerTotalBefore > 0 || headerRamount > 0);

  // WHT 1% — legacy: only for corporate AND totalbeforewithholding ≥ 1000
  const totalBeforeWithholding = headerTotalBefore || totals.totalLineSum;
  const showWht = isCorporate && totalBeforeWithholding >= 1000;
  // When items are missing, derive WHT from the header difference instead of
  // re-applying the 1% rule (the header values are post-fact authoritative).
  const whtAmount =
    itemsMissing
      ? Math.max(0, headerTotalBefore - headerRamount)
      : showWht
        ? totals.totalLineSum * 0.01
        : 0;
  const grandTotal =
    itemsMissing
      ? headerRamount
      : totals.totalLineSum - whtAmount;
  const grandTotalThaiWord = readThaiBaht(grandTotal);

  // When items are missing, also patch the totals BREAKDOWN to put the
  // header total under "Total" (the most-prominent row) — the per-leg
  // breakdown (CHN/TH/Other/Discount) stays zero because we have no way to
  // reconstruct it without the items. Staff will see "Total = ฿N" and "all
  // other rows = ฿0" — clear signal that this receipt has missing details.
  const totalsForRender = itemsMissing
    ? {
        fTotal:           headerTotalBefore,
        fTransport:       0,
        fTransportCHNTHB: 0,
        priceOther:       0,
        fDiscount:        0,
      }
    : {
        fTotal:           totals.fTotal,
        fTransport:       totals.fTransport,
        fTransportCHNTHB: totals.fTransportCHNTHB,
        priceOther:       totals.priceOther,
        fDiscount:        totals.fDiscount,
      };

  // ── 8. Issuer address (legacy printReceipt.php:293-297 conditional) ──
  // After 2025-03-20 the new address; before, the old one.
  const today = new Date();
  const issuerAddress =
    today >= new Date("2025-03-20")
      ? "เลขที่ 12 ซอย เพชรเกษม 77 แยก 3-6 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพมหานคร 10160"
      : "เลขที่ 8 ซอย เพชรเกษม 77 แยก 3-4 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพมหานคร 10160";

  // ── 9. Pagination — 13 rows per page (legacy `$rowsPerPage = 13`) ──
  const ROWS_PER_PAGE = 13;
  const pageCount = Math.max(1, Math.ceil(computedItems.length / ROWS_PER_PAGE));
  const pages: Array<{
    pageNumber: number;
    rows: typeof computedItems;
  }> = [];
  for (let p = 0; p < pageCount; p++) {
    pages.push({
      pageNumber: p + 1,
      rows: computedItems.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE),
    });
  }

  const issueDate     = fmtDateLegacy(receipt.issuedate ?? receipt.rdatecreate);
  const rDateCreate   = fmtDateLegacy(receipt.rdatecreate);
  const documentIssuer   = receipt.documentissuer  || receipt.adminid || "-";
  const documentApprover = receipt.documentapprover || "";

  const commonProps = {
    rid:                 receipt.rid,
    issuerAddress,
    issueDate,
    rDateCreate,
    customerName,
    customerTaxId,
    customerAddress,
    totals:              totalsForRender,
    showWht:             showWht || (itemsMissing && whtAmount > 0),
    whtAmount,
    grandTotal,
    grandTotalThaiWord,
    documentIssuer,
    documentApprover,
    pageCount,
  };

  return (
    <>
      {/*
        Print stylesheet — Tailwind @media print classes plus a few custom
        rules. A4 portrait, 1.5cm margins, hide admin chrome, force a page
        break between the ต้นฉบับ side and the สำเนา side.
      */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.5cm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .receipt-page {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            page-break-after: always;
            page-break-inside: auto;
          }
          .receipt-page:last-child { page-break-after: auto; }
        }
        @media screen {
          .receipt-page {
            margin: 16px auto;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
            border: 1px solid #e5e7eb;
            border-radius: 4px;
          }
        }
      `}</style>

      <div className="min-h-screen bg-slate-100 print:bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          {/* ── Breadcrumb + actions (hidden on print) ── */}
          <div className="no-print">
            {/* 2026-05-30 ภูม flagged #7: was "ใบแจ้งหนี้ ฝากนำเข้า" —
                this page renders ใบเสร็จ (receipt) per Wave 29 pivot. */}
            <nav className="text-sm text-slate-500 mb-3">
              <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
              <span className="mx-1">/</span>
              <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
              <span className="mx-1">/</span>
              <Link href="/admin/accounting/forwarder-invoice" className="hover:text-indigo-700">
                ใบเสร็จ ฝากนำเข้า
              </Link>
              <span className="mx-1">/</span>
              <span className="text-slate-700">{receipt.rid}</span>
            </nav>

            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  ใบเสร็จรับเงิน {receipt.rid}
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                  ออกเมื่อ {issueDate} โดย {documentIssuer}
                  {receipt.statusprint === "1" && receipt.rdateprint && (
                    <> · พิมพ์ล่าสุด {fmtDateLegacy(receipt.rdateprint)} (โดย {receipt.adminidprint || "-"})</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/accounting/forwarder-invoice"
                  className="text-sm text-slate-600 hover:text-indigo-700"
                >
                  ← กลับไปรายการ
                </Link>
                <PrintButton receiptId={receipt.id}>
                  <Printer className="size-4" />
                  พิมพ์ใบเสร็จ
                </PrintButton>
              </div>
            </div>

            <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <b>ตัวอย่างก่อนพิมพ์</b> — ใบเสร็จจะออกมา <b>2 หน้า</b> (ต้นฉบับ + สำเนา) เมื่อกดพิมพ์ ·
              กดปุ่ม &ldquo;พิมพ์ใบเสร็จ&rdquo; ด้านบนเพื่อบันทึกสถานะ <code>statusPrint=1</code> และเปิดหน้าต่างพิมพ์
            </div>

            {/* 2026-05-31 sitting-H-fix #4 (ภูม): data-gap banner.
                Shows ONLY on screen (not print). Surfaces the missing
                tb_receipt_item case so staff don't print a "blank" receipt
                without knowing the breakdown is reconstructed from header. */}
            {itemsMissing && (
              <div className="mb-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                <b>⚠️ รายการพัสดุไม่พบใน tb_receipt_item</b> — ระบบจึงดึงยอดรวมจาก
                <code className="mx-1 px-1 bg-rose-100 rounded">tb_receipt.totalbeforewithholding</code>
                + <code className="mx-1 px-1 bg-rose-100 rounded">tb_receipt.ramount</code>
                มาแสดงในแถว Total / WHT / Total Amount แทน (รายละเอียดต่อ leg ขนส่งจีน-ไทย
                แสดงเป็น 0 เพราะไม่มี source).<br />
                <span className="text-rose-700 mt-1 inline-block">
                  สาเหตุที่เป็นไปได้: (1) Wave 28 PR-format pollution ·
                  (2) legacy migration ที่ tb_receipt_item ไม่ได้ port มาด้วย ·
                  (3) Wave 29 manual-create flow มี bug ตอน batch INSERT items.
                  ดูเพิ่ม <code>docs/runbook/wave-29-tb-receipt-pollution-audit.md</code>
                  หรือ query <code>tb_receipt_item WHERE rid=&lsquo;{receipt.rid}&rsquo;</code> ก่อน reprint.
                </span>
              </div>
            )}
          </div>

          {/* ── 2-side document — Originals first, then Copies ──
              Legacy printReceipt.php does the same: mPDF AddPage loop for
              ต้นฉบับ, then a second loop for สำเนา. Each side gets its own
              page-count (1/N, 2/N, ..., N/N), totalling 2N printed pages.
          */}
          {pages.map((p) => (
            <ReceiptPage
              key={`orig-${p.pageNumber}`}
              label="ต้นฉบับ"
              {...commonProps}
              pageNumber={p.pageNumber}
              items={p.rows}
            />
          ))}
          {pages.map((p) => (
            <ReceiptPage
              key={`copy-${p.pageNumber}`}
              label="สำเนา"
              {...commonProps}
              pageNumber={p.pageNumber}
              items={p.rows}
            />
          ))}
        </div>
      </div>
    </>
  );
}
