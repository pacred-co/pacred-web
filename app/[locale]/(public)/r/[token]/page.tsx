/**
 * Public receipt page (ภูม flag round 8 · point 4) — `/r/[token]`.
 *
 * The login-free surface a customer reaches by scanning the QR on their printed
 * ใบเสร็จ. NO auth: the `[token]` is an unguessable HMAC capability link
 * (`{id}-{32hex}`, see `lib/receipt/receipt-token.ts`) so the receipt id stays
 * non-enumerable while the holder of the printed paper can open their own
 * document directly — exactly how Peak exposes a public document.
 *
 * Renders BYTE-IDENTICALLY to the admin print page: same `<ReceiptPaper>`, same
 * money figures from `loadReceiptDocument()`. The only differences here are the
 * absence of admin chrome (no breadcrumb / print-status / backfill banner) and
 * the public "จัดการเอกสาร" toolbar (download / print / fit / login / locale).
 */

import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { SITE_URL } from "@/components/seo/site";
import { ReceiptPaper } from "@/components/receipt/receipt-paper";
import { loadReceiptDocument } from "@/lib/receipt/load-receipt-document";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyReceiptToken } from "@/lib/receipt/receipt-token";
import PublicReceiptToolbar from "./public-receipt-toolbar";
import ReceiptWhtCertGate from "./receipt-wht-cert-gate";

export const dynamic = "force-dynamic";

// A money document must never be indexed.
// 🔴 title = เลขที่เอกสาร เพราะ Chrome ใช้ document.title เป็น "ชื่อไฟล์ตั้งต้น" ตอน Save PDF
//    + เป็นหัวกระดาษ. ต้องอยู่ใน metadata (ไม่ใช่ <title> ใน body) — ถ้าหน้ามี metadata อยู่แล้ว
//    <title> ที่ใส่ใน body จะกลายเป็น title ตัวที่ 2 และเบราว์เซอร์ใช้ "ตัวแรก" เสมอ
//    (เจอจริง 2026-07-24: PDF ออกมาชื่อ generic ทั้งที่ใส่ <title> ไว้แล้ว).
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyReceiptToken(token);
  let rid: string | null = null;
  if (id !== null) {
    const { data, error } = await createAdminClient()
      .from("tb_receipt").select("rid").eq("id", id).maybeSingle<{ rid: string | null }>();
    if (error) console.error("[/r title] failed", { message: error.message });
    rid = (data?.rid ?? "").trim() || null;
  }
  return { title: rid ? { absolute: rid } : "ใบเสร็จรับเงิน — Pacred", robots: { index: false, follow: false } };
}

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Capability gate: a valid HMAC token resolves to a receipt id; anything
  // malformed / forged / tampered → 404 (no enumeration, no info leak).
  const id = verifyReceiptToken(token);
  if (id === null) notFound();

  const doc = await loadReceiptDocument(id);
  if (!doc) notFound();

  // Self-url QR (the printed paper re-encodes this same public page).
  const qrDataUrl = await QRCode.toDataURL(`${SITE_URL}/r/${token}`, {
    width:  160,
    margin: 0,
    color:  { dark: "#111827", light: "#FFFFFF" },
  });

  // 50-ทวิ cert PROMPT (migration 0173 · ภูม 2026-06-10 · un-blocked 2026-06-14).
  //
  // ❗ The legacy PCS receipt NEVER blocked the customer print on a WHT cert —
  // verified against the legacy PHP receipt (pcs-admin/create-f-receipt.php +
  // exampleReceiptF.php · zero wht/cert/50ทวิ gate; the only redirect there is
  // a login auth-check). Blocking the print was a Pacred-only addition that
  // created a chicken-and-egg: a juristic customer needs the RECEIPT in hand to
  // *issue* their 1% หัก-ณ-ที่จ่าย (50 ทวิ), but we were withholding the receipt
  // until the cert arrived — backwards.
  //
  // Fix: the receipt is ALWAYS viewable + printable. We KEEP the cert as a
  // NON-BLOCKING nudge (upload still offered, the admin cert-chase status stays
  // an AR signal — see actions/receipt-wht-cert.ts + load-receipt-document.ts
  // `whtCert`), but it no longer locks print/download.
  //
  // `doc.whtCert.locked` is still computed (= corporate WHT receipt whose cert
  // isn't yet approved/waived) — we now use it ONLY to decide whether to OFFER
  // the upload prompt, never to lock the document.
  const showCertPrompt = doc.whtCert.locked;
  const certStatus = doc.whtCert.status === "pending" ? "pending" : "none";

  // A CANCELLED (rstatus='2' · ยกเลิก) receipt must never present as a valid
  // document to the customer — banner it (mirrors the admin statusBadge). Shows
  // in print too so a printed copy can't be mistaken for live.
  const isCancelled = doc.receipt.rstatus === "2";

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="px-2 pt-4 sm:px-4">
        {isCancelled && (
          <div className="mx-auto max-w-2xl rounded-2xl border-2 border-red-400 bg-red-50 p-4 text-center text-red-800 mb-3">
            <p className="text-lg font-extrabold tracking-wide">⛔ เอกสารนี้ถูกยกเลิก / CANCELLED</p>
            <p className="mt-0.5 text-sm text-red-700">ใบเสร็จเลขที่ {doc.receipt.rid} ถูกยกเลิกแล้ว — ไม่ถือเป็นเอกสารที่ใช้ได้</p>
          </div>
        )}
        {!isCancelled && showCertPrompt && <ReceiptWhtCertGate token={token} status={certStatus} />}
      </div>

      {/* `id` is the toggle target for the toolbar's เต็มจอ/กระดาษ (.receipt-fit).
          Ships WITH `receipt-fit` so the A4 paper fits a phone on first paint
          (no horizontal scroll, no flash) — the toolbar toggles it off for
          true "paper" view. On desktop fit caps at 210mm, so it looks the same. */}
      {/* 🔒 owner เคาะ 2026-07-24: ใบเสร็จนิติที่หัก 1% "สร้างรอไว้ แต่บล็อกการพิมพ์"
          จนกว่าบัญชีจะตรวจรับใบ 50 ทวิ (approve/waive) — ดูบนจอได้เพื่อเช็คยอด/ออกใบ
          50 ทวิ แต่พิมพ์ไม่ได้: ตอนพิมพ์ (รวม Cmd+P) กระดาษถูกซ่อน แล้วได้หน้าแจ้งแทน.
          legacy PCS ไม่มี gate นี้ในระบบ (จัดการนอกระบบ) — อันนี้คือของที่ owner สั่งให้
          เหนือกว่า legacy · ไก่-กับ-ไข่แก้ด้วยฟอร์ม 50 ทวิ กรอกให้ที่ /r/[token]/wht-form. */}
      <div
        id="publicReceiptDoc"
        className={`receipt-fit mx-auto max-w-5xl px-2 py-4 sm:px-4${showCertPrompt ? " print:hidden" : ""}`}
      >
        <ReceiptPaper pages={doc.pages} qrDataUrl={qrDataUrl} {...doc.commonProps} />
      </div>
      {showCertPrompt && (
        <div className="hidden print:block p-16 text-center">
          <p className="text-xl font-bold">ใบเสร็จ {doc.commonProps.rid} ยังพิมพ์ไม่ได้</p>
          <p className="mt-3 text-sm">
            ใบเสร็จฉบับนี้มีหักภาษี ณ ที่จ่าย 1% — ต้องแนบใบ 50 ทวิ และผ่านการตรวจจากบัญชีก่อน
            จึงจะพิมพ์ฉบับจริงได้ · เปิดหน้าใบเสร็จออนไลน์เพื่อแนบไฟล์ หรือพิมพ์ฟอร์ม 50 ทวิ
            ที่กรอกข้อมูลให้แล้วจากหน้านั้น
          </p>
        </div>
      )}

      <PublicReceiptToolbar printLocked={!isCancelled && showCertPrompt} />
    </div>
  );
}
