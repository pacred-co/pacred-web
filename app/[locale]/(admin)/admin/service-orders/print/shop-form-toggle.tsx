"use client";

/**
 * <ShopFormToggle> — the print-hidden Toggle Switch that flips the SAME
 * shop-order document between the legacy/PCS form (`?form=legacy`, default)
 * and the new PEAK-style form (`?form=peak`). Owner directive 2026-06-22.
 *
 * It rewrites the `form` query param IN PLACE while preserving every other
 * param — crucially the repeated `id[]` array (`?id=1&id=2`) and `print`,
 * so the toggle never changes WHICH document or whether it's a
 * receipt/invoice — only its skin. Uses native window.location (raw
 * URLSearchParams) rather than the next-intl router so repeated `id` keys
 * survive verbatim.
 *
 * Rendered with `print:hidden` + inside the `.no-print` block so it never
 * appears on the printed PDF.
 */

import { useSearchParams } from "next/navigation";

export function ShopFormToggle({ current }: { current: "legacy" | "peak" }) {
  const searchParams = useSearchParams();

  function go(form: "legacy" | "peak") {
    if (form === current) return;
    // Clone EVERY existing param (keeps repeated id[] entries), then set form.
    const params = new URLSearchParams(searchParams.toString());
    params.set("form", form);
    // Replace so the back button doesn't bounce between skins of one doc.
    window.location.search = params.toString();
  }

  const isPeak = current === "peak";

  return (
    <div className="no-print print:hidden flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className="text-sm font-medium text-slate-600">รูปแบบเอกสาร :</span>
      <button
        type="button"
        onClick={() => go("legacy")}
        aria-pressed={!isPeak}
        className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
          !isPeak
            ? "bg-primary-600 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        ฟอร์มเดิม (PCS)
      </button>

      {/* The switch itself — a labelled track that visually reads the state. */}
      <button
        type="button"
        role="switch"
        aria-checked={isPeak}
        aria-label="สลับรูปแบบเอกสาร"
        onClick={() => go(isPeak ? "legacy" : "peak")}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          isPeak ? "bg-primary-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            isPeak ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>

      <button
        type="button"
        onClick={() => go("peak")}
        aria-pressed={isPeak}
        className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
          isPeak
            ? "bg-primary-600 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        ฟอร์ม PEAK
      </button>
    </div>
  );
}
