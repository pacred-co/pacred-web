"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * PCS wallet card — the white rounded card that overlaps the red header
 * band on the customer launchpad. Faithful port of legacy `member/menu.php`
 * `.col-123` / `.box-wallet` (D1 / ADR-0017, `d1-fidelity-customer.md` §1.1).
 *
 * Legacy behaviour reproduced:
 *   - card pulled up to overlap the header band (negative margin)
 *   - label "กระเป๋าสตางค์ (บาท)"
 *   - balance as a large animated count-up counter (legacy `.tam-counter`)
 *   - the Pacred logo on the right
 *   - a full-width gold progress bar
 *   - the whole card links to the wallet
 *
 * Client component: the count-up animation needs the browser. The balance
 * value is passed in from the server page (RLS-scoped read).
 */
export function PcsWalletCard({ balance }: { balance: number }) {
  const t = useTranslations("pcsHome");
  const animated = useCountUp(balance);

  return (
    <div className="-mt-12 px-4">
      <Link
        href="/wallet/history"
        className="block rounded-[2rem] bg-white shadow-[0_5px_15px_rgba(0,0,0,0.35)] dark:bg-surface"
        aria-label={t("walletLabel")}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <p className="text-sm text-foreground/70">{t("walletLabel")}</p>
            <p className="mt-0.5 font-mono text-3xl font-bold leading-tight text-amber-500">
              {animated.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <Image
            src="/images/pacred-logo-red.png"
            alt="Pacred"
            width={96}
            height={48}
            className="h-10 w-auto shrink-0 object-contain"
            unoptimized
          />
        </div>
        {/* Gold progress bar — legacy `bg-gradient-x-warning` */}
        <div className="mx-5 mt-3 mb-4 h-2 overflow-hidden rounded-full bg-surface-alt">
          <div className="h-full w-full bg-gradient-to-r from-amber-300 to-amber-500" />
        </div>
      </Link>
    </div>
  );
}

/** Count-up hook — animates 0 → target over ~900ms with an ease-out curve.
 *  Mirrors the legacy `.tam-counter` count animation on the wallet balance. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const duration = 900;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return value;
}
