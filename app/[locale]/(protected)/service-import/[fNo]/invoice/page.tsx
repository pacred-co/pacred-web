import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/print-button";
import { CONTACT, ADDRESSES, TAX_ID } from "@/components/seo/site";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { getSalesRepContactForUserid } from "@/lib/admin/sales-rep-contact";
import { PayFromWalletButton } from "../pay-from-wallet-button";

/**
 * Customer-side ใบแจ้งหนี้ (invoice) view —
 *   route: `/service-import/[fNo]/invoice`
 *
 * Wave 27 / E2E LOOP FIX gap #5 — when admin clicks "callPriceUser"
 * (`actions/admin/forwarder-check.ts:adminCallPriceUser`), the customer
 * SMS now carries a link to THIS page so they can see their bill
 * before paying.
 *
 * ── Workflow logic source ─────────────────────────────────────────
 * Legacy `member/pcs-admin/include/pages/hs-forwarder-invoice/
 * listForwarderItem.php` is the read-only customer view of a
 * tb_receipt joined with its tb_receipt_item rows pointing back at
 * tb_forwarder. Pacred uses our own Tailwind chrome (per AGENTS.md §0a:
 * legacy workflow + Pacred design). Faithful first principles:
 *   - read tb_receipt by `refid = <forwarder.id>` (the join key the
 *     legacy uses to link an invoice number to its source forwarder
 *     order)
 *   - ownership gate: tb_forwarder.userid must equal current
 *     profile.member_code
 *   - if no tb_receipt yet → friendly "ยังไม่ออก" banner with the
 *     assigned sales rep contact (resolved via tb_users.adminidsale)
 *   - if tb_receipt exists → render invoice header + items + total
 *     + print + pay-from-wallet buttons
 *
 * ── §0c ───────────────────────────────────────────────────────────
 * Every Supabase query destructures `error` + logs + throws on the
 * read path. A transient PgBouncer timeout must surface as 500 not a
 * silent 404 — per `docs/learnings/verify-deep-flow.md`.
 */

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function numberFormat2(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d.replace(" ", "T"));
  if (Number.isNaN(dt.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

// tb_receipt.rstatus encoding (legacy):
//   '1' = ออกแล้ว / paid · '2' = cancelled · '3' = pending (default)
function statusBadge(rstatus: string | null) {
  if (rstatus === "1") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-bold text-green-800">
        ชำระแล้ว / Paid
      </span>
    );
  }
  if (rstatus === "2") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-bold text-red-800">
        ยกเลิก / Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
      รอชำระเงิน / Pending
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────────────────────────

type ForwarderRowLite = {
  id:                     number;
  userid:                 string | null;
  fstatus:                string | null;
  ftrackingchn:           string | null;
  fdate:                  string | null;
  fweight:                number | string | null;
  fvolume:                number | string | null;
  famount:                number | string | null;
  ftotalprice:            number | string | null;
  ftransportprice:        number | string | null;
  fpriceupdate:           number | string | null;
  fshippingservice:       number | string | null;
  pricecrate:             number | string | null;
  ftransportpricechnthb:  number | string | null;
  priceother:             number | string | null;
  fdiscount:              number | string | null;
  fusercompany:           string | null;
};

type ReceiptRow = {
  id:                     number;
  rid:                    string;
  refid:                  string;
  rstatus:                string | null;
  rdatecreate:            string | null;
  rdate:                  string | null;
  issuedate:              string | null;
  ramount:                number | string | null;
  totalbeforewithholding: number | string | null;
  userid:                 string | null;
  recompnumber:           string | null;
  recompname:             string | null;
  recompaddress:          string | null;
  corporatetype:          string | null;
};

type ReceiptItemRow = {
  rid:                    string;
  fid:                    number;
};

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────

export default async function ServiceImportInvoicePage({
  params,
}: {
  params: Promise<{ fNo: string }>;
}) {
  const { fNo } = await params;
  const { profile } = await requireAuth();
  if (!profile) redirect("/complete-profile");

  const memberCode = profile.member_code ?? "";
  if (!memberCode) notFound();

  // Sanitise the URL segment the same way the legacy does.
  const idClean = fNo.replace(/[^a-z\d]/gi, "");
  const idNum = Number(idClean);
  if (!Number.isFinite(idNum) || idNum <= 0) notFound();

  const admin = createAdminClient();

  // ── 1. Read the forwarder row + ownership gate ──────────────────
  const { data: forwarder, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, userid, fstatus, ftrackingchn, fdate, fweight, fvolume, famount, " +
      "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
      "pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany",
    )
    .eq("id", idNum)
    .maybeSingle<ForwarderRowLite>();
  if (fwdErr) {
    console.error(`[invoice/[fNo] tb_forwarder lookup] failed`, {
      code: fwdErr.code, message: fwdErr.message, fNo: idNum, memberCode,
    });
    throw new Error(`Failed to load tb_forwarder (${fwdErr.code}): ${fwdErr.message}`);
  }
  if (!forwarder || (forwarder.userid ?? "") !== memberCode) notFound();

  const fStatus = forwarder.fstatus ?? "";
  const customerOwnerUserid = forwarder.userid ?? memberCode;

  // ── 2. Look up tb_receipt by refid → tb_receipt_item.fid → tb_forwarder.id ──
  // Per Agent F3 brief (admin invoice) — invoice schema joins:
  //   tb_receipt_item.fid → tb_forwarder.id (this row)
  //   tb_receipt_item.rid → tb_receipt.rid
  // First find the linking row, then load tb_receipt.
  const { data: itemLink, error: itemLinkErr } = await admin
    .from("tb_receipt_item")
    .select("rid, fid")
    .eq("fid", idNum)
    .maybeSingle<ReceiptItemRow>();
  if (itemLinkErr) {
    console.error(`[invoice/[fNo] tb_receipt_item lookup] failed`, {
      code: itemLinkErr.code, message: itemLinkErr.message, fid: idNum,
    });
    throw new Error(`Failed to load tb_receipt_item (${itemLinkErr.code}): ${itemLinkErr.message}`);
  }

  let receipt: ReceiptRow | null = null;
  let receiptItems: Array<ForwarderRowLite & { _amountThb: number }> = [];

  if (itemLink?.rid) {
    const { data: r, error: rErr } = await admin
      .from("tb_receipt")
      .select(
        "id, rid, refid, rstatus, rdatecreate, rdate, issuedate, " +
        "ramount, totalbeforewithholding, userid, recompnumber, recompname, " +
        "recompaddress, corporatetype",
      )
      .eq("rid", itemLink.rid)
      .maybeSingle<ReceiptRow>();
    if (rErr) {
      console.error(`[invoice/[fNo] tb_receipt lookup] failed`, {
        code: rErr.code, message: rErr.message, rid: itemLink.rid,
      });
      throw new Error(`Failed to load tb_receipt (${rErr.code}): ${rErr.message}`);
    }
    if (r) {
      // Second ownership gate — a receipt's userid MUST match the
      // forwarder's userid (it's the same customer).
      if ((r.userid ?? "") !== customerOwnerUserid) {
        console.warn("[invoice/[fNo]] receipt userid mismatch — refusing", {
          fid: idNum, customer: customerOwnerUserid, receiptOwner: r.userid,
        });
        notFound();
      }
      receipt = r;

      // All items linked to this receipt = every tb_forwarder row
      // whose id appears in tb_receipt_item.fid for this rid.
      const { data: allLinks, error: allLinksErr } = await admin
        .from("tb_receipt_item")
        .select("rid, fid")
        .eq("rid", itemLink.rid);
      if (allLinksErr) {
        console.error(`[invoice/[fNo] tb_receipt_item siblings] failed`, {
          code: allLinksErr.code, message: allLinksErr.message, rid: itemLink.rid,
        });
        throw new Error(`Failed to load tb_receipt_item siblings (${allLinksErr.code}): ${allLinksErr.message}`);
      }
      const fids = ((allLinks ?? []) as ReceiptItemRow[]).map((l) => l.fid);
      if (fids.length > 0) {
        const { data: fRows, error: fRowsErr } = await admin
          .from("tb_forwarder")
          .select(
            "id, userid, fstatus, ftrackingchn, fdate, fweight, fvolume, famount, " +
            "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
            "pricecrate, ftransportpricechnthb, priceother, fdiscount, fusercompany",
          )
          .in("id", fids);
        if (fRowsErr) {
          console.error(`[invoice/[fNo] tb_forwarder siblings] failed`, {
            code: fRowsErr.code, message: fRowsErr.message, fids,
          });
          throw new Error(`Failed to load tb_forwarder siblings (${fRowsErr.code}): ${fRowsErr.message}`);
        }
        receiptItems = ((fRows ?? []) as unknown as ForwarderRowLite[]).map((row) => ({
          ...row,
          _amountThb: calcForwarderOutstanding(row),
        }));
      }
    }
  }

  // ── 3. Customer block — name + address (from tb_users / tb_corporate) ──
  const { data: userRow, error: userRowErr } = await admin
    .from("tb_users")
    .select("userName, userLastName, userTel, userEmail, userCompany")
    .eq("userID", customerOwnerUserid)
    .maybeSingle<{
      userName:     string | null;
      userLastName: string | null;
      userTel:      string | null;
      userEmail:    string | null;
      userCompany:  string | null;
    }>();
  if (userRowErr) {
    console.error(`[invoice/[fNo] tb_users lookup] failed`, {
      code: userRowErr.code, message: userRowErr.message, userid: customerOwnerUserid,
    });
  }

  let custName  = `${userRow?.userName ?? ""} ${userRow?.userLastName ?? ""}`.trim();
  let custTaxId = "";
  let custAddr  = "";

  // tb_receipt carries the receipt-level company override — if it's
  // a corporate-name receipt prefer those values (the legacy 'reComp*'
  // override pattern · see printReceiptF.php L83-92).
  if (receipt) {
    if ((receipt.recompname ?? "").trim() !== "") {
      custName = receipt.recompname!.trim();
    }
    if ((receipt.recompnumber ?? "").trim() !== "") {
      custTaxId = receipt.recompnumber!.trim();
    }
    if ((receipt.recompaddress ?? "").trim() !== "") {
      custAddr = receipt.recompaddress!.trim();
    }
  }

  // Fallback for non-override: pull tb_corporate when the user is a
  // company (usercompany='1').
  if ((!custTaxId || !custAddr) && userRow?.userCompany === "1") {
    const { data: corp, error: corpErr } = await admin
      .from("tb_corporate")
      .select("corporatename, corporatenumber, corporateaddress")
      .eq("userid", customerOwnerUserid)
      .maybeSingle<{
        corporatename:    string | null;
        corporatenumber:  string | null;
        corporateaddress: string | null;
      }>();
    if (corpErr) {
      console.error(`[invoice/[fNo] tb_corporate lookup] failed`, {
        code: corpErr.code, message: corpErr.message,
      });
    }
    if (corp) {
      if (!custName  && corp.corporatename)   custName = corp.corporatename;
      if (!custTaxId && corp.corporatenumber) custTaxId = corp.corporatenumber;
      if (!custAddr  && corp.corporateaddress) custAddr = corp.corporateaddress;
    }
  }

  // ── 4. Sales rep fallback contact (only when no receipt yet) ────
  const salesRep = !receipt
    ? await getSalesRepContactForUserid(customerOwnerUserid)
    : null;

  // ── 5. Wallet balance — only relevant if receipt exists + pending ──
  const receiptPending = receipt && receipt.rstatus !== "1" && receipt.rstatus !== "2";
  let walletBalance: number | null = null;
  if (receiptPending) {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.error(`[invoice/[fNo] auth.getUser] failed`, {
        message: authErr.message,
      });
    }
    if (user) {
      const { data: wallet, error: walletErr } = await admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", memberCode)
        .maybeSingle<{ wallettotal: number }>();
      if (walletErr) {
        console.error(`[invoice/[fNo] tb_wallet lookup] failed`, {
          code: walletErr.code, message: walletErr.message,
        });
      }
      walletBalance = Number(wallet?.wallettotal ?? 0);
    }
  }

  // ── 6. Totals — items rollup, fallback to current forwarder calc ──
  const itemsTotal = receiptItems.length > 0
    ? receiptItems.reduce((sum, r) => sum + r._amountThb, 0)
    : 0;
  const totalBeforeWh = Number(receipt?.totalbeforewithholding ?? itemsTotal);
  const rAmount       = Number(receipt?.ramount ?? itemsTotal);
  // grandTotal = ยอดที่ลูกค้าต้องชำระ (after withholding tax cut).
  const grandTotal    = receipt ? rAmount : calcForwarderOutstanding(forwarder);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Print-only CSS — hide chrome on @media print. */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .invoice-card { box-shadow: none !important; border: 1px solid #000 !important; }
        }
        @page { size: A4; margin: 1.5cm; }
      `}</style>

      <main className="mx-auto w-full max-w-[900px] px-4 py-6 sm:py-8 space-y-4">
        {/* Breadcrumb + back */}
        <div className="no-print flex items-center justify-between gap-3 flex-wrap">
          <nav className="text-xs text-slate-600">
            <Link href="/dashboard" className="hover:text-primary-600">หน้าแรก</Link>
            <span className="mx-2">/</span>
            <Link href="/service-import" className="hover:text-primary-600">รายการฝากนำเข้า</Link>
            <span className="mx-2">/</span>
            <Link href={`/service-import/${idNum}`} className="hover:text-primary-600">#{idNum}</Link>
            <span className="mx-2">/</span>
            <span className="font-medium text-slate-900">ใบแจ้งหนี้</span>
          </nav>
          <Link
            href={`/service-import/${idNum}`}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ← กลับ
          </Link>
        </div>

        {/* ──── NO RECEIPT YET — fallback banner ──── */}
        {!receipt && (
          <section className="invoice-card rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 shadow-sm space-y-3">
            <h1 className="text-xl font-bold text-amber-900">
              ใบแจ้งหนี้ยังไม่ออก
            </h1>
            <p className="text-sm text-amber-900">
              ขณะนี้ยังไม่ได้ออกใบแจ้งหนี้สำหรับรายการ <span className="font-mono font-bold">#{idNum}</span>
              {forwarder.ftrackingchn && (
                <> (เลขแทรคกิ้ง <span className="font-mono">{forwarder.ftrackingchn}</span>)</>
              )}
            </p>
            <div className="rounded-lg border border-amber-300 bg-white p-4 text-sm space-y-1">
              <p className="font-semibold text-amber-900">
                สถานะปัจจุบัน:{" "}
                <span className="font-normal">
                  {fStatusLabel(fStatus)}
                </span>
              </p>
              <p className="text-amber-800 text-xs">
                ใบแจ้งหนี้จะออกหลังเจ้าหน้าที่ตรวจสอบและคำนวณค่าขนส่งเสร็จ (สถานะ "รอชำระเงิน")
              </p>
            </div>

            {/* Sales rep contact card */}
            {salesRep && (
              <div className="rounded-xl border border-amber-300 bg-white p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-600">
                  {salesRep.isAssigned ? "เซลล์ผู้ดูแลของท่าน" : "ติดต่อทีมงาน Pacred"}
                </p>
                <p className="text-base font-bold text-slate-900">{salesRep.name}</p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <a
                    href={`tel:${salesRep.phone}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-white font-medium hover:bg-primary-700"
                  >
                    📞 โทร {salesRep.phoneDisplay}
                  </a>
                  {salesRep.email && (
                    <a
                      href={`mailto:${salesRep.email}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
                    >
                      ✉️ {salesRep.email}
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ──── RECEIPT EXISTS — full invoice ──── */}
        {receipt && (
          <>
            {/* Action bar — hidden on print */}
            <div className="no-print flex flex-wrap items-center justify-end gap-2">
              <PrintButton label="📄 พิมพ์ / บันทึก PDF" />
              {receiptPending && walletBalance !== null && grandTotal > 0 && (
                <PayFromWalletButton
                  fNo={String(idNum)}
                  totalThb={grandTotal}
                  walletBalance={walletBalance}
                />
              )}
            </div>

            <article className="invoice-card rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              {/* Header band */}
              <div className="bg-gradient-to-r from-primary-50 to-white border-b border-slate-200 p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    {/* Wave 28 fix (2026-05-29 · ภูม flagged "ชื่อบริษัทคือ Pacred.co.th แก้ไขด้วย"):
                        full legal company name promoted to <h1> (was brand only "Pacred"). */}
                    <h1 className="text-2xl font-black text-primary-700">Pacred (Thailand) Co., Ltd.</h1>
                    <p className="text-sm font-semibold text-slate-700 mt-0.5">บริษัท แพคเรด (ประเทศไทย) จำกัด</p>
                    <p className="text-xs text-slate-600 mt-1">{ADDRESSES.office.full}</p>
                    <p className="text-xs text-slate-600">
                      เลขผู้เสียภาษี {TAX_ID} · โทร {CONTACT.phoneCompanyDisplay}
                    </p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-slate-900">ใบแจ้งหนี้</h2>
                    <p className="text-xs text-slate-500">INVOICE</p>
                    <p className="font-mono text-lg font-bold text-primary-700 mt-2">{receipt.rid}</p>
                    <p className="text-xs text-slate-600 mt-1">
                      วันที่ออก: {fmtDate(receipt.issuedate ?? receipt.rdatecreate)}
                    </p>
                    <div className="mt-2">{statusBadge(receipt.rstatus)}</div>
                  </div>
                </div>
              </div>

              {/* Customer block */}
              <div className="border-b border-slate-200 p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">ผู้รับใบแจ้งหนี้ / Customer</p>
                  <p className="text-base font-bold text-slate-900 mt-1">
                    {customerOwnerUserid} — {custName || "—"}
                  </p>
                  {custTaxId && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      เลขผู้เสียภาษี: <span className="font-mono">{custTaxId}</span>
                    </p>
                  )}
                  {custAddr && <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{custAddr}</p>}
                  {userRow?.userTel && (
                    <p className="text-xs text-slate-600 mt-0.5">โทร {userRow.userTel}</p>
                  )}
                </div>
                <div className="text-sm sm:text-right">
                  <p className="text-xs font-semibold text-slate-500">อ้างอิงรายการ / Reference</p>
                  <p className="font-mono text-sm mt-1">
                    <Link
                      href={`/service-import/${idNum}`}
                      className="text-primary-600 hover:text-primary-700 no-print"
                    >
                      บริการนำเข้า #{idNum}
                    </Link>
                    <span className="hidden print:inline">บริการนำเข้า #{idNum}</span>
                  </p>
                  {forwarder.ftrackingchn && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      เลขแทรคกิ้ง: <span className="font-mono">{forwarder.ftrackingchn}</span>
                    </p>
                  )}
                  {receipt.rdate && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      ชำระเมื่อ: {fmtDate(receipt.rdate)}
                    </p>
                  )}
                </div>
              </div>

              {/* Items table */}
              <div className="p-6 sm:p-8">
                <p className="text-xs font-semibold text-slate-500 mb-2">รายการ / Items</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700">
                        <th className="border border-slate-300 px-3 py-2 text-left">#</th>
                        <th className="border border-slate-300 px-3 py-2 text-left">รายการ</th>
                        <th className="border border-slate-300 px-3 py-2 text-right">จำนวน</th>
                        <th className="border border-slate-300 px-3 py-2 text-right">น้ำหนัก</th>
                        <th className="border border-slate-300 px-3 py-2 text-right">ปริมาตร</th>
                        <th className="border border-slate-300 px-3 py-2 text-right">ยอด (฿)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(receiptItems.length > 0 ? receiptItems : [{
                        ...forwarder,
                        _amountThb: calcForwarderOutstanding(forwarder),
                      }]).map((r, i) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="border border-slate-200 px-3 py-2">{i + 1}</td>
                          <td className="border border-slate-200 px-3 py-2">
                            <p className="font-medium">บริการนำเข้า #{r.id}</p>
                            {r.ftrackingchn && (
                              <p className="text-xs text-slate-500 font-mono">{r.ftrackingchn}</p>
                            )}
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right">
                            {Number(r.famount ?? 0)} กล่อง
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right">
                            {numberFormat2(Number(r.fweight ?? 0))} kg
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right">
                            {Number(r.fvolume ?? 0).toFixed(3)} cbm
                          </td>
                          <td className="border border-slate-200 px-3 py-2 text-right font-mono font-bold">
                            ฿{numberFormat2(r._amountThb)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals */}
                <div className="mt-4 flex justify-end">
                  <div className="w-full sm:w-80 space-y-1 text-sm">
                    {totalBeforeWh !== rAmount && totalBeforeWh > 0 && (
                      <>
                        <div className="flex justify-between text-slate-700">
                          <span>ยอดก่อนหัก ณ ที่จ่าย</span>
                          <span className="font-mono">฿{numberFormat2(totalBeforeWh)}</span>
                        </div>
                        <div className="flex justify-between text-amber-700">
                          <span>หัก ณ ที่จ่าย</span>
                          <span className="font-mono">−฿{numberFormat2(totalBeforeWh - rAmount)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between border-t-2 border-slate-900 pt-2 mt-1">
                      <span className="font-bold text-slate-900">ยอดรวมที่ต้องชำระ</span>
                      <span className="font-mono font-bold text-lg text-primary-700">
                        ฿{numberFormat2(grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pending hint */}
                {receiptPending && walletBalance !== null && (
                  <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-4 no-print">
                    <p className="text-sm font-semibold text-primary-900">
                      💳 จ่ายจากกระเป๋า Pacred Wallet ของท่าน
                    </p>
                    <p className="text-xs text-primary-800 mt-1">
                      ยอดในกระเป๋า: ฿{numberFormat2(walletBalance)}{" "}
                      {walletBalance < grandTotal && (
                        <>· ขาดอีก ฿{numberFormat2(grandTotal - walletBalance)}{" "}
                          <Link href="/wallet/deposit" className="underline font-medium">เติมเงิน →</Link>
                        </>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-slate-200 bg-slate-50 px-6 sm:px-8 py-4 text-xs text-slate-600 space-y-1">
                <p>• เอกสารนี้ออกโดย Pacred โดยอัตโนมัติจากระบบ — ไม่ต้องเซ็นกำกับ</p>
                <p>• สำหรับสอบถามเพิ่มเติม โทร {CONTACT.phoneCompanyDisplay} / LINE @pacred / {CONTACT.email}</p>
              </div>
            </article>
          </>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Misc helpers
// ─────────────────────────────────────────────────────────────────

function fStatusLabel(fStatus: string): string {
  switch (fStatus) {
    case "1": return "รอสินค้าเข้าโกดังจีน";
    case "2": return "สินค้าถึงโกดังจีน";
    case "3": return "กำลังส่งมาประเทศไทย";
    case "4": return "สินค้าถึงประเทศไทยแล้ว (กำลังตรวจสอบ)";
    case "5": return "รอชำระเงิน";
    case "6": return "เตรียมส่ง";
    case "7": return "ส่งแล้ว";
    default:  return "—";
  }
}
