"use client";

import { useState, useRef, useEffect } from "react";
import type { DropdownSection } from "@/types/booking";

interface CustomDropdownProps {
  label: string;
  displayValue: string;
  sections: DropdownSection[];
  onSelect: (value: string, label: string) => void;
}

export function CustomDropdown({ label, displayValue, sections, onSelect }: CustomDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] md:text-[13px] font-bold text-gray-800 leading-none">{label}</label>
      <div className="relative" ref={ref}>
        <button
          type="button"
          suppressHydrationWarning
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-2 md:gap-2.5 w-full h-10 md:h-[42px] border rounded-lg px-3 md:px-3.5 bg-white cursor-pointer transition-all ${
            open
              ? "border-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.12)]"
              : "border-gray-200 hover:border-red-300"
          }`}
        >
          <span className="flex-1 text-[13px] md:text-sm font-semibold text-gray-800 text-left truncate">{displayValue}</span>
          <svg
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180 text-red-600" : "text-gray-400"}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>

        {open && (
          <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-[999] bg-white border border-gray-200 rounded-xl shadow-xl p-4 max-h-[280px] overflow-y-auto">
            {sections.map((sec, si) => (
              <div key={si} className={si < sections.length - 1 ? "mb-3.5" : ""}>
                <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wide">{sec.heading}</p>
                <div className="flex flex-wrap gap-2">
                  {sec.chips.map((chip, ci) => (
                    <button
                      key={ci}
                      type="button"
                      onClick={() => { onSelect(chip.value, chip.label); setOpen(false); }}
                      className={`px-3.5 py-2 rounded-lg border text-left flex-1 min-w-[140px] transition-all text-sm font-bold ${
                        chip.label === displayValue
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-gray-200 bg-white hover:border-red-500 hover:bg-red-50"
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TextDropdownProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
}

export function TextDropdown({ label, value, onChange, suggestions, placeholder }: TextDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-bold text-gray-800 leading-none">{label}</label>
      <div className="relative" ref={ref}>
        <div
          className={`flex items-center h-[42px] border rounded-lg px-3.5 bg-white transition-all ${
            open ? "border-red-600 shadow-[0_0_0_3px_rgba(220,38,38,0.12)]" : "border-gray-200"
          }`}
        >
          <input
            type="text"
            suppressHydrationWarning
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="flex-1 min-w-0 text-sm font-semibold text-gray-800 bg-transparent outline-none border-none"
          />
          <svg
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"
            onClick={() => setOpen(v => !v)}
            className={`w-4 h-4 shrink-0 cursor-pointer transition-transform ${open ? "rotate-180 text-red-600" : "text-gray-400"}`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </div>

        {open && (
          <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-[999] bg-white border border-gray-200 rounded-xl shadow-xl p-4">
            <p className="text-[11px] font-bold text-gray-400 mb-2 uppercase tracking-wide">ตัวเลือกแนะนำ</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(s); setOpen(false); }}
                  className={`px-3.5 py-2 rounded-lg border flex-1 min-w-[140px] text-left text-sm font-bold transition-all ${
                    s === value
                      ? "border-red-600 bg-red-600 text-white"
                      : "border-gray-200 bg-white hover:border-red-500 hover:bg-red-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
