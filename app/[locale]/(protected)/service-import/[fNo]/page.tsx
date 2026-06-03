import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { legacyMemberUrl } from "@/lib/legacy-image";
import { ServiceImportEditShipByForm } from "./service-import-edit-ship-by-form";
import { ServiceImportEditAddressForm } from "./service-import-edit-address-form";
import { ServiceImportPayButton } from "./service-import-pay-button";
import type { ForwarderRow } from "../forwarder-row-view";

/**
 * Customer "รายการฝากนำเข้าสินค้า — รายละเอียด" (forwarder detail) screen —
 * a FAITHFUL 1:1 TRANSCRIPTION of the legacy PCS Cargo
 * `member/forwarder.php` `?page=detail&id=<ID>` branch (lines 1584-2419)
 * (D1 / ADR-0017 · faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * ── Legacy mapping ──
 * The legacy `.htaccess` (member/.htaccess) rewrites:
 *   `forwarder/<page>/<id>/` → `forwarder.php?page=<page>&id=<id>`
 * The `?page=detail&id=<n>` branch (forwarder.php L1584) renders this
 * order-detail screen; the URL the new menu / list rows use is
 * `/service-import/<n>` and the dynamic segment is `[fNo]`.
 *
 * ── Page structure (forwarder.php L1682-2247) ──
 * <title> + 3 <link>s (magnific-popup / switchery / dropify)  (L1682-1685)
 *   - the screen-local <style> overrides              (L1687-1699)
 *   - .app-content > .content-wrapper
 *     1. breadcrumb header (หน้าแรก / รายการฝากนำเข้าสินค้า / #<ID>) (L1707-1719)
 *     2. .content-body.pr110 > section > .row > .col-md-12 > .card.border-black
 *        > .card-content > .card-body
 *        a. header card row                              (L1748-1825)
 *           — order number + tracking + barcode (left)
 *           — status badge / "ส่งสินค้าโดย" / receipt link (right)
 *        b. 7-step process tabs (.process-model.pro2)    (L1827-1906)
 *           — visited / active per fStatus 1..7 + driver flag
 *        c. metadata row two-col                         (L1909-2124)
 *           — refOrder · fDate · fShipBy (+ inline edit form)
 *             · payMethod · fullAddress (+ inline edit form)
 *             · fTrackingTH · multi-bill warning · fPhotoEnd
 *             · driver status (left)
 *           — fTrackingCHN · transport-type · crate
 *             · fWarehouseChina · fCabinetNumber · close-date
 *             · fAmount · fProductsType · fDetail · cover photo
 *             · fNoteUser=2 admin note (right)
 *        d. (cond. fStatus>=5) cost-breakdown table     (L2126-2194)
 *           — 14 columns: count / weight / volume / rate-basis /
 *             rate / cost / adjust / crate / chnthb / transport /
 *             service / other / discount / +WHT col / net
 *           — "ชำระเงิน" button when fStatus=5
 *        e. (cond. fStatus<5) item-list table           (L2199-2229)
 *           — 5 columns: # / detail / count / weight / volume
 *        f. footer "ย้อนกลับ" button                    (L2231-2240)
 *
 * ── Data — every forwarder.php detail-branch query transcribed 1:1 ──
 * The `tb_*` schema is RLS-locked to service_role → reads go through the
 * admin client. Join key for ownership: `tb_*.userid === profile.member_code`
 * (the customer's "PR<n>" code).
 *
 *   - $row (L1661-1668) → tb_forwarder f ⋈ tb_users u ⋈ tb_promotion po
 *                         WHERE f.id=<fNo> AND u.userid=<currentUser>
 *                         — the user-ID match in the join is the ownership
 *                         gate; missing match → 404 (legacy includes 404.php).
 *                         Followed here: notFound() if the record's userid
 *                         doesn't match profile.member_code.
 *   - $row_driver2 (L1725-1739) → tb_forwarder_driver_item fdi
 *                                ⋈ tb_forwarder_driver fd
 *                                ⋈ tb_admin a
 *                                WHERE fid=<id>
 *                                (last row wins per legacy `while` loop)
 *   - $rID (L1788-1793) → tb_receipt_item WHERE fid=<id>  (receipt link)
 *   - $row_tran_th_sub (L2024-2039) → tb_forwarder_tran_th_sub  (multi-bill)
 *   - $row_driver (L2050-2056) → tb_forwarder_driver_item fdi
 *                              ⋈ tb_forwarder_driver fd
 *                              WHERE fdi.fid=<id>
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred. Otherwise the markup is byte-for-byte
 * the legacy output — same class names, same Thai labels, same order.
 *
 * ── FLAGGED — not strictly 1:1 (documented, never silently diverged) ──
 *  1. forwarder.php L1586-1659 has TWO POST handlers — `update_fShipBy`
 *     and `update_fAddress` (UPDATE tb_forwarder SET …). Both wired via
 *     <ServiceImportEditShipByForm> / <ServiceImportEditAddressForm>
 *     Client Components → updateLegacyForwarderShipBy /
 *     updateLegacyForwarderAddress Server Actions. The jQuery slide-
 *     down toggle becomes a useState open/close + an "ยกเลิก" button.
 *  2. forwarder.php L2329-2335 runs `payForwarder()` JS when `?pay=true`
 *     on the URL → that fires AJAX to fetch the pay-modal. Not reproduced.
 *  3. forwarder.php L2337-2411 SweetAlert popups (eSQL / sPay / eWallet /
 *     eCashBack / ePass / eAddress / sUpdate) need client JS not present
 *     here — kept silent (no popup).
 *  4. forwarder.php L1762 `include/barcode.php` is a server-side PNG
 *     barcode generator that doesn't exist in Pacred — rendered as the
 *     same absolute legacy URL (faithful display, no extra port work).
 *  5. The "ชำระเงิน" button (L2140) calls `payForwarder()` (AJAX to
 *     `include/pages/index/getListPayForwarder.php`) — wired via the
 *     <ServiceImportPayButton> Client Component, which opens the
 *     existing <ForwarderPayModal> seeded with this single row (the
 *     same modal /service-import's pay-bar opens for multi-row).
 *  6. forwarder.php L1672 calls `statusForwarderBadge()` (function.php
 *     L581-592) — transcribed inline below as `statusForwarderBadge()`.
 *  7. forwarder.php L1678 calls `calPriceForwarderSumCompany()`
 *     (function.php L1384-1392) — transcribed inline below.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// PHP `DATE_FORMAT(x,'%d/%m/%Y %T')` — d/m/Y H:i:s of a timestamp.
function dmyHms(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// PHP `DATE(x)` → d/m/Y of a timestamp.
function dmy(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
// PHP DateTime modify on a d/m/Y string — used for the "จะถึงไทย" range.
function modifyDmy(dmyStr: string, days: number): string {
  const m = dmyStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Legacy `statusForwarderBadge($fStatus)` — member/include/function.php L581-592.
// Bootstrap `badge badge-*` → Tailwind chips, matching the canonical
// STATUS_CHIP palette in forwarder-row-view.tsx (same tones per status).
const STATUS_BADGE_CHIP = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold";
function statusForwarderBadge(fStatus: string | null) {
  switch (fStatus) {
    case "1":
      return <span className={`${STATUS_BADGE_CHIP} bg-amber-100 text-amber-700 border-amber-200`}>รอสินค้าเข้าโกดังจีน</span>;
    case "2":
      return <span className={`${STATUS_BADGE_CHIP} bg-sky-100 text-sky-700 border-sky-200`}>สินค้าถึงโกดังจีนแล้ว</span>;
    case "3":
      return <span className={`${STATUS_BADGE_CHIP} bg-pink-100 text-pink-700 border-pink-200`}>กำลังส่งมาประเทศไทย</span>;
    case "4":
      return <span className={`${STATUS_BADGE_CHIP} bg-amber-200 text-amber-900 border-amber-300`}>สินค้าถึงประเทศไทยแล้ว</span>;
    case "5":
      return <span className={`${STATUS_BADGE_CHIP} bg-red-100 text-red-700 border-red-200`}>รอชำระเงิน</span>;
    case "6":
      return <span className={`${STATUS_BADGE_CHIP} bg-indigo-100 text-indigo-700 border-indigo-200`}>เตรียมส่ง</span>;
    case "7":
      return <span className={`${STATUS_BADGE_CHIP} bg-emerald-100 text-emerald-700 border-emerald-200`}>ส่งแล้ว</span>;
    default:
      return null;
  }
}

// Legacy `nameShipBy($fShipBy)` — function.php L91-143.
const NAME_SHIP_BY: Record<string, string> = {
  "1": "DHL Express", "2": "Flash Express", "3": "J.K. เอ็กซ์เพรส",
  "4": "Kerry Express", "5": "Nim Express", "6": "S & J ขนส่งด่วนสุพรรณบุรี",
  "7": "SB สมใจขนส่ง", "8": "SCG Express", "9": "เคพีเอ็น",
  "10": "เฟิร์ส เอ็กเพรส ขนส่ง", "11": "ไปรษณีย์ไทย", "12": "จันทร์สว่างขนส่ง",
  "13": "ธนามัย ขนส่งด่วน", "14": "บุญอนันต์ขนส่ง", "15": "พี.เจ. ด่วนอีสาน ขนส่ง",
  "16": "มะม่วงขนส่ง", "17": "วันชนะ แอนด์ วันณิสา ขนส่ง", "18": "สมพงษ์อุบลรัตน์ ขนส่ง",
  "19": "อาร์.ซี.อาร์ เพลส", "20": "ตองสอง ขนส่ง", "21": "นิ่มซี่เส็งขนส่ง 1988",
  "22": "ธนาไพศาล ขนส่ง", "23": "PL ขนส่งด่วน", "24": "J&T Express",
  "25": "มังกรทองขนส่ง 2019", "26": "PM ชลบุรี ขนส่งด่วน", "27": "ทรัพย์ปรีชา",
  "28": "พัฒนาเอ็กซ์เพลส", "29": "หาดใหญ่ทัวร์", "30": "หาดใหญ่ โอ.พี. 2012",
  "31": "อาร์.ซี.เอ็กซเพรส", "32": "สี่สหาย", "33": "แพปลา​สมบัติ​วัฒนา",
  "34": "ทวีทรัพย์ระยอง", "35": "ศิริสมบูรณ์", "36": "นิวสอง อัศวินขนส่ง",
  "37": "โชคสถาพรขนส่ง", "38": "ทรัพย์สมบูรณ์ถาวร", "39": "MNB Transport",
  "40": "หจก.โชคพูลทรัพย์ขนส่ง 2014", "41": "สิรินครขนส่ง", "42": "พาณิชย์การขนส่ง KSD",
  PCS: "รับเองโกดัง Pacred (สมุทรสาคร)", F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: "Pacred เหมาเหมา", PCSE: "Pacred Express",
};
function nameShipBy(fShipBy: string | null): string {
  return NAME_SHIP_BY[fShipBy ?? ""] ?? "ไม่พบข้อมูล";
}

// Legacy `namePayMethod($data)` — function.php L624-633.
function namePayMethod(data: string | null) {
  if (data === "2")
    return <span className="inline-flex items-center rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">ปลายทาง</span>;
  return "ต้นทาง";
}

// Legacy `nameCrate($data)` — function.php L634-643.
function nameCrate(data: string | null) {
  if (data === "1")
    return <span className="inline-flex items-center rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">ตีลังไม้</span>;
  return "ไม่ตีลังไม้";
}

// Legacy `nameWarehouseChina($fWarehouseChina)` — function.php L593-600.
function nameWarehouseChina(v: string | null): string {
  if (v === "1") return "กวางโจว";
  if (v === "2") return "อีฮู";
  return "รอตรวจสอบ";
}

// Legacy `nameProductsType($productsType)` — function.php L320-330.
function nameProductsType(v: string | null): string {
  if (v === "1") return "ทั่วไป";
  if (v === "2") return "มอก.";
  if (v === "3") return "อย.";
  if (v === "4") return "พิเศษ";
  return "รอตรวจสอบ";
}

// Legacy `nameRefPrice($refPrice)` — function.php L615-623.
function nameRefPrice(v: string | null): string {
  if (v === "1") return "น้ำหนัก";
  if (v === "2") return "ปริมาตร";
  return "ไม่พบข้อมูล";
}

// Legacy `tagPro($ID)` — function.php L1274+. Detail screen only ever
// shows the badge text — the WordPress promo links are kept (faithful).
const TAG_PRO: Record<string, { label: string; href?: string }> = {
  "1": { label: "Pro 3.15" },
  "2": { label: "Pro 4.4" },
  "3": { label: "Pro 4.25" },
  "4": { label: "Pro 5.5" },
  "5": { label: "Pro 5.15" },
  "6": { label: "Pro 6.6" },
  // Legacy promo pages on pcscargo.co.th — rewritten to the internal
  // Pacred import-china landing page (closest equivalent until Pacred
  // ships its own promo pages). Customer stays inside Pacred.
  "7": { label: "Pro 6.25", href: "/services/import-china" },
  "8": { label: "Pro 7.7", href: "/services/import-china" },
  "9": { label: "Pro 7.25", href: "/services/import-china" },
  "10": { label: "Pro 8.8", href: "/services/import-china" },
  "11": { label: "Pro 8.25", href: "/services/import-china" },
  "12": { label: "Pro 9.9", href: "/services/import-china" },
};
function TagPro({ id }: { id: string | null }) {
  if (!id || !TAG_PRO[id]) return null;
  const p = TAG_PRO[id];
  const chip =
    "ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200 align-middle";
  return (
    <>
      {" "}
      {p.href ? (
        <a href={p.href} target="_blank" rel="noreferrer">
          <span className={chip}>{p.label}</span>
        </a>
      ) : (
        <span className={chip}>{p.label}</span>
      )}
    </>
  );
}

// Legacy `convertIMGCHN($url,$size)` — function.php L1414+. The cover
// photo URL/filename → displayable URL.
function convertIMGCHN(url: string | null): string {
  if (!url || url === "") return "/legacy/pcs/shops/default.png";
  const u = url
    .replace("?x-oss-process=style/alsy", "")
    .replace("?x-oss-process=style/tbsy", "")
    .replace("_250x250.jpg", "");
  if (u.includes("/")) {
    // Old data may store full legacy URLs — re-resolve through the
    // Supabase mirror so customer-visible URLs never leak the legacy host.
    const legacyMatch = u.match(/pcscargo\.co\.th\/member\/(.+)$/);
    if (legacyMatch) return legacyMemberUrl(legacyMatch[1]);
    return u;
  }
  // a bare filename — legacy stores forwarder covers under images/shops/
  return legacyMemberUrl(`images/shops/${u}`);
}

// Legacy `calPriceForwarderSumCompany(...)` — function.php L1384-1392.
function calPriceForwarderSumCompany(
  fUserCompany: string | null,
  fPriceUpdate: number,
  fTotalPrice: number,
  fTransportPrice: number,
  fShippingService: number,
  fDiscount: number,
  priceCrate: number,
  fTransportPriceChnThb: number,
  priceOther: number,
): number {
  let pricePayAll =
    fPriceUpdate +
    fTotalPrice +
    fTransportPrice +
    fShippingService +
    priceCrate +
    fTransportPriceChnThb +
    priceOther -
    fDiscount;
  if (fUserCompany === "1") {
    pricePayAll = pricePayAll - pricePayAll * 0.01;
  }
  return pricePayAll;
}

// The 7-step process tabs (forwarder.php L1827-1906). The legacy emits
// a per-`fStatus` `<li>` cluster — encoded here as a per-step state
// machine to keep the markup identical.
type StepState = "" | "visited" | "active";
function computeSteps(fStatus: string | null, fidDriver: 0 | 1): StepState[] {
  // index 0..6 → step 1..7 (รอเข้าโกดังจีน / ถึงโกดังจีน / กำลังส่งมาไทย /
  //   สินค้าถึงไทย / รอชำระเงิน / เตรียมส่ง / ส่งแล้ว) PLUS a 6.1 sub-step
  //   between 6 and 7 (กำลังจัดส่ง — driven by FID_driver2 flag).
  // Modelled as 8 steps: indices 0..6 = step 1..6 / step 6.1 / step 7.
  const s = Number(fStatus);
  if (s === 1) return ["active", "", "", "", "", "", "", ""];
  if (s === 2) return ["visited", "active", "", "", "", "", "", ""];
  if (s === 3) return ["visited", "visited", "active", "", "", "", "", ""];
  if (s === 4) return ["visited", "visited", "visited", "active", "", "", "", ""];
  if (s === 5) return ["visited", "visited", "visited", "visited", "active", "", "", ""];
  if (s === 6) {
    return fidDriver === 1
      ? ["visited", "visited", "visited", "visited", "visited", "visited", "active", ""]
      : ["visited", "visited", "visited", "visited", "visited", "active", "", ""];
  }
  if (s === 7) {
    return ["visited", "visited", "visited", "visited", "visited", "visited", "visited", "active"];
  }
  return ["", "", "", "", "", "", "", ""];
}

const ICON_BASE = "/legacy/pcs/assets/images/icon/forwarder/";
const STEPS = [
  { ctrl: "step1", label: "รอเข้าโกดังจีน", icon: "forwarder-1.png" },
  { ctrl: "step2", label: "ถึงโกดังจีน", icon: "forwarder-2.png" },
  { ctrl: "step3", label: "กำลังส่งมาไทย", icon: "forwarder-3.png" },
  { ctrl: "step4", label: "สินค้าถึงไทย", icon: "forwarder-4.png" },
  { ctrl: "step5", label: "รอชำระเงิน", icon: "forwarder-5.png" },
  { ctrl: "step6", label: "เตรียมส่ง", icon: "forwarder-6.png" },
  { ctrl: "step62", label: "กำลังจัดส่ง", icon: "forwarder-6.1.png" },
  { ctrl: "step7", label: "ส่งแล้ว", icon: "forwarder-7.png" },
];

export default async function ServiceImportDetailPage({
  params,
}: {
  params: Promise<{ fNo: string }>;
}) {
  const { fNo } = await params;

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const memberCode = profile.member_code ?? "";

  // forwarder.php L1660: $ID=preg_replace("/[^a-z\d]/i", '', $_GET['id']);
  // The legacy strips everything except a-z 0-9. Faithfully reproduced.
  const idClean = fNo.replace(/[^a-z\d]/gi, "");
  const idNum = Number(idClean);
  if (!Number.isFinite(idNum) || idNum <= 0) notFound();

  const admin = createAdminClient();

  // ── forwarder.php L1661-1668 ─────────────────────────────────────
  // SELECT … FROM tb_forwarder f
  //   LEFT JOIN tb_users u  ON u.userid=f.userid
  //   LEFT JOIN tb_promotion po ON po.fid=f.id
  //   WHERE f.id=<id> AND u.userid=<currentUser>
  //
  // The `u.userid=<currentUser>` clause IS the ownership gate — if it
  // doesn't match this customer, the legacy include falls through to
  // 404.php. Reproduced as `notFound()` below.
  const { data: row, error: rowErr } = await admin
    .from("tb_forwarder")
    .select(
      // tb_forwarder columns
      "id, fdate, fdateadminstatus, fstatus, fshipby, fproductstype, ftransporttype, " +
      "fwarehousechina, fcabinetnumber, fdatecontainerclose, fdatetothai, " +
      "ftrackingchn, ftrackingchn2, ftrackingth, famount, famountcount, " +
      "fdetail, fcover, fphotoend, fnote, fnoteuser, " +
      "fweight, fwidth, flength, fheight, fvolume, frefprice, frefrate, " +
      "ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, " +
      "pricecrate, ftransportpricechnthb, priceother, crate, ffreeshipping, " +
      "paymethod, faddressname, faddresslastname, faddressno, faddresssubdistrict, " +
      "faddressdistrict, faddressprovince, faddresszipcode, faddresstel, faddresstel2, " +
      "fdatestatus7, reforder, fusercompany, userid, " +
      "fpriceupdate, customrate, customratekg, customratecbm",
    )
    .eq("id", idNum)
    .maybeSingle<{
      id: number;
      fdate: string | null;
      fdateadminstatus: string | null;
      fstatus: string | null;
      fshipby: string | null;
      fproductstype: string | null;
      ftransporttype: string | null;
      fwarehousechina: string | null;
      fcabinetnumber: string | null;
      fdatecontainerclose: string | null;
      fdatetothai: string | null;
      ftrackingchn: string | null;
      ftrackingchn2: string | null;
      ftrackingth: string | null;
      famount: number;
      famountcount: string | null;
      fdetail: string | null;
      fcover: string | null;
      fphotoend: string | null;
      fnote: string | null;
      fnoteuser: string | null;
      fweight: number | string;
      fwidth: number | string;
      flength: number | string;
      fheight: number | string;
      fvolume: number | string;
      frefprice: string | null;
      frefrate: number | string;
      ftotalprice: number | string;
      ftransportprice: number | string;
      fpriceupdate: number | string;
      fdiscount: number | string;
      fshippingservice: number | string;
      pricecrate: number | string;
      ftransportpricechnthb: number | string;
      priceother: number | string;
      crate: string | null;
      ffreeshipping: string | null;
      paymethod: string | null;
      faddressname: string | null;
      faddresslastname: string | null;
      faddressno: string | null;
      faddresssubdistrict: string | null;
      faddressdistrict: string | null;
      faddressprovince: string | null;
      faddresszipcode: string | null;
      faddresstel: string | null;
      faddresstel2: string | null;
      fdatestatus7: string | null;
      reforder: string | null;
      fusercompany: string | null;
      userid: string | null;
      customrate: string | null;
      customratekg: number | string;
      customratecbm: number | string;
    }>();

  // forwarder.php L1669: if ($result->num_rows > 0) { … } else { 404 }
  // PLUS the ownership clause in the WHERE — modelled as a notFound()
  // when the row doesn't exist OR doesn't belong to the current member.
  // §0c (Wave 19): destructure error first so a transient PgBouncer
  // timeout doesn't fake-404 a real customer's shipment.
  if (rowErr) {
    console.error(`[service-import/[fNo] row lookup] fNo=${idNum} member=${memberCode}`, {
      code: rowErr.code, message: rowErr.message, details: rowErr.details, hint: rowErr.hint,
    });
    throw new Error(`Failed to load tb_forwarder (${rowErr.code}): ${rowErr.message}`);
  }
  if (!row || (row.userid ?? "") !== memberCode) notFound();

  // forwarder.php L1666: LEFT JOIN tb_promotion po ON po.fid=f.id
  // (read as a separate query — the legacy gets promoID off the same row)
  const { data: promoRow, error: promoErr } = await admin
    .from("tb_promotion")
    .select("promoid")
    .eq("fid", idNum)
    .maybeSingle<{ promoid: number | string | null }>();
  if (promoErr) {
    // Soft-fail — promotion is optional decoration; legacy uses LEFT JOIN.
    console.error(`[service-import/[fNo] tb_promotion lookup] fid=${idNum}`, { code: promoErr.code, message: promoErr.message });
  }
  const promoIdStr = promoRow ? String(promoRow.promoid) : null;

  // ── forwarder.php L976-997 / L1953-2011 — address <select> options ──
  // Used by the inline "แก้ไข ที่อยู่จัดส่ง" form (update_fAddress POST).
  // Main address first (tb_address ⋈ tb_address_main), then the rest.
  const { data: mainAddrRow, error: mainAddrErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number | string | null }>();
  if (mainAddrErr) {
    // Soft-fail — empty mainAddressId falls through to plain ordering; legacy uses LEFT JOIN.
    console.error(`[service-import/[fNo] tb_address_main lookup] memberCode=${memberCode}`, { code: mainAddrErr.code, message: mainAddrErr.message });
  }
  const mainAddressId = mainAddrRow?.addressid ?? null;
  const { data: allAddrs, error: allAddrsErr } = await admin
    .from("tb_address")
    .select(
      "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
    )
    .eq("userid", memberCode)
    .eq("addressstatus", "1");
  if (allAddrsErr) {
    // Soft-fail — empty list renders an empty address picker; mirror's legacy behaviour when SELECT returns no rows.
    console.error(`[service-import/[fNo] tb_address list] memberCode=${memberCode}`, { code: allAddrsErr.code, message: allAddrsErr.message });
  }
  type AddressOption = {
    addressid: number | string;
    label: string;
    isMain: boolean;
  };
  const addressOptions: AddressOption[] = [];
  const addrList = ((allAddrs ?? []) as Array<{
    addressid: number;
    addressname: string | null;
    addresslastname: string | null;
    addressno: string | null;
    addresssubdistrict: string | null;
    addressdistrict: string | null;
    addressprovince: string | null;
    addresszipcode: string | null;
  }>).slice();
  // Sort: main first, then by addressid asc (the legacy ORDER BY).
  let mainIdx = -1;
  for (let i = 0; i < addrList.length; i++) {
    if (
      mainAddressId != null &&
      String(addrList[i].addressid) === String(mainAddressId)
    ) {
      mainIdx = i;
      break;
    }
  }
  const sorted: typeof addrList = [];
  if (mainIdx >= 0) sorted.push(addrList[mainIdx]);
  addrList
    .filter((_, i) => i !== mainIdx)
    .sort((a, b) => Number(a.addressid) - Number(b.addressid))
    .forEach((a) => sorted.push(a));
  for (const a of sorted) {
    const parts = [
      a.addressname ?? "",
      a.addresslastname ?? "",
      a.addressno ?? "",
      "ตำบล/แขวง",
      a.addresssubdistrict ?? "",
      "อำเภอ/เขต",
      a.addressdistrict ?? "",
      "จังหวัด",
      a.addressprovince ?? "",
      a.addresszipcode ?? "",
    ].filter((s) => s !== "").join(" ");
    const isMain = mainAddressId != null &&
      String(a.addressid) === String(mainAddressId);
    addressOptions.push({
      addressid: a.addressid,
      label: isMain ? `[ที่อยู่หลัก] ${parts}` : parts,
      isMain,
    });
  }

  // forwarder.php L1725-1739: tb_forwarder_driver_item fdi
  //   ⋈ tb_forwarder_driver fd ON fdi.fdid = fd.id
  //   ⋈ tb_admin a              ON a.adminid = fd.fdadminid
  //   WHERE fdi.fid = <id>
  // Tables have no declared FKs → use parallel queries (same pattern as
  // the LIST page's tb_forwarder_driver_item lookup).
  const { data: driverItemRows, error: driverItemErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid, fdid, fdistatus")
    .eq("fid", idNum);
  if (driverItemErr) {
    // Soft-fail — driver join is decorative for the FID_driver2 flag.
    console.error(`[service-import/[fNo] tb_forwarder_driver_item lookup] fid=${idNum}`, { code: driverItemErr.code, message: driverItemErr.message });
  }
  // The legacy reads tb_forwarder_driver's fdstatus (`fd.fdStatus`)
  // for the FID_driver2 flag (L1731-1735).
  let FID_driver2: 0 | 1 = 0;
  let adminTel = "";
  let adminName = "";
  const fdIds = Array.from(
    new Set(
      ((driverItemRows ?? []) as { fdid: number }[]).map((r) => r.fdid),
    ),
  );
  if (fdIds.length > 0) {
    const { data: drvRows, error: drvErr } = await admin
      .from("tb_forwarder_driver")
      .select("id, fdadminid, fdstatus")
      .in("id", fdIds);
    if (drvErr) {
      // Soft-fail — driver info is decorative for adminTel/adminName + FID_driver2.
      console.error(`[service-import/[fNo] tb_forwarder_driver lookup] fdIds=${JSON.stringify(fdIds)}`, { code: drvErr.code, message: drvErr.message });
    }
    const adminIds = Array.from(
      new Set(
        ((drvRows ?? []) as { fdadminid: string }[]).map((r) => r.fdadminid),
      ),
    );
    const adminMap: Record<string, { adminname: string | null; admintel: string | null }> = {};
    if (adminIds.length > 0) {
      const { data: admRows, error: admErr } = await admin
        .from("tb_admin")
        .select("adminID, adminName, adminTel")
        .in("adminID", adminIds);
      if (admErr) {
        // Soft-fail — admin name/tel is decorative.
        console.error(`[service-import/[fNo] tb_admin lookup] adminIds=${JSON.stringify(adminIds)}`, { code: admErr.code, message: admErr.message });
      }
      for (const a of (admRows ?? []) as Array<{
        adminID: string;
        adminName: string | null;
        adminTel: string | null;
      }>) {
        adminMap[a.adminID] = { adminname: a.adminName, admintel: a.adminTel };
      }
    }
    for (const fd of (drvRows ?? []) as Array<{
      fdadminid: string;
      fdstatus: string | null;
    }>) {
      if (fd.fdstatus === "1") FID_driver2 = 1;
      else if (fd.fdstatus === "2") FID_driver2 = 0;
      const a = adminMap[fd.fdadminid];
      if (a) {
        adminTel = a.admintel ?? adminTel;
        adminName = a.adminname ?? adminName;
      }
    }
  }

  // forwarder.php L1786-1793: tb_receipt_item WHERE fid=<id>
  const { data: receiptRow, error: receiptErr } = await admin
    .from("tb_receipt_item")
    .select("rid")
    .eq("fid", idNum)
    .maybeSingle<{ rid: string | null }>();
  if (receiptErr) {
    // Soft-fail — receipt link is decorative (legacy uses LEFT JOIN).
    console.error(`[service-import/[fNo] tb_receipt_item lookup] fid=${idNum}`, { code: receiptErr.code, message: receiptErr.message });
  }
  const rID = receiptRow?.rid ?? null;

  // forwarder.php L2024-2039: tb_forwarder_tran_th_sub multi-bill warning
  const { data: tranThSub, error: tranThSubErr } = await admin
    .from("tb_forwarder_tran_th_sub")
    .select("ftthhid")
    .eq("fid", idNum)
    .maybeSingle<{ ftthhid: string | number | null }>();
  if (tranThSubErr) {
    // Soft-fail — multi-bill warning is decorative.
    console.error(`[service-import/[fNo] tb_forwarder_tran_th_sub lookup] fid=${idNum}`, { code: tranThSubErr.code, message: tranThSubErr.message });
  }
  let multiBillSiblings: { fID: number; fTrackingCHN: string | null }[] = [];
  if (tranThSub?.ftthhid != null) {
    // forwarder.php L2029-2031 — no FKs declared, parallel fetch:
    //   SELECT fid FROM tb_forwarder_tran_th_sub WHERE ftthhid=… AND fid<>…
    //   then join tb_forwarder.id IN (fids) for the ftrackingchn column.
    const { data: siblingIds, error: siblingErr } = await admin
      .from("tb_forwarder_tran_th_sub")
      .select("fid")
      .eq("ftthhid", tranThSub.ftthhid)
      .neq("fid", idNum);
    if (siblingErr) {
      console.error(`[service-import/[fNo] tb_forwarder_tran_th_sub siblings lookup] ftthhid=${tranThSub.ftthhid}`, { code: siblingErr.code, message: siblingErr.message });
    }
    const fids = ((siblingIds ?? []) as { fid: number }[]).map((s) => s.fid);
    if (fids.length > 0) {
      const { data: fwdRows, error: fwdErr } = await admin
        .from("tb_forwarder")
        .select("id, ftrackingchn")
        .in("id", fids);
      if (fwdErr) {
        console.error(`[service-import/[fNo] tb_forwarder siblings lookup] fids=${JSON.stringify(fids)}`, { code: fwdErr.code, message: fwdErr.message });
      }
      multiBillSiblings = ((fwdRows ?? []) as Array<{
        id: number;
        ftrackingchn: string | null;
      }>).map((r) => ({ fID: r.id, fTrackingCHN: r.ftrackingchn }));
    }
  }

  // forwarder.php L2050-2056: tb_forwarder_driver_item ⋈ tb_forwarder_driver
  const { data: driverRow, error: driverRowErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fdistatus")
    .eq("fid", idNum)
    .maybeSingle<{ fdistatus: string | null }>();
  if (driverRowErr) {
    // Soft-fail — driver status is decorative for legacy display.
    console.error(`[service-import/[fNo] tb_forwarder_driver_item secondary lookup] fid=${idNum}`, { code: driverRowErr.code, message: driverRowErr.message });
  }

  // Normalised row aliases.
  const fStatusValue = row.fstatus ?? "";
  const fShipBy = row.fshipby ?? "";
  const fAmount = row.famount;
  const fWeight = Number(row.fweight ?? 0);
  const fVolume = Number(row.fvolume ?? 0);
  const fTotalPrice = Number(row.ftotalprice ?? 0);
  const fTransportPrice = Number(row.ftransportprice ?? 0);
  const fPriceUpdate = Number(row.fpriceupdate ?? 0);
  const fDiscount = Number(row.fdiscount ?? 0);
  const fShippingService = Number(row.fshippingservice ?? 0);
  const priceCrate = Number(row.pricecrate ?? 0);
  const fTransportPriceChnThb = Number(row.ftransportpricechnthb ?? 0);
  const priceOther = Number(row.priceother ?? 0);
  const fUserCompany = row.fusercompany ?? "";

  // ── ForwarderRow projection for the <ForwarderPayModal> ──
  // The pay-button on this detail page opens the same multi-bill modal
  // used by /service-import's pay-bar, with this single row seeded.
  // Cross-RSC contract — every field plain-serializable (matches the
  // ForwarderRow type the modal already accepts from the list view).
  const payButtonRow: ForwarderRow = {
    id:                     row.id,
    fdate:                  row.fdate,
    fstatus:                row.fstatus,
    ftrackingchn:           row.ftrackingchn,
    ftrackingchn2:          row.ftrackingchn2,
    ftrackingth:            row.ftrackingth,
    ftransporttype:         row.ftransporttype,
    fshipby:                row.fshipby,
    fdetail:                row.fdetail,
    fcover:                 row.fcover,
    famount:                row.famount,
    fweight:                fWeight,
    fvolume:                fVolume,
    ftotalprice:            fTotalPrice,
    ftransportprice:        fTransportPrice,
    fpriceupdate:           fPriceUpdate,
    fdiscount:              fDiscount,
    fshippingservice:       fShippingService,
    pricecrate:             priceCrate,
    ftransportpricechnthb:  fTransportPriceChnThb,
    priceother:             priceOther,
    fusercompany:           fUserCompany,
    fcredit:                null,
    fcreditdate:            null,
    fdatestatus5:           null,
    fdatetothai:            row.fdatetothai,
    fcabinetnumber:         row.fcabinetnumber,
    fdatecontainerclose:    row.fdatecontainerclose,
    fnote:                  row.fnote,
    fnoteuser:              row.fnoteuser,
    reforder:               row.reforder ?? null,
    adminidcreator:         null,
    promoid:                promoIdStr,
  };

  // forwarder.php L1678 — total price with WHT adjustment for tax-exempt customers.
  const priceAllUser = calPriceForwarderSumCompany(
    fUserCompany,
    fPriceUpdate,
    fTotalPrice,
    fTransportPrice,
    fShippingService,
    fDiscount,
    priceCrate,
    fTransportPriceChnThb,
    priceOther,
  );

  // forwarder.php L1808-1820 — ETA range.
  const fDateToThai = row.fdatetothai;
  let etaFrom = "";
  let etaTo = "";
  if (fDateToThai && fDateToThai !== "0000-00-00") {
    const baseDmy = dmy(fDateToThai + "T00:00:00");
    if (row.ftransporttype === "1") {
      etaFrom = baseDmy;
      etaTo = modifyDmy(baseDmy, 2);
    } else {
      etaFrom = baseDmy;
      etaTo = modifyDmy(baseDmy, 4);
    }
  }

  // forwarder.php L2080-2092 — "วันที่ปิดตู้".
  let containerCloseStr = "";
  if (row.fdatecontainerclose) {
    containerCloseStr = dmy(row.fdatecontainerclose);
  } else if (fDateToThai && fDateToThai !== "0000-00-00") {
    const baseDmy = dmy(fDateToThai + "T00:00:00");
    if (row.ftransporttype === "1") {
      containerCloseStr = modifyDmy(baseDmy, -5);
    } else {
      containerCloseStr = modifyDmy(baseDmy, -12);
    }
  }

  // forwarder.php L2103-2109 — cover image resolution.
  const coverUrl = (() => {
    if (!row.fcover) return "/legacy/pcs/shops/default.png";
    if (/https|http/.test(row.fcover)) return row.fcover;
    return convertIMGCHN(row.fcover);
  })();

  const steps = computeSteps(fStatusValue, FID_driver2);

  const refOrderEl =
    row.reforder && row.reforder !== "" ? (
      <div>
        <Link href={`/service-order/${row.reforder}`}>
          <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-700 border border-sky-200">
            รายการฝากสั่งซื้อ : {row.reforder}
          </span>
        </Link>
      </div>
    ) : null;

  // forwarder.php L1764-1782 — header right column status / driver display.
  // forwarder.php L1788-1804 — receipt link (only when rID exists and
  //   fStatus>=6). The legacy emits an <a> wrapping the whole block but the
  //   button only renders when fStatus>=6 (`$row['fStatus']<6` returns nothing).

  return (
    <div className="pcs-legacy pr-forwarder-detail">
      {/* Legacy PCS theme — kept ONLY for the magnific-popup image viewer
          hook (`image-popup-vertical-fit`) + any residual legacy class.
          The page chrome below is a Tailwind rebuild (เดฟ 2026-05-30 —
          ปอน: "rebuild chrome เป็น tailwind mobile-first ห้ามแก้ relation /
          query / href / hook"). Every href/id/name/data-* + the inline
          edit forms + pay button + receipt link wiring preserved verbatim;
          only Bootstrap-4 presentation classes are swapped for Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />

      {/* Page content — Tailwind rebuild. Wrapped in `.pcs-content-pad` so
          the (protected) layout's desktop padding (sidebar + FloatingTabs
          clearance) kicks in automatically. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        {/* L1707-1719 — breadcrumb header */}
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs md:text-sm text-muted">
          <Link href="/dashboard" className="hover:text-red-600 transition-colors">
            <span className="menu-home">หน้าแรก</span>
          </Link>
          <span aria-hidden className="text-border">/</span>
          <Link href="/service-import" className="hover:text-red-600 transition-colors">
            รายการฝากนำเข้าสินค้า
          </Link>
          <span aria-hidden className="text-border">/</span>
          <span className="font-medium text-foreground">#{row.id}</span>
        </nav>

        {/* L1720 — detail card */}
        <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm p-4 md:p-6">
          {/* ── Header row ── forwarder.php L1748-1825 ── */}
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg md:text-xl font-bold text-foreground">
                ออเดอร์นำเข้าสินค้า{" "}
                <span className="text-red-600">
                  เลขที่ #{row.id}
                  <TagPro id={promoIdStr} />
                </span>
              </h3>
              {row.ftrackingchn2 && row.ftrackingchn2 !== "" ? (
                <p className="mt-1 text-base md:text-lg font-semibold text-red-600 break-all">
                  เลขแทรคกิ้ง {row.ftrackingchn2}
                </p>
              ) : (
                <p className="mt-1 text-base md:text-lg font-semibold text-red-600 break-all">
                  เลขแทรคกิ้ง {row.ftrackingchn}
                </p>
              )}
              {row.ftrackingchn &&
                /^[a-zA-Z0-9-]+$/i.test(row.ftrackingchn) && (
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="barcode-forwader"
                      alt=""
                      // TODO(barcode): legacy used the live PHP
                      // generator `member/include/barcode.php?text=...`
                      // on pcscargo.co.th — that's a live legacy
                      // server call (brand leak + dependency).
                      // Replace with a local barcode lib (e.g.
                      // bwip-js or jsbarcode) routed through a
                      // Pacred /api/barcode endpoint. Until then,
                      // hide the image — the tracking number text
                      // is rendered alongside so this is purely a
                      // visual aid.
                      src={undefined}
                      style={{ display: "none" }}
                    />
                  </div>
                )}
            </div>
            <div className="md:text-right shrink-0">
              {FID_driver2 === 1 ? (
                <>
                  <p className="flex items-center gap-2 md:justify-end text-sm md:text-base font-semibold text-foreground">
                    <b className="font-bold">สถานะ :</b>
                    <span className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-100 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-700">
                      กำลังจัดส่ง
                    </span>
                  </p>
                  {fShipBy === "PCSF" ? (
                    <p className="mt-1 text-sm text-foreground">
                      <b className="font-semibold">ส่งสินค้าโดย : </b>
                      {adminName} โทร.
                      <a href={`tel:${adminTel}`} className="text-red-600"> {adminTel}</a>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-foreground">
                      <b className="font-semibold">ส่งสินค้าโดย : </b>
                      {nameShipBy(fShipBy)}
                    </p>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-2 md:justify-end text-sm md:text-base font-semibold text-foreground">
                  <b className="font-bold">สถานะ :</b>
                  {statusForwarderBadge(fStatusValue)}
                </p>
              )}
              <div>
                {/* L1788-1804 — receipt link (only when rID is set
                    AND fStatus>=6, per the legacy `$row['fStatus']<6`
                    branch which renders nothing). */}
                {rID && Number(fStatusValue) >= 6 && (
                  /* Legacy linked to pcscargo.co.th/member/printReceiptF.php
                     — rewritten to the internal Pacred print route
                     /freight/receipts/print/{rID} so the customer
                     stays inside Pacred (no bounce to legacy site). */
                  <a
                    href={`/freight/receipts/print/${rID}?type=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-all"
                  >
                    <i className="mdi mdi-check-circle-outline"></i>{" "}
                    ใบเสร็จรับเงิน
                  </a>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                {row.fdateadminstatus &&
                  dmyHms(row.fdateadminstatus) !==
                    "00/00/0000 00:00:00" &&
                  `อัปเดตล่าสุด : ${dmyHms(row.fdateadminstatus)} น.`}
              </p>
              {etaFrom !== "" && (
                <p className="mt-1 text-sm text-foreground">
                  จะมาถึงไทยประมาณ :{" "}
                  <span className="text-sky-600">
                    {etaFrom} ถึง {etaTo}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* ── 7/8-step process tracker ── forwarder.php L1826-1906 ──
              Rebuilt as a horizontal Tailwind stepper. Step icon images +
              the per-step data-toggle="tab" / aria-controls hooks kept. On
              mobile it scrolls horizontally (no squash at 360px). */}
          <div className="mt-4 -mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul
              className="flex min-w-[640px] md:min-w-0"
              role="tablist"
            >
              {STEPS.map((step, i) => {
                const state = steps[i];
                const innerSpanClass =
                  state === "active" ? "active show" : "";
                const innerIconClass =
                  state === "active" && i === 3 ? "active show" : "";
                const done = state === "visited";
                const active = state === "active";
                return (
                  <li
                    key={step.ctrl}
                    role="presentation"
                    className={`relative flex-1 flex flex-col items-center text-center px-1 ${state}`}
                  >
                    {/* connector line (behind the icon) */}
                    {i > 0 && (
                      <span
                        aria-hidden
                        className={`absolute top-5 right-1/2 left-[-50%] h-0.5 ${
                          done || active ? "bg-red-500" : "bg-border"
                        }`}
                      />
                    )}
                    <span
                      aria-controls={step.ctrl}
                      role="tab"
                      data-toggle="tab"
                      className={`relative z-10 flex flex-col items-center ${innerSpanClass}`}
                    >
                      <i
                        aria-hidden="true"
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                          active
                            ? "border-red-600 bg-red-600"
                            : done
                              ? "border-red-500 bg-red-50"
                              : "border-border bg-white dark:bg-surface"
                        } ${innerIconClass}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className={
                            step.ctrl === "step62"
                              ? "img-fluid p-img-icon p-0 h-5 w-5 object-contain"
                              : "img-fluid p-img-icon h-5 w-5 object-contain"
                          }
                          src={`${ICON_BASE}${step.icon}`}
                          alt=""
                        />
                      </i>
                      <p
                        className={`mt-1.5 text-[11px] leading-tight ${
                          active
                            ? "font-bold text-red-600"
                            : done
                              ? "font-medium text-foreground"
                              : "text-muted"
                        }`}
                      >
                        {step.label}
                      </p>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <hr className="my-4 border-t border-dashed border-border" />

                        {/* ── Metadata two-col ── forwarder.php L1909-2124 ── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                          {/* LEFT col — L1910-2064 */}
                          <div className="space-y-2.5">
                            {refOrderEl}
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">วันที่สร้าง : </b>
                              {dmyHms(row.fdate)} น.
                            </p>
                            <div className="text-sm">
                              <b className="font-semibold text-foreground">บริษัทขนส่ง : </b>
                              <ServiceImportEditShipByForm
                                forwarderId={row.id}
                                currentFShipBy={fShipBy}
                                currentLabel={nameShipBy(fShipBy)}
                                options={
                                  /* forwarder.php L1593 → `optionHShipBy2()` —
                                     legacy lists every carrier from
                                     NAME_SHIP_BY (function.php L91-143). The
                                     ZIP-gating the legacy applies is admin-
                                     only context the customer doesn't see;
                                     the customer-side dropdown enumerates the
                                     full list, mirroring the legacy fallback
                                     behaviour when no ZIP filter applies. */
                                  Object.entries(NAME_SHIP_BY).map(([code, label]) => ({
                                    code,
                                    label,
                                  }))
                                }
                                isEditable={Number(fStatusValue) < 4}
                              />
                            </div>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">การเก็บเงินค่าขนส่งในไทย : </b>
                              {namePayMethod(row.paymethod)}
                            </p>
                            <div className="text-sm">
                              <b className="font-semibold text-foreground">ที่อยู่จัดส่งสินค้า : </b>
                              <div className="mt-1 text-foreground leading-relaxed">
                                {/* forwarder.php L1663 — CONCAT 'คุณ' addressName … */}
                                คุณ{row.faddressname} {row.faddresslastname}
                                <br />
                                {row.faddressno} ตำบล/แขวง {row.faddresssubdistrict}
                                <br /> อำเภอ/เขต {row.faddressdistrict} จังหวัด{" "}
                                {row.faddressprovince} {row.faddresszipcode}
                                <br />
                                โทร. {row.faddresstel}, {row.faddresstel2}
                                <ServiceImportEditAddressForm
                                  forwarderId={row.id}
                                  options={addressOptions}
                                  isEditable={Number(fStatusValue) < 4}
                                />
                              </div>
                            </div>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">เลขพัสดุในไทย : </b>
                              {row.ftrackingth}
                            </p>
                            {multiBillSiblings.length > 0 && (
                              <div className="rounded-lg bg-red-50 border border-red-200 p-2.5">
                                <p className="text-sm font-semibold text-red-700">
                                  รายการนี้ถูกคิดค่าขนส่งในไทยรวมกับรายการดังต่อไปนี้
                                </p>
                                <div className="mt-1 space-y-0.5">
                                  {multiBillSiblings.map((s, i) => (
                                    <div key={s.fID}>
                                      <Link
                                        href={`/service-import/${s.fID}`}
                                        target="_blank"
                                        className="text-sm text-red-600 hover:underline"
                                      >
                                        {i + 1}. รายการเลขที่ #{s.fID} เลขเทรคกิ้ง :{" "}
                                        {s.fTrackingCHN}
                                      </Link>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {row.fphotoend && row.fphotoend !== "" && (
                              <div>
                                <p className="text-sm font-semibold text-foreground">
                                  ภาพถ่ายส่งสินค้า :
                                </p>
                                <a
                                  className="image-popup-vertical-fit el-link mt-1 inline-block"
                                  href={legacyMemberUrl(`images/shops/${row.fphotoend}`)}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={legacyMemberUrl(`images/shops/${row.fphotoend}`)}
                                    alt=""
                                    className="w-full max-w-[200px] rounded-lg border border-border object-cover"
                                  />
                                </a>
                              </div>
                            )}
                            {!row.fphotoend && fStatusValue === "7" && (
                              <p className="text-sm text-red-600">ยังไม่ได้ถ่ายรูป</p>
                            )}
                            {driverRow?.fdistatus === "2" && (
                              <p className="text-sm text-foreground">
                                ส่งของเวลา : {row.fdatestatus7}
                              </p>
                            )}
                          </div>

                          {/* RIGHT col — L2065-2123 */}
                          <div className="space-y-2.5 md:text-right">
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">เลขพัสดุจีน : </b>
                              <span className="text-red-600 break-all" id="text-fTrackingCHN">
                                {row.ftrackingchn}
                              </span>
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">รูปแบบขนส่ง จีน-ไทย : </b>
                              <span id="text-fTransportType">
                                {row.ftransporttype === "1"
                                  ? "ขนส่งทางรถ"
                                  : "ขนส่งทางเรือ"}
                              </span>
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">การตีลังไม้ : </b>
                              {nameCrate(row.crate)}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">โกดังประเทศจีน : </b>
                              {nameWarehouseChina(row.fwarehousechina)}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">เลขที่ตู้ : </b>
                              {row.fcabinetnumber}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">วันที่ปิดตู้ : </b>
                              {containerCloseStr}
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">จำนวน : </b>
                              {fAmount} กล่อง
                            </p>
                            <p className="text-sm text-foreground">
                              <b className="font-semibold">ประเภทสินค้า : </b>
                              {nameProductsType(row.fproductstype)}
                            </p>
                            <div className="rounded-lg border border-border bg-surface-alt/40 p-3 md:text-left">
                              <p className="text-sm text-foreground">
                                {row.fdetail}
                              </p>
                              <a
                                className="image-popup-vertical-fit el-link mt-2 inline-block"
                                href={coverUrl}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={coverUrl}
                                  alt=""
                                  className="w-full max-w-[200px] rounded-lg border border-border object-cover"
                                />
                              </a>
                            </div>
                            {row.fnoteuser === "2" && row.fnote && row.fnote !== "" && (
                              <div className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white md:text-left">
                                **หมายเหตุ : {row.fnote}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Cost / item table ── forwarder.php L2125-2229 ── */}
                        {Number(fStatusValue) >= 5 ? (
                          <>
                            <hr className="my-4 border-t border-dashed border-border" />
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <h4 className="text-base md:text-lg font-bold text-red-600">
                                รายละเอียดสินค้า
                              </h4>
                              {fStatusValue === "5" && (
                                <div className="md:text-right">
                                  <ServiceImportPayButton
                                    row={payButtonRow}
                                    isJuristic={fUserCompany === "1"}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Mobile: stacked cost card (md:hidden) — same
                                figures as the desktop table, definition-list
                                style so it never h-scrolls at 360px. */}
                            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-surface-alt/40 p-3 text-sm md:hidden">
                              <dt className="text-muted">จำนวนกล่อง</dt>
                              <dd className="text-right font-medium tabular-nums">{fAmount}</dd>
                              <dt className="text-muted">น้ำหนัก</dt>
                              <dd className="text-right font-medium tabular-nums">{fWeight} kg.</dd>
                              <dt className="text-muted">ปริมาตรรวม</dt>
                              <dd className="text-right font-medium tabular-nums">{fVolume}</dd>
                              <dt className="text-muted">คิดราคาตาม</dt>
                              <dd className="text-right font-medium">{nameRefPrice(row.frefprice)}</dd>
                              <dt className="text-muted">เรทนำเข้า</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(Number(row.frefrate ?? 0))}</dd>
                              <dt className="text-muted">ค่านำเข้าจีน-ไทย</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fTotalPrice)}</dd>
                              <dt className="text-muted">ค่าสินค้า เพิ่ม/ลด</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fPriceUpdate)}</dd>
                              <dt className="text-muted">ค่าตีลัง</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(priceCrate)}</dd>
                              <dt className="text-muted">ค่าขนส่งจีน+</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fTransportPriceChnThb)}</dd>
                              <dt className="text-muted">ค่าขนส่งไทย</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fTransportPrice)}</dd>
                              <dt className="text-muted">ค่าบริการ</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fShippingService)}</dd>
                              <dt className="text-muted">ค่าอื่นๆ</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(priceOther)}</dd>
                              <dt className="text-muted">ส่วนลด</dt>
                              <dd className="text-right font-medium tabular-nums">฿{numberFormat2(fDiscount)}</dd>
                              {fUserCompany === "1" && (
                                <>
                                  <dt className="text-muted">LESS WITHHOLDING TAX 1%</dt>
                                  <dd className="text-right font-medium tabular-nums">
                                    ฿
                                    {numberFormat2(
                                      (fTotalPrice +
                                        fTransportPrice +
                                        fPriceUpdate +
                                        fShippingService +
                                        fTransportPriceChnThb +
                                        priceCrate +
                                        priceOther -
                                        fDiscount) *
                                        0.01,
                                    )}
                                  </dd>
                                </>
                              )}
                              <dt className="font-semibold text-foreground border-t border-border pt-2">ราคารวม</dt>
                              <dd className="text-right font-bold tabular-nums text-red-600 border-t border-border pt-2">
                                ฿{numberFormat2(priceAllUser)}
                              </dd>
                            </dl>

                            {/* Desktop: full 14/15-column cost table. */}
                            <div className="mt-3 hidden md:block overflow-x-auto rounded-xl border border-border">
                              <table
                                id="myTable"
                                className="dataTable w-full text-sm border-collapse"
                              >
                                <thead>
                                  <tr className="text-center bg-surface-alt">
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">
                                      จำนวน
                                      <br />
                                      กล่อง
                                    </th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">น้ำหนัก</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ปริมาตรรวม</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">คิดราคาตาม</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">เรทนำเข้า</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ค่านำเข้าจีน-ไทย</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ค่าสินค้า เพิ่ม/ลด</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ค่าตีลัง</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ค่าขนส่งจีน+</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ค่าขนส่งไทย</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ค่าบริการ</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ค่าอื่นๆ</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ส่วนลด</th>
                                    {fUserCompany === "1" && (
                                      <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">
                                        LESS
                                        <br /> WITHHOLDING <br />
                                        TAX 1%
                                      </th>
                                    )}
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ราคารวม</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-foreground">
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fAmount}</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fWeight} kg.</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fVolume}</td>
                                    <td className="px-2 py-2 text-center border-b border-border">
                                      {nameRefPrice(row.frefprice)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(Number(row.frefrate ?? 0))}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fTotalPrice)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fPriceUpdate)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(priceCrate)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fTransportPriceChnThb)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fTransportPrice)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fShippingService)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(priceOther)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      ฿{numberFormat2(fDiscount)}
                                    </td>
                                    {fUserCompany === "1" && (
                                      <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                        ฿
                                        {numberFormat2(
                                          (fTotalPrice +
                                            fTransportPrice +
                                            fPriceUpdate +
                                            fShippingService +
                                            fTransportPriceChnThb +
                                            priceCrate +
                                            priceOther -
                                            fDiscount) *
                                            0.01,
                                        )}
                                      </td>
                                    )}
                                    <td className="px-2 py-2 text-right tabular-nums font-bold text-red-600 border-b border-border">
                                      ฿{numberFormat2(priceAllUser)}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </>
                        ) : (
                          <>
                            <hr className="my-4 border-t border-dashed border-border" />
                            <h4 className="text-base md:text-lg font-bold text-red-600">
                              รายละเอียดสินค้า
                            </h4>

                            {/* Mobile: item card (md:hidden). */}
                            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-surface-alt/40 p-3 text-sm md:hidden">
                              <dt className="text-muted">#</dt>
                              <dd className="text-right font-medium">1</dd>
                              <dt className="text-muted">รายละเอียดสินค้า</dt>
                              <dd className="text-right font-medium break-words">{row.fdetail}</dd>
                              <dt className="text-muted">จำนวนกล่อง</dt>
                              <dd className="text-right font-medium tabular-nums">{fAmount}</dd>
                              <dt className="text-muted">น้ำหนัก</dt>
                              <dd className="text-right font-medium tabular-nums">{fWeight} kg.</dd>
                              <dt className="text-muted">ปริมาตรรวม</dt>
                              <dd className="text-right font-medium tabular-nums">
                                {row.famountcount === "1"
                                  ? fVolume
                                  : fVolume * Number(fAmount)}{" "}
                                CBM
                              </dd>
                            </dl>

                            {/* Desktop: 5-column item table. */}
                            <div className="mt-3 hidden md:block overflow-x-auto rounded-xl border border-border">
                              <table
                                id="myTable"
                                className="dataTable w-full text-sm border-collapse"
                              >
                                <thead>
                                  <tr className="text-center bg-surface-alt">
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border">#</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border">รายละเอียดสินค้า</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">จำนวนกล่อง</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border">น้ำหนัก</th>
                                    <th className="px-2 py-2 font-semibold text-foreground border-b border-border whitespace-nowrap">ปริมาตรรวม</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr className="text-foreground">
                                    <td className="px-2 py-2 text-center border-b border-border">1</td>
                                    <td className="px-2 py-2 border-b border-border" title="">{row.fdetail}</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fAmount}</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">{fWeight} kg.</td>
                                    <td className="px-2 py-2 text-right tabular-nums border-b border-border">
                                      {row.famountcount === "1"
                                        ? fVolume
                                        : fVolume * Number(fAmount)}{" "}
                                      CBM
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}

                        {/* ── Footer back button ── forwarder.php L2231-2240 ── */}
                        <hr className="my-4 border-t border-border" />
                        <div className="md:text-right">
                          <Link
                            href={`/service-import?q=${fStatusValue}`}
                            className="inline-flex w-full md:w-auto items-center justify-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 active:scale-[0.98] transition-all"
                          >
                            <i className="fas fa-arrow-left"></i> ย้อนกลับ
                          </Link>
                        </div>
        </section>
        {/* forwarder.php L2252 — pay-modal target div (#list-forwarder-data) */}
        <div id="list-forwarder-data"></div>
      </div>
    </div>
  );
}
