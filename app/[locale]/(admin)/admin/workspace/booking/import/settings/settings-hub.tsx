"use client";

/**
 * Booking settings hub (ตั้งค่าระบบ) — tabbed settings shell.
 * 2026-07-13 (ปอน) — ports the settings mockup (pacred-settings-mockup-v4) into our
 *   design system: 10 tabs · 5 stat cards · master-data panels (สายเรือ · ประเทศ ·
 *   เอเจนต์ · ท่า · เอกสาร · รถ · ตู้ · บริการ) — PROTOTYPE (client-state) — plus the
 *   ONE real surface: the Term & Pricing tab renders <BookingCatalogSettings/> (the
 *   working Term×ขนส่ง×LCL/FCL rate catalog · ราคาขาย/ต้นทุน/กำไร · persisted DB).
 *
 * Non-pricing tabs are reference/prototype: search + client-state delete (confirm-first,
 * §0f) + add/edit feedback ("ตัวอย่าง — พร้อมเชื่อมต่อฐานข้อมูล"). No DB writes here.
 */

import {
  Fragment, useCallback, useEffect, useRef, useState,
  type Dispatch, type ReactNode, type SetStateAction,
} from "react";
import {
  Anchor, Container, FileText, Globe, LayoutGrid, Package, Pencil, Plus, Receipt,
  Search, Ship, SlidersHorizontal, Trash2, Truck, Users, type LucideIcon,
} from "lucide-react";
import type { CatalogTemplate } from "@/lib/booking/catalog";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { BookingCatalogSettings } from "./booking-catalog-settings";
import {
  STATS, SHIPPING_LINES,
  COUNTRY_ROWS, COUNTRY_HEADERS, AGENT_ROWS, AGENT_HEADERS,
  PORT_ROWS, PORT_HEADERS, DOCUMENT_ROWS, DOCUMENT_HEADERS,
  SERVICE_ROWS, SERVICE_HEADERS, VEHICLES, VEHICLE_PRICING_METHODS, CONTAINERS,
  type StatCardData, type StatTone, type SimpleRow, type ShippingLine,
  type Vehicle, type ContainerType,
} from "./settings-hub-data";

const cx = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(" ");

// ── tabs ──────────────────────────────────────────────────────────────────
type TabKey =
  | "overview" | "shipping" | "countries" | "agents" | "ports" | "documents"
  | "vehicles" | "containers" | "termpricing" | "services";

const TABS: Array<{ key: TabKey; label: string; Icon: LucideIcon }> = [
  { key: "overview", label: "ภาพรวม", Icon: LayoutGrid },
  { key: "shipping", label: "สายเรือ", Icon: Ship },
  { key: "countries", label: "ประเทศ", Icon: Globe },
  { key: "agents", label: "เอเจนต์", Icon: Users },
  { key: "ports", label: "ท่าเรือ/สนามบิน", Icon: Anchor },
  { key: "documents", label: "เอกสารอ้างอิง", Icon: FileText },
  { key: "vehicles", label: "ประเภทรถ/ขนส่ง", Icon: Truck },
  { key: "containers", label: "ประเภท/ขนาดตู้", Icon: Container },
  { key: "termpricing", label: "Term & Pricing", Icon: SlidersHorizontal },
  { key: "services", label: "บริการ & ค่าใช้จ่าย", Icon: Receipt },
];

function TabButton({ active, label, Icon, onClick }: { active: boolean; label: string; Icon: LucideIcon; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={cx(
        "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 pb-3 pt-2 text-sm transition-colors",
        active ? "border-primary-600 font-bold text-primary-600" : "border-transparent text-muted hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

// ── stat cards ──────────────────────────────────────────────────────────────
const STAT_TONE: Record<StatTone, { tile: string; value: string }> = {
  blue: { tile: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400", value: "text-blue-600 dark:text-blue-400" },
  green: { tile: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400", value: "text-emerald-600 dark:text-emerald-400" },
  orange: { tile: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400", value: "text-orange-600 dark:text-orange-400" },
  purple: { tile: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400", value: "text-violet-600 dark:text-violet-400" },
  teal: { tile: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400", value: "text-teal-600 dark:text-teal-400" },
};
const STAT_ICON: Record<string, LucideIcon> = { shipping: Ship, countries: Globe, agents: Users, ports: Anchor, documents: FileText };

function StatCard({ data }: { data: StatCardData }) {
  const tone = STAT_TONE[data.tone];
  const Icon = STAT_ICON[data.key] ?? Package;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
      <div className={cx("grid h-12 w-12 shrink-0 place-items-center rounded-full", tone.tile)}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-foreground">{data.title}</div>
        <div className={cx("text-2xl font-black leading-tight", tone.value)}>
          {data.value.toLocaleString("th-TH")} <span className="text-[11px] font-normal text-muted">{data.unit}</span>
        </div>
        <span className="mt-0.5 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          เปิดใช้งาน {data.active}
        </span>
      </div>
    </div>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────────
function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> เปิดใช้งาน
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> ปิดใช้งาน
    </span>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
      <button
        type="button" onClick={onEdit} title="แก้ไข" aria-label="แก้ไข"
        className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-foreground"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button" onClick={onDelete} title="ลบ" aria-label="ลบ"
        className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SummaryCard({ icon, title, subtitle, tone }: { icon: ReactNode; title: string; subtitle: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
      <div className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl", tone)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-foreground">{title}</div>
        <div className="text-[11px] text-muted">{subtitle}</div>
      </div>
    </div>
  );
}

// ── reusable prototype table ────────────────────────────────────────────────
type HubRow = { key: string; label: string; cells: ReactNode[]; search: string; active: boolean };

function HubTable({
  title, subtitle, addLabel, headers, rows, showIndex = false,
  searchPlaceholder = "ค้นหาข้อมูล...", onAdd, onEdit, onDelete,
}: {
  title: string; subtitle: string; addLabel: string; headers: string[]; rows: HubRow[];
  showIndex?: boolean; searchPlaceholder?: string;
  onAdd: () => void; onEdit: (row: HubRow) => void; onDelete: (row: HubRow) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle ? rows.filter((r) => r.search.toLowerCase().includes(needle)) : rows;
  const colSpan = headers.length + (showIndex ? 1 : 0) + 2;
  return (
    <div className="rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-black text-primary-600">{title}</h3>
          <p className="mt-1 text-[11px] text-muted">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
              className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300 dark:bg-surface"
            />
          </div>
          <button
            type="button" onClick={onAdd}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" /> {addLabel}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-xs border-collapse [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60 [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60">
          <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              {showIndex && <th className="w-12 whitespace-nowrap px-2 py-2 text-left">#</th>}
              {headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-2 text-left">{h}</th>)}
              <th className="whitespace-nowrap px-2 py-2 text-left">สถานะ</th>
              <th className="w-20 whitespace-nowrap px-2 py-2 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-muted">
                  {q ? `ไม่พบข้อมูลที่ตรงกับ "${q}"` : "ยังไม่มีข้อมูล"}
                </td>
              </tr>
            )}
            {filtered.map((r, i) => (
              <tr key={r.key} className="border-t border-border even:bg-surface-alt/20 hover:bg-surface-alt/40">
                {showIndex && <td className="px-2 py-2 text-muted">{i + 1}</td>}
                {r.cells.map((c, j) => <td key={j} className="px-2 py-2 align-middle">{c}</td>)}
                <td className="px-2 py-2"><StatusPill active={r.active} /></td>
                <td className="px-2 py-2"><RowActions onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 text-[11px] text-muted">
        <span>แสดง {filtered.length ? 1 : 0}-{filtered.length} จาก {rows.length} รายการ</span>
        <span className="rounded-md border border-primary-300 bg-primary-50 px-2 py-1 font-bold text-primary-600 dark:bg-primary-500/10">1</span>
      </div>
    </div>
  );
}

// ── shipping detail (overview side card) ────────────────────────────────────
function ShippingDetail({ line, onEdit }: { line: ShippingLine | undefined; onEdit: () => void }) {
  if (!line) {
    return (
      <div className="grid min-h-[280px] place-items-center p-8 text-center text-sm text-muted">
        <div>
          <div className="font-semibold text-foreground">ยังไม่มีข้อมูล</div>
          <div className="mt-1">เลือกสายเรือจากตารางเพื่อดูรายละเอียด</div>
        </div>
      </div>
    );
  }
  const rows: Array<[string, ReactNode]> = [
    ["รหัส (Code)", line.code],
    ["ประเทศต้นทาง", <span key="c"><span className="mr-1">{line.flag}</span>{line.country}</span>],
    ["เว็บไซต์", <span key="w" className="break-all text-blue-600 dark:text-blue-400">{line.website}</span>],
    ["เบอร์โทร", line.phone],
    ["อีเมล", line.email],
    ["หมายเหตุ", "-"],
  ];
  return (
    <div className="p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-border bg-white p-2 text-center text-xs font-black text-foreground dark:bg-surface">
          {line.code}
        </div>
        <div className="min-w-0">
          <div className="text-base font-bold text-foreground">{line.name}</div>
          <div className="mt-1"><StatusPill active={line.status === "active"} /></div>
        </div>
      </div>
      <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2.5 text-xs">
        {rows.map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="font-medium text-foreground">{value}</dd>
          </Fragment>
        ))}
      </dl>
      <div className="my-4 h-px bg-border" />
      <h4 className="mb-2 text-sm font-bold text-foreground">เส้นทางที่ให้บริการ</h4>
      <div className="flex flex-wrap gap-1.5">
        {line.routes.map((r) => (
          <span key={r} className="inline-flex rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">{r}</span>
        ))}
      </div>
      <div className="my-4 h-px bg-border" />
      <div className="grid grid-cols-2 gap-3 text-[11px] text-muted">
        <div>วันที่สร้าง<div className="mt-1 font-semibold text-foreground">{line.created}</div></div>
        <div>แก้ไขล่าสุด<div className="mt-1 font-semibold text-foreground">{line.updated}</div></div>
      </div>
      <div className="mt-4 text-center">
        <button
          type="button" onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-3.5 py-2 text-sm font-semibold text-primary-600 transition-colors hover:bg-primary-100 dark:bg-primary-500/10"
        >
          <Pencil className="h-4 w-4" /> แก้ไขข้อมูล
        </button>
      </div>
    </div>
  );
}

// badges for vehicle/container tables
function vehicleCategoryBadge(v: Vehicle): ReactNode {
  const cls =
    v.category === "CONTAINER" ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
      : v.category === "SPECIAL" ? "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
        : "bg-surface-alt text-muted";
  return <span className={cx("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{v.categoryLabel}</span>;
}
function codeBadge(text: string, tone: "orange" | "blue"): ReactNode {
  const cls = tone === "orange"
    ? "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"
    : "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400";
  return <span className={cx("inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-bold", cls)}>{text}</span>;
}

// ── main hub ────────────────────────────────────────────────────────────────
export function SettingsHub({ templates, persisted }: { templates: Record<string, CatalogTemplate>; persisted: boolean }) {
  const [tab, setTab] = useState<TabKey>("overview");
  const { confirm, dialogs } = useConfirmDialogs();

  // client-state datasets (prototype delete works on these)
  const [shipping, setShipping] = useState<ShippingLine[]>(SHIPPING_LINES);
  const [countries, setCountries] = useState<SimpleRow[]>(COUNTRY_ROWS);
  const [agents, setAgents] = useState<SimpleRow[]>(AGENT_ROWS);
  const [ports, setPorts] = useState<SimpleRow[]>(PORT_ROWS);
  const [documents, setDocuments] = useState<SimpleRow[]>(DOCUMENT_ROWS);
  const [services, setServices] = useState<SimpleRow[]>(SERVICE_ROWS);
  const [vehicles, setVehicles] = useState<Vehicle[]>(VEHICLES);
  const [containers, setContainers] = useState<ContainerType[]>(CONTAINERS);

  const [selected, setSelected] = useState(0);
  const [ovQ, setOvQ] = useState("");

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // handlers for the generic SimpleRow datasets
  const simpleHandlers = (setRows: Dispatch<SetStateAction<SimpleRow[]>>, noun: string) => ({
    onAdd: () => flash(`ฟอร์มเพิ่ม${noun} (ตัวอย่าง) — พร้อมเชื่อมต่อฐานข้อมูล`),
    onEdit: (row: HubRow) => flash(`เปิดฟอร์มแก้ไข "${row.label}" (ตัวอย่าง)`),
    onDelete: async (row: HubRow) => {
      if (await confirm(`ต้องการลบ "${row.label}" หรือไม่?`)) {
        const idx = Number(row.key);
        setRows((arr) => arr.filter((_, i) => i !== idx));
        flash(`ลบ${noun}แล้ว (ตัวอย่าง)`);
      }
    },
  });

  const genericRows = (rows: SimpleRow[]): HubRow[] =>
    rows.map((r, idx) => ({
      key: String(idx),
      label: r.cells[0] ?? "",
      cells: r.cells.map((c, j) => (j === 0 ? <span key={j} className="font-semibold text-foreground">{c}</span> : c)),
      search: r.cells.join(" "),
      active: r.active,
    }));

  // shipping (used by overview + shipping tab)
  const filteredShipping = ovQ.trim()
    ? shipping.filter((x) => [x.name, x.code, x.country].some((v) => v.toLowerCase().includes(ovQ.trim().toLowerCase())))
    : shipping;
  const selectedLine = shipping[selected];

  async function deleteShipping(idx: number, name: string) {
    if (await confirm(`ต้องการลบสายเรือ "${name}" หรือไม่?`)) {
      setShipping((arr) => arr.filter((_, i) => i !== idx));
      setSelected(0);
      flash("ลบสายเรือแล้ว (ตัวอย่าง)");
    }
  }

  const shippingHubRows: HubRow[] = shipping.map((x, idx) => ({
    key: String(idx),
    label: x.name,
    cells: [
      <div className="flex items-center gap-2" key="n">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-white text-[10px] font-bold text-foreground dark:bg-surface">{x.code.slice(0, 3)}</span>
        <span className="font-semibold text-foreground">{x.name}</span>
      </div>,
      x.code,
      <span key="c"><span className="mr-1">{x.flag}</span>{x.country}</span>,
      x.routes.slice(0, 3).join(", "),
    ],
    search: `${x.name} ${x.code} ${x.country}`,
    active: x.status === "active",
  }));

  const vehicleRows: HubRow[] = vehicles.map((v, idx) => ({
    key: String(idx),
    label: v.name,
    cells: [
      vehicleCategoryBadge(v),
      codeBadge(v.code, "orange"),
      <div key="n"><div className="font-semibold text-foreground">{v.name}</div><div className="text-[11px] text-muted">{v.mode}</div></div>,
      v.body,
      <span key="cap" className="text-[11px] text-muted">{v.capacity}</span>,
      <span key="sz" className="text-[11px] text-muted">{v.size}</span>,
      v.use,
      v.container,
      v.pricing,
    ],
    search: [v.categoryLabel, v.code, v.name, v.body, v.capacity, v.use, v.container, v.pricing].join(" "),
    active: v.active,
  }));

  const containerRows: HubRow[] = containers.map((c, idx) => ({
    key: String(idx),
    label: c.size,
    cells: [
      <span key="k" className={cx("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", c.type === "SPECIAL" ? "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" : "bg-surface-alt text-muted")}>{c.type} — {c.typeLabel}</span>,
      codeBadge(c.code, "blue"),
      <span key="s" className="font-semibold text-foreground">{c.size}</span>,
      c.equipment,
      <span key="i" className="text-[11px] text-muted">{c.inside}</span>,
      c.max,
      c.mode,
    ],
    search: [c.type, c.typeLabel, c.code, c.size, c.equipment, c.mode].join(" "),
    active: c.active,
  }));

  const vGeneral = vehicles.filter((v) => v.category === "GENERAL").length;
  const vContainer = vehicles.filter((v) => v.category === "CONTAINER").length;
  const vSpecial = vehicles.filter((v) => v.category === "SPECIAL").length;
  const cActive = containers.filter((c) => c.active).length;
  const cFcl = containers.filter((c) => c.type === "FCL").length;
  const cSpecial = containers.filter((c) => c.type === "SPECIAL").length;

  const MINI_TABS: Array<{ key: TabKey; label: string }> = [
    { key: "shipping", label: "สายเรือ" }, { key: "countries", label: "ประเทศ" },
    { key: "agents", label: "เอเจนต์" }, { key: "ports", label: "ท่าเรือ/สนามบิน" },
    { key: "services", label: "บริการ & ค่าใช้จ่าย" },
  ];

  return (
    <div className="space-y-5">
      {/* tab strip */}
      <div className="flex items-center gap-6 overflow-x-auto border-b border-border scrollbar-x-visible">
        {TABS.map(({ key, label, Icon }) => (
          <TabButton key={key} active={tab === key} label={label} Icon={Icon} onClick={() => setTab(key)} />
        ))}
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {STATS.map((s) => <StatCard key={s.key} data={s} />)}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_0.9fr]">
          <div className="rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-black text-primary-600">รายการล่าสุด</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="search" value={ovQ} onChange={(e) => setOvQ(e.target.value)} placeholder="ค้นหาชื่อ, รหัส, ประเทศ..." aria-label="ค้นหาสายเรือ"
                    className="w-full rounded-lg border border-border bg-white py-2 pl-9 pr-3 text-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-300 dark:bg-surface"
                  />
                </div>
                <button
                  type="button" onClick={() => flash("ฟอร์มเพิ่มสายเรือ (ตัวอย่าง) — พร้อมเชื่อมต่อฐานข้อมูล")}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
                >
                  <Plus className="h-4 w-4" /> เพิ่มสายเรือ
                </button>
              </div>
            </div>

            {/* mini-tabs → jump to main tab */}
            <div className="flex items-center gap-5 overflow-x-auto border-b border-border px-4 scrollbar-x-visible">
              {MINI_TABS.map((m, i) => (
                <button
                  key={m.key} type="button" onClick={() => setTab(m.key)}
                  className={cx(
                    "-mb-px shrink-0 whitespace-nowrap border-b-2 py-3 text-xs transition-colors",
                    i === 0 ? "border-primary-600 font-bold text-primary-600" : "border-transparent text-muted hover:text-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-xs border-collapse [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60 [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60">
                <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="w-12 px-2 py-2 text-left">#</th>
                    <th className="px-2 py-2 text-left">สายเรือ</th>
                    <th className="px-2 py-2 text-left">รหัส (Code)</th>
                    <th className="px-2 py-2 text-left">ประเทศต้นทาง</th>
                    <th className="px-2 py-2 text-left">สถานะ</th>
                    <th className="w-20 px-2 py-2 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShipping.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-muted">ไม่พบสายเรือที่ตรงกับ &quot;{ovQ}&quot;</td></tr>
                  )}
                  {filteredShipping.map((x, i) => {
                    const srcIdx = shipping.indexOf(x);
                    return (
                      <tr
                        key={x.code} onClick={() => setSelected(srcIdx)}
                        className={cx(
                          "cursor-pointer border-t border-border hover:bg-surface-alt/40",
                          srcIdx === selected ? "bg-primary-50/60 dark:bg-primary-500/10" : "even:bg-surface-alt/20",
                        )}
                      >
                        <td className="px-2 py-2 text-muted">{i + 1}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-white text-[10px] font-bold text-foreground dark:bg-surface">{x.code.slice(0, 3)}</span>
                            <span className="font-semibold text-foreground">{x.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2">{x.code}</td>
                        <td className="whitespace-nowrap px-2 py-2"><span className="mr-1">{x.flag}</span>{x.country}</td>
                        <td className="px-2 py-2"><StatusPill active={x.status === "active"} /></td>
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            onEdit={() => { setSelected(srcIdx); flash(`เปิดฟอร์มแก้ไข "${x.name}" (ตัวอย่าง)`); }}
                            onDelete={() => deleteShipping(srcIdx, x.name)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 text-[11px] text-muted">แสดง {filteredShipping.length ? 1 : 0}-{filteredShipping.length} จาก {shipping.length} รายการ</div>
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-sm dark:bg-surface">
            <div className="border-b border-border p-4"><h3 className="text-sm font-black text-primary-600">รายละเอียดสายเรือ</h3></div>
            <ShippingDetail line={selectedLine} onEdit={() => selectedLine && flash(`เปิดฟอร์มแก้ไข "${selectedLine.name}" (ตัวอย่าง)`)} />
          </div>
        </div>
      )}

      {/* ── SHIPPING ── */}
      {tab === "shipping" && (
        <HubTable
          title="จัดการสายเรือ"
          subtitle="ใช้เป็นข้อมูลกลางสำหรับใบเสนอราคา Booking และงานนำเข้า-ส่งออก"
          addLabel="เพิ่มสายเรือ" searchPlaceholder="ค้นหาสายเรือ..."
          showIndex headers={["สายเรือ", "รหัส", "ประเทศต้นทาง", "เส้นทางหลัก"]} rows={shippingHubRows}
          onAdd={() => flash("ฟอร์มเพิ่มสายเรือ (ตัวอย่าง) — พร้อมเชื่อมต่อฐานข้อมูล")}
          onEdit={(row) => flash(`เปิดฟอร์มแก้ไข "${row.label}" (ตัวอย่าง)`)}
          onDelete={(row) => deleteShipping(Number(row.key), row.label)}
        />
      )}

      {/* ── COUNTRIES ── */}
      {tab === "countries" && (
        <HubTable
          title="จัดการประเทศ"
          subtitle="ใช้เป็นข้อมูลกลางสำหรับใบเสนอราคา Booking และงานนำเข้า-ส่งออก"
          addLabel="เพิ่มประเทศ" headers={COUNTRY_HEADERS} rows={genericRows(countries)}
          {...simpleHandlers(setCountries, "ประเทศ")}
        />
      )}

      {/* ── AGENTS ── */}
      {tab === "agents" && (
        <HubTable
          title="จัดการเอเจนต์"
          subtitle="ใช้เป็นข้อมูลกลางสำหรับใบเสนอราคา Booking และงานนำเข้า-ส่งออก"
          addLabel="เพิ่มเอเจนต์" headers={AGENT_HEADERS} rows={genericRows(agents)}
          {...simpleHandlers(setAgents, "เอเจนต์")}
        />
      )}

      {/* ── PORTS ── */}
      {tab === "ports" && (
        <HubTable
          title="จัดการท่าเรือและสนามบิน"
          subtitle="ใช้เป็นข้อมูลกลางสำหรับใบเสนอราคา Booking และงานนำเข้า-ส่งออก"
          addLabel="เพิ่มท่าเรือ/สนามบิน" headers={PORT_HEADERS} rows={genericRows(ports)}
          {...simpleHandlers(setPorts, "ท่าเรือ/สนามบิน")}
        />
      )}

      {/* ── DOCUMENTS ── */}
      {tab === "documents" && (
        <HubTable
          title="จัดการเอกสารอ้างอิง"
          subtitle="ใช้เป็นข้อมูลกลางสำหรับใบเสนอราคา Booking และงานนำเข้า-ส่งออก"
          addLabel="เพิ่มเอกสาร" headers={DOCUMENT_HEADERS} rows={genericRows(documents)}
          {...simpleHandlers(setDocuments, "เอกสาร")}
        />
      )}

      {/* ── VEHICLES ── */}
      {tab === "vehicles" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon="🚚" title={`รถขนส่งทั่วไป ${vGeneral} แบบ`} subtitle="กระบะ, 4 ล้อ, 6 ล้อ และ 10 ล้อ" tone="bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" />
            <SummaryCard icon="🚛" title={`รถลากตู้ ${vContainer} แบบ`} subtitle="หัวลาก หาง 20 ฟุต และหาง 40 ฟุต" tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" />
            <SummaryCard icon="⚙️" title={`รถงานพิเศษ ${vSpecial} แบบ`} subtitle="Low Bed, Wing Van และรถห้องเย็น" tone="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400" />
            <SummaryCard icon="฿" title="รองรับเรทรถหลายรูปแบบ" subtitle="ต่อเที่ยว, ต่อกิโลเมตร, ตามโซน และค่ารอ" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" />
          </div>

          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
            <div className="mb-1 text-sm font-black text-primary-600">วิธีคิดราคารถขนส่ง</div>
            <p className="mb-3 text-[11px] text-muted">ใช้กำหนดรถที่เลือกได้ในใบเสนอราคา Booking งานขนส่งปลายทาง และ Pricing Template</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {VEHICLE_PRICING_METHODS.map((m) => (
                <div key={m.label} className="rounded-xl border border-dashed border-border bg-surface-alt/30 p-3">
                  <div className="text-[11px] text-muted">{m.label}</div>
                  <div className="mt-1 text-xs font-bold text-foreground">{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          <HubTable
            title="Master ประเภทรถและรูปแบบขนส่ง"
            subtitle="ใช้กำหนดรถที่เลือกได้ในใบเสนอราคา Booking งานขนส่งปลายทาง และ Pricing Template"
            addLabel="เพิ่มประเภทรถ" searchPlaceholder="ค้นหารถ 4 ล้อ, 6 ล้อ, หัวลาก..."
            showIndex
            headers={["หมวด", "รหัส", "ประเภทรถ", "รูปแบบตัวรถ/หาง", "น้ำหนักบรรทุกโดยประมาณ", "ขนาด/ลักษณะพื้นที่บรรทุก", "เหมาะกับงาน", "รองรับตู้", "วิธีคิดราคา"]}
            rows={vehicleRows}
            onAdd={() => flash("ฟอร์มเพิ่มประเภทรถ (ตัวอย่าง) — พร้อมเชื่อมต่อฐานข้อมูล")}
            onEdit={(row) => flash(`เปิดฟอร์มแก้ไข "${row.label}" (ตัวอย่าง)`)}
            onDelete={async (row) => {
              if (await confirm(`ต้องการลบประเภทรถ "${row.label}" หรือไม่?`)) {
                const idx = Number(row.key);
                setVehicles((arr) => arr.filter((_, i) => i !== idx));
                flash("ลบประเภทรถแล้ว (ตัวอย่าง)");
              }
            }}
          />
        </div>
      )}

      {/* ── CONTAINERS ── */}
      {tab === "containers" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard icon="▣" title="ประเภท Shipment" subtitle="LCL, FCL, Air Cargo และ Truck" tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" />
            <SummaryCard icon="20" title={`ตู้มาตรฐาน ${cFcl} แบบ`} subtitle="20'GP, 40'GP, 40'HQ และ 45'HQ" tone="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" />
            <SummaryCard icon="★" title={`ตู้พิเศษ ${cSpecial} แบบ`} subtitle="Reefer, Open Top และ Flat Rack" tone="bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400" />
            <SummaryCard icon="✓" title={`เปิดใช้งาน ${cActive} รายการ`} subtitle="พร้อมผูกกับ Term, Route และ Pricing" tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" />
          </div>

          <HubTable
            title="Master ประเภทตู้และขนาดตู้"
            subtitle="ใช้ควบคุม Dropdown ในใบเสนอราคา Booking และ Template Pricing"
            addLabel="เพิ่มประเภท/ขนาดตู้" searchPlaceholder="ค้นหาประเภทหรือขนาดตู้..."
            showIndex
            headers={["ประเภท Shipment", "รหัสตู้", "ขนาด / ชื่อเรียก", "Equipment", "ขนาดภายใน / วิธีคิด", "น้ำหนักสูงสุด", "Mode"]}
            rows={containerRows}
            onAdd={() => flash("ฟอร์มเพิ่มประเภท/ขนาดตู้ (ตัวอย่าง) — พร้อมเชื่อมต่อฐานข้อมูล")}
            onEdit={(row) => flash(`เปิดฟอร์มแก้ไข "${row.label}" (ตัวอย่าง)`)}
            onDelete={async (row) => {
              if (await confirm(`ต้องการลบประเภทตู้ "${row.label}" หรือไม่?`)) {
                const idx = Number(row.key);
                setContainers((arr) => arr.filter((_, i) => i !== idx));
                flash("ลบประเภทตู้แล้ว (ตัวอย่าง)");
              }
            }}
          />
        </div>
      )}

      {/* ── TERM & PRICING (REAL) ── */}
      {tab === "termpricing" && (
        <div className="rounded-2xl border border-border bg-surface-alt/20 p-1">
          <BookingCatalogSettings templates={templates} persisted={persisted} />
        </div>
      )}

      {/* ── SERVICES ── */}
      {tab === "services" && (
        <HubTable
          title="จัดการบริการและค่าใช้จ่าย"
          subtitle="ใช้เป็นข้อมูลกลางสำหรับใบเสนอราคา Booking และงานนำเข้า-ส่งออก"
          addLabel="เพิ่มบริการ" headers={SERVICE_HEADERS} rows={genericRows(services)}
          {...simpleHandlers(setServices, "บริการ")}
        />
      )}

      {/* toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-foreground px-4 py-3 text-sm text-background shadow-lg" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {dialogs}
    </div>
  );
}
