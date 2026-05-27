"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef } from "react";

/**
 * Legacy PCS Cargo `.single-item-member` promo carousel.
 *
 * 1:1 transcription of the slick init in `member/index.php` L168-177:
 *   $('.single-item-member').slick({ dots:true, slidesToShow:1,
 *     slidesToScroll:1, arrows:true, autoplay:true, autoplaySpeed:5000 });
 *
 * jQuery is loaded globally by `(protected)/layout.tsx` (vendors.min.js); the
 * slick plugin is per-screen, so this component lazy-loads `slick.js` then
 * initialises the carousel — the promo banners rotate exactly as the legacy.
 */
export function PcsCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // react-hooks/exhaustive-deps: snapshot ref.current at mount so the
    // cleanup function uses the same node it initialised against — by
    // unmount, ref.current may have moved or be null.
    const node = ref.current;
    let cancelled = false;
    const SLICK_JS = "/legacy/pcs/assets/plugins/slick/slick.js";

    function initSlick() {
      const w = window as any;
      const jq = w.jQuery;
      if (cancelled || !jq || !node) return;
      const $el = jq(node);
      if ($el.slick && !$el.hasClass("slick-initialized")) {
        $el.slick({
          dots: true,
          slidesToShow: 1,
          slidesToScroll: 1,
          arrows: true,
          autoplay: true,
          autoplaySpeed: 5000,
        });
      }
    }

    function ensureSlickThenInit() {
      const w = window as any;
      if (w.jQuery && w.jQuery.fn && w.jQuery.fn.slick) {
        initSlick();
        return;
      }
      const existing = document.querySelector(`script[src="${SLICK_JS}"]`);
      if (existing) {
        existing.addEventListener("load", initSlick);
        return;
      }
      const s = document.createElement("script");
      s.src = SLICK_JS;
      s.onload = initSlick;
      document.body.appendChild(s);
    }

    // jQuery loads via the layout's vendors.min.js — it may not be on `window`
    // yet at mount, so poll briefly for it.
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if ((window as any).jQuery) {
        window.clearInterval(timer);
        ensureSlickThenInit();
      } else if (tries > 100) {
        window.clearInterval(timer);
      }
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      try {
        const w = window as any;
        if (w.jQuery && node) {
          const $el = w.jQuery(node);
          if ($el.slick && $el.hasClass("slick-initialized")) {
            $el.slick("unslick");
          }
        }
      } catch {
        /* noop */
      }
    };
  }, []);

  return (
    <div className="single-item-member" ref={ref}>
      {children}
    </div>
  );
}
