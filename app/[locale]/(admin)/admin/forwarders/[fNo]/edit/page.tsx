/**
 * /admin/forwarders/[fNo]/edit — THE edit page (2026-06-04 ภูม UX F1 final).
 *
 * Detail = READ-ONLY. /edit = ALL the inline [แก้ไข] buttons + status
 * pipeline + payment. This matches legacy PCS `update.php` which is a
 * single edit page with all inline edits in it (faithful to the source).
 *
 * ── Layout (mirrors PCS update.php order):
 *   1. Breadcrumb + PCS-style header (#fNo · status · source · last-update + action links)
 *   2. 8-step pipeline timeline
 *   3. 2-col data display WITH per-field inline [แก้ไข] buttons
 *      (Edit*Field components from forwarder-inline-edits.tsx are interleaved
 *      next to their sibling read-only data fields — 10 inline editors total:
 *      userid · pallet · transport · crate · ship-by · pay-method · tracking-chn ·
 *      date-close · amount-count · bill-to · per PCS L514-839 verbatim handlers)
 *   4. Driver-assign collapsible (auto-open at fstatus=6 เตรียมส่ง)
 *   5. Items table (line-item view from forwarder-items-table)
 *   6. PRIMARY ACTION (always-open): TbForwarderActionPanel
 *      — อัปเดตสถานะ + ตู้ + Tracking (LEFT) · บันทึกหมายเหตุ + แจ้งเตือน (RIGHT)
 *        2-col grid (ภูม UX F1 Issue 2 — don't stack-wrap; side-by-side)
 *   7. PAYMENT (when isPayable): TbForwarderPaymentPanel
 *      — หักกระเป๋า / mark paid / etc.
 *   8. Bottom nav (back-to-detail + back-to-list)
 *
 * Legacy source columns mapped (per legacy update.php / detail.php):
 *   - refOrer source tag (L358-360 update.php) ← adminidcreator/reforder
 *   - sale badge (L517) ← tb_users.adminIDSale
 *   - fUserID (L526-544 update_fUserID) inline edit, TYPE-CONFIRM
 *   - fpallet (L554-568 update_fPallet) inline edit
 *   - paymethod (L588-604 update_fPayMethod) inline edit
 *   - fcrate (L570-586 update_fCrate) inline edit
 *   - fshipby (L606-623 update_fShipBy) inline edit
 *   - fullAddress (L631-665) read-only + address re-pick panel
 *   - ftrackingth "เลขพัสดุไทย" (L666)
 *   - fTrackingCHN (L725-740 update_fTrackingCHN) inline edit · gated fstatus<7
 *   - fTransportType (L743-759 update_fTransportType) inline edit
 *   - fwarehousechina (L761) read-only
 *   - fcabinetnumber linked to /report-cnt (L763-777)
 *   - fDateContainerClose + fDateToThai (L779-808 update_fDateToThai) inline edit · +5/+12 days
 *   - famount + fAmountCount (L809-828 update_fAmountCount) inline edit
 *   - fproductstype "ประเภทสินค้า" (L829)
 *   - fdetail + fcover "รายละเอียด + รูป" (L830-839)
 *
 * 2026-06-04 history:
 *   - morning: put ForwarderInlineEdits + driver-assign on detail page → bad
 *   - afternoon: moved to /edit as standalone "ตั้งค่ารายการ" section → bad
 *   - evening (THIS): per ภูม UX F1 Issues 1+2+3 — interleaved per-field
 *     [แก้ไข] inline into the 2-col data blocks (no standalone duplicate
 *     section), split status-vs-note forms into 2-col grid, added "ยังไม่
 *     ใส่ราคา" hint when ftotalprice=0. ภูม verbatim flag:
 *     "กรอบเหลือง...มันควรไปอยู่ในชุดกรอบน้ำเงินเลย" +
 *     "อัปเดตสถานะ...แบ่งหน้าคนละครึ่งกับบันทึกหมายเหตุไปเลย".
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft, Package, Warehouse, Truck, Plane, CheckCircle2, Clock,
  Pencil, ExternalLink, Eye, ChevronDown,
} from "lucide-react";
import Image from "next/image";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";

import { TbForwarderActionPanel } from "../tb-action-panel";
// 2026-06-05 (ภูม flag — "ไหนวะ ไม่เห็นมีอะไรเพิ่ม"): the AdminForwarderEditForm
// component was extended by the legacy-port agent (4 new sections incl. warehouse
// dropdowns + custom-rate override + cost adders + live calc preview) but the
// page.tsx never imported it — so the component sat orphan + ภูม saw zero change
// on /admin/forwarders/[fNo]/edit. Wiring it in below as §4.6.
import { AdminForwarderEditForm } from "./edit-form";
import { TbForwarderPaymentPanel } from "../tb-payment-panel";
// ForwarderItemsTable removed 2026-06-05 PM (ภูม flag): legacy doesn't have
// the per-shop-board section · its 3 items now live inside FreightBreakdownTable.
import { FreightBreakdownTable } from "./freight-breakdown-table";
import {
  // 2026-06-04 ภูม UX F1 Issue 1 — individual field components, interleaved
  // inline next to their sibling data fields in the 2-col data blocks below
  // (no more standalone "ตั้งค่ารายการ (แก้ไขรายฟิลด์)" panel).
  EditUserIdField,
  EditPalletField,
  EditCrateField,
  EditPayMethodField,
  EditShipByField,
  EditBillToField,
  EditTrackingChnField,
  EditTransportTypeField,
  EditDateCloseField,
  EditAmountCountField,
} from "../forwarder-inline-edits";
import { TbForwarderDriverAssignPanel, type DriverAssignmentState } from "../tb-driver-assign-panel";

export const dynamic = "force-dynamic";

type RawForwarderRow = {
  id:                number;
  fidorco:           string | null;
  userid:            string;
  fstatus:           string;
  ftransporttype:    string;
  fwarehousechina:   string;
  fwarehousename:    string;
  fcabinetnumber:    string | null;
  ftrackingchn:      string | null;
  ftrackingth:       string | null;
  fshipby:           string | null;
  famount:           number | null;
  famountcount:      string | null;
  fdetail:           string | null;
  fcover:            string | null;
  fweight:           number | string | null;
  fwidth:            number | string | null;
  flength:           number | string | null;
  fheight:           number | string | null;
  fvolume:           number | string | null;
  fproductstype:     string | null;
  frefprice:         string | null;
  frefrate:          number | string | null;
  fnote:             string | null;
  fnoteuser:         string | null;
  ftotalprice:       number | string | null;
  fpriceupdate:      number | string | null;
  fdiscount:         number | string | null;
  priceother:        number | string | null;
  // 2026-06-05 (ภูม flag) — legacy update.php parity columns. All exist
  // on tb_forwarder per migration 0081; previously not read because the
  // legacy-port EditForm wasn't wired into this page.
  customrate:           string | null;
  customratekg:         number | string | null;
  customratecbm:        number | string | null;
  ftransportprice:      number | string | null;
  ftransportpricechnthb: number | string | null;
  fshippingservice:     number | string | null;
  fdate:             string | null;
  fdatestatus2:      string | null;
  fdatestatus3:      string | null;
  fdatestatus4:      string | null;
  fdatestatus5:      string | null;
  fdatestatus6:      string | null;
  fdatestatus7:      string | null;
  fdateadminstatus:  string | null;
  fdatecontainerclose: string | null;
  // Address columns for the read-only display
  faddressname:      string | null;
  faddresslastname:  string | null;
  faddressno:        string | null;
  faddresssubdistrict: string | null;
  faddressdistrict:  string | null;
  faddressprovince:  string | null;
  faddresszipcode:   string | null;
  faddresstel:       string | null;
  faddresstel2:      string | null;
  faddressnote:      string | null;
  crate:             string | null;
  pricecrate:        number | string | null;
  fcredit:           string | null;
  paydeposit:        string | null;
  paymethod:         string | null;
  fbilltoname:       string | null;
  fpallet:           number | null;
  adminidcreator:    string | null;
  reforder:          string | null;
  tax_doc_pref:      string | null;
  // 2026-06-05 (ภูม flag · freight-breakdown table) — juristic flag
  // for WHT 1% display per legacy detail.php L374.
  fusercompany:      string | null;
  // B4 · backlog #259 (migration 0150 · 2026-06-08) — per-row cabinet
  // lock flag. true = MOMO/partner sync skips fcabinetnumber on this row.
  fcabinet_locked:   boolean | null;
};

export default async function AdminForwarderEditPage({
  params,
}: {
  params: Promise<{ fNo: string }>;
}) {
  await requireAdmin(["ops", "accounting", "super"]);

  const { fNo } = await params;
  const admin = createAdminClient();

  // ─── Resolve the row (id numeric, else fidorco) ────────────────────
  const asNumber = Number(fNo);
  const isId = Number.isFinite(asNumber) && Number.isInteger(asNumber) && asNumber > 0;

  let q = admin
    .from("tb_forwarder")
    .select(
      "id, fidorco, userid, fstatus, ftransporttype, fwarehousechina, fwarehousename, " +
      "fcabinetnumber, ftrackingchn, ftrackingth, fshipby, famount, famountcount, " +
      "fdetail, fcover, fweight, fwidth, flength, fheight, fvolume, fproductstype, frefprice, frefrate, " +
      "fnote, fnoteuser, ftotalprice, fpriceupdate, fdiscount, priceother, " +
      "fdate, fdatestatus2, fdatestatus3, fdatestatus4, fdatestatus5, fdatestatus6, fdatestatus7, " +
      "fdateadminstatus, fdatecontainerclose, " +
      "faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
      "faddressdistrict, faddressprovince, faddresszipcode, " +
      "faddresstel, faddresstel2, faddressnote, " +
      "crate, pricecrate, fcredit, paydeposit, paymethod, fbilltoname, fpallet, " +
      "adminidcreator, reforder, tax_doc_pref, " +
      // 2026-06-05 (ภูม flag · faithful-port edit-form wiring) — legacy
      // update.php override columns.
      "customrate, customratekg, customratecbm, " +
      "ftransportprice, ftransportpricechnthb, fshippingservice, fusercompany, " +
      // B4 · backlog #259 (migration 0150 · 2026-06-08) — cabinet-lock flag
      // for the TbForwarderActionPanel checkbox.
      "fcabinet_locked",
    )
    .limit(1);
  q = isId ? q.eq("id", asNumber) : q.eq("fidorco", fNo);
  const { data: row, error: rowErr } = await q.maybeSingle();
  if (rowErr) {
    console.error(`[tb_forwarder edit] failed`, { code: rowErr.code, message: rowErr.message, fNo });
  }
  if (!row) notFound();
  const r = row as unknown as RawForwarderRow;

  // ─── 2026-06-05 (ภูม flag — "พอกดใบเสร็จแล้วขึ้น 404"): resolve the
  // ── tb_receipt id (if any) that this forwarder row sits on. The link
  // ── on the header button previously sent `tb_forwarder.id` to
  // ── /admin/accounting/forwarder-invoice/[id], but that route expects
  // ── `tb_receipt.id`. Join: tb_receipt_item.fid = tb_forwarder.id →
  // ── tb_receipt_item.rid = tb_receipt.id. When no receipt exists yet
  // ── (status 4→5 not crossed · accounting hasn't billed), the button
  // ── will instead link to /forwarder-invoice/add?fid=… to create one.
  let receiptId: number | null = null;
  {
    const { data: receiptItem, error: ridErr } = await admin
      .from("tb_receipt_item")
      .select("rid")
      .eq("fid", r.id)
      .limit(1)
      .maybeSingle<{ rid: string | number | null }>();
    if (ridErr) {
      console.error(`[tb_receipt_item lookup] failed`, { code: ridErr.code, message: ridErr.message, fid: r.id });
    }
    if (receiptItem?.rid != null) {
      const { data: receiptRow, error: rcptErr } = await admin
        .from("tb_receipt")
        .select("id")
        .eq("rid", receiptItem.rid)
        .limit(1)
        .maybeSingle<{ id: number }>();
      if (rcptErr) {
        console.error(`[tb_receipt lookup] failed`, { code: rcptErr.code, message: rcptErr.message, rid: receiptItem.rid });
      }
      if (receiptRow?.id) receiptId = receiptRow.id;
    }
  }

  // ─── Customer profile (extended: email + picture + salesrep) ──────
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail, userPicture, adminIDSale, userCompany")
    .eq("userID", r.userid)
    .maybeSingle();
  if (userRowErr) {
    console.error(`[tb_users edit] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const u = userRow as unknown as {
    userID: string;
    userName: string | null;
    userLastName: string | null;
    userTel: string | null;
    userEmail: string | null;
    userPicture: string | null;
    adminIDSale: string | null;
    userCompany: string | null;
  } | null;

  // Wallet balance for the payment panel (display only — action re-reads).
  const { data: walletRow, error: walletErr } = await admin
    .from("tb_wallet")
    .select("wallettotal")
    .eq("userid", r.userid)
    .maybeSingle<{ wallettotal: number | string | null }>();
  if (walletErr) {
    console.error(`[tb_wallet edit] failed`, { code: walletErr.code, message: walletErr.message, userid: r.userid });
  }
  const walletBalance = Number(walletRow?.wallettotal ?? 0);
  const isPayable = r.fstatus === "5" || (r.fcredit ?? "").trim() === "1";

  // ─── Latest driver-assignment for this forwarder (two reads · no FK) ─
  // Drives the driver-assign collapsible (auto-open at fstatus='6' เตรียมส่ง).
  // 2026-06-04 F1: moved here from detail page (detail = READ-ONLY).
  let driverAssignment: DriverAssignmentState | null = null;
  const { data: assignItemRow, error: assignItemErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("id, fdid, fdistatus")
    .eq("fid", r.id)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: number; fdid: number; fdistatus: string | null }>();
  if (assignItemErr) {
    console.error(`[tb_forwarder_driver_item edit] failed`, { code: assignItemErr.code, message: assignItemErr.message, fid: r.id });
  }
  if (assignItemRow) {
    const { data: parentRow, error: parentErr } = await admin
      .from("tb_forwarder_driver")
      .select("id, fdadminid, fddate, fdstatus")
      .eq("id", assignItemRow.fdid)
      .maybeSingle<{ id: number; fdadminid: string | null; fddate: string | null; fdstatus: string | null }>();
    if (parentErr) {
      console.error(`[tb_forwarder_driver edit] failed`, { code: parentErr.code, message: parentErr.message, fdid: assignItemRow.fdid });
    }
    driverAssignment = {
      fdistatus:  (assignItemRow.fdistatus ?? "").trim(),
      batchId:    assignItemRow.fdid,
      driverCode: parentRow?.fdadminid ?? null,
      assignedAt: parentRow?.fddate ?? null,
      batchOpen:  (parentRow?.fdstatus ?? "").trim() === "1",
    };
  }

  // ─── Resolve cover image + customer avatar via legacy URL resolver ───
  const coverHref = r.fcover && r.fcover.trim() !== ""
    ? (r.fcover.startsWith("http") ? r.fcover : await resolveLegacyUrl(r.fcover, "cover"))
    : null;
  const customerAvatar = await resolveLegacyUrl(u?.userPicture ?? null, "profile-thumb");

  // ─── Status / warehouse / product labels ─────────────────────────────
  // 2026-06-04 ภูม UX F1 Issue 1: CRATE_LABEL / MODE_LABEL / PAYMETHOD_LABEL
  // removed — their display rows now live inside <Edit*Field/> components
  // (forwarder-inline-edits.tsx) interleaved into the 2-col data blocks.
  const STATUS_LABEL: Record<string, string> = {
    "1": "รอเข้าโกดังจีน", "2": "ถึงโกดังจีนแล้ว", "3": "กำลังส่งมาไทย",
    "4": "ถึงไทยแล้ว", "5": "รอชำระเงิน", "6": "เตรียมส่ง", "7": "ส่งแล้ว",
    "99": "พิเศษ",
  };
  const WAREHOUSE_LABEL: Record<string, string> = {
    "1": "แสง", "2": "CTT", "3": "MK", "4": "MX",
    "5": "JMF", "6": "GOGO", "7": "Cargo Center", "8": "MOMO",
  };
  const PRODUCT_TYPE_LABEL: Record<string, string> = {
    "1": "ทั่วไป", "2": "พิเศษ 1", "3": "พิเศษ 2", "4": "พิเศษ 3",
  };

  // ─── Source tag (refOrder / admin-creator / users) — matches legacy L358-360 ──
  const sourceTag: { label: string; cls: string } = r.reforder && r.reforder !== ""
    ? { label: `🛒 ฝากสั่งซื้อ : ${r.reforder}`, cls: "bg-sky-50 text-sky-700 border-sky-200" }
    : r.adminidcreator && r.adminidcreator !== ""
      ? { label: `ฝากนำเข้า : ${r.adminidcreator}`, cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : { label: "ฝากนำเข้าจาก : users", cls: "bg-gray-50 text-gray-600 border-gray-200" };

  const customerName = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || r.userid;
  // 2026-06-08 ภูม flag (URL 404 bug · 21,694 rows on prod = 45%):
  // tb_forwarder.fidorco often contains literal `/` (e.g. "MODPK301890160035-1/2"
  // · "รถ 790A/116"). Using fidorco verbatim in the URL turns the path into
  // 2 segments and the dynamic [fNo] route 404s. Use numeric id (the detail
  // + edit pages accept both id and fidorco for lookup).
  const slugForLink = String(r.id);

  const currentStatusInt = parseInt(r.fstatus, 10);

  // Compose the full delivery address (matches legacy fullAddress L633).
  const addressParts: string[] = [];
  if (r.faddressname || r.faddresslastname) {
    addressParts.push(`คุณ${r.faddressname ?? ""} ${r.faddresslastname ?? ""}`.trim());
  }
  if (r.faddressno) addressParts.push(r.faddressno);
  if (r.faddresssubdistrict) addressParts.push(`ตำบล/แขวง ${r.faddresssubdistrict}`);
  if (r.faddressdistrict) addressParts.push(`อำเภอ/เขต ${r.faddressdistrict}`);
  if (r.faddressprovince) addressParts.push(`จังหวัด ${r.faddressprovince}`);
  if (r.faddresszipcode) addressParts.push(r.faddresszipcode);
  if (r.faddresstel) addressParts.push(`โทร. ${r.faddresstel}`);
  if (r.faddresstel2) addressParts.push(r.faddresstel2);
  const fullAddress = addressParts.join(" ");

  return (
    <main className="p-4 lg:p-6 space-y-4">
      {/* ── 1. Breadcrumb ── */}
      <nav className="text-xs text-muted flex gap-1.5 items-center flex-wrap">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">รายการฝากนำเข้าสินค้า</Link>
        <span>/</span>
        <Link href={`/admin/forwarders/${slugForLink}`} className="hover:text-primary-600 font-mono">
          #{r.fidorco ?? r.id}
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">แก้ไข / อัปเดต</span>
      </nav>

      {/* ── 2. PCS-STYLE HEADER ── 2-col: order info LEFT · status+actions RIGHT */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 lg:p-5 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* LEFT — order# + tracking */}
          <div className="space-y-1">
            <p className="text-xs text-muted">ออเดอร์นำเข้าสินค้า เลขที่</p>
            <h1 className="text-2xl lg:text-3xl font-bold font-mono">
              #{r.fidorco ?? r.id}
            </h1>
            {r.ftrackingchn && (
              <p className="text-base font-semibold text-primary-600">
                <span className="text-muted text-sm font-normal mr-1">เลขแทรคกิ้ง:</span>
                <span className="font-mono">{r.ftrackingchn}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className={`rounded-full border px-2 py-0.5 text-xs ${sourceTag.cls}`}>
                {sourceTag.label}
              </span>
              {u?.adminIDSale && u.adminIDSale !== "" && (
                <span className="rounded-full border border-purple-200 bg-purple-50 text-purple-700 px-2 py-0.5 text-xs">
                  Sale: {u.adminIDSale}
                </span>
              )}
              {r.fcredit === "1" && (
                <span className="rounded-full border border-red-200 bg-red-50 text-red-700 px-2 py-0.5 text-xs">
                  💳 เครดิตสินค้า
                </span>
              )}
              {r.paydeposit === "1" && (
                <span className="rounded-full border border-orange-200 bg-orange-50 text-orange-700 px-2 py-0.5 text-xs">
                  ⚠️ รอตรวจสอบสลิป
                </span>
              )}
            </div>
          </div>

          {/* RIGHT — status + last-update + actions */}
          <div className="md:text-right space-y-1.5">
            <p className="text-xs text-muted">สถานะปัจจุบัน</p>
            <p>
              <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${
                currentStatusInt >= 7 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                currentStatusInt === 99 ? "bg-violet-50 text-violet-700 border-violet-200" :
                currentStatusInt >= 4 ? "bg-blue-50 text-blue-700 border-blue-200" :
                "bg-yellow-50 text-yellow-700 border-yellow-200"
              }`}>
                {STATUS_LABEL[r.fstatus] ?? `สถานะ ${r.fstatus}`}
              </span>
            </p>
            {r.fdateadminstatus && (
              <p className="text-xs text-muted">
                อัปเดตล่าสุด: {new Date(r.fdateadminstatus).toLocaleString("th-TH")}
              </p>
            )}
            <div className="flex md:justify-end gap-1.5 flex-wrap pt-2">
              <Link
                href={`/admin/forwarders/${slugForLink}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white dark:bg-surface-alt px-2.5 py-1.5 text-xs hover:bg-surface-alt"
              >
                <Eye className="h-3 w-3" /> ดูข้อมูล
              </Link>
              {currentStatusInt >= 3 && (
                <a
                  href={`/admin/forwarders/print?print=1&id[]=${r.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 text-blue-700 px-2.5 py-1.5 text-xs hover:bg-blue-100"
                >
                  <Package className="h-3 w-3" /> พิมพ์กล่อง
                </a>
              )}
              {/* 2026-06-05 (ภูม flag — 404 fix): if a receipt already
                  exists, link to it; otherwise (status reached the bill
                  phase but accounting hasn't issued yet) link to the
                  "ออกใบเสร็จใหม่" page with fid pre-filled. The legacy
                  flag set (>5 + not paydeposit + not fcredit) governs
                  WHO sees the button — when shown, it always goes to a
                  live URL now (never a 404). */}
              {currentStatusInt > 5 && r.paydeposit !== "1" && r.fcredit !== "1" && (
                receiptId !== null ? (
                  <a
                    href={`/admin/accounting/forwarder-invoice/${receiptId}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 text-xs hover:bg-emerald-100"
                  >
                    📄 ใบเสร็จ
                  </a>
                ) : (
                  <a
                    href={`/admin/accounting/forwarder-invoice/add?fid=${r.id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 text-amber-700 px-2.5 py-1.5 text-xs hover:bg-amber-100"
                    title="ยังไม่ได้ออกใบเสร็จ — คลิกเพื่อสร้าง"
                  >
                    📄 ออกใบเสร็จ
                  </a>
                )
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. 8-STEP PIPELINE TIMELINE ── matches legacy L432-512 +
          fstatus=6 split into "เตรียมส่ง" (no driver yet) vs
          "กำลังจัดส่ง" (driver assigned · fdistatus='') per
          legacy function.php L1225-1230 — the missing 8th pill
          flagged by ภูม 2026-06-05 PM.
          Driver-assigned = driverAssignment != null && fdistatus is empty
          (matches legacy `tb_forwarder_driver_item WHERE fdiStatus=''`). */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-3 lg:p-4 shadow-sm">
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {(() => {
            const isDriverDispatched =
              driverAssignment != null && (driverAssignment.fdistatus ?? "") === "";
            const stepRank: number =
              currentStatusInt === 6 && isDriverDispatched ? 6.5
                : currentStatusInt === 7 ? 8
                : currentStatusInt;
            const steps: Array<{ n: number; rank: number; label: string; Icon: typeof Package }> = [
              { n: 1, rank: 1,   label: "รอเข้าโกดังจีน",   Icon: Package },
              { n: 2, rank: 2,   label: "ถึงโกดังจีน",      Icon: Warehouse },
              { n: 3, rank: 3,   label: "ส่งมาไทย",          Icon: r.ftransporttype === "3" ? Plane : Truck },
              { n: 4, rank: 4,   label: "ถึงไทย",             Icon: Warehouse },
              { n: 5, rank: 5,   label: "รอชำระเงิน",        Icon: Clock },
              { n: 6, rank: 6,   label: "เตรียมส่ง",         Icon: Truck },
              { n: 7, rank: 6.5, label: "กำลังจัดส่ง",       Icon: Truck },
              { n: 8, rank: 8,   label: "ส่งแล้ว",            Icon: CheckCircle2 },
            ];
            return steps.map((step) => {
              const isCurrent = stepRank === step.rank;
              const isVisited = stepRank > step.rank;
              return (
                <div
                  key={step.n}
                  className={`flex flex-col items-center text-center p-2 rounded-lg border transition-colors ${
                    isCurrent
                      ? "border-primary-500 bg-primary-50 dark:bg-primary-950/20 ring-2 ring-primary-300"
                      : isVisited
                        ? "border-emerald-300 bg-emerald-50/40"
                        : "border-border bg-surface-alt/30 opacity-60"
                  }`}
                >
                  <step.Icon className={`h-5 w-5 mb-1 ${
                    isCurrent ? "text-primary-600" : isVisited ? "text-emerald-600" : "text-gray-400"
                  }`} />
                  <span className={`text-[10px] leading-tight ${
                    isCurrent ? "font-bold text-primary-700" : isVisited ? "text-emerald-700" : "text-muted"
                  }`}>
                    {step.label}
                  </span>
                </div>
              );
            });
          })()}
        </div>
      </section>

      {/* ── 4. 2-COL INFO DISPLAY ── matches legacy update.php L514-839 */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LEFT — customer + address + transport (legacy L515-721) */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 lg:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
            <h2 className="font-bold text-sm">ลูกค้า · ที่อยู่ · การขนส่ง</h2>
            <span className="text-[10px] text-muted">{customerName}</span>
          </div>

          {/* วันที่สร้าง */}
          {r.fdate && (
            <InfoLine label="วันที่สร้าง">
              {new Date(r.fdate).toLocaleString("th-TH")}
            </InfoLine>
          )}

          {/* จาก (avatar + name) */}
          {u && (
            <InfoLine label="จาก">
              <span className="inline-flex items-center gap-1.5">
                {customerAvatar ? (
                  <Image src={customerAvatar} alt="" width={28} height={28} className="rounded-full" unoptimized />
                ) : (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-alt text-xs">
                    {(u.userName ?? r.userid).slice(0, 1)}
                  </span>
                )}
                <Link href={`/admin/customers/${r.userid}`} className="text-sky-600 hover:underline font-medium">
                  {customerName}
                </Link>
              </span>
            </InfoLine>
          )}

          {/* รหัสสมาชิก — inline TYPE-CONFIRM edit (ภูม UX F1 Issue 1) */}
          <EditUserIdField fId={r.id} userid={r.userid} />

          {u?.userEmail && (
            <InfoLine label="อีเมล">
              <a href={`mailto:${u.userEmail}`} className="text-sky-600 hover:underline">{u.userEmail}</a>
            </InfoLine>
          )}

          {u?.userTel && (
            <InfoLine label="โทร.">
              <a href={`tel:${u.userTel}`} className="text-sky-600 hover:underline">{u.userTel}</a>
            </InfoLine>
          )}

          <div className="border-t border-border pt-2 mt-2"></div>

          {/* Location (pallet) — inline edit */}
          <EditPalletField fId={r.id} fpallet={r.fpallet} />

          {/* การตีลังไม้ — inline edit */}
          <EditCrateField fId={r.id} crate={r.crate} pricecrate={r.pricecrate} />

          {/* การเก็บเงินค่าขนส่งในไทย — inline edit */}
          <EditPayMethodField fId={r.id} paymethod={r.paymethod} />

          {/* บริษัทขนส่ง — inline edit (PCS/PCSF/PCSE preset + external) */}
          <EditShipByField fId={r.id} fshipby={r.fshipby} />

          <div>
            <p className="text-xs text-muted mb-0.5">ที่อยู่จัดส่งสินค้า:</p>
            <p className="text-sm leading-relaxed">{fullAddress || "—"}</p>
            {r.faddressnote && (
              <p className="text-xs text-muted mt-1">หมายเหตุ: {r.faddressnote}</p>
            )}
          </div>

          {/* ผู้รับใบกำกับ (Bill-to) — inline edit (Pacred extension) */}
          <EditBillToField
            fId={r.id}
            fbilltoname={r.fbilltoname}
            defaultBillTo={`${r.faddressname ?? ""} ${r.faddresslastname ?? ""}`.trim()}
          />

          <InfoLine label="เลขพัสดุไทย">
            {r.ftrackingth && r.ftrackingth !== "-" ? (
              <span className="font-mono">{r.ftrackingth}</span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </InfoLine>
        </div>

        {/* RIGHT — cabinet + tracking + dimensions + product (legacy L722-839) */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 lg:p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
            <h2 className="font-bold text-sm">ตู้ · Tracking · สินค้า</h2>
          </div>

          {/* เลขพัสดุจีน — inline edit (locked when fstatus=7) */}
          <EditTrackingChnField fId={r.id} ftrackingchn={r.ftrackingchn} fstatus={r.fstatus} />

          {/* รูปแบบขนส่ง จีน-ไทย — inline edit (รถ/เรือ/อากาศ) */}
          <EditTransportTypeField fId={r.id} ftransporttype={r.ftransporttype} />

          <InfoLine label="โกดังประเทศจีน">
            {/* 2026-06-05 (ภูม flag): blank fwarehousename ("" or null) is
                the "ยังไม่ระบุ" state · render "—" instead of an empty cell. */}
            {(r.fwarehousename && WAREHOUSE_LABEL[r.fwarehousename]) || (r.fwarehousename && r.fwarehousename.trim()) || "—"}
          </InfoLine>

          <InfoLine label="เลขที่ตู้">
            {r.fcabinetnumber ? (
              <Link
                href={`/admin/report-cnt/${r.fcabinetnumber}`}
                className="text-sky-600 hover:underline font-mono inline-flex items-center gap-1"
              >
                {r.fcabinetnumber} <ExternalLink className="h-3 w-3" />
              </Link>
            ) : (
              <span className="text-muted">— (ยังไม่ผูกตู้)</span>
            )}
          </InfoLine>

          {/* วันที่ปิดตู้ — inline edit (auto +5/+12 ETA) */}
          <EditDateCloseField fId={r.id} fdatecontainerclose={r.fdatecontainerclose} />

          <div className="border-t border-border pt-2 mt-2"></div>

          {/* จำนวน · การรวมกล่อง — inline edit */}
          <EditAmountCountField fId={r.id} famountcount={r.famountcount} famount={r.famount} />

          {(Number(r.fweight ?? 0) > 0 || Number(r.fvolume ?? 0) > 0) && (
            <InfoLine label="น้ำหนัก · CBM">
              <span className="font-mono">{Number(r.fweight ?? 0).toFixed(2)} kg</span>
              {" · "}
              <span className="font-mono">{Number(r.fvolume ?? 0).toFixed(3)} cbm</span>
            </InfoLine>
          )}

          <InfoLine label="ประเภทสินค้า">
            {PRODUCT_TYPE_LABEL[r.fproductstype ?? ""] ?? "—"}
          </InfoLine>

          {/* ยอดรวม — 2026-06-04 ภูม UX F1 Issue 3:
              ftotalprice=0 is the legitimate state for orders before admin
              enters dimensions/weight. PCS legacy update.php L1038 displays
              ฿0.00 too — the real total is calculated and shown in the cost-
              adjust matrix at status 4+ (ของถึงไทย). Add a helpful hint so
              staff don't mistake the red price for a bug. */}
          <InfoLine label="ยอดรวม">
            {Number(r.ftotalprice ?? 0) > 0 ? (
              <span className="font-bold text-base text-primary-700">
                ฿{Number(r.ftotalprice).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </span>
            ) : (
              <span className="inline-flex flex-col gap-0.5">
                <span className="font-bold text-base text-primary-700">฿0.00</span>
                <span className="text-[10px] text-muted leading-tight">
                  ยังไม่ใส่ราคา · จะใส่ตอนของถึงโกดังไทย (status 4)
                </span>
              </span>
            )}
          </InfoLine>

          {r.fdetail && (
            <div className="border-t border-border pt-2">
              <p className="text-xs text-muted mb-1">รายละเอียดสินค้า:</p>
              <p className="text-sm whitespace-pre-wrap">{r.fdetail}</p>
            </div>
          )}

          {coverHref && (
            <div className="border-t border-border pt-2">
              <p className="text-xs text-muted mb-1.5">รูปสินค้า:</p>
              <a href={coverHref} target="_blank" rel="noopener noreferrer">
                <Image
                  src={coverHref}
                  alt="cover"
                  width={200}
                  height={200}
                  unoptimized
                  className="rounded-lg border border-border max-w-[200px] h-auto"
                />
              </a>
            </div>
          )}
        </div>
      </section>

      {/* ── 4.2 INLINE EDITS — removed as a standalone section per ภูม UX F1
          Issue 1 (2026-06-04). The 10 click-to-flip fields are now
          interleaved INLINE within the 2-col "ลูกค้า · ที่อยู่ · การขนส่ง" +
          "ตู้ · Tracking · สินค้า" data blocks above (each <Edit*Field/> sits
          next to its sibling data field). Same workflow + same server
          actions; layout-only refactor. ภูม verbatim: "ก็ใส่แก้ไขด้านบน
          ไปเลยสิ". */}

      {/* ── 4.3 DRIVER ASSIGN ── auto-open ONLY when ready to dispatch (fstatus='6'
          เตรียมส่ง). Hidden in the collapsible at other statuses so it doesn't
          clutter the page — the gate is per legacy forwarder-driver.php (fstatus=6
          + paydeposit<>1). 2026-06-04 F1: moved from detail page. */}
      <details
        className="group rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden"
        open={r.fstatus === "6"}
      >
        <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none hover:bg-surface-alt/40 list-none">
          <ChevronDown className="h-4 w-4 text-muted transition-transform group-open:rotate-180 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> มอบหมายคนขับ
            </h3>
            <p className="text-xs text-muted mt-0.5 truncate">
              {r.fstatus === "6"
                ? "✅ พร้อมจัดส่ง — เลือกคนขับและเริ่ม"
                : "เปิดใช้งานเมื่อสถานะเป็น 'เตรียมส่ง' (fstatus=6)"}
            </p>
          </div>
        </summary>
        <div className="px-4 pt-1 pb-4 border-t border-border/40">
          <TbForwarderDriverAssignPanel
            fId={r.id}
            fNo={String(r.id)}
            fstatus={r.fstatus}
            paydeposit={r.paydeposit ?? ""}
            current={driverAssignment}
          />
        </div>
      </details>

      {/* ── 4.4 รายการสินค้า + freight breakdown ── 2026-06-05 PM (ภูม flag
          round 2): now ONE combined table — N per-item rows (¥ from tb_order)
          + final summary row (฿ legacy 16-col freight breakdown) +
          WHT 1% for juristic ≥ ฿1000.
          The old standalone <ForwarderItemsTable> section below was REMOVED
          per ภูม: "ตามpcs มันก็ไม่มี ต้องลบออก". */}
      <FreightBreakdownTable
        r={r}
        isJuristic={u?.userCompany === "1" || r.fusercompany === "1"}
      />

      {/* ── 4.6 LEGACY-PARITY EDIT FORM ── 2026-06-05 (ภูม flag · faithful
            port of pcs-admin/include/pages/forwarder/update.php's "กรอกรายละเอียด
            สินค้า" block):
              - 🏭 โกดัง (ต้นทางจีน · ปลายทางไทย)
              - 💰 คิดราคาแบบกำหนดเอง (customrate toggle + customratekg/cbm)
              - ➕ ค่าบริการ / ค่าใช้จ่ายเพิ่ม / ส่วนลด
              - 🧮 ตรวจสอบราคา (live calc preview — mirror calPrice.php L210-269)
            Writes via adminUpdateForwarderDimensions which now covers all
            10 new columns (Zod schema L93-152 of forwarders-edit.ts). */}
      <section className="rounded-2xl border-2 border-indigo-300 bg-indigo-50/30 dark:bg-indigo-950/20 shadow-md overflow-hidden">
        <header className="bg-indigo-500 text-white px-4 py-2.5 flex items-center gap-2">
          <span className="text-base">📝</span>
          <h2 className="text-sm font-bold">กรอกรายละเอียดสินค้า · ขนาด · ราคา · โกดัง</h2>
          <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">PCS-style</span>
        </header>
        <div className="p-3 sm:p-4">
          <AdminForwarderEditForm
            fNo={String(r.id)}
            idNumeric={r.id}
            weightInit={Number(r.fweight ?? 0)}
            widthInit={Number(r.fwidth ?? 0)}
            lengthInit={Number(r.flength ?? 0)}
            heightInit={Number(r.fheight ?? 0)}
            volumeInit={Number(r.fvolume ?? 0)}
            productTypeInit={((r.fproductstype ?? "1") as "1" | "2" | "3" | "4")}
            refPriceInit={((r.frefprice ?? "1") as "1" | "2")}
            noteInit={r.fnote ?? ""}
            itemsInit={[]}
            customRateInit={((r.customrate ?? "0") as "0" | "1")}
            customRateKgInit={Number(r.customratekg ?? 40)}
            customRateCbmInit={Number(r.customratecbm ?? 7500)}
            fDiscountInit={Number(r.fdiscount ?? 0)}
            fTransportPriceChnThbInit={Number(r.ftransportpricechnthb ?? 0)}
            priceOtherInit={Number(r.priceother ?? 0)}
            fTransportPriceInit={Number(r.ftransportprice ?? 0)}
            fShippingServiceInit={Number(r.fshippingservice ?? 0)}
            fWarehouseChinaInit={((r.fwarehousechina ?? "1") as "1" | "2")}
            fWarehouseNameInit={((r.fwarehousename ?? "1") as "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8")}
          />
        </div>
      </section>

      {/* ── 5. PRIMARY ACTION — always-open, eye-catching ── */}
      <section className="rounded-2xl border-2 border-primary-300 bg-primary-50/30 dark:bg-primary-950/20 shadow-md overflow-hidden">
        <header className="bg-primary-500 text-white px-4 py-2.5 flex items-center gap-2">
          <Pencil className="h-4 w-4 flex-shrink-0" />
          <h2 className="text-sm font-bold">อัปเดตสถานะ · ตู้ · Tracking · หมายเหตุ</h2>
          <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">ใช้บ่อย</span>
        </header>
        <div className="p-4">
          <TbForwarderActionPanel
            fId={r.id}
            fNo={String(r.id)}
            currentStatus={(r.fstatus as "1" | "2" | "3" | "4" | "5" | "6" | "7" | "99") || "1"}
            currentCabinet={r.fcabinetnumber ?? ""}
            currentTrackingTh={r.ftrackingth ?? ""}
            currentNote={r.fnote ?? ""}
            currentCabinetLocked={r.fcabinet_locked === true}
          />
        </div>
      </section>

      {/* ── 6. PAYMENT (when isPayable — fstatus=5 รอชำระ or fcredit=1) ── */}
      {isPayable && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/40 dark:bg-amber-950/20 shadow-md overflow-hidden">
          <header className="bg-amber-500 text-white px-4 py-2.5 flex items-center gap-2">
            <h2 className="text-sm font-bold">
              💰 ชำระเงิน · ฿{Number(r.ftotalprice ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </h2>
            <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">
              ยอดในกระเป๋า ฿{walletBalance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          </header>
          <div className="p-4">
            <TbForwarderPaymentPanel
              fId={r.id}
              userId={r.userid}
              customerName={`คุณ${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim()}
              amountEstimate={Number(r.ftotalprice ?? 0)}
              walletBalance={walletBalance}
              isCredit={(r.fcredit ?? "").trim() === "1"}
            />
          </div>
        </section>
      )}

      {/* ── 7. Footer nav ── */}
      <div className="flex gap-2 flex-wrap pt-2 pb-4">
        <Link
          href={`/admin/forwarders/${slugForLink}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white dark:bg-surface-alt px-3 py-2 text-xs hover:bg-surface-alt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> กลับหน้ารายละเอียด
        </Link>
        <Link
          href="/admin/forwarders"
          className="rounded-md border border-border bg-white dark:bg-surface-alt px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการฝากนำเข้า
        </Link>
      </div>

      {/* Hidden a11y note for ภูม browser-verify */}
      <p className="sr-only">
        /edit layout (ภูม UX F1 2026-06-04): header + pipeline + 2-col info + inline edits + driver assign + items table + status panel + payment.
        Status: {STATUS_LABEL[r.fstatus]}. Last update: {r.fdateadminstatus ?? "—"}.
      </p>
    </main>
  );
}

/**
 * InfoLine — small "label : value" row for the 2-col info display.
 * Matches legacy `<h5><b>label : </b>value</h5>` pattern (L546-547 etc).
 */
function InfoLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-muted text-xs flex-shrink-0">{label}:</span>
      <span className="flex-1 break-words">{children}</span>
    </div>
  );
}
