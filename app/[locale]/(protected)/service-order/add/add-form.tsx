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
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  async function onSearch() {
    if (!url.trim()) return;
    setSearching(true);
    setUnavailable(null);
    setDetail(null);
    setQtyMap({}); setNotesMap({});

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
    return skuMap.map((m, i) => ({
      key: m.sku_id || `row_${i}`,
      label: prettifyPropPath(m.prop_path, detail.sku_axes),
      price: m.price_cny,
      stock: m.stock,
      image: m.image ?? detail.main_image,
      data: m.prop_path,
    }));
  })();

  const totalQty = Object.values(qtyMap).reduce((s, n) => s + (n || 0), 0);
  const totalCny = rows.reduce((s, r) => s + ((qtyMap[r.key] || 0) * r.price), 0);
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
        price_cny:         r.price,
        amount:            qtyMap[r.key],
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
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          {t("apiUnavailable", { reason: unavailable })}
        </div>
      )}

      {detail && (
        <div className="grid lg:grid-cols-[1fr_360px] gap-4">
          {/* LEFT: product header + variant rows */}
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
              <div className="flex items-start gap-4">
                {detail.main_image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.main_image} alt={detail.title} className="w-28 h-28 rounded-lg object-cover bg-surface-alt shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium line-clamp-2">{detail.title}</h3>
                  <p className="text-xs text-muted mt-1">
                    🏪 {detail.shop_name ?? "—"} · {detail.provider.toUpperCase()}
                  </p>
                  <a href={detail.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-500 hover:underline">
                    🔗 ดูที่ต้นทาง
                  </a>
                  <div className="mt-2 flex items-baseline gap-2">
                    {detail.promo_price_cny != null && detail.base_price_cny != null && detail.promo_price_cny < detail.base_price_cny ? (
                      <>
                        <span className="font-mono text-lg font-bold text-red-600">¥{detail.promo_price_cny.toFixed(2)}</span>
                        <span className="text-xs text-muted line-through">¥{detail.base_price_cny.toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="font-mono text-lg font-bold">¥{(detail.base_price_cny ?? 0).toFixed(2)}</span>
                    )}
                    <span className="text-[10px] text-muted">≈ ฿{((detail.promo_price_cny ?? detail.base_price_cny ?? 0) * yuanRate).toFixed(2)}/ชิ้น</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Variant rows */}
            <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-surface-alt/30">
                <h4 className="font-bold text-sm">เลือกตัวเลือก ({rows.length} แบบ)</h4>
                <span className="text-xs text-muted">เรท ฿{yuanRate.toFixed(4)}/¥</span>
              </div>
              <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                {rows.map((r) => {
                  const qty = qtyMap[r.key] || 0;
                  const lineCny = qty * r.price;
                  const lineThb = lineCny * yuanRate;
                  return (
                    <div key={r.key} className="px-4 py-3 hover:bg-surface-alt/30">
                      <div className="flex items-start gap-3">
                        {r.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.image} alt="" className="w-12 h-12 rounded-md object-cover bg-surface-alt shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-md bg-surface-alt shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-1">{r.label}</p>
                          <p className="text-[10px] text-muted">สต๊อก {r.stock.toLocaleString()} · ¥{r.price.toFixed(2)}/ชิ้น</p>
                          <input
                            type="text"
                            placeholder="หมายเหตุ เช่น ต่อราคาร้านค้า สอบถามข้อมูล"
                            value={notesMap[r.key] || ""}
                            onChange={(e) => setNotesMap({ ...notesMap, [r.key]: e.target.value })}
                            className="mt-1 w-full text-xs rounded border border-border px-2 py-1"
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

          {/* RIGHT: sticky cart summary */}
          <aside className="lg:sticky lg:top-20 self-start space-y-3">
            <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 shadow-sm">
              <h3 className="font-bold text-sm mb-3">สรุปการเลือก</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>จำนวนชิ้น</span><span>{totalQty}</span></div>
                <div className="flex justify-between"><span>ยอด CNY</span><span className="font-mono">¥{totalCny.toFixed(2)}</span></div>
                <div className="flex justify-between text-xs text-muted"><span>เรท</span><span>฿{yuanRate.toFixed(4)}</span></div>
                <hr className="border-primary-200" />
                <div className="flex justify-between font-bold text-base">
                  <span>เทียบเท่า</span>
                  <span className="font-mono">฿{totalThb.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
            <Button type="button" fullWidth onClick={onAddSelected} disabled={pending || totalQty === 0}>
              {pending ? "กำลังเพิ่ม..." : `+ หยิบใส่รถเข็น (${totalQty} ชิ้น)`}
            </Button>
            <p className="text-[10px] text-muted text-center">
              ราคา THB คำนวณตามเรทล่าสุด — จะ lock ตอนเปิดออเดอร์
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function prettifyPropPath(path: Record<string, string>, axes?: ChinaProductDetail["sku_axes"]): string {
  if (!path || Object.keys(path).length === 0) return "ตัวเลือกเดียว";
  if (!axes) return Object.values(path).join(" / ");
  // axes is an array; path keys are axis ids — fallback: just join values
  const parts: string[] = [];
  for (const [axisId, valId] of Object.entries(path)) {
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
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          {t("apiUnavailable", { reason: unavailable })}
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
