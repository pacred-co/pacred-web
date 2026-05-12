"use client";

export function PrintButton({ label = "🖨 พิมพ์ / Save PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600"
    >
      {label}
    </button>
  );
}
