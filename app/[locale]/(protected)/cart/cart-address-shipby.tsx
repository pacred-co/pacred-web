"use client";

import { useMemo, useState } from "react";

/**
 * Cart address + ship-by + maomao popup client wiring.
 *
 * Replaces three legacy AJAX endpoints with server-rendered prop maps
 * (D1 / ADR-0017 · the cart-list of AJAX ports — see cart/page.tsx
 * header FLAG #1):
 *
 *   - `option-address-thai.php`  → the เปลี่ยนที่อยู่ modal listing
 *     every saved address + the warehouse-pickup row. cart.php L929-939
 *     POSTed to load this; now rendered SSR once, revealed on click.
 *   - `api-shipBy.php`           → the `#selectShipBy` <select>
 *     options. cart.php L982-994 POSTed on every address change; now
 *     a pre-computed `shipByByAddress[addressID]` lookup.
 *   - `checkPCSMaoMao.php`       → the `#pro-maomao` popup + the
 *     `.maomao` promo card reveal. cart.php L996-1014 POSTed on
 *     mount + address change; now a pre-computed
 *     `maomaoByAddress[addressID]` boolean.
 *
 * Why this lives as a separate client file (not merged into
 * `cart-interactivity.tsx`): the address card sits ABOVE the shopping-
 * cart list in the DOM (cart.php L434-509 / cart.php L510-600). Keeping
 * the two interactivity blocks colocated in page.tsx via two
 * client islands matches the legacy layout 1:1, and keeps
 * cart-interactivity.tsx focused on the cart-row interactivity that
 * the order-summary card depends on.
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
  /** The customer's stored `userShipBy` (`tb_users.usershipby` or the
      most-recent `tb_forwarder.fshipby`). Drives the default-selected
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
  // The เปลี่ยนที่อยู่ modal — cart.php L929-939 click-to-load.
  const [modalOpen,   setModalOpen]   = useState<boolean>(false);
  // The maomao popup — cart.php L1015 `$("#pro-maomao").modal("show")`.
  // Tracks the LAST `selectedID` we dismissed/accepted; when the
  // selection changes to a new eligible address the popup re-opens.
  // Tracking the dismissed id (not a boolean) lets us derive
  // `maomaoOpen` from props instead of setting state in an effect.
  const [maomaoDismissedFor, setMaomaoDismissedFor] = useState<string | null>(null);
  // The promo-checked state — cart.php L1018-1024 `btn-getMaoMao`.
  // userShipBy === 'PCSF' on initial load reflects the legacy
  // pre-tick (cart.php L1132-1136).
  const [proMaomao,   setProMaomao]   = useState<boolean>(
    () => userShipBy === "PCSF",
  );

  // Current ship-by list — looked up by the selected addressID. The
  // "PCS" warehouse pickup has no ship-by select (cart.php L188 — the
  // legacy clears `#selectShipBy` and shows a "ดูแผนที่" link instead).
  const currentShipBy = shipByByAddress[selectedID] ?? [];

  // Eligibility is a pure prop lookup — no state. Legacy fires
  // `checkPCSMaoMao()` on mount (cart.php L995) AND on address change
  // (cart.php L186). When qualifies → `.maomao` shows + `#pro-maomao`
  // opens; when not → `.maomao` hides + the promo checkbox is
  // forcibly unchecked.
  const eligible = maomaoByAddress[selectedID] === true;
  // The maomao popup is OPEN exactly when the address is eligible AND
  // the user hasn't dismissed/accepted it for THIS address. Switching
  // address re-opens because `selectedID` differs from
  // `maomaoDismissedFor`. Derived — no state-in-effect needed.
  const maomaoOpen = eligible && maomaoDismissedFor !== selectedID;

  function openModal() {
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
  }
  function selectAddress(addressID: string) {
    setSelectedID(addressID);
    setModalOpen(false);
    // If the new address is NOT eligible, uncheck the legacy promo —
    // cart.php L1004-1006. Done in the click handler (not an effect)
    // so the next render reflects the change without a cascading
    // setState.
    if (maomaoByAddress[addressID] !== true) {
      setProMaomao(false);
    }
  }
  function acceptMaomao() {
    setProMaomao(true);
    setMaomaoDismissedFor(selectedID);
    // Bridge to <CartInteractivity>: legacy `btn-getMaoMao` click also
    // ticks `#input-12` in the order-summary card (cart.php L1020).
    // Our two client islands don't share state by parent — a custom
    // DOM event keeps them coupled minimally without a wrapper.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cart-maomao-accepted"));
    }
  }
  function dismissMaomao() {
    setMaomaoDismissedFor(selectedID);
  }

  // Display fields for the address card "address-select-now" block.
  // Resolves the current `selectedID` against the addresses prop +
  // falls back to the initialAddressBlock for the modes the modal
  // can't re-enter (warehouse + none).
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
    // The legacy modal click sets `address-select-now` to the picked
    // row's fullAddress; the box-lastaddress label is dropped after
    // the user picks a new address (legacy `$('.address-select-now')
    // .html(addressName)` on L180 — no box-lastaddress kept).
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

  // The hidden `#input-12` checkbox lives inside `<CartInteractivity>`
  // (it's part of the order-summary card). The `.maomao` CLASS toggle
  // on the legacy `.col-12.col-md-4.text-center.maomao` div is mirrored
  // here by signalling via `data-maomao-eligible` on a sibling node;
  // the legacy promo card's interactivity stays inside CartInteractivity.
  // We expose a hidden input that participates in the form submit so
  // `submitCartOrder` sees `pro=f` when the user accepted the promo.
  return (
    <>
      <div className="ele-address-thai box-shadow mb-2">
        <div className="top-address-thai"></div>
        <div className="p-1">
          <h3 className="text-color mb-1">
            <span className="fa fa-map"></span> ที่อยู่ในการจัดส่งในไทย{" "}
            <i className="flag-icon flag-icon-th"></i>
          </h3>
          <div className="address-select">
            <input
              type="text"
              name="addressID"
              id="addressIDMain"
              value={selectedID}
              required
              readOnly
              hidden
            />
            {display.kind === "saved" && (
              <>
                <span className="address-select-now">
                  {display.fullAddress}
                  {display.label && (
                    <span className="box-lastaddress">{display.label}</span>
                  )}
                </span>
                <span
                  className="btn-change-address-thai cursor-pointer"
                  onClick={openModal}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openModal();
                  }}
                >
                  เปลี่ยนที่อยู่
                </span>
              </>
            )}
            {display.kind === "warehouse" && (
              <>
                <span className="address-select-now">
                  {display.fullAddress}
                  {display.label && (
                    <span className="box-lastaddress">{display.label}</span>
                  )}
                  {warehouseMapUrl && (
                    <div>
                      <a
                        href={warehouseMapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-info"
                      >
                        <i className="fa fa-map"></i> ดูแผนที่โกดัง Pacred
                        ในไทย
                      </a>
                    </div>
                  )}
                </span>
                {addresses.length > 0 ? (
                  <span
                    className="btn-change-address-thai cursor-pointer"
                    onClick={openModal}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openModal();
                    }}
                  >
                    เปลี่ยนที่อยู่
                  </span>
                ) : (
                  <span
                    className="ml-1 btn-add-address-thai cursor-pointer"
                    onClick={openModal}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") openModal();
                    }}
                  >
                    เปลี่ยนที่อยู่
                  </span>
                )}
              </>
            )}
            {display.kind === "none" && (
              <>
                <span className="address-select-now"></span>
                <span
                  className="btn-add-address-thai cursor-pointer"
                  onClick={openModal}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openModal();
                  }}
                >
                  เพิ่มที่อยู่ หรือ เลือกรับเองโกดัง Pacred กทม
                </span>
              </>
            )}
          </div>
          {/* The `#selectShipBy` div — cart.php L488 / L982-994 — now
              an inline <select> populated from `shipByByAddress`.
              When the warehouse is picked, legacy shows the warehouse-
              map link in its place (cart.php L188-190). */}
          <div className="shipBy-select pt-1 mb-05">
            <div id="selectShipBy">
              {selectedID === "PCS" ? (
                <a
                  href={
                    warehouseMapUrl ||
                    "https://goo.gl/maps/MJd56S6saebaDBQr7"
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-info"
                >
                  <i className="fa fa-map"></i> ดูแผนที่โกดัง Pacred Cargo ในไทย
                </a>
              ) : (
                <>
                  <span className="title-shipBy text-color">
                    <i className="fa fa-truck"></i> บริษัทขนส่งในไทย :{" "}
                  </span>{" "}
                  <select
                    name="hShipBy"
                    id="hShipBy"
                    required={!proMaomao}
                    defaultValue={
                      userShipBy && userShipBy !== "PCSF" ? userShipBy : ""
                    }
                    // When the maomao promo is accepted the legacy
                    // hides this whole select + drops the required flag
                    // (cart.php L1022-1023). We keep the element in DOM
                    // so its name is still in the form, but the
                    // required flag is the load-bearing legacy gate.
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
                </>
              )}
            </div>
          </div>
          <div className="text-danger font-0_85rem">
            หมายเหตุ : หากพื้นที่นอกเขตขนส่งของ Pacred
            ทางบริษัทจะเก็บเงินปลายทางเท่านั้น{" "}
            <a
              href="/services/import-china"
              target="_blank"
              rel="noreferrer"
            >
              (เช็คพื้นที่ได้ที่นี่)
            </a>
          </div>
        </div>
      </div>

      {/* ── เปลี่ยนที่อยู่ modal — cart.php's option-address-thai.php
          rendered server-side prop list, revealed on click. The legacy
          DataTables-styled markup is preserved 1:1. ── */}
      {modalOpen && (
        <div
          id="option-address-thai-form"
          className="modal fade show notranslate"
          tabIndex={-1}
          role="dialog"
          aria-hidden="false"
          style={{
            display:        "block",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="modal-dialog">
            <div className="modal-content header-from">
              <div className="modal-header">
                <h4 className="modal-title">
                  ที่อยู่จัดส่งสินค้าของฉัน
                </h4>
                <button
                  type="button"
                  className="close"
                  onClick={closeModal}
                  aria-label="ปิด"
                  style={{
                    border:      "none",
                    background:  "transparent",
                    fontSize:    "1.5rem",
                    cursor:      "pointer",
                  }}
                >
                  ×
                </button>
              </div>
              <div className="modal-body header-from p-05">
                <div className="table-responsive p-0">
                  <table
                    id="table-address-thai-user"
                    className="p-0 table display table-bordered table-striped dataTable no-footer dtr-inline"
                  >
                    <thead>
                      <tr className="text-center">
                        <th>ID</th>
                        <th>ที่อยู่</th>
                        <th>เลือก</th>
                      </tr>
                    </thead>
                    <tbody>
                      {addresses.map((a) => (
                        <tr
                          key={a.addressID}
                          className="cursor-pointer addressIDOptionPCS"
                        >
                          <td
                            className="font-0"
                            style={{ minWidth: "25px" }}
                          >
                            {a.addressID}
                          </td>
                          <td>{a.fullAddress}</td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-outline-success btn-rounded btn-sm"
                              onClick={() => selectAddress(a.addressID)}
                            >
                              เลือก
                            </button>
                          </td>
                        </tr>
                      ))}
                      {/* The legacy "PCS" warehouse pickup row — always
                          present at the bottom (cart.php L110-114). */}
                      <tr className="cursor-pointer addressIDOptionPCS">
                        <td className="font-0">PCS</td>
                        <td>{warehouseAddress}</td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn btn-outline-success btn-rounded btn-sm"
                            onClick={() => selectAddress("PCS")}
                          >
                            เลือก
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-min-width round btn-cart"
                  onClick={closeModal}
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PCS เหมาๆ promo modal — cart.php L737-754. Shown when the
          selected address qualifies (eligible map = true). Accepting
          ticks the `pro` checkbox in the order-summary card via the
          `pro` form input below (sibling form input keeps the legacy
          submit shape — addOrder reads `pro=f`). ── */}
      {maomaoOpen && eligible && (
        <div
          id="pro-maomao"
          className="modal fade show"
          tabIndex={-1}
          role="dialog"
          aria-hidden="false"
          style={{
            display:        "block",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissMaomao();
          }}
        >
          <div className="pcs-notify modal-dialog modal-sm">
            <div
              className="modal-content modal-content-pcs"
              style={{ backgroundColor: "unset" }}
            >
              <div className="modal-header">
                <span className="text-white font-1_7rem">
                  คุณได้รับสิทธิ์ร่วมโปรโมชัน Pacred เหมา ๆ{" "}
                </span>
                <button
                  type="button"
                  className="close text-white"
                  onClick={dismissMaomao}
                  aria-label="ปิด"
                  style={{
                    opacity:      1,
                    border:       "2px solid",
                    borderRadius: "20px",
                  }}
                >
                  <i
                    className="la la-close text-white"
                    style={{ fontSize: "1.5rem" }}
                  ></i>
                </button>
              </div>
              <div className="modal-body">
                <div className="bg-pro-valentine">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/legacy/pcs/theme/free50-3.png"
                    className="img-fluid"
                    alt=""
                  />
                </div>
                <div
                  className="modal-footer text-center"
                  style={{ display: "inherit" }}
                >
                  <span
                    className="btn btn-main round btn-min-width animate__animated animate__infinite animate__headShake cursor-pointer"
                    id="btn-getMaoMao"
                    onClick={acceptMaomao}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") acceptMaomao();
                    }}
                  >
                    รับโปรโมชัน เหมา ๆ
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The visible `name="pro"` checkbox lives in <CartInteractivity>
          (the order-summary promotion card — cart.php L658-666). We
          DON'T render a second `pro` input here to avoid duplicate
          form fields. The bridge:
            - On accept → dispatch `cart-maomao-accepted` event;
              <CartInteractivity> ticks its `#input-12` checkbox.
            - The `.maomao` visibility toggle that legacy fires on
              eligibility changes (cart.php L1004-1011) is a cosmetic
              class swap; <CartInteractivity> keeps the card visible
              by default — same as the legacy initial-render state.
          The `proMaomao` state here is local to drive the popup +
          `<select id="hShipBy">`'s `required` flag (cart.php L1023). */}
      <span
        hidden
        data-maomao-eligible={eligible ? "1" : "0"}
        data-selected-address-id={selectedID}
        data-pro-maomao={proMaomao ? "1" : "0"}
      />
    </>
  );
}
