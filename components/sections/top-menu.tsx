"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { ChevronDown } from "lucide-react";

type SubItem = { label: string; href: string; hot?: boolean };
type Group = { title?: string; items: SubItem[] };
type Item = { label: string; href?: string; groups?: Group[] };

const MAIN_MENU: Item[] = [
  {
    label: "บริการด่วน",
    groups: [
      {
        items: [
          { label: "ชิปปิ้งเคลียร์สินค้าติดด่าน", href: "/services/customs-clearance" },
        ],
      },
    ],
  },
  {
    label: "นำเข้า",
    groups: [
      {
        title: "LCL (แชร์ตู้ / รวมตู้)",
        items: [
          { label: "นำเข้าสินค้าจากจีน", href: "/services/import-china", hot: true },
        ],
      },
      {
        title: "FCL (เหมาตู้ / ปิดตู้)",
        items: [
          { label: "นำเข้าสินค้าจากจีน", href: "/services/import-china" },
        ],
      },
    ],
  },
  {
    label: "ส่งออก",
    href: "/services/export-worldwide",
  },
  {
    label: "สั่งซื้อสินค้า",
    groups: [
      {
        title: "ประเทศจีน",
        items: [
          { label: "1688",    href: "https://www.1688.com" },
          { label: "Taobao",  href: "https://world.taobao.com" },
          { label: "Alibaba", href: "https://www.alibaba.com" },
          { label: "Tmall",   href: "https://www.tmall.com" },
        ],
      },
    ],
  },
  {
    label: "วิธีการใช้บริการ",
    href: "/how-to-use",
  },
  {
    label: "เรทราคาบริการ",
    href: "/#pricing",
  },
  {
    label: "ฝากโอนชำระ",
    groups: [
      {
        title: "ประเทศจีน",
        items: [
          { label: "1688",    href: "/payment/1688" },
          { label: "Taobao",  href: "/payment/taobao" },
          { label: "Alipay",  href: "/payment/alipay" },
        ],
      },
    ],
  },
  {
    label: "ที่อยู่โกดังเรา",
    groups: [
      {
        title: "โกดังไทย",
        items: [
          { label: "โกดังเพชรเกษม 118", href: "/warehouses/thailand" },
        ],
      },
      {
        title: "โกดังจีน",
        items: [
          { label: "โกดังกวางโจว", href: "/warehouses/guangzhou" },
          { label: "โกดังอี้อู",    href: "/warehouses/yiwu" },
        ],
      },
    ],
  },
  {
    label: "เกี่ยวกับเรา",
    groups: [
      {
        items: [
          { label: "เกี่ยวกับ Pacred",          href: "/about" },
          { label: "สาระน่ารู้",                 href: "/knowledge" },
          { label: "คำถามที่พบบ่อย",             href: "/faq" },
          { label: "ร่วมใช้งาน กับ Pacred",     href: "/register" },
          { label: "ข้อกำหนดและเงื่อนไข",        href: "/terms" },
          { label: "นโยบายความเป็นส่วนตัว",      href: "/privacy" },
          { label: "พื้นที่จัดส่ง Pacred เหมาๆ", href: "/delivery-areas" },
          { label: "วันหยุดประจำปี Pacred",      href: "/holidays" },
        ],
      },
    ],
  },
];

function isExternal(href: string) {
  return href.startsWith("http") || href.startsWith("//");
}

function HotBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 text-[9.5px] font-black tracking-wider leading-none">
      <span aria-hidden>🔥</span>HOT
    </span>
  );
}

function MenuLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  if (isExternal(href) || href.startsWith("/#")) {
    return (
      <a
        href={href}
        target={isExternal(href) ? "_blank" : undefined}
        rel={isExternal(href) ? "noopener noreferrer" : undefined}
        onClick={onClick}
        className="block px-4 py-2 text-[13px] font-bold text-[#111827] hover:bg-primary-50 hover:text-primary-600 dark:text-white dark:hover:bg-primary-900/20 transition-colors"
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-4 py-2 text-[13px] font-bold text-[#111827] hover:bg-primary-50 hover:text-primary-600 dark:text-white dark:hover:bg-primary-900/20 transition-colors"
    >
      {children}
    </Link>
  );
}

function MenuItem({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const hasDropdown = !!item.groups;

  // Simple link (no dropdown)
  if (!hasDropdown && item.href) {
    if (isExternal(item.href) || item.href.startsWith("/#")) {
      return (
        <a
          href={item.href}
          className="whitespace-nowrap px-3 py-2 text-[13px] font-bold text-white/95 hover:text-white hover:bg-white/15 rounded-md transition-colors"
        >
          {item.label}
        </a>
      );
    }
    return (
      <Link
        href={item.href}
        className="whitespace-nowrap px-3 py-2 text-[13px] font-bold text-white/95 hover:text-white hover:bg-white/15 rounded-md transition-colors"
      >
        {item.label}
      </Link>
    );
  }

  // Dropdown
  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        suppressHydrationWarning
        className="whitespace-nowrap inline-flex items-center gap-1 px-3 py-2 text-[13px] font-bold text-white/95 hover:text-white hover:bg-white/15 rounded-md transition-colors cursor-pointer"
      >
        {item.label}
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 pt-2 z-50">
          <div className="min-w-[240px] bg-white dark:bg-surface rounded-xl border border-border shadow-[0_14px_36px_-10px_rgba(15,23,42,0.18)] py-2 overflow-hidden">
            {item.groups!.map((g, gi) => (
              <div key={gi}>
                {g.title && (
                  <div className="px-4 pt-2 pb-1 text-[10px] font-black text-primary-600 dark:text-primary-300 tracking-[0.12em] uppercase border-b border-border/50 mb-1">
                    {g.title}
                  </div>
                )}
                {g.items.map((it) => (
                  <MenuLink key={it.href + it.label} href={it.href}>
                    <span className="inline-flex items-center gap-2">
                      {it.label}
                      {it.hot && <HotBadge />}
                    </span>
                  </MenuLink>
                ))}
                {gi < item.groups!.length - 1 && <div className="my-1.5 border-t border-border" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopMenu() {
  return (
    <nav className="flex items-center justify-center gap-0.5">
      {MAIN_MENU.map((item) => (
        <MenuItem key={item.label} item={item} />
      ))}
    </nav>
  );
}

/* ─────────── Mobile menu (flat list) ─────────── */
export function TopMenuMobile({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col">
      {MAIN_MENU.map((item) => (
        <MobileMenuItem key={item.label} item={item} onClose={onClose} />
      ))}
    </div>
  );
}

function MobileMenuItem({ item, onClose }: { item: Item; onClose: () => void }) {
  const [open, setOpen] = useState(false);

  if (!item.groups && item.href) {
    if (isExternal(item.href) || item.href.startsWith("/#")) {
      return (
        <a
          href={item.href}
          onClick={onClose}
          target={isExternal(item.href) ? "_blank" : undefined}
          rel={isExternal(item.href) ? "noopener noreferrer" : undefined}
          className="rounded-lg px-3 py-2.5 text-sm font-bold text-white/90 hover:bg-white/10 hover:text-white transition-colors"
        >
          {item.label}
        </a>
      );
    }
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className="rounded-lg px-3 py-2.5 text-sm font-bold text-white/90 hover:bg-white/10 hover:text-white transition-colors"
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        suppressHydrationWarning
        className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-bold text-white/90 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
      >
        <span>{item.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.5} />
      </button>
      {open && (
        <div className="pl-3 border-l-2 border-white/20 ml-3 mb-1">
          {item.groups!.map((g, gi) => (
            <div key={gi}>
              {g.title && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-black text-white/60 tracking-[0.12em] uppercase">
                  {g.title}
                </div>
              )}
              {g.items.map((it) => {
                const external = isExternal(it.href) || it.href.startsWith("/#");
                const inner = (
                  <span className="inline-flex items-center gap-2">
                    {it.label}
                    {it.hot && <HotBadge />}
                  </span>
                );
                if (external) {
                  return (
                    <a
                      key={it.href + it.label}
                      href={it.href}
                      onClick={onClose}
                      target={isExternal(it.href) ? "_blank" : undefined}
                      rel={isExternal(it.href) ? "noopener noreferrer" : undefined}
                      className="block rounded-lg px-3 py-2 text-[13px] font-bold text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      {inner}
                    </a>
                  );
                }
                return (
                  <Link
                    key={it.href + it.label}
                    href={it.href}
                    onClick={onClose}
                    className="block rounded-lg px-3 py-2 text-[13px] font-bold text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
