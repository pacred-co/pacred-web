"use client";

/**
 * ตารางประวัติจ่ายเงินแทนลูกค้า — client-side sortable (owner 2026-07-16 · "กดเรียงได้เหมือนในภาพ").
 * ทุกคอลัมน์กดหัวเรียง asc → desc → ค่าเริ่มต้น (เรียงตามที่ server ส่งมา = เวลาใหม่สุดก่อน).
 * เรียงฝั่ง client บนแถวที่แสดงอยู่ (list สั้น + มีตัวเลือก "ทั้งหมด" ให้เรียงครบทุกแถวได้).
 */

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import type { PayUserHistoryRow } from "@/actions/admin/pay-user-view";
import { PayUserReverseButton } from "./pay-user-reverse-button";

function thb(n: number): string {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusPill({ status }: { status: string | null }) {
  const s = (status ?? "").trim();
  // solid legacy badges (owner 2026-07-16 · "text ขาว หลังสีทึบ") — Modern Admin
  // theme: สำเร็จ=success #28D094 · รอดำเนินการ=warning #FF9149 · ไม่สำเร็จ=danger #FF4961.
  const cfg =
    s === "2"
      ? { label: "สำเร็จ", cls: "bg-[#28D094]" }
      : s === "1"
        ? { label: "รอดำเนินการ", cls: "bg-[#FF9149]" }
        : s === "3"
          ? { label: "ไม่สำเร็จ", cls: "bg-[#FF4961]" }
          : { label: "—", cls: "bg-gray-400" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

type SortKey =
  | "id" | "date" | "userid" | "name" | "service"
  | "amount" | "reforder" | "status" | "admin";

const COLUMNS: {
  key: SortKey;
  label: string;
  align?: "right" | "center";
  get: (r: PayUserHistoryRow) => string | number;
}[] = [
  { key: "id", label: "เลขที่ออเดอร์", get: (r) => r.id },
  { key: "date", label: "เวลาทำรายการ", get: (r) => r.date ?? "" },
  { key: "userid", label: "รหัสสมาชิก", get: (r) => r.userid ?? "" },
  { key: "name", label: "ชื่อ-นามสกุล", get: (r) => r.name ?? "" },
  { key: "service", label: "ประเภทบริการ", get: (r) => r.service_label ?? "" },
  { key: "amount", label: "จำนวนเงิน", align: "right", get: (r) => r.amount },
  { key: "reforder", label: "รายการอ้างอิง", get: (r) => r.reforder ?? "" },
  { key: "status", label: "สถานะรายการ", align: "center", get: (r) => r.status ?? "" },
  { key: "admin", label: "ผู้ทำรายการ", get: (r) => r.admin_crate ?? "" },
];

export function PayUserHistoryTable({ rows }: { rows: PayUserHistoryRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "th", { numeric: true });
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort]);

  function onSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // desc → กลับค่าเริ่มต้น
    });
  }

  return (
    <div className="scrollbar-x-visible overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[900px] border-collapse text-sm [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>thead>tr>th]:whitespace-nowrap [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60 [&>tbody>tr>td]:py-2.5 [&>tbody>tr>td]:whitespace-nowrap">
        <thead>
          <tr className="bg-gray-100 text-left text-xs font-semibold text-gray-600">
            {COLUMNS.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  className={`px-3 py-2 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    title="กดเพื่อเรียงลำดับ"
                    className={`inline-flex items-center gap-1 hover:text-primary-600 ${c.align === "right" ? "flex-row-reverse" : c.align === "center" ? "mx-auto" : ""} ${active ? "text-primary-600" : ""}`}
                  >
                    {c.label}
                    {active ? (
                      sort!.dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowUpDown className="h-3.5 w-3.5 text-gray-400" />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-10 text-center text-sm text-gray-400">
                ยังไม่มีรายการจ่ายเงินแทนลูกค้า
              </td>
            </tr>
          ) : (
            sorted.map((r, i) => (
              <tr key={r.id} className={`transition-colors hover:bg-primary-50/50 ${i % 2 ? "bg-[#F2F1EF]" : "bg-white"}`}>
                <td className="px-3 py-2 font-mono text-gray-600">{r.id}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.date ? formatThaiDateTime(r.date) : "—"}</td>
                <td className="px-3 py-2">
                  {r.userid ? (
                    <Link href={`/admin/customers/${r.userid}`} className="font-medium text-sky-600 hover:underline">{r.userid}</Link>
                  ) : "—"}
                </td>
                <td className="px-3 py-2 text-gray-800">{r.name}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${r.service_label === "ฝากนำเข้า" ? "bg-indigo-500" : "bg-teal-500"}`}>
                    {r.service_label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">{thb(r.amount)}</td>
                <td className="px-3 py-2 font-mono">
                  {r.reforder ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={r.service_label === "ฝากนำเข้า" ? `/admin/forwarders/${r.reforder}` : `/admin/service-orders/${r.reforder}`}
                        className="text-sky-600 hover:underline"
                        title="เปิดออเดอร์ → ใบวางบิล/ใบเสร็จ"
                      >
                        {r.reforder} ↗
                      </Link>
                      {(r.bills.length > 0 || r.receipts.length > 0) && (
                        <div className="flex flex-wrap gap-1">
                          {r.bills.map((b) => (
                            <Link
                              key={`b${b.id}`}
                              href={`/admin/billing-run/${b.id}`}
                              className="inline-flex items-center rounded-full bg-indigo-500 px-1.5 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-600"
                              title="ดูใบวางบิล"
                            >
                              {b.docNo}
                            </Link>
                          ))}
                          {r.receipts.map((rc) => (
                            <Link
                              key={`r${rc.id}`}
                              href={`/admin/accounting/forwarder-invoice/${rc.id}`}
                              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${rc.status === "2" ? "bg-gray-300 text-gray-500 line-through" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
                              title={rc.status === "2" ? "ใบเสร็จ(ยกเลิกแล้ว)" : "ดูใบเสร็จ"}
                            >
                              {rc.rid}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : <span className="text-gray-600">—</span>}
                </td>
                <td className="px-3 py-2 text-center">
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <StatusPill status={r.status} />
                    {r.status === "2" && r.service_label === "ฝากนำเข้า" && r.reforder && (
                      <PayUserReverseButton fid={r.reforder} />
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-600">{r.admin_crate ?? "—"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
