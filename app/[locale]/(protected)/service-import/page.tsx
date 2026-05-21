import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ForwarderInteractivity,
  type ForwarderRowMeta,
} from "./forwarder-interactivity";

/**
 * Customer ฝากนำเข้าสินค้า (import / forwarder) screen — a FAITHFUL
 * 1:1 TRANSCRIPTION of the legacy PCS Cargo `member/forwarder.php`
 * default view (no `?page` query — the same view `?page=add` shows,
 * which only additionally pops the add-modal open) (D1 / ADR-0017 ·
 * the faithful-port transcription workstream · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `forwarder.php` renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order.
 * The visual identity comes from the legacy stylesheets, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/service-import.css`, loaded via a plain `<link>`
 * so it bypasses the app's Tailwind v4 / PostCSS pipeline.
 *
 * `forwarder.php` source structure transcribed here (lines 430-1058):
 *   <link>s + <title>  (L430-436)
 *   .app-content > .content-wrapper > .content-body.pr110
 *     — if a `tb_corporate` row exists with corporateStatus<>1:
 *         the "รอเจ้าหน้าที่ดำเนิน อนุมัติ..." red block (L874)
 *     — else the full screen (L454-870):
 *       section > .row > .col-md-12 > .card.border-black
 *         > .card-content > .card-body.p-1
 *           1. tab strip: เต็ม / ตาราง  +  เพิ่มรายการนำเข้า button
 *           2. "สถานะรายการ" status-filter tabs (ทั้งหมด / q=1..7 / 6.1 / c)
 *           3. (cond.) "โปรเหมาๆ" headShake strip
 *           4. <form id=frm-example2> > #myTable list table
 *           5. (cond.) the "รวมบิลจ่าย" PCSF promo strip
 *           6. .b-pay bottom fixed pay-bar
 *   #add-forwarder modal     (L881-1039) — สร้างออเดอร์ฝากนำเข้าสินค้า
 *   #pro-maomao modal        (L1041-1058) — PCS เหมาๆ promotion popup
 *
 * Data — every `forwarder.php` mysqli query transcribed 1:1 to the
 * ported legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to
 * service_role, so reads go through the admin client; the join key
 * is `tb_*.userid === profile.member_code` (the customer's "PR<n>"
 * code). The `tb_*` map is `docs/research/wave-1-fidelity/_SYNTHESIS.md`
 * §7.
 *   - corporate check     → tb_corporate (forwarder.php L450)
 *   - status count groups → tb_forwarder GROUP BY fStatus (L491)
 *   - driver-item count   → tb_forwarder_driver_item ⋈ tb_forwarder (L501)
 *   - credit count        → tb_forwarder fCredit=1 (L511)
 *   - the list table      → tb_forwarder ⋈ tb_forwarder_driver_item
 *                           ⋈ tb_promotion (L635-662)
 *   - PCSF count          → tb_forwarder fShipBy=PCSF fStatus=5 (L439)
 *   - the address <select> → tb_address ⋈ tb_address_main (L979)
 *   - header.php counts   → tb_forwarder (header.php L100-101)
 *
 * Rebrand: legacy `PCS<n>` → `PR<n>` (member codes) + "PCS Cargo" →
 * "PR Cargo" branding text only. Nothing else changed.
 *
 * ── NOT transcribed 1:1 (deliberate · flagged for the integrator) ──
 *  1. forwarder.php L9-427 is a large POST handler — `save` (INSERT
 *     tb_forwarder + image upload), `paymentForwarderNew` (INSERT
 *     tb_wallet_hs + UPDATE tb_forwarder + move_uploaded_file +
 *     LINE Notify). A Server Component render must be a PURE READ —
 *     these render-time writes are NOT reproduced. They belong on
 *     Server Actions; the add-modal `<form>` + the pay-bar are
 *     rendered 1:1 as the visible surface, the submit is UNWIRED
 *     (FLAGGED). The legacy create flow + the multi-bill pay flow
 *     are follow-up Server Actions.
 *  2. header.php L75-85 runs an `UPDATE tb_header_order` on every
 *     page load (auto-expire overdue orders) — render-time mutation,
 *     NOT reproduced.
 *  3. forwarder.php L1581 `saveHS()` is a visit-log INSERT — a
 *     render-time write, NOT reproduced.
 *  4. The `#myTable` list is a legacy jQuery DataTables grid
 *     (sortable / row-checkboxes / per-table options — forwarder.php
 *     L1280-1336). DataTables JS is NOT in the (protected) layout's
 *     vendor bundle; the table is rendered statically (markup keeps
 *     the `#myTable .dataTable` classes so the CSS looks identical at
 *     rest). The legacy URL filter `?q=` is exposed as a `searchParams`
 *     prop — exactly the per-`q` SQL branches the legacy uses. The
 *     row-select-checkbox column + the live "ยอดชำระรวม" recompute
 *     (`calPrice.php` AJAX) are UNWIRED (FLAGGED).
 *  5. The two modals' markup IS transcribed 1:1 and the Bootstrap-4
 *     `data-toggle="modal"` open/close works (the vendor JS is staged
 *     globally by the (protected) layout). Their jQuery extras —
 *     dropify file inputs, the `getShipBy()` / `checkPCSMaoMao()`
 *     AJAX that fills `#selectShipBy`, the SweetAlert result popups,
 *     `deleteForwarder()` — need client JS not present here; those
 *     are UNWIRED (FLAGGED). The modal renders statically.
 *  6. forwarder.php L2 `require_once('include/header.php')` resolves
 *     the customer + redirects guests. Pacred's `(protected)` layout
 *     + `getCurrentUserWithProfile()` is the equivalent auth gate.
 */

// Legacy `statusForwarderAll2($fStatus,$fStatusDriver)` —
// member/include/function.php L527-544. Returns the Thai status
// badge + the matching status icon. The icons are referenced at the
// legacy absolute CDN URLs the helper itself emits (faithful — the
// legacy renders these exact URLs).
function StatusForwarderAll2({
  fStatus,
  fStatusDriver,
}: {
  fStatus: string | null;
  fStatusDriver: number;
}) {
  const ICON_BASE =
    "https://pcscargo.co.th/member/assets/images/icon/forwarder/";
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
function nameTransportType(transportType: string | null): string {
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
  PCS: "รับเองโกดัง PCS กทม", F: "บริษัทจัดหาให้อัตโนมัติ",
  PCSF: "PCS เหมาเหมา", PCSE: "PCS Express",
};
function nameShipBy(fShipBy: string | null): string {
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
function convertIMGCHN(url: string | null, size: string): string {
  if (!url || url === "") {
    // legacy: basePath.'images/shops/default.png'
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
  // a bare filename — legacy stores forwarder covers under images/shops/
  u = `https://pcscargo.co.th/member/images/shops/${u}`;
  return u;
}

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// PHP `DATE_FORMAT(fDate,'%d/%m/%Y %T')` — d/m/Y H:i:s of a timestamp.
function dmyHms(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// PHP `DATE(x)` → d/m/Y, and `TIME(x)` → H:i:s of a timestamp.
function dmy(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function hms(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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

// A forwarder list row, normalised to the legacy `$row` shape the
// table loop (forwarder.php L666-815) consumes.
type ForwarderRow = {
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

export default async function ServiceImportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // ── forwarder.php L450 — corporate check ──
  // SELECT ID FROM tb_corporate WHERE userID=… AND corporateStatus=1
  // (the screen renders fully only if NO row OR the row is approved).
  const { data: corpRows } = await admin
    .from("tb_corporate")
    .select("id, corporatestatus")
    .eq("userid", memberCode);
  const corpStatus1Count = (corpRows ?? []).filter(
    (r) => String((r as { corporatestatus: string | null }).corporatestatus) === "1",
  ).length;
  // forwarder.php L452 — the legacy `if ($resultCompS1->num_rows == 0)`
  // gate: the full screen shows when there is no APPROVED corporate row.
  const showFullScreen = corpStatus1Count === 0;

  // ── forwarder.php L439 — PCSF rows awaiting payment ──
  const { count: countPricePCSFDatabase } = await admin
    .from("tb_forwarder")
    .select("id", { count: "exact", head: true })
    .eq("userid", memberCode)
    .eq("fshipby", "PCSF")
    .eq("fstatus", "5");

  // ── header.php L100-101 — counts ──
  const { count: countForwarder5 } = await admin
    .from("tb_forwarder")
    .select("id", { count: "exact", head: true })
    .eq("userid", memberCode)
    .eq("fstatus", "5");

  // ── header.php L113-122 — credit user check ──
  const { data: creditRow } = await admin
    .from("tb_credit")
    .select("creditvalue")
    .eq("userid", memberCode)
    .maybeSingle<{ creditvalue: number }>();
  const creditUser = creditRow ? 1 : 0;

  // ── forwarder.php L491-499 — status counts (GROUP BY fStatus) ──
  // arrStatus[0..7]
  const { data: allForwardersForCount } = await admin
    .from("tb_forwarder")
    .select("fstatus")
    .eq("userid", memberCode);
  const arrStatus = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const r of (allForwardersForCount ?? []) as { fstatus: string | null }[]) {
    const s = Number(r.fstatus);
    if (s >= 0 && s <= 7) arrStatus[s] += 1;
  }
  const arrStatusSum = arrStatus.reduce((a, b) => a + b, 0);
  const countStatusF5 = arrStatus[5];

  // ── forwarder.php L501-510 — driver-item count (out-for-delivery) ──
  // SELECT f.ID FROM tb_forwarder_driver_item fdi
  //   LEFT JOIN tb_forwarder f ON fdi.fID=f.ID WHERE fdiStatus='' AND userID=…
  const { data: fdiRows } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid, fdistatus")
    .eq("fdistatus", "");
  const fdiFidSet = new Set(
    ((fdiRows ?? []) as { fid: number; fdistatus: string | null }[]).map(
      (r) => r.fid,
    ),
  );
  // resolve which of THOSE fids belong to this customer (legacy joins
  // f.userID into the same query)
  const arrFidDriver = new Set<number>();
  if (fdiFidSet.size > 0) {
    const { data: ownDriverFwd } = await admin
      .from("tb_forwarder")
      .select("id")
      .eq("userid", memberCode)
      .in("id", Array.from(fdiFidSet));
    for (const r of (ownDriverFwd ?? []) as { id: number }[]) {
      arrFidDriver.add(r.id);
    }
  }
  const statusDriverItem = arrFidDriver.size;

  // ── forwarder.php L511-514 — credit-row count ──
  const { count: fCreditCount } = await admin
    .from("tb_forwarder")
    .select("id", { count: "exact", head: true })
    .eq("userid", memberCode)
    .eq("fcredit", "1");

  // ── forwarder.php L635-662 — the list table query ──
  // SELECT … FROM tb_forwarder f
  //   LEFT JOIN tb_forwarder_driver_item fdi ON f.ID=fdi.fID AND fdiStatus<>'3'
  //   LEFT JOIN tb_promotion po ON po.fID=f.ID
  //   WHERE userID=… [AND fStatus=q | fCredit=1] GROUP BY f.ID
  // (PostgREST can't express that aggregating join in one select, so
  // the per-`q` WHERE is run on tb_forwarder and the promotion id is
  // looked up per row — the legacy GROUP BY f.ID collapses dup join
  // rows to one anyway.)
  let listQuery = admin
    .from("tb_forwarder")
    .select(
      "id, fdate, fstatus, ftrackingchn, ftrackingchn2, ftrackingth, ftransporttype, fshipby, fdetail, fcover, famount, fweight, fvolume, ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fusercompany, fcredit, fcreditdate, fdatestatus5, fdatetothai, fcabinetnumber, fdatecontainerclose, fnote, fnoteuser, reforder, adminidcreator",
    )
    .eq("userid", memberCode);
  switch (q) {
    case "1": listQuery = listQuery.eq("fstatus", "1"); break;
    case "2": listQuery = listQuery.eq("fstatus", "2"); break;
    case "3": listQuery = listQuery.eq("fstatus", "3"); break;
    case "4": listQuery = listQuery.eq("fstatus", "4"); break;
    case "5": listQuery = listQuery.eq("fstatus", "5"); break;
    case "6":
      // L651 — fStatus=6 AND (fdiStatus<>'' OR fdiStatus is NULL)
      listQuery = listQuery.eq("fstatus", "6");
      break;
    case "6.1":
      // L652 — fStatus=6 AND fdiStatus=''
      listQuery = listQuery.eq("fstatus", "6");
      break;
    case "7": listQuery = listQuery.eq("fstatus", "7"); break;
    case "c": listQuery = listQuery.eq("fcredit", "1"); break;
    default: break;
  }
  const { data: listRows } = await listQuery;

  // promotion ids for the rows on screen (tb_promotion po.fID=f.ID)
  const rowIds = ((listRows ?? []) as { id: number }[]).map((r) => r.id);
  const promoByFid = new Map<number, string>();
  if (rowIds.length > 0) {
    const { data: promoRows } = await admin
      .from("tb_promotion")
      .select("fid, promoid")
      .in("fid", rowIds);
    for (const r of (promoRows ?? []) as {
      fid: number;
      promoid: number | null;
    }[]) {
      if (r.promoid != null) promoByFid.set(r.fid, String(r.promoid));
    }
  }

  // Normalise + apply the legacy q=6 / q=6.1 fdiStatus sub-filter
  // (L651/L652) — q=6 keeps rows NOT in the "out-for-delivery" set,
  // q=6.1 keeps only rows IN it.
  let rows: ForwarderRow[] = ((listRows ?? []) as Record<string, unknown>[]).map(
    (r) => ({
      id: Number(r.id),
      fdate: (r.fdate as string) ?? null,
      fstatus: (r.fstatus as string) ?? null,
      ftrackingchn: (r.ftrackingchn as string) ?? null,
      ftrackingchn2: (r.ftrackingchn2 as string) ?? null,
      ftrackingth: (r.ftrackingth as string) ?? null,
      ftransporttype: (r.ftransporttype as string) ?? null,
      fshipby: (r.fshipby as string) ?? null,
      fdetail: (r.fdetail as string) ?? null,
      fcover: (r.fcover as string) ?? null,
      famount: Number(r.famount ?? 0),
      fweight: Number(r.fweight ?? 0),
      fvolume: Number(r.fvolume ?? 0),
      ftotalprice: Number(r.ftotalprice ?? 0),
      ftransportprice: Number(r.ftransportprice ?? 0),
      fpriceupdate: Number(r.fpriceupdate ?? 0),
      fdiscount: Number(r.fdiscount ?? 0),
      fshippingservice: Number(r.fshippingservice ?? 0),
      pricecrate: Number(r.pricecrate ?? 0),
      ftransportpricechnthb: Number(r.ftransportpricechnthb ?? 0),
      priceother: Number(r.priceother ?? 0),
      fusercompany: (r.fusercompany as string) ?? null,
      fcredit: (r.fcredit as string) ?? null,
      fcreditdate: (r.fcreditdate as string) ?? null,
      fdatestatus5: (r.fdatestatus5 as string) ?? null,
      fdatetothai: (r.fdatetothai as string) ?? null,
      fcabinetnumber: (r.fcabinetnumber as string) ?? null,
      fdatecontainerclose: (r.fdatecontainerclose as string) ?? null,
      fnote: (r.fnote as string) ?? null,
      fnoteuser: (r.fnoteuser as string) ?? null,
      reforder: (r.reforder as string) ?? null,
      adminidcreator: (r.adminidcreator as string) ?? null,
      promoid: promoByFid.get(Number(r.id)) ?? null,
    }),
  );
  if (q === "6") {
    rows = rows.filter((r) => !arrFidDriver.has(r.id));
  } else if (q === "6.1") {
    rows = rows.filter((r) => arrFidDriver.has(r.id));
  }
  // legacy: ORDER BY (DataTables) order [[1,'desc']] = วันที่สร้าง desc
  rows.sort((a, b) => {
    const ta = a.fdate ? new Date(a.fdate.replace(" ", "T")).getTime() : 0;
    const tb = b.fdate ? new Date(b.fdate.replace(" ", "T")).getTime() : 0;
    return tb - ta;
  });
  // legacy `$countID` (forwarder.php L671) — the row count used by
  // the DataTables countID comparator at L1403. The pay-bar in the
  // <ForwarderInteractivity> client component derives this from
  // `rowsMeta.length` directly; the legacy variable is kept here as
  // a comment for the fidelity record.

  // ── Pre-compute the row meta passed to <ForwarderInteractivity> ──
  // The client checkbox needs `eligibleForPay` (matches calPrice.php
  // L21 `fStatus='5' OR fCredit=1`) + `totalPriceNet` (the legacy
  // per-row total — calPriceForwarderSumCompany; the live pay-bar
  // shows the SUM of selected eligible rows). The action server-side
  // re-computes the canonical figure with the +50฿ + -1% adjustments
  // (calPrice.php L40-45); these client-side numbers are only the
  // optimistic display while the action call is in flight.
  const rowsMeta: ForwarderRowMeta[] = rows.map((r) => ({
    id: r.id,
    totalPriceNet: calPriceForwarderSumCompany(
      r.fusercompany,
      r.fpriceupdate,
      r.ftotalprice,
      r.ftransportprice,
      r.fshippingservice,
      r.fdiscount,
      r.pricecrate,
      r.ftransportpricechnthb,
      r.priceother,
    ),
    eligibleForPay: r.fstatus === "5" || r.fcredit === "1",
  }));

  // ── forwarder.php L979-997 — the modal address <select> ──
  // main address first, then the rest; legacy ⋈ tb_address_main.
  const { data: mainAddrLink } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number }>();
  let mainAddress: { addressid: number; full: string } | null = null;
  const otherAddresses: { addressid: number; full: string }[] = [];
  const fmtAddr = (a: Record<string, unknown>) =>
    `${a.addressname ?? ""} ${a.addresslastname ?? ""} ${a.addressno ?? ""} ตำบล/แขวง ${a.addresssubdistrict ?? ""} อำเภอ/เขต ${a.addressdistrict ?? ""} จังหวัด ${a.addressprovince ?? ""} ${a.addresszipcode ?? ""}`;
  if (mainAddrLink?.addressid != null) {
    const { data: mainAddrRow } = await admin
      .from("tb_address")
      .select(
        "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
      )
      .eq("addressid", mainAddrLink.addressid)
      .maybeSingle<Record<string, unknown>>();
    if (mainAddrRow) {
      mainAddress = {
        addressid: Number(mainAddrRow.addressid),
        full: fmtAddr(mainAddrRow),
      };
    }
    const { data: restAddrRows } = await admin
      .from("tb_address")
      .select(
        "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
      )
      .eq("userid", memberCode)
      .eq("addressstatus", "1")
      .neq("addressid", mainAddrLink.addressid);
    for (const a of (restAddrRows ?? []) as Record<string, unknown>[]) {
      otherAddresses.push({
        addressid: Number(a.addressid),
        full: fmtAddr(a),
      });
    }
  }

  // forwarder.php L600 — show the PCS-เหมาๆ promo strip when there are
  // status-5 rows OR the q=5 filter is active.
  const showMaoStrip = countStatusF5 > 0 || q === "5";
  // forwarder.php L841 — the bottom pay-bar visibility condition.
  const showPayBar =
    (countForwarder5 ?? 0) > 0 || q === "" || q === "5" || q === "c";

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheets — static public/ assets, loaded via a
          plain <link> so they bypass the app's Tailwind/PostCSS
          pipeline. forwarder.php L430-435 loads the DataTables /
          dropify / magnific-popup / animate plugin CSS + its own
          forwarder.css; all the rules the screen actually renders
          with are consolidated verbatim into service-import.css. */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />

      {/* forwarder.php <title> L436 (Next.js owns <head> — kept here
          as a comment for the fidelity record):
          รายการฝากนำเข้า | PR Cargo */}

      {/* BEGIN: Content — forwarder.php L443 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body pr110">
            {/* forwarder.php L452 — corporate gate */}
            {!showFullScreen ? (
              // forwarder.php L874 — pending corporate-approval block
              <div className="text-center">
                <h2
                  style={{ maxWidth: "670px", margin: "auto", marginTop: "10%" }}
                  className="text-white bg-danger p-1"
                >
                  รอเจ้าหน้าที่ดำเนิน อนุมัติการเป็นนิติบุคคล ภายใน 24 ชม.{" "}
                  <br /> (ยกเว้นวันอาทิตย์และวันหยุดนักขัตฤกษ์)
                </h2>
              </div>
            ) : (
              <section>
                <div className="row">
                  <div className="col-md-12 col-sm-12">
                    <div className="card border-black">
                      <div className="card-content">
                        <div className="card-body p-1">
                          {/* ── tab strip + add button — L460-489 ── */}
                          <div className="row">
                            <div className="content-header-left col-md-8 col-12">
                              <div className="text-center text-md-left">
                                <ul className="nav nav-tabs nav-underline pcs-tabs">
                                  <li className="nav-item tab-sm-center">
                                    <Link className="nav-link active" href="/service-import">
                                      <h3 className="text-center text-md-left active">
                                        <span className="ft-box"></span> รายการฝากนำเข้าสินค้าแบบเต็ม
                                      </h3>
                                    </Link>
                                  </li>
                                  <li className="nav-item tab-sm-center">
                                    <Link className="nav-link" href="/service-import/table">
                                      <h3 className="text-center text-md-left">
                                        <span className="fas fa-table"></span> รายการฝากนำเข้าสินค้าแบบตาราง
                                      </h3>
                                    </Link>
                                  </li>
                                </ul>
                              </div>
                            </div>
                            <div className="content-header-right col-md-4 col-12">
                              <div className="float-md-right">
                                <div className="text-center text-md-right">
                                  <a href="#add-forwarder" data-toggle="modal" data-target="#add-forwarder">
                                    <button className="btn btn-sm btn-circle btn-success text-white">
                                      <i className="ft-plus"></i>
                                    </button>
                                    <span className="font-normal text-dark lang-add-forwarder">
                                      เพิ่มรายการนำเข้า
                                    </span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* ── status-filter tabs — L516-592 ── */}
                          <div className="row">
                            <div className="col-12 p-m-0">
                              <h4 className="text-color">
                                <b>สถานะรายการ</b>
                              </h4>
                              <ul className="nav nav-tabs nav-underline pcs-tabs">
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import">
                                    ทั้งหมด
                                    {arrStatusSum > 0 && (
                                      <div className="pcs-badge2 badge-secondary pcs-badge-pill">
                                        {arrStatusSum}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import?q=1">
                                    รอเข้าโกดัง
                                    {arrStatus[1] > 0 && (
                                      <div className="pcs-badge2 badge-warning pcs-badge-pill">
                                        {arrStatus[1]}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import?q=2">
                                    ถึงโกดังจีนแล้ว
                                    {arrStatus[2] > 0 && (
                                      <div className="pcs-badge2 badge-info pcs-badge-pill">
                                        {arrStatus[2]}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import?q=3">
                                    กำลังส่งมาไทย
                                    {arrStatus[3] > 0 && (
                                      <div className="pcs-badge2 badge-pink pcs-badge-pill">
                                        {arrStatus[3]}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import?q=4">
                                    ถึงไทยแล้ว
                                    {arrStatus[4] > 0 && (
                                      <div className="pcs-badge2 badge-brown pcs-badge-pill">
                                        {arrStatus[4]}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import?q=5">
                                    รอชำระเงิน
                                    {arrStatus[5] > 0 && (
                                      <div className="pcs-badge2 badge-danger pcs-badge-pill">
                                        {arrStatus[5]}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import?q=6">
                                    เตรียมส่ง
                                    {arrStatus[6] - statusDriverItem > 0 && (
                                      <div className="pcs-badge2 badge-primary pcs-badge-pill">
                                        {arrStatus[6] - statusDriverItem}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import?q=6.1">
                                    กำลังจัดส่ง
                                    {statusDriverItem > 0 && (
                                      <div className="pcs-badge2 badge-info2 pcs-badge-pill">
                                        {statusDriverItem}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import?q=7">
                                    ส่งแล้ว
                                    {arrStatus[7] > 0 && (
                                      <div className="pcs-badge2 badge-success pcs-badge-pill">
                                        {arrStatus[7]}
                                      </div>
                                    )}
                                  </Link>
                                </li>
                                {creditUser === 1 && (
                                  <li className="nav-item">
                                    <Link className="nav-link" href="/service-import?q=c">
                                      เครดิตสินค้า
                                      {(fCreditCount ?? 0) > 0 && (
                                        <div className="pcs-badge badge-danger pcs-badge-pill">
                                          {fCreditCount}
                                        </div>
                                      )}
                                    </Link>
                                  </li>
                                )}
                              </ul>
                              <div className="p-m-0">
                                <div className="hr-dashed"></div>
                                {/* forwarder.php L595 <form id="frm-example2">.
                                    Row checkboxes + the live pay-bar
                                    (forwarder.php L1280-1409) are
                                    delegated to <ForwarderInteractivity>
                                    — the table head + pre/post strips
                                    stay SSR. Selected-id form submit
                                    behaviour (the legacy POST id[])
                                    is NOT wired (FLAGGED in file
                                    header §4); the "ชำระเงิน" button
                                    on the bottom bar currently no-ops
                                    and the per-row "ชำระเงิน" link in
                                    the row's ตัวเลือก column is the
                                    working fallback. */}
                                <ForwarderInteractivity
                                  rowsMeta={rowsMeta}
                                  columnCount={q === "c" ? 10 : 8}
                                  q={q}
                                  showPayBar={showPayBar}
                                  showPayStrip={countStatusF5 > 0}
                                  tableHead={
                                    <thead>
                                      <tr className="text-center bg-danger2">
                                        <th className="all add-text-all">ID</th>
                                        <th className="none">วันที่สร้าง</th>
                                        <th className="all">รายละเอียด</th>
                                        <th className="none">ค่าขนส่ง</th>
                                        <th className="none">เลขแทรคกิ้งจีน</th>
                                        <th className="none">เลขพัสดุ (ไทย)</th>
                                        <th className="none">สถานะ</th>
                                        {q === "c" && (
                                          <>
                                            <th className="bg-danger3">วันที่ให้เครดิต</th>
                                            <th className="bg-danger3">วันที่ครบกำหนด</th>
                                          </>
                                        )}
                                        <th className="none">ตัวเลือก</th>
                                      </tr>
                                    </thead>
                                  }
                                  aboveTable={
                                    showMaoStrip && (
                                      <div className="row">
                                        <div className="col-md-6 offset-md-3">
                                          <div className="p-1 bg-main text-center text-white animate__animated animate__infinite animate__headShake">
                                            โปรเหมาๆ
                                            <br />
                                            “หากลูกค้าชำระค่าขนส่งในไทยก่อนเวลา 00.00 น. บริษัทฯ จะจัดส่งสินค้าให้ภายใน 1-3 วันทำการ นับจากวันที่ชำค่าขนส่ง”
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  }
                                  belowTable={
                                    countStatusF5 > 0 &&
                                    (countPricePCSFDatabase ?? 0) > 1 && (
                                      <div className="m-1 p-1 bg-main text-white animate__animated animate__infinite animate__headShake">
                                        คุณมีรายการรอชำระเงินที่ใช้ PR เหมาๆ มากกว่า 1 รายการ การรวมบิลจ่ายจะช่วยให้คุณได้รับส่วนลด
                                      </div>
                                    )
                                  }
                                  renderRow={(rowId, firstCellPrefix) => {
                                    const row = rows.find((r) => r.id === rowId);
                                    if (!row) return null;
                                    return (
                                      <ForwarderRowView
                                        key={row.id}
                                        row={row}
                                        q={q}
                                        arrFidDriver={arrFidDriver}
                                        firstCellPrefix={firstCellPrefix}
                                      />
                                    );
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
      {/* END: Content — forwarder.php L880 */}

      {/* ── #add-forwarder modal — forwarder.php L881-1039 ──
          Transcribed 1:1. The Bootstrap-4 data-toggle open/close works
          (vendor JS staged globally by the (protected) layout). The
          jQuery extras — dropify · the getShipBy()/checkPCSMaoMao()
          AJAX that fills #selectShipBy · the create POST — are NOT
          wired here (see file header §1 + §5). */}
      <div
        id="add-forwarder"
        className="modal fade in"
        tabIndex={-1}
        role="dialog"
        aria-hidden="true"
      >
        <div className="modal-dialog">
          <div className="modal-content header-from">
            <div className="modal-header">
              <h4 className="modal-title">สร้างออเดอร์ฝากนำเข้าสินค้า</h4>
              <div className="float-right text-right">
                <a
                  href="/china-address"
                  target="_blank"
                  rel="noreferrer"
                  className="p-05 text-white badge badge-sale badge-pill font-1rem"
                >
                  ที่อยู่โกดังจีน
                </a>
                <a
                  href="/services/import-china"
                  target="_blank"
                  rel="noreferrer"
                  className="p-05 text-white badge badge-warning badge-pill font-1rem"
                >
                  เช็คเรทนำเข้า
                </a>
              </div>
              <button
                type="button"
                className="close"
                data-dismiss="modal"
                aria-hidden="true"
              >
                <i className="la la-close"> </i>
              </button>
            </div>
            <div className="modal-body header-from">
              {/* TODO(server-action): the legacy `save` POST (forwarder.php
                  L9-427) INSERTs tb_forwarder + uploads fCover. A Server
                  Component render is a pure read — the submit is unwired;
                  port it to a "use server" action that writes tb_forwarder. */}
              <form
                className="form-horizontal"
                method="POST"
                action="/service-import"
                encType="multipart/form-data"
                autoComplete="off"
              >
                <div className="form-group mb-0">
                  <div className="ele-forwarder-detail">
                    <h5 className="text-center">
                      <b>ข้อมูลการฝากนำเข้า</b>
                    </h5>
                    <div className="mb-05">
                      <label className="form-control-label" htmlFor="fTrackingCHN">
                        เลข Tracking
                      </label>
                      <input
                        className="form-control form-control-lg"
                        name="fTrackingCHN"
                        id="fTrackingCHN"
                        type="text"
                        placeholder="เลข Tracking"
                        maxLength={50}
                        required
                      />
                      <div id="message"></div>
                    </div>
                    <div className="row pr-1 pl-1 mb-05">
                      <div className="col-md-6 p-05">
                        <div className="">
                          <label className="form-control-label" htmlFor="fDetail">
                            รายละเอียด
                          </label>
                          <textarea
                            className="form-control"
                            rows={5}
                            name="fDetail"
                            placeholder="รายละเอียด"
                            maxLength={500}
                            required
                          ></textarea>
                        </div>
                      </div>
                      <div className="col-md-6 p-05">
                        <div className="">
                          <label className="form-control-label" htmlFor="fCover">
                            รูปสินค้า (ไม่บังคับ)
                          </label>
                          <div className="fallback">
                            <input
                              type="file"
                              name="fCover"
                              className="dropify"
                              accept="image/*"
                              data-max-file-size="9M"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mb-1">
                      <label className="form-control-label" htmlFor="fAmount">
                        จำนวนกล่อง
                      </label>
                      <input
                        className="form-control form-control-lg"
                        name="fAmount"
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        pattern="\d*"
                        defaultValue="1"
                        required
                      />
                    </div>
                  </div>

                  <div className="mt-2 ele-forwarder-china-thai">
                    <h5 className="text-center">
                      <b>
                        การขนส่งจากจีนมาไทย{" "}
                        <i className="flag-icon flag-icon-ch"></i>
                      </b>
                    </h5>
                    <div className="row">
                      <div className="col-md-12">
                        <label
                          className="form-control-label mb-0"
                          htmlFor="hTransportType"
                        >
                          รูปแบบการขนส่งจีน-ไทย
                        </label>
                        <div className="row pr-1 pl-1">
                          <div className="col-md-6 p-05">
                            <fieldset
                              className="border-checkbox-transportType border-checkbox cursor-pointer"
                              data-for="transportType-ek"
                            >
                              <input
                                type="radio"
                                className="radio-custom radio-custom-transportType cursor-pointer"
                                name="hTransportType"
                                value="1"
                                id="transportType-ek"
                              />
                              <label
                                htmlFor="transportType-ek"
                                className="cursor-pointer radio-custom-label"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  className="img-fluid"
                                  src="/legacy/pcs/theme/transport-car-v3.png"
                                  style={{ maxHeight: "35px" }}
                                  alt=""
                                />
                                รถ (EK) 5-7 วัน
                              </label>
                            </fieldset>
                          </div>
                          <div className="col-md-6 p-05">
                            <fieldset
                              className="border-checkbox-transportType border-checkbox cursor-pointer"
                              data-for="transportType-sea"
                            >
                              <input
                                type="radio"
                                className="radio-custom radio-custom-transportType cursor-pointer"
                                name="hTransportType"
                                value="2"
                                id="transportType-sea"
                              />
                              <label
                                htmlFor="transportType-sea"
                                className="cursor-pointer radio-custom-label"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  className="img-fluid"
                                  src="/legacy/pcs/theme/transport-sea-v3.png"
                                  style={{ maxHeight: "35px" }}
                                  alt=""
                                />
                                เรือ (SEA) 12-16 วัน
                              </label>
                            </fieldset>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-12">
                        <label
                          className="pt-05 form-control-label mb-0"
                          htmlFor="hTransportType"
                        >
                          การตีลังไม้สินค้า
                        </label>
                        <div className="row pr-1 pl-1">
                          <div className="col-md-6 p-05">
                            <fieldset
                              className="border-checkbox-crate border-checkbox cursor-pointer active box-shadow"
                              data-for="crate-1"
                            >
                              <input
                                type="radio"
                                className="radio-custom radio-custom-crate cursor-pointer"
                                name="crate"
                                value="2"
                                id="crate-1"
                                defaultChecked
                              />
                              <label
                                htmlFor="crate-1"
                                className="cursor-pointer radio-custom-label"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  className="img-fluid"
                                  src="/legacy/pcs/theme/uncrate-v3.png"
                                  style={{ maxHeight: "35px" }}
                                  alt=""
                                />
                                ไม่ตีลังไม้
                              </label>
                            </fieldset>
                          </div>
                          <div className="col-md-6 p-05">
                            <fieldset
                              className="border-checkbox-crate border-checkbox cursor-pointer"
                              data-for="crate-2"
                            >
                              <input
                                type="radio"
                                className="radio-custom radio-custom-crate cursor-pointer"
                                name="crate"
                                value="1"
                                id="crate-2"
                              />
                              <label
                                htmlFor="crate-2"
                                className="cursor-pointer radio-custom-label"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  className="img-fluid"
                                  src="/legacy/pcs/theme/crate-v3.png"
                                  style={{ maxHeight: "35px" }}
                                  alt=""
                                />
                                ตีลังไม้ (มีค่าบริการ)
                              </label>
                            </fieldset>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 ele-forwarder-thai">
                    <h5 className="text-center mb-05">
                      <b>
                        ที่อยู่ในการจัดส่งในไทย{" "}
                        <i className="flag-icon flag-icon-th"></i>
                      </b>{" "}
                      {/* Legacy linked to pcscargo.co.th/member/address/add/
                          — rewritten to the internal Pacred /addresses
                          page so the customer stays inside Pacred. */}
                      <Link
                        href="/addresses"
                        target="_blank"
                        className="text-info font-0_85rem"
                      >
                        เพิ่มที่อยู่ใหม่ <i className="fa fa-plus"></i>
                      </Link>
                    </h5>
                    <select className="form-control" name="addressID" id="addressID" required>
                      <option value="">กรุณาเลือกที่อยู่ในการจัดส่ง</option>
                      {mainAddress && (
                        <option value={mainAddress.addressid}>
                          [ที่อยู่หลัก] {mainAddress.full}
                        </option>
                      )}
                      {mainAddress &&
                        otherAddresses.map((a) => (
                          <option key={a.addressid} value={a.addressid}>
                            {a.full}
                          </option>
                        ))}
                      <option value="PCS">รับเองหน้าโกดัง PCS กทม</option>
                    </select>
                    <div className="shipBy-select pt-1 mb-05">
                      <div id="selectShipBy"></div>
                    </div>
                    <div className="text-danger font-0_85rem">
                      หมายเหตุ : หากพื้นที่นอกเขตขนส่งของ PR Cargo ทางบริษัทจะเก็บเงินปลายทางเท่านั้น ยกเว้น แฟลช เอ็กซ์เพรส และ เจแอนด์ที เอ็กซ์เพรส ที่เก็บต้นทางเท่านั้น{" "}
                      <a
                        href="/services/import-china"
                        target="_blank"
                        rel="noreferrer"
                      >
                        (เช็คพื้นที่ได้ที่นี่)
                      </a>
                    </div>
                  </div>

                  <div className="mt-2 ele-forwarder-pro">
                    <h5 className="text-center text-danger mb-05">
                      <b>โปรโมชันสำหรับคุณ</b>
                    </h5>
                    <div className="row">
                      <div className="col-12 col-md-6 maomao">
                        <fieldset className="border-main12-de cursor-pointer">
                          <div className="">
                            <input
                              type="checkbox"
                              className="checkboxes-color"
                              style={{ display: "block" }}
                              name="pro"
                              id="input-12"
                              value="f"
                            />
                          </div>
                          <label htmlFor="input-12" className="text-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className="img-fluid cursor-pointer card-promotion"
                              src="/legacy/pcs/theme/free50-3.png"
                              alt=""
                            />
                            <br />
                            <a
                              href="/services/import-china"
                              target="_blank"
                              rel="noreferrer"
                            >
                              <span className="text-info">
                                ดูพื้นที่จัดส่งและรายละเอียด
                              </span>
                            </a>
                          </label>
                        </fieldset>
                      </div>
                    </div>
                    <div className="" style={{}}>
                      <span className="text-danger font-0_85rem">
                        *หากสินค้ามีขนาดเล็ก บริษัทแนะนำให้เลือกขนส่ง Flash Express (เริ่มต้น 30 บ.)
                        <br />
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 modal-footer">
                    <button
                      type="reset"
                      className="btn btn-outline-secondary round waves-effect"
                      data-dismiss="modal"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      className="btn btn-color-main round waves-effect"
                      name="save"
                      id="btnSubmit"
                    >
                      สร้างออเดอร์
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div id="list-forwarder-data"></div>

      {/* ── #pro-maomao modal — forwarder.php L1041-1058 ──
          Transcribed 1:1; the legacy showPromotionPopUp() that would
          open it is commented out in the legacy too (L1140), so it
          stays closed — faithful. */}
      <div
        id="pro-maomao"
        className="modal fade in"
        tabIndex={-1}
        role="dialog"
        aria-hidden="true"
      >
        <div className="pcs-notify modal-dialog modal-sm">
          <div
            className="modal-content modal-content-pcs"
            style={{ backgroundColor: "unset" }}
          >
            <div className="modal-header">
              <span className="text-white font-1_7rem">
                คุณได้รับสิทธิ์ร่วมโปรโมชัน PR เหมา ๆ{" "}
              </span>
              <button
                type="button"
                className="close text-white"
                data-dismiss="modal"
                aria-hidden="true"
                style={{
                  opacity: 1,
                  border: "2px solid",
                  borderRadius: "20px",
                }}
              >
                <i
                  className="la la-close text-white"
                  style={{ fontSize: "1.5rem" }}
                ></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="bg-pro-valentine">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/legacy/pcs/theme/free50-3.png"
                  className="img-fluid"
                  alt=""
                />
              </div>
              <div
                className="modal-footer text-center"
                style={{ display: "inherit" }}
              >
                <span
                  className="btn btn-main round btn-min-width animate__animated animate__infinite animate__headShake cursor-pointer"
                  id="btn-getMaoMao"
                >
                  รับโปรโมชัน เหมา ๆ
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One forwarder list row — a 1:1 transcription of the markup
 * forwarder.php L678-815 emits per `tb_forwarder` row, including the
 * mobile (.d-block.d-sm-none) + desktop (.pcs-d-pc) detail blocks and
 * the legacy helpers `statusForwarderAll2()`, `nameTransportType()`,
 * `nameShipBy()`, `convertIMGCHN()`, `calPriceForwarderSumCompany()`,
 * `tagPro()`, `diffDateTimeNow()`.
 *
 * Note — the `?ID=` row-highlight (L678) is a DataTables anchor; the
 * legacy reaches it via a `#F<id>` jump after a deep-link. Not part
 * of the default list render and not transcribed.
 */
function ForwarderRowView({
  row,
  q,
  arrFidDriver,
  firstCellPrefix,
}: {
  row: ForwarderRow;
  q: string;
  arrFidDriver: Set<number>;
  /** Client-injected leading content for the first `<td>` (the ID
      cell — column 0 in the legacy DataTables `columnDefs targets:0
      checkboxes selectRow:true` config). The legacy DataTables JS
      overlays a row-select checkbox INTO column 0 at runtime; the
      <ForwarderInteractivity> client wrapper passes that checkbox
      here so the rendered <td> still matches the legacy markup
      structure (checkbox sits next to the ID number). */
  firstCellPrefix?: React.ReactNode;
}) {
  // L672 — fTrackingCHN2 overrides fTrackingCHN when present.
  const trackingChn =
    row.ftrackingchn2 && row.ftrackingchn2 !== ""
      ? row.ftrackingchn2
      : row.ftrackingchn;

  // L697-700 — fStatusDriver = is this row in the out-for-delivery set.
  const fStatusDriver = arrFidDriver.has(row.id) ? 1 : 0;

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
    <tr>
      <td className="text-center tr1 cursor-pointer">
        {firstCellPrefix}
        {row.id}
      </td>
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
    </tr>
  );
}

/**
 * Transcribes the legacy `diffDateTimeNow($datetime2)` helper
 * (member/include/function.php L1074-1093) — the "เครดิตสินค้า" tab
 * shows the elapsed time since the credit due-date as a Thai string.
 * Returns '' when the diff is under a minute (matching the legacy).
 */
function diffDateTimeNow(datetime2: string | null): string {
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
