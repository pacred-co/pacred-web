"use client";

/**
 * W11 — Customs doc-kit workspace (client).
 *
 * Three advisory / doc-generation tools (NO money / customs filing):
 *   1. Letter generator   — pick letter type + carrier + fields → POST
 *      /api/customs-letter → opens the PDF in a new tab. Optional prefill
 *      from a freight shipment id.
 *   2. Form-E eligibility — provisional ACFTA check (advisory · needs confirm).
 *   3. HS-code AI-assist  — suggestions (stub unless endpoint configured).
 *
 * Generating a draft letter PDF is not a destructive mutation, so it streams
 * straight to a new tab. All results carry the "advisory / draft" framing.
 */

import { useState, useTransition, useEffect, useRef } from "react";
import {
  adminCheckFormEEligibility,
  adminSuggestHsCodes,
  adminPrefillLetterFromShipment,
} from "@/actions/admin/customs-doc-kit";
import {
  CUSTOMS_CARRIERS,
  CUSTOMS_LETTER_TYPES,
  BL_RELEASE_STATUS_LABEL,
  findLetterType,
  type CustomsCarrierCode,
  type CustomsLetterType,
  type BlReleaseStatus,
} from "@/lib/customs/customs-letters";
import {
  FORM_E_ORIGIN_CRITERIA,
  FORM_E_ORIGIN_CRITERION_LABEL,
  type FormEOriginCriterion,
  type FormEEligibilityResult,
} from "@/lib/customs/form-e";
import type { HsAssistResult } from "@/lib/customs/hs-assist";

const NETBAY_NOTE =
  "การยื่นใบขนจริงผ่าน NETBAY ยังไม่เปิดใช้งาน (ยังไม่ได้รับ credentials) — เอกสารชุดนี้เป็นร่างสำหรับยื่นด้วยตนเอง · เลขควบคุมศุลกากร (customs control no.) คีย์เองในหน้าใบขน";

type LetterForm = {
  letterType: CustomsLetterType;
  carrierCode: CustomsCarrierCode | "";
  carrierNameOverride: string;
  jobNo: string;
  refNo: string;
  issueDateIso: string;
  senderName: string;
  senderAddress: string;
  senderTaxId: string;
  signatoryName: string;
  signatoryTitle: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneeTaxId: string;
  blNo: string;
  blStatus: BlReleaseStatus | "";
  vesselVoyage: string;
  portLoading: string;
  portDischarge: string;
  placeDelivery: string;
  containerNo: string;
  containerCodeInternal: string;
  cargoDescription: string;
  totalCartons: string;
  totalWeightKg: string;
  totalVolumeCbm: string;
  granteeName: string;
  granteeIdCardNo: string;
  awbTrackingNo: string;
  amendField: string;
  amendOldValue: string;
  amendNewValue: string;
  lostReceiptNumbers: string; // newline-separated in the textarea
  courierName: string;
  courierTrackingNo: string;
  policeReportNote: string;
  customsOffice: string;
  arrivalDateIso: string;
  estimatedDutyThb: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM: LetterForm = {
  letterType: "do_release",
  carrierCode: "",
  carrierNameOverride: "",
  jobNo: "",
  refNo: "",
  issueDateIso: todayIso(),
  senderName: "",
  senderAddress: "",
  senderTaxId: "",
  signatoryName: "",
  signatoryTitle: "",
  consigneeName: "",
  consigneeAddress: "",
  consigneeTaxId: "",
  blNo: "",
  blStatus: "",
  vesselVoyage: "",
  portLoading: "",
  portDischarge: "",
  placeDelivery: "",
  containerNo: "",
  containerCodeInternal: "",
  cargoDescription: "",
  totalCartons: "",
  totalWeightKg: "",
  totalVolumeCbm: "",
  granteeName: "",
  granteeIdCardNo: "",
  awbTrackingNo: "",
  amendField: "",
  amendOldValue: "",
  amendNewValue: "",
  lostReceiptNumbers: "",
  courierName: "",
  courierTrackingNo: "",
  policeReportNote: "",
  customsOffice: "",
  arrivalDateIso: "",
  estimatedDutyThb: "",
};

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-2.5 py-1.5 text-sm";
const labelCls = "block text-[11px] font-medium text-muted mb-0.5";

export function DocKitClient({ initialShipmentId }: { initialShipmentId?: string }) {
  return (
    <div className="space-y-6">
      <NetbayBanner />
      <LetterGenerator initialShipmentId={initialShipmentId} />
      <FormEChecker />
      <HsAssist />
    </div>
  );
}

function NetbayBanner() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
      <strong>🔒 NETBAY (ยื่นใบขนอิเล็กทรอนิกส์) — ยังไม่เปิดใช้งาน.</strong> {NETBAY_NOTE}
    </div>
  );
}

// ── 1) Letter generator ────────────────────────────────────────────────

function LetterGenerator({ initialShipmentId }: { initialShipmentId?: string }) {
  const [form, setForm] = useState<LetterForm>(EMPTY_FORM);
  const [shipmentId, setShipmentId] = useState(initialShipmentId ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const autoPrefilled = useRef(false);

  const meta = findLetterType(form.letterType);
  const needsCarrier = meta?.needsCarrier ?? false;
  const isSplit = form.letterType === "do_split";
  const isPoa = form.letterType === "poa";
  const isAmend = form.letterType === "amend";
  const isLost = form.letterType === "lost_doc";
  const isWaiver = form.letterType === "waiver_45";

  function set<K extends keyof LetterForm>(k: K, v: LetterForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function prefill() {
    const id = shipmentId.trim();
    if (!id) { setMsg("กรุณากรอก shipment id ก่อน prefill"); return; }
    setMsg(null);
    start(async () => {
      const res = await adminPrefillLetterFromShipment({ shipmentId: id });
      if (!res.ok) { setMsg(`ดึงข้อมูลไม่สำเร็จ: ${res.error}`); return; }
      const p = res.data ?? {};
      setForm((f) => ({
        ...f,
        carrierCode: p.carrierCode ?? f.carrierCode,
        jobNo: p.jobNo ?? f.jobNo,
        senderName: p.senderName ?? f.senderName,
        senderAddress: p.senderAddress ?? f.senderAddress,
        senderTaxId: p.senderTaxId ?? f.senderTaxId,
        signatoryTitle: p.signatoryTitle ?? f.signatoryTitle,
        consigneeName: p.consigneeName ?? f.consigneeName,
        consigneeAddress: p.consigneeAddress ?? f.consigneeAddress,
        consigneeTaxId: p.consigneeTaxId ?? f.consigneeTaxId ?? "",
        blNo: p.blNo ?? f.blNo,
        vesselVoyage: p.vesselVoyage ?? f.vesselVoyage,
        portLoading: p.portLoading ?? f.portLoading,
        portDischarge: p.portDischarge ?? f.portDischarge,
        placeDelivery: p.placeDelivery ?? f.placeDelivery,
        containerNo: p.containerNo ?? f.containerNo,
        containerCodeInternal: p.containerCodeInternal ?? f.containerCodeInternal,
      }));
      setMsg("ดึงข้อมูลจากงานเรียบร้อย — ตรวจสอบ/แก้ไขก่อนออกเอกสาร");
    });
  }

  // Auto-prefill once when deep-linked with ?shipment=<id> (from the
  // declaration / shipment detail page). Runs a single time on mount.
  useEffect(() => {
    if (autoPrefilled.current) return;
    if (!initialShipmentId) return;
    autoPrefilled.current = true;
    // Defer out of the effect body (prefill setStates) so we don't trigger a
    // synchronous setState-in-effect (react-hooks/set-state-in-effect). Runs the
    // one-time deep-link prefill on the next microtask — imperceptible.
    queueMicrotask(prefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialShipmentId]);

  function generate() {
    if (!form.consigneeName.trim()) { setMsg("กรุณากรอกชื่อผู้รับ (Consignee)"); return; }
    setMsg(null);
    const payload = {
      letterType: form.letterType,
      carrierCode: form.carrierCode || null,
      carrierNameOverride: form.carrierNameOverride || null,
      jobNo: form.jobNo || null,
      refNo: form.refNo || null,
      issueDateIso: form.issueDateIso,
      senderName: form.senderName || null,
      senderAddress: form.senderAddress || null,
      senderTaxId: form.senderTaxId || null,
      signatoryName: form.signatoryName || null,
      signatoryTitle: form.signatoryTitle || null,
      consigneeName: form.consigneeName,
      consigneeAddress: form.consigneeAddress || null,
      consigneeTaxId: form.consigneeTaxId || null,
      blNo: form.blNo || null,
      blStatus: form.blStatus || null,
      vesselVoyage: form.vesselVoyage || null,
      portLoading: form.portLoading || null,
      portDischarge: form.portDischarge || null,
      placeDelivery: form.placeDelivery || null,
      containerNo: form.containerNo || null,
      containerCodeInternal: form.containerCodeInternal || null,
      cargoDescription: form.cargoDescription || null,
      totalCartons: form.totalCartons ? Number(form.totalCartons) : null,
      totalWeightKg: form.totalWeightKg ? Number(form.totalWeightKg) : null,
      totalVolumeCbm: form.totalVolumeCbm ? Number(form.totalVolumeCbm) : null,
      granteeName: form.granteeName || null,
      granteeIdCardNo: form.granteeIdCardNo || null,
      awbTrackingNo: form.awbTrackingNo || null,
      amendField: form.amendField || null,
      amendOldValue: form.amendOldValue || null,
      amendNewValue: form.amendNewValue || null,
      lostReceiptNumbers: form.lostReceiptNumbers
        ? form.lostReceiptNumbers.split("\n").map((s) => s.trim()).filter(Boolean)
        : null,
      courierName: form.courierName || null,
      courierTrackingNo: form.courierTrackingNo || null,
      policeReportNote: form.policeReportNote || null,
      customsOffice: form.customsOffice || null,
      arrivalDateIso: form.arrivalDateIso || null,
      estimatedDutyThb: form.estimatedDutyThb ? Number(form.estimatedDutyThb) : null,
      splitSets: null, // split-set rows handled below via a separate state in a future iter
    };

    start(async () => {
      try {
        const res = await fetch("/api/customs-letter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setMsg(`ออกเอกสารไม่สำเร็จ: ${j.detail ?? j.error ?? res.status}`);
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setMsg("เปิดเอกสาร PDF ในแท็บใหม่แล้ว — โปรดประทับตรา + ลงนามก่อนใช้งานจริง");
      } catch {
        setMsg("เกิดข้อผิดพลาดขณะออกเอกสาร");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-4">
      <div>
        <h2 className="font-bold text-base">✉️ ออกจดหมายศุลกากร / สายเรือ</h2>
        <p className="text-xs text-muted mt-0.5">
          จดหมายแลก D/O (LOI) ตามสายเรือ · Split D/O · ผ่อนผัน 45 วัน · มอบอำนาจ · Amend · แจ้งเอกสารหาย — ออกเป็น PDF ร่าง
        </p>
      </div>

      {/* Prefill from shipment */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface-alt/40 p-3">
        <div className="flex-1 min-w-[200px]">
          <label className={labelCls}>ดึงข้อมูลจากงาน (freight shipment id)</label>
          <input className={inputCls} value={shipmentId} onChange={(e) => setShipmentId(e.target.value)} placeholder="UUID ของ freight_shipments" />
        </div>
        <button type="button" onClick={prefill} disabled={pending}
          className="rounded-lg border border-primary-300 bg-white px-3 py-1.5 text-xs font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-50">
          ↧ ดึงข้อมูล
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>ประเภทจดหมาย *</label>
          <select className={inputCls} value={form.letterType} onChange={(e) => set("letterType", e.target.value as CustomsLetterType)}>
            {CUSTOMS_LETTER_TYPES.map((t) => (
              <option key={t.type} value={t.type}>{t.titleTh}</option>
            ))}
          </select>
          {meta && <p className="text-[10px] text-muted mt-0.5">{meta.descTh}</p>}
        </div>
        <div>
          <label className={labelCls}>วันที่ในเอกสาร</label>
          <input type="date" className={inputCls} value={form.issueDateIso} onChange={(e) => set("issueDateIso", e.target.value)} />
        </div>

        {needsCarrier && (
          <>
            <div>
              <label className={labelCls}>สายเรือ / ขนส่ง {isSplit ? "(ZIM)" : ""}</label>
              <select className={inputCls} value={form.carrierCode} onChange={(e) => set("carrierCode", e.target.value as CustomsCarrierCode | "")}>
                <option value="">— เลือก —</option>
                {CUSTOMS_CARRIERS.map((c) => (
                  <option key={c.code} value={c.code}>{c.nameEn} ({c.nameTh})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>ระบุชื่อสายเรือเอง (ถ้าเลือก "อื่นๆ")</label>
              <input className={inputCls} value={form.carrierNameOverride} onChange={(e) => set("carrierNameOverride", e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label className={labelCls}>เลขงาน (Job no.)</label>
          <input className={inputCls} value={form.jobNo} onChange={(e) => set("jobNo", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>อ้างอิง (Ref. — เช่น เลขใบขน/INV)</label>
          <input className={inputCls} value={form.refNo} onChange={(e) => set("refNo", e.target.value)} />
        </div>

        <div className="sm:col-span-2 border-t border-border pt-2 mt-1">
          <p className="text-[11px] font-bold text-muted">ผู้รับ (Consignee)</p>
        </div>
        <div>
          <label className={labelCls}>ชื่อผู้รับ *</label>
          <input className={inputCls} value={form.consigneeName} onChange={(e) => set("consigneeName", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>เลขผู้เสียภาษีผู้รับ</label>
          <input className={inputCls} value={form.consigneeTaxId} onChange={(e) => set("consigneeTaxId", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>ที่อยู่ผู้รับ</label>
          <input className={inputCls} value={form.consigneeAddress} onChange={(e) => set("consigneeAddress", e.target.value)} />
        </div>

        {/* Logistics — shown for all except POA-pure (but POA still references shipment) */}
        {!isWaiver && !isLost && (
          <>
            <div className="sm:col-span-2 border-t border-border pt-2 mt-1">
              <p className="text-[11px] font-bold text-muted">ข้อมูลขนส่ง</p>
            </div>
            <div>
              <label className={labelCls}>B/L No.</label>
              <input className={inputCls} value={form.blNo} onChange={(e) => set("blNo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>สถานะ B/L</label>
              <select className={inputCls} value={form.blStatus} onChange={(e) => set("blStatus", e.target.value as BlReleaseStatus | "")}>
                <option value="">— ไม่ระบุ —</option>
                {(Object.keys(BL_RELEASE_STATUS_LABEL) as BlReleaseStatus[]).map((s) => (
                  <option key={s} value={s}>{BL_RELEASE_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>เรือ / เที่ยว (Vessel/Voy)</label>
              <input className={inputCls} value={form.vesselVoyage} onChange={(e) => set("vesselVoyage", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Container No.</label>
              <input className={inputCls} value={form.containerNo} onChange={(e) => set("containerNo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Port of Loading</label>
              <input className={inputCls} value={form.portLoading} onChange={(e) => set("portLoading", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Port of Discharge</label>
              <input className={inputCls} value={form.portDischarge} onChange={(e) => set("portDischarge", e.target.value)} />
            </div>
          </>
        )}

        {/* POA fields */}
        {isPoa && (
          <>
            <div className="sm:col-span-2 border-t border-border pt-2 mt-1">
              <p className="text-[11px] font-bold text-muted">ผู้รับมอบอำนาจ</p>
            </div>
            <div>
              <label className={labelCls}>ชื่อผู้รับมอบอำนาจ</label>
              <input className={inputCls} value={form.granteeName} onChange={(e) => set("granteeName", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>เลขบัตรประชาชน</label>
              <input className={inputCls} value={form.granteeIdCardNo} onChange={(e) => set("granteeIdCardNo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>AWB / Tracking (AIR)</label>
              <input className={inputCls} value={form.awbTrackingNo} onChange={(e) => set("awbTrackingNo", e.target.value)} />
            </div>
          </>
        )}

        {/* Amend fields */}
        {isAmend && (
          <>
            <div className="sm:col-span-2 border-t border-border pt-2 mt-1">
              <p className="text-[11px] font-bold text-muted">รายละเอียดการแก้ไข</p>
            </div>
            <div>
              <label className={labelCls}>ข้อมูลที่แก้ (เช่น ชื่อผู้รับ / เลข B/L)</label>
              <input className={inputCls} value={form.amendField} onChange={(e) => set("amendField", e.target.value)} />
            </div>
            <div />
            <div>
              <label className={labelCls}>ค่าเดิม</label>
              <input className={inputCls} value={form.amendOldValue} onChange={(e) => set("amendOldValue", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>ค่าใหม่</label>
              <input className={inputCls} value={form.amendNewValue} onChange={(e) => set("amendNewValue", e.target.value)} />
            </div>
          </>
        )}

        {/* Waiver-45 fields */}
        {isWaiver && (
          <>
            <div className="sm:col-span-2 border-t border-border pt-2 mt-1">
              <p className="text-[11px] font-bold text-muted">ผ่อนผัน 45 วัน</p>
            </div>
            <div>
              <label className={labelCls}>ด่านศุลกากร</label>
              <input className={inputCls} value={form.customsOffice} onChange={(e) => set("customsOffice", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>B/L No.</label>
              <input className={inputCls} value={form.blNo} onChange={(e) => set("blNo", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>วันที่ของถึง</label>
              <input type="date" className={inputCls} value={form.arrivalDateIso} onChange={(e) => set("arrivalDateIso", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>อากรประเมิน (บาท) — ประกัน 25%</label>
              <input className={inputCls} inputMode="decimal" value={form.estimatedDutyThb} onChange={(e) => set("estimatedDutyThb", e.target.value)} />
            </div>
          </>
        )}

        {/* Lost-doc fields */}
        {isLost && (
          <>
            <div className="sm:col-span-2 border-t border-border pt-2 mt-1">
              <p className="text-[11px] font-bold text-muted">เอกสารสูญหาย (กศก.122)</p>
            </div>
            <div>
              <label className={labelCls}>ด่านศุลกากร</label>
              <input className={inputCls} value={form.customsOffice} onChange={(e) => set("customsOffice", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>ขนส่ง (เช่น Flash Express)</label>
              <input className={inputCls} value={form.courierName} onChange={(e) => set("courierName", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>เลขพัสดุ</label>
              <input className={inputCls} value={form.courierTrackingNo} onChange={(e) => set("courierTrackingNo", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>เลขใบเสร็จที่สูญหาย (กศก.122) — บรรทัดละ 1 เลข</label>
              <textarea className={inputCls} rows={3} value={form.lostReceiptNumbers} onChange={(e) => set("lostReceiptNumbers", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>หมายเหตุ (รายงานประจำวันตำรวจ ฯลฯ)</label>
              <input className={inputCls} value={form.policeReportNote} onChange={(e) => set("policeReportNote", e.target.value)} />
            </div>
          </>
        )}

        {/* Cargo summary (common to logistics letters) */}
        {!isWaiver && !isLost && (
          <>
            <div className="sm:col-span-2 border-t border-border pt-2 mt-1">
              <p className="text-[11px] font-bold text-muted">สินค้า</p>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>รายละเอียดสินค้า</label>
              <input className={inputCls} value={form.cargoDescription} onChange={(e) => set("cargoDescription", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>จำนวนหีบห่อ (cartons)</label>
              <input className={inputCls} inputMode="numeric" value={form.totalCartons} onChange={(e) => set("totalCartons", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>น้ำหนัก (kg)</label>
              <input className={inputCls} inputMode="decimal" value={form.totalWeightKg} onChange={(e) => set("totalWeightKg", e.target.value)} />
            </div>
          </>
        )}
      </div>

      {isSplit && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
          ℹ️ Split D/O: เอกสารจะแสดงหัวจดหมาย + ช่องระบุชุดแยก — รายละเอียดแต่ละชุด (ตั๋วพ่วง) เพิ่มได้ในเวอร์ชันถัดไป หรือกรอกในเอกสารหลังพิมพ์
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={generate} disabled={pending}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
          {pending ? "กำลังออกเอกสาร…" : "📄 ออกเอกสาร PDF (ร่าง)"}
        </button>
        <button type="button" onClick={() => setForm(EMPTY_FORM)} disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-alt">
          ล้างฟอร์ม
        </button>
      </div>

      {msg && <p className="text-xs text-foreground bg-surface-alt rounded-lg p-2">{msg}</p>}
    </section>
  );
}

// ── 2) Form-E eligibility ──────────────────────────────────────────────

function FormEChecker() {
  const [hsCode, setHsCode] = useState("");
  const [originCountry, setOriginCountry] = useState("CN");
  const [criterion, setCriterion] = useState<FormEOriginCriterion | "">("");
  const [result, setResult] = useState<FormEEligibilityResult | null>(null);
  const [pending, start] = useTransition();

  function check() {
    start(async () => {
      const res = await adminCheckFormEEligibility({
        hsCode: hsCode || null,
        originCountry: originCountry || null,
        originCriterion: criterion || null,
      });
      if (res.ok) setResult(res.data ?? null);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-4">
      <div>
        <h2 className="font-bold text-base">🏷️ ตรวจสิทธิ Form E / ACFTA (เบื้องต้น)</h2>
        <p className="text-xs text-muted mt-0.5">
          ตรวจโอกาสได้สิทธิอากร 0% ภายใต้ ACFTA — <strong>เป็นข้อมูลช่วยตัดสินใจ ต้องยืนยันกับเจ้าหน้าที่ตาม ACFTA ตรวจ FE เสมอ</strong>
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>HS code</label>
          <input className={inputCls} value={hsCode} onChange={(e) => setHsCode(e.target.value)} placeholder="เช่น 8517.62" />
        </div>
        <div>
          <label className={labelCls}>ประเทศกำเนิด (ISO-2)</label>
          <input className={inputCls} value={originCountry} onChange={(e) => setOriginCountry(e.target.value.toUpperCase())} maxLength={2} />
        </div>
        <div>
          <label className={labelCls}>เกณฑ์กำเนิด</label>
          <select className={inputCls} value={criterion} onChange={(e) => setCriterion(e.target.value as FormEOriginCriterion | "")}>
            <option value="">— ไม่ระบุ —</option>
            {FORM_E_ORIGIN_CRITERIA.map((c) => (
              <option key={c} value={c}>{FORM_E_ORIGIN_CRITERION_LABEL[c]}</option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" onClick={check} disabled={pending}
        className="rounded-lg border border-primary-300 bg-white px-4 py-1.5 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-50">
        ตรวจสิทธิ
      </button>

      {result && (
        <div className={`rounded-lg border p-3 text-sm ${result.eligible ? "border-green-300 bg-green-50" : "border-gray-300 bg-gray-50"}`}>
          <p className="font-bold mb-1">
            {result.eligible ? "✅ มีโอกาสได้สิทธิ Form E (อากร 0%)" : "ℹ️ ยังไม่เข้าเงื่อนไข / ต้องข้อมูลเพิ่ม"}
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-xs">
            {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className="mt-2 text-[11px] text-amber-700">
            ⚠️ ผลนี้เป็นเพียงคำแนะนำเบื้องต้น — ต้องให้เจ้าหน้าที่ยืนยันก่อนใช้สิทธิจริง
          </p>
        </div>
      )}
    </section>
  );
}

// ── 3) HS-code AI-assist ───────────────────────────────────────────────

function HsAssist() {
  const [desc, setDesc] = useState("");
  const [result, setResult] = useState<HsAssistResult | null>(null);
  const [pending, start] = useTransition();

  function suggest() {
    start(async () => {
      const res = await adminSuggestHsCodes({ productDescription: desc });
      if (res.ok) setResult(res.data ?? null);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-4">
      <div>
        <h2 className="font-bold text-base">🤖 ผู้ช่วยพิกัด HS (AI assist)</h2>
        <p className="text-xs text-muted mt-0.5">
          แนะนำพิกัด HS จากรายละเอียดสินค้า — <strong>เป็นคำแนะนำเท่านั้น ต้องยืนยันก่อนใช้ในใบขน</strong>
        </p>
      </div>
      <div>
        <label className={labelCls}>รายละเอียดสินค้า</label>
        <textarea className={inputCls} rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="เช่น หูฟังบลูทูธ พลาสติก สำหรับมือถือ" />
      </div>
      <button type="button" onClick={suggest} disabled={pending}
        className="rounded-lg border border-primary-300 bg-white px-4 py-1.5 text-sm font-bold text-primary-700 hover:bg-primary-50 disabled:opacity-50">
        ขอคำแนะนำ
      </button>

      {result && (
        <div className="rounded-lg border border-border bg-surface-alt/40 p-3 text-sm space-y-2">
          {!result.isConfigured && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              🔒 {result.message}
            </p>
          )}
          {result.isConfigured && result.candidates.length === 0 && (
            <p className="text-xs text-muted">{result.message}</p>
          )}
          {result.candidates.map((c, i) => (
            <div key={i} className="rounded-md border border-border bg-white dark:bg-surface p-2 text-xs">
              <p className="font-mono font-bold">{c.hsCode} {c.dutyRatePct != null && `· อากร ${c.dutyRatePct}%`}</p>
              <p>{c.descriptionTh}</p>
              {c.permitCaution && <p className="text-amber-700">⚠️ {c.permitCaution}</p>}
              {c.saferAltNote && <p className="text-blue-700">💡 {c.saferAltNote}</p>}
            </div>
          ))}
          <p className="text-[11px] text-amber-700">⚠️ คำแนะนำพิกัดต้องได้รับการยืนยันจากเจ้าหน้าที่เอกสารก่อนคีย์ใบขน</p>
        </div>
      )}
    </section>
  );
}
