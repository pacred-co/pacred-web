"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { addHsLine, deleteHsLine } from "@/actions/admin/hs-codes";
import { confirm } from "@/components/ui/confirm";

type HsCode = {
  code:             string;
  description:      string;
  default_duty_pct: number;
  unit:             string | null;
};

type Line = {
  id:            string;
  hs_code:       string;
  description:   string;
  qty:           number;
  weight_kg:     number;
  value_thb:     number;
  duty_pct_used: number | null;
  note:          string | null;
};

export function HsLinesEditor({
  containerId,
  lines,
  hsCodes,
}: {
  containerId: string;
  lines:       Line[];
  hsCodes:     HsCode[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  // Add-line form state
  const [code,      setCode]      = useState(hsCodes[0]?.code ?? "");
  const [qty,       setQty]       = useState("");
  const [weightKg,  setWeightKg]  = useState("");
  const [valueThb,  setValueThb]  = useState("");
  const [note,      setNote]      = useState("");

  function onAdd() {
    setErr(null);
    if (!code) { setErr("เลือก HS code"); return; }
    const qN = Number(qty);
    const wN = Number(weightKg);
    const vN = Number(valueThb);
    if (!Number.isFinite(qN) || qN < 0) { setErr("qty ไม่ถูกต้อง"); return; }
    if (!Number.isFinite(wN) || wN < 0) { setErr("weight ไม่ถูกต้อง"); return; }
    if (!Number.isFinite(vN) || vN < 0) { setErr("value ไม่ถูกต้อง"); return; }

    startTransition(async () => {
      const res = await addHsLine({
        container_id: containerId,
        hs_code:      code,
        qty:          qN,
        weight_kg:    wN,
        value_thb:    vN,
        note:         note || undefined,
      });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      // reset for next entry
      setQty(""); setWeightKg(""); setValueThb(""); setNote("");
      router.refresh();
    });
  }

  async function onDelete(id: string) {
    if (!(await confirm("ลบรายการนี้?"))) return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteHsLine({ id });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Existing lines table */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-border bg-surface-alt/50 px-5 py-3">
          <h2 className="text-sm font-bold text-foreground">รายการ ({lines.length})</h2>
        </div>
        {lines.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">ยังไม่มีรายการ — ใช้ฟอร์มด้านล่างเพื่อเพิ่ม</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/30 text-left text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">HS code</th>
                  <th className="px-3 py-2">รายละเอียด</th>
                  <th className="px-3 py-2 text-right">qty</th>
                  <th className="px-3 py-2 text-right">น้ำหนัก (kg)</th>
                  <th className="px-3 py-2 text-right">มูลค่า (THB)</th>
                  <th className="px-3 py-2 text-right">อากร %</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-mono">{l.hs_code}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">
                      {l.description}
                      {l.note && <div className="mt-0.5 text-[10px] text-muted">📝 {l.note}</div>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{l.qty.toLocaleString("th-TH")}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.weight_kg.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right font-mono">{l.value_thb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.duty_pct_used !== null ? `${l.duty_pct_used.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => onDelete(l.id)}
                        disabled={pending}
                      >
                        ลบ
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add-line form */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-foreground">เพิ่มรายการใหม่</h2>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium">HS code</span>
            <select
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono"
            >
              {hsCodes.map((h) => (
                <option key={h.code} value={h.code}>
                  {h.code} — {h.description} ({h.default_duty_pct}%)
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium">จำนวน (qty)</span>
            <input
              type="number"
              step="any"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium">น้ำหนัก (kg)</span>
            <input
              type="number"
              step="any"
              min="0"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium">มูลค่า (THB)</span>
            <input
              type="number"
              step="any"
              min="0"
              value={valueThb}
              onChange={(e) => setValueThb(e.target.value)}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono"
            />
          </label>

          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium">หมายเหตุ (optional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
            />
          </label>
        </div>

        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        <Button type="button" onClick={onAdd} disabled={pending} fullWidth>
          {pending ? "กำลังบันทึก..." : "+ เพิ่มรายการ"}
        </Button>
      </section>
    </div>
  );
}
