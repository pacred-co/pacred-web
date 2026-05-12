"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  removeCartItem,
  updateCartItem,
  type CartItem,
} from "@/actions/cart";
import { placeServiceOrder } from "@/actions/service-order";
import type { Provider } from "@/lib/validators/cart";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type DefaultAddress = {
  first_name: string; last_name: string; phone: string; phone2: string | null;
  address_line: string; sub_district: string; district: string; province: string;
  postal_code: string; note: string | null;
};

type Props = {
  cart: CartItem[];
  yuanRate: number;
  serviceFee: number;
  defaultAddress: DefaultAddress | null;
};

const PROVIDER_LABEL: Record<Provider, string> = {
  "1688":   "1688",
  "taobao": "Taobao",
  "tmall":  "Tmall",
  "shop":   "Shop",
  "nice":   "Nice",
};

export function CartManager({ cart: initialCart, yuanRate, serviceFee, defaultAddress }: Props) {
  const t = useTranslations("serviceOrder");
  const router = useRouter();

  const [cart] = useState(initialCart);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialCart.map((c) => c.id)));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<{ h_no: string; total: number; due: string } | null>(null);

  // Checkout fields
  const [warehouse, setWarehouse] = useState<"guangzhou" | "yiwu">("guangzhou");
  const [transport, setTransport] = useState<"truck" | "ship" | "air">("truck");
  const [crate, setCrate] = useState(false);
  const [payMethod, setPayMethod] = useState<"origin" | "destination">("origin");
  const [noteUser, setNoteUser] = useState("");

  // Address (default from props, editable)
  const [shipFirstName, setShipFirstName]   = useState(defaultAddress?.first_name ?? "");
  const [shipLastName,  setShipLastName]    = useState(defaultAddress?.last_name ?? "");
  const [shipPhone,     setShipPhone]       = useState(defaultAddress?.phone ?? "");
  const [shipPhone2,    setShipPhone2]      = useState(defaultAddress?.phone2 ?? "");
  const [shipAddressLine, setShipAddressLine] = useState(defaultAddress?.address_line ?? "");
  const [shipSubDistrict, setShipSubDistrict] = useState(defaultAddress?.sub_district ?? "");
  const [shipDistrict,  setShipDistrict]      = useState(defaultAddress?.district ?? "");
  const [shipProvince,  setShipProvince]      = useState(defaultAddress?.province ?? "");
  const [shipPostalCode, setShipPostalCode]   = useState(defaultAddress?.postal_code ?? "");
  const [shipNote,      setShipNote]          = useState(defaultAddress?.note ?? "");

  const selectedItems = useMemo(
    () => cart.filter((c) => selected.has(c.id)),
    [cart, selected],
  );

  const subtotalCny = useMemo(
    () => selectedItems.reduce((s, c) => s + Number(c.price_cny) * Number(c.amount), 0),
    [selectedItems],
  );
  const totalThb = useMemo(
    () => Math.round((subtotalCny * yuanRate + serviceFee) * 100) / 100,
    [subtotalCny, yuanRate, serviceFee],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(selected.size === cart.length ? new Set() : new Set(cart.map((c) => c.id)));
  }

  function onQtyChange(id: string, newQty: number) {
    if (!Number.isFinite(newQty) || newQty < 1) return;
    startTransition(async () => {
      await updateCartItem(id, { amount: newQty });
      router.refresh();
    });
  }

  function onRemove(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    startTransition(async () => {
      await removeCartItem(id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      router.refresh();
    });
  }

  function onPlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);

    if (selected.size === 0) {
      setError(t("selectAtLeastOne"));
      return;
    }

    startTransition(async () => {
      const res = await placeServiceOrder({
        cart_item_ids:    Array.from(selected),
        warehouse_china:  warehouse,
        transport_type:   transport,
        pay_method:       payMethod,
        crate,
        ship_first_name:   shipFirstName,
        ship_last_name:    shipLastName,
        ship_phone:        shipPhone,
        ship_phone2:       shipPhone2 || undefined,
        ship_address_line: shipAddressLine,
        ship_sub_district: shipSubDistrict,
        ship_district:     shipDistrict,
        ship_province:     shipProvince,
        ship_postal_code:  shipPostalCode,
        ship_note:         shipNote || undefined,
        note_user:         noteUser || undefined,
      });
      if (res.ok && res.data) {
        setDone({ h_no: res.data.h_no, total: res.data.total_thb, due: res.data.payment_due_at });
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">{t("placedTitle")}</h2>
        <p className="text-sm text-green-700">
          {t("placedSubtitle", {
            hNo:    done.h_no,
            total:  done.total.toLocaleString("th-TH", { minimumFractionDigits: 2 }),
            due:    new Date(done.due).toLocaleString("th-TH"),
          })}
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" type="button" onClick={() => router.push("/service-order/pending")}>
            {t("viewPending")}
          </Button>
          <Button type="button" onClick={() => router.push("/service-order/add")}>
            {t("addMore")}
          </Button>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center space-y-3">
        <p className="text-sm text-muted">{t("cartEmpty")}</p>
        <Button type="button" onClick={() => router.push("/service-order/add")}>
          + {t("addItem")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onPlaceOrder} className="grid lg:grid-cols-[1fr_360px] gap-6">
      {/* CART ITEMS */}
      <div className="space-y-3">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        {msg && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>
        )}

        <div className="flex items-center justify-between rounded-2xl border border-border bg-white dark:bg-surface px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.size === cart.length}
              onChange={toggleAll}
            />
            <span>{t("selectAll", { selected: selected.size, total: cart.length })}</span>
          </label>
          <span className="text-xs text-muted">{cart.length} / 151</span>
        </div>

        {cart.map((c) => (
          <div key={c.id} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="mt-2"
              />
              {c.image_path ? (
                <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-surface-alt relative">
                  <Image src={c.image_path} alt={c.title ?? ""} fill className="object-cover" unoptimized />
                </div>
              ) : (
                <div className="w-20 h-20 shrink-0 rounded-lg bg-surface-alt flex items-center justify-center text-xs text-muted">
                  No image
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium text-foreground text-sm line-clamp-2">{c.title ?? c.url ?? "—"}</h3>
                  <span className="text-xs rounded-full bg-primary-50 text-primary-700 px-2 py-0.5 border border-primary-200">
                    {PROVIDER_LABEL[c.provider]}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {c.shop_name && <>🏪 {c.shop_name}</>}
                  {c.color && <> · 🎨 {c.color}</>}
                  {c.size && <> · 📏 {c.size}</>}
                </p>
                {c.url && (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline truncate block">
                    {c.url.slice(0, 60)}...
                  </a>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <span className="font-mono text-sm">¥{Number(c.price_cny).toFixed(2)}</span>
                  <span className="text-xs text-muted">×</span>
                  <input
                    type="number"
                    min="1"
                    defaultValue={c.amount}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n !== c.amount) onQtyChange(c.id, n);
                    }}
                    className="w-20 rounded-lg border border-border px-2 py-1 text-sm"
                  />
                  <span className="ml-auto text-sm font-bold font-mono">
                    ¥{(Number(c.price_cny) * Number(c.amount)).toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(c.id)}
                    className="text-xs text-red-600 hover:underline"
                    disabled={pending}
                  >
                    {t("remove")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CHECKOUT */}
      <aside className="lg:sticky lg:top-20 self-start space-y-4">
        <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 shadow-sm">
          <h3 className="text-sm font-bold mb-3">{t("orderSummary")}</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>{t("itemsSelected")}</span><span>{selected.size}</span></div>
            <div className="flex justify-between"><span>{t("subtotalCny")}</span><span className="font-mono">¥{subtotalCny.toFixed(2)}</span></div>
            <div className="flex justify-between text-xs text-muted"><span>{t("rate")}</span><span>฿{yuanRate.toFixed(4)}/¥</span></div>
            <div className="flex justify-between"><span>{t("serviceFee")}</span><span className="font-mono">฿{serviceFee.toFixed(2)}</span></div>
            <hr className="border-primary-200" />
            <div className="flex justify-between font-bold text-base">
              <span>{t("totalThb")}</span>
              <span className="font-mono">฿{totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Classification */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold">{t("checkoutOptions")}</h3>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium">{t("warehouseChina")}</span>
            <select value={warehouse} onChange={(e) => setWarehouse(e.target.value as "guangzhou" | "yiwu")} className={inputCls}>
              <option value="guangzhou">กวางโจว</option>
              <option value="yiwu">อี้อู</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium">{t("transportType")}</span>
            <select value={transport} onChange={(e) => setTransport(e.target.value as "truck" | "ship" | "air")} className={inputCls}>
              <option value="truck">🚚 รถ</option>
              <option value="ship">🚢 เรือ</option>
              <option value="air">✈️ อากาศ</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium">{t("payMethod")}</span>
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as "origin" | "destination")} className={inputCls}>
              <option value="origin">เก็บต้นทาง</option>
              <option value="destination">เก็บปลายทาง</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={crate} onChange={(e) => setCrate(e.target.checked)} />
            <span>{t("crate")}</span>
          </label>
        </div>

        {/* Address */}
        <details open className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <summary className="text-sm font-bold cursor-pointer">{t("shippingAddress")}</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input value={shipFirstName} onChange={(e) => setShipFirstName(e.target.value)} className={inputCls} placeholder={t("firstName")} required />
              <input value={shipLastName} onChange={(e) => setShipLastName(e.target.value)} className={inputCls} placeholder={t("lastName")} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={shipPhone} onChange={(e) => setShipPhone(e.target.value)} className={inputCls} placeholder={t("phone")} required />
              <input value={shipPhone2 ?? ""} onChange={(e) => setShipPhone2(e.target.value)} className={inputCls} placeholder={t("phone2")} />
            </div>
            <input value={shipAddressLine} onChange={(e) => setShipAddressLine(e.target.value)} className={inputCls} placeholder={t("addressLine")} required />
            <div className="grid grid-cols-2 gap-2">
              <input value={shipSubDistrict} onChange={(e) => setShipSubDistrict(e.target.value)} className={inputCls} placeholder={t("subDistrict")} required />
              <input value={shipDistrict} onChange={(e) => setShipDistrict(e.target.value)} className={inputCls} placeholder={t("district")} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={shipProvince} onChange={(e) => setShipProvince(e.target.value)} className={inputCls} placeholder={t("province")} required />
              <input value={shipPostalCode} onChange={(e) => setShipPostalCode(e.target.value)} className={inputCls} placeholder={t("postalCode")} maxLength={5} required />
            </div>
            <textarea rows={2} value={shipNote ?? ""} onChange={(e) => setShipNote(e.target.value)} className={inputCls} placeholder={t("addressNote")} />
            <textarea rows={2} value={noteUser} onChange={(e) => setNoteUser(e.target.value)} className={inputCls} placeholder={t("noteUser")} />
          </div>
        </details>

        <Button type="submit" fullWidth disabled={pending || selected.size === 0}>
          {pending ? t("submitting") : t("placeOrder")}
        </Button>
      </aside>
    </form>
  );
}
