/**
 * Admin > "ใบเสร็จรับเงิน" — print page (FAITHFUL PORT)
 *
 * Wave 29 P0 #3 · 2026-05-29.
 * v3 — 2026-06-09 ภูม flag round 3: literal port of Peak Account HTML structure.
 * v4 — 2026-06-10 ภูม flag round 8 (point 4): the receipt RENDER + the data-load
 *      + money math were extracted into shared modules so the admin page AND the
 *      new login-free public page (`/r/[token]`) render byte-identically:
 *        - render → `components/receipt/receipt-paper.tsx`
 *        - data   → `lib/receipt/load-receipt-document.ts`
 *      This file is now a thin admin shell: auth-gate · breadcrumb · header ·
 *      print/backfill actions · then <ReceiptPaper>. The ONLY behavioural change
 *      vs v3 is the QR target — it now points at the PUBLIC `/r/{token}` URL so a
 *      customer who scans the printed paper can open it (was the admin URL, which
 *      bounced them to /login).
 */

import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { SITE_URL } from "@/components/seo/site";
import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { loadReceiptDocument, fmtDateLegacy } from "@/lib/receipt/load-receipt-document";
import { signReceiptToken } from "@/lib/receipt/receipt-token";
import PrintButton from "./print-button";
import BackfillItemsButton from "./backfill-items-button";

export const dynamic = "force-dynamic";

export default async function ForwarderInvoicePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ copy?: string }>;
}) {
  // Phase 2 ops-workflow audit unlock 2026-06-05 — Doc roles view + print
  // receipts (`docs/research/ops-workflow-audit-2026-06-05.md` §28).
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);

  const { id } = await params;
  // `?copy=0` → พิมพ์ ต้นฉบับ อย่างเดียว (the "พิมพ์ใบเสร็จ ต้นฉบับ" button).
  // absent / any other value → ต้นฉบับ + สำเนา (legacy default · 2 sides).
  const withCopy = (await searchParams).copy !== "0";
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0) notFound();

  const doc = await loadReceiptDocument(numId);
  if (!doc) notFound();

  const { receipt } = doc;
  const { issueDate, documentIssuer } = doc.commonProps;

  // Peak's "สแกนเพื่อเปิดด้วยเว็บไซต์" QR. 2026-06-10 ภูม flag round 8 (point 4):
  // REPOINTED from the admin URL (which forced a customer to /login) to the
  // login-free PUBLIC page `/r/{token}` — an unguessable HMAC capability link
  // (lib/receipt/receipt-token.ts) so the customer who scans the printed paper
  // opens their own receipt directly, while the id stays non-enumerable.
  const qrDataUrl = await QRCode.toDataURL(
    `${SITE_URL}/r/${signReceiptToken(receipt.id)}`,
    {
      width:  160,
      margin: 0,
      color:  { dark: "#111827", light: "#FFFFFF" },
    },
  );

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* ── Breadcrumb + actions (hidden on print) ── */}
        <div className="no-print">
          {/* 2026-05-30 ภูม flagged #7: was "ใบแจ้งหนี้ ฝากนำเข้า" —
              this page renders ใบเสร็จ (receipt) per Wave 29 pivot. */}
          <nav className="text-sm text-slate-500 mb-3">
            <Link href="/admin" className="hover:text-indigo-700">หน้าแรก</Link>
            <span className="mx-1">/</span>
            <Link href="/admin/accounting" className="hover:text-indigo-700">บัญชี</Link>
            <span className="mx-1">/</span>
            <Link href="/admin/accounting/forwarder-invoice" className="hover:text-indigo-700">
              ใบเสร็จ ฝากนำเข้า
            </Link>
            <span className="mx-1">/</span>
            <span className="text-slate-700">{receipt.rid}</span>
          </nav>

          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                ใบเสร็จรับเงิน {receipt.rid}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                ออกเมื่อ {issueDate} โดย {documentIssuer}
                {receipt.statusprint === "1" && receipt.rdateprint && (
                  <> · พิมพ์ล่าสุด {fmtDateLegacy(receipt.rdateprint)} (โดย {receipt.adminidprint || "-"})</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/accounting/forwarder-invoice"
                className="text-sm text-slate-600 hover:text-indigo-700"
              >
                ← กลับไปรายการ
              </Link>
              <PrintButton receiptId={receipt.id}>
                <Printer className="size-4" />
                พิมพ์ใบเสร็จ
              </PrintButton>
            </div>
          </div>

          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <b>ตัวอย่างก่อนพิมพ์</b> — ใบเสร็จจะออกมา{" "}
            <b>{withCopy ? "ต้นฉบับ + สำเนา" : "ต้นฉบับ อย่างเดียว"}</b> เมื่อกดพิมพ์ ·
            กดปุ่ม &ldquo;พิมพ์ใบเสร็จ&rdquo; ด้านบนเพื่อบันทึกสถานะ <code>statusPrint=1</code> และเปิดหน้าต่างพิมพ์
            <br />
            <b className="mt-1 inline-block">หน้าต่างพิมพ์ Chrome:</b> ตั้ง <b>&ldquo;More settings → Headers and footers: ปิด&rdquo;</b> +
            <b>&ldquo;Margins: None&rdquo;</b> เพื่อตัดวันที่/URL/เลขหน้าของ browser ออกจากเอกสาร
          </div>

          {/* 2026-05-31 sitting-H-fix #4 (ภูม): data-gap banner.
              Shows ONLY on screen (not print). Surfaces the missing
              tb_receipt_item case so staff don't print a "blank" receipt
              without knowing the breakdown is reconstructed from header.

              2026-06-02 sitting Wave A (ภูม flag #1): added the
              <BackfillItemsButton> recovery hook — staff can trigger
              the wallet_hs + fdatestatus5 trail rebuild from this banner
              instead of opening a SQL editor. */}
          {doc.itemsMissing && (
            <div className="mb-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-900">
              <b>⚠️ รายการพัสดุไม่พบใน tb_receipt_item</b> — ระบบจึงดึงยอดรวมจาก
              <code className="mx-1 px-1 bg-rose-100 rounded">tb_receipt.totalbeforewithholding</code>
              + <code className="mx-1 px-1 bg-rose-100 rounded">tb_receipt.ramount</code>
              มาแสดงในแถว Total / WHT / Total Amount แทน (รายละเอียดต่อ leg ขนส่งจีน-ไทย
              แสดงเป็น 0 เพราะไม่มี source).<br />
              <span className="text-rose-700 mt-1 inline-block">
                สาเหตุที่เป็นไปได้: (1) Wave 28 PR-format pollution ·
                (2) legacy migration ที่ tb_receipt_item ไม่ได้ port มาด้วย ·
                (3) Wave 29 manual-create flow มี bug ตอน batch INSERT items.
                ดูเพิ่ม <code>docs/runbook/wave-29-tb-receipt-pollution-audit.md</code>
                หรือ query <code>tb_receipt_item WHERE rid=&lsquo;{receipt.rid}&rsquo;</code> ก่อน reprint.
              </span>
              <div className="mt-2 flex items-start gap-2">
                <BackfillItemsButton receiptId={receipt.id} />
                <span className="text-rose-700 text-[11px] mt-1.5 inline-block">
                  ลองดึงรายการจาก <code>tb_wallet_hs</code> (±7 วัน) +{" "}
                  <code>tb_forwarder.fdatestatus5</code> (±14 วัน) ที่ยอดรวมเท่ากัน ·
                  ถ้าหลายชุดเข้ากันได้ ระบบจะให้เลือกเอง
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── 2-side document — Originals first, then Copies ──
            Legacy printReceipt.php does the same: mPDF AddPage loop for
            ต้นฉบับ, then a second loop for สำเนา. Each side gets its own
            page-count (1/N, 2/N, ..., N/N), totalling 2N printed pages.
        */}
        <ReceiptPaper pages={doc.pages} qrDataUrl={qrDataUrl} withCopy={withCopy} {...doc.commonProps} />
      </div>
    </div>
  );
}
