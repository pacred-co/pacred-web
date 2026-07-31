"use client";

import Image from "next/image";
import { PanelLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PCS_SIDEBAR_RAIL_KEY } from "./pcs-sidebar-rail-init";

/**
 * Customer sidebar RED BRAND HEADER — a full-height (h-14) red bar carrying the
 * Pacred logo (left) + rail pin/collapse toggle (right), flush with the top so it
 * merges seamlessly with the NavBar's red bar (owner 2026-07-31 "เอาแบบในภาพ ·
 * เป็นเนื้อเดียวกัน · ยกขึ้นไป · มีเงา") — exactly like the admin sidebar's brand bar.
 *
 * The sidebar is lifted to top:0 with z above the NavBar (legacy-overrides.css), so
 * this red bar covers the NavBar's left corner → one continuous red top. The NavBar's
 * own Pacred logo is hidden on md+ (this brand shows it) and returns < md.
 *
 * Rail behaviour (mirrors admin): the red bar STAYS in the collapsed rail —
 *   · the full white wordmark + pin fold away (`.pcs-rail-hide`)
 *   · a compact "P" mark appears (`.pcs-rail-only`, object-left crop)
 * so the red top stays continuous whether collapsed or open. Clicking the pin
 * toggles `body.pcs-sidebar-rail` (rail ⇄ pinned open) + persists the choice.
 * Desktop-only (md+) — the sidebar is display:none on mobile.
 */
export function PcsSidebarPin() {
  const toggle = () => {
    const rail = document.body.classList.toggle("pcs-sidebar-rail");
    try {
      localStorage.setItem(PCS_SIDEBAR_RAIL_KEY, rail ? "1" : "0");
    } catch {
      /* localStorage blocked → the in-session toggle still works via the class */
    }
  };
  return (
    <div className="relative flex h-14 items-center justify-start gap-2 bg-[#B91C1C] px-0">
      {/* Full white wordmark — expanded / hovered */}
      <Link
        href="/"
        aria-label="Pacred — หน้าแรก"
        className="pcs-rail-hide ml-4 block h-11 w-[167px] overflow-hidden transition-opacity hover:opacity-90"
      >
        {/* Owner-supplied brand logo (2026-07-31 "ใช้ภาพนี้แทน") — yellow P + white
            acred + S badge. pacredlogoes01.png is a 1080×1080 square with the 1014×267
            wordmark at (x=39, y=333) surrounded by transparent padding, so plain
            object-contain rendered it tiny. We scale it up (×0.165 → 178px) inside an
            overflow box and offset it so ONLY the wordmark shows — filling the header. */}
        <Image
          src="/images/pacredlogoes01.png"
          alt="Pacred"
          width={1080}
          height={1080}
          priority
          className="max-w-none h-[178px] w-[178px] -ml-[6px] -mt-[55px]"
        />
      </Link>

      {/* Compact "P" mark — collapsed rail only. Owner-supplied square P (2026-07-31
          "ตอนปรับย่อเข้ามาให้ใช้ paclogoes07"); it's near full-bleed → plain object-contain. */}
      <Link href="/" aria-label="Pacred — หน้าแรก" className="pcs-rail-only mx-auto items-center">
        <Image
          src="/images/paclogoes07.png"
          alt="Pacred"
          width={1080}
          height={1080}
          className="h-9 w-9 object-contain"
        />
      </Link>

      {/* Rail pin / collapse toggle — expanded / hovered only */}
      <button
        type="button"
        onClick={toggle}
        aria-label="ปักหมุด/ย่อเมนู"
        title="ปักหมุดเมนูให้กางค้าง / ย่อกลับเป็นแถบไอคอน"
        className="pcs-rail-hide absolute right-2 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white md:inline-flex"
      >
        <PanelLeft className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}
