"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  LayoutDashboard, Package, ShoppingCart, Coins, Wallet, Users,
  BadgePercent, Settings as SettingsIcon, Languages, Menu, X,
  BarChart3, BookOpen, Building2, ClipboardCheck, UserCog, Clock,
  MessageSquare, Activity, ArrowRightLeft, Receipt, Truck, Upload, BellRing,
} from "lucide-react";
import type { AdminRole } from "@/lib/auth/require-admin";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  roles?: AdminRole[];   // required role(s); empty = any admin
  group?: string;        // section heading
};

const items: NavItem[] = [
  // Overview
  { href: "/admin",                  label: "ภาพรวม",          icon: <LayoutDashboard className="w-5 h-5" />, group: "ภาพรวม" },
  { href: "/admin/reports",          label: "รายงานรายได้",     icon: <BarChart3 className="w-5 h-5" />,       group: "ภาพรวม" },
  { href: "/admin/reports/containers-hs", label: "รายงาน HS code",  icon: <BarChart3 className="w-5 h-5" />,  roles: ["ops","accounting"], group: "ภาพรวม" },
  { href: "/admin/accounting",       label: "บัญชี Cargo/Freight", icon: <Wallet className="w-5 h-5" />,    roles: ["accounting"], group: "ภาพรวม" },

  // Self-serve reports (V-B1) — staff sees the operational state without dev tickets
  { href: "/admin/reports/pending-payments",      label: "รอชำระเงิน",        icon: <Receipt className="w-5 h-5" />,    roles: ["ops","accounting"], group: "รีพอร์ตเฉพาะกิจ" },
  { href: "/admin/reports/credit-pending",        label: "เครดิตค้างนำเข้า",  icon: <Receipt className="w-5 h-5" />,    roles: ["ops","accounting"], group: "รีพอร์ตเฉพาะกิจ" },
  { href: "/admin/reports/containers-awaiting-th",label: "ตู้รอเข้าไทย",       icon: <Package className="w-5 h-5" />,    roles: ["ops","warehouse","accounting"], group: "รีพอร์ตเฉพาะกิจ" },
  { href: "/admin/reports/debtors",               label: "ลูกค้าติดหนี้",      icon: <Wallet className="w-5 h-5" />,     roles: ["accounting"], group: "รีพอร์ตเฉพาะกิจ" },
  { href: "/admin/reports/refunds",               label: "คืนเงิน",            icon: <ArrowRightLeft className="w-5 h-5" />, roles: ["accounting"], group: "รีพอร์ตเฉพาะกิจ" },
  { href: "/admin/reports/monthly-orders",        label: "ออเดอร์รายเดือน",   icon: <BarChart3 className="w-5 h-5" />,  roles: ["ops","accounting"], group: "รีพอร์ตเฉพาะกิจ" },

  // V-G6 analytical reports
  { href: "/admin/reports/forwarder-volume",      label: "ปริมาณฝากนำเข้า (V-G6)", icon: <BarChart3 className="w-5 h-5" />, roles: ["ops","accounting"], group: "รีพอร์ตวิเคราะห์" },
  { href: "/admin/reports/sales-by-rep",          label: "ยอด/Sales rep (V-G6)",   icon: <BarChart3 className="w-5 h-5" />, roles: ["ops","accounting","sales_admin"], group: "รีพอร์ตวิเคราะห์" },
  { href: "/admin/reports/hs-code-revenue",       label: "HS-code revenue (V-G6)", icon: <BarChart3 className="w-5 h-5" />, roles: ["ops","accounting"], group: "รีพอร์ตวิเคราะห์" },
  { href: "/admin/reports/user-sales-history",    label: "ประวัติยอด/ลูกค้า (V-G6)", icon: <BarChart3 className="w-5 h-5" />, roles: ["ops","accounting","sales_admin"], group: "รีพอร์ตวิเคราะห์" },

  // Freight stack (V-E6+)
  { href: "/admin/freight/quotes",       label: "ใบเสนอราคา (V-E6)",     icon: <Receipt className="w-5 h-5" />,        roles: ["super","ops","sales_admin","accounting"], group: "Freight" },
  { href: "/admin/freight/shipments",    label: "งาน + invoice (V-E1)",  icon: <Package className="w-5 h-5" />,        roles: ["super","ops","sales_admin","accounting"], group: "Freight" },
  { href: "/admin/freight/declarations", label: "ใบขนสินค้า (V-E11)",    icon: <ClipboardCheck className="w-5 h-5" />, roles: ["super","accounting"],                     group: "Freight" },

  // V-G3 — admin broadcasts (super + sales_admin)
  { href: "/admin/broadcasts",        label: "Broadcasts (V-G3)",   icon: <BellRing className="w-5 h-5" />, roles: ["super","sales_admin"], group: "การสื่อสาร" },

  // Operations
  { href: "/admin/forwarders",       label: "ฝากนำเข้า",       icon: <Package className="w-5 h-5" />,         roles: ["ops"], group: "ปฏิบัติการ" },
  { href: "/admin/service-orders",   label: "ฝากสั่ง",          icon: <ShoppingCart className="w-5 h-5" />,    roles: ["ops"], group: "ปฏิบัติการ" },
  { href: "/admin/yuan-payments",    label: "ฝากโอนหยวน",      icon: <Languages className="w-5 h-5" />,       roles: ["accounting"], group: "ปฏิบัติการ" },
  { href: "/admin/warehouse/containers", label: "ตู้คอนเทนเนอร์ (Spine)", icon: <Package className="w-5 h-5" />, roles: ["ops","warehouse","super"], group: "ปฏิบัติการ" },
  { href: "/admin/warehouse/bulletin",   label: "บุลเลตินตู้รายวัน",      icon: <ClipboardCheck className="w-5 h-5" />, roles: ["ops","warehouse","super"], group: "ปฏิบัติการ" },
  { href: "/admin/containers",       label: "รายการตู้ (legacy)", icon: <Package className="w-5 h-5" />,         roles: ["ops"], group: "ปฏิบัติการ" },
  { href: "/admin/barcode",          label: "บาร์โค้ด",         icon: <ShoppingCart className="w-5 h-5" />,    roles: ["ops"], group: "ปฏิบัติการ" },
  { href: "/admin/drivers",          label: "คนขับส่งของ",       icon: <Truck className="w-5 h-5" />,           roles: ["ops"], group: "ปฏิบัติการ" },
  { href: "/admin/driver-runs",      label: "งานของฉัน (driver)", icon: <Truck className="w-5 h-5" />,          roles: ["driver","super","ops"], group: "ปฏิบัติการ" },
  { href: "/admin/carriers",         label: "ขนส่ง (SPX/J&T/...)", icon: <Truck className="w-5 h-5" />,         roles: ["super","ops"], group: "ปฏิบัติการ" },

  // Finance
  { href: "/admin/wallet",           label: "กระเป๋าเงิน",     icon: <Wallet className="w-5 h-5" />,          roles: ["accounting"], group: "การเงิน" },
  { href: "/admin/accounting/reconcile", label: "เช็คความตรง (Reconcile)", icon: <Activity className="w-5 h-5" />, roles: ["accounting","super"], group: "การเงิน" },
  { href: "/admin/tax-invoices",     label: "ใบกำกับภาษี",     icon: <Receipt className="w-5 h-5" />,         roles: ["accounting"], group: "การเงิน" },
  { href: "/admin/sales-payouts",    label: "เบิกค่าคอม",      icon: <BadgePercent className="w-5 h-5" />,    roles: ["accounting","sales_admin"], group: "การเงิน" },
  { href: "/admin/forwarder-sales",  label: "ค่าคอม Forwarder", icon: <Receipt className="w-5 h-5" />,         roles: ["accounting","sales_admin"], group: "การเงิน" },
  { href: "/admin/commissions",      label: "ค่าคอม + Payouts (V-E8)", icon: <BadgePercent className="w-5 h-5" />, roles: ["super","accounting"], group: "การเงิน" },
  { href: "/admin/accounting/periods", label: "ปิดงวด (V-E9)",       icon: <ClipboardCheck className="w-5 h-5" />, roles: ["super","accounting","ops"], group: "การเงิน" },

  // Customer & sales
  { href: "/admin/customers",                 label: "ลูกค้า",            icon: <Users className="w-5 h-5" />,           group: "ลูกค้า · ขาย" },
  { href: "/admin/customers/pending",         label: "รอ Approve",        icon: <Clock className="w-5 h-5" />,           group: "ลูกค้า · ขาย" },
  { href: "/admin/customers/recently-active", label: "Active ล่าสุด",      icon: <Activity className="w-5 h-5" />,        roles: ["sales_admin","accounting"], group: "ลูกค้า · ขาย" },
  { href: "/admin/customers/transfer-rep",    label: "โอนทีมขาย (กลุ่ม)",   icon: <ArrowRightLeft className="w-5 h-5" />,  roles: ["sales_admin"], group: "ลูกค้า · ขาย" },
  { href: "/admin/juristic-check",            label: "เช็คนิติบุคคล",       icon: <ClipboardCheck className="w-5 h-5" />,  roles: ["ops","accounting"], group: "ลูกค้า · ขาย" },
  { href: "/admin/contact-messages",          label: "ข้อความติดต่อ",       icon: <MessageSquare className="w-5 h-5" />,   roles: ["ops"], group: "ลูกค้า · ขาย" },
  { href: "/admin/team-leaders",              label: "ทีมขาย",            icon: <Coins className="w-5 h-5" />,           roles: ["sales_admin"], group: "ลูกค้า · ขาย" },

  // Org & HR
  { href: "/admin/hr",               label: "ทีมงาน (HR)",      icon: <Building2 className="w-5 h-5" />,       roles: ["super"], group: "องค์กร" },
  { href: "/admin/learning",         label: "ศูนย์เรียนรู้",    icon: <BookOpen className="w-5 h-5" />,        group: "องค์กร" },

  // System
  { href: "/admin/csv-imports",      label: "นำเข้า CSV",     icon: <Upload className="w-5 h-5" />,          roles: ["ops","super"], group: "ระบบ" },
  { href: "/admin/rates",            label: "ดูอัตราปัจจุบัน",   icon: <BarChart3 className="w-5 h-5" />,       group: "ระบบ" },
  { href: "/admin/rates/general",    label: "แก้เรท general (LP-1)", icon: <BarChart3 className="w-5 h-5" />,   roles: ["super","accounting"], group: "ระบบ" },
  { href: "/admin/rates/vip",        label: "แก้เรท VIP (LP-1)",     icon: <BarChart3 className="w-5 h-5" />,   roles: ["super","accounting"], group: "ระบบ" },
  { href: "/admin/rates/custom-user",label: "แก้เรท Custom-user (LP-1)", icon: <BarChart3 className="w-5 h-5" />, roles: ["super","accounting"], group: "ระบบ" },
  { href: "/admin/rates/custom-hs",  label: "แก้เรท Custom-HS (LP-1)",   icon: <BarChart3 className="w-5 h-5" />, roles: ["super","accounting"], group: "ระบบ" },
  { href: "/admin/admins",           label: "จัดการ admin",   icon: <UserCog className="w-5 h-5" />,         roles: ["super"], group: "ระบบ" },
  { href: "/admin/audit",            label: "Audit log",      icon: <ClipboardCheck className="w-5 h-5" />,  roles: ["super"], group: "ระบบ" },
  { href: "/admin/settings",         label: "ตั้งค่าระบบ",     icon: <SettingsIcon className="w-5 h-5" />,    roles: ["super"], group: "ระบบ" },
  { href: "/admin/settings/contacts",label: "ข้อมูลติดต่อ (V-G5)", icon: <SettingsIcon className="w-5 h-5" />, roles: ["super","accounting","sales_admin"], group: "ระบบ" },
  { href: "/admin/settings/tos-versions", label: "TOS versions (V-G4)", icon: <SettingsIcon className="w-5 h-5" />, roles: ["super"], group: "ระบบ" },
];

export function AdminSidebar({ roles }: { roles: AdminRole[] }) {
  const pathname = usePathname();
  const [openMobile, setOpenMobile] = useState(false);

  const visibleItems = items.filter(
    (it) => !it.roles || roles.includes("super") || it.roles.some((r) => roles.includes(r)),
  );

  // Group items by their `group` heading while preserving order
  const grouped: { group: string; items: NavItem[] }[] = [];
  for (const it of visibleItems) {
    const key = it.group ?? "อื่นๆ";
    const last = grouped[grouped.length - 1];
    if (last && last.group === key) last.items.push(it);
    else grouped.push({ group: key, items: [it] });
  }

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin" || pathname?.endsWith("/admin");
    return pathname?.includes(href);
  }

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpenMobile((v) => !v)}
        className="lg:hidden fixed top-3 left-3 z-[60] inline-flex items-center justify-center w-10 h-10 rounded-lg bg-primary-600 text-white shadow-lg hover:bg-primary-700 transition-colors"
        aria-label="Menu"
      >
        {openMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/*
        Light-theme sidebar (white default, dark variant per next-themes toggle).
        Per ภูม + เดฟ confirm 2026-05-16 evening — admin redesign B/W theme support.
      */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col transition-transform lg:translate-x-0
          bg-white dark:bg-surface
          text-foreground
          border-r border-border
          shadow-sm
          ${openMobile ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand header — primary-600 accent stripe + role chip */}
        <div className="px-5 py-5 border-b border-border bg-gradient-to-b from-primary-50/40 to-transparent dark:from-primary-950/30">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-black tracking-tight text-primary-700 dark:text-primary-400">PACRED</h2>
            <span className="text-[10px] uppercase tracking-widest text-muted">Admin</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {roles.map((r) => (
              <span
                key={r}
                className="rounded-full border border-primary-200 bg-primary-50 dark:bg-primary-950/40 dark:border-primary-900 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:text-primary-300"
              >
                {r}
              </span>
            ))}
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {grouped.map((sec) => (
            <div key={sec.group} className="space-y-0.5">
              <p className="px-3 pt-1 pb-1.5 text-[10px] uppercase tracking-widest text-muted font-semibold">
                {sec.group}
              </p>
              {sec.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpenMobile(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? "bg-primary-600 text-white font-semibold shadow-sm"
                        : "text-foreground/75 hover:bg-surface-alt hover:text-foreground dark:hover:bg-white/5"
                    }`}
                  >
                    <span className={active ? "text-white" : "text-muted"}>{it.icon}</span>
                    <span>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-border space-y-1 bg-surface-alt/40 dark:bg-white/5">
          <Link
            href="/dashboard"
            onClick={() => setOpenMobile(false)}
            className="block rounded-lg px-3 py-2 text-xs text-muted hover:bg-surface-alt hover:text-foreground dark:hover:bg-white/10 transition-colors"
          >
            ← กลับฝั่งลูกค้า
          </Link>
        </div>
      </aside>

      {/* Mobile overlay */}
      {openMobile && (
        <div
          onClick={() => setOpenMobile(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
        />
      )}
    </>
  );
}
