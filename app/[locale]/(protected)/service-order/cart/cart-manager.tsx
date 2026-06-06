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
import { confirm } from "@/components/ui/confirm";
import type { Provider } from "@/lib/validators/cart";
import { trackPlaceOrder } from "@/lib/analytics";
import { MapPin, Truck, Ship, Plane, Package2, Box, Trash2 } from "lucide-react";

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

  async function onRemove(id: string) {
    if (!(await confirm(t("removeConfirm")))) return;
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
        trackPlaceOrder("service_order", res.data.total_thb);
        setDone({ h_no: res.data.h_no, total: res.data.total_thb, due: res.data.payment_due_at });
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-center space-y-3">
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
      <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-3">
        <p className="text-sm text-muted">{t("cartEmpty")}</p>
        <Button type="button" onClick={() => router.push("/service-order/add")}>
          + {t("addItem")}
        </Button>
      </div>
    );
  }

  const fullAddressText = [
    `${shipFirstName} ${shipLastName}`.trim(),
    shipAddressLine,
    shipSubDistrict && `ต.${shipSubDistrict}`,
    shipDistrict && `อ.${shipDistrict}`,
    shipProvince && `จ.${shipProvince}`,
    shipPostalCode,
  ].filter(Boolean).join(" ");

  return (
    <form onSubmit={onPlaceOrder} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {msg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>
      )}

      {/* ── Shipping address (top, full width — PCS legacy layout) ── */}
      <details className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer hover:bg-surface-alt/30 list-none">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600 shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">ที่อยู่ในการจัดส่งในไทย 🇹🇭</p>
              <p className="text-xs text-muted truncate mt-0.5">
                {fullAddressText || "ยังไม่ได้กรอกที่อยู่ — คลิกเพื่อเพิ่ม"}
                {shipPhone && <span className="ml-2">โทร. {shipPhone}</span>}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs text-muted shrink-0">เปลี่ยน/แก้ไข</span>
        </summary>
        <div className="px-5 pb-5 pt-2 space-y-3 border-t border-border">
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
          <p className="text-[11px] text-red-600">
            หมายเหตุ: หากพื้นที่นอกเขตขนส่งของ Pacred ทางบริษัทจะเก็บเงินปลายทางเท่านั้น
          </p>
        </div>
      </details>

      {/* Cart header with select-all */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-white dark:bg-surface px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.size === cart.length}
            onChange={toggleAll}
          />
          <span>{t("selectAll", { selected: selected.size, total: cart.length })}</span>
        </label>
        <span className="text-xs text-muted">{cart.length} / 151 ชิ้น</span>
      </div>

      {/* CART ITEMS */}
      <div className="space-y-3">
        {/* Group cart by (provider + shop_name) — mirrors legacy shops.php
            structure where each shop is its own group with subtotal */}
        {Object.entries(
          cart.reduce<Record<string, typeof cart>>((acc, c) => {
            const key = `${c.provider}::${c.shop_name || "pacred"}`;
            (acc[key] ||= []).push(c);
            return acc;
          }, {}),
        ).map(([key, group]) => {
          const groupSubtotalCny = group.reduce((s, c) => s + Number(c.price_cny) * Number(c.amount), 0);
          const [provider, shopName] = key.split("::");
          const allSelected = group.every((c) => selected.has(c.id));
          function toggleGroup() {
            setSelected((prev) => {
              const next = new Set(prev);
              if (allSelected) group.forEach((c) => next.delete(c.id));
              else            group.forEach((c) => next.add(c.id));
              return next;
            });
          }
          return (
            <div key={key} className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
              <div className="flex items-center justify-between bg-primary-50/40 border-b border-border px-4 py-2.5">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={allSelected} onChange={toggleGroup} />
                  <span className="text-xs rounded-full bg-white text-primary-700 px-2 py-0.5 border border-primary-200 font-semibold">
                    {PROVIDER_LABEL[provider as keyof typeof PROVIDER_LABEL] ?? provider}
                  </span>
                  <span className="font-semibold text-foreground">🏪 {shopName}</span>
                  <span className="text-xs text-muted">({group.length} ชิ้น)</span>
                </label>
                <span className="font-mono text-xs font-bold">¥{groupSubtotalCny.toFixed(2)}</span>
              </div>
              <div className="divide-y divide-border">
                {group.map((c) => (
                  <div key={c.id} className="p-4">
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
                        <h3 className="font-medium text-foreground text-sm line-clamp-2">{c.title ?? c.url ?? "—"}</h3>
                        <p className="text-xs text-muted">
                          {c.color && <>🎨 {c.color}</>}
                          {c.size && <> · 📏 {c.size}</>}
                        </p>
                        {c.url && (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline truncate block">
                            🔗 ดูที่ต้นทาง
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
                            className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50"
                            disabled={pending}
                            title={t("remove")}
                          >
                            <Trash2 className="w-3 h-3" /> ลบ
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Transport from China + Crate option (icon-card radios, PCS style) ── */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <MapPin className="w-5 h-5 text-primary-600" />
          การขนส่งจากจีนมาไทย 🇨🇳 → 🇹🇭
        </h3>

        <div className="mt-4 grid md:grid-cols-2 gap-5">
          {/* Transport type */}
          <div>
            <p className="text-sm font-medium mb-2">รูปแบบการขนส่งจีน-ไทย</p>
            <div className="grid grid-cols-3 gap-2">
              <IconRadio
                checked={transport === "truck"} onClick={() => setTransport("truck")}
                icon={<Truck className="w-7 h-7" />}
                title="ทางรถ (EK)" subtitle="5-7 วัน"
              />
              <IconRadio
                checked={transport === "ship"} onClick={() => setTransport("ship")}
                icon={<Ship className="w-7 h-7" />}
                title="ทางเรือ (SEA)" subtitle="12-16 วัน"
              />
              <IconRadio
                checked={transport === "air"} onClick={() => setTransport("air")}
                icon={<Plane className="w-7 h-7" />}
                title="ทางอากาศ" subtitle="3-5 วัน"
              />
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted block mb-1">โกดังต้นทาง</label>
              <select value={warehouse} onChange={(e) => setWarehouse(e.target.value as "guangzhou" | "yiwu")} className={inputCls}>
                <option value="guangzhou">กวางโจว</option>
                <option value="yiwu">อี้อู</option>
              </select>
            </div>
          </div>

          {/* Crate option */}
          <div>
            <p className="text-sm font-medium mb-2">การตีลังไม้สินค้า</p>
            <div className="grid grid-cols-2 gap-2">
              <IconRadio
                checked={!crate} onClick={() => setCrate(false)}
                icon={<Package2 className="w-7 h-7" />}
                title="ไม่ตีลังไม้" subtitle="มาตรฐาน"
              />
              <IconRadio
                checked={crate} onClick={() => setCrate(true)}
                icon={<Box className="w-7 h-7" />}
                title="ตีลังไม้" subtitle="มีค่าบริการ"
              />
            </div>
            <div className="mt-3">
              <label className="text-xs text-muted block mb-1">การชำระค่าขนส่ง</label>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as "origin" | "destination")} className={inputCls}>
                <option value="origin">เก็บต้นทาง</option>
                <option value="destination">เก็บปลายทาง</option>
              </select>
            </div>
            <p className="mt-2 text-[11px] text-red-600">
              **หากต้องการตีลังไม้สินค้าบางร้าน ให้เลือกสั่งออเดอร์แยกรายการกัน
            </p>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs text-muted block mb-1">หมายเหตุถึง Pacred</label>
          <textarea rows={2} value={noteUser} onChange={(e) => setNoteUser(e.target.value)} className={inputCls} placeholder={t("noteUser")} />
        </div>
      </div>

      {/* ── Promotion (left) + Order summary (right) — PCS row ── */}
      <div className="grid md:grid-cols-[1fr_400px] gap-4">
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            🎁 โปรโมชันสำหรับคุณ
          </h3>
          <div className="mt-3 rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/30 p-4 text-center">
            <p className="text-xl">🚚</p>
            <p className="font-bold text-sm mt-2">Pacred เหมาๆ — จัดส่งฟรีทั่วกรุงเทพฯ/ปริมณฑล</p>
            <p className="text-xs text-muted mt-1">โปรโมชันจะใช้อัตโนมัติเมื่อยอดถึงเกณฑ์</p>
          </div>
          <p className="mt-3 text-[11px] text-red-600 text-right">
            *หากสินค้ามีขนาดเล็ก แนะนำเลือกขนส่งเป็น Flash Express (เริ่มต้น 30 บ.)
          </p>
        </div>

        <div className="rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              🧾 สรุปรายการสั่งซื้อ
            </h3>
            <span className="text-xs text-muted">เลือก <b className="text-primary-600">{selected.size}</b> รายการ</span>
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">รวม</span>
              <span className="font-mono">¥{subtotalCny.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted">เรทแลกเปลี่ยน</span>
              <span className="font-mono text-primary-700 font-bold">฿{yuanRate.toFixed(2)}/¥</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">ค่าบริการ Pacred</span>
              <span className="font-mono">฿{serviceFee.toFixed(2)}</span>
            </div>
            <div className="rounded-lg bg-white border border-primary-200 p-3 mt-2">
              <p className="text-[11px] text-muted">ราคารวมสุทธิ</p>
              <p className="font-mono font-bold text-2xl text-red-600 mt-1 text-right">
                ฿{totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={pending || selected.size === 0}
            className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white font-bold text-sm px-4 py-2.5 shadow-sm hover:shadow-md transition-all disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก..." : "สั่งซื้อสินค้า"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Icon-card radio: big icon on top, title + subtitle below; selected state
 *  uses primary border + bg tint. Mirrors legacy PCS .border-checkbox-transportType
 *  styled cards. */
function IconRadio({
  checked, onClick, icon, title, subtitle,
}: {
  checked: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all ${
        checked
          ? "border-primary-500 bg-primary-50 text-primary-700 shadow-sm"
          : "border-border bg-white text-foreground hover:border-primary-200 hover:bg-surface-alt/30"
      }`}
    >
      <div className={checked ? "text-primary-600" : "text-muted"}>{icon}</div>
      <p className="text-xs font-bold leading-tight">{title}</p>
      {subtitle && <p className="text-[10px] text-muted">{subtitle}</p>}
    </button>
  );
}
