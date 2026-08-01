/**
 * profile-section-nav.tsx — หัวแถวสถานะ + แบ่งหน้า ของแต่ละบริการบนโปรไฟล์ลูกค้า
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 owner 2026-07-31 (จอ /admin/customers/PR005):
 *   *"ตรงแต่ละบริการ เราอยากให้มีหัวแถวรายการสถานะของแต่ละงาน เหมือนหน้าหลัก
 *    แต่แค่เป็นของ PR นั้นๆ ... กดดูทั้งหมดมันก็ควรยังอยู่ในหน้าโปรไฟล์ลูกค้า
 *    ไม่ควรย้ายไปหน้านำเข้า ... พอกดแสดง 100 ก็หางานไม่เจอ ไม่มีหน้า 1 2 3"*
 *
 * ออกแบบเป็น SERVER-RENDERED ลิงก์ล้วน (ไม่มี client state) — ตรงกับสถาปัตย์ของ
 * legacy-view ที่เป็น server component ทั้งใบ: แท็บ/หน้าคือ `<a href="?param=x#anchor">`
 * → โหลดหน้าใหม่ฝั่ง server แล้ว scroll กลับมาที่ section เดิมด้วย anchor.
 *
 * กติกาที่ตั้งใจ:
 *  • นิยามสถานะ = **ชุดเดียวกับหน้ารายการหลัก** (ห้ามมี 2 นิยาม — ปัญหา "ข้อมูล
 *    ไม่เป็นเส้นเดียวกัน" ที่ owner ด่าเกิดจากแต่ละจอมีลิสต์ของตัวเอง):
 *    forwarder = STATUS_LABEL ของ /admin/forwarders (1..7 + 6.1 + c + p) ·
 *    shop = LEGACY_ORDER_TABS (lib/legacy-status-map.ts) · yuan = paystatus 1/2/3
 *  • แท็บ "เครดิตสินค้า/สถานะพิเศษ" โชว์เฉพาะลูกค้าที่ตั้งเป็นเครดิต (owner เคาะ)
 *    — ผู้เรียกเป็นคนกรอง แท็บนี้แค่ render สิ่งที่ได้รับ
 *  • ลิงก์ merge query เดิมทั้งหมด (แท็บของ section หนึ่ง ต้องไม่ล้างแท็บ/หน้า
 *    ของ section อื่น) + reset หน้าเป็น 1 เมื่อเปลี่ยนแท็บ
 */

export type SectionTab = {
  /** ค่าใน URL param ("" = ทั้งหมด) */
  code: string;
  label: string;
  count: number;
  /**
   * สีจาก SOT ของสถานะนั้น (owner 2026-07-31 "สีต้องเหมือนหน้าหลัก · ดึงจากที่เดียวกัน"):
   * `activeCls` = พื้นแท็บตอน active (fstatusTabActiveCls / HSTATUS chip) ·
   * `badgeCls` = สีเม็ดตัวเลข (fstatusTabBadge / ตาม chip สถานะ). ไม่ส่ง = โทนกลาง.
   */
  activeCls?: string;
  badgeCls?: string;
};

/** สร้าง href ที่คงพารามิเตอร์เดิมทุกตัว แล้วทับเฉพาะที่สั่ง + ต่อ anchor */
export function buildSectionHref(
  current: Record<string, string | string[] | undefined>,
  overrides: Record<string, string | null>,
  anchor: string,
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null && val !== "") p.set(k, val);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v == null || v === "") p.delete(k);
    else p.set(k, v);
  }
  const qs = p.toString();
  return `${qs ? `?${qs}` : "?"}#${anchor}`;
}

/** หัวแถวสถานะของ section (เหมือน tab strip หน้าหลัก · scoped ลูกค้ารายเดียว) */
export function SectionStatusTabs({
  anchor,
  current,
  statusParam,
  pageParam,
  active,
  tabs,
}: {
  anchor: string;
  current: Record<string, string | string[] | undefined>;
  statusParam: string;
  pageParam: string;
  active: string;
  tabs: SectionTab[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 bg-surface-alt/40 px-3 py-2">
      {tabs.map((t) => {
        const isActive = active === t.code;
        const base =
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition";
        // กติกาสีเดียวกับ tab strip หน้ารายการหลักเป๊ะ (page.tsx L776-791):
        // active = พื้น vivid ของสถานะ + ring · ไม่ active = ขาว/ขอบ · เม็ดเลข =
        // สีประจำสถานะ (จาก SOT) และตอน active เป็นขาวโปร่งให้อ่านบนพื้นสีได้
        const cls = isActive
          ? `${t.activeCls ?? "bg-primary-600 text-white"} shadow-md ring-2 ring-black/10`
          : "bg-white border border-border text-foreground hover:bg-surface-alt hover:border-primary-300 dark:bg-surface";
        return (
          <a
            key={t.code || "all"}
            href={buildSectionHref(current, { [statusParam]: t.code || null, [pageParam]: null }, anchor)}
            className={`${base} ${cls}`}
          >
            {t.label}
            <span
              className={`inline-flex min-w-[1.35rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums ${
                isActive ? "bg-white/25 text-white" : t.badgeCls ?? "bg-slate-500 text-white"
              }`}
            >
              {t.count.toLocaleString("th-TH")}
            </span>
          </a>
        );
      })}
    </div>
  );
}

/**
 * แถบแบ่งหน้า — ก่อนหน้า · 1 2 3 … · ถัดไป (ลิงก์ล้วน · anchor กลับ section เดิม).
 * โชว์เสมอเมื่อมีมากกว่า 1 หน้า — นี่คือตัวแก้ "กดแสดง 100 แล้วหางานไม่เจอ".
 */
export function SectionPagination({
  anchor,
  current,
  pageParam,
  page,
  pageSize,
  totalRows,
}: {
  anchor: string;
  current: Record<string, string | string[] | undefined>;
  pageParam: string;
  page: number;
  pageSize: number;
  totalRows: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  if (totalPages <= 1) return null;

  // หน้าที่โชว์: 1 … (p-1) p (p+1) … last — โปรไฟล์ลูกค้าไม่ได้มีเป็นพันหน้า
  const pages: (number | "…")[] = [];
  const push = (n: number | "…") => {
    if (pages[pages.length - 1] !== n) pages.push(n);
  };
  push(1);
  if (page - 1 > 2) push("…");
  for (let n = Math.max(2, page - 1); n <= Math.min(totalPages - 1, page + 1); n++) push(n);
  if (page + 1 < totalPages - 1) push("…");
  if (totalPages > 1) push(totalPages);

  const link = (n: number) => buildSectionHref(current, { [pageParam]: n <= 1 ? null : String(n) }, anchor);
  const btn = "inline-flex min-w-[30px] items-center justify-center rounded-lg border px-2 py-1 text-[11.5px] font-semibold";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
      <span className="text-[11px] text-muted">
        หน้า {page} / {totalPages} · ทั้งหมด {totalRows.toLocaleString("th-TH")} รายการ
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <a href={link(page - 1)} className={`${btn} border-border bg-white text-foreground hover:border-primary-400 dark:bg-surface`}>
            ← ก่อนหน้า
          </a>
        ) : null}
        {pages.map((n, i) =>
          n === "…" ? (
            <span key={`e${i}`} className="px-1 text-[11px] text-muted">…</span>
          ) : (
            <a
              key={n}
              href={link(n)}
              className={`${btn} ${n === page ? "border-primary-700 bg-primary-600 text-white" : "border-border bg-white text-foreground hover:border-primary-400 dark:bg-surface"}`}
            >
              {n}
            </a>
          ),
        )}
        {page < totalPages ? (
          <a href={link(page + 1)} className={`${btn} border-border bg-white text-foreground hover:border-primary-400 dark:bg-surface`}>
            ถัดไป →
          </a>
        ) : null}
      </div>
    </div>
  );
}

/** clamp เลขหน้าจาก URL (1-based · เพี้ยน = หน้า 1) */
export function parsePageNo(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}
