"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { addCartItem, addCartItemsBulk } from "@/actions/cart";
import { PROVIDERS, type Provider } from "@/lib/validators/cart";
import { uploadSlip } from "@/lib/storage-upload";
import type { ChinaProductDetail } from "@/lib/china-search";

type Mode = "manual" | "url" | "keyword";

type Hit = {
  provider: "1688" | "taobao" | "tmall";
  product_id?: string;
  title: string;
  url: string;
  image_url?: string;
  price_cny?: number;
  shop_name?: string;
};

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

export function AddItemForm() {
  const t = useTranslations("serviceOrder");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("manual");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function flash(text: string, isError = false) {
    if (isError) setError(text); else setMsg(text);
    setTimeout(() => { setError(null); setMsg(null); }, 4000);
  }

  return (
    <div className="space-y-6">
      {/* Mode tabs */}
      <div className="flex gap-2 border-b border-border">
        {(["manual", "url", "keyword"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === m
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t(`addMode.${m}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {msg   && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>}

      {mode === "manual"  && <ManualPanel onAdded={() => flash(t("addedToast"))} onError={(e) => flash(e, true)} pending={pending} startTransition={startTransition} router={router} />}
      {mode === "url"     && <UrlPanel    onAdded={() => flash(t("addedToast"))} onError={(e) => flash(e, true)} pending={pending} startTransition={startTransition} router={router} />}
      {mode === "keyword" && <KeywordPanel onAdded={() => flash(t("addedToast"))} onError={(e) => flash(e, true)} pending={pending} startTransition={startTransition} router={router} />}
    </div>
  );
}

// ───────────────── MANUAL ─────────────────
function ManualPanel({
  onAdded, onError, pending, startTransition, router,
}: {
  onAdded: () => void;
  onError: (e: string) => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  router: ReturnType<typeof useRouter>;
}) {
  const t = useTranslations("serviceOrder");
  const [provider, setProvider]  = useState<Provider>("shop");
  const [shopName, setShopName]  = useState("");
  const [url,      setUrl]       = useState("");
  const [title,    setTitle]     = useState("");
  const [priceCny, setPriceCny]  = useState("");
  const [amount,   setAmount]    = useState("1");
  const [color,    setColor]     = useState("");
  const [size,     setSize]      = useState("");
  const [details,  setDetails]   = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadSlip(file, "yuan_payment"); // reuse slips bucket
    if (res.ok) setImagePath(res.path);
    else onError(res.error);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await addCartItem({
        provider,
        shop_name:  shopName || "pacred",
        url:        url || undefined,
        title:      title || undefined,
        image_path: imagePath || undefined,
        price_cny:  Number(priceCny) || 0,
        amount:     Number(amount) || 1,
        color:      color || undefined,
        size:       size || undefined,
        details:    details || undefined,
      });
      if (res.ok) {
        onAdded();
        setUrl(""); setTitle(""); setPriceCny(""); setAmount("1"); setColor(""); setSize(""); setDetails(""); setImagePath(null);
        router.refresh();
      } else {
        onError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("provider")}>
          <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)} className={inputCls}>
            {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label={t("shopName")}>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} className={inputCls} placeholder="pacred" />
        </Field>
        <Field label={t("productUrl")}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t("productTitle")}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t("priceCny")} required>
          <input type="number" min="0" step="0.01" value={priceCny} onChange={(e) => setPriceCny(e.target.value)} className={inputCls} required />
        </Field>
        <Field label={t("amount")} required>
          <input type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} required />
        </Field>
        <Field label={t("color")}>
          <input value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} />
        </Field>
        <Field label={t("size")}>
          <input value={size} onChange={(e) => setSize(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <Field label={t("details")}>
        <textarea rows={2} value={details} onChange={(e) => setDetails(e.target.value)} className={inputCls} />
      </Field>

      <Field label={t("productImage")}>
        <input type="file" accept="image/*" onChange={onImage} className="block w-full text-sm" />
        {imagePath && <span className="block text-xs text-green-700">{t("uploaded")}</span>}
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("submitting") : t("addToCart")}
        </Button>
      </div>
    </form>
  );
}

// ───────────────── URL PASTE — product detail + variant grid ─────────────────
function UrlPanel({ onAdded, onError, pending, startTransition, router }: {
  onAdded: () => void;
  onError: (e: string) => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  router: ReturnType<typeof useRouter>;
}) {
  const t = useTranslations("serviceOrder");
  const [url, setUrl] = useState("");
  const [detail, setDetail] = useState<ChinaProductDetail | null>(null);
  const [yuanRate, setYuanRate] = useState(5);     // fetched live
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [qtyMap, setQtyMap]               = useState<Record<string, number>>({});
  const [notesMap, setNotesMap]           = useState<Record<string, string>>({});
  const [priceOverrideMap, setPriceMap]   = useState<Record<string, number>>({});
  const [colorMap, setColorMap]           = useState<Record<string, string>>({});
  const [sizeMap, setSizeMap]             = useState<Record<string, string>>({});

  async function onSearch() {
    if (!url.trim()) return;
    setSearching(true);
    setUnavailable(null);
    setDetail(null);
    setQtyMap({}); setNotesMap({}); setPriceMap({}); setColorMap({}); setSizeMap({});

    // Fetch product detail + current yuan rate in parallel
    const [detailRes, rateRes] = await Promise.all([
      fetch(`/api/china-search?mode=url-detail&q=${encodeURIComponent(url)}`).then((r) => r.json()),
      fetch(`/api/settings-rate`).then((r) => r.json()).catch(() => ({ yuan_rate: 5 })),
    ]);
    setSearching(false);
    if (detailRes.available === false) {
      setUnavailable(detailRes.reason ?? "unavailable");
      return;
    }
    setDetail(detailRes.detail);
    if (rateRes?.yuan_rate) setYuanRate(Number(rateRes.yuan_rate));
  }

  // Build the row list: if sku_map exists use it, else single virtual row from base price
  const rows = (() => {
    if (!detail) return [] as Array<{ key: string; label: string; price: number; stock: number; image?: string; data: Record<string, string> }>;
    const skuMap = detail.sku_map ?? [];
    if (skuMap.length === 0) {
      return [{
        key: "_default",
        label: "ตัวเลือกเดียว",
        price: detail.promo_price_cny ?? detail.base_price_cny ?? 0,
        stock: detail.stock_total ?? 9999,
        image: detail.main_image,
        data: {},
      }];
    }
    // Build labels first — if all paths are empty (Taobao SKUs sometimes
    // ship with no propPath), labels would all collapse to "ตัวเลือกเดียว".
    // In that case differentiate via price + stock so user can pick.
    const labels = skuMap.map((m) => prettifyPropPath(m.prop_path, detail.sku_axes));
    const allSame = labels.every((l) => l === labels[0]);
    return skuMap.map((m, i) => ({
      key: m.sku_id || `row_${i}`,
      label: allSame && skuMap.length > 1
        ? `แบบ #${i + 1} · ¥${Number(m.price_cny).toFixed(2)}${m.stock ? ` · สต๊อก ${m.stock}` : ""}`
        : labels[i],
      price: m.price_cny,
      stock: m.stock,
      image: m.image ?? detail.main_image,
      data: m.prop_path,
    }));
  })();

  // Effective price = override > row.price (override only kicks in when user typed something)
  const priceFor = (key: string, fallback: number) => priceOverrideMap[key] ?? fallback;

  const totalQty = Object.values(qtyMap).reduce((s, n) => s + (n || 0), 0);
  const totalCny = rows.reduce((s, r) => s + ((qtyMap[r.key] || 0) * priceFor(r.key, r.price)), 0);
  const totalThb = Math.round(totalCny * yuanRate * 100) / 100;

  function onAddSelected() {
    if (!detail || totalQty === 0) return;
    const selected = rows
      .filter((r) => (qtyMap[r.key] || 0) > 0)
      .map((r) => ({
        provider:          detail.provider,
        shop_name:         detail.shop_name || "pacred",
        url:               detail.url,
        title:             detail.title,
        image_path:        r.image,
        price_cny:         priceFor(r.key, r.price),
        amount:            qtyMap[r.key],
        color:             colorMap[r.key] || undefined,
        size:              sizeMap[r.key] || undefined,
        details:           notesMap[r.key] || undefined,
        variant_label:     r.label,
        variant_data:      r.data,
        source_product_id: detail.product_id,
        stock_available:   r.stock,
      }));

    startTransition(async () => {
      const res = await addCartItemsBulk(selected);
      if (res.ok) {
        onAdded();
        setDetail(null); setUrl(""); setQtyMap({}); setNotesMap({});
        router.refresh();
      } else {
        onError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("urlPaste")}</span>
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://detail.1688.com/offer/..." />
            <Button type="button" onClick={onSearch} disabled={searching}>
              {searching ? "..." : t("convert")}
            </Button>
          </div>
          <span className="block text-xs text-muted">{t("urlPasteHint")}</span>
        </label>
      </div>

      {unavailable && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {t("apiUnavailable")}
        </div>
      )}

      {detail && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          {/* LEFT: product header + variant rows */}
          <div className="space-y-3">
            <ProductHero detail={detail} yuanRate={yuanRate} />

            {/* Variant rows */}
            <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-surface-alt/30">
                <h4 className="font-bold text-sm">เลือกตัวเลือก ({rows.length} แบบ)</h4>
                <span className="text-xs text-muted">เรท ฿{yuanRate.toFixed(4)}/¥</span>
              </div>
              <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                {rows.map((r) => {
                  const qty = qtyMap[r.key] || 0;
                  const effectivePrice = priceFor(r.key, r.price);
                  const lineCny = qty * effectivePrice;
                  const lineThb = lineCny * yuanRate;
                  const isDemoMode = r.price === 0;
                  return (
                    <div key={r.key} className="px-4 py-3 hover:bg-surface-alt/30">
                      <div className="flex items-start gap-3">
                        {r.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image} alt="" className="w-12 h-12 rounded-md object-cover bg-surface-alt shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-md bg-surface-alt shrink-0" />
                        )}
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-medium line-clamp-1">{r.label}</p>
                          <p className="text-[10px] text-muted">
                            สต๊อก {r.stock.toLocaleString()}
                            {!isDemoMode && <> · ¥{r.price.toFixed(2)}/ชิ้น</>}
                          </p>
                          {isDemoMode && (
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-muted whitespace-nowrap">ราคา ¥</label>
                              <input
                                type="number" min="0" step="0.01"
                                value={priceOverrideMap[r.key] ?? ""}
                                onChange={(e) => setPriceMap({ ...priceOverrideMap, [r.key]: Number(e.target.value) || 0 })}
                                placeholder="0.00"
                                className="w-24 text-xs rounded border border-border px-2 py-1"
                              />
                              <input
                                type="text" placeholder="สี"
                                value={colorMap[r.key] || ""}
                                onChange={(e) => setColorMap({ ...colorMap, [r.key]: e.target.value })}
                                className="w-16 text-xs rounded border border-border px-2 py-1"
                              />
                              <input
                                type="text" placeholder="ไซส์"
                                value={sizeMap[r.key] || ""}
                                onChange={(e) => setSizeMap({ ...sizeMap, [r.key]: e.target.value })}
                                className="w-16 text-xs rounded border border-border px-2 py-1"
                              />
                            </div>
                          )}
                          <input
                            type="text"
                            placeholder="หมายเหตุ เช่น ต่อราคาร้านค้า สอบถามข้อมูล"
                            value={notesMap[r.key] || ""}
                            onChange={(e) => setNotesMap({ ...notesMap, [r.key]: e.target.value })}
                            className="w-full text-xs rounded border border-border px-2 py-1"
                          />
                        </div>
                        <div className="text-right shrink-0 w-24">
                          <input
                            type="number" min="0" max={r.stock}
                            value={qty || ""}
                            onChange={(e) => setQtyMap({ ...qtyMap, [r.key]: Math.max(0, Math.min(r.stock, Number(e.target.value) || 0)) })}
                            className="w-20 text-right rounded border border-border px-2 py-1 text-sm"
                            placeholder="0"
                          />
                          {qty > 0 && (
                            <div className="text-[10px] text-muted mt-1">
                              ฿{lineThb.toFixed(2)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: sticky cart summary with explicit price math (legacy PCS style) */}
          <aside className="lg:sticky lg:top-20 self-start space-y-3">
            <div className="rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5 shadow-md">
              <h3 className="font-bold text-sm mb-3 text-primary-700">สรุปการเลือก</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">จำนวนชิ้น</span>
                  <span className="font-mono font-bold">{totalQty.toLocaleString()}</span>
                </div>
                <div className="rounded-lg bg-white border border-primary-100 p-3 my-2">
                  <p className="text-[11px] text-muted mb-1">ราคารวม</p>
                  <p className="font-mono text-sm">
                    <span className="font-bold">{totalCny.toFixed(2)}</span>
                    <span className="text-muted">¥</span>
                    <span className="mx-1 text-muted">×</span>
                    <span className="font-bold text-primary-600">{yuanRate.toFixed(2)}</span>
                    <span className="text-muted text-[10px]">฿/¥</span>
                  </p>
                  <p className="mt-2 text-right">
                    <span className="text-[11px] text-muted">= </span>
                    <span className="font-mono font-bold text-lg text-red-600">
                      ฿{totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onAddSelected}
              disabled={pending || totalQty === 0}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-500 to-primary-700 text-white font-bold px-4 py-3 shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:hover:shadow-lg ${totalQty > 0 && !pending ? "animate-pulse" : ""}`}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              {pending ? "กำลังเพิ่ม..." : `หยิบใส่รถเข็น (${totalQty} ชิ้น)`}
            </button>
            <p className="text-[10px] text-muted text-center">
              ราคา THB คำนวณตามเรทล่าสุด — จะ lock ตอนเปิดออเดอร์
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

/** Big product hero — provider chip, image gallery on the left with thumbnails,
 *  title + shop + price block on the right. Mirrors the legacy PCS search-detail
 *  page layout (col-md-4 image + col-md-8 info). */
function ProductHero({ detail, yuanRate }: { detail: ChinaProductDetail; yuanRate: number }) {
  const gallery = detail.images && detail.images.length > 0
    ? detail.images.slice(0, 6)
    : (detail.main_image ? [detail.main_image] : []);
  const [active, setActive] = useState(0);
  const hero = gallery[active] ?? detail.main_image;

  const PROVIDER_BRAND: Record<string, { label: string; bg: string }> = {
    tmall:  { label: "TMALL",  bg: "bg-red-600" },
    taobao: { label: "TAOBAO", bg: "bg-orange-500" },
    "1688": { label: "1688",   bg: "bg-orange-600" },
    other:  { label: "CHINA",  bg: "bg-gray-600" },
  };
  const brand = PROVIDER_BRAND[detail.provider] ?? PROVIDER_BRAND.other;

  const promo = detail.promo_price_cny ?? null;
  const base  = detail.base_price_cny ?? promo ?? 0;
  const isDiscounted = promo != null && promo < base;
  const displayPriceCny = promo ?? base;

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      {/* Provider banner strip */}
      <div className="px-5 py-2.5 border-b border-border bg-surface-alt/30 flex items-center gap-3 flex-wrap">
        <span className="text-xs text-muted">ผลการค้นหาจาก</span>
        <span className={`inline-flex items-center rounded-md ${brand.bg} text-white text-xs font-bold px-2.5 py-1`}>
          {brand.label}
        </span>
        <span className="text-xs text-muted flex-1 min-w-0 truncate">
          <a href={detail.url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
            🔗 {detail.url.replace(/^https?:\/\//, "").slice(0, 60)}
          </a>
        </span>
      </div>

      <div className="p-5 grid md:grid-cols-[280px_1fr] gap-5">
        {/* Image gallery */}
        <div className="space-y-2">
          <div className="aspect-square w-full rounded-xl overflow-hidden bg-surface-alt border border-border">
            {hero ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hero} alt={detail.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl text-muted">📦</div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="grid grid-cols-5 gap-1.5">
              {gallery.map((g, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActive(i)}
                  className={`aspect-square rounded-md overflow-hidden border-2 ${i === active ? "border-primary-500" : "border-transparent"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: details */}
        <div className="space-y-3 min-w-0">
          <h3 className="font-bold text-base sm:text-lg leading-snug line-clamp-3">{detail.title}</h3>

          {/* Price banner */}
          <div className="rounded-lg bg-gradient-to-r from-primary-500 to-primary-700 text-white px-4 py-3 shadow-sm">
            <p className="text-xs text-white/80">ราคาสินค้า</p>
            <p className="font-mono leading-none mt-1">
              <span className="text-3xl font-bold">¥{displayPriceCny.toFixed(2)}</span>
              {isDiscounted && (
                <span className="ml-3 text-sm text-white/70 line-through">¥{base.toFixed(2)}</span>
              )}
            </p>
            <p className="text-xs text-white/85 mt-1">
              ≈ <span className="font-mono font-semibold">฿{(displayPriceCny * yuanRate).toFixed(2)}</span> / ชิ้น
              <span className="ml-2 text-white/60">(เรท ฿{yuanRate.toFixed(2)}/¥)</span>
            </p>
          </div>

          {/* Shop + link grid */}
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[10px] text-muted uppercase tracking-wide">ชื่อร้าน</p>
              <p className="font-medium truncate">{detail.shop_name ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-border px-3 py-2">
              <p className="text-[10px] text-muted uppercase tracking-wide">ลิงค์สินค้า</p>
              <a href={detail.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:underline text-xs">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                ไปยังเว็บสินค้า
              </a>
            </div>
            {detail.product_id && (
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wide">รหัสสินค้า</p>
                <p className="font-mono text-xs">{detail.product_id}</p>
              </div>
            )}
            {typeof detail.stock_total === "number" && detail.stock_total > 0 && (
              <div className="rounded-lg border border-border px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wide">สต๊อกทั้งหมด</p>
                <p className="font-mono text-xs">{detail.stock_total.toLocaleString()} ชิ้น</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function prettifyPropPath(path: Record<string, string>, axes?: ChinaProductDetail["sku_axes"]): string {
  if (!path || Object.keys(path).length === 0) return "ตัวเลือกเดียว";
  if (!axes) return Object.values(path).join(" / ");
  // axes is an array; path keys are axis ids — fallback: just join values
  const parts: string[] = [];
  for (const valId of Object.values(path)) {
    // try to resolve label from axes
    for (const axis of axes) {
      const match = axis.values.find((v) => v.data === valId || v.label === valId);
      if (match?.label) { parts.push(match.label); break; }
    }
  }
  if (parts.length === 0) return Object.values(path).join(" / ");
  return parts.join(" / ");
}

// ───────────────── KEYWORD SEARCH ─────────────────
function KeywordPanel({ onAdded, onError, pending, startTransition, router }: {
  onAdded: () => void;
  onError: (e: string) => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  router: ReturnType<typeof useRouter>;
}) {
  const t = useTranslations("serviceOrder");
  const [words, setWords] = useState("");
  const [platform, setPlatform] = useState<"1688" | "taobao" | "tmall">("1688");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  async function onSearch() {
    if (!words.trim()) return;
    setSearched(true);
    setUnavailable(null);
    const res = await fetch(`/api/china-search?mode=keyword&q=${encodeURIComponent(words)}&platform=${platform}`);
    const data = await res.json();
    if (data.available === false) {
      setUnavailable(data.reason ?? "unavailable");
      setHits([]);
    } else {
      setHits(data.hits ?? []);
    }
  }

  function onAddHit(h: Hit) {
    startTransition(async () => {
      const res = await addCartItem({
        provider:   h.provider,
        shop_name:  h.shop_name || "pacred",
        url:        h.url,
        title:      h.title,
        image_path: h.image_url,
        price_cny:  h.price_cny ?? 0,
        amount:     1,
      });
      if (res.ok) {
        onAdded();
        router.refresh();
      } else {
        onError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <div className="flex gap-2">
          <select value={platform} onChange={(e) => setPlatform(e.target.value as "1688" | "taobao" | "tmall")} className={`${inputCls} max-w-[120px]`}>
            <option value="1688">1688</option>
            <option value="taobao">Taobao</option>
            <option value="tmall">Tmall</option>
          </select>
          <input value={words} onChange={(e) => setWords(e.target.value)} className={inputCls} placeholder={t("keywordPlaceholder")} />
          <Button type="button" onClick={onSearch}>{t("search")}</Button>
        </div>
      </div>
      {unavailable && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          {t("apiUnavailable")}
        </div>
      )}
      {searched && !unavailable && hits.length === 0 && (
        <p className="text-center text-sm text-muted py-8">{t("noResults")}</p>
      )}
      <HitsGrid hits={hits} onAdd={onAddHit} pending={pending} />
    </div>
  );
}

// ───────────────── HITS GRID ─────────────────
function HitsGrid({ hits, onAdd, pending }: { hits: Hit[]; onAdd: (h: Hit) => void; pending: boolean }) {
  const t = useTranslations("serviceOrder");
  if (hits.length === 0) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {hits.map((h, i) => (
        <div key={`${h.provider}-${h.product_id ?? i}`} className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden shadow-sm flex flex-col">
          {h.image_url ? (
            <div className="relative w-full aspect-square bg-surface-alt">
              <Image src={h.image_url} alt={h.title} fill className="object-cover" unoptimized />
            </div>
          ) : (
            <div className="w-full aspect-square bg-surface-alt flex items-center justify-center text-xs text-muted">No image</div>
          )}
          <div className="p-3 flex-1 flex flex-col">
            <p className="text-xs line-clamp-2 flex-1">{h.title}</p>
            {h.price_cny != null && (
              <p className="mt-2 font-mono text-sm">¥{h.price_cny.toFixed(2)}</p>
            )}
            <Button type="button" size="sm" fullWidth onClick={() => onAdd(h)} disabled={pending} className="mt-2">
              + {t("addToCart")}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}
