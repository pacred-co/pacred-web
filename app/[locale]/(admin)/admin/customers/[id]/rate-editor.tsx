"use client";

/**
 * Per-customer rate editor — embedded in the admin customer profile.
 * Faithful port of the legacy #rate-settings modal (gear icon), Pacred-
 * polished (Tailwind tabs + inline grid instead of BS4 modal). (เดฟ 2026-05-30)
 *
 * Saves the LIVE per-user rate (tb_rate_custom_kg/cbm) + history via
 * adminSaveCustomerRate — one warehouse at a time, all 8 cells, exactly
 * like legacy. Shows the cost floor + the "who can edit / becomes SVIP /
 * doesn't touch existing orders" explainer (legacy tab 3).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Settings, Save, AlertTriangle, X, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminSaveCustomerRate } from "@/actions/admin/customer-rate";
import {
  COST_FLOOR,
  DEFAULT_START,
  PRODUCTS,
  TRANSPORTS,
  WAREHOUSES,
  type CustomerRateMatrix,
} from "@/lib/admin/customer-rate-tables";
import type { ProductId, TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";

type Measure = "kg" | "cbm";

function vKey(wh: WarehouseId, m: Measure, t: TransportId, p: ProductId) {
  return `${wh}-${m}-${t}-${p}`;
}

export function CustomerRateEditor({
  userid,
  customerName,
  matrix,
}: {
  userid: string;
  customerName: string;
  matrix: CustomerRateMatrix;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<WarehouseId | "info">("1");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmWh, setConfirmWh] = useState<WarehouseId | null>(null);

  // Seed inputs: current live value, else the legacy default-start for that wh.
  const seeded = useMemo(() => {
    const m = new Map<string, string>();
    for (const wh of ["1", "2"] as const) {
      for (const meas of ["kg", "cbm"] as const) {
        for (const t of TRANSPORTS) {
          for (const p of PRODUCTS) {
            const live = matrix.byWarehouse[wh][meas][t.id][p.id];
            const fallback = DEFAULT_START[wh][meas][t.id][p.id];
            m.set(vKey(wh, meas, t.id, p.id), String(live ?? fallback ?? ""));
          }
        }
      }
    }
    return m;
  }, [matrix]);

  const [values, setValues] = useState<Map<string, string>>(() => new Map(seeded));
  function setVal(k: string, v: string) {
    setValues((prev) => {
      const n = new Map(prev);
      n.set(k, v);
      return n;
    });
  }

  // Which warehouses already have a custom (SVIP) rate set?
  const whHasCustom = (wh: WarehouseId) =>
    PRODUCTS.some((p) => TRANSPORTS.some((t) => matrix.byWarehouse[wh].cbm[t.id][p.id] != null));

  function num(raw: string): number {
    const n = parseFloat(raw.trim().replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }

  function collectCells(wh: WarehouseId) {
    return TRANSPORTS.flatMap((t) =>
      PRODUCTS.map((p) => ({
        t: t.id,
        p: p.id,
        rkg: num(values.get(vKey(wh, "kg", t.id, p.id)) ?? ""),
        rcbm: num(values.get(vKey(wh, "cbm", t.id, p.id)) ?? ""),
      })),
    );
  }

  function belowFloor(wh: WarehouseId) {
    const out: string[] = [];
    for (const c of collectCells(wh)) {
      const kgF = COST_FLOOR.kg[c.t][c.p];
      const cbmF = COST_FLOOR.cbm[c.t][c.p];
      const tS = TRANSPORTS.find((x) => x.id === c.t)?.short;
      const pL = PRODUCTS.find((x) => x.id === c.p)?.label;
      if (Number.isFinite(c.rkg) && c.rkg > 0 && kgF != null && c.rkg < kgF) out.push(`KG ${tS}/${pL}`);
      if (Number.isFinite(c.rcbm) && c.rcbm > 0 && cbmF != null && c.rcbm < cbmF) out.push(`CBM ${tS}/${pL}`);
    }
    return out;
  }

  function doSave(wh: WarehouseId) {
    setError(null);
    setSuccess(null);
    setConfirmWh(null);
    const cells = collectCells(wh);
    for (const c of cells) {
      if (!Number.isFinite(c.rkg) || c.rkg < 0 || !Number.isFinite(c.rcbm) || c.rcbm < 0) {
        setError("กรอกเรททุกช่องให้เป็นตัวเลข (0 = ไม่คิดตามหน่วยนี้)");
        return;
      }
    }
    startTransition(async () => {
      const res = await adminSaveCustomerRate({ userid, sourceWarehouse: wh, cells });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const whShort = WAREHOUSES.find((w) => w.id === wh)?.short;
      setSuccess(
        res.data?.created
          ? `สร้างเรทเฉพาะตัว (SVIP) สำหรับโกดัง${whShort} แล้ว — ${res.data.changed} ช่องเปลี่ยน`
          : `บันทึกเรทโกดัง${whShort} แล้ว — ${res.data?.changed ?? 0} ช่องเปลี่ยน`,
      );
      router.refresh();
      setTimeout(() => setSuccess(null), 6000);
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3 bg-gradient-to-r from-rose-50/70 via-white to-white dark:from-surface-alt/40">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary-600" />
          <h2 className="text-sm font-semibold">ตั้งค่าเรทขนส่ง (เรทขายต่อลูกค้า)</h2>
          {matrix.isSvip ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-600 text-white px-2 py-0.5 text-[10px] font-semibold">
              <BadgeCheck className="w-3 h-3" /> SVIP · มีเรทเฉพาะตัว
            </span>
          ) : (
            <span className="rounded-full bg-surface-alt text-muted px-2 py-0.5 text-[10px]">
              ใช้เรทกลุ่ม / default
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted font-mono hidden sm:block">{userid}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface-alt/30 text-sm">
        {WAREHOUSES.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setTab(w.id)}
            className={`px-4 py-2.5 font-medium transition-colors border-b-2 -mb-px ${
              tab === w.id
                ? "border-primary-600 text-primary-700 bg-white dark:bg-surface"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {w.label}
            {whHasCustom(w.id) ? <span className="ml-1 text-primary-500">●</span> : null}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTab("info")}
          className={`px-4 py-2.5 font-medium transition-colors border-b-2 -mb-px ${
            tab === "info"
              ? "border-primary-600 text-primary-700 bg-white dark:bg-surface"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          คำอธิบาย + ราคาขั้นต่ำ
        </button>
      </div>

      <div className="p-4 space-y-3">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            ✓ {success}
          </div>
        )}

        {/* Warehouse rate grids */}
        {(["1", "2"] as const).map((wh) =>
          tab === wh ? (
            <div key={wh} className="space-y-3">
              {!whHasCustom(wh) && (
                <p className="text-[11.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  ลูกค้ายังไม่มีเรทเฉพาะตัวสำหรับโกดังนี้ (ใช้เรทกลุ่ม/default) — กดบันทึกจะ
                  <strong> สร้างเรทเฉพาะตัว</strong> ทำให้เป็น SVIP
                </p>
              )}
              <RateGrid wh={wh} values={values} setVal={setVal} pending={pending} />
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[11px] text-muted">
                  ตัวเลขสีแดง = ต่ำกว่าราคาขั้นต่ำ · เรทนี้ใช้กับ
                  <strong> ออเดอร์ใหม่</strong>เท่านั้น (ออเดอร์เดิมไม่เปลี่ยน)
                </p>
                <Button type="button" size="sm" disabled={pending} onClick={() => setConfirmWh(wh)}>
                  <Save className="size-4" /> {pending ? "กำลังบันทึก..." : `บันทึกเรทโกดัง${WAREHOUSES.find((w) => w.id === wh)?.short}`}
                </Button>
              </div>
            </div>
          ) : null,
        )}

        {/* Info + cost floor */}
        {tab === "info" && <InfoTab />}
      </div>

      {/* Confirm dialog */}
      {confirmWh && (
        <ConfirmSave
          wh={confirmWh}
          cells={collectCells(confirmWh)}
          below={belowFloor(confirmWh)}
          customerName={customerName}
          onCancel={() => setConfirmWh(null)}
          onConfirm={() => doSave(confirmWh)}
          pending={pending}
        />
      )}
    </div>
  );
}

// ── rate grid for one warehouse ───────────────────────────────────────────
function RateGrid({
  wh, values, setVal, pending,
}: {
  wh: WarehouseId;
  values: Map<string, string>;
  setVal: (k: string, v: string) => void;
  pending: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm min-w-[560px]">
        <thead className="bg-surface-alt/60 text-[11px] uppercase text-muted">
          <tr>
            <th className="px-3 py-2 text-left">ประเภทสินค้า</th>
            <th className="px-3 py-2 text-right">KG · รถ</th>
            <th className="px-3 py-2 text-right">KG · เรือ</th>
            <th className="px-3 py-2 text-right">CBM · รถ</th>
            <th className="px-3 py-2 text-right">CBM · เรือ</th>
          </tr>
        </thead>
        <tbody>
          {PRODUCTS.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{p.label}</td>
              {(["kg", "cbm"] as const).flatMap((meas) =>
                (["1", "2"] as TransportId[]).map((t) => {
                  const k = vKey(wh, meas, t, p.id);
                  const raw = values.get(k) ?? "";
                  const floor = COST_FLOOR[meas][t][p.id];
                  const n = parseFloat(raw.replace(/,/g, ""));
                  const isBelow = Number.isFinite(n) && n > 0 && floor != null && n < floor;
                  return (
                    <td key={k} className="px-2 py-1.5 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={raw}
                        disabled={pending}
                        onChange={(e) => setVal(k, e.target.value)}
                        className={`w-20 rounded-md border px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 ${
                          isBelow
                            ? "border-red-400 text-red-600 bg-red-50 focus:ring-red-400/40"
                            : "border-border focus:ring-primary-500/40 focus:border-primary-500"
                        }`}
                      />
                      <span className="block text-[9px] text-muted mt-0.5">ขั้นต่ำ {floor}</span>
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── info + cost-floor tab (legacy tab 3) ──────────────────────────────────
function InfoTab() {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-semibold text-foreground mb-1.5">คำอธิบายระบบ</h3>
        <ol className="list-decimal pl-5 space-y-1 text-[13px] text-muted">
          <li>ใครปรับได้: Sales (Cargo) · Pricing · Sales All (Marketing) · CEO / Manager / QA / Accounting / IT</li>
          <li>
            การปรับเรทนี้ <strong>ไม่กระทบออเดอร์ฝากนำเข้าเดิม</strong> — มีผลกับออเดอร์ที่อัปเดตข้อมูลใหม่เท่านั้น
            (เพราะราคาเรียกเก็บถูกล็อกตั้งแต่ทราบขนาด+น้ำหนัก)
          </li>
          <li>ต้องกด <strong>บันทึก</strong> เรทถึงจะมีผล</li>
          <li>ลูกค้าที่ปรับเรทเฉพาะตัว จะกลายเป็น <strong>SVIP (Super VIP)</strong></li>
          <li>ราคาขั้นต่ำตั้งเองไม่ได้ — หากต้องตั้งต่ำกว่านี้ ต้องให้ผู้บริหาร (super admin) ยืนยัน</li>
        </ol>
      </div>
      <div>
        <h3 className="font-semibold text-foreground mb-1.5">
          ราคาขั้นต่ำ (เรทต้นทุน — ปรับต่ำกว่านี้ไม่ได้)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm min-w-[480px]">
            <thead className="bg-surface-alt/60 text-[11px] uppercase text-muted">
              <tr>
                <th className="px-3 py-2 text-left">ประเภทสินค้า</th>
                <th className="px-3 py-2 text-right">KG · รถ</th>
                <th className="px-3 py-2 text-right">KG · เรือ</th>
                <th className="px-3 py-2 text-right">CBM · รถ</th>
                <th className="px-3 py-2 text-right">CBM · เรือ</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTS.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{p.label}</td>
                  <td className="px-3 py-2 text-right font-mono">{COST_FLOOR.kg["1"][p.id]}</td>
                  <td className="px-3 py-2 text-right font-mono">{COST_FLOOR.kg["2"][p.id]}</td>
                  <td className="px-3 py-2 text-right font-mono">{COST_FLOOR.cbm["1"][p.id]}</td>
                  <td className="px-3 py-2 text-right font-mono">{COST_FLOOR.cbm["2"][p.id]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted mt-1.5">
          * ราคาขั้นต่ำเท่ากันทั้งสองโกดัง (กำหนดโดยทีมพัฒนา)
        </p>
      </div>
    </div>
  );
}

// ── confirm-save dialog ───────────────────────────────────────────────────
function ConfirmSave({
  wh, cells, below, customerName, onCancel, onConfirm, pending,
}: {
  wh: WarehouseId;
  cells: { t: TransportId; p: ProductId; rkg: number; rcbm: number }[];
  below: string[];
  customerName: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const whLabel = WAREHOUSES.find((w) => w.id === wh)?.label;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="rounded-2xl bg-white dark:bg-surface shadow-2xl max-w-lg w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <h3 className="font-bold text-lg">ยืนยันบันทึกเรท {whLabel}?</h3>
          <button type="button" onClick={onCancel} className="text-muted hover:text-foreground" aria-label="ปิด">
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-muted">
          ลูกค้า <span className="font-medium text-foreground">{customerName}</span> · เขียนเรทเฉพาะตัว (live)
          + เก็บประวัติ
        </p>

        {below.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>⚠ มี {below.length} ช่องต่ำกว่าราคาขั้นต่ำ:</strong> {below.join(" · ")}
            <br />ระบบจะบันทึกให้ — แต่โปรดตรวจสอบว่าตั้งใจตั้งต่ำกว่าทุนจริง
          </div>
        )}

        <div className="rounded-lg border border-border max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-alt/60 sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left">สินค้า · ขนส่ง</th>
                <th className="px-2 py-1.5 text-right">KG</th>
                <th className="px-2 py-1.5 text-right">CBM</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((c) => (
                <tr key={`${c.t}|${c.p}`} className="border-t border-border">
                  <td className="px-2 py-1">
                    {PRODUCTS.find((x) => x.id === c.p)?.label} · {TRANSPORTS.find((x) => x.id === c.t)?.short}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">{Number.isFinite(c.rkg) ? c.rkg : "—"}</td>
                  <td className="px-2 py-1 text-right font-mono">{Number.isFinite(c.rcbm) ? c.rcbm : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            กลับไปแก้
          </Button>
          <Button type="button" size="sm" onClick={onConfirm} disabled={pending}>
            <Save className="size-4" /> ยืนยันบันทึก
          </Button>
        </div>
      </div>
    </div>
  );
}
