import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PrintButton } from "@/components/print-button";
import { CONTACT, ADDRESSES, BANK, TAX_ID } from "@/components/seo/site";

/**
 * Freight (ฝากนำเข้า / forwarder import) INVOICE document — a FAITHFUL
 * 1:1 TRANSCRIPTION of the legacy PCS Cargo `member/invoiceF.php`
 * ("ใบเสร็จรับเงิน (ไม่ใช่ใบกำกับภาษี)" — the invoice/receipt PDF for
 * a freight (`F` = forwarder import) order). D1 / ADR-0017 ·
 * faithful-port transcription · runbook
 * `docs/runbook/faithful-port-transcription.md`.
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `invoiceF.php` builds into its mPDF string —
 * same elements, same class names, same Thai/English bilingual labels,
 * same column order, same 13-rows-per-page pagination, same footer
 * block. The visual identity comes from the legacy CSS: invoiceF.php
 * has an INLINE <style> block (L147-258), brought verbatim as the
 * static `.pcs-legacy`-scoped `public/legacy/pcs/print-receipt-f.css`
 * (shared with printReceiptF.php — the inline <style> block is
 * byte-identical between the two files), loaded via a plain <link>
 * so it bypasses the app's Tailwind v4 / PostCSS pipeline.
 *
 * ── invoiceF.php vs printReceiptF.php (the F-variant pair) ────────
 * The two legacy files are 99% identical mPDF generators that both
 * produce a "ใบเสร็จรับเงิน (ไม่ใช่ใบกำกับภาษี)" document for a
 * freight (`F`) order. The 3 meaningful differences are in the
 * WHT-1% block (invoiceF.php L376-390 vs printReceiptF.php L375-392):
 *
 *   - invoiceF gates the WHT-1% computation on `$ReCorporate==0`
 *     (i.e. PERSONAL receipts), while printReceiptF gates on
 *     `$ReCorporate==1` (CORPORATE receipts).
 *   - invoiceF uses the threshold `diff0($amountPayAll2,$amountPayAll)<=1`
 *     (a fine-grained 1-baht tolerance), while printReceiptF uses
 *     `<=1200 && $amountPayAll2>1000` (the legacy bulk-print receipt
 *     thresholds tolerant of larger WHT-related diffs).
 *   - printReceiptF additionally `number_format`-rounds totalPriceAll
 *     and Dis1per before/after the WHT line; invoiceF does not.
 *
 * The legacy `receipt-f-hs.php` history list links exclusively at
 * `printReceiptF.php`; `invoiceF.php` is reached from older admin
 * surfaces / direct links. The two routes are kept SEPARATE in
 * Pacred to preserve the legacy WHT semantics 1:1 — collapsing them
 * would alter the printed totals for some receipts.
 *
 * ── Route ────────────────────────────────────────────────────────
 * Pacred route: `/freight/invoice/[id]` — the dynamic `[id]` segment
 * carries the rID (the legacy `?id=`). The legacy supported a
 * comma-joined `?id=PCS123,PCS456` for bulk; the new dynamic segment
 * accepts the same comma-joined value as one path segment (Next.js
 * URL-decodes, the page splits the same way `explode(",", $_GET['id'])`
 * does). The legacy `?type` GET param is read from `searchParams`
 * for fidelity; invoiceF.php only branches `$nameDocs` on it and
 * both branches produce '<br/>' — read with no visible effect.
 *
 * ── Data — every invoiceF.php mysqli query transcribed 1:1 ────────
 * `tb_*` is RLS-locked to service_role, so reads go through the
 * admin client. invoiceF.php pins the receipt's customer via the
 * cookie `pcs_userID`; the Pacred equivalent is the logged-in
 * member's `member_code` ("PR<n>" === tb_*.userid) — every receipt
 * is checked to belong to that customer before it is rendered.
 *
 *   $sql       — invoiceF.php L46-52: tb_receipt ⋈ tb_users ⋈
 *                tb_corporate WHERE rID.
 *   address    — invoiceF.php L76: tb_address_main ⋈ tb_address
 *                — the customer's main address (non-corporate path).
 *   $sql_item  — invoiceF.php L124-130: tb_receipt_item ⋈
 *                tb_receipt ⋈ tb_forwarder ⋈ tb_wallet_hs
 *                WHERE ri.rID & f.ID IS NOT NULL GROUP BY f.ID.
 *
 * ── FLAGGED — deferred mutation (a render is a PURE READ) ─────────
 * invoiceF.php runs an UPDATE at render time (L58):
 *   UPDATE tb_receipt SET statusPrint='1', adminIDprint='ลูกค้า',
 *                         rDatePrint=NOW() WHERE rID
 * marking the receipt printed by the customer. A Next.js Server
 * Component render MUST stay a pure read (runbook §9.4), so this
 * write is NOT performed here — it is a DEFERRED Server Action.
 *
 * TODO(server-action): port the `UPDATE tb_receipt SET statusPrint`
 *   mutation to actions/*.ts when reviewed by เดฟ.
 *
 * ── Notes on faithful reproduction ───────────────────────────────
 *  - The WHT-1% block (invoiceF.php L376-390) only fires for a
 *    PERSONAL receipt ($ReCorporate==0) — note this is the OPPOSITE
 *    gate from printReceiptF.php (which fires it for CORPORATE).
 *    This is the load-bearing difference between the two F-variants
 *    and is reproduced verbatim. The legacy `diff0()` helper
 *    (function.php L1409) = abs($a-$b) rounded; transcribed below.
 *  - The PCS member-code special-cases (invoiceF.php L70-113 —
 *    PCS415 / PCS71 / PCS4136 / PCS8765) are kept verbatim, rebranded
 *    PCS→PR per the brand-split rule (runbook §3). They hardcode a
 *    name / tax id / address for those specific migrated customers.
 *  - logo.png / stamp.png / sin-wandee.jpg — invoiceF.php prints
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
 * พีซีเอส คาร์โก้ จำกัด" brand → `PR<n>` + "Pacred" / "บริษัท แพคเรด
 * (ประเทศไทย) จำกัด" — the issuer block on the document now shows the
 * Pacred legal name. The legacy Tax-ID + address values remain (data
 * values — runbook §3 / PCS-scrub plan gates those).
 */
export const dynamic = "force-dynamic";

// invoiceF.php paginates 13 item rows per page (L139).
const ROWS_PER_PAGE = 13;

// ── Legacy PCS theme assets (placeholders pending ปอน's PR swap) ──
const THEME_BASE = "/legacy/pcs/theme";

/** number_format($n, $d) — the PHP money formatter invoiceF.php
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
 *    invoiceF.php L410 prints Convert($totalPriceAll-$Dis1per). ── */
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

/** DATE_FORMAT(d,'%d/%m/%Y') — dd/mm/YYYY. */
function fmtDate(d: string | null): string {
  if (!d) return "";
  const dt = new Date(d.replace(" ", "T"));
  if (Number.isNaN(dt.getTime())) return d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

// ── Row types (the columns invoiceF.php SELECTs + renders) ──
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

/** One fully-resolved receipt ready to render — invoiceF.php builds
 *  one or more mPDF pages per rID. */
type ReceiptDoc = {
  rID: string;
  dateCreate: string;
  // resolved customer block
  fName: string;
  corporateName: string;
  corporateNumber: string;
  corporateAddress: string;
  addressBR: boolean;
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
  reCorporate: number; // 0 = personal-name receipt, 1 = corporate
  textPer1: string;
  pricPer1Visible: boolean;
  pricPer1Value: number;
  dis1per: number;
};

type RouteParams = { id: string };
type SearchParams = { type?: string };

export default async function FreightInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  // invoiceF.php L6-10 — a logged-out visitor is redirected to /login.
  const { profile } = await requireAuth();
  const { id } = await params;
  const sp = await searchParams;

  // invoiceF.php L11: `if(isset($_GET['id']))`. The dynamic segment
  // value comes in URL-decoded (Next.js handles %2C → ',').
  if (!id || id === "") notFound();

  // $userID — the customer's member code ("PR<n>" === tb_*.userid).
  const userID = profile?.member_code ?? "";

  // invoiceF.php L39-43 — $arrID = explode(",", $_GET['id']);
  const arrID = id.split(",").filter((s) => s !== "");
  const dataTitle = arrID.join(", ");
  void dataTitle; // legacy uses it only in <title>; Next sets <title> elsewhere

  // invoiceF.php L14-16 — $nameDocs branches on ?type but BOTH
  // branches assign '<br/>' — read with no visible effect (1:1).
  void sp.type;

  const admin = createAdminClient();

  // ── Build one ReceiptDoc per rID (invoiceF.php L44-484) ──
  const docs: ReceiptDoc[] = [];

  for (const ID of arrID) {
    // $sql — invoiceF.php L46-52: tb_receipt ⋈ tb_users ⋈
    // tb_corporate WHERE rID. PostgREST cannot express the multi-table
    // join in one select, so it is the same sequence of lookups the
    // PHP effectively does.
    const { data: receipt, error: receiptErr } = await admin
      .from("tb_receipt")
      .select("rdate, userid")
      .eq("rid", ID)
      .maybeSingle<{ rdate: string | null; userid: string }>();
    if (receiptErr) {
      console.error(`[tb_receipt list] failed`, { code: receiptErr.code, message: receiptErr.message });
    }

    // invoiceF.php L53: `if ($result->num_rows > 0)` — skip a
    // receipt id that does not exist.
    if (!receipt) continue;

    // FAITHFUL ownership gate — invoiceF.php scopes the print to the
    // cookie owner ($_COOKIE['pcs_userID']); a customer must only ever
    // print their OWN receipt. Skip a receipt owned by someone else
    // (the legacy relies on the link only being shown to its owner;
    // the Pacred port enforces it server-side).
    if (receipt.userid !== userID) continue;

    const { data: userRow, error: userRowErr } = await admin
      .from("tb_users")
      .select("username, userlastname")
      .eq("userid", receipt.userid)
      .maybeSingle<{ username: string | null; userlastname: string | null }>();
    if (userRowErr) {
      console.error(`[tb_users list] failed`, { code: userRowErr.code, message: userRowErr.message });
    }

    const { data: corpRow, error: corpRowErr } = await admin
      .from("tb_corporate")
      .select("corporatename, corporatenumber, corporateaddress")
      .eq("userid", receipt.userid)
      .maybeSingle<{
        corporatename: string | null;
        corporatenumber: string | null;
        corporateaddress: string | null;
      }>();
    if (corpRowErr) {
      console.error(`[tb_corporate list] failed`, { code: corpRowErr.code, message: corpRowErr.message });
    }

    const rowMain: ReceiptRow = {
      rdate: receipt.rdate,
      userid: receipt.userid,
      corporatename: corpRow?.corporatename ?? "",
      corporatenumber: corpRow?.corporatenumber ?? "",
      corporateaddress: corpRow?.corporateaddress ?? "",
      username: userRow?.username ?? "",
      userlastname: userRow?.userlastname ?? "",
      recompnumber: "",
      recompname: "",
      recompaddress: "",
    };
    // invoiceF.php SELECTs reCompNumber / reCompName / reCompAddress
    // from tb_receipt — fetch them (the receipt-level company override).
    const { data: reComp, error: reCompErr } = await admin
      .from("tb_receipt")
      .select("recompnumber, recompname, recompaddress")
      .eq("rid", ID)
      .maybeSingle<{
        recompnumber: string | null;
        recompname: string | null;
        recompaddress: string | null;
      }>();
    if (reCompErr) {
      console.error(`[tb_receipt list] failed`, { code: reCompErr.code, message: reCompErr.message });
    }
    rowMain.recompnumber = reComp?.recompnumber ?? "";
    rowMain.recompname = reComp?.recompname ?? "";
    rowMain.recompaddress = reComp?.recompaddress ?? "";

    const dateCreate = fmtDate(rowMain.rdate);

    // invoiceF.php L58 — the render-time UPDATE statusPrint='1' is
    // DEFERRED (a render is a pure read; see the file header FLAG).
    // TODO(server-action): port to actions/*.ts when reviewed by เดฟ.

    // ── Customer-name resolution — invoiceF.php L62-114 ──
    let fName = `${rowMain.userid} ${rowMain.corporatename}`;
    let reCorporate: number;

    if (rowMain.corporatenumber === "") {
      // not a tb_corporate customer (invoiceF.php L68-93)
      if (rowMain.recompname === "") {
        // invoiceF.php L70-74 — the PCS415 hardcode (rebranded PR415)
        if (rowMain.userid === "PR415") {
          rowMain.corporatename = "พีรวันติ์ ติระจารุอนันต์";
          rowMain.corporatenumber = "-";
          rowMain.corporateaddress =
            "222/1 หมู่4 หมู่บ้านลัดดาลม อีลี่ แกรนต์ ตำบล/แขวง บางขุนกอง อำเภอ/เขต บางกรวย จังหวัด นนทบุรี 11130";
        }
        // invoiceF.php L76-82 — fall back to the main address.
        const { data: addrRow, error: addrRowErr } = await admin
          .from("tb_address_main")
          .select("addressid")
          .eq("userid", rowMain.userid)
          .maybeSingle<{ addressid: number }>();
        if (addrRowErr) {
          console.error(`[tb_address_main list] failed`, { code: addrRowErr.code, message: addrRowErr.message });
        }
        let fullAddress = "";
        if (addrRow?.addressid != null) {
          const { data: addr, error: addrErr } = await admin
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
          if (addrErr) {
            console.error(`[tb_address list] failed`, { code: addrErr.code, message: addrErr.message });
          }
          if (addr) {
            // CONCAT(addressNo,' ตำบล/แขวง ',…) — invoiceF.php L76.
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
        // invoiceF.php L83-92 — use the receipt-level reComp* override.
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

    // invoiceF.php L97-101 — a spacer <br> when the address is short.
    const addressBR = (rowMain.corporateaddress ?? "").length <= 230;

    // invoiceF.php L102-113 — three more PCS member-code hardcodes
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

    // invoiceF.php L116-121 — the WHT-1% defaults.
    // $textPer1 starts hidden (white) for a personal receipt; for a
    // corporate-name receipt it is SHOWN (invoiceF.php L119-121).
    let textPer1 =
      reCorporate === 1
        ? '<div>LESS WITHHOLDING TAX 1%</div>'
        : '<div style="color: #fff;">LESS WITHHOLDING TAX 1%</div>';
    let pricPer1Visible = false;

    // ── $sql_item — tb_receipt_item ⋈ tb_forwarder ⋈ tb_wallet_hs ──
    // invoiceF.php L124-130. GROUP BY f.ID; tb_wallet_hs join
    // (status=2, type<>5) pulls `amount` — the slip amount actually
    // paid for each forwarder line.
    const { data: itemLinks, error: itemLinksErr } = await admin
      .from("tb_receipt_item")
      .select("fid")
      .eq("rid", ID);
    if (itemLinksErr) {
      console.error(`[tb_receipt_item list] failed`, { code: itemLinksErr.code, message: itemLinksErr.message });
    }
    const fIds = Array.from(
      new Set(((itemLinks ?? []) as { fid: number }[]).map((r) => r.fid)),
    );

    const rows: ForwarderItemRow[] = [];
    if (fIds.length > 0) {
      const { data: fRows, error: fRowsErr } = await admin
        .from("tb_forwarder")
        .select(
          "id, fpriceupdate, fshippingservice, ftransportpricechnthb, pricecrate, priceother, fdiscount, ftotalprice, ftransportprice, famount, fvolume, fweight, ftrackingchn, userid",
        )
        .in("id", fIds);
      if (fRowsErr) {
        console.error(`[tb_forwarder list] failed`, { code: fRowsErr.code, message: fRowsErr.message });
      }

      const { data: walletRows, error: walletRowsErr } = await admin
        .from("tb_wallet_hs")
        .select("reforder, amount, status, type, userid")
        .in("reforder", fIds.map((n) => String(n)))
        .eq("status", "2");
      if (walletRowsErr) {
        console.error(`[tb_wallet_hs list] failed`, { code: walletRowsErr.code, message: walletRowsErr.message });
      }

      const walletByRef = new Map<string, number>();
      for (const w of (walletRows ?? []) as {
        reforder: string;
        amount: number;
        type: string;
      }[]) {
        // type<>5 — invoiceF.php L129.
        if (w.type === "5") continue;
        if (!walletByRef.has(w.reforder)) {
          walletByRef.set(w.reforder, Number(w.amount) || 0);
        }
      }

      for (const f of (fRows ?? []) as ({
        id: number;
        userid: string;
      } & Omit<ForwarderItemRow, "fid" | "amount">)[]) {
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

    // ── Rollup totals — invoiceF.php L354-373 ──
    let amountPayAll = 0;
    let fTotalPriceAll = 0;
    let fDiscountAll = 0;
    let fTransportPriceCHNTHBAll = 0;
    let fTransportPriceTHBAll = 0;
    let priceOtherBillAll = 0;
    let totalPriceAll = 0;
    for (const r of rows) {
      // $totalPrice — invoiceF.php L355.
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

    // ── WHT-1% — invoiceF.php L376-390 ──
    // KEY DIFFERENCE vs printReceiptF.php: the gate is `$ReCorporate==0`
    // (PERSONAL receipts), not `==1` (CORPORATE). The threshold is
    // `diff0(amountPayAll2, amountPayAll) <= 1` (1 baht), not <=1200.
    // Also: invoiceF.php does NOT number_format-round totalPriceAll
    // before the WHT maths (printReceiptF.php does).
    let dis1per = 0;
    let pricPer1Value = 0;
    if (reCorporate === 0) {
      dis1per = totalPriceAll * 0.01;
      const amountPayAll2 = Number((totalPriceAll - dis1per).toFixed(2));
      if (diff0(totalPriceAll, amountPayAll) === 0) {
        // exact-paid → no WHT line.
        textPer1 = "";
        dis1per = 0;
      } else if (diff0(amountPayAll2, amountPayAll) <= 1) {
        // WHT 1% withheld (1-baht tolerance).
        textPer1 = '<div>LESS WITHHOLDING TAX 1%</div>';
        pricPer1Visible = true;
        pricPer1Value = dis1per;
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
 * Renders one receipt as one-or-more print pages — invoiceF.php
 * L347-478 paginates the item rows 13-per-page; the bilingual header
 * repeats on every page and the footer summary block renders only on
 * the LAST page.
 */
function ReceiptDocPages({ doc }: { doc: ReceiptDoc }) {
  // invoiceF.php L347-351 — $pageAll = ceil(rows / 13).
  const pageAll = Math.max(1, Math.ceil(doc.rows.length / ROWS_PER_PAGE));
  const pages: React.ReactElement[] = [];

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

/** A single A4 receipt page — invoiceF.php $bodyHeader + the item
 *  rows + ($page==$pageAll ? the footer). */
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
      {/* invoiceF.php L261 — <table class="table"> */}
      <table className="table">
        {/* ── Logo + company + document-title band — L262-278 ── */}
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
              <h3>Pacred (Thailand) Co., Ltd.</h3>
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

        {/* ── Issuer block — invoiceF.php L279-308 ── */}
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
              <div>{TAX_ID}</div>
              {/* Pacred address — wired from components/seo/site.ts
                  ADDRESSES.office (SOT). The legacy PHP 2025-03-20
                  cutover between two PCS Cargo addresses collapses
                  to one value under D1 (single company, single address). */}
              <div>{ADDRESSES.office.full}</div>
              <div>{CONTACT.phoneCompanyDisplay}</div>
            </th>
            <th colSpan={1} className="text-right v-a-t">
              <div>วันที่ / date : </div>
              <div>หน้า / page : </div>
            </th>
            <th colSpan={1} className="text-left v-a-t">
              <div>{doc.dateCreate}</div>
              {/* invoiceF.php replaces "pagebillpage" token with
                  $page."/".$pageAll. */}
              <div>{pageName}</div>
            </th>
          </tr>
          <tr className="">
            <th colSpan={7}>
              <hr />
            </th>
          </tr>
          {/* ── Customer block — invoiceF.php L309-323 ── */}
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
                {/* invoiceF.php L99 — the white-dot spacer line when
                    the address is short. */}
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

        {/* ── Item-table head — invoiceF.php L325-335 ── */}
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

        {/* ── Item rows — invoiceF.php L366-374 ── */}
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

      {/* ── Footer summary — invoiceF.php L397-461, last page only ── */}
      {isLast ? <ReceiptFooter doc={doc} /> : null}
    </article>
  );
}

/**
 * The fixed-bottom receipt footer — invoiceF.php L397-461.
 * Renders only on the last page; carries the price summary, the
 * payment-method checkboxes, the Thai baht-text total, and the
 * issuer / approver / stamp / customer signature row.
 */
function ReceiptFooter({ doc }: { doc: ReceiptDoc }) {
  // invoiceF.php L392-393 — the bank-transfer line.
  const grandTotal = doc.totalPriceAll - doc.dis1per;
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
              {/* $textPay — invoiceF.php L392-393 */}
              <div>
                <input
                  type="checkbox"
                  style={{ fontSize: "20px" }}
                  defaultChecked
                />{" "}
                โอนเข้าธนาคาร <b>{BANK.name}</b> เลขที่ <b>{BANK.accountNumber}</b> วันที่{" "}
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
              {/* $textPer1 — the WHT-1% line; invoiceF.php builds it
                  as an HTML fragment. It is one of:
                  '' · '<div>LESS WITHHOLDING TAX 1%</div>' ·
                  '<div style="color:#fff;">…</div>' (the white/hidden
                  default for a corporate receipt). Rendered 1:1. */}
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

// issuerAddress() retired 2026-05-23: under D1 we're one company (Pacred)
// with one address (components/seo/site.ts ADDRESSES.office — SOT). The
// PHP 2025-03-20 cutover between two PCS Cargo addresses doesn't apply.
// Address is now rendered inline via {ADDRESSES.office.full}.
