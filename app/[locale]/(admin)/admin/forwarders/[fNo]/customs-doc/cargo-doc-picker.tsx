"use client";

/**
 * <CargoDocPicker> — tick ฝากนำเข้า items → create a DRAFT ใบขน/ใบกำกับ seeded
 * from them (owner 2026-06-28 #1). Click-select (no typing) + §0f confirm. On
 * success → the customs-declarations page to edit/issue.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileText, CheckSquare, Square } from "lucide-react";
import { Explain } from "@/components/ui/tooltip";
import { adminCreateCargoDeclarationFromItems } from "@/actions/admin/cargo-declaration-from-items";

export type PickItem = { id: number; hsCode: string; name: string; qty: number; weightKg: number; declaredThb: number };

const baht = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

export function CargoDocPicker({ fid, items, disabled }: { fid: number; items: PickItem[]; disabled: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set(items.map((i) => i.id))); // default: all
  const [docType, setDocType] = useState<"import" | "export">("import");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = sel.size === items.length && items.length > 0;
  const toggleAll = () => setSel(allOn ? new Set() : new Set(items.map((i) => i.id)));

  const picked = items.filter((i) => sel.has(i.id));
  const totDeclared = picked.reduce((s, i) => s + i.declaredThb, 0);
  const missingHs = picked.filter((i) => !i.hsCode).length;

  function create() {
    setErr(null);
    if (picked.length === 0) { setErr("เลือกสินค้าอย่างน้อย 1 รายการ"); return; }
    if (!window.confirm(
      `สร้าง${docType === "import" ? "ใบขนขาเข้า" : "ใบขนขาออก"} (ร่าง) จาก ${picked.length} สินค้า?\n\nมูลค่าสำแดงรวม ${baht(totDeclared)}${missingHs > 0 ? `\n⚠️ มี ${missingHs} รายการยังไม่มีพิกัด HS (เติมได้ที่หน้าใบขน)` : ""}\n\n(เป็นร่าง · แก้ไข/ออกจริงที่หน้าใบขน)`,
    )) return;
    startTransition(async () => {
      const res = await adminCreateCargoDeclarationFromItems({ forwarderId: fid, itemIds: [...sel], declarationType: docType });
      if (!res.ok) { setErr(res.error); return; }
      // Land on the NEW draft's detail (edit มูลค่าสำแดง/HS/Form-E + export
      // ใบขน/invoice/packing-list/Excel) — not a generic list.
      const newId = res.data?.id;
      router.push(newId ? `/admin/accounting/cargo-declarations/${newId}` : "/admin/accounting/cargo-declarations");
    });
  }

  if (items.length === 0) return <p className="rounded-xl border border-border bg-surface-alt/40 p-6 text-center text-sm text-muted">ไม่มีรายการสินค้าในฝากนำเข้านี้</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] text-muted">ประเภทเอกสาร:</span>
        {(["import", "export"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setDocType(t)} disabled={disabled}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${docType === t ? "border-primary-600 bg-primary-600 text-white" : "border-border bg-white hover:bg-surface-alt"}`}>
            {t === "import" ? "ใบขนขาเข้า" : "ใบขนขาออก"}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted">
          <Explain label={`เลือก ${picked.length}/${items.length} · มูลค่าสำแดงรวม ${baht(totDeclared)}`} def="มูลค่าสำแดง (declared value) = ราคาที่แจ้งกรมศุลฯ — ดึงจากที่ตั้งไว้ในสินค้า · แก้ต่อได้ที่หน้าใบขน" />
        </span>
      </div>

      <div className="overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt/60 text-left text-[11px] uppercase text-muted">
            <tr>
              <th className="px-3 py-2.5 w-10">
                <button type="button" onClick={toggleAll} disabled={disabled} aria-label="เลือกทั้งหมด">
                  {allOn ? <CheckSquare className="h-4 w-4 text-primary-600" /> : <Square className="h-4 w-4 text-muted" />}
                </button>
              </th>
              <th className="px-3 py-2.5">สินค้า</th>
              <th className="px-3 py-2.5">พิกัด HS</th>
              <th className="px-3 py-2.5 text-right">จำนวน</th>
              <th className="px-3 py-2.5 text-right">น้ำหนัก (กก.)</th>
              <th className="px-3 py-2.5 text-right">มูลค่าสำแดง</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={`border-t border-border ${sel.has(i.id) ? "" : "opacity-50"}`}>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => toggle(i.id)} disabled={disabled} aria-label="เลือก">
                    {sel.has(i.id) ? <CheckSquare className="h-4 w-4 text-primary-600" /> : <Square className="h-4 w-4 text-muted" />}
                  </button>
                </td>
                <td className="px-3 py-2 font-medium">{i.name}</td>
                <td className="px-3 py-2 font-mono text-xs">{i.hsCode || <span className="text-amber-600">— ยังไม่มี —</span>}</td>
                <td className="px-3 py-2 text-right font-mono">{i.qty.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">{i.weightKg.toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono">{baht(i.declaredThb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{err}</div>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={create} disabled={pending || disabled || picked.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          สร้างใบขน (ร่าง) จาก {picked.length} สินค้า
        </button>
        {missingHs > 0 && <span className="text-[11px] text-amber-600">⚠️ {missingHs} รายการยังไม่มีพิกัด HS — เติมได้ที่หน้าใบขน</span>}
      </div>
    </div>
  );
}
