import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ForwarderInteractivity } from "./forwarder-interactivity";
import { type ForwarderRow } from "./forwarder-row-view";
import { ServiceImportAddForm } from "./add/service-import-add-form";

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
  const { data: userRow } = await admin
    .from("tb_users")
    .select("usercompany")
    .eq("userid", memberCode)
    .maybeSingle<{ usercompany: string | number | null }>();
  const isJuristic = String(userRow?.usercompany ?? "") === "1";

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
          รายการฝากนำเข้า | Pacred */}

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
                                  {/* Legacy nests <button> inside <a> — invalid
                                      HTML5; browser renders the inner button at
                                      wrong size + can swallow the modal trigger.
                                      Use <span role="presentation"> styled as
                                      the green pill instead. */}
                                  <a
                                    href="#add-forwarder"
                                    data-toggle="modal"
                                    data-target="#add-forwarder"
                                    className="d-inline-flex align-items-center"
                                    style={{ gap: "0.5rem" }}
                                  >
                                    <span
                                      className="btn btn-sm btn-circle btn-success text-white d-inline-flex align-items-center justify-content-center"
                                      role="presentation"
                                    >
                                      <i className="ft-plus"></i>
                                    </span>
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
                                {/* forwarder.php L595 `btn-pay-pc` empty
                                    positioning anchor — kept SSR (cosmetic
                                    only; the bottom pay-bar is positioned
                                    via the absolute `.b-pay` rule). */}
                                {countStatusF5 > 0 && (
                                  <div className="pt-1 text-center text-md-left">
                                    <div style={{ position: "relative" }} className="btn-pay-pc"></div>
                                  </div>
                                )}
                                {/* ── #frm-example2 form + #myTable +
                                    "โปรเหมาๆ" + "รวมบิลจ่าย" + bottom
                                    pay-bar ── forwarder.php L595-862
                                    All five render together inside the
                                    `<ForwarderInteractivity>` client
                                    component (1 client island, no
                                    function-prop crossing). The Server
                                    Action `calculateForwarderTotal` is
                                    the legacy `calPrice.php` recompute. */}
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
              {/* The legacy `save` POST (forwarder.php L9-160) INSERTs
                  tb_forwarder. Wired via the shared <ServiceImportAddForm>
                  Client Component → createLegacyForwarder Server Action.
                  Image upload (`fCover`, legacy L102-144) is NOT yet ported
                  — admin attaches photos in the back-office. */}
              <ServiceImportAddForm>
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
                      <option value="PCS">รับเองหน้าโกดัง Pacred กทม</option>
                    </select>
                    <div className="shipBy-select pt-1 mb-05">
                      <div id="selectShipBy"></div>
                    </div>
                    <div className="text-danger font-0_85rem">
                      หมายเหตุ : หากพื้นที่นอกเขตขนส่งของ Pacred ทางบริษัทจะเก็บเงินปลายทางเท่านั้น ยกเว้น แฟลช เอ็กซ์เพรส และ เจแอนด์ที เอ็กซ์เพรส ที่เก็บต้นทางเท่านั้น{" "}
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
              </ServiceImportAddForm>
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
                คุณได้รับสิทธิ์ร่วมโปรโมชัน Pacred เหมา ๆ{" "}
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

// `ForwarderRowView` + `diffDateTimeNow` extracted to
// ./forwarder-row-view.tsx ("use client" module) so the SAME row
// markup is rendered server- AND client-side without crossing a
// function prop. See the React-RSC note above the helper-removal
// banner near the top of this file.
