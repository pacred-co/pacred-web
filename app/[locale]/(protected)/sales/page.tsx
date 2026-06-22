import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { legacyUserPictureUrl } from "@/lib/legacy-image";
import { isGeneralCoid } from "@/lib/forwarder/coid";
import { resolveSalesAgent } from "./team-map";

/**
 * Sales-rep "สมาชิกในทีม" (team members) screen — a FAITHFUL 1:1
 * TRANSCRIPTION of the legacy PCS Cargo `member/user-sales.php`
 * (D1 / ADR-0017 · the faithful-port transcription workstream ·
 * runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is
 * the exact HTML markup `user-sales.php` renders — same elements, same
 * Bootstrap-4 class names, same structure, same labels, same order.
 * The visual identity comes from the legacy theme CSS, brought in
 * verbatim as the static `.pcs-legacy`-scoped
 * `public/legacy/pcs/report-user-sales.css`, loaded via a plain
 * `<link>` so it bypasses the app's Tailwind v4 / PostCSS pipeline.
 *
 * `user-sales.php` source structure transcribed here (lines 19-150):
 *   .app-content > .content-wrapper
 *     1. .content-header > … > ol.breadcrumb — "หน้าแรก" / "สมาชิกในทีม"
 *     2. .content-body.pr110 > section > .row > .col-md-12
 *        > .card
 *          a. .card-header > .row — "สมาชิกในทีม" title + the
 *             "ลิงก์เชิญเพื่อน" copy widget
 *          b. .card-content > .card-body > .table-responsive
 *             > table#myTable — the team-member list (5 columns)
 *
 * Data — the `user-sales.php` L96-103 mysqli query, transcribed 1:1 to
 * the ported legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to
 * service_role, so reads go through the admin client.
 *   SELECT u.adminIDSale,u.userID,u.coID,userPicture,
 *          CONCAT('คุณ',userName,' ',userLastName) AS userFullname,
 *          userStatus,userBirthday,
 *          CONCAT('คุณ',addressName,' ',addressLastname,'<br>',addressNo,
 *            ' ต.',addressSubDistrict,' อ.',addressDistrict,'<br>จ.',
 *            addressProvince,' ',addressZIPCode) AS mainAddress,
 *          userEmail,userTel,userLineID,userFacebook,userRegistered
 *   FROM tb_users u
 *     LEFT JOIN tb_address_main am ON u.userID=am.userID
 *     LEFT JOIN tb_address a ON am.addressID=a.addressID
 *   WHERE u.coID='$userIDMain'
 * PostgREST cannot express that two-hop LEFT JOIN in one select, so it
 * is run as the same sequence of lookups the PHP effectively does.
 *
 * Gate — `user-sales.php` L3 only allows the 5 whitelisted member
 * codes; that gate is in `layout.tsx` (`resolveSalesAgent`). This page
 * re-resolves the agent for the per-account `$userIDMain` / `$urlRecom`.
 *
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand →
 * `PR<n>` + Pacred.
 *
 * ── NOT transcribed (deliberate · flagged) ──
 *  1. `include/header.php` L75-85 runs an `UPDATE tb_header_order` on
 *     every page load — a render-time mutation; a Server Component
 *     render must be a PURE READ, so it is NOT reproduced.
 *  2. The `copyToClipboard()` / DataTables jQuery (L162-195) needs
 *     client JS; the table renders statically with the `#myTable`
 *     class hooks so the resting look is identical. The legacy
 *     `onclick="copyToClipboard('#text1')"` markup is transcribed 1:1
 *     and works once the legacy vendor JS is staged.
 */

// This screen reads the signed-in customer's cookies/auth + the
// service-role `tb_*` data on every request — it cannot be statically
// rendered. `force-dynamic` per the faithful-port runbook §11 (a page
// that reads cookies/auth under a dynamic segment otherwise trips
// Next 16's DYNAMIC_SERVER_USAGE 500 in production).
export const dynamic = "force-dynamic";

// `badgeVIP2($coID,$conn,$userID)` — member/include/function.php
// L469-492. The VIP / corporate / coID badge cluster. The legacy
// joins are reproduced as lookups (see BadgeVIP2 below).
const CO_ID_BADGE: Record<string, string | null> = {
  PCS: "", // legacy: case "PCS": $coID='';
  STAR: "STAR",
  DIAMOND: "DIAMOND",
  CROWN: "CROWN",
};

/** One team-member row, as the user-sales.php query produces it. */
type TeamMemberRow = {
  userID: string;
  coID: string | null;
  userPicture: string | null;
  userName: string | null;
  userLastName: string | null;
  userStatus: string | null;
  userEmail: string | null;
  userTel: string | null;
  userLineID: string | null;
  userFacebook: string | null;
  userRegistered: string | null;
  // tb_address fields (resolved via tb_address_main) for `mainAddress`.
  addressName: string | null;
  addressLastname: string | null;
  addressNo: string | null;
  addressSubDistrict: string | null;
  addressDistrict: string | null;
  addressProvince: string | null;
  addressZIPCode: string | null;
  // badgeVIP2 lookup results.
  hasSvip: boolean;
  hasCorporate: boolean;
};

export default async function SalesTeamMembersPage() {
  const t = await getTranslations("salesPort");
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  // Re-resolve the agent — the layout already gated non-whitelisted
  // accounts; here we read the per-account $userIDMain / $urlRecom.
  const agent = resolveSalesAgent(data.profile.member_code ?? null);
  if (!agent) redirect("/dashboard"); // defensive — layout already 404s.

  const admin = createAdminClient();

  // ── user-sales.php L96-103 — the team-member query ──────────────
  // 1. tb_users WHERE coID = $userIDMain.
  const { data: usersRaw, error: usersRawErr } = await admin
    .from("tb_users")
    .select(
      "adminIDSale, userID, coID, userPicture, userName, userLastName, " +
        "userStatus, userBirthday, userEmail, userTel, userLineID, " +
        "userFacebook, userRegistered",
    )
    .eq("coID", agent.userIDMain);
  if (usersRawErr) {
    console.error(`[tb_users list] failed`, { code: usersRawErr.code, message: usersRawErr.message });
  }

  const users = (usersRaw ?? []) as unknown as {
    userID: string;
    coID: string | null;
    userPicture: string | null;
    userName: string | null;
    userLastName: string | null;
    userStatus: string | null;
    userEmail: string | null;
    userTel: string | null;
    userLineID: string | null;
    userFacebook: string | null;
    userRegistered: string | null;
  }[];

  // 2-3. The LEFT JOIN tb_address_main ⋈ tb_address — per member, the
  //      "main address". Resolve in bulk for the member set.
  const memberIds = users.map((u) => u.userID);
  const addressByUser = new Map<
    string,
    {
      addressname: string | null;
      addresslastname: string | null;
      addressno: string | null;
      addresssubdistrict: string | null;
      addressdistrict: string | null;
      addressprovince: string | null;
      addresszipcode: string | null;
    }
  >();
  if (memberIds.length > 0) {
    const { data: mains, error: mainsErr } = await admin
      .from("tb_address_main")
      .select("userid, addressid")
      .in("userid", memberIds);
    if (mainsErr) {
      console.error(`[tb_address_main list] failed`, { code: mainsErr.code, message: mainsErr.message });
    }
    const mainRows = (mains ?? []) as unknown as {
      userid: string;
      addressid: number;
    }[];
    const addressIds = mainRows.map((m) => m.addressid);
    if (addressIds.length > 0) {
      const { data: addrs, error: addrsErr } = await admin
        .from("tb_address")
        .select(
          "addressid, addressname, addresslastname, addressno, " +
            "addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
        )
        .in("addressid", addressIds);
      if (addrsErr) {
        console.error(`[tb_address list] failed`, { code: addrsErr.code, message: addrsErr.message });
      }
      const addrById = new Map(
        ((addrs ?? []) as unknown as {
          addressid: number;
          addressname: string | null;
          addresslastname: string | null;
          addressno: string | null;
          addresssubdistrict: string | null;
          addressdistrict: string | null;
          addressprovince: string | null;
          addresszipcode: string | null;
        }[]).map((a) => [a.addressid, a]),
      );
      for (const m of mainRows) {
        const a = addrById.get(m.addressid);
        if (a) addressByUser.set(m.userid, a);
      }
    }
  }

  // badgeVIP2 — per member, the SVIP (tb_rate_custom_cbm) + corporate
  // (tb_corporate) lookups (function.php L472-481). Bulk-resolve.
  const svipSet = new Set<string>();
  const corpSet = new Set<string>();
  if (memberIds.length > 0) {
    const [{ data: svipRows }, { data: corpRows }] = await Promise.all([
      admin.from("tb_rate_custom_cbm").select("userid").in("userid", memberIds),
      admin.from("tb_corporate").select("userid").in("userid", memberIds),
    ]);
    for (const r of (svipRows ?? []) as unknown as { userid: string }[])
      svipSet.add(r.userid);
    for (const r of (corpRows ?? []) as unknown as { userid: string }[])
      corpSet.add(r.userid);
  }

  const rows: TeamMemberRow[] = users.map((u) => {
    const a = addressByUser.get(u.userID);
    return {
      userID: u.userID,
      coID: u.coID,
      userPicture: u.userPicture,
      userName: u.userName,
      userLastName: u.userLastName,
      userStatus: u.userStatus,
      userEmail: u.userEmail,
      userTel: u.userTel,
      userLineID: u.userLineID,
      userFacebook: u.userFacebook,
      userRegistered: u.userRegistered,
      addressName: a?.addressname ?? null,
      addressLastname: a?.addresslastname ?? null,
      addressNo: a?.addressno ?? null,
      addressSubDistrict: a?.addresssubdistrict ?? null,
      addressDistrict: a?.addressdistrict ?? null,
      addressProvince: a?.addressprovince ?? null,
      addressZIPCode: a?.addresszipcode ?? null,
      hasSvip: svipSet.has(u.userID),
      hasCorporate: corpSet.has(u.userID),
    };
  });

  // user-sales.php L63 — basePath.'register/?recom='.$urlRecom.
  // The agent copies this URL + shares it with prospects, so it needs
  // a FULLY-QUALIFIED Pacred URL (not relative). Use NEXT_PUBLIC_SITE_URL
  // — in dev http://localhost:3000, in prod https://pacred.co.th.
  // Legacy hard-coded pcscargo.co.th — rewritten so referrals land on
  // Pacred's own /register page, not the legacy site.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://pacred.co.th";
  const inviteLink = `${siteUrl}/register?recom=${agent.urlRecom}`;

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — kept for any layout-scope globals; the
          visible surface below is Tailwind (2026-05-30 rebuild · ปอน). */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* user-sales.php <title> L5 (Next.js owns <head> — kept here as
          a fidelity-record comment):  สมาชิกในทีม | Pacred */}

      <div className="pcs-content-pad w-full px-3 md:px-6 py-3 md:py-6 notranslate">
        <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* ── Header: title + invite-link copy widget ── */}
          <div className="flex flex-col gap-3 border-b border-border px-3 py-3 md:px-5 md:py-4">
            <h3 className="text-base md:text-xl font-bold text-foreground">
              {t("teamMembersTitle")}
            </h3>
            {/* L60-65 — the "ลิงก์เชิญเพื่อน" copy widget. The legacy
                `<span>` carried an inline onclick="copyToClipboard('#text1')"
                (page-local jQuery, not staged here); the `#text1` id is
                preserved so the click-to-copy follow-up still targets it. */}
            <div>
              <label className="block text-xs font-medium text-muted mb-1" htmlFor="urlRecom">
                {t("inviteLinkLabel")}{" "}
                <span className="inline-flex items-center rounded-full bg-red-600 text-white px-2.5 py-0.5 text-[11px] font-semibold cursor-pointer">
                  {t("copy")}
                </span>
              </label>
              <div className="rounded-lg border border-border bg-surface-alt/50 px-3 py-2 text-xs md:text-sm text-foreground break-all">
                <span id="text1">{inviteLink}</span>
              </div>
            </div>
          </div>

          {/* L70-141 — the team-member list */}
          <div className="px-3 py-3 md:px-5 md:py-4">
            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">{t("emptyTeamMembers")}</p>
            ) : (
              <>
                {/* ── Mobile: stacked cards (md:hidden) ── */}
                <div className="space-y-3 md:hidden">
                  {rows.map((row) => (
                    <div
                      key={row.userID}
                      className="rounded-xl border border-border bg-white dark:bg-surface p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <a
                          className="image-popup-vertical-fit el-link shrink-0"
                          href={legacyUserPictureUrl(row.userPicture)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={legacyUserPictureUrl(row.userPicture)}
                            alt="user"
                            className="h-11 w-11 rounded-full border border-border object-cover"
                            width={44}
                          />
                        </a>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            คุณ{row.userName ?? ""} {row.userLastName ?? ""}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1 font-mono text-xs text-muted">
                            <span>{row.userID}</span> <BadgeVIP2 row={row} t={t} />
                          </p>
                          {row.userStatus === "0" && (
                            <span className="mt-1 inline-block text-xs font-medium text-red-600">
                              {t("accountDeleted")}
                            </span>
                          )}
                        </div>
                      </div>
                      <dl className="mt-3 space-y-2 border-t border-dashed border-border pt-2 text-xs">
                        <div>
                          <dt className="font-medium text-muted">{t("address")}</dt>
                          <dd className="mt-0.5 text-foreground">
                            <MainAddress row={row} />
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-muted">{t("contactInfo")}</dt>
                          <dd className="mt-0.5 text-foreground [&_a]:text-red-600 [&_a]:break-all">
                            <ContactInfo row={row} t={t} />
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt className="font-medium text-muted">{t("registerDate")}</dt>
                          <dd className="tabular-nums text-foreground">{row.userRegistered}</dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>

                {/* ── Desktop: table (plain div wrapper isolates Tailwind
                    from the legacy `.dataTable` cascade) ── */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                  <table
                    id="myTable"
                    className="dataTable w-full text-sm"
                  >
                    <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-4 py-3 font-medium whitespace-nowrap">{t("memberCode")}</th>
                        <th className="px-4 py-3 font-medium">{t("fullName")}</th>
                        <th className="px-4 py-3 font-medium">{t("address")}</th>
                        <th className="px-4 py-3 font-medium">{t("contactInfo")}</th>
                        <th className="px-4 py-3 font-medium text-center whitespace-nowrap">{t("registerDate")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr
                          key={row.userID}
                          className="border-t border-border align-top hover:bg-surface-alt/30"
                        >
                          <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                            <span className="flex flex-wrap items-center gap-1">
                              <span>{row.userID}</span> <BadgeVIP2 row={row} t={t} />
                            </span>
                          </td>
                          <td className="px-4 py-3 text-foreground">
                            <span className="flex items-center gap-2">
                              <a
                                className="image-popup-vertical-fit el-link shrink-0"
                                href={legacyUserPictureUrl(row.userPicture)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={legacyUserPictureUrl(row.userPicture)}
                                  alt="user"
                                  className="h-9 w-9 rounded-full border border-border object-cover"
                                  width={35}
                                />
                              </a>
                              <span>
                                คุณ{row.userName ?? ""} {row.userLastName ?? ""}
                                {row.userStatus === "0" && (
                                  <>
                                    <br />
                                    <span className="text-xs font-medium text-red-600">
                                      {t("accountDeleted")}
                                    </span>
                                  </>
                                )}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-foreground">
                            <MainAddress row={row} />
                          </td>
                          <td className="px-4 py-3 text-xs text-foreground [&_a]:text-red-600 [&_a]:break-all">
                            <ContactInfo row={row} t={t} />
                          </td>
                          <td className="px-4 py-3 text-center text-xs tabular-nums text-muted whitespace-nowrap">
                            {row.userRegistered}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * `badgeVIP2($coID,$conn,$userID)` — member/include/function.php
 * L469-492. Returns `$coID . $svip . $corporate` — the coID badge,
 * the SVIP badge (when tb_rate_custom_cbm has a row), and the
 * corporate badge (when tb_corporate has a row).
 */
function BadgeVIP2({
  row,
  t,
}: {
  row: TeamMemberRow;
  t: (key: string) => string;
}): ReactNode {
  // switch ($coID): PCS → ''; STAR/DIAMOND/CROWN → that text;
  // default → the raw coID.
  const coId = row.coID ?? "";
  // Route the general-tier decision through the coid.ts SOT so the 0182 PCS→PR
  // rebrand can't leave a stale literal map rendering a misleading "PR" VIP chip
  // for ~8,700 general customers (audit 2026-06-14 #5). General (PCS/PR/empty/
  // GENERAL) → no chip; STAR/DIAMOND/CROWN keep their label; other VIP coIDs show raw.
  const coLabel = isGeneralCoid(coId) ? null : coId in CO_ID_BADGE ? CO_ID_BADGE[coId] : coId;
  // Tailwind chip for the VIP/corporate badge cluster (was the legacy
  // `badge badge-vip badge-pill`). Amber tone reads as the "VIP" accent.
  const vipChip =
    "inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700";
  return (
    <>
      {coLabel ? <span className={vipChip}>{coLabel}</span> : null}
      {row.hasSvip ? (
        <>
          {" "}
          <span className={vipChip}>SVIP</span>
        </>
      ) : null}
      {row.hasCorporate ? (
        <>
          {" "}
          <span className={vipChip}>{t("companyBadge")}</span>
        </>
      ) : null}
    </>
  );
}

/**
 * The `mainAddress` CONCAT (user-sales.php L97):
 *   'คุณ'+addressName+' '+addressLastname+'<br>'+addressNo+
 *   ' ต.'+addressSubDistrict+' อ.'+addressDistrict+'<br>จ.'+
 *   addressProvince+' '+addressZIPCode
 * A LEFT JOIN — when a member has no address row the CONCAT is NULL
 * in MySQL, so the legacy `<td>` is empty. Reproduce: render nothing
 * when there is no address.
 */
function MainAddress({ row }: { row: TeamMemberRow }): ReactNode {
  if (row.addressName == null) return null;
  return (
    <>
      คุณ{row.addressName} {row.addressLastname ?? ""}
      <br />
      {row.addressNo ?? ""} ต.{row.addressSubDistrict ?? ""} อ.
      {row.addressDistrict ?? ""}
      <br />
      จ.{row.addressProvince ?? ""} {row.addressZIPCode ?? ""}
    </>
  );
}

/**
 * The contact column — four `checkNULL()` calls (user-sales.php
 * L118-123). `checkNULL($data,$label,$enter,$link)` —
 * member/include/function.php L971-983 — echoes `$label.$data` (with
 * an optional `<a href=$link>` wrap and a trailing `$enter`) only
 * when `$data` is not NULL/empty.
 */
function ContactInfo({
  row,
  t,
}: {
  row: TeamMemberRow;
  t: (key: string) => string;
}): ReactNode {
  return (
    <>
      {row.userEmail ? (
        <>
          {t("emailLabel")} <a href={`mailto:${row.userEmail}`}>{row.userEmail}</a>
          <br />
        </>
      ) : null}
      {row.userTel ? (
        <>
          {t("phoneLabel")} <a href={`tel:${row.userTel}`}>{row.userTel}</a>
          <br />
        </>
      ) : null}
      {row.userLineID ? (
        <>
          {t("lineIdLabel")} {row.userLineID}
          <br />
        </>
      ) : null}
      {row.userFacebook ? (
        <>
          {t("facebookLabel")} <a href={row.userFacebook}>{row.userFacebook}</a>
          <br />
        </>
      ) : null}
    </>
  );
}
