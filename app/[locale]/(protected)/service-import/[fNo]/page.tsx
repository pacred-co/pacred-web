import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

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
 * `PR<n>` + "PR Cargo" / Pacred. Otherwise the markup is byte-for-byte
 * the legacy output — same class names, same Thai labels, same order.
 *
 * ── FLAGGED — not strictly 1:1 (documented, never silently diverged) ──
 *  1. forwarder.php L1586-1659 has TWO POST handlers — `update_fShipBy`
 *     and `update_fAddress` (UPDATE tb_forwarder SET …). Render-time
 *     mutations are NOT reproduced; the inline-edit <form> + <select>
 *     markup IS transcribed verbatim, but the submit is UNWIRED
 *     (TODO(server-action)). The legacy jQuery slide-up/down for the
 *     edit form needs client JS not present here; the form renders
 *     statically (collapsed visually via inline display:none).
 *  2. forwarder.php L2329-2335 runs `payForwarder()` JS when `?pay=true`
 *     on the URL → that fires AJAX to fetch the pay-modal. Not reproduced.
 *  3. forwarder.php L2337-2411 SweetAlert popups (eSQL / sPay / eWallet /
 *     eCashBack / ePass / eAddress / sUpdate) need client JS not present
 *     here — kept silent (no popup).
 *  4. forwarder.php L1762 `include/barcode.php` is a server-side PNG
 *     barcode generator that doesn't exist in Pacred — rendered as the
 *     same absolute legacy URL (faithful display, no extra port work).
 *  5. The "ชำระเงิน" button (L2140) calls `payForwarder()` (AJAX to
 *     `include/pages/index/getListPayForwarder.php`) — the markup is
 *     rendered verbatim, the click is UNWIRED (TODO(server-action)).
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
function statusForwarderBadge(fStatus: string | null) {
  switch (fStatus) {
    case "1":
      return <span className="badge badge-danger badge-pill">รอสินค้าเข้าโกดังจีน</span>;
    case "2":
      return <span className="badge badge-warning badge-pill">สินค้าถึงโกดังจีนแล้ว</span>;
    case "3":
      return <span className="badge badge-warning badge-pill">กำลังส่งมาประเทศไทย</span>;
    case "4":
      return <span className="badge badge-info badge-pill">สินค้าถึงประเทศไทยแล้ว</span>;
    case "5":
      return <span className="badge badge-danger badge-pill">รอชำระเงิน</span>;
    case "6":
      return <span className="badge badge-info badge-pill">เตรียมส่ง</span>;
    case "7":
      return <span className="badge badge-success badge-pill">ส่งแล้ว</span>;
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
  PCS: "รับเองโกดัง PR กทม", F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: "PR เหมาเหมา", PCSE: "PR Express",
};
function nameShipBy(fShipBy: string | null): string {
  return NAME_SHIP_BY[fShipBy ?? ""] ?? "ไม่พบข้อมูล";
}

// Legacy `namePayMethod($data)` — function.php L624-633.
function namePayMethod(data: string | null) {
  if (data === "2") return <span className="text-white bg-danger">ปลายทาง</span>;
  return "ต้นทาง";
}

// Legacy `nameCrate($data)` — function.php L634-643.
function nameCrate(data: string | null) {
  if (data === "1") return <span className="text-white bg-danger">ตีลังไม้</span>;
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
  return (
    <>
      {" "}
      {p.href ? (
        <a href={p.href} target="_blank" rel="noreferrer">
          <span className="badge badge-vip badge-pill">{p.label}</span>
        </a>
      ) : (
        <span className="badge badge-vip badge-pill">{p.label}</span>
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
    if (/pcscargo\.co\.th/.test(u)) return u;
    return u;
  }
  // a bare filename — legacy stores forwarder covers under images/shops/
  return `https://pcscargo.co.th/member/images/shops/${u}`;
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
  const { data: row } = await admin
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
  if (!row || (row.userid ?? "") !== memberCode) notFound();

  // forwarder.php L1666: LEFT JOIN tb_promotion po ON po.fid=f.id
  // (read as a separate query — the legacy gets promoID off the same row)
  const { data: promoRow } = await admin
    .from("tb_promotion")
    .select("promoid")
    .eq("fid", idNum)
    .maybeSingle<{ promoid: number | string | null }>();
  const promoIdStr = promoRow ? String(promoRow.promoid) : null;

  // forwarder.php L1725-1739: tb_forwarder_driver_item fdi
  //   ⋈ tb_forwarder_driver fd ON fdi.fdid = fd.id
  //   ⋈ tb_admin a              ON a.adminid = fd.fdadminid
  //   WHERE fdi.fid = <id>
  // Tables have no declared FKs → use parallel queries (same pattern as
  // the LIST page's tb_forwarder_driver_item lookup).
  const { data: driverItemRows } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid, fdid, fdistatus")
    .eq("fid", idNum);
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
    const { data: drvRows } = await admin
      .from("tb_forwarder_driver")
      .select("id, fdadminid, fdstatus")
      .in("id", fdIds);
    const adminIds = Array.from(
      new Set(
        ((drvRows ?? []) as { fdadminid: string }[]).map((r) => r.fdadminid),
      ),
    );
    const adminMap: Record<string, { adminname: string | null; admintel: string | null }> = {};
    if (adminIds.length > 0) {
      const { data: admRows } = await admin
        .from("tb_admin")
        .select("adminid, adminname, admintel")
        .in("adminid", adminIds);
      for (const a of (admRows ?? []) as Array<{
        adminid: string;
        adminname: string | null;
        admintel: string | null;
      }>) {
        adminMap[a.adminid] = { adminname: a.adminname, admintel: a.admintel };
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
  const { data: receiptRow } = await admin
    .from("tb_receipt_item")
    .select("rid")
    .eq("fid", idNum)
    .maybeSingle<{ rid: string | null }>();
  const rID = receiptRow?.rid ?? null;

  // forwarder.php L2024-2039: tb_forwarder_tran_th_sub multi-bill warning
  const { data: tranThSub } = await admin
    .from("tb_forwarder_tran_th_sub")
    .select("ftthhid")
    .eq("fid", idNum)
    .maybeSingle<{ ftthhid: string | number | null }>();
  let multiBillSiblings: { fID: number; fTrackingCHN: string | null }[] = [];
  if (tranThSub?.ftthhid != null) {
    // forwarder.php L2029-2031 — no FKs declared, parallel fetch:
    //   SELECT fid FROM tb_forwarder_tran_th_sub WHERE ftthhid=… AND fid<>…
    //   then join tb_forwarder.id IN (fids) for the ftrackingchn column.
    const { data: siblingIds } = await admin
      .from("tb_forwarder_tran_th_sub")
      .select("fid")
      .eq("ftthhid", tranThSub.ftthhid)
      .neq("fid", idNum);
    const fids = ((siblingIds ?? []) as { fid: number }[]).map((s) => s.fid);
    if (fids.length > 0) {
      const { data: fwdRows } = await admin
        .from("tb_forwarder")
        .select("id, ftrackingchn")
        .in("id", fids);
      multiBillSiblings = ((fwdRows ?? []) as Array<{
        id: number;
        ftrackingchn: string | null;
      }>).map((r) => ({ fID: r.id, fTrackingCHN: r.ftrackingchn }));
    }
  }

  // forwarder.php L2050-2056: tb_forwarder_driver_item ⋈ tb_forwarder_driver
  const { data: driverRow } = await admin
    .from("tb_forwarder_driver_item")
    .select("fdistatus")
    .eq("fid", idNum)
    .maybeSingle<{ fdistatus: string | null }>();

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
      <div className="">
        <Link href={`/service-order/${row.reforder}`}>
          <span className="font-16 badge badge-info badge-pill">
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
      {/* Legacy PCS theme — same stylesheet the LIST page loads.
          The `.pr-forwarder-detail` marker scopes the compact-header /
          tighter-meta / table-density overrides at the end of
          service-import.css so they apply on the detail page only
          (not on the list page that shares this stylesheet). */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />

      {/* forwarder.php L1683-1685 — magnific-popup / switchery / dropify
          stylesheets. magnific-popup is the popup image viewer used by
          the cover photo <a class="image-popup-vertical-fit">; rendered
          statically here (the click-to-zoom needs client JS that's not
          present — the image still displays). */}
      {/* forwarder.php L1686-1699 — screen-local <style> overrides. Kept
          as a plain string injected into the page so the CSS doesn't
          escape the .pcs-legacy scope. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `.pcs-legacy .content-header-left.col-12.mb-2{margin-bottom:0rem!important;}
@media screen and (max-width:544px){.pcs-legacy .process-model.pro2 li::before{top:98px;width:82%;}}
.pcs-legacy .table td,.pcs-legacy .table th{padding:0.25rem 0.5rem;}`,
        }}
      />

      {/* BEGIN: Content — forwarder.php L1704 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L1707-1719 — breadcrumb header */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/service-import">รายการฝากนำเข้าสินค้า</Link>
                    </li>
                    <li className="breadcrumb-item active">#{row.id}</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* L1720 — content-body */}
          <div className="content-body pr110">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12 p-05">
                  <div className="card border-black">
                    <div className="card-content">
                      <div className="card-body">
                        {/* ── Header row ── forwarder.php L1748-1825 ── */}
                        <div className="row">
                          <div className="col-md-6">
                            <h3 className="text-center text-md-left">
                              <b>ออเดอร์นำเข้าสินค้า </b>
                              <b className="text-color-main">
                                เลขที่ #{row.id}
                                <TagPro id={promoIdStr} />
                              </b>
                            </h3>
                            {row.ftrackingchn2 && row.ftrackingchn2 !== "" ? (
                              <h3 className="text-center text-md-left text-color-main">
                                เลขแทรคกิ้ง {row.ftrackingchn2}
                              </h3>
                            ) : (
                              <h3 className="text-center text-md-left text-color-main">
                                เลขแทรคกิ้ง {row.ftrackingchn}
                              </h3>
                            )}
                            {row.ftrackingchn &&
                              /^[a-zA-Z0-9-]+$/i.test(row.ftrackingchn) && (
                                <h3 className="text-center text-md-left">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    className="barcode-forwader"
                                    alt=""
                                    src={`https://pcscargo.co.th/member/include/barcode.php?text=${row.ftrackingchn}&size=20&sizefactor=1.5`}
                                  />
                                </h3>
                              )}
                          </div>
                          <div className="col-md-6 text-center text-md-right">
                            {FID_driver2 === 1 ? (
                              <>
                                <h3>
                                  {" "}
                                  <b>สถานะ : </b>
                                  <span className="badge badge-info2 badge-pill">
                                    กำลังจัดส่ง
                                  </span>
                                </h3>
                                {fShipBy === "PCSF" ? (
                                  <h5>
                                    {" "}
                                    <b>ส่งสินค้าโดย : </b>
                                    {adminName} โทร.
                                    <a href={`tel:${adminTel}`}> {adminTel}</a>
                                  </h5>
                                ) : (
                                  <h5>
                                    {" "}
                                    <b>ส่งสินค้าโดย : </b>
                                    {nameShipBy(fShipBy)}
                                  </h5>
                                )}
                              </>
                            ) : (
                              <h3>
                                {" "}
                                <b>สถานะ : </b>
                                {statusForwarderBadge(fStatusValue)}
                              </h3>
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
                                >
                                  <div className="btn btn-rounded btn-success">
                                    <i className="mdi mdi-check-circle-outline"></i>{" "}
                                    ใบเสร็จรับเงิน
                                  </div>
                                </a>
                              )}
                            </div>
                            <span className=" ">
                              {row.fdateadminstatus &&
                                dmyHms(row.fdateadminstatus) !==
                                  "00/00/0000 00:00:00" &&
                                `อัปเดตล่าสุด : ${dmyHms(row.fdateadminstatus)} น.`}
                            </span>
                            {etaFrom !== "" && (
                              <p className="pt-1">
                                จะมาถึงไทยประมาณ :{" "}
                                <span className="text-info">
                                  {etaFrom} ถึง {etaTo}
                                </span>
                              </p>
                            )}
                          </div>
                        </div>

                        {/* ── 7-step process tabs ── forwarder.php L1826-1906 ── */}
                        <div className="row p-1 mb-1">
                          <ul
                            className="nav nav-tabs process-model pro2 more-icon-preocess"
                            role="tablist"
                            style={{ borderBottom: "unset" }}
                          >
                            {STEPS.map((step, i) => {
                              const state = steps[i];
                              const innerSpanClass =
                                state === "active" ? "active show" : "";
                              const innerIconClass =
                                state === "active" && i === 3 ? "active show" : "";
                              return (
                                <li
                                  key={step.ctrl}
                                  role="presentation"
                                  className={state}
                                >
                                  <span
                                    aria-controls={step.ctrl}
                                    role="tab"
                                    data-toggle="tab"
                                    className={innerSpanClass}
                                  >
                                    <i
                                      aria-hidden="true"
                                      className={innerIconClass}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        className={
                                          step.ctrl === "step62"
                                            ? "img-fluid p-img-icon p-0"
                                            : "img-fluid p-img-icon"
                                        }
                                        src={`${ICON_BASE}${step.icon}`}
                                        alt=""
                                      />
                                    </i>
                                    <p>{step.label}</p>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>

                        <div className="hr-dashed mb-1"></div>

                        {/* ── Metadata two-col ── forwarder.php L1909-2124 ── */}
                        <div className="row">
                          {/* LEFT col — L1910-2064 */}
                          <div className="col-md-6">
                            {refOrderEl}
                            <h5 className="">
                              <b>วันที่สร้าง : </b>
                              {dmyHms(row.fdate)} น.
                            </h5>
                            <h5 className="d-inline-block">
                              <b>บริษัทขนส่ง : </b>
                            </h5>
                            <span id="text-fShipBy" className="">
                              {nameShipBy(fShipBy)}{" "}
                              <span className="" id="to-edit-fShipBy">
                                {/* TODO(server-action): slide-down inline form
                                    for `update_fShipBy` POST (L1586-1619). */}
                                <a
                                  href="javascript:void(0)"
                                  className="text-info font-10"
                                >
                                  แก้ไข
                                </a>
                              </span>
                            </span>
                            <div id="fShipByForm" style={{ display: "none" }}>
                              {fShipBy !== "F" ? (
                                /* forwarder.php L1923-1936 — fShipBy inline edit form */
                                <form
                                  className="form-horizontal d-table"
                                  method="POST"
                                  action={`/service-import/${row.id}`}
                                  autoComplete="off"
                                >
                                  {Number(fStatusValue) < 4 ? (
                                    <>
                                      <input
                                        type="hidden"
                                        name="ID"
                                        value={row.id}
                                      />
                                      {/* TODO(server-action): populate <select>
                                          options via legacy `optionHShipBy2()`
                                          (function.php) — list of available
                                          carriers gated by ZIP + free-shipping
                                          flag. Static placeholder kept. */}
                                      <select
                                        className="form-control"
                                        name="fShipBy"
                                        id="fShipBy"
                                        defaultValue={fShipBy}
                                        required
                                      >
                                        <option value={fShipBy}>
                                          {nameShipBy(fShipBy)}
                                        </option>
                                      </select>
                                      <div className="modal-footer">
                                        <button
                                          type="button"
                                          className="btn btn-outline-secondary btn-rounded"
                                          id="to-text-fShipBy"
                                        >
                                          ยกเลิก
                                        </button>
                                        <button
                                          type="submit"
                                          name="update_fShipBy"
                                          className="btn btn-color-main btn-rounded"
                                        >
                                          บันทึก
                                        </button>
                                      </div>
                                      <p className="text-danger font-12 pt-1">
                                        หมายเหตุ :
                                        บริษัทขนส่งจะขึ้นอยู่กับพื้นที่ในการจัดส่ง
                                        ซึ่งเงื่อนไขเป็นไปตามที่บริษัทกำหนด
                                      </p>
                                    </>
                                  ) : (
                                    <span className="bg-danger text-white">
                                      ไม่สามารถเปลี่ยนที่อยู่ได้เนื่องจากสินค้าถึงไทยแล้ว
                                      <span></span>
                                    </span>
                                  )}
                                </form>
                              ) : (
                                <p className="text-danger">
                                  สั่งสินค้าในช่วงโปรโมชันฟรี ค่าขนส่งในไทย
                                  ทางบริษัทขอสงวนสิทธิ์ในการเลือกบริษัทขนส่ง
                                </p>
                              )}
                            </div>
                            <br />
                            <h5 className="text-center d-inline-block">
                              <b>การเก็บเงินค่าขนส่งในไทย : </b>
                              {namePayMethod(row.paymethod)}
                            </h5>
                            <br />
                            <h5 className="">
                              <b>ที่อยู่จัดส่งสินค้า : </b>
                            </h5>
                            <p className="font-16">
                              {/* forwarder.php L1663 — CONCAT 'คุณ' addressName … */}
                              คุณ{row.faddressname} {row.faddresslastname}
                              <br />
                              {row.faddressno} ตำบล/แขวง {row.faddresssubdistrict}
                              <br /> อำเภอ/เขต {row.faddressdistrict} จังหวัด{" "}
                              {row.faddressprovince} {row.faddresszipcode}
                              <br />
                              โทร. {row.faddresstel}, {row.faddresstel2}
                              <span id="text-fAddress">
                                <span
                                  className="d-inline-block"
                                  id="to-edit-fAddress"
                                >
                                  {/* TODO(server-action): slide-down inline form
                                      for `update_fAddress` POST (L1620-1658). */}
                                  <a
                                    href="javascript:void(0)"
                                    className="text-info font-10"
                                  >
                                    แก้ไข
                                  </a>
                                </span>
                              </span>
                            </p>
                            <div className="" id="fAddressForm" style={{ display: "none" }}>
                              {Number(fStatusValue) < 4 ? (
                                <>
                                  <div className="float-right">
                                    <Link
                                      href="/addresses/add"
                                      target="_blank"
                                      className="text-info font-0_85rem"
                                    >
                                      เพิ่มที่อยู่ใหม่ <i className="fa fa-plus"></i>
                                    </Link>
                                  </div>
                                  <br />
                                  <form
                                    className="form-horizontal d-table"
                                    method="POST"
                                    action={`/service-import/${row.id}`}
                                    autoComplete="off"
                                  >
                                    <input type="hidden" name="ID" value={row.id} />
                                    {/* TODO(server-action): populate address
                                        options from tb_address ⋈ tb_address_main
                                        per the legacy WHERE … (L1953-2011). */}
                                    <select
                                      className="form-control"
                                      name="addressID"
                                      required
                                    >
                                      <option value="">
                                        กรุณาเลือกที่อยู่ในการจัดส่ง
                                      </option>
                                    </select>
                                    <div className="modal-footer">
                                      <button
                                        type="button"
                                        className="btn btn-outline-secondary btn-rounded"
                                        id="to-text-fAddress"
                                      >
                                        ยกเลิก
                                      </button>
                                      <button
                                        type="submit"
                                        name="update_fAddress"
                                        className="btn btn-color-main btn-rounded"
                                      >
                                        บันทึก
                                      </button>
                                    </div>
                                  </form>
                                </>
                              ) : (
                                <span className="bg-danger text-white">
                                  ไม่สามารถเปลี่ยนที่อยู่ได้เนื่องจากสินค้าถึงไทยแล้ว
                                  <span></span>
                                </span>
                              )}
                            </div>
                            <h5>
                              <span className="font-16">
                                <b>เลขพัสดุในไทย : </b>
                                {row.ftrackingth}
                              </span>
                            </h5>
                            {multiBillSiblings.length > 0 && (
                              <>
                                <h5 className="bg-danger text-white p-1">
                                  รายการนี้ถูกคิดค่าขนส่งในไทยรวมกับรายการดังต่อไปนี้
                                </h5>
                                {multiBillSiblings.map((s, i) => (
                                  <span key={s.fID}>
                                    <Link
                                      href={`/service-import/${s.fID}`}
                                      target="_blank"
                                    >
                                      {i + 1}. รายการเลขที่ #{s.fID} เลขเทรคกิ้ง :{" "}
                                      {s.fTrackingCHN}
                                    </Link>
                                    <br />
                                  </span>
                                ))}
                              </>
                            )}
                            <div className="row">
                              {row.fphotoend && row.fphotoend !== "" && (
                                <div className="col-md-6">
                                  <h5>
                                    <span className="font-16">
                                      <b>ภาพถ่ายส่งสินค้า : </b>
                                    </span>
                                  </h5>
                                  <a
                                    className="image-popup-vertical-fit el-link"
                                    href={`https://pcscargo.co.th/member/images/shops/${row.fphotoend}`}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={`https://pcscargo.co.th/member/images/shops/${row.fphotoend}`}
                                      width="200"
                                      alt=""
                                    />
                                  </a>
                                </div>
                              )}
                              {!row.fphotoend && fStatusValue === "7" && (
                                <div className="col-md-6">
                                  <span className="text-danger">ยังไม่ได้ถ่ายรูป</span>
                                </div>
                              )}
                              {driverRow?.fdistatus === "2" && (
                                <div className="col-md-6">
                                  ส่งของเวลา : {row.fdatestatus7}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* RIGHT col — L2065-2123 */}
                          <div className="col-md-6 text-left text-md-right">
                            <div className="">
                              <h5 className="">
                                <span className="font-20">
                                  <b>เลขพัสดุจีน : </b>
                                  <span
                                    className="text-color-main"
                                    id="text-fTrackingCHN"
                                  >
                                    {row.ftrackingchn}
                                  </span>
                                </span>
                              </h5>
                            </div>
                            <div className="">
                              <h5 className="d-inline-block">
                                <b>รูปแบบขนส่ง จีน-ไทย : </b>
                              </h5>
                              <span id="text-fTransportType" className="">
                                {row.ftransporttype === "1"
                                  ? "ขนส่งทางรถ"
                                  : "ขนส่งทางเรือ"}
                              </span>
                            </div>
                            <h5 className="text-center d-inline-block">
                              <b>การตีลังไม้ : </b>
                              {nameCrate(row.crate)}
                            </h5>
                            <h5 className="">
                              <span className="font-16">
                                <b>โกดังประเทศจีน : </b>
                                {nameWarehouseChina(row.fwarehousechina)}
                              </span>
                            </h5>
                            <h5 className="">
                              <span className="font-16">
                                <b>เลขที่ตู้ : </b>
                                {row.fcabinetnumber}
                              </span>
                            </h5>
                            <h5 className="">
                              <span className="font-16">
                                <b>วันที่ปิดตู้ : </b>
                                {containerCloseStr}
                              </span>
                            </h5>
                            <h5 className="">
                              <span className="font-16">
                                <b>จำนวน : </b>
                                {fAmount} กล่อง
                              </span>
                            </h5>
                            <h5 className="">
                              <span className="font-16">
                                <b>ประเภทสินค้า : </b>
                                {nameProductsType(row.fproductstype)}
                              </span>
                            </h5>
                            <ul className="list-unstyled">
                              <li className="">
                                <div className="chat-content">
                                  <div className="box">
                                    <p className="font-light mb-0">
                                      {row.fdetail}
                                    </p>
                                    <div className="">
                                      <a
                                        className="image-popup-vertical-fit el-link"
                                        href={coverUrl}
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={coverUrl} width="200" alt="" />
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              </li>
                            </ul>
                            {row.fnoteuser === "2" && row.fnote && row.fnote !== "" && (
                              <>
                                <div
                                  className="text-white bg-danger"
                                  style={{ display: "inline-block" }}
                                >
                                  **หมายเหตุ : {row.fnote}
                                </div>
                                <br />
                              </>
                            )}
                          </div>
                        </div>

                        {/* ── Cost / item table ── forwarder.php L2125-2229 ── */}
                        {Number(fStatusValue) >= 5 ? (
                          <>
                            <div className="hr-dashed mb-1"></div>
                            <div className="row">
                              <div className="col-md-6">
                                <h4 className="text-center text-md-left">
                                  <b>
                                    <span className="text-color-main">
                                      รายละเอียดสินค้า
                                    </span>
                                  </b>
                                </h4>
                              </div>
                              <div className="col-md-6">
                                {fStatusValue === "5" && (
                                  <ul className="list-inline dl text-center text-md-right">
                                    <li className="list-inline-item text-info">
                                      {/* TODO(server-action): payForwarder() AJAX
                                          (L2264-2274) — fetch pay modal. */}
                                      <a href="javascript:void(0)">
                                        <span className="btn btn-block btn-rounded btn-info">
                                          {" "}
                                          <i className="mdi mdi-check-circle-outline"></i>{" "}
                                          ชำระเงิน
                                        </span>
                                      </a>
                                    </li>
                                  </ul>
                                )}
                              </div>
                              <div className="col-12">
                                <div className="header-from2"></div>
                                <div className="table-responsive pt-1">
                                  <table
                                    id="myTable"
                                    className="table display table-bordered table-striped dataTable no-footer dtr-inline pcs-table2"
                                  >
                                    <thead>
                                      <tr className="text-center">
                                        <th>
                                          จำนวน
                                          <br />
                                          กล่อง
                                        </th>
                                        <th>น้ำหนัก</th>
                                        <th>ปริมาตรรวม</th>
                                        <th>คิดราคาตาม</th>
                                        <th>เรทนำเข้า</th>
                                        <th>ค่านำเข้าจีน-ไทย</th>
                                        <th>ค่าสินค้า เพิ่ม/ลด</th>
                                        <th>ค่าตีลัง</th>
                                        <th>ค่าขนส่งจีน+</th>
                                        <th>ค่าขนส่งไทย</th>
                                        <th>ค่าบริการ</th>
                                        <th>ค่าอื่นๆ</th>
                                        <th>ส่วนลด</th>
                                        {fUserCompany === "1" && (
                                          <th>
                                            LESS
                                            <br /> WITHHOLDING <br />
                                            TAX 1%
                                          </th>
                                        )}
                                        <th>ราคารวม</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td className="text-right">{fAmount}</td>
                                        <td className="text-right">{fWeight} kg.</td>
                                        <td className="text-right">{fVolume}</td>
                                        <td className="text-center">
                                          {nameRefPrice(row.frefprice)}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(Number(row.frefrate ?? 0))}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(fTotalPrice)}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(fPriceUpdate)}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(priceCrate)}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(fTransportPriceChnThb)}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(fTransportPrice)}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(fShippingService)}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(priceOther)}
                                        </td>
                                        <td className="text-right">
                                          ฿{numberFormat2(fDiscount)}
                                        </td>
                                        {fUserCompany === "1" && (
                                          <td className="text-right">
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
                                        <td className="text-right text-danger">
                                          ฿{numberFormat2(priceAllUser)}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="hr-dashed mb-1"></div>
                            <div className="row">
                              <div className="col-12">
                                <h4 className="text-center text-md-left">
                                  <b>
                                    <span className="text-color-main">
                                      รายละเอียดสินค้า
                                    </span>
                                  </b>
                                </h4>
                                <div className="header-from2"></div>
                                <div className="table-responsive pt-1">
                                  <table
                                    id="myTable"
                                    className="table display table-bordered table-striped dataTable no-footer dtr-inline pcs-table2"
                                  >
                                    <thead>
                                      <tr className="text-center">
                                        <th>#</th>
                                        <th>รายละเอียดสินค้า</th>
                                        <th>จำนวนกล่อง</th>
                                        <th>น้ำหนัก</th>
                                        <th>ปริมาตรรวม</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td className="text-center">1</td>
                                        <td title="">{row.fdetail}</td>
                                        <td className="text-right">{fAmount}</td>
                                        <td className="text-right">{fWeight} kg.</td>
                                        <td className="text-right">
                                          {row.famountcount === "1"
                                            ? fVolume
                                            : fVolume * Number(fAmount)}{" "}
                                          CBM
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          </>
                        )}

                        {/* ── Footer back button ── forwarder.php L2231-2240 ── */}
                        <div className="col-md-12 mb-2">
                          <hr />
                        </div>
                        <div className="float-md-right">
                          <ul className="list-inline dl text-center text-md-right">
                            <li className="list-inline-item text-info ">
                              <Link
                                href={`/service-import?q=${fStatusValue}`}
                              >
                                <button
                                  type="button"
                                  className="btn btn-block btn-rounded btn-warning"
                                >
                                  <i className="fas fa-arrow-left"></i> ย้อนกลับ
                                </button>
                              </Link>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {/* forwarder.php L2252 — pay-modal target div (#list-forwarder-data) */}
            <div id="list-forwarder-data"></div>
          </div>
        </div>
      </div>
      {/* END: Content — forwarder.php L2251 */}
    </div>
  );
}
