"use client";

/**
 * P1-18 · the carrier (#hShipBy) picker for the "ฝากนำเข้า" add form.
 *
 * Faithful port of legacy `getShipBy.php`'s #hShipBy <select> (the courier
 * list that legacy AJAX-loaded into #selectShipBy whenever the customer
 * picked a delivery address). Without this, a forwarder was created with NO
 * carrier — the core add-flow was broken (P1-18).
 *
 * Wiring (function-first — เดฟ lane guarantees the flow WORKS; ปอน owns the
 * customer-UI look):
 *   - reads the sibling address <select id="addressID"> value from the DOM,
 *   - subscribes to its `change` event,
 *   - calls `getShipByOptions(addressID)` (server action → tb_address ZIP →
 *     in-free-area = Flash+J&T short list, else the full courier roster;
 *     "PCS" = warehouse pickup → no select), and
 *   - renders the `<select name="hShipBy">` the legacy `save` POST contract
 *     expects (or a hidden `hShipBy="PCS"` for warehouse pickup).
 *
 * It lives as a small client island INSIDE the otherwise-pure
 * `ServiceImportAddFields`, so it works identically on the full-page form AND
 * the list-view modal (both render the same fields component). It talks to
 * the address select via the DOM rather than props to keep the parent
 * component's hook-free, prop-driven shape intact (ปอน 2026-05-30 structure).
 *
 * TODO(ปอน): style the ship-by <select> + free-area hint to match the design
 * (loading shimmer, the in-free-area "ส่งฟรี" chip, error toast). Function is
 * complete + verified; the look is yours.
 */

import { useEffect, useState } from "react";
import {
  getShipByOptions,
  type LegacyShipByOption,
} from "@/actions/forwarder-legacy";

type Mode =
  | { kind: "idle" } // no address chosen yet
  | { kind: "loading" }
  | { kind: "warehouse" } // addressID === "PCS" — hidden hShipBy="PCS"
  | {
      kind: "carriers";
      options: LegacyShipByOption[];
      inFreeArea: boolean;
      defaultShipBy: string;
    }
  | { kind: "error"; message: string };

export function ServiceImportShipBySelect({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  // The "Pacred เหมา ๆ" promo (#input-12, pro='f'). Legacy hides the courier
  // select + drops `required` when ticked because the action forces
  // fShipBy='PCSF' regardless (forwarder.php L122-124 + the inline JS that
  // `$('.selectProF').hide()` + `$('#hShipBy').prop('required',false)`).
  const [promoActive, setPromoActive] = useState(false);

  useEffect(() => {
    const el = document.getElementById("addressID") as HTMLSelectElement | null;
    if (!el) return;

    let cancelled = false;

    async function load(addressID: string) {
      const aid = (addressID ?? "").trim();
      if (!aid) {
        if (!cancelled) setMode({ kind: "idle" });
        return;
      }
      setMode({ kind: "loading" });
      const res = await getShipByOptions(aid);
      if (cancelled) return;
      if (!res.ok) {
        setMode({ kind: "error", message: res.error });
        return;
      }
      if (res.warehousePickup) {
        setMode({ kind: "warehouse" });
        return;
      }
      setMode({
        kind: "carriers",
        options: res.options,
        inFreeArea: res.inFreeArea,
        defaultShipBy: res.userShipBy,
      });
    }

    // Initial load (a default-selected address) + on every change.
    load(el.value);
    const onChange = () => load(el.value);
    el.addEventListener("change", onChange);
    return () => {
      cancelled = true;
      el.removeEventListener("change", onChange);
    };
  }, []);

  // Watch the promo checkbox so the courier select stops being `required`
  // when the promo is on (the action will force fShipBy='PCSF' anyway).
  useEffect(() => {
    const promo = document.getElementById("input-12") as HTMLInputElement | null;
    if (!promo) return;
    const sync = () => setPromoActive(promo.checked);
    sync();
    promo.addEventListener("change", sync);
    return () => promo.removeEventListener("change", sync);
  }, []);

  const labelClass = "mb-1 block text-sm font-medium text-foreground";
  const selectCls = `w-full rounded-lg border border-border bg-white px-3 text-base text-foreground focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20 ${
    compact ? "py-2" : "py-2.5"
  }`;
  const wrap = compact ? "mt-2" : "mt-3";

  if (mode.kind === "idle") {
    // No address yet — nothing to pick. (The address <select> is required, so
    // the customer must choose one; this block then re-renders with carriers.)
    return null;
  }

  if (mode.kind === "warehouse") {
    // รับเองหน้าโกดัง — no courier; still submit hShipBy="PCS" so the action's
    // PCS-pickup branch fires (faithful to forwarder.php L55-66).
    return <input type="hidden" name="hShipBy" value="PCS" />;
  }

  if (mode.kind === "loading") {
    return (
      <div className={wrap}>
        <label className={labelClass}>บริษัทขนส่งในไทย</label>
        <div className={`${selectCls} text-muted`}>กำลังโหลด…</div>
      </div>
    );
  }

  if (mode.kind === "error") {
    return (
      <div className={wrap}>
        <label className={labelClass}>บริษัทขนส่งในไทย</label>
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          โหลดรายชื่อบริษัทขนส่งไม่สำเร็จ — {mode.message}
        </p>
      </div>
    );
  }

  // kind === "carriers"
  // When the promo is active, the carrier isn't required (action forces PCSF)
  // — hide the select so it neither blocks submit nor confuses the customer,
  // exactly like legacy `$('.selectProF').hide()`.
  if (promoActive) {
    return (
      <input type="hidden" name="hShipBy" value="" data-promo-hidden="1" />
    );
  }
  return (
    <div className={wrap}>
      <label className={labelClass} htmlFor="hShipBy">
        บริษัทขนส่งในไทย
        {mode.inFreeArea && (
          <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            พื้นที่จัดส่งฟรี
          </span>
        )}
      </label>
      <select
        className={selectCls}
        name="hShipBy"
        id="hShipBy"
        required
        defaultValue={
          mode.defaultShipBy &&
          mode.options.some((o) => o.id === mode.defaultShipBy)
            ? mode.defaultShipBy
            : ""
        }
      >
        <option value="">กรุณาเลือกบริษัทขนส่ง</option>
        {mode.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
