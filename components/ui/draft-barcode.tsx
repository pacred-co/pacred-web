/**
 * Decorative barcode for draft/preview docs (deterministic per text · client-safe · no deps).
 * ตัวจริงสแกนได้ generate ฝั่ง server บนเอกสารจริง — ตัวนี้ใช้โชว์บนดราฟต์/พรีวิวเท่านั้น.
 * (แยกมาจาก booking-draft เพื่อใช้ร่วมกันหลายหน้า · owner ปอน 2026-07-13)
 */
export function DraftBarcode({ text, className = "h-10 w-[180px]", logo = true }: { text: string; className?: string; logo?: boolean }) {
  let s = 2166136261;
  for (let i = 0; i < text.length; i++) s = Math.imul(s ^ text.charCodeAt(i), 16777619) >>> 0;
  const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const rects: { x: number; w: number }[] = [];
  let x = 0;
  for (let i = 0; i < 52; i++) {
    const w = 1 + Math.round(rnd() * 2.4);
    if (i % 2 === 0) rects.push({ x, w });
    x += w + 1;
  }
  return (
    <span className="inline-flex flex-col items-start">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/images/pacred-logo-tight.png" alt="Pacred" className="mb-1.5 h-6 w-auto object-contain" />
      ) : null}
      <svg viewBox={`0 0 ${x} 40`} className={`${className} text-foreground`} preserveAspectRatio="none" role="img" aria-label={`บาร์โค้ด ${text}`}>
        {rects.map((r, i) => <rect key={i} x={r.x} y={0} width={r.w} height={40} fill="currentColor" />)}
      </svg>
      <span className="mt-0.5 max-w-[200px] truncate text-[10px] font-semibold tracking-wider text-muted">{text}</span>
    </span>
  );
}
