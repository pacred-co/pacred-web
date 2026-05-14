"use client";

import { useEffect, useRef, type HTMLAttributes, type ReactNode } from "react";

type Props = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

export function HorizontalScroller({ children, className, style, ...rest }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollStart = 0;
    let moved = false;

    function canScrollH() {
      return el!.scrollWidth > el!.clientWidth + 1;
    }

    function onPointerDown(e: PointerEvent) {
      if (e.pointerType !== "mouse") return; // touch uses native momentum
      if (e.button !== 0) return;
      if (!canScrollH()) return;
      isDown = true;
      moved = false;
      startX = e.clientX;
      scrollStart = el!.scrollLeft;
      el!.style.cursor = "grabbing";
    }

    function onPointerMove(e: PointerEvent) {
      if (!isDown) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) moved = true;
      el!.scrollLeft = scrollStart - dx;
    }

    function onPointerUp() {
      if (!isDown) return;
      isDown = false;
      el!.style.cursor = "";
    }

    function onClickCapture(e: MouseEvent) {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    }

    function onWheel(e: WheelEvent) {
      if (!canScrollH()) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el!.scrollLeft += e.deltaY;
      }
    }

    el.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("click", onClickCapture, true);
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClickCapture, true);
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ userSelect: "none", WebkitUserSelect: "none", ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
