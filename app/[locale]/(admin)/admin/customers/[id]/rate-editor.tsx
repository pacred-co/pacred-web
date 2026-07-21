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

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings, Save, AlertTriangle, X, BadgeCheck, Scale, Trash2, History, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { adminSetUserComparison, adminRemoveUserComparison } from "@/actions/admin/users-pricing";
import { adminUpdateSellFloorCbm, adminUpdateSellFloorKg } from "@/actions/admin/sell-floor";
import { verifyRateSettingsPin } from "@/actions/admin/rate-settings-pin";
import { TRANSPORTS, WAREHOUSES, type CustomerRateMatrix } from "@/lib/admin/customer-rate-tables";
import type { TransportId, WarehouseId } from "@/lib/admin/customer-rate-tables";
import type { QuoteDefaultGrid } from "@/lib/admin/quote-default-rates-shared";
import type { QuotePackage } from "@/lib/quote/quote-packages-shared";
import type { SellFloorCbmConfig, SellFloorKgConfig } from "@/lib/admin/sell-floor-config";
import { DEFAULT_COMPARISON } from "@/lib/quote/cargo-promo-packages";
import { QuoteTab } from "./quote-tab";
import { QuoteHistoryTab } from "./quote-history-tab";

// Bounds for an ultra floor edit — mirror lib/admin/sell-floor-config.ts (kept
// as literals here because that module is server-only · cannot import into a
// client component).
const FLOOR_MIN = 1000;
const FLOOR_MAX = 99999;
const KG_FLOOR_MIN = 1;
const KG_FLOOR_MAX = 999;

export function CustomerRateEditor({
  userid,
  customerName,
  buyerTaxId = "",
  buyerAddress = "",
  buyerIsJuristic = false,
  buyerPhone = "",
  matrix,
  generalDefaults,
  quotePackages,
  comparisonEnabled = false,
  comparisonValue = 0,
  sellFloorCbm,
  sellFloorKg,
  canEditSellFloor = false,
}: {
  userid: string;
  customerName: string;
  /** Registered corporate tax id (juristic) — seeds the ใบเสนอราคา buyer block. */
  buyerTaxId?: string;
  /** Registered company address (juristic) — seeds the ใบเสนอราคา buyer block. */
  buyerAddress?: string;
  /** True = juristic → ใบเสนอราคา defaults the นิติบุคคล/WHT-1% toggle ON. */
  buyerIsJuristic?: boolean;
  /** Customer phone — seeds the ใบเสนอราคา buyer phone. */
  buyerPhone?: string;
  matrix: CustomerRateMatrix;
  /** เรท default ใบเสนอราคา = เรททั่วไป tb_rate_g_* (global · owner ปอน 2026-07-17). */
  generalDefaults: QuoteDefaultGrid;
  /** แพ็กเกจใบเสนอราคา (data-driven · owner ปอน 2026-07-18) — ส่งต่อ QuoteTab. */
  quotePackages: QuotePackage[];
  /** tb_users.userComparison==1 — ค่าเทียบ (CPS) is currently ON. */
  comparisonEnabled?: boolean;
  /** tb_users.userComparisonValue — the kg-per-CBM density threshold. */
  comparisonValue?: number;
  /** Resolved CBM sell floor (business_config override || constant). */
  sellFloorCbm: SellFloorCbmConfig;
  /** Resolved KG sell floor (business_config override || constant · รถ 17/เรือ 7). */
  sellFloorKg: SellFloorKgConfig;
  /** True = viewer is ultra (Ultra Admin Z) → can edit the floor inline. */
  canEditSellFloor?: boolean;
}) {
  const router = useRouter();
  // Resolved floor matrix — CBM + KG from the props (config || constant). ALL
  // floor reads (grid "ขั้นต่ำ" labels · belowFloor block · InfoTab table) go
  // through this, NOT the raw COST_FLOOR constant.
  const tCmp = useTranslations("customerRateComparison");
  // Top bar = 2 tabs (owner ปอน 2026-07-03): ใบเสนอราคา (default) + ประวัติใบเสนอราคา.
  // เรทขายตั้งที่ใบเสนอราคาแล้ว (owner 2026-07-21) — accordion ด้านล่างเหลือแค่
  // ค่าเทียบ + ราคาขั้นต่ำ ซึ่งใบเสนอราคาแทนไม่ได้แต่ยังคิดเงินอยู่.
  const [tab, setTab] = useState<"quote" | "history">("quote");
  // เหลือ 2 แท็บหลังถอดตารางเรทออก (2026-07-21) — ค่าเทียบ + ราคาขั้นต่ำ
  const [rateTab, setRateTab] = useState<"cmp" | "info">("cmp");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // ด่านรหัสของกล่อง "ค่าเทียบ · ราคาขั้นต่ำ" — state อยู่ใน modal นี้เท่านั้น
  // → ปิด popup แล้วเปิดใหม่ = ล็อกใหม่ (ตรงกับที่ owner สั่ง "กดแล้วให้ใส่รหัส")
  const [rateUnlocked, setRateUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [pinPending, startPin] = useTransition();
  // 2026-06-12 (owner: "เป็น pop up ทั้งก้อนเลย ไม่ต้องมีแถบล่าง") — the editor is
  // now a MODAL (legacy #rate-settings), opened from the gear in the profile
  // header. No inline bottom panel. `open` controls the modal.
  const [open, setOpen] = useState(false);


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
            <BadgeCheck className="w-2.5 h-2.5" /> เรทเฉพาะตัว
          </span>
        ) : null}
      </button>

      {open && (
        // Modal overlay — backdrop click does NOT close (owner 2026-07-05);
        // close only via the ✕ / cancel buttons.
        <div
          // z-[80] sits ABOVE the admin chrome — the sticky top bar is z-[60]
          // and the sidebar logo z-[70]; at z-50 they covered the modal header.
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
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
                    <BadgeCheck className="w-3 h-3" /> เรทเฉพาะตัว
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

      {/* Tabs — top bar = 2 (ใบเสนอราคา + ประวัติ); the rate-setting screens are
          collapsed into an accordion inside the ใบเสนอราคา tab (owner ปอน 2026-07-03) */}
      <div className="flex border-b border-border bg-surface-alt/30 text-sm">
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
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`inline-flex items-center gap-1 px-4 py-2.5 font-medium transition-colors border-b-2 -mb-px ${
            tab === "history"
              ? "border-primary-600 text-primary-700 bg-white dark:bg-surface"
              : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          <History className="w-3.5 h-3.5" /> ประวัติใบเสนอราคา
        </button>
      </div>

      <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
        {/* ── ใบเสนอราคา (default) — the quote tool + collapsed rate settings ── */}
        {tab === "quote" && (
          <div className="space-y-3">
            <QuoteTab customerName={customerName} userid={userid} comparisonValue={comparisonValue} buyerTaxId={buyerTaxId} buyerAddress={buyerAddress} buyerIsJuristic={buyerIsJuristic} buyerPhone={buyerPhone} matrix={matrix} generalDefaults={generalDefaults} quotePackages={quotePackages} />

            {/* Rate-setting screens collapsed into the ใบเสนอราคา tab (owner ปอน 2026-07-03) */}
            <details className="rounded-lg border border-border bg-surface-alt/20">
              <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-foreground">
                <Settings className="w-3.5 h-3.5 text-primary-600" /> ค่าเทียบ · ราคาขั้นต่ำ
                {!rateUnlocked && <Lock className="w-3 h-3 text-muted" aria-label="ล็อกอยู่" />}
                {matrix.isSvip ? (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    <BadgeCheck className="w-2.5 h-2.5" /> เรทเฉพาะตัว
                  </span>
                ) : null}
              </summary>
              {/* ด่านรหัส (owner 2026-07-21 "ล็อคไว้นะ กดแล้วให้ใส่รหัส") — 2 ค่านี้เป็น
                  ตัวคูณเงินทั้งระบบ กดพลาดกระทบทุกงานของลูกค้ารายนั้น. ตรวจรหัสฝั่ง
                  server (verifyRateSettingsPin) รหัสจึงไม่ติดไปกับ client bundle.
                  ล็อกใหม่ทุกครั้งที่ปิด popup — state อยู่ใน memory ของ modal. */}
              {!rateUnlocked ? (
                <div className="border-t border-border p-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      setPinErr(null);
                      startPin(async () => {
                        const res = await verifyRateSettingsPin(pin);
                        if (res.ok) { setRateUnlocked(true); setPin(""); }
                        else setPinErr("รหัสไม่ถูกต้อง");
                      });
                    }}
                    className="mx-auto flex max-w-sm flex-col items-center gap-2 text-center"
                  >
                    <Lock className="h-5 w-5 text-muted" />
                    <p className="text-[12.5px] font-semibold text-foreground">ส่วนนี้ล็อกไว้</p>
                    <p className="text-[11.5px] text-muted">
                      ค่าเทียบ + ราคาขั้นต่ำ เป็นตัวคูณเงินทั้งระบบ — ใส่รหัสเพื่อเปิดแก้ไข
                    </p>
                    <input
                      type="password"
                      value={pin}
                      onChange={(e) => { setPin(e.target.value); setPinErr(null); }}
                      placeholder="รหัสผ่าน"
                      autoComplete="off"
                      aria-label="รหัสผ่านสำหรับแก้ค่าเทียบ/ราคาขั้นต่ำ"
                      className="w-48 rounded-lg border border-border bg-white px-3 py-1.5 text-center text-[13px] tracking-widest outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:bg-surface"
                    />
                    {pinErr && <p className="text-[11.5px] font-medium text-red-600">{pinErr}</p>}
                    <Button type="submit" size="sm" disabled={pinPending || !pin.trim()}>
                      {pinPending ? "กำลังตรวจ…" : "ปลดล็อก"}
                    </Button>
                  </form>
                </div>
              ) : (
              <div className="space-y-3 border-t border-border p-3">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
                  </div>
                )}
                {success && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">✓ {success}</div>
                )}

                {/* ตารางเรทรายโกดังถูกถอดออก 2026-07-21 (owner "ลบอันนี้ออกไปเลย แล้วอิงเรท
                    ตามใบเสนอราคา") — เรทขายตั้งที่ปุ่ม "บันทึกเรทเทียบราคา" ในใบเสนอราคา
                    ด้านบน ซึ่งเขียน tb_rate_custom_* + re-price ออเดอร์ที่ยังไม่ปิด ให้อยู่แล้ว.
                    เหลือไว้เฉพาะ 2 ตัวที่ใบเสนอราคา **แทนไม่ได้** และยังคิดเงินอยู่:
                    ค่าเทียบ (tb_users.userComparisonValue → คิดตาม กก. หรือ คิว) และ
                    ราคาขั้นต่ำ (ด่านกันตั้งเรทต่ำกว่าทุน · ultra เท่านั้น). */}
                <div className="flex flex-wrap gap-x-1 border-b border-border text-[13px]">
                  <button
                    type="button"
                    onClick={() => setRateTab("cmp")}
                    className={`inline-flex items-center gap-1 px-3 py-2 font-medium transition-colors border-b-2 -mb-px ${
                      rateTab === "cmp" ? "border-primary-600 text-primary-700" : "border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    <Scale className="w-3.5 h-3.5" /> {tCmp("tabLabel")}
                    {comparisonEnabled ? <span className="ml-0.5 text-primary-500">●</span> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRateTab("info")}
                    className={`px-3 py-2 font-medium transition-colors border-b-2 -mb-px ${
                      rateTab === "info" ? "border-primary-600 text-primary-700" : "border-transparent text-muted hover:text-foreground"
                    }`}
                  >
                    คำอธิบาย + ราคาขั้นต่ำ
                  </button>
                </div>

                {/* ค่าเทียบ (CPS) — set/clear in the same modal as the sell rate */}
                {rateTab === "cmp" && (
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

                {/* Info + cost floor (ultra can edit the floor inline here) */}
                {rateTab === "info" && (
                  <InfoTab
                    sellFloorCbm={sellFloorCbm}
                    sellFloorKg={sellFloorKg}
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
              )}
            </details>
          </div>
        )}

        {/* ── ประวัติใบเสนอราคา ── */}
        {tab === "history" && <QuoteHistoryTab userid={userid} />}
      </div>
          </div>

        </div>
      )}
    </>
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
  const [draft, setDraft] = useState(value > 0 ? String(value) : String(DEFAULT_COMPARISON));

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
        <label className="block text-[12px] font-medium text-foreground">{t("inputLabel", { def: DEFAULT_COMPARISON })}</label>
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={String(DEFAULT_COMPARISON)}
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
  sellFloorKg,
  canEdit,
  onSaved,
  onError,
}: {
  sellFloorCbm: SellFloorCbmConfig;
  sellFloorKg: SellFloorKgConfig;
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

  // ── KG floor drafts (per transport · flat both warehouses · รถ 17/เรือ 7) ──
  const [kgPending, startKg] = useTransition();
  const [kgDraft, setKgDraft] = useState<{ "1": string; "2": string }>(() => ({
    "1": String(sellFloorKg["1"]),
    "2": String(sellFloorKg["2"]),
  }));

  function parsedKgFloor(): { ok: true; truck: number; sea: number } | { ok: false; bad: string } {
    const out: Record<TransportId, number> = { "1": 0, "2": 0 };
    for (const t of ["1", "2"] as TransportId[]) {
      const n = parseFloat(kgDraft[t].replace(/,/g, "").trim());
      const tShort = TRANSPORTS.find((x) => x.id === t)?.short;
      if (!Number.isFinite(n) || n < KG_FLOOR_MIN || n > KG_FLOOR_MAX) {
        return { ok: false, bad: `${tShort} (ต้อง ${KG_FLOOR_MIN}–${KG_FLOOR_MAX})` };
      }
      out[t] = n;
    }
    return { ok: true, truck: out["1"], sea: out["2"] };
  }

  function saveKg() {
    const p = parsedKgFloor();
    if (!p.ok) {
      onError(`ค่าราคาขั้นต่ำ KG ไม่ถูกต้อง: ${p.bad}`);
      return;
    }
    startKg(async () => {
      const ok = await confirm(
        `ยืนยันแก้ราคาขายขั้นต่ำ (KG) — รถ ฿${p.truck.toLocaleString()}/กก. · เรือ ฿${p.sea.toLocaleString()}/กก. ` +
          `(ทุกโกดัง) ? มีผลกับการเซฟเรททุกลูกค้าทันที`,
      );
      if (!ok) return;
      const res = await adminUpdateSellFloorKg({ truck: p.truck, sea: p.sea });
      if (!res.ok) {
        onError(res.error);
        return;
      }
      onSaved("บันทึกราคาขายขั้นต่ำ (KG) แล้ว — มีผลกับการเซฟเรททันที");
    });
  }

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
          <li>ลูกค้าที่ปรับเรทเฉพาะตัว จะมี <strong>เรทเฉพาะตัว</strong> (แยกจากเรท default)</li>
          <li><strong>ห้ามตั้งเรทขายต่ำกว่าราคาขั้นต่ำ</strong> — ระบบจะกดบันทึกไม่ได้ (ห้ามต่ำกว่านี้เสมอ). แก้ราคาขั้นต่ำเองได้เฉพาะ <strong>Ultra Admin Z</strong></li>
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
          * ราคาขั้นต่ำ CBM เท่ากันทุกประเภทสินค้า (ทั่วไป/มอก./อย./พิเศษ) · 0 = ไม่คิดตามหน่วยนั้น
        </p>
        {canEdit ? (
          <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
            <p className="text-[11px] text-amber-700">
              ⚠ การแก้ราคาขั้นต่ำมีผลกับการเซฟเรทของ <strong>ทุกลูกค้า</strong> ทันที — เฉพาะ Ultra Admin Z
            </p>
            <Button type="button" size="sm" disabled={pending} onClick={save}>
              <Save className="size-4" /> {pending ? "กำลังบันทึก..." : "บันทึกราคาขั้นต่ำ CBM"}
            </Button>
          </div>
        ) : null}
      </div>

      {/* ── ราคาขายขั้นต่ำ — KG (฿/กก.) — flat per transport, ทุกโกดัง ───────── */}
      <div>
        <h3 className="font-semibold text-foreground mb-1.5 flex items-center gap-2 flex-wrap">
          <span>ราคาขายขั้นต่ำ — KG (฿/กก. · ห้ามขายต่ำกว่านี้)</span>
          {canEdit ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-600 text-white px-2 py-0.5 text-[11px] font-semibold">
              <BadgeCheck className="w-3 h-3" /> Ultra · แก้ได้
            </span>
          ) : null}
        </h3>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm min-w-[280px]">
            <thead className="bg-surface-alt/60 text-[11px] uppercase text-muted">
              <tr>
                <th className="px-3 py-2 text-right">KG · รถ</th>
                <th className="px-3 py-2 text-right">KG · เรือ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                {(["1", "2"] as TransportId[]).map((t) => (
                  <td key={t} className="px-3 py-2 text-right">
                    {canEdit ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={kgDraft[t]}
                        disabled={kgPending}
                        onChange={(e) => setKgDraft((prev) => ({ ...prev, [t]: e.target.value }))}
                        className="w-24 rounded-md border border-border px-2 py-1 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500"
                      />
                    ) : (
                      <span className="font-mono">{sellFloorKg[t].toLocaleString()}</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted mt-1.5">
          * ราคาขั้นต่ำ KG เท่ากันทุกประเภทสินค้า + ทุกโกดัง (ค่าเดียวต่อขนส่ง) · 0 = ไม่คิดตามหน่วยนั้น
        </p>
        {canEdit ? (
          <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
            <p className="text-[11px] text-amber-700">
              ⚠ การแก้ราคาขั้นต่ำมีผลกับการเซฟเรทของ <strong>ทุกลูกค้า</strong> ทันที — เฉพาะ Ultra Admin Z
            </p>
            <Button type="button" size="sm" disabled={kgPending} onClick={saveKg}>
              <Save className="size-4" /> {kgPending ? "กำลังบันทึก..." : "บันทึกราคาขั้นต่ำ KG"}
            </Button>
          </div>
        ) : null}
      </div>
      {dialogs}
    </div>
  );
}

