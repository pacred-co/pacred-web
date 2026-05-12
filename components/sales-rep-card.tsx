import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

/**
 * Sales rep card — shows the customer's assigned sales rep with
 * name, phone (click-to-call), and avatar. Server component; reads
 * profiles.sales_admin_id → joined profile + admin_contact_extras.
 *
 * Renders nothing if customer has no rep assigned.
 */
export async function SalesRepCard({ profileId }: { profileId: string }) {
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("profiles")
    .select("sales_admin_id")
    .eq("id", profileId)
    .maybeSingle<{ sales_admin_id: string | null }>();

  if (!customer?.sales_admin_id) return null;

  // sales_admin_id is a profile_id (member_code-style or uuid).
  // Try uuid first, fallback to member_code lookup.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(customer.sales_admin_id);
  const lookup = isUuid
    ? supabase.from("profiles").select("id, first_name, last_name, phone, avatar_url, member_code").eq("id", customer.sales_admin_id).maybeSingle()
    : supabase.from("profiles").select("id, first_name, last_name, phone, avatar_url, member_code").eq("member_code", customer.sales_admin_id).maybeSingle();

  const { data: rep } = await lookup as { data: { id: string; first_name: string | null; last_name: string | null; phone: string | null; avatar_url: string | null; member_code: string | null } | null };
  if (!rep) return null;

  // Optional sidecar with display_name + direct_phone overrides
  const { data: extras } = await supabase
    .from("admin_contact_extras")
    .select("display_name, direct_phone, department")
    .eq("profile_id", rep.id)
    .maybeSingle<{ display_name: string | null; direct_phone: string | null; department: string | null }>();

  const displayName = extras?.display_name
    ?? `${rep.first_name ?? ""} ${rep.last_name ?? ""}`.trim()
    ?? "เซลล์ดูแล";
  const phone = extras?.direct_phone ?? rep.phone ?? null;
  const initial = (displayName || "?").charAt(0).toUpperCase();

  return (
    <div className="rounded-2xl border-2 border-primary-500/30 bg-gradient-to-br from-primary-50 to-primary-100/30 p-4 shadow-sm">
      <p className="text-[10px] uppercase tracking-widest text-primary-700 font-semibold">ผู้ดูแล</p>
      <div className="mt-2 flex items-center gap-3">
        <div className="relative h-14 w-14 rounded-full overflow-hidden border-2 border-white bg-surface-alt flex items-center justify-center shrink-0 shadow-md">
          {rep.avatar_url ? (
            <Image src={rep.avatar_url} alt={displayName} fill sizes="56px" className="object-cover" unoptimized />
          ) : (
            <span className="text-xl font-bold text-primary-700">{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground text-sm leading-tight">เซลล์ {displayName}</p>
          {extras?.department && (
            <p className="text-[10px] text-muted">{extras.department}</p>
          )}
          {phone && (
            <a
              href={`tel:${phone.replace(/[^+0-9]/g, "")}`}
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary-700 font-mono hover:underline"
            >
              📞 {phone}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
