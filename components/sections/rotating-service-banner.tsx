"use client";

import { useEffect, useState } from "react";
import { ImportExportBanner } from "./import-export-banner";
import { ClearanceBanner } from "./clearance-banner";
import { PurchaseBanner } from "./purchase-banner";

/**
 * Rotating service-banner slot — cycles the Pacred service CTAs
 * (นำเข้า-ส่งออก · เคลียร์ศุลกากร · ฝากสั่งซื้อ) so the bottom banner keeps
 * changing instead of showing one fixed service ("แบนเนอร์สุ่มไปเรื่อยๆ
 * บริการไม่ซ้ำ").
 *
 * Behaviour:
 *  - random STARTING banner on mount (not always the first)
 *  - advances every {INTERVAL_MS} with a soft cross-fade
 *  - the next banner is never the same as the current one ("ไม่ซ้ำ")
 *  - respects prefers-reduced-motion: shows one random banner, no auto-rotate
 *
 * SSR-safe: server + first client render both use index 0, so there is no
 * hydration mismatch; the random pick happens in the mount effect.
 */

const BANNERS = [ImportExportBanner, ClearanceBanner, PurchaseBanner] as const;
const INTERVAL_MS = 7000;
const FADE_MS = 300; // keep in sync with the `duration-300` class below

export function RotatingServiceBanner() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (BANNERS.length < 2) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Track the live index in a closure so the no-repeat check never reads
    // stale state. Pick the random starting banner on the NEXT tick — not
    // synchronously in the effect body (that trips the react-hooks
    // "setState synchronously within an effect" rule / cascading renders).
    // The one-frame banner-0 flash before the random pick is imperceptible.
    let current = 0;
    const kickoff = window.setTimeout(() => {
      current = Math.floor(Math.random() * BANNERS.length);
      setIdx(current);
    }, 0);

    if (reduceMotion) return () => window.clearTimeout(kickoff); // no rotation

    const timer = window.setInterval(() => {
      setVisible(false); // fade out
      window.setTimeout(() => {
        let next = Math.floor(Math.random() * BANNERS.length);
        while (next === current) next = Math.floor(Math.random() * BANNERS.length);
        current = next;
        setIdx(next);
        setVisible(true); // fade the new one in
      }, FADE_MS);
    }, INTERVAL_MS);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(timer);
    };
  }, []);

  const Current = BANNERS[idx];
  return (
    <div className={`transition-opacity duration-300 ease-in-out ${visible ? "opacity-100" : "opacity-0"}`}>
      <Current />
    </div>
  );
}
