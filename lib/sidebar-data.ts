import { createClient } from "@/lib/supabase/server";
import type { SidebarBadges, SalesRepInfo } from "@/components/sections/protected-sidebar";

/** Fetch sidebar pending-count badges + assigned sales rep info in parallel.
 *  Failures degrade silently to zero/null so the sidebar always renders. */
export async function getSidebarData(profileId: string): Promise<{
  badges: SidebarBadges;
  salesRep: SalesRepInfo;
}> {
  const supabase = await createClient();

  const [
    orderPending,
    importPending,
    paymentPending,
    notifTotal,
    notifRead,
    profile,
  ] = await Promise.all([
    supabase.from("service_orders")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .in("status", ["pending", "awaiting_payment"]),

    supabase.from("forwarders")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .eq("status", "pending_payment"),

    supabase.from("yuan_payments")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId)
      .in("status", ["pending", "processing"]),

    supabase.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profileId),

    supabase.from("notification_reads")
      .select("notification_id", { count: "exact", head: true })
      .eq("profile_id", profileId),

    supabase.from("profiles")
      .select("sales_admin_id")
      .eq("id", profileId)
      .maybeSingle<{ sales_admin_id: string | null }>(),
  ]);

  const unread = Math.max(0, (notifTotal.count ?? 0) - (notifRead.count ?? 0));

  let salesRep: SalesRepInfo = null;
  const repId = profile.data?.sales_admin_id;
  if (repId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(repId);
    const lookup = isUuid
      ? supabase.from("profiles").select("id, first_name, last_name, phone").eq("id", repId).maybeSingle()
      : supabase.from("profiles").select("id, first_name, last_name, phone").eq("member_code", repId).maybeSingle();
    const { data: rep } = await lookup as { data: { id: string; first_name: string | null; last_name: string | null; phone: string | null } | null };
    if (rep) {
      const { data: extras, error: extrasErr } = await supabase
        .from("admin_contact_extras")
        .select("display_name, direct_phone")
        .eq("profile_id", rep.id)
        .maybeSingle<{ display_name: string | null; direct_phone: string | null }>();
      if (extrasErr) {
        console.error(`[admin_contact_extras list] failed`, { code: extrasErr.code, message: extrasErr.message });
      }
      const fullName = `${rep.first_name ?? ""} ${rep.last_name ?? ""}`.trim();
      salesRep = {
        display_name: extras?.display_name ?? (fullName || null),
        phone: extras?.direct_phone ?? rep.phone ?? null,
      };
    }
  }

  return {
    badges: {
      serviceOrderPending: orderPending.count ?? 0,
      serviceImportPending: importPending.count ?? 0,
      servicePaymentPending: paymentPending.count ?? 0,
      notifications: unread,
    },
    salesRep,
  };
}
