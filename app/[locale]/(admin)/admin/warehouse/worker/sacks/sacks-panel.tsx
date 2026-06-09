"use client";

/**
 * <SacksPanel> — งานกระสอบ island (W10 worker app).
 *
 * Create a sack · pack an item (tb_forwarder_item.id) into a sack · seal /
 * re-open (supervisor). All confirm-before-mutate (§0f). Sacks carry
 * weight/CBM/count only — no money. Print logs a sack-tag print event.
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Boxes, PackagePlus, Lock, Unlock, Printer } from "lucide-react";
import {
  warehouseCreateSack,
  warehousePackItemIntoSack,
  warehouseSealSack,
  warehouseUnsealSack,
  warehouseLogLabelPrint,
} from "@/actions/admin/warehouse-intake";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

type Sack = {
  id: number; sackNo: string; warehouse: string; container: string;
  weight: number; cbm: number; count: number; sealed: boolean; createdAt: string;
};

function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }); }
  catch { return iso; }
}

export function SacksPanel({ sacks, isSupervisor }: { sacks: Sack[]; isSupervisor: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, dialogs } = useConfirmDialogs();

  const [warehouseCode, setWarehouseCode] = useState("");
  const [packSackId, setPackSackId] = useState("");
  const [packItemId, setPackItemId] = useState("");

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        router.refresh();
        if (okMsg) await alert(okMsg);
      } else {
        await alert(`ไม่สำเร็จ: ${res.error ?? "ไม่ทราบสาเหตุ"}`);
      }
    });
  }

  async function createSack() {
    const ok = await confirm(`สร้างกระสอบใหม่${warehouseCode ? ` (โกดัง ${warehouseCode})` : ""}?`);
    if (!ok) return;
    startTransition(async () => {
      const res = await warehouseCreateSack({ warehouseCode });
      if (res.ok && res.data) {
        router.refresh();
        setPackSackId(String(res.data.sackId));
        await alert(`สร้างกระสอบ ${res.data.sackNo} แล้ว`);
      } else {
        await alert(`สร้างไม่สำเร็จ: ${res.ok ? "ไม่ทราบสาเหตุ" : res.error}`);
      }
    });
  }

  async function packItem() {
    const sid = parseInt(packSackId, 10);
    const iid = parseInt(packItemId, 10);
    if (!sid || !iid) { await alert("กรอกเลขกระสอบ + เลขสินค้า (item id)"); return; }
    const ok = await confirm(`จัดสินค้า #${iid} ลงกระสอบ #${sid}?`);
    if (!ok) return;
    startTransition(async () => {
      const res = await warehousePackItemIntoSack({ sackId: sid, itemId: iid });
      if (res.ok) { setPackItemId(""); router.refresh(); }
      else await alert(`ไม่สำเร็จ: ${res.error}`);
    });
  }

  async function seal(s: Sack) {
    const ok = await confirm(`ซีลกระสอบ ${s.sackNo}? (${s.count} ชิ้น · ${s.weight} กก. · ${s.cbm} m³)\nหลังซีลจะแก้ไขไม่ได้`);
    if (ok) run(() => warehouseSealSack({ sackId: s.id }));
  }

  async function unseal(s: Sack) {
    const ok = await confirm(`เปิดซีลกระสอบ ${s.sackNo}? (หัวหน้างานเท่านั้น)`);
    if (ok) run(() => warehouseUnsealSack({ sackId: s.id }));
  }

  async function printTag(s: Sack) {
    const ok = await confirm(`บันทึกการพิมพ์ป้ายกระสอบ ${s.sackNo}?`);
    if (ok) run(() => warehouseLogLabelPrint({ labelKind: "sack_tag", sackId: s.id }), "บันทึกการพิมพ์แล้ว");
  }

  return (
    <>
      {dialogs}

      {/* create + pack */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
          <div className="text-sm font-medium text-amber-800 flex items-center gap-1.5"><Boxes className="h-4 w-4" /> สร้างกระสอบ</div>
          <div className="flex gap-2">
            <select value={warehouseCode} onChange={(e) => setWarehouseCode(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">— ไม่ระบุโกดัง —</option>
              <option value="1">กวางโจว (1)</option>
              <option value="2">อี้อู (2)</option>
              <option value="3">เซินเจิ้น (3)</option>
              <option value="4">โกดังอื่น (4)</option>
            </select>
            <button type="button" disabled={pending} onClick={() => void createSack()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              <PackagePlus className="h-4 w-4" /> สร้าง
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="text-sm font-medium text-gray-700">จัดของลงกระสอบ</div>
          <div className="flex flex-wrap gap-2">
            <input value={packSackId} onChange={(e) => setPackSackId(e.target.value)} inputMode="numeric"
              placeholder="เลขกระสอบ (sack id)"
              className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input value={packItemId} onChange={(e) => setPackItemId(e.target.value)} inputMode="numeric"
              placeholder="เลขสินค้า (item id)"
              className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <button type="button" disabled={pending} onClick={() => void packItem()}
              className="rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50">
              ใส่กระสอบ
            </button>
          </div>
        </div>
      </div>

      {/* sack list */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-medium text-gray-700">กระสอบล่าสุด ({sacks.length})</h2>
        </div>
        {sacks.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">ยังไม่มีกระสอบ</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">เลขกระสอบ</th>
                  <th className="px-3 py-2 text-left font-medium">โกดัง</th>
                  <th className="px-3 py-2 text-left font-medium">ตู้</th>
                  <th className="px-3 py-2 text-right font-medium">ชิ้น</th>
                  <th className="px-3 py-2 text-right font-medium">น้ำหนัก</th>
                  <th className="px-3 py-2 text-right font-medium">CBM</th>
                  <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                  <th className="px-3 py-2 text-left font-medium">สร้างเมื่อ</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sacks.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2 font-mono text-xs">{s.sackNo} <span className="text-gray-400">#{s.id}</span></td>
                    <td className="px-3 py-2">{s.warehouse || "—"}</td>
                    <td className="px-3 py-2">{s.container || "—"}</td>
                    <td className="px-3 py-2 text-right">{s.count}</td>
                    <td className="px-3 py-2 text-right">{s.weight}</td>
                    <td className="px-3 py-2 text-right">{s.cbm}</td>
                    <td className="px-3 py-2">
                      {s.sealed
                        ? <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700"><Lock className="h-3 w-3" /> ซีลแล้ว</span>
                        : <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">เปิดอยู่</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{fmtTime(s.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" disabled={pending} onClick={() => void printTag(s)} title="พิมพ์ป้าย"
                          className="rounded border border-gray-300 p-1.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        {!s.sealed ? (
                          <button type="button" disabled={pending} onClick={() => void seal(s)}
                            className="rounded border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-50">
                            <Lock className="inline h-3 w-3 mr-0.5" /> ซีล
                          </button>
                        ) : isSupervisor ? (
                          <button type="button" disabled={pending} onClick={() => void unseal(s)}
                            className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50">
                            <Unlock className="inline h-3 w-3 mr-0.5" /> เปิดซีล
                          </button>
                        ) : null}
                      </div>
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
