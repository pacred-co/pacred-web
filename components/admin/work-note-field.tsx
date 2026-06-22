"use client";

/**
 * UNIT C (owner 2026-06-19) — "หมายเหตุงาน" (internal work note) field.
 *
 * Owner: "เวลาอัพสลิป/อัพรูป/อัพงาน ทำช่องหมายเหตุงาน ทุกแผนก แล้วดึงไปใช้จริง"
 * — when staff approve a slip / upload a photo / mark work, give them an
 * internal work-note box, and actually pull it through (display + persist).
 *
 * Self-contained controlled <textarea>: no server import, no data fetch.
 * Reuse anywhere a department action wants to capture an internal note.
 * Writes into the EXISTING note columns (tb_wallet_hs.note · tb_forwarder.fnote
 * · tb_header_order.hnote) — no migration. The parent owns the value + submit.
 *
 * Props:
 *   value        — controlled value (required)
 *   onChange     — (next: string) => void (required)
 *   defaultValue — optional seed text (parent may pre-fill from a prior note)
 *   label        — optional label override (default "หมายเหตุงาน (ภายใน)")
 *   placeholder  — optional placeholder override
 *   maxLength    — optional cap (default 500)
 *   disabled     — optional disabled flag
 *   id           — optional id for label association
 */

import { useId } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  defaultValue?: string;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  id?: string;
};

export function WorkNoteField({
  value,
  onChange,
  label = "หมายเหตุงาน (ภายใน)",
  placeholder = "บันทึกหมายเหตุการทำงานภายใน เช่น ตรวจสลิปแล้ว / รอยืนยันยอด / ติดต่อลูกค้าแล้ว",
  maxLength = 500,
  disabled = false,
  id,
}: Props) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const len = value.length;

  return (
    <div className="space-y-1">
      <label
        htmlFor={fieldId}
        className="block text-[11px] font-medium text-muted"
      >
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={2}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs text-foreground placeholder:text-muted/70 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300 disabled:opacity-50 dark:bg-surface"
        placeholder={placeholder}
      />
      <div className="text-right text-[11px] text-muted/70">
        {len}/{maxLength}
      </div>
    </div>
  );
}
