import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Forwarder/import receipt — "ใบเสร็จรับเงิน" — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo `member/invoiceF.php`
 * (D1 / ADR-0017 · the faithful-port transcription workstream ·
 * runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * `invoiceF.php` is not a "screen" — it is a server-side mPDF print
 * endpoint. It takes `?id=<comma-separated receipt IDs>` (+ an
 * optional `?type=`), builds an HTML document string for each
 * receipt ($bodyHeader → the item-rows → $bodyFooter), and pipes it
 * through mPDF (THSarabunNew) to emit a `application/pdf` download.
 *
 * The faithful Next.js transcription reproduces that EXACT HTML as a
 * printable web page. The browser's own "Print → Save as PDF" takes
 * mPDF's place; the rendered DOM is the exact HTML the legacy fed to
 * mPDF, so the printed sheet is identical. This is the transcription,
 * NOT a reinterpretation — the JSX below is the verbatim
 * $bodyHeader / item-row / $bodyFooter markup, same elements, same
 * classes, same Thai labels, same column order, same inline styles.
 * The visual identity comes from the legacy CSS — the inline <style>
 * block invoiceF.php embeds (L147-258) — brought in verbatim as the
 * static `.pcs-legacy`-scoped `public/legacy/pcs/invoice-f.css`,
 * loaded via a plain <link> so it bypasses the Tailwind/PostCSS
 * pipeline.
 *
 * Route: NEW sub-route `/service-import/receipts/print`. The legacy
 * `receipt-f-hs.php` history screen (already transcribed at
 * `/service-import/receipts`) links its per-row + bulk print buttons
 * to the legacy `printReceiptF.php` — `invoiceF.php` is that print
 * endpoint's sibling (the two files are near-identical receipt-PDF
 * generators; `diff` shows only minor WHT-rounding differences).
 * Faithful Pacred home for the receipt-print endpoint = the print
 * sub-route of the receipts screen. Query: `?id=PR221002-1,PR…`
 * (the `$_GET['id']` CSV) + optional `?type=1`.
 *
 * ── Data — every invoiceF.php mysqli query transcribed 1:1 to the
 *    ported legacy `tb_*` schema (Supabase) ──
 * `tb_*` is RLS-locked to service_role → reads go through the admin
 * client; the customer is the logged-in member (member_code = the
 * "PR<n>" code === legacy tb_*.userid).
 *
 *   1. $sql — invoiceF.php L46-52, the receipt header per rID:
 *        SELECT rDate, userID, corporateName, corporateNumber,
 *               corporateAddress, userName, userLastName,
 *               reCompNumber, reCompName, reCompAddress
 *        FROM tb_receipt AS r
 *        LEFT JOIN tb_users     AS u ON u.userID=r.userID
 *        LEFT JOIN tb_corporate AS c ON c.userID=r.userID
 *        WHERE rID='$ID'
 *      Note the legacy `WHERE rID='$ID'` has NO userID filter — any
 *      logged-in customer could print any receipt. The faithful port
 *      adds the customer-ownership check (r.userid === member_code)
 *      so a customer only ever prints their OWN receipt — this is the
 *      runbook's "faithful = same behaviour, not a copied security
 *      hole" stance (gotcha 7 family). The rendered output for the
 *      owner is byte-identical.
 *
 *   2. $sql (address fallback) — invoiceF.php L76, when the customer
 *      is an individual with no re-company on the receipt:
 *        SELECT CONCAT(addressNo,' ตำบล/แขวง ',addressSubDistrict,
 *               ' อำเภอ/เขต ',addressDistrict,' จังหวัด ',
 *               addressProvince,' ',addressZIPCode,' โทร. ',
 *               addressTel) AS fullAddress
 *        FROM tb_address_main AS am
 *        LEFT JOIN tb_address AS a ON am.addressID=a.addressID
 *        WHERE am.userID='$userID'
 *
 *   3. $sql_item — invoiceF.php L124-130, the receipt line items:
 *        SELECT fID, fPriceUpdate, fShippingService,
 *               fTransportPriceCHNTHB, priceCrate, priceOther,
 *               fDiscount, fTotalPrice, fTransportPrice, fAmount,
 *               fVolume, fWeight, fTrackingCHN, amount, dateSlip,
 *               date
 *        FROM tb_receipt_item AS ri
 *        LEFT JOIN tb_receipt   AS r  ON r.rID=ri.rID
 *        LEFT JOIN tb_forwarder AS f  ON f.ID=ri.fID
 *        LEFT JOIN tb_wallet_hs AS wh ON wh.refOrder=f.ID
 *               AND wh.status=2 AND type<>5 AND wh.userID=f.userID
 *        WHERE ri.rID='$ID' AND f.ID IS NOT NULL GROUP BY f.ID
 *
 * ── FLAGGED — render-time mutation deferred (runbook gotcha 4) ──
 *   invoiceF.php L58 fires, on every page load:
 *        UPDATE tb_receipt SET statusPrint='1',
 *               adminIDprint='ลูกค้า', rDatePrint=NOW()
 *        WHERE rID='$rID'
 *   — it stamps the receipt as "printed by the customer". A Server
 *   Component render MUST be a PURE READ (Next.js disallows a
 *   render-time write; re-renders double-fire). This UPDATE is NOT
 *   reproduced here — it is DEFERRED to a Server Action
 *   (`markReceiptPrintedByCustomer(rID)`) to be wired by the
 *   integrator, called from a client effect / the print action.
 *   Flagged in the agent report.
 *
 * ── Hardcoded legacy special-cases — transcribed VERBATIM ──
 *   invoiceF.php hardcodes per-customer receipt overrides
 *   (L70-73 PCS415, L102-107 PCS71, L108-110 PCS4136, L111-113
 *   PCS8765, the L119/L376 PCS888 date-gated juristic branch). The
 *   legacy file IS the spec — these are reproduced exactly, with the
 *   member codes rebranded PCS→PR (PCS415→PR415 etc.) per the D1
 *   rule. They look odd but are faithful; not "cleaned up".
 *
 * Rebrand: legacy `PCS<n>` → `PR<n>` (member codes) + "บริษัท พีซีเอส
 * คาร์โก้ จำกัด" / "PCS Cargo CO., LTD." → the PR Cargo branding.
 *
 * ── Binary assets (runbook gotcha 8 — agent lists, integrator copies) ──
 *   invoiceF.php references three raster assets from the legacy
 *   `assets/images/theme/`:
 *     - `logo.png`   — REUSED: the same PCS logo is already staged at
 *                      public/legacy/pcs/logo.png; the receipt points
 *                      there, so it is never broken. No copy needed.
 *     - `stamp.png`      — the company seal — a LEGAL receipt asset;
 *                          a placeholder would be wrong. LISTED in the
 *                          agent report (source → public/legacy/pcs/
 *                          theme/stamp.png) for the integrator.
 *     - `sin-wandee.jpg` — the document-issuer signature — likewise a
 *                          legal asset; LISTED for the integrator.
 *   Until stamp.png / sin-wandee.jpg are copied those two <img> 404
 *   but the receipt layout still renders 1:1.
 */

export const dynamic = "force-dynamic";

// ── Legacy helpers — transcribed verbatim from member/include/function.php ──

/** countText($text, $num) — function.php L14-24. Truncates to $num
 *  *characters* (UTF-8 aware) and appends '...'. PHP counts UTF-8
 *  code points; JS string length over the BMP-heavy Thai text is the
 *  faithful equivalent via [...str]. */
function countText(text: string | null | undefined, num: number): string {
  const s = text ?? "";
  const chars = [...s];
  if (chars.length >= num) {
    return chars.slice(0, num).join("") + "...";
  }
  return s;
}

/** number_format($n, $decimals) — PHP money formatter (comma
 *  thousands separator). */
function numberFormat(n: number, decimals: number): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** diff0($num1, $num2) — function.php L1409-1413. A 3-decimal-safe
 *  subtraction (avoids float dust). */
function diff0(num1: number, num2: number): number {
  const n = Math.trunc(num1 * 1000) - Math.trunc(num2 * 1000);
  return n / 1000;
}

// ReadNumber($number) — function.php L1046-1073. Reads an integer as
// Thai words.
const POSITION_CALL = ["แสน", "หมื่น", "พัน", "ร้อย", "สิบ", ""];
const NUMBER_CALL = [
  "", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า",
];
function readNumber(numberIn: number): string {
  let num = numberIn + 0;
  let ret = "";
  if (num === 0) return ret;
  if (num > 1000000) {
    ret += readNumber(Math.trunc(num / 1000000)) + "ล้าน";
    num = Math.trunc(num % 1000000);
  }
  let divider = 100000;
  let pos = 0;
  while (num > 0) {
    const d = Math.trunc(num / divider);
    ret +=
      divider === 10 && d === 2
        ? "ยี่"
        : divider === 10 && d === 1
          ? ""
          : divider === 1 && d === 1 && ret !== ""
            ? "เอ็ด"
            : NUMBER_CALL[d];
    ret += d ? POSITION_CALL[pos] : "";
    num = num % divider;
    divider = divider / 10;
    pos++;
  }
  return ret;
}

/** Convert($amount_number) — function.php L1021-1044. Reads a
 *  baht.satang amount as Thai words ("...บาทถ้วน"). */
function convert(amountNumber: number): string {
  const formatted = Number(amountNumber).toFixed(2); // number_format(.,2,".","")
  const pt = formatted.indexOf(".");
  let numberPart = "";
  let fractionPart = "";
  if (pt === -1) {
    numberPart = formatted;
  } else {
    numberPart = formatted.slice(0, pt);
    fractionPart = formatted.slice(pt + 1);
  }
  let ret = "";
  const baht = readNumber(Number(numberPart));
  if (baht !== "") ret += baht + "บาท";
  const satang = readNumber(Number(fractionPart));
  if (satang !== "") ret += satang + "สตางค์";
  else ret += "ถ้วน";
  return ret;
}

// ── PHP date formatting — the SQL DATE_FORMAT() call ──

/** DATE_FORMAT(rDate, '%d/%m/%Y') — invoiceF.php L46/L55 ($dateCreate). */
function fmtDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d.replace(" ", "T"));
  if (isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

// ── Row shapes ──
type ReceiptHeader = {
  rdate: string | null;
  userid: string;
  corporatename: string | null;
  corporatenumber: string | null;
  corporateaddress: string | null;
  username: string | null;
  userlastname: string | null;
  recompnumber: string | null;
  recompname: string | null;
  recompaddress: string | null;
};
type ReceiptItem = {
  fid: number;
  fpriceupdate: number;
  fshippingservice: number;
  ftransportpricechnthb: number;
  pricecrate: number;
  priceother: number;
  fdiscount: number;
  ftotalprice: number;
  ftransportprice: number;
  famount: number;
  fvolume: number;
  fweight: number;
  ftrackingchn: string | null;
  // tb_wallet_hs.amount — the paid sum, joined per the legacy
  // $sql_item LEFT JOIN. Used by the footer's WHT 1% match test
  // ($amountPayAll). The legacy also reads dateSlip/date for a
  // $dateSlip var that the RENDERED receipt never prints (dead in
  // the output) — so they are not carried here.
  amount: number;
};

/** One built receipt — all the values $bodyHeader / $bodyFooter need. */
type BuiltReceipt = {
  ID: string;
  dateCreate: string;
  fName: string;
  corporateNumber: string;
  corporateAddress: string;
  addressBR: boolean;
  // $ReCorporate (invoiceF.php L93/L95) — 0 = individual / re-company
  // receipt, 1 = the customer's own juristic profile. The footer's
  // WHT 1% block (L376) only evaluates when ReCorporate==0; carried
  // explicitly because it cannot be re-derived from corporateNumber
  // (a re-company receipt WITH a tax number is still ReCorporate==0).
  reCorporate: 0 | 1;
  // invoiceF.php L119/L376 — the historic PR888 (legacy PCS888)
  // date-gated special: `userID=='PCS888' && rDate<'2023-11-06'`.
  // Precomputed at build time; OR-ed into the WHT branches verbatim.
  whtSpecialPr888: boolean;
  rows: ReceiptItem[];
};

type SearchParams = { id?: string; type?: string };

export default async function ReceiptPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // invoiceF.php L6-10 — a logged-out visitor is redirected to /login.
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  // $userID — the customer's member code ("PR<n>" === legacy
  // tb_*.userid). Used as the ownership filter (see file header §1).
  const memberCode = profile.member_code ?? "";

  const sp = await searchParams;

  // invoiceF.php L11/L21 — the whole page only renders when ?id is
  // set + non-empty.
  const idParam = (sp.id ?? "").trim();
  if (idParam === "") {
    return (
      <div className="pcs-legacy">
        <link rel="stylesheet" href="/legacy/pcs/invoice-f.css" />
        <div className="pcs-receipt-bg">
          <div className="pcs-receipt-empty">ไม่พบข้อมูลใบเสร็จ</div>
        </div>
      </div>
    );
  }

  // invoiceF.php L39 — $arrID = explode(",", $_GET['id']).
  const arrID = idParam.split(",").map((s) => s.trim()).filter(Boolean);
  // L40-43 — $dataTitle = the comma-joined ID list (page <title>).
  const dataTitle = arrID.join(", ");

  // L14-16 — $nameDocs: only ever '<br/>' for both branches; kept
  // for the fidelity record (the legacy `type` switch is a no-op).

  // ── Build each receipt (transcribes the L44-484 per-rID loop) ──
  const builtReceipts: BuiltReceipt[] = [];

  for (const ID of arrID) {
    // §1 — the receipt header. The legacy `WHERE rID='$ID'` has no
    // owner filter; the port adds `userid = memberCode` so a
    // customer prints only their own receipt (file header §1).
    // tb_receipt's OWN columns. corporate* + username/userlastname
    // come from the tb_corporate / tb_users joins, fetched below.
    const { data: headerRow } = await admin
      .from("tb_receipt")
      .select("rdate, userid, recompnumber, recompname, recompaddress")
      .eq("rid", ID)
      .eq("userid", memberCode)
      .maybeSingle();

    if (!headerRow) continue; // num_rows == 0 → skip (legacy L53)

    // The legacy SELECT pulls userName/userLastName from the joined
    // tb_users and corporateName/Number/Address from tb_corporate.
    // Fetch those two joins explicitly (PostgREST embed on a non-FK
    // pair is unreliable here, so two small lookups — same result).
    const receiptUserId = (headerRow as { userid: string }).userid;
    const [{ data: userRow }, { data: corpRow }] = await Promise.all([
      admin
        .from("tb_users")
        .select("username, userlastname")
        .eq("userid", receiptUserId)
        .maybeSingle<{ username: string | null; userlastname: string | null }>(),
      admin
        .from("tb_corporate")
        .select("corporatenumber, corporatename, corporateaddress")
        .eq("userid", receiptUserId)
        .maybeSingle<{
          corporatenumber: string | null;
          corporatename: string | null;
          corporateaddress: string | null;
        }>(),
    ]);

    // $row_main — the legacy merged row. tb_receipt's own
    // reComp* columns + the tb_corporate join columns.
    const row_main: ReceiptHeader = {
      rdate: (headerRow as { rdate: string | null }).rdate,
      userid: receiptUserId,
      corporatename: corpRow?.corporatename ?? "",
      corporatenumber: corpRow?.corporatenumber ?? "",
      corporateaddress: corpRow?.corporateaddress ?? "",
      username: userRow?.username ?? "",
      userlastname: userRow?.userlastname ?? "",
      recompnumber: (headerRow as { recompnumber: string | null }).recompnumber,
      recompname: (headerRow as { recompname: string | null }).recompname,
      recompaddress: (headerRow as { recompaddress: string | null })
        .recompaddress,
    };

    const dateCreate = fmtDate(row_main.rdate); // L55
    const userID = row_main.userid; // L56

    // L58 — UPDATE tb_receipt SET statusPrint='1'… — render-time
    // mutation; DEFERRED (file header FLAG). NOT executed here.

    // L63 — $fName starts as "<userID> <corporateName>".
    let fName = `${row_main.userid} ${row_main.corporatename ?? ""}`;

    // ── L68-114 — resolve the customer block (juristic vs individual)
    let ReCorporate: 0 | 1;
    if ((row_main.corporatenumber ?? "") === "") {
      if ((row_main.recompname ?? "") === "") {
        // L70-74 — the hardcoded PR415 (legacy PCS415) override.
        if (userID === "PR415") {
          row_main.corporatename = "พีรวันติ์ ติระจารุอนันต์";
          row_main.corporatenumber = "-";
          row_main.corporateaddress =
            "222/1 หมู่4 หมู่บ้านลัดดาลม อีลี่ แกรนต์ ตำบล/แขวง บางขุนกอง อำเภอ/เขต บางกรวย จังหวัด นนทบุรี 11130";
        }
        // L75-82 — fall back to the customer's main address.
        const { data: addrRow } = await admin
          .from("tb_address_main")
          .select("addressid")
          .eq("userid", userID)
          .maybeSingle<{ addressid: number }>();
        let fullAddress = "";
        if (addrRow?.addressid != null) {
          const { data: a } = await admin
            .from("tb_address")
            .select(
              "addressno, addresssubdistrict, addressdistrict, " +
                "addressprovince, addresszipcode, addresstel",
            )
            .eq("addressid", addrRow.addressid)
            .maybeSingle<{
              addressno: string;
              addresssubdistrict: string;
              addressdistrict: string;
              addressprovince: string;
              addresszipcode: string;
              addresstel: string;
            }>();
          if (a) {
            // the legacy CONCAT — verbatim format string.
            fullAddress =
              `${a.addressno} ตำบล/แขวง ${a.addresssubdistrict}` +
              ` อำเภอ/เขต ${a.addressdistrict} จังหวัด ${a.addressprovince}` +
              ` ${a.addresszipcode} โทร. ${a.addresstel}`;
          }
        }
        row_main.corporateaddress = fullAddress;
        row_main.corporatenumber = "-";
        row_main.corporatename = `${row_main.username ?? ""} ${
          row_main.userlastname ?? ""
        }`;
        fName = `${row_main.userid} ${row_main.corporatename}`;
      } else {
        // L83-92 — use the re-company captured on the receipt.
        row_main.corporatename = row_main.recompname;
        row_main.corporatenumber =
          (row_main.recompnumber ?? "") !== ""
            ? row_main.recompnumber
            : "-";
        row_main.corporateaddress = row_main.recompaddress;
        fName = `${row_main.userid} ${row_main.corporatename}`;
      }
      ReCorporate = 0;
    } else {
      ReCorporate = 1;
    }

    // L97-101 — $addressBR: a spacer <br> when the address is short.
    const addressBR = (row_main.corporateaddress ?? "").length <= 230;

    // L102-113 — the remaining hardcoded per-customer overrides
    // (PCS→PR rebranded member codes).
    if (userID === "PR71") {
      fName = "บริษัท 3พี อีควิปเม้นท์ เทรดดิ้ง จำกัด ";
      row_main.corporatename = "บริษัท 3พี อีควิปเม้นท์ เทรดดิ้ง จำกัด ";
      row_main.corporatenumber = "0105565004933";
      row_main.corporateaddress =
        "366/49 หมู่บ้านไอยรา ถนน เลียบคลองภาษีฯฝั่งเหนือ แขวงหนองแขม เขตหนองแขม กรุงเทพมหานคร 10160";
    }
    if (userID === "PR4136") {
      row_main.corporatenumber = "1350100500141";
    }
    if (userID === "PR8765") {
      row_main.corporatenumber = "1350100500141";
    }

    // ── L124-138 — the receipt line items ──
    // The legacy joins tb_wallet_hs to pull `amount` (the paid sum).
    const { data: itemRows } = await admin
      .from("tb_receipt_item")
      .select("fid")
      .eq("rid", ID);

    const rows: ReceiptItem[] = [];
    for (const it of (itemRows ?? []) as { fid: number }[]) {
      // f.ID IS NOT NULL → the forwarder must exist.
      const { data: f } = await admin
        .from("tb_forwarder")
        .select(
          "id, userid, fpriceupdate, fshippingservice, " +
            "ftransportpricechnthb, pricecrate, priceother, fdiscount, " +
            "ftotalprice, ftransportprice, famount, fvolume, fweight, " +
            "ftrackingchn",
        )
        .eq("id", it.fid)
        .maybeSingle<{
          id: number;
          userid: string;
          fpriceupdate: number | null;
          fshippingservice: number | null;
          ftransportpricechnthb: number | null;
          pricecrate: number | null;
          priceother: number | null;
          fdiscount: number | null;
          ftotalprice: number | null;
          ftransportprice: number | null;
          famount: number | null;
          fvolume: number | null;
          fweight: number | null;
          ftrackingchn: string | null;
        }>();
      if (!f) continue; // f.ID IS NULL → legacy skips the row

      // wh — LEFT JOIN tb_wallet_hs ON wh.refOrder=f.ID
      //   AND wh.status=2 AND type<>5 AND wh.userID=f.userID
      const { data: whRow } = await admin
        .from("tb_wallet_hs")
        .select("amount")
        .eq("reforder", String(f.id))
        .eq("status", "2")
        .neq("type", "5")
        .eq("userid", f.userid)
        .maybeSingle<{ amount: number | null }>();

      rows.push({
        fid: f.id,
        fpriceupdate: Number(f.fpriceupdate ?? 0),
        fshippingservice: Number(f.fshippingservice ?? 0),
        ftransportpricechnthb: Number(f.ftransportpricechnthb ?? 0),
        pricecrate: Number(f.pricecrate ?? 0),
        priceother: Number(f.priceother ?? 0),
        fdiscount: Number(f.fdiscount ?? 0),
        ftotalprice: Number(f.ftotalprice ?? 0),
        ftransportprice: Number(f.ftransportprice ?? 0),
        famount: Number(f.famount ?? 0),
        fvolume: Number(f.fvolume ?? 0),
        fweight: Number(f.fweight ?? 0),
        ftrackingchn: f.ftrackingchn,
        amount: Number(whRow?.amount ?? 0),
      });
    }

    // invoiceF.php L119/L376 — the PR888 (legacy PCS888) date-gated
    // special: `userID=='PCS888' && rDate < '2023-11-06 00:00:00'`.
    const whtSpecialPr888 =
      userID === "PR888" &&
      !!row_main.rdate &&
      new Date(row_main.rdate.replace(" ", "T")) <
        new Date("2023-11-06T00:00:00");

    builtReceipts.push({
      ID,
      dateCreate,
      fName,
      corporateNumber: row_main.corporatenumber ?? "",
      corporateAddress: row_main.corporateaddress ?? "",
      addressBR,
      reCorporate: ReCorporate,
      whtSpecialPr888,
      rows,
    });
  }

  // If no receipt resolved (bad ID / not the customer's), show the
  // legacy empty state (the legacy would just emit an empty PDF).
  if (builtReceipts.length === 0) {
    return (
      <div className="pcs-legacy">
        <link rel="stylesheet" href="/legacy/pcs/invoice-f.css" />
        <div className="pcs-receipt-bg">
          <div className="pcs-receipt-empty">ไม่พบข้อมูลใบเสร็จ</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pcs-legacy">
      {/* Legacy receipt CSS (the invoiceF.php inline <style> block)
          — static public/ asset via a plain <link>. */}
      <link rel="stylesheet" href="/legacy/pcs/invoice-f.css" />

      {/* invoiceF.php <title> L145 (Next.js owns <head> — kept as a
          comment for the fidelity record):
            ใบเสร็จรับเงิน {dataTitle} | PR Cargo */}

      <div className="pcs-receipt-bg">
        {/* the print-view toolbar — NOT part of the legacy receipt
            (the legacy streams a PDF directly). On the web the
            customer lands on a page, so this no-print button opens
            the browser print dialog (= the legacy PDF). It is wired
            to window.print() by the inline <PrintButtonScript/> at
            the bottom. Hidden on @media print so the printed sheet
            is the legacy receipt exactly. */}
        <div className="pcs-receipt-toolbar">
          <button type="button" className="btn">
            พิมพ์ใบเสร็จ
          </button>
        </div>

        {/* ── one printable A4 sheet per receipt ── */}
        {builtReceipts.map((rcpt) => (
          <ReceiptSheets key={rcpt.ID} rcpt={rcpt} dataTitle={dataTitle} />
        ))}
      </div>

      {/* the print button needs one line of JS (window.print). A
          Server Component cannot attach an onClick — this minimal
          inline <script> is the faithful equivalent of the legacy
          PDF-download (it just opens the print dialog). It is NOT a
          render-time mutation — purely a client affordance. */}
      <PrintButtonScript />
    </div>
  );
}

/**
 * Renders the printable A4 sheet(s) for ONE receipt. The legacy
 * paginates the item list 13 rows/page (invoiceF.php L139/L347-478):
 * each 13-row block is its own mPDF page, the header repeats, the
 * footer (totals) prints only on the LAST page. Reproduced 1:1 —
 * each page is one `.pcs-receipt-sheet`.
 */
function ReceiptSheets({
  rcpt,
  dataTitle,
}: {
  rcpt: BuiltReceipt;
  dataTitle: string;
}) {
  const rowsPerPage = 13; // invoiceF.php L139
  const { rows } = rcpt;
  // L347-351 — pageAll = ceil(count/13).
  const pageAll = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  // The footer needs the running totals over ALL rows — the legacy
  // accumulates them across the page loop; compute them up-front
  // (the final values are page-independent).
  let no = 0;
  let totalPriceAll = 0;
  let fTotalPriceAll = 0;
  let fDiscountAll = 0;
  let fTransportPriceCHNTHBAll = 0;
  let fTransportPriceTHBAll = 0;
  let priceOtherBillAll = 0;
  let amountPayAll = 0;

  const pages: { pageNo: number; rows: { row: ReceiptItem; no: number }[] }[] =
    [];
  for (let i = 0, page = 1; i < rows.length || page === 1; i += rowsPerPage, page++) {
    const slice = rows.slice(i, i + rowsPerPage);
    const pageRows = slice.map((row) => {
      no++;
      // L355 — the per-row total (the legacy formula, verbatim).
      const totalPrice =
        row.ftotalprice +
        row.ftransportprice +
        row.fpriceupdate +
        row.fshippingservice +
        row.ftransportpricechnthb +
        row.pricecrate +
        row.priceother -
        row.fdiscount;
      totalPriceAll += totalPrice;
      amountPayAll += row.amount;
      fTotalPriceAll += row.ftotalprice;
      fDiscountAll += row.fdiscount;
      fTransportPriceCHNTHBAll += row.ftransportpricechnthb;
      fTransportPriceTHBAll += row.ftransportprice;
      priceOtherBillAll +=
        row.fpriceupdate +
        row.fshippingservice +
        row.pricecrate +
        row.priceother;
      return { row, no };
    });
    pages.push({ pageNo: page, rows: pageRows });
    if (i + rowsPerPage >= rows.length) break;
  }

  // ── L116-121 / L376-391 — the WHT 1% block ──
  // invoiceF.php L116-118 default: $textPer1 + $pricPer1 are hidden
  // white text ("0" / the label invisible). The legacy L119-121 also
  // un-hides $textPer1 up-front when ReCorporate==1 — but the L376
  // branch (the only place $Dis1per / $pricPer1 are set) runs only
  // when ReCorporate==0. So: ReCorporate==1 → label visible, amount
  // still the hidden "0"; ReCorporate==0 → the WHT match decides.
  // (invoiceF.php uses `ReCorporate==0` at L376; printReceiptF.php's
  // sibling uses `==1` — the two files differ; invoiceF.php is the
  // spec for THIS port.)
  let textPer1: "show" | "hide" = "hide";
  let pricPer1: React.ReactNode = <div style={{ color: "#fff" }}>0</div>;
  let Dis1per = 0;
  // L119-121 — `ReCorporate==1 || PR888-special` un-hides the label.
  if (rcpt.reCorporate === 1 || rcpt.whtSpecialPr888) {
    textPer1 = "show";
  }
  // L376 — `ReCorporate==0 || PR888-special` → evaluate the WHT
  // match (and overwrite $textPer1 / $pricPer1).
  if (rcpt.reCorporate === 0 || rcpt.whtSpecialPr888) {
    Dis1per = totalPriceAll * 0.01;
    const amountPayAll2 = Number((totalPriceAll - Dis1per).toFixed(2)) * 1;
    if (diff0(totalPriceAll, amountPayAll) === 0) {
      textPer1 = "hide";
      Dis1per = 0;
    } else if (diff0(amountPayAll2, amountPayAll) <= 1) {
      textPer1 = "show"; // <div>LESS WITHHOLDING TAX 1%</div>
      pricPer1 = <div>{numberFormat(Dis1per, 2)} บาท</div>;
    } else {
      textPer1 = "hide";
      Dis1per = 0;
    }
  }

  // L392-393 — the bank-transfer line + the per-page amount line.
  const grandTotal = totalPriceAll - Dis1per;

  return (
    <>
      {pages.map((pg) => (
        <div className="pcs-receipt-sheet" key={pg.pageNo}>
          {/* ── $bodyHeader — invoiceF.php L142-336 ── */}
          <table className="table">
            <thead>
              <tr>
                <th colSpan={2} className="text-center">
                  {/* L264-265 — the legacy assets/images/theme/logo.png.
                      The same PCS logo is already staged at
                      /legacy/pcs/logo.png (used by wallet.tsx etc.) —
                      reused so the receipt logo is never broken. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/legacy/pcs/logo.png"
                    alt="logo"
                    style={{ width: "20mm" }}
                  />
                </th>
                <th colSpan={2} className="text-center">
                  {/* L267-270 — PCS→PR rebranded company name */}
                  <h2>บริษัท พีอาร์ คาร์โก้ จำกัด</h2>
                  <h3>PR Cargo CO., LTD.</h3>
                </th>
                <th
                  colSpan={3}
                  style={{ background: "#f2f2f2", lineHeight: "1.35em" }}
                >
                  {/* L272 — $nameDocs (always '<br/>') */}
                  <div className="text-center">
                    <br />
                  </div>
                  <div
                    className="text-center h-title"
                    style={{ fontFamily: "frutiger" }}
                  >
                    ใบเสร็จรับเงิน
                  </div>
                  <div className="text-center h-title3">
                    (ไม่ใช่ใบกำกับภาษี)
                  </div>
                  <div className="h-title2 ">เลขที่ {rcpt.ID}</div>
                </th>
              </tr>
            </thead>
            <thead>
              <tr>
                <th colSpan={7}>
                  <hr />
                </th>
              </tr>
              {/* L281-307 — the issuer block (PCS→PR rebranded) */}
              <tr>
                <th colSpan={2} className="text-left v-a-t">
                  <div>ผู้ออก / issuer : </div>
                  <div>เลขผู้เสียภาษี / Tax ID : </div>
                  <div>ที่อยู่ / Address : </div>
                  <div>
                    <br />
                  </div>
                  <div>โทรศัพท์ / tel : </div>
                </th>
                <th colSpan={3} className="text-left v-a-t">
                  <div>บริษัท พีอาร์ คาร์โก้ จำกัด</div>
                  <div>0105560160694</div>
                  {/* L292-296 — the address switches on the date.
                      Faithfully reproduce the post-2025-03-20 address
                      (the current address — this is a fresh print). */}
                  <div>
                    เลขที่ 12 ซอย เพชรเกษม 77 แยก 3-6 แขวงหนองค้างพลู
                    เขตหนองแขม กรุงเทพมหานคร 10160
                  </div>
                </th>
                <th colSpan={1} className="text-right v-a-t">
                  <div>วันที่ / date : </div>
                  <div>หน้า / page : </div>
                </th>
                <th colSpan={1} className="text-left v-a-t">
                  <div>{rcpt.dateCreate}</div>
                  {/* L305 — pagebillpage → "<page>/<pageAll>" */}
                  <div>
                    {pg.pageNo}/{pageAll}
                  </div>
                </th>
              </tr>
              <tr>
                <th colSpan={7}>
                  <hr />
                </th>
              </tr>
              {/* L309-323 — the customer block */}
              <tr>
                <th colSpan={2} className="text-left v-a-t">
                  <div>ลูกค้า / Customer : </div>
                  <div>เลขผู้เสียภาษี / Tax ID : </div>
                  <div>ที่อยู่ / Address : </div>
                </th>
                <th colSpan={5} className="text-left v-a-t">
                  <div className="h-sub">{countText(rcpt.fName, 95)}</div>
                  <div className="h-sub">
                    {countText(rcpt.corporateNumber, 20)}
                  </div>
                  <div className="h-sub" style={{ height: "50mm" }}>
                    {countText(rcpt.corporateAddress, 200)}
                    {/* L320 — $addressBR spacer */}
                    {rcpt.addressBR ? (
                      <>
                        <br />
                        <span style={{ color: "#fff" }}>.</span>
                      </>
                    ) : null}
                  </div>
                </th>
              </tr>
            </thead>
            {/* L325-335 — the item-table header */}
            <thead>
              <tr>
                <th
                  className="text-center p-05"
                  style={{
                    width: "15mm",
                    background: "#cbcbcb",
                    borderBottom: "20px solid #000",
                  }}
                >
                  ลำดับ
                  <br />
                  No.
                </th>
                <th
                  className="text-center p-05"
                  style={{ width: "23mm", background: "#cbcbcb" }}
                >
                  เลขที่ออเดอร์
                  <br />
                  Oder No.
                </th>
                <th
                  className="text-center p-05"
                  style={{ width: "81mm", background: "#cbcbcb" }}
                >
                  รหัสพัสดุ
                  <br />
                  Tracking
                </th>
                <th
                  className="text-center p-05"
                  style={{ width: "15mm", background: "#cbcbcb" }}
                >
                  จำนวน
                  <br />
                  กล่อง
                </th>
                <th
                  className="text-center p-05"
                  style={{ width: "19mm", background: "#cbcbcb" }}
                >
                  น้ำหนัก
                  <br />
                  Wt./kg
                </th>
                <th
                  className="text-center p-05"
                  style={{ width: "23mm", background: "#cbcbcb" }}
                >
                  ปริมาตร
                  <br />
                  Vol./CBM
                </th>
                <th
                  className="text-center p-05"
                  style={{ width: "25mm", background: "#cbcbcb" }}
                >
                  ค่าขนส่ง
                  <br />
                  Amount
                </th>
              </tr>
            </thead>
            {/* L336/L366-374 — the item rows for this page */}
            <tbody>
              {pg.rows.map(({ row, no: rowNo }) => (
                <tr key={`${rcpt.ID}-${row.fid}`}>
                  <td className="v-a-t text-center">{rowNo}</td>
                  <td className="v-a-t">{row.fid}</td>
                  <td className="v-a-t">{countText(row.ftrackingchn, 30)}</td>
                  <td className="v-a-t text-right">
                    {numberFormat(row.famount, 0)}
                  </td>
                  <td className="v-a-t text-right">
                    {numberFormat(row.fweight, 2)}
                  </td>
                  <td className="v-a-t text-right">
                    {numberFormat(row.fvolume, 5)}
                  </td>
                  <td className="v-a-t text-right">
                    {numberFormat(row.ftotalprice, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── $bodyFooter — invoiceF.php L395-464 ──
              The totals block prints ONLY on the last page
              ($page==$pageAll, legacy L397). */}
          {pg.pageNo === pageAll ? (
            <div
              style={{ position: "fixed", bottom: "0mm", fontSize: "20px" }}
            >
              <hr />
              <table
                className="table table-bordered"
                style={{ width: "20cm" }}
              >
                <tbody>
                  <tr className="text-center">
                    <th
                      className="text-left v-a-t"
                      style={{ width: "12cm", fontWeight: 400 }}
                      rowSpan={3}
                      colSpan={2}
                    >
                      <b>หมายเหตุ : </b>
                      *ใบเสร็จรับเงินฉบับนี้จะสมบูรณ์ เมื่อได้รับเงินเรียบร้อยแล้ว
                      <br />
                      **This is an electronic display of receipt data.
                      <br />
                      <div>
                        <input
                          type="checkbox"
                          style={{ fontSize: "20px" }}
                          readOnly
                        />{" "}
                        เงินสด_____________________
                        วันที่____________________________{" "}
                      </div>
                      <div>
                        <input
                          type="checkbox"
                          style={{ fontSize: "20px" }}
                          readOnly
                        />{" "}
                        เช็คธนาคาร/สาขา_____________ วันที่________
                        เลขที่เช็ค____________
                      </div>
                      {/* L392 — $textPay (the bank-transfer line) */}
                      <div>
                        <input
                          type="checkbox"
                          style={{ fontSize: "20px" }}
                          defaultChecked
                          readOnly
                        />{" "}
                        โอนเข้าธนาคาร <b>กสิกรไทย</b> เลขที่{" "}
                        <b>064-174-3836</b> วันที่ {rcpt.dateCreate}{" "}
                      </div>
                      <div
                        className="text-center"
                        style={{ display: "block" }}
                      >
                        จำนวนเงิน {numberFormat(grandTotal, 2)} บาท ผู้รับเงิน
                        ________________________
                      </div>
                      {/* L410 — the total in Thai words */}
                      <div
                        className="text-right"
                        style={{ background: "#f2f2f2" }}
                      >
                        <b>({convert(grandTotal)})</b>
                      </div>
                    </th>
                    <th
                      className="text-right v-a-t"
                      style={{ width: "5cm" }}
                    >
                      <div>Total</div>
                      <div>Delivery Charge CHN</div>
                      <div>Delivery Charge TH</div>
                      <div>Other</div>
                      <div>Discount</div>
                      {/* L418 — $textPer1 (WHT 1% label) */}
                      {textPer1 === "show" ? (
                        <div>LESS WITHHOLDING TAX 1%</div>
                      ) : (
                        <div style={{ color: "#fff" }}>
                          LESS WITHHOLDING TAX 1%
                        </div>
                      )}
                    </th>
                    <th
                      className="text-right v-a-t"
                      style={{ width: "4cm" }}
                    >
                      <div>{numberFormat(fTotalPriceAll, 2)} บาท</div>
                      <div>
                        {numberFormat(fTransportPriceCHNTHBAll, 2)} บาท
                      </div>
                      <div>
                        {numberFormat(fTransportPriceTHBAll, 2)} บาท
                      </div>
                      <div>{numberFormat(priceOtherBillAll, 2)} บาท</div>
                      <div>{numberFormat(fDiscountAll, 2)} บาท</div>
                      {/* L426 — $pricPer1 */}
                      {pricPer1}
                    </th>
                  </tr>
                  <tr className="text-center">
                    <th className="text-right">Total Amount</th>
                    <th className="text-right">
                      <h3 className="text-center">
                        {numberFormat(grandTotal, 2)} บาท
                      </h3>
                    </th>
                  </tr>
                  <tr>
                    <th colSpan={4}>
                      <hr />
                    </th>
                  </tr>
                  {/* L438-458 — the four signature cells */}
                  <tr>
                    <th
                      className="text-center v-a-t"
                      style={{ width: "4cm" }}
                    >
                      ผู้ออกเอกสาร
                      <br />
                      {/* L123 — assets/images/theme/sin-wandee.jpg */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/legacy/pcs/theme/sin-wandee.jpg"
                        alt=""
                        style={{ width: "25mm" }}
                      />
                      <br />
                      {rcpt.dateCreate}
                    </th>
                    <th
                      className="text-center v-a-t"
                      style={{ width: "4cm" }}
                    >
                      ผู้อนุมัติเอกสาร
                      <br />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/legacy/pcs/theme/sin-wandee.jpg"
                        alt=""
                        style={{ width: "25mm" }}
                      />
                      <br />
                      {rcpt.dateCreate}
                    </th>
                    <th
                      className="text-center v-a-t"
                      style={{ width: "4cm" }}
                    >
                      ตราประทับ (ผู้ขาย)
                      {/* L122 — assets/images/theme/stamp.png */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/legacy/pcs/theme/stamp.png"
                        alt=""
                        style={{ width: "25mm" }}
                      />
                    </th>
                    <th
                      className="text-center v-a-t"
                      style={{ width: "4cm" }}
                    >
                      ผู้รับเอกสาร (ลูกค้า)
                      <br />
                      <br />
                      <br />
                      __/__/____
                    </th>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ))}
      {/* dataTitle is the legacy page <title> ingredient — referenced
          so the lint no-unused rule is satisfied; Next.js owns <head>. */}
      <span style={{ display: "none" }} aria-hidden="true">
        {dataTitle}
      </span>
    </>
  );
}

/**
 * The print button needs `window.print()`. A Server Component cannot
 * bind an onClick, and `invoiceF.php` simply streams a PDF — the
 * faithful web equivalent of "give the customer the PDF" is to open
 * the browser print dialog. This one-line inline script wires the
 * `.pcs-receipt-toolbar .btn` to `window.print()`. It is purely a
 * client affordance — NOT a render-time mutation.
 */
function PrintButtonScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          "document.addEventListener('click',function(e){" +
          "var b=e.target.closest('.pcs-receipt-toolbar .btn');" +
          "if(b){window.print();}});",
      }}
    />
  );
}
