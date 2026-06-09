import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronRight, ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { ServiceImportAddForm } from "./service-import-add-form";
import { ServiceImportAddFields } from "./service-import-add-fields";

/**
 * Customer "เพิ่มรายการนำเข้า" (forwarder add) screen.
 *
 * Workflow is faithful to the legacy PCS Cargo `member/forwarder.php`
 * `?page=add` flow (D1 / ADR-0017); the UI is Pacred's own Tailwind design
 * (AGENTS.md §0a — copy the working system, polish the look ourselves). The
 * legacy rendered this as an auto-opening Bootstrap-4 modal over the list;
 * because the (protected) layout dropped Bootstrap CSS (ปอน 2026-05-24),
 * that markup rendered unstyled — so this is rebuilt as a clean, mobile-first
 * full-page card form.
 *
 * Field names match the legacy `save` POST so the
 * `createLegacyForwarder` Server Action contract holds:
 *   fTrackingCHN · fDetail · fAmount · hTransportType (1=รถ EK / 2=เรือ SEA)
 *   · crate (2=ไม่ตีลังไม้ / 1=ตีลังไม้) · addressID (id / "PCS") · pro ("f").
 *
 * Intentionally NOT ported (documented, not silently dropped):
 *  - fCover image upload (legacy L102-144) — admin attaches photos in
 *    back-office; the submit skips the file field.
 *  - getShipBy() AJAX into #selectShipBy (L1095-1116) — courier picker
 *    stays unwired; the out-of-area note is shown instead.
 *  - The "Pacred เหมา ๆ" promo pop-up modal (L1041-1058) — collapsed into
 *    the inline promo card.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

type AddressRow = {
  addressid: number;
  addressname: string | null;
  addresslastname: string | null;
  addressno: string | null;
  addresssubdistrict: string | null;
  addressdistrict: string | null;
  addressprovince: string | null;
  addresszipcode: string | null;
};

// Build the address option label (legacy forwarder.php L976-980 — no "คุณ"
// prefix on this branch).
function addressFull(a: AddressRow): string {
  return [
    a.addressname ?? "",
    a.addresslastname ?? "",
    a.addressno ?? "",
    "ตำบล/แขวง",
    a.addresssubdistrict ?? "",
    "อำเภอ/เขต",
    a.addressdistrict ?? "",
    "จังหวัด",
    a.addressprovince ?? "",
    a.addresszipcode ?? "",
  ]
    .filter((s) => s !== "")
    .join(" ");
}

export default async function ServiceImportAddPage() {
  const t = await getTranslations("serviceImportAdd");
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // ── Address <select> options (legacy forwarder.php L976-997) ──
  // The tb_address_main row marks the user's primary address; the rest of
  // their active tb_address rows follow.
  const { data: mainAddrRow, error: mainAddrRowErr } = await admin
    .from("tb_address_main")
    .select("addressid")
    .eq("userid", memberCode)
    .maybeSingle<{ addressid: number | string | null }>();
  if (mainAddrRowErr) {
    console.error(`[tb_address_main list] failed`, {
      code: mainAddrRowErr.code,
      message: mainAddrRowErr.message,
    });
  }
  const mainAddressId = mainAddrRow?.addressid ?? null;

  const { data: allAddrs, error: allAddrsErr } = await admin
    .from("tb_address")
    .select(
      "addressid, addressname, addresslastname, addressno, addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
    )
    .eq("userid", memberCode)
    .eq("addressstatus", "1");
  if (allAddrsErr) {
    console.error(`[tb_address list] failed`, {
      code: allAddrsErr.code,
      message: allAddrsErr.message,
    });
  }
  const addrs = ((allAddrs ?? []) as unknown as AddressRow[]).slice();
  let mainAddr: AddressRow | undefined;
  const others: AddressRow[] = [];
  for (const a of addrs) {
    if (mainAddressId != null && String(a.addressid) === String(mainAddressId)) {
      mainAddr = a;
    } else {
      others.push(a);
    }
  }
  others.sort((a, b) => Number(a.addressid) - Number(b.addressid));

  // ── P1 (tax-doc at order entry · 2026-06-09) — defaults for the doc-mode
  // picker, mirrored from cart/page.tsx: prefill juristic customers' 13-digit
  // tax id + company name + address from tb_corporate so the selector can
  // default to 'tax_invoice'. NOTE: tb_users is camelCase on prod (the
  // 2026-05-27 rename — userID/userCompany), tb_corporate stays lowercase. ──
  const [userRowRes, juristicRes] = await Promise.all([
    admin
      .from("tb_users")
      .select('"userCompany"')
      .eq("userID", memberCode)
      .maybeSingle<{ userCompany: string | null }>(),
    admin
      .from("tb_corporate")
      .select("corporatenumber, corporatename, corporateaddress")
      .eq("userid", memberCode)
      .maybeSingle<{
        corporatenumber: string | null;
        corporatename: string | null;
        corporateaddress: string | null;
      }>(),
  ]);
  if (userRowRes.error) {
    console.error(`[service-import/add tb_users tax-doc default] failed`, {
      code: userRowRes.error.code,
      message: userRowRes.error.message,
    });
  }
  if (juristicRes.error) {
    console.error(`[service-import/add tb_corporate tax-doc default] failed`, {
      code: juristicRes.error.code,
      message: juristicRes.error.message,
    });
  }
  const taxDocDefaults = {
    isJuristic: userRowRes.data?.userCompany === "1",
    taxId: juristicRes.data?.corporatenumber ?? "",
    companyName: juristicRes.data?.corporatename ?? "",
    companyAddress: juristicRes.data?.corporateaddress ?? "",
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-6">
      {/* Breadcrumb */}
      <nav
        aria-label="breadcrumb"
        className="mb-4 flex flex-wrap items-center gap-1 text-[13px] text-muted"
      >
        <Link href="/dashboard" className="hover:text-foreground">
          {t("breadcrumbHome")}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href="/service-import" className="hover:text-foreground">
          {t("breadcrumbList")}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">{t("breadcrumbAdd")}</span>
      </nav>

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">
          {t("pageTitle")}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/china-address"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-[13px] font-medium text-primary-700 transition hover:bg-primary-100"
          >
            {t("chinaWarehouseAddress")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <a
            href="/services/import-china"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[13px] font-medium text-amber-700 transition hover:bg-amber-100"
          >
            {t("checkImportRate")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <ServiceImportAddForm>
        <ServiceImportAddFields
          mainAddr={
            mainAddr
              ? { addressid: mainAddr.addressid, full: addressFull(mainAddr) }
              : null
          }
          others={others.map((a) => ({
            addressid: a.addressid,
            full: addressFull(a),
          }))}
          taxDocDefaults={taxDocDefaults}
        />
      </ServiceImportAddForm>
    </div>
  );
}
