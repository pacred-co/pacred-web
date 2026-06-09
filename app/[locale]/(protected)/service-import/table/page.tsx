import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { calPriceForwarderSumCompany } from "@/lib/forwarder/calc-company-total";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { legacyMemberUrl } from "@/lib/legacy-image";
import { ServiceImportAddForm } from "../add/service-import-add-form";
import { ImportViewTabs } from "../import-view-tabs";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { type CsvRow } from "@/components/admin/csv-button";
import { CollapseSidebar } from "./collapse-sidebar";
import {
  TableSelectionProvider,
  RowCheckbox,
  SelectAllHeaderCheckbox,
  TablePayBar,
  ExportToolbar,
  TableQuickSearch,
} from "./table-interactive";
import { type ForwarderRow as PayModalRow } from "../forwarder-row-view";

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
 * ("รับเองหน้าโกดัง Pacred (สมุทรสาคร)"). The `value="PCS"` data value on the
 * pickup option stays (it's the DB-stored fShipBy value the legacy
 * tb_*.fshipby rows persist).
 */

export const dynamic = "force-dynamic";

// ── Legacy helper: statusForwarderAll4($fStatus,$fStatusDriver) ──
// member/include/function.php L563-580. The status badge for the
// table's last column. Rebuilt to the Tailwind chip pattern that
// matches forwarder-row-view.tsx's STATUS_CHIP map — same tones, same
// labels, same 6.1 driver-item split.
const TABLE_STATUS_CHIP: Record<string, { labelKey: string; cls: string }> = {
  "1":   { labelKey: "statusWaitChinaWarehouse",  cls: "bg-amber-100 text-amber-700 border-amber-200"      },
  "2":   { labelKey: "statusAtChinaWarehouse",    cls: "bg-sky-100 text-sky-700 border-sky-200"            },
  "3":   { labelKey: "statusShippingToThailand",  cls: "bg-pink-100 text-pink-700 border-pink-200"         },
  "4":   { labelKey: "statusArrivedThailand",     cls: "bg-amber-200 text-amber-900 border-amber-300"      },
  "5":   { labelKey: "statusWaitPayment",         cls: "bg-red-100 text-red-700 border-red-200"            },
  "6":   { labelKey: "statusPreparing",           cls: "bg-indigo-100 text-indigo-700 border-indigo-200"   },
  "6.1": { labelKey: "statusDelivering",          cls: "bg-cyan-100 text-cyan-700 border-cyan-200"         },
  "7":   { labelKey: "statusDelivered",           cls: "bg-emerald-100 text-emerald-700 border-emerald-200"},
};
function statusForwarderAll4(
  fStatus: string,
  fStatusDriver: number,
  t: (key: string) => string,
): React.ReactNode {
  let key: string = fStatus;
  if (fStatus === "6" && fStatusDriver === 1) key = "6.1";
  const chip = TABLE_STATUS_CHIP[key];
  if (!chip) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-1.5 md:px-2.5 py-0.5 text-[9px] md:text-[11px] font-semibold leading-tight whitespace-nowrap ${chip.cls}`}
    >
      {t(chip.labelKey)}
    </span>
  );
}

// ── Legacy helper: nameProductsType2($productsType) ──
// member/include/function.php L331-341.
function nameProductsType2(
  productsType: string | null,
  t: (key: string) => string,
): string {
  switch (productsType) {
    case "1":
      return t("productTypeGeneral");
    case "2":
      return t("productTypeTisi");
    case "3":
      return t("productTypeFda");
    case "4":
      return t("productTypeSpecial");
    default:
      return "";
  }
}

// ── Legacy helper: nameRefPrice($refPrice) — function.php L615-623 ──
// The "คิดราคาตาม" basis: 1 = by weight (kg), 2 = by volume (CBM).
function nameRefPrice2(
  refPrice: string | null,
  t: (key: string) => string,
): string {
  if (refPrice === "1") return t("refPriceWeight");
  if (refPrice === "2") return t("refPriceVolume");
  return "-";
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

// calPriceForwarderSumCompany — shared in @/lib/forwarder/calc-company-total
// (imported above). The canonical signature takes fUserCompany FIRST (the call
// site below was reordered to match; same 9 values, identical WHT-1% math).

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
  if (fCover && /https|http/.test(fCover)) {
    // Old data may store full legacy URLs — re-resolve through the
    // Supabase mirror so customer-visible URLs never leak the legacy host.
    const legacyMatch = fCover.match(/pcscargo\.co\.th\/member\/(.+)$/);
    if (legacyMatch) return legacyMemberUrl(legacyMatch[1]);
    return fCover;
  }
  if (!fCover || fCover === "") return "/legacy/pcs/shops/default.png";
  return legacyMemberUrl(`images/shops/${fCover}`);
}

type ForwarderRow = {
  id: number;
  fdate: string | null;
  fstatus: string | null;
  ftrackingchn: string | null;
  ftrackingchn2: string | null;
  ftransporttype: string | null;
  fshipby: string | null;
  fcredit: string | null;
  fdetail: string | null;
  fcover: string | null;
  famount: number | null;
  fweight: number | null;
  fvolume: number | null;
  fwidth: number | null;
  fheight: number | null;
  flength: number | null;
  fproductstype: string | null;
  frefprice: string | null;
  frefrate: number | null;
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
  searchParams: Promise<{ q?: string; fTrackingCHN?: string; fCabinetNumber?: string; ID?: string; page?: string }>;
}) {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;
  const t = await getTranslations("serviceImportTable");

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // getListPayForwarder.php L23 — userCompany drives the pay-modal's 1% WHT
  // line + the KBank block (juristic only). Read the legacy flag.
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userCompany")
    .eq("userID", memberCode)
    .maybeSingle<{ userCompany: string | number | null }>();
  if (userRowErr) {
    console.error(`[tb_users table] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const isJuristic = String(userRow?.userCompany ?? "") === "1";

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

  // ── the main table query (L743-746 + the ?q / search filters) ──
  let tableQuery = admin
    .from("tb_forwarder")
    .select(
      "id, fdate, fstatus, ftrackingchn, ftrackingchn2, ftransporttype, fshipby, fcredit, fdetail, fcover, famount, fweight, fvolume, fwidth, fheight, flength, fproductstype, frefprice, frefrate, fcabinetnumber, ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fusercompany, reforder, fdatestatus2, fdatestatus3, fdatestatus4",
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
      fshipby: (row.fshipby as string) ?? null,
      fcredit: (row.fcredit as string) ?? null,
      fdetail: (row.fdetail as string) ?? null,
      fcover: (row.fcover as string) ?? null,
      famount: row.famount == null ? null : Number(row.famount),
      fweight: row.fweight == null ? null : Number(row.fweight),
      fvolume: row.fvolume == null ? null : Number(row.fvolume),
      fwidth: row.fwidth == null ? null : Number(row.fwidth),
      fheight: row.fheight == null ? null : Number(row.fheight),
      flength: row.flength == null ? null : Number(row.flength),
      fproductstype: (row.fproductstype as string) ?? null,
      frefprice: (row.frefprice as string) ?? null,
      frefrate: row.frefrate == null ? null : Number(row.frefrate),
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
      row.fusercompany,
      row.fpriceupdate ?? 0,
      row.ftotalprice ?? 0,
      row.ftransportprice ?? 0,
      row.fshippingservice ?? 0,
      row.fdiscount ?? 0,
      row.pricecrate ?? 0,
      row.ftransportpricechnthb ?? 0,
      row.priceother ?? 0,
    );
    rowNet.set(row.id, net);
  }

  // ── Summary-row column totals (legacy DataTables footer-callback,
  //    forwarder-table.php) — สรุปยอด over the FULL filtered set: ลัง · หนัก ·
  //    คิว · ราคา. The legacy filled .t7/.t8/.t12/.t19 client-side; computed
  //    server-side here so they render immediately (ปอน 2026-06-08 "ยอดไม่นับ").
  let sumBoxes = 0,
    sumWeight = 0,
    sumVolume = 0,
    sumNetPrice = 0;
  for (const row of rows) {
    sumBoxes += Number(row.famount ?? 0);
    sumWeight += Number(row.fweight ?? 0);
    sumVolume += Number(row.fvolume ?? 0);
    sumNetPrice += rowNet.get(row.id) ?? 0;
  }

  // ── CSV export rows (ปอน 2026-06-08: "port ออกมาเป็นไฟล์ แบบเขา") ──
  // The legacy DataTables CSV button exported every row of the filtered set.
  // We have the full filtered `rows` here (only `pageRows` is sliced for
  // display), so the CSV covers ALL rows — columns mirror the on-screen table.
  const CSV_COLS = [
    { key: "tracking",       label: t("colTrackingChn") },
    { key: "lotSeq",         label: t("colLotSeq") },
    { key: "detail",         label: t("colDetail") },
    { key: "boxes",          label: t("colBoxes") },
    { key: "weight",         label: t("colWeight") },
    { key: "width",          label: t("colWidth") },
    { key: "height",         label: t("colHeight") },
    { key: "length",         label: t("colLength") },
    { key: "volume",         label: t("colVolume") },
    { key: "pricedBy",       label: t("colPricedBy") },
    { key: "importRate",     label: t("colImportRate") },
    { key: "type",           label: t("colType") },
    { key: "crate",          label: t("colCratePrice") },
    { key: "chinaTransport", label: t("colChinaTransport") },
    { key: "other",          label: t("colOther") },
    { key: "thaiTransport",  label: t("colThaiTransport") },
    { key: "enterChina",     label: t("colEnterChinaWarehouse") },
    { key: "leaveChina",     label: t("colLeaveChinaWarehouse") },
    { key: "arriveThai",     label: t("colArriveThaiWarehouse") },
    { key: "price",          label: t("colPrice") },
    { key: "status",         label: t("colStatus") },
  ];
  const csvStatusText = (fStatus: string, fid: number): string => {
    let key = fStatus;
    if (fStatus === "6" && arrFIDDriver.has(fid)) key = "6.1";
    const chip = TABLE_STATUS_CHIP[key];
    return chip ? t(chip.labelKey) : "";
  };
  const csvRows: CsvRow[] = rows.map((row) => {
    const net = rowNet.get(row.id) ?? 0;
    const paid = Number(row.fstatus) > 4;
    return {
      tracking:       row.ftrackingchn2 || row.ftrackingchn || `#${row.id}`,
      lotSeq:         (row.ftransporttype === "1" ? t("transportTruckColon") : t("transportSeaColon"))
                        + (row.fcabinetnumber ?? "").replace(/รถ /g, "").replace(/大/g, "") + "/" + row.id,
      detail:         row.fdetail ?? "",
      boxes:          (row.famount ?? 0) > 0 ? row.famount! : "",
      weight:         (row.fweight ?? 0) > 0 ? numberFormat(row.fweight!, 2) : "",
      width:          (row.fwidth ?? 0) > 0 ? numberFormat(row.fwidth!, 2) : "",
      height:         (row.fheight ?? 0) > 0 ? numberFormat(row.fheight!, 2) : "",
      length:         (row.flength ?? 0) > 0 ? numberFormat(row.flength!, 2) : "",
      volume:         (row.fvolume ?? 0) > 0 ? numberFormat(row.fvolume!, 3) : "",
      pricedBy:       nameRefPrice2(row.frefprice, t),
      importRate:     (row.frefrate ?? 0) > 0 ? numberFormat(row.frefrate!, 2) : "",
      type:           nameProductsType2(row.fproductstype, t),
      crate:          paid ? numberFormat(row.pricecrate ?? 0, 2) : "",
      chinaTransport: paid ? numberFormat(row.ftransportpricechnthb ?? 0, 2) : "",
      other:          paid ? numberFormat(row.priceother ?? 0, 2) : "",
      thaiTransport:  paid ? numberFormat(row.ftransportprice ?? 0, 2) : "",
      enterChina:     fmtDate(row.fdatestatus2),
      leaveChina:     fmtDate(row.fdatestatus3),
      arriveThai:     fmtDate(row.fdatestatus4),
      price:          numberFormat(net, 2),
      status:         csvStatusText(row.fstatus ?? "", row.id),
    };
  });

  // PERF (2026-06-03): paginate the DISPLAYED rows (50/page). The status-tab
  // counts (arrStatus / countAll / statusDriverItem) are derived from a
  // SEPARATE status-only query so they stay full-set-correct; the q=6/q=6.1
  // client filtering + per-row net (rowNet) above also run over the full set.
  // Only the rendered mobile cards + desktop table slice to this window.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

  // ── Payable rows (legacy: fStatus=5 get a checkbox; `.d-none2` hides it on
  //    the rest) → the row-select checkboxes + live pay-bar total + pay modal.
  //    Default-selected, mirroring the legacy DataTables `initComplete`. ──
  const payableRows = pageRows.filter((r) => r.fstatus === "5");
  const payablePayload = payableRows.map((r) => ({
    id: r.id,
    net: rowNet.get(r.id) ?? 0,
  }));
  // The pay-modal row shape (forwarder-row-view `ForwarderRow`). Only the
  // fields the modal reads (price math + PCSF/credit/WHT) carry real values;
  // the rest are null/0 placeholders the modal never touches.
  const payModalRows: PayModalRow[] = payableRows.map((r) => ({
    id: r.id,
    fdate: r.fdate,
    fstatus: r.fstatus,
    ftrackingchn: r.ftrackingchn,
    ftrackingchn2: r.ftrackingchn2,
    ftrackingth: null,
    ftransporttype: r.ftransporttype,
    fshipby: r.fshipby,
    fdetail: r.fdetail,
    fcover: r.fcover,
    famount: r.famount ?? 0,
    fweight: r.fweight ?? 0,
    fvolume: r.fvolume ?? 0,
    ftotalprice: r.ftotalprice ?? 0,
    ftransportprice: r.ftransportprice ?? 0,
    fpriceupdate: r.fpriceupdate ?? 0,
    fdiscount: r.fdiscount ?? 0,
    fshippingservice: r.fshippingservice ?? 0,
    pricecrate: r.pricecrate ?? 0,
    ftransportpricechnthb: r.ftransportpricechnthb ?? 0,
    priceother: r.priceother ?? 0,
    fusercompany: r.fusercompany,
    fcredit: r.fcredit,
    fcreditdate: null,
    fdatestatus5: null,
    fdatetothai: null,
    fcabinetnumber: r.fcabinetnumber,
    fdatecontainerclose: null,
    fnote: null,
    fnoteuser: null,
    reforder: r.reforder,
    adminidcreator: null,
    promoid: null,
  }));

  // ── the add-forwarder modal address <select> (L1149-1167) ──
  // The main address (tb_address ⋈ tb_address_main) first, then every
  // other active address; "รับเองหน้าโกดัง Pacred (สมุทรสาคร)" appended last.
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
        fullAddress: t("mainAddressPrefix") + " " + buildFullAddress(mainRowRes.data, t),
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
      fullAddress: buildFullAddress(row, t),
    });
  }

  // forwarder-table.php prints screen.width-conditional markup; on the
  // server we render the desktop variant (the legacy default for
  // width>=578 — the .nowrap table). DataTables JS init is a follow-up.

  // Tailwind rebuild (เดฟ 2026-05-27 — ปอน: "rebuild css เป็น tailwind ให้
  // หน่อย ห้ามแก้ relation อะไร ต้องให้ฟังก์ชั่นทุกอย่างทำงานเหมือนเดิม").
  // The wrapper + tab strip + status-filter chips + search form + pay-bar
  // are converted from Bootstrap-4 / Modern-Admin theme classes to Tailwind
  // — matching the sibling `/service-import` page.tsx so the two views feel
  // visually identical. All hrefs, name attrs, ids, data-toggle attrs,
  // <form action/method> contracts preserved so legacy jQuery + Server
  // Actions still trigger exactly as before. The <table id="myTable">
  // body + summary row stay legacy-styled (DataTables JS may attach to
  // them) and the add-forwarder modal stays Bootstrap-4 markup
  // (data-toggle handles open/close).
  //
  // Status-chip badge colors map the legacy `badge-*` palette to Tailwind,
  // exactly mirroring page.tsx's statusChips for visual parity.
  const statusChips: { href: string; label: string; count: number; chipColor: string }[] = [
    { href: "/service-import/table?q=all", label: t("tabAll"),               count: countAll,                          chipColor: "bg-slate-100 text-slate-700"   },
    { href: "/service-import/table?q=1",   label: t("tabWaitWarehouse"),     count: arrStatus[1],                      chipColor: "bg-amber-100 text-amber-700"   },
    { href: "/service-import/table?q=2",   label: t("statusAtChinaWarehouse"), count: arrStatus[2],                    chipColor: "bg-sky-100 text-sky-700"       },
    { href: "/service-import/table?q=3",   label: t("statusShippingToThailand"), count: arrStatus[3],                  chipColor: "bg-pink-100 text-pink-700"     },
    { href: "/service-import/table?q=4",   label: t("tabArrivedThailand"),   count: arrStatus[4],                      chipColor: "bg-amber-200 text-amber-900"   },
    { href: "/service-import/table?q=5",   label: t("statusWaitPayment"),    count: arrStatus[5],                      chipColor: "bg-red-100 text-red-700"       },
    { href: "/service-import/table?q=6",   label: t("statusPreparing"),      count: arrStatus[6] - statusDriverItem,   chipColor: "bg-indigo-100 text-indigo-700" },
    { href: "/service-import/table?q=6.1", label: t("statusDelivering"),     count: statusDriverItem,                  chipColor: "bg-cyan-100 text-cyan-700"     },
    { href: "/service-import/table?q=7",   label: t("statusDelivered"),      count: arrStatus[7],                      chipColor: "bg-emerald-100 text-emerald-700" },
  ];

  const isQActive = (val: string) => q === val || (val === "all" && (q === "" || q === "all"));

  return (
    <div className="pcs-legacy">
      {/* Collapse the desktop sidebar on this wide table view so the full
          table reclaims its width (ปอน 2026-06-08). Scoped to this route.
          `hasPayBar` also lifts the LINE bubble above the pay-bar when there
          are unpaid items (กัน LINE ทับปุ่มชำระเงิน). */}
      <CollapseSidebar hasPayBar={arrStatus[5] > 0} />
      {/* Legacy PCS stylesheets — static public/ assets, loaded via plain
          <link>s so they bypass the app's Tailwind/PostCSS pipeline.
          service-import.css = the shared BS4 + theme chrome base (still
          needed for legacy `badge-*` colours inside the table body + the
          modal markup); forwarder-table.css = the DataTables wrapper
          chrome the legacy JS expects. */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />
      <link rel="stylesheet" href="/legacy/pcs/forwarder-table.css" />

      {/* Selection context — the row-select checkboxes + select-all + live
          pay-bar all read/write one client store; the <table> below stays
          server-rendered and its checkbox cells hydrate as consumers. */}
      <TableSelectionProvider payable={payablePayload} payRows={payModalRows}>
      {/* Page content — Tailwind rebuild matching /service-import page.tsx.
          Wrapped in `.pcs-content-pad` so the (protected) layout's desktop
          padding (sidebar clearance + FloatingTabs clearance) kicks in. The
          big mobile `pb` clears the fixed pay-bar + bottom-nav so the last
          table rows aren't hidden once the page scrolls (mobile flow layout). */}
      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-[180px] md:py-6">
        {/* The whole card is a bounded flex column: the header (tabs +
            unified search/status frame) stays pinned and ONLY the table
            body scrolls inside it — so ตัวค้นหา + สถานะ + หัวตาราง ล็อคไว้
            ไม่ขยับ (ปอน 2026-05-29: "ทำให้เป็นกรอบเดียวกัน … ล็อคไว้เลย
            ไม่ให้ขยับ"). max-h reserves room for the top chrome (NavBar 56px
            + SearchBar) and the bottom pay-bar / FloatingTabs; svh tracks the
            mobile browser UI. Tuned in-browser §0c. */}
        {/* DESKTOP: a fixed-height card — the header stays locked while only the
            table body scrolls inside (ปอน 2026-05-29 "ล็อคไว้ไม่ให้ขยับ").
            MOBILE: NO height cap — the whole page scrolls (legacy mobile feel),
            so the table flows at full height instead of being squeezed into a
            tiny window behind the tall stacked header (ปอน 2026-06-08
            "แสดงผลพอดีจอ … เห็นรายการเต็มๆ"). */}
        <section className="flex flex-col rounded-2xl border border-border bg-white shadow-sm dark:bg-surface md:max-h-[calc(100svh-15.5rem)] md:overflow-hidden">
          {/* ═══ LOCKED HEADER — stays put while the table body scrolls ═══ */}
          <div className="flex shrink-0 flex-col">
          {/* ── Tab strip (shared component — identical on both views) ── ·
              with the "+ เพิ่มรายการนำเข้า" CTA on the right of the tab row
              (ปอน 2026-06-09 "ขยับปุ่มขึ้นไปแถว tabs"). */}
          <ImportViewTabs
            active="table"
            action={
              <Link
                href="/service-import/add"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 pl-1 pr-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.98] whitespace-nowrap"
              >
                <span className="inline-flex w-6 h-6 items-center justify-center rounded-full bg-white text-emerald-600 font-black text-base leading-none" aria-hidden>
                  +
                </span>
                {/* mobile = short "เพิ่มรายการ" · sm+ = full label (ปอน 2026-06-09) */}
                <span className="sm:hidden">{t("addImportItemShort")}</span>
                <span className="hidden sm:inline">{t("addImportItem")}</span>
              </Link>
            }
          />

          {/* ── UNIFIED FRAME — ค้นหา + สถานะ อยู่ในกรอบเดียวกัน (ปอน
              2026-05-29 "ทำให้เป็นกรอบเดียวกัน"). Search row (Tracking + Lot
              + search + add CTA), a dashed divider, then the status-tab
              filter — one box, no inner border between them. On mobile the
              search row is a 2-col grid (inputs row 1, buttons row 2); md+
              it's a single flex row. */}
          <div className="px-3 py-3 md:px-4 md:py-3">
            {/* Compact + balanced search row (ปอน 2026-06-08 "ปรับให้สมดุล
                ลดขนาดเล็กลง ทั้งคอม-มือถือ"): every control is one consistent
                `h-9` height so the 2 inputs + 2 buttons line up evenly. The
                `text-[13px]` on the form drives the input/select/button text
                size (cart.css forces `.pcs-legacy input/button/select{font-size:
                inherit}`, so they take the parent's size). */}
            {/* สถานะรายการ heading. The "+ เพิ่มรายการนำเข้า" CTA moved up to the
                view-tab row (ปอน 2026-06-09 "ขยับขึ้นไปแถว tabs"). */}
            <h4 className="mb-2.5 text-sm font-bold text-foreground md:text-lg">
              {t("statusHeading")}
            </h4>

            {/* Search form (Tracking + ล๊อตตู้ + ค้นหารายการ) removed (ปอน
                2026-06-09: "เอา 3 ปุ่มนี้ออก"). The DataTables live-search +
                export toolbar below the status tabs are kept. */}

            <ul className="flex flex-wrap items-end gap-0 border-b border-border">
              {statusChips.map((chip) => {
                const active = isQActive(
                  chip.href.split("?q=")[1] ?? "all",
                );
                return (
                  <li key={chip.href}>
                    <Link
                      href={chip.href}
                      className={`inline-flex items-center gap-1.5 px-3 md:px-4 py-2 text-sm md:text-base font-medium whitespace-nowrap transition-colors border-x border-t -mb-px ${
                        active
                          ? "bg-[#ff8989]/[0.192] text-[#cc3333] border-[#cc3333] border-b-white rounded-t-md"
                          : "bg-transparent text-foreground hover:text-[#cc3333] border-transparent"
                      }`}
                    >
                      <span>{chip.label}</span>
                      {chip.count > 0 && (
                        <span
                          className={`inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[10px] font-bold px-1.5 ${
                            active ? "bg-red-600 text-white" : chip.chipColor
                          }`}
                        >
                          {chip.count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* DataTables toolbar — live "ค้นหา:" filter (left) + export
                buttons คัดลอก/CSV/Excel/พิมพ์ (right), one row above the table
                (ปอน 2026-06-09: เอ้า search+export กลับมา). The live search box
                filters the rendered rows client-side; export covers the FULL
                filtered set. `text-[11px]` shrinks the controls (cart.css forces
                `.pcs-legacy button/input { font-size: inherit }`). */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
              <TableQuickSearch />
              <ExportToolbar
                rows={csvRows}
                cols={CSV_COLS}
                filename={`รายการฝากนำเข้า-${memberCode}.csv`}
              />
            </div>

            {/* the `btn-pay-pc` anchor — kept for legacy positioning hooks */}
            {arrStatus[5] > 0 && (
              <div className="pt-1 text-center md:text-left">
                <div style={{ position: "relative" }} className="btn-pay-pc"></div>
              </div>
            )}
          </div>
          {/* ═══ END LOCKED HEADER (tabs + unified search/status frame) ═══ */}
          </div>

          {/* ── The table form — the ONLY scrolling region. `flex-1 min-h-0`
              fills the rest of the card; `overflow-auto` scrolls the rows
              (both axes); the <thead> is `sticky top-0` so หัวตาราง ล็อค
              ไม่ขยับ while rows scroll under it. Form id + table id +
              checkbox/total classes preserved verbatim — DataTables JS
              attaches to `#myTable`, live pay-recalc JS reads/writes
              `.countPay` + `.price-all`. */}
          <form id="frm-example2" className="flex min-h-0 flex-1 flex-col">
              {/* MOBILE: only x-auto (the 7 cols already fit, so no scroll fires)
                  — the page scrolls vertically. DESKTOP: full inner-scroll so the
                  locked header stays put while rows scroll. */}
              <div className="table-responsive2 scrollbar-clean min-h-0 flex-1 overflow-x-auto rounded-t-xl border border-border md:overflow-auto">
                {/* ── ONE responsive table for desktop AND mobile (ปอน
                    2026-06-08: "อยากได้แบบตาราง ทั้งคอมและมือถือ อิงจาก legacy").
                    Replaces the old md:hidden card list — the "แบบตาราง" view is
                    now a real table on every screen. Wide columns collapse on
                    smaller widths via `sm:`/`xl:table-cell`, so mobile shows the
                    legacy core set (tracking · ลัง · หนัก · คิว · ราคา · สถานะ);
                    the container scrolls-x if a row still overflows. ── */}
                <div className="min-w-full">
                <table
                  id="myTable"
                  className={
                    "dataTable w-full text-[13px] md:text-sm text-black dark:text-foreground " +
                    // legacy `.table-bordered` — full 1px #dee2e6 grid on every
                    // th + td (table-level arbitrary variants so no per-cell edit).
                    "[&_th]:border [&_th]:border-[#dee2e6] [&_td]:border [&_td]:border-[#dee2e6] " +
                    "dark:[&_th]:border-border dark:[&_td]:border-border " +
                    // legacy `.table-striped` — zebra on even body rows (the
                    // `.no-sort` summary is row 1/odd, so it keeps its gradient).
                    "[&_tbody_tr:nth-of-type(even)]:bg-black/[0.035] dark:[&_tbody_tr:nth-of-type(even)]:bg-white/[0.035] " +
                    // legacy compact density (.table td .15rem/.3rem · th .25rem) +
                    // legacy header row is centered (.text-center on the <tr>).
                    // Mobile is ULTRA-compact so the 7 core columns fit a phone
                    // with NO horizontal scroll (ปอน 2026-06-08 "พอดีจอ ไม่ต้องเลื่อน")
                    // — desktop relaxes back to the legacy density.
                    "[&_tbody_td]:px-1 [&_tbody_td]:py-0.5 md:[&_tbody_td]:px-1.5 md:[&_tbody_td]:py-1 " +
                    "[&_tbody_td]:text-[10.5px] md:[&_tbody_td]:text-[13px] " +
                    "[&_thead_th]:px-1 [&_thead_th]:py-1.5 md:[&_thead_th]:px-2 md:[&_thead_th]:py-2 " +
                    "[&_thead_th]:text-[10px] md:[&_thead_th]:text-xs [&_thead_th]:text-center [&_thead_th]:align-middle"
                  }
                >
                  {/* Header — single gradient `#ce35a1 → #ee7411` matching
                      legacy `.bg-danger2` (forwarder-table.php L597 inline
                      <style>). Single bg on <tr> spans all 22 columns
                      continuously. ⚠ Inline `display: table-header-group`
                      overrides cart.css's `.pcs-legacy thead { display: none }`
                      leak. */}
                  <thead
                    // `display:table-header-group` overrides cart.css's
                    // `.pcs-legacy thead{display:none}` leak. Sticky only on
                    // DESKTOP (the inner-scroll window) — on mobile the page
                    // scrolls so the header rides along like the legacy.
                    style={{ display: "table-header-group" }}
                    className="z-20 md:sticky md:top-0"
                  >
                    <tr className="text-center bg-gradient-to-r from-[#cc3333] to-[#b30000]">
                      <th className="px-2 py-3 text-center align-middle border-r border-white/20"><SelectAllHeaderCheckbox /></th>
                      <th className="all add-text-all px-3 py-3 text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colTrackingChn")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colLotSeq")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colDetail")}</th>
                      <th className="all add-text-all px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colBoxes")}</th>
                      <th className="all add-text-all px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colWeight")}</th>
                      <th className="all add-text-all hidden min-[1200px]:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colWidth")}</th>
                      <th className="all add-text-all hidden min-[1200px]:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colHeight")}</th>
                      <th className="all add-text-all hidden min-[1200px]:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colLength")}</th>
                      <th className="all add-text-all px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colVolume")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colPricedBy")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colImportRate")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colType")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colCratePrice")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colChinaTransport")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colOther")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colThaiTransport")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colEnterChinaWarehouse")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colLeaveChinaWarehouse")}</th>
                      <th className="all add-text-all hidden min-[578px]:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colArriveThaiWarehouse")}</th>
                      <th className="all add-text-all px-3 py-3 text-right text-xs md:text-sm font-bold text-white whitespace-nowrap border-r border-white/20">{t("colPrice")}</th>
                      <th className="all add-text-all px-3 py-3 text-center text-xs md:text-sm font-bold text-white whitespace-nowrap">{t("colStatus")}</th>
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
                                      {/* Summary row "รวม" — legacy
                                          `.bg-color` (forwarder-table.php
                                          inline CSS): same pink→orange
                                          gradient as the thead + white text. */}
                                      <tr className="bg-gradient-to-r from-[#cc3333] to-[#b30000] text-white no-sort">
                                        <td className="px-2 py-1.5 border-b border-border"></td>
                                        <td className="t3 px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t5 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t6 text-right hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-bold text-white">{t("summaryTotal")}</td>
                                        <td className="t7 text-right px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums">{sumBoxes > 0 ? sumBoxes : ""}</td>
                                        <td className="t8 text-right px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums">{sumWeight > 0 ? numberFormat(sumWeight, 2) : ""}</td>
                                        <td className="t9 hidden min-[1200px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums"></td>
                                        <td className="t10 hidden min-[1200px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums"></td>
                                        <td className="t11 hidden min-[1200px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums"></td>
                                        <td className="t12 text-right px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums">{sumVolume > 0 ? numberFormat(sumVolume, 3) : ""}</td>
                                        <td className="t-refprice hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t-refrate hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t13 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t14 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums"></td>
                                        <td className="t15 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums"></td>
                                        <td className="t15-1 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums"></td>
                                        <td className="t15-2 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums"></td>
                                        <td className="t15-3 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums"></td>
                                        <td className="t16 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t17 hidden min-[578px]:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t19 text-right px-2 py-1.5 border-b border-border text-xs font-bold text-white tabular-nums">{numberFormat(sumNetPrice, 2)}</td>
                                        <td className="t18 px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                      </tr>
                                      {pageRows.length === 0 && (
                                        <tr>
                                          <td colSpan={22} className="px-3 py-10 text-center text-sm text-muted">
                                            {t("noItems")}
                                          </td>
                                        </tr>
                                      )}
                                      {pageRows.map((row) => {
                                        const fStatusDriver = arrFIDDriver.has(row.id) ? 1 : 0;
                                        const cover = resolveCover(row.fcover);
                                        const net = rowNet.get(row.id) ?? 0;
                                        const isHan = /\p{Script=Han}/u.test(row.fdetail ?? "");
                                        const isAnchor = anchorID && anchorID === String(row.id);
                                        return (
                                          <tr
                                            key={row.id}
                                            className={
                                              "border-b border-border hover:bg-surface-alt/40 transition-colors " +
                                              (isAnchor ? "bg-red-50 anchor" : "")
                                            }
                                            {...(isAnchor ? { id: `F${row.id}` } : {})}
                                          >
                                            <td className="px-2 py-1.5 text-center align-middle">
                                              <RowCheckbox id={row.id} />
                                            </td>
                                            {/* Tracking — number on top, thumbnail
                                                stacked below (legacy `<br/>`); the
                                                number wraps so the column stays narrow
                                                enough to fit a phone with no scroll. */}
                                            <td className="text-[10.5px] md:text-sm text-foreground align-top">
                                              <div className="flex flex-col items-start gap-0.5">
                                                <Link
                                                  className="text-red-600 hover:underline font-mono break-all leading-tight"
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
                                                  <img
                                                    src={cover}
                                                    alt=""
                                                    className="w-5 h-5 md:w-6 md:h-6 rounded object-cover border border-border"
                                                  />
                                                </a>
                                              </div>
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-xs md:text-sm text-foreground whitespace-nowrap">
                                              {row.ftransporttype === "1" ? t("transportTruckColon") : t("transportSeaColon")}
                                              {countText(
                                                (row.fcabinetnumber ?? "")
                                                  .replace(/รถ /g, "")
                                                  .replace(/大/g, ""),
                                                20,
                                              )}
                                              /
                                              <Link
                                                className="text-red-600 hover:underline font-mono"
                                                href={`/service-import/${row.id}`}
                                              >
                                                {row.id}
                                              </Link>
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-xs md:text-sm text-foreground">
                                              <Link
                                                className="text-red-600 hover:underline"
                                                href={`/service-import/${row.id}`}
                                              >
                                                {isHan
                                                  ? countText(row.fdetail, 5)
                                                  : countText(row.fdetail, 12)}
                                              </Link>
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {(row.famount ?? 0) > 0 ? row.famount : ""}
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {(row.fweight ?? 0) > 0
                                                ? numberFormat(row.fweight!, 2)
                                                : ""}
                                            </td>
                                            <td className="hidden min-[1200px]:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {(row.fwidth ?? 0) > 0
                                                ? numberFormat(row.fwidth!, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden min-[1200px]:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {(row.fheight ?? 0) > 0
                                                ? numberFormat(row.fheight!, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden min-[1200px]:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {(row.flength ?? 0) > 0
                                                ? numberFormat(row.flength!, 2)
                                                : "-"}
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {(row.fvolume ?? 0) > 0
                                                ? numberFormat(row.fvolume!, 3)
                                                : "-"}
                                            </td>
                                            {/* คิดราคาตาม (frefprice: 1=น้ำหนัก 2=ปริมาตร) */}
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-center text-xs md:text-sm text-foreground whitespace-nowrap">
                                              {nameRefPrice2(row.frefprice, t)}
                                            </td>
                                            {/* เรทนำเข้า (frefrate ฿ ต่อหน่วย) */}
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {(row.frefrate ?? 0) > 0 ? numberFormat(row.frefrate!, 2) : "-"}
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-center text-xs md:text-sm text-foreground">
                                              {nameProductsType2(row.fproductstype, t)}
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.pricecrate ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.ftransportpricechnthb ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.priceother ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.ftransportprice ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-center text-xs text-foreground">
                                              {fmtDate(row.fdatestatus2)}
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-center text-xs text-foreground">
                                              {fmtDate(row.fdatestatus3)}
                                            </td>
                                            <td className="hidden min-[578px]:table-cell px-2 py-1.5 text-center text-xs text-foreground">
                                              {fmtDate(row.fdatestatus4)}
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-xs md:text-sm tabular-nums">
                                              <span className="text-red-600 font-semibold">
                                                {numberFormat(net, 2)}
                                              </span>
                                            </td>
                                            <td className="px-2 py-1.5 text-center">
                                              {statusForwarderAll4(
                                                row.fstatus ?? "",
                                                fStatusDriver,
                                                t,
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                  </tbody>
                </table>
                </div>
              </div>
              <div id="example-console-rows"></div>
            </form>
        </section>

        <Pagination
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={rows.length}
          basePath="/service-import/table"
          params={{ q: sp.q, fTrackingCHN: sp.fTrackingCHN, fCabinetNumber: sp.fCabinetNumber }}
        />
      </div>

      {/* ── Bottom pay-bar — legacy `.b-pay` fixed bar (forwarder-table.php
            L1064-1083). Now driven by the selection context: เลือกทั้งหมด ·
            จำนวนรายการ · live ยอดชำระรวม (Σ selected net) · ชำระเงิน opens the
            shared multi-bill ForwarderPayModal with the selected rows. Renders
            only when the page has payable (fStatus=5) rows. */}
      <TablePayBar isJuristic={isJuristic} />
      </TableSelectionProvider>

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
              <h4 className="modal-title">{t("modalTitle")}</h4>
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
              {/* The legacy `save` POST (forwarder-table.php L37-155 / posts
                  to forwarder/) creates a tb_forwarder order. Wired via the
                  shared <ServiceImportAddForm> Client Component → the
                  createLegacyForwarder Server Action accepts both forwarder
                  .php (`hTransportType`) and forwarder-table.php
                  (`fTransportType`) field names. */}
              <ServiceImportAddForm>
                <div className="form-group">
                  <div className="border-bottom-2"></div>
                  <h5 className="text-center">{t("modalFillDetails")}</h5>
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
                        {t("chinaWarehouseAddress")}
                      </a>
                    </div>
                    <label className="form-control-label" htmlFor="fTrackingCHN">
                      {t("trackingNumberLabel")}
                    </label>
                    <input
                      className="form-control form-control-lg"
                      name="fTrackingCHN"
                      type="text"
                      placeholder={t("trackingNumberLabel")}
                      maxLength={50}
                      required
                    />
                    <div id="message"></div>
                  </div>

                  <div className="mb-1">
                    <label className="form-control-label" htmlFor="fDetail">
                      {t("colDetail")}
                    </label>
                    <textarea
                      className="form-control"
                      rows={3}
                      name="fDetail"
                      placeholder={t("colDetail")}
                      maxLength={500}
                      required
                    ></textarea>
                  </div>

                  <div className="mb-1">
                    <label className="form-control-label" htmlFor="fAmount">
                      {t("boxCountLabel")}
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
                  <h5 className="text-center">{t("shippingInfoHeading")} </h5>
                  <div className="border-bottom-2">
                    <hr />
                  </div>
                  <label className="form-control-label" htmlFor="fTransportType">
                    {t("transportTypeLabel")}
                  </label>
                  <div className="form-group">
                    <select id="transportType" className="form-control" name="fTransportType" required>
                      <option value="1">{t("transportTruckOption")}</option>
                      <option value="2">{t("transportSeaOption")}</option>
                    </select>
                  </div>
                  <div className="mb-1">
                    <label className="form-control-label" htmlFor="fAmount">
                      {t("deliveryAddressLabel")}{" "}
                      <Link
                        href="/addresses/add"
                        target="_blank"
                        className="text-info font-10"
                      >
                        {t("addAddress")} <i className="ti-plus"></i>
                      </Link>
                    </label>

                    <select className="form-control" name="addressID" id="addressID" required>
                      <option value="" defaultValue="">
                        {t("selectDeliveryAddress")}
                      </option>
                      {addressOptions.map((a) => (
                        <option key={a.addressID} value={a.addressID}>
                          {a.fullAddress}
                        </option>
                      ))}
                      <option value="PCS">{t("selfPickupWarehouse")}</option>
                    </select>
                  </div>
                  <div id="selectShipBy"></div>

                  <div className="modal-footer">
                    <button
                      type="reset"
                      className="btn btn-outline-secondary round waves-effect"
                      data-dismiss="modal"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-color-main round waves-effect"
                      name="save"
                      id="btnSubmit"
                    >
                      {t("save")}
                    </button>
                  </div>
                </div>
              </ServiceImportAddForm>
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
function buildFullAddress(
  r: Record<string, string | number | null>,
  t: (key: string) => string,
): string {
  const s = (v: string | number | null | undefined): string =>
    v == null ? "" : String(v);
  return (
    t("addressHonorific") +
    s(r.addressname) +
    " " +
    s(r.addresslastname) +
    " " +
    s(r.addressno) +
    " " +
    t("addressSubdistrictLabel") +
    " " +
    s(r.addresssubdistrict) +
    " " +
    t("addressDistrictLabel") +
    " " +
    s(r.addressdistrict) +
    " " +
    t("addressProvinceLabel") +
    " " +
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
