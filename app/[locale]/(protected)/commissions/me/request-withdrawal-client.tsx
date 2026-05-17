"use client";

/**
 * V-E8/H1/H2 — staff withdrawal request form.
 *
 * Staff picks 1..N accruals (checkboxes) + enters title + payee bank info
 * → submits to staffRequestWithdrawal action.
 *
 * Per-spec: live total + WHT preview shown as accruals are checked.
 */

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { staffRequestWithdrawal } from "@/actions/admin/commissions";
import {
  SOURCE_KIND_LABEL,
  computeWithdrawalNumbers,
  DEFAULT_WHT_RATE_PCT,
  WHT_THRESHOLD_THB,
  type SourceKind,
} from "@/lib/validators/commission";

export type AccrualOption = {
  id:                  string;
  source_kind:         SourceKind;
  source_ref:          string;
  accrued_amount_thb:  number;
  accrued_at:          string;
};

type Props = {
  accruals:       AccrualOption[];
  minRequiredThb: number;
};

function thb(n: number): string {
  return "฿" + Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export function RequestWithdrawalClient({ accruals, minRequiredThb }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNo, setAccountNo] = useState("");

  const allSelected = selected.size === accruals.length && accruals.length > 0;

  const gross = useMemo(() => {
    let s = 0;
    for (const a of accruals) if (selected.has(a.id)) s += a.accrued_amount_thb;
    return Math.round(s * 100) / 100;
  }, [accruals, selected]);

  const { wht_amount_thb, net_thb } = useMemo(
    () => computeWithdrawalNumbers({ gross_thb: gross, wht_rate_pct: DEFAULT_WHT_RATE_PCT }),
    [gross],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else             setSelected(new Set(accruals.map((a) => a.id)));
  }

  function fire() {
    setErr(null);
    if (selected.size === 0)             { setErr("กรุณาเลือกอย่างน้อย 1 รายการ"); return; }
    if (!title.trim())                   { setErr("กรุณากรอกหัวข้อ"); return; }
    if (!bankName.trim())                { setErr("กรุณากรอกธนาคาร"); return; }
    if (!accountName.trim())             { setErr("กรุณากรอกชื่อบัญชี"); return; }
    if (!accountNo.trim())               { setErr("กรุณากรอกเลขบัญชี"); return; }
    if (gross < minRequiredThb)          { setErr(`ยอดต่ำกว่าขั้นต่ำ ${thb(minRequiredThb)}`); return; }

    startTransition(async () => {
      const res = await staffRequestWithdrawal({
        accrual_ids:           Array.from(selected),
        title:                 title.trim(),
        payee_bank_name:       bankName.trim(),
        payee_account_name:    accountName.trim(),
        payee_account_no:      accountNo.trim(),
      });
      if (res.ok) {
        setOpen(false);
        setSelected(new Set());
        setTitle("");
        setBankName("");
        setAccountName("");
        setAccountNo("");
        router.refresh();
      } else {
        setErr(translateError(res.error ?? "unknown"));
      }
    });
  }

  if (!open) {
    return (
      <section className="rounded-2xl border border-primary-300 bg-white dark:bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-sm">💸 ขอเบิกค่าคอม</h2>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
          >
            สร้างคำขอเบิก →
          </button>
        </div>
        <p className="text-xs text-muted">
          เลือกรายการสะสมที่ต้องการเบิก → กรอกข้อมูลบัญชี → ส่งให้ super/accounting อนุมัติ
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-primary-300 bg-primary-50/30 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-sm">💸 สร้างคำขอเบิก</h2>
        <button
          type="button"
          disabled={pending}
          onClick={() => { setOpen(false); setSelected(new Set()); setErr(null); }}
          className="text-xs text-muted hover:underline"
        >
          ยกเลิก
        </button>
      </div>

      {/* Accrual picker */}
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-border bg-surface-alt/50 flex items-center gap-2">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            id="select-all-accruals"
            className="rounded"
          />
          <label htmlFor="select-all-accruals" className="text-xs font-bold cursor-pointer">
            เลือกทั้งหมด ({accruals.length})
          </label>
          <span className="ml-auto text-xs text-muted">
            เลือกแล้ว <strong className="text-primary-700">{selected.size}</strong>
          </span>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {accruals.map((a) => (
                <tr key={a.id} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      id={`acc-${a.id}`}
                      className="rounded"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <label htmlFor={`acc-${a.id}`} className="cursor-pointer">
                      <span className="text-xs">{SOURCE_KIND_LABEL[a.source_kind]}</span>
                      <span className="ml-2 font-mono text-xs">{a.source_ref}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs font-bold">{thb(a.accrued_amount_thb)}</td>
                  <td className="px-3 py-2 text-xs text-muted whitespace-nowrap">
                    {new Date(a.accrued_at).toLocaleDateString("th-TH")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live totals */}
      <div className="rounded-xl border-2 border-primary-200 bg-white p-4">
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-muted">ยอดที่เลือก (gross)</td>
              <td className="py-1 text-right font-mono">{thb(gross)}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted">
                หัก ณ ที่จ่าย {DEFAULT_WHT_RATE_PCT}%
                {gross <= WHT_THRESHOLD_THB && (
                  <span className="ml-1 text-[10px] text-muted">(ไม่หัก — ยอด ≤ {thb(WHT_THRESHOLD_THB)})</span>
                )}
              </td>
              <td className="py-1 text-right font-mono text-red-700">
                {wht_amount_thb > 0 ? `−${thb(wht_amount_thb)}` : "—"}
              </td>
            </tr>
            <tr className="border-t-2 border-black text-base font-bold">
              <td className="py-2">รับสุทธิ (net)</td>
              <td className="py-2 text-right font-mono text-primary-700">{thb(net_thb)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Form fields */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="title-input" className="text-xs text-muted">หัวข้อ *</label>
          <input
            id="title-input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น ค่าคอมเดือนพ.ค. 2026"
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="bank-input" className="text-xs text-muted">ธนาคาร *</label>
          <input
            id="bank-input"
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="เช่น กสิกรไทย, ไทยพาณิชย์"
            maxLength={100}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="acc-name-input" className="text-xs text-muted">ชื่อบัญชี *</label>
          <input
            id="acc-name-input"
            type="text"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="ชื่อ-สกุลตามหน้าบัญชี"
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="acc-no-input" className="text-xs text-muted">เลขบัญชี *</label>
          <input
            id="acc-no-input"
            type="text"
            value={accountNo}
            onChange={(e) => setAccountNo(e.target.value)}
            placeholder="xxx-x-xxxxx-x"
            maxLength={50}
            className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={fire}
          disabled={pending || selected.size === 0 || gross < minRequiredThb}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังส่ง…" : `✓ ส่งคำขอเบิก (${selected.size} รายการ · ${thb(net_thb)} net)`}
        </button>
      </div>
    </section>
  );
}

function translateError(code: string): string {
  if (code.startsWith("update_failed")) return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("insert_failed")) return `บันทึกล้มเหลว: ${code}`;
  if (code.startsWith("items_insert_failed")) return `รวมรายการล้มเหลว: ${code}`;
  switch (code) {
    case "forbidden_role":             return "บทบาทของคุณไม่อยู่ในกลุ่มที่ขอเบิกได้";
    case "accruals_missing":           return "บางรายการไม่พบในระบบ";
    case "accrual_not_owned":          return "บางรายการไม่ใช่ของคุณ";
    case "accrual_already_included":   return "บางรายการถูกบรรจุในคำขอเบิกอื่นแล้ว";
    case "below_minimum":              return "ยอดต่ำกว่าขั้นต่ำขอเบิก";
    case "mixed_role_kinds":           return "มี role_kind ผสม — กรุณาแยกคำขอ";
    case "no_accruals":                return "ไม่มี accruals";
    default:                           return code;
  }
}
