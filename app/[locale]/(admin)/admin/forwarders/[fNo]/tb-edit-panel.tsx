"use client";

/**
 * "แก้ไขที่อยู่ / การขนส่ง" panel for the legacy tb_forwarder detail branch.
 *
 * Theme A cont · 2026-05-31 (เดฟ). Closes the "[fNo] editor dead on real rows"
 * sub-fields (re-sweep A2 #3) with faithful tb_forwarder writes:
 *   - re-pick the delivery address from the customer's tb_address book
 *     (adminPickForwarderAddress → legacy update_fAddress)
 *   - swap transport mode รถ/เรือ/อากาศ (adminUpdateForwarderTransportType →
 *     legacy update_fTransportType · column-only, with a re-price hint)
 *   - change ship-by carrier (adminUpdateForwarderShipBy → legacy update_fShipBy ·
 *     PCS-family re-price + PCS depot-address copy when fStatus<=5)
 *   - edit the 3 manual money columns (adminUpdateForwarderCostAdjust · Pacred-
 *     added owner-blessed manual-adjust · fPriceUpdate / priceOther / fDiscount)
 *   - toggle pricing basis per-box/total (adminUpdateForwarderAmountCount →
 *     legacy update_fAmountCount · column-only, with a re-price hint)
 *
 * Pacred UI (Tailwind) per AGENTS.md §0a — legacy logic, our design.
 */

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  adminPickForwarderAddress,
  adminUpdateForwarderTransportType,
  adminReassignForwarderOwner,
  adminUpdateForwarderCover,
  adminUpdateForwarderShipBy,
  adminUpdateForwarderCostAdjust,
  adminUpdateForwarderAmountCount,
  adminUpdateForwarderTaxDocMode,
} from "@/actions/admin/forwarders-field-edits";
import {
  TAX_DOC_MODES,
  TAX_DOC_MODE_META,
  modeFromPref,
  type TaxDocMode,
} from "@/lib/tax/tax-doc-mode";

export type SavedAddressOption = {
  addressId: number;
  label: string; // "ชื่อ · ที่อยู่ย่อ · จังหวัด"
};

type TransportType = "1" | "2" | "3";
type AmountCount = "1" | "2";

const TRANSPORT_OPTIONS: ReadonlyArray<{ v: TransportType; l: string }> = [
  { v: "1", l: "🚛 ทางรถ" },
  { v: "2", l: "🚢 ทางเรือ" },
  { v: "3", l: "✈️ ทางอากาศ" },
];

// PCS-family ship-by options (the in-store/owned-courier set the legacy
// update_fShipBy re-prices). An external carrier name goes in the free-text box.
const SHIP_BY_PCS_OPTIONS: ReadonlyArray<{ v: string; l: string }> = [
  { v: "PCS",  l: "PCS · รับเองที่โกดัง (ค่าขนส่ง 0)" },
  { v: "PCSF", l: "PCSF · ส่งฟรี (ค่าขนส่ง 0)" },
  { v: "PCSE", l: "PCSE · ส่งด่วน (ปริมาตร×120 · ขั้นต่ำ 50)" },
];

const AMOUNT_COUNT_OPTIONS: ReadonlyArray<{ v: AmountCount; l: string }> = [
  { v: "2", l: "รวม (คิดราคารวมทั้งบิล)" },
  { v: "1", l: "ราคาต่อกล่อง (คิดราคาต่อกล่อง)" },
];

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";

const RE_PRICE_HINT =
  "⚠ เปลี่ยนแล้วราคาไม่อัพเดทอัตโนมัติ — กด “แก้ไขขนาด/น้ำหนัก” เพื่อคำนวณเรทใหม่";

type Props = {
  fId: number;
  isPcs: boolean;                       // fShipBy==='PCS' → no shipping address
  addresses: SavedAddressOption[];      // customer's saved tb_address rows
  currentTransportType: TransportType;
  currentShipBy: string;                // tb_forwarder.fshipby (carrier code/name)
  currentAmountCount: AmountCount;      // tb_forwarder.famountcount ('1'|'2')
  currentPriceUpdate: number;           // tb_forwarder.fpriceupdate
  currentPriceOther: number;            // tb_forwarder.priceother
  currentDiscount: number;              // tb_forwarder.fdiscount
  currentTaxDocPref: string | null;     // tb_forwarder.tax_doc_pref (null='receipt')
};

export function TbForwarderEditPanel(p: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // address
  const [addressId, setAddressId] = useState<string>(
    p.addresses[0] ? String(p.addresses[0].addressId) : "",
  );
  // transport
  const [transport, setTransport] = useState<TransportType>(p.currentTransportType);
  // ship-by carrier — "PCS"/"PCSF"/"PCSE" pick a preset, "_ext" = free-text other
  const isPresetShipBy = SHIP_BY_PCS_OPTIONS.some((o) => o.v === p.currentShipBy);
  const [shipByMode, setShipByMode] = useState<string>(
    isPresetShipBy ? p.currentShipBy : (p.currentShipBy ? "_ext" : "PCS"),
  );
  const [shipByExt, setShipByExt] = useState<string>(isPresetShipBy ? "" : p.currentShipBy);
  // pricing basis
  const [amountCount, setAmountCount] = useState<AmountCount>(p.currentAmountCount);
  // cost-adjust (3 manual money columns)
  const [priceUpdate, setPriceUpdate] = useState<string>(String(p.currentPriceUpdate ?? 0));
  const [priceOther, setPriceOther] = useState<string>(String(p.currentPriceOther ?? 0));
  const [discount, setDiscount] = useState<string>(String(p.currentDiscount ?? 0));
  // tax-document mode (ใบกำกับ / ใบขน / ไม่รับเอกสาร)
  const currentMode = modeFromPref(p.currentTaxDocPref);
  const [taxDocMode, setTaxDocMode] = useState<TaxDocMode>(currentMode);
  // owner reassign
  const [newOwner, setNewOwner] = useState<string>("");
  // cover upload
  const coverInputRef = useRef<HTMLInputElement>(null);

  // The carrier string actually submitted: preset code OR the free-text name.
  const effectiveShipBy = shipByMode === "_ext" ? shipByExt.trim() : shipByMode;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { setMsg({ kind: "err", text: res.error ?? "บันทึกไม่สำเร็จ" }); return; }
      setMsg({ kind: "ok", text: okText });
      router.refresh();
    });
  }

  function onSaveAddress() {
    const aid = Number(addressId);
    if (!Number.isInteger(aid) || aid <= 0) { setMsg({ kind: "err", text: "กรุณาเลือกที่อยู่" }); return; }
    if (!window.confirm("เปลี่ยนที่อยู่จัดส่งของรายการนี้เป็นที่อยู่ที่เลือก ?")) return;
    run(() => adminPickForwarderAddress({ fId: p.fId, addressId: aid }), "เปลี่ยนที่อยู่จัดส่งสำเร็จ");
  }

  function onSaveTransport() {
    if (transport === p.currentTransportType) { setMsg({ kind: "err", text: "ไม่มีการเปลี่ยนแปลง" }); return; }
    if (!window.confirm("เปลี่ยนประเภทขนส่ง ? (ราคาจะไม่อัพเดทอัตโนมัติ — กด 'แก้ไขขนาด/น้ำหนัก' เพื่อคำนวณเรทใหม่)")) return;
    run(() => adminUpdateForwarderTransportType({ fId: p.fId, transportType: transport }), "เปลี่ยนประเภทขนส่งสำเร็จ");
  }

  function onReassign() {
    const code = newOwner.trim().toUpperCase();
    if (!code) { setMsg({ kind: "err", text: "กรอกรหัสลูกค้าปลายทาง" }); return; }
    if (!window.confirm(
      `⚠ ย้ายรายการฝากนำเข้านี้ไปเป็นของลูกค้า "${code}" ?\n\n` +
      `การเงิน/ที่อยู่/รายการสินค้าจะติดไปด้วย · ที่อยู่จัดส่งจะยังเป็นของเดิม (ควรเลือกที่อยู่ใหม่หลังย้าย)\n` +
      `ทำเฉพาะกรณีสร้างผิดบัญชีเท่านั้น`,
    )) return;
    run(() => adminReassignForwarderOwner({ fId: p.fId, newUserId: code }), `ย้ายเจ้าของไปยัง ${code} สำเร็จ`);
  }

  function onUploadCover() {
    const file = coverInputRef.current?.files?.[0];
    if (!file) { setMsg({ kind: "err", text: "กรุณาเลือกไฟล์รูป" }); return; }
    const fd = new FormData();
    fd.append("fId", String(p.fId));
    fd.append("file", file);
    run(() => adminUpdateForwarderCover(fd), "อัปโหลดรูปปกสำเร็จ");
  }

  function onSaveShipBy() {
    const code = effectiveShipBy;
    if (!code) { setMsg({ kind: "err", text: "เลือกผู้ขนส่ง หรือกรอกชื่อผู้ขนส่งภายนอก" }); return; }
    if (code === p.currentShipBy) { setMsg({ kind: "err", text: "ไม่มีการเปลี่ยนแปลง" }); return; }
    const extra = code === "PCS"
      ? "\n\nผู้ขนส่ง PCS = รับเองที่โกดัง — ที่อยู่จัดส่งจะถูกแทนที่ด้วยที่อยู่โกดัง PCS กทม"
      : (code === "PCSF" || code === "PCSE")
        ? "\n\nค่าขนส่งจะถูกคำนวณใหม่ตามเงื่อนไข PCS (เฉพาะรายการที่ยังไม่ชำระเงิน)"
        : "";
    if (!window.confirm(`เปลี่ยนผู้ขนส่ง (Ship-by) เป็น "${code}" ?${extra}`)) return;
    run(() => adminUpdateForwarderShipBy({ fId: p.fId, fShipBy: code }), `เปลี่ยนผู้ขนส่งเป็น ${code} สำเร็จ`);
  }

  function onSaveAmountCount() {
    if (amountCount === p.currentAmountCount) { setMsg({ kind: "err", text: "ไม่มีการเปลี่ยนแปลง" }); return; }
    if (!window.confirm("เปลี่ยนฐานการคิดราคา ? (ราคาจะไม่อัพเดทอัตโนมัติ — กด 'แก้ไขขนาด/น้ำหนัก' เพื่อคำนวณเรทใหม่)")) return;
    run(() => adminUpdateForwarderAmountCount({ fId: p.fId, famountcount: amountCount }), "เปลี่ยนฐานราคาสำเร็จ");
  }

  function onSaveCostAdjust() {
    const pu = Number(priceUpdate);
    const po = Number(priceOther);
    const dc = Number(discount);
    if (![pu, po, dc].every((n) => Number.isFinite(n) && n >= 0)) {
      setMsg({ kind: "err", text: "กรอกตัวเลขที่ถูกต้อง (≥ 0)" }); return;
    }
    if (pu === p.currentPriceUpdate && po === p.currentPriceOther && dc === p.currentDiscount) {
      setMsg({ kind: "err", text: "ไม่มีการเปลี่ยนแปลง" }); return;
    }
    if (!window.confirm(
      `บันทึกค่าใช้จ่ายปรับเพิ่ม/ลด ?\n\n` +
      `ค่าสินค้า/ปรับเพิ่ม : ฿${pu.toLocaleString()}\n` +
      `ค่าอื่นๆ : ฿${po.toLocaleString()}\n` +
      `ส่วนลด : -฿${dc.toLocaleString()}\n\n` +
      `(มีผลต่อยอดรวมที่ลูกค้าต้องชำระ)`,
    )) return;
    run(
      () => adminUpdateForwarderCostAdjust({ fId: p.fId, fpriceupdate: pu, priceother: po, fdiscount: dc }),
      "บันทึกค่าใช้จ่ายสำเร็จ",
    );
  }

  function onSaveTaxDocMode() {
    if (taxDocMode === currentMode) { setMsg({ kind: "err", text: "ไม่มีการเปลี่ยนแปลง (โหมดเอกสารเดิม)" }); return; }
    const meta = TAX_DOC_MODE_META[taxDocMode];
    if (!window.confirm(
      `เปลี่ยนโหมดเอกสารภาษีเป็น "${meta.title}" ?\n\n` +
      `${meta.hint}\n` +
      `ฐาน VAT: ${meta.vatBase}\n\n` +
      `(มีผลตอนชำระเงิน — ระบบจะออกเอกสารตามโหมดนี้ · ไม่กระทบเอกสารที่ออกไปแล้ว)`,
    )) return;
    run(() => adminUpdateForwarderTaxDocMode({ fId: p.fId, mode: taxDocMode }), `ตั้งโหมดเอกสารเป็น ${meta.short} สำเร็จ`);
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-white dark:bg-surface p-4">
      <h3 className="text-sm font-semibold tracking-wide flex items-center gap-2">
        ✏️ แก้ไขที่อยู่ / การขนส่ง
      </h3>

      {/* Address re-pick */}
      <div className="space-y-2">
        <label htmlFor="te_addr" className="block text-xs font-medium text-muted">
          ที่อยู่จัดส่ง (เลือกจากสมุดที่อยู่ลูกค้า)
        </label>
        {p.isPcs ? (
          <p className="rounded-md border border-border bg-surface-alt/40 px-3 py-2 text-[11px] text-muted">
            รายการนี้เป็นแบบ <b>รับเองที่โกดัง (PCS)</b> — ไม่มีที่อยู่จัดส่งให้แก้ไข
          </p>
        ) : p.addresses.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            ลูกค้ายังไม่มีที่อยู่ในสมุดที่อยู่ (tb_address) — ให้ลูกค้าเพิ่มที่อยู่ก่อน
          </p>
        ) : (
          <>
            <select
              id="te_addr"
              value={addressId}
              onChange={(e) => setAddressId(e.target.value)}
              disabled={pending}
              className={INPUT_CLS}
            >
              {p.addresses.map((a) => (
                <option key={a.addressId} value={a.addressId}>{a.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onSaveAddress}
              disabled={pending}
              className="w-full rounded-lg border border-primary-500 bg-primary-50 px-3 py-2 text-sm text-primary-700 font-medium hover:bg-primary-100 disabled:opacity-50"
            >
              📍 ใช้ที่อยู่นี้
            </button>
          </>
        )}
      </div>

      {/* Transport type */}
      <div className="space-y-2 border-t border-border pt-3">
        <label htmlFor="te_transport" className="block text-xs font-medium text-muted">
          ประเภทขนส่ง
        </label>
        <select
          id="te_transport"
          value={transport}
          onChange={(e) => setTransport(e.target.value as TransportType)}
          disabled={pending}
          className={INPUT_CLS}
        >
          {TRANSPORT_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSaveTransport}
          disabled={pending || transport === p.currentTransportType}
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          🚚 บันทึกประเภทขนส่ง
        </button>
        <p className="text-[10px] text-muted">
          ⚠ เปลี่ยนแล้วราคาไม่อัพเดทอัตโนมัติ — กด <b>“แก้ไขขนาด/น้ำหนัก”</b> เพื่อคำนวณเรทใหม่
        </p>
      </div>

      {/* Ship-by carrier (update_fShipBy) */}
      <div className="space-y-2 border-t border-border pt-3">
        <label htmlFor="te_shipby" className="block text-xs font-medium text-muted">
          ผู้ขนส่ง (Ship-by)
        </label>
        <select
          id="te_shipby"
          value={shipByMode}
          onChange={(e) => setShipByMode(e.target.value)}
          disabled={pending}
          className={INPUT_CLS}
        >
          {SHIP_BY_PCS_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
          <option value="_ext">ผู้ขนส่งภายนอก (กรอกชื่อเอง)…</option>
        </select>
        {shipByMode === "_ext" && (
          <input
            type="text"
            value={shipByExt}
            onChange={(e) => setShipByExt(e.target.value)}
            disabled={pending}
            maxLength={50}
            placeholder="ชื่อผู้ขนส่งภายนอก เช่น Flash Express"
            className={INPUT_CLS}
          />
        )}
        <button
          type="button"
          onClick={onSaveShipBy}
          disabled={pending || !effectiveShipBy || effectiveShipBy === p.currentShipBy}
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          🏷️ บันทึกผู้ขนส่ง
        </button>
        <p className="text-[10px] text-muted">
          ปัจจุบัน: <b>{p.currentShipBy || "—"}</b> · PCS/PCSF/PCSE คิดค่าขนส่งใหม่อัตโนมัติ (เฉพาะที่ยังไม่ชำระ) · PCS แทนที่ที่อยู่ด้วยโกดัง PCS กทม
        </p>
      </div>

      {/* Pricing basis (update_fAmountCount) */}
      <div className="space-y-2 border-t border-border pt-3">
        <label htmlFor="te_amountcount" className="block text-xs font-medium text-muted">
          ฐานการคิดราคา
        </label>
        <select
          id="te_amountcount"
          value={amountCount}
          onChange={(e) => setAmountCount(e.target.value as AmountCount)}
          disabled={pending}
          className={INPUT_CLS}
        >
          {AMOUNT_COUNT_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSaveAmountCount}
          disabled={pending || amountCount === p.currentAmountCount}
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          🧮 บันทึกฐานราคา
        </button>
        <p className="text-[10px] text-muted">{RE_PRICE_HINT}</p>
      </div>

      {/* Manual cost-adjust (Pacred-added · owner-blessed) */}
      <div className="space-y-2 border-t border-border pt-3">
        <label className="block text-xs font-medium text-muted">
          ปรับค่าใช้จ่าย (เพิ่ม/ลด ด้วยตนเอง)
        </label>
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label htmlFor="te_priceupdate" className="block text-[10px] text-muted mb-0.5">ค่าสินค้า / ปรับเพิ่ม (฿)</label>
            <input
              id="te_priceupdate"
              type="number" min="0" step="0.01" inputMode="decimal"
              value={priceUpdate}
              onChange={(e) => setPriceUpdate(e.target.value)}
              disabled={pending}
              className={`${INPUT_CLS} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="te_priceother" className="block text-[10px] text-muted mb-0.5">ค่าอื่นๆ (฿)</label>
            <input
              id="te_priceother"
              type="number" min="0" step="0.01" inputMode="decimal"
              value={priceOther}
              onChange={(e) => setPriceOther(e.target.value)}
              disabled={pending}
              className={`${INPUT_CLS} font-mono`}
            />
          </div>
          <div>
            <label htmlFor="te_discount" className="block text-[10px] text-muted mb-0.5">ส่วนลด (฿)</label>
            <input
              id="te_discount"
              type="number" min="0" step="0.01" inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              disabled={pending}
              className={`${INPUT_CLS} font-mono`}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onSaveCostAdjust}
          disabled={pending}
          className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 font-medium hover:bg-amber-100 disabled:opacity-50"
        >
          💰 บันทึกค่าใช้จ่าย
        </button>
        <p className="text-[10px] text-muted">
          มีผลต่อยอดรวมที่ลูกค้าต้องชำระทันที (ไม่แตะค่าขนส่ง/ค่าตีลังที่คำนวณจากขนาด)
        </p>
      </div>

      {/* Tax-document mode (Lane B · ใบกำกับ / ใบขน / ไม่รับเอกสาร) */}
      <div className="space-y-2 border-t border-border pt-3">
        <label htmlFor="te_taxdocmode" className="block text-xs font-medium text-muted">
          โหมดเอกสารภาษี (เลือกก่อนชำระเงิน)
        </label>
        <select
          id="te_taxdocmode"
          value={taxDocMode}
          onChange={(e) => setTaxDocMode(e.target.value as TaxDocMode)}
          disabled={pending}
          className={INPUT_CLS}
        >
          {TAX_DOC_MODES.map((m) => (
            <option key={m} value={m}>{TAX_DOC_MODE_META[m].title}</option>
          ))}
        </select>
        <p className="text-[10px] text-muted">{TAX_DOC_MODE_META[taxDocMode].hint}</p>
        <button
          type="button"
          onClick={onSaveTaxDocMode}
          disabled={pending || taxDocMode === currentMode}
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          🧾 บันทึกโหมดเอกสาร
        </button>
        <p className="text-[10px] text-muted">
          ปัจจุบัน: <b>{TAX_DOC_MODE_META[currentMode].title}</b> · ฐาน VAT: {TAX_DOC_MODE_META[taxDocMode].vatBase} · มีผลตอนชำระเงิน (ออกเอกสารอัตโนมัติตามโหมดนี้)
        </p>
      </div>

      {/* Cover image (update_fCover) */}
      <div className="space-y-2 border-t border-border pt-3">
        <label htmlFor="te_cover" className="block text-xs font-medium text-muted">
          เปลี่ยนรูปปกสินค้า (fCover)
        </label>
        <input
          id="te_cover"
          ref={coverInputRef}
          type="file"
          accept="image/png,image/jpeg"
          disabled={pending}
          className="w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-700 file:text-xs disabled:opacity-60"
        />
        <button
          type="button"
          onClick={onUploadCover}
          disabled={pending}
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          🖼️ อัปโหลดรูปปก
        </button>
      </div>

      {/* Owner reassign (update_fUserID) — sensitive, data-fix only */}
      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-xs font-medium text-red-700 select-none">
          ⚠ ย้ายเจ้าของรายการ (เฉพาะกรณีสร้างผิดบัญชี)
        </summary>
        <div className="mt-2 space-y-2">
          <input
            type="text"
            value={newOwner}
            onChange={(e) => setNewOwner(e.target.value)}
            disabled={pending}
            maxLength={10}
            placeholder="รหัสลูกค้าปลายทาง เช่น PR1234"
            className={`${INPUT_CLS} font-mono`}
          />
          <button
            type="button"
            onClick={onReassign}
            disabled={pending || !newOwner.trim()}
            className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 font-medium hover:bg-red-100 disabled:opacity-50"
          >
            🔀 ย้ายเจ้าของ
          </button>
          <p className="text-[10px] text-muted">
            การเงิน/รายการสินค้าจะติดไปด้วย · ที่อยู่จัดส่งยังเป็นของเดิม — เลือกที่อยู่ใหม่หลังย้าย
          </p>
        </div>
      </details>

      {msg && (
        <div className={`rounded-md border px-3 py-2 text-xs ${
          msg.kind === "ok"
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {msg.kind === "ok" ? "✓ " : "⚠ "}{msg.text}
        </div>
      )}

      <p className="text-[10px] text-muted text-center">
        เขียน <code className="rounded bg-surface-alt px-1 font-mono">tb_forwarder</code> จริง · faithful port ของ
        <code className="mx-1 rounded bg-surface-alt px-1 font-mono">update_fAddress</code>·
        <code className="mx-1 rounded bg-surface-alt px-1 font-mono">update_fTransportType</code>·
        <code className="mx-1 rounded bg-surface-alt px-1 font-mono">update_fShipBy</code>·
        <code className="rounded bg-surface-alt px-1 font-mono">update_fAmountCount</code>
      </p>
    </section>
  );
}
