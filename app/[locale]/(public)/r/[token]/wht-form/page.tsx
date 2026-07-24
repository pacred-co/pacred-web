/**
 * /r/[token]/wht-form — ฟอร์ม "หนังสือรับรองการหักภาษี ณ ที่จ่าย (มาตรา 50 ทวิ)"
 * กรอกข้อมูลให้ครบแล้ว — ลูกค้าแค่ พิมพ์ → เซ็น → ประทับตรา → แนบกลับที่หน้าใบเสร็จ.
 *
 * Owner (2026-07-24, verbatim): *"ต้องตรวจ 50 ทวิก่อนปริ้นสิครับ คือสร้างรอไว้แล้วแค่ block
 * การพิมพ์ … แล้วต้องมีฟอร์มให้ลูกค้า แค่ไปเซ็นอย่างเดียวไหมครับ อำนวยทั้งลูกค้าและพนักงาน"*
 *
 * ── ทำไมฟอร์มนี้คือตัวปลดล็อกของ gate ────────────────────────────
 * ใบเสร็จนิติที่หัก 1% ถูก "บล็อกพิมพ์" จนกว่าบัญชีจะตรวจรับใบ 50 ทวิ (ดู
 * receipt-wht-cert-gate). gate ตัวนี้เคยถูกปลดเมื่อ 2026-06-14 เพราะติดไก่-กับ-ไข่:
 * ลูกค้าต้องรู้ยอด/ข้อมูลจากใบเสร็จก่อน ถึงจะไปออกใบ 50 ทวิ ของตัวเองได้.
 * ฟอร์มนี้ฆ่าไข่ใบนั้น — เรากรอกทุกช่องให้จากข้อมูลใบเสร็จ (ผู้หัก = นิติลูกค้า ·
 * ผู้ถูกหัก = Pacred · ยอด/ภาษีจากยอด FROZEN ของใบเสร็จ) เหลือแค่เซ็น+ตรา
 * → บล็อกได้จริงโดยไม่ทำให้ลูกค้าตัน.
 *
 * ── Security ─────────────────────────────────────────────────────
 * token-scoped เหมือนหน้าแม่ทุกประการ (verifyReceiptToken → receipt id เดียว) —
 * ปลอม/เดา token = 404. PURE READ, ไม่มี write. เข้าได้เฉพาะใบเสร็จนิติที่มี WHT จริง
 * (ใบบุคคลธรรมดา/ไม่มีหัก → พากลับหน้าใบเสร็จ — ฟอร์มเปล่าบนใบที่ไม่หักคือขยะที่ชวนงง).
 *
 * เลย์เอาต์ตามฟอร์มมาตรฐานกรมสรรพากร (2 ฉบับ: ฉบับที่ 1 ให้ผู้ถูกหัก · ฉบับที่ 2
 * ผู้หักเก็บสำเนา) · เนื้อความเงินได้ = ค่าบริการขนส่ง หัก 1% (มาตรา 3 เตรส).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { verifyReceiptToken } from "@/lib/receipt/receipt-token";
import { loadReceiptDocument } from "@/lib/receipt/load-receipt-document";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { PrintButton } from "@/components/print-button";
import { SITE_LEGAL_NAME_TH, TAX_ID, ADDRESSES } from "@/components/seo/site";
import { WhtFormPaper } from "@/components/wht-form-paper";

export const dynamic = "force-dynamic";

/** วันที่ไทยแบบสั้นบนฟอร์ม (เช่น 18 กรกฎาคม 2569). */
function thaiDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

// 🔴 title = ชื่อไฟล์ตอน Save PDF + หัวกระดาษ. ต้องอยู่ใน metadata เท่านั้น —
//    layout ออก <title> ให้ทุกหน้าอยู่แล้ว, <title> ที่ใส่ใน body จึงเป็นตัวที่ 2
//    และเบราว์เซอร์ใช้ "ตัวแรก" เสมอ (เจอจริง 2026-07-24). `absolute` = ไม่ต่อท้าย "| Pacred".
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyReceiptToken(token);
  let rid: string | null = null;
  if (id !== null) {
    const { data, error } = await createAdminClient()
      .from("tb_receipt").select("rid").eq("id", id).maybeSingle<{ rid: string | null }>();
    if (error) console.error("[wht-form title] failed", { message: error.message });
    rid = (data?.rid ?? "").trim() || null;
  }
  return { title: { absolute: rid ? `50ทวิ ${rid}` : "ฟอร์ม 50 ทวิ" }, robots: { index: false, follow: false } };
}

export default async function ReceiptWhtFormPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const id = verifyReceiptToken(token);
  if (id === null) notFound();

  const doc = await loadReceiptDocument(id);
  if (!doc) notFound();

  // ฟอร์มมีความหมายเฉพาะใบเสร็จนิติที่หักจริง — ใบอื่นพากลับหน้าใบเสร็จ (ไม่ 404
  // เพราะ token ถูกต้อง แค่เอกสารนี้ไม่มีอะไรให้เซ็น)
  const whtAmount = doc.commonProps.whtAmount ?? 0;
  if (!(whtAmount > 0)) redirect(`/r/${token}`);

  // identity ผู้จ่าย (นิติลูกค้า) = ชุด FROZEN เดียวกับที่พิมพ์บนใบเสร็จ (commonProps) —
  // ห้ามไปอ่านสด tb_corporate ที่นี่ ไม่งั้นฟอร์มกับใบเสร็จเล่าคนละชื่อได้
  const payerName = doc.commonProps.customerName;
  const payerTaxId = doc.commonProps.customerTaxId ?? "";
  const payerAddress = doc.commonProps.customerAddress;
  const paidAmount = doc.commonProps.preTaxTotal ?? 0;
  const payDate = thaiDate(doc.commonProps.issueDate);

  // เลขที่เอกสาร (ลูกค้ากรอกเองที่หน้าประวัติ 50 ทวิ) + ลายเซ็น/ตรายางจาก profile
  // (mig 0278) — โหลดเสริมจากใบเสร็จ → เจ้าของใบ (ไม่แตะชุด FROZEN identity ข้างบน)
  const admin = createAdminClient();
  const { data: certRow, error: certErr } = await admin
    .from("tb_receipt")
    .select("wht_cert_no, userid")
    .eq("id", id)
    .maybeSingle<{ wht_cert_no: string | null; userid: string | null }>();
  if (certErr) console.error("[wht-form certNo] failed", { message: certErr.message });
  const certNo = (certRow?.wht_cert_no ?? "").trim();

  let signatureUrl: string | null = null;
  let stampUrl: string | null = null;
  const ownerId = (certRow?.userid ?? "").trim();
  if (ownerId) {
    const { data: esign, error: esignErr } = await admin
      .from("tb_users")
      .select("signature_path, stamp_path")
      .eq("userID", ownerId)
      .maybeSingle<{ signature_path: string | null; stamp_path: string | null }>();
    if (esignErr) console.error("[wht-form esign] failed", { message: esignErr.message });
    const sign = async (p: string | null) => {
      if (!p) return null;
      const { data: s, error: sErr } = await admin.storage.from("member-docs").createSignedUrl(p, 600);
      if (sErr) console.error("[wht-form esign url] failed", { p, message: sErr.message });
      return s?.signedUrl ?? null;
    };
    [signatureUrl, stampUrl] = await Promise.all([sign(esign?.signature_path ?? null), sign(esign?.stamp_path ?? null)]);
  }

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          /* 🔴 ฟอร์มห้ามถูกตัดกลาง (owner 2026-07-24: PDF จริงตัดฟอร์มที่ 2 คาหน้า) —
             break-inside: avoid ทำให้ถ้าฉบับที่ 2 ลงไม่พอในหน้าแรก มันจะย้ายไปหน้าถัดไป
             "ทั้งใบ" แทนที่จะโดนผ่าครึ่ง. ไม่ใช้ break-after: page บังคับ เพราะจะได้ 2 หน้า
             เสมอแม้ตอนที่ใส่หน้าเดียวได้ */
          .wht-form { break-inside: avoid; page-break-inside: avoid; }
          /* เส้นปะคั่นระหว่างฉบับ = ของบนจอเท่านั้น (ตอนพิมพ์มันคือเศษที่ทำให้ล้นหน้า) */
          .wht-cut-line { display: none !important; }
        }
      `}</style>

      {/* แถบบน — หายตอนพิมพ์ (กฎ .no-print กลาง) */}
      <div className="no-print mx-auto max-w-[210mm] px-3 py-3">
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-bold">📄 ฟอร์มใบ 50 ทวิ — กรอกข้อมูลให้ครบแล้ว</p>
          <p className="mt-0.5 text-[13px]">
            พิมพ์ → <strong>เซ็นชื่อผู้จ่ายเงิน + ประทับตรานิติบุคคล</strong> →
            ถ่ายรูป/สแกน แล้วกลับไป<strong>แนบที่หน้าใบเสร็จ</strong> · บัญชีตรวจแล้วใบเสร็จจะพิมพ์ได้ทันที
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <PrintButton label="🖨 พิมพ์ฟอร์ม" />
            <Link
              href={`/r/${token}`}
              className="rounded-lg border border-emerald-400 px-4 py-2 text-sm font-medium hover:bg-emerald-100"
            >
              ← กลับหน้าใบเสร็จ (แนบไฟล์ที่นั่น)
            </Link>
          </div>
        </div>
      </div>

      {/* กระดาษ A4: 2 ฉบับในหน้าเดียว (ฉบับผู้ถูกหัก + สำเนาผู้หัก) ตามธรรมเนียมฟอร์ม */}
      <div className="mx-auto max-w-[210mm] space-y-3 bg-white p-4 shadow print:max-w-none print:space-y-4 print:p-0 print:shadow-none">
        <WhtFormPaper
          copyLabel="ฉบับที่ 1"
          copyNote="(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)"
          withholderName={payerName}
          withholderTaxId={payerTaxId}
          withholderAddress={payerAddress}
          recipientName={SITE_LEGAL_NAME_TH}
          recipientTaxId={TAX_ID}
          recipientAddress={ADDRESSES.office.full}
          incomeLabel={<>ค่าบริการขนส่ง — หักภาษี ณ ที่จ่าย 1%<span className="text-gray-600"> (คำสั่งกรมสรรพากร ท.ป.4/2528 · มาตรา 3 เตรส)</span></>}
          payDate={payDate}
          paidAmount={paidAmount}
          whtAmount={whtAmount}
          whtAmountText={readThaiBaht(whtAmount)}
          refLine={`เลขที่อ้างอิง (ใบเสร็จ Pacred): ${doc.commonProps.rid}`}
          certNo={certNo}
          signatureUrl={signatureUrl}
          stampUrl={stampUrl}
          signerName={payerName}
        />
        <div className="wht-cut-line border-t border-dashed border-gray-400" />
        <WhtFormPaper
          copyLabel="ฉบับที่ 2"
          copyNote="(สำหรับผู้หักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"
          withholderName={payerName}
          withholderTaxId={payerTaxId}
          withholderAddress={payerAddress}
          recipientName={SITE_LEGAL_NAME_TH}
          recipientTaxId={TAX_ID}
          recipientAddress={ADDRESSES.office.full}
          incomeLabel={<>ค่าบริการขนส่ง — หักภาษี ณ ที่จ่าย 1%<span className="text-gray-600"> (คำสั่งกรมสรรพากร ท.ป.4/2528 · มาตรา 3 เตรส)</span></>}
          payDate={payDate}
          paidAmount={paidAmount}
          whtAmount={whtAmount}
          whtAmountText={readThaiBaht(whtAmount)}
          refLine={`เลขที่อ้างอิง (ใบเสร็จ Pacred): ${doc.commonProps.rid}`}
          certNo={certNo}
          signatureUrl={signatureUrl}
          stampUrl={stampUrl}
          signerName={payerName}
        />
      </div>
    </div>
  );
}
