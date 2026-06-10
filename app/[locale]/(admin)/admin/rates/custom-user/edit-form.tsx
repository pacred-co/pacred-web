"use client";

/**
 * /admin/rates/custom-user — VIP-tier matrix edit form (Wave 12-D)
 *
 * Inline-edit table: each cell shows KG + CBM number inputs. As soon as
 * any input differs from the original value, the cell is highlighted +
 * a sticky save bar appears showing the count of dirty cells. Submit
 * sends ONLY the changed cells to adminUpdateVipRateCells; the action
 * splits them into UPDATE-by-id or INSERT-new behind the scenes.
 *
 * Design philosophy (docs/learnings/pacred-design-philosophy.md):
 *   - Legacy edit one cell at a time via two separate modal forms (KG / CBM)
 *     for ONE row at a time. We collapse the whole matrix into one screen
 *     + one save click. Same DB end-state, better daily ergonomics.
 *   - Tailwind + Lucide + clear "ก่อน → ใหม่" diff preview.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminUpdateVipRateCells } from "@/actions/admin/rate-edits";
// V-D2 — product-type labels are canonical (lib/warehouse/rate-dimensions.ts);
// warehouse/transport keep their local "(English)" display variants here.
import { RATE_PRODUCT_LABEL } from "@/lib/warehouse/rate-dimensions";

// Warehouse encoding (legacy + price engine truth): 1=กวางโจว, 2=อี้อู.
// (Was labelled BACKWARDS here → admin edited the wrong warehouse's VIP rate.
// Fixed 2026-06-05 to match lib/admin/customer-rate-tables.ts + the engine.)
const WAREHOUSE_LABEL: Record<string, string> = {
  "1": "กวางโจว (Guangzhou)",
  "2": "อี้อู (Yiwu)",
};
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};
const PRODUCT_LABEL: Record<string, string> = RATE_PRODUCT_LABEL;

type Wh = "1" | "2";
type Tt = "1" | "2" | "3";
type Pt = "1" | "2" | "3" | "4";

export type VipCellInitial = {
  sourcewarehouse: Wh;
  rtransporttype: Tt;
  rproductstype: Pt;
  rkg: number | null;
  rcbm: number | null;
  rkg_admin: string | null;
  rcbm_admin: string | null;
};

const inputCls =
  "w-24 rounded-md border border-border bg-white dark:bg-surface px-2 py-1 text-sm text-right font-mono " +
  "focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500";
const inputDirtyCls =
  "w-24 rounded-md border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 text-sm text-right font-mono " +
  "focus:outline-none focus:ring-2 focus:ring-amber-500/50";

function key(w: Wh, t: Tt, p: Pt) {
  return `${w}|${t}|${p}`;
}

function parseInputToNumber(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function VipRateEditForm({
  coid,
  cells,
}: {
  coid: string;
  cells: VipCellInitial[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Build a complete 2×3×4 grid (24 cells), seeded from `cells` props.
  // Missing cells start as null (not yet set in DB) so the operator can
  // type a value to seed them.
  const initial = useMemo(() => {
    const idx = new Map<string, VipCellInitial>();
    for (const c of cells) idx.set(key(c.sourcewarehouse, c.rtransporttype, c.rproductstype), c);
    return idx;
  }, [cells]);

  const initialKg = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, c] of initial.entries()) m.set(k, c.rkg != null ? String(Number(c.rkg)) : "");
    return m;
  }, [initial]);
  const initialCbm = useMemo(() => {
    const m = new Map<string, string>();
    for (const [k, c] of initial.entries()) m.set(k, c.rcbm != null ? String(Number(c.rcbm)) : "");
    return m;
  }, [initial]);

  const [kgInputs, setKgInputs] = useState<Map<string, string>>(() => new Map(initialKg));
  const [cbmInputs, setCbmInputs] = useState<Map<string, string>>(() => new Map(initialCbm));

  function setKg(k: string, v: string) {
    setKgInputs((prev) => {
      const next = new Map(prev);
      next.set(k, v);
      return next;
    });
  }
  function setCbm(k: string, v: string) {
    setCbmInputs((prev) => {
      const next = new Map(prev);
      next.set(k, v);
      return next;
    });
  }

  // Dirty diff
  const dirtyCells = useMemo(() => {
    const out: Array<{
      k: string;
      w: Wh;
      t: Tt;
      p: Pt;
      kg: { before: number | null; after: number | null } | null;
      cbm: { before: number | null; after: number | null } | null;
    }> = [];
    for (const w of ["1", "2"] as const) {
      for (const t of ["1", "2", "3"] as const) {
        for (const p of ["1", "2", "3", "4"] as const) {
          const k = key(w, t, p);
          const oldKgStr = initialKg.get(k) ?? "";
          const newKgStr = kgInputs.get(k) ?? "";
          const oldCbmStr = initialCbm.get(k) ?? "";
          const newCbmStr = cbmInputs.get(k) ?? "";
          const kgChanged = oldKgStr !== newKgStr;
          const cbmChanged = oldCbmStr !== newCbmStr;
          if (kgChanged || cbmChanged) {
            out.push({
              k,
              w,
              t,
              p,
              kg: kgChanged
                ? { before: parseInputToNumber(oldKgStr), after: parseInputToNumber(newKgStr) }
                : null,
              cbm: cbmChanged
                ? { before: parseInputToNumber(oldCbmStr), after: parseInputToNumber(newCbmStr) }
                : null,
            });
          }
        }
      }
    }
    return out;
  }, [kgInputs, cbmInputs, initialKg, initialCbm]);

  function reset() {
    setKgInputs(new Map(initialKg));
    setCbmInputs(new Map(initialCbm));
    setError(null);
    setSuccess(null);
  }

  function submit() {
    setError(null);
    setSuccess(null);
    setShowConfirm(false);

    if (dirtyCells.length === 0) {
      setError("ยังไม่มีการแก้ไข — เปลี่ยนค่าก่อนกดบันทึก");
      return;
    }

    const payload = dirtyCells.map((c) => ({
      sourcewarehouse: c.w,
      rtransporttype: c.t,
      rproductstype: c.p,
      rkg: c.kg ? c.kg.after : null,
      rcbm: c.cbm ? c.cbm.after : null,
    }));

    startTransition(async () => {
      const res = await adminUpdateVipRateCells({ coid, cells: payload });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `บันทึกแล้ว — KG ${res.data?.kg_writes ?? 0} cell · CBM ${res.data?.cbm_writes ?? 0} cell`,
      );
      router.refresh();
      setTimeout(() => setSuccess(null), 5000);
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          ✓ {success}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/50 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">โกดังจีน</th>
              <th className="px-3 py-2 text-left">ขนส่ง</th>
              <th className="px-3 py-2 text-left">ประเภทสินค้า</th>
              <th className="px-3 py-2 text-right">KG (บาท)</th>
              <th className="px-3 py-2 text-right">CBM (บาท)</th>
              <th className="px-3 py-2 text-left">แก้ไขล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {(["1", "2"] as const).flatMap((w) =>
              (["1", "2", "3"] as const).flatMap((t) =>
                (["1", "2", "3", "4"] as const).map((p) => {
                  const k = key(w, t, p);
                  const c = initial.get(k);
                  const kgVal = kgInputs.get(k) ?? "";
                  const cbmVal = cbmInputs.get(k) ?? "";
                  const kgDirty = (initialKg.get(k) ?? "") !== kgVal;
                  const cbmDirty = (initialCbm.get(k) ?? "") !== cbmVal;
                  const rowSeeded = !!c && (c.rkg != null || c.rcbm != null);
                  return (
                    <tr
                      key={k}
                      className={`border-t border-border ${rowSeeded ? "" : "bg-surface-alt/20"}`}
                    >
                      <td className="px-3 py-2">{WAREHOUSE_LABEL[w]}</td>
                      <td className="px-3 py-2">{TRANSPORT_LABEL[t]}</td>
                      <td className="px-3 py-2">{PRODUCT_LABEL[p]}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={kgVal}
                          onChange={(e) => setKg(k, e.target.value)}
                          disabled={pending}
                          placeholder="—"
                          className={kgDirty ? inputDirtyCls : inputCls}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={cbmVal}
                          onChange={(e) => setCbm(k, e.target.value)}
                          disabled={pending}
                          placeholder="—"
                          className={cbmDirty ? inputDirtyCls : inputCls}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-muted">
                        {c?.rkg_admin ?? c?.rcbm_admin ?? "—"}
                      </td>
                    </tr>
                  );
                }),
              ),
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted">
        จุดที่จาง = ยังไม่มี rate ตั้งไว้ (ใช้ default จาก{" "}
        <code className="rounded bg-surface-alt px-1 py-0.5">tb_settings</code>) ·
        พิมพ์ค่าใส่เพื่อ seed cell ใหม่ · ปล่อยว่างเพื่อคงค่าเดิม
      </p>

      {/* Sticky save bar (only when dirty) */}
      {dirtyCells.length > 0 && (
        <div className="sticky bottom-4 z-10">
          <div className="rounded-2xl border border-primary-300 bg-white dark:bg-surface shadow-lg p-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-primary-700 dark:text-primary-400">
              {dirtyCells.length} cell เปลี่ยนแปลง
            </span>
            <span className="text-xs text-muted">
              ({dirtyCells.filter((c) => c.kg).length} KG · {dirtyCells.filter((c) => c.cbm).length} CBM)
            </span>
            <div className="flex-1" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={reset}
              disabled={pending}
            >
              <RotateCcw className="size-4" /> ยกเลิก
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={pending}
            >
              <Save className="size-4" /> {pending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="rounded-2xl bg-white dark:bg-surface shadow-2xl max-w-lg w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <h3 className="font-bold text-lg">
                ยืนยันบันทึก {dirtyCells.length} การเปลี่ยนแปลง?
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="text-muted hover:text-foreground"
                aria-label="ปิด"
              >
                <X className="size-5" />
              </button>
            </div>
            <p className="text-sm text-muted">
              VIP tier <span className="font-mono text-primary-600">{coid}</span> · มีผลทันทีกับลูกค้าทุกคนใน tier นี้
            </p>

            <div className="rounded-lg border border-border max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-alt/60 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left">cell</th>
                    <th className="px-2 py-1.5 text-right">ก่อน</th>
                    <th className="px-2 py-1.5 text-right">ใหม่</th>
                  </tr>
                </thead>
                <tbody>
                  {dirtyCells.map((c) => (
                    <tr key={c.k} className="border-t border-border">
                      <td className="px-2 py-1 font-mono">
                        {WAREHOUSE_LABEL[c.w].slice(0, 4)} · {TRANSPORT_LABEL[c.t]} · {PRODUCT_LABEL[c.p]}
                      </td>
                      <td className="px-2 py-1 text-right font-mono text-muted">
                        {c.kg && `KG ${c.kg.before ?? "—"}`}
                        {c.kg && c.cbm && " · "}
                        {c.cbm && `CBM ${c.cbm.before ?? "—"}`}
                      </td>
                      <td className="px-2 py-1 text-right font-mono font-semibold text-primary-700 dark:text-primary-400">
                        {c.kg && `KG ${c.kg.after ?? "—"}`}
                        {c.kg && c.cbm && " · "}
                        {c.cbm && `CBM ${c.cbm.after ?? "—"}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowConfirm(false)}
                disabled={pending}
              >
                กลับไปแก้
              </Button>
              <Button type="button" size="sm" onClick={submit} disabled={pending}>
                <Save className="size-4" /> ยืนยันบันทึก
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
