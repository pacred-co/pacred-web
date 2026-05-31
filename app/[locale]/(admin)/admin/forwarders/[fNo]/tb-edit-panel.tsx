"use client";

/**
 * "แก้ไขที่อยู่ / การขนส่ง" panel for the legacy tb_forwarder detail branch.
 *
 * Theme A cont · 2026-05-31 (เดฟ). Closes two more "[fNo] editor dead on real
 * rows" sub-fields (re-sweep A2 #3) with faithful tb_forwarder writes:
 *   - re-pick the delivery address from the customer's tb_address book
 *     (adminPickForwarderAddress → legacy update_fAddress)
 *   - swap transport mode รถ/เรือ/อากาศ (adminUpdateForwarderTransportType →
 *     legacy update_fTransportType · column-only, with a re-price hint)
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
} from "@/actions/admin/forwarders-field-edits";

export type SavedAddressOption = {
  addressId: number;
  label: string; // "ชื่อ · ที่อยู่ย่อ · จังหวัด"
};

type TransportType = "1" | "2" | "3";

const TRANSPORT_OPTIONS: ReadonlyArray<{ v: TransportType; l: string }> = [
  { v: "1", l: "🚛 ทางรถ" },
  { v: "2", l: "🚢 ทางเรือ" },
  { v: "3", l: "✈️ ทางอากาศ" },
];

const INPUT_CLS =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60";

type Props = {
  fId: number;
  isPcs: boolean;                       // fShipBy==='PCS' → no shipping address
  addresses: SavedAddressOption[];      // customer's saved tb_address rows
  currentTransportType: TransportType;
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
  // owner reassign
  const [newOwner, setNewOwner] = useState<string>("");
  // cover upload
  const coverInputRef = useRef<HTMLInputElement>(null);

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
        <code className="mx-1 rounded bg-surface-alt px-1 font-mono">update_fAddress</code>/
        <code className="rounded bg-surface-alt px-1 font-mono">update_fTransportType</code>
      </p>
    </section>
  );
}
