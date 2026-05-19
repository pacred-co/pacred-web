import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CONTACT } from "@/components/seo/site";

/**
 * PCS launchpad sales-rep card — a faithful port of the `box-sale-main`
 * block in legacy `member/menu.php` (D1 / ADR-0017,
 * `d1-fidelity-customer.md` §1.1 — closes gap-map row "Sales-rep card 🟠").
 *
 * Legacy layout: a clean white card, round admin photo (55px) on the LEFT,
 * text on the RIGHT — "ผู้ดูแล" label, "เซลล์ <nickname>", and a tappable
 * "Tel : <phone>" link. It sits directly under the wallet card.
 *
 * Data path mirrors the existing `<SalesRepCard>`: profiles.sales_admin_id
 * → the rep's profile + `admin_contact_extras`. Always renders something —
 * falls back to the Pacred care line — so the launchpad slot is never empty
 * (legacy always showed an "ผู้ดูแล" card).
 */
export async function PcsSalesRepCard({ profileId }: { profileId: string }) {
  const t = await getTranslations("pcsHome");
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("profiles")
    .select("sales_admin_id")
    .eq("id", profileId)
    .maybeSingle<{ sales_admin_id: string | null }>();

  let displayName = "";
  let phone: string | null = null;
  let avatarUrl: string | null = null;

  if (customer?.sales_admin_id) {
    // sales_admin_id may be a uuid or a member_code — try the matching column.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(customer.sales_admin_id);
    const cols = "id, first_name, last_name, phone, avatar_url";
    const repQuery = isUuid
      ? supabase.from("profiles").select(cols).eq("id", customer.sales_admin_id).maybeSingle()
      : supabase.from("profiles").select(cols).eq("member_code", customer.sales_admin_id).maybeSingle();
    const { data: rep } = (await repQuery) as {
      data: { id: string; first_name: string | null; last_name: string | null; phone: string | null; avatar_url: string | null } | null;
    };

    if (rep) {
      const { data: extras } = await supabase
        .from("admin_contact_extras")
        .select("display_name, direct_phone")
        .eq("profile_id", rep.id)
        .maybeSingle<{ display_name: string | null; direct_phone: string | null }>();

      displayName =
        extras?.display_name ??
        `${rep.first_name ?? ""} ${rep.last_name ?? ""}`.trim();
      phone = extras?.direct_phone ?? rep.phone ?? null;
      avatarUrl = rep.avatar_url;
    }
  }

  // Fallback to the Pacred care line so the card slot is never empty.
  const isFallback = !displayName;
  if (isFallback) {
    displayName = "ทีมงาน Pacred";
    phone = CONTACT.phoneCompany;
  }

  const telDisplay =
    isFallback ? CONTACT.phoneCompanyDisplay : phone ?? CONTACT.phoneCompanyDisplay;
  const telHref = (phone ?? CONTACT.phoneCompany).replace(/[^+0-9]/g, "");
  const initial = (displayName || "?").charAt(0).toUpperCase();

  return (
    <div className="px-4">
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-primary-500/40 bg-surface-alt">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={displayName} fill sizes="56px" className="object-cover" unoptimized />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xl font-bold text-primary-700">
              {initial}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">
            {t("supervisor")}
          </p>
          <p className="truncate text-sm font-bold text-foreground">
            {isFallback ? displayName : `${t("salesPrefix")} ${displayName}`}
          </p>
          <a
            href={`tel:${telHref}`}
            className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-primary-700 hover:underline"
          >
            <Phone className="h-3.5 w-3.5" />
            {t("tel")} : {telDisplay}
          </a>
        </div>
      </div>
    </div>
  );
}
