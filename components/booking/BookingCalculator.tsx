"use client";

import { useState } from "react";
import { BookingHero }   from "./BookingHero";
import { BookingTabs }   from "./BookingTabs";
import { BookingSubbar } from "./BookingSubbar";
import { SalesModal }    from "./SalesModal";
import { CustomDropdown, TextDropdown } from "./CustomDropdown";
import { ResultBox }     from "./ResultBox";
import { calcLCL, calcFCL, calcTruck, calcAir } from "@/lib/booking-calculator";
import {
  SALES_CARDS,
  ORIGIN_SECTIONS,
  PRODUCT_SECTIONS_LCL,
  PRODUCT_SECTIONS_FCL,
  PRODUCT_SECTIONS_TRUCK,
  TRUCK_DEST_SECTIONS,
  AIR_ORIGIN_CHIPS,
  AIR_DEST_CHIPS,
  CUSTOMS_PORT_SECTIONS,
  CUSTOMS_COUNTRY_SECTIONS,
  CUSTOMS_PRODUCT_SECTIONS,
  PLATFORM_SECTIONS,
  CURRENCY_SECTIONS,
} from "@/lib/booking-data";
import type {
  TabMode, SeaMode, Term, LclDoc, FclSize, TruckSub,
  CalcResult,
  LCLForm, FCLForm, TruckForm, AirForm, CustomsForm, SourcingForm, RemitForm,
} from "@/types/booking";

const TEL = "02-055-6063";

function ctrl(className?: string) {
  return `w-full h-[42px] border border-gray-200 rounded-lg bg-white text-gray-800 text-sm font-medium px-3.5 transition-all hover:border-red-300 focus:outline-none focus:border-red-600 focus:shadow-[0_0_0_3px_rgba(220,38,38,0.12)] ${className ?? ""}`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[13px] font-bold text-gray-800 leading-none">{children}</label>;
}

function PanelFooter({ hint, calcLabel, onCalc, onModal }: {
  hint: string; calcLabel: string;
  onCalc: () => void; onModal: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-5 flex-wrap px-6 py-5 border-t border-gray-100 bg-white rounded-b-2xl mt-1">
      <p className="text-[13px] text-gray-500 leading-relaxed flex-1"
         dangerouslySetInnerHTML={{ __html: hint + `<br/><strong class="text-gray-800">โทร ${TEL}</strong>` }} />
      <div className="flex gap-3 shrink-0 flex-wrap">
        <button type="button" onClick={onModal}
          className="inline-flex items-center justify-center h-11 px-6 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-800 hover:border-gray-400 hover:bg-gray-50 transition-all hover:-translate-y-0.5">
          ติดต่อด่วน / ออกใบเสนอราคา
        </button>
        <button type="button" onClick={onCalc}
          className="inline-flex items-center justify-center h-11 px-6 rounded-lg bg-red-600 text-white text-sm font-bold shadow-[0_4px_12px_rgba(220,38,38,0.2)] hover:bg-red-700 hover:-translate-y-0.5 transition-all">
          {calcLabel}
        </button>
      </div>
    </div>
  );
}

export function BookingCalculator() {
  const [activeTab,  setActiveTab]  = useState<TabMode | null>(null);
  const [seaMode,    setSeaMode]    = useState<SeaMode>("lcl");
  const [lclTerm,    setLclTerm]    = useState<Term>("ddp");
  const [fclTerm,    setFclTerm]    = useState<Term>("ddp");
  const [lclDoc,     setLclDoc]     = useState<LclDoc>("invoice");
  const [fclSize,    setFclSize]    = useState<FclSize>("20ft");
  const [truckSub,   setTruckSub]   = useState<TruckSub>("share");
  const [srcDoc,     setSrcDoc]     = useState("invoice");
  const [modalOpen,  setModalOpen]  = useState(false);
  const [alertMsg,   setAlertMsg]   = useState("");

  // Form state per panel
  const [lclForm, setLclForm] = useState<LCLForm>({
    origin: "guangzhou", originLabel: "กวางโจว — Guangzhou",
    productType: "general", productLabel: "เสื้อผ้า / กระเป๋า / ของตกแต่ง",
    weight: "", cbm: "", cif: "", dateStart: "", dateEnd: "",
  });
  const [fclForm, setFclForm] = useState<FCLForm>({
    origin: "guangzhou", originLabel: "กวางโจว — Guangzhou",
    productType: "general", productLabel: "สินค้าทั่วไป / แฟชั่น / เฟอร์นิเจอร์",
    cbm: "", weight: "", cif: "", date: "",
  });
  const [truckForm, setTruckForm] = useState<TruckForm>({
    origin: "guangzhou", originLabel: "กวางโจว — Guangzhou",
    dest: "warehouse", destLabel: "โกดัง Pacred เพชรเกษม 77",
    productType: "general", productLabel: "สินค้าทั่วไป",
    weight: "", cbm: "", date: "",
  });
  const [airForm, setAirForm] = useState<AirForm>({
    origin: "ยังไม่กำหนด", dest: "ยังไม่กำหนด",
    weight: "", w: "", l: "", h: "",
  });
  const [customsForm, setCustomsForm] = useState<CustomsForm>({
    port: "", portLabel: "— เลือกด่านที่สินค้าติดอยู่ —",
    country: "china", countryLabel: "จีน",
    productType: "general", productLabel: "สินค้าทั่วไป",
    awb: "", contact: "",
  });
  const [sourcingForm, setSourcingForm] = useState<SourcingForm>({
    platform: "1688", platformLabel: "1688",
    url: "", qty: "", budget: "",
  });
  const [remitForm, setRemitForm] = useState<RemitForm>({
    currency: "cny", currencyLabel: "CNY (หยวน)",
    amount: "", country: "", purpose: "",
  });

  // Calc results
  const [lclResult,   setLclResult]   = useState<CalcResult | null>(null);
  const [fclResult,   setFclResult]   = useState<CalcResult | null>(null);
  const [truckResult, setTruckResult] = useState<CalcResult | null>(null);
  const [airResult,   setAirResult]   = useState<CalcResult | null>(null);

  function handleTabChange(mode: TabMode) {
    setActiveTab(prev => prev === mode ? null : mode);
    setAlertMsg("");
  }

  function showAlert(msg: string) {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(""), 4000);
  }

  function doCalcLCL() {
    if (!lclForm.cbm && !lclForm.weight) return showAlert("กรุณากรอก CBM หรือน้ำหนัก");
    const r = calcLCL(lclForm, lclTerm, lclDoc);
    setLclResult(r);
  }

  function doCalcFCL() {
    const r = calcFCL(fclForm, fclSize, fclTerm);
    setFclResult(r);
  }

  function doCalcTruck() {
    if (!truckForm.cbm && !truckForm.weight) return showAlert("กรุณากรอก CBM หรือน้ำหนัก");
    const r = calcTruck(truckForm, truckSub);
    setTruckResult(r);
  }

  function doCalcAir() {
    if (!airForm.weight && (!airForm.w || !airForm.l || !airForm.h)) return showAlert("กรุณากรอกน้ำหนักหรือขนาดกล่อง");
    const r = calcAir(airForm);
    setAirResult(r);
  }

  const panelOpen = activeTab !== null;

  return (
    <div className="w-full max-w-[1280px] mx-auto pb-10">
      <BookingHero activeTab={activeTab} seaMode={seaMode} />

      <div className="relative z-10 max-w-[1150px] mx-auto -mt-12 px-5">
        <div className="bg-white rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.08)] border border-gray-100">

          <BookingTabs active={activeTab} onChange={handleTabChange} />

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
          {activeTab === "sea" && seaMode === "lcl" && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label="ต้นทางในจีน" displayValue={lclForm.originLabel} sections={ORIGIN_SECTIONS}
                  onSelect={(v, l) => setLclForm(f => ({ ...f, origin: v, originLabel: l }))} />
                <CustomDropdown label="ประเภทสินค้า" displayValue={lclForm.productLabel} sections={PRODUCT_SECTIONS_LCL}
                  onSelect={(v, l) => setLclForm(f => ({ ...f, productType: v, productLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>น้ำหนักรวม (กก.)</FieldLabel>
                  <input type="number" min="0" step="0.1" placeholder="เช่น 120" className={ctrl()}
                    value={lclForm.weight} onChange={e => setLclForm(f => ({ ...f, weight: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>ปริมาตร CBM</FieldLabel>
                  <input type="number" min="0" step="0.01" placeholder="เช่น 1.5" className={ctrl()}
                    value={lclForm.cbm} onChange={e => setLclForm(f => ({ ...f, cbm: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>มูลค่า CIF (บาท)</FieldLabel>
                  <input type="number" min="0" step="100" placeholder="เช่น 80,000" className={ctrl()}
                    value={lclForm.cif} onChange={e => setLclForm(f => ({ ...f, cif: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>ช่วงวันที่ต้องการ</FieldLabel>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input type="date" className={ctrl()} value={lclForm.dateStart} onChange={e => setLclForm(f => ({ ...f, dateStart: e.target.value }))} />
                    <input type="date" className={ctrl()} value={lclForm.dateEnd}   onChange={e => setLclForm(f => ({ ...f, dateEnd: e.target.value }))} />
                  </div>
                </div>
              </div>
              {lclResult && <ResultBox result={lclResult} />}
              <PanelFooter hint="ราคาประเมินเบื้องต้น — Incoterms และราคาจริงภายใน 5 นาที"
                calcLabel="คำนวณราคา LCL" onCalc={doCalcLCL} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── FCL Panel ── */}
          {activeTab === "sea" && seaMode === "fcl" && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label="ต้นทางในจีน" displayValue={fclForm.originLabel} sections={ORIGIN_SECTIONS}
                  onSelect={(v, l) => setFclForm(f => ({ ...f, origin: v, originLabel: l }))} />
                <CustomDropdown label="ประเภทสินค้า" displayValue={fclForm.productLabel} sections={PRODUCT_SECTIONS_FCL}
                  onSelect={(v, l) => setFclForm(f => ({ ...f, productType: v, productLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>ปริมาตรสินค้า CBM</FieldLabel>
                  <input type="number" min="0" step="0.1" placeholder="เช่น 25.5" className={ctrl()}
                    value={fclForm.cbm} onChange={e => setFclForm(f => ({ ...f, cbm: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>น้ำหนักรวม (กก.)</FieldLabel>
                  <input type="number" min="0" step="10" placeholder="เช่น 8,000" className={ctrl()}
                    value={fclForm.weight} onChange={e => setFclForm(f => ({ ...f, weight: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>มูลค่า CIF (บาท)</FieldLabel>
                  <input type="number" min="0" step="1000" placeholder="เช่น 500,000" className={ctrl()}
                    value={fclForm.cif} onChange={e => setFclForm(f => ({ ...f, cif: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>วันที่ต้องการบรรจุตู้</FieldLabel>
                  <input type="date" className={ctrl()} value={fclForm.date} onChange={e => setFclForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              {fclResult && <ResultBox result={fclResult} />}
              <PanelFooter hint="ราคาขึ้นอยู่กับเส้นทาง ท่าเรือ และช่วงเวลา — ผู้เชี่ยวชาญยืนยันราคาภายใน 15 นาที"
                calcLabel="คำนวณราคา FCL" onCalc={doCalcFCL} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Truck Panel ── */}
          {activeTab === "truck" && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label="ต้นทางในจีน" displayValue={truckForm.originLabel} sections={ORIGIN_SECTIONS}
                  onSelect={(v, l) => setTruckForm(f => ({ ...f, origin: v, originLabel: l }))} />
                <CustomDropdown label="ปลายทางในไทย" displayValue={truckForm.destLabel} sections={TRUCK_DEST_SECTIONS}
                  onSelect={(v, l) => setTruckForm(f => ({ ...f, dest: v, destLabel: l }))} />
                <CustomDropdown label="ประเภทสินค้า" displayValue={truckForm.productLabel} sections={PRODUCT_SECTIONS_TRUCK}
                  onSelect={(v, l) => setTruckForm(f => ({ ...f, productType: v, productLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>น้ำหนักรวม (กก.)</FieldLabel>
                  <input type="number" min="0" step="1" placeholder="เช่น 500" className={ctrl()}
                    value={truckForm.weight} onChange={e => setTruckForm(f => ({ ...f, weight: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>ปริมาตร CBM</FieldLabel>
                  <input type="number" min="0" step="0.01" placeholder="เช่น 3.5" className={ctrl()}
                    value={truckForm.cbm} onChange={e => setTruckForm(f => ({ ...f, cbm: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>วันที่ต้องการรับสินค้า</FieldLabel>
                  <input type="date" className={ctrl()} value={truckForm.date} onChange={e => setTruckForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              {truckResult && <ResultBox result={truckResult} />}
              <PanelFooter hint="DDP จ่ายครั้งเดียวรวมภาษี ส่งถึงหน้าบ้าน — ผู้เชี่ยวชาญยืนยันราคาจริงใน 5 นาที"
                calcLabel="คำนวณราคา DDP" onCalc={doCalcTruck} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Air Panel ── */}
          {activeTab === "air" && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <TextDropdown label="ประเทศ / สนามบิน ต้นทาง" value={airForm.origin}
                  onChange={v => setAirForm(f => ({ ...f, origin: v }))}
                  suggestions={AIR_ORIGIN_CHIPS} placeholder="พิมพ์หรือเลือกจากรายการ" />
                <TextDropdown label="ประเทศ / สนามบิน ปลายทาง" value={airForm.dest}
                  onChange={v => setAirForm(f => ({ ...f, dest: v }))}
                  suggestions={AIR_DEST_CHIPS} placeholder="พิมพ์หรือเลือกจากรายการ" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>น้ำหนักจริง (กก.)</FieldLabel>
                  <input type="number" min="0" step="0.1" placeholder="เช่น 50" className={ctrl()}
                    value={airForm.weight} onChange={e => setAirForm(f => ({ ...f, weight: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <FieldLabel>ขนาดกล่อง กว้าง × ยาว × สูง (ซม.)</FieldLabel>
                  <div className="grid grid-cols-3 gap-2.5">
                    <input type="number" min="0" step="1" placeholder="กว้าง" className={ctrl()}
                      value={airForm.w} onChange={e => setAirForm(f => ({ ...f, w: e.target.value }))} />
                    <input type="number" min="0" step="1" placeholder="ยาว" className={ctrl()}
                      value={airForm.l} onChange={e => setAirForm(f => ({ ...f, l: e.target.value }))} />
                    <input type="number" min="0" step="1" placeholder="สูง" className={ctrl()}
                      value={airForm.h} onChange={e => setAirForm(f => ({ ...f, h: e.target.value }))} />
                  </div>
                </div>
              </div>
              {airResult && <ResultBox result={airResult} />}
              <PanelFooter hint="คิดจาก Chargeable Wt = Max(น้ำหนักจริง, น้ำหนักปริมาตร กล่อง÷6000)"
                calcLabel="คำนวณราคาอากาศ" onCalc={doCalcAir} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Customs Panel ── */}
          {activeTab === "customs" && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label="ด่านศุลกากร / ท่าเรือ" displayValue={customsForm.portLabel} sections={CUSTOMS_PORT_SECTIONS}
                  onSelect={(v, l) => setCustomsForm(f => ({ ...f, port: v, portLabel: l }))} />
                <CustomDropdown label="ประเทศต้นทางสินค้า" displayValue={customsForm.countryLabel} sections={CUSTOMS_COUNTRY_SECTIONS}
                  onSelect={(v, l) => setCustomsForm(f => ({ ...f, country: v, countryLabel: l }))} />
                <CustomDropdown label="ประเภทสินค้า" displayValue={customsForm.productLabel} sections={CUSTOMS_PRODUCT_SECTIONS}
                  onSelect={(v, l) => setCustomsForm(f => ({ ...f, productType: v, productLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>เลขที่ใบขนสินค้า / AWB</FieldLabel>
                  <input type="text" placeholder="เช่น 1101-XXXXXXXX" className={ctrl()}
                    value={customsForm.awb} onChange={e => setCustomsForm(f => ({ ...f, awb: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>เบอร์โทรติดต่อ</FieldLabel>
                  <input type="text" placeholder="เช่น 08X-XXX-XXXX" className={ctrl()}
                    value={customsForm.contact} onChange={e => setCustomsForm(f => ({ ...f, contact: e.target.value }))} />
                </div>
              </div>
              <PanelFooter hint="ทีมงานพร้อมดำเนินการทุกด่าน ท่าเรือ สนามบิน ด่านชายแดน"
                calcLabel="ติดต่อเจ้าหน้าที่" onCalc={() => setModalOpen(true)} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Sourcing Panel ── */}
          {activeTab === "sourcing" && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label="แพลตฟอร์ม" displayValue={sourcingForm.platformLabel} sections={PLATFORM_SECTIONS}
                  onSelect={(v, l) => setSourcingForm(f => ({ ...f, platform: v, platformLabel: l }))} />
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <FieldLabel>ลิงก์สินค้า</FieldLabel>
                  <input type="text" placeholder="วางลิงก์สินค้าที่นี่" className={ctrl()}
                    value={sourcingForm.url} onChange={e => setSourcingForm(f => ({ ...f, url: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>จำนวน (ชิ้น)</FieldLabel>
                  <input type="number" min="0" placeholder="เช่น 100" className={ctrl()}
                    value={sourcingForm.qty} onChange={e => setSourcingForm(f => ({ ...f, qty: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>งบประมาณ (บาท)</FieldLabel>
                  <input type="number" min="0" placeholder="เช่น 50,000" className={ctrl()}
                    value={sourcingForm.budget} onChange={e => setSourcingForm(f => ({ ...f, budget: e.target.value }))} />
                </div>
              </div>
              <PanelFooter hint="ฝากสั่ง ฝากชำระ นำส่งถึงไทย ครบจบในที่เดียว"
                calcLabel="ส่งรายการสั่งซื้อ" onCalc={() => setModalOpen(true)} onModal={() => setModalOpen(true)} />
            </div>
          )}

          {/* ── Remit Panel ── */}
          {activeTab === "remit" && (
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                <CustomDropdown label="สกุลเงิน" displayValue={remitForm.currencyLabel} sections={CURRENCY_SECTIONS}
                  onSelect={(v, l) => setRemitForm(f => ({ ...f, currency: v, currencyLabel: l }))} />
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>จำนวนเงิน</FieldLabel>
                  <input type="number" min="0" placeholder="เช่น 10,000" className={ctrl()}
                    value={remitForm.amount} onChange={e => setRemitForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>ประเทศปลายทาง</FieldLabel>
                  <input type="text" placeholder="เช่น จีน" className={ctrl()}
                    value={remitForm.country} onChange={e => setRemitForm(f => ({ ...f, country: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <FieldLabel>วัตถุประสงค์</FieldLabel>
                  <input type="text" placeholder="เช่น ชำระค่าสินค้า" className={ctrl()}
                    value={remitForm.purpose} onChange={e => setRemitForm(f => ({ ...f, purpose: e.target.value }))} />
                </div>
              </div>
              <PanelFooter hint="เรทดีกว่าธนาคาร ปลอดภัย โปร่งใส — โอนตรงถึงซัพพลายเออร์"
                calcLabel="ขอใบเสนอราคา" onCalc={() => setModalOpen(true)} onModal={() => setModalOpen(true)} />
            </div>
          )}

        </div>
      </div>

      <SalesModal open={modalOpen} onClose={() => setModalOpen(false)} cards={SALES_CARDS} />
    </div>
  );
}
