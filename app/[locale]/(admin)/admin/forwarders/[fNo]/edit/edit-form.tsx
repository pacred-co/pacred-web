"use client";

/**
 * Client form for /admin/forwarders/[fNo]/edit — Wave 12-C ภาค 2.
 *
 * Per docs/learnings/pacred-design-philosophy.md:
 *   - Legacy field list = data source (fweight · L×W×H · fvolume · fproductstype ·
 *     frefprice · fnote + per-item chinawoodencratefee*)
 *   - Pacred UI = our Tailwind cards · live CBM preview · chips for enums ·
 *     friendly empty states (NEVER copy BS4 markup from forwarder.php)
 *
 * Auto-CBM preview is the legacy formula: (W × L × H) / 1,000,000 (cm³ → m³).
 */

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateForwarderDimensions } from "@/actions/admin/forwarders-edit";

export type EditItemRow = {
  itemId:        number;
  name:          string;
  tracking:      string;
  qty:           number;
  weightPerItem: number;
  weightAll:     number;
  cbmPerItem:    number;
  cbmAll:        number;
  crateFee:      number;
  crateType:     "1" | "2";   // '1' ไม่ตี · '2' ตีลัง (legacy enum)
};

type ProductType = "1" | "2" | "3" | "4";
type RefPrice    = "1" | "2";

const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string; sub: string }[] = [
  { value: "1", label: "ทั่วไป",  sub: "Generic" },
  { value: "2", label: "มอก.",   sub: "TIS / มาตรฐานอุตสาหกรรม" },
  { value: "3", label: "อย.",    sub: "FDA · อาหาร/ยา/เครื่องสำอาง" },
  { value: "4", label: "พิเศษ",  sub: "Special goods · ติดต่อเซลส์" },
];

const REF_PRICE_OPTIONS: { value: RefPrice; label: string; sub: string }[] = [
  { value: "1", label: "คิดตามน้ำหนัก", sub: "ราคา = น้ำหนัก × เรท/กก." },
  { value: "2", label: "คิดตามปริมาตร", sub: "ราคา = CBM × เรท/cbm" },
];

function numberInputCls(error?: boolean) {
  return [
    "w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2",
    "font-mono tabular-nums",
    error
      ? "border-red-400 ring-1 ring-red-200 focus:border-red-500 focus:ring-red-300"
      : "border-border focus:border-primary-500 focus:ring-primary-200",
  ].join(" ");
}

export function AdminForwarderEditForm({
  fNo,
  idNumeric,
  weightInit,
  widthInit,
  lengthInit,
  heightInit,
  volumeInit,
  productTypeInit,
  refPriceInit,
  noteInit,
  itemsInit,
}: {
  fNo:              string;
  idNumeric:        number;
  weightInit:       number;
  widthInit:        number;
  lengthInit:       number;
  heightInit:       number;
  volumeInit:       number;
  productTypeInit:  ProductType;
  refPriceInit:     RefPrice;
  noteInit:         string;
  itemsInit:        EditItemRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [weight,      setWeight]      = useState<string>(weightInit ? String(weightInit) : "0");
  const [width,       setWidth]       = useState<string>(widthInit  ? String(widthInit)  : "0");
  const [length,      setLength]      = useState<string>(lengthInit ? String(lengthInit) : "0");
  const [height,      setHeight]      = useState<string>(heightInit ? String(heightInit) : "0");
  const [productType, setProductType] = useState<ProductType>(productTypeInit);
  const [refPrice,    setRefPrice]    = useState<RefPrice>(refPriceInit);
  const [note,        setNote]        = useState<string>(noteInit);
  const [items,       setItems]       = useState<EditItemRow[]>(itemsInit);

  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Numeric parse + CBM preview — same formula legacy uses:
  // (W × L × H) / 1,000,000 (cm³ → m³).
  const parsed = useMemo(() => {
    const w = parseFloat(width)  || 0;
    const l = parseFloat(length) || 0;
    const h = parseFloat(height) || 0;
    const cbm = (w * l * h) / 1_000_000;
    return {
      width:  w,
      length: l,
      height: h,
      weight: parseFloat(weight) || 0,
      cbm:    Math.round(cbm * 100_000) / 100_000,
    };
  }, [weight, width, length, height]);

  const cbmDelta = parsed.cbm - (volumeInit || 0);
  const cbmChanged = Math.abs(cbmDelta) > 0.00001;

  // Update one item row (immutably).
  function updateItem(itemId: number, patch: Partial<EditItemRow>) {
    setItems((prev) => prev.map((it) => (it.itemId === itemId ? { ...it, ...patch } : it)));
  }

  function setAllCrate(type: "1" | "2") {
    setItems((prev) => prev.map((it) => ({ ...it, crateType: type })));
  }

  function setAllCrateFee(fee: number) {
    setItems((prev) => prev.map((it) => ({ ...it, crateFee: fee, crateType: fee > 0 ? "2" : "1" })));
  }

  const crateSummary = useMemo(() => {
    const cratedCount = items.filter((it) => it.crateType === "2").length;
    const totalFee = items
      .filter((it) => it.crateType === "2")
      .reduce((sum, it) => sum + (Number(it.crateFee) || 0), 0);
    return { cratedCount, totalFee };
  }, [items]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (parsed.weight < 0 || parsed.width < 0 || parsed.length < 0 || parsed.height < 0) {
      setError("ค่าทุกช่องต้อง ≥ 0");
      return;
    }

    startTransition(async () => {
      const res = await adminUpdateForwarderDimensions({
        fNo:          fNo,
        weightKg:     parsed.weight,
        widthCm:      parsed.width,
        lengthCm:     parsed.length,
        heightCm:     parsed.height,
        productType,
        refPrice,
        note:         note.trim() || undefined,
        items:        items.map((it) => ({
          itemId:    it.itemId,
          crateType: it.crateType,
          crateFee:  Number(it.crateFee) || 0,
        })),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(
        `✓ บันทึกขนาด/น้ำหนักสำเร็จ — CBM = ${res.data?.cbm?.toFixed(5)} m³ — กำลังพากลับหน้ารายละเอียด...`,
      );
      setTimeout(() => {
        router.push(`/admin/forwarders/${fNo}`);
        router.refresh();
      }, 900);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* ─── Toast ─────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          {success}
        </div>
      )}

      {/* ─── DIMENSIONS ─────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📐 น้ำหนัก / ขนาดกล่อง
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Weight */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              น้ำหนัก (kg)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              disabled={pending}
              className={numberInputCls()}
              placeholder="0.00"
            />
            <p className="mt-1 text-[11px] text-muted">
              ใส่หลังชั่งสินค้าที่โกดังจีน — ทศนิยม 2 ตำแหน่ง
            </p>
          </div>

          {/* CBM live preview */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              CBM (m³) — คำนวณอัตโนมัติ
            </label>
            <div className="rounded-xl border border-border bg-surface-alt px-3 py-2.5 text-sm font-mono tabular-nums">
              {parsed.cbm.toFixed(5)}
              {cbmChanged && (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    cbmDelta > 0
                      ? "bg-amber-100 text-amber-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {cbmDelta > 0 ? "▲" : "▼"} {Math.abs(cbmDelta).toFixed(5)}
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              สูตร legacy: (W × L × H) ÷ 1,000,000 — เดิม {Number(volumeInit ?? 0).toFixed(5)}
            </p>
          </div>
        </div>

        {/* L × W × H */}
        <div className="mt-4">
          <label className="block text-xs font-medium text-muted mb-1">
            กว้าง × ยาว × สูง (cm)
          </label>
          <div className="grid gap-2 grid-cols-3">
            <div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                disabled={pending}
                className={numberInputCls()}
                placeholder="กว้าง"
                aria-label="กว้าง (cm)"
              />
              <p className="mt-1 text-[10px] text-center text-muted">กว้าง</p>
            </div>
            <div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                disabled={pending}
                className={numberInputCls()}
                placeholder="ยาว"
                aria-label="ยาว (cm)"
              />
              <p className="mt-1 text-[10px] text-center text-muted">ยาว</p>
            </div>
            <div>
              <input
                type="number"
                min={0}
                step="0.01"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                disabled={pending}
                className={numberInputCls()}
                placeholder="สูง"
                aria-label="สูง (cm)"
              />
              <p className="mt-1 text-[10px] text-center text-muted">สูง</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRODUCT TYPE (fproductstype) ──────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          🏷 ประเภทสินค้า (typeservice)
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setProductType(o.value)}
              disabled={pending}
              className={`rounded-xl border px-4 py-3 text-sm text-left transition ${
                productType === o.value
                  ? "border-primary-500 bg-primary-50 text-primary-700 font-medium ring-2 ring-primary-200"
                  : "border-border bg-white text-muted hover:bg-surface-alt"
              }`}
            >
              <div className="font-medium">{o.label}</div>
              <div className="text-[11px] text-muted mt-0.5">{o.sub}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          ตรงกับ legacy <code className="rounded bg-surface-alt px-1">fproductstype</code> · ลูกค้าเห็นใน /service-import
        </p>
      </section>

      {/* ─── REF PRICE (frefprice) ─────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          ⚖️ คิดเรทตาม
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {REF_PRICE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setRefPrice(o.value)}
              disabled={pending}
              className={`rounded-xl border px-4 py-3 text-sm text-left transition ${
                refPrice === o.value
                  ? "border-primary-500 bg-primary-50 text-primary-700 font-medium ring-2 ring-primary-200"
                  : "border-border bg-white text-muted hover:bg-surface-alt"
              }`}
            >
              <div className="font-medium">{o.label}</div>
              <div className="text-[11px] text-muted mt-0.5">{o.sub}</div>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">
          ตรงกับ legacy <code className="rounded bg-surface-alt px-1">frefprice</code> · บอกระบบว่าจะคิดบิลจากน้ำหนัก หรือปริมาตร
        </p>
      </section>

      {/* ─── PER-ITEM CRATE ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold tracking-wide text-foreground">
            🪵 ค่าตีลังไม้ (ต่อรายการสินค้า)
          </h2>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAllCrate("1")}
                disabled={pending}
                className="rounded-md border border-border bg-white px-2.5 py-1 text-[11px] text-muted hover:bg-surface-alt"
              >
                ทั้งหมด: ไม่ตี
              </button>
              <button
                type="button"
                onClick={() => setAllCrate("2")}
                disabled={pending}
                className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800 hover:bg-amber-100"
              >
                ทั้งหมด: ตีลัง
              </button>
              <button
                type="button"
                onClick={() => setAllCrateFee(0)}
                disabled={pending}
                className="rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-[11px] text-green-800 hover:bg-green-100"
              >
                ฟรีทั้งหมด
              </button>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface-alt px-3 py-4 text-center text-sm text-muted">
            ออเดอร์นี้ยังไม่มีรายการสินค้าใน <code className="rounded bg-white px-1">tb_forwarder_item</code> —
            ตีลังจะตั้งค่าทีหลังเมื่อสินค้าถูกจัดรายการ
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div
                key={it.itemId}
                className={`rounded-xl border p-3 transition ${
                  it.crateType === "2"
                    ? "border-amber-300 bg-amber-50"
                    : "border-border bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {it.name || "(ไม่มีชื่อ)"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {it.tracking && (
                        <span className="font-mono mr-2">{it.tracking}</span>
                      )}
                      × {it.qty} · {Number(it.weightAll).toFixed(2)} kg · {Number(it.cbmAll).toFixed(4)} cbm
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={it.crateType === "2"}
                      onChange={(e) =>
                        updateItem(it.itemId, {
                          crateType: e.target.checked ? "2" : "1",
                          crateFee:  e.target.checked ? it.crateFee : 0,
                        })
                      }
                      disabled={pending}
                      className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-xs font-medium text-foreground">ตีลังไม้</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={String(it.crateFee)}
                      onChange={(e) =>
                        updateItem(it.itemId, {
                          crateFee:  parseFloat(e.target.value) || 0,
                          crateType: parseFloat(e.target.value) > 0 ? "2" : it.crateType,
                        })
                      }
                      disabled={pending || it.crateType !== "2"}
                      placeholder="0.00"
                      className={`w-28 rounded-lg border bg-white px-3 py-1.5 text-sm font-mono tabular-nums ${
                        it.crateType === "2"
                          ? "border-border focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none"
                          : "border-border/40 text-muted bg-surface-alt"
                      }`}
                    />
                    <span className="text-[11px] text-muted">฿</span>
                    <button
                      type="button"
                      onClick={() => updateItem(it.itemId, { crateFee: 0 })}
                      disabled={pending || it.crateType !== "2"}
                      className="rounded-md border border-green-300 bg-green-50 px-2 py-1 text-[10px] text-green-800 hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="ตีลังฟรี (ฟรีค่าตี)"
                    >
                      ฟรี
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {/* Crate summary */}
            <div className="mt-3 rounded-xl bg-surface-alt/60 px-4 py-2.5 text-xs text-muted flex flex-wrap items-center justify-between gap-2">
              <span>
                ตีลัง <strong className="text-foreground">{crateSummary.cratedCount}</strong> / {items.length} รายการ
              </span>
              <span>
                ค่าตีลังรวม <strong className="text-foreground font-mono tabular-nums">฿{crateSummary.totalFee.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</strong>
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ─── ADMIN NOTE ────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold tracking-wide text-foreground">
          📝 หมายเหตุแอดมิน (fnote)
        </h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="หมายเหตุ — เห็นเฉพาะแอดมิน (legacy field: fnote)"
          disabled={pending}
          className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-200"
        />
        <p className="mt-1 text-[11px] text-muted">{note.length} / 2,000</p>
      </section>

      {/* ─── STICKY ACTIONS ─────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-4 lg:-mx-8 border-t border-border bg-white/95 px-4 lg:px-8 py-3 backdrop-blur z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={pending}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
          >
            ยกเลิก
          </button>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[11px] text-muted font-mono tabular-nums">
              #{idNumeric} · {parsed.weight.toFixed(2)} kg · {parsed.cbm.toFixed(5)} cbm
            </span>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-primary-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "กำลังบันทึก..." : "✓ บันทึกขนาด/น้ำหนัก"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
