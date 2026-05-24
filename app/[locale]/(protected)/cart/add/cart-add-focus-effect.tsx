"use client";

import { useEffect } from "react";

/**
 * Faithful port of `cart.php` L764-777 — the inline `<script>` the
 * legacy renders ONLY when `$_GET["page"] === "add"` (i.e. when the
 * URL is `/cart/add/` rather than `/cart/`). It auto-focuses the
 * global search input + pins the search bar to the top of the
 * screen so the user lands in "add product" mode:
 *
 * ```php
 * $("#input-search").trigger("focus");
 * $("#focus-search").addClass("focus-search");
 * $("#fixed-top-body").addClass("fixed-top-body");
 * ```
 *
 * The Pacred top chrome replaces the legacy `PcsTopMenu` with the
 * Pacred `<SearchBar />` (see `(protected)/layout.tsx`). SearchBar's
 * input has no `id` but does carry `name="url"` (the same `name` the
 * legacy form used) — so the equivalent selector is
 * `input[name="url"]`. The legacy `.focus-search` / `.fixed-top-body`
 * class toggles are not reproduced here because the Pacred SearchBar
 * uses a different (Tailwind) layout state machine; the `el.focus() +
 * scrollIntoView` already lands the user where the legacy "add" entry
 * intended them to be.
 *
 * The legacy also wired a body-click handler that removed the focus
 * classes on first click outside the search — Pacred's SearchBar
 * already manages its own collapse/expand on click-outside, so that
 * is not reproduced either.
 */
export function CartAddFocusEffect() {
  useEffect(() => {
    // Match the SearchBar's text input. The component renders the
    // input as soon as the page hydrates, so a single tick is enough
    // — no need for a polling fallback. If the input ever changes its
    // `name` attribute, this becomes a no-op (search just doesn't
    // auto-focus); it does not break the page.
    const input = document.querySelector<HTMLInputElement>(
      'input[name="url"]',
    );
    if (!input) return;
    input.focus();
    // Mirror the legacy behaviour of bringing the search bar fully
    // into view (the protected layout sticky-positions the bar; this
    // smooth-scroll ensures it sits at the top regardless of the
    // user's current scroll position).
    input.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return null;
}
