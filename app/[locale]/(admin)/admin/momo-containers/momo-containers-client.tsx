"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import type { MomoContainerRow } from "@/actions/admin/momo-containers";
import { VERIFY_LABEL } from "@/lib/admin/momo-container-view";
import { useColumnOrder } from "@/lib/hooks/use-column-order";

const n2 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const n3 = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 6 }));

const FST: Record<string, string> = {
  "1": "รอเข้าโกดังจีน", "2": "ถึงโกดังจีน", "3": "กำลังส่งมาไทย", "4": "ถึงไทยแล้ว",
  "5": "รอชำระ", "6": "เตรียมส่ง", "7": "ส่งแล้ว", "40": "ถึงโกดังจีน", "99": "ยกเลิก",
};
const TRANSPORT: Record<string, string> = { "1": "🚚 รถ", "2": "🚢 เรือ", "3": "✈️ อากาศ" };

type Col = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render: (r: MomoContainerRow) => ReactNode;
  foot?: (rows: MomoContainerRow[]) => ReactNode;
};

const COLS: Col[] = [
  {
    key: "cabinet", label: "เลขตู้", align: "left",
    render: (r) => (
      <Link href={`/admin/momo-containers/${encodeURIComponent(r.cabinet)}`} className="font-mono font-semibold text-sky-700 hover:underline">
        {r.cabinet}
      </Link>
    ),
    foot: (rows) => <span className="text-muted">{rows.length} ตู้</span>,
  },
  { key: "transport", label: "ขนส่ง", align: "center", render: (r) => (r.transport ? TRANSPORT[r.transport] ?? "—" : "—") },
  {
    key: "status", label: "สถานะตู้", align: "left",
    render: (r) => <span className="text-[11px] text-muted">{r.minFstatus ? (FST[r.minFstatus] ?? `[${r.minFstatus}]`) : "—"}</span>,
  },
  {
    key: "verify", label: "สถานะตรวจ", align: "center",
    render: (r) => {
      const v = VERIFY_LABEL[r.verify.status];
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span className={`inline-block rounded-full px-1.5 py-0.5 text-[11px] font-medium ${v.cls}`}>{v.label}</span>
          {r.apiMissing > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700" title="แทร็กที่มีใน packing list แต่ MOMO API ไม่มี">
              💗 API ขาด {r.apiMissing}
            </span>
          )}
        </div>
      );
    },
  },
  {
    key: "track", label: "แทรคกิ้ง", align: "right",
    render: (r) => r.trackCount,
    foot: (rows) => rows.reduce((s, r) => s + r.trackCount, 0),
  },
  {
    key: "boxes", label: "กล่อง (ระบบ→packing)", align: "right",
    render: (r) => <span className={r.verify.boxShort ? "text-rose-700 font-semibold" : ""}>{r.boxes ?? "—"}{r.hasPacking ? `→${r.packingBoxes ?? "—"}` : ""}</span>,
    foot: (rows) => rows.reduce((s, r) => s + (r.boxes ?? 0), 0),
  },
  {
    key: "weight", label: "น้ำหนัก (ระบบ→packing)", align: "right",
    render: (r) => <span className={r.verify.weightShort ? "text-amber-700 font-semibold" : ""}>{n2(r.weight)}{r.hasPacking ? `→${n2(r.packingWeight)}` : ""}</span>,
    foot: (rows) => n2(rows.reduce((s, r) => s + (r.weight ?? 0), 0)),
  },
  {
    key: "cbm", label: "คิว (ระบบ→packing)", align: "right",
    render: (r) => <span>{n3(r.cbm)}{r.hasPacking ? `→${n3(r.packingCbm)}` : ""}</span>,
    foot: (rows) => n3(rows.reduce((s, r) => s + (r.cbm ?? 0), 0)),
  },
  {
    key: "packing", label: "packing ล่าสุด", align: "left",
    render: (r) => (r.packingUploadedAt ? <span className="text-[11px] text-muted">{new Date(r.packingUploadedAt).toLocaleDateString("th-TH")}</span> : <span className="text-[11px] text-gray-400">—</span>),
  },
];

const COL_MAP = new Map(COLS.map((c) => [c.key, c]));
const DEFAULT_ORDER = COLS.map((c) => c.key);

type Tab = "all" | "issue" | "no_packing";

export function MomoContainersClient({ rows }: { rows: MomoContainerRow[] }) {
  const { order, move, reset } = useColumnOrder(DEFAULT_ORDER);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);

  const counts = useMemo(() => ({
    all: rows.length,
    issue: rows.filter((r) => r.verify.status !== "ok" && r.verify.status !== "no_packing").length + rows.filter((r) => r.apiMissing > 0).length,
    no_packing: rows.filter((r) => r.verify.status === "no_packing").length,
  }), [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "issue") list = list.filter((r) => (r.verify.status !== "ok" && r.verify.status !== "no_packing") || r.apiMissing > 0);
    else if (tab === "no_packing") list = list.filter((r) => r.verify.status === "no_packing");
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((r) => r.cabinet.toLowerCase().includes(term));
    return list;
  }, [rows, tab, q]);

  const cols = order.map((k) => COL_MAP.get(k)).filter((c): c is Col => !!c);

  const thAlign = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className="space-y-3">
      {/* tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {([["all", "ทั้งหมด"], ["issue", "🔴 มีปัญหา"], ["no_packing", "📄 ยังไม่มี packing"]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${tab === k ? "bg-primary-600 text-white" : "bg-surface-alt text-muted hover:bg-surface-alt/70"}`}>
            {label} <span className="opacity-70">{counts[k]}</span>
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขตู้…"
          className="ml-auto rounded-full border border-border bg-white dark:bg-surface px-3 py-1 text-xs" />
        <button type="button" onClick={reset} className="rounded-full border border-border px-3 py-1 text-xs hover:bg-surface-alt" title="รีเซ็ตลำดับคอลัมน์">
          ↺ รีเซ็ตคอลัมน์
        </button>
      </div>

      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <table className="w-full text-xs border-collapse [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
          <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              {cols.map((c) => (
                <th key={c.key} draggable
                  onDragStart={() => setDragKey(c.key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragKey) move(dragKey, c.key); setDragKey(null); }}
                  onDragEnd={() => setDragKey(null)}
                  className={`cursor-move select-none whitespace-nowrap px-2.5 py-2 ${thAlign(c.align)} ${dragKey === c.key ? "bg-primary-100" : ""} hover:bg-surface-alt`}
                  title="ลากเพื่อย้ายคอลัมน์">
                  <span className="mr-1 text-gray-400">⋮⋮</span>{c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-xs text-muted">ไม่มีตู้ตามเงื่อนไข</td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.cabinet} className={`border-t border-border ${r.verify.status !== "ok" && r.verify.status !== "no_packing" ? "bg-rose-50/40" : ""}`}>
                {cols.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-2.5 py-1.5 ${thAlign(c.align)}`}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-border bg-amber-50/60 font-semibold">
              <tr>
                {cols.map((c) => (
                  <td key={c.key} className={`whitespace-nowrap px-2.5 py-2 ${thAlign(c.align)}`}>{c.foot ? c.foot(filtered) : ""}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-muted leading-relaxed">
        &quot;ระบบ→packing&quot; = ค่าในระบบ (tb_forwarder) → ค่าจาก packing list ที่อัพล่าสุด · 💗 กล่องขาด / ⚖️ น้ำหนักหาย = ระบบน้อยกว่า packing ·
        💗 API ขาด = แทร็กที่มีใน packing list แต่ MOMO API ไม่มี · กดเลขตู้เพื่อดูรายละเอียด · อัพ packing list ได้ที่หน้า &quot;อัปโหลด packing list&quot;
      </p>
    </div>
  );
}
