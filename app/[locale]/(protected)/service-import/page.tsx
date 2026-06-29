import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActivePromoBanners } from "@/lib/promo/banners";
import { resolvePendingSlipForwarderIds } from "@/lib/forwarder/pending-slip";
import { ForwarderInteractivity } from "./forwarder-interactivity";
import { ImportViewTabs } from "./import-view-tabs";
import { type ForwarderRow } from "./forwarder-row-view";
import { AddForwarderModal } from "./add/add-forwarder-modal";
import { Explain } from "@/components/ui/tooltip";

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
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred. Nothing else changed.
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

// The per-row helpers (StatusForwarderAll2 / nameTransportType /
// nameShipBy / TagPro / calPriceForwarderSumCompany / convertIMGCHN /
// numberFormat2 / dmyHms / dmy / hms / modifyDmy / diffDateTimeNow)
// and the `ForwarderRowView` markup transcription, plus the
// `ForwarderRow` shape, live in `./forwarder-row-view` (a "use
// client" module shared by this Server Component AND the
// `<ForwarderInteractivity>` client component below). React-RSC
// rule: any function-typed prop must be a `"use server"` Server
// Action; everything else must be plain-serializable — so the
// helpers + row markup were extracted to a client-safe file so the
// SAME `ForwarderRowView` JSX can render on either side, with no
// function props crossing the boundary.

export default async function ServiceImportPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";

  const t = await getTranslations("serviceImportPage");

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // ── getListPayForwarder.php L23 — userCompany ──
  // The `#list-payment2` payment modal renders the 1% WITHHOLDING TAX
  // line + the KBank account block only for juristic customers
  // (`userCompany==1`). Read the legacy flag so the modal stays on the
  // legacy data path (not the rebuilt-app `profiles.account_type`).
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userCompany")
    .eq("userID", memberCode)
    .maybeSingle<{ userCompany: string | number | null }>();
  if (userRowErr) {
    console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
  }
  const isJuristic = String(userRow?.userCompany ?? "") === "1";

  // ── forwarder.php L450 — corporate check ──
  // SELECT ID FROM tb_corporate WHERE userID=… AND corporateStatus=1
  // (the screen renders fully only if NO row OR the row is approved).
  const { data: corpRows, error: corpRowsErr } = await admin
    .from("tb_corporate")
    .select("id, corporatestatus")
    .eq("userid", memberCode);
  if (corpRowsErr) {
    console.error(`[tb_corporate list] failed`, { code: corpRowsErr.code, message: corpRowsErr.message });
  }
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
  const { data: creditRow, error: creditRowErr } = await admin
    .from("tb_credit")
    .select("creditvalue")
    .eq("userid", memberCode)
    .maybeSingle<{ creditvalue: number }>();
  if (creditRowErr) {
    console.error(`[tb_credit list] failed`, { code: creditRowErr.code, message: creditRowErr.message });
  }
  const creditUser = creditRow ? 1 : 0;

  // ── forwarder.php L491-499 — status counts (GROUP BY fStatus) ──
  // arrStatus[0..7]
  const { data: allForwardersForCount, error: allForwardersForCountErr } = await admin
    .from("tb_forwarder")
    .select("fstatus")
    .eq("userid", memberCode);
  if (allForwardersForCountErr) {
    console.error(`[tb_forwarder list] failed`, { code: allForwardersForCountErr.code, message: allForwardersForCountErr.message });
  }
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
  const { data: fdiRows, error: fdiRowsErr } = await admin
    .from("tb_forwarder_driver_item")
    .select("fid, fdistatus")
    .eq("fdistatus", "");
  if (fdiRowsErr) {
    console.error(`[tb_forwarder_driver_item list] failed`, { code: fdiRowsErr.code, message: fdiRowsErr.message });
  }
  const fdiFidSet = new Set(
    ((fdiRows ?? []) as { fid: number; fdistatus: string | null }[]).map(
      (r) => r.fid,
    ),
  );
  // resolve which of THOSE fids belong to this customer (legacy joins
  // f.userID into the same query)
  const arrFidDriver = new Set<number>();
  if (fdiFidSet.size > 0) {
    const { data: ownDriverFwd, error: ownDriverFwdErr } = await admin
      .from("tb_forwarder")
      .select("id")
      .eq("userid", memberCode)
      .in("id", Array.from(fdiFidSet));
    if (ownDriverFwdErr) {
      console.error(`[tb_forwarder list] failed`, { code: ownDriverFwdErr.code, message: ownDriverFwdErr.message });
    }
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
      "id, fdate, fstatus, ftrackingchn, ftrackingchn2, ftrackingth, ftransporttype, fshipby, fdetail, fcover, famount, fweight, fvolume, ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fusercompany, fcredit, fcreditdate, fdatestatus5, fdatetothai, fcabinetnumber, fdatecontainerclose, fnote, fnoteuser, reforder, adminidcreator, fproductstype",
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
  const { data: listRows, error: listRowsErr } = await listQuery;
  if (listRowsErr) {
    console.error(`[tb_forwarder list] failed`, { code: listRowsErr.code, message: listRowsErr.message });
  }

  // promotion ids for the rows on screen (tb_promotion po.fID=f.ID)
  const rowIds = ((listRows ?? []) as { id: number }[]).map((r) => r.id);
  const promoByFid = new Map<number, string>();
  if (rowIds.length > 0) {
    const { data: promoRows, error: promoRowsErr } = await admin
      .from("tb_promotion")
      .select("fid, promoid")
      .in("fid", rowIds);
    if (promoRowsErr) {
      console.error(`[tb_promotion list] failed`, { code: promoRowsErr.code, message: promoRowsErr.message });
    }
    for (const r of (promoRows ?? []) as {
      fid: number;
      promoid: number | null;
    }[]) {
      if (r.promoid != null) promoByFid.set(r.fid, String(r.promoid));
    }
  }

  // ── Customer-flow clarity (gap-hunt 2026-06-29) — pending-slip set ──
  // Which of the rows on screen already have a PENDING (not-yet-verified)
  // import payment slip in tb_wallet_hs → render the "ส่งสลิปแล้ว · รอตรวจ"
  // badge beside the "รอชำระเงิน" pill so the customer doesn't re-pay. The
  // helper fails-soft (empty set on error) — supplementary signal only.
  const pendingSlipIds = await resolvePendingSlipForwarderIds(
    admin,
    memberCode,
    rowIds,
  );

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
      fproductstype: (r.fproductstype as string) ?? null,
      pendingSlip: pendingSlipIds.has(Number(r.id)),
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

  // ── forwarder.php L979-997 — the modal address <select> ──
  // main address first, then the rest; legacy ⋈ tb_address_main.
  const { data: mainAddrLink, error: mainAddrLinkErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number }>();
  if (mainAddrLinkErr) {
    console.error(`[tb_address_main list] failed`, { code: mainAddrLinkErr.code, message: mainAddrLinkErr.message });
  }
  let mainAddress: { addressid: number; full: string } | null = null;
  const otherAddresses: { addressid: number; full: string }[] = [];
  const fmtAddr = (a: Record<string, unknown>) =>
    t("addressFormat", {
      name: String(a.addressname ?? ""),
      lastname: String(a.addresslastname ?? ""),
      no: String(a.addressno ?? ""),
      subdistrict: String(a.addresssubdistrict ?? ""),
      district: String(a.addressdistrict ?? ""),
      province: String(a.addressprovince ?? ""),
      zipcode: String(a.addresszipcode ?? ""),
    });
  if (mainAddrLink?.addressid != null) {
    const { data: mainAddrRow, error: mainAddrRowErr } = await admin
      .from("tb_address")
      .select(
        "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
      )
      .eq("addressid", mainAddrLink.addressid)
      .maybeSingle<Record<string, unknown>>();
    if (mainAddrRowErr) {
      console.error(`[tb_address list] failed`, { code: mainAddrRowErr.code, message: mainAddrRowErr.message });
    }
    if (mainAddrRow) {
      mainAddress = {
        addressid: Number(mainAddrRow.addressid),
        full: fmtAddr(mainAddrRow),
      };
    }
    const { data: restAddrRows, error: restAddrRowsErr } = await admin
      .from("tb_address")
      .select(
        "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
      )
      .eq("userid", memberCode)
      .eq("addressstatus", "1")
      .neq("addressid", mainAddrLink.addressid);
    if (restAddrRowsErr) {
      console.error(`[tb_address list] failed`, { code: restAddrRowsErr.code, message: restAddrRowsErr.message });
    }
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

  // ── Multi-promo banner (เดฟ 2026-06-01 · multi-promo manager) ──
  // The owner can now manage MULTIPLE promo banners + upload an image at
  // /admin/settings/promos. The list lives as a JSON array in business_config
  // key `promo.banners` (location='import' shows here). getActivePromoBanners
  // returns only enabled + in-date promos, sorted; if the array is empty it
  // FALLS BACK to the legacy single promo (the 6 `import.promo.*` keys ·
  // migration 0135) so the live banner never disappears (backward-compat).
  // Every field is plain-serializable so it crosses the RSC boundary cleanly.
  const importPromos = await getActivePromoBanners("import");
  const maoPromos = importPromos.map((p) => ({
    headline: p.headline,
    text: p.text,
    amount: Number(p.amount_thb) || 0,
    imageUrl: p.image_url,
  }));

  // Tailwind rebuild (เดฟ 2026-05-27 — ปอน: "rebuild css เป็น tailwind ให้
  // หน่อย ห้ามแก้ relation อะไร ต้องให้ฟังก์ชั่นทุกอย่างทำงานเหมือนเดิม").
  // The wrapper + tab strip + status-filter chips + add-button + corporate-
  // pending block are converted from Bootstrap-4 / Modern-Admin theme
  // classes to Tailwind. All hrefs, data-toggle attrs, ids, form names
  // preserved so the legacy jQuery + Server Actions still trigger exactly
  // as before. ForwarderInteractivity (row cards + bottom pay-bar +
  // maomao strip) is unchanged this pass — pending its own rebuild. Modals
  // likewise stay legacy-styled (Bootstrap data-toggle handles open/close).
  //
  // Status-chip badge colors map the legacy `badge-*` palette to Tailwind.
  const statusChips: { href: string; label: string; count: number; chipColor: string }[] = [
    { href: "/service-import",       label: t("statusAll"),         count: arrStatusSum,                    chipColor: "bg-slate-100 text-slate-700"   },
    { href: "/service-import?q=1",   label: t("statusWaitWarehouse"),     count: arrStatus[1],                    chipColor: "bg-amber-100 text-amber-700"   },
    { href: "/service-import?q=2",   label: t("statusArrivedChina"), count: arrStatus[2],                    chipColor: "bg-sky-100 text-sky-700"       },
    { href: "/service-import?q=3",   label: t("statusShippingToThai"),   count: arrStatus[3],                    chipColor: "bg-pink-100 text-pink-700"     },
    { href: "/service-import?q=4",   label: t("statusArrivedThai"),      count: arrStatus[4],                    chipColor: "bg-amber-200 text-amber-900"   },
    { href: "/service-import?q=5",   label: t("statusWaitPayment"),       count: arrStatus[5],                    chipColor: "bg-red-100 text-red-700"       },
    { href: "/service-import?q=6",   label: t("statusPreparing"),        count: arrStatus[6] - statusDriverItem, chipColor: "bg-indigo-100 text-indigo-700" },
    { href: "/service-import?q=6.1", label: t("statusDelivering"),      count: statusDriverItem,                chipColor: "bg-cyan-100 text-cyan-700"     },
    { href: "/service-import?q=7",   label: t("statusDelivered"),          count: arrStatus[7],                    chipColor: "bg-emerald-100 text-emerald-700" },
  ];

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS stylesheet — kept ONLY for the modals + row card
          (forwarder-row-view + forwarder-pay-modal still on legacy CSS).
          Drop once those are rebuilt to Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/service-import.css" />

      {/* forwarder.php <title> L436 (Next.js owns <head> — kept here
          as a comment for the fidelity record):
          รายการฝากนำเข้า | Pacred */}

      {/* Page content — Tailwind rebuild. Wrapped in `.pcs-content-pad` so
          the (protected) layout's desktop padding (sidebar clearance +
          FloatingTabs clearance) kicks in automatically. */}
      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-[200px] md:py-6 md:pb-24">
        {!showFullScreen ? (
          // Corporate-pending banner — forwarder.php L874
          <div className="mx-auto max-w-[670px] mt-16 md:mt-24 text-center">
            <h2 className="rounded-2xl bg-red-600 text-white px-4 py-6 text-base md:text-lg font-bold leading-relaxed shadow-md">
              {t("corporatePendingTitle")}
              <br />
              <span className="text-sm font-normal opacity-90">
                {t("corporatePendingNote")}
              </span>
            </h2>
          </div>
        ) : (
          <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
            {/* ── Tab strip (shared component — identical on both views) ── ·
                with the "+ เพิ่มรายการนำเข้า" CTA on the right of the tab row,
                matching /service-import/table (ปอน 2026-06-09 "ขยับขึ้นไปแถว
                tabs · จัดให้เป็นระเบียบ"). */}
            <ImportViewTabs
              active="full"
              action={<AddForwarderModal mainAddr={mainAddress} others={otherAddresses} />}
            />

            {/* ── Status filter chips + content ── */}
            <div className="px-3 py-3 md:px-4 md:py-4">
              <h4 className="mb-2.5 inline-flex items-center text-sm md:text-base font-bold text-foreground">
                {t("statusListHeading")}
                <Explain
                  className="ml-1.5"
                  def="ลำดับสถานะของสินค้า: รอเข้าโกดังจีน → ถึงโกดังจีน → กำลังส่งมาไทย → ถึงไทย → รอชำระเงิน → เตรียมส่ง → ส่งแล้ว · กดที่แต่ละสถานะเพื่อกรองดูเฉพาะกลุ่มนั้น"
                />
              </h4>
              <div className="flex flex-wrap gap-2">
                {statusChips.map((chip) => {
                  const isActive =
                    chip.href === "/service-import"
                      ? q === ""
                      : chip.href === `/service-import?q=${q}`;
                  return (
                    <Link
                      key={chip.href}
                      href={chip.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                        isActive
                          ? "bg-red-600 text-white border-red-600 shadow-sm"
                          : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                      }`}
                    >
                      <span>{chip.label}</span>
                      {chip.count > 0 && (
                        <span
                          className={`inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[11px] font-bold px-1.5 ${
                            isActive ? "bg-white/25 text-white" : chip.chipColor
                          }`}
                        >
                          {chip.count}
                        </span>
                      )}
                    </Link>
                  );
                })}
                {creditUser === 1 && (
                  <Link
                    href="/service-import?q=c"
                    aria-current={q === "c" ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs md:text-sm font-medium border transition-colors ${
                      q === "c"
                        ? "bg-red-600 text-white border-red-600 shadow-sm"
                        : "bg-surface-alt/60 hover:bg-surface-alt text-foreground border-border"
                    }`}
                  >
                    <span>{t("creditProduct")}</span>
                    {(fCreditCount ?? 0) > 0 && (
                      <span
                        className={`inline-flex items-center justify-center min-w-[22px] h-5 rounded-full text-[11px] font-bold px-1.5 ${
                          q === "c" ? "bg-white/25 text-white" : "bg-red-100 text-red-700"
                        }`}
                      >
                        {fCreditCount}
                      </span>
                    )}
                  </Link>
                )}
              </div>
              <hr className="my-3 border-t border-dashed border-border" />

              {/* forwarder.php L595 `btn-pay-pc` empty positioning anchor —
                  kept (cosmetic only; the bottom pay-bar is positioned via
                  the absolute `.b-pay` rule inside ForwarderInteractivity). */}
              {countStatusF5 > 0 && (
                <div className="pt-1 text-center md:text-left">
                  <div style={{ position: "relative" }} className="btn-pay-pc"></div>
                </div>
              )}

              {/* Row cards + "โปรเหมาๆ" strip + "รวมบิลจ่าย" PCSF strip +
                  bottom .b-pay bar — all render inside this client island
                  (1 client component, no function-prop crossing). Still on
                  legacy CSS — its own Tailwind rebuild is a follow-up. */}
              <ForwarderInteractivity
                rowsData={rows}
                arrFidDriver={Array.from(arrFidDriver)}
                q={q}
                isJuristic={isJuristic}
                showPayBar={showPayBar}
                showMaoStrip={showMaoStrip}
                showPayStrip={
                  countStatusF5 > 0 &&
                  (countPricePCSFDatabase ?? 0) > 1
                }
                columnCount={q === "c" ? 10 : 8}
                maoPromos={maoPromos}
                openFirstOnly
              />
            </div>
          </section>
        )}
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
                {t("maoMaoEligible")}{" "}
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
                  {t("maoMaoGet")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// `ForwarderRowView` + `diffDateTimeNow` extracted to
// ./forwarder-row-view.tsx ("use client" module) so the SAME row
// markup is rendered server- AND client-side without crossing a
// function prop. See the React-RSC note above the helper-removal
// banner near the top of this file.
