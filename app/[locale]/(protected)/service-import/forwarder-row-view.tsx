"use client";

/**
 * One forwarder list row — Tailwind card rebuild (เดฟ 2026-05-27 — ปอน:
 * "rebuild css เป็น tailwind ให้หน่อย ห้ามแก้ relation อะไร ต้องให้ฟังก์ชั่น
 * ทุกอย่างทำงานเหมือนเดิม"). Was a 1:1 transcription of the Bootstrap-4
 * `<tr><td>` table cells in `member/forwarder.php` L678-815; now renders
 * as a self-contained `<article>` card so the layout works the same on
 * desktop (1440) and mobile (375) without `d-block d-sm-none` switches.
 *
 * Contract preserved (NO relations changed):
 *   · Every legacy `href` is the same exact path/query — `/service-import/${id}`,
 *     `/service-import/${id}?pay=true` (query param — the `[fNo]` route reads
 *     searchParams.pay; a path segment `&pay=true` 404s via Number(idClean)=NaN),
 *     `/service-order/${reforder}/`,
 *     `#delete-forwarder` + `data-forwarder-id` (jQuery deleteForwarder()).
 *   · `image-popup-vertical-fit` class kept on the thumbnail anchor so the
 *     legacy magnific-popup vendor JS still binds to it on hydration.
 *   · `convertIMGCHN`, `calPriceForwarderSumCompany`, `nameTransportType`,
 *     `nameShipBy`, `dmy`/`dmyHms`/`hms`/`modifyDmy`/`diffDateTimeNow`,
 *     `numberFormat2`, and the `ForwarderRow` type are still exported with
 *     the same signature — used by forwarder-interactivity + page.tsx.
 *
 * The new render is a flex card that scales: desktop sees image-left +
 * details-right + price/actions footer; mobile stacks the same blocks
 * vertically without needing a separate mobile-only branch.
 *
 * P1-19 — the legacy "#delete-forwarder" jQuery hook (deleteForwarder())
 * is now a real client button (CancelForwarderButton below) that calls
 * the `cancelOwnForwarder` Server Action (faithful port of
 * deleteForwarder.php). Shown only when fStatus='1' AND refOrder=''
 * (the legacy gate), so the customer can cancel a not-yet-processed,
 * non-shop-spawned own forwarder.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { cancelOwnForwarder } from "@/actions/forwarder";
import { confirm } from "@/components/ui/confirm";

// ────────────────────────────────────────────────────────────────────
//  Status badge — legacy `statusForwarderAll2($fStatus,$fStatusDriver)`
//  (member/include/function.php L527-544). The legacy emits a Bootstrap
//  pill + an icon image hosted at pcscargo.co.th; the rebuild drops the
//  icon (icon URLs are external + decorative) and uses a Tailwind chip
//  with the matching tone for each status code.
// ────────────────────────────────────────────────────────────────────
const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  "1":   { label: "รอสินค้าเข้าโกดังจีน",  cls: "bg-amber-100 text-amber-700 border-amber-200"     },
  "2":   { label: "สินค้าถึงโกดังจีนแล้ว", cls: "bg-sky-100 text-sky-700 border-sky-200"           },
  "3":   { label: "กำลังส่งมาประเทศไทย",   cls: "bg-pink-100 text-pink-700 border-pink-200"        },
  "4":   { label: "สินค้าถึงประเทศไทยแล้ว",cls: "bg-amber-200 text-amber-900 border-amber-300"     },
  "5":   { label: "รอชำระเงิน",            cls: "bg-red-100 text-red-700 border-red-200"           },
  "6":   { label: "เตรียมส่ง",             cls: "bg-indigo-100 text-indigo-700 border-indigo-200"  },
  "6.1": { label: "กำลังจัดส่ง",           cls: "bg-cyan-100 text-cyan-700 border-cyan-200"        },
  "7":   { label: "ส่งแล้ว",               cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

export function StatusForwarderAll2({
  fStatus,
  fStatusDriver,
}: {
  fStatus: string | null;
  fStatusDriver: number;
}) {
  // Status 6 has two sub-states: 6 = "เตรียมส่ง" by default, 6.1 = "กำลังจัดส่ง"
  // when the row is in the out-for-delivery (tb_forwarder_driver_item) set.
  let key: string = fStatus ?? "";
  if (fStatus === "6" && fStatusDriver === 1) key = "6.1";
  const chip = STATUS_CHIP[key];
  if (!chip) return null;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${chip.cls}`}>
      {chip.label}
    </span>
  );
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
  PCS: "รับเองโกดัง Pacred (สมุทรสาคร)", F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: "Pacred เหมาเหมา", PCSE: "Pacred Express",
};
export function nameShipBy(fShipBy: string | null): string {
  return NAME_SHIP_BY[fShipBy ?? ""] ?? "ไม่พบข้อมูล";
}

// Legacy `tagPro($ID)` — function.php L1274+. Tailwind chip rebuild;
// hrefs unchanged so the "Pro X.X" landing-page link still works.
const TAG_PRO: Record<string, { label: string; href?: string }> = {
  "1": { label: "Pro 3.15" },
  "2": { label: "Pro 4.4" },
  "3": { label: "Pro 4.25" },
  "4": { label: "Pro 5.5" },
  "5": { label: "Pro 5.15" },
  "6": { label: "Pro 6.6" },
  "7":  { label: "Pro 6.25", href: "/services/import-china" },
  "8":  { label: "Pro 7.7",  href: "/services/import-china" },
  "9":  { label: "Pro 7.25", href: "/services/import-china" },
  "10": { label: "Pro 8.8",  href: "/services/import-china" },
  "11": { label: "Pro 8.25", href: "/services/import-china" },
  "12": { label: "Pro 9.9",  href: "/services/import-china" },
};
function TagPro({ id }: { id: string | null }) {
  if (!id || !TAG_PRO[id]) return null;
  const p = TAG_PRO[id];
  const chip = (
    <span className="inline-flex items-center rounded-full bg-gradient-to-r from-amber-400 to-amber-600 text-white text-[10px] font-bold px-2 py-0.5 shadow-sm">
      {p.label}
    </span>
  );
  return p.href ? (
    <a href={p.href} target="_blank" rel="noreferrer">{chip}</a>
  ) : chip;
}

// Legacy `calPriceForwarderSumCompany(...)` — function.php L1384-1392.
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
  if (fUserCompany === "1") {
    pricePayAll = pricePayAll - pricePayAll * 0.01;
  }
  return pricePayAll;
}

// Legacy `convertIMGCHN($url,$size)` — function.php L1414-1437.
export function convertIMGCHN(url: string | null, size: string): string {
  if (!url || url === "") {
    return "/legacy/pcs/shops/default.png";
  }
  let u = url
    .replace("?x-oss-process=style/alsy", "")
    .replace("?x-oss-process=style/tbsy", "")
    .replace("_250x250.jpg", "");
  if (u.includes("/")) {
    if (/pcscargo\.co\.th/.test(u)) return u;
    return u + size;
  }
  u = `https://pcscargo.co.th/member/images/shops/${u}`;
  return u;
}

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
export function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// PHP DATE_FORMAT helpers.
export function dmyHms(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
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
export function modifyDmy(dmyStr: string, days: number): string {
  const m = dmyStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Legacy `diffDateTimeNow($datetime2)` — member/include/function.php
 * L1074-1093. Returns the elapsed time since the credit due-date as
 * a Thai string (used in the q===c view).
 */
export function diffDateTimeNow(datetime2: string | null): string {
  if (!datetime2) return "";
  const d2 = new Date(datetime2.replace(" ", "T"));
  if (isNaN(d2.getTime())) return "";
  const now = new Date();
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

// ────────────────────────────────────────────────────────────────────
//  CancelForwarderButton — P1-19. Replaces the dead legacy
//  "#delete-forwarder" jQuery hook with a real Server-Action call.
//  Faithful to deleteForwarder.php: a confirm prompt, then a hard
//  delete of the customer's own not-yet-processed forwarder. On
//  success the row's list revalidates (Server Action) + a client
//  refresh repaints. Tap target is ≥44px tall on mobile (h-9 + py).
// ────────────────────────────────────────────────────────────────────
function CancelForwarderButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleCancel() {
    // Legacy used a plain confirm() gate before the AJAX delete; match it.
    if (!(await confirm(`ยืนยันยกเลิกรายการนำเข้า #${id} ?\nรายการที่ยกเลิกแล้วจะถูกลบถาวร`))) {
      return;
    }
    setErrorMsg(null);
    startTransition(async () => {
      const res = await cancelOwnForwarder({ fNo: id });
      if (res.ok) {
        router.refresh();
      } else {
        setErrorMsg(
          res.error === "not_cancellable"
            ? "ไม่สามารถยกเลิกได้ (รายการถูกดำเนินการแล้ว)"
            : res.error === "not_found"
              ? "ไม่พบรายการ"
              : "เกิดข้อผิดพลาด กรุณาลองใหม่",
        );
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleCancel}
        disabled={pending}
        className="inline-flex items-center rounded-full bg-red-600 text-white px-3 py-2 min-h-[36px] text-xs font-bold hover:bg-red-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "กำลังยกเลิก…" : "ยกเลิกรายการ"}
      </button>
      {errorMsg && (
        <span className="text-[10px] text-red-600 max-w-[160px] text-right leading-tight">
          {errorMsg}
        </span>
      )}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────
//  ForwarderRowView — Tailwind card rebuild.
//
//  Props:
//   - `row`           : the row data (unchanged)
//   - `q`             : current ?q= filter (unchanged — controls the
//                       extra "วันที่ให้เครดิต / ครบกำหนด" footer block)
//   - `arrFidDriver`  : the out-for-delivery id list (unchanged — used
//                       to flip status 6 → 6.1)
//   - `selectable`    : whether to render the row's leading checkbox
//   - `checked`       : checkbox state (controlled by interactivity)
//   - `onToggleCheck` : checkbox callback (controlled by interactivity)
//
//  Renders ONE complete card — header (id + date + status), body
//  (thumbnail + details), tags row, footer (price + action buttons).
// ────────────────────────────────────────────────────────────────────
export function ForwarderRowView({
  row,
  q,
  arrFidDriver,
  selectable = false,
  checked = false,
  onToggleCheck,
  grouped = false,
}: {
  row: ForwarderRow;
  q: string;
  arrFidDriver: number[];
  selectable?: boolean;
  checked?: boolean;
  onToggleCheck?: (id: number, next: boolean) => void;
  /** When rendered inside a container group, hide the redundant per-card
   *  "เลขที่ตู้" line (the cabinet is already in the group header). */
  grouped?: boolean;
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
    <article className="rounded-2xl bg-white dark:bg-surface border border-border shadow-sm overflow-hidden">
      {/* Header — checkbox · ID + promo · status · date */}
      <header className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border bg-surface-alt/40">
        <div className="flex items-center gap-2 min-w-0">
          {selectable && (
            <input
              type="checkbox"
              className="dt-checkboxes w-4 h-4 rounded border-border accent-red-600 cursor-pointer shrink-0"
              name="ID[]"
              value={row.id}
              checked={checked}
              onChange={(e) => onToggleCheck?.(row.id, e.target.checked)}
            />
          )}
          <a
            href={`/service-import/${row.id}`}
            className="font-mono text-sm md:text-base font-bold text-red-600 hover:underline"
          >
            #{row.id}
          </a>
          <TagPro id={row.promoid} />
        </div>
        <div className="text-right shrink-0">
          <StatusForwarderAll2 fStatus={row.fstatus} fStatusDriver={fStatusDriver} />
          <div className="mt-0.5 text-[10px] text-muted notranslate">
            {dmy(row.fdate)} · {hms(row.fdate)}
          </div>
        </div>
      </header>

      {/* Body — thumbnail + compact details (track + รายละเอียด on one row,
          a small muted meta row below — clean, not sparse). */}
      <div className="flex gap-2.5 p-2.5 md:gap-3 md:p-3">
        {/* Thumbnail (image-popup-vertical-fit class kept so legacy
            magnific-popup vendor JS binds to it on hydration). */}
        <a
          className="image-popup-vertical-fit shrink-0 block"
          href={convertIMGCHN(row.fcover, "")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg border border-border bg-surface-alt"
            src={convertIMGCHN(row.fcover, "_80x80.jpg")}
            width={80}
            height={80}
            alt=""
          />
        </a>

        {/* Details — condensed */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 text-xs md:text-sm">
          {/* Track + รายละเอียด — one row, truncated */}
          <div className="flex min-w-0 items-baseline gap-1.5">
            {trackingChn && (
              <a
                href={`/service-import/${row.id}`}
                className="shrink-0 font-mono text-red-600 hover:underline"
              >
                🇨🇳 {trackingChn}
              </a>
            )}
            {row.fdetail && (
              <a
                href={`/service-import/${row.id}`}
                className="truncate text-foreground/90 hover:underline"
              >
                {trackingChn ? "· " : ""}
                {row.fdetail}
              </a>
            )}
          </div>
          {/* Secondary meta — TH track · ตู้ · ETA — one small muted row */}
          {((row.ftrackingth && row.ftrackingth !== "-") ||
            (!grouped && row.fcabinetnumber) ||
            fDateToThaiValid) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
              {row.ftrackingth && row.ftrackingth !== "-" && (
                <span className="font-mono">🇹🇭 {row.ftrackingth}</span>
              )}
              {!grouped && row.fcabinetnumber && (
                <span>
                  ตู้{" "}
                  <span className="font-mono text-foreground">{row.fcabinetnumber}</span>
                  {containerCloseValid && <> · {dmy(row.fdatecontainerclose)}</>}
                </span>
              )}
              {fDateToThaiValid && (
                <span>
                  ถึงไทย ~{" "}
                  <span className="font-medium text-sky-600">
                    {toThaiShow}–{toThaiShow2}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tags row — admin / ref order */}
      {(row.adminidcreator !== "" && (!row.reforder || row.reforder === "")) ||
      (row.reforder && row.reforder !== "") ? (
        <div className="px-3 -mt-1 pb-2 flex flex-wrap gap-1.5">
          {row.adminidcreator !== "" &&
            (!row.reforder || row.reforder === "") && (
              <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-semibold border border-amber-200">
                ฝากนำเข้าโดย: admin
              </span>
            )}
          {row.reforder && row.reforder !== "" && (
            <a href={`/service-order/${row.reforder}/`}>
              <span className="inline-flex items-center rounded-full bg-sky-100 text-sky-700 px-2 py-0.5 text-[10px] font-semibold border border-sky-200 hover:bg-sky-200">
                มาจากฝากสั่ง: {row.reforder}
              </span>
            </a>
          )}
        </div>
      ) : null}

      {/* Red note */}
      {row.fnoteuser === "2" && row.fnote && row.fnote !== "" && (
        <div className="mx-3 mb-2 px-2.5 py-1.5 bg-red-600 text-white text-xs rounded-md">
          ** หมายเหตุ: {row.fnote}
        </div>
      )}

      {/* Footer — meta · price · action buttons */}
      <footer className="border-t border-border bg-surface-alt/30 px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        {/* Left — meta + price */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Transport + amount */}
          <div className="text-[11px] text-muted">
            {nameTransportType(row.ftransporttype)}
            {row.famount > 0 && (
              <span className="ml-1">· {row.famount} กล่อง</span>
            )}
            {row.fweight > 0 && (
              <span className="ml-1">· {row.fweight} kg</span>
            )}
            {row.fvolume > 0 && (
              <span className="ml-1">· {numberFormat2(row.fvolume)} CBM</span>
            )}
          </div>
          {/* Net price — only when > 0 */}
          {totalPriceNet > 0 && (
            <div className="leading-none">
              <span className="text-[10px] text-muted uppercase tracking-wide">รวม</span>{" "}
              <span className="text-base md:text-lg font-bold text-red-600 notranslate">
                {numberFormat2(totalPriceNet)} บ.
              </span>
            </div>
          )}
        </div>

        {/* Right — actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Cancel — only on status=1 and not from order ref (legacy
              deleteForwarder.php gate). P1-19 — calls cancelOwnForwarder. */}
          {row.fstatus === "1" && (!row.reforder || row.reforder === "") && (
            <CancelForwarderButton id={row.id} />
          )}
          {/* View details */}
          <a
            href={`/service-import/${row.id}`}
            className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 px-3 py-1.5 text-xs font-bold hover:bg-emerald-100 active:scale-[0.98] transition-all"
          >
            ดูรายละเอียด
          </a>
          {/* Pay — only when status=5 or credit=1 */}
          {(row.fstatus === "5" || row.fcredit === "1") && (
            <a
              href={`/service-import/${row.id}?pay=true`}
              className="inline-flex items-center gap-1 rounded-full bg-red-600 text-white px-3 py-1.5 text-xs font-bold hover:bg-red-700 active:scale-[0.98] transition-all shadow-sm"
            >
              ✓ ชำระเงิน
            </a>
          )}
        </div>
      </footer>

      {/* Credit dates — only on q=='c' */}
      {q === "c" && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-2 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">วันที่ให้เครดิต</div>
            <div className="text-xs font-medium text-foreground notranslate">
              {row.fdatestatus5 ? dmy(row.fdatestatus5) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted">วันที่ครบกำหนด</div>
            <div className="text-xs font-medium text-foreground notranslate">
              {row.fcreditdate ? dmy(row.fcreditdate) : "—"}
            </div>
            {row.fcreditdate && diffDateTimeNow(row.fcreditdate) && (
              <div className="mt-1 inline-flex items-center rounded-full bg-red-600 text-white text-[10px] font-bold px-2 py-0.5">
                {diffDateTimeNow(row.fcreditdate)}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
