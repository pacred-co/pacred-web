"use client";

import { useCallback, useState, useTransition } from "react";
import { Link } from "@/i18n/navigation";
import {
  adminBulkTrackingSearch,
  type BulkSearchResult,
  type TrackingMatch,
} from "@/actions/admin/bulk-tracking-search";

/** U2-5 client form — paste textarea + render result table. */

const FOUND_IN_LABEL: Record<TrackingMatch["found_in"], string> = {
  tracking_chn:  "tracking จีน",
  tracking_th:   "tracking ไทย",
  item_tracking: "tracking สินค้า",
};

const STATUS_LABEL: Record<string, string> = {
  pending_payment:  "รอชำระเงิน",
  shipped_china:    "ออกจากจีน",
  in_transit:       "กลางทาง",
  arrived_thailand: "เข้าโกดังไทย",
  out_for_delivery: "กำลังจัดส่ง",
  delivered:        "ส่งสำเร็จ",
  cancelled:        "ยกเลิก",
};

export function BulkSearchForm({ initialQuery = "" }: { initialQuery?: string }) {
  const [pending, startTransition] = useTransition();
  const [raw, setRaw] = useState(initialQuery); // prefill from ?q (warehouse home)
  const [result, setResult] = useState<BulkSearchResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runSearch = useCallback((input: string) => {
    setErr(null);
    setResult(null);
    startTransition(async () => {
      const res = await adminBulkTrackingSearch({ raw_input: input });
      if (res.ok && res.data) {
        setResult(res.data);
      } else if (!res.ok) {
        setErr(res.error);
      }
    });
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(raw);
  }

  function clear() {
    setRaw("");
    setResult(null);
    setErr(null);
  }

  return (
    <div className="space-y-4">
      {/* Input form */}
      <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">วาง tracking numbers</span>
          <textarea
            rows={8}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            disabled={pending}
            placeholder={"SF1234567890\nJD9876543210\n..."}
            className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            required
          />
          <span className="text-[11px] text-muted">
            แยกด้วย newline / comma / space ก็ได้ — ระบบจะ dedup ให้
          </span>
        </label>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || !raw.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "กำลังค้น..." : "🔍 ค้นหา"}
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={pending}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt"
          >
            ล้าง
          </button>
        </div>
      </form>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="text-xs text-muted">
            ค้นหา {result.searched} เลข ·
            พบ {result.searched - result.unmatched.length} เลข ·
            ไม่พบ {result.unmatched.length} เลข
          </div>

          {/* Matched */}
          {result.rows.some((r) => r.matches.length > 0) && (
            <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-green-50/30">
                <h2 className="font-bold text-sm text-green-800">✓ พบ</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-3">Tracking</th>
                      <th className="px-4 py-3">พบใน</th>
                      <th className="px-4 py-3">F-No</th>
                      <th className="px-4 py-3">ลูกค้า</th>
                      <th className="px-4 py-3">สถานะ</th>
                      <th className="px-4 py-3 text-right">ยอด</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.flatMap((r) =>
                      r.matches.map((m, idx) => (
                        <tr key={`${r.tracking}-${m.forwarder_id}-${idx}`} className="border-t border-border align-top">
                          <td className="px-4 py-3 text-xs font-mono">{r.tracking}</td>
                          <td className="px-4 py-3 text-xs">
                            {FOUND_IN_LABEL[m.found_in]}
                            {m.item_name && (
                              <div className="text-[11px] text-muted">{m.item_name}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-mono">{m.f_no}</td>
                          <td className="px-4 py-3 text-xs">
                            {m.customer_member && <div className="font-mono text-muted">{m.customer_member}</div>}
                            <div>{m.customer_name}</div>
                            {m.customer_phone && <div className="text-muted">{m.customer_phone}</div>}
                          </td>
                          <td className="px-4 py-3 text-xs">{STATUS_LABEL[m.status] ?? m.status}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">
                            ฿{m.total_price.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/admin/forwarders/${m.f_no}`}
                              className="rounded-lg border border-border px-2 py-1 text-[11px] hover:bg-surface-alt"
                            >
                              ดู →
                            </Link>
                          </td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Unmatched */}
          {result.unmatched.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2">
              <h2 className="font-bold text-sm text-amber-900">
                ⚠️ ไม่พบใน Pacred ({result.unmatched.length} เลข)
              </h2>
              <p className="text-xs text-amber-800">
                tracking เหล่านี้ไม่ตรงกับ forwarder/item ใดในระบบ — อาจยังไม่ได้บันทึก
                หรือเลขไม่ถูกต้อง
              </p>
              <div className="rounded-lg border border-amber-200 bg-white p-3 max-h-64 overflow-auto">
                <ul className="text-xs font-mono space-y-0.5">
                  {result.unmatched.map((t) => <li key={t}>{t}</li>)}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(result.unmatched.join("\n"))}
                className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs hover:bg-amber-100"
              >
                📋 คัดลอก unmatched
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
