"use client";

/**
 * /admin/system-reports — หัวคอลัมน์กดเรียงลำดับ (ปอน 2026-07-29)
 * กดหัว → ?sort=colKey&dir=asc↔desc (คงตัวกรองเดิม type/pos/rep/from/to · reset page=1).
 * การเรียงจริงทำ server-side ที่ data function (เรียงทั้ง dataset ก่อน paginate).
 * colKey=null = คอลัมน์ที่เรียงไม่ได้ (เช่น สลิป) → หัวธรรมดา.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export function SortHeader({
  label,
  colKey,
  className,
}: {
  label: string;
  colKey: string | null;
  className: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  if (!colKey) return <th className={className}>{label}</th>;

  // default sort ของ report = paidDate asc → หัว paidDate ขึ้น active ▲ ตั้งแต่ยังไม่กด
  const curSort = sp.get("sort") ?? "paidDate";
  const curDir = sp.get("dir") === "desc" ? "desc" : "asc";
  const active = curSort === colKey;
  const nextDir = active && curDir === "asc" ? "desc" : "asc";

  const go = () => {
    const q = new URLSearchParams(sp.toString());
    q.set("sort", colKey);
    q.set("dir", nextDir);
    q.delete("page"); // กดเรียง → กลับหน้า 1 เสมอ
    router.push(`${pathname}?${q.toString()}`);
  };

  return (
    <th className={className} aria-sort={active ? (curDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={go}
        title="กดเพื่อเรียงลำดับ"
        className="inline-flex select-none items-center gap-1 hover:opacity-80"
      >
        <span>{label}</span>
        {active ? (
          curDir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}
