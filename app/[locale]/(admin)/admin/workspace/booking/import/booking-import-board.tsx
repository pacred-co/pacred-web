"use client";

/**
 * สถานะ Booking · นำเข้า — the board.
 * 2026-07-08 (ปอน). Rendered as a gridded TABLE matching the รายการตู้ (report-cnt)
 * pattern (owner: "ต้องเป็นตาราง เหมือนหน้ารายการตู้ · ไม่เอาก้อนๆ"):
 *   overflow-x wrapper · border-collapse gridlines · sortable headers · summary row ·
 *   zebra rows · expandable detail row.
 * Status tabs (mockup) on top · search · เพิ่ม Booking modal. Add-flow is client-state
 * only (prototype · not persisted) until the real table/action lands.
 */

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  Plus, Ship, Plane, Truck, Package, Search,
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, type LucideIcon,
} from "lucide-react";
import { Explain } from "@/components/ui/tooltip";
import {
  BOOKING_STATUS_META, BOOKING_STATUS_ORDER, type Booking,
} from "./booking-data";

// Tabs = the 5 ACTIVE pipeline stages + a single "ประวัติ" bucket (= สำเร็จ + ยกเลิก, the
// closed outcomes · owner 2026-07-09). ยกเลิก = ถังรวมทุกสถานะ · ทำราคาซ้ำ = วนกลับ รอดำเนินการ.
type Filter =
  | "all" | "customer_created" | "pending_pricing" | "awaiting_confirm"
  | "awaiting_booking" | "booking_confirmed" | "history";
const ACTIVE_TAB_STATUSES = [
  "customer_created", "pending_pricing", "awaiting_confirm", "awaiting_booking", "booking_confirmed",
] as const;
const HISTORY_TAB_META = {
  pill: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",
  dot: "bg-zinc-400",
  ring: "ring-zinc-400",
};

type SortKey = "orderNo" | "status" | "date" | "company" | "customerName" | "product" | "transport" | "sales" | "shipmentNo";
type SortDir = "asc" | "desc";

function transportIcon(t: string): LucideIcon {
  const u = (t || "").toUpperCase();
  if (u.includes("AIR")) return Plane;
  if (u.includes("SEA")) return Ship;
  if (u.includes("TRUCK")) return Truck;
  return Package;
}

// DD/MM/YYYY → YYYYMMDD (sortable string); fall back to the orderNo date prefix.
function dateKeyOf(b: Booking): string {
  const m = b.date.split("/");
  if (m.length === 3) return `${m[2]}${m[1].padStart(2, "0")}${m[0].padStart(2, "0")}`;
  return b.orderNo.slice(0, 8);
}

// ── module-level sort header (Next 16 static-components rule) ──
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

// split "IM CIF" → { dir:"IM", incoterm:"CIF" } (owner 2026-07-08: แยก IM/EX ออกจาก Term).
function splitTerm(term: string): { dir: string; incoterm: string } {
  const m = (term || "").trim().match(/^(IM|EX)\b\s*(.*)$/i);
  return m ? { dir: m[1].toUpperCase(), incoterm: m[2].trim() } : { dir: "", incoterm: term || "" };
}
function directionLabel(dir: string): string {
  return dir === "IM" ? "นำเข้า" : dir === "EX" ? "ส่งออก" : "—";
}
const COL_COUNT = 15;

export function BookingImportBoard({ initial }: { initial: Booking[] }) {
  const [bookings, setBookings] = useState<Booking[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  // ตัวกรองย่อยในแท็บ "ประวัติ" (owner 2026-07-09): ทั้งหมด / สำเร็จ / ยกเลิก
  const [historyOutcome, setHistoryOutcome] = useState<"all" | "success" | "cancelled">("all");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // prototype bridge: โหลด draft ที่ save จากฟอร์มใบเสนอราคา (localStorage) + เปิดแท็บตาม ?tab=
  const searchParams = useSearchParams();
  useEffect(() => {
    try {
      const raw = localStorage.getItem("pacred_booking_drafts_import");
      if (raw) {
        const drafts: Booking[] = JSON.parse(raw);
        if (Array.isArray(drafts) && drafts.length) {
          setBookings((prev) => {
            const byOrderNo = new Map(drafts.filter((d) => d?.orderNo).map((d) => [d.orderNo, d]));
            const merged = prev.map((b) => byOrderNo.get(b.orderNo) ?? b);
            const existing = new Set(prev.map((b) => b.orderNo));
            const brandNew = drafts.filter((d) => d?.orderNo && !existing.has(d.orderNo));
            return [...brandNew, ...merged];
          });
        }
      }
    } catch {
      /* ignore malformed drafts */
    }
    const tab = searchParams.get("tab");
    const validTabs = ["all", "customer_created", "pending_pricing", "awaiting_confirm", "awaiting_booking", "booking_confirmed", "history"];
    if (tab && validTabs.includes(tab)) setFilter(tab as Filter);
  }, [searchParams]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length, history: 0 };
    for (const s of BOOKING_STATUS_ORDER) c[s] = 0;
    for (const b of bookings) {
      c[b.status] = (c[b.status] ?? 0) + 1;
      if (b.status === "success" || b.status === "cancelled") c.history += 1;
    }
    return c;
  }, [bookings]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = bookings.filter((b) => {
      const passesFilter =
        filter === "all" ? true
          : filter === "history"
            ? (b.status === "success" || b.status === "cancelled") && (historyOutcome === "all" || b.status === historyOutcome)
            : b.status === filter;
      if (!passesFilter) return false;
      if (!needle) return true;
      return [b.orderNo, b.product, b.customerName, b.sales, b.pricing, b.shipmentNo]
        .some((v) => (v || "").toLowerCase().includes(needle));
    });
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (b: Booking): string | number =>
      sortKey === "status" ? BOOKING_STATUS_ORDER.indexOf(b.status)
        : sortKey === "date" ? dateKeyOf(b)
          : (b[sortKey] ?? "");
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "th") * dir;
    });
  }, [bookings, filter, historyOutcome, q, sortKey, sortDir]);

  function onSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  }
  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <div className="space-y-4">
      {/* ── status tabs (5 active stages + ประวัติ) ─────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <TabPill active={filter === "all"} onClick={() => setFilter("all")} label="ทั้งหมด" count={counts.all} />
        {ACTIVE_TAB_STATUSES.map((s) => (
          <TabPill key={s} active={filter === s} onClick={() => setFilter(s)} label={BOOKING_STATUS_META[s].label} count={counts[s]} tone={BOOKING_STATUS_META[s]} />
        ))}
        <TabPill active={filter === "history"} onClick={() => setFilter("history")} label="ประวัติ" count={counts.history} tone={HISTORY_TAB_META} />
      </div>

      {/* ── search + add ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา เลข booking / สินค้า / ลูกค้า…" aria-label="ค้นหา booking"
            className="w-full rounded-lg border border-border bg-white pl-9 pr-3 py-2 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300 dark:bg-surface"
          />
        </div>
        {filter === "history" && (
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
            สถานะงาน
            <select
              value={historyOutcome}
              onChange={(e) => setHistoryOutcome(e.target.value as "all" | "success" | "cancelled")}
              aria-label="กรองสถานะงาน (ประวัติ)"
              className="h-9 rounded-lg border border-border bg-white px-2 text-sm text-foreground outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300 dark:bg-surface"
            >
              <option value="all">ทั้งหมด ({counts.history})</option>
              <option value="success">สำเร็จ ({counts.success})</option>
              <option value="cancelled">ยกเลิก ({counts.cancelled})</option>
            </select>
          </label>
        )}
        {q && <span className="whitespace-nowrap text-xs text-muted">พบ {visible.length} รายการ</span>}
        <Explain
          className="text-xs text-muted" label="Booking คืออะไร?"
          def="Booking = ลูปใบเสนอราคา→จองงานนำเข้า · ลูกค้าสร้าง → Pricing เคาะราคา Net → ลูกค้าคอนเฟิร์ม → รอ/คอนเฟิร์ม Booking → สำเร็จ (มีเลข Shipment PR…) เข้าหน้ารายการ · ยกเลิก = ถังรวม · ทำราคาซ้ำ = วนกลับ รอดำเนินการ"
        />
        <Link
          href="/admin/workspace/booking/import/new"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" /> เพิ่ม Quotation / Booking
        </Link>
      </div>

      {/* ── table (report-cnt style) ────────────────────────── */}
      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
        <table className="w-full text-xs border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <SortableTH sortKeyValue="date"         align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>วันที่</SortableTH>
              <SortableTH sortKeyValue="orderNo"      align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>เลข Booking</SortableTH>
              <SortableTH sortKeyValue="customerName" align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ชื่อบริษัทลูกค้า</SortableTH>
              <SortableTH sortKeyValue="product"      align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>สินค้า</SortableTH>
              <th className="whitespace-nowrap px-2 py-2 text-left">Term</th>
              <th className="whitespace-nowrap px-2 py-2 text-center">นำเข้า/ส่งออก</th>
              <SortableTH sortKeyValue="transport"    align="center" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>ขนส่ง</SortableTH>
              <SortableTH sortKeyValue="status"       align="center" activeKey={sortKey} sortDir={sortDir} onSort={onSort}>สถานะ</SortableTH>
              <th className="whitespace-nowrap px-2 py-2 text-left">FCL / ขนาด</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">คลัง</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">บริษัท</th>
              <SortableTH sortKeyValue="sales"        align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>Sale</SortableTH>
              <th className="whitespace-nowrap px-2 py-2 text-left">Pricing</th>
              <SortableTH sortKeyValue="shipmentNo"   align="left"   activeKey={sortKey} sortDir={sortDir} onSort={onSort}>Shipment</SortableTH>
              <th className="whitespace-nowrap px-2 py-2 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {/* summary band */}
            <tr className="border-y-2 border-border bg-white text-sm font-bold text-foreground dark:bg-surface">
              <td className="px-2 py-2 text-base font-bold" colSpan={2}>รวม ({q ? `${visible.length}/${bookings.length}` : bookings.length} รายการ)</td>
              <td className="px-2 py-2 text-[11px] font-normal text-muted" colSpan={13}>
                ⏳ กำลังทำอยู่ {counts.customer_created + counts.pending_pricing + counts.awaiting_confirm + counts.awaiting_booking + counts.booking_confirmed} · 📁 ประวัติ {counts.history} (🎉 สำเร็จ {counts.success} · 🛑 ยกเลิก {counts.cancelled})
              </td>
            </tr>

            {visible.length === 0 && (
              <tr>
                <td colSpan={COL_COUNT} className="px-3 py-8 text-center text-sm text-muted">
                  {q ? `ไม่พบ booking ที่ตรงกับ "${q}"` : "ไม่มีรายการในสถานะนี้"}
                </td>
              </tr>
            )}

            {visible.map((b) => {
              const meta = BOOKING_STATUS_META[b.status];
              const TIcon = transportIcon(b.transport);
              const isExpanded = expanded.has(b.id);
              return (
                <Fragment key={b.id}>
                  <tr className="border-t border-border even:bg-surface-alt/20 hover:bg-surface-alt/40">
                    {/* วันที่ */}
                    <td className="whitespace-nowrap px-2 py-2">{b.date}</td>
                    {/* เลข Booking + expand */}
                    <td className="whitespace-nowrap px-2 py-2 font-mono">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button" onClick={() => toggleExpand(b.id)}
                          className="shrink-0 text-muted transition-colors hover:text-primary-600"
                          aria-label={isExpanded ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"} aria-expanded={isExpanded}
                          title="รายละเอียด — ต้นทาง/ปลายทาง · HS · ราคา · หมายเหตุ"
                        >
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                        <span className="font-semibold text-foreground/80">{b.orderNo}</span>
                      </div>
                    </td>
                    {/* ชื่อบริษัทลูกค้า */}
                    <td className="max-w-[14rem] truncate px-2 py-2" title={b.customerName}>{b.customerName || "—"}</td>
                    {/* สินค้า */}
                    <td className="max-w-[16rem] truncate px-2 py-2 font-medium text-foreground" title={b.product}>{b.product}</td>
                    {/* Term (incoterm) */}
                    <td className="whitespace-nowrap px-2 py-2">{splitTerm(b.term).incoterm || "—"}</td>
                    {/* นำเข้า/ส่งออก */}
                    <td className="whitespace-nowrap px-2 py-2 text-center">
                      {splitTerm(b.term).dir ? (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${splitTerm(b.term).dir === "IM" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"}`}>{directionLabel(splitTerm(b.term).dir)}</span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    {/* ขนส่ง */}
                    <td className="whitespace-nowrap px-2 py-2 text-center">
                      <span className="inline-flex items-center gap-1"><TIcon className="h-3 w-3" />{b.transport || "—"}</span>
                    </td>
                    {/* สถานะ */}
                    <td className="whitespace-nowrap px-2 py-2 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>{meta.label}</span>
                    </td>
                    {/* FCL / ขนาด */}
                    <td className="whitespace-nowrap px-2 py-2">{[b.fclLcl, b.size].filter(Boolean).join(" · ") || "—"}</td>
                    {/* คลัง */}
                    <td className="whitespace-nowrap px-2 py-2">{b.warehouse || "—"}</td>
                    {/* บริษัท */}
                    <td className="whitespace-nowrap px-2 py-2">{b.company}</td>
                    {/* Sale */}
                    <td className="whitespace-nowrap px-2 py-2">{b.sales || "—"}</td>
                    {/* Pricing */}
                    <td className="whitespace-nowrap px-2 py-2">{b.pricing || "—"}</td>
                    {/* Shipment */}
                    <td className="whitespace-nowrap px-2 py-2 font-mono">
                      {b.shipmentNo ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{b.shipmentNo}</span> : <span className="text-muted">—</span>}
                    </td>
                    {/* จัดการ — ดูข้อมูล → หน้ารายละเอียด booking */}
                    <td className="whitespace-nowrap px-2 py-2 text-center">
                      <Link
                        href={`/admin/workspace/booking/import/${encodeURIComponent(b.orderNo)}`}
                        className="inline-block rounded border border-green-500 bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-500/20"
                      >
                        ดูข้อมูล
                      </Link>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-surface-alt/30">
                      <td colSpan={COL_COUNT} className="px-4 py-2.5">
                        <div className="grid gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                          <Detail label="ต้นทาง (POL)" value={b.pol} />
                          <Detail label="ปลายทาง (POD)" value={b.pod} />
                          <Detail label="HS Code" value={b.hsCode} mono />
                          <Detail label="หมายเหตุ" value={b.note} />
                          <div className="sm:col-span-2 lg:col-span-4">
                            <Detail label="ราคา / ใบเสนอราคา" value={b.price} preLine />
                          </div>
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

function Detail({ label, value, mono, preLine }: { label: string; value: string; mono?: boolean; preLine?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-muted">{label}</span>
      <span className={`text-foreground/90 ${mono ? "font-mono" : ""} ${preLine ? "whitespace-pre-line" : ""}`}>{value || "—"}</span>
    </div>
  );
}

// ── status tab pill ─────────────────────────────────────────
function TabPill({
  active, onClick, label, count, tone,
}: { active: boolean; onClick: () => void; label: string; count: number; tone?: { pill: string; dot: string; ring: string } }) {
  const meta = tone ?? null;
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? meta
            ? `${meta.pill} ring-2 ${meta.ring} ring-offset-1 ring-offset-background`
            : "bg-primary-600 text-white ring-2 ring-primary-400 ring-offset-1 ring-offset-background"
          : "bg-surface-alt text-muted hover:text-foreground",
      ].join(" ")}
    >
      {meta && <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />}
      {label}
      <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${active ? "bg-black/10 dark:bg-white/15" : "bg-black/5 dark:bg-white/10"}`}>{count}</span>
    </button>
  );
}

// (add-booking modal ถูกแทนที่ด้วยหน้าฟอร์มใบเสนอราคา /admin/workspace/booking/import/new · 2026-07-09)
