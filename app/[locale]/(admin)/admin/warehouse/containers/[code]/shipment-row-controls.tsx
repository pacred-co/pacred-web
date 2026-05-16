"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminSetShipmentReceivedQty,
  adminAttachShipmentToContainer,
  adminSetShipmentCargoType,
} from "@/actions/admin/warehouse";
import {
  CARGO_TYPE_VALUES,
  CARGO_TYPE_LABEL_TH,
  type CargoType,
} from "@/lib/warehouse/cargo-type";

const inputCls =
  "w-full rounded border border-border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/**
 * U1-5 + U1-3 combined per-shipment-row controls (warehouse container detail).
 *
 * Two collapsed buttons:
 *   📦 รับเข้า → expand received_box_count input + submit (U1-5)
 *   🔄 ย้ายตู้ → expand container_id input + submit (U1-3)
 *
 * Both default-collapsed so the shipment row stays scannable. Inline
 * expand keeps user in-context vs modal/page-jump.
 */

type Props = {
  shipmentId:         string;
  shipmentCode:       string;
  currentBoxCount:    number;
  currentReceived:    number;
  currentContainerId: string;
  currentCargoType:   CargoType | null;
};

export function ShipmentRowControls({
  shipmentId,
  shipmentCode,
  currentBoxCount,
  currentReceived,
  currentContainerId,
  currentCargoType,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<"received" | "rebind" | "cargo" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // U1-5 received qty state
  const [received, setReceived] = useState(currentReceived);

  // U1-3 rebind state — admin pastes target container UUID. Future
  // enhancement: show a search/picker; UUID-paste works for V1 because
  // staff already has the container UUID open in another tab when doing
  // a rebind (most common reason: typo on initial attach).
  const [targetContainerId, setTargetContainerId] = useState("");

  // V-D2 cargo_type correction state
  const [cargoTypeDraft, setCargoTypeDraft] = useState<CargoType | "">(currentCargoType ?? "");

  function flashSuccess(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 4000);
  }

  function submitReceived(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await adminSetShipmentReceivedQty({
        shipment_id:        shipmentId,
        received_box_count: received,
      });
      if (res.ok) {
        flashSuccess(
          received >= currentBoxCount
            ? `✓ ครบ (${received}/${currentBoxCount}) — ลูกค้าจะเห็น progress 100%`
            : `บันทึกแล้ว (${received}/${currentBoxCount} กล่อง)`,
        );
        setOpen(null);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function submitCargoType(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await adminSetShipmentCargoType({
        shipment_id: shipmentId,
        cargo_type:  cargoTypeDraft,
      });
      if (res.ok) {
        flashSuccess(
          cargoTypeDraft
            ? `✓ ตั้งเป็น "${CARGO_TYPE_LABEL_TH[cargoTypeDraft as CargoType]}" แล้ว`
            : "✓ ล้างค่าแล้ว",
        );
        setOpen(null);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function submitRebind(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!targetContainerId.trim()) {
      setErr("กรุณาระบุ container UUID ปลายทาง");
      return;
    }
    if (targetContainerId.trim() === currentContainerId) {
      setErr("UUID เดียวกับตู้ปัจจุบัน");
      return;
    }
    if (!confirm(`ย้าย shipment ${shipmentCode} ไปตู้อื่นใช่ไหม?`)) return;
    startTransition(async () => {
      const res = await adminAttachShipmentToContainer({
        shipment_id:  shipmentId,
        container_id: targetContainerId.trim(),
      });
      if (res.ok) {
        flashSuccess("✓ ย้ายแล้ว — refreshing...");
        setOpen(null);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  return (
    <div className="space-y-1.5">
      {/* Trigger buttons */}
      <div className="flex gap-1.5 text-[10px]">
        <button
          type="button"
          onClick={() => { setOpen(open === "received" ? null : "received"); setErr(null); setMsg(null); }}
          disabled={pending}
          className={`rounded border px-2 py-1 hover:bg-surface-alt ${
            open === "received" ? "bg-primary-500 text-white border-primary-500" : "border-border bg-white"
          }`}
        >
          📦 รับเข้า ({currentReceived}/{currentBoxCount})
        </button>
        <button
          type="button"
          onClick={() => { setOpen(open === "rebind" ? null : "rebind"); setErr(null); setMsg(null); }}
          disabled={pending}
          className={`rounded border px-2 py-1 hover:bg-surface-alt ${
            open === "rebind" ? "bg-primary-500 text-white border-primary-500" : "border-border bg-white"
          }`}
        >
          🔄 ย้ายตู้
        </button>
        <button
          type="button"
          onClick={() => { setOpen(open === "cargo" ? null : "cargo"); setErr(null); setMsg(null); }}
          disabled={pending}
          className={`rounded border px-2 py-1 hover:bg-surface-alt ${
            open === "cargo" ? "bg-primary-500 text-white border-primary-500" : "border-border bg-white"
          }`}
        >
          🏷️ ประเภท: {currentCargoType ? CARGO_TYPE_LABEL_TH[currentCargoType] : "ไม่ระบุ"}
        </button>
      </div>

      {msg && (
        <div className="rounded border border-green-200 bg-green-50 p-1.5 text-[10px] text-green-700">{msg}</div>
      )}
      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">{err}</div>
      )}

      {/* U1-5 received qty form */}
      {open === "received" && (
        <form onSubmit={submitReceived} className="rounded border border-border bg-surface-alt/40 p-2 space-y-1.5">
          <label className="block space-y-0.5">
            <span className="text-[10px] text-muted">รับจริง (ของ {currentBoxCount} กล่องที่คาด)</span>
            <input
              type="number"
              min={0}
              max={100000}
              value={received}
              onChange={(e) => setReceived(Number.isFinite(+e.target.value) ? +e.target.value : 0)}
              className={inputCls + " font-mono"}
              autoFocus
              disabled={pending}
            />
          </label>
          <div className="flex gap-1">
            <button
              type="submit"
              disabled={pending || received === currentReceived}
              className="rounded bg-primary-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              type="button"
              onClick={() => setReceived(currentBoxCount)}
              disabled={pending}
              className="rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt"
            >
              = ครบ
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              disabled={pending}
              className="rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt"
            >
              ปิด
            </button>
          </div>
        </form>
      )}

      {/* V-D2 cargo_type correction form */}
      {open === "cargo" && (
        <form onSubmit={submitCargoType} className="rounded border border-border bg-surface-alt/40 p-2 space-y-1.5">
          <label className="block space-y-0.5">
            <span className="text-[10px] text-muted">ประเภทสินค้า (canonical)</span>
            <select
              value={cargoTypeDraft}
              onChange={(e) => setCargoTypeDraft(e.target.value as CargoType | "")}
              className={inputCls}
              autoFocus
              disabled={pending}
            >
              <option value="">— ไม่ระบุ —</option>
              {CARGO_TYPE_VALUES.map((c) => (
                <option key={c} value={c}>{CARGO_TYPE_LABEL_TH[c]}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            <button
              type="submit"
              disabled={pending || cargoTypeDraft === (currentCargoType ?? "")}
              className="rounded bg-primary-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {pending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              disabled={pending}
              className="rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt"
            >
              ปิด
            </button>
          </div>
        </form>
      )}

      {/* U1-3 rebind container form */}
      {open === "rebind" && (
        <form onSubmit={submitRebind} className="rounded border border-border bg-surface-alt/40 p-2 space-y-1.5">
          <label className="block space-y-0.5">
            <span className="text-[10px] text-muted">
              Container UUID ปลายทาง — เปิดตู้ปลายทางใน tab อื่น แล้วก๊อป UUID จาก URL
            </span>
            <input
              type="text"
              value={targetContainerId}
              onChange={(e) => setTargetContainerId(e.target.value)}
              className={inputCls + " font-mono"}
              placeholder="เช่น 550e8400-e29b-41d4-a716-446655440000"
              autoFocus
              disabled={pending}
            />
          </label>
          <div className="flex gap-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded bg-primary-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {pending ? "กำลังย้าย..." : "ย้ายไปตู้นี้"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(null)}
              disabled={pending}
              className="rounded border border-border bg-white px-2 py-1 text-[10px] hover:bg-surface-alt"
            >
              ปิด
            </button>
          </div>
          <p className="text-[10px] text-amber-700">
            ⚠️ จะลบ shipment ออกจากตู้นี้ + ใส่ตู้ใหม่ — ลูกค้าจะเห็นการเปลี่ยนทันที
          </p>
        </form>
      )}
    </div>
  );
}
