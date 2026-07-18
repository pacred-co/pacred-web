"use client";

/**
 * "แพ็กเกจ (ใบเสนอราคา)" — data-driven quote-package editor (owner ปอน 2026-07-18).
 *
 * แก้/เพิ่ม/ลบแพ็กเกจได้ไม่จำกัด · แต่ละแพ็ก = ชื่อ + เงื่อนไข + ระยะเวลา (รถ/เรือ) + กริดเรท
 * (โกดัง × กลุ่มสินค้า × ทางรถ/ทางเรือ) สไตล์เดียวกับตาราง "ทั่วไป" · กดบันทึก = upsert
 * business_config `pricing.quote_packages` ทั้งชุด ผ่าน adminSaveQuotePackages.
 *
 * แพ็ก = **พรีเซ็ต display ในใบเสนอราคา** (เลือกแพ็ก → โชว์เรทแพ็ก) · ไม่กระทบบิลจริง
 * (บิล = SVIP ?? tb_rate_g_* ทั่วไป). ช่องเรท = 0/ว่าง → ตกไป "ทั่วไป" ในใบเสนอราคา.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, Trash2, X } from "lucide-react";
import { confirm } from "@/components/ui/confirm";
import { adminSaveQuotePackages } from "@/actions/admin/quote-packages";
import { CARGO_PROMO_PACKAGES, rateForVariant } from "@/lib/quote/cargo-promo-packages";
import { newBlankPackage, type QuotePackage } from "@/lib/quote/quote-packages-shared";
import type { QuoteRateGroup } from "@/lib/admin/quote-default-rates-shared";
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
const PKG1 = CARGO_PROMO_PACKAGES[0]; // เรทโปรฯ ตัวแทน (placeholder guidance)

const n2s = (n: number) => (n && n > 0 ? String(n) : "");
const s2n = (s: string) => { const v = Number(s.replace(/,/g, "").trim()); return Number.isFinite(v) && v >= 0 ? v : 0; };

// ── editable string-rate model (พิมพ์ลื่น · empty = 0 = ตกไปทั่วไป) ─────────────
type EditRate = { cbm: string; kg: string };
type EditGrid = Record<WarehouseId, Record<TransportId, Record<QuoteRateGroup, EditRate>>>;
type EditPkg = { id: string; name: string; conditions: string[]; days: { truck: string; ship: string }; rates: EditGrid };

function toEdit(p: QuotePackage): EditPkg {
  const cell = (c: { cbm: number; kg: number }): EditRate => ({ cbm: n2s(c.cbm), kg: n2s(c.kg) });
  const wh = (id: WarehouseId) => ({
    "1": { general: cell(p.rates[id]["1"].general), fda: cell(p.rates[id]["1"].fda) },
    "2": { general: cell(p.rates[id]["2"].general), fda: cell(p.rates[id]["2"].fda) },
  });
  return { id: p.id, name: p.name, conditions: [...p.conditions], days: { ...p.days }, rates: { "1": wh("1"), "2": wh("2") } };
}

function fromEdit(e: EditPkg): QuotePackage {
  const cell = (c: EditRate) => ({ cbm: s2n(c.cbm), kg: s2n(c.kg) });
  const wh = (id: WarehouseId) => ({
    "1": { general: cell(e.rates[id]["1"].general), fda: cell(e.rates[id]["1"].fda) },
    "2": { general: cell(e.rates[id]["2"].general), fda: cell(e.rates[id]["2"].fda) },
  });
  return {
    id: e.id,
    name: e.name.trim() || "แพ็กไม่มีชื่อ",
    conditions: e.conditions.map((c) => c.trim()).filter(Boolean),
    days: { truck: e.days.truck.trim(), ship: e.days.ship.trim() },
    rates: { "1": wh("1"), "2": wh("2") },
  };
}

export function QuotePackagesEditor({ packages }: { packages: QuotePackage[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pkgs, setPkgs] = useState<EditPkg[]>(() => packages.map(toEdit));
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const cur = pkgs[Math.min(sel, pkgs.length - 1)];
  const update = (fn: (p: EditPkg) => EditPkg) => setPkgs((ps) => ps.map((p, i) => (i === sel ? fn(p) : p)));

  const setRate = (wh: WarehouseId, t: TransportId, g: QuoteRateGroup, f: "cbm" | "kg", v: string) =>
    update((p) => ({
      ...p,
      rates: { ...p.rates, [wh]: { ...p.rates[wh], [t]: { ...p.rates[wh][t], [g]: { ...p.rates[wh][t][g], [f]: v } } } },
    }));

  const addPkg = () => {
    setMsg(null);
    const id = `pkg-${crypto.randomUUID().slice(0, 8)}`;
    setPkgs((ps) => [...ps, toEdit(newBlankPackage(id, `แพ็กใหม่ ${ps.length + 1}`))]);
    setSel(pkgs.length);
  };

  const delPkg = async () => {
    setMsg(null);
    if (pkgs.length <= 1) { setMsg({ kind: "err", text: "ต้องมีอย่างน้อย 1 แพ็ก" }); return; }
    const ok = await confirm(`ลบแพ็ก "${cur.name || "ไม่มีชื่อ"}"? (มีผลหลังกด “บันทึกแพ็กทั้งหมด”)`);
    if (!ok) return;
    setPkgs((ps) => ps.filter((_, i) => i !== sel));
    setSel((s) => Math.max(0, s - 1));
  };

  const addCond = () => update((p) => ({ ...p, conditions: [...p.conditions, ""] }));
  const setCond = (i: number, v: string) => update((p) => ({ ...p, conditions: p.conditions.map((c, j) => (j === i ? v : c)) }));
  const delCond = (i: number) => update((p) => ({ ...p, conditions: p.conditions.filter((_, j) => j !== i) }));

  const save = async () => {
    setMsg(null);
    const ok = await confirm(
      `บันทึกแพ็กเกจทั้งหมด ${pkgs.length} แพ็ก? · มีผลกับ dropdown + เรทที่โชว์ในใบเสนอราคา (พรีเซ็ต) ทันที · ` +
      `ไม่กระทบการคิดเงินจริง (บิลใช้เรททั่วไป + เรทเฉพาะตัวลูกค้าเหมือนเดิม)`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await adminSaveQuotePackages({ packages: pkgs.map(fromEdit) });
      if (!res.ok) { setMsg({ kind: "err", text: res.error ?? "บันทึกไม่สำเร็จ" }); return; }
      setMsg({ kind: "ok", text: `✓ บันทึกแล้ว ${res.data?.count ?? pkgs.length} แพ็ก` });
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {/* แท็บแพ็ก + เพิ่ม */}
      <div className="flex flex-wrap items-center gap-1.5">
        {pkgs.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setSel(i)}
            className={`max-w-[220px] truncate rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
              i === sel ? "border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-900/20"
                : "border-border text-foreground hover:bg-surface-alt"
            }`}
            title={p.name}>
            {i + 1}. {p.name || "ไม่มีชื่อ"}
          </button>
        ))}
        <button type="button" onClick={addPkg} disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-primary-300 px-2.5 py-1.5 text-[12px] font-semibold text-primary-600 hover:bg-primary-50 disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> เพิ่มแพ็ก
        </button>
      </div>

      {cur && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {/* ชื่อ + ลบแพ็ก */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[240px] flex-1 space-y-1">
              <span className="block text-[12px] font-medium text-foreground">ชื่อแพ็ก</span>
              <input value={cur.name} disabled={pending} onChange={(e) => update((p) => ({ ...p, name: e.target.value }))}
                placeholder="เช่น เปิดใบกำกับ / ใบขน"
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:bg-surface" />
            </label>
            <button type="button" onClick={delPkg} disabled={pending || pkgs.length <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-[12px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" /> ลบแพ็ก
            </button>
          </div>

          {/* ระยะเวลา */}
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <label key={m.t} className="space-y-1">
                <span className="block text-[12px] font-medium text-foreground">ระยะเวลา {m.label}</span>
                <input value={cur.days[m.mode]} disabled={pending}
                  onChange={(e) => update((p) => ({ ...p, days: { ...p.days, [m.mode]: e.target.value } }))}
                  placeholder="เช่น 5–7 วัน"
                  className="w-36 rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:bg-surface" />
              </label>
            ))}
          </div>

          {/* กริดเรท */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] table-fixed text-[11px] sm:text-[12px]">
              <thead className="border-b text-[11px] text-slate-700" style={{ background: TINT, borderColor: TINT_BD }}>
                <tr>
                  <th className="w-[92px] px-2 sm:px-3 py-1.5 text-left font-semibold">โกดัง</th>
                  <th className="w-[96px] px-2 sm:px-3 py-1.5 text-left font-semibold">ประเภทสินค้า</th>
                  {MODES.map((m) => (
                    <th key={m.t} className="px-2 sm:px-3 py-1.5 text-left font-semibold">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WAREHOUSES.flatMap((wh) =>
                  GROUPS.map((g) => (
                    <tr key={`${wh.id}|${g.key}`} className="border-t border-slate-100 align-top">
                      <td className="px-2 sm:px-3 py-2 font-semibold">{wh.label}</td>
                      <td className="px-2 sm:px-3 py-2 text-[11px] font-medium text-slate-600 whitespace-nowrap">{g.label}</td>
                      {MODES.map((m) => {
                        const promo = rateForVariant(PKG1, g.key === "fda" ? "fda" : "general", wh.whKey, m.mode);
                        const c = cur.rates[wh.id][m.t][g.key];
                        return (
                          <td key={m.t} className="px-2 sm:px-3 py-2">
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight">
                              <span className="inline-flex items-center whitespace-nowrap font-mono font-bold" style={{ color: ACCENT }}>
                                ฿<input inputMode="decimal" disabled={pending} placeholder={String(promo.cbm)} value={c.cbm}
                                  onChange={(e) => setRate(wh.id, m.t, g.key, "cbm", e.target.value)}
                                  className="w-12 rounded-sm border border-slate-200 bg-white px-1 text-center outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300 disabled:opacity-60" />
                                <span className="text-[10px] font-normal text-slate-400">/คิว</span>
                              </span>
                              <span className="inline-flex items-center whitespace-nowrap font-mono text-slate-600">
                                ฿<input inputMode="decimal" disabled={pending} placeholder={String(promo.kg)} value={c.kg}
                                  onChange={(e) => setRate(wh.id, m.t, g.key, "kg", e.target.value)}
                                  className="w-10 rounded-sm border border-slate-200 bg-white px-1 text-center outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300 disabled:opacity-60" />
                                <span className="text-[10px] text-slate-400">/กก.</span>
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>

          {/* เงื่อนไข */}
          <div className="space-y-1.5">
            <span className="block text-[12px] font-medium text-foreground">เงื่อนไข (โชว์ในใบเสนอราคา)</span>
            {cur.conditions.length === 0 && <p className="text-[11px] text-muted">ยังไม่มีเงื่อนไข — กด “เพิ่มเงื่อนไข”</p>}
            {cur.conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={cond} disabled={pending} onChange={(e) => setCond(i, e.target.value)}
                  placeholder="เช่น ต้องเปิดใบกำกับภาษี"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-[12px] text-foreground outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:bg-surface" />
                <button type="button" onClick={() => delCond(i)} disabled={pending}
                  className="rounded-md border border-border p-1.5 text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="ลบเงื่อนไข">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addCond} disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-foreground hover:bg-surface-alt disabled:opacity-50">
              <Plus className="h-3 w-3" /> เพิ่มเงื่อนไข
            </button>
          </div>
        </div>
      )}

      {/* บันทึกทั้งหมด */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
          <Save className="h-4 w-4" /> {pending ? "กำลังบันทึก…" : `บันทึกแพ็กทั้งหมด (${pkgs.length})`}
        </button>
        {msg && (
          <span className={`rounded-md border px-3 py-1.5 text-sm ${msg.kind === "ok" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {msg.text}
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        แพ็ก = <b>พรีเซ็ตใบเสนอราคา</b> · เลือกแพ็กในใบเสนอราคาลูกค้าแล้ว <b>เรทเปลี่ยนตามแพ็กนี้</b> ·
        ช่องเรทว่าง/0 = ตกไปใช้เรท “ทั่วไป” · <b>ไม่กระทบการคิดเงินจริง</b> (บิลใช้เรททั่วไป + เรทเฉพาะตัวลูกค้า) ·
        ตัวเลขจาง = เรทโปรฯ อ้างอิง
      </p>
    </div>
  );
}
