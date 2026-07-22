"use client";

/**
 * ประวัติใบเสนอราคา — lists the saved `customer_quotations` for this customer
 * (owner ปอน 2026-07-03). A quotation is persisted when the sales rep hits
 * "ออกใบเสนอราคา/ใบประเมินราคา" in the ใบเสนอราคา tab (→ a public /q/[token]
 * snapshot · each ออกเอกสาร = one row here); this tab shows every snapshot with a
 * re-open + copy-link action, so the rep can resend an old quote without rebuilding.
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { Copy, Check, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { listCustomerQuotations, type QuoteHistoryRow } from "@/actions/admin/save-quotation";

const THB = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Service categories (matches the บริการ dropdown in the ใบเสนอราคา tab).
const SERVICE_LABEL: Record<string, string> = { cargo: "Cargo", freight: "Freight", clearance: "Clearance" };
const serviceLabel = (key: string) => SERVICE_LABEL[key] ?? key;

type ViewFilter = "all" | "calc" | "compare";

const selectCls =
  "rounded-md border border-border bg-white px-2 py-1 text-[12px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:bg-surface";

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
  );
}

export function QuoteHistoryTab({ userid }: { userid: string }) {
  const [rows, setRows] = useState<QuoteHistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  // ตัวกรอง — บริการ (cargo/freight/…) + รูปแบบ (ใบเสนอราคา/ใบประเมินราคา).
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  // Only offer the services that actually appear in this customer's history.
  const serviceKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) set.add(r.service || "cargo");
    return [...set];
  }, [rows]);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) =>
          (serviceFilter === "all" || (r.service || "cargo") === serviceFilter) &&
          (viewFilter === "all" || r.view === viewFilter),
      ),
    [rows, serviceFilter, viewFilter],
  );

  function load() {
    setError(null);
    start(async () => {
      const res = await listCustomerQuotations({ userid });
      if (!res.ok) {
        setError(res.error);
        setRows([]);
        return;
      }
      setRows(res.data?.rows ?? []);
    });
  }

  useEffect(() => {
    // Intentional mount + userid-change fetch (setState via the transition is fine here).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userid]);

  async function copyLink(token: string, id: number) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    try {
      await navigator.clipboard.writeText(`${origin}/q/${token}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* clipboard blocked — the ดู button still opens the link */
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">ประวัติใบเสนอราคา</h3>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[12px] hover:bg-surface-alt disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> รีเฟรช
        </button>
      </div>
      <p className="text-[12px] text-muted">
        ใบเสนอราคา/ใบประเมินราคาที่ &quot;ออกเอกสาร&quot; แล้วในแท็บใบเสนอราคา — เก็บ snapshot ไว้ กดเปิด/ส่งลิงก์ให้ลูกค้าซ้ำได้ (ลูกค้าเปิดดูโดยไม่ต้องล็อกอิน)
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{error}</div>
      )}

      {rows === null ? (
        <p className="py-8 text-center text-[12px] text-muted">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-[12px] text-muted">
          <FileText className="mx-auto mb-2 h-6 w-6 opacity-40" />
          ยังไม่มีประวัติใบเสนอราคา — สร้างจากแท็บ &quot;ใบเสนอราคา&quot; แล้วกด &quot;ออกใบเสนอราคา/ใบประเมินราคา&quot; จะบันทึกที่นี่
        </div>
      ) : (
        <>
          {/* ตัวกรอง — บริการ + รูปแบบ (ดร็อปดาวน์) */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-alt/30 p-2.5">
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              บริการ:
              <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className={selectCls}>
                <option value="all">ทั้งหมด</option>
                {serviceKeys.map((s) => (
                  <option key={s} value={s}>{serviceLabel(s)}</option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              รูปแบบ:
              <select value={viewFilter} onChange={(e) => setViewFilter(e.target.value as ViewFilter)} className={selectCls}>
                <option value="all">ทั้งหมด</option>
                <option value="compare">ใบเสนอราคา</option>
                <option value="calc">ใบประเมินราคา</option>
              </select>
            </label>
            <p className="ml-auto text-[11px] text-muted">
              พบ <b className="text-foreground">{filtered.length}</b> รายการ
              {filtered.length !== rows.length ? ` (จาก ${rows.length})` : ""}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-8 text-center text-[12px] text-muted">
              ไม่พบรายการตามตัวกรอง — ลองปรับตัวกรอง
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[640px] text-[12px]">
                <thead className="bg-surface-alt/60 text-[11px] uppercase text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">เลขที่</th>
                    <th className="px-3 py-2 text-left">บริการ</th>
                    <th className="px-3 py-2 text-left">รูปแบบ</th>
                    <th className="px-3 py-2 text-right">ยอด</th>
                    <th className="px-3 py-2 text-left">วันที่สร้าง</th>
                    <th className="px-3 py-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const amount = r.whtAmount > 0 ? r.netPayable : r.grandTotal;
                    return (
                      <tr key={r.id} className="border-t border-border hover:bg-primary-50/20">
                        <td className="px-3 py-2 font-mono font-semibold text-primary-700">{r.refNo}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px]">{serviceLabel(r.service || "cargo")}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${r.view === "compare" ? "bg-primary-50 text-primary-700" : "bg-surface-alt text-foreground"}`}>
                            {r.view === "calc" ? "ใบประเมินราคา" : "ใบเสนอราคา"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{amount > 0 ? `฿${THB(amount)}` : "—"}</td>
                        <td className="px-3 py-2 text-muted">{fmtDate(r.createdAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex gap-1">
                            <a
                              href={`/q/${r.token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-alt"
                              title="เปิดดูใบเสนอราคา"
                            >
                              <ExternalLink className="w-3 h-3" /> ดู
                            </a>
                            <button
                              type="button"
                              onClick={() => copyLink(r.token, r.id)}
                              className="inline-flex items-center gap-1 rounded-md border border-primary-300 bg-primary-50 px-2 py-1 text-[11px] text-primary-700 hover:bg-primary-100"
                              title="คัดลอกลิงก์ให้ลูกค้า"
                            >
                              {copiedId === r.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                              {copiedId === r.id ? "คัดลอกแล้ว" : "ลิงก์"}
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
