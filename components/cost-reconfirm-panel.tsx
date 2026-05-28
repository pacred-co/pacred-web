"use client";

/**
 * 0092 · Forwarder cost-adjustment RE-CONFIRM panel (customer-facing).
 *
 * Renders on /service-import/[fNo] when ANY forwarder_cost_adjustments
 * row has status='pending_reconfirm'. The customer sees the original
 * preview total vs the new actual total + the delta % over preview,
 * and presses ยืนยันชำระ (accept → row → 'unpaid', admin can then bill)
 * or ขอตรวจสอบ (dispute → ops work_item opened, row stays
 * pending_reconfirm).
 *
 * Source: BUSINESS_FLOW.md L85-87 + pcs-business-flow audit §3 Priority 2.
 *
 * Pattern mirrors DeliveryAckPanel — useTransition, optional note,
 * router.refresh() after success, friendly error mapping.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { customerDecideCostAdjustment } from "@/actions/forwarder";

export type ReconfirmRow = {
  id:                    string;
  kind:                  string;
  amount_thb:            number;
  note:                  string | null;
  preview_total_thb:     number | null;
  cumulative_after_thb:  number | null;
  reconfirm_required_at: string | null;
};

const KIND_LABEL_TH: Record<string, string> = {
  do_fee:        "ค่า D/O",
  gateway_fee:   "ค่า gateway",
  weight_rebill: "ค่าน้ำหนักเพิ่ม",
  customs_extra: "ค่าศุลกากรเพิ่ม",
  other:         "อื่นๆ",
};

type Props = {
  /** All pending_reconfirm adjustments for this forwarder. */
  rows: ReconfirmRow[];
};

export function CostReconfirmPanel({ rows }: Props) {
  if (!rows || rows.length === 0) return null;

  // Pick the most-recent row as the "headline" preview/actual numbers —
  // its cumulative_after_thb already includes every prior adjustment.
  // (If admin queued multiple gates, the customer decides each row
  // independently — they each get their own card below.)
  const sorted = [...rows].sort((a, b) => {
    const aT = a.reconfirm_required_at ? new Date(a.reconfirm_required_at).getTime() : 0;
    const bT = b.reconfirm_required_at ? new Date(b.reconfirm_required_at).getTime() : 0;
    return bT - aT;
  });
  const headline = sorted[0];
  const preview  = Number(headline.preview_total_thb    ?? 0);
  const actual   = Number(headline.cumulative_after_thb ?? 0);
  const delta    = actual - preview;
  const deltaPct = preview > 0 ? (delta / preview) * 100 : 0;

  return (
    <section className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-3xl" aria-hidden>⚠️</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-amber-900 text-base">
            ราคาจริงสูงกว่าราคาประเมิน — รอคุณยืนยันก่อนชำระ
          </h3>
          <p className="text-sm text-amber-800 mt-1">
            ตามนโยบาย Pacred: หากราคาจริง <strong>สูงกว่าราคาประเมินเกิน 10%</strong> ทีมงานจะหยุดการตัดยอดและขอให้คุณยืนยันก่อนเสมอ —
            ป้องกันการตัดเงินโดยไม่ทราบ
          </p>
        </div>
      </div>

      {/* Headline price comparison */}
      <div className="grid sm:grid-cols-3 gap-3">
        <PriceBox
          label="ราคาประเมินตอนสั่ง"
          value={preview}
          tone="muted"
        />
        <PriceBox
          label="ราคาจริง"
          value={actual}
          tone="bold"
        />
        <PriceBox
          label={`เพิ่มขึ้น (${deltaPct.toFixed(1)}%)`}
          value={delta}
          tone="warn"
        />
      </div>

      {/* Per-row decision cards (usually 1 — but supports queue) */}
      <ul className="space-y-3">
        {sorted.map((row) => (
          <ReconfirmCard key={row.id} row={row} />
        ))}
      </ul>
    </section>
  );
}

function ReconfirmCard({ row }: { row: ReconfirmRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<"accept" | "dispute" | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function decide(choice: "accept" | "dispute") {
    setDecision(choice);
    setErr(null);
    // Accept goes straight through. Dispute opens the note field — only
    // submit when the user presses the second "ส่งเรื่องตรวจสอบ" button.
    if (choice === "accept") {
      fire(choice, undefined);
    }
  }

  function fire(choice: "accept" | "dispute", customerNote: string | undefined) {
    startTransition(async () => {
      const res = await customerDecideCostAdjustment({
        adjustment_id: row.id,
        decision:      choice,
        note:          customerNote,
      });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(translateError(res.error));
        setDecision(null);
      }
    });
  }

  const kindLabel = KIND_LABEL_TH[row.kind] ?? row.kind;
  const amountFmt = Number(row.amount_thb).toLocaleString("th-TH", { minimumFractionDigits: 2 });

  return (
    <li className="rounded-xl bg-white border border-amber-300 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs uppercase font-semibold tracking-wider text-amber-700">{kindLabel}</p>
          <p className="font-bold text-lg text-amber-950 mt-0.5">฿{amountFmt}</p>
          {row.note && (
            <p className="text-xs text-amber-800 mt-1 whitespace-pre-wrap">
              <span className="text-amber-700">เหตุผล:</span> {row.note}
            </p>
          )}
        </div>
      </div>

      {err && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</p>
      )}

      {decision === "dispute" ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-amber-900">โน้ตขอตรวจสอบ (ถ้ามี)</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="เช่น น้ำหนักไม่น่าเพิ่มขนาดนี้ / ขอดูใบรับน้ำหนักจริงก่อน"
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              disabled={pending}
            />
            <span className="text-[10px] text-amber-700">{note.length}/500</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => fire("dispute", note.trim() || undefined)}
              disabled={pending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {pending ? "กำลังส่ง..." : "📨 ส่งเรื่องตรวจสอบ"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setDecision(null); setNote(""); setErr(null); }}
              disabled={pending}
            >
              ย้อนกลับ
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => decide("accept")}
            disabled={pending}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {pending && decision === "accept" ? "กำลังบันทึก..." : "✅ ยืนยันชำระ"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => decide("dispute")}
            disabled={pending}
            className="border-amber-400 text-amber-900 hover:bg-amber-100"
          >
            🔎 ขอตรวจสอบ
          </Button>
        </div>
      )}
    </li>
  );
}

function PriceBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "muted" | "bold" | "warn";
}) {
  const cls =
    tone === "warn" ? "text-amber-700 font-bold"
    : tone === "bold" ? "text-amber-950 font-bold"
    : "text-amber-800";
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-wider text-amber-700">{label}</p>
      <p className={`text-lg font-mono mt-1 ${cls}`}>
        ฿{Number(value).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
      </p>
    </div>
  );
}

function translateError(code: string): string {
  switch (code) {
    case "not_signed_in":          return "กรุณาเข้าสู่ระบบใหม่";
    case "not_found":              return "ไม่พบรายการนี้";
    case "not_pending_reconfirm":  return "รายการนี้ไม่อยู่ในสถานะรอยืนยันแล้ว — รีเฟรชหน้าเพื่อดูสถานะล่าสุด";
    case "invalid_input":          return "ข้อมูลไม่ถูกต้อง — โน้ตยาวสูงสุด 500 ตัวอักษร";
    case "ownership_mismatch":     return "ไม่ได้รับสิทธิ์ดำเนินการกับรายการนี้";
    default:                       return code;
  }
}
