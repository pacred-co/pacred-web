"use client";

/**
 * ONE "แปลไทย" switch shared by every Chinese string on a product card.
 *
 * owner 2026-08-03: "default เป็นจีนนะ แต่กดแปลแล้วเป็นไทย" then "ขอแปลชื่อด้วย" —
 * the title lives in <RichProductCard> while the option labels live several
 * levels down in <SkuMultiPicker>, so the on/off state has to be shared rather
 * than owned by either one. Context keeps it to one switch and one visual state
 * instead of a per-section toggle the customer has to hunt for twice.
 *
 * Chinese is the DEFAULT on purpose: it is the wording the shop itself uses, and
 * it is what the customer ends up quoting back when asking about an order.
 *
 * DISPLAY-ONLY — never touches price/qty/money.
 */

import { createContext, useContext, useState } from "react";
import { Languages } from "lucide-react";
import { AutoTranslateText } from "@/components/translate/auto-translate";

const ThaiToggleCtx = createContext<{ thai: boolean; setThai: (v: boolean) => void }>({
  thai: false,
  setThai: () => {},
});

export function ThaiToggleProvider({ children }: { children: React.ReactNode }) {
  const [thai, setThai] = useState(false);
  return <ThaiToggleCtx.Provider value={{ thai, setThai }}>{children}</ThaiToggleCtx.Provider>;
}

export function useThaiToggle() {
  return useContext(ThaiToggleCtx);
}

/**
 * A Chinese string that follows the switch. Renders the source verbatim while the
 * switch is off; the shared <TranslateProvider> batch supplies the Thai when it's on
 * (and falls back to the source if that string wasn't translated).
 */
export function ThaiText({ text, className }: { text: string; className?: string }) {
  const { thai } = useThaiToggle();
  if (!thai) return <span className={className}>{text}</span>;
  return <AutoTranslateText text={text} className={className} showNote={false} />;
}

/** The switch itself — place it wherever it reads best on the card. */
export function ThaiToggleButton({ className = "" }: { className?: string }) {
  const { thai, setThai } = useThaiToggle();
  return (
    <button
      type="button"
      onClick={() => setThai(!thai)}
      aria-pressed={thai}
      title={thai ? "กลับไปดูข้อความต้นฉบับภาษาจีนจากร้าน" : "แปลชื่อสินค้าและตัวเลือกเป็นภาษาไทย"}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-bold transition ${
        thai
          ? "border-primary-500 bg-primary-50 text-primary-700"
          : "border-border bg-white text-muted hover:border-red-300 hover:text-primary-600"
      } ${className}`}
    >
      <Languages className="h-3.5 w-3.5" />
      {thai ? "ดูต้นฉบับภาษาจีน" : "แปลไทย"}
    </button>
  );
}
