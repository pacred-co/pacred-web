/**
 * /admin/accounting/ap/[id]/wht-form — ฟอร์ม 50 ทวิ ฝั่ง "Pacred เป็นผู้หัก"
 * (owner 2026-07-24: จ่าย supplier/AP → ออกใบหักให้ vendor · ใช้ตรายาง Pacred).
 *
 * สลับบทบาทจากฟอร์มลูกค้า: ผู้หัก = Pacred (SOT site.ts + ลายเซ็น/ตราจาก
 * public/images/company/pacred-{signature,stamp}.png — owner วางไฟล์เมื่อไรโผล่เอง ·
 * ไม่มีไฟล์ = เว้นช่องเซ็นมือ ห้ามลิงก์รูปที่ไม่มีจริง) · ผู้ถูกหัก = vendor จาก
 * ap_disbursement (payee_tax_id/address = mig 0279 · ว่าง = จุดให้เขียนมือ).
 *
 * gate super/accounting — AP เป็นเลนบัญชี (คนละเลนกับใบหักลูกค้าที่ sales/CS พิมพ์).
 * PURE READ · กระดาษกลาง components/wht-form-paper.tsx (fix-at-root).
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { readThaiBaht } from "@/lib/utils/thai-number";
import { PrintButton } from "@/components/print-button";
import { WhtFormPaper } from "@/components/wht-form-paper";
import { SITE_LEGAL_NAME_TH, TAX_ID, ADDRESSES, DOC_SIGNATORY } from "@/components/seo/site";

export const dynamic = "force-dynamic";

type ApRow = {
  id: number;
  payee_name: string | null;
  payee_tax_id: string | null;
  payee_address: string | null;
  amount_gross: number | string | null;
  amount_withdraw: number | string | null;
  wht_pct: number | string | null;
  wht_cert_no: string | null;
  transferred_at: string | null;
  item_label: string | null;
};

const num = (v: number | string | null) => (v == null ? 0 : Number(v) || 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function loadAp(id: number): Promise<ApRow | null> {
  const { data, error } = await createAdminClient()
    .from("ap_disbursement")
    .select("id, payee_name, payee_tax_id, payee_address, amount_gross, amount_withdraw, wht_pct, wht_cert_no, transferred_at, item_label")
    .eq("id", id)
    .maybeSingle<ApRow>();
  if (error) console.error("[ap wht-form] load failed", { id, message: error.message });
  return data ?? null;
}

/** ประเภทเงินได้ตามอัตราหัก (ท.ป.4/2528) — อัตราอื่น = ใช้ชื่อรายการจริง */
function incomeLabelFor(pct: number, itemLabel: string | null) {
  if (pct === 1) return <>ค่าขนส่ง — หักภาษี ณ ที่จ่าย 1%<span className="text-gray-600"> (ท.ป.4/2528 · มาตรา 3 เตรส)</span></>;
  if (pct === 3) return <>ค่าบริการ/ค่าจ้างทำของ — หักภาษี ณ ที่จ่าย 3%<span className="text-gray-600"> (ท.ป.4/2528 · มาตรา 3 เตรส)</span></>;
  if (pct === 5) return <>ค่าเช่า — หักภาษี ณ ที่จ่าย 5%<span className="text-gray-600"> (ท.ป.4/2528 · มาตรา 3 เตรส)</span></>;
  return <>{itemLabel || "เงินได้ตามมาตรา 3 เตรส"} — หักภาษี ณ ที่จ่าย {pct}%</>;
}

function thaiDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });
}

// title = ชื่อไฟล์ PDF (metadata เท่านั้น — <title> ใน body แพ้เสมอ · print-verify L-1)
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = /^\d+$/.test(id) ? await loadAp(Number(id)) : null;
  return {
    title: { absolute: row ? `50ทวิ AP-${row.id} ${row.payee_name ?? ""}`.trim() : "ฟอร์ม 50 ทวิ (AP)" },
    robots: { index: false, follow: false },
  };
}

export default async function ApWhtFormPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(["super", "accounting"]);
  const { id: idRaw } = await params;
  if (!/^\d+$/.test(idRaw)) notFound();
  const row = await loadAp(Number(idRaw));
  if (!row) notFound();

  const pct = num(row.wht_pct);
  // ไม่มี WHT = ไม่มีอะไรให้ออกใบหัก → กลับหน้ารายการ (ฟอร์มเปล่าคือขยะชวนงง)
  if (!(pct > 0)) redirect(`/admin/accounting/ap/${row.id}`);

  const gross = num(row.amount_gross) || num(row.amount_withdraw);
  const wht = r2(gross * (pct / 100));
  const payDate = thaiDate(row.transferred_at);

  // ตรายาง/ลายเซ็น Pacred — static asset · เช็คว่าไฟล์มีจริงก่อนลิงก์ (broken-image trap)
  const pub = (f: string) =>
    existsSync(join(process.cwd(), "public", "images", "company", f)) ? `/images/company/${f}` : null;
  // ลายเซ็นผู้มีอำนาจ Pacred มีอยู่แล้ว (ใช้บนใบเสร็จ · DOC_SIGNATORY.signature) —
  // ไฟล์เฉพาะทางถ้า owner วางไว้จะชนะ · ตรายางยังไม่มีไฟล์ = เว้นช่องประทับมือ
  const signatureUrl = pub("pacred-signature.png") ?? DOC_SIGNATORY.signature;
  const stampUrl = pub("pacred-stamp.png");

  const common = {
    withholderName: SITE_LEGAL_NAME_TH,
    withholderTaxId: TAX_ID,
    withholderAddress: ADDRESSES.office.full,
    recipientName: row.payee_name ?? "",
    recipientTaxId: row.payee_tax_id ?? "",
    recipientAddress: row.payee_address ?? "",
    incomeLabel: incomeLabelFor(pct, row.item_label),
    payDate,
    paidAmount: gross,
    whtAmount: wht,
    whtAmountText: readThaiBaht(wht),
    refLine: `อ้างอิงรายการเบิกจ่าย AP-${row.id}${row.item_label ? ` · ${row.item_label}` : ""}`,
    certNo: (row.wht_cert_no ?? "").trim(),
    signatureUrl,
    stampUrl,
    signerName: DOC_SIGNATORY.name,
  };

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          .wht-form { break-inside: avoid; page-break-inside: avoid; }
          .wht-cut-line { display: none !important; }
        }
      `}</style>

      <div className="no-print mx-auto max-w-[210mm] px-3 py-3">
        <div className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-bold">📄 ฟอร์ม 50 ทวิ — Pacred เป็นผู้หัก (จ่าย {row.payee_name ?? "vendor"})</p>
          <p className="mt-0.5 text-[13px]">
            ยอดจ่าย {gross.toLocaleString("en-US", { minimumFractionDigits: 2 })} · หัก {pct}% ={" "}
            {wht.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท ·
            {signatureUrl || stampUrl
              ? " แปะลายเซ็น/ตรา Pacred ให้แล้ว"
              : " ยังไม่มีไฟล์ลายเซ็น/ตรา Pacred (วางที่ public/images/company/pacred-signature.png + pacred-stamp.png) — พิมพ์แล้วเซ็น/ประทับมือ"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <PrintButton label="🖨 พิมพ์ฟอร์ม" />
            <Link
              href={`/admin/accounting/ap/${row.id}`}
              className="rounded-lg border border-sky-400 px-4 py-2 text-sm font-medium hover:bg-sky-100"
            >
              ← กลับรายการเบิกจ่าย
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[210mm] space-y-3 bg-white p-4 shadow print:max-w-none print:space-y-4 print:p-0 print:shadow-none">
        <WhtFormPaper
          copyLabel="ฉบับที่ 1"
          copyNote="(สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)"
          {...common}
        />
        <div className="wht-cut-line border-t border-dashed border-gray-400" />
        <WhtFormPaper
          copyLabel="ฉบับที่ 2"
          copyNote="(สำหรับผู้หักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)"
          {...common}
        />
      </div>
    </div>
  );
}
