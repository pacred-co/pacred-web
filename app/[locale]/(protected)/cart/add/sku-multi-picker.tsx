"use client";

/**
 * `<SkuMultiPicker>` — the Shopee-style option picker for a multi-SKU listing
 * (owner 2026-08-03, from a hand-drawn mockup: "อยากได้แบบนี้ตามภาพ").
 *
 * Replaces the flat N-row table (unusable once a listing carries ~70 SKUs) with
 * the two-step shape a marketplace uses:
 *
 *   1. a horizontal carousel of the IMAGE axis (สี/แบบ) — multi-select, each
 *      picked card gets a red ✓ badge,
 *   2. a "รายการที่เลือก" list where every picked style is ONE row with a size
 *      dropdown + qty stepper + line total + a remove button — so one order can
 *      still hold many styles at once.
 *
 * PRESENTATION ONLY — the money path is untouched. Rows are DERIVED from the
 * parent's `qtyBySku` (keyed by skuMap index, exactly what `onSubmit` batches
 * into addCartItemsBulk), so this component never holds a second source of
 * truth: a row simply IS a skuMap index whose qty > 0. That also means a
 * successful add — which clears `qtyBySku` upstream — clears this list for free.
 */

import { useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Check, Trash2 } from "lucide-react";
import { ThaiText, ThaiToggleButton } from "@/components/translate/thai-toggle";
import { MAX_ORDER_QTY, clampOrderQty } from "@/lib/validators/order-qty";

type SkuAxis = { name: string; values: Array<{ label: string; image?: string; data?: string; is_image?: boolean }> };
type SkuRow = { sku_id: string; prop_path: Record<string, string>; price_cny: number; stock: number; image?: string };

function fmt2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SkuMultiPicker({
  skuAxes,
  skuMap,
  qtyBySku,
  setQtyBySku,
  rsDefault,
  pending,
  onDirty,
}: {
  skuAxes: SkuAxis[];
  skuMap: SkuRow[];
  qtyBySku: Record<number, number>;
  setQtyBySku: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  rsDefault: number;
  pending: boolean;
  /** Clear the parent's error/success flash on any edit. */
  onDirty: () => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  // The axis that carries pictures is the "แบบ / สี" carousel; whatever else
  // remains (usually 尺码) becomes the per-row size dropdown. A single-axis
  // listing simply has no dropdown column.
  const styleAxis = useMemo(
    () => skuAxes.find((ax) => ax.values.some((v) => v.is_image && v.image)) ?? skuAxes[0],
    [skuAxes],
  );
  const sizeAxis = useMemo(
    () => skuAxes.find((ax) => ax.name !== styleAxis?.name),
    [skuAxes, styleAxis],
  );

  // Only styles that actually appear in skuMap — TAMIT sometimes lists an axis
  // value with no buyable combination behind it.
  const styles = useMemo(() => {
    if (!styleAxis) return [];
    return styleAxis.values
      .filter((v) => skuMap.some((s) => s.prop_path[styleAxis.name] === v.label))
      .map((v) => ({ label: v.label, image: v.image }));
  }, [styleAxis, skuMap]);

  const sizesFor = (styleLabel: string): string[] => {
    if (!sizeAxis || !styleAxis) return [];
    return sizeAxis.values
      .filter((v) =>
        skuMap.some(
          (s) => s.prop_path[styleAxis.name] === styleLabel && s.prop_path[sizeAxis.name] === v.label,
        ),
      )
      .map((v) => v.label);
  };

  const findIdx = (styleLabel: string, sizeLabel?: string): number => {
    if (!styleAxis) return -1;
    return skuMap.findIndex(
      (s) =>
        s.prop_path[styleAxis.name] === styleLabel &&
        (!sizeAxis || !sizeLabel || s.prop_path[sizeAxis.name] === sizeLabel),
    );
  };

  // ── Rows = every skuMap index currently carrying qty > 0 (see file docstring).
  const rows = useMemo(
    () =>
      Object.entries(qtyBySku)
        .map(([k, q]) => ({ idx: Number(k), qty: q }))
        .filter((r) => r.qty > 0 && skuMap[r.idx])
        .sort((a, b) => a.idx - b.idx),
    [qtyBySku, skuMap],
  );

  const pickedStyles = useMemo(() => {
    if (!styleAxis) return new Set<string>();
    return new Set(rows.map((r) => skuMap[r.idx].prop_path[styleAxis.name]));
  }, [rows, skuMap, styleAxis]);

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalYuan = rows.reduce((s, r) => s + skuMap[r.idx].price_cny * r.qty, 0);

  function setQty(idx: number, q: number) {
    setQtyBySku((prev) => ({ ...prev, [idx]: q }));
    onDirty();
  }

  /** Tick a style → open its first in-stock size at qty 1. Untick → drop all its rows. */
  function toggleStyle(styleLabel: string) {
    if (!styleAxis) return;
    if (pickedStyles.has(styleLabel)) {
      setQtyBySku((prev) => {
        const next = { ...prev };
        for (const r of rows) {
          if (skuMap[r.idx].prop_path[styleAxis.name] === styleLabel) next[r.idx] = 0;
        }
        return next;
      });
      onDirty();
      return;
    }
    const sizes = sizesFor(styleLabel);
    const firstFree = sizes.find((sz) => {
      const i = findIdx(styleLabel, sz);
      return i >= 0 && skuMap[i].stock > 0;
    }) ?? sizes[0];
    const idx = findIdx(styleLabel, firstFree);
    if (idx >= 0) setQty(idx, 1);
  }

  /** Re-point a row at another size — carries its qty across, merges on collision. */
  function changeSize(fromIdx: number, sizeLabel: string) {
    if (!styleAxis) return;
    const styleLabel = skuMap[fromIdx].prop_path[styleAxis.name];
    const toIdx = findIdx(styleLabel, sizeLabel);
    if (toIdx < 0 || toIdx === fromIdx) return;
    setQtyBySku((prev) => {
      const carried = prev[fromIdx] ?? 0;
      return { ...prev, [fromIdx]: 0, [toIdx]: (prev[toIdx] ?? 0) + carried };
    });
    onDirty();
  }

  const scroll = (dir: number) =>
    stripRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });

  if (!styleAxis) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] font-bold text-foreground">เลือกแบบ ไซซ์ และจำนวน</p>
        <ThaiToggleButton />
      </div>

      {/* ── Style carousel (multi-select) ── */}
      <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-2">
        <button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="แบบก่อนหน้า"
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted hover:text-primary-600"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* py-1 = breathing room for the selected card's 2px ring, which is drawn
            OUTSIDE the border box and would otherwise be shaved by the overflow. */}
        <div ref={stripRef} className="scrollbar-none flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 scroll-smooth">
          {styles.map((st) => {
            const on = pickedStyles.has(st.label);
            return (
              <button
                key={st.label}
                type="button"
                onClick={() => toggleStyle(st.label)}
                disabled={pending}
                title={st.label}
                className={`relative flex w-[160px] flex-shrink-0 items-center gap-2 rounded-2xl border p-2 pr-7 text-left transition disabled:opacity-50 ${
                  on ? "border-red-500 ring-2 ring-red-500/20" : "border-border hover:border-red-300"
                }`}
              >
                {st.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={st.image}
                    alt=""
                    loading="lazy"
                    className="h-11 w-11 flex-shrink-0 rounded-xl border border-border/60 bg-white object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-surface-alt text-lg">
                    📦
                  </span>
                )}
                {/* The option's own name IS the identifier — no "แบบ A/B/C" code on top
                    of it (owner 2026-08-03 "มันมีบอกอยู่แล้วว่าอะไร"). Two lines so a long
                    Chinese/translated name stays readable instead of being cut at one. */}
                <span
                  className={`line-clamp-2 min-w-0 text-[12.5px] font-semibold leading-snug ${
                    on ? "text-primary-700" : "text-foreground"
                  }`}
                >
                  <ThaiText text={st.label} />
                </span>
                {on && (
                  // Sits INSIDE the card (the strip scrolls, so anything hung
                  // outside the bounds gets clipped — owner 2026-08-03
                  // "มันทะลุกรอบ"); the card's pr-7 keeps the label clear of it.
                  <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scroll(1)}
          aria-label="แบบถัดไป"
          className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted hover:text-primary-600"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── รายการที่เลือก ── */}
      <div className="rounded-xl border border-border bg-white p-3">
        <p className="text-[13px] font-bold text-foreground">รายการที่เลือก</p>

        {rows.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-muted">
            ยังไม่ได้เลือก — กดเลือกแบบด้านบนได้เลย (เลือกได้หลายแบบ)
          </p>
        ) : (
          // scrollbar-none like the strips above (owner 2026-08-03 "เอาออกให้หมด") —
          // the columns are sized to fit the card, so the bar was cosmetic; the table
          // still scrolls by touch/drag if a narrow window ever squeezes it.
          <div className="scrollbar-none mt-2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11.5px] text-muted">
                  <th className="px-1 py-1.5 text-left font-medium">แบบ / สี</th>
                  {sizeAxis && <th className="px-1 py-1.5 text-left font-medium">ไซซ์</th>}
                  <th className="px-1 py-1.5 text-center font-medium">จำนวน</th>
                  {/* Unit price hides below xl — with the sidebar open at ~1180px the
                      6 columns overflowed and squeezed the name cell. The row total is
                      still shown, and unit price = total ÷ จำนวน. */}
                  <th className="hidden px-1 py-1.5 text-right font-medium whitespace-nowrap xl:table-cell">ราคา/ชิ้น</th>
                  <th className="px-1 py-1.5 text-right font-medium">รวม</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ idx, qty }) => {
                  const sku = skuMap[idx];
                  const styleLabel = sku.prop_path[styleAxis.name];
                  const st = styles.find((s) => s.label === styleLabel);
                  const sizeLabel = sizeAxis ? sku.prop_path[sizeAxis.name] : undefined;
                  const img =
                    sku.image ??
                    st?.image ??
                    styleAxis.values.find((v) => v.label === styleLabel)?.image;
                  return (
                    <tr key={sku.sku_id || idx} className="border-t border-border align-middle">
                      {/* แบบ / สี */}
                      <td className="px-1 py-2">
                        <div className="flex items-center gap-2">
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt=""
                              loading="lazy"
                              className="h-9 w-9 flex-shrink-0 rounded-xl border border-border/60 bg-white object-cover"
                            />
                          ) : (
                            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-surface-alt">
                              📦
                            </span>
                          )}
                          <span className="min-w-[100px]">
                            <span className="line-clamp-2 block text-[12.5px] font-semibold text-foreground">
                              <ThaiText text={styleLabel} />
                            </span>
                            <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[11px]">
                              {sku.stock > 0 ? (
                                <>
                                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  <span className="text-muted">
                                    มีสินค้า {sku.stock.toLocaleString()} ชิ้น
                                  </span>
                                </>
                              ) : (
                                <>
                                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                                  <span className="text-red-600">สินค้าหมด</span>
                                </>
                              )}
                            </span>
                          </span>
                        </div>
                      </td>

                      {/* ไซซ์ */}
                      {sizeAxis && (
                        <td className="px-1 py-2">
                          <select
                            value={sizeLabel ?? ""}
                            onChange={(e) => changeSize(idx, e.target.value)}
                            disabled={pending}
                            aria-label="ไซซ์"
                            className="h-9 min-w-[64px] rounded-md border border-border bg-white px-1 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                          >
                            {sizesFor(styleLabel).map((sz) => (
                              <option key={sz} value={sz}>
                                {sz}
                              </option>
                            ))}
                          </select>
                        </td>
                      )}

                      {/* จำนวน */}
                      <td className="px-1 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => setQty(idx, Math.max(1, qty - 1))}
                            disabled={pending || qty <= 1}
                            aria-label="ลดจำนวน"
                            className="h-9 w-8 rounded-md border border-border bg-white text-base leading-none hover:bg-surface-alt disabled:opacity-40"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={MAX_ORDER_QTY}
                            value={qty}
                            onChange={(e) => setQty(idx, clampOrderQty(Number(e.target.value) || 0, 1))}
                            disabled={pending}
                            aria-label="จำนวน"
                            className="h-9 w-12 rounded-md border border-border bg-white text-center font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                          />
                          <button
                            type="button"
                            onClick={() => setQty(idx, qty + 1)}
                            disabled={pending}
                            aria-label="เพิ่มจำนวน"
                            className="h-9 w-8 rounded-md border border-border bg-white text-base leading-none hover:bg-surface-alt disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td className="hidden px-1 py-2 text-right font-mono text-[12.5px] text-muted whitespace-nowrap xl:table-cell">
                        ¥{fmt2(sku.price_cny)}
                      </td>
                      <td className="px-1 py-2 text-right font-mono text-[14px] font-bold text-red-600 whitespace-nowrap">
                        ¥{fmt2(sku.price_cny * qty)}
                      </td>
                      <td className="px-1 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setQty(idx, 0)}
                          disabled={pending}
                          aria-label="ลบรายการนี้"
                          title="ลบรายการนี้"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* ── สรุปที่เลือก ── */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-primary-50 px-4 py-3">
          <span className="text-[13px] text-foreground">
            เลือกแล้ว <b>{pickedStyles.size}</b> แบบ
            {sizeAxis && <> · <b>{rows.length}</b> ไซซ์</>} · รวม <b>{totalQty.toLocaleString()}</b> ชิ้น
          </span>
          <span className="text-[13px]">
            <span className="text-muted">รวม </span>
            <b className="text-lg text-red-600">¥{fmt2(totalYuan)}</b>
            <span className="ml-2 text-muted">≈ ฿{fmt2(totalYuan * rsDefault)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
