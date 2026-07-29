"use client";

/**
 * /admin/system-reports — ตัวกรองรายงานระบบ (ปอน 2026-07-29)
 * 5 ตัวกรอง: ประเภทรายงาน · ตำแหน่ง · ผู้รับผิดชอบ · ตั้งแต่วันที่ · ถึงวันที่ + ปุ่มค้นหา.
 * "ค้นหาข้อมูล" push ค่าลง URL → server page อ่าน searchParams แล้ว fetch ตาราง.
 * ช่วงวันที่ = date range กรองตามวันที่ลูกค้าจ่ายเงินจริง (tb_wallet_hs.date).
 * ตอนนี้รองรับ ประเภท=ค่าคอมมิชชั่น + ตำแหน่ง=เซลล์ (เริ่มจากเซลล์ก่อน).
 *
 * NOTE: รับ current values เป็น FLAT props (มี default ทุกตัว) — nested-object prop
 * จาก server→client เคย hydrate ได้ undefined ในหน้านี้ (Next 16).
 */
import { useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, CalendarDays } from "lucide-react";

type Rep = { id: string; name: string };

const REPORT_TYPES = [{ key: "commission", label: "ค่าคอมมิชชั่น" }];

const POSITIONS = [
  { key: "sales", label: "เซลล์" },
  { key: "purchase", label: "สั่งซื้อ" },
  { key: "cs", label: "Cs" },
  { key: "driver", label: "คนขับรถ" },
  { key: "warehouse", label: "โกดังคลังสินค้า" },
];

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-white dark:bg-surface px-3 text-sm text-foreground focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none";
const fieldClass = "flex w-full flex-col gap-1 sm:w-52";
const dateFieldClass = "flex w-full flex-col gap-1 sm:w-44";
const labelClass = "text-xs font-medium text-muted";

/**
 * ช่องวันที่ format วว/ดด/ปปปป + กดปฏิทิน native ได้.
 * native <input type=date> แสดง format ตาม locale ของ browser (คุมไม่ได้) →
 * โชว์ วว/ดด/ปปปป ในช่อง text (readOnly) แล้วเปิดปฏิทินจริงด้วย showPicker()
 * ของ <input type=date> ที่ซ่อนไว้ (value = ISO "YYYY-MM-DD" ตามเดิม).
 */
function DateField({
  label,
  value,
  onChange,
  min,
  max,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  className: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = ref.current;
    if (el?.showPicker) el.showPicker();
    else el?.focus();
  };
  const display = value ? value.split("-").reverse().join("/") : ""; // 2026-07-10 → 10/07/2026

  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type="text"
          readOnly
          value={display}
          placeholder="วว/ดด/ปปปป"
          onClick={openPicker}
          className={`${inputClass} cursor-pointer pr-9`}
        />
        <CalendarDays
          onClick={openPicker}
          className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 cursor-pointer text-muted"
          aria-hidden
        />
        <input
          ref={ref}
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="absolute bottom-0 left-3 h-0 w-0 opacity-0"
          tabIndex={-1}
          aria-hidden
        />
      </div>
    </div>
  );
}

export function ReportFilters({
  reps = [],
  curType = "commission",
  curPosition = "sales",
  curRep = "",
  curFrom = "",
  curTo = "",
}: {
  reps?: Rep[];
  curType?: string;
  curPosition?: string;
  curRep?: string;
  curFrom?: string;
  curTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [reportType, setReportType] = useState(curType || "commission");
  const [position, setPosition] = useState(curPosition || "sales");
  const [rep, setRep] = useState(curRep);
  const [dateFrom, setDateFrom] = useState(curFrom);
  const [dateTo, setDateTo] = useState(curTo);

  const onSearch = () => {
    const q = new URLSearchParams();
    q.set("type", reportType);
    q.set("pos", position);
    if (rep) q.set("rep", rep);
    if (dateFrom) q.set("from", dateFrom);
    if (dateTo) q.set("to", dateTo);
    router.push(`${pathname}?${q.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className={fieldClass}>
        <label className={labelClass}>ประเภทรายงาน</label>
        <select className={inputClass} value={reportType} onChange={(e) => setReportType(e.target.value)}>
          {REPORT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>ตำแหน่ง</label>
        <select className={inputClass} value={position} onChange={(e) => setPosition(e.target.value)}>
          {POSITIONS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>ผู้รับผิดชอบ</label>
        <select className={inputClass} value={rep} onChange={(e) => setRep(e.target.value)}>
          <option value="">— เลือกผู้รับผิดชอบ —</option>
          {reps.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <DateField
        label="ตั้งแต่วันที่"
        value={dateFrom}
        max={dateTo || undefined}
        onChange={setDateFrom}
        className={dateFieldClass}
      />

      <DateField
        label="ถึงวันที่"
        value={dateTo}
        min={dateFrom || undefined}
        onChange={setDateTo}
        className={dateFieldClass}
      />

      <button
        type="button"
        onClick={onSearch}
        className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
      >
        <Search className="h-4 w-4" />
        ค้นหาข้อมูล
      </button>
    </div>
  );
}
