"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminUpsertVipRate,
  adminDeleteVipRate,
} from "@/actions/admin/rates";
import type { Row } from "./page";

const inputCls =
  "w-24 rounded border border-border bg-white dark:bg-surface px-2 py-1 text-xs text-right font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/50";
const selectCls =
  "rounded-lg border border-border bg-white dark:bg-surface px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Warehouse = "guangzhou" | "yiwu";
type Transport = "truck" | "ship" | "air";
type Product   = "general" | "tisi" | "fda" | "special";
type Basis     = "kg" | "cbm";

export function VipRateRow({
  row,
  warehouseLabel,
  transportLabel,
  productLabel,
  basisLabel,
}: {
  row:            Row;
  warehouseLabel: string;
  transportLabel: string;
  productLabel:   string;
  basisLabel:     string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rate, setRate] = useState<string>(row.rate.toString());
  const [err, setErr]   = useState<string | null>(null);
  const [msg, setMsg]   = useState<string | null>(null);

  const dirty = rate !== row.rate.toString();

  function flash(t: string) {
    setMsg(t);
    setTimeout(() => setMsg(null), 4000);
  }

  function save() {
    setErr(null);
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("rate ต้องเป็นตัวเลข > 0");
      return;
    }
    startTransition(async () => {
      const res = await adminUpsertVipRate({
        customer_group:   row.customer_group,
        source_warehouse: row.source_warehouse as Warehouse,
        transport_type:   row.transport_type   as Transport,
        product_type:     row.product_type     as Product,
        basis:            row.basis            as Basis,
        rate:             n,
      });
      if (res.ok) {
        flash("✓ บันทึก");
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function del() {
    if (!confirm(`ลบ VIP rate ${row.source_warehouse}/${row.transport_type}/${row.product_type}/${row.basis} ?`)) return;
    startTransition(async () => {
      const res = await adminDeleteVipRate({ id: row.id });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  return (
    <>
      <tr className="border-t border-border">
        <td className="px-4 py-3 text-xs">{warehouseLabel}</td>
        <td className="px-4 py-3 text-xs">{transportLabel}</td>
        <td className="px-4 py-3 text-xs">{productLabel}</td>
        <td className="px-4 py-3 text-xs">{basisLabel}</td>
        <td className="px-4 py-3 text-right">
          <input value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls} inputMode="decimal" disabled={pending} />
        </td>
        <td className="px-4 py-3 text-[10px] text-muted whitespace-nowrap">
          {new Date(row.updated_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1.5">
            <button type="button" onClick={save} disabled={pending || !dirty}
              className="rounded bg-primary-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-primary-700 disabled:opacity-40">
              {pending ? "..." : "บันทึก"}
            </button>
            <button type="button" onClick={del} disabled={pending}
              className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] text-red-700 hover:bg-red-100">
              ลบ
            </button>
          </div>
        </td>
      </tr>
      {(err || msg) && (
        <tr>
          <td colSpan={7} className="px-4 pb-2">
            {err && <div className="rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">{err}</div>}
            {msg && <div className="rounded border border-green-200 bg-green-50 p-1.5 text-[10px] text-green-700">{msg}</div>}
          </td>
        </tr>
      )}
    </>
  );
}

export function NewVipRateRow({ defaultGroup }: { defaultGroup: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [warehouse, setWarehouse] = useState<Warehouse>("guangzhou");
  const [transport, setTransport] = useState<Transport>("truck");
  const [product,   setProduct]   = useState<Product>("general");
  const [basis,     setBasis]     = useState<Basis>("kg");
  const [rate, setRate] = useState("");
  const [err, setErr]   = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const n = Number(rate);
    if (!Number.isFinite(n) || n <= 0) {
      setErr("rate ต้องเป็นตัวเลข > 0");
      return;
    }
    startTransition(async () => {
      const res = await adminUpsertVipRate({
        customer_group:   defaultGroup,
        source_warehouse: warehouse,
        transport_type:   transport,
        product_type:     product,
        basis:            basis,
        rate:             n,
      });
      if (res.ok) {
        setRate(""); setErr(null); setOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-primary-300 bg-primary-50/40 px-4 py-3 text-sm font-medium text-primary-700 hover:bg-primary-100">
        ➕ เพิ่ม VIP rate ใหม่ใน {defaultGroup}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-primary-200 bg-primary-50/30 p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">VIP rate ใหม่ ({defaultGroup})</h3>
        <button type="button" onClick={() => { setOpen(false); setRate(""); setErr(null); }} className="text-xs text-muted hover:underline">ปิด</button>
      </div>
      <div className="grid sm:grid-cols-4 gap-2">
        <label className="block space-y-0.5">
          <span className="text-[10px] text-muted">โกดัง</span>
          <select value={warehouse} onChange={(e) => setWarehouse(e.target.value as Warehouse)} className={selectCls} disabled={pending}>
            <option value="guangzhou">กวางโจว</option>
            <option value="yiwu">อี้อู</option>
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[10px] text-muted">ขนส่ง</span>
          <select value={transport} onChange={(e) => setTransport(e.target.value as Transport)} className={selectCls} disabled={pending}>
            <option value="truck">รถ</option>
            <option value="ship">เรือ</option>
            <option value="air">อากาศ</option>
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[10px] text-muted">ประเภทสินค้า</span>
          <select value={product} onChange={(e) => setProduct(e.target.value as Product)} className={selectCls} disabled={pending}>
            <option value="general">ทั่วไป</option>
            <option value="tisi">มอก.</option>
            <option value="fda">อย.</option>
            <option value="special">พิเศษ</option>
          </select>
        </label>
        <label className="block space-y-0.5">
          <span className="text-[10px] text-muted">หน่วยคิด</span>
          <select value={basis} onChange={(e) => setBasis(e.target.value as Basis)} className={selectCls} disabled={pending}>
            <option value="kg">กิโลกรัม</option>
            <option value="cbm">CBM</option>
          </select>
        </label>
      </div>
      <label className="block space-y-0.5">
        <span className="text-[10px] text-muted">rate (บาทต่อหน่วย)</span>
        <input value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls + " w-full"} inputMode="decimal" disabled={pending} required />
      </label>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      <button type="submit" disabled={pending}
        className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50">
        {pending ? "กำลังบันทึก..." : "➕ สร้าง"}
      </button>
    </form>
  );
}
