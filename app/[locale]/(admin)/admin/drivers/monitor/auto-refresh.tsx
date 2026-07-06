"use client";

/**
 * AutoRefresh — near-real-time refresh for the delivery monitor board.
 *
 * The monitor is a live-ish wall board of drivers currently out delivering
 * (พี่ป๊อป spec §3 "monitor กำลังจัดส่ง … แสดง Real-time"). We don't run a
 * websocket for it — instead a client wrapper calls `router.refresh()` on a
 * fixed interval so the server component re-runs its queries and the delivered
 * count / delivery photos update as drivers upload them. Every ~30s is close
 * enough for a warehouse wall screen and costs one lightweight RSC fetch.
 *
 * DISPLAY-ONLY: this triggers a re-render, never a mutation.
 *
 * The `intervalMs` default (30_000) matches the "≈ every 30 วินาที" note the
 * page shows the operator, so the UI promise + the behaviour agree.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);

  return null;
}
