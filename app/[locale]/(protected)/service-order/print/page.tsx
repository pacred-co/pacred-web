import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";

/**
 * ฝากสั่งซื้อ (China-shop) order PRINT document — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo `member/printShop.php`
 * (D1 / ADR-0017 · faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `printShop.php` builds into its mPDF string —
 * same elements, same class names, same Thai labels, same column
 * order, same per-page table structure. The visual identity comes
 * from the legacy CSS: printShop.php has an INLINE <style> block
 * (L101-193), brought verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/print-shop.css`, loaded via a plain <link> so
 * it bypasses the app's Tailwind v4 / PostCSS pipeline.
 *
 * ── How the legacy screen is reached ─────────────────────────────
 * The legacy `shops.php` order list exposes TWO print links per row
 * (shops.php L1012 / L1015):
 *   printShop/?print=1&id[]=<hNo>   → "พิมพ์ใบเสร็จ"   (receipt)
 *   printShop/?print=2&id[]=<hNo>   → "พิมพ์ใบแจ้งหนี้" (invoice)
 * `printShop/` is an .htaccess rewrite to `printShop.php`. The id is
 * passed as a PHP array (`id[]`) — printShop.php loops every entry.
 *
 * Pacred route: `/service-order/print` (a sub-route of the ฝากสั่งซื้อ
 * portal screen `/service-order` = legacy shops.php). The legacy
 * `?print=` and `?id[]=` GET params become Next.js `searchParams` —
 * faithful to the legacy URL contract. `?id` accepts a single value
 * or a repeated array, exactly like the PHP `$_GET['id']`.
 *
 * ── Data — every printShop.php mysqli query transcribed 1:1 ───────
 * `tb_*` is RLS-locked to service_role, so reads go through the
 * admin client; the customer filter is `userid = profile.member_code`
 * (the "PR<n>" code === legacy tb_*.userid) — printShop.php pins every
 * query to `u.userID='$userID'` (the cookie owner), reproduced here.
 *
 *   $sql       — printShop.php L42-51: tb_header_order ⋈ tb_users.
 *                print=1 → WHERE hNo & hStatus=5 & userID
 *                print≠1 → WHERE hNo & hStatus>1 & hStatus<>6 & userID
 *   $sql_com   — printShop.php L61-64: tb_corporate (juristic only).
 *   provider   — printShop.php L252: SELECT DISTINCT cProvider
 *                FROM tb_order WHERE hNo GROUP BY cProvider.
 *   shop       — printShop.php L264: SELECT DISTINCT cNameShop,
 *                cShippingNumber, cTrackingNumber … per provider.
 *   items      — printShop.php L297: SELECT * FROM tb_order WHERE
 *                hNo & cProvider & cNameShop & (cReWallet=''|'2').
 *
 * ── FLAGGED — deferred mutations (a render is a PURE READ) ────────
 * printShop.php runs an UPDATE at render time (L87-88 / L92-93):
 *   print=1 → UPDATE tb_header_order SET hPrintBill ='1' WHERE hNo
 *   print≠1 → UPDATE tb_header_order SET hPrintBill2='1' WHERE hNo
 * marking the bill / invoice as printed. A Next.js Server Component
 * render MUST stay a pure read (runbook §9.4), so this write is NOT
 * performed here — it is a DEFERRED Server Action (see the report).
 *
 * ── Notes on faithful reproduction ───────────────────────────────
 *  - The legacy embeds product images. printShop.php L307-316 builds
 *    the `tb_order.cImages` URL: cProvider<4 strips the Alicdn OSS
 *    suffixes + appends `_100x100.jpg`; cProvider==4 (own Shops)
 *    prefixes `images/shops/`. The legacy then `file_exists()`-gates
 *    the <img> — only LOCAL files. The Alicdn URLs are remote, so
 *    `file_exists()` is FALSE for them and the legacy prints NO image
 *    for 1688/Taobao/Tmall rows. The own-Shops images live under the
 *    legacy `member/images/shops/` tree (not yet ported — Phase A
 *    image backfill). Faithful behaviour: render the <img> only for
 *    a ported own-Shops asset, else nothing — see the report's
 *    binary-asset list.
 *  - status<n>.png — printShop.php L237 prints the order-status
 *    banner image `assets/images/theme/status<hStatus>.png`. The PR
 *    asset is not yet swapped; the legacy PCS asset is used as the
 *    1:1 placeholder (`/legacy/pcs/theme/status<n>.png`) and flagged
 *    for ปอน's brand-asset swap (runbook §9.6).
 *  - logo-header-12.png / stamp.png — same: legacy PCS placeholders
 *    under `/legacy/pcs/theme/`, flagged for the brand swap.
 *
 * Rebrand: legacy `PCS<n>` → `PR<n>` (member codes) + branding text
 * only. `PCS Cargo` strings in the document are kept verbatim where
 * the legacy prints them (interim brand split — runbook §3 / the
 * PCS-scrub plan gates the rename).
 */

export const dynamic = "force-dynamic";

// ── Legacy PCS theme assets (placeholders pending ปอน's PR swap) ──
const THEME_BASE = "/legacy/pcs/theme";

/** number_format($n, $d) — the PHP money formatter printShop.php
 *  uses throughout (number_format(...,2)). */
function numberFormat(n: number, decimals = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** nameProvider($cProvider) — member/include/function.php L25-34.
 *  Maps the tb_order.cprovider code → the marketplace name. */
function nameProvider(cProvider: string): string {
  switch (cProvider) {
    case "1": return "1688";
    case "2": return "Taobao";
    case "3": return "Tmall";
    case "4": return "Shops";
    case "5": return "Nice";
    default:  return cProvider;
  }
}

/** replaceSpace($str) — member/include/function.php L376-378. */
function replaceSpace(str: string): string {
  return str.replace(/ /g, "");
}

/* ── Convert($amount) — the Thai baht-text reader.
 *    member/include/function.php L1021-1073 (Convert + ReadNumber).
 *    printShop.php L336 prints Convert($priceShopAll) — the row
 *    "(หนึ่งหมื่น...บาทถ้วน)". Transcribed 1:1 below. ── */
const POSITION_CALL = ["แสน", "หมื่น", "พัน", "ร้อย", "สิบ", ""];
const NUMBER_CALL = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];

function readNumber(numStr: string): string {
  let number = Number(numStr) || 0;
  let ret = "";
  if (number === 0) return ret;
  if (number > 1000000) {
    ret += readNumber(String(Math.trunc(number / 1000000))) + "ล้าน";
    number = Math.trunc(number % 1000000);
  }
  let divider = 100000;
  let pos = 0;
  while (number > 0) {
    const d = Math.trunc(number / divider);
    ret +=
      divider === 10 && d === 2
        ? "ยี่"
        : divider === 10 && d === 1
          ? ""
          : divider === 1 && d === 1 && ret !== ""
            ? "เอ็ด"
            : NUMBER_CALL[d];
    ret += d ? POSITION_CALL[pos] : "";
    number = number % divider;
    divider = divider / 10;
    pos++;
  }
  return ret;
}

function convert(amount: number): string {
  // number_format($amount, 2, ".", "") — no thousands separator.
  const amountNumber = (Number(amount) || 0).toFixed(2);
  const pt = amountNumber.indexOf(".");
  const numberPart = pt === -1 ? amountNumber : amountNumber.slice(0, pt);
  const fractionPart = pt === -1 ? "" : amountNumber.slice(pt + 1);

  let ret = "";
  const baht = readNumber(numberPart);
  if (baht !== "") ret += baht + "บาท";
  const satang = readNumber(fractionPart);
  if (satang !== "") ret += satang + "สตางค์";
  else ret += "ถ้วน";
  return ret;
}

// ── Row types (the columns printShop.php SELECTs + renders) ──────
type HeaderRow = {
  usercompany: string | null;
  userfullname: string | null;
  userid: string;
  userpicture: string | null;
  useremail: string | null;
  hstatus: string;
  hno: string;
  hdate: string | null;
  hdate2: string | null;
  htransporttype: string;
  hrate: number;
  hdatepayment: string | null;
  fulladdress: string | null;
};
type OrderRow = {
  cprovider: string;
  cnameshop: string;
  cshippingnumber: string;
  ctrackingnumber: string;
  ctitle: string;
  ccolor: string;
  csize: string;
  cimages: string;
  cprice: number;
  cshippingchn: number;
  camount: number;
  crewallet: string;
};

/** A single fully-resolved order ready to render as one print
 *  document — printShop.php builds one `$content` page per hNo. */
type PrintDoc = {
  hNo: string;
  dataTitleEntry: string; // the raw $_GET['id'][$count0] value
  nameBill: string;       // ใบเสร็จรับเงิน | ใบแจ้งหนี้
  classText: string;      // h-title | h-title-danger
  isReceipt: boolean;     // print==1
  header: HeaderRow;
  corporateNumber: string;
  fName: string;          // 'คุณ' | '' (juristic)
  dateCreate: string;
  datePay: string;
  datePayExp: string;
  providers: {
    cProvider: string;
    shops: {
      cNameShop: string;
      cShippingNumber: string;
      cTrackingNumber: string;
      items: OrderRow[];
    }[];
  }[];
  priceShopAll: number;
};

type SearchParams = {
  print?: string;
  id?: string | string[];
};

export default async function ServiceOrderPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // printShop.php L6-11 — a logged-out visitor is redirected to /login.
  const { profile } = await requireAuth();
  const sp = await searchParams;

  // printShop.php L12: `if(isset($_GET['id']) && isset($_GET['print']))`
  // — both params are required, else the legacy renders nothing.
  if (sp.id === undefined || sp.print === undefined) notFound();

  // $userID — the customer's member code ("PR<n>" === tb_*.userid).
  const userID = profile?.member_code ?? "";

  // $_GET['id'] is a PHP array; Next gives a single string or string[].
  const ids = Array.isArray(sp.id) ? sp.id : [sp.id];
  // printShop.php L35-39 — $dataTitle = the comma-joined id list. The
  // legacy uses it ONLY in the <title> tag (`<title>… #$dataTitle …`);
  // the document body never prints it. Next.js owns <title> via the
  // metadata API, so the body transcription does not need it.

  // printShop.php L47: `if($_GET['print']==1)` — the receipt branch.
  // PHP `==` is loose; "1"==1 is true, anything else is the invoice.
  const isReceipt = sp.print === "1";

  const admin = createAdminClient();

  // ── Build one PrintDoc per id (printShop.php for-loop L40-367) ──
  const docs: PrintDoc[] = [];

  for (const hNo of ids) {
    // $sql — printShop.php L42-51: tb_header_order ⋈ tb_users.
    // The legacy SELECTs many columns; only those the document body
    // actually renders are kept. The customer filter (userID) +
    // status filter are the load-bearing WHERE clauses.
    let q = admin
      .from("tb_header_order")
      .select(
        "hno, hstatus, hdate, hdate2, hdatepayment, htransporttype, hrate, userid",
      )
      .eq("hno", hNo)
      .eq("userid", userID);
    // printShop.php L47-51 — print=1 needs hStatus=5; else hStatus>1
    // AND hStatus<>6. tb_header_order.hstatus is a 1-char code.
    if (isReceipt) {
      q = q.eq("hstatus", "5");
    } else {
      q = q.gt("hstatus", "1").neq("hstatus", "6");
    }
    const { data: headerRow } = await q.maybeSingle<{
      hno: string;
      hstatus: string;
      hdate: string | null;
      hdate2: string | null;
      hdatepayment: string | null;
      htransporttype: string;
      hrate: number;
      userid: string;
    }>();

    // printShop.php L53: `if ($result->num_rows > 0)` — skip an order
    // that does not match (wrong owner / wrong status). The legacy
    // simply renders nothing for it; faithful = skip the doc.
    if (!headerRow) continue;

    // The legacy joins tb_users for the customer name / email.
    const { data: userRow } = await admin
      .from("tb_users")
      .select("username, userlastname, useremail, userpicture, usercompany")
      .eq("userid", headerRow.userid)
      .maybeSingle<{
        username: string | null;
        userlastname: string | null;
        useremail: string | null;
        userpicture: string | null;
        usercompany: string | null;
      }>();

    // CONCAT('คุณ',hAddressName,...) — printShop.php L44 builds the
    // ship-to address string from the tb_header_order hAddress* cols.
    const { data: addrRow } = await admin
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

    const fullAddress = addrRow
      ? `คุณ${addrRow.haddressname} ${addrRow.haddresslastname} ${addrRow.haddressno}` +
        ` ตำบล/แขวง ${addrRow.haddresssubdistrict} อำเภอ/เขต ${addrRow.haddressdistrict}` +
        ` จังหวัด ${addrRow.haddressprovince} ${addrRow.haddresszipcode}` +
        ` โทร. ${addrRow.haddresstel}, ${addrRow.haddresstel2}`
      : "";

    const header: HeaderRow = {
      usercompany: userRow?.usercompany ?? null,
      userfullname: `${userRow?.username ?? ""} ${userRow?.userlastname ?? ""}`.trim(),
      userid: headerRow.userid,
      userpicture: userRow?.userpicture ?? null,
      useremail: userRow?.useremail ?? null,
      hstatus: headerRow.hstatus,
      hno: headerRow.hno,
      hdate: headerRow.hdate,
      hdate2: headerRow.hdate2,
      htransporttype: headerRow.htransporttype,
      hrate: Number(headerRow.hrate ?? 0),
      hdatepayment: headerRow.hdatepayment,
      fulladdress: fullAddress,
    };

    // printShop.php L59-72 — juristic customer: pull tb_corporate;
    // overwrite the printed name / address with the corporate row;
    // $fName='' for a juristic, 'คุณ' for an individual.
    let corporateNumber = "";
    let fName = "คุณ";
    if (header.usercompany === "1") {
      const { data: corp } = await admin
        .from("tb_corporate")
        .select("corporatename, corporatenumber, corporateaddress")
        .eq("userid", header.userid)
        .maybeSingle<{
          corporatename: string | null;
          corporatenumber: string | null;
          corporateaddress: string | null;
        }>();
      if (corp) {
        header.userfullname = corp.corporatename ?? "";
        corporateNumber = corp.corporatenumber ?? "";
        header.fulladdress = corp.corporateaddress ?? "";
      }
      fName = "";
    }

    // printShop.php L73-83 — two PCS customer-specific overrides for
    // a juristic flag + tax number + address. Faithful: kept verbatim
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

    // printShop.php L84-94 — the document title + heading colour.
    // The legacy ALSO runs the UPDATE hPrintBill/hPrintBill2 here —
    // DEFERRED (a render is a pure read; see the file header FLAG).
    const nameBill = isReceipt ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้";
    const classText = isReceipt ? "h-title" : "h-title-danger";

    // ── tb_order — provider → shop → items (printShop.php L252-348) ──
    // 1. DISTINCT cProvider for this hNo.
    const { data: orderRowsAll } = await admin
      .from("tb_order")
      .select(
        "cprovider, cnameshop, cshippingnumber, ctrackingnumber, ctitle, ccolor, csize, cimages, cprice, cshippingchn, camount, crewallet",
      )
      .eq("hno", hNo);

    const allRows = (orderRowsAll ?? []) as OrderRow[];

    // DISTINCT(cProvider) GROUP BY cProvider — preserve first-seen
    // order, exactly as MySQL returns the grouped set.
    const providerOrder: string[] = [];
    for (const r of allRows) {
      if (!providerOrder.includes(r.cprovider)) providerOrder.push(r.cprovider);
    }

    let priceShopAll = 0;
    const providers: PrintDoc["providers"] = [];

    for (const cProvider of providerOrder) {
      // DISTINCT cNameShop (with cShippingNumber/cTrackingNumber) for
      // this provider — printShop.php L264.
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
        // printShop.php L297 — the rows for this provider+shop, only
        // cReWallet '' or '2' (faithful WHERE clause).
        const items = providerRows.filter(
          (r) =>
            r.cnameshop === cNameShop &&
            (r.crewallet === "" || r.crewallet === "2"),
        );
        for (const it of items) {
          // priceShop — printShop.php L305: (cAmount*(cPrice*hRate))
          //   + (cShippingCHN*hRate)
          priceShopAll +=
            it.camount * (it.cprice * header.hrate) +
            it.cshippingchn * header.hrate;
        }
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
      dateCreate: header.hdate ?? "",
      datePay: header.hdate2 ?? "",
      datePayExp: header.hdatepayment ?? "",
      providers,
      priceShopAll,
    });
  }

  // The legacy renders nothing (empty PDF) when no id resolved.
  // notFound() is the faithful Next equivalent of an empty document.
  if (docs.length === 0) notFound();

  return (
    <div className="pcs-legacy print-shop">
      {/* Legacy PCS print stylesheet (printShop.php inline <style>) —
          static public/ asset, loaded via a plain <link> so it
          bypasses the Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/print-shop.css" />

      {/* On-screen print button — the legacy delivers the PDF straight
          from mPDF; in the browser the customer presses this (or
          Ctrl+P) to save the PDF. Hidden in the printed output. */}
      <div className="no-print" style={{ padding: "8px", textAlign: "right" }}>
        <PrintButton />
      </div>

      {/* printShop.php builds one mPDF page per id — one <body> table
          each. Reproduced as one document block per PrintDoc. */}
      {docs.map((doc) => (
        <article key={doc.hNo} style={{ pageBreakAfter: "always" }}>
          {/* printShop.php L196 — <table style="width: 200mm;"> */}
          <table style={{ width: "200mm" }} className="table">
            {/* ── Header — logo + document title — printShop.php L197-207 ── */}
            <thead>
              <tr className="">
                <th colSpan={4} style={{ float: "left" }} className="text-left">
                  {/* logo-header-12.png — legacy PCS asset placeholder
                      (flagged for ปอน's PR brand swap). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${THEME_BASE}/logo-header-12.png`}
                    style={{ width: "100mm" }}
                    alt=""
                  />
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

            {/* ── Customer block + status banner — printShop.php L208-240 ── */}
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
                    {/* printShop.php L213-215 — tax number, juristic only */}
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
                    {/* printShop.php L226-231 — print=1 shows the
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

            {/* ── Item-table head — printShop.php L241-250 ── */}
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

            {/* ── Item rows — printShop.php L251-348 ── */}
            <tbody>
              <ShopItemRows doc={doc} />
              {/* printShop.php L335-339 — the grand-total row. */}
              <tr style={{ background: "#cbcbcb" }} className="p-1">
                <th colSpan={3} className="text-center p-1">
                  {convert(doc.priceShopAll)}
                </th>
                <th colSpan={3} className="text-right p-1">
                  ราคารวมทั้งหมด
                </th>
                <th colSpan={1} className="p-1">
                  {numberFormat(doc.priceShopAll)}
                </th>
              </tr>
              {/* printShop.php L340-347 — the receipt-only thank-you
                  row + the company stamp. */}
              {doc.isReceipt ? (
                <tr className="p-1">
                  <th colSpan={7} className="text-center p-1">
                    <span>ขอบคุณที่เลือกใช้ PCS Cargo</span>
                    <br />
                    {/* stamp.png — legacy PCS asset placeholder
                        (flagged for ปอน's PR brand swap). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${THEME_BASE}/stamp.png`}
                      style={{ width: "35mm" }}
                      alt=""
                    />
                  </th>
                </tr>
              ) : null}
            </tbody>
            <tfoot></tfoot>
          </table>
        </article>
      ))}
    </div>
  );
}

/**
 * The provider → shop → item rows of one print document
 * (printShop.php L255-334). The legacy uses a running `$noRow`
 * counter across ALL shops of the order, and a 2-colour zebra
 * (`bg` / `bg-g`) on every item row — reproduced here.
 */
function ShopItemRows({ doc }: { doc: PrintDoc }) {
  // printShop.php L300-303 — $noRow increments per item row across
  // the WHOLE order; the zebra uses (($noRow++)%2)!=0 → 'bg-g'.
  let noRow = 0;
  const out: React.ReactElement[] = [];

  for (const provider of doc.providers) {
    // printShop.php L263 — the provider band row.
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
      // printShop.php L278-296 — the shop band row. The legacy prints
      // the shop name + the China-shop order numbers; when
      // cShippingNumber has no comma it prints one line, else it
      // splits the (space-stripped) shipping number on commas and
      // prints one line per entry.
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

      // printShop.php L300-332 — one row per item.
      for (const it of shop.items) {
        noRow += 1;
        const nameBG = noRow % 2 !== 0 ? "bg-g" : "bg";
        // printShop.php L307-316 — the cImages URL build + the
        // file_exists() gate. The legacy only renders an <img> for a
        // LOCAL own-Shops file (cProvider==4); the remote Alicdn URLs
        // fail file_exists() so 1688/Taobao/Tmall rows print nothing.
        // The own-Shops image tree is not yet ported (Phase A image
        // backfill) — faithful: render no <img> until the asset is
        // copied (see the report's binary-asset list).
        const rowTotal =
          it.camount * (it.cprice * doc.header.hrate) +
          it.cshippingchn * doc.header.hrate;
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
            {/* printShop.php L324-326 — the image cell (empty until
                the own-Shops asset tree is ported). */}
            <td style={{ width: "20mm" }}></td>
            <td className="text-right v-a-t">{it.camount}</td>
            <td className="text-right v-a-t">
              {numberFormat(it.cprice * doc.header.hrate)}
            </td>
            <td className="text-right v-a-t">
              {numberFormat(it.cshippingchn * doc.header.hrate)}
            </td>
            <td className="text-right v-a-t">{numberFormat(rowTotal)}</td>
          </tr>,
        );
      }
    }
  }

  return <>{out}</>;
}
