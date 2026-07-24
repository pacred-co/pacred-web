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

export const dynamic = "force-dynamic";

const baht = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** วันที่ไทยแบบสั้นบนฟอร์ม (เช่น 18 กรกฎาคม 2569). */
function thaiDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

/** ช่องข้อมูลฝั่งบน (ผู้หัก/ผู้ถูกหัก) — คู่ label + ค่า ในกรอบมาตรฐานฟอร์ม. */
function Party({
  role,
  name,
  taxId,
  address,
}: {
  role: string;
  name: string;
  taxId: string;
  address: string;
}) {
  return (
    <div className="border border-gray-800 px-2 py-1">
      <p className="text-[11px] font-bold">{role}</p>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <span className="text-gray-600">ชื่อ</span>
        <span className="border-b border-dotted border-gray-500 font-medium">{name || " "}</span>
        <span className="text-gray-600">เลขประจำตัวผู้เสียภาษีอากร</span>
        <span className="border-b border-dotted border-gray-500 font-mono tracking-wider">
          {taxId || " "}
        </span>
        <span className="text-gray-600">ที่อยู่</span>
        <span className="border-b border-dotted border-gray-500">{address || " "}</span>
      </div>
    </div>
  );
}

/** ฟอร์ม 50 ทวิ 1 ฉบับ (ครึ่งหน้า A4) — copyLabel = ฉบับที่ 1 / ฉบับที่ 2. */
function WhtForm({
  copyLabel,
  copyNote,
  payerName,
  payerTaxId,
  payerAddress,
  payDate,
  paidAmount,
  whtAmount,
  receiptNo,
  certNo,
  signatureUrl,
  stampUrl,
}: {
  copyLabel: string;
  copyNote: string;
  payerName: string;
  payerTaxId: string;
  payerAddress: string;
  payDate: string;
  paidAmount: number;
  whtAmount: number;
  receiptNo: string;
  /** เลขที่เอกสารที่ลูกค้ากรอกเอง (tb_receipt.wht_cert_no) — ช่อง "เลขที่" ของฟอร์มจริง */
  certNo: string;
  /** ลายเซ็น/ตรายางจาก profile ลูกค้า (mig 0278) — มี = แปะให้เลย ไม่มี = เว้นให้เซ็นมือ */
  signatureUrl: string | null;
  stampUrl: string | null;
}) {
  return (
    <div className="wht-form bg-white px-4 py-2.5 text-black" style={{ fontSize: "11px", lineHeight: 1.3 }}>
      <div className="flex items-start justify-between">
        {/* หัวซ้ายตามฟอร์มจริง: เล่มที่/เลขที่ — เลขที่ = เลขเอกสารที่ระบบผู้หัก (ลูกค้า)
            ออกเอง → ให้กรอกเองได้ที่หน้าประวัติ 50 ทวิ · ว่าง = จุดให้เขียนมือ */}
        <div className="text-[10px] leading-tight">
          <p>
            เล่มที่ ..................{" "}
            เลขที่{" "}
            {certNo ? (
              <span className="font-mono font-bold">{certNo}</span>
            ) : (
              ".................."
            )}
          </p>
          <p className="text-gray-600">เลขที่อ้างอิง (ใบเสร็จ Pacred): {receiptNo}</p>
        </div>
        <div className="text-right text-[10px]">
          <p className="font-bold">{copyLabel}</p>
          <p>{copyNote}</p>
        </div>
      </div>

      <h1 className="mt-1 text-center text-[13px] font-bold">
        หนังสือรับรองการหักภาษี ณ ที่จ่าย
      </h1>
      <p className="text-center text-[10.5px]">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>

      <div className="mt-1.5 space-y-1.5">
        {/* ผู้จ่ายเงิน = นิติลูกค้า (คนหัก 1%) — กรอกให้จากข้อมูลใบเสร็จ */}
        <Party
          role="ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (ผู้จ่ายเงิน)"
          name={payerName}
          taxId={payerTaxId}
          address={payerAddress}
        />
        {/* ผู้รับเงิน = Pacred — ค่าคงที่บริษัทจาก SOT site.ts */}
        <Party
          role="ผู้ถูกหักภาษี ณ ที่จ่าย (ผู้รับเงิน)"
          name={SITE_LEGAL_NAME_TH}
          taxId={TAX_ID}
          address={ADDRESSES.office.full}
        />
      </div>

      {/* ลำดับที่ในแบบ — นิติจ่ายนิติ ค่าบริการ/ขนส่ง = นำส่งด้วย ภ.ง.ด.53 (ติ๊กให้เลย) */}
      <p className="mt-1 text-[10.5px]">
        ลำดับที่ .......... ในแบบ{" "}
        <span className="text-gray-600">
          ☐ ภ.ง.ด.1ก &nbsp;☐ ภ.ง.ด.1ก พิเศษ &nbsp;☐ ภ.ง.ด.2 &nbsp;☐ ภ.ง.ด.3 &nbsp;☐
          ภ.ง.ด.2ก &nbsp;☐ ภ.ง.ด.3ก
        </span>{" "}
        <span className="font-bold">☑ ภ.ง.ด.53</span>
      </p>

      {/* ตารางเงินได้ */}
      <table className="mt-1.5 w-full border-collapse text-[11px] [&_td]:border [&_td]:border-gray-800 [&_td]:px-1 [&_td]:py-0.5 [&_th]:border [&_th]:border-gray-800 [&_th]:px-1 [&_th]:py-0.5">
        <thead>
          <tr className="text-center">
            <th className="p-1">ประเภทเงินได้พึงประเมินที่จ่าย</th>
            <th className="w-[92px] p-1">วัน เดือน ปี ที่จ่าย</th>
            <th className="w-[110px] p-1">จำนวนเงินที่จ่าย</th>
            <th className="w-[110px] p-1">ภาษีที่หักและนำส่งไว้</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-1">
              ค่าบริการขนส่ง — หักภาษี ณ ที่จ่าย 1%
              <span className="text-gray-600"> (คำสั่งกรมสรรพากร ท.ป.4/2528 · มาตรา 3 เตรส)</span>
            </td>
            <td className="p-1 text-center">{payDate}</td>
            <td className="p-1 text-right tabular-nums">{baht(paidAmount)}</td>
            <td className="p-1 text-right tabular-nums">{baht(whtAmount)}</td>
          </tr>
          <tr className="font-bold">
            <td className="p-1 text-right" colSpan={2}>
              รวมเงินที่จ่ายและภาษีที่หักนำส่ง
            </td>
            <td className="p-1 text-right tabular-nums">{baht(paidAmount)}</td>
            <td className="p-1 text-right tabular-nums">{baht(whtAmount)}</td>
          </tr>
          <tr>
            <td className="p-1" colSpan={4}>
              รวมเงินภาษีที่หักนำส่ง (ตัวอักษร):{" "}
              <span className="font-medium">{readThaiBaht(whtAmount)}</span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* วิธีนำส่ง — เคสเราคือ หัก ณ ที่จ่าย เสมอ */}
      <p className="mt-1.5 text-[11px]">
        ผู้จ่ายเงิน: <span className="font-bold">☑ (1) หัก ณ ที่จ่าย</span>
        <span className="ml-3 text-gray-600">☐ (2) ออกให้ตลอดไป ☐ (3) ออกให้ครั้งเดียว ☐ (4) อื่น ๆ</span>
      </p>

      {/* เซ็น + ตรา — ลูกค้าตั้งลายเซ็น/ตรายางใน profile แล้ว = แปะให้เลย ·
          ยังไม่ตั้ง = เว้นช่องให้เซ็นมือเหมือนเดิม */}
      <div className="mt-1.5 grid grid-cols-[1fr_120px] gap-2">
        <div className="border border-gray-800 px-2 py-1.5 text-center">
          <p className="text-[10.5px]">
            ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ
          </p>
          {/* ลายเซ็น = overlay ทับเส้นจุด (absolute · สูง +0) — ห้าม stack เพิ่มความสูง
              ไม่งั้นฟอร์ม ×2 ล้น 281mm → ฉบับที่ 2 กระเด็นไปหน้า 2 (print-verify L-2) */}
          <p className="relative mt-5">
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt=""
                className="absolute bottom-0 left-1/2 h-9 -translate-x-1/2 object-contain"
                style={{ mixBlendMode: "multiply" }}
              />
            ) : null}
            ลงชื่อ ............................................................ ผู้จ่ายเงิน
          </p>
          <p className="mt-1">( {payerName || "............................................................"} )</p>
          <p className="mt-1">วันที่ ............ / ................... / ...............</p>
        </div>
        {stampUrl ? (
          <div className="relative flex items-center justify-center border border-gray-800 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stampUrl}
              alt="ตรายางนิติบุคคล"
              className="max-h-[84px] object-contain"
              style={{ mixBlendMode: "multiply" }}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center border border-gray-800 p-2 text-center text-[10.5px] text-gray-500">
            ประทับตรา
            <br />
            นิติบุคคล
            <br />
            (ถ้ามี)
          </div>
        )}
      </div>

      <p className="mt-0.5 text-[9.5px] leading-snug text-gray-600">
        คำเตือน: ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ
        แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
      </p>
    </div>
  );
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
        <WhtForm
          copyLabel="ฉบับที่ 1"
          copyNote="(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)"
          payerName={payerName}
          payerTaxId={payerTaxId}
          payerAddress={payerAddress}
          payDate={payDate}
          paidAmount={paidAmount}
          whtAmount={whtAmount}
          receiptNo={doc.commonProps.rid}
          certNo={certNo}
          signatureUrl={signatureUrl}
          stampUrl={stampUrl}
        />
        <div className="wht-cut-line border-t border-dashed border-gray-400" />
        <WhtForm
          copyLabel="ฉบับที่ 2"
          copyNote="(สำหรับผู้หักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"
          payerName={payerName}
          payerTaxId={payerTaxId}
          payerAddress={payerAddress}
          payDate={payDate}
          paidAmount={paidAmount}
          whtAmount={whtAmount}
          receiptNo={doc.commonProps.rid}
          certNo={certNo}
          signatureUrl={signatureUrl}
          stampUrl={stampUrl}
        />
      </div>
    </div>
  );
}
