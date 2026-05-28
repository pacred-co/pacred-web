/**
 * Shared disbursement top-menubar config.
 *
 * Wave 23 P1 #13 (2026-05-27 ค่ำ): extracted so the 5 Pacred-style
 * disbursement pages (sales-payouts · commissions · shop-payouts ·
 * driver-runs · forwarder-sales) share the same horizontal chrome —
 * matching the /admin/customers + /admin/reports adoption of
 * <PageTopMenubar>. Each page mounts this with its own activeHref.
 *
 * Per the admin-tech-debt-master-2026-05-27.md row 13 audit — these 5
 * pages were rolling their own <h1> header strip + creating visual
 * drift across the disbursement flow. Adopting the shared menubar
 * keeps navigation consistent + lets staff jump between the related
 * disbursement queues without going back to the sidebar.
 *
 * Labels are adapted from each page's existing <h1> wording so staff
 * recognise the destination immediately.
 */

import type { MenubarItem } from "@/components/admin/page-top-menubar";

export const DISBURSEMENT_MENUBAR: MenubarItem[] = [
  { label: "เบิกค่าคอม (Sales Payouts)", href: "/admin/sales-payouts" },
  { label: "ค่าคอม + Payouts",           href: "/admin/commissions" },
  { label: "เบิกกระเป๋าร้าน",            href: "/admin/shop-payouts" },
  { label: "งานคนขับ",                   href: "/admin/driver-runs" },
  { label: "ค่าคอมฝากนำเข้า",           href: "/admin/forwarder-sales" },
];
