import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Phone } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * D1 Phase-B Wave 2 (B-0): the rep is looked up against the ported legacy
 * schema — `tb_users.adminidsale` → `tb_admin.adminid`. Both tables are
 * RLS-locked to service_role, so the read goes through the admin client;
 * the join key is `tb_users.userid === profile.member_code`. Always renders
 * something — falls back to the Pacred care line — so the launchpad slot is
 * never empty (legacy always showed an "ผู้ดูแล" card).
 */
export async function PcsSalesRepCard({ memberCode }: { memberCode: string | null }) {
  const t = await getTranslations("pcsHome");
  const admin = createAdminClient();

  let displayName = "";
  let phone: string | null = null;
  let avatarFile: string | null = null;

  if (memberCode) {
    // 1. Find the customer's assigned sales rep id (legacy tb_users.adminidsale).
    const { data: userRow } = await admin
      .from("tb_users")
      .select("adminidsale")
      .eq("userid", memberCode)
      .maybeSingle<{ adminidsale: string | null }>();

    if (userRow?.adminidsale) {
      // 2. Resolve the rep display name + phone + photo from tb_admin.
      //    NOTE: the legacy column is `admintel` (varchar(13)) — there is
      //    no `adminphone` column.
      const { data: rep } = await admin
        .from("tb_admin")
        .select("adminname, adminlastname, adminnickname, admintel, adminpicture")
        .eq("adminid", userRow.adminidsale)
        .maybeSingle<{
          adminname: string | null;
          adminlastname: string | null;
          adminnickname: string | null;
          admintel: string | null;
          adminpicture: string | null;
        }>();

      if (rep) {
        // Legacy "เซลล์ <name>" uses the nickname when set, else first name.
        displayName =
          (rep.adminnickname && rep.adminnickname.trim()) ||
          `${rep.adminname ?? ""} ${rep.adminlastname ?? ""}`.trim();
        phone = rep.admintel ?? null;
        avatarFile = rep.adminpicture ?? null;
      }
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
  // tb_admin.adminpicture stores a bare filename (default 'user.jpg'); only
  // render an <Image> when it looks like a real uploaded file (an absolute
  // URL or path). The bare-filename default has no resolvable URL → initial.
  const avatarUrl =
    avatarFile && avatarFile !== "user.jpg" && /^(https?:|\/)/.test(avatarFile)
      ? avatarFile
      : null;

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
