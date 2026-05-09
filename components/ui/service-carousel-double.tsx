"use client";

import { useState } from "react";

const CARD_WIDTH = 280;
const CARD_HEIGHT = 420;
const ROWS = 2;
const COLS = 6; // 12 cards total, 2 per column
const GAP = 20;
const STEP = CARD_WIDTH + GAP;
const VISIBLE = 3;

export function ServiceCarouselDouble() {
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);

  const maxOffset = (COLS - VISIBLE) * STEP;

  const goNext = () => {
    if (busy || offset >= maxOffset) return;
    setBusy(true);
    setOffset((o) => Math.min(maxOffset, o + STEP));
  };

  const goPrev = () => {
    if (busy || offset <= 0) return;
    setBusy(true);
    setOffset((o) => Math.max(0, o - STEP));
  };

  return (
    <div className="relative w-full overflow-hidden">
      <div
        className="flex transition-transform duration-500 ease-in-out"
        style={{ gap: GAP, transform: `translateX(-${offset}px)` }}
        onTransitionEnd={() => setBusy(false)}
      >
        {Array.from({ length: COLS }, (_, col) => (
          <div key={col} className="shrink-0 flex flex-col" style={{ width: CARD_WIDTH, gap: GAP }}>
            {Array.from({ length: ROWS }, (_, row) => (
              <div
                key={row}
                style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
                className="rounded-xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden flex flex-col"
              >
                <div className="w-full h-[200px] shrink-0 bg-surface dark:bg-background" />
                <div className="flex-1 p-4" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {offset > 0 && (
        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white dark:bg-surface border border-border shadow flex items-center justify-center text-lg hover:bg-surface transition-colors"
          aria-label="Previous"
        >
          ‹
        </button>
      )}
      {offset < maxOffset && (
        <button
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-white dark:bg-surface border border-border shadow flex items-center justify-center text-lg hover:bg-surface transition-colors"
          aria-label="Next"
        >
          ›
        </button>
      )}
    </div>
  );
}
