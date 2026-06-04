"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@/i18n/navigation";
import { Search, Camera, ClipboardPaste } from "lucide-react";

/**
 * The centered URL-paste order bar — the hero of `/cart/add`
 * ("เพิ่มสินค้าในรถเข็น").
 *
 * Submits to the REAL wired flow (no fake handler): a native
 * `<form action="/search" method="GET">` with `<input name="url">`
 * lands on `/search?url=<paste>`, which resolves the 1688 / Taobao /
 * Tmall product (MODE A) and renders the `UrlPasteAddToCart` island →
 * `addCartItem` writes `tb_cart`. This is the same submit target the
 * home-hero `SearchBar` uses (components/sections/search-bar.tsx L103),
 * so behaviour stays consistent across the app.
 *
 * The form works with JS disabled (native GET submit); this client
 * island only ADDS quality-of-life: autofocus on mount, a "paste from
 * clipboard" button, and an empty-submit guard.
 *
 * Mobile-first (AGENTS.md §6): input text ≥16px (no iOS zoom-on-focus),
 * tap targets ≥44px, the primary CTA is full-width + thumb-reachable.
 */
export function CartAddUrlForm() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");

  // The page exists for one job: paste a URL. Land the cursor in the box.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handlePaste() {
    try {
      const text = (await navigator.clipboard.readText())?.trim();
      if (text) setValue(text);
    } catch {
      // Clipboard blocked (permissions / non-HTTPS) — fall through to focus
      // so the user can paste manually with the keyboard.
    }
    inputRef.current?.focus();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    // Don't navigate to an empty /search — just nudge focus back.
    if (!value.trim()) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }

  return (
    <form
      action="/search"
      method="GET"
      onSubmit={handleSubmit}
      className="w-full space-y-3"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 md:h-6 md:w-6 text-primary-500" />
        <input
          ref={inputRef}
          type="text"
          name="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="วางลิงก์สินค้า 1688 / Taobao / Tmall ที่นี่"
          autoComplete="off"
          inputMode="url"
          suppressHydrationWarning
          className="w-full h-14 md:h-16 rounded-2xl border-2 border-primary-200 bg-white pl-12 md:pl-14 pr-14 text-[16px] md:text-[17px] font-medium text-gray-900 placeholder:text-gray-400 shadow-[0_8px_30px_rgba(179,0,0,0.08)] outline-none transition focus:border-primary-500 focus:shadow-[0_8px_30px_rgba(179,0,0,0.15)]"
        />
        {/* Reverse-image / camera search → the /search image panel
            (?img=1 auto-scrolls + highlights it there). An <a> inside the
            form does NOT submit it — the camera ≠ text search. */}
        <Link
          href="/search?img=1"
          aria-label="ค้นหาด้วยรูปภาพ"
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition"
        >
          <Camera className="h-5 w-5" />
        </Link>
      </div>

      <button
        type="submit"
        className="w-full inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[16px] font-bold shadow-lg shadow-primary-600/30 hover:shadow-primary-600/40 hover:-translate-y-0.5 transition-all"
      >
        <Search className="h-5 w-5" strokeWidth={2.5} />
        ค้นหาสินค้า &amp; สั่งซื้อ
      </button>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handlePaste}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-4 py-2 text-[13px] font-medium text-gray-600 hover:border-primary-300 hover:text-primary-600 transition min-h-[40px]"
        >
          <ClipboardPaste className="h-4 w-4" />
          วางลิงก์จากคลิปบอร์ด
        </button>
      </div>
    </form>
  );
}
