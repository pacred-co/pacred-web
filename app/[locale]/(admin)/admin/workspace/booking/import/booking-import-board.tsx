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

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import {
  Plus, Ship, Plane, Truck, Package, X, Search,
  ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, type LucideIcon,
} from "lucide-react";
import { Explain } from "@/components/ui/tooltip";
import {
  BOOKING_STATUS_META, BOOKING_STATUS_ORDER, type Booking,
} from "./booking-data";

// Tabs = the 3 ACTIVE quotation stages + a single "ประวัติ" bucket (= สำเร็จ + ไม่สำเร็จ,
// the closed outcomes · owner 2026-07-08: "สำเร็จ/ไม่สำเร็จ คือประวัติ · รวมเป็นแท็บเดียว").
type Filter = "all" | "quote_requested" | "quote_in_progress" | "awaiting_confirm" | "history";
const ACTIVE_TAB_STATUSES = ["quote_requested", "quote_in_progress", "awaiting_confirm"] as const;
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

export function BookingImportBoard({ initial, currentSales }: { initial: Booking[]; currentSales: { id: string; name: string } }) {
  const [bookings, setBookings] = useState<Booking[]>(initial);
  const [filter, setFilter] = useState<Filter>("all");
  // ตัวกรองย่อยในแท็บ "ประวัติ" (owner 2026-07-08): ทั้งหมด / สำเร็จ / ไม่คอนเฟิร์ม
  const [historyOutcome, setHistoryOutcome] = useState<"all" | "success" | "failed">("all");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length, history: 0 };
    for (const s of BOOKING_STATUS_ORDER) c[s] = 0;
    for (const b of bookings) {
      c[b.status] = (c[b.status] ?? 0) + 1;
      if (b.status === "success" || b.status === "failed") c.history += 1;
    }
    return c;
  }, [bookings]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = bookings.filter((b) => {
      const passesFilter =
        filter === "all" ? true
          : filter === "history"
            ? (b.status === "success" || b.status === "failed") && (historyOutcome === "all" || b.status === historyOutcome)
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
  // ลูกค้าไม่คอนเฟิร์ม → เด้งกลับ "กำลังทำใบเสนอราคา" เพื่อทำราคาที่ดีที่สุดใหม่
  // (owner 2026-07-08). Prototype: client-state only.
  function reQuote(id: string) {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "quote_in_progress" } : b)));
    setFilter("quote_in_progress");
  }

  return (
    <div className="space-y-4">
      {/* ── status tabs (3 active stages + ประวัติ) ─────────── */}
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
              onChange={(e) => setHistoryOutcome(e.target.value as "all" | "success" | "failed")}
              aria-label="กรองสถานะงาน (ประวัติ)"
              className="h-9 rounded-lg border border-border bg-white px-2 text-sm text-foreground outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300 dark:bg-surface"
            >
              <option value="all">ทั้งหมด ({counts.history})</option>
              <option value="success">สำเร็จ ({counts.success})</option>
              <option value="failed">ไม่คอนเฟิร์ม ({counts.failed})</option>
            </select>
          </label>
        )}
        {q && <span className="whitespace-nowrap text-xs text-muted">พบ {visible.length} รายการ</span>}
        <Explain
          className="text-xs text-muted" label="Booking คืออะไร?"
          def="Booking = รายการขอใบเสนอราคางานนำเข้า · Sales ขอราคา → Pricing ทำใบเสนอราคา → ลูกค้าเฟิร์ม → เปิดงาน (มีเลข Shipment PR…) เข้าหน้ารายการ"
        />
        <button
          onClick={() => setAddOpen(true)}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" /> เพิ่ม Booking
        </button>
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
              <th className="whitespace-nowrap px-2 py-2 text-left">ขั้นถัดไป</th>
            </tr>
          </thead>
          <tbody>
            {/* summary band */}
            <tr className="border-y-2 border-border bg-white text-sm font-bold text-foreground dark:bg-surface">
              <td className="px-2 py-2 text-base font-bold" colSpan={2}>รวม ({q ? `${visible.length}/${bookings.length}` : bookings.length} รายการ)</td>
              <td className="px-2 py-2 text-[11px] font-normal text-muted" colSpan={13}>
                ⏳ กำลังทำอยู่ {counts.quote_requested + counts.quote_in_progress + counts.awaiting_confirm} · 📁 ประวัติ {counts.history} (🎉 สำเร็จ {counts.success} · 🛑 ไม่คอนเฟิร์ม {counts.failed})
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
                    {/* ขั้นถัดไป (§0g) */}
                    <td className="min-w-[11rem] px-2 py-2 text-[11px]">
                      {b.status === "success" && b.shipmentNo ? (
                        <Link href="/admin/workspace/list/import" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">🎉 เปิดงานแล้ว · ดูในรายการ →</Link>
                      ) : b.status === "failed" ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-muted">🛑 ไม่คอนเฟิร์ม{b.note ? `: ${b.note}` : ""}</span>
                          <ReQuoteButton onClick={() => reQuote(b.id)} />
                        </div>
                      ) : b.status === "awaiting_confirm" ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-semibold text-rose-600 dark:text-rose-400">🔔 {meta.next}</span>
                          <ReQuoteButton onClick={() => reQuote(b.id)} />
                        </div>
                      ) : (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">🔔 {meta.next}</span>
                      )}
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

      {addOpen && (
        <AddBookingModal
          existingCount={bookings.length}
          currentSales={currentSales}
          onClose={() => setAddOpen(false)}
          onAdd={(b) => { setBookings((prev) => [b, ...prev]); setAddOpen(false); setFilter("quote_requested"); }}
        />
      )}
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

// ↩ ทำราคาใหม่ — ไม่คอนเฟิร์ม → เด้งกลับ "กำลังทำใบเสนอราคา" (owner 2026-07-08).
function ReQuoteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="inline-flex items-center gap-0.5 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
      title="ลูกค้าไม่คอนเฟิร์ม → เด้งกลับ ‘กำลังทำใบเสนอราคา’ เพื่อทำราคาที่ดีที่สุดใหม่"
    >
      ↩ ทำราคาใหม่
    </button>
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

// ── add-booking modal (prototype · client-state only) ───────
const COMPANIES = ["PACRED", "PCS", "AXELRA"];
const INCOTERMS = ["CIF", "EXW", "FOB", "DDP", "FCA", "DAP"];
const TRANSPORTS = ["SEA", "AIR", "TRUCK", "SEA&TRUCK"];
const FCLLCL = ["FCL", "LCL"];

function AddBookingModal({
  existingCount, currentSales, onClose, onAdd,
}: { existingCount: number; currentSales: { id: string; name: string }; onClose: () => void; onAdd: (b: Booking) => void }) {
  // Sales is NOT a form field — it's the logged-in user (owner 2026-07-08).
  const [f, setF] = useState({
    customerName: "", product: "", company: "PACRED", pricing: "",
    direction: "IM", incoterm: "CIF", transport: "SEA", fclLcl: "FCL", size: "", warehouse: "",
    pol: "", pod: "", hsCode: "", price: "", note: "",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const valid = f.customerName.trim() !== "" && f.product.trim() !== "";

  function submit() {
    if (!valid) return;
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    onAdd({
      id: `b-new-${d.getTime()}`,
      orderNo: `${ymd}-${String(existingCount + 1).padStart(3, "0")}`,
      date: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
      status: "quote_requested",
      company: f.company, customerName: f.customerName.trim(), product: f.product.trim(),
      sales: currentSales.id, pricing: f.pricing.trim(), term: `${f.direction} ${f.incoterm}`, transport: f.transport,
      fclLcl: f.fclLcl, size: f.size.trim(), warehouse: f.warehouse.trim(),
      pol: f.pol.trim(), pod: f.pod.trim(), price: f.price.trim(), hsCode: f.hsCode.trim(), note: f.note.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-base font-bold text-foreground">เพิ่ม Booking · นำเข้า</h2>
            <p className="text-[11px] text-muted">เซลขอใบเสนอราคา → เข้าสถานะ “ขอใบเสนอราคา”</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface-alt hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          <Field label="ชื่อลูกค้า" required><Input value={f.customerName} onChange={set("customerName")} placeholder="ชื่อ / บริษัท ลูกค้า" /></Field>
          <Field label="สินค้า" required><Input value={f.product} onChange={set("product")} placeholder="สินค้าคืออะไร" /></Field>
          <Field label="บริษัท"><Select value={f.company} onChange={set("company")} options={COMPANIES} /></Field>
          <Field label="นำเข้า / ส่งออก"><Select value={f.direction} onChange={set("direction")} options={["IM", "EX"]} labels={{ IM: "นำเข้า (IM)", EX: "ส่งออก (EX)" }} /></Field>
          <Field label="Term (Incoterm)"><Select value={f.incoterm} onChange={set("incoterm")} options={INCOTERMS} /></Field>
          <Field label="เซล (Sales)">
            <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface-alt/50 px-2.5 text-sm">
              <span className="truncate font-medium text-foreground">{currentSales.name}</span>
              <span className="shrink-0 text-[11px] text-muted">({currentSales.id})</span>
              <span className="ml-auto shrink-0 rounded bg-primary-100 px-1.5 py-0.5 text-[11px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">คุณ · อัตโนมัติ</span>
            </div>
          </Field>
          <Field label="Pricing"><Input value={f.pricing} onChange={set("pricing")} placeholder="ชื่อ pricing" /></Field>
          <Field label="ขนส่งทาง"><Select value={f.transport} onChange={set("transport")} options={TRANSPORTS} /></Field>
          <Field label="FCL / LCL"><Select value={f.fclLcl} onChange={set("fclLcl")} options={FCLLCL} /></Field>
          <Field label="ขนาดตู้"><Input value={f.size} onChange={set("size")} placeholder="40HQ / 20HQ / ตามขนาดสินค้า" /></Field>
          <Field label="คลัง"><Input value={f.warehouse} onChange={set("warehouse")} placeholder="PAT / เรือ / BFS …" /></Field>
          <Field label="ต้นทาง (POL)"><Input value={f.pol} onChange={set("pol")} placeholder="ที่อยู่/ท่าต้นทาง" /></Field>
          <Field label="ปลายทาง (POD)"><Input value={f.pod} onChange={set("pod")} placeholder="ที่อยู่/ท่าปลายทาง" /></Field>
          <Field label="HS Code"><Input value={f.hsCode} onChange={set("hsCode")} placeholder="เช่น 9504.40.00" /></Field>
          <Field label="ราคา / ใบเสนอราคา" full><Textarea value={f.price} onChange={set("price")} placeholder="ราคาที่เสนอ / รายละเอียด" /></Field>
          <Field label="หมายเหตุ" full><Textarea value={f.note} onChange={set("note")} placeholder="โน้ตเพิ่มเติม" /></Field>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[11px] text-muted">⚠️ ตัวอย่าง — บันทึกในหน้านี้ชั่วคราว (ยังไม่ต่อฐานข้อมูล)</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-alt hover:text-foreground">ยกเลิก</button>
            <button onClick={submit} disabled={!valid} className="rounded-md bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40">บันทึก Booking</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] font-medium text-muted">{label}{required && <span className="text-primary-600"> *</span>}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40"
    />
  );
}

function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
      className="resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-muted/70 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40"
    />
  );
}

function Select({ value, onChange, options, labels }: { value: string; onChange: (v: string) => void; options: string[]; labels?: Record<string, string> }) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/40"
    >
      {options.map((o) => <option key={o} value={o}>{labels?.[o] ?? o}</option>)}
    </select>
  );
}
