"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateFreightShipment } from "@/actions/admin/freight-shipments";
import {
  FREIGHT_TRANSPORT_MODES, FREIGHT_TRANSPORT_MODE_LABEL,
  INCOTERMS,
  type FreightTransportMode, type Incoterm,
} from "@/lib/validators/freight-shipment";

export function NewShipmentForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [profileId,    setProfileId]    = useState("");
  const [mode,         setMode]         = useState<FreightTransportMode>("sea_lcl");
  const [containerCode,setContainerCode]= useState("");
  const [carrierNo,    setCarrierNo]    = useState("");
  const [blNo,         setBlNo]         = useState("");
  const [vesselVoyage, setVesselVoyage] = useState("");
  const [portLoad,     setPortLoad]     = useState("");
  const [portDisch,    setPortDisch]    = useState("");
  const [placeDel,     setPlaceDel]     = useState("");
  const [incoterm,     setIncoterm]     = useState<Incoterm | "">("");
  const [paymentTerm,  setPaymentTerm]  = useState("");
  const [originCountry,setOriginCountry]= useState("CHINA");
  const [notes,        setNotes]        = useState("");
  const [err,          setErr]          = useState<string | null>(null);

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await adminCreateFreightShipment({
        profile_id:           profileId.trim(),
        transport_mode:       mode,
        container_code:       containerCode.trim() || undefined,
        carrier_container_no: carrierNo.trim() || undefined,
        bl_no:                blNo.trim() || undefined,
        vessel_voyage:        vesselVoyage.trim() || undefined,
        port_loading:         portLoad.trim() || undefined,
        port_discharge:       portDisch.trim() || undefined,
        place_delivery:       placeDel.trim() || undefined,
        incoterm:             incoterm || undefined,
        payment_term:         paymentTerm.trim() || undefined,
        origin_country:       originCountry.trim() || "CHINA",
        notes:                notes.trim() || undefined,
      });
      if (res.ok) {
        router.push(`/admin/freight/shipments/${res.data!.id}`);
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => { e.preventDefault(); fire(); }}
    >
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">ลูกค้า</h2>
        <Field label="Customer profile UUID" required>
          <input
            type="text"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
            placeholder="หา UUID จาก /admin/customers (member_code → profile)"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
            required
          />
        </Field>
        <p className="text-[10px] text-muted">
          (V-E1.1 จะมี customer-picker dropdown — ตอนนี้ paste UUID ตรงๆ)
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">การขนส่ง</h2>
        <Field label="โหมดขนส่ง" required>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as FreightTransportMode)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          >
            {FREIGHT_TRANSPORT_MODES.map((m) => (
              <option key={m} value={m}>{FREIGHT_TRANSPORT_MODE_LABEL[m]}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Container code (Pacred internal)">
            <input type="text" value={containerCode} onChange={(e) => setContainerCode(e.target.value)} placeholder="GZE2614 / GZS2614" maxLength={50} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono" />
          </Field>
          <Field label="Carrier container no. (B/L)">
            <input type="text" value={carrierNo} onChange={(e) => setCarrierNo(e.target.value)} placeholder="SLVU4871649" maxLength={50} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono" />
          </Field>
          <Field label="B/L number">
            <input type="text" value={blNo} onChange={(e) => setBlNo(e.target.value)} placeholder="CULU0240526001" maxLength={80} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono" />
          </Field>
        </div>
        <Field label="Vessel + voyage">
          <input type="text" value={vesselVoyage} onChange={(e) => setVesselVoyage(e.target.value)} placeholder="M. MARINER 2614S" maxLength={120} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Port of Loading">
            <input type="text" value={portLoad} onChange={(e) => setPortLoad(e.target.value)} placeholder="NANSHA" maxLength={100} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
          <Field label="Port of Discharge">
            <input type="text" value={portDisch} onChange={(e) => setPortDisch(e.target.value)} placeholder="LAEM CHABANG" maxLength={100} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
          <Field label="Place of Delivery">
            <input type="text" value={placeDel} onChange={(e) => setPlaceDel(e.target.value)} placeholder="โกดังลูกค้า" maxLength={100} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Incoterm">
            <select
              value={incoterm}
              onChange={(e) => setIncoterm(e.target.value as Incoterm)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="">— ไม่ระบุ —</option>
              {INCOTERMS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </Field>
          <Field label="Payment term">
            <input type="text" value={paymentTerm} onChange={(e) => setPaymentTerm(e.target.value)} placeholder="T/T" maxLength={50} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
          <Field label="ประเทศต้นทาง">
            <input type="text" value={originCountry} onChange={(e) => setOriginCountry(e.target.value)} placeholder="CHINA" maxLength={50} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </Field>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="font-bold text-sm">บันทึก</h2>
        <Field label="Notes">
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </Field>
      </section>

      <p className="text-[11px] text-muted">
        💡 commercial value block (USD / exchange rate / declared value / duty / VAT) + parties (shipper/consignee) + invoice line items กรอกในหน้า detail หลังบันทึก
      </p>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="flex gap-3 pt-2 border-t border-border">
        <button
          type="submit"
          disabled={pending || profileId.trim().length === 0}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "✓ สร้าง draft + ไปหน้า detail"}
        </button>
        <button
          type="button"
          onClick={() => history.back()}
          disabled={pending}
          className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}{required && <span className="text-red-500">*</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function translateError(code: string): string {
  if (code.startsWith("serial_reserve_failed")) return `จองเลขที่ไม่สำเร็จ: ${code}`;
  if (code.startsWith("insert_failed"))         return `บันทึกล้มเหลว: ${code}`;
  return code;
}
