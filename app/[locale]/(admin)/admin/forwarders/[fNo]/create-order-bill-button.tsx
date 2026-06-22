"use client";

/**
 * <CreateOrderBillButton> — per-order "สร้างใบวางบิล" (owner 2026-06-22). Shown on
 * the forwarder detail when the order is at รอชำระเงิน/เตรียมส่ง (fstatus 5/6) so the
 * admin can mint the bill + send to collect right after pricing. Calls
 * createForwarderOrderBill(fId) which derives the whole tracking group server-side
 * + reuses the proven billing-run engine. confirm() runs OUTSIDE startTransition.
 *
 * ภูม 2026-06-22 — both the success ("สร้างแล้ว เลขที่ …") AND the "already on another
 * invoice" notice are now CLICKABLE links straight to that bill (/admin/billing-run/[id]),
 * so staff don't have to go hunt the invoice by hand.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import { createForwarderOrderBill } from "@/actions/admin/billing-run";

type Result =
  | { kind: "ok"; docNo: string; invoiceId?: number }
  | { kind: "err"; text: string; billed?: Array<{ forwarderId: number; docNo: string; invoiceId: number }> };

export function CreateOrderBillButton({ fId, fstatus }: { fId: number; fstatus: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  const cur = String(fstatus ?? "").trim();
  if (cur !== "5" && cur !== "6") return null; // billable only at รอชำระเงิน/เตรียมส่ง

  async function onClick() {
    setResult(null);
    const ok = await confirm(
      `สร้างใบวางบิลสำหรับออเดอร์ #${fId} เพื่อส่งเก็บเงินลูกค้า?\n\n` +
        `(ระบบจะออกเลขใบวางบิล + รวมยอดทุกแทรคกิงของออเดอร์นี้)`,
      { title: "สร้างใบวางบิล", confirmLabel: "สร้างบิล", cancelLabel: "ยกเลิก" },
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await createForwarderOrderBill(fId);
      if (res.ok) {
        setResult({ kind: "ok", docNo: res.data?.docNo ?? "", invoiceId: res.data?.invoiceId });
        router.refresh();
      } else {
        setResult({ kind: "err", text: res.error ?? "สร้างใบวางบิลไม่สำเร็จ", billed: res.billedInvoices });
      }
    });
  }

  // Collision → one link per UNIQUE invoice (a multi-tracking order usually maps to 1).
  const uniqueBilled = (() => {
    if (result?.kind !== "err" || !result.billed?.length) return [];
    const seen = new Set<number>();
    const out: Array<{ docNo: string; invoiceId: number }> = [];
    for (const b of result.billed) {
      if (!seen.has(b.invoiceId)) { seen.add(b.invoiceId); out.push({ docNo: b.docNo, invoiceId: b.invoiceId }); }
    }
    return out;
  })();

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Receipt className="h-4 w-4" />
        {pending ? "กำลังสร้างบิล..." : "🧾 สร้างใบวางบิล (เก็บเงินลูกค้า)"}
      </button>

      {result?.kind === "ok" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          ✓ สร้างใบวางบิลแล้ว เลขที่{" "}
          {result.invoiceId ? (
            <Link
              href={`/admin/billing-run/${result.invoiceId}`}
              className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2 hover:text-emerald-900"
            >
              {result.docNo}
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : (
            <span className="font-semibold">{result.docNo}</span>
          )}{" "}
          — กดเลขที่บิลเพื่อเปิดดู / ส่งเก็บเงินลูกค้าได้เลย
        </div>
      )}

      {result?.kind === "err" && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {uniqueBilled.length > 0 ? (
            <>
              รายการนี้อยู่ในใบวางบิลอื่นแล้ว — กดเปิดดู:{" "}
              {uniqueBilled.map((b, i) => (
                <span key={b.invoiceId}>
                  {i > 0 && ", "}
                  <Link
                    href={`/admin/billing-run/${b.invoiceId}`}
                    className="inline-flex items-center gap-0.5 font-semibold underline underline-offset-2 hover:text-red-900"
                  >
                    {b.docNo}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </span>
              ))}
            </>
          ) : (
            result.text
          )}
        </div>
      )}
    </div>
  );
}
