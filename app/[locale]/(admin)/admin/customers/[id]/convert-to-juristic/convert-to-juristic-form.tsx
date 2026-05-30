"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminConvertToJuristic } from "@/actions/admin/customers";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

const ERROR_LABEL: Record<string, string> = {
  not_found:           "ไม่พบลูกค้านี้",
  already_juristic:    "บัญชีนี้เป็นนิติบุคคลอยู่แล้ว",
  tax_id_already_used: "เลขผู้เสียภาษีนี้ถูกใช้กับบัญชีอื่นแล้ว",
};

export function ConvertToJuristicForm({
  userid,
  prefilledTaxId,
  prefilledCompanyName,
  prefilledCompanyAddress,
  hasExistingDraft,
}: {
  userid:                   string;
  prefilledTaxId:           string;
  prefilledCompanyName:     string;
  prefilledCompanyAddress:  string;
  hasExistingDraft:         boolean;
}) {
  const router = useRouter();
  const [taxId,    setTaxId]    = useState(prefilledTaxId);
  const [coName,   setCoName]   = useState(prefilledCompanyName);
  const [coAddr,   setCoAddr]   = useState(prefilledCompanyAddress);
  const [markVerified, setMarkVerified] = useState(true);
  const [confirm,  setConfirm]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [done,     setDone]     = useState(false);
  const [pending,  startTransition] = useTransition();

  // Cheap client-side validation that mirrors the zod schema, so users
  // see issues before the network round-trip.
  const taxIdValid     = /^\d{13}$/.test(taxId.trim());
  const coNameValid    = coName.trim().length > 0;
  const fieldsValid    = taxIdValid && coNameValid;

  function submit() {
    setError(null);
    if (!taxIdValid)  { setError("เลขผู้เสียภาษีต้อง 13 หลัก");  return; }
    if (!coNameValid) { setError("กรอกชื่อบริษัท");                return; }
    if (!confirm)     { setError("กรุณายืนยันการดำเนินการ");        return; }

    startTransition(async () => {
      const res = await adminConvertToJuristic({
        userid:          userid,
        tax_id:          taxId.trim(),
        company_name:    coName.trim(),
        company_address: coAddr.trim() || undefined,
        mark_verified:   markVerified,
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(ERROR_LABEL[res.error] ?? res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">เปลี่ยนเป็นนิติบุคคลเรียบร้อย</h2>
        <p className="text-sm text-green-700">
          ลูกค้าจะได้รับ notification ทันที — ใบเสร็จและใบกำกับภาษีจะออกในชื่อบริษัทตั้งแต่บัดนี้
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button type="button" onClick={() => router.push(`/admin/customers/${userid}`)}>
            ดูโปรไฟล์ลูกค้า
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 shadow-sm space-y-4">
      <h2 className="font-bold text-sm">ข้อมูลบริษัทใหม่</h2>

      {hasExistingDraft && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          พบข้อมูลบริษัทแบบ draft ที่บันทึกไว้ก่อนหน้านี้ — โหลดมาให้แก้ก่อน confirm
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">
          เลขประจำตัวผู้เสียภาษี (13 หลัก) <span className="text-red-600">*</span>
        </span>
        <input
          value={taxId}
          onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))}
          className={inputCls}
          placeholder="0105560000000"
          inputMode="numeric"
          maxLength={13}
        />
        {!taxIdValid && taxId.length > 0 && (
          <span className="block text-xs text-red-600">ต้องครบ 13 หลัก</span>
        )}
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">
          ชื่อบริษัท / หน่วยงาน <span className="text-red-600">*</span>
        </span>
        <input
          value={coName}
          onChange={(e) => setCoName(e.target.value)}
          className={inputCls}
          placeholder="บริษัท ตัวอย่าง จำกัด"
          maxLength={255}
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">ที่อยู่บริษัท (ตามใบทะเบียนพาณิชย์)</span>
        <textarea
          rows={3}
          value={coAddr}
          onChange={(e) => setCoAddr(e.target.value)}
          className={inputCls}
          maxLength={1000}
          placeholder="999 ซอย... ถนน... ตำบล... อำเภอ... จังหวัด... 10XXX"
        />
        <span className="block text-xs text-muted text-right">
          {coAddr.length} / 1000
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={markVerified}
          onChange={(e) => setMarkVerified(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <b>อนุมัติเลย</b> — บันทึกสถานะนิติบุคคล = &quot;อนุมัติแล้ว&quot;
          (ใช้กรณีเอกสารผ่านการตรวจสอบแล้ว — ปลดเครื่องหมายถ้าต้องการให้รอตรวจสอบก่อน)
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          ข้าพเจ้ายืนยันการอัพเกรด — ระบบจะตั้ง <code className="font-mono">userCompany=1</code> +
          บันทึกข้อมูลบริษัทลง <code className="font-mono">tb_corporate</code> + audit log + ส่ง notification ให้ลูกค้า
        </span>
      </label>

      <Button
        type="button"
        onClick={submit}
        disabled={pending || !fieldsValid || !confirm}
        fullWidth
      >
        {pending ? "กำลังเปลี่ยน..." : "เปลี่ยนเป็นนิติบุคคล"}
      </Button>
    </section>
  );
}
