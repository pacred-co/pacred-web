"use client";

/**
 * ตารางประวัติจ่ายเงินแทนลูกค้า — client-side sortable (owner 2026-07-16 · "กดเรียงได้เหมือนในภาพ").
 * ทุกคอลัมน์กดหัวเรียง asc → desc → ค่าเริ่มต้น (เรียงตามที่ server ส่งมา = เวลาใหม่สุดก่อน).
 *
 * 2026-08-01 (owner): "ยังแยกเป็นแทรกกิ้ง แทนที่จะกรุปเป็นงาน ชิปเม้นๆ หรือ เป็นรอบชำระ" +
 * "เลขที่ออเดอในหน้านี้ … มันควรเป็นเลขที่เอกสาร ใบแจ้งหนี้ ที่ออกไป แต่ละใบ" →
 *   • แถว = entry: "รอบชำระ" (ลูก type 2/4 ที่ reforder2 ชี้หัว type='1' เดียวกัน ยุบเหลือ
 *     แถวเดียว · ยอด = ยอดแถวหัวที่ลูกค้าโอนจริง · กด #หัว → /admin/wallet/<id>) หรือ
 *     แถวเดี่ยวแบบเดิม (ไม่มี reforder2 / หัวหาไม่เจอ).
 *   • คอลัมน์แรก = "เลขที่เอกสาร" (FRI… กดเข้า /admin/billing-run/<id>) — เลขแถวระบบ
 *     ยังโชว์เล็กๆ ใต้เอกสาร (พนักงานบางคนใช้อ้างอิง).
 * DISPLAY-ONLY — ไม่มี write path ในไฟล์นี้.
 */

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import type {
  PayUserHistoryDoc,
  PayUserHistoryEntry,
  PayUserHistoryGroupEntry,
  PayUserHistoryRow,
} from "@/actions/admin/pay-user-view";
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

function ServicePill({ label }: { label: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${label === "ฝากนำเข้า" ? "bg-indigo-500" : "bg-teal-500"}`}>
      {label}
    </span>
  );
}

/**
 * คอลัมน์แรก "เลขที่เอกสาร" — ใบแจ้งหนี้ (FRI… ไม่รวมใบที่ยกเลิก) กดเข้าเอกสารได้ ·
 * ใต้เอกสาร = เลขแถวระบบ (#tb_wallet_hs.id) เล็ก/จาง กดเข้า /admin/wallet/<id>.
 */
function DocCell({
  docs,
  rawId,
  rawHref,
  rawTitle,
  noDocLabel,
}: {
  docs: PayUserHistoryDoc[];
  rawId: number;
  rawHref: string;
  rawTitle: string;
  noDocLabel: string;
}) {
  return (
    <div className="flex flex-col items-start gap-0.5 whitespace-normal">
      {docs.length > 0 ? (
        <div className="flex max-w-[220px] flex-wrap gap-x-2 gap-y-0.5">
          {docs.map((d) => (
            <Link
              key={d.id}
              href={`/admin/billing-run/${d.id}`}
              className="whitespace-nowrap font-semibold text-sky-700 hover:underline"
              title={d.status === "paid" ? "ใบแจ้งหนี้ (รับชำระแล้ว) — กดดูเอกสาร" : "ใบแจ้งหนี้ — กดดูเอกสาร"}
            >
              {d.docNo}
              {d.status === "paid" && <span className="ml-0.5 text-emerald-600">✓</span>}
            </Link>
          ))}
        </div>
      ) : (
        <span className="text-[11px] text-gray-400">{noDocLabel}</span>
      )}
      <Link
        href={rawHref}
        className="font-mono text-[11px] text-gray-400 hover:text-sky-600 hover:underline"
        title={rawTitle}
      >
        #{rawId} ↗
      </Link>
    </div>
  );
}

function ReceiptPills({ receipts }: { receipts: PayUserHistoryRow["receipts"] }) {
  return (
    <>
      {receipts.map((rc) => (
        <Link
          key={`r${rc.id}`}
          href={`/admin/accounting/forwarder-invoice/${rc.id}`}
          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${rc.status === "2" ? "bg-gray-300 text-gray-500 line-through" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
          title={rc.status === "2" ? "ใบเสร็จ(ยกเลิกแล้ว)" : "ดูใบเสร็จ"}
        >
          {rc.rid}
        </Link>
      ))}
    </>
  );
}

/** ลิงก์ปลายทางของ "รายการอ้างอิง" ตามประเภทบริการ. */
const refHref = (serviceLabel: string, reforder: string) =>
  serviceLabel === "ฝากนำเข้า" ? `/admin/forwarders/${reforder}` : `/admin/service-orders/${reforder}`;

type SortKey =
  | "doc" | "date" | "userid" | "name" | "service"
  | "amount" | "reforder" | "status" | "admin";

const docsOf = (e: PayUserHistoryEntry): PayUserHistoryDoc[] =>
  e.kind === "group" ? e.docs : e.row.docs;

const COLUMNS: {
  key: SortKey;
  label: string;
  align?: "right" | "center";
  get: (e: PayUserHistoryEntry) => string | number;
}[] = [
  // เลขที่เอกสารเป็นตัวเรียงหลัก; แถวที่ยังไม่มีใบ เรียงด้วยเลขแถวระบบต่อท้าย
  { key: "doc", label: "เลขที่เอกสาร", get: (e) => docsOf(e).map((d) => d.docNo).join(" ") || `~${e.kind === "group" ? e.headerId : e.row.id}` },
  { key: "date", label: "เวลาทำรายการ", get: (e) => (e.kind === "group" ? e.date : e.row.date) ?? "" },
  { key: "userid", label: "รหัสสมาชิก", get: (e) => (e.kind === "group" ? e.userid : e.row.userid) ?? "" },
  { key: "name", label: "ชื่อ-นามสกุล", get: (e) => (e.kind === "group" ? e.name : e.row.name) ?? "" },
  { key: "service", label: "ประเภทบริการ", get: (e) => (e.kind === "group" ? e.service_label : e.row.service_label) ?? "" },
  { key: "amount", label: "จำนวนเงิน", align: "right", get: (e) => (e.kind === "group" ? e.headerAmount : e.row.amount) },
  { key: "reforder", label: "รายการอ้างอิง", get: (e) => (e.kind === "group" ? e.items[0]?.reforder ?? "" : e.row.reforder ?? "") },
  { key: "status", label: "สถานะรายการ", align: "center", get: (e) => (e.kind === "group" ? e.status : e.row.status) ?? "" },
  { key: "admin", label: "ผู้ทำรายการ", get: (e) => (e.kind === "group" ? e.admin_crate : e.row.admin_crate) ?? "" },
];

/** แถวเดี่ยว (รูปแบบเดิม — เปลี่ยนเฉพาะคอลัมน์แรกเป็น เลขที่เอกสาร). */
function SingleRow({ r, zebra }: { r: PayUserHistoryRow; zebra: boolean }) {
  return (
    <tr className={`transition-colors hover:bg-primary-50/50 ${zebra ? "bg-[#F2F1EF]" : "bg-white"}`}>
      <td className="px-3 py-2">
        <DocCell
          docs={r.docs}
          rawId={r.id}
          rawHref={`/admin/wallet/${r.id}`}
          rawTitle="เลขที่รายการในระบบ — กดเปิดรายละเอียดการชำระ"
          noDocLabel={r.service_label === "ฝากนำเข้า" ? "— ยังไม่ออกใบ" : "—"}
        />
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.date ? formatThaiDateTime(r.date) : "—"}</td>
      <td className="px-3 py-2">
        {r.userid ? (
          <Link href={`/admin/customers/${r.userid}`} className="font-medium text-sky-600 hover:underline">{r.userid}</Link>
        ) : "—"}
      </td>
      <td className="px-3 py-2 text-gray-800">{r.name}</td>
      <td className="px-3 py-2">
        <ServicePill label={r.service_label} />
      </td>
      <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">{thb(r.amount)}</td>
      <td className="px-3 py-2 font-mono">
        {r.reforder ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={refHref(r.service_label, r.reforder)}
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
                <ReceiptPills receipts={r.receipts} />
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
  );
}

/**
 * แถวรอบชำระ — 1 การโอนของลูกค้า (แถวหัว type='1') ครอบหลายออเดอร์:
 * ยอด = ยอดที่ลูกค้าโอนจริง · อ้างอิง = ทุกออเดอร์กดเข้าได้ · กด "ดูรอบชำระ" →
 * /admin/wallet/<หัว> (หน้าตรวจสลิป/ตัดจ่ายเดิม).
 */
function GroupRow({ g, zebra }: { g: PayUserHistoryGroupEntry; zebra: boolean }) {
  const first = g.items[0];
  const hasFwd = g.items.some((it) => it.service_label === "ฝากนำเข้า");
  return (
    <tr className={`transition-colors hover:bg-primary-50/50 ${zebra ? "bg-[#F2F1EF]" : "bg-white"}`}>
      <td className="px-3 py-2 align-top">
        <DocCell
          docs={g.docs}
          rawId={g.headerId}
          rawHref={`/admin/wallet/${g.headerId}`}
          rawTitle="เลขที่รอบชำระในระบบ — กดเปิดหน้าตรวจสลิป/ตัดจ่าย"
          noDocLabel={hasFwd ? "— ยังไม่ออกใบ" : "—"}
        />
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{g.date ? formatThaiDateTime(g.date) : "—"}</td>
      <td className="px-3 py-2">
        {g.userid ? (
          <Link href={`/admin/customers/${g.userid}`} className="font-medium text-sky-600 hover:underline">{g.userid}</Link>
        ) : "—"}
      </td>
      <td className="px-3 py-2 text-gray-800">{g.name}</td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-start gap-1">
          <ServicePill label={g.service_label} />
          <span
            className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700"
            title="รอบชำระเดียว (ลูกค้าโอนครั้งเดียว) ครอบหลายออเดอร์ — ยุบให้เห็นเป็นงานเดียว"
          >
            รอบชำระ · {g.items.length} รายการ
          </span>
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono font-semibold text-gray-900" title="ยอดที่ลูกค้าชำระจริง (ยอดแถวหัวรอบชำระ/สลิป)">
            {thb(g.headerAmount)}
          </span>
          {g.amountMismatch && (
            <span
              className="whitespace-normal text-right text-[11px] font-medium text-amber-600"
              title="ผลรวมยอดรายออเดอร์ไม่เท่ายอดที่ชำระ — เปิดรอบชำระเพื่อตรวจสอบ"
            >
              ⚠ ยอดรายแถวรวม {thb(g.childrenSum)} ไม่เท่ายอดที่ชำระ {thb(g.headerAmount)}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 font-mono">
        <div className="flex max-w-[380px] flex-wrap items-center gap-x-2 gap-y-1 whitespace-normal">
          {g.items.map((it) =>
            it.reforder ? (
              <Link
                key={it.id}
                href={refHref(it.service_label, it.reforder)}
                className="text-sky-600 hover:underline"
                title="เปิดออเดอร์ → ใบวางบิล/ใบเสร็จ"
              >
                {it.reforder}
              </Link>
            ) : null,
          )}
          {g.receipts.length > 0 && (
            <span className="flex flex-wrap gap-1">
              <ReceiptPills receipts={g.receipts} />
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-center align-top">
        <div className="flex flex-col items-center gap-1.5">
          <StatusPill status={g.status} />
          {/* next-action (§0g): รอดำเนินการ = ต้องเข้าไปตรวจสลิป/ตัดจ่ายที่หน้ารอบชำระ */}
          <Link
            href={`/admin/wallet/${g.headerId}`}
            className="inline-flex items-center whitespace-nowrap rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
            title="เปิดหน้ารอบชำระ — ดูสลิป + ตรวจ + ตัดจ่าย"
          >
            {g.status === "1" ? "🔔 ตรวจสลิป/ตัดจ่าย ↗" : "ดูรอบชำระ ↗"}
          </Link>
          {g.status === "2" && first?.service_label === "ฝากนำเข้า" && first.reforder && (
            // ปุ่มย้อนตัวเดิม preview เป็น "ทั้งชุด" เองเมื่อ fid อยู่ในรอบรวม
            <PayUserReverseButton fid={first.reforder} />
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-gray-600">{g.admin_crate ?? "—"}</td>
    </tr>
  );
}

export function PayUserHistoryTable({ entries }: { entries: PayUserHistoryEntry[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return entries;
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col) return entries;
    const arr = [...entries];
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
  }, [entries, sort]);

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
            sorted.map((e, i) =>
              e.kind === "group" ? (
                <GroupRow key={`g${e.headerId}`} g={e} zebra={i % 2 === 1} />
              ) : (
                <SingleRow key={`s${e.row.id}`} r={e.row} zebra={i % 2 === 1} />
              ),
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
