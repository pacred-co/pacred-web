"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateShipmentManual } from "@/actions/admin/warehouse";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/**
 * U1-4 — Admin manual shipment entry form.
 *
 * Drops onto warehouse container detail sidebar. Admin uses when
 * tracking numbers come in from supplier WeChat batches BEFORE MOMO
 * sync (chat IT — ~15 escalations/week). Creates cargo_shipment +
 * attaches to current container + optionally adds a "scan_receive"
 * event so the timeline reflects the manual registration.
 *
 * Customer ref accepts either profile_id (UUID) or member_code (PR####).
 * Source order: forwarder f_no XOR service_order h_no.
 */

type Props = {
  /** Pre-attaches the new shipment to this container. */
  containerId:   string;
  containerCode: string;
};

export function ManualShipmentForm({ containerId, containerCode }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [shipmentCode, setShipmentCode] = useState("");
  const [customerRef,  setCustomerRef]  = useState("");
  const [orderType,    setOrderType]    = useState<"forwarder" | "service_order">("forwarder");
  const [orderRef,     setOrderRef]     = useState("");
  const [boxCount,     setBoxCount]     = useState(1);
  const [weight,       setWeight]       = useState("");
  const [volume,       setVolume]       = useState("");
  const [initialScan,  setInitialScan]  = useState(true);
  const [scanLoc,      setScanLoc]      = useState("");

  function reset() {
    setShipmentCode(""); setCustomerRef("");
    setOrderType("forwarder"); setOrderRef("");
    setBoxCount(1); setWeight(""); setVolume("");
    setInitialScan(true); setScanLoc("");
    setErr(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const weightNum = weight.trim() ? Number(weight) : undefined;
    const volumeNum = volume.trim() ? Number(volume) : undefined;
    if (weight && (!Number.isFinite(weightNum) || (weightNum ?? -1) < 0)) {
      setErr("น้ำหนักต้องเป็นตัวเลข ≥ 0"); return;
    }
    if (volume && (!Number.isFinite(volumeNum) || (volumeNum ?? -1) < 0)) {
      setErr("ปริมาตรต้องเป็นตัวเลข ≥ 0"); return;
    }

    startTransition(async () => {
      const res = await adminCreateShipmentManual({
        shipment_code:        shipmentCode.trim(),
        customer_ref:         customerRef.trim(),
        forwarder_f_no:       orderType === "forwarder" ? orderRef.trim() : undefined,
        service_order_h_no:   orderType === "service_order" ? orderRef.trim() : undefined,
        cargo_container_id:   containerId,
        box_count:            boxCount,
        weight_kg:            weightNum,
        volume_cbm:           volumeNum,
        initial_scan:         initialScan,
        initial_scan_location: scanLoc.trim() || undefined,
      });
      if (res.ok && res.data) {
        setMsg(
          `✓ สร้าง shipment ${res.data.shipment_code} ` +
          `ให้ลูกค้า ${res.data.customer_member_code ?? res.data.customer_id.slice(0, 8)} แล้ว`,
        );
        reset();
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else if (!res.ok) {
        setErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-primary-300 bg-primary-50/50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100"
      >
        + เพิ่ม shipment ด้วยมือ (manual)
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">+ Shipment ใหม่ (manual)</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); reset(); }}
          disabled={pending}
          className="text-xs text-muted hover:underline"
        >
          ปิด
        </button>
      </div>

      <p className="text-[10px] text-muted">
        จะถูกผูกเข้าตู้ <span className="font-mono">{containerCode}</span> อัตโนมัติ
      </p>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}

      <label className="block space-y-1">
        <span className="text-xs font-medium">Shipment code <span className="text-red-500">*</span></span>
        <input
          value={shipmentCode}
          onChange={(e) => setShipmentCode(e.target.value)}
          className={inputCls + " font-mono"}
          placeholder="เช่น SF1234567890"
          required
          disabled={pending}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">
          ลูกค้า (member_code หรือ profile_id) <span className="text-red-500">*</span>
        </span>
        <input
          value={customerRef}
          onChange={(e) => setCustomerRef(e.target.value)}
          className={inputCls + " font-mono"}
          placeholder="PR00001 หรือ UUID"
          required
          disabled={pending}
        />
      </label>

      <div className="space-y-1">
        <span className="text-xs font-medium">ออเดอร์อ้างอิง <span className="text-red-500">*</span></span>
        <div className="grid grid-cols-[120px_1fr] gap-2">
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as "forwarder" | "service_order")}
            className={inputCls}
            disabled={pending}
          >
            <option value="forwarder">ฝากนำเข้า</option>
            <option value="service_order">ฝากสั่ง</option>
          </select>
          <input
            value={orderRef}
            onChange={(e) => setOrderRef(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder={orderType === "forwarder" ? "f_no" : "h_no"}
            required
            disabled={pending}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium">กล่อง</span>
          <input
            type="number"
            min={1}
            max={100000}
            value={boxCount}
            onChange={(e) => setBoxCount(Number.isFinite(+e.target.value) ? +e.target.value : 1)}
            className={inputCls}
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">น้ำหนัก kg</span>
          <input
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder="optional"
            inputMode="decimal"
            disabled={pending}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">CBM</span>
          <input
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder="optional"
            inputMode="decimal"
            disabled={pending}
          />
        </label>
      </div>

      <div className="rounded-lg border border-border p-2 space-y-1.5 bg-surface-alt/30">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={initialScan}
            onChange={(e) => setInitialScan(e.target.checked)}
            disabled={pending}
          />
          <span>เพิ่ม scan_receive event ทันที (เก็บ timeline เพื่อ audit)</span>
        </label>
        {initialScan && (
          <input
            value={scanLoc}
            onChange={(e) => setScanLoc(e.target.value)}
            className={inputCls + " text-xs"}
            placeholder="Location (optional, default 'manual_register')"
            disabled={pending}
          />
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {pending ? "กำลังสร้าง..." : "+ สร้าง shipment"}
      </button>
    </form>
  );
}
