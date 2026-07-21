"use client";

/**
 * ป้ายช่องทาง (แพลตฟอร์ม / distribution channel) พร้อมโลโก้แบรนด์ — owner 2026-07-21
 * "ตามภาพเลย" คือขอเห็นเป็นโลโก้จริง ไม่ใช่จุดสี.
 *
 * ไอคอนแบรนด์ reuse จาก `components/icons/social-icons.tsx` (มีอยู่แล้ว — ไม่สร้างซ้ำ).
 * ตัวที่ไม่ใช่โซเชียล (เว็บ/บล็อก/อีเมล/มาร์เก็ตเพลส/โฆษณา) ใช้ lucide.
 *
 * การจับคู่ยึด "ทั้ง id และชื่อ" แบบ normalize แล้ว — settings แก้ได้เอง ผู้ใช้อาจ
 * เพิ่มแพลตฟอร์มใหม่หรือเปลี่ยนชื่อ ถ้าจับแค่ id ที่ seed ไว้จะกลายเป็นจุดสีทันที.
 * จับไม่ได้ = fallback จุดสีเดิม (ไม่พัง ไม่ว่าง).
 */
import type { ReactNode } from "react";
import { Globe, Mail, MapPin, Megaphone, Rss, ShoppingBag } from "lucide-react";
import { FacebookIcon, GoogleIcon, InstagramIcon, LineIcon, TikTokIcon, YouTubeIcon } from "@/components/icons/social-icons";
import { usePlanner } from "@/lib/marketing-planner/store";
import { cx, MoreChips } from "./ui";

/** คีย์ที่ใช้จับคู่ไอคอน — ตัด prefix กลุ่ม + ตัดอักขระที่ไม่ใช่ a-z0-9 ออก
 *  ("LINE OA" → "lineoa" · "platform-facebook" → "facebook" · "Meta Ads" → "metaads"). */
function matchKey(s: string): string {
  return s.replace(/^(platform|channel)-/, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * เรียงจากเฉพาะเจาะจงไปกว้าง — "facebookads" ต้องเจอ facebook ไม่ใช่ ads เฉยๆ.
 *
 * เก็บเป็น `render(cls) => JSX` ไม่ใช่ตัว component — ถ้าคืน component แล้วเอาไป
 * เรนเดอร์เป็น `<Icon/>` ตัวแปร React จะมองว่าเป็น component ที่สร้างตอน render
 * (state รีทุกครั้ง · eslint react-hooks/static-components ฟ้อง).
 */
const ICONS: { test: (k: string) => boolean; render: (cls: string) => ReactNode }[] = [
  { test: (k) => k.includes("facebook") || k.includes("meta"), render: (c) => <FacebookIcon className={c} /> },
  { test: (k) => k.includes("instagram"), render: (c) => <InstagramIcon className={c} /> },
  { test: (k) => k.includes("tiktok"), render: (c) => <TikTokIcon className={c} /> },
  { test: (k) => k.includes("youtube"), render: (c) => <YouTubeIcon className={c} /> },
  { test: (k) => k.includes("line"), render: (c) => <LineIcon className={c} /> },
  { test: (k) => k.includes("google") || k.includes("gbp"), render: (c) => <GoogleIcon className={c} /> },
  { test: (k) => k.includes("shopee") || k.includes("lazada"), render: (c) => <ShoppingBag className={c} /> },
  { test: (k) => k.includes("email") || k.includes("mail"), render: (c) => <Mail className={c} /> },
  { test: (k) => k.includes("blog"), render: (c) => <Rss className={c} /> },
  { test: (k) => k.includes("website") || k.includes("web"), render: (c) => <Globe className={c} /> },
  { test: (k) => k.includes("map") || k.includes("local"), render: (c) => <MapPin className={c} /> },
  { test: (k) => k.includes("ads") || k.includes("ad"), render: (c) => <Megaphone className={c} /> },
];

/** ไอคอนของช่องทางนั้น — ไม่รู้จัก = null (ผู้เรียกวาดจุดสีแทน). */
function renderIcon(id: string, name: string, cls: string): ReactNode {
  for (const key of [matchKey(name), matchKey(id)]) {
    if (!key) continue;
    const hit = ICONS.find((e) => e.test(key));
    if (hit) return hit.render(cls);
  }
  return null;
}

/** ป้าย 1 ช่องทาง — โลโก้ + ชื่อ. `compact` = โลโก้อย่างเดียว (ใช้ตอนมีหลายช่องทางในแถวเดียว). */
export function PlatformBadge({ id, compact = false }: { id: string; compact?: boolean }) {
  const { byId } = usePlanner();
  const s = byId(id);
  const name = s?.name ?? id;
  const color = s?.color ?? "#94a3b8";

  if (compact) {
    return (
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundColor: `${color}1a`, color }}
        title={name}
        aria-label={name}
      >
        {renderIcon(id, name, "h-3.5 w-3.5") ?? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${color}14`, color }}
      title={name}
    >
      {renderIcon(id, name, "h-3.5 w-3.5 shrink-0") ?? <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
      <span className="truncate">{name}</span>
    </span>
  );
}

/** แถวป้ายช่องทาง — เกิน `max` ยุบเป็น "+N" ที่ชี้เมาส์แล้วกางตัวที่เหลือ
 *  (กันแถวตารางยืด แต่ยังเข้าถึงข้อมูลครบ · owner 2026-07-21). */
export function PlatformBadges({ ids, compact = false, max = 5, className }: { ids: string[]; compact?: boolean; max?: number; className?: string }) {
  if (ids.length === 0) return <span className="text-[11px] text-muted/50">—</span>;
  const shown = ids.slice(0, max);
  const rest = ids.slice(max);
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1", className)}>
      {shown.map((id) => <PlatformBadge key={id} id={id} compact={compact} />)}
      {rest.length > 0 && (
        <MoreChips label={`+${rest.length}`} title={`อีก ${rest.length} ช่องทาง — ชี้เพื่อดู`}>
          {rest.map((id) => <PlatformBadge key={id} id={id} />)}
        </MoreChips>
      )}
    </span>
  );
}
