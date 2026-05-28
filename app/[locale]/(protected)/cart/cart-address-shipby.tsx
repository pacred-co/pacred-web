"use client";

import { useMemo, useState } from "react";
import {
  MapPin,
  Truck,
  ChevronRight,
  X,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

/**
 * Cart address + ship-by + maomao popup client wiring — Tailwind-rebuilt
 * (ปอน 2026-05-26).
 *
 * Replaces three legacy AJAX endpoints with server-rendered prop maps
 * (D1 / ADR-0017 · the cart-list of AJAX ports — see cart/page.tsx
 * header FLAG #1):
 *
 *   - `option-address-thai.php`  → the เปลี่ยนที่อยู่ modal
 *   - `api-shipBy.php`           → the `hShipBy` <select> options
 *   - `checkPCSMaoMao.php`       → the maomao popup + promo card reveal
 *
 * The form-input contract is preserved verbatim: `name="addressID"` (the
 * hidden text input that the parent form reads) and `name="hShipBy"`
 * (the carrier <select>). Don't rename.
 */

export type CartAddressOption = {
  /** `tb_address.addressid` as a string ("PCS" for warehouse pickup). */
  addressID:   string;
  /** Legacy CONCAT(addressName,' ',…) fullAddress. */
  fullAddress: string;
  /** Used by maomao + ship-by gating (kept for client-only debug). */
  zip:         string;
  province:    string;
  amphoe:      string;
};

export type ShipByOption = {
  id:   string;
  name: string;
};

export type CartAddressBlockMode =
  | { mode: "saved"; addressID: string; fullAddress: string; lastAddressLabel: string }
  | { mode: "warehouse-saved" }
  | { mode: "warehouse-default" }
  | { mode: "none" };

export type CartAddressShipByProps = {
  /** Resolved initial address block (cart.php L441-499). */
  initialAddressBlock: CartAddressBlockMode;
  /** Full list of saved addresses for the เปลี่ยนที่อยู่ modal. */
  addresses:           CartAddressOption[];
  /** `addressID → ship-by carrier options` (incl. "PCS" → []). */
  shipByByAddress:     Record<string, ShipByOption[]>;
  /** `addressID → maomao-eligible`. */
  maomaoByAddress:     Record<string, boolean>;
  /** The customer's stored `userShipBy`. Drives the default-selected
      carrier in the `<select>`. cart.php L1132-1141. */
  userShipBy:          string;
  /** Pacred warehouse address — the "รับเองโกดัง" row label. */
  warehouseAddress:    string;
  /** Google Maps URL for the warehouse (empty string hides the link). */
  warehouseMapUrl:     string;
};

export function CartAddressShipBy(props: CartAddressShipByProps) {
  const {
    initialAddressBlock,
    addresses,
    shipByByAddress,
    maomaoByAddress,
    userShipBy,
    warehouseAddress,
    warehouseMapUrl,
  } = props;

  // Derive initial selected address ID from the resolved block.
  const initialAddressID = useMemo(() => {
    switch (initialAddressBlock.mode) {
      case "saved":             return initialAddressBlock.addressID;
      case "warehouse-saved":   return "PCS";
      case "warehouse-default": return "PCS";
      case "none":              return "";
    }
  }, [initialAddressBlock]);

  const [selectedID, setSelectedID]   = useState<string>(initialAddressID);
  const [modalOpen,   setModalOpen]   = useState<boolean>(false);
  // Tracks the LAST `selectedID` we dismissed/accepted; when the
  // selection changes to a new eligible address the popup re-opens.
  const [maomaoDismissedFor, setMaomaoDismissedFor] = useState<string | null>(null);
  // userShipBy === 'PCSF' on initial load reflects the legacy
  // pre-tick (cart.php L1132-1136).
  const [proMaomao,   setProMaomao]   = useState<boolean>(
    () => userShipBy === "PCSF",
  );

  // Current ship-by list — looked up by the selected addressID.
  const currentShipBy = shipByByAddress[selectedID] ?? [];

  // Eligibility is a pure prop lookup — no state.
  const eligible = maomaoByAddress[selectedID] === true;
  // The maomao popup is OPEN exactly when the address is eligible AND
  // the user hasn't dismissed/accepted it for THIS address.
  const maomaoOpen = eligible && maomaoDismissedFor !== selectedID;

  function openModal() { setModalOpen(true); }
  function closeModal() { setModalOpen(false); }
  function selectAddress(addressID: string) {
    setSelectedID(addressID);
    setModalOpen(false);
    if (maomaoByAddress[addressID] !== true) {
      setProMaomao(false);
    }
  }
  function acceptMaomao() {
    setProMaomao(true);
    setMaomaoDismissedFor(selectedID);
    // Bridge to <CartInteractivity>: legacy `btn-getMaoMao` click also
    // ticks `#input-12` in the order-summary card.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cart-maomao-accepted"));
    }
  }
  function dismissMaomao() {
    setMaomaoDismissedFor(selectedID);
  }

  // Display fields for the address card.
  const display = (() => {
    if (selectedID === "PCS") {
      return {
        kind:        "warehouse" as const,
        fullAddress: warehouseAddress,
        label:
          initialAddressBlock.mode === "warehouse-saved"
            ? "ที่อยู่ล่าสุดที่เคยสั่ง"
            : "",
      };
    }
    if (selectedID === "") {
      return { kind: "none" as const };
    }
    const a = addresses.find((x) => x.addressID === selectedID);
    if (!a) {
      return { kind: "none" as const };
    }
    return {
      kind:        "saved" as const,
      fullAddress: a.fullAddress,
      label:
        initialAddressBlock.mode === "saved" &&
        initialAddressID === a.addressID
          ? initialAddressBlock.lastAddressLabel
          : "",
    };
  })();

  return (
    <>
      <div className="rounded-2xl bg-white border border-border shadow-[0_4px_14px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Header strip */}
        <div className="px-4 md:px-5 py-3 border-b border-border bg-gradient-to-r from-rose-50/60 via-white to-white">
          <h3 className="flex items-center gap-2 text-[14px] md:text-[15px] font-bold text-foreground">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-50 text-primary-600">
              <MapPin className="w-4 h-4" strokeWidth={2.2} />
            </span>
            ที่อยู่ในการจัดส่งในไทย
            <span className="inline-block w-5 h-3.5 rounded-sm overflow-hidden border border-border align-middle relative" aria-label="Thailand">
              <span className="absolute inset-0 grid grid-rows-5">
                <span className="bg-[#A51931]"></span>
                <span className="bg-white"></span>
                <span className="bg-[#2D2A4A] row-span-1"></span>
                <span className="bg-white"></span>
                <span className="bg-[#A51931]"></span>
              </span>
            </span>
          </h3>
        </div>

        {/* Body */}
        <div className="p-4 md:p-5">
          {/* Hidden form input — the form-submit contract.  REQUIRED so
              the legacy /service-order addOrder validation sees a value. */}
          <input
            type="text"
            name="addressID"
            id="addressIDMain"
            value={selectedID}
            required
            readOnly
            hidden
          />

          {/* Address display */}
          {display.kind === "saved" && (
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] md:text-[13.5px] text-foreground leading-relaxed">
                  {display.fullAddress}
                </p>
                {display.label && (
                  <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10.5px] font-bold px-2 py-0.5">
                    <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} />
                    {display.label}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={openModal}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white text-primary-600 border-2 border-primary-600 text-[12px] font-bold px-3 py-1.5 hover:bg-primary-50 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                เปลี่ยนที่อยู่
              </button>
            </div>
          )}

          {display.kind === "warehouse" && (
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] md:text-[13.5px] text-foreground leading-relaxed">
                  {display.fullAddress}
                </p>
                {display.label && (
                  <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10.5px] font-bold px-2 py-0.5">
                    <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} />
                    {display.label}
                  </span>
                )}
                {warehouseMapUrl && (
                  <a
                    href={warehouseMapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-primary-600 hover:underline"
                  >
                    <MapPin className="w-3 h-3" strokeWidth={2.2} />
                    ดูแผนที่โกดัง Pacred ในไทย
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={openModal}
                className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white text-primary-600 border-2 border-primary-600 text-[12px] font-bold px-3 py-1.5 hover:bg-primary-50 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                เปลี่ยนที่อยู่
              </button>
            </div>
          )}

          {display.kind === "none" && (
            <div className="text-center py-3">
              <button
                type="button"
                onClick={openModal}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13px] font-bold px-4 py-2 shadow-lg shadow-primary-600/30 hover:shadow-primary-600/40 hover:-translate-y-0.5 transition-all"
              >
                <MapPin className="w-4 h-4" strokeWidth={2.2} />
                เพิ่มที่อยู่ หรือเลือกรับเองโกดัง Pacred
              </button>
            </div>
          )}

          {/* Ship-by carrier — cart.php L488 / L982-994 */}
          <div className="mt-3 pt-3 border-t border-border">
            {selectedID === "PCS" ? (
              <a
                href={warehouseMapUrl || "https://goo.gl/maps/MJd56S6saebaDBQr7"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-primary-600 hover:underline"
              >
                <MapPin className="w-4 h-4" strokeWidth={2.2} />
                ดูแผนที่โกดัง Pacred Cargo ในไทย
              </a>
            ) : (
              <div className="flex items-center gap-3 flex-wrap">
                <label
                  htmlFor="hShipBy"
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-foreground"
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-sky-50 text-sky-700">
                    <Truck className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </span>
                  บริษัทขนส่งในไทย
                </label>
                <select
                  name="hShipBy"
                  id="hShipBy"
                  required={!proMaomao}
                  defaultValue={
                    userShipBy && userShipBy !== "PCSF" ? userShipBy : ""
                  }
                  className="flex-1 min-w-[180px] max-w-[280px] px-3 py-1.5 text-[12.5px] rounded-lg border border-border bg-white focus:border-primary-500 focus:ring-2 focus:ring-primary-100 focus:outline-none"
                >
                  {currentShipBy.length > 1 && (
                    <option value="">กรุณาเลือกบริษัทขนส่ง</option>
                  )}
                  {currentShipBy.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="mt-2.5 text-[11px] text-rose-600 leading-relaxed">
            หมายเหตุ: หากพื้นที่นอกเขตขนส่งของ Pacred ทางบริษัทจะเก็บเงินปลายทางเท่านั้น{" "}
            <a
              href="/services/import-china"
              target="_blank"
              rel="noreferrer"
              className="underline font-bold"
            >
              (เช็คพื้นที่ได้ที่นี่)
            </a>
          </p>
        </div>
      </div>

      {/* ── เปลี่ยนที่อยู่ modal — cart.php's option-address-thai.php ── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full md:max-w-2xl bg-white rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-border bg-gradient-to-r from-primary-50 via-white to-white">
              <h4 className="flex items-center gap-2 text-[15px] md:text-[16px] font-bold text-foreground">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-primary-600 text-white">
                  <MapPin className="w-4 h-4" strokeWidth={2.2} />
                </span>
                ที่อยู่จัดส่งสินค้าของฉัน
              </h4>
              <button
                type="button"
                onClick={closeModal}
                aria-label="ปิด"
                className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white border border-border text-muted hover:text-foreground hover:border-primary-300 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4">
              <ul className="space-y-2">
                {addresses.map((a) => {
                  const isCurrent = a.addressID === selectedID;
                  return (
                    <li key={a.addressID}>
                      <button
                        type="button"
                        onClick={() => selectAddress(a.addressID)}
                        className={`w-full text-left rounded-xl border-2 px-3 py-3 flex items-start gap-3 transition-all ${
                          isCurrent
                            ? "border-primary-500 bg-rose-50/50 shadow-sm"
                            : "border-border bg-white hover:border-primary-300 hover:bg-rose-50/20"
                        }`}
                      >
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${
                          isCurrent ? "bg-primary-600 text-white" : "bg-surface text-muted"
                        }`}>
                          {isCurrent ? (
                            <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
                          ) : (
                            <MapPin className="w-4 h-4" strokeWidth={2.2} />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10.5px] text-muted font-mono mb-0.5 notranslate">
                            ID: {a.addressID}
                          </div>
                          <div className="text-[12.5px] md:text-[13px] text-foreground leading-relaxed">
                            {a.fullAddress}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
                {/* The legacy "PCS" warehouse pickup row — always present
                    at the bottom (cart.php L110-114). */}
                <li>
                  <button
                    type="button"
                    onClick={() => selectAddress("PCS")}
                    className={`w-full text-left rounded-xl border-2 px-3 py-3 flex items-start gap-3 transition-all ${
                      selectedID === "PCS"
                        ? "border-primary-500 bg-rose-50/50 shadow-sm"
                        : "border-border bg-white hover:border-primary-300 hover:bg-rose-50/20"
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0 ${
                      selectedID === "PCS" ? "bg-primary-600 text-white" : "bg-amber-100 text-amber-700"
                    }`}>
                      {selectedID === "PCS" ? (
                        <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
                      ) : (
                        <Truck className="w-4 h-4" strokeWidth={2.2} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10.5px] text-muted font-mono mb-0.5 notranslate">
                        ID: PCS
                      </div>
                      <div className="text-[12.5px] md:text-[13px] text-foreground leading-relaxed">
                        {warehouseAddress}
                      </div>
                    </div>
                  </button>
                </li>
              </ul>
            </div>

            <div className="px-4 md:px-5 py-3 border-t border-border bg-surface/30 flex justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full bg-white text-foreground border border-border text-[12.5px] font-bold px-4 py-2 hover:border-primary-300 hover:text-primary-600 transition-colors"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PCS เหมาๆ promo modal — cart.php L737-754 ── */}
      {maomaoOpen && eligible && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissMaomao();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-sm bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl shadow-2xl shadow-primary-900/40 overflow-hidden">
            <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
              <h4 className="text-white text-[17px] font-black leading-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-300 shrink-0" strokeWidth={2.5} />
                คุณได้รับสิทธิ์ร่วมโปรโมชัน
                <br />Pacred เหมา ๆ
              </h4>
              <button
                type="button"
                onClick={dismissMaomao}
                aria-label="ปิด"
                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/15 border-2 border-white/60 text-white hover:bg-white/25 transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="px-4 pb-4">
              <div className="rounded-2xl bg-white/10 p-2 backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/legacy/pcs/theme/free50-3.png"
                  className="block w-full h-auto rounded-xl"
                  alt="โปรโมชัน Pacred เหมา ๆ ฟรี 50 บาท"
                />
              </div>

              <button
                type="button"
                onClick={acceptMaomao}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-white text-primary-700 text-[14px] font-black px-4 py-2.5 shadow-xl shadow-black/30 hover:bg-primary-50 hover:-translate-y-0.5 transition-all animate-pulse"
              >
                <Sparkles className="w-4 h-4" strokeWidth={2.5} />
                รับโปรโมชัน เหมา ๆ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden debug pings (kept from previous iteration). */}
      <span
        hidden
        data-maomao-eligible={eligible ? "1" : "0"}
        data-selected-address-id={selectedID}
        data-pro-maomao={proMaomao ? "1" : "0"}
      />
    </>
  );
}
