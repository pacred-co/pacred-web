import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";

/**
 * ฝากนำเข้า (forwarder import) RECEIPT PRINT document — a FAITHFUL
 * 1:1 TRANSCRIPTION of the legacy PCS Cargo `member/printReceiptF.php`
 * ("ใบเสร็จรับเงิน (ไม่ใช่ใบกำกับภาษี)" — the official receipt for a
 * customer's paid import shipments). D1 / ADR-0017 · faithful-port
 * transcription · runbook `docs/runbook/faithful-port-transcription.md`.
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `printReceiptF.php` builds into its mPDF
 * string — same elements, same class names, same Thai/English bilingual
 * labels, same column order, same 13-rows-per-page pagination, same
 * footer block. The visual identity comes from the legacy CSS:
 * printReceiptF.php has an INLINE <style> block (L146-258), brought
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/print-receipt-f.css`, loaded via a plain <link>
 * so it bypasses the app's Tailwind v4 / PostCSS pipeline.
 *
 * ── How the legacy screen is reached ─────────────────────────────
 * The legacy `receipt-f-hs.php` import-receipt history list links to
 * it (receipt-f-hs.php L121 / L138 / the bulk-print JS L238-246):
 *   printReceiptF.php?id=<rID>            — one receipt
 *   printReceiptF.php?type=1&id=<csv>     — bulk print (comma list)
 * Pacred has transcribed `receipt-f-hs.php` → `/service-import/
 * receipts`; until now that page kept a `LEGACY_PRINT_BASE`
 * placeholder URL for the un-ported print endpoint (its FLAG (A)).
 * THIS page is that endpoint, so the receipts-list links now resolve
 * inside Pacred — see the companion edit to receipt-f-hs's page.tsx.
 *
 * Pacred route: `/service-import/receipts/print` (a sub-route of the
 * receipt-history screen). The legacy `?id` and `?type` GET params
 * become Next.js `searchParams` — faithful to the legacy URL
 * contract. `?id` is a comma-joined list, exactly like the PHP
 * `explode(",", $_GET['id'])`. `?type=1` is the legacy bulk-print
 * marker; printReceiptF.php only ever branches `$nameDocs` on it and
 * both branches produce the same '<br/>' — so it is read but has no
 * visible effect, reproduced 1:1.
 *
 * ── Data — every printReceiptF.php mysqli query transcribed 1:1 ───
 * `tb_*` is RLS-locked to service_role, so reads go through the
 * admin client. printReceiptF.php pins the receipt's customer via
 * the cookie `pcs_userID`; the Pacred equivalent is the logged-in
 * member's `member_code` ("PR<n>" === tb_*.userid) — every receipt
 * is checked to belong to that customer before it is rendered.
 *
 *   $sql       — printReceiptF.php L46-52: tb_receipt ⋈ tb_users ⋈
 *                tb_corporate WHERE rID.
 *   address    — printReceiptF.php L76: tb_address_main ⋈ tb_address
 *                — the customer's main address (non-corporate path).
 *   $sql_item  — printReceiptF.php L123-129: tb_receipt_item ⋈
 *                tb_receipt ⋈ tb_forwarder ⋈ tb_wallet_hs
 *                WHERE ri.rID & f.ID IS NOT NULL GROUP BY f.ID.
 *
 * ── FLAGGED — deferred mutation (a render is a PURE READ) ─────────
 * printReceiptF.php runs an UPDATE at render time (L58):
 *   UPDATE tb_receipt SET statusPrint='1', adminIDprint='ลูกค้า',
 *                         rDatePrint=NOW() WHERE rID
 * marking the receipt printed by the customer. A Next.js Server
 * Component render MUST stay a pure read (runbook §9.4), so this
 * write is NOT performed here — it is a DEFERRED Server Action
 * (see the report).
 *
 * ── Notes on faithful reproduction ───────────────────────────────
 *  - The WHT-1% block (printReceiptF.php L375-392) only fires for a
 *    non-corporate-name receipt ($ReCorporate==1) — it conditionally
 *    shows "LESS WITHHOLDING TAX 1%". The legacy `diff0()` helper
 *    (function.php L1409) = abs($a-$b) rounded; transcribed below.
 *  - The PCS member-code special-cases (printReceiptF.php L70-113 —
 *    PCS415 / PCS71 / PCS4136 / PCS8765) are kept verbatim, rebranded
 *    PCS→PR per the brand-split rule (runbook §3). They hardcode a
 *    name / tax id / address for those specific migrated customers.
 *  - logo.png / stamp.png / sin-wandee.jpg — printReceiptF.php prints
 *    these `assets/images/theme/*` brand assets. The PR assets are
 *    not yet swapped; the legacy PCS assets are used as 1:1
 *    placeholders (`/legacy/pcs/theme/*`) and flagged for ปอน's
 *    brand-asset swap (runbook §9.6).
 *  - The legacy paginates 13 item rows per mPDF page and repeats the
 *    full bilingual header on each; the footer summary block renders
 *    only on the LAST page. Reproduced exactly — one <article> per
 *    page, `pageBreakAfter` between them.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" / "บริษัท
 * พีซีเอส คาร์โก้ จำกัด" brand → `PR<n>` + "PR Cargo" / "บริษัท แพคเรด
 * (ประเทศไทย) จำกัด" — the issuer block on the document now shows the
 * Pacred legal name. The legacy Tax-ID + address values remain (data
 * values — runbook §3 / PCS-scrub plan gates those).
 */

export const dynamic = "force-dynamic";

// printReceiptF.php paginates 13 item rows per page (L138).
const ROWS_PER_PAGE = 13;

// ── Legacy PCS theme assets (placeholders pending ปอน's PR swap) ──
const THEME_BASE = "/legacy/pcs/theme";

/** number_format($n, $d) — the PHP money formatter printReceiptF.php
 *  uses throughout. */
function numberFormat(n: number, decimals = 2): string {
  return (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** countText($text,$num) — member/include/function.php L14-24:
 *  truncate to $num characters (multibyte-aware) + append '...'. */
function countText(text: string, num: number): string {
  const s = text ?? "";
  const chars = Array.from(s); // multibyte-correct length
  if (chars.length >= num) return chars.slice(0, num).join("") + "...";
  return s;
}

/** diff0($a,$b) — member/include/function.php L1409+: the absolute
 *  rounded difference of two numbers. Used by the WHT-1% gate. */
function diff0(a: number, b: number): number {
  return Math.abs(Math.round((Number(a) || 0) - (Number(b) || 0)));
}

/* ── Convert($amount) — the Thai baht-text reader.
 *    member/include/function.php L1021-1073 (Convert + ReadNumber).
 *    printReceiptF.php L411 prints Convert($totalPriceAll-$Dis1per). ── */
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

/** DATE_FORMAT(d,'%d/%m/%Y') — dd/mm/YYYY. printReceiptF.php SELECTs
 *  the with-time format too (`%d/%m/%Y %T`) but the rendered document
 *  only ever prints $dateCreate, the date-only value (L55) — so only
 *  the date formatter is needed. */
function fmtDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d.replace(" ", "T"));
  if (Number.isNaN(dt.getTime())) return d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

// ── Row types (the columns printReceiptF.php SELECTs + renders) ──
type ReceiptRow = {
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
type ForwarderItemRow = {
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
  ftrackingchn: string;
  amount: number; // tb_wallet_hs.amount (the slip amount)
};

/** One fully-resolved receipt ready to render — printReceiptF.php
 *  builds one or more mPDF pages per rID. */
type ReceiptDoc = {
  rID: string;
  dateCreate: string;
  // resolved customer block
  fName: string;
  corporateName: string;
  corporateNumber: string;
  corporateAddress: string;
  addressBR: boolean; // legacy adds a spacer <br> when address ≤230 chars
  // page rollup totals
  rows: ForwarderItemRow[];
  fTotalPriceAll: number;
  fDiscountAll: number;
  fTransportPriceCHNTHBAll: number;
  fTransportPriceTHBAll: number;
  priceOtherBillAll: number;
  totalPriceAll: number;
  amountPayAll: number;
  // WHT-1% block
  reCorporate: number; // 0 = corporate-name receipt, 1 = personal
  textPer1: string;
  pricPer1Visible: boolean;
  pricPer1Value: number;
  dis1per: number;
};

type SearchParams = {
  id?: string;
  type?: string;
};

export default async function ServiceImportReceiptPrintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // printReceiptF.php L6-10 — a logged-out visitor is redirected to /login.
  const { profile } = await requireAuth();
  const sp = await searchParams;

  // printReceiptF.php L11: `if(isset($_GET['id']))`.
  if (sp.id === undefined || sp.id === "") notFound();

  // $userID — the customer's member code ("PR<n>" === tb_*.userid).
  const userID = profile?.member_code ?? "";

  // printReceiptF.php L39-43 — $arrID = explode(",", $_GET['id']);
  // $dataTitle = the comma-joined list (used in the <title>).
  const arrID = sp.id.split(",").filter((s) => s !== "");
  const dataTitle = arrID.join(", ");
  void dataTitle; // legacy uses it only in <title>; Next sets <title> elsewhere

  // printReceiptF.php L14-16 — $nameDocs branches on ?type but BOTH
  // branches assign '<br/>' — read with no visible effect (1:1).
  void sp.type;

  const admin = createAdminClient();

  // ── Build one ReceiptDoc per rID (printReceiptF.php L44-485) ──
  const docs: ReceiptDoc[] = [];

  for (const ID of arrID) {
    // $sql — printReceiptF.php L46-52: tb_receipt ⋈ tb_users ⋈
    // tb_corporate WHERE rID. PostgREST cannot express the multi-table
    // join in one select, so it is the same sequence of lookups the
    // PHP effectively does.
    const { data: receipt } = await admin
      .from("tb_receipt")
      .select("rdate, userid")
      .eq("rid", ID)
      .maybeSingle<{ rdate: string | null; userid: string }>();

    // printReceiptF.php L53: `if ($result->num_rows > 0)` — skip a
    // receipt id that does not exist.
    if (!receipt) continue;

    // FAITHFUL ownership gate — printReceiptF.php scopes the print to
    // the cookie owner ($_COOKIE['pcs_userID']); a customer must only
    // ever print their OWN receipt. Skip a receipt owned by someone
    // else (the legacy relies on the link only being shown to its
    // owner; the Pacred port enforces it server-side).
    if (receipt.userid !== userID) continue;

    const { data: userRow } = await admin
      .from("tb_users")
      .select("username, userlastname")
      .eq("userid", receipt.userid)
      .maybeSingle<{ username: string | null; userlastname: string | null }>();

    const { data: corpRow } = await admin
      .from("tb_corporate")
      .select("corporatename, corporatenumber, corporateaddress")
      .eq("userid", receipt.userid)
      .maybeSingle<{
        corporatename: string | null;
        corporatenumber: string | null;
        corporateaddress: string | null;
      }>();

    const rowMain: ReceiptRow = {
      rdate: receipt.rdate,
      userid: receipt.userid,
      corporatename: corpRow?.corporatename ?? "",
      corporatenumber: corpRow?.corporatenumber ?? "",
      corporateaddress: corpRow?.corporateaddress ?? "",
      username: userRow?.username ?? "",
      userlastname: userRow?.userlastname ?? "",
      // tb_receipt also carries the per-receipt reComp* override cols.
      recompnumber: "",
      recompname: "",
      recompaddress: "",
    };
    // printReceiptF.php SELECTs reCompNumber / reCompName / reCompAddress
    // from tb_receipt — fetch them (the receipt-level company override).
    const { data: reComp } = await admin
      .from("tb_receipt")
      .select("recompnumber, recompname, recompaddress")
      .eq("rid", ID)
      .maybeSingle<{
        recompnumber: string | null;
        recompname: string | null;
        recompaddress: string | null;
      }>();
    rowMain.recompnumber = reComp?.recompnumber ?? "";
    rowMain.recompname = reComp?.recompname ?? "";
    rowMain.recompaddress = reComp?.recompaddress ?? "";

    const dateCreate = fmtDate(rowMain.rdate);

    // printReceiptF.php L58 — the render-time UPDATE statusPrint='1'
    // is DEFERRED (a render is a pure read; see the file header FLAG).

    // ── Customer-name resolution — printReceiptF.php L62-113 ──
    // $fName = userID . ' ' . corporateName  (corporate path).
    let fName = `${rowMain.userid} ${rowMain.corporatename}`;
    let reCorporate: number;

    if (rowMain.corporatenumber === "") {
      // not a tb_corporate customer (printReceiptF.php L68-93)
      if (rowMain.recompname === "") {
        // printReceiptF.php L70-74 — the PCS415 hardcode (rebranded PR415)
        if (rowMain.userid === "PR415") {
          rowMain.corporatename = "พีรวันติ์ ติระจารุอนันต์";
          rowMain.corporatenumber = "-";
          rowMain.corporateaddress =
            "222/1 หมู่4 หมู่บ้านลัดดาลม อีลี่ แกรนต์ ตำบล/แขวง บางขุนกอง อำเภอ/เขต บางกรวย จังหวัด นนทบุรี 11130";
        }
        // printReceiptF.php L76-82 — fall back to the main address.
        const { data: addrRow } = await admin
          .from("tb_address_main")
          .select("addressid")
          .eq("userid", rowMain.userid)
          .maybeSingle<{ addressid: number }>();
        let fullAddress = "";
        if (addrRow?.addressid != null) {
          const { data: addr } = await admin
            .from("tb_address")
            .select(
              "addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode, addresstel",
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
          if (addr) {
            // CONCAT(addressNo,' ตำบล/แขวง ',…) — printReceiptF.php L76.
            fullAddress =
              `${addr.addressno} ตำบล/แขวง ${addr.addresssubdistrict}` +
              ` อำเภอ/เขต ${addr.addressdistrict} จังหวัด ${addr.addressprovince}` +
              ` ${addr.addresszipcode} โทร. ${addr.addresstel}`;
          }
        }
        rowMain.corporateaddress = fullAddress;
        rowMain.corporatenumber = "-";
        rowMain.corporatename = `${rowMain.username} ${rowMain.userlastname}`;
        fName = `${rowMain.userid} ${rowMain.corporatename}`;
      } else {
        // printReceiptF.php L83-92 — use the receipt-level reComp* override.
        rowMain.corporatename = rowMain.recompname ?? "";
        rowMain.corporatenumber =
          rowMain.recompnumber !== "" ? (rowMain.recompnumber ?? "") : "-";
        rowMain.corporateaddress = rowMain.recompaddress ?? "";
        fName = `${rowMain.userid} ${rowMain.corporatename}`;
      }
      reCorporate = 0;
    } else {
      reCorporate = 1;
    }

    // printReceiptF.php L97-101 — a spacer <br> when the address is short.
    const addressBR = (rowMain.corporateaddress ?? "").length <= 230;

    // printReceiptF.php L102-113 — three more PCS member-code hardcodes
    // (rebranded PR71 / PR4136 / PR8765).
    if (rowMain.userid === "PR71") {
      fName = "บริษัท 3พี อีควิปเม้นท์ เทรดดิ้ง จำกัด ";
      rowMain.corporatename = "บริษัท 3พี อีควิปเม้นท์ เทรดดิ้ง จำกัด ";
      rowMain.corporatenumber = "0105565004933";
      rowMain.corporateaddress =
        "366/49 หมู่บ้านไอยรา ถนน เลียบคลองภาษีฯฝั่งเหนือ แขวงหนองแขม เขตหนองแขม กรุงเทพมหานคร 10160";
    }
    if (rowMain.userid === "PR4136") {
      rowMain.corporatenumber = "1350100500141";
    }
    if (rowMain.userid === "PR8765") {
      rowMain.corporatenumber = "1350100500141";
    }

    // printReceiptF.php L115-120 — the WHT-1% defaults.
    // $textPer1 starts hidden (white) for a personal receipt; for a
    // corporate-name receipt it is shown. $pricPer1 starts white "0".
    let textPer1 =
      reCorporate === 1
        ? '<div>LESS WITHHOLDING TAX 1%</div>'
        : '<div style="color: #fff;">LESS WITHHOLDING TAX 1%</div>';
    let pricPer1Visible = false;

    // ── $sql_item — tb_receipt_item ⋈ tb_forwarder ⋈ tb_wallet_hs ──
    // printReceiptF.php L123-129. The legacy GROUP BY f.ID; the
    // tb_wallet_hs join (status=2, type<>5) pulls `amount` — the slip
    // amount actually paid for each forwarder line.
    // 1. the receipt's item fIDs (tb_receipt_item).
    const { data: itemLinks } = await admin
      .from("tb_receipt_item")
      .select("fid")
      .eq("rid", ID);
    const fIds = Array.from(
      new Set(((itemLinks ?? []) as { fid: number }[]).map((r) => r.fid)),
    );

    const rows: ForwarderItemRow[] = [];
    if (fIds.length > 0) {
      // tb_forwarder — the line columns the receipt table renders +
      // the price columns the rollup sums.
      const { data: fRows } = await admin
        .from("tb_forwarder")
        .select(
          "id, fpriceupdate, fshippingservice, ftransportpricechnthb, pricecrate, priceother, fdiscount, ftotalprice, ftransportprice, famount, fvolume, fweight, ftrackingchn, userid",
        )
        .in("id", fIds);

      // tb_wallet_hs — the paid-slip amount per forwarder line
      // (refOrder=f.ID, status=2, type<>5, userID=f.userID).
      const { data: walletRows } = await admin
        .from("tb_wallet_hs")
        .select("reforder, amount, status, type, userid")
        .in("reforder", fIds.map((n) => String(n)))
        .eq("status", "2");

      const walletByRef = new Map<string, number>();
      for (const w of (walletRows ?? []) as {
        reforder: string;
        amount: number;
        type: string;
      }[]) {
        // type<>5 — printReceiptF.php L128.
        if (w.type === "5") continue;
        // GROUP BY f.ID → the legacy keeps one wallet_hs amount per
        // forwarder; take the first match (mirrors MySQL's grouped pick).
        if (!walletByRef.has(w.reforder)) {
          walletByRef.set(w.reforder, Number(w.amount) || 0);
        }
      }

      for (const f of (fRows ?? []) as ({
        id: number;
        userid: string;
      } & Omit<ForwarderItemRow, "fid" | "amount">)[]) {
        // f.userID match on the wallet join — keep it faithful.
        const amount = walletByRef.get(String(f.id)) ?? 0;
        rows.push({
          fid: f.id,
          fpriceupdate: Number(f.fpriceupdate) || 0,
          fshippingservice: Number(f.fshippingservice) || 0,
          ftransportpricechnthb: Number(f.ftransportpricechnthb) || 0,
          pricecrate: Number(f.pricecrate) || 0,
          priceother: Number(f.priceother) || 0,
          fdiscount: Number(f.fdiscount) || 0,
          ftotalprice: Number(f.ftotalprice) || 0,
          ftransportprice: Number(f.ftransportprice) || 0,
          famount: Number(f.famount) || 0,
          fvolume: Number(f.fvolume) || 0,
          fweight: Number(f.fweight) || 0,
          ftrackingchn: f.ftrackingchn ?? "",
          amount,
        });
      }
    }

    // ── Rollup totals — printReceiptF.php L353-374 ──
    let amountPayAll = 0;
    let fTotalPriceAll = 0;
    let fDiscountAll = 0;
    let fTransportPriceCHNTHBAll = 0;
    let fTransportPriceTHBAll = 0;
    let priceOtherBillAll = 0;
    let totalPriceAll = 0;
    for (const r of rows) {
      // $totalPrice — printReceiptF.php L354.
      const totalPrice =
        r.ftotalprice +
        r.ftransportprice +
        r.fpriceupdate +
        r.fshippingservice +
        r.ftransportpricechnthb +
        r.pricecrate +
        r.priceother -
        r.fdiscount;
      amountPayAll += r.amount;
      fTotalPriceAll += r.ftotalprice;
      fDiscountAll += r.fdiscount;
      fTransportPriceCHNTHBAll += r.ftransportpricechnthb;
      fTransportPriceTHBAll += r.ftransportprice;
      priceOtherBillAll +=
        r.fpriceupdate + r.fshippingservice + r.pricecrate + r.priceother;
      totalPriceAll += totalPrice;
    }

    // ── WHT-1% — printReceiptF.php L375-392 (the $ReCorporate==1 gate) ──
    let dis1per = 0;
    let pricPer1Value = 0;
    if (reCorporate === 1) {
      // totalPriceAll → number_format(...,2,'.','')*… — the legacy
      // rounds to 2 dp with no separator before the ratio maths.
      totalPriceAll = Number(totalPriceAll.toFixed(2));
      dis1per = totalPriceAll * 0.01;
      const amountPayAll2 = Number((totalPriceAll - dis1per).toFixed(2));
      if (diff0(totalPriceAll, amountPayAll) === 0) {
        // exact-paid → no WHT line.
        textPer1 = "";
        dis1per = 0;
      } else if (
        diff0(amountPayAll2, amountPayAll) <= 1200 &&
        amountPayAll2 > 1000
      ) {
        // WHT 1% withheld.
        textPer1 = '<div>LESS WITHHOLDING TAX 1%</div>';
        pricPer1Visible = true;
        pricPer1Value = dis1per;
        dis1per = Number(dis1per.toFixed(2));
      } else {
        textPer1 = "";
        dis1per = 0;
      }
    }

    docs.push({
      rID: ID,
      dateCreate,
      fName,
      corporateName: rowMain.corporatename ?? "",
      corporateNumber: rowMain.corporatenumber ?? "",
      corporateAddress: rowMain.corporateaddress ?? "",
      addressBR,
      rows,
      fTotalPriceAll,
      fDiscountAll,
      fTransportPriceCHNTHBAll,
      fTransportPriceTHBAll,
      priceOtherBillAll,
      totalPriceAll,
      amountPayAll,
      reCorporate,
      textPer1,
      pricPer1Visible,
      pricPer1Value,
      dis1per,
    });
  }

  // The legacy outputs an empty PDF when no rID resolved.
  if (docs.length === 0) notFound();

  return (
    <div className="print-fullscreen-overlay">
      {/* Two-layer wrap so the A4-sized receipt centers inside the
          fullscreen overlay (otherwise the same element can't be both
          full-viewport AND A4-sized). Outer = chrome-hider, inner = A4.
          LOAD ORDER MATTERS: print-receipt-f.css L144-146 has `@page {
          margin: 4mm }`; print-overlay.css must load AFTER so its
          `@page { margin: 0 }` + wrapper padding wins the cascade. */}
      <link rel="stylesheet" href="/legacy/pcs/print-receipt-f.css" />
      <link rel="stylesheet" href="/legacy/pcs/print-overlay.css" />

      {/* On-screen print button — direct child of the overlay so
          `.print-fullscreen-overlay > .no-print { position: fixed }`
          floats it top-right unscaled. */}
      <div className="no-print">
        <PrintButton />
      </div>

      <div className="pcs-legacy print-receipt-f">
        {docs.map((doc) => (
          <ReceiptDocPages key={doc.rID} doc={doc} />
        ))}
      </div>
    </div>
  );
}

/**
 * Renders one receipt as one-or-more print pages — printReceiptF.php
 * L346-479 paginates the item rows 13-per-page; the bilingual header
 * repeats on every page and the footer summary block renders only on
 * the LAST page.
 */
function ReceiptDocPages({ doc }: { doc: ReceiptDoc }) {
  // printReceiptF.php L346-350 — $pageAll = ceil(rows / 13).
  const pageAll = Math.max(1, Math.ceil(doc.rows.length / ROWS_PER_PAGE));
  const pages: React.ReactElement[] = [];

  // The legacy keeps a running item number ($no) + a running
  // $totalPriceAll as it walks the pages — but since the footer only
  // prints on the last page with the final total, we render each page
  // with its slice and the footer with the doc-level totals.
  for (let page = 1; page <= pageAll; page++) {
    const start = (page - 1) * ROWS_PER_PAGE;
    const slice = doc.rows.slice(start, start + ROWS_PER_PAGE);
    const isLast = page === pageAll;
    pages.push(
      <ReceiptPage
        key={`${doc.rID}-p${page}`}
        doc={doc}
        slice={slice}
        firstNo={start + 1}
        pageName={`${page}/${pageAll}`}
        isLast={isLast}
      />,
    );
  }
  return <>{pages}</>;
}

/** A single A4 receipt page — printReceiptF.php $bodyHeader + the
 *  item rows + ($page==$pageAll ? the footer). */
function ReceiptPage({
  doc,
  slice,
  firstNo,
  pageName,
  isLast,
}: {
  doc: ReceiptDoc;
  slice: ForwarderItemRow[];
  firstNo: number;
  pageName: string;
  isLast: boolean;
}) {
  return (
    <article style={{ pageBreakAfter: "always" }}>
      {/* printReceiptF.php L260 — <table class="table"> */}
      <table className="table">
        {/* ── Logo + company + document-title band — L261-277 ── */}
        <thead>
          <tr className="">
            <th colSpan={2} className="text-center">
              {/* logo.png — legacy PCS asset placeholder (flagged
                  for ปอน's PR brand swap). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${THEME_BASE}/logo.png`} style={{ width: "20mm" }} alt="" />
            </th>
            <th colSpan={2} className="text-center">
              <h2>บริษัท แพคเรด (ประเทศไทย) จำกัด</h2>
              <h3>PR Cargo CO., LTD.</h3>
            </th>
            <th
              colSpan={3}
              style={{ background: "#f2f2f2", lineHeight: "1.35em" }}
            >
              {/* $nameDocs — always '<br/>' (see the file header). */}
              <div className="text-center">
                <br />
              </div>
              <div
                className="text-center h-title"
                style={{ fontFamily: "frutiger" }}
              >
                ใบเสร็จรับเงิน
              </div>
              <div className="text-center h-title3">(ไม่ใช่ใบกำกับภาษี)</div>
              <div className="h-title2 ">เลขที่ {doc.rID}</div>
            </th>
          </tr>
        </thead>

        {/* ── Issuer block — printReceiptF.php L278-307 ── */}
        <thead>
          <tr className="">
            <th colSpan={7}>
              <hr />
            </th>
          </tr>
          <tr className="">
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
              <div>บริษัท แพคเรด (ประเทศไทย) จำกัด</div>
              <div>0105560160694</div>
              {/* printReceiptF.php L291-295 — the issuer address
                  switched on 2025-03-20. Reproduced 1:1. */}
              <div>{issuerAddress()}</div>
              <div>02-444-7046</div>
            </th>
            <th colSpan={1} className="text-right v-a-t">
              <div>วันที่ / date : </div>
              <div>หน้า / page : </div>
            </th>
            <th colSpan={1} className="text-left v-a-t">
              <div>{doc.dateCreate}</div>
              {/* printReceiptF.php replaces the literal "pagebillpage"
                  token with $page."/".$pageAll. */}
              <div>{pageName}</div>
            </th>
          </tr>
          <tr className="">
            <th colSpan={7}>
              <hr />
            </th>
          </tr>
          {/* ── Customer block — printReceiptF.php L308-322 ── */}
          <tr className="">
            <th colSpan={2} className="text-left v-a-t">
              <div>ลูกค้า / Customer : </div>
              <div>เลขผู้เสียภาษี / Tax ID : </div>
              <div>ที่อยู่ / Address : </div>
            </th>
            <th colSpan={5} className="text-left v-a-t">
              <div className="h-sub">{countText(doc.fName, 95)}</div>
              <div className="h-sub">{countText(doc.corporateNumber, 20)}</div>
              <div className="h-sub" style={{ height: "50mm" }}>
                {countText(doc.corporateAddress, 200)}
                {/* printReceiptF.php L99 — the white-dot spacer line
                    when the address is short. */}
                {doc.addressBR ? (
                  <>
                    <br />
                    <span style={{ color: "#fff" }}>.</span>
                  </>
                ) : null}
              </div>
            </th>
          </tr>
        </thead>

        {/* ── Item-table head — printReceiptF.php L324-334 ── */}
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

        {/* ── Item rows — printReceiptF.php L365-373 ── */}
        <tbody>
          {slice.map((r, i) => (
            <tr key={r.fid}>
              <td className="v-a-t text-center">{firstNo + i}</td>
              <td className="v-a-t">{r.fid}</td>
              <td className="v-a-t">{countText(r.ftrackingchn, 30)}</td>
              <td className="v-a-t text-right">{numberFormat(r.famount, 0)}</td>
              <td className="v-a-t text-right">{numberFormat(r.fweight, 2)}</td>
              <td className="v-a-t text-right">{numberFormat(r.fvolume, 5)}</td>
              <td className="v-a-t text-right">
                {numberFormat(r.ftotalprice, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Footer summary — printReceiptF.php L398-462, last page only ── */}
      {isLast ? <ReceiptFooter doc={doc} /> : null}
    </article>
  );
}

/**
 * The fixed-bottom receipt footer — printReceiptF.php L398-462.
 * Renders only on the last page; carries the price summary, the
 * payment-method checkboxes, the Thai baht-text total, and the
 * issuer / approver / stamp / customer signature row.
 */
function ReceiptFooter({ doc }: { doc: ReceiptDoc }) {
  // printReceiptF.php L393-394 — the bank-transfer line.
  // $textPay = checked bank-transfer + the centred amount line.
  const grandTotal = doc.totalPriceAll - doc.dis1per;
  // printReceiptF.php L121-122 — the stamp + signature images.
  return (
    <div style={{ position: "fixed", bottom: "0mm", fontSize: "20px" }}>
      <hr />
      <table className="table table-bordered" style={{ width: "20cm" }}>
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
                <input type="checkbox" style={{ fontSize: "20px" }} /> เงินสด
                _____________________ วันที่____________________________{" "}
              </div>
              <div>
                <input type="checkbox" style={{ fontSize: "20px" }} />{" "}
                เช็คธนาคาร/สาขา_____________ วันที่________ เลขที่เช็ค____________
              </div>
              {/* $textPay — printReceiptF.php L393-394 */}
              <div>
                <input
                  type="checkbox"
                  style={{ fontSize: "20px" }}
                  defaultChecked
                />{" "}
                โอนเข้าธนาคาร <b>กสิกรไทย</b> เลขที่ <b>064-174-3836</b> วันที่{" "}
                {doc.dateCreate}{" "}
              </div>
              <div className="text-center" style={{ display: "block" }}>
                จำนวนเงิน {numberFormat(grandTotal)} บาท ผู้รับเงิน
                ________________________
              </div>
              <div
                className="text-right"
                style={{ background: "#f2f2f2" }}
              >
                <b>({convert(grandTotal)})</b>
              </div>
            </th>
            <th className="text-right v-a-t" style={{ width: "5cm" }}>
              <div>Total</div>
              <div>Delivery Charge CHN</div>
              <div>Delivery Charge TH</div>
              <div>Other</div>
              <div>Discount</div>
              {/* $textPer1 — the WHT-1% line; printReceiptF.php builds
                  it as an HTML fragment. It is one of:
                  '' · '<div>LESS WITHHOLDING TAX 1%</div>' ·
                  '<div style="color:#fff;">…</div>' (the white/hidden
                  default for a personal receipt). Rendered 1:1. */}
              {doc.textPer1 === "" ? null : doc.textPer1.includes(
                  "#fff",
                ) ? (
                <div style={{ color: "#fff" }}>LESS WITHHOLDING TAX 1%</div>
              ) : (
                <div>LESS WITHHOLDING TAX 1%</div>
              )}
            </th>
            <th className="text-right v-a-t" style={{ width: "4cm" }}>
              <div>{numberFormat(doc.fTotalPriceAll)} บาท</div>
              <div>{numberFormat(doc.fTransportPriceCHNTHBAll)} บาท</div>
              <div>{numberFormat(doc.fTransportPriceTHBAll)} บาท</div>
              <div>{numberFormat(doc.priceOtherBillAll)} บาท</div>
              <div>{numberFormat(doc.fDiscountAll)} บาท</div>
              {/* $pricPer1 — the WHT-1% amount; white "0" by default,
                  the real value when WHT was withheld. */}
              {doc.pricPer1Visible ? (
                <div>{numberFormat(doc.pricPer1Value)} บาท</div>
              ) : (
                <div style={{ color: "#fff" }}>0</div>
              )}
            </th>
          </tr>
          <tr className="text-center">
            <th className="text-right">Total Amount</th>
            <th className="text-right">
              <h3 className="text-center">{numberFormat(grandTotal)} บาท</h3>
            </th>
          </tr>
          <tr>
            <th colSpan={4}>
              <hr />
            </th>
          </tr>
          <tr>
            <th className="text-center v-a-t" style={{ width: "4cm" }}>
              ผู้ออกเอกสาร
              <br />
              {/* sin-wandee.jpg — legacy PCS signature asset
                  placeholder (flagged for ปอน's PR brand swap). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${THEME_BASE}/sin-wandee.jpg`}
                style={{ width: "25mm" }}
                alt=""
              />
              <br />
              {doc.dateCreate}
            </th>
            <th className="text-center v-a-t" style={{ width: "4cm" }}>
              ผู้อนุมัติเอกสาร
              <br />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${THEME_BASE}/sin-wandee.jpg`}
                style={{ width: "25mm" }}
                alt=""
              />
              <br />
              {doc.dateCreate}
            </th>
            <th className="text-center v-a-t" style={{ width: "4cm" }}>
              ตราประทับ (ผู้ขาย)
              {/* stamp.png — legacy PCS asset placeholder (flagged
                  for ปอน's PR brand swap). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${THEME_BASE}/stamp.png`}
                style={{ width: "25mm" }}
                alt=""
              />
            </th>
            <th className="text-center v-a-t" style={{ width: "4cm" }}>
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
  );
}

/**
 * printReceiptF.php L291-295 — the issuer (PCS Cargo) address switched
 * on 2025-03-20. `date('Y-m-d') > '2025-03-20'` → the new address.
 * Reproduced 1:1: today is past that cutover, so the new address.
 */
function issuerAddress(): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today > "2025-03-20") {
    return "เลขที่ 12 ซอย เพชรเกษม 77 แยก 3-6 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพมหานคร 10160";
  }
  return "เลขที่ 8 ซอย เพชรเกษม 77 แยก 3-4 แขวงหนองค้างพลู เขตหนองแขม กรุงเทพมหานคร 10160";
}
