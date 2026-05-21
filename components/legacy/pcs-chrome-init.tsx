"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Legacy PCS chrome initialiser — the "post-hydration" half of legacy
 * `all-script.php` + `app.min.js` that mutates the rendered DOM.
 *
 * Why this is a Client Component (not an inline `<script>` in layout):
 *
 * React 19 hydration walks the DOM AFTER the layout's inline scripts have
 * already run. Any jQuery-driven mutation (`$('.menu-shop').html(...)`,
 * adding `.active` to a `<li>`) made before hydration gets REVERTED when
 * React reconciles its tree against the live DOM — the JSX-hardcoded text
 * (e.g. "บริการฝากสั่งสินค้า") wins back over the lang/th.js translation
 * (e.g. "บริการฝากสั่ง").
 *
 * Running the kick inside `useEffect` defers it until React has finished
 * hydrating, so subsequent DOM mutations are guaranteed to stick.
 *
 * Two pieces of legacy behaviour are replayed here, both verbatim 1:1 with
 * the original (no design decisions):
 *
 *   (a) **Language string-table auto-load** — `app.min.js` L239-273.
 *       Reads the `set_pcsLangCook` cookie (default `'th'`) and calls
 *       `pcsLangMenu(lang)`, which does
 *       `$.getScript(basePath + "assets/js/lang/" + lang + ".js")`. The
 *       resulting lang/X.js mutates `.menu-shop`, `.menu-forwarder`,
 *       `.menu-payment`, `.menu-cash-wallet`, `.lang-baht`, etc. to the
 *       runtime-translated text.
 *
 *   (b) **Active-nav highlight + accordion toggle** — `all-script.php`
 *       L725-771. Filters `#main-menu-navigation a` whose `href` matches
 *       the current URL, walks the ancestors up to `.main-menu-content`,
 *       and adds `.active`/`.selected`/`.in` classes so the current
 *       section's accordion is expanded + the menu item is highlighted
 *       in the brand red.
 *
 * Both pieces depend on globals defined by `vendors.min.js` (jQuery,
 * Cookies) + `app.min.js` (`pcsLangMenu`). This component polls until
 * those are available, then runs both pieces. The polling resolves
 * within one tick in practice (everything is loaded synchronously by
 * the time the layout finishes streaming).
 */
declare global {
  interface Window {
    jQuery?: JQueryStatic;
    pcsLangMenu?: (lang: string) => void;
    Cookies?: { get: (name: string) => string | undefined };
  }
}

type JQueryStatic = (s: string | object | ((arg?: unknown) => void)) => {
  filter: (fn: () => boolean) => JQueryStatic;
  parentsUntil: (s: string) => {
    each: (fn: (this: HTMLElement) => void) => void;
  };
  addClass: (cls: string) => JQueryStatic;
  removeClass: (cls: string) => JQueryStatic;
  children: (s?: string) => JQueryStatic;
  parent: (s?: string) => JQueryStatic;
  parents: (s: string) => JQueryStatic;
  next: (s: string) => JQueryStatic;
  is: (s: string) => boolean;
  hasClass: (s: string) => boolean;
  length: number;
  on: (ev: string, fn: (e: Event) => void) => void;
};

export function PcsChromeInit() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const tryInit = () => {
      if (cancelled) return;
      attempts++;
      const win = window as Window;
      const $ = win.jQuery;
      const pcsLangMenu = win.pcsLangMenu;
      const Cookies = win.Cookies;

      if (!$ || typeof pcsLangMenu !== "function") {
        if (attempts > 100) return; // ~5s timeout
        setTimeout(tryInit, 50);
        return;
      }

      // (a) Auto-load lang/X.js per the `set_pcsLangCook` cookie.
      try {
        const lang = (Cookies && Cookies.get("set_pcsLangCook")) || "th";
        pcsLangMenu(lang);
      } catch {
        /* swallow — legacy never surfaced lang load failures */
      }

      // (b) Active-nav highlight + accordion-open for the current URL.
      // Equivalent to `all-script.php` L725-771, but uses native DOM APIs
      // for clarity. The legacy script used jQuery filter + ancestor walk;
      // the end state (the set of `.active`/`.selected`/`.in` classes) is
      // identical.
      try {
        const url = window.location.href;
        const path = url.replace(
          window.location.protocol + "//" + window.location.host + "/",
          ""
        );
        const anchors = document.querySelectorAll<HTMLAnchorElement>(
          "#main-menu-navigation a"
        );
        anchors.forEach((a) => {
          // Clear any prior active state from a previous route.
          a.classList.remove("active");
        });
        document
          .querySelectorAll(
            "#main-menu-navigation li.selected, #main-menu-navigation li.active, #main-menu-navigation ul.in"
          )
          .forEach((el) => {
            el.classList.remove("selected");
            el.classList.remove("active");
            el.classList.remove("in");
          });

        const match = Array.from(anchors).find(
          (a) => a.href === url || a.href === path
        );
        if (match) {
          match.classList.add("active");
          // Walk ancestors up to `.main-menu-content`, adding `.selected`
          // to <li> and `.in` to <ul> so the accordion opens to the active
          // child.
          let n: HTMLElement | null = match.parentElement;
          while (n && !n.classList.contains("main-menu-content")) {
            if (n.tagName === "LI") {
              if (n.parentElement?.id === "main-menu-navigation") {
                n.classList.add("active");
              } else {
                n.classList.add("selected");
              }
            } else if (n.tagName === "UL") {
              n.classList.add("in");
            }
            n = n.parentElement;
          }
        }
      } catch {
        /* swallow */
      }
    };

    tryInit();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
