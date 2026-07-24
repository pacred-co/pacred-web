import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { MarkPrintedOnMount } from "./mark-printed-on-mount";
import { ShopFormToggle } from "./shop-form-toggle";
import { ShopDocumentPaper } from "@/components/receipt/shop-document-paper";
import type { HeaderRow, OrderRow, PrintDoc } from "./shop-document-types";
import { computeShopDocument } from "./shop-document-data";
import {
  numberFormat,
  fmtDMYHMS,
  nameProvider,
  replaceSpace,
  convert,
} from "./shop-document-format";

/**
 * ADMIN ฝากสั่งซื้อ (China-shop) order PRINT document — the staff-side
 * counterpart of the legacy PCS Cargo `member/pcs-admin/printShop.php`
 * (~381 LOC), the admin shop-print. (D1 / ADR-0017 · faithful port.)
 *
 * The CUSTOMER print route already exists at `/service-order/print`
 * (a 1:1 transcription of `member/printShop.php`, the customer-facing
 * print). This route is its ADMIN twin and reuses the EXACT same PDF
 * markup / CSS / per-page table structure — the ONLY two differences,
 * faithful to the legacy admin `pcs-admin/printShop.php`, are:
 *
 *   1. AUTH — `requireAdmin()` (the legacy gate is the admin cookie
 *      `pcs_admin_adminID`, printShop.php L6-10), NOT `requireAuth()`.
 *   2. LOOKUP — NO `userID` pin. The customer route pins every header
 *      query to `u.userID = <the caller's own member code>` so a
 *      customer can only print their own orders. The admin
 *      `pcs-admin/printShop.php` (L41-50) selects by `hNo` ALONE with
 *      no owner filter — staff print ANY of the 21,950 `tb_header_order`
 *      orders. Reproduced here: the header query is keyed on `hno` only.
 *
 * Why this route exists (the gap it closes): before it, the only print
 * route was the customer one, so an admin clicking "พิมพ์ใบเสร็จ /
 * ใบแจ้งหนี้" on any OTHER customer's order row hit the customer route's
 * `userid`-pin → `notFound()`. The admin service-orders list now points
 * its row + bulk print links here instead (entry-point wired in the
 * same change — AGENTS.md §0d reachability).
 *
 * ── Legacy admin printShop.php modes (the URL contract) ──────────────
 * The legacy `shops`-admin list (pcs-admin) opens two print links per
 * row, identical contract to the customer one:
 *   printShop/?print=1&id[]=<hNo>  → "พิมพ์ใบเสร็จ"   (ใบเสร็จรับเงิน · receipt)
 *   printShop/?print=2&id[]=<hNo>  → "พิมพ์ใบแจ้งหนี้" (invoice; print≠1)
 * `id[]` is a PHP array — printShop.php loops every entry, one page per
 * hNo. Next.js exposes them as `searchParams.print` + `searchParams.id`
 * (single string or repeated array). Faithful to the legacy URL.
 *
 * ── Data — every pcs-admin/printShop.php mysqli query transcribed ────
 * `tb_*` is RLS-locked to service_role, so reads go through the admin
 * client. The admin print has NO owner filter (the load-bearing
 * difference from the customer route):
 *
 *   $sql       — printShop.php L41-50: tb_header_order ⋈ tb_users by hNo.
 *                print=1 → WHERE hNo & hStatus=5        (NO userID)
 *                print≠1 → WHERE hNo & hStatus>1 & hStatus<>6  (NO userID)
 *   $sql_com   — printShop.php L60-64: tb_corporate (juristic only).
 *   provider   — printShop.php L255: SELECT DISTINCT cProvider
 *                FROM tb_order WHERE hNo GROUP BY cProvider.
 *   shop       — printShop.php L266: SELECT DISTINCT cNameShop,
 *                cShippingNumber, cTrackingNumber … per provider.
 *   items      — printShop.php L299: SELECT * FROM tb_order WHERE
 *                hNo & cProvider & cNameShop & (cReWallet=''|'2').
 *
 * ── FLAGGED — deferred mutations (a render is a PURE READ) ───────────
 * The legacy admin printShop.php runs an UPDATE at render time
 * (L86-87 / L91-92):
 *   print=1 → UPDATE tb_header_order SET hPrintBill ='1' WHERE hNo
 *   print≠1 → UPDATE tb_header_order SET hPrintBill2='1' WHERE hNo
 * marking the bill/invoice as printed (the list badge "พิมพ์ใบเสร็จแล้ว"
 * reads these flags). A Next.js Server Component render MUST stay a pure
 * read, so this write is NOT performed here — it is a DEFERRED Server
 * Action (same as the customer route). See the report.
 *
 * ── Faithful reproduction notes (identical to the customer route) ────
 *  - Product images: printShop.php only `file_exists()`-renders LOCAL
 *    own-Shops files (cProvider==4); the remote Alicdn 1688/Taobao/Tmall
 *    URLs fail file_exists() so the legacy prints no image for them. The
 *    own-Shops image tree is not yet ported (Phase A image backfill) —
 *    faithful: the image cell is empty until the asset is copied.
 *  - status<n>.png / logo-header-12.png / stamp.png — legacy PCS theme
 *    asset placeholders under `/legacy/pcs/theme/`, flagged for ปอน's PR
 *    brand-asset swap.
 *
 * Rebrand DONE: "PCS Cargo" → "Pacred"; legacy `PCS<n>` codes → `PR<n>`.
 */

export const dynamic = "force-dynamic";

// ── Legacy PCS theme assets (placeholders pending ปอน's PR swap) ──
const THEME_BASE = "/legacy/pcs/theme";

// number_format / fmtDMYHMS / nameProvider / replaceSpace / convert are now
// SHARED in `./shop-document-format` so the legacy skin (this file) and the
// PEAK skin (`components/receipt/shop-document-paper.tsx`) format identically.
// The row/document types are SHARED in `./shop-document-types`. Imported above.

type SearchParams = {
  print?: string;
  id?: string | string[];
  /** owner 2026-06-22 — skin selector: legacy/PCS (default) | PEAK. */
  form?: string;
};

// 🔴 title = ชื่อไฟล์ตอน Save PDF + หัวกระดาษ. ต้องอยู่ใน metadata เท่านั้น —
//    layout ออก <title> ให้ทุกหน้าอยู่แล้ว, <title> ที่ใส่ใน body จึงเป็นตัวที่ 2
//    และเบราว์เซอร์ใช้ "ตัวแรก" เสมอ (เจอจริง 2026-07-24). `absolute` = ไม่ต่อท้าย "| Pacred".
export const metadata = { title: { absolute: "ใบรายการฝากสั่งซื้อ" } };

export default async function AdminServiceOrderPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // pcs-admin/printShop.php L6-10 — admin gate (the admin cookie). An
  // unauthenticated / non-admin visitor is bounced by requireAdmin.
  await requireAdmin();
  const sp = await searchParams;

  // printShop.php L11: `if(isset($_GET['id']) && isset($_GET['print']))`
  // — both params are required, else the legacy renders nothing.
  if (sp.id === undefined || sp.print === undefined) notFound();

  // $_GET['id'] is a PHP array; Next gives a single string or string[].
  const ids = Array.isArray(sp.id) ? sp.id : [sp.id];

  // printShop.php L46: `if($_GET['print']==1)` — the receipt branch.
  // PHP `==` is loose; "1"==1 is true, anything else is the invoice.
  const isReceipt = sp.print === "1";

  // owner 2026-06-22 — document skin: legacy/PCS (default) | PEAK. Only
  // "peak" switches; any other value (incl. absent) keeps the legacy form.
  const form: "legacy" | "peak" = sp.form === "peak" ? "peak" : "legacy";

  const admin = createAdminClient();

  // ── Build one PrintDoc per id (printShop.php for-loop L39-377) ──
  const docs: PrintDoc[] = [];

  for (const hNo of ids) {
    // $sql — printShop.php L41-50: tb_header_order ⋈ tb_users.
    // ⚠️ ADMIN difference: NO `userid` filter — staff print ANY order.
    // The status filter is the load-bearing WHERE clause.
    let q = admin
      .from("tb_header_order")
      .select(
        "hno, hstatus, hdate, hdate2, hdatepayment, htransporttype, hrate, userid",
      )
      .eq("hno", hNo);
    // printShop.php L46-49 — print=1 needs hStatus=5; else hStatus>1
    // AND hStatus<>6. tb_header_order.hstatus is a 1-char code.
    if (isReceipt) {
      q = q.eq("hstatus", "5");
    } else {
      q = q.gt("hstatus", "1").neq("hstatus", "6");
    }
    const { data: headerRow, error: headerErr } = await q.maybeSingle<{
      hno: string;
      hstatus: string;
      hdate: string | null;
      hdate2: string | null;
      hdatepayment: string | null;
      htransporttype: string;
      hrate: number;
      userid: string;
    }>();
    // §0c — a transient db error is NOT "row absent". Throw so Next
    // renders a real error boundary instead of a silent empty document.
    if (headerErr) {
      console.error(`[admin printShop tb_header_order] failed for hNo=${hNo}`, {
        code: headerErr.code,
        message: headerErr.message,
      });
      throw new Error(`tb_header_order read failed for hNo=${hNo}`);
    }

    // printShop.php L52: `if ($result->num_rows > 0)` — skip an order
    // that does not match the STATUS filter. The legacy renders nothing
    // for it; faithful = skip the doc.
    if (!headerRow) continue;

    // The legacy joins tb_users for the customer name / email.
    const { data: userRow, error: userRowErr } = await admin
      .from("tb_users")
      .select("userName, userLastName, userEmail, userPicture, userCompany")
      .eq("userID", headerRow.userid)
      .maybeSingle<{
        userName: string | null;
        userLastName: string | null;
        userEmail: string | null;
        userPicture: string | null;
        userCompany: string | null;
      }>();
    if (userRowErr) {
      console.error(`[admin printShop tb_users] failed for userID=${headerRow.userid}`, {
        code: userRowErr.code,
        message: userRowErr.message,
      });
      throw new Error(`tb_users read failed for userID=${headerRow.userid}`);
    }

    // CONCAT('คุณ',hAddressName,...) — printShop.php L43 builds the
    // ship-to address string from the tb_header_order hAddress* cols.
    const { data: addrRow, error: addrRowErr } = await admin
      .from("tb_header_order")
      .select(
        "haddressname, haddresslastname, haddressno, haddresssubdistrict, haddressdistrict, haddressprovince, haddresszipcode, haddresstel, haddresstel2",
      )
      .eq("hno", hNo)
      .maybeSingle<{
        haddressname: string;
        haddresslastname: string;
        haddressno: string;
        haddresssubdistrict: string;
        haddressdistrict: string;
        haddressprovince: string;
        haddresszipcode: string;
        haddresstel: string;
        haddresstel2: string;
      }>();
    if (addrRowErr) {
      console.error(`[admin printShop tb_header_order addr] failed for hNo=${hNo}`, {
        code: addrRowErr.code,
        message: addrRowErr.message,
      });
      throw new Error(`tb_header_order addr read failed for hNo=${hNo}`);
    }

    const fullAddress = addrRow
      ? `คุณ${addrRow.haddressname} ${addrRow.haddresslastname} ${addrRow.haddressno}` +
        ` ตำบล/แขวง ${addrRow.haddresssubdistrict} อำเภอ/เขต ${addrRow.haddressdistrict}` +
        ` จังหวัด ${addrRow.haddressprovince} ${addrRow.haddresszipcode}` +
        ` โทร. ${addrRow.haddresstel}, ${addrRow.haddresstel2}`
      : "";

    const header: HeaderRow = {
      usercompany: userRow?.userCompany ?? null,
      userfullname: `${userRow?.userName ?? ""} ${userRow?.userLastName ?? ""}`.trim(),
      userid: headerRow.userid,
      userpicture: userRow?.userPicture ?? null,
      useremail: userRow?.userEmail ?? null,
      hstatus: headerRow.hstatus,
      hno: headerRow.hno,
      hdate: headerRow.hdate,
      hdate2: headerRow.hdate2,
      htransporttype: headerRow.htransporttype,
      hrate: Number(headerRow.hrate ?? 0),
      hdatepayment: headerRow.hdatepayment,
      fulladdress: fullAddress,
    };

    // printShop.php L58-71 — juristic customer: pull tb_corporate;
    // overwrite the printed name / address with the corporate row;
    // $fName='' for a juristic, 'คุณ' for an individual.
    let corporateNumber = "";
    let fName = "คุณ";
    if (header.usercompany === "1") {
      const { data: corp, error: corpErr } = await admin
        .from("tb_corporate")
        .select("corporatename, corporatenumber, corporateaddress")
        .eq("userid", header.userid)
        .maybeSingle<{
          corporatename: string | null;
          corporatenumber: string | null;
          corporateaddress: string | null;
        }>();
      if (corpErr) {
        console.error(`[admin printShop tb_corporate] failed for userid=${header.userid}`, {
          code: corpErr.code,
          message: corpErr.message,
        });
        throw new Error(`tb_corporate read failed for userid=${header.userid}`);
      }
      if (corp) {
        header.userfullname = corp.corporatename ?? "";
        corporateNumber = corp.corporatenumber ?? "";
        header.fulladdress = corp.corporateaddress ?? "";
      }
      fName = "";
    }

    // printShop.php L72-82 — two PCS customer-specific overrides for a
    // juristic flag + tax number + address. Faithful: kept verbatim
    // (the running PCS<n> numbers are unchanged per the brand-split
    // rule — runbook §3). NB they target legacy PCS member codes.
    if (header.userid === "PR8765") {
      header.usercompany = "1";
      corporateNumber = "1350100500141";
      header.fulladdress =
        "17 ซอยประชาอุทิศ 49 ถนนประชาอุทิศ ตำบล/แขวง บางมด อำเภอ/เขต ทุ่งครุ จังหวัด กรุงเทพมหานคร 10140";
    }
    if (header.userid === "PR8304") {
      header.usercompany = "1";
      header.userfullname = "บริษัท เบรฟ แบรนด์ จำกัด สำนักงานใหญ่";
      corporateNumber = "0105563083534";
      header.fulladdress =
        "55 อาคารไบโอเฮ้าส์ ชั้น 5 ห้องเลขที่ 508 ซอยสุขุมวิท 39 ถนนสุขุมวิท แขวงคลองตันเหนือ เขตวัฒนา กรุงเทพมหานคร 10110";
    }

    // printShop.php L83-93 — the document title + heading colour.
    // The legacy hPrintBill/hPrintBill2 UPDATE now runs via <MarkPrintedOnMount>
    // (a Server Action on print-view mount; the render stays a pure read).
    const nameBill = isReceipt ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้";
    const classText = isReceipt ? "h-title" : "h-title-danger";

    // ── tb_order — provider → shop → items (printShop.php L255-348) ──
    const { data: orderRowsAll, error: orderRowsAllErr } = await admin
      .from("tb_order")
      .select(
        "cprovider, cnameshop, cshippingnumber, ctrackingnumber, ctitle, ccolor, csize, cimages, cprice, cshippingchn, camount, crewallet",
      )
      .eq("hno", hNo);
    if (orderRowsAllErr) {
      console.error(`[admin printShop tb_order] failed for hNo=${hNo}`, {
        code: orderRowsAllErr.code,
        message: orderRowsAllErr.message,
      });
      throw new Error(`tb_order read failed for hNo=${hNo}`);
    }

    const allRows = (orderRowsAll ?? []) as unknown as OrderRow[];

    // DISTINCT(cProvider) GROUP BY cProvider — preserve first-seen
    // order, exactly as MySQL returns the grouped set.
    const providerOrder: string[] = [];
    for (const r of allRows) {
      if (!providerOrder.includes(r.cprovider)) providerOrder.push(r.cprovider);
    }

    const providers: PrintDoc["providers"] = [];

    for (const cProvider of providerOrder) {
      // DISTINCT cNameShop (with cShippingNumber/cTrackingNumber) for
      // this provider — printShop.php L266.
      const providerRows = allRows.filter((r) => r.cprovider === cProvider);
      const shopOrder: string[] = [];
      const shopMeta: Record<string, { ship: string; track: string }> = {};
      for (const r of providerRows) {
        if (!shopOrder.includes(r.cnameshop)) {
          shopOrder.push(r.cnameshop);
          shopMeta[r.cnameshop] = {
            ship: r.cshippingnumber,
            track: r.ctrackingnumber,
          };
        }
      }

      const shops: PrintDoc["providers"][number]["shops"] = [];
      for (const cNameShop of shopOrder) {
        // printShop.php L299 — the rows for this provider+shop, only
        // cReWallet '' or '2' (faithful WHERE clause).
        const items = providerRows.filter(
          (r) =>
            r.cnameshop === cNameShop &&
            (r.crewallet === "" || r.crewallet === "2"),
        );
        shops.push({
          cNameShop,
          cShippingNumber: shopMeta[cNameShop]?.ship ?? "",
          cTrackingNumber: shopMeta[cNameShop]?.track ?? "",
          items,
        });
      }
      providers.push({ cProvider, shops });
    }

    docs.push({
      hNo,
      dataTitleEntry: hNo,
      nameBill,
      classText,
      isReceipt,
      header,
      corporateNumber,
      fName,
      // printShop.php L54-56 — the dates printed via DATE_FORMAT.
      dateCreate: fmtDMYHMS(header.hdate),
      datePay: fmtDMYHMS(header.hdate2),
      datePayExp: fmtDMYHMS(header.hdatepayment),
      providers,
    });
  }

  // The legacy renders nothing (empty PDF) when no id resolved.
  // notFound() is the faithful Next equivalent of an empty document.
  if (docs.length === 0) notFound();

  // ── PEAK skin (owner 2026-06-22) ──────────────────────────────────────
  // Render the SAME docs in the PEAK layout. NOT wrapped in the legacy
  // .print-fullscreen-overlay (the PEAK paper has its own A4 print/screen
  // CSS). The mark-printed Server Action still fires (same doc, just a
  // different skin). The toggle + print button float above, print-hidden.
  if (form === "peak") {
    return (
      // `shop-peak-gutter` = the screen-only gray backdrop (Peak look). The
      // PEAK paper's own <style> resets it to white on print so no gray bleeds
      // onto the printed page.
      <div className="shop-peak-gutter">
        <MarkPrintedOnMount hNos={docs.map((d) => d.hNo)} isReceipt={isReceipt} />
        <div className="no-print print:hidden" style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
          <ShopFormToggle current="peak" />
          <PrintButton />
        </div>
        <ShopDocumentPaper docs={docs} kind={isReceipt ? "receipt" : "invoice"} />
      </div>
    );
  }

  // ── Legacy / PCS skin (default · UNCHANGED) ───────────────────────────
  return (
    <div className="print-fullscreen-overlay">
      {/* Faithful printShop.php L86-92 — mark hPrintBill/hPrintBill2='1' on print
          (Server Action on mount; the render itself stays a pure read). */}
      <MarkPrintedOnMount hNos={docs.map((d) => d.hNo)} isReceipt={isReceipt} />
      {/* Same two stylesheets the customer route loads (load order
          matters — print-overlay.css must win the @page cascade). */}
      <link rel="stylesheet" href="/legacy/pcs/print-shop.css" />
      <link rel="stylesheet" href="/legacy/pcs/print-overlay.css" />

      {/* On-screen toggle + print button — staff press print (or Ctrl+P)
          to save the PDF. The toggle flips legacy↔PEAK. Hidden when printed. */}
      <div className="no-print" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <ShopFormToggle current="legacy" />
        <PrintButton />
      </div>

      <div className="pcs-legacy print-shop">
        {/* printShop.php builds one mPDF page per id — one <body> table
            each. Reproduced as one document block per PrintDoc. */}
        {docs.map((doc, idx) => (
          <article
            key={doc.hNo}
            style={
              idx < docs.length - 1 ? { pageBreakAfter: "always" } : undefined
            }
          >
            {/* printShop.php L195 — <table style="width: 200mm;"> */}
            <table style={{ width: "200mm" }} className="table">
              {/* ── Header — logo + document title — printShop.php L196-206 ── */}
              <thead>
                <tr className="">
                  <th colSpan={4} style={{ float: "left" }} className="text-left">
                    {/* 2026-06-05 (ภูม flag) — Pacred logo (was legacy PCS
                        logo-header-12.png · ภูม "ปรับเป็น pacred"). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/pacred-logo-red.png"
                      style={{ width: "35mm", display: "block" }}
                      alt="Pacred"
                    />
                    <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4, color: "#333" }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>บริษัท แพคเรด (ประเทศไทย) จำกัด</div>
                      <div>28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81 ถนนมาเจริญ</div>
                      <div>แขวงหนองแขม เขตหนองแขม กรุงเทพมหานคร 10160</div>
                      <div>โทร 02-421-3325 · sales@pacred.co</div>
                      <div>เลขประจำตัวผู้เสียภาษี : 0105564077716</div>
                    </div>
                  </th>
                  <th
                    colSpan={3}
                    style={{ background: "#f2f2f2", lineHeight: "1.5em" }}
                  >
                    <h1
                      className={`text-center ${doc.classText}`}
                      style={{ fontFamily: "frutiger" }}
                    >
                      {doc.nameBill}
                    </h1>
                    <div className="h-title2 ">
                      เลขที่ฝากสั่งซื้อ
                      <br /> #{doc.dataTitleEntry}
                    </div>
                  </th>
                </tr>
              </thead>

              {/* ── Customer block + status banner — printShop.php L207-242 ── */}
              <thead>
                <tr className="">
                  <th
                    colSpan={4}
                    style={{ float: "left" }}
                    className="text-left border-2-back p-2"
                  >
                    <div className="">
                      <div className="h-sub">
                        <b>ชื่อลูกค้า : </b>
                        {doc.fName}
                        {doc.header.userfullname}
                      </div>
                      {/* printShop.php L212-214 — tax number, juristic only */}
                      {doc.header.usercompany === "1" ? (
                        <div className="h-sub">
                          <b>เลขประจำตัวผู้เสียภาษี : </b>
                          {doc.corporateNumber}
                        </div>
                      ) : null}
                      <div className="h-sub">
                        <b>รหัสสมาชิก : </b>
                        {doc.header.userid}
                      </div>
                      <div className="h-sub">
                        <b>ที่อยู่ : </b>
                        {doc.header.fulladdress}
                      </div>
                      <div className="h-sub">
                        <b>อีเมล : </b>
                        {doc.header.useremail}
                      </div>
                    </div>
                  </th>
                  <th
                    colSpan={3}
                    className="text-left p-2"
                    style={{ verticalAlign: "text-top" }}
                  >
                    <div className="">
                      <div className="h-sub">
                        <b>เลขที่ : </b>
                        {doc.header.hno}
                      </div>
                      <div className="h-sub">
                        <b>วันที่สั่ง : </b>
                        {doc.dateCreate}
                      </div>
                      {/* printShop.php L225-233 — print=1 shows the
                          payment date + method; print≠1 shows the due
                          date. */}
                      {doc.isReceipt ? (
                        <>
                          <div className="h-sub">
                            <b>วันที่ชำระเงิน : </b>
                            {doc.datePay}
                          </div>
                          <div className="h-sub">
                            <b>ชำระโดย : </b>
                            โอนผ่านธนาคาร
                          </div>
                        </>
                      ) : (
                        <div className="h-sub">
                          <b>วันที่ครบกำหนดชำระ : </b>
                          {doc.datePayExp}
                        </div>
                      )}
                    </div>
                  </th>
                </tr>
                <tr className="">
                  <th colSpan={7} className="text-center">
                    {/* status<n>.png — legacy PCS status banner asset
                        placeholder (flagged for ปอน's PR brand swap). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${THEME_BASE}/status${doc.header.hstatus}.png`}
                      style={{ width: "100mm" }}
                      alt=""
                    />
                  </th>
                </tr>
              </thead>

              {/* ── Item-table head — printShop.php L245-252 ── */}
              <thead>
                <tr>
                  <th
                    className="text-center p-05"
                    style={{
                      width: "13mm",
                      background: "#cbcbcb",
                      borderBottom: "20px solid #000",
                    }}
                  >
                    ลำดับ
                  </th>
                  <th
                    className="text-center p-05"
                    style={{ width: "90mm", background: "#cbcbcb" }}
                    colSpan={2}
                  >
                    ข้อมูลสินค้า{" "}
                  </th>
                  <th
                    className="text-center p-05"
                    style={{ width: "15mm", background: "#cbcbcb" }}
                  >
                    จำนวน
                  </th>
                  <th
                    className="text-center p-05"
                    style={{ width: "25mm", background: "#cbcbcb" }}
                  >
                    ราคาต่อชิ้น
                  </th>
                  <th
                    className="text-center p-05"
                    style={{ width: "20mm", background: "#cbcbcb" }}
                  >
                    ค่าขนส่งจีน
                  </th>
                  <th
                    className="text-center p-05"
                    style={{ width: "20mm", background: "#cbcbcb" }}
                  >
                    ราคารวม
                  </th>
                </tr>
              </thead>

              {/* ── Item rows — printShop.php L253-356 ──
                  The grand-total row + receipt thank-you row are emitted
                  INSIDE the provider loop in the legacy, so they repeat
                  once per provider with the running cumulative
                  $priceShopAll. `ShopItemRows` reproduces that 1:1. */}
              <tbody>
                <ShopItemRows doc={doc} />
              </tbody>
              <tfoot></tfoot>
            </table>
          </article>
        ))}
      </div>
    </div>
  );
}

/**
 * The provider → shop → item rows of one print document
 * (printShop.php L255-356). The legacy uses a running `$noRow` counter
 * across ALL shops of the order, a 2-colour zebra (`bg` / `bg-g`) on
 * every item row, and a running cumulative `$priceShopAll`. The
 * grand-total row + the receipt-only thank-you row are emitted INSIDE
 * the provider `for` loop — so they REPEAT once per provider, each
 * printing the running total at that point. Reproduced 1:1 here.
 */
function ShopItemRows({ doc }: { doc: PrintDoc }) {
  // owner 2026-06-22 — the per-line money + running total are now taken from
  // the SHARED `computeShopDocument` (the same source the PEAK skin uses), so
  // both skins print byte-identical numbers. The shared rows are produced in
  // the SAME nested provider→shop→item order this loop walks, so indexing by
  // the running `noRow` (1-based) aligns exactly. `runningSum[k]` = Σ of the
  // first k row totals = the legacy "$priceShopAll up to here".
  const shared = computeShopDocument(doc);
  const sharedByNo = new Map(shared.rows.map((r) => [r.no, r]));
  const runningSum: number[] = [0];
  for (const r of shared.rows) runningSum[r.no] = runningSum[r.no - 1] + r.rowTotal;

  // printShop.php — $noRow increments per item row across the WHOLE
  // order; the zebra uses (($noRow++)%2)!=0 → 'bg-g'.
  let noRow = 0;
  const out: React.ReactElement[] = [];

  for (const provider of doc.providers) {
    // printShop.php — the provider band row.
    out.push(
      <tr key={`prov-${provider.cProvider}`}>
        <td colSpan={7} className="text-center bg-2e8">
          <div className="text-center box-shadow2">
            <b>{nameProvider(provider.cProvider)}</b>
          </div>
        </td>
      </tr>,
    );

    for (const shop of provider.shops) {
      // printShop.php — the shop band row: shop name, the raw
      // space-stripped shipping number, then the China-shop order
      // numbers (one line, or one-per-comma when cTrackingNumber has
      // commas).
      const cShippingNumberNew = replaceSpace(shop.cShippingNumber);
      const hasComma = (shop.cTrackingNumber.match(/,/g) ?? []).length > 0;
      out.push(
        <tr key={`shop-${provider.cProvider}-${shop.cNameShop}`}>
          <td colSpan={7} className="bg-light text-center ">
            <div className="box-shadow2">
              <div>
                <span style={{ fontSize: "14px" }} lang="zh">
                  ชื่อร้าน : {shop.cNameShop}
                </span>
              </div>
              <div className="row">
                <div className="col-12">
                  {cShippingNumberNew}
                  {!hasComma ? (
                    <span className="text-danger">
                      {" "}
                      เลขออเดอร์ร้านจีน : {shop.cShippingNumber}
                    </span>
                  ) : (
                    cShippingNumberNew.split(",").map((num, i) => (
                      <div key={i} className="text-center text-danger">
                        {" "}
                        เลขออเดอร์ร้านจีน : {num}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>,
      );

      // printShop.php — one row per item.
      for (const it of shop.items) {
        noRow += 1;
        const nameBG = noRow % 2 !== 0 ? "bg-g" : "bg";
        // The money for this row = the SHARED computed values (same formula
        // as before — cAmount×(cPrice×hRate)+cShippingChn×hRate — just sourced
        // from computeShopDocument so the PEAK skin can't drift from it).
        const sharedRow = sharedByNo.get(noRow);
        const unitPriceThb = sharedRow?.unitPriceThb ?? it.cprice * doc.header.hrate;
        const shippingChnThb = sharedRow?.shippingChnThb ?? it.cshippingchn * doc.header.hrate;
        const rowTotal = sharedRow?.rowTotal ?? it.camount * unitPriceThb + shippingChnThb;
        // printShop.php — the cImages cell is empty until the own-Shops
        // asset tree is ported (the remote Alicdn URLs failed
        // file_exists() in the legacy too).
        out.push(
          <tr
            key={`item-${provider.cProvider}-${shop.cNameShop}-${noRow}`}
            className={`${nameBG} v-a-t`}
          >
            <td className="text-center v-a-t">{noRow}</td>
            <td
              className="text-left v-a-t"
              style={{ fontSize: "10px", width: "70mm" }}
              lang="zh"
            >
              {it.ctitle}
              <br />
              {it.ccolor} : {it.csize}
            </td>
            <td style={{ width: "20mm" }}></td>
            <td className="text-right v-a-t">{it.camount}</td>
            <td className="text-right v-a-t">
              {numberFormat(unitPriceThb)}
            </td>
            <td className="text-right v-a-t">
              {numberFormat(shippingChnThb)}
            </td>
            <td className="text-right v-a-t">{numberFormat(rowTotal)}</td>
          </tr>,
        );
      }
    }

    // printShop.php — INSIDE the provider loop: the grand-total row
    // (running $priceShopAll) + the receipt-only thank-you row.
    //
    // 2026-06-05 (ภูม flag — "ลูกค้าจะโอนมาขาด") — `priceShopAll` is
    // the FULL-PRECISION running sum; the legacy showed it rounded
    // 2dp (number_format) and customers under-transferred when they
    // computed half-up locally. Append the raw full-precision value
    // in grey parens next to the rounded total as a reference, so
    // customers transfer the rounded headline + know it's ceil-safe.
    // The RUNNING cumulative total up to the last item rendered (= the legacy
    // $priceShopAll at this point in the loop), sourced from the shared sum.
    const totalRaw = runningSum[noRow] ?? 0;
    const totalRounded = Math.round(totalRaw * 100) / 100;
    const showRaw = Math.abs(totalRaw - totalRounded) > 0.0001;
    out.push(
      <tr
        key={`total-${provider.cProvider}`}
        style={{ background: "#cbcbcb" }}
        className="p-1"
      >
        <th colSpan={3} className="text-center p-1">
          {convert(totalRaw)}
        </th>
        <th colSpan={3} className="text-right p-1">
          ราคารวมทั้งหมด
        </th>
        <th colSpan={1} className="p-1">
          {numberFormat(totalRaw)}
          {showRaw && (
            <div
              style={{
                fontSize: "11px",
                fontWeight: "normal",
                color: "#666",
                marginTop: "2px",
              }}
            >
              ({numberFormat(totalRaw, 4)})
            </div>
          )}
        </th>
      </tr>,
    );
    if (doc.isReceipt) {
      out.push(
        <tr key={`thanks-${provider.cProvider}`} className="p-1">
          <th colSpan={7} className="text-center p-1">
            <span>ขอบคุณที่เลือกใช้ Pacred</span>
            <br />
            {/* 2026-06-05 (ภูม flag) — Pacred stamp (was legacy PCS stamp.png). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/pacred-stamp.png"
              style={{ width: "35mm" }}
              alt="Pacred"
            />
          </th>
        </tr>,
      );
    }
  }

  return <>{out}</>;
}
