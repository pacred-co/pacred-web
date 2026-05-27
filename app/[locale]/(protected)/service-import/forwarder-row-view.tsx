"use client";

import { legacyMemberUrl, legacyMemberBase } from "@/lib/legacy-image";

/**
 * One forwarder list row — a 1:1 transcription of the markup
 * forwarder.php L678-815 emits per `tb_forwarder` row, including the
 * mobile (.d-block.d-sm-none) + desktop (.pcs-d-pc) detail blocks and
 * the legacy helpers `statusForwarderAll2()`, `nameTransportType()`,
 * `nameShipBy()`, `convertIMGCHN()`, `calPriceForwarderSumCompany()`,
 * `tagPro()`, `diffDateTimeNow()` (D1 / ADR-0017).
 *
 * Extracted from `app/[locale]/(protected)/service-import/page.tsx`
 * into this client-safe file so it can be used by both the SSR page
 * (Server Component) AND the `<ForwarderInteractivity>` client
 * component — the same JSX, just rendered on whichever side owns the
 * row. React-RSC: a "use client" file's exports work on the server
 * AND on the client.
 *
 * The row is rendered inside `<tbody>` (`<tr>` + `<td>`s). The
 * `skipFirstCell` prop lets the client-component wrap the row with a
 * checkbox column WITHOUT double-rendering the legacy "ID" `<td>`.
 *
 * Note — the `?ID=` row-highlight (L678) is a DataTables anchor; the
 * legacy reaches it via a `#F<id>` jump after a deep-link. Not part
 * of the default list render and not transcribed.
 */

// Legacy `statusForwarderAll2($fStatus,$fStatusDriver)` —
// member/include/function.php L527-544. Returns the Thai status
// badge + the matching status icon. The icons are referenced at the
// legacy absolute CDN URLs the helper itself emits (faithful — the
// legacy renders these exact URLs).
export function StatusForwarderAll2({
  fStatus,
  fStatusDriver,
}: {
  fStatus: string | null;
  fStatusDriver: number;
}) {
  // Forwarder status icons — legacy stored under `member/assets/images/icon/
  // forwarder/`; resolved via the Supabase mirror (ภูม upload 2026-05-24, see
  // lib/legacy-image.ts). NEVER hardcode pcscargo.co.th here — customer-visible.
  const ICON_BASE = `${legacyMemberBase()}/assets/images/icon/forwarder/`;
  const iconStyle = { maxHeight: "40px", padding: "4px" } as const;
  switch (fStatus) {
    case "1":
      return (
        <>
          <span className="badge badge-warning badge-pill">
            รอสินค้าเข้าโกดังจีน
          </span>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid " style={iconStyle} src={`${ICON_BASE}forwarder-1.png`} alt="" />
        </>
      );
    case "2":
      return (
        <>
          <span className="badge badge-info badge-pill">
            สินค้าถึงโกดังจีนแล้ว
          </span>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid " style={iconStyle} src={`${ICON_BASE}forwarder-2.png`} alt="" />
        </>
      );
    case "3":
      return (
        <>
          <span className="badge badge-pink badge-pill">
            กำลังส่งมาประเทศไทย
          </span>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid " style={iconStyle} src={`${ICON_BASE}forwarder-3.png`} alt="" />
        </>
      );
    case "4":
      return (
        <>
          <span className="badge badge-brown badge-pill">
            สินค้าถึงประเทศไทยแล้ว
          </span>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid " style={iconStyle} src={`${ICON_BASE}forwarder-4.png`} alt="" />
        </>
      );
    case "5":
      return (
        <>
          <span className="badge badge-danger badge-pill">รอชำระเงิน</span>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid " style={iconStyle} src={`${ICON_BASE}forwarder-5.png`} alt="" />
        </>
      );
    case "6":
      return fStatusDriver === 1 ? (
        <>
          <span className="badge badge-info2 badge-pill">กำลังจัดส่ง</span>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid " style={iconStyle} src={`${ICON_BASE}forwarder-6.1.png`} alt="" />
        </>
      ) : (
        <>
          <span className="badge badge-primary badge-pill">เตรียมส่ง</span>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid " style={iconStyle} src={`${ICON_BASE}forwarder-6.png`} alt="" />
        </>
      );
    case "7":
      return (
        <>
          <span className="badge badge-success badge-pill">ส่งแล้ว</span>
          <br />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-fluid " style={iconStyle} src={`${ICON_BASE}forwarder-7.png`} alt="" />
        </>
      );
    default:
      return null;
  }
}

// Legacy `nameTransportType($transportType)` — function.php L342-350.
export function nameTransportType(transportType: string | null): string {
  if (transportType === "1") return "ขนส่งทางรถ";
  if (transportType === "2") return "ขนส่งทางเรือ";
  return "รอตรวจสอบ";
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
  PCS: "รับเองโกดัง Pacred กทม", F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: "Pacred เหมาเหมา", PCSE: "Pacred Express",
};
export function nameShipBy(fShipBy: string | null): string {
  return NAME_SHIP_BY[fShipBy ?? ""] ?? "ไม่พบข้อมูล";
}

// Legacy `tagPro($ID)` — function.php L1274+. The forwarder list
// only ever shows the badge text + (for ID>=7) the WordPress
// promotion link; transcribed for the IDs that occur. The legacy
// links go to old WordPress marketing pages — kept as absolute
// pcscargo.co.th URLs (faithful · scrub-safe · not flagged).
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

// Legacy `calPriceForwarderSumCompany(...)` — function.php L1384-1392.
// The net price a forwarder row shows in the list.
export function calPriceForwarderSumCompany(
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
  // Legacy: ($userCompany==1 && pricePayAll>=1000 && fUserCompany!=2) || fUserCompany==1
  // — the legacy call passes the SAME column as both $userCompany and
  // $fUserCompany, so that whole condition reduces exactly to
  // `fUserCompany=='1'` (once `==1` holds the `!=2` sub-clause is always
  // true — tsc flags it as dead). Written in the reduced form; the
  // WHT-1% reduction behaviour is identical 1:1.
  if (fUserCompany === "1") {
    pricePayAll = pricePayAll - pricePayAll * 0.01;
  }
  return pricePayAll;
}

// Legacy `convertIMGCHN($url,$size)` — function.php L1414-1437.
// Resolves a forwarder cover image URL/filename to a displayable URL.
export function convertIMGCHN(url: string | null, size: string): string {
  if (!url || url === "") {
    // legacy: basePath.'images/shops/default.png'
    return "/legacy/pcs/shops/default.png";
  }
  let u = url
    .replace("?x-oss-process=style/alsy", "")
    .replace("?x-oss-process=style/tbsy", "")
    .replace("_250x250.jpg", "");
  if (u.includes("/")) {
    // Old data may store full legacy `pcscargo.co.th/member/...` URLs —
    // strip the host and re-resolve through the Supabase mirror so no
    // customer-visible URL leaks the legacy host name.
    const legacyMatch = u.match(/pcscargo\.co\.th\/member\/(.+)$/);
    if (legacyMatch) return legacyMemberUrl(legacyMatch[1]);
    return u + size;
  }
  // a bare filename — legacy stores forwarder covers under images/shops/.
  // Resolved via the Supabase mirror (ภูม upload 2026-05-24).
  return legacyMemberUrl(`images/shops/${u}`);
}

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
export function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// PHP `DATE_FORMAT(fDate,'%d/%m/%Y %T')` — d/m/Y H:i:s of a timestamp.
export function dmyHms(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// PHP `DATE(x)` → d/m/Y, and `TIME(x)` → H:i:s of a timestamp.
export function dmy(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function hms(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// PHP DateTime modify on a d/m/Y string — used for the "จะถึงไทย" range.
export function modifyDmy(dmyStr: string, days: number): string {
  const m = dmyStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Transcribes the legacy `diffDateTimeNow($datetime2)` helper
 * (member/include/function.php L1074-1093) — the "เครดิตสินค้า" tab
 * shows the elapsed time since the credit due-date as a Thai string.
 * Returns '' when the diff is under a minute (matching the legacy).
 */
export function diffDateTimeNow(datetime2: string | null): string {
  if (!datetime2) return "";
  const d2 = new Date(datetime2.replace(" ", "T"));
  if (isNaN(d2.getTime())) return "";
  const now = new Date();
  // PHP DateTime::diff — absolute calendar breakdown.
  const from = d2 < now ? d2 : now;
  const to = d2 < now ? now : d2;
  let y = to.getFullYear() - from.getFullYear();
  let m = to.getMonth() - from.getMonth();
  let day = to.getDate() - from.getDate();
  let h = to.getHours() - from.getHours();
  let i = to.getMinutes() - from.getMinutes();
  let s = to.getSeconds() - from.getSeconds();
  if (s < 0) { s += 60; i -= 1; }
  if (i < 0) { i += 60; h -= 1; }
  if (h < 0) { h += 24; day -= 1; }
  if (day < 0) {
    const prevMonth = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    day += prevMonth;
    m -= 1;
  }
  if (m < 0) { m += 12; y -= 1; }
  if (y === 0 && m === 0 && day === 0 && h === 0 && i === 0) return "";
  if (y === 0 && m === 0 && day === 0 && h === 0)
    return `${i} นาที ${s} วินาที `;
  if (y === 0 && m === 0 && day === 0)
    return `${h} ชั่วโมง ${i} นาที ${s} วินาที `;
  if (y === 0 && m === 0)
    return `${day} วัน ${h} ชั่วโมง ${i} นาที ${s} วินาที `;
  if (y === 0)
    return `${m} เดือน ${day} วัน ${h} ชั่วโมง ${i} นาที ${s} วินาที `;
  return `${y} ปี ${m} เดือน ${day} วัน ${h} ชั่วโมง ${i} นาที ${s} วินาที `;
}

// A forwarder list row, normalised to the legacy `$row` shape the
// table loop (forwarder.php L666-815) consumes.
export type ForwarderRow = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  ftrackingchn: string | null;
  ftrackingchn2: string | null;
  ftrackingth: string | null;
  ftransporttype: string | null;
  fshipby: string | null;
  fdetail: string | null;
  fcover: string | null;
  famount: number;
  fweight: number;
  fvolume: number;
  ftotalprice: number;
  ftransportprice: number;
  fpriceupdate: number;
  fdiscount: number;
  fshippingservice: number;
  pricecrate: number;
  ftransportpricechnthb: number;
  priceother: number;
  fusercompany: string | null;
  fcredit: string | null;
  fcreditdate: string | null;
  fdatestatus5: string | null;
  fdatetothai: string | null;
  fcabinetnumber: string | null;
  fdatecontainerclose: string | null;
  fnote: string | null;
  fnoteuser: string | null;
  reforder: string | null;
  adminidcreator: string | null;
  promoid: string | null;
};

export function ForwarderRowView({
  row,
  q,
  arrFidDriver,
  skipFirstCell = false,
}: {
  row: ForwarderRow;
  q: string;
  /** Plain Array — serialized across the RSC boundary. The legacy
   *  `arrFidDriver` Set is normalised to Array<number> at page.tsx. */
  arrFidDriver: number[];
  /** When true (rendered inside the client-component checkbox row),
   *  the leading "ID" `<td>` is omitted so the client component owns
   *  the first cell (checkbox + ID). Default false = legacy 1:1. */
  skipFirstCell?: boolean;
}) {
  // L672 — fTrackingCHN2 overrides fTrackingCHN when present.
  const trackingChn =
    row.ftrackingchn2 && row.ftrackingchn2 !== ""
      ? row.ftrackingchn2
      : row.ftrackingchn;

  // L697-700 — fStatusDriver = is this row in the out-for-delivery set.
  const fStatusDriver = arrFidDriver.includes(row.id) ? 1 : 0;

  // L676 — the net total the row shows.
  const totalPriceNet = calPriceForwarderSumCompany(
    row.fusercompany,
    row.fpriceupdate,
    row.ftotalprice,
    row.ftransportprice,
    row.fshippingservice,
    row.fdiscount,
    row.pricecrate,
    row.ftransportpricechnthb,
    row.priceother,
  );

  // L686-694 — the fDateToThai container date display value
  // (kept for fidelity; the legacy variable $dataToThaiC is computed
  // but unused in the rendered output, so nothing renders from it).

  // L751-765 — the "จะถึงไทยประมาณ" range.
  const fDateToThaiValid =
    !!row.fdatetothai && row.fdatetothai !== "0000-00-00";
  let toThaiShow = "";
  let toThaiShow2 = "";
  if (fDateToThaiValid) {
    const base = dmy(row.fdatetothai);
    if (row.ftransporttype === "1") {
      toThaiShow = base;
      toThaiShow2 = modifyDmy(base, 2);
    } else {
      toThaiShow = base;
      toThaiShow2 = modifyDmy(base, 4);
    }
  }

  // L742 — container-close date display.
  const containerCloseValid =
    !!row.fdatecontainerclose &&
    dmy(row.fdatecontainerclose) !== "" &&
    row.fdatecontainerclose !== "0000-00-00";

  return (
    <>
      {!skipFirstCell && (
        <td className="text-center tr1 cursor-pointer">{row.id}</td>
      )}
      <td className="text-center font-12">
        {dmy(row.fdate)}
        <br /> {hms(row.fdate)} น.
      </td>
      <td title="">
        <div className="float-right">
          <a
            className="image-popup-vertical-fit el-link"
            href={convertIMGCHN(row.fcover, "")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="img-fluid"
              src={convertIMGCHN(row.fcover, "_80x80.jpg")}
              width={80}
              alt=""
            />
          </a>
        </div>
        {/* Start Mobile — L708-734 */}
        <div className="d-block d-sm-none">
          วันที่สร้าง : <span className="font-12">{dmyHms(row.fdate)}</span>
          <br />
          เลขที่ :{" "}
          <a className="text-info" href={`/service-import/${row.id}/`}>
            #{row.id}
          </a>
          <br />
          เลขแทรคกิ้ง :{" "}
          <a className="text-info" href={`/service-import/${row.id}/`}>
            {trackingChn}
          </a>
          {row.ftrackingth && row.ftrackingth !== "-" && (
            <>
              <br />
              เลขพัสดุไทย : {row.ftrackingth}
            </>
          )}
          {row.fcabinetnumber && (
            <>
              <br />
              เลขที่ตู้ : {row.fcabinetnumber}
            </>
          )}
          {containerCloseValid &&
            ` ตู้วันที่ : ${dmy(row.fdatecontainerclose)}`}
          <br />
          <div className="dtr-details">
            สถานะ :{" "}
            <StatusForwarderAll2
              fStatus={row.fstatus}
              fStatusDriver={fStatusDriver}
            />{" "}
          </div>
          <div>จำนวน : {row.famount > 0 && `${row.famount} กล่อง`}</div>
          {row.pricecrate > 0 && (
            <>
              ค่าตีลังไม้ :{" "}
              <span className="">{numberFormat2(row.pricecrate)} บาท</span>
              <br />
            </>
          )}
          {row.ftransportpricechnthb > 0 && (
            <>
              ค่าขนส่งในจีนจ่ายเพิ่ม :{" "}
              <span className="">
                {numberFormat2(row.ftransportpricechnthb)} บาท
              </span>
              <br />
            </>
          )}
          {row.priceother > 0 && (
            <>
              ค่าขนส่งในจีนจ่ายเพิ่ม :{" "}
              <span className="">{numberFormat2(row.priceother)} บาท</span>
              <br />
            </>
          )}
          {row.ftotalprice > 0 && (
            <>
              ค่าขนจีน-ไทย :{" "}
              <span className="">{numberFormat2(row.ftotalprice)} บาท</span>
              <br />
            </>
          )}
          รวมราคา :{" "}
          <span className="">{numberFormat2(totalPriceNet)} บาท</span>
          <span className="">
            {row.fweight > 0 && (
              <>
                <br />
                หนัก : {row.fweight} kg.
              </>
            )}
            {row.fvolume > 0 && ` ปริมาตร : ${numberFormat2(row.fvolume)} CBM`}
          </span>
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
        {/* End Mobile */}
        {/* Start PC — L736 */}
        <div className="pcs-d-pc">
          <span>
            <b>เลขที่ : </b>
            <a className="text-info" href={`/service-import/${row.id}/`}>
              {row.id}
            </a>{" "}
            <TagPro id={row.promoid} />
          </span>
          <br />
        </div>
        {/* End PC */}
        <b>รายละเอียด :</b>{" "}
        <a className="text-info" href={`/service-import/${row.id}`}>
          {row.fdetail}
        </a>
        {/* Start PC — L740-748 */}
        <div className="pcs-d-pc">
          {row.fcabinetnumber && (
            <>
              <b>เลขที่ตู้ : </b>
              {row.fcabinetnumber}{" "}
            </>
          )}
          {containerCloseValid && (
            <>
              <b>ตู้วันที่ : </b>
              {dmy(row.fdatecontainerclose)}
              <br />
            </>
          )}
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
        {row.adminidcreator !== "" &&
          (!row.reforder || row.reforder === "") && (
            <div className="">
              <span className="font-9 badge badge-warning badge-pill">
                ฝากนำเข้าโดย : admin
              </span>
            </div>
          )}
        {row.reforder && row.reforder !== "" && (
          <div className="">
            <a href={`/service-order/${row.reforder}/`}>
              <span className="font-9 badge badge-info badge-pill">
                มาจากรายการฝากสั่ง : {row.reforder}
              </span>
            </a>
          </div>
        )}
        {fDateToThaiValid && (
          <p className="font-12">
            จะถึงไทยประมาณ :{" "}
            <span className="text-info">
              {toThaiShow} ถึง {toThaiShow2}
            </span>
          </p>
        )}
      </td>
      <td className="text-right notranslate">
        <span className="">
          {totalPriceNet > 0 && `${numberFormat2(totalPriceNet)} บ.`}
        </span>
        <span className="font-12">
          {row.fweight > 0 && (
            <>
              <br />
              {row.fweight} kg.
            </>
          )}
          {row.fvolume > 0 && (
            <>
              <br />
              {row.fvolume} CBM
            </>
          )}
        </span>
      </td>
      <td>
        {trackingChn}
        <br />
        {nameTransportType(row.ftransporttype)}
        {row.famount > 0 && (
          <>
            <br />
            {row.famount} กล่อง
          </>
        )}
      </td>
      <td>
        {row.ftrackingth}
        <br />
        {nameShipBy(row.fshipby)}
      </td>
      <td className="text-center">
        <StatusForwarderAll2
          fStatus={row.fstatus}
          fStatusDriver={fStatusDriver}
        />{" "}
      </td>
      {q === "c" && (
        <>
          <td className="font-12 text-center bg-danger3">
            {row.fdatestatus5 ? dmy(row.fdatestatus5) : ""}
          </td>
          <td className="font-12 text-center bg-danger3">
            {row.fcreditdate ? dmy(row.fcreditdate) : ""}
            <div className="text-white bg-danger">
              {diffDateTimeNow(row.fcreditdate)}
            </div>
          </td>
        </>
      )}
      <td className="text-center">
        {row.fstatus === "1" &&
          (!row.reforder || row.reforder === "") && (
            <>
              {/* legacy: onclick deleteForwarder(ID) — jQuery AJAX,
                  NOT wired here (see file header §5). Markup 1:1. */}
              <a href="#delete-forwarder" data-forwarder-id={row.id}>
                <p className="btn font-12 btn-sm btn-danger btn-rounded">
                  ลบรายการ
                </p>
              </a>
              <br />
            </>
          )}
        <a href={`/service-import/${row.id}`}>
          <p className="btn font-12 btn-sm btn-outline-success btn-rounded">
            {" "}
            ดูรายละเอียด{" "}
          </p>
        </a>
        {(row.fstatus === "5" || row.fcredit === "1") && (
          <>
            <br />
            <a href={`/service-import/${row.id}&pay=true/`}>
              <p className="btn font-12 btn-sm btn-danger btn-rounded">
                {" "}
                <i className="mdi mdi-check-circle-outline"></i> ชำระเงิน
              </p>
            </a>
          </>
        )}
      </td>
    </>
  );
}
