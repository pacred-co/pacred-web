"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { addCartItem } from "@/actions/cart";
import { PROVIDERS, type Provider } from "@/lib/validators/cart";
import { uploadSlip } from "@/lib/storage-upload";

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

// ───────────────── URL PASTE ─────────────────
function UrlPanel({ onAdded, onError, pending, startTransition, router }: {
  onAdded: () => void;
  onError: (e: string) => void;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  router: ReturnType<typeof useRouter>;
}) {
  const t = useTranslations("serviceOrder");
  const [url,  setUrl]  = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  async function onSearch() {
    if (!url.trim()) return;
    setSearched(true);
    setUnavailable(null);
    const res = await fetch(`/api/china-search?mode=url&q=${encodeURIComponent(url)}`);
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
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("urlPaste")}</span>
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://detail.1688.com/offer/..." />
            <Button type="button" onClick={onSearch}>{t("convert")}</Button>
          </div>
          <span className="block text-xs text-muted">{t("urlPasteHint")}</span>
        </label>
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
