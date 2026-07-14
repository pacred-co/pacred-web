import { useCallback, useState } from "react";

/**
 * Excel-like drag-to-reorder columns (ภูม 2026-07-14 · ไอแต้ม's `colReorder`).
 * In-session order state (no dependency · no SSR/hydration risk). Consumers render
 * header + body cells in `order`, make each `<th>` draggable, and call `move(from,to)`
 * on drop. `reset` restores the default order.
 */
export function useColumnOrder(defaultOrder: readonly string[]) {
  const [order, setOrder] = useState<string[]>(() => [...defaultOrder]);

  const move = useCallback((from: string, to: string) => {
    setOrder((cur) => {
      const fi = cur.indexOf(from);
      const ti = cur.indexOf(to);
      if (fi < 0 || ti < 0 || fi === ti) return cur;
      const next = [...cur];
      next.splice(fi, 1);
      next.splice(ti, 0, from);
      return next;
    });
  }, []);

  const reset = useCallback(() => setOrder([...defaultOrder]), [defaultOrder]);

  return { order, move, reset };
}
