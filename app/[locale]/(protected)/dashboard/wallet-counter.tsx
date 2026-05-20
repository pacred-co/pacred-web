"use client";

import { useEffect, useRef, useState } from "react";

/**
 * WalletCounter — the legacy `.tam-counter` count-up animation.
 *
 * 1:1 transcription of the jQuery behaviour in `assets/js/tam-it.js`
 * (lines 21-50) that menu.php loads: every `.tam-counter` element
 * animates its number from 0 → `data-count` over 1000ms with linear
 * easing, flooring the value each step, then on complete shows the
 * final value formatted with thousands separators + 2 decimals.
 *
 * menu.php markup (line 240):
 *   <span class="tam-counter font-3rem" data-count="<?=$walletTotal?>">
 *     <?php echo number_format($walletTotal,2); ?>
 *   </span>
 *
 * Client component — the count animation needs the browser. The
 * balance value comes from the server page (admin-client read of
 * tb_wallet.wallettotal).
 */
export function WalletCounter({ value }: { value: number }) {
  // Initial render shows the formatted final value (matches the
  // PHP `number_format($walletTotal,2)` text node before JS runs);
  // the animation then re-counts from 0 once mounted.
  const [display, setDisplay] = useState(() => formatWithCommas(value));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const duration = 1000; // tam-it.js: duration: 1000
    const start = performance.now();

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration); // linear easing
      const current = value * progress;
      if (progress < 1) {
        // tam-it.js step(): $this.text(Math.floor(this.countNum))
        setDisplay(String(Math.floor(current)));
        rafRef.current = requestAnimationFrame(step);
      } else {
        // tam-it.js complete(): $this.text(addCommas(countTo))
        setDisplay(formatWithCommas(value));
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return (
    <span className="tam-counter font-3rem" data-count={value}>
      {display}
    </span>
  );
}

/**
 * Mirrors PHP `number_format($n, 2)` — 2 decimals, comma thousands
 * separator (which is also what tam-it.js `addCommas()` produces on
 * the integer part, with the decimal part appended).
 */
function formatWithCommas(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
