/**
 * container-profit-table.tsx — "กำไรตู้ (รายเดือน)" (owner 2026-07-29 · ต่อยอดงานปอน).
 *
 * แสดงกำไรต้นทุนรายตู้ จัดกลุ่มตามเดือนที่อ่านจาก "เลขตู้" ตรงๆ (GZS260723-1 →
 * ก.ค. 2026) ทั้งกวางโจว (MOMO) + อี้อู (TTW) · เฉพาะงานที่มี PR ในระบบ.
 * ทุน = เครื่องเดียวกับ /admin/report-cnt (live เมื่อยังไม่จ่ายค่าตู้ · ล็อกค่าที่เก็บ
 * เมื่อจ่ายแล้ว) → เลขหน้านี้ตรงกับรายงานตู้เสมอ. Server component · read-only.
 */
import { Link } from "@/i18n/navigation";
import type { ContainerProfitByMonth } from "@/lib/admin/container-cost-rollup";

const fmt0 = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const fmt2 = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ป้ายโกดัง + ต้นทาง — ตรงกับ label ของ report-cnt (task #39). */
function warehouseLabel(wh: string, origin: string): string {
  const w = wh === "8" ? "MOMO" : wh === "9" ? "TTW" : wh === "1" ? "แสง" : wh || "—";
  const o = origin === "1" ? "กวางโจว" : origin === "2" ? "อี้อู" : "";
  return o ? `${w} · ${o}` : w;
}

function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return month;
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const be = Number(m[1]) + 543;
  return `${names[Number(m[2]) - 1]} ${be}`;
}

function ProfitCell({ value }: { value: number }) {
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums font-bold ${
        value < 0 ? "text-red-600" : "text-emerald-700"
      }`}
    >
      {fmt2(value)}
    </td>
  );
}

export function ContainerProfitTable({ data }: { data: ContainerProfitByMonth }) {
  if (data.months.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        ไม่พบข้อมูลตู้ (เฉพาะงานที่มีรหัสลูกค้า PR)
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {/* GRAND TOTAL */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <span className="text-sm font-bold text-foreground">
          รวมทั้งหมด {fmt0(data.grand.containers)} ตู้
        </span>
        <span className="text-xs text-muted">ทุน {fmt2(data.grand.cost)}</span>
        <span className="text-xs text-muted">ขาย {fmt2(data.grand.sell)}</span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold text-white ${
            data.grand.profit < 0 ? "bg-red-600" : "bg-emerald-600"
          }`}
        >
          กำไร {fmt2(data.grand.profit)} บาท
        </span>
        <span className="text-[11px] text-muted">
          · เฉพาะงานที่มีรหัส PR · ทุน = เครื่องเดียวกับรายงานตู้ (คิดสดจนกว่าจะจ่ายค่าตู้)
        </span>
      </div>

      {data.months.map((m) => (
        <section key={m.month} className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-alt/60 px-4 py-2.5">
            <h3 className="text-sm font-bold text-foreground">
              {monthLabel(m.month)}{" "}
              <span className="font-normal text-muted">({fmt0(m.containers.length)} ตู้)</span>
            </h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted">ทุน {fmt2(m.cost)}</span>
              <span className="text-muted">ขาย {fmt2(m.sell)}</span>
              <span className={`font-bold ${m.profit < 0 ? "text-red-600" : "text-emerald-700"}`}>
                กำไร {fmt2(m.profit)}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full min-w-[880px] border-collapse text-xs [&>thead>tr>th]:border [&>thead>tr>th]:border-border [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border">
              <thead>
                <tr className="bg-surface-alt/40 text-muted">
                  <th className="px-3 py-2 text-left">เลขตู้</th>
                  <th className="px-3 py-2 text-left">โกดัง · ต้นทาง</th>
                  <th className="px-3 py-2 text-right">ชิปเม้น</th>
                  <th className="px-3 py-2 text-right">กล่อง</th>
                  <th className="px-3 py-2 text-right">คิว (CBM)</th>
                  <th className="px-3 py-2 text-right">น้ำหนัก (kg)</th>
                  <th className="px-3 py-2 text-right">ทุน (฿)</th>
                  <th className="px-3 py-2 text-right">ขาย (฿)</th>
                  <th className="px-3 py-2 text-right">กำไร (฿)</th>
                  <th className="px-3 py-2 text-left">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {m.containers.map((c, i) => (
                  <tr key={c.cabinet} className={i % 2 === 1 ? "bg-surface-alt/30" : ""}>
                    <td className="px-3 py-2 font-mono font-semibold">
                      <Link
                        href={`/admin/report-cnt/${encodeURIComponent(c.cabinet)}`}
                        className="text-sky-700 hover:underline"
                      >
                        {c.cabinet}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{warehouseLabel(c.warehouse, c.originChina)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt0(c.shipments)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt0(c.boxes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.cbm.toFixed(4)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt2(c.weightKg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt2(c.cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt2(c.sell)}</td>
                    <ProfitCell value={c.profit} />
                    <td className="px-3 py-2 text-[11px] text-muted">
                      {c.storedRows > 0 && c.liveRows === 0 ? "🔒 จ่ายค่าตู้แล้ว (ทุนล็อก)" : null}
                      {c.unpricedRows > 0 ? (
                        <span className="text-amber-600 font-semibold">
                          {" "}⚠ {fmt0(c.unpricedRows)} แถวยังไม่ตั้งราคาขาย
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
