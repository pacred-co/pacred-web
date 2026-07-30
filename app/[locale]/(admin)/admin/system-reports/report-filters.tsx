"use client";

/**
 * /admin/system-reports — ตัวกรองรายงานระบบ (ปอน 2026-07-29)
 * 5 ตัวกรอง: ประเภทรายงาน · ตำแหน่ง · ผู้รับผิดชอบ · ตั้งแต่วันที่ · ถึงวันที่ + ปุ่มค้นหา.
 * "ค้นหาข้อมูล" push ค่าลง URL → server page อ่าน searchParams แล้ว fetch ตาราง.
 * ช่วงวันที่ = date range กรองตามวันที่ลูกค้าจ่ายเงินจริง (tb_wallet_hs.date).
 * ผู้รับผิดชอบ = รายชื่อตาม "ตำแหน่ง" ที่เลือก (เซลล์/Cs มี roster · อื่นๆ ยังว่าง).
 *
 * NOTE: รับ current values เป็น FLAT props (มี default ทุกตัว) — nested-object prop
 * จาก server→client เคย hydrate ได้ undefined ในหน้านี้ (Next 16). reps = array
 * ของ flat object (แพทเทิร์นเดียวกับที่ใช้ได้อยู่) ไม่ใช่ nested map.
 */
import { useRef, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, CalendarDays, ChevronDown, Check } from "lucide-react";

type Rep = { position: string; id: string; name: string };

const REPORT_TYPES = [
  { key: "commission", label: "ค่าคอมมิชชั่น" },
  // กำไรตู้ (owner 2026-07-29): กำไรต้นทุนรายตู้ จัดกลุ่มรายเดือนตามเลขตู้ —
  // ไม่ใช้ ตำแหน่ง/ผู้รับผิดชอบ/ช่วงวันที่ (เดือนอ่านจากเลขตู้ตรงๆ) → ซ่อนตัวกรองพวกนั้น
  { key: "container-profit", label: "กำไรตู้ (รายเดือน)" },
];

const POSITIONS = [
  { key: "sales", label: "เซลล์" },
  { key: "purchase", label: "สั่งซื้อ" },
  { key: "cs", label: "Cs" },
  { key: "driver", label: "คนขับรถ" },
  { key: "warehouse", label: "โกดังคลังสินค้า" },
];

const inputClass =
  "h-10 w-full rounded-full border border-border bg-white dark:bg-surface px-4 text-sm text-foreground focus:border-primary-600 focus:ring-2 focus:ring-primary-100 focus:outline-none";
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

/**
 * ดร็อปดาวน์ทรง pill/badge — custom (ไม่ใช้ native <select>) เพราะ popup ของ native
 * คุมขอบมนไม่ได้. ปุ่ม pill (ปิด) + แผงลอยขอบมน rounded-2xl (เปิด) · แถวตัวเลือกเป็น
 * pill · hover/selected ชัด · คลิกนอก/Esc ปิด. แผงใช้ position:absolute (ไม่ใช่
 * fixed) จึงไม่โดน transform ของ .animate-fade-in ดัก.
 */
function SelectPill({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`${inputClass} flex cursor-pointer items-center justify-between gap-2 text-left`}
        >
          <span className="truncate">{selected?.label ?? ""}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-auto rounded-2xl border border-border bg-white p-1.5 shadow-xl dark:bg-surface"
          >
            {options.map((o) => {
              const active = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-full px-3 py-1.5 text-left text-sm transition-colors ${
                      active ? "bg-primary-600 font-medium text-white" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {active && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
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

  // เปลี่ยนตำแหน่ง → รีเซ็ตผู้รับผิดชอบเป็น "ทั้งหมด" (คนของตำแหน่งเก่าไม่อยู่ในตำแหน่งใหม่)
  const onPositionChange = (v: string) => {
    setPosition(v);
    setRep("");
  };

  // ผู้รับผิดชอบ = รายชื่อของตำแหน่งที่เลือก (เซลล์→เซลล์ · Cs→CS · ตำแหน่งอื่นยังไม่มี roster)
  const respOptions = [
    { value: "", label: "ทั้งหมด" },
    ...reps.filter((r) => r.position === position).map((r) => ({ value: r.id, label: r.name })),
  ];

  // กำไรตู้ = ทั้งระบบจัดกลุ่มรายเดือนจากเลขตู้ — ตำแหน่ง/ผู้รับผิดชอบ/วันที่ ไม่เกี่ยว
  const isContainerProfit = reportType === "container-profit";

  const onSearch = () => {
    const q = new URLSearchParams();
    q.set("type", reportType);
    if (!isContainerProfit) {
      q.set("pos", position);
      if (rep) q.set("rep", rep);
      if (dateFrom) q.set("from", dateFrom);
      if (dateTo) q.set("to", dateTo);
    }
    router.push(`${pathname}?${q.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <SelectPill
        label="ประเภทรายงาน"
        value={reportType}
        onChange={setReportType}
        options={REPORT_TYPES.map((t) => ({ value: t.key, label: t.label }))}
        className={fieldClass}
      />

      {!isContainerProfit && (
        <>
          <SelectPill
            label="ตำแหน่ง"
            value={position}
            onChange={onPositionChange}
            options={POSITIONS.map((p) => ({ value: p.key, label: p.label }))}
            className={fieldClass}
          />

          <SelectPill
            label="ผู้รับผิดชอบ"
            value={rep}
            onChange={setRep}
            options={respOptions}
            className={fieldClass}
          />

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
        </>
      )}

      <button
        type="button"
        onClick={onSearch}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
      >
        <Search className="h-4 w-4" />
        ค้นหาข้อมูล
      </button>
    </div>
  );
}
