"use client";

import { useEffect } from "react";
import type { SalesCard } from "@/types/booking";

interface SalesModalProps {
  open: boolean;
  onClose: () => void;
  cards: SalesCard[];
}

export function SalesModal({ open, onClose, cards }: SalesModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[999999] flex items-center justify-center p-3 md:p-5"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl md:rounded-3xl w-full max-w-[900px] max-h-[90vh] overflow-y-auto p-5 md:p-10 relative animate-[pfIn_0.2s_ease]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-10 h-10 rounded-full border border-gray-200 bg-white flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-400 transition-all"
          aria-label="ปิด"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>

        <h2 className="text-xl font-bold text-gray-800">ติดต่อทีมขาย</h2>
        <p className="text-sm text-gray-500 mt-1">เลือกเซลล์ที่รับผิดชอบด้านที่คุณต้องการ</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-7">
          {cards.map((c, i) => (
            <a
              key={i}
              href={c.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group border border-gray-100 rounded-2xl p-5 text-center transition-all hover:border-red-200 hover:shadow-[0_10px_25px_rgba(220,38,38,0.1)] block"
            >
              <div className="w-20 h-20 rounded-full mx-auto mb-3 border-[3px] border-white shadow-md overflow-hidden bg-gray-100">
                <img src={c.image} alt={c.alt} className="w-full h-full object-cover" />
              </div>
              <p className="font-bold text-sm text-gray-800">{c.name}</p>
              <p className="text-[12px] text-gray-500 leading-relaxed mt-1 line-clamp-2">{c.slogan}</p>
              <p className="text-sm font-semibold text-gray-700 mt-2">{c.phone}</p>
              <span className="block w-full mt-4 py-2.5 rounded-lg bg-gray-50 text-gray-800 text-[13px] font-bold group-hover:bg-red-600 group-hover:text-white transition-colors">
                {c.button}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
