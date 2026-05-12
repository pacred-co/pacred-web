import type { TabMode, SeaMode, Term, LclDoc, FclSize, TruckSub } from "@/types/booking";

interface Chip { label: string; active: boolean; onClick: () => void }

function ChipRow({ chips }: { chips: Chip[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={c.onClick}
          className={`px-3.5 py-1.5 rounded-full border text-[13px] font-semibold whitespace-nowrap transition-all ${
            c.active
              ? "bg-red-600 border-red-600 text-white shadow-[0_2px_8px_rgba(220,38,38,0.2)]"
              : "bg-white border-gray-200 text-gray-500 hover:border-red-500 hover:text-red-600"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-gray-200 shrink-0" />;
}

interface BookingSubbarProps {
  activeTab: TabMode;
  seaMode: SeaMode;
  onSeaModeChange: (m: SeaMode) => void;
  lclTerm: Term;
  onLclTermChange: (t: Term) => void;
  lclDoc: LclDoc;
  onLclDocChange: (d: LclDoc) => void;
  fclSize: FclSize;
  onFclSizeChange: (s: FclSize) => void;
  fclTerm: Term;
  onFclTermChange: (t: Term) => void;
  truckSub: TruckSub;
  onTruckSubChange: (s: TruckSub) => void;
  srcDoc: string;
  onSrcDocChange: (d: string) => void;
}

export function BookingSubbar(props: BookingSubbarProps) {
  const { activeTab, seaMode } = props;

  const visible = activeTab === "sea" || activeTab === "truck" || activeTab === "sourcing";
  if (!visible) return null;

  const baseWrap = "border-b border-gray-100 bg-[#fcfcfd] py-3.5 px-5";

  if (activeTab === "sea") {
    return (
      <div className={baseWrap}>
        {/* LCL / FCL toggle */}
        <div className="flex justify-center mb-3">
          <div className="flex bg-gray-200 rounded-xl p-1">
            {(["lcl", "fcl"] as SeaMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => props.onSeaModeChange(m)}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  seaMode === m
                    ? "bg-white text-red-600 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
                    : "text-gray-500"
                }`}
              >
                {m === "lcl" ? "LCL แชร์ตู้" : "FCL เหมาตู้"}
              </button>
            ))}
          </div>
        </div>

        {seaMode === "lcl" && (
          <div className="flex flex-wrap gap-3 items-center justify-center">
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-bold text-gray-600">ขอบเขตบริการ</span>
              <ChipRow chips={[
                { label: "DDP (ครบจบรวมภาษี)", active: props.lclTerm === "ddp", onClick: () => props.onLclTermChange("ddp") },
                { label: "EXW (ยกเว้นภาษี)",   active: props.lclTerm === "exw", onClick: () => props.onLclTermChange("exw") },
                { label: "FOB (ถึงท่าเรือไทย)",  active: props.lclTerm === "fob", onClick: () => props.onLclTermChange("fob") },
              ]} />
            </div>
            <Divider />
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-bold text-gray-600">เอกสาร</span>
              <ChipRow chips={[
                { label: "ขอเอกสารกำกับภาษี", active: props.lclDoc === "invoice", onClick: () => props.onLclDocChange("invoice") },
                { label: "ขอใบขนสินค้า",      active: props.lclDoc === "customs", onClick: () => props.onLclDocChange("customs") },
                { label: "ไม่รับเอกสาร",       active: props.lclDoc === "none",    onClick: () => props.onLclDocChange("none") },
              ]} />
            </div>
          </div>
        )}

        {seaMode === "fcl" && (
          <div className="flex flex-wrap gap-3 items-center justify-center">
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-bold text-gray-600">ขนาดตู้</span>
              <ChipRow chips={[
                { label: "20ft (32 CBM)", active: props.fclSize === "20ft", onClick: () => props.onFclSizeChange("20ft") },
                { label: "40ft (68 CBM)", active: props.fclSize === "40ft", onClick: () => props.onFclSizeChange("40ft") },
              ]} />
            </div>
            <Divider />
            <div className="flex items-center gap-2.5">
              <span className="text-[12px] font-bold text-gray-600">ขอบเขตบริการ</span>
              <ChipRow chips={[
                { label: "DDP (ครบจบรวมภาษี)", active: props.fclTerm === "ddp", onClick: () => props.onFclTermChange("ddp") },
                { label: "EXW (ยกเว้นภาษี)",   active: props.fclTerm === "exw", onClick: () => props.onFclTermChange("exw") },
                { label: "FOB (ถึงท่าเรือไทย)",  active: props.fclTerm === "fob", onClick: () => props.onFclTermChange("fob") },
              ]} />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "truck") {
    return (
      <div className={`${baseWrap} flex flex-wrap gap-3 items-center justify-center`}>
        <span className="text-[12px] font-bold text-gray-600">รูปแบบขนส่ง</span>
        <ChipRow chips={[
          { label: "แชร์รถ (ประหยัด)", active: props.truckSub === "share", onClick: () => props.onTruckSubChange("share") },
          { label: "เหมารถ (รวดเร็ว)", active: props.truckSub === "full",  onClick: () => props.onTruckSubChange("full") },
        ]} />
      </div>
    );
  }

  if (activeTab === "sourcing") {
    return (
      <div className={`${baseWrap} flex flex-wrap gap-3 items-center justify-center`}>
        <span className="text-[12px] font-bold text-gray-600">เอกสาร</span>
        <ChipRow chips={[
          { label: "ขอเอกสารกำกับภาษี", active: props.srcDoc === "invoice", onClick: () => props.onSrcDocChange("invoice") },
          { label: "ขอใบขนสินค้า",      active: props.srcDoc === "customs", onClick: () => props.onSrcDocChange("customs") },
          { label: "ไม่รับเอกสาร",       active: props.srcDoc === "none",    onClick: () => props.onSrcDocChange("none") },
        ]} />
      </div>
    );
  }

  return null;
}
