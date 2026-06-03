"use client";

/**
 * Promo-banner manager UI — /admin/settings/promos (client island).
 *
 * Single-form "edit the whole array, then save" model: holds the full promo
 * list in state, mutates locally (add / edit / delete / reorder / toggle /
 * image-upload), and posts the whole array via `adminSavePromoBanners`. This
 * is race-free vs per-item writes against a JSON blob.
 *
 * Image upload posts one file → `adminUploadPromoImage` → public URL stored in
 * the banner's image_url (immediate, doesn't need the "save" — but the URL
 * isn't persisted to business_config until you Save). The "import old promo"
 * button seeds the legacy single promo as the first item.
 */

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminSavePromoBanners,
  adminUploadPromoImage,
  adminSeedLegacyImportPromo,
} from "@/actions/admin/promo-banners";
import type { PromoBanner } from "@/lib/promo/banners";

type Props = {
  initialBanners: PromoBanner[];
  locations: string[];
};

// Stable-ish client id for new rows.
function newId(): string {
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyBanner(location: string): PromoBanner {
  return {
    id: newId(),
    location,
    headline: "",
    text: "",
    amount_thb: 0,
    image_url: "",
    enabled: true,
    start_date: "",
    end_date: "",
    sort: 0,
  };
}

export function PromosManager({ initialBanners, locations }: Props) {
  const router = useRouter();
  const [banners, setBanners] = useState<PromoBanner[]>(initialBanners);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const defaultLocation = locations[0] ?? "import";

  function mutate(next: PromoBanner[]) {
    setBanners(next);
    setDirty(true);
    setMsg(null);
  }

  function patch(id: string, fields: Partial<PromoBanner>) {
    mutate(banners.map((b) => (b.id === id ? { ...b, ...fields } : b)));
  }

  function addBanner() {
    mutate([...banners, { ...emptyBanner(defaultLocation), sort: banners.length }]);
  }

  function removeBanner(id: string) {
    mutate(banners.filter((b) => b.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    const idx = banners.findIndex((b) => b.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= banners.length) return;
    const next = [...banners];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    mutate(next.map((b, i) => ({ ...b, sort: i })));
  }

  function save() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await adminSavePromoBanners({ banners });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setDirty(false);
      setMsg(`บันทึกแล้ว (${res.data?.count ?? banners.length} แบนเนอร์)`);
      setTimeout(() => setMsg(null), 3000);
      router.refresh();
    });
  }

  function seedLegacy() {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const res = await adminSeedLegacyImportPromo();
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setMsg(
        res.data?.added
          ? "นำเข้าโปรฯ เดิมเป็นรายการแรกแล้ว"
          : "โปรฯ เดิมถูกนำเข้าไปแล้วก่อนหน้านี้",
      );
      setTimeout(() => setMsg(null), 3000);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addBanner}
          disabled={pending}
          className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2"
        >
          + เพิ่มแบนเนอร์
        </button>
        <button
          type="button"
          onClick={seedLegacy}
          disabled={pending}
          className="rounded-lg border border-border bg-white dark:bg-surface hover:bg-surface-alt text-sm font-medium px-4 py-2 disabled:opacity-60"
        >
          นำเข้าโปรฯ เดิม (import.promo.*)
        </button>
        <div className="grow" />
        {err && <span className="text-xs text-red-600">⚠️ {err}</span>}
        {msg && <span className="text-xs text-emerald-600">✓ {msg}</span>}
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2"
        >
          {pending ? "กำลังบันทึก…" : dirty ? "บันทึกทั้งหมด" : "บันทึกแล้ว"}
        </button>
      </div>

      {banners.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-alt/40 p-8 text-center">
          <p className="text-sm text-muted">
            ยังไม่มีแบนเนอร์ — กด “+ เพิ่มแบนเนอร์” หรือ “นำเข้าโปรฯ เดิม” เพื่อเริ่มต้น.
          </p>
          <p className="mt-1 text-xs text-muted">
            (ระหว่างที่ยังว่าง หน้าฝากนำเข้าจะใช้โปรฯ เดิมจาก Business Config)
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {banners.map((b, i) => (
            <li key={b.id}>
              <BannerCard
                banner={b}
                index={i}
                total={banners.length}
                locations={locations}
                disabled={pending}
                onPatch={(fields) => patch(b.id, fields)}
                onRemove={() => removeBanner(b.id)}
                onMoveUp={() => move(b.id, -1)}
                onMoveDown={() => move(b.id, 1)}
                onUploadError={setErr}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-[11px] text-muted">
        💡 จัดลำดับด้วยปุ่ม ↑ / ↓ — แบนเนอร์ที่เปิดอยู่และอยู่ในช่วงวันที่จะแสดงบนหน้านั้นๆ
        เรียงตามลำดับ. อย่าลืมกด <strong>บันทึกทั้งหมด</strong> หลังแก้ไข.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Per-banner card
// ────────────────────────────────────────────────────────────

function BannerCard({
  banner,
  index,
  total,
  locations,
  disabled,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
  onUploadError,
}: {
  banner: PromoBanner;
  index: number;
  total: number;
  locations: string[];
  disabled: boolean;
  onPatch: (fields: Partial<PromoBanner>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUploadError: (e: string) => void;
}) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const inputCls =
    "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:opacity-60";

  async function handleUpload(file: File) {
    onUploadError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await adminUploadPromoImage(fd);
      if (!res.ok) {
        onUploadError(res.error);
        return;
      }
      onPatch({ image_url: res.data?.url ?? "" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        banner.enabled
          ? "border-border bg-white dark:bg-surface"
          : "border-dashed border-border bg-surface-alt/40 opacity-80"
      }`}
    >
      {/* Header row: index · enable · reorder · delete */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-md bg-surface-alt text-xs font-bold text-muted">
            #{index + 1}
          </span>
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={banner.enabled}
              disabled={disabled}
              onChange={(e) => onPatch({ enabled: e.target.checked })}
              className="h-4 w-4"
            />
            {banner.enabled ? "เปิดใช้งาน" : "ปิด"}
          </label>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={disabled || index === 0}
            aria-label="เลื่อนขึ้น"
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-30 hover:bg-surface-alt"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={disabled || index === total - 1}
            aria-label="เลื่อนลง"
            className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-30 hover:bg-surface-alt"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded-md border border-red-200 text-red-600 px-2.5 py-1 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
          >
            ลบ
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="หน้า (location)">
          <select
            value={banner.location}
            disabled={disabled}
            onChange={(e) => onPatch({ location: e.target.value })}
            className={inputCls}
          >
            {locations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
            {/* keep an unknown value visible if it isn't in the enum */}
            {!locations.includes(banner.location) && (
              <option value={banner.location}>{banner.location}</option>
            )}
          </select>
        </Field>

        <Field label="จำนวนเงิน/ส่วนลด (บาท · 0 = ไม่แสดง)">
          <input
            type="number"
            min={0}
            step="any"
            value={banner.amount_thb}
            disabled={disabled}
            onChange={(e) => onPatch({ amount_thb: Number(e.target.value) || 0 })}
            className={inputCls}
          />
        </Field>

        <Field label="หัวข้อ (headline)" full>
          <input
            type="text"
            value={banner.headline}
            disabled={disabled}
            onChange={(e) => onPatch({ headline: e.target.value })}
            className={inputCls}
            placeholder="โปรเหมาๆ"
          />
        </Field>

        <Field label="ข้อความ (รองรับขึ้นบรรทัดใหม่)" full>
          <textarea
            value={banner.text}
            disabled={disabled}
            rows={3}
            onChange={(e) => onPatch({ text: e.target.value })}
            className={inputCls}
          />
        </Field>

        <Field label="วันเริ่ม (YYYY-MM-DD · ว่าง = ไม่กำหนด)">
          <input
            type="date"
            value={banner.start_date}
            disabled={disabled}
            onChange={(e) => onPatch({ start_date: e.target.value })}
            className={inputCls}
          />
        </Field>

        <Field label="วันสิ้นสุด (YYYY-MM-DD · ว่าง = ไม่กำหนด)">
          <input
            type="date"
            value={banner.end_date}
            disabled={disabled}
            onChange={(e) => onPatch({ end_date: e.target.value })}
            className={inputCls}
          />
        </Field>
      </div>

      {/* Image */}
      <div className="rounded-lg border border-border bg-surface-alt/30 p-3 space-y-2">
        <p className="text-xs font-medium text-muted">รูปแบนเนอร์ (ไม่บังคับ)</p>
        <div className="flex items-center gap-3 flex-wrap">
          {banner.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={banner.image_url}
              alt=""
              className="h-16 w-auto max-w-[160px] rounded-md border border-border object-contain bg-white"
            />
          ) : (
            <span className="text-xs text-muted">ยังไม่มีรูป</span>
          )}
          <input
            id={`${uid}-file`}
            ref={fileRef}
            type="file"
            accept="image/*"
            disabled={disabled || uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f);
            }}
            className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white file:text-xs file:font-semibold disabled:opacity-50"
          />
          {uploading && <span className="text-xs text-muted">กำลังอัปโหลด…</span>}
          {banner.image_url && (
            <button
              type="button"
              onClick={() => onPatch({ image_url: "" })}
              disabled={disabled}
              className="text-xs text-red-600 underline disabled:opacity-50"
            >
              ลบรูป
            </button>
          )}
        </div>
        <input
          type="url"
          value={banner.image_url}
          disabled={disabled}
          onChange={(e) => onPatch({ image_url: e.target.value })}
          placeholder="หรือวาง URL รูปเอง"
          className={inputCls}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
