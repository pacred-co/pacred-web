import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";

/**
 * Import-forwarder list — TABLE VIEW. A FAITHFUL 1:1 TRANSCRIPTION of
 * the legacy PCS Cargo `member/forwarder-table.php` (D1 / ADR-0017 ·
 * faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `forwarder-table.php` renders — same Bootstrap-4
 * elements, same class names, same Thai labels, same column order. The
 * visual identity comes from the legacy CSS, brought in verbatim as the
 * static `.pcs-legacy`-scoped stylesheets, loaded via plain <link>s so
 * they bypass the app's Tailwind v4 / PostCSS pipeline:
 *   - service-import.css   — the shared BS4 + theme chrome base
 *                            (forwarder.php family — grid/card/nav-tabs/
 *                             badge/table/modal/button). Loaded first.
 *   - forwarder-table.css  — forwarder-table.php's own inline <style>
 *                            block (L576-722) + the DataTables wrapper
 *                            chrome. Loaded second so its cascade wins.
 *
 * ── Why this route ───────────────────────────────────────────
 * The legacy `forwarder-table.php` is the SIBLING "table view" of
 * `forwarder.php` (the already-transcribed /service-import). The legacy
 * tab strip toggles between the two:
 *   ฝากนำเข้าสินค้าแบบเต็ม   → forwarder/        → /service-import
 *   ฝากนำเข้าสินค้าแบบตาราง  → forwarder-table/  → /service-import/table  (this)
 * So this lands at /service-import/table, mirroring the legacy
 * forwarder ⋈ forwarder-table relationship 1:1.
 *
 * ── What forwarder-table.php does, and what is transcribed ───
 * The legacy file has two halves:
 *   1. A render-time HTML page (L730-1182) — the status-tab strip,
 *      the search form, the `#myTable` DataTable, the bottom fixed
 *      pay-bar, the add-forwarder modal. THIS is transcribed 1:1.
 *   2. A POST handler block (L37-568) — `?save` (create a forwarder
 *      order) and `?paymentForwarder` (pay selected fStatus=5 orders
 *      from wallet + cash-back, with a top-up-then-pay branch). A
 *      Server Component render is a PURE READ (runbook §9.4) — these
 *      mutations are NOT reproduced here; they are FLAGGED as deferred
 *      Server Actions below.
 *
 * ── Transcribed queries — every forwarder-table.php mysqli SELECT ──
 * 1:1 to the ported legacy `tb_*` schema (Supabase). `tb_*` is
 * RLS-locked to service_role, so reads go through the admin client;
 * the join key is `tb_*.userid === profile.member_code` (the
 * customer's "PR<n>" code — same as the menu.php pilot + /service-import).
 *
 *   - the status-count tabs (L782-791):
 *       SELECT fStatus, COUNT(ID) FROM tb_forwarder
 *       WHERE userID=… GROUP BY fStatus
 *   - the "กำลังจัดส่ง" driver-item count (L793-802):
 *       SELECT f.ID FROM tb_forwarder_driver_item fdi
 *       LEFT JOIN tb_forwarder f ON fdi.fID=f.ID
 *       WHERE fdiStatus='' AND userID=…
 *   - the ล๊อตสินค้า (cabinet) <select> options (L829-836):
 *       SELECT fCabinetNumber … FROM tb_forwarder
 *       WHERE userID=… AND fCabinetNumber<>'' GROUP BY …
 *   - the main table (L743-746, the big SELECT … FROM tb_forwarder f
 *       LEFT JOIN tb_forwarder_driver_item fdi …) — every column the
 *       table renders, filtered by ?q= status + ?fTrackingCHN / ?fCabinetNumber
 *   - the add-forwarder modal address <select> (L1149-1167):
 *       SELECT a.addressID … FROM tb_address a
 *       LEFT JOIN tb_address_main am … (the main address first, then
 *       the rest) — same as forwarder.php's modal.
 *
 * Helper functions transcribed from `member/include/function.php`:
 *   - statusForwarderAll4()       L563-580  — the status badge
 *   - nameProductsType2()         L331-341  — product-type label
 *   - countText()                 L14-..    — UTF-8-aware truncation
 *   - calPriceForwarderSumCompany L1384-1392 — the row net price
 * The legacy `number_format_short()` (forwarder-table.php L9-34) is NOT
 * transcribed — the summary row's total cells render empty server-side
 * (the PHP fills them from DataTables footer-callback JS); port it when
 * that client-side total is wired.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred — incl. the address-pickup option
 * ("รับเองหน้าโกดัง Pacred กทม"). The `value="PCS"` data value on the
 * pickup option stays (it's the DB-stored fShipBy value the legacy
 * tb_*.fshipby rows persist).
 */

export const dynamic = "force-dynamic";

// ── Legacy helper: statusForwarderAll4($fStatus,$fStatusDriver) ──
// member/include/function.php L563-580. The status badge for the
// table's last column. Returns the exact legacy <span> markup.
function statusForwarderAll4(fStatus: string, fStatusDriver: number): React.ReactNode {
  switch (fStatus) {
    case "1":
      return <span className="badge badge-warning badge-pill">รอเข้าโกดังจีน</span>;
    case "2":
      return <span className="badge badge-info badge-pill">ถึงโกดังจีนแล้ว</span>;
    case "3":
      return <span className="badge badge-pink badge-pill">กำลังส่งมาไทย</span>;
    case "4":
      return <span className="badge badge-brown badge-pill">ถึงไทยแล้ว</span>;
    case "5":
      return <span className="badge badge-danger badge-pill">รอชำระเงิน</span>;
    case "6":
      return fStatusDriver === 1 ? (
        <span className="badge badge-info2 badge-pill">กำลังจัดส่ง</span>
      ) : (
        <span className="badge badge-primary badge-pill">เตรียมส่ง</span>
      );
    case "7":
      return <span className="badge badge-success badge-pill">ส่งแล้ว</span>;
    default:
      return null;
  }
}

// ── Legacy helper: nameProductsType2($productsType) ──
// member/include/function.php L331-341.
function nameProductsType2(productsType: string | null): string {
  switch (productsType) {
    case "1":
      return "ทั่วไป";
    case "2":
      return "มอก.";
    case "3":
      return "อย.";
    case "4":
      return "พิเศษ";
    default:
      return "";
  }
}

// ── Legacy helper: countText($text,$num) ──
// member/include/function.php L14-23. UTF-8-aware truncation: counts
// real characters (not bytes) and appends "..." past `num`.
function countText(text: string | null, num: number): string {
  if (!text) return "";
  const chars = Array.from(text);
  if (chars.length >= num) {
    return chars.slice(0, num).join("") + "...";
  }
  return text;
}

// ── Legacy helper: calPriceForwarderSumCompany(...) ──
// member/include/function.php L1384-1392. The row net price. The
// legacy call passes the SAME column (fUserCompany) as both
// $userCompany and $fUserCompany — once `==1` holds, the `!=2`
// sub-clause is always true — so the whole condition reduces exactly
// to `fUserCompany=='1'`. The WHT-1% reduction is identical 1:1.
function calPriceForwarderSumCompany(
  fPriceUpdate: number,
  fTotalPrice: number,
  fTransportPrice: number,
  fShippingService: number,
  fDiscount: number,
  priceCrate: number,
  fTransportPriceChnThb: number,
  priceOther: number,
  fUserCompany: string | null,
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

// NOTE — the legacy forwarder-table.php L9-34 defines a
// `number_format_short()` helper (K+/M+/B+/T+ short form). It is NOT
// transcribed: the PHP only ever calls it from the DataTables
// footer-callback JS to fill the summary row's `.t7/.t8/.t12/.t19`
// cells, which render empty at server-render time. When that
// client-side total is wired up, port `number_format_short()` then.

// PHP number_format($n, $decimals) — 1000s-separated, fixed decimals.
function numberFormat(n: number, decimals: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Legacy `convertIMGCHN`-equivalent fCover resolution as forwarder-table.php
// L1028-1033 does inline: a http(s) URL is used as-is; '' → the default
// shops image; a bare filename → images/shops/<file>.
function resolveCover(fCover: string | null): string {
  if (fCover && /https|http/.test(fCover)) return fCover;
  if (!fCover || fCover === "") return "/legacy/pcs/shops/default.png";
  return `https://pcscargo.co.th/member/images/shops/${fCover}`;
}

type ForwarderRow = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  ftrackingchn: string | null;
  ftrackingchn2: string | null;
  ftransporttype: string | null;
  fdetail: string | null;
  fcover: string | null;
  famount: number | null;
  fweight: number | null;
  fvolume: number | null;
  fwidth: number | null;
  fheight: number | null;
  flength: number | null;
  fproductstype: string | null;
  fcabinetnumber: string | null;
  ftotalprice: number | null;
  ftransportprice: number | null;
  fpriceupdate: number | null;
  fdiscount: number | null;
  fshippingservice: number | null;
  pricecrate: number | null;
  ftransportpricechnthb: number | null;
  priceother: number | null;
  fusercompany: string | null;
  reforder: string | null;
  fdatestatus2: string | null;
  fdatestatus3: string | null;
  fdatestatus4: string | null;
};

type AddressOption = {
  addressID: string;
  fullAddress: string;
};

export default async function ForwarderTablePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fTrackingCHN?: string; fCabinetNumber?: string; ID?: string }>;
}) {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  const sp = await searchParams;
  // forwarder-table.php sanitises ?fTrackingCHN — strips whitespace/tabs.
  const fTrackingCHNRaw = (sp.fTrackingCHN ?? "").replace(/\s+/g, "").replace(/\t+/g, "");
  const fCabinetNumberRaw = (sp.fCabinetNumber ?? "").replace(/\s+/g, "").replace(/\t+/g, "");
  const q = sp.q ?? "";
  const anchorID = sp.ID ?? "";

  // ── tb_forwarder_driver_item — the "กำลังจัดส่ง" set (L793-802) ──
  // Legacy SQL:
  //   SELECT f.ID FROM tb_forwarder_driver_item fdi
  //     LEFT JOIN tb_forwarder f ON fdi.fID=f.ID
  //     WHERE fdiStatus='' AND userID=$userID
  // The ported legacy `tb_*` schema declares no foreign keys, so
  // PostgREST cannot express that join via an embedded select (same
  // constraint the menu.php pilot documents). It is run as the two
  // lookups the PHP join effectively performs: (1) this customer's
  // forwarder IDs, (2) the driver-items with fdiStatus='' whose fID
  // is in that set.
  const ownForwarderIdsRes = await admin
    .from("tb_forwarder")
    .select("id")
    .eq("userid", memberCode);
  const ownForwarderIds = new Set<number>(
    (ownForwarderIdsRes.data ?? [])
      .map((r) => Number((r as { id: number }).id))
      .filter((v) => Number.isFinite(v)),
  );
  const arrFIDDriver = new Set<number>();
  if (ownForwarderIds.size > 0) {
    const driverItemRes = await admin
      .from("tb_forwarder_driver_item")
      .select("fid")
      .eq("fdistatus", "")
      .in("fid", Array.from(ownForwarderIds));
    for (const r of driverItemRes.data ?? []) {
      const fid = Number((r as { fid: number }).fid);
      if (Number.isFinite(fid)) arrFIDDriver.add(fid);
    }
  }
  const statusDriverItem = arrFIDDriver.size;

  // ── the status-count tabs (L782-791) ──
  // SELECT fStatus, COUNT(ID) FROM tb_forwarder WHERE userID=$userID
  //   [+ the active filters] GROUP BY fStatus
  // arrStatus is indexed 0..7; PostgREST has no GROUP BY, so the same
  // counts are derived from a status-only fetch (filtered identically).
  let statusQuery = admin
    .from("tb_forwarder")
    .select("fstatus")
    .eq("userid", memberCode);
  if (fTrackingCHNRaw) statusQuery = statusQuery.ilike("ftrackingchn", `%${fTrackingCHNRaw}%`);
  if (fCabinetNumberRaw && fCabinetNumberRaw !== "all")
    statusQuery = statusQuery.eq("fcabinetnumber", fCabinetNumberRaw);
  const statusRowsRes = await statusQuery;
  const arrStatus = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const r of statusRowsRes.data ?? []) {
    const s = Number((r as { fstatus: string | null }).fstatus);
    if (s >= 0 && s <= 7) arrStatus[s] += 1;
  }
  const countAll = arrStatus.reduce((a, b) => a + b, 0);

  // ── the ล๊อตสินค้า cabinet <select> options (L829-836) ──
  // SELECT fCabinetNumber FROM tb_forwarder
  //   WHERE userID=$userID AND fCabinetNumber<>'' GROUP BY <unique>
  const cabinetRes = await admin
    .from("tb_forwarder")
    .select("fcabinetnumber")
    .eq("userid", memberCode)
    .neq("fcabinetnumber", "");
  const cabinetSet = new Set<string>();
  for (const r of cabinetRes.data ?? []) {
    const c = (r as { fcabinetnumber: string | null }).fcabinetnumber;
    if (c) cabinetSet.add(c);
  }
  const cabinetOptions = Array.from(cabinetSet);

  // ── the main table query (L743-746 + the ?q / search filters) ──
  let tableQuery = admin
    .from("tb_forwarder")
    .select(
      "id, fdate, fstatus, ftrackingchn, ftrackingchn2, ftransporttype, fdetail, fcover, famount, fweight, fvolume, fwidth, fheight, flength, fproductstype, fcabinetnumber, ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fusercompany, reforder, fdatestatus2, fdatestatus3, fdatestatus4",
    )
    .eq("userid", memberCode);

  // forwarder-table.php L748-763 — the ?q= status filter.
  // q=6 / q=6.1 split: legacy joins tb_forwarder_driver_item and tests
  // fdiStatus — q=6 keeps non-out-for-delivery, q=6.1 keeps out-for-delivery.
  switch (q) {
    case "1":
    case "2":
    case "3":
    case "4":
    case "5":
    case "7":
      tableQuery = tableQuery.eq("fstatus", q);
      break;
    case "6":
      tableQuery = tableQuery.eq("fstatus", "6");
      break;
    case "6.1":
      tableQuery = tableQuery.eq("fstatus", "6");
      break;
    default:
      break; // "all" / unset → no status filter
  }
  if (fTrackingCHNRaw) tableQuery = tableQuery.ilike("ftrackingchn", `%${fTrackingCHNRaw}%`);
  if (fCabinetNumberRaw && fCabinetNumberRaw !== "all")
    tableQuery = tableQuery.eq("fcabinetnumber", fCabinetNumberRaw);
  tableQuery = tableQuery.order("id", { ascending: false }); // L1000

  const tableRes = await tableQuery;
  let rows: ForwarderRow[] = (tableRes.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: Number(row.id),
      fdate: (row.fdate as string) ?? null,
      fstatus: (row.fstatus as string) ?? null,
      ftrackingchn: (row.ftrackingchn as string) ?? null,
      ftrackingchn2: (row.ftrackingchn2 as string) ?? null,
      ftransporttype: (row.ftransporttype as string) ?? null,
      fdetail: (row.fdetail as string) ?? null,
      fcover: (row.fcover as string) ?? null,
      famount: row.famount == null ? null : Number(row.famount),
      fweight: row.fweight == null ? null : Number(row.fweight),
      fvolume: row.fvolume == null ? null : Number(row.fvolume),
      fwidth: row.fwidth == null ? null : Number(row.fwidth),
      fheight: row.fheight == null ? null : Number(row.fheight),
      flength: row.flength == null ? null : Number(row.flength),
      fproductstype: (row.fproductstype as string) ?? null,
      fcabinetnumber: (row.fcabinetnumber as string) ?? null,
      ftotalprice: row.ftotalprice == null ? null : Number(row.ftotalprice),
      ftransportprice: row.ftransportprice == null ? null : Number(row.ftransportprice),
      fpriceupdate: row.fpriceupdate == null ? null : Number(row.fpriceupdate),
      fdiscount: row.fdiscount == null ? null : Number(row.fdiscount),
      fshippingservice: row.fshippingservice == null ? null : Number(row.fshippingservice),
      pricecrate: row.pricecrate == null ? null : Number(row.pricecrate),
      ftransportpricechnthb:
        row.ftransportpricechnthb == null ? null : Number(row.ftransportpricechnthb),
      priceother: row.priceother == null ? null : Number(row.priceother),
      fusercompany: (row.fusercompany as string) ?? null,
      reforder: (row.reforder as string) ?? null,
      fdatestatus2: (row.fdatestatus2 as string) ?? null,
      fdatestatus3: (row.fdatestatus3 as string) ?? null,
      fdatestatus4: (row.fdatestatus4 as string) ?? null,
    };
  });
  // forwarder-table.php q=6.1 keeps ONLY the driver-item (out-for-delivery)
  // rows; q=6 keeps the rest. Applied client-side since the join filter
  // can't be expressed alongside the status filter in one PostgREST call.
  if (q === "6.1") {
    rows = rows.filter((r) => arrFIDDriver.has(r.id));
  } else if (q === "6") {
    rows = rows.filter((r) => !arrFIDDriver.has(r.id));
  }

  // forwarder-table.php L1008-1021 — the per-row net price. The legacy
  // also accumulates $fAmountAll / $fWeightAll / $fVolumeAll / $fPriceAll
  // in this loop, but those totals are NOT printed by the PHP — the
  // summary row's `.t7/.t8/.t12/.t19` cells render empty and the
  // DataTables footer-callback JS fills them client-side. So only the
  // per-row `calPriceForwarderSumCompany()` value (which IS rendered, in
  // the ราคา column) is kept here.
  const rowNet = new Map<number, number>();
  for (const row of rows) {
    const net = calPriceForwarderSumCompany(
      row.fpriceupdate ?? 0,
      row.ftotalprice ?? 0,
      row.ftransportprice ?? 0,
      row.fshippingservice ?? 0,
      row.fdiscount ?? 0,
      row.pricecrate ?? 0,
      row.ftransportpricechnthb ?? 0,
      row.priceother ?? 0,
      row.fusercompany,
    );
    rowNet.set(row.id, net);
  }

  // ── the add-forwarder modal address <select> (L1149-1167) ──
  // The main address (tb_address ⋈ tb_address_main) first, then every
  // other active address; "รับเองหน้าโกดัง PCS กทม" appended last.
  // (tb_address.addressid / tb_address_main.addressid are bigint.)
  const addressOptions: AddressOption[] = [];
  let mainAddressID: number | null = null;
  const mainAddrRes = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number | null }>();
  if (mainAddrRes.data?.addressid != null) {
    mainAddressID = Number(mainAddrRes.data.addressid);
    const mainRowRes = await admin
      .from("tb_address")
      .select(
        "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
      )
      .eq("addressid", mainAddressID)
      .eq("userid", memberCode)
      .maybeSingle<Record<string, string | number | null>>();
    if (mainRowRes.data) {
      addressOptions.push({
        addressID: String(mainRowRes.data.addressid ?? ""),
        fullAddress: "[ที่อยู่หลัก] " + buildFullAddress(mainRowRes.data),
      });
    }
  }
  const otherAddrRes = await admin
    .from("tb_address")
    .select(
      "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
    )
    .eq("userid", memberCode)
    .eq("addressstatus", "1");
  for (const r of otherAddrRes.data ?? []) {
    const row = r as Record<string, string | number | null>;
    if (mainAddressID != null && Number(row.addressid) === mainAddressID) continue;
    addressOptions.push({
      addressID: String(row.addressid ?? ""),
      fullAddress: buildFullAddress(row),
    });
  }

  // forwarder-table.php prints screen.width-conditional markup; on the
  // server we render the desktop variant (the legacy default for
  // width>=578 — the .nowrap table). DataTables JS init is a follow-up.

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheets — static public/ assets, loaded via plain
          <link>s so they bypass the app's Tailwind/PostCSS pipeline.
          service-import.css = the shared BS4 + theme chrome base;
          forwarder-table.css = this screen's own inline <style> block. */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />
      <link rel="stylesheet" href="/legacy/pcs/forwarder-table.css" />

      {/* BEGIN: Content — forwarder-table.php L730 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card border-black">
                    <div className="card-content">
                      <div className="card-body">
                        {/* ── header row: the forwarder/forwarder-table tab
                            strip + the search form + the add button ── */}
                        <div className="row">
                          <div className="content-header-left col-md-4 col-12">
                            <div className="text-center text-md-left">
                              <ul className="nav nav-tabs nav-underline pcs-tabs">
                                <li className="nav-item tab-sm-center">
                                  <Link className="nav-link" href="/service-import">
                                    <h3 className="text-center text-md-left">
                                      <span className=" ft-box"></span> ฝากนำเข้าสินค้าแบบเต็ม
                                    </h3>
                                  </Link>
                                </li>
                                <li className="nav-item tab-sm-center active">
                                  <Link className="nav-link active" href="/service-import/table">
                                    <h3 className="text-center text-md-left">
                                      <span className=" fas fa-table"></span> ฝากนำเข้าสินค้าแบบตาราง
                                    </h3>
                                  </Link>
                                </li>
                              </ul>
                            </div>
                          </div>
                          <div className="col-md-6 col-12">
                            <form
                              className="form-horizontal"
                              id="search"
                              method="GET"
                              action="/service-import/table"
                              autoComplete="off"
                            >
                              <label className="form-control-label" htmlFor="fTrackingCHN">
                                ค้นหา Tracking :
                              </label>
                              <input
                                className=""
                                name="fTrackingCHN"
                                id="fTrackingCHN"
                                type="text"
                                placeholder="เลขแทรคกิ้ง"
                                defaultValue={fTrackingCHNRaw}
                              />
                              <label className="form-control-label" htmlFor="fCabinetNumber">
                                ล๊อตสินค้า :
                              </label>
                              <select
                                className=""
                                name="fCabinetNumber"
                                id="fCabinetNumber"
                                defaultValue={fCabinetNumberRaw || "all"}
                              >
                                <option value="all">ทั้งหมด</option>
                                {cabinetOptions.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="btn btn-sm btn-color-main round waves-effect"
                                name="search"
                              >
                                ค้นหารายการ
                              </button>
                              {sp.fTrackingCHN !== undefined && (
                                <div className="text-danger">
                                  ผลลัพธ์การค้นหาโดย{" "}
                                  {sp.fTrackingCHN ? <>เลขแทรคกิ้ง : {sp.fTrackingCHN}</> : null}
                                  {sp.fCabinetNumber ? <> ล๊อตสินค้า : {sp.fCabinetNumber}</> : null}
                                </div>
                              )}
                            </form>
                          </div>
                          <div className="content-header-right col-md-2 col-12">
                            <div className="float-md-right">
                              <div className="text-center text-md-right">
                                <Link className="nav-link" href="/service-import/add">
                                  <button className="btn btn-sm btn-circle btn-success text-white">
                                    <i className="ft-plus"></i>
                                  </button>
                                  <span className="font-normal text-dark">เพิ่มรายการนำเข้า</span>
                                </Link>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── the status-tab strip + the table ── */}
                        <div className="row">
                          <div className="col-12">
                            <h4 className="text-color">
                              <b>สถานะรายการ</b>
                            </h4>
                            {/* forwarder-table.php wraps the status tabs +
                                the table inside one <form method=GET> whose
                                buttons carry name="q". A nested <form> is
                                invalid HTML in React — each status tab is
                                transcribed as a <Link> to the same ?q= URL
                                (1:1 navigation behaviour; the legacy submit
                                just builds that URL). */}
                            <ul className="nav nav-tabs nav-underline pcs-tabs">
                              <li
                                className={
                                  "nav-all nav-item tab-sm-center" +
                                  (q === "all" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=all"
                                  className={"nav-link" + (q === "all" ? " active" : "")}
                                >
                                  ทั้งหมด
                                  {countAll > 0 && (
                                    <div className="pcs-badge2 badge-secondary pcs-badge-pill">
                                      {countAll}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li
                                className={
                                  "nav-1 nav-item tab-sm-center" + (q === "1" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=1"
                                  className={"nav-link" + (q === "1" ? " active" : "")}
                                >
                                  รอเข้าโกดัง
                                  {arrStatus[1] > 0 && (
                                    <div className="pcs-badge2 badge-warning pcs-badge-pill">
                                      {arrStatus[1]}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li
                                className={
                                  "nav-2 nav-item tab-sm-center" + (q === "2" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=2"
                                  className={"nav-link" + (q === "2" ? " active" : "")}
                                >
                                  ถึงโกดังจีนแล้ว
                                  {arrStatus[2] > 0 && (
                                    <div className="pcs-badge2 badge-info pcs-badge-pill">
                                      {arrStatus[2]}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li
                                className={
                                  "nav-3 nav-item tab-sm-center" + (q === "3" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=3"
                                  className={"nav-link" + (q === "3" ? " active" : "")}
                                >
                                  กำลังส่งมาไทย
                                  {arrStatus[3] > 0 && (
                                    <div className="pcs-badge2 badge-pink pcs-badge-pill">
                                      {arrStatus[3]}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li
                                className={
                                  "nav-4 nav-item tab-sm-center" + (q === "4" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=4"
                                  className={"nav-link" + (q === "4" ? " active" : "")}
                                >
                                  ถึงไทยแล้ว
                                  {arrStatus[4] > 0 && (
                                    <div className="pcs-badge2 badge-brown pcs-badge-pill">
                                      {arrStatus[4]}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li
                                className={
                                  "nav-5 nav-item tab-sm-center" + (q === "5" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=5"
                                  className={"nav-link" + (q === "5" ? " active" : "")}
                                >
                                  รอชำระเงิน
                                  {arrStatus[5] > 0 && (
                                    <div className="pcs-badge2 badge-danger pcs-badge-pill">
                                      {arrStatus[5]}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li
                                className={
                                  "nav-6 nav-item tab-sm-center" + (q === "6" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=6"
                                  className={"nav-link" + (q === "6" ? " active" : "")}
                                >
                                  เตรียมส่ง
                                  {arrStatus[6] - statusDriverItem > 0 && (
                                    <div className="pcs-badge2 badge-primary pcs-badge-pill">
                                      {arrStatus[6] - statusDriverItem}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li
                                className={
                                  "nav-6-1 nav-item tab-sm-center" +
                                  (q === "6.1" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=6.1"
                                  className={"nav-link" + (q === "6.1" ? " active" : "")}
                                >
                                  กำลังจัดส่ง
                                  {statusDriverItem > 0 && (
                                    <div className="pcs-badge2 badge-info2 pcs-badge-pill">
                                      {statusDriverItem}
                                    </div>
                                  )}
                                </Link>
                              </li>
                              <li
                                className={
                                  "nav-7 nav-item tab-sm-center" + (q === "7" ? " active" : "")
                                }
                              >
                                <Link
                                  href="/service-import/table?q=7"
                                  className={"nav-link" + (q === "7" ? " active" : "")}
                                >
                                  ส่งแล้ว
                                  {arrStatus[7] > 0 && (
                                    <div className="pcs-badge2 badge-success pcs-badge-pill">
                                      {arrStatus[7]}
                                    </div>
                                  )}
                                </Link>
                              </li>
                            </ul>
                          </div>

                          <div className="col-12 p-m-0 notranslate">
                            <div className="p-m-0">
                              <div className="hr-dashed"></div>
                              <form id="frm-example2">
                                <div className="pt-1 text-center text-md-left ">
                                  {arrStatus[5] > 0 && (
                                    <div style={{ position: "relative" }} className="btn-pay-pc"></div>
                                  )}
                                </div>
                                <div className="table-responsive2 mb-5">
                                  <table
                                    id="myTable"
                                    className="table display table-bordered table-striped dataTable no-footer nowrap"
                                  >
                                    <thead>
                                      <tr className="text-center bg-danger2">
                                        <th className="all add-text-all">ID</th>
                                        <th className="d-none-1200">วันที่สร้าง</th>
                                        <th>เลขแทรคกิ้งจีน</th>
                                        <th className="d-none-1200">ออเดอร์สั่งซื้อ</th>
                                        <th className="d-none-578">ล๊อต/ลำดับ</th>
                                        <th className="d-none-578">รายละเอียด</th>
                                        <th>ลัง</th>
                                        <th>หนัก</th>
                                        <th className="d-none-1200">กว้าง</th>
                                        <th className="d-none-1200">สูง</th>
                                        <th className="d-none-1200">ยาว</th>
                                        <th>คิว</th>
                                        <th className="d-none-578">ประเภท</th>
                                        <th className="d-none-578">ค่าตีลัง</th>
                                        <th className="d-none-578">ขนส่งจีน+</th>
                                        <th className="d-none-578">ค่าอื่นๆ</th>
                                        <th className="d-none-578">ขนส่งไทย</th>
                                        <th className="d-none-578">เข้าโกดังจีน</th>
                                        <th className="d-none-578">ออกโกดังจีน</th>
                                        <th className="d-none-578">ถึงโกดังไทย</th>
                                        <th>ราคา</th>
                                        <th>สถานะ</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {/* forwarder-table.php L975-998 — the
                                          "รวม" summary row. Every cell is
                                          rendered EMPTY by the legacy PHP
                                          (the `.t7/.t8/.t12/.t19` totals are
                                          filled later by the DataTables
                                          footer-callback JS, not at server
                                          render). Transcribed 1:1 — empty. */}
                                      <tr className="bg-color no-sort">
                                        <td className="t1 d-none2 "></td>
                                        <td className="t2 d-none-1200"></td>
                                        <td className="t3"></td>
                                        <td className="t4 d-none-1200"></td>
                                        <td className="t5 d-none-578"></td>
                                        <td className="t6 text-right d-none-578">รวม</td>
                                        <td className="t7 text-right"></td>
                                        <td className="t8 text-right"></td>
                                        <td className="t9 d-none-1200"></td>
                                        <td className="t10 d-none-1200"></td>
                                        <td className="t11 d-none-1200"></td>
                                        <td className="t12 text-right"></td>
                                        <td className="t13 d-none-578"></td>
                                        <td className="t14 d-none-578"></td>
                                        <td className="t15 d-none-578"></td>
                                        <td className="t15-1 d-none-578"></td>
                                        <td className="t15-2 d-none-578"></td>
                                        <td className="t15-3 d-none-578"></td>
                                        <td className="t16 d-none-578"></td>
                                        <td className="t17 d-none-578"></td>
                                        <td className="t19 text-right"></td>
                                        <td className="t18"></td>
                                      </tr>
                                      {rows.map((row) => {
                                        const fStatusDriver = arrFIDDriver.has(row.id) ? 1 : 0;
                                        const cover = resolveCover(row.fcover);
                                        const net = rowNet.get(row.id) ?? 0;
                                        const isHan = /\p{Script=Han}/u.test(row.fdetail ?? "");
                                        return (
                                          <tr
                                            key={row.id}
                                            {...(anchorID && anchorID === String(row.id)
                                              ? { className: "bg-danger2 anchor", id: `F${row.id}` }
                                              : {})}
                                          >
                                            <td
                                              className={
                                                "text-center tr1 " +
                                                (row.fstatus !== "5" ? "d-none2" : "")
                                              }
                                            >
                                              {row.id}
                                            </td>
                                            <td className="text-center font-12 d-none-1200">
                                              {fmtDate(row.fdate)}
                                            </td>
                                            <td className="">
                                              <Link
                                                className="text-info"
                                                href={`/service-import/${row.id}`}
                                              >
                                                {row.ftrackingchn2
                                                  ? row.ftrackingchn2
                                                  : row.ftrackingchn}
                                              </Link>
                                              <a
                                                className="image-popup-vertical-fit el-link"
                                                href={cover}
                                              >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={cover} width={25} alt="" />
                                              </a>
                                            </td>
                                            <td className="d-none-1200">
                                              {row.reforder ? (
                                                <div className="">
                                                  <Link href={`/service-order/${row.reforder}`}>
                                                    {row.reforder}
                                                  </Link>
                                                </div>
                                              ) : null}
                                            </td>
                                            <td className="d-none-578">
                                              {row.ftransporttype === "1" ? "รถ:" : "เรือ:"}
                                              {countText(
                                                (row.fcabinetnumber ?? "")
                                                  .replace(/รถ /g, "")
                                                  .replace(/大/g, ""),
                                                20,
                                              )}
                                              /
                                              <Link
                                                className="text-info"
                                                href={`/service-import/${row.id}`}
                                              >
                                                {row.id}
                                              </Link>
                                            </td>
                                            <td className="d-none-578">
                                              <Link
                                                className="text-info"
                                                href={`/service-import/${row.id}`}
                                              >
                                                {isHan
                                                  ? countText(row.fdetail, 5)
                                                  : countText(row.fdetail, 12)}
                                              </Link>
                                            </td>
                                            <td className="text-right">
                                              {(row.famount ?? 0) > 0 ? row.famount : ""}
                                            </td>
                                            <td className="text-right">
                                              {(row.fweight ?? 0) > 0
                                                ? numberFormat(row.fweight!, 2)
                                                : ""}
                                            </td>
                                            <td className="text-right d-none-1200">
                                              {(row.fwidth ?? 0) > 0
                                                ? numberFormat(row.fwidth!, 2)
                                                : "-"}
                                            </td>
                                            <td className="text-right d-none-1200">
                                              {(row.fheight ?? 0) > 0
                                                ? numberFormat(row.fheight!, 2)
                                                : "-"}
                                            </td>
                                            <td className="text-right d-none-1200">
                                              {(row.flength ?? 0) > 0
                                                ? numberFormat(row.flength!, 2)
                                                : "-"}
                                            </td>
                                            <td className="text-right">
                                              {(row.fvolume ?? 0) > 0
                                                ? numberFormat(row.fvolume!, 3)
                                                : "-"}
                                            </td>
                                            <td className="text-center d-none-578">
                                              {nameProductsType2(row.fproductstype)}
                                            </td>
                                            <td className="text-right d-none-578">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.pricecrate ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="text-right d-none-578">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.ftransportpricechnthb ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="text-right d-none-578">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.priceother ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="text-right d-none-578">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.ftransportprice ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="text-center font-12 d-none-578">
                                              {fmtDate(row.fdatestatus2)}
                                            </td>
                                            <td className="text-center font-12 d-none-578">
                                              {fmtDate(row.fdatestatus3)}
                                            </td>
                                            <td className="text-center font-12 d-none-578">
                                              {fmtDate(row.fdatestatus4)}
                                            </td>
                                            <td className="text-right">
                                              <span className="text-danger">
                                                {numberFormat(net, 2)}
                                              </span>
                                            </td>
                                            <td className="text-center">
                                              {statusForwarderAll4(
                                                row.fstatus ?? "",
                                                fStatusDriver,
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                                <div id="example-console-rows"></div>
                              </form>
                            </div>
                            {/* the bottom fixed pay-bar — forwarder-table.php L1071 */}
                            <div
                              className="p-1 p-m-0"
                              style={{ position: "fixed", bottom: 0, width: "90%" }}
                            >
                              <div className="b-pay">
                                <div className="row">
                                  <div className="col-md-6 offset-md-3">
                                    <div className="row">
                                      <div className="col-3 p-05 text-center">
                                        <input
                                          type="checkbox"
                                          className="dt-checkboxes check-all c6"
                                          defaultChecked
                                        />
                                        <br />
                                        เลือกทั้งหมด
                                      </div>
                                      <div className="col-6 p-05">
                                        จำนวนรายการ : <span className="countPay">-</span>
                                        <br />
                                        <b>
                                          ยอดชำระรวม :{" "}
                                          <span className="text-danger price-all">0.00</span> บ.
                                        </b>
                                      </div>
                                      <div className="col-3 p-05 text-right">
                                        <button
                                          type="button"
                                          className="btn btn-color-main waves-effect round animate__animated animate__infinite animate__headShake"
                                          id="select"
                                        >
                                          ชำระเงิน
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {/* END: Content */}

      {/* ── the add-forwarder modal — forwarder-table.php L1105-1181 ──
          Verbatim BS4 markup. The legacy modal POSTs to forwarder/ with
          name="save" — the create-forwarder mutation. A Server Component
          render is a pure read, so the form has no live action here; the
          submit is a deferred Server Action (see the flag in the file
          header). The data-* attributes are kept verbatim so the legacy
          jQuery/BS4 vendor bundle can still open/close the modal 1:1. */}
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
              {/* TODO(server-action): the legacy `save` POST (forwarder-table.php
                  L1113 posts to forwarder/) creates a tb_forwarder order. A
                  Server Component render is a pure read — the submit is
                  unwired; port it to a "use server" action. The legacy
                  `method="POST" action="forwarder/"` markup is kept 1:1. */}
              <form
                className="form-horizontal"
                method="POST"
                action="/service-import"
                autoComplete="off"
              >
                <div className="form-group">
                  <div className="border-bottom-2"></div>
                  <h5 className="text-center">กรอกรายละเอียดนำเข้าสินค้า</h5>
                  <div className="border-bottom-2">
                    <hr />
                  </div>
                  <div className="mb-1">
                    <div className="text-right">
                      <a
                        href="/china-address"
                        target="_blank"
                        rel="noreferrer"
                        className="text-info"
                      >
                        ที่อยู่โกดังจีน
                      </a>
                    </div>
                    <label className="form-control-label" htmlFor="fTrackingCHN">
                      เลข Tracking
                    </label>
                    <input
                      className="form-control form-control-lg"
                      name="fTrackingCHN"
                      type="text"
                      placeholder="เลข Tracking"
                      maxLength={50}
                      required
                    />
                    <div id="message"></div>
                  </div>

                  <div className="mb-1">
                    <label className="form-control-label" htmlFor="fDetail">
                      รายละเอียด
                    </label>
                    <textarea
                      className="form-control"
                      rows={3}
                      name="fDetail"
                      placeholder="รายละเอียด"
                      maxLength={500}
                      required
                    ></textarea>
                  </div>

                  <div className="mb-1">
                    <label className="form-control-label" htmlFor="fAmount">
                      จำนวนกล่อง
                    </label>
                    <input
                      className="form-control form-control-lg"
                      name="fAmount"
                      type="number"
                      min={1}
                      max={10000}
                      step={1}
                      defaultValue={1}
                      required
                    />
                  </div>
                  <h5 className="text-center">ข้อมูลการจัดส่ง </h5>
                  <div className="border-bottom-2">
                    <hr />
                  </div>
                  <label className="form-control-label" htmlFor="fTransportType">
                    เลือกรูปแบบการขนส่งระหว่างประเทศจีน-ไทย
                  </label>
                  <div className="form-group">
                    <select id="transportType" className="form-control" name="fTransportType" required>
                      <option value="1">ขนส่งทางรถ (ใช้เวลาประมาณ 5-7 วัน)</option>
                      <option value="2">ขนส่งทางเรือ (ใช้เวลาประมาณ 12-16 วัน)</option>
                    </select>
                  </div>
                  <div className="mb-1">
                    <label className="form-control-label" htmlFor="fAmount">
                      ที่อยู่ในการจัดส่ง{" "}
                      <Link
                        href="/addresses/add"
                        target="_blank"
                        className="text-info font-10"
                      >
                        เพิ่มที่อยู่ <i className="ti-plus"></i>
                      </Link>
                    </label>

                    <select className="form-control" name="addressID" id="addressID" required>
                      <option value="" defaultValue="">
                        กรุณาเลือกที่อยู่ในการจัดส่ง
                      </option>
                      {addressOptions.map((a) => (
                        <option key={a.addressID} value={a.addressID}>
                          {a.fullAddress}
                        </option>
                      ))}
                      <option value="PCS">รับเองหน้าโกดัง Pacred กทม</option>
                    </select>
                  </div>
                  <div id="selectShipBy"></div>

                  <div className="modal-footer">
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
                      บันทึก
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <div id="list-forwarder-data"></div>
    </div>
  );
}

/**
 * Builds the legacy CONCAT('คุณ',addressName,' ',…) full-address string
 * the modal <select> options show (forwarder-table.php L1149 / L1156).
 */
function buildFullAddress(r: Record<string, string | number | null>): string {
  const s = (v: string | number | null | undefined): string =>
    v == null ? "" : String(v);
  return (
    "คุณ" +
    s(r.addressname) +
    " " +
    s(r.addresslastname) +
    " " +
    s(r.addressno) +
    " ตำบล/แขวง " +
    s(r.addresssubdistrict) +
    " อำเภอ/เขต " +
    s(r.addressdistrict) +
    " จังหวัด " +
    s(r.addressprovince) +
    " " +
    s(r.addresszipcode)
  );
}

/**
 * Renders a legacy `DATE(col)` value as `dd/mm/yyyy` — the legacy
 * MySQL `DATE()` form. An empty / null value renders blank, exactly
 * as the legacy table cell does when the status date is not set.
 */
function fmtDate(value: string | null): string {
  if (!value) return "";
  // tb_* dates arrive as ISO ('2026-05-19' or full timestamp).
  const datePart = value.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
