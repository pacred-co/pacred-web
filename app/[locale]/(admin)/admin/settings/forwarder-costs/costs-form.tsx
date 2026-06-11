"use client";

/**
 * Re-sweep A2 #28 — `<ForwarderCostsForm>` is the client island that edits the
 * default forwarder-cost matrix on `tb_settings` (id=1) and wraps the
 * `adminSetTbSettingsForwarderCosts` server action.
 *
 * Behaviour:
 *   • Renders one collapsible section per carrier; inside each, a ทางรถ + a
 *     ทางเรือ table (rows = product type 1-4, columns = กวางโจว / อี้อู).
 *   • Tracks the dirty set — only columns the admin actually changed are sent
 *     (mirrors the legacy "one บันทึก per cell", but batched into one save).
 *   • A master config block edits hratecostdefault / hratecostsale (CNY rates),
 *     numberpaymemt (เลขที่ฝากจ่าย), and freeshipping (ฟรีค่าขนส่ง on/off).
 *   • On an out-of-range CNY cost-rate the server rejects → confirm-bypass
 *     dialog (super-only), same UX as the rate editor.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminSetTbSettingsForwarderCosts } from "@/actions/admin/tb-settings";
import { confirm } from "@/components/ui/confirm";
import {
  CARRIERS,
  PRODUCT_TYPES,
  CITY_VARIANTS,
  TRANSPORTS,
  MASTER_NUMERIC_COLUMNS,
  costColumn,
} from "./costs-model";

type Props = {
  initialCosts: Record<string, number>;
  initialMaster: Record<string, number>;
  initialNumberPaymemt: string;
  initialFreeShipping: "1" | "2";
};

const cellCls =
  "w-full rounded-md border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const masterInputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function ForwarderCostsForm({
  initialCosts,
  initialMaster,
  initialNumberPaymemt,
  initialFreeShipping,
}: Props) {
  const router = useRouter();

  // String-valued working copies (controlled inputs). Cost cells keyed by column.
  const [costs, setCosts] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(initialCosts)) o[k] = String(v);
    return o;
  });
  const [master, setMaster] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const m of MASTER_NUMERIC_COLUMNS) o[m.col] = String(initialMaster[m.col] ?? 0);
    return o;
  });
  const [numberPaymemt, setNumberPaymemt] = useState(initialNumberPaymemt);
  const [freeShipping, setFreeShipping] = useState<"1" | "2">(initialFreeShipping);

  // Which carrier panels are expanded (CTT open by default).
  const [open, setOpen] = useState<Record<string, boolean>>({ "": true });

  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Dirty count — cost cells whose string differs from initial + master diffs.
  const dirtyCols = useMemo(() => {
    const cols: string[] = [];
    for (const [col, val] of Object.entries(costs)) {
      if (Number(val) !== Number(initialCosts[col])) cols.push(col);
    }
    return cols;
  }, [costs, initialCosts]);

  const masterDirty = useMemo(() => {
    const fields: string[] = [];
    for (const m of MASTER_NUMERIC_COLUMNS) {
      if (Number(master[m.col]) !== Number(initialMaster[m.col] ?? 0)) fields.push(m.col);
    }
    if (numberPaymemt !== initialNumberPaymemt) fields.push("numberpaymemt");
    if (freeShipping !== initialFreeShipping) fields.push("freeshipping");
    return fields;
  }, [
    master,
    initialMaster,
    numberPaymemt,
    initialNumberPaymemt,
    freeShipping,
    initialFreeShipping,
  ]);

  const totalDirty = dirtyCols.length + masterDirty.length;

  function setCell(col: string, value: string) {
    setCosts((prev) => ({ ...prev, [col]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);

    if (totalDirty === 0) {
      setMsg("ไม่มีการเปลี่ยนแปลง");
      return;
    }

    // Build the partial cost map (only dirty cells, validated numeric).
    const costMap: Record<string, number> = {};
    for (const col of dirtyCols) {
      const n = Number(costs[col]);
      if (!Number.isFinite(n) || n < 0) {
        setError(`ค่าต้นทุนต้องเป็นตัวเลข ≥ 0 (${col})`);
        return;
      }
      costMap[col] = n;
    }

    // Master fields — only send the ones that changed.
    const payload: Parameters<typeof adminSetTbSettingsForwarderCosts>[0] = {};
    if (Object.keys(costMap).length > 0) payload.costs = costMap;
    for (const m of MASTER_NUMERIC_COLUMNS) {
      if (masterDirty.includes(m.col)) {
        const n = Number(master[m.col]);
        if (!Number.isFinite(n) || n <= 0) {
          setError(`${m.label} ต้องเป็นตัวเลข > 0`);
          return;
        }
        (payload as Record<string, unknown>)[m.col] = n;
      }
    }
    if (masterDirty.includes("numberpaymemt")) payload.numberpaymemt = numberPaymemt;
    if (masterDirty.includes("freeshipping")) payload.freeshipping = freeShipping;

    submitWith(false);

    function submitWith(forceOverride: boolean) {
      startTransition(async () => {
        const res = await adminSetTbSettingsForwarderCosts({
          ...payload,
          ...(forceOverride ? { force_override: true } : {}),
        });
        if (res.ok) {
          const updated = res.data?.updated ?? [];
          setMsg(
            forceOverride
              ? `บันทึก ${updated.length} ค่า (super bypass range guard)`
              : `บันทึก ${updated.length} ค่า สำเร็จ`,
          );
          router.refresh();
          setTimeout(() => setMsg(null), 6000);
        } else {
          if (res.error.includes("เรทผิดปกติ") && !forceOverride) {
            if (
              await confirm(
                `${res.error}\n\nยืนยันใช้ค่านี้จริง? (ต้องเป็น super admin จึง bypass ได้)`,
              )
            ) {
              submitWith(true);
            }
            return;
          }
          setError(res.error);
        }
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Sticky save bar */}
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white/95 dark:bg-surface/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="text-sm">
          {totalDirty > 0 ? (
            <span className="font-semibold text-primary-700">
              {totalDirty} ค่าที่แก้ไข (ยังไม่บันทึก)
            </span>
          ) : (
            <span className="text-muted">ยังไม่มีการแก้ไข</span>
          )}
        </div>
        <Button type="submit" disabled={pending || totalDirty === 0}>
          {pending ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {msg}
        </div>
      )}

      {/* ── Master "ตั้งค่าทั่วไป" config ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-4">
        <h2 className="text-base font-bold">ตั้งค่าทั่วไป (ต้นทุน + ฝากจ่าย)</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {MASTER_NUMERIC_COLUMNS.map((m) => {
            const changed = Number(master[m.col]) !== Number(initialMaster[m.col] ?? 0);
            return (
              <label key={m.col} className="block space-y-1">
                <span className="text-sm font-medium">{m.label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={master[m.col]}
                  onChange={(e) =>
                    setMaster((prev) => ({ ...prev, [m.col]: e.target.value }))
                  }
                  className={masterInputCls}
                />
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted">{m.hint}</span>
                  <span className="text-muted">
                    เดิม{" "}
                    <span className="font-mono">
                      {Number(initialMaster[m.col] ?? 0).toFixed(4)}
                    </span>
                    {changed && <span className="ml-1 text-amber-600">●</span>}
                  </span>
                </div>
                {/* hratecostsale is a dead-write (rate/cost wiring audit): no
                    live consumer reads it. Scope this note to this field ONLY —
                    hratecostdefault above + the cost matrix below ARE live. */}
                {m.col === "hratecostsale" && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                    ⚠️ ค่านี้ยังไม่ถูกใช้ในการคำนวณราคา / มาร์จิน (reference-only)
                    — แก้แล้วยังไม่มีผลกับระบบ.
                  </p>
                )}
              </label>
            );
          })}

          <label className="block space-y-1">
            <span className="text-sm font-medium">เลขที่ฝากจ่าย (numberpaymemt)</span>
            <input
              type="text"
              value={numberPaymemt}
              onChange={(e) => setNumberPaymemt(e.target.value)}
              className={masterInputCls}
            />
            <span className="text-[11px] text-muted">
              เลขรันที่ออกเอกสารฝากจ่าย
              {numberPaymemt !== initialNumberPaymemt && (
                <span className="ml-1 text-amber-600">● แก้ไข</span>
              )}
            </span>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium">ฟรีค่าขนส่ง (freeshipping)</span>
            <select
              value={freeShipping}
              onChange={(e) => setFreeShipping(e.target.value as "1" | "2")}
              className={masterInputCls}
            >
              <option value="1">เปิด</option>
              <option value="2">ปิด</option>
            </select>
            <span className="text-[11px] text-muted">
              เปิด/ปิดโปรฟรีค่าขนส่งทั้งระบบ
              {freeShipping !== initialFreeShipping && (
                <span className="ml-1 text-amber-600">● แก้ไข</span>
              )}
            </span>
          </label>
        </div>
        <p className="text-xs text-amber-700">
          ⚠️ เรท CNY ต้นทุน (hratecost*) นอกช่วง [2.00 - 8.00] ต้องให้ super admin ยืนยัน
        </p>
      </section>

      {/* ── Per-carrier cost matrices ── */}
      {CARRIERS.map((carrier) => {
        const isOpen = !!open[carrier.suffix];
        // dirty count within this carrier (for the header badge)
        const carrierDirty = dirtyCols.filter((col) =>
          // a column belongs to this carrier when its "default<suffix>[2]" tail
          // matches — build the carrier's column prefixes and test membership
          carrierColumns(carrier.suffix).includes(col),
        ).length;

        return (
          <section
            key={carrier.suffix || "ctt"}
            className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden"
          >
            <button
              type="button"
              onClick={() =>
                setOpen((prev) => ({ ...prev, [carrier.suffix]: !prev[carrier.suffix] }))
              }
              className="flex w-full items-center justify-between gap-2 px-5 py-3.5 text-left hover:bg-surface-alt/50"
            >
              <span className="flex items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted" />
                )}
                <span className="text-base font-bold">{carrier.label}</span>
                {"weightBased" in carrier && carrier.weightBased && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                    คิดตามน้ำหนัก (บาท/กก.)
                  </span>
                )}
              </span>
              {carrierDirty > 0 && (
                <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                  {carrierDirty} แก้ไข
                </span>
              )}
            </button>

            {isOpen && (
              <div className="grid gap-5 border-t border-border p-5 lg:grid-cols-2">
                {TRANSPORTS.map((t) => (
                  <TransportTable
                    key={t.infix}
                    carrierSuffix={carrier.suffix}
                    transportInfix={t.infix}
                    transportLabel={t.label}
                    costs={costs}
                    initialCosts={initialCosts}
                    onChange={setCell}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* Bottom save (long page convenience) */}
      <div className="flex items-center justify-end pt-2">
        <Button type="submit" disabled={pending || totalDirty === 0}>
          {pending ? "กำลังบันทึก..." : `บันทึกทั้งหมด${totalDirty > 0 ? ` (${totalDirty})` : ""}`}
        </Button>
      </div>
    </form>
  );
}

/** Compute all 8 column names belonging to one carrier (4 types × 2 cities). */
function carrierColumns(carrierSuffix: string): string[] {
  const cols: string[] = [];
  for (const t of TRANSPORTS) {
    for (const p of PRODUCT_TYPES) {
      for (const city of CITY_VARIANTS) {
        cols.push(costColumn(t.infix, p.idx, carrierSuffix, city.suffix));
      }
    }
  }
  return cols;
}

function TransportTable({
  carrierSuffix,
  transportInfix,
  transportLabel,
  costs,
  initialCosts,
  onChange,
}: {
  carrierSuffix: string;
  transportInfix: "car" | "ship";
  transportLabel: string;
  costs: Record<string, string>;
  initialCosts: Record<string, number>;
  onChange: (col: string, value: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{transportLabel}</h3>
      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs text-muted">
              <th className="px-2 py-1 text-left font-medium">ประเภทสินค้า</th>
              {CITY_VARIANTS.map((c) => (
                <th key={c.suffix} className="px-2 py-1 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRODUCT_TYPES.map((p) => (
              <tr key={p.idx} className="border-t border-border/60">
                <td className="px-2 py-1 text-left text-foreground">{p.label}</td>
                {CITY_VARIANTS.map((c) => {
                  const col = costColumn(transportInfix, p.idx, carrierSuffix, c.suffix);
                  const changed = Number(costs[col]) !== Number(initialCosts[col]);
                  return (
                    <td key={c.suffix} className="px-2 py-1">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={costs[col] ?? "0"}
                        onChange={(e) => onChange(col, e.target.value)}
                        className={`${cellCls} ${changed ? "border-amber-400 bg-amber-50/60 dark:bg-amber-900/20" : ""}`}
                        aria-label={col}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
