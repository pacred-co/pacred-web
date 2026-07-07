"use client";

/**
 * <ArriveThScanPanel> — ยิงรับเข้าไทย (พี่ป๊อป spec §2 · TH-warehouse arrival).
 *
 * Worker scans/types a China tracking (or order id) → warehouseArriveThScan
 * flips fstatus 3→4 (ถึงไทยแล้ว = น้ำตาล), gated + audited. Confirm-before-mutate
 * (§0f). Camera + USB scanner (mirrors the China intake panel). NO money.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Camera, PackageCheck } from "lucide-react";
import { warehouseArriveThScan } from "@/actions/admin/warehouse-intake";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { CameraScanner } from "@/components/admin/camera-scanner";

export function ArriveThScanPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [keysearch, setKeysearch] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function doArrive() {
    const k = keysearch.trim();
    if (!k) {
      await alert("กรุณาสแกน/พิมพ์เลข tracking หรือรหัสออเดอร์");
      return;
    }
    const ok = await confirm(
      `ยืนยันรับสินค้าเข้าโกดังไทย?\n\nTracking/รหัส: ${k}\n\nสถานะจะเปลี่ยนเป็น "ถึงไทยแล้ว"`,
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await warehouseArriveThScan({ keysearch: k });
      if (res.ok && res.data) {
        setLastResult(`✓ รับเข้าไทยแล้ว #${res.data.fid} (สถานะ → ถึงไทยแล้ว)`);
        setKeysearch("");
        inputRef.current?.focus();
        router.refresh();
      } else {
        setLastResult(null);
        await alert(`รับเข้าไทยไม่สำเร็จ: ${res.ok ? "ไม่ทราบสาเหตุ" : res.error}`);
      }
    });
  }

  return (
    <>
      {dialogs}
      <div className="space-y-3">
        {/* Camera scanner — mobile back camera + native BarcodeDetector. */}
        <div className="rounded-xl border border-amber-200 bg-white p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
            <Camera className="h-4 w-4" />
            สแกนบาร์โค้ด/QR ด้วยกล้องมือถือ — หรือเชื่อม USB scanner ก็ได้
          </div>
          <CameraScanner
            onDetected={(code) => {
              setKeysearch(code);
              inputRef.current?.focus();
              inputRef.current?.select();
            }}
          />
        </div>

        {/* Confirm box — review the scanned tracking, submit → ถึงไทยแล้ว */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-800">
            <PackageCheck className="h-4 w-4" />
            ยืนยันรับเข้าโกดังไทย (→ ถึงไทยแล้ว)
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              เลข Tracking / รหัสออเดอร์
              {keysearch && <span className="ml-1 text-[11px] text-emerald-700">(จากกล้อง · แก้ได้)</span>}
            </label>
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              value={keysearch}
              onChange={(e) => setKeysearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void doArrive();
                }
              }}
              placeholder="ส่องกล้องด้านบน · หรือพิมพ์ tracking ตรงนี้"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              disabled={pending || !keysearch.trim()}
              onClick={() => void doArrive()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#8d6e63] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6d4c41] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PackageCheck className="h-4 w-4" />
              {pending ? "กำลังรับเข้า…" : "รับเข้าโกดังไทย"}
            </button>
            {lastResult && <span className="text-sm text-green-700">{lastResult}</span>}
          </div>
        </div>
      </div>
    </>
  );
}
