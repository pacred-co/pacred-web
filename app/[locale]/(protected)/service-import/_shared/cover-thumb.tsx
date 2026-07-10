"use client";

import { useState } from "react";
import { NO_COVER_IMAGE } from "@/lib/legacy-image";

/**
 * Customer-facing forwarder/shop cover thumbnail with a built-in `onError`
 * degradation to the neutral Pacred no-cover placeholder.
 *
 * Why a shared client component: the fallback (no cover → placeholder) is
 * resolved server-side by `forwarderCoverUrl()`, but a REAL cover URL can
 * still fail to load at runtime — most importantly a stale `pcscargo.co.th`
 * legacy host that is blocked or decommissioned during the brand split. A
 * plain server-rendered `<img>` cannot react to that; it would show a broken
 * image (or, worse, leak the failed legacy host in the DOM). This component
 * swaps to {@link NO_COVER_IMAGE} on error so the customer never sees a broken
 * or PCS-branded image.
 *
 * Renderable from server components (it is a client component). Centralizing
 * it here means every customer no-cover surface shares ONE fallback, so the
 * PCS "default.png" leak the owner flagged (2026-07-03) cannot re-appear.
 */
export function CoverThumb({
  src,
  className,
  width,
  height,
  alt = "",
}: {
  /** Already resolved via `forwarderCoverUrl()` (empty covers are the placeholder). */
  src: string;
  className?: string;
  width?: number;
  height?: number;
  /** Optional alt text (defaults to "" for decorative covers). */
  alt?: string;
}) {
  const [errored, setErrored] = useState(false);
  const finalSrc = errored ? NO_COVER_IMAGE : src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={finalSrc}
      alt={alt}
      className={className}
      width={width}
      height={height}
      onError={() => {
        // Guard: don't loop if the placeholder itself somehow fails.
        if (!errored) setErrored(true);
      }}
    />
  );
}
