"use client";

/**
 * <DocumentHistoryTable> — client view for ประวัติออกเอกสารทั้งหมด (HIST lane).
 * Tabs (ทั้งหมด/นิติ/ทั่วไป) + type filter + search over the pre-merged doc rows
 * + a GET date-range form (reloads the server page). Per-row "ดู/พิมพ์" link.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";

export type DocRow = {
  kind: "receipt" | "bill" | "tax";
  kindLabel: string;
  docNo: string;
  dateISO: string;
  amount: number;
  userid: string;
  customerName: string;
  isJuristic: boolean;
  status: string;
  viewHref: string;
};

const KIND_STYLE: Record<DocRow["kind"], string> = {
  receipt: "bg-emerald-50 text-emerald-700 border-emerald-200",
  bill: "bg-sky-50 text-sky-700 border-sky-200",
  tax: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${Number(y) + 543 - 0}`; // พ.ศ.
};

export function DocumentHistoryTable({ rows, from, to }: { rows: DocRow[]; from: string; to: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"all" | "juristic" | "personal">("all");
  const [kind, setKind] = useState<"all" | DocRow["kind"]>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "juristic" && !r.isJuristic) return false;
      if (tab === "personal" && r.isJuristic) return false;
      if (kind !== "all" && r.kind !== kind) return false;
      if (term) {
        const hay = `${r.docNo} ${r.customerName} ${r.userid}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, tab, kind, q]);

  const sum = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);

  function applyRange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nf = String(fd.get("from") ?? "");
    const nt = String(fd.get("to") ?? "");
    router.push(`/admin/accounting/document-history?from=${nf}&to=${nt}`);
  }

  const TAB = (k: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      className={`rounded-full px-3 py-1 text-xs font-medium border ${tab === k ? "bg-primary-600 text-white border-primary-600" : "bg-white text-foreground border-border hover:bg-surface-alt"}`}
    >
      {label}
    </button>
  );
  const KIND = (k: typeof kind, label: string) => (
    <button
      type="button"
      onClick={() => setKind(k)}
      className={`rounded-full px-3 py-1 text-xs font-medium border ${kind === k ? "bg-foreground text-white border-foreground" : "bg-white text-foreground border-border hover:bg-surface-alt"}`}
    >
      {label}
    </button>
  );

  return (
    <main className="p-4 lg:p-8 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">บัญชี · เอกสาร</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">ประวัติออกเอกสารทั้งหมด</h1>
        <p className="mt-1 text-sm text-muted">ใบเสร็จ · ใบวางบิล · ใบกำกับภาษี — รวมทุกใบในช่วงวันที่ · กรอง นิติ/ทั่วไป · ค้นหา · พิมพ์</p>
      </div>

      {/* Date-range */}
      <form onSubmit={applyRange} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-white dark:bg-surface p-3">
        <label className="text-xs">
          <span className="block text-muted">ตั้งแต่วันที่</span>
          <input type="date" name="from" defaultValue={from} className="mt-1 rounded-md border border-border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs">
          <span className="block text-muted">ถึงวันที่</span>
          <input type="date" name="to" defaultValue={to} className="mt-1 rounded-md border border-border px-2 py-1 text-sm" />
        </label>
        <button type="submit" className="rounded-md bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700">ดูช่วงนี้</button>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {TAB("all", "ทั้งหมด")}
        {TAB("juristic", "นิติบุคคล")}
        {TAB("personal", "ทั่วไป")}
        <span className="mx-1 text-muted">·</span>
        {KIND("all", "ทุกเอกสาร")}
        {KIND("receipt", "ใบเสร็จ")}
        {KIND("bill", "ใบวางบิล")}
        {KIND("tax", "ใบกำกับ")}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา เลขที่/ลูกค้า/รหัส"
          className="ml-auto w-56 rounded-md border border-border px-3 py-1.5 text-sm"
        />
      </div>

      <div className="text-sm text-muted">
        พบ <b className="text-foreground">{filtered.length.toLocaleString()}</b> เอกสาร · รวม <b className="text-foreground">{baht(sum)}</b>
      </div>

      {/* Table */}
      <div className="overflow-x-auto scrollbar-x-visible rounded-xl border border-border bg-white dark:bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/60 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">ประเภท</th>
              <th className="px-3 py-2 text-left">เลขที่</th>
              <th className="px-3 py-2 text-left">ลูกค้า</th>
              <th className="px-3 py-2 text-left">วันที่</th>
              <th className="px-3 py-2 text-right">ยอด</th>
              <th className="px-3 py-2 text-left">สถานะ</th>
              <th className="px-3 py-2 text-center">ดู/พิมพ์</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-12 text-center text-sm text-muted">ไม่พบเอกสารในช่วง/ตัวกรองนี้</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={`${r.kind}-${r.docNo}`} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_STYLE[r.kind]}`}>{r.kindLabel}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.docNo}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-foreground">{r.customerName}</div>
                    <div className="flex items-center gap-1 text-[11px] text-muted">
                      <span className="font-mono">{r.userid || "—"}</span>
                      <span className={`rounded border px-1 ${r.isJuristic ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                        {r.isJuristic ? "นิติ" : "บุคคล"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDate(r.dateISO)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{baht(r.amount)}</td>
                  <td className="px-3 py-2 text-xs">{r.status || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    <Link href={r.viewHref} className="rounded border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700 hover:bg-primary-100">
                      ดู/พิมพ์
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
