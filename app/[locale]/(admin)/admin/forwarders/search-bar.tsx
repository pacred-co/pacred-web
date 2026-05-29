"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, AlignLeft, Type } from "lucide-react";

/**
 * Forwarders search bar — supports single-line OR multi-line bulk search.
 *
 * Multi-line mode (U2-5 + chat W-9): paste 5-50 tracking numbers / F-No,
 * one per line. Matches if ANY line appears in ANY of:
 *   f_no · tracking_chn · tracking_th · member_code
 *
 * Mirrors the legacy PHP pattern `forwarder-search-muti.php?fTracking=AAA%0D%0ABBB`
 * that the team uses dozens of times per week.
 *
 * Mode is persisted via URL — `?q_multi=...` keeps multi mode on
 * navigation/reload; `?q=...` is single mode.
 */
export function ForwardersSearchBar() {
  const router   = useRouter();
  const pathname = usePathname();
  const sp       = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [multiMode, setMultiMode] = useState(!!sp.get("q_multi"));
  const [q,        setQ]        = useState(sp.get("q") ?? "");
  const [qMulti,   setQMulti]   = useState(sp.get("q_multi") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("date_from") ?? "");
  const [dateTo,   setDateTo]   = useState(sp.get("date_to") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (sp.get("status")) params.set("status", sp.get("status")!);

    if (multiMode && qMulti.trim()) {
      params.set("q_multi", qMulti.trim());
    } else if (!multiMode && q.trim()) {
      params.set("q", q.trim());
    }

    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo)   params.set("date_to", dateTo);
    startTransition(() => router.push(`${pathname}?${params}`));
  }

  function reset() {
    setQ(""); setQMulti(""); setDateFrom(""); setDateTo("");
    const params = new URLSearchParams();
    if (sp.get("status")) params.set("status", sp.get("status")!);
    startTransition(() => router.push(`${pathname}?${params}`));
  }

  function toggleMode() {
    if (multiMode) {
      // Switching multi → single — preserve first line as single query
      const firstLine = qMulti.split(/\r?\n/).find(Boolean) ?? "";
      setQ(firstLine);
      setQMulti("");
    } else {
      // Switching single → multi — seed textarea with current single query
      setQMulti(q);
      setQ("");
    }
    setMultiMode(!multiMode);
  }

  const hasFilter = q || qMulti || dateFrom || dateTo;
  const multiLineCount = qMulti.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length;

  const inputCls = "rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30";

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        {multiMode ? (
          <div className="flex-1 min-w-[260px]">
            <textarea
              value={qMulti}
              onChange={(e) => setQMulti(e.target.value)}
              placeholder="ใส่เลข tracking / F-No บรรทัดละ 1 อัน — กด Enter ขึ้นบรรทัดใหม่"
              rows={4}
              className={`${inputCls} w-full font-mono`}
            />
            <p className="mt-0.5 text-[10px] text-muted">
              {multiLineCount > 0 ? `${multiLineCount} รายการ` : "ใส่ได้ทั้ง F-No / tracking-CN / tracking-TH / รหัสสมาชิก"}
            </p>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหา รหัสลูกค้า / ออเดอร์ / เลขพัสดุจีน / เลขตู้ / ชื่อ / เบอร์"
              title="ค้นหาจาก: รหัสลูกค้า (PR####) · เลขออเดอร์ · เลขแทรคกิ้งจีน · เลขตู้ · ชื่อ-นามสกุล · เบอร์ — ค้นได้ทุกประวัติ"
              className={`${inputCls} pl-8 w-80`}
            />
          </div>
        )}

        <button
          type="button"
          onClick={toggleMode}
          className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-xs hover:bg-surface-alt flex items-center gap-1"
          title={multiMode ? "สลับเป็นช่องเดียว (single)" : "ค้นหาหลายเลขทีเดียว (multi-line bulk)"}
        >
          {multiMode ? <Type className="h-3.5 w-3.5" /> : <AlignLeft className="h-3.5 w-3.5" />}
          {multiMode ? "ช่องเดียว" : "หลายเลข"}
        </button>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">ตั้งแต่</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">ถึง</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-500 text-white px-4 py-2 text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
        >
          {pending ? "กำลังค้นหา..." : "ค้นหา"}
        </button>
        {hasFilter && (
          <button type="button" onClick={reset} className="text-xs text-muted hover:text-foreground px-2 py-2">
            ล้าง
          </button>
        )}
      </div>
    </form>
  );
}
