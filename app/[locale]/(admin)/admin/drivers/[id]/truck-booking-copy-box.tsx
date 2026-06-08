"use client";

import { useState } from "react";
import { ClipboardCopy, Check } from "lucide-react";

/**
 * <TruckBookingCopyBox> — read-only textarea + copy-to-clipboard for the
 * จองรถ (external-truck) LINE-paste block. The server component builds the
 * text from the batch's tb_forwarder stops (SHIPMENT / ตู้# / CBM / cartons
 * / KG / POD / delivery address / Google-maps link / phones); ops copies it
 * and pastes into the truck-vendor LINE chat.
 *
 * Mirrors the BulletinCopyBox pattern (warehouse/bulletin/copy-box.tsx) —
 * internal tool, no mutation, so no confirm dialog needed (§0f applies to
 * data-mutating actions; this only reads + copies).
 */
export function TruckBookingCopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function copy() {
    setErr(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      setErr("คัดลอกไม่สำเร็จ — เลือกข้อความแล้วกด Ctrl+C");
      console.error(e);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        readOnly
        value={text}
        rows={Math.min(24, Math.max(8, text.split("\n").length + 1))}
        className="w-full rounded-lg border border-border bg-surface-alt/30 px-3 py-2 text-xs font-mono whitespace-pre focus:outline-none focus:ring-2 focus:ring-primary-500/50"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700"
        >
          {copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
          คัดลอกข้อความจองรถ
        </button>
        {copied && (
          <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs text-green-700 font-medium">
            ✓ คัดลอกแล้ว — paste ลง LINE คนขับรถได้เลย
          </span>
        )}
        {err && (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700">
            {err}
          </span>
        )}
      </div>
    </div>
  );
}
