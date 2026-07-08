"use client";

/**
 * รายการ · นำเข้า — the board. Gridded TABLE (report-cnt pattern) of confirmed import jobs
 * (DOC DATA sheet). Top = a status-chip bar (the "สถานะ" column · owner 2026-07-08). Data
 * flows from confirmed bookings (each row = a PR + shipment no). Read-only prototype — no DB.
 */

import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  Ship, Plane, Truck, Package, Search,
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Explain } from "@/components/ui/tooltip";
import { LIST_STATUSES, statusPill, type ListItem } from "./list-data";

type Filter = "all" | string;
type SortKey = "date" | "pr" | "shipment" | "status" | "product" | "consignee" | "carrier" | "containerNo" | "cbm" | "etd" | "eta";
type SortDir = "asc" | "desc";
const COL_COUNT = 14;

function transportIcon(t: string): LucideIcon {
  const u = (t || "").toUpperCase();
  if (u.includes("AIR")) return Plane;
  if (u.includes("SEA")) return Ship;
  if (u.includes("TRUCK")) return Truck;
  return Package;
}
function dateKeyOf(d: string): string {
  const m = d.split("/");
  return m.length === 3 ? `${m[2]}${m[1].padStart(2, "0")}${m[0].padStart(2, "0")}` : d;
}
function numOf(s: string): number {
  const n = parseFloat((s || "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : -1;
}

function SortIcon({ k, activeKey, sortDir }: { k: SortKey; activeKey: SortKey; sortDir: SortDir }) {
  if (k !== activeKey) return <ArrowUpDown className="ml-0.5 inline h-3 w-3 opacity-60" />;
  return sortDir === "asc" ? <ArrowUp className="ml-0.5 inline h-3 w-3" /> : <ArrowDown className="ml-0.5 inline h-3 w-3" />;
}
function SortableTH({
  sortKeyValue, align, children, activeKey, sortDir, onSort,
}: {
  sortKeyValue: SortKey; align?: "left" | "right" | "center"; children: ReactNode;
  activeKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  const text = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`whitespace-nowrap px-2 py-2 ${text}`}>
      <button
        type="button" onClick={() => onSort(sortKeyValue)}
        className={`inline-flex w-full items-center ${justify} cursor-pointer transition-colors hover:text-foreground`}
        aria-label={`เรียงตาม ${typeof children === "string" ? children : ""}`}
      >
        {children}<SortIcon k={sortKeyValue} activeKey={activeKey} sortDir={sortDir} />
      </button>
    </th>
  );
}

export function ListImportBoard({ initial }: { initial: ListItem[] }) {
  const [rows] = useState<ListItem[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, __done: 0, __cancel: 0 };
    for (const s of LIST_STATUSES) c[s.key] = 0;
    for (const r of rows) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (r.status === "สำเร็จ") c.__done += 1;
      if (r.status === "ยกเลิก") c.__cancel += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!needle) return true;
      return [r.pr, r.shipment, r.product, r.consignee, r.containerNo, r.blNo, r.carrier]
        .some((v) => (v || "").toLowerCase().includes(needle));
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: ListItem): string | number =>
      sortKey === "status" ? LIST_STATUSES.findIndex((s) => s.key === r.status)
        : sortKey === "date" ? dateKeyOf(r.date)
          : sortKey === "etd" ? dateKeyOf(r.etd)
            : sortKey === "eta" ? dateKeyOf(r.eta)
              : sortKey === "cbm" ? numOf(r.cbm)
                : (r[sortKey] ?? "");
    return [...out].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "th") * dir;
    });
  }, [rows, filter, q, sortKey, sortDir]);

  function onSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }
  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <div className="space-y-4">
      {/* ── status chip bar (คอลัมน์สถานะ) ─────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusChip active={filter === "all"} onClick={() => setFilter("all")} label="ทั้งหมด" count={counts.all} />
        {LIST_STATUSES.map((s) => (
          <StatusChip
            key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)}
            label={s.key} count={counts[s.key]} pill={statusPill(s.key)} dim={counts[s.key] === 0}
          />
        ))}
      </div>

      {/* ── search ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา PR / Shipment / สินค้า / เลขตู้ / B/L…" aria-label="ค้นหารายการนำเข้า"
            className="w-full rounded-lg border border-border bg-white pl-9 pr-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300 dark:bg-surface"
          />
        </div>
        {q && <span className="whitespace-nowrap text-xs text-muted">พบ {visible.length} รายการ</span>}
        <Explain
          className="text-xs text-muted" label="รายการนำเข้า คืออะไร?"
          def="งานนำเข้าที่ลูกค้าเฟิร์มราคาแล้ว (ไหลมาจากหน้า Booking) · มีรหัสลูกค้า (PR) + เลข Shipment · Doc เดินเอกสาร+อัปเดตสถานะตามคอลัมน์สถานะด้านบน"
        />
      </div>

      {/* ── table (report-cnt style) ────────────────────────── */}
      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
        <table className="w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <SortableTH sortKeyValue="pr"          align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>รหัสลูกค้า (PR)</SortableTH>
              <SortableTH sortKeyValue="shipment"    align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>Shipment</SortableTH>
              <SortableTH sortKeyValue="status"      align="center" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>สถานะ</SortableTH>
              <SortableTH sortKeyValue="product"     align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>สินค้า</SortableTH>
              <SortableTH sortKeyValue="consignee"   align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ลูกค้า</SortableTH>
              <th className="whitespace-nowrap px-2 py-2 text-center">ประเภท</th>
              <SortableTH sortKeyValue="carrier"     align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>สายเรือ</SortableTH>
              <SortableTH sortKeyValue="containerNo" align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>เลขตู้</SortableTH>
              <SortableTH sortKeyValue="cbm"         align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>CBM</SortableTH>
              <SortableTH sortKeyValue="etd"         align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ETD</SortableTH>
              <SortableTH sortKeyValue="eta"         align="right"  activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ETA</SortableTH>
              <th className="whitespace-nowrap px-2 py-2 text-left">POD</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">ชิปปิ้ง</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">เอกสาร (IV/RE)</th>
            </tr>
          </thead>
          <tbody>
            {/* summary band */}
            <tr className="border-y-2 border-border bg-white text-sm font-bold text-foreground dark:bg-surface">
              <td className="px-2 py-2 text-base font-bold" colSpan={2}>รวม ({q || filter !== "all" ? `${visible.length}/${rows.length}` : rows.length} รายการ)</td>
              <td className="px-2 py-2 text-[11px] font-normal text-muted" colSpan={12}>
                🚢 กำลังดำเนินการ {rows.length - counts.__done - counts.__cancel} · 🎉 สำเร็จ {counts.__done} · ❌ ยกเลิก {counts.__cancel}
              </td>
            </tr>

            {visible.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="px-3 py-8 text-center text-sm text-muted">
                  {q || filter !== "all" ? "ไม่พบรายการที่ตรงกับเงื่อนไข" : "ยังไม่มีรายการ"}
                </td>
              </tr>
            )}

            {visible.map((r) => {
              const TIcon = transportIcon(r.type);
              const isExpanded = expanded.has(r.id);
              return (
                <Fragment key={r.id}>
                  <tr className="border-t border-border even:bg-surface-alt/20 hover:bg-surface-alt/40">
                    {/* PR + expand */}
                    <td className="whitespace-nowrap px-2 py-2 font-mono">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button" onClick={() => toggleExpand(r.id)}
                          className="shrink-0 text-muted transition-colors hover:text-primary-600"
                          aria-label={isExpanded ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"} aria-expanded={isExpanded}
                          title="รายละเอียด — ที่อยู่ · B/L · เรือ/เที่ยว · Form E · CTNS/KG · Doc · หมายเหตุ"
                        >
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        <span className="font-semibold text-primary-700 dark:text-primary-300">{r.pr}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono">
                      <Link
                        href={`/admin/workspace/list/import/${encodeURIComponent(r.shipment)}`}
                        className="font-semibold text-primary-600 hover:underline"
                        title="เปิดใบบุ๊คกิ้งของชิปเม้นนี้"
                      >
                        {r.shipment}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${statusPill(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="max-w-[16rem] truncate px-2 py-2 font-medium text-foreground" title={r.product}>{r.product || "—"}</td>
                    <td className="max-w-[14rem] truncate px-2 py-2" title={r.consignee}>{r.consignee || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-center">
                      <span className="inline-flex items-center gap-1"><TIcon className="h-3 w-3" />{r.type || "—"}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{r.carrier || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono">{r.containerNo || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{r.cbm || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">{r.etd || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">{r.eta || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2">{r.pod || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2">{r.shipping || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-[11px]">
                      {r.invNo || r.receiptNo ? (
                        <span className="flex flex-col leading-tight">
                          {r.invNo && <span className="text-sky-600 dark:text-sky-400">{r.invNo}</span>}
                          {r.receiptNo && <span className="text-emerald-600 dark:text-emerald-400">{r.receiptNo}</span>}
                        </span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-surface-alt/30">
                      <td colSpan={COL_COUNT} className="px-4 py-2.5">
                        <div className="grid gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                          <Detail label="บริษัท" value={r.company} />
                          <Detail label="Term / ขนาด" value={[r.term, r.size].filter(Boolean).join(" · ")} />
                          <Detail label="ต้นทาง (POL)" value={r.pol} />
                          <Detail label="Form E" value={r.formE} />
                          <Detail label="B/L - AWB" value={r.blNo} mono />
                          <Detail label="เรือ / เที่ยว" value={r.vessel} />
                          <Detail label="CTNS / KGM" value={[r.ctns && `${r.ctns} กล่อง`, r.kgm && `${r.kgm} กก.`].filter(Boolean).join(" · ")} />
                          <Detail label="Sales / Doc" value={[r.sales, r.docFreight].filter(Boolean).join(" / ")} />
                          <div className="sm:col-span-2 lg:col-span-2"><Detail label="ที่อยู่ผู้รับ" value={r.address} /></div>
                          <div className="sm:col-span-2 lg:col-span-2"><Detail label="หมายเหตุ" value={r.note} /></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted">{label}</span>
      <span className={`text-foreground/90 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

// ── status chip (filter bar) ────────────────────────────────
function StatusChip({
  active, onClick, label, count, pill, dim,
}: { active: boolean; onClick: () => void; label: string; count: number; pill?: string; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
        active
          ? pill
            ? `${pill} ring-2 ring-offset-1 ring-offset-background ring-black/15 dark:ring-white/25`
            : "bg-primary-600 text-white ring-2 ring-primary-400 ring-offset-1 ring-offset-background"
          : dim
            ? "bg-surface-alt/60 text-muted/50 hover:text-muted"
            : "bg-surface-alt text-muted hover:text-foreground",
      ].join(" ")}
    >
      {label}
      <span className={`rounded-full px-1.5 tabular-nums ${active ? "bg-black/10 dark:bg-white/15" : "bg-black/5 dark:bg-white/10"}`}>{count}</span>
    </button>
  );
}
