import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MenubarItem } from "@/components/admin/page-top-menubar";

/**
 * Live "งานค้าง" (actionable backlog) counts for the accounting top-menubar,
 * keyed by the EXACT menu-leaf href they belong to. The <PageTopMenubar>
 * bubbles a leaf's badge up to its collapsed top-item (รายรับ / การเงิน / …)
 * via subtreeBadge, so a heading shows the SUM of its queues without opening.
 *
 * Owner 2026-07-06: "ทุกหัวข้อมีตัวเลขบอกงานค้าง — เปิดมาแจงว่าอยู่ไหนบ้าง."
 *
 * §0f #2 — a badge number MUST be exact. We count ONLY queues whose backlog
 * is unambiguous + verifiable against the page's own live tb_* query. Queues
 * with a fuzzy definition (shop-disbursement eligibility, etc.) are left
 * BADGE-LESS on purpose — a wrong number erodes trust worse than no number.
 */
async function computeAccountingBadges(): Promise<Record<string, number>> {
  const admin = createAdminClient();
  const [billing, customs, ar] = await Promise.all([
    // ใบวางบิล · รอรับชำระ (unpaid, on-time + overdue) = tb_forwarder_invoice.status='issued'
    // (overdue is DATE-derived from the same 'issued' rows — so this single count
    //  = the full unpaid backlog the billing-run "รอรับชำระ" + "เกินเวลา" tabs split).
    admin.from("tb_forwarder_invoice").select("*", { count: "exact", head: true }).eq("status", "issued"),
    // ใบขนสินค้า · ค้างดำเนินการ = customs_declarations ที่ยังไม่ถึง accepted/released
    admin.from("customs_declarations").select("*", { count: "exact", head: true }).in("status", ["draft", "submitted"]),
    // ลูกหนี้ค้างชำระ (AR) = tb_forwarder.fstatus='5' (รอชำระเงิน · cash-in-the-door)
    admin.from("tb_forwarder").select("*", { count: "exact", head: true }).eq("fstatus", "5"),
  ]);

  const out: Record<string, number> = {};
  if (!billing.error && billing.count) out["/admin/billing-run"] = billing.count;
  if (!customs.error && customs.count) out["/admin/accounting/customs-declarations"] = customs.count;
  if (!ar.error && ar.count) out["/admin/accounting/ar-aging"] = ar.count;
  return out;
}

/** 60s-cached snapshot — cheap 3× COUNT queries shared across every accounting
 *  page render. `revalidateTag("accounting-badges")` to bust after a mutation. */
export const getAccountingBadges = unstable_cache(
  computeAccountingBadges,
  ["accounting-menubar-badges-v1"],
  { revalidate: 60, tags: ["accounting-badges"] },
);

/**
 * Clone a menubar tree, setting `badge` on every leaf whose EXACT href matches a
 * count key (query string included — so a parent leaf `/admin/billing-run` is
 * tagged but its `?tab=` children are NOT, avoiding subtreeBadge double-counting).
 * A leaf that appears under two headings (e.g. AR under การเงิน + การบัญชี) is
 * tagged in both — each heading legitimately reflects that backlog.
 */
export function applyMenubarBadges(
  items: MenubarItem[],
  badges: Record<string, number>,
): MenubarItem[] {
  return items.map((it) => {
    const badge = it.href && badges[it.href] ? badges[it.href] : undefined;
    return {
      ...it,
      ...(badge ? { badge } : {}),
      ...(it.children ? { children: applyMenubarBadges(it.children, badges) } : {}),
    };
  });
}
