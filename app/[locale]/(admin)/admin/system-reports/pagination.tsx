"use client";

/**
 * /admin/system-reports — pagination ของตารางค่าคอม (ปอน 2026-07-29)
 * ปุ่มทรง pill · กดเปลี่ยนหน้าโดยคงตัวกรองเดิม (type/pos/rep/from/to) ผ่าน ?page=N.
 * totals (แถบรวม) ยังคิดจากทุกแถวเสมอ — pagination กระทบแค่แถวที่แสดง.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** ชุดเลขหน้าแบบมีหน้าต่าง: 1 … 3 4 5 … 12 */
function pageWindow(current: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  const from = Math.max(1, current - 1);
  const to = Math.min(total, current + 1);
  if (from > 1) {
    out.push(1);
    if (from > 2) out.push("…");
  }
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total) {
    if (to < total - 1) out.push("…");
    out.push(total);
  }
  return out;
}

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  if (totalPages <= 1) return null;

  const go = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    const q = new URLSearchParams(sp.toString());
    if (p <= 1) q.delete("page");
    else q.set("page", String(p));
    const qs = q.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const base =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm transition-colors";
  const idle = "border-border bg-white text-foreground hover:bg-muted dark:bg-surface";
  const arrow = `${base} ${idle} disabled:cursor-not-allowed disabled:opacity-40`;

  return (
    <nav className="flex flex-wrap items-center justify-end gap-1.5 pt-1" aria-label="แบ่งหน้า">
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={arrow} aria-label="หน้าก่อนหน้า">
        <ChevronLeft className="h-4 w-4" />
      </button>

      {pageWindow(page, totalPages).map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-1 text-sm text-muted">
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            onClick={() => go(it)}
            aria-current={it === page ? "page" : undefined}
            className={
              it === page
                ? `${base} border-primary-600 bg-primary-600 font-semibold text-white`
                : `${base} ${idle}`
            }
          >
            {it}
          </button>
        ),
      )}

      <button type="button" onClick={() => go(page + 1)} disabled={page >= totalPages} className={arrow} aria-label="หน้าถัดไป">
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
