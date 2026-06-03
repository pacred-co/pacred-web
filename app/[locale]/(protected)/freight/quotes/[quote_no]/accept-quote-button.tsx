"use client";

/**
 * R1 / V-E1.2.1 — customer self-accept button.
 *
 * Drops into /freight/quotes/[quote_no] beside the LINE/phone CTAs.
 * Calls actions/freight.ts:customerAcceptQuote → flips status sent →
 * accepted server-side + admin fan-out notification.
 *
 * Confirm prompt protects against an accidental tap — accepting a quote
 * locks in the price (admin then converts to shipment).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle } from "lucide-react";
import { customerAcceptQuote } from "@/actions/freight";
import { confirm } from "@/components/ui/confirm";

interface Props {
  quoteId: string;
  quoteNo: string;
  total: number;
}

const ERR_LABELS: Record<string, string> = {
  auth_required:        "กรุณาเข้าสู่ระบบใหม่",
  forbidden_not_owner:  "ใบเสนอราคานี้ไม่ใช่ของคุณ",
  not_found:            "ไม่พบใบเสนอราคา",
  expired:              "ใบเสนอราคาหมดอายุแล้ว — กรุณาขอใบใหม่",
  invalid_quote_id:     "รหัสใบเสนอราคาไม่ถูกต้อง",
};

export function AcceptQuoteButton({ quoteId, quoteNo, total }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function fire() {
    setError(null);
    const ok = await confirm(
      `ยืนยันตอบรับใบเสนอราคา ${quoteNo}?\n\n` +
      `ราคา ฿${total.toLocaleString("th-TH")}\n\n` +
      `เมื่อตอบรับแล้ว ทีม Pacred จะเริ่มขั้นตอนต่อไป (เปิดงานขนส่ง) ทันที`
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await customerAcceptQuote({ quoteId });
      if (!res.ok) {
        if (res.error.startsWith("bad_status:")) {
          const actual = res.error.split(":")[1];
          setError(`สถานะเปลี่ยนไปแล้ว (ตอนนี้คือ ${actual}) — refresh หน้าเพื่อดูสถานะปัจจุบัน`);
        } else {
          setError(ERR_LABELS[res.error] ?? `เกิดข้อผิดพลาด: ${res.error}`);
        }
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={fire}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4" />
        )}
        {pending ? "กำลังบันทึก…" : "✓ ตอบรับใบเสนอราคา"}
      </button>
      {error && (
        <p className="text-xs text-red-700 dark:text-red-300">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
