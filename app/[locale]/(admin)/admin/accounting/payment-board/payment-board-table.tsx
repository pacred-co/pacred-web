"use client";

/**
 * <PaymentBoardTable> — client filter + self-explaining grid for the payment
 * board (§0g). Click-select filters (กดเลือก, no typing — owner rule §0c/§0f) +
 * one search box. Each row deep-links to the forwarder detail to edit (§0d). ⓘ
 * <Explain> hints on the tricky columns (the in-system guide · owner 2026-06-28).
 */

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { Explain } from "@/components/ui/tooltip";
import { PaymentBoardSettle } from "./payment-board-settle";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import type { PaymentBoardRow } from "@/actions/admin/payment-board-types";

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" });
};

type PayFilter = "unpaid" | "paid" | "all";
type MoneyFilter = "all" | "cash" | "credit";
type ModeFilter = "all" | "1" | "2" | "3";

export function PaymentBoardTable({
  rows,
  showCost,
}: {
  rows: PaymentBoardRow[];
  totalOwed: number;
  unpaidCount: number;
  capped: boolean;
  showCost: boolean;
}) {
  const [pay, setPay] = useState<PayFilter>("unpaid");
  const [money, setMoney] = useState<MoneyFilter>("all");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (pay !== "all" && r.payState !== pay) return false;
      if (money === "credit" && !r.isCredit) return false;
      if (money === "cash" && r.isCredit) return false;
      if (mode !== "all") {
        const want = mode === "1" ? "รถ" : mode === "2" ? "เรือ" : "แอร์";
        if (!r.modeLabel.includes(want)) return false;
      }
      if (term) {
        const hay = `${r.customerName} ${r.userid} ${r.tracking} ${r.fid} ${r.repAdmin}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, pay, money, mode, q]);

  const owed = useMemo(() => filtered.filter((r) => r.payState === "unpaid").reduce((s, r) => s + r.owed, 0), [filtered]);
  const unpaidN = useMemo(() => filtered.filter((r) => r.payState === "unpaid").length, [filtered]);
  const soldSum = useMemo(() => filtered.reduce((s, r) => s + r.sold, 0), [filtered]);
  const profitSum = useMemo(() => filtered.reduce((s, r) => s + r.profit, 0), [filtered]);

  const Chip = (active: boolean, onClick: () => void, label: string, tone?: "red" | "green") => (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? tone === "red"
            ? "border-red-600 bg-red-600 text-white"
            : tone === "green"
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-primary-600 bg-primary-600 text-white"
          : "border-border bg-white text-foreground hover:bg-surface-alt"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border-2 border-red-200 bg-red-50/60 p-4">
          <p className="text-xs font-medium text-muted">
            <Explain label="ยอดค้างชำระ (ที่กรองอยู่)" def="ผลรวมยอดที่ลูกค้ายังไม่จ่ายในรายการที่กรองอยู่ตอนนี้ — เงินที่ต้องตามเก็บ" />
          </p>
          <p className="mt-1 text-xl font-bold font-mono text-red-700">{baht(owed)}</p>
          <p className="text-[11px] text-muted">{unpaidN.toLocaleString()} ออเดอร์ยังไม่ชำระ</p>
        </div>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
          <p className="text-xs font-medium text-muted">ยอดขายรวม (ที่กรอง)</p>
          <p className="mt-1 text-xl font-bold font-mono">{baht(soldSum)}</p>
        </div>
        {showCost && (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
            <p className="text-xs font-medium text-muted">
              <Explain label="กำไรรวม (ที่กรอง)" def="ยอดขาย − ต้นทุน รวมรายการที่กรองอยู่ (เห็นเฉพาะสิทธิ์ที่ดูต้นทุนได้)" />
            </p>
            <p className={`mt-1 text-xl font-bold font-mono ${profitSum < 0 ? "text-red-600" : "text-emerald-700"}`}>{baht(profitSum)}</p>
          </div>
        )}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4">
          <p className="text-xs font-medium text-muted">จำนวนรายการ (ที่กรอง)</p>
          <p className="mt-1 text-xl font-bold font-mono">{filtered.length.toLocaleString()}</p>
        </div>
      </section>

      {/* Filters — click-select (กดเลือก ห้ามพิมพ์) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted">การชำระ:</span>
        {Chip(pay === "unpaid", () => setPay("unpaid"), "ยังไม่จ่าย", "red")}
        {Chip(pay === "paid", () => setPay("paid"), "จ่ายแล้ว", "green")}
        {Chip(pay === "all", () => setPay("all"), "ทั้งหมด")}
        <span className="mx-1 text-muted">·</span>
        <span className="text-[11px] text-muted">เงิน:</span>
        {Chip(money === "all", () => setMoney("all"), "ทั้งหมด")}
        {Chip(money === "cash", () => setMoney("cash"), "เงินสด")}
        {Chip(money === "credit", () => setMoney("credit"), "เครดิต")}
        <span className="mx-1 text-muted">·</span>
        <span className="text-[11px] text-muted">ขนส่ง:</span>
        {Chip(mode === "all", () => setMode("all"), "ทั้งหมด")}
        {Chip(mode === "1", () => setMode("1"), "🚚 รถ")}
        {Chip(mode === "2", () => setMode("2"), "🚢 เรือ")}
        {Chip(mode === "3", () => setMode("3"), "✈️ แอร์")}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา ชื่อ/รหัส/แทรคกิ้ง/เซลล์"
          className="ml-auto w-60 rounded-lg border border-border px-3 py-1.5 text-sm"
        />
      </div>

      {/* Grid */}
      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
          <thead className="bg-surface-alt/60 text-left text-[11px] uppercase text-muted">
            <tr>
              <th className="px-3 py-2.5">ลูกค้า · F-no</th>
              <th className="px-3 py-2.5">
                <Explain label="การชำระ" def="ยังไม่จ่าย = อยู่สถานะรอชำระเงิน · จ่ายแล้ว = ผ่านขั้นชำระไปแล้ว (เตรียมส่ง/ส่งแล้ว)" />
              </th>
              <th className="px-3 py-2.5 text-right">ยอดค้าง</th>
              <th className="px-3 py-2.5 text-right">ยอดขาย</th>
              {showCost && <th className="px-3 py-2.5 text-right">ต้นทุน</th>}
              {showCost && <th className="px-3 py-2.5 text-right">กำไร</th>}
              <th className="px-3 py-2.5">เงิน</th>
              <th className="px-3 py-2.5">ขนส่ง</th>
              <th className="px-3 py-2.5">
                <Explain label="admin ดูแล" def="เซลล์ที่ลูกค้าถูก assign (บน) + แอดมินที่แตะออเดอร์ล่าสุด (ล่าง)" />
              </th>
              <th className="px-3 py-2.5">สถานะ</th>
              <th className="px-3 py-2.5 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={showCost ? 11 : 9} className="p-10 text-center text-muted">ไม่พบรายการตามตัวกรอง 🎉</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.fid} className="border-t border-border hover:bg-surface-alt/30">
                  <td className="px-3 py-2">
                    <div className="font-semibold text-foreground">{r.customerName}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <CustomerCodeLink code={r.userid} />
                      <span className="font-mono text-primary-700">F{r.fid}</span>
                      {r.tracking !== "—" && <span className="font-mono">· {r.tracking}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.payState === "unpaid" ? (
                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">● ยังไม่จ่าย</span>
                    ) : (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">✓ จ่ายแล้ว</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${r.payState === "unpaid" ? "text-red-700" : "text-muted"}`}>{baht(r.owed)}</td>
                  <td className="px-3 py-2 text-right font-mono">{baht(r.sold)}</td>
                  {showCost && <td className="px-3 py-2 text-right font-mono text-muted">{baht(r.cost)}</td>}
                  {showCost && <td className={`px-3 py-2 text-right font-mono ${r.profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{baht(r.profit)}</td>}
                  <td className="px-3 py-2">
                    {r.isCredit ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                        💳 เครดิต{r.creditRoom > 0 ? ` ${(r.creditRoom / 1000).toFixed(0)}k` : ""}
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">💵 เงินสด</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{r.modeLabel}</div>
                    <div className="text-[11px] text-muted">{r.carrierLabel}</div>
                  </td>
                  <td className="px-3 py-2 text-[11px]">
                    <div className="font-medium">{r.repAdmin}</div>
                    <div className="text-muted">↻ {r.lastAdmin}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{r.statusLabel}</div>
                    <div className="text-[11px] text-muted">{fmtDate(r.fdate)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-stretch gap-1">
                      {r.payState === "unpaid" && (
                        <PaymentBoardSettle fid={r.fid} userid={r.userid} customerName={r.customerName} owed={r.owed} />
                      )}
                      <Link href={`/admin/forwarders/${r.fid}`} className="inline-flex justify-center rounded border border-primary-200 bg-primary-50 px-2 py-1 text-[11px] font-medium text-primary-700 hover:bg-primary-100">
                        ดู / แก้ไข
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">
        ขอบเขต: ฝากนำเข้าในช่วงชำระเงิน (รอชำระ → เตรียมส่ง → ส่งแล้ว) · ยอดค้าง = สูตร calcForwarderOutstanding (รวมส่วนลด + นิติ 1%) · กด &quot;ดู/แก้ไข&quot; เพื่อมาร์คชำระ/แก้ต้นทุน/แนบสลิปที่หน้ารายละเอียด
      </p>
    </div>
  );
}
