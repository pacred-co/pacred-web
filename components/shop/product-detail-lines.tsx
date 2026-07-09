"use client";

/**
 * <ProductDetailLines> — the ONE canonical renderer for a shop line-item's
 * full detail set (ชื่อสินค้า · ชื่อร้านจีน · สี · ขนาด · รายละเอียด), with an
 * on-demand ZH→TH <TranslateButton> beside every Chinese field.
 *
 * Used by BOTH the customer (service-order/[hNo]) and admin
 * (service-orders/[hNo]) detail surfaces so the visible detail set can never
 * drift "มีๆหายๆ" between the two sides. DISPLAY-ONLY — renders existing string
 * fields, mutates nothing. Surface-specific chrome (provider badge, price,
 * tracking, image, internal cnote) stays OUTSIDE this block.
 *
 * Every field renders only when present, in every status (no status gating).
 */

import { TranslateButton } from "@/components/translate/translate-button";

type Props = {
  title?: string | null;
  url?: string | null;
  shopName?: string | null;
  color?: string | null;
  size?: string | null;
  details?: string | null;
  className?: string;
};

function has(v?: string | null): v is string {
  return typeof v === "string" && v.trim() !== "" && v.trim() !== "—";
}

export function ProductDetailLines({
  title,
  url,
  shopName,
  color,
  size,
  details,
  className = "",
}: Props) {
  const titleText = has(title) ? title.trim() : "—";

  return (
    <div className={`min-w-0 space-y-0.5 ${className}`}>
      {/* ชื่อสินค้า (link if url) */}
      <div className="min-w-0">
        {has(url) ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate font-medium text-sm text-primary-600 hover:underline"
            title={titleText}
          >
            {titleText}
          </a>
        ) : (
          <p className="font-medium text-sm line-clamp-2">{titleText}</p>
        )}
        {has(title) && <TranslateButton text={title} className="mt-0.5" />}
      </div>

      {/* ชื่อร้านจีน */}
      {has(shopName) && (
        <div className="min-w-0">
          <p className="text-xs text-muted">🏪 {shopName}</p>
          <TranslateButton text={shopName} />
        </div>
      )}

      {/* สี · ขนาด */}
      {(has(color) || has(size)) && (
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {has(color) && <>🎨 {color}</>}
            {has(color) && has(size) && <> · </>}
            {has(size) && <>📏 {size}</>}
          </p>
          {has(color) && <TranslateButton text={color} />}
          {has(size) && <TranslateButton text={size} className="ml-1" />}
        </div>
      )}

      {/* รายละเอียด */}
      {has(details) && (
        <div className="min-w-0">
          <p className="text-xs text-muted whitespace-pre-wrap">📝 {details}</p>
          <TranslateButton text={details} />
        </div>
      )}
    </div>
  );
}
