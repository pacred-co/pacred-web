import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { calPriceForwarderSumCompany } from "@/lib/forwarder/calc-company-total";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { legacyMemberUrl } from "@/lib/legacy-image";
import { ServiceImportAddForm } from "../add/service-import-add-form";
import { parsePage, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";

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
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${chip.cls}`}
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
  searchParams: Promise<{ q?: string; fTrackingCHN?: string; fCabinetNumber?: string; ID?: string; page?: string }>;
}) {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;
  const t = await getTranslations("serviceImportTable");

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

  // PERF (2026-06-03): paginate the DISPLAYED rows (50/page). The status-tab
  // counts (arrStatus / countAll / statusDriverItem) are derived from a
  // SEPARATE status-only query so they stay full-set-correct; the q=6/q=6.1
  // client filtering + per-row net (rowNet) above also run over the full set.
  // Only the rendered mobile cards + desktop table slice to this window.
  const page = parsePage(sp.page);
  const offset = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = rows.slice(offset, offset + DEFAULT_PAGE_SIZE);

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
      {/* Legacy PCS stylesheets — static public/ assets, loaded via plain
          <link>s so they bypass the app's Tailwind/PostCSS pipeline.
          service-import.css = the shared BS4 + theme chrome base (still
          needed for legacy `badge-*` colours inside the table body + the
          modal markup); forwarder-table.css = the DataTables wrapper
          chrome the legacy JS expects. */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />
      <link rel="stylesheet" href="/legacy/pcs/forwarder-table.css" />

      {/* Page content — Tailwind rebuild matching /service-import page.tsx.
          Wrapped in `.pcs-content-pad` so the (protected) layout's desktop
          padding (sidebar clearance + FloatingTabs clearance) kicks in. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6">
        {/* The whole card is a bounded flex column: the header (tabs +
            unified search/status frame) stays pinned and ONLY the table
            body scrolls inside it — so ตัวค้นหา + สถานะ + หัวตาราง ล็อคไว้
            ไม่ขยับ (ปอน 2026-05-29: "ทำให้เป็นกรอบเดียวกัน … ล็อคไว้เลย
            ไม่ให้ขยับ"). max-h reserves room for the top chrome (NavBar 56px
            + SearchBar) and the bottom pay-bar / FloatingTabs; svh tracks the
            mobile browser UI. Tuned in-browser §0c. */}
        <section className="flex max-h-[calc(100svh-18.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm dark:bg-surface md:max-h-[calc(100svh-15.5rem)]">
          {/* ═══ LOCKED HEADER — stays put while the table body scrolls ═══ */}
          <div className="flex shrink-0 flex-col">
          {/* ── Tab strip — legacy `nav nav-tabs nav-underline` markup
              (forwarder-table.php L734-746): big H3 headings, active =
              red underline. ปอน 2026-05-28 sent legacy HTML to copy. */}
          <div className="border-b border-border px-3 pt-3 md:px-4 md:pt-4">
            <ul className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden gap-0">
              <li>
                <Link
                  href="/service-import"
                  className="shrink-0 inline-flex items-end gap-2 px-4 pb-2.5 text-base md:text-xl font-medium text-muted hover:text-foreground border-b-[3px] border-transparent hover:border-border whitespace-nowrap transition-colors"
                >
                  <span aria-hidden className="ft-box" />
                  {t("tabFullView")}
                </Link>
              </li>
              <li>
                <Link
                  href="/service-import/table"
                  className="shrink-0 inline-flex items-end gap-2 px-4 pb-2.5 text-base md:text-xl font-bold text-red-600 border-b-[3px] border-red-600 whitespace-nowrap"
                >
                  <span aria-hidden className="fas fa-table" />
                  {t("tabTableView")}
                </Link>
              </li>
            </ul>
          </div>

          {/* ── UNIFIED FRAME — ค้นหา + สถานะ อยู่ในกรอบเดียวกัน (ปอน
              2026-05-29 "ทำให้เป็นกรอบเดียวกัน"). Search row (Tracking + Lot
              + search + add CTA), a dashed divider, then the status-tab
              filter — one box, no inner border between them. On mobile the
              search row is a 2-col grid (inputs row 1, buttons row 2); md+
              it's a single flex row. */}
          <div className="px-3 py-3 md:px-4 md:py-3">
            <form
              className="grid grid-cols-2 items-start gap-2 md:flex md:flex-row md:items-end md:gap-3"
              id="search"
              method="GET"
              action="/service-import/table"
              autoComplete="off"
            >
              <div className="min-w-0 md:flex-1">
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="fTrackingCHN">
                  {t("searchTrackingLabel")}
                </label>
                <input
                  className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
                  name="fTrackingCHN"
                  id="fTrackingCHN"
                  type="text"
                  placeholder={t("trackingPlaceholder")}
                  defaultValue={fTrackingCHNRaw}
                />
              </div>
              <div className="min-w-0 md:flex-1">
                <label className="block text-xs font-medium text-muted mb-1" htmlFor="fCabinetNumber">
                  {t("lotLabel")}
                </label>
                <select
                  className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 transition-colors"
                  name="fCabinetNumber"
                  id="fCabinetNumber"
                  defaultValue={fCabinetNumberRaw || "all"}
                >
                  <option value="all">{t("tabAll")}</option>
                  {cabinetOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex w-full md:w-auto items-center justify-center rounded-lg bg-red-600 text-white px-5 py-2 text-sm font-bold shadow-sm hover:bg-red-700 active:scale-[0.98] transition-all whitespace-nowrap"
                name="search"
              >
                {t("searchButton")}
              </button>
              <Link
                href="/service-import/add"
                className="inline-flex w-full md:w-auto items-center gap-2 justify-center md:justify-start rounded-full bg-emerald-600 text-white pl-1.5 pr-4 py-1.5 text-sm font-bold shadow-md shadow-emerald-600/25 hover:bg-emerald-700 active:scale-[0.98] transition-all whitespace-nowrap"
              >
                <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-white text-emerald-600 font-black text-lg leading-none shadow-sm" aria-hidden>
                  +
                </span>
                <span>{t("addImportItem")}</span>
              </Link>
            </form>
            {sp.fTrackingCHN !== undefined && (
              <div className="text-xs text-red-600 mt-2">
                {t("searchResultsBy")}{" "}
                {sp.fTrackingCHN ? <>{t("searchResultTracking", { value: sp.fTrackingCHN })}</> : null}
                {sp.fCabinetNumber ? <> {t("searchResultLot", { value: sp.fCabinetNumber })}</> : null}
              </div>
            )}

            {/* dashed divider inside the unified frame — separates the
                search row from the status-tab filter (same กรอบ). */}
            <hr className="my-3 border-t border-dashed border-border" />

            {/* ── Status filter — legacy `nav nav-tabs nav-underline pcs-tabs`
                (forwarder-table.php L795-830): plain nav-link buttons in a
                row, active = light-pink bg + red text + red borders. */}
            <h4 className="mb-2.5 text-sm font-bold text-foreground md:text-lg">
              {t("statusHeading")}
            </h4>
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
                          ? "bg-red-100/60 text-red-700 border-red-600 border-b-white rounded-t-md"
                          : "bg-transparent text-foreground hover:text-red-600 border-transparent"
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
              <div className="table-responsive2 min-h-0 flex-1 overflow-auto">
                {/* ── Mobile: easy-read cards (md:hidden) — same `rows` as the
                    desktop table, one card per forwarder, tap → detail.
                    ปอน 2026-05-30 "มือถือ ทำให้ดูง่ายๆ". ── */}
                <div className="space-y-2.5 p-2 md:hidden">
                  {rows.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted">{t("noItems")}</p>
                  ) : (
                    pageRows.map((row) => {
                      const fStatusDriver = arrFIDDriver.has(row.id) ? 1 : 0;
                      const cover = resolveCover(row.fcover);
                      const net = rowNet.get(row.id) ?? 0;
                      const isAnchor = anchorID && anchorID === String(row.id);
                      return (
                        <div
                          key={row.id}
                          className={`rounded-xl border p-3 shadow-sm ${
                            isAnchor ? "border-red-300 bg-red-50" : "border-border bg-white dark:bg-surface"
                          }`}
                          {...(isAnchor ? { id: `F${row.id}` } : {})}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              href={`/service-import/${row.id}`}
                              className="min-w-0 break-all font-mono text-sm font-semibold text-red-600 hover:underline"
                            >
                              {row.ftrackingchn2 || row.ftrackingchn || `#${row.id}`}
                            </Link>
                            <span className="shrink-0">
                              {statusForwarderAll4(row.fstatus ?? "", fStatusDriver, t)}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center gap-2.5">
                            <a href={cover} className="image-popup-vertical-fit el-link shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={cover}
                                alt=""
                                className="h-11 w-11 rounded-lg border border-border object-cover"
                              />
                            </a>
                            <div className="min-w-0">
                              <p className="truncate text-xs text-foreground">
                                {countText(row.fdetail, 40) || "—"}
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted">
                                {row.ftransporttype === "1" ? t("transportTruck") : t("transportSea")}
                                {row.fcabinetnumber
                                  ? ` · ${t("lotLabel")} ${countText(row.fcabinetnumber.replace(/รถ /g, "").replace(/大/g, ""), 16)}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2.5 grid grid-cols-4 gap-1 border-t border-dashed border-border pt-2 text-center">
                            <div>
                              <div className="text-[10px] text-muted">{t("colBoxes")}</div>
                              <div className="text-sm font-semibold tabular-nums">
                                {(row.famount ?? 0) > 0 ? row.famount : "-"}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted">{t("colWeight")}</div>
                              <div className="text-sm font-semibold tabular-nums">
                                {(row.fweight ?? 0) > 0 ? numberFormat(row.fweight!, 2) : "-"}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted">{t("colVolume")}</div>
                              <div className="text-sm font-semibold tabular-nums">
                                {(row.fvolume ?? 0) > 0 ? numberFormat(row.fvolume!, 3) : "-"}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-muted">{t("colPrice")}</div>
                              <div className="text-sm font-bold tabular-nums text-red-600">
                                {numberFormat(net, 2)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* ── Desktop: full table. Wrapper isolates Tailwind hidden/block
                    from the legacy `.dataTable` display cascade (forwarder-table.css
                    loads after Tailwind). ── */}
                <div className="hidden md:block">
                <table
                  id="myTable"
                  className="dataTable w-full text-xs md:text-sm border-collapse"
                >
                  {/* Header — single gradient `#ce35a1 → #ee7411` matching
                      legacy `.bg-danger2` (forwarder-table.php L597 inline
                      <style>). Single bg on <tr> spans all 22 columns
                      continuously. ⚠ Inline `display: table-header-group`
                      overrides cart.css's `.pcs-legacy thead { display: none }`
                      leak. */}
                  <thead
                    style={{
                      display: "table-header-group",
                      position: "sticky",
                      top: 0,
                      zIndex: 20,
                    }}
                  >
                    <tr className="text-center bg-gradient-to-r from-[#f59e0b] to-[#dc2626]">
                      <th className="all add-text-all px-3 py-3 text-left text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colTrackingChn")}</th>
                      <th className="all add-text-all hidden xl:table-cell px-3 py-3 text-left text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colPurchaseOrder")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-left text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colLotSeq")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-left text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colDetail")}</th>
                      <th className="all add-text-all px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colBoxes")}</th>
                      <th className="all add-text-all px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colWeight")}</th>
                      <th className="all add-text-all hidden xl:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colWidth")}</th>
                      <th className="all add-text-all hidden xl:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colHeight")}</th>
                      <th className="all add-text-all hidden xl:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colLength")}</th>
                      <th className="all add-text-all px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colVolume")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colType")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colCratePrice")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colChinaTransport")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colOther")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colThaiTransport")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colEnterChinaWarehouse")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colLeaveChinaWarehouse")}</th>
                      <th className="all add-text-all hidden sm:table-cell px-3 py-3 text-center text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colArriveThaiWarehouse")}</th>
                      <th className="all add-text-all px-3 py-3 text-right text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap border-r border-white/20">{t("colPrice")}</th>
                      <th className="all add-text-all px-3 py-3 text-center text-xs md:text-sm font-bold text-white uppercase tracking-wide whitespace-nowrap">{t("colStatus")}</th>
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
                                      <tr className="bg-gradient-to-r from-[#f59e0b] to-[#dc2626] text-white no-sort">
                                        <td className="t3 px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t4 hidden xl:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t5 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t6 text-right hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-bold text-white">{t("summaryTotal")}</td>
                                        <td className="t7 text-right px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t8 text-right px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t9 hidden xl:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t10 hidden xl:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t11 hidden xl:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t12 text-right px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t13 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t14 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t15 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t15-1 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t15-2 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t15-3 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white tabular-nums font-mono"></td>
                                        <td className="t16 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t17 hidden sm:table-cell px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                        <td className="t19 text-right px-2 py-1.5 border-b border-border text-xs font-bold text-white tabular-nums font-mono"></td>
                                        <td className="t18 px-2 py-1.5 border-b border-border text-xs font-semibold text-white"></td>
                                      </tr>
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
                                            <td className="px-2 py-1.5 text-xs md:text-sm text-foreground whitespace-nowrap">
                                              <Link
                                                className="text-red-600 hover:underline font-mono"
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
                                                  className="w-6 h-6 rounded object-cover border border-border inline-block ml-1"
                                                />
                                              </a>
                                            </td>
                                            <td className="hidden xl:table-cell px-2 py-1.5 text-xs md:text-sm text-foreground">
                                              {row.reforder ? (
                                                <Link
                                                  href={`/service-order/${row.reforder}`}
                                                  className="text-sky-600 hover:underline text-xs"
                                                >
                                                  {row.reforder}
                                                </Link>
                                              ) : null}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-xs md:text-sm text-foreground whitespace-nowrap">
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
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-xs md:text-sm text-foreground">
                                              <Link
                                                className="text-red-600 hover:underline"
                                                href={`/service-import/${row.id}`}
                                              >
                                                {isHan
                                                  ? countText(row.fdetail, 5)
                                                  : countText(row.fdetail, 12)}
                                              </Link>
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {(row.famount ?? 0) > 0 ? row.famount : ""}
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {(row.fweight ?? 0) > 0
                                                ? numberFormat(row.fweight!, 2)
                                                : ""}
                                            </td>
                                            <td className="hidden xl:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {(row.fwidth ?? 0) > 0
                                                ? numberFormat(row.fwidth!, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden xl:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {(row.fheight ?? 0) > 0
                                                ? numberFormat(row.fheight!, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden xl:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {(row.flength ?? 0) > 0
                                                ? numberFormat(row.flength!, 2)
                                                : "-"}
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {(row.fvolume ?? 0) > 0
                                                ? numberFormat(row.fvolume!, 3)
                                                : "-"}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-center text-xs md:text-sm text-foreground">
                                              {nameProductsType2(row.fproductstype, t)}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.pricecrate ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.ftransportpricechnthb ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.priceother ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-right text-xs md:text-sm text-foreground tabular-nums font-mono">
                                              {Number(row.fstatus) > 4
                                                ? numberFormat(row.ftransportprice ?? 0, 2)
                                                : "-"}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-center text-xs text-foreground">
                                              {fmtDate(row.fdatestatus2)}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-center text-xs text-foreground">
                                              {fmtDate(row.fdatestatus3)}
                                            </td>
                                            <td className="hidden sm:table-cell px-2 py-1.5 text-center text-xs text-foreground">
                                              {fmtDate(row.fdatestatus4)}
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-xs md:text-sm tabular-nums font-mono">
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

      {/* ── Bottom pay-bar — Tailwind rebuild matching forwarder-interactivity.tsx.
            ·  Mobile: bottom-24 to clear FloatingTabs bottom-nav; rounded top
               corners + backdrop-blur for floating-card look.
            ·  Desktop: `md:bottom-0` flush to viewport bottom edge.
            ·  Kept `id="select"` for the legacy pay handler, kept the
               `check-all c6` + `countPay` + `price-all` classes that
               the legacy DataTables JS reads/writes. */}
      {arrStatus[5] > 0 && (
        <div className="fixed left-2 right-20 md:left-0 md:right-0 z-[44] bottom-24 md:bottom-0 bg-white/95 dark:bg-surface/95 backdrop-blur-md border border-border md:border-0 md:border-t rounded-2xl md:rounded-none shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 md:gap-3 px-3 py-2 md:px-6 md:py-3 md:pl-[280px] md:pr-[88px]">
            <label className="flex items-center gap-1.5 shrink-0 cursor-pointer">
              <input
                type="checkbox"
                className="dt-checkboxes check-all c6 w-4 h-4 rounded border-border accent-red-600 cursor-pointer"
                defaultChecked
              />
              <span className="text-[10.5px] md:text-xs text-muted whitespace-nowrap">{t("tabAll")}</span>
            </label>

            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-[10px] md:text-xs text-muted">
                {t("payBarCountPrefix")} <span className="countPay font-bold text-foreground notranslate">-</span> {t("payBarCountSuffix")}
              </div>
              <div className="font-bold text-foreground text-xs md:text-sm">
                {t("summaryTotal")}{" "}
                <span className="notranslate price-all text-red-600 text-base md:text-lg">
                  0.00
                </span>{" "}
                <span className="text-[10px] md:text-xs text-muted font-normal">{t("bahtUnit")}</span>
              </div>
            </div>

            <button
              type="button"
              id="select"
              className="shrink-0 inline-flex items-center justify-center gap-1 rounded-full bg-red-600 text-white px-4 md:px-6 py-2 md:py-2.5 text-sm md:text-base font-bold hover:bg-red-700 active:scale-[0.98] shadow-md shadow-red-600/30 animate__animated animate__infinite animate__headShake transition-all"
            >
              {t("payButton")}
            </button>
          </div>
        </div>
      )}

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
