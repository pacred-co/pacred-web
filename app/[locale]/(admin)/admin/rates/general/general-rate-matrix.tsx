"use client";

/**
 * Faithful GENERAL rate-matrix editor — Theme B (2026-05-31 · เดฟ).
 *
 * Reads/writes the tables the pricing engine ACTUALLY uses (tb_rate_g_kg /
 * tb_rate_g_cbm via adminUpdateGeneralRateCells), replacing the rebuilt
 * rate_general editor whose writes the engine never read.
 *
 * Layout mirrors legacy rate.php: grouped by (warehouse × transport), one row
 * per product type, with the 3 KG tiers + 3 CBM tiers editable inline. Save
 * sends the whole matrix; the action only writes cells that actually changed.
 *
 * Codes (verified vs legacy rate-vip.php): sourcewarehouse '1'=กวางโจว /
 * '2'=อี้อู · rgtransporttype '1'=รถ/'2'=เรือ/'3'=อากาศ · rgproductstype
 * '1'=ทั่วไป/'2'=มอก./'3'=อย./'4'=พิเศษ.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminUpdateGeneralRateCells } from "@/actions/admin/rate-edits";

type WH = "1" | "2";
type TT = "1" | "2" | "3";
type PT = "1" | "2" | "3" | "4";

export type GeneralCellData = {
  kg1: number | null; kg2: number | null; kg3: number | null;
  cbm1: number | null; cbm2: number | null; cbm3: number | null;
};
export type GeneralMatrix = Record<string, GeneralCellData>; // key `${wh}|${tt}|${pt}`

const WH_LABEL: Record<WH, string> = { "1": "กวางโจว", "2": "อี้อู" };
const TT_LABEL: Record<TT, string> = { "1": "🚚 ทางรถ", "2": "🚢 ทางเรือ", "3": "✈️ ทางอากาศ" };
const PT_LABEL: Record<PT, string> = { "1": "ทั่วไป", "2": "มอก.", "3": "อย.", "4": "พิเศษ" };
const WHS: WH[] = ["1", "2"];
const TTS: TT[] = ["1", "2", "3"];
const PTS: PT[] = ["1", "2", "3", "4"];

const cellKey = (wh: WH, tt: TT, pt: PT) => `${wh}|${tt}|${pt}`;

function toNum(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const FIELDS = ["kg1", "kg2", "kg3", "cbm1", "cbm2", "cbm3"] as const;
type Field = (typeof FIELDS)[number];

export function GeneralRateMatrix({ coid, initial }: { coid: string; initial: GeneralMatrix }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // string-valued draft so inputs can be cleared; key = `${cellKey}.${field}`
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const wh of WHS) for (const tt of TTS) for (const pt of PTS) {
      const k = cellKey(wh, tt, pt);
      const c = initial[k];
      for (const f of FIELDS) {
        const v = c?.[f];
        d[`${k}.${f}`] = v == null ? "" : String(v);
      }
    }
    return d;
  });

  function set(k: string, f: Field, v: string) {
    setDraft((prev) => ({ ...prev, [`${k}.${f}`]: v }));
  }

  function onSave() {
    setMsg(null);
    const cells: Array<{
      sourcewarehouse: WH; rgtransporttype: TT; rgproductstype: PT;
      kg1: number | null; kg2: number | null; kg3: number | null;
      cbm1: number | null; cbm2: number | null; cbm3: number | null;
    }> = [];
    for (const wh of WHS) for (const tt of TTS) for (const pt of PTS) {
      const k = cellKey(wh, tt, pt);
      cells.push({
        sourcewarehouse: wh,
        rgtransporttype: tt,
        rgproductstype: pt,
        kg1: toNum(draft[`${k}.kg1`] ?? ""), kg2: toNum(draft[`${k}.kg2`] ?? ""), kg3: toNum(draft[`${k}.kg3`] ?? ""),
        cbm1: toNum(draft[`${k}.cbm1`] ?? ""), cbm2: toNum(draft[`${k}.cbm2`] ?? ""), cbm3: toNum(draft[`${k}.cbm3`] ?? ""),
      });
    }
    if (!window.confirm("บันทึกเรท General ทั้งตาราง ? (เขียนเฉพาะช่องที่เปลี่ยน · มีผลกับการคำนวณราคาลูกค้าทั่วไปทันที)")) return;
    startTransition(async () => {
      const res = await adminUpdateGeneralRateCells({ coid, cells });
      if (!res.ok) { setMsg({ kind: "err", text: res.error ?? "บันทึกไม่สำเร็จ" }); return; }
      const d = res.data;
      setMsg({ kind: "ok", text: `บันทึกสำเร็จ — KG ${d?.kg_writes ?? 0} ช่อง · CBM ${d?.cbm_writes ?? 0} ช่อง` });
      router.refresh();
    });
  }

  const inputCls = "w-16 rounded border border-border bg-white dark:bg-surface px-1.5 py-1 text-right text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/50 disabled:opacity-60";

  return (
    <div className="space-y-5">
      {WHS.map((wh) => TTS.map((tt) => (
        <div key={`${wh}-${tt}`} className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-surface-alt/40">
            <h3 className="font-bold text-sm">{TT_LABEL[tt]} · โกดัง{WH_LABEL[wh]}</h3>
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs min-w-max">
              <thead className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-border">
                <tr>
                  <th className="px-3 py-2">ประเภทสินค้า</th>
                  <th className="px-2 py-2 text-right">KG t1</th>
                  <th className="px-2 py-2 text-right">KG t2</th>
                  <th className="px-2 py-2 text-right">KG t3</th>
                  <th className="px-2 py-2 text-right border-l border-border">CBM t1</th>
                  <th className="px-2 py-2 text-right">CBM t2</th>
                  <th className="px-2 py-2 text-right">CBM t3</th>
                </tr>
              </thead>
              <tbody>
                {PTS.map((pt) => {
                  const k = cellKey(wh, tt, pt);
                  return (
                    <tr key={pt} className="border-b border-border/40">
                      <td className="px-3 py-1.5 font-medium">{PT_LABEL[pt]}</td>
                      {(["kg1", "kg2", "kg3"] as Field[]).map((f) => (
                        <td key={f} className="px-2 py-1.5 text-right">
                          <input type="number" step="0.01" min="0" disabled={pending}
                            value={draft[`${k}.${f}`] ?? ""} onChange={(e) => set(k, f, e.target.value)} className={inputCls} />
                        </td>
                      ))}
                      {(["cbm1", "cbm2", "cbm3"] as Field[]).map((f, i) => (
                        <td key={f} className={`px-2 py-1.5 text-right ${i === 0 ? "border-l border-border" : ""}`}>
                          <input type="number" step="0.01" min="0" disabled={pending}
                            value={draft[`${k}.${f}`] ?? ""} onChange={(e) => set(k, f, e.target.value)} className={inputCls} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )))}

      {msg && (
        <div className={`rounded-md border px-3 py-2 text-sm ${msg.kind === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      <div className="sticky bottom-4 flex justify-end">
        <button type="button" onClick={onSave} disabled={pending}
          className="rounded-lg bg-primary-600 text-white px-6 py-2.5 text-sm font-semibold shadow-lg hover:bg-primary-700 disabled:opacity-50">
          {pending ? "กำลังบันทึก..." : "💾 บันทึกเรท General ทั้งหมด"}
        </button>
      </div>
    </div>
  );
}
