"use client";
/**
 * paid-work-table.tsx — "งานที่ลูกค้าจ่ายเงินมาแล้ว" รายเดือน (owner 2026-07-30).
 *
 * คนละอันกับ "กำไรตู้" (ทั้งตู้) — อันนี้ = งานที่ลูกค้าจ่ายจริง นับตาม "เดือนที่จ่าย"
 * (reconcile กับรายงานค่าคอมได้). ทรงเดียวกับ container-profit-table: ย่อรายเดือน
 * (default ปิด) · กดหัวแถวกางดูรายละเอียด · หัวแถว = สรุปทุก metric ของเดือน.
 *
 * owner "กดแยกดูได้": ปุ่มสลับมิติที่หัวรายงาน — รวม / แยกบริการ (สั่งซื้อ·นำเข้า) /
 * แยกขนส่ง (รถ·เรือ — เฉพาะนำเข้า) / แยกต้นทาง (กวางโจว·อี้อู — เฉพาะนำเข้า).
 * แต่ละแถวกลุ่ม = จำนวนงาน/คิว/ขาย/ทุน/กำไร · Σ ท้าย = ยอดรวมทั้งเดือน (reconcile).
 */
import { useState } from "react";
import type { PaidWorkReport, PaidWorkMonth, PaidMetric } from "@/lib/admin/paid-work-report";

const fmt0 = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const fmt2 = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const be = Number(m[1]) + 543;
  return `${names[Number(m[2]) - 1]} ${be}`;
}

function ProfitText({ value }: { value: number }) {
  return (
    <span className={`tabular-nums font-bold ${value < 0 ? "text-red-600" : "text-emerald-700"}`}>
      {fmt2(value)}
    </span>
  );
}

type Dimension = "total" | "service" | "transport" | "origin";
const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "total", label: "รวม" },
  { key: "service", label: "แยกบริการ" },
  { key: "transport", label: "แยกขนส่ง" },
  { key: "origin", label: "แยกต้นทาง" },
];

type DimRow = { key: string; label: string; metric: PaidMetric; cbm: boolean; muted?: boolean };

/** แถวของมิติที่เลือก (Σ = m.total เสมอ เพราะทุกมิติแบ่งเดือนครบ). */
function rowsForDimension(m: PaidWorkMonth, dim: Dimension): DimRow[] {
  if (dim === "service") {
    return [
      { key: "shop", label: "สั่งซื้อ (ฝากสั่งซื้อ)", metric: m.byService.shop, cbm: false },
      { key: "import", label: "นำเข้า (ฝากนำเข้า)", metric: m.byService.import, cbm: true },
    ];
  }
  if (dim === "transport") {
    const rows: DimRow[] = [
      { key: "road", label: "ทางรถ", metric: m.byTransport.road, cbm: true },
      { key: "sea", label: "ทางเรือ", metric: m.byTransport.sea, cbm: true },
    ];
    if (m.byTransport.air.orders > 0) rows.push({ key: "air", label: "ทางอากาศ", metric: m.byTransport.air, cbm: true });
    if (m.byService.shop.orders > 0)
      rows.push({ key: "shop", label: "สั่งซื้อ (ไม่มีขนส่ง)", metric: m.byService.shop, cbm: false, muted: true });
    return rows;
  }
  if (dim === "origin") {
    const rows: DimRow[] = [
      { key: "gz", label: "กวางโจว", metric: m.byOrigin.guangzhou, cbm: true },
      { key: "yw", label: "อี้อู", metric: m.byOrigin.yiwu, cbm: true },
    ];
    if (m.byOrigin.unknown.orders > 0)
      rows.push({ key: "unknown", label: "ไม่ระบุต้นทาง", metric: m.byOrigin.unknown, cbm: true });
    if (m.byService.shop.orders > 0)
      rows.push({ key: "shop", label: "สั่งซื้อ (ไม่ระบุต้นทาง)", metric: m.byService.shop, cbm: false, muted: true });
    return rows;
  }
  return [{ key: "total", label: "รวมทั้งเดือน", metric: m.total, cbm: true }];
}

const DIM_HEAD: Record<Dimension, string> = {
  total: "รายการ",
  service: "บริการ",
  transport: "ขนส่ง (เฉพาะนำเข้า)",
  origin: "ต้นทาง (เฉพาะนำเข้า)",
};

function MetricCells({ metric, cbm }: { metric: PaidMetric; cbm: boolean }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{fmt0(metric.orders)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{cbm ? fmt4(metric.cbm) : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt2(metric.sell)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{fmt2(metric.cost)}</td>
      <td className="px-3 py-2 text-right"><ProfitText value={metric.profit} /></td>
    </>
  );
}

export function PaidWorkTable({ data }: { data: PaidWorkReport }) {
  const [dim, setDim] = useState<Dimension>("total");
  // ย่อรายเดือนไว้ก่อน (owner แพทเทินเดียวกับกำไรตู้) — default ปิดทุกเดือน
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (month: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
      return next;
    });

  if (data.months.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        ไม่พบงานที่ลูกค้าจ่ายเงินมาแล้วในช่วงที่เลือก
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ปุ่มสลับมิติ (owner "กดแยกดูได้") */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">มุมมอง:</span>
        {DIMENSIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDim(d.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              dim === d.key
                ? "bg-primary-600 text-white"
                : "border border-border bg-white text-foreground hover:bg-muted dark:bg-surface"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* GRAND TOTAL */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <span className="text-sm font-bold text-foreground">
          รวมทั้งหมด {fmt0(data.grand.orders)} งาน
        </span>
        <span className="text-xs text-muted">คิว {fmt4(data.grand.cbm)}</span>
        <span className="text-xs text-muted">ขาย {fmt2(data.grand.sell)}</span>
        <span className="text-xs text-muted">ทุน {fmt2(data.grand.cost)}</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold text-white ${
            data.grand.profit < 0 ? "bg-red-600" : "bg-emerald-600"
          }`}
        >
          กำไร {fmt2(data.grand.profit)} บาท
        </span>
        {data.grand.unpricedOrders > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            ⚠ {fmt0(data.grand.unpricedOrders)} งานยังไม่ลงต้นทุน
          </span>
        ) : null}
        <span className="text-[11px] text-muted">
          · นับตาม “เดือนที่จ่าย” (ลูกค้าชำระเดือนไหน = เดือนนั้น) · reconcile กับรายงานค่าคอมได้ · ทุน สั่งซื้อ = ¥ × เรตต้นทุน
        </span>
      </div>

      {data.months.map((m) => {
        const isOpen = open.has(m.month);
        const rows = rowsForDimension(m, dim);
        return (
          <section key={m.month} className="rounded-xl border border-border bg-surface overflow-hidden">
            {/* หัวแถวรายเดือน = ดรอปดาว + สรุปทุกคอลัมน์ของเดือน */}
            <button
              type="button"
              onClick={() => toggle(m.month)}
              aria-expanded={isOpen}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface-alt/60 px-4 py-3 text-left hover:bg-surface-alt/80 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-foreground min-w-[130px]">
                <span className={`text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>▶</span>
                {monthLabel(m.month)}
              </span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
                <span className="text-muted">งาน <b className="text-foreground">{fmt0(m.total.orders)}</b></span>
                <span className="text-muted">คิว <b className="text-foreground">{fmt4(m.total.cbm)}</b></span>
                <span className="text-muted">ขาย <b className="text-foreground">{fmt2(m.total.sell)}</b></span>
                <span className="text-muted">ทุน <b className="text-foreground">{fmt2(m.total.cost)}</b></span>
                <span className="text-muted">กำไร <ProfitText value={m.total.profit} /></span>
                {m.unpricedOrders > 0 ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    ⚠ {fmt0(m.unpricedOrders)} ยังไม่ลงต้นทุน
                  </span>
                ) : null}
              </span>
            </button>

            {isOpen ? (
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full min-w-[720px] border-collapse text-xs [&>thead>tr>th]:border [&>thead>tr>th]:border-border [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border [&>tfoot>tr>td]:border [&>tfoot>tr>td]:border-border">
                  <thead>
                    <tr className="bg-surface-alt/40 text-muted">
                      <th className="px-3 py-2 text-left">{DIM_HEAD[dim]}</th>
                      <th className="px-3 py-2 text-right">จำนวนงาน</th>
                      <th className="px-3 py-2 text-right">คิว (CBM)</th>
                      <th className="px-3 py-2 text-right">ยอดขาย (฿)</th>
                      <th className="px-3 py-2 text-right">ทุน (฿)</th>
                      <th className="px-3 py-2 text-right">กำไร (฿)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={r.key}
                        className={`${i % 2 === 1 ? "bg-surface-alt/30" : ""} ${r.muted ? "text-muted" : ""}`}
                      >
                        <td className={`px-3 py-2 ${r.muted ? "" : "font-medium text-foreground"}`}>{r.label}</td>
                        <MetricCells metric={r.metric} cbm={r.cbm} />
                      </tr>
                    ))}
                  </tbody>
                  {/* Σ = ยอดรวมทั้งเดือน (reconcile: แถวทั้งหมดรวมกัน = แถวนี้) */}
                  <tfoot>
                    <tr className="bg-surface-alt/70 font-bold text-foreground">
                      <td className="px-3 py-2">รวมทั้งเดือน</td>
                      <MetricCells metric={m.total} cbm={true} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
