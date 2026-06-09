"use client";

/**
 * <IntakeScanPanel> — the receiving scan box (W10 worker app).
 *
 * Worker scans/types a China tracking (or order id) + optional warehouse code,
 * confirms, and `warehouseIntakeScan` marks the shipment received at the CN
 * warehouse (fstatus 1→2, gated + audited). Confirm-before-mutate (§0f) via
 * the shared useConfirmDialogs. Scanner-friendly: Enter submits, the input
 * re-focuses after each scan for rapid-fire intake.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { ScanLine } from "lucide-react";
import { warehouseIntakeScan } from "@/actions/admin/warehouse-intake";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

// CN warehouse codes (tb_forwarder.fwarehousename · varchar(1)). '' = ไม่ระบุ.
const WAREHOUSES: Array<{ code: string; label: string }> = [
  { code: "", label: "— ไม่ระบุโกดัง —" },
  { code: "1", label: "กวางโจว (1)" },
  { code: "2", label: "อี้อู (2)" },
  { code: "3", label: "เซินเจิ้น (3)" },
  { code: "4", label: "โกดังอื่น (4)" },
];

export function IntakeScanPanel() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [keysearch, setKeysearch] = useState("");
  const [warehouseCode, setWarehouseCode] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function doIntake() {
    const k = keysearch.trim();
    if (!k) {
      await alert("กรุณาสแกน/พิมพ์เลข tracking หรือรหัสออเดอร์");
      return;
    }
    const ok = await confirm(
      `ยืนยันรับสินค้าเข้าโกดังจีน?\n\nTracking/รหัส: ${k}\nโกดัง: ${WAREHOUSES.find((w) => w.code === warehouseCode)?.label ?? "—"}\n\nสถานะจะเปลี่ยนเป็น "สินค้าถึงโกดังจีน"`,
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await warehouseIntakeScan({ keysearch: k, warehouseCode });
      if (res.ok && res.data) {
        setLastResult(
          `✓ รับเข้าแล้ว #${res.data.fid}${res.data.statusFlipped ? " (เปลี่ยนสถานะ → ถึงโกดังจีน)" : " (อัปเดตโกดัง · สถานะเดิม)"}`,
        );
        setKeysearch("");
        inputRef.current?.focus();
        router.refresh();
      } else {
        setLastResult(null);
        await alert(`รับเข้าไม่สำเร็จ: ${res.ok ? "ไม่ทราบสาเหตุ" : res.error}`);
      }
    });
  }

  return (
    <>
      {dialogs}
      <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">เลข Tracking / รหัสออเดอร์</label>
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              autoFocus
              value={keysearch}
              onChange={(e) => setKeysearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void doIntake();
                }
              }}
              placeholder="สแกนบาร์โค้ด หรือพิมพ์เลข tracking…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="sm:w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">โกดังจีน</label>
            <select
              value={warehouseCode}
              onChange={(e) => setWarehouseCode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {WAREHOUSES.map((w) => (
                <option key={w.code} value={w.code}>{w.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void doIntake()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <ScanLine className="h-4 w-4" />
            {pending ? "กำลังรับเข้า…" : "รับเข้าโกดัง"}
          </button>
          {lastResult && <span className="text-sm text-green-700">{lastResult}</span>}
        </div>
      </div>
    </>
  );
}
