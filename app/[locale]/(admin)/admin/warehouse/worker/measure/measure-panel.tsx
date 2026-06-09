"use client";

/**
 * <MeasurePanel> — the ชั่ง/วัด data-entry island (W10 worker app).
 *
 * Worker selects a shipment (clicks a queue row to pre-fill the fid) and
 * enters weight + W/L/H (cm). CBM previews live (w·l·h/1e6). Confirm-before-
 * mutate (§0f) → `warehouseMeasure` writes tb_forwarder dims only — no money.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Calculator } from "lucide-react";
import { warehouseMeasure } from "@/actions/admin/warehouse-intake";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

type Row = {
  id: number; tracking: string; userid: string; detail: string;
  amount: number; weight: number; volume: number;
};

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function MeasurePanel({ queue }: { queue: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  const [fid, setFid] = useState("");
  const [weight, setWeight] = useState("");
  const [width, setWidth] = useState("");
  const [length, setLength] = useState("");
  const [height, setHeight] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);

  const cbm = (num(width) * num(length) * num(height)) / 1_000_000;
  const cbmStr = cbm > 0 ? cbm.toFixed(5) : "0.00000";

  function pick(r: Row) {
    setFid(String(r.id));
    setWeight(r.weight > 0 ? String(r.weight) : "");
    setLastResult(null);
  }

  async function save() {
    const id = parseInt(fid, 10);
    if (!id || id <= 0) {
      await alert("กรุณาเลือก/พิมพ์เลขรายการ (fid)");
      return;
    }
    if (num(weight) <= 0 && cbm <= 0) {
      await alert("กรุณากรอกน้ำหนัก หรือขนาด");
      return;
    }
    const ok = await confirm(
      `บันทึกขนาด/น้ำหนักของรายการ #${id}?\n\nน้ำหนัก: ${num(weight)} กก.\nกว้าง×ยาว×สูง: ${num(width)}×${num(length)}×${num(height)} ซม.\nCBM: ${cbmStr} m³\n\n(บันทึกขนาดเท่านั้น — ไม่กระทบราคา/ต้นทุน)`,
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await warehouseMeasure({
        fid: id,
        weightKg: num(weight),
        widthCm: num(width),
        lengthCm: num(length),
        heightCm: num(height),
      });
      if (res.ok && res.data) {
        setLastResult(`✓ บันทึกแล้ว #${id} · CBM ${res.data.cbm.toFixed(5)}`);
        setWidth(""); setLength(""); setHeight(""); setWeight(""); setFid("");
        router.refresh();
      } else {
        setLastResult(null);
        await alert(`บันทึกไม่สำเร็จ: ${res.ok ? "ไม่ทราบสาเหตุ" : res.error}`);
      }
    });
  }

  return (
    <>
      {dialogs}

      {/* form */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">รายการ (fid)</label>
            <input value={fid} onChange={(e) => setFid(e.target.value)} inputMode="numeric"
              placeholder="เลขรายการ"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">น้ำหนัก (กก.)</label>
            <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">กว้าง (ซม.)</label>
            <input value={width} onChange={(e) => setWidth(e.target.value)} inputMode="decimal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ยาว (ซม.)</label>
            <input value={length} onChange={(e) => setLength(e.target.value)} inputMode="decimal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">สูง (ซม.)</label>
            <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-gray-700">
            CBM: <span className="font-semibold text-emerald-700">{cbmStr} m³</span>
          </div>
          <div className="flex items-center gap-3">
            {lastResult && <span className="text-sm text-green-700">{lastResult}</span>}
            <button type="button" disabled={pending} onClick={() => void save()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <Calculator className="h-4 w-4" />
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        </div>
      </div>

      {/* queue */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-700">รอชั่ง/วัด — ถึงโกดังจีน ({queue.length})</h2>
        </div>
        {queue.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">ไม่มีรายการรอชั่ง/วัด</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Tracking</th>
                  <th className="px-3 py-2 text-left font-medium">ลูกค้า</th>
                  <th className="px-3 py-2 text-right font-medium">น้ำหนัก</th>
                  <th className="px-3 py-2 text-right font-medium">CBM</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {queue.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-gray-700">{r.id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.tracking || "—"}</td>
                    <td className="px-3 py-2">{r.userid || "—"}</td>
                    <td className="px-3 py-2 text-right">{r.weight > 0 ? r.weight : "—"}</td>
                    <td className="px-3 py-2 text-right">{r.volume > 0 ? r.volume : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => pick(r)}
                        className="rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                        เลือก
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
