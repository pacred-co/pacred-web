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
import { useTranslations } from "next-intl";
import { Settings, Save, AlertTriangle, X, BadgeCheck, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminSaveCustomerRate } from "@/actions/admin/customer-rate";
import { adminSetUserComparison, adminRemoveUserComparison } from "@/actions/admin/users-pricing";
import { adminUpdateSellFloorCbm } from "@/actions/admin/sell-floor";
import {
  COST_FLOOR,
  DEFAULT_START,
  PRODUCTS,
  TRANSPORTS,
  WAREHOUSES,
  type CustomerRateMatrix,
  type RateMatrix,
} from "@/lib/admin/customer-rate-tables";
import type { ProductId, TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";
import type { SellFloorCbmConfig } from "@/lib/admin/sell-floor-config";
import { QuoteTab } from "./quote-tab";

type Measure = "kg" | "cbm";

// Bounds for an ultra floor edit — mirror lib/admin/sell-floor-config.ts (kept
// as literals here because that module is server-only · cannot import into a
// client component).
const FLOOR_MIN = 1000;
const FLOOR_MAX = 99999;

/**
 * Project the resolved flat CBM floor (sellFloorCbm prop) + the constant KG
 * floor into the full `COST_FLOOR`-shaped matrix the grid/InfoTab/belowFloor
 * code reads. Only the CBM source swaps (config || constant); KG stays on the
 * constant. Mirrors buildResolvedFloor() in the server resolver.
 */
function buildFloorMatrix(cbm: SellFloorCbmConfig): Record<WarehouseId, RateMatrix> {
  const flat = (v: number): Record<ProductId, number | null> => ({ "1": v, "2": v, "3": v, "4": v });
  const forWh = (wh: WarehouseId): RateMatrix => ({
    kg: COST_FLOOR[wh].kg,
    cbm: { "1": flat(cbm[wh]["1"]), "2": flat(cbm[wh]["2"]) },
  });
  return { "1": forWh("1"), "2": forWh("2") };
}

function vKey(wh: WarehouseId, m: Measure, t: TransportId, p: ProductId) {
  return `${wh}-${m}-${t}-${p}`;
}

export function CustomerRateEditor({
  userid,
  customerName,
  matrix,
  comparisonEnabled = false,
  comparisonValue = 0,
  sellFloorCbm,
  canEditSellFloor = false,
}: {
  userid: string;
  customerName: string;
  matrix: CustomerRateMatrix;
  /** tb_users.userComparison==1 — ค่าเทียบ (CPS) is currently ON. */
  comparisonEnabled?: boolean;
  /** tb_users.userComparisonValue — the kg-per-CBM density threshold. */
  comparisonValue?: number;
  /** Resolved CBM sell floor (business_config override || COST_FLOOR constant). */
  sellFloorCbm: SellFloorCbmConfig;
  /** True = viewer is ultra (Ultra Admin Z) → can edit the floor inline. */
  canEditSellFloor?: boolean;
}) {
  const router = useRouter();
  // Resolved floor matrix — CBM from the prop (config || constant), KG from the
  // constant. ALL floor reads (grid "ขั้นต่ำ" labels · belowFloor block · InfoTab
  // table) go through this, NOT the raw COST_FLOOR constant.
  const floorMatrix = useMemo(() => buildFloorMatrix(sellFloorCbm), [sellFloorCbm]);
  const tCmp = useTranslations("customerRateComparison");
  const [pending, startTransition] = useTransition();
  // "cmp" = the ค่าเทียบ (CPS) tab — set the kg-over-คิว threshold in the SAME
  // flow as the cbm/kg sell rate (owner "การดึงเรทราคามาสรุป" · set together).
  const [tab, setTab] = useState<WarehouseId | "info" | "quote" | "cmp">("1");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmWh, setConfirmWh] = useState<WarehouseId | null>(null);
  // 2026-06-12 (owner: "เป็น pop up ทั้งก้อนเลย ไม่ต้องมีแถบล่าง") — the editor is
  // now a MODAL (legacy #rate-settings), opened from the gear in the profile
  // header. No inline bottom panel. `open` controls the modal.
  const [open, setOpen] = useState(false);

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

  // NEW below-floor cells (changed from the loaded value AND below the per-
  // warehouse ราคาขั้นต่ำ). Grandfathers untouched legacy below-floor data so an
  // unrelated edit isn't blocked — mirrors the server (ภูม 2026-06-19 hard floor).
  function belowFloor(wh: WarehouseId) {
    const out: string[] = [];
    const seedNum = (m: Measure, t: TransportId, p: ProductId) =>
      parseFloat((seeded.get(vKey(wh, m, t, p)) ?? "").replace(/,/g, ""));
    for (const c of collectCells(wh)) {
      const kgF = floorMatrix[wh].kg[c.t][c.p];
      const cbmF = floorMatrix[wh].cbm[c.t][c.p];
      const tS = TRANSPORTS.find((x) => x.id === c.t)?.short;
      const pL = PRODUCTS.find((x) => x.id === c.p)?.label;
      const kgSeed = seedNum("kg", c.t, c.p);
      const cbmSeed = seedNum("cbm", c.t, c.p);
      if (Number.isFinite(c.rkg) && c.rkg > 0 && kgF != null && c.rkg < kgF && c.rkg !== kgSeed) out.push(`KG ${tS}/${pL} (ขั้นต่ำ ฿${kgF})`);
      if (Number.isFinite(c.rcbm) && c.rcbm > 0 && cbmF != null && c.rcbm < cbmF && c.rcbm !== cbmSeed) out.push(`CBM ${tS}/${pL} (ขั้นต่ำ ฿${cbmF})`);
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
    // HARD floor (ภูม 2026-06-19 "ห้ามขายต่ำกว่าราคาขั้นต่ำ แม้ VIP") — block a
    // newly-set below-floor rate client-side too (the server also rejects it).
    const newBelow = belowFloor(wh);
    if (newBelow.length > 0) {
      setError(`ห้ามตั้งเรทขายต่ำกว่าราคาขั้นต่ำ: ${newBelow.join(" · ")} — ปรับขึ้นก่อนบันทึก`);
      return;
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
    <>
      {/* Trigger — the legacy ⚙️ "ตั้งค่าเรทขนส่ง" gear in the profile header.
          Opens the rate editor as a Pacred-themed MODAL (no inline panel). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-alt"
      >
        <Settings className="w-3.5 h-3.5" /> ตั้งค่าเรทขนส่ง
        {matrix.isSvip ? (
          <span className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-primary-600 text-white px-1.5 py-0.5 text-[11px] font-semibold">
            <BadgeCheck className="w-2.5 h-2.5" /> SVIP
          </span>
        ) : null}
      </button>

      {open && (
        // Modal overlay — click backdrop to close; the card stops propagation.
        <div
          // z-[80] sits ABOVE the admin chrome — the sticky top bar is z-[60]
          // and the sidebar logo z-[70]; at z-50 they covered the modal header.
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="my-8 w-full max-w-3xl overflow-hidden rounded-2xl bg-white dark:bg-surface shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header (legacy "แก้ไขเรทราคาสำหรับ <รหัส> กลุ่ม : …" + ปิด) */}
            <div className="flex items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-rose-50/70 via-white to-white dark:from-surface-alt/40 px-5 py-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Settings className="w-4 h-4 text-primary-600 shrink-0" />
                <span className="text-sm font-semibold">ตั้งค่าเรทขนส่ง (เรทขายต่อลูกค้า)</span>
                <span className="text-[11px] text-muted font-mono">{userid}</span>
                {matrix.isSvip ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-600 text-white px-2 py-0.5 text-[11px] font-semibold">
                    <BadgeCheck className="w-3 h-3" /> SVIP · มีเรทเฉพาะตัว
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-alt text-muted px-2 py-0.5 text-[11px]">
                    ใช้เรทกลุ่ม / default
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground"
                aria-label="ปิด"
              >
                <X className="size-5" />
              </button>
            </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface-alt/30 text-sm">
        {/* ใบเสนอราคา — ปักไว้เป็นแท็บแรก ก่อนโกดังกวางโจว (owner 2026-06-22) */}
        <button
          type="button"
          onClick={() => setTab("quote")}
          className={`px-4 py-2.5 font-medium transition-colors border-b-2 -mb-px ${
            tab === "quote"
              ? "border-primary-600 text-primary-700 bg-white dark:bg-surface"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          ใบเสนอราคา
        </button>
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
        {/* ค่าเทียบ (CPS) — owner "การดึงเรทราคามาสรุป": set the kg-over-คิว
            threshold in the SAME flow as the cbm/kg sell rate. */}
        <button
          type="button"
          onClick={() => setTab("cmp")}
          className={`inline-flex items-center gap-1 px-4 py-2.5 font-medium transition-colors border-b-2 -mb-px ${
            tab === "cmp"
              ? "border-primary-600 text-primary-700 bg-white dark:bg-surface"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <Scale className="w-3.5 h-3.5" /> {tCmp("tabLabel")}
          {comparisonEnabled ? <span className="ml-0.5 text-primary-500">●</span> : null}
        </button>
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

      <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
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
              <RateGrid wh={wh} values={values} setVal={setVal} pending={pending} floorMatrix={floorMatrix} />
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

        {/* ค่าเทียบ (CPS) — set/clear in the same modal as the sell rate */}
        {tab === "cmp" && (
          <ComparisonTab
            userid={userid}
            enabled={comparisonEnabled}
            value={comparisonValue}
            onDone={(msg) => {
              setError(null);
              setSuccess(msg);
              router.refresh();
              setTimeout(() => setSuccess(null), 6000);
            }}
            onError={(msg) => setError(msg)}
          />
        )}

        {/* ใบเสนอราคา */}
        {tab === "quote" && <QuoteTab customerName={customerName} userid={userid} comparisonValue={comparisonValue} />}

        {/* Info + cost floor (ultra can edit the floor inline here) */}
        {tab === "info" && (
          <InfoTab
            sellFloorCbm={sellFloorCbm}
            canEdit={canEditSellFloor}
            onSaved={(msg) => {
              setError(null);
              setSuccess(msg);
              router.refresh();
              setTimeout(() => setSuccess(null), 6000);
            }}
            onError={(msg) => setError(msg)}
          />
        )}
      </div>
          </div>

          {/* Confirm dialog (nested · higher z than the rate modal) */}
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
      )}
    </>
  );
}

// ── rate grid for one warehouse ───────────────────────────────────────────
function RateGrid({
  wh, values, setVal, pending, floorMatrix,
}: {
  wh: WarehouseId;
  values: Map<string, string>;
  setVal: (k: string, v: string) => void;
  pending: boolean;
  /** Resolved floor (config || constant) — drives the "ขั้นต่ำ" labels + red. */
  floorMatrix: Record<WarehouseId, RateMatrix>;
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
                  const floor = floorMatrix[wh][meas][t][p.id];
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
                      <span className="block text-[11px] text-muted mt-0.5">ขั้นต่ำ {floor}</span>
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

// ── ค่าเทียบ (CPS) tab ─────────────────────────────────────────────────────
// Set / clear the kg-per-CBM density threshold (1 คิว = 250 kg) in the SAME
// modal as the cbm + kg sell rate (owner "การดึงเรทราคามาสรุป" — set together).
// REUSES the existing money writers adminSetUserComparison / adminRemoveUser-
// Comparison (NO new write path · they update tb_users.userComparison/Value).
// confirm-before-mutate via useConfirmDialogs (§0f).
function ComparisonTab({
  userid,
  enabled,
  value,
  onDone,
  onError,
}: {
  userid: string;
  enabled: boolean;
  value: number;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations("customerRateComparison");
  const { confirm, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(value > 0 ? String(value) : "150");

  function save() {
    const v = Number(draft.replace(/,/g, "").trim());
    if (!Number.isFinite(v) || v < 0) {
      onError(t("invalidValue"));
      return;
    }
    start(async () => {
      if (!(await confirm(t("confirmSet", { value: v.toLocaleString() })))) return;
      const res = await adminSetUserComparison({ userid, value: v });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onDone(t("savedSet"));
    });
  }

  function remove() {
    start(async () => {
      if (!(await confirm(t("confirmRemove")))) return;
      const res = await adminRemoveUserComparison({ userid });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onDone(t("savedRemove"));
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-semibold text-foreground mb-1">{t("heading")}</h3>
        <p className="text-[12px] leading-relaxed text-muted">{t("intro")}</p>
      </div>

      <div
        className={`rounded-xl border px-4 py-3 ${
          enabled
            ? "border-primary-200 bg-primary-50/50 dark:bg-surface-alt/40"
            : "border-border bg-surface-alt/30"
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] text-muted">{enabled ? t("currentOn") : t("currentOff")}</p>
            {enabled && (
              <p className="text-xl font-bold font-mono tabular-nums text-primary-600">
                {value.toLocaleString()}
                <span className="ml-1 text-[11px] font-normal text-muted">({t("valueLabel")})</span>
              </p>
            )}
          </div>
          {enabled && (
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 text-red-600 px-2.5 py-1 text-xs hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" /> {t("removeBtn")}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-[12px] font-medium text-foreground">{t("inputLabel")}</label>
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="150"
          className="w-40 rounded-md border border-border px-3 py-1.5 text-sm font-mono text-right focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
        />
        <p className="text-[11px] text-muted">{t("hint")}</p>
        <div className="flex justify-end pt-1">
          <Button type="button" size="sm" disabled={pending} onClick={save}>
            <Save className="size-4" /> {pending ? t("saving") : enabled ? t("editBtn") : t("setBtn")}
          </Button>
        </div>
      </div>
      {dialogs}
    </div>
  );
}

// ── ใบเสนอราคา tab → extracted to ./quote-tab.tsx (QuoteTab) ───────────────

// ── info + cost-floor tab (legacy tab 3) ──────────────────────────────────
// Shows the system explainer + the CBM ราคาขายขั้นต่ำ table. The floor is
// EDITABLE inline (no new page) by `ultra` (Ultra Admin Z) only — 4 number
// inputs (โกดัง × รถ/เรือ) + a confirm-before-save (§0f) calling
// adminUpdateSellFloorCbm. Non-ultra sees the same numbers read-only.
function InfoTab({
  sellFloorCbm,
  canEdit,
  onSaved,
  onError,
}: {
  sellFloorCbm: SellFloorCbmConfig;
  canEdit: boolean;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const { confirm, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();
  // Editable drafts (string per cell) — seeded from the resolved floor.
  const fkey = (wh: WarehouseId, t: TransportId) => `${wh}-${t}`;
  const [draft, setDraft] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const wh of ["1", "2"] as WarehouseId[]) {
      for (const t of ["1", "2"] as TransportId[]) {
        m.set(fkey(wh, t), String(sellFloorCbm[wh][t]));
      }
    }
    return m;
  });
  const setCell = (wh: WarehouseId, t: TransportId, v: string) =>
    setDraft((prev) => new Map(prev).set(fkey(wh, t), v));
  const readCell = (wh: WarehouseId, t: TransportId) => draft.get(fkey(wh, t)) ?? "";

  function parsedFloor(): { ok: true; floor: SellFloorCbmConfig } | { ok: false; bad: string } {
    const out = { "1": { "1": 0, "2": 0 }, "2": { "1": 0, "2": 0 } } as SellFloorCbmConfig;
    for (const wh of ["1", "2"] as WarehouseId[]) {
      for (const t of ["1", "2"] as TransportId[]) {
        const n = parseFloat(readCell(wh, t).replace(/,/g, "").trim());
        const whShort = WAREHOUSES.find((w) => w.id === wh)?.short;
        const tShort = TRANSPORTS.find((x) => x.id === t)?.short;
        if (!Number.isFinite(n) || n < FLOOR_MIN || n > FLOOR_MAX) {
          return { ok: false, bad: `${whShort}/${tShort} (ต้อง ${FLOOR_MIN.toLocaleString()}–${FLOOR_MAX.toLocaleString()})` };
        }
        out[wh][t] = n;
      }
    }
    return { ok: true, floor: out };
  }

  function save() {
    const p = parsedFloor();
    if (!p.ok) {
      onError(`ค่าราคาขั้นต่ำไม่ถูกต้อง: ${p.bad}`);
      return;
    }
    start(async () => {
      const ok = await confirm(
        `ยืนยันแก้ราคาขายขั้นต่ำ (CBM) — ` +
          `กวางโจว รถ ฿${p.floor["1"]["1"].toLocaleString()} · เรือ ฿${p.floor["1"]["2"].toLocaleString()} · ` +
          `อี้อู รถ ฿${p.floor["2"]["1"].toLocaleString()} · เรือ ฿${p.floor["2"]["2"].toLocaleString()}? ` +
          `มีผลกับการเซฟเรททุกลูกค้าทันที`,
      );
      if (!ok) return;
      const res = await adminUpdateSellFloorCbm({ floor: p.floor });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onSaved("บันทึกราคาขายขั้นต่ำ (CBM) แล้ว — มีผลกับการเซฟเรททันที");
    });
  }

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
          <li><strong>ห้ามตั้งเรทขายต่ำกว่าราคาขั้นต่ำ</strong> — ระบบจะกดบันทึกไม่ได้ (จะ VIP แค่ไหนก็ห้ามต่ำกว่านี้). แก้ราคาขั้นต่ำเองได้เฉพาะ <strong>Ultra Admin Z</strong></li>
        </ol>
      </div>
      <div>
        <h3 className="font-semibold text-foreground mb-1.5 flex items-center gap-2 flex-wrap">
          <span>ราคาขายขั้นต่ำ — CBM (฿/คิว · ห้ามขายต่ำกว่านี้)</span>
          {canEdit ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-600 text-white px-2 py-0.5 text-[11px] font-semibold">
              <BadgeCheck className="w-3 h-3" /> Ultra · แก้ได้
            </span>
          ) : null}
        </h3>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm min-w-[360px]">
            <thead className="bg-surface-alt/60 text-[11px] uppercase text-muted">
              <tr>
                <th className="px-3 py-2 text-left">โกดัง</th>
                <th className="px-3 py-2 text-right">CBM · รถ</th>
                <th className="px-3 py-2 text-right">CBM · เรือ</th>
              </tr>
            </thead>
            <tbody>
              {WAREHOUSES.map((w) => (
                <tr key={w.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{w.short}</td>
                  {(["1", "2"] as TransportId[]).map((t) => (
                    <td key={t} className="px-3 py-2 text-right">
                      {canEdit ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={readCell(w.id, t)}
                          disabled={pending}
                          onChange={(e) => setCell(w.id, t, e.target.value)}
                          className="w-24 rounded-md border border-border px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
                        />
                      ) : (
                        <span className="font-mono">{sellFloorCbm[w.id][t].toLocaleString()}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted mt-1.5">
          * ราคาขั้นต่ำ CBM เท่ากันทุกประเภทสินค้า (ทั่วไป/มอก./อย./พิเศษ) · ราคาขั้นต่ำ KG ใช้เรทเดิม · 0 = ไม่คิดตามหน่วยนั้น
        </p>
        {canEdit ? (
          <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
            <p className="text-[11px] text-amber-700">
              ⚠ การแก้ราคาขั้นต่ำมีผลกับการเซฟเรทของ <strong>ทุกลูกค้า</strong> ทันที — เฉพาะ Ultra Admin Z
            </p>
            <Button type="button" size="sm" disabled={pending} onClick={save}>
              <Save className="size-4" /> {pending ? "กำลังบันทึก..." : "บันทึกราคาขั้นต่ำ"}
            </Button>
          </div>
        ) : null}
      </div>
      {dialogs}
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4">
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
