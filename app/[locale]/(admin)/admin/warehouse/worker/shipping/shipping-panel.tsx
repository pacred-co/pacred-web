"use client";

/**
 * <ShippingPanel> — ใส่ตู้/ออกของ/ถึงไทย island (W10 worker app).
 *
 * Per-row: assign a container number (refuses locked · §0150), depart China
 * (2→3), arrive TH (3→4). All confirm-before-mutate (§0f) · G5-gated server
 * actions. No money mutation.
 */

import { useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Truck, Container, PackageCheck, Lock } from "lucide-react";
import {
  warehouseAssignContainer,
  warehouseAdvanceTransit,
} from "@/actions/admin/warehouse-intake";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

/**
 * Local extension of useConfirmDialogs adding a `prompt`. The shared
 * useConfirmDialogs only exposes confirm/alert; container assignment needs a
 * text prompt. The container-number text entry is a low-risk value (not the
 * mutation itself) — the styled confirm right after it is the §0f gate.
 */
function useConfirmDialogsWithPrompt() {
  const base = useConfirmDialogs();
  function prompt(message: string, def = ""): Promise<string | null> {
    if (typeof window === "undefined") return Promise.resolve(null);
    return Promise.resolve(window.prompt(message, def));
  }
  return { ...base, prompt };
}

type Row = {
  id: number; tracking: string; userid: string; container: string;
  locked: boolean; weight: number; cbm: number;
};

/** ขาด/ครบ ของตู้ (พี่ป๊อป spec §2.1) — ชมพู=ขาด · ขาว=ครบ. คลังเห็นความครบ
 *  ของตู้บนมือถือ (reuse lib/warehouse/container-completeness · read-only). */
type Completeness = { expected: number; scanned: number; isComplete: boolean };
function CompletenessPill({ c }: { c?: Completeness }) {
  if (!c || c.expected === 0) return null;
  const missing = Math.max(0, c.expected - c.scanned);
  return c.isComplete ? (
    <span className="ml-1.5 inline-flex items-center rounded-full border border-emerald-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
      ✓ ครบ {c.scanned}/{c.expected}
    </span>
  ) : (
    <span className="ml-1.5 inline-flex items-center rounded-full border border-pink-300 bg-pink-100 px-1.5 py-0.5 text-[11px] font-medium text-pink-700">
      ขาด {missing} · {c.scanned}/{c.expected}
    </span>
  );
}

export function ShippingPanel({
  readyQueue,
  transitQueue,
  completenessByContainer,
}: {
  readyQueue: Row[];
  transitQueue: Row[];
  completenessByContainer: Record<string, Completeness>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, alert, prompt, dialogs } = useConfirmDialogsWithPrompt();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else await alert(`ไม่สำเร็จ: ${res.error ?? "ไม่ทราบสาเหตุ"}`);
    });
  }

  async function assign(r: Row) {
    if (r.locked) { await alert("เลขตู้ถูกล็อกไว้ (fcabinet_locked) — แก้ไม่ได้"); return; }
    const cn = await prompt(`ใส่เลขตู้คอนเทนเนอร์ของรายการ #${r.id}:`, r.container);
    if (cn == null) return;
    const v = cn.trim();
    if (!v) { await alert("กรุณากรอกเลขตู้"); return; }
    const ok = await confirm(`ใส่รายการ #${r.id} เข้าตู้ "${v}"?`);
    if (ok) run(() => warehouseAssignContainer({ fid: r.id, containerNo: v }));
  }

  async function depart(r: Row) {
    const ok = await confirm(`ยืนยันออกจากจีน รายการ #${r.id}?\nสถานะ → "กำลังส่งมาไทย"`);
    if (ok) run(() => warehouseAdvanceTransit({ fid: r.id, kind: "depart" }));
  }

  async function arrive(r: Row) {
    const ok = await confirm(`ยืนยันถึงไทยแล้ว รายการ #${r.id}?\nสถานะ → "ถึงไทยแล้ว"`);
    if (ok) run(() => warehouseAdvanceTransit({ fid: r.id, kind: "arrive" }));
  }

  return (
    <>
      {dialogs}

      {/* ready to load / depart */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <Container className="h-4 w-4 text-purple-500" />
          <h2 className="text-sm font-medium text-gray-700">ถึงโกดังจีน — ใส่ตู้ / ออกของ ({readyQueue.length})</h2>
        </div>
        {readyQueue.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Tracking</th>
                  <th className="px-3 py-2 text-left font-medium">ตู้</th>
                  <th className="px-3 py-2 text-right font-medium">น้ำหนัก</th>
                  <th className="px-3 py-2 text-right font-medium">CBM</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {readyQueue.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-gray-700">{r.id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.tracking || "—"}</td>
                    <td className="px-3 py-2">
                      {r.container || "—"}
                      {r.locked && <Lock className="inline h-3 w-3 ml-1 text-gray-400" />}
                      {r.container && <CompletenessPill c={completenessByContainer[r.container]} />}
                    </td>
                    <td className="px-3 py-2 text-right">{r.weight > 0 ? r.weight : "—"}</td>
                    <td className="px-3 py-2 text-right">{r.cbm > 0 ? r.cbm : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" disabled={pending || r.locked} onClick={() => void assign(r)}
                          className="rounded border border-purple-300 px-2 py-1 text-xs text-purple-700 hover:bg-purple-50 disabled:opacity-50">
                          ใส่ตู้
                        </button>
                        <button type="button" disabled={pending} onClick={() => void depart(r)}
                          className="inline-flex items-center gap-1 rounded bg-purple-600 px-2 py-1 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
                          <Truck className="h-3 w-3" /> ออกจากจีน
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* in transit → arrive */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <PackageCheck className="h-4 w-4 text-cyan-500" />
          <h2 className="text-sm font-medium text-gray-700">กำลังส่งมาไทย — ยืนยันถึงไทย ({transitQueue.length})</h2>
        </div>
        {transitQueue.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400">ไม่มีรายการ</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Tracking</th>
                  <th className="px-3 py-2 text-left font-medium">ตู้</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transitQueue.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2 text-gray-700">{r.id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.tracking || "—"}</td>
                    <td className="px-3 py-2">
                      {r.container || "—"}
                      {r.container && <CompletenessPill c={completenessByContainer[r.container]} />}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" disabled={pending} onClick={() => void arrive(r)}
                        className="inline-flex items-center gap-1 rounded bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50">
                        <PackageCheck className="h-3 w-3" /> ถึงไทยแล้ว
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
