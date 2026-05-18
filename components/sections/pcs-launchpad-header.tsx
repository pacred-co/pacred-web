import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Pencil, Settings } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * PCS launchpad header band — the red gradient header at the top of the
 * customer post-login home, a faithful port of legacy `member/menu.php`
 * (D1 / ADR-0017, gap doc `d1-fidelity-customer.md` §1.1 / §1.2).
 *
 * Legacy layout reproduced top → bottom:
 *   - two corner icon buttons, top-right: แก้ไขข้อมูล + ตั้งค่าบัญชีผู้ใช้งาน
 *   - centred 80px circular avatar
 *   - name (white H2) + `PR####` member code (white H5)
 *
 * Rebrand: legacy `PCS<num>` → `PR<num>`; the member_code passed in is
 * already the Pacred `PR###` running number.
 */
export async function PcsLaunchpadHeader({
  displayName,
  memberCode,
  avatarUrl,
}: {
  displayName: string;
  memberCode: string | null;
  avatarUrl: string | null;
}) {
  const t = await getTranslations("pcsHome");
  const initial = (displayName || "?").charAt(0).toUpperCase();

  return (
    <section className="relative rounded-b-[30px] bg-gradient-to-br from-primary-500 to-primary-700 px-4 pt-4 pb-16 text-white shadow-sm">
      {/* Corner icon buttons — legacy top-right list-inline */}
      <div className="flex items-center justify-end gap-2">
        <Link
          href="/profile"
          aria-label={t("editProfile")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
        >
          <Pencil className="h-4 w-4" />
        </Link>
        <Link
          href="/profile"
          aria-label={t("accountSettings")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>

      {/* Centred avatar + name + member code */}
      <div className="-mt-2 flex flex-col items-center text-center">
        <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-white bg-white/20 shadow-md">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl font-bold">
              {initial}
            </span>
          )}
        </div>
        <h1 className="mt-3 text-xl font-bold sm:text-2xl">{displayName}</h1>
        {memberCode && (
          <p className="mt-0.5 text-sm text-white/85">
            {t("memberCode")} :{" "}
            <span className="font-mono font-semibold">{memberCode}</span>
          </p>
        )}
      </div>
    </section>
  );
}
