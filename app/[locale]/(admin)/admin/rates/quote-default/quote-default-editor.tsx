"use client";

/**
 * "ตั้งเรทใบเสนอราคา" — system-default rate editor สไตล์ใบเสนอราคา (owner ปอน 2026-07-17).
 *
 * หน้าตาเหมือนตาราง เทียบราคา ในใบเสนอราคา (CompareEditor · โกดัง × ประเภทสินค้า ×
 * ทางรถ/ทางเรือ) แต่แก้แล้ว **เซ็ต default ทั้งระบบ** — เขียนเรททั่วไป `tb_rate_g_*`
 * (coid 'PR') ผ่าน adminUpdateGeneralRateCells → กระทบทั้งใบเสนอราคา (quote-tab อ่าน
 * ชั้น general นี้) และเรทคิดเงินจริง (resolve-rate.ts อ่าน tb_rate_g_*). **บันทึกทีละแถว**.
 *
 * mapping (โมเดลแบน per กลุ่ม): 1 แถว = โกดัง × กลุ่ม → เขียนทั้ง 2 product ในกลุ่ม
 * (ทั่วไป·มอก.=1,2 · อย.·พิเศษ=3,4) × ทางรถ(1)+ทางเรือ(2) = 4 cells · แต่ละ cell เขียน
 * tier แบน (rgcbm1=2=3, rgkg1=2=3 = ค่าที่กรอก · quote card โชว์ค่าเดียว). ช่องว่าง = ไม่เขียน
 * (fallback เรทโปรฯ ที่โชว์เป็น placeholder). ระยะเวลา ไม่เก็บใน DB → มาจากแพ็กเกจ (read-only).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { adminUpdateGeneralRateCells } from "@/actions/admin/rate-edits";
import { GENERAL_COID } from "@/lib/forwarder/coid";
import { CARGO_PROMO_PACKAGES, rateForVariant } from "@/lib/quote/cargo-promo-packages";
import { GROUP_PRODUCTS, type QuoteDefaultGrid, type QuoteRateGroup } from "@/lib/admin/quote-default-rates-shared";
import type { TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";

const ACCENT = "#B30000";
const TINT = "#FBEAEA";
const TINT_BD = "#EFD1D1";

const WAREHOUSES: { id: WarehouseId; label: string; whKey: "guangzhou" | "yiwu" }[] = [
  { id: "1", label: "กวางโจว", whKey: "guangzhou" },
  { id: "2", label: "อี้อู", whKey: "yiwu" },
];
const GROUPS: { key: QuoteRateGroup; label: string }[] = [
  { key: "general", label: "ทั่วไป · มอก." },
  { key: "fda", label: "อย. · พิเศษ" },
];
const MODES: { t: TransportId; mode: "truck" | "ship"; label: string }[] = [
  { t: "1", mode: "truck", label: "ทางรถ 🚛" },
  { t: "2", mode: "ship", label: "ทางเรือ 🚢" },
];
const PKG1 = CARGO_PROMO_PACKAGES[0]; // เรทโปรฯ ตัวแทน (fallback ที่โชว์เป็น placeholder)

const dkey = (wh: WarehouseId, g: QuoteRateGroup, t: TransportId, f: "cbm" | "kg") => `${wh}|${g}|${t}|${f}`;

function toNum(s: string): number | null {
  const v = s.trim();
  if (v === "") return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function QuoteDefaultEditor({ grid }: { grid: QuoteDefaultGrid }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // draft: ค่าที่กรอก (string) — seed จาก general card (null → "" โชว์ placeholder เรทโปรฯ)
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const wh of WAREHOUSES) for (const g of GROUPS) for (const m of MODES) {
      const cell = grid[wh.id][m.t][g.key];
      d[dkey(wh.id, g.key, m.t, "cbm")] = cell.cbm == null ? "" : String(cell.cbm);
      d[dkey(wh.id, g.key, m.t, "kg")] = cell.kg == null ? "" : String(cell.kg);
    }
    return d;
  });

  const set = (k: string, v: string) => setDraft((p) => ({ ...p, [k]: v }));

  async function saveRow(wh: { id: WarehouseId; label: string }, g: { key: QuoteRateGroup; label: string }) {
    setMsg(null);
    const rowKey = `${wh.id}|${g.key}`;
    const cells = GROUP_PRODUCTS[g.key].flatMap((p) =>
      MODES.map((m) => {
        const cbm = toNum(draft[dkey(wh.id, g.key, m.t, "cbm")]);
        const kg = toNum(draft[dkey(wh.id, g.key, m.t, "kg")]);
        return {
          sourcewarehouse: wh.id, rgtransporttype: m.t, rgproductstype: p,
          cbm1: cbm, cbm2: cbm, cbm3: cbm, kg1: kg, kg2: kg, kg3: kg,
        };
      }),
    );
    const ok = await confirm(
      `บันทึกเรท default "${g.label}" โกดัง${wh.label} เข้าเรททั่วไป? · ` +
      `มีผลกับ ใบเสนอราคา + การคิดเงินจริง ทันที (ลูกค้าทั่วไปทุกคนที่ยังไม่มีเรทเฉพาะตัว) · ` +
      `ตั้งเรทเดียวทุกช่วงน้ำหนัก (tier) และทั้ง ${g.label}`,
    );
    if (!ok) return;
    setSavingRow(rowKey);
    startTransition(async () => {
      const res = await adminUpdateGeneralRateCells({ coid: GENERAL_COID, cells });
      setSavingRow(null);
      if (!res.ok) { setMsg({ kind: "err", text: `${wh.label} · ${g.label}: ${res.error ?? "บันทึกไม่สำเร็จ"}` }); return; }
      const d = res.data;
      setMsg({ kind: "ok", text: `✓ บันทึก ${wh.label} · ${g.label} — เขียน ฿/กก. ${d?.kg_writes ?? 0} · ฿/คิว ${d?.cbm_writes ?? 0} ช่อง` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px] table-fixed text-[11px] sm:text-[12px]">
          <thead className="border-b text-[11px] text-slate-700" style={{ background: TINT, borderColor: TINT_BD }}>
            <tr>
              <th className="w-[92px] px-2 sm:px-3 py-1.5 text-left font-semibold">โกดัง</th>
              <th className="w-[96px] px-2 sm:px-3 py-1.5 text-left font-semibold">ประเภทสินค้า</th>
              {MODES.map((m) => (
                <th key={m.t} className="px-2 sm:px-3 py-1.5 text-left font-semibold">{m.label}</th>
              ))}
              <th className="w-[104px] px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {WAREHOUSES.flatMap((wh) =>
              GROUPS.map((g) => {
                const rowKey = `${wh.id}|${g.key}`;
                const rowSaving = pending && savingRow === rowKey;
                return (
                  <tr key={rowKey} className="border-t border-slate-100 align-top">
                    <td className="px-2 sm:px-3 py-2 font-semibold">{wh.label}</td>
                    <td className="px-2 sm:px-3 py-2 text-[11px] font-medium text-slate-600 whitespace-nowrap">{g.label}</td>
                    {MODES.map((m) => {
                      const promo = rateForVariant(PKG1, g.key === "fda" ? "fda" : "general", wh.whKey, m.mode);
                      return (
                        <td key={m.t} className="px-2 sm:px-3 py-2">
                          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight">
                            <span className="inline-flex items-center whitespace-nowrap font-mono font-bold" style={{ color: ACCENT }}>
                              ฿<input inputMode="decimal" disabled={pending} placeholder={String(promo.cbm)}
                                value={draft[dkey(wh.id, g.key, m.t, "cbm")] ?? ""}
                                onChange={(e) => set(dkey(wh.id, g.key, m.t, "cbm"), e.target.value)}
                                className="w-12 rounded-sm border border-slate-200 bg-white px-1 text-center outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300 disabled:opacity-60" />
                              <span className="text-[10px] font-normal text-slate-400">/คิว</span>
                            </span>
                            <span className="inline-flex items-center whitespace-nowrap font-mono text-slate-600">
                              ฿<input inputMode="decimal" disabled={pending} placeholder={String(promo.kg)}
                                value={draft[dkey(wh.id, g.key, m.t, "kg")] ?? ""}
                                onChange={(e) => set(dkey(wh.id, g.key, m.t, "kg"), e.target.value)}
                                className="w-10 rounded-sm border border-slate-200 bg-white px-1 text-center outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300 disabled:opacity-60" />
                              <span className="text-[10px] text-slate-400">/กก.</span>
                            </span>
                            <span className="text-[10px] text-slate-400">{promo.days}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right">
                      <button type="button" disabled={pending} onClick={() => saveRow(wh, g)}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                        <Save className="h-3 w-3" /> {rowSaving ? "กำลังบันทึก…" : "บันทึกแถวนี้"}
                      </button>
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>

      {msg && (
        <div className={`rounded-md border px-3 py-2 text-sm ${msg.kind === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        ตัวเลขจางในช่อง = เรทโปรฯ ปัจจุบัน (fallback เมื่อยังไม่ตั้ง) · กรอกทับแล้วกด “บันทึกแถวนี้”
        เพื่อเซ็ตเป็น default ทั้งระบบ · ปล่อยว่าง = ไม่เขียน (คงเรทโปรฯ) · แต่ละแถวตั้งเรทเดียวทุกช่วงน้ำหนัก
        และครอบทั้ง 2 รหัสในกลุ่ม (ทั่วไป·มอก. = 1,2 · อย.·พิเศษ = 3,4)
      </p>
    </div>
  );
}
