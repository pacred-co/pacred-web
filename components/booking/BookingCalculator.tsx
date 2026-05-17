"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { BookingHero }   from "./BookingHero";
import { BookingTabs }   from "./BookingTabs";
import { BookingPortTabs, type CustomsPortCode } from "./BookingPortTabs";
import { BookingSubbar } from "./BookingSubbar";
import { SalesModal }    from "./SalesModal";
import { CustomDropdown, TextDropdown } from "./CustomDropdown";
import { ResultBox }     from "./ResultBox";
import { calcLCL, calcFCL, calcTruck, calcAir } from "@/lib/booking-calculator";
import { trackCtaClick } from "@/lib/analytics";
import { CONTACT } from "@/components/seo/site";
import {
  SALES_CARDS_DATA,
  ORIGIN_SECTIONS_KEYS,
  PRODUCT_SECTIONS_LCL_KEYS,
  PRODUCT_SECTIONS_FCL_KEYS,
  PRODUCT_SECTIONS_TRUCK_KEYS,
  TRUCK_DEST_SECTIONS_KEYS,
  AIR_ORIGIN_CHIP_KEYS,
  AIR_DEST_CHIP_KEYS,
  CUSTOMS_PORT_SECTIONS_KEYS,
  CUSTOMS_COUNTRY_SECTIONS_KEYS,
  CUSTOMS_PRODUCT_SECTIONS_KEYS,
  PLATFORM_SECTIONS,
  CURRENCY_SECTIONS_KEYS,
  resolveSections,
  resolveChips,
} from "@/lib/booking-data";
import type {
  TabMode, SeaMode, Term, LclDoc, FclSize, TruckSub,
  CalcResult, SalesCard,
  LCLForm, FCLForm, TruckForm, AirForm, CustomsForm, SourcingForm, RemitForm,
} from "@/types/booking";

function ctrl(className?: string) {
  return `w-full h-10 md:h-[42px] border border-gray-200 rounded-lg bg-white text-gray-800 text-[13px] md:text-sm font-medium px-3 md:px-3.5 transition-all hover:border-red-300 focus:outline-none focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)] ${className ?? ""}`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[12px] md:text-[13px] font-bold text-gray-800 leading-none">{children}</label>;
}

function PanelFooter({ hint, calcLabel, tel, callPrefix, contactLabel, onCalc, onModal }: {
  hint: string; calcLabel: string; tel: string; callPrefix: string; contactLabel: string;
  onCalc: () => void; onModal: () => void;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 md:gap-5 px-4 md:px-6 py-4 md:py-5 border-t border-gray-100 bg-white rounded-b-2xl mt-1">
      <p className="text-[12.5px] md:text-[13px] text-gray-500 leading-relaxed md:flex-1">
        {hint}
        <br />
        <strong className="text-gray-800">{callPrefix} {tel}</strong>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:flex gap-2.5 md:gap-3 md:shrink-0">
        <button type="button" suppressHydrationWarning onClick={onModal}
          className="inline-flex items-center justify-center h-11 px-4 md:px-6 rounded-lg border border-gray-200 bg-white text-[13px] md:text-sm font-bold text-gray-800 hover:border-gray-400 hover:bg-gray-50 transition-all hover:-translate-y-0.5">
          {contactLabel}
        </button>
        <button type="button" suppressHydrationWarning onClick={onCalc}
          className="inline-flex items-center justify-center h-11 px-4 md:px-6 rounded-lg bg-red-600 text-white text-[13px] md:text-sm font-bold shadow-[0_4px_12px_rgba(220,38,38,0.2)] hover:bg-red-700 hover:-translate-y-0.5 transition-all">
          {calcLabel}
        </button>
      </div>
    </div>
  );
}

export function BookingCalculator({ landing }: { landing?: TabMode } = {}) {
  const t = useTranslations("bookingCalc");
  const tData = useTranslations("bookingCalc.data");
  const tCalc = useTranslations("bookingCalc.calc");
  const tLcl = useTranslations("bookingCalc.lcl");
  const tFcl = useTranslations("bookingCalc.fcl");
  const tTruck = useTranslations("bookingCalc.truck");
  const tAir = useTranslations("bookingCalc.air");
  const tCustoms = useTranslations("bookingCalc.customs");
  const tSourcing = useTranslations("bookingCalc.sourcing");
  const tRemit = useTranslations("bookingCalc.remit");
  const tSales = useTranslations("salesTeam");

  // Phone shown in the panel footer hint — import from the canonical
  // CONTACT constant (per AGENTS.md §7) instead of a hardcoded i18n
  // string, so updating the sales number ripples to every surface.
  const tel = CONTACT.phoneDisplay;
  const callPrefix = t("callPrefix");
  const contactLabel = t("contactQuote");

  // Resolve i18n data structures
  const ORIGIN_SECTIONS = useMemo(() => resolveSections(ORIGIN_SECTIONS_KEYS, tData), [tData]);
  const PRODUCT_SECTIONS_LCL = useMemo(() => resolveSections(PRODUCT_SECTIONS_LCL_KEYS, tData), [tData]);
  const PRODUCT_SECTIONS_FCL = useMemo(() => resolveSections(PRODUCT_SECTIONS_FCL_KEYS, tData), [tData]);
  const PRODUCT_SECTIONS_TRUCK = useMemo(() => resolveSections(PRODUCT_SECTIONS_TRUCK_KEYS, tData), [tData]);
  const TRUCK_DEST_SECTIONS = useMemo(() => resolveSections(TRUCK_DEST_SECTIONS_KEYS, tData), [tData]);
  const CUSTOMS_PORT_SECTIONS = useMemo(() => resolveSections(CUSTOMS_PORT_SECTIONS_KEYS, tData), [tData]);
  const CUSTOMS_COUNTRY_SECTIONS = useMemo(() => resolveSections(CUSTOMS_COUNTRY_SECTIONS_KEYS, tData), [tData]);
  const CUSTOMS_PRODUCT_SECTIONS = useMemo(() => resolveSections(CUSTOMS_PRODUCT_SECTIONS_KEYS, tData), [tData]);
  const CURRENCY_SECTIONS = useMemo(() => resolveSections(CURRENCY_SECTIONS_KEYS, tData), [tData]);

  const AIR_ORIGIN_CHIPS = useMemo(() => resolveChips(AIR_ORIGIN_CHIP_KEYS, tData), [tData]);
  const AIR_DEST_CHIPS = useMemo(() => resolveChips(AIR_DEST_CHIP_KEYS, tData), [tData]);

  // Resolved sales cards (i18n-ready)
  const salesCards: SalesCard[] = useMemo(() => SALES_CARDS_DATA.map((c) => ({
    name: c.name,
    phone: c.phone,
    image: c.image,
    link: c.link,
    slogan: tSales(`${c.personKey}.slogan`),
    alt:    tSales(`${c.personKey}.alt`),
    button: tSales(`${c.personKey}.button`),
  })), [tSales]);

  const isCustomsLanding = landing === "customs";

  const [activeTab,  setActiveTab]  = useState<TabMode | null>(landing ?? null);
  // Form panel stays closed by default — tab is highlighted via `activeTab` but
  // user has to click the tab to expand the form. Lets landing pages (eg.
  // /customs-clearance-shipping-suvarnabhumi) pre-highlight a tab without forcing the form open.
  const [panelOpen,  setPanelOpen]  = useState(false);
  // Customs landing tab strip — replaces the 6 mode tabs with 7 port tabs
  // (สุวรรณภูมิ / ดอนเมือง / ไปรษณีย์หลักสี่ / คลองเตย / แหลมฉบัง / ICD / ด่านชายแดน).
  // The selected port auto-fills customsForm.port + portLabel, so the form
  // below drops the "ด่านศุลกากร / Port" dropdown when in customs-landing mode.
  const [customsPort, setCustomsPort] = useState<CustomsPortCode | null>(null);
  const [seaMode,    setSeaMode]    = useState<SeaMode>("lcl");
  const [lclTerm,    setLclTerm]    = useState<Term>("ddp");
  const [fclTerm,    setFclTerm]    = useState<Term>("ddp");
  const [lclDoc,     setLclDoc]     = useState<LclDoc>("invoice");
  const [fclSize,    setFclSize]    = useState<FclSize>("20ft");
  const [truckSub,   setTruckSub]   = useState<TruckSub>("share");
  const [srcDoc,     setSrcDoc]     = useState("invoice");
  const [modalOpen,  setModalOpen]  = useState(false);
  const [alertMsg,   setAlertMsg]   = useState("");

  const [lclForm, setLclForm] = useState<LCLForm>({
    origin: "guangzhou", originLabel: tData("originGuangzhou"),
    productType: "general", productLabel: tData("productLcl1"),
    weight: "", cbm: "", cif: "", dateStart: "", dateEnd: "",
  });
  const [fclForm, setFclForm] = useState<FCLForm>({
    origin: "guangzhou", originLabel: tData("originGuangzhou"),
    productType: "general", productLabel: tData("productFclGeneral"),
    cbm: "", weight: "", cif: "", date: "",
  });
  const [truckForm, setTruckForm] = useState<TruckForm>({
    origin: "guangzhou", originLabel: tData("originGuangzhou"),
    dest: "warehouse", destLabel: tData("truckDestWarehouse"),
    productType: "general", productLabel: tData("productTruckGeneral"),
    weight: "", cbm: "", date: "",
  });
  const [airForm, setAirForm] = useState<AirForm>({
    origin: tData("airUndecided"), dest: tData("airUndecided"),
    weight: "", w: "", l: "", h: "",
  });
  const [customsForm, setCustomsForm] = useState<CustomsForm>({
    port: "", portLabel: "—",
    country: "china", countryLabel: tData("customsCountryChina"),
    productType: "general", productLabel: tData("productTruckGeneral"),
    awb: "", contact: "",
  });
  const [sourcingForm, setSourcingForm] = useState<SourcingForm>({
    platform: "1688", platformLabel: "1688",
    url: "", qty: "", budget: "",
  });
  const [remitForm, setRemitForm] = useState<RemitForm>({
    currency: "cny", currencyLabel: tData("currencyCny"),
    amount: "", country: "", purpose: "",
  });

  const [lclResult,   setLclResult]   = useState<CalcResult | null>(null);
  const [fclResult,   setFclResult]   = useState<CalcResult | null>(null);
  const [truckResult, setTruckResult] = useState<CalcResult | null>(null);
  const [airResult,   setAirResult]   = useState<CalcResult | null>(null);

  function handleTabChange(mode: TabMode) {
    if (panelOpen && activeTab === mode) {
      // Click the already-open tab → collapse panel, keep tab highlighted
      setPanelOpen(false);
    } else {
      setActiveTab(mode);
      setPanelOpen(true);
    }
    setAlertMsg("");
  }

  function handleCustomsPortChange(port: CustomsPortCode) {
    if (panelOpen && customsPort === port) {
      setPanelOpen(false);
    } else {
      setCustomsPort(port);
      setActiveTab("customs");
      setPanelOpen(true);
      setCustomsForm((f) => ({
        ...f,
        port,
        portLabel: tCustoms(`portTabs.${port}`),
      }));
    }
    setAlertMsg("");
  }

  function showAlert(msg: string) {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(""), 4000);
  }

  function doCalcLCL() {
    if (!lclForm.cbm && !lclForm.weight) return showAlert(t("alertWeightCbm"));
    setLclResult(calcLCL(lclForm, lclTerm, lclDoc, tCalc, t));
    trackCtaClick("booking_calculate", "home_booking", { mode: "lcl", term: lclTerm, doc: lclDoc });
  }

  function doCalcFCL() {
    setFclResult(calcFCL(fclForm, fclSize, fclTerm, tCalc, t));
    trackCtaClick("booking_calculate", "home_booking", { mode: "fcl", size: fclSize, term: fclTerm });
  }

  function doCalcTruck() {
    if (!truckForm.cbm && !truckForm.weight) return showAlert(t("alertWeightCbm"));
    setTruckResult(calcTruck(truckForm, truckSub, tCalc));
    trackCtaClick("booking_calculate", "home_booking", { mode: "truck", sub: truckSub });
  }

  function doCalcAir() {
    if (!airForm.weight && (!airForm.w || !airForm.l || !airForm.h)) return showAlert(t("alertAirSize"));
    setAirResult(calcAir(airForm, tCalc));
    trackCtaClick("booking_calculate", "home_booking", { mode: "air" });
  }

  return (
    <div className="w-full max-w-[1280px] mx-auto pb-6 md:pb-10">
      <BookingHero activeTab={activeTab} seaMode={seaMode} />

      <div className="relative z-10 max-w-[1280px] mx-auto -mt-10 md:-mt-16 px-3 md:px-5">
        <div className="bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-gray-100">

          {isCustomsLanding ? (
            <BookingPortTabs
              active={customsPort}
              onChange={handleCustomsPortChange}
            />
          ) : (
            <BookingTabs active={activeTab} onChange={handleTabChange} />
          )}

          {panelOpen && activeTab && (
            <BookingSubbar
              activeTab={activeTab}
              seaMode={seaMode}       onSeaModeChange={setSeaMode}
              lclTerm={lclTerm}       onLclTermChange={setLclTerm}
              lclDoc={lclDoc}         onLclDocChange={setLclDoc}
              fclSize={fclSize}       onFclSizeChange={setFclSize}
              fclTerm={fclTerm}       onFclTermChange={setFclTerm}
              truckSub={truckSub}     onTruckSubChange={setTruckSub}
              srcDoc={srcDoc}         onSrcDocChange={setSrcDoc}
            />
          )}

          {alertMsg && (
            <div className="mx-5 mt-5 p-3 bg-red-50 text-red-700 rounded-lg text-sm font-medium">
              {alertMsg}
            </div>
          )}

          {/* ── LCL Panel ── */}
          {panelOpen && activeTab === "sea" && seaMode === "lcl" && (
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label={tLcl("originLabel")} displayValue={lclForm.originLabel} sections={ORIGIN_SECTIONS}
                  onSelect={(v, l) => setLclForm(f => ({ ...f, origin: v, originLabel: l }))} />
                <CustomDropdown label={tLcl("productLabel")} displayValue={lclForm.productLabel} sections={PRODUCT_SECTIONS_LCL}
                  onSelect={(v, l) => setLclForm(f => ({ ...f, productType: v, productLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tLcl("weightLabel")}</FieldLabel>
                  <input type="number" min="0" step="0.1" placeholder={tLcl("weightPh")} className={ctrl()}
                    value={lclForm.weight} onChange={e => setLclForm(f => ({ ...f, weight: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tLcl("cbmLabel")}</FieldLabel>
                  <input type="number" min="0" step="0.01" placeholder={tLcl("cbmPh")} className={ctrl()}
                    value={lclForm.cbm} onChange={e => setLclForm(f => ({ ...f, cbm: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tLcl("cifLabel")}</FieldLabel>
                  <input type="number" min="0" step="100" placeholder={tLcl("cifPh")} className={ctrl()}
                    value={lclForm.cif} onChange={e => setLclForm(f => ({ ...f, cif: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tLcl("dateLabel")}</FieldLabel>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input type="date" className={ctrl()} value={lclForm.dateStart} onChange={e => setLclForm(f => ({ ...f, dateStart: e.target.value }))} />
                    <input type="date" className={ctrl()} value={lclForm.dateEnd}   onChange={e => setLclForm(f => ({ ...f, dateEnd: e.target.value }))} />
                  </div>
                </div>
              </div>
              {lclResult && (
                <ResultBox
                  result={lclResult}
                  quote={{
                    mode: "sea", transport: "ship", term: lclTerm,
                    price: lclResult.amount,
                    weightKg: Number(lclForm.weight) || undefined,
                    volumeCbm: Number(lclForm.cbm) || undefined,
                  }}
                />
              )}
              <PanelFooter hint={tLcl("hint")} calcLabel={tLcl("calcLabel")}
                tel={tel} callPrefix={callPrefix} contactLabel={contactLabel}
                onCalc={doCalcLCL} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── FCL Panel ── */}
          {panelOpen && activeTab === "sea" && seaMode === "fcl" && (
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label={tFcl("originLabel")} displayValue={fclForm.originLabel} sections={ORIGIN_SECTIONS}
                  onSelect={(v, l) => setFclForm(f => ({ ...f, origin: v, originLabel: l }))} />
                <CustomDropdown label={tFcl("productLabel")} displayValue={fclForm.productLabel} sections={PRODUCT_SECTIONS_FCL}
                  onSelect={(v, l) => setFclForm(f => ({ ...f, productType: v, productLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tFcl("cbmLabel")}</FieldLabel>
                  <input type="number" min="0" step="0.1" placeholder={tFcl("cbmPh")} className={ctrl()}
                    value={fclForm.cbm} onChange={e => setFclForm(f => ({ ...f, cbm: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tFcl("weightLabel")}</FieldLabel>
                  <input type="number" min="0" step="10" placeholder={tFcl("weightPh")} className={ctrl()}
                    value={fclForm.weight} onChange={e => setFclForm(f => ({ ...f, weight: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tFcl("cifLabel")}</FieldLabel>
                  <input type="number" min="0" step="1000" placeholder={tFcl("cifPh")} className={ctrl()}
                    value={fclForm.cif} onChange={e => setFclForm(f => ({ ...f, cif: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tFcl("dateLabel")}</FieldLabel>
                  <input type="date" className={ctrl()} value={fclForm.date} onChange={e => setFclForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              {fclResult && (
                <ResultBox
                  result={fclResult}
                  quote={{
                    mode: "sea", transport: "ship", term: fclTerm, size: fclSize,
                    price: fclResult.amount,
                    weightKg: Number(fclForm.weight) || undefined,
                    volumeCbm: Number(fclForm.cbm) || undefined,
                  }}
                />
              )}
              <PanelFooter hint={tFcl("hint")} calcLabel={tFcl("calcLabel")}
                tel={tel} callPrefix={callPrefix} contactLabel={contactLabel}
                onCalc={doCalcFCL} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Truck Panel ── */}
          {panelOpen && activeTab === "truck" && (
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label={tTruck("originLabel")} displayValue={truckForm.originLabel} sections={ORIGIN_SECTIONS}
                  onSelect={(v, l) => setTruckForm(f => ({ ...f, origin: v, originLabel: l }))} />
                <CustomDropdown label={tTruck("destLabel")} displayValue={truckForm.destLabel} sections={TRUCK_DEST_SECTIONS}
                  onSelect={(v, l) => setTruckForm(f => ({ ...f, dest: v, destLabel: l }))} />
                <CustomDropdown label={tTruck("productLabel")} displayValue={truckForm.productLabel} sections={PRODUCT_SECTIONS_TRUCK}
                  onSelect={(v, l) => setTruckForm(f => ({ ...f, productType: v, productLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tTruck("weightLabel")}</FieldLabel>
                  <input type="number" min="0" step="1" placeholder={tTruck("weightPh")} className={ctrl()}
                    value={truckForm.weight} onChange={e => setTruckForm(f => ({ ...f, weight: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tTruck("cbmLabel")}</FieldLabel>
                  <input type="number" min="0" step="0.01" placeholder={tTruck("cbmPh")} className={ctrl()}
                    value={truckForm.cbm} onChange={e => setTruckForm(f => ({ ...f, cbm: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tTruck("dateLabel")}</FieldLabel>
                  <input type="date" className={ctrl()} value={truckForm.date} onChange={e => setTruckForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              {truckResult && (
                <ResultBox
                  result={truckResult}
                  quote={{
                    mode: "truck", transport: "truck", sub: truckSub,
                    price: truckResult.amount,
                    weightKg: Number(truckForm.weight) || undefined,
                    volumeCbm: Number(truckForm.cbm) || undefined,
                  }}
                />
              )}
              <PanelFooter hint={tTruck("hint")} calcLabel={tTruck("calcLabel")}
                tel={tel} callPrefix={callPrefix} contactLabel={contactLabel}
                onCalc={doCalcTruck} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Air Panel ── */}
          {panelOpen && activeTab === "air" && (
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <TextDropdown label={tAir("originLabel")} value={airForm.origin}
                  onChange={v => setAirForm(f => ({ ...f, origin: v }))}
                  suggestions={AIR_ORIGIN_CHIPS} placeholder={tAir("suggestionsPh")} />
                <TextDropdown label={tAir("destLabel")} value={airForm.dest}
                  onChange={v => setAirForm(f => ({ ...f, dest: v }))}
                  suggestions={AIR_DEST_CHIPS} placeholder={tAir("suggestionsPh")} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tAir("weightLabel")}</FieldLabel>
                  <input type="number" min="0" step="0.1" placeholder={tAir("weightPh")} className={ctrl()}
                    value={airForm.weight} onChange={e => setAirForm(f => ({ ...f, weight: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <FieldLabel>{tAir("boxLabel")}</FieldLabel>
                  <div className="grid grid-cols-3 gap-2.5">
                    <input type="number" min="0" step="1" placeholder={tAir("boxWPh")} className={ctrl()}
                      value={airForm.w} onChange={e => setAirForm(f => ({ ...f, w: e.target.value }))} />
                    <input type="number" min="0" step="1" placeholder={tAir("boxLPh")} className={ctrl()}
                      value={airForm.l} onChange={e => setAirForm(f => ({ ...f, l: e.target.value }))} />
                    <input type="number" min="0" step="1" placeholder={tAir("boxHPh")} className={ctrl()}
                      value={airForm.h} onChange={e => setAirForm(f => ({ ...f, h: e.target.value }))} />
                  </div>
                </div>
              </div>
              {airResult && (
                <ResultBox
                  result={airResult}
                  quote={{
                    mode: "air", transport: "air",
                    price: airResult.amount,
                    weightKg: Number(airForm.weight) || undefined,
                  }}
                />
              )}
              <PanelFooter hint={tAir("hint")} calcLabel={tAir("calcLabel")}
                tel={tel} callPrefix={callPrefix} contactLabel={contactLabel}
                onCalc={doCalcAir} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Customs Panel ── */}
          {panelOpen && activeTab === "customs" && (
            <div className="p-4 md:p-6">
              {/* Layout
                 - customs landing (4 fields, port dropdown hidden):
                     mobile  → row1: country+product (2-col) · row2: AWB (full) · row3: phone (full) = 3 rows
                     desktop → 2 cols × 2 rows = balanced 4-field grid
                 - non-customs landing (5 fields incl. port dropdown):
                     keeps the original 3-col grid (3 dropdowns row 1, 2 inputs row 2) */}
              <div
                className={
                  isCustomsLanding
                    ? "grid grid-cols-2 gap-4 items-end"
                    : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end"
                }
              >
                {/* Port dropdown only shown when the tab strip ISN'T the port
                    tab strip — on the customs landing the active port tab
                    already populates customsForm.port, so this would be
                    redundant. */}
                {!isCustomsLanding && (
                  <CustomDropdown label={tCustoms("portLabel")} displayValue={customsForm.portLabel} sections={CUSTOMS_PORT_SECTIONS}
                    onSelect={(v, l) => setCustomsForm(f => ({ ...f, port: v, portLabel: l }))} />
                )}
                <CustomDropdown label={tCustoms("countryLabel")} displayValue={customsForm.countryLabel} sections={CUSTOMS_COUNTRY_SECTIONS}
                  onSelect={(v, l) => setCustomsForm(f => ({ ...f, country: v, countryLabel: l }))} />
                <CustomDropdown label={tCustoms("productLabel")} displayValue={customsForm.productLabel} sections={CUSTOMS_PRODUCT_SECTIONS}
                  onSelect={(v, l) => setCustomsForm(f => ({ ...f, productType: v, productLabel: l }))} />
                <div className={`flex flex-col gap-1.5 ${isCustomsLanding ? "col-span-2 md:col-span-1" : ""}`}>
                  <FieldLabel>{tCustoms("awbLabel")}</FieldLabel>
                  <input type="text" placeholder={tCustoms("awbPh")} className={ctrl()}
                    value={customsForm.awb} onChange={e => setCustomsForm(f => ({ ...f, awb: e.target.value }))} />
                </div>
                <div className={`flex flex-col gap-1.5 ${isCustomsLanding ? "col-span-2 md:col-span-1" : ""}`}>
                  <FieldLabel>{tCustoms("contactLabel")}</FieldLabel>
                  <input type="text" placeholder={tCustoms("contactPh")} className={ctrl()}
                    value={customsForm.contact} onChange={e => setCustomsForm(f => ({ ...f, contact: e.target.value }))} />
                </div>
              </div>
              <PanelFooter hint={tCustoms("hint")} calcLabel={tCustoms("calcLabel")}
                tel={tel} callPrefix={callPrefix} contactLabel={contactLabel}
                onCalc={() => setModalOpen(true)} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Sourcing Panel ── */}
          {panelOpen && activeTab === "sourcing" && (
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label={tSourcing("platformLabel")} displayValue={sourcingForm.platformLabel} sections={PLATFORM_SECTIONS}
                  onSelect={(v, l) => setSourcingForm(f => ({ ...f, platform: v, platformLabel: l }))} />
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <FieldLabel>{tSourcing("urlLabel")}</FieldLabel>
                  <input type="text" placeholder={tSourcing("urlPh")} className={ctrl()}
                    value={sourcingForm.url} onChange={e => setSourcingForm(f => ({ ...f, url: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tSourcing("qtyLabel")}</FieldLabel>
                  <input type="number" min="0" placeholder={tSourcing("qtyPh")} className={ctrl()}
                    value={sourcingForm.qty} onChange={e => setSourcingForm(f => ({ ...f, qty: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tSourcing("budgetLabel")}</FieldLabel>
                  <input type="number" min="0" placeholder={tSourcing("budgetPh")} className={ctrl()}
                    value={sourcingForm.budget} onChange={e => setSourcingForm(f => ({ ...f, budget: e.target.value }))} />
                </div>
              </div>
              <PanelFooter hint={tSourcing("hint")} calcLabel={tSourcing("calcLabel")}
                tel={tel} callPrefix={callPrefix} contactLabel={contactLabel}
                onCalc={() => setModalOpen(true)} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Remit Panel ── */}
          {panelOpen && activeTab === "remit" && (
            <div className="p-4 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label={tRemit("currencyLabel")} displayValue={remitForm.currencyLabel} sections={CURRENCY_SECTIONS}
                  onSelect={(v, l) => setRemitForm(f => ({ ...f, currency: v, currencyLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tRemit("amountLabel")}</FieldLabel>
                  <input type="number" min="0" placeholder={tRemit("amountPh")} className={ctrl()}
                    value={remitForm.amount} onChange={e => setRemitForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>{tRemit("countryLabel")}</FieldLabel>
                  <input type="text" placeholder={tRemit("countryPh")} className={ctrl()}
                    value={remitForm.country} onChange={e => setRemitForm(f => ({ ...f, country: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <FieldLabel>{tRemit("purposeLabel")}</FieldLabel>
                  <input type="text" placeholder={tRemit("purposePh")} className={ctrl()}
                    value={remitForm.purpose} onChange={e => setRemitForm(f => ({ ...f, purpose: e.target.value }))} />
                </div>
              </div>
              <PanelFooter hint={tRemit("hint")} calcLabel={tRemit("calcLabel")}
                tel={tel} callPrefix={callPrefix} contactLabel={contactLabel}
                onCalc={() => setModalOpen(true)} onModal={() => setModalOpen(true)} />
            </div>
          )}

        </div>
      </div>

      <SalesModal open={modalOpen} onClose={() => setModalOpen(false)} cards={salesCards} />
    </div>
  );
}
