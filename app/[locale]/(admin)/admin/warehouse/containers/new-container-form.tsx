"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminCreateContainer } from "@/actions/admin/warehouse";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

/**
 * Inline form for creating a new container from the list page.
 *
 * Code is OPTIONAL — if blank, server auto-generates `<originPrefix>-
 * <YYMMDD>-<seq>` (e.g. GZ260516-1).  Most warehouse staff will leave it
 * blank; partner-managed containers (MOMO etc.) get their own code.
 */
export function NewContainerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [transportMode, setTransportMode] = useState<"truck" | "sea" | "air">("truck");
  const [origin, setOrigin]               = useState("guangzhou");
  const [destination, setDestination]     = useState("Bangkok");
  const [code, setCode]                   = useState("");
  const [carrierNo, setCarrierNo]         = useState("");
  const [eta, setEta]                     = useState("");
  const [source, setSource]               = useState<"pacred" | "momo" | "self">("pacred");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);
    startTransition(async () => {
      const res = await adminCreateContainer({
        code:                 code.trim() || undefined,
        transport_mode:       transportMode,
        origin:               origin.trim(),
        destination:          destination.trim(),
        source,
        eta:                  eta || undefined,
        carrier_container_no: carrierNo.trim() || undefined,
        // Server defaults to 'packing'; pass explicitly so the inferred
        // input type from .default() is satisfied (Zod default makes the
        // field required in the parsed type even though it has a fallback).
        status:               "packing",
      });
      if (res.ok && res.data) {
        setMsg(`สร้างตู้ ${res.data.code ?? "(no code)"} แล้ว`);
        setCode("");
        setCarrierNo("");
        setEta("");
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else if (!res.ok) {
        setErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        ➕ สร้างตู้ใหม่
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-primary-200 bg-primary-50/40 dark:bg-primary-950/20 p-4 shadow-sm space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">สร้างตู้คอนเทนเนอร์ใหม่</h3>
        <button
          type="button"
          onClick={() => { setOpen(false); setMsg(null); setErr(null); }}
          className="text-xs text-muted hover:underline"
          disabled={pending}
        >
          ปิด
        </button>
      </div>

      {msg && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">รหัสตู้ (ปล่อยว่างให้สร้างอัตโนมัติ)</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputCls + " font-mono"}
            placeholder="เช่น GZ260516-1"
            disabled={pending}
          />
          <span className="text-[11px] text-muted">format: &lt;origin&gt;-&lt;YYMMDD&gt;-&lt;seq&gt;</span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ประเภทขนส่ง <span className="text-red-500">*</span></span>
          <select
            value={transportMode}
            onChange={(e) => setTransportMode(e.target.value as typeof transportMode)}
            className={inputCls}
            disabled={pending}
          >
            <option value="truck">🚚 รถ</option>
            <option value="sea">🚢 เรือ</option>
            <option value="air">✈️ เครื่องบิน</option>
          </select>
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ต้นทาง <span className="text-red-500">*</span></span>
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} className={inputCls} disabled={pending} required />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">ปลายทาง <span className="text-red-500">*</span></span>
          <input value={destination} onChange={(e) => setDestination(e.target.value)} className={inputCls} disabled={pending} required />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium">ETA (วันที่คาดถึง)</span>
          <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={inputCls} disabled={pending} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium">แหล่งที่มาของข้อมูล</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
            className={inputCls}
            disabled={pending}
          >
            <option value="pacred">Pacred</option>
            <option value="momo">MOMO (sync จากพาร์ตเนอร์)</option>
            <option value="self">Self (อื่นๆ)</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium">เลขตู้สายเรือ / B/L (carrier container no)</span>
        <input
          value={carrierNo}
          onChange={(e) => setCarrierNo(e.target.value)}
          className={inputCls + " font-mono"}
          placeholder="เช่น BLOU2025012 (ใส่เมื่อรู้)"
          disabled={pending}
        />
        <span className="text-[11px] text-muted">
          คนละตัวกับรหัสตู้ Pacred ด้านบน — ตัวนี้คือเลขที่พิมพ์อยู่บนตู้จริงและบน B/L
        </span>
      </label>

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "กำลังสร้าง..." : "✅ สร้าง"}
      </Button>
    </form>
  );
}
