/**
 * แถบนำทางร่วมของงาน "ฝากนำเข้า" — แท็บโกดัง + เครื่องมือของโกดังนั้น + ทางกลับ.
 *
 * owner 2026-07-26: *"ทำ tab หัวข้อใหญ่ ว่า โกดังกวางโจว(MOMO) / โกดังอี้อู (TTW) แล้วก็แยก
 * หมวดหมู่เอาเมนูแต่ละอันเข้าไปอยู่ในที่ของมัน มีปุ่มกดย้อนกลับถอยออกมาเพื่อดูงานส่วนอื่นที่
 * เกี่ยวข้องต่อด้วย ไม่ว่าจะไปไหน · ทางเข้าลิงก์มันแปลกๆ ที่มามันงงหาไม่เจอว่าไปลิงก์กะตรงไหนมา
 * · ทำมาแต่ละหน้าเหมือนเข้าไปคนละเว็บไซต์คนละบริษัทเลย"*
 *
 * ── ปัญหาเดิม ────────────────────────────────────────────────────────────
 * แต่ละหน้ามีแถบนำทางของตัวเอง คนละชุด คนละหน้าตา: hub MOMO = ปุ่มกลม · หน้าอี้อู =
 * `PageTopMenubar` (MOMO / อี้อู / **CargoCenter**) · หน้า TTW = อีกแบบ → เปิดหน้าไหนก็ไม่รู้ว่า
 * ตัวเองอยู่ตรงไหนของงาน และกลับไปงานที่เกี่ยวข้องยังไง.
 * ยิ่งกว่านั้น **CargoCenter = โกดังที่เลิกใช้แล้ว** (prod: 0 งาน · owner สั่งเอาออกตั้งแต่
 * 2026-07-18 "พาร์ทเนอร์ใช้แค่ MOMO กับ TTW") แต่แถบ tab ยังลิงก์ไปหาอยู่ = ทางเข้าหลอก.
 *
 * ── โครงใหม่ (ที่เดียว ใช้ทุกหน้า) ────────────────────────────────────────
 *   บรรทัด 1  breadcrumb  Admin › ฝากนำเข้า › <โกดัง> › <หน้านี้>
 *   บรรทัด 2  แท็บโกดัง    [ 🚢 โกดังกวางโจว (MOMO) ] [ 🧾 โกดังอี้อู (TTW) ]
 *   บรรทัด 3  เครื่องมือ   ปุ่มกลมของโกดังที่เลือก (หน้าปัจจุบันไฮไลต์) + ปุ่มร่วม + ↩ ทางกลับ
 *
 * โกดังคือ "หัวข้อใหญ่" — เครื่องมือทุกตัวอยู่ใต้โกดังของมัน ไม่ปนกัน. กดแท็บอีกโกดัง =
 * ไปหน้าแรกของโกดังนั้น. ปุ่ม ↩ = ถอยไปงานที่เกี่ยวข้อง (รายการฝากนำเข้า / รายงานตู้).
 */

import { Link } from "@/i18n/navigation";

/** โกดังต้นทางที่ยังใช้จริง (prod 2026-07-26: กวางโจว 961 งาน · อี้อู 32 งาน · ที่เหลือ 0). */
export type WarehouseKey = "guangzhou" | "yiwu";

type Tool = {
  href: string;
  label: string;
  /** ลิงก์ออกนอกระบบ (เว็บ MOMO) — เปิดแท็บใหม่ */
  external?: boolean;
  /** เห็นเฉพาะสิทธิ์ดูต้นทุน (ultra/accounting/pricing) — กันคลิกตาย §0d */
  cost?: boolean;
};

const WAREHOUSES: Record<WarehouseKey, { label: string; icon: string; home: string; tools: Tool[] }> = {
  guangzhou: {
    label: "โกดังกวางโจว (MOMO)",
    icon: "🚢",
    home: "/admin/momo-containers",
    tools: [
      { href: "/admin/momo-containers", label: "ตรวจข้อมูล + นำเข้าระบบ" },
      { href: "/admin/api-forwarder-momo/sync", label: "Sync จาก MOMO API" },
      { href: "/admin/api-forwarder-momo/packing-upload", label: "อัพ packing list" },
      { href: "/admin/api-forwarder-momo/manual", label: "เพิ่มงานเอง (manual)" },
      { href: "/admin/api-forwarder-momo/invoice-cost", label: "บิลต้นทุน MOMO", cost: true },
      { href: "https://www.momocargo.com/", label: "เปิดเว็บ MOMO Live", external: true },
    ],
  },
  yiwu: {
    label: "โกดังอี้อู (TTW)",
    icon: "🧾",
    home: "/admin/api-forwarder-yiwu",
    tools: [
      { href: "/admin/api-forwarder-yiwu", label: "คีย์ใบส่งของ (CS)" },
      { href: "/admin/api-forwarder-ttw", label: "แพคกิ้ง · ใส่ PR · เอาเข้าระบบ (DOC)" },
    ],
  },
};

/** เครื่องมือที่ใช้ร่วมทั้ง 2 โกดัง — โชว์ต่อท้ายเสมอ (ไม่ผูกโกดังไหน).
 *  owner 2026-07-26: *"คลัง wechat จีนทั้งระบบด้วยครับ เอาออกไปเลยครับ หนักรกเกะกะ"*
 *  → คลังแชทถูกถอดออกทั้งระบบ (หน้า + panel บนงาน/ตู้ + ลิงก์) · ตอนนี้ยังไม่มีของใช้ร่วม. */
const SHARED_TOOLS: Tool[] = [];

/** ทางกลับ — งานที่ "ต่อจาก" การนำเข้า (owner: ไม่ว่าจะไปไหนต้องถอยออกมาดูงานที่เกี่ยวข้องได้). */
const BACK_LINKS: Tool[] = [
  { href: "/admin/forwarders", label: "รายการฝากนำเข้าทั้งหมด" },
  { href: "/admin/report-cnt", label: "รายงานตู้" },
];

export function WarehouseWorkspaceNav({
  warehouse,
  current,
  pageLabel,
  showCostTools = false,
}: {
  warehouse: WarehouseKey;
  /** href ของหน้าปัจจุบัน — ใช้ไฮไลต์ปุ่มเครื่องมือ */
  current: string;
  /** ชื่อหน้าใน breadcrumb */
  pageLabel: string;
  /** ผู้ใช้เห็นต้นทุนไหม (canViewCostProfit) — false = ซ่อนปุ่มบิลต้นทุน */
  showCostTools?: boolean;
}) {
  const wh = WAREHOUSES[warehouse];
  const tools = [...wh.tools.filter((t) => !t.cost || showCostTools), ...SHARED_TOOLS];

  const chip = (t: Tool, active: boolean) => {
    const cls = active
      ? "rounded-full border border-primary-600 bg-primary-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm"
      : "rounded-full border border-border bg-white dark:bg-surface px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-surface-alt";
    return t.external ? (
      <a key={t.href} href={t.href} target="_blank" rel="noopener noreferrer"
        className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 shadow-sm hover:bg-sky-100">
        {t.label} ↗
      </a>
    ) : (
      <Link key={t.href} href={t.href} className={cls} aria-current={active ? "page" : undefined}>
        {t.label}
      </Link>
    );
  };

  return (
    <div className="space-y-2.5">
      {/* breadcrumb — บอกเสมอว่า "มาจากไหน · อยู่ตรงไหน" */}
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <Link href={wh.home} className="hover:text-primary-600">{wh.label}</Link>
        <span>›</span>
        <span className="font-medium text-foreground">{pageLabel}</span>
      </nav>

      {/* แท็บโกดัง = หัวข้อใหญ่ (owner 2026-07-26) */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-0">
        {(Object.keys(WAREHOUSES) as WarehouseKey[]).map((k) => {
          const w = WAREHOUSES[k];
          const active = k === warehouse;
          return (
            <Link key={k} href={w.home}
              className={
                active
                  ? "-mb-px rounded-t-lg border border-b-transparent border-border bg-surface px-4 py-2 text-sm font-bold text-foreground"
                  : "-mb-px rounded-t-lg border border-transparent px-4 py-2 text-sm font-medium text-muted hover:bg-surface-alt hover:text-foreground"
              }
              title={active ? "โกดังที่กำลังดูอยู่" : `สลับไปดูงาน ${w.label}`}>
              {w.icon} {w.label}
            </Link>
          );
        })}
      </div>

      {/* เครื่องมือของโกดังนี้ + ของใช้ร่วม + ทางกลับ */}
      <div className="flex flex-wrap items-center gap-2">
        {tools.map((t) => chip(t, t.href === current))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />
        {BACK_LINKS.map((b) => (
          <Link key={b.href} href={b.href}
            className="rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-alt hover:text-foreground"
            title="ถอยออกไปดูงานส่วนที่เกี่ยวข้อง">
            ↩ {b.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
