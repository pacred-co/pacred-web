"use client";

/**
 * Client island for the "ค้นหารายการที่ต้องการเชื่อม" modal on
 * `/admin/forwarders/warehouse-history`.
 *
 * Faithful-port mapping (forwarder-import-warehouse.php L545-554 +
 * include/pages/forwarder/getListForwarderIm.php L1-181):
 *   - Trigger: the page renders an opener button on each ORPHAN row;
 *     clicking opens this modal pre-filled with the orphan scan's
 *     `keysearch` tracking string + the scan ID for the relink call.
 *   - Search box: free text, debounced 300ms, fires
 *     `adminSearchForwarderForScan`. Search runs against fIDorCO +
 *     fTrackingCHN (same two columns as the legacy default search).
 *   - Results table: one row per matching `tb_forwarder`. Each row's
 *     "เลือก" button calls `adminRelinkScan` with the scan ID + the
 *     row's forwarder ID.
 *
 * UX notes:
 *   - Debounce is 300ms (vs the legacy live-search which fires on every
 *     keystroke); good enough at admin scale.
 *   - Modal closes on backdrop click + Esc; the open/close hooks reset
 *     the search state so re-opening starts fresh.
 *   - On successful relink we close the modal + router.refresh() to
 *     re-fetch the Server Component (the orphan row will move to the
 *     MATCHED section after the refresh).
 *
 * Without Bootstrap JS / magnific-popup the modal is implemented as a
 * plain `<dialog>` with a small portal-free render — sufficient for the
 * admin use-case and avoids pulling in a 90KB jQuery dependency.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  adminRelinkScan,
  adminSearchForwarderForScan,
  type ForwarderSearchRow,
} from "@/actions/admin/warehouse-history";

type Props = {
  open: boolean;
  onClose: () => void;
  scanId: number | null;
  initialQuery: string;
};

export function WarehouseHistoryRelinkModal({
  open,
  onClose,
  scanId,
  initialQuery,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [rows, setRows] = useState<ForwarderSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync the dialog's open state with props.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Re-seed with the orphan scan's keysearch on each open + auto-search
      setQuery(initialQuery);
      setError(null);
    } else if (!open && d.open) {
      d.close();
      setRows([]);
    }
  }, [open, initialQuery]);

  // Debounced search — fires 300ms after the last keystroke (or on
  // initial open with a non-empty seed). All setState calls live inside
  // the async setTimeout callback so the effect body itself never calls
  // setState synchronously (lint: react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    let cancelled = false;
    const id = setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length === 0) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;
      setLoading(true);
      const res = await adminSearchForwarderForScan({
        query: trimmed,
        limit: 30,
      });
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setRows(res.data?.rows ?? []);
        setError(null);
      } else {
        setRows([]);
        setError(res.error ?? "ค้นหาผิดพลาด");
      }
    }, 300);
    debounceRef.current = id;
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  function handleRelink(fid: number) {
    if (scanId == null || pending) return;
    start(async () => {
      const res = await adminRelinkScan({ scanId, fid });
      if (!res.ok) {
        window.alert(`ผิดพลาด: ${res.error ?? "กรุณาลองใหม่ภายหลัง"}`);
        return;
      }
      window.alert("สำเร็จ\nเชื่อมรายการแล้ว");
      onClose();
      router.refresh();
    });
  }

  // Close on backdrop click — native <dialog> emits a "click" with
  // target===dialog when the user clicks the backdrop area.
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleDialogClick}
      onClose={onClose}
      style={{
        width: "min(960px, 95vw)",
        maxHeight: "90vh",
        padding: 0,
        border: "1px solid #ddd",
        borderRadius: 4,
      }}
    >
      {/* Wave 20 P1 — Tailwind rewrite (was Bootstrap modal classes). */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 border-b border-border pb-3 mb-3">
          <h4 className="text-base font-semibold">
            ค้นหา <span className="font-mono text-rose-700">{initialQuery || "—"}</span> รายการที่ต้องการเชื่อมข้อมูล
          </h4>
          <button
            type="button"
            aria-label="ปิด"
            onClick={onClose}
            className="rounded-md border border-border bg-white px-2 py-1 text-xs hover:bg-surface-alt"
          >
            ✕
          </button>
        </div>

        <div className="max-w-md mx-auto">
          <label className="block text-xs font-medium text-muted mb-1" htmlFor="modal-search">
            ตัวเลือกค้นหา (เลข ID CO / เลขแทรคกิ้ง)
          </label>
          <input
            type="text"
            id="modal-search"
            placeholder="คำค้นหา"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          />
        </div>

        {loading && (
          <div className="text-center mt-3">
            <span className="text-rose-700 text-sm">กำลังค้นหา…</span>
          </div>
        )}
        {error && (
          <div className="text-center mt-3">
            <span className="text-rose-700 text-sm">{error}</span>
          </div>
        )}

        <div className="overflow-x-auto scrollbar-x-visible mt-3 border border-border rounded-lg">
          <table className="min-w-[900px] w-full text-xs">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-3 py-2 text-center font-semibold">ID</th>
                <th className="px-3 py-2 text-center font-semibold">เลขตู้</th>
                <th className="px-3 py-2 text-center font-semibold">ID CO</th>
                <th className="px-3 py-2 text-left font-semibold">เลขพัสดุ (จีน)</th>
                <th className="px-3 py-2 text-center font-semibold">กล่อง</th>
                <th className="px-3 py-2 text-left font-semibold">ลูกค้า</th>
                <th className="px-3 py-2 text-left font-semibold">รายละเอียด</th>
                <th className="px-3 py-2 text-center font-semibold">ตัวเลือก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted">
                    {query.trim().length === 0
                      ? "กรอกคำค้นหาเพื่อแสดงรายการ"
                      : "ไม่พบรายการ"}
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-alt">
                  <td className="px-3 py-2 text-center font-mono">#{r.id}</td>
                  <td className="px-3 py-2 text-center">{r.fcabinetnumber}</td>
                  <td className="px-3 py-2 text-center">{r.fidorco ?? ""}</td>
                  <td className="px-3 py-2 font-mono text-[11px] break-all">{r.ftrackingchn}</td>
                  <td className="px-3 py-2 text-center">{r.famount}</td>
                  <td className="px-3 py-2">{r.userid}</td>
                  <td className="px-3 py-2">
                    <div className="line-clamp-2 max-w-[240px]">{r.fdetail}</div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleRelink(r.id)}
                      className={`rounded-md bg-amber-500 text-white px-3 py-1 text-xs font-medium hover:bg-amber-600 transition-colors ${pending ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {pending ? "กำลังเชื่อม…" : "เลือก"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );
}
