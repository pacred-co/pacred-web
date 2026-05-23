import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * `PR<n>` + "PR Cargo" / Pacred.
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
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");

  // Re-resolve the agent — the layout already gated non-whitelisted
  // accounts; here we read the per-account $userIDMain / $urlRecom.
  const agent = resolveSalesAgent(data.profile.member_code ?? null);
  if (!agent) redirect("/dashboard"); // defensive — layout already 404s.

  const admin = createAdminClient();

  // ── user-sales.php L96-103 — the team-member query ──────────────
  // 1. tb_users WHERE coID = $userIDMain.
  const { data: usersRaw } = await admin
    .from("tb_users")
    .select(
      "adminidsale, userid, coid, userpicture, username, userlastname, " +
        "userstatus, userbirthday, useremail, usertel, userlineid, " +
        "userfacebook, userregistered",
    )
    .eq("coid", agent.userIDMain);

  const users = (usersRaw ?? []) as unknown as {
    userid: string;
    coid: string | null;
    userpicture: string | null;
    username: string | null;
    userlastname: string | null;
    userstatus: string | null;
    useremail: string | null;
    usertel: string | null;
    userlineid: string | null;
    userfacebook: string | null;
    userregistered: string | null;
  }[];

  // 2-3. The LEFT JOIN tb_address_main ⋈ tb_address — per member, the
  //      "main address". Resolve in bulk for the member set.
  const memberIds = users.map((u) => u.userid);
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
    const { data: mains } = await admin
      .from("tb_address_main")
      .select("userid, addressid")
      .in("userid", memberIds);
    const mainRows = (mains ?? []) as unknown as {
      userid: string;
      addressid: number;
    }[];
    const addressIds = mainRows.map((m) => m.addressid);
    if (addressIds.length > 0) {
      const { data: addrs } = await admin
        .from("tb_address")
        .select(
          "addressid, addressname, addresslastname, addressno, " +
            "addresssubdistrict, addressdistrict, addressprovince, addresszipcode",
        )
        .in("addressid", addressIds);
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
    const a = addressByUser.get(u.userid);
    return {
      userID: u.userid,
      coID: u.coid,
      userPicture: u.userpicture,
      userName: u.username,
      userLastName: u.userlastname,
      userStatus: u.userstatus,
      userEmail: u.useremail,
      userTel: u.usertel,
      userLineID: u.userlineid,
      userFacebook: u.userfacebook,
      userRegistered: u.userregistered,
      addressName: a?.addressname ?? null,
      addressLastname: a?.addresslastname ?? null,
      addressNo: a?.addressno ?? null,
      addressSubDistrict: a?.addresssubdistrict ?? null,
      addressDistrict: a?.addressdistrict ?? null,
      addressProvince: a?.addressprovince ?? null,
      addressZIPCode: a?.addresszipcode ?? null,
      hasSvip: svipSet.has(u.userid),
      hasCorporate: corpSet.has(u.userid),
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
      {/* Legacy PCS theme CSS — static public/ asset, loaded via a
          plain <link> so it bypasses the app's Tailwind/PostCSS pipeline. */}
      <link rel="stylesheet" href="/legacy/pcs/report-user-sales.css" />

      {/* user-sales.php <title> L5 (Next.js owns <head> — kept here as
          a fidelity-record comment):  สมาชิกในทีม | PR Cargo */}

      {/* BEGIN: Content — user-sales.php L19 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* L23-34 — breadcrumb header */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">สมาชิกในทีม</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
          {/* L35 — content-body */}
          <div className="content-body pr110 notranslate">
            <section id="basic-carousel">
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    {/* L41-69 — card-header: title + invite-link widget */}
                    <div className="card-header">
                      <div className="row">
                        <div className="content-header-left col-md-6 col-12">
                          <div className="text-center text-md-left">
                            <h3 className="">สมาชิกในทีม</h3>
                          </div>
                        </div>
                        <div className="content-header-right col-md-6 col-12">
                          {/* L60-65 — the "ลิงก์เชิญเพื่อน" copy widget.
                              The legacy `<span>` carries an inline
                              `onclick="copyToClipboard('#text1')"` (the
                              jQuery helper defined in user-sales.php's
                              page `<script>` L178-184). That page-local
                              JS is not staged here — the markup is
                              transcribed 1:1 with its classes so the
                              look is identical; the click-to-copy
                              behaviour is a deferred client-JS
                              follow-up (flagged in the report). */}
                          <div className="float-md-right notranslate">
                            <label className="form-control-label" htmlFor="urlRecom">
                              ลิงก์เชิญเพื่อน{" "}
                              <span className="badge badge-vip badge-pill font-16 cursor-pointer">
                                {" "}
                                คัดลอก
                              </span>
                            </label>
                            <div>
                              <span id="text1">{inviteLink}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* L70-141 — card-body: the team-member table */}
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-12">
                            <div className="table-responsive">
                              <table
                                id="myTable"
                                className="table display table-bordered table-striped dataTable no-footer dtr-inline"
                              >
                                <thead>
                                  <tr className="text-center">
                                    <th>รหัสสมาชิก</th>
                                    <th>ชื่อ-นามสกุล</th>
                                    <th>ที่อยู่</th>
                                    <th>ข้อมูลติดต่อ</th>
                                    <th>วันที่สมัครสมาชิก</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row) => (
                                    <tr key={row.userID}>
                                      <td>
                                        {row.userID} <BadgeVIP2 row={row} />
                                      </td>
                                      <td>
                                        <a
                                          className="image-popup-vertical-fit el-link"
                                          href={`https://pcscargo.co.th/member/images/users/${row.userPicture ?? ""}`}
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={`https://pcscargo.co.th/member/images/users/${row.userPicture ?? ""}`}
                                            alt="user"
                                            className="rounded-circle"
                                            width={35}
                                          />
                                        </a>{" "}
                                        คุณ{row.userName ?? ""} {row.userLastName ?? ""}
                                        {row.userStatus === "0" && (
                                          <>
                                            <br />
                                            <span className="text-danger">
                                              {" "}
                                              บัญชีนี้ถูกลบแล้ว
                                            </span>
                                          </>
                                        )}
                                      </td>
                                      <td>
                                        <MainAddress row={row} />
                                      </td>
                                      <td>
                                        <ContactInfo row={row} />
                                      </td>
                                      <td className="text-center">{row.userRegistered}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            {/* Basic Carousel end */}
          </div>
        </div>
      </div>
      {/* END: Content — user-sales.php L150 */}
    </div>
  );
}

/**
 * `badgeVIP2($coID,$conn,$userID)` — member/include/function.php
 * L469-492. Returns `$coID . $svip . $corporate` — the coID badge,
 * the SVIP badge (when tb_rate_custom_cbm has a row), and the
 * corporate badge (when tb_corporate has a row).
 */
function BadgeVIP2({ row }: { row: TeamMemberRow }): ReactNode {
  // switch ($coID): PCS → ''; STAR/DIAMOND/CROWN → that text;
  // default → the raw coID.
  const coId = row.coID ?? "";
  const coLabel = coId in CO_ID_BADGE ? CO_ID_BADGE[coId] : coId;
  return (
    <>
      {coLabel ? (
        <span className="badge badge-vip badge-pill">{coLabel}</span>
      ) : null}
      {row.hasSvip ? (
        <>
          {" "}
          <span className="badge badge-vip badge-pill">SVIP</span>
        </>
      ) : null}
      {row.hasCorporate ? (
        <>
          {" "}
          <span className="badge badge-vip badge-pill">บริษัท</span>
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
function ContactInfo({ row }: { row: TeamMemberRow }): ReactNode {
  return (
    <>
      {row.userEmail ? (
        <>
          อีเมล : <a href={`mailto:${row.userEmail}`}>{row.userEmail}</a>
          <br />
        </>
      ) : null}
      {row.userTel ? (
        <>
          โทร : <a href={`tel:${row.userTel}`}>{row.userTel}</a>
          <br />
        </>
      ) : null}
      {row.userLineID ? (
        <>
          ไอดีไลน์ : {row.userLineID}
          <br />
        </>
      ) : null}
      {row.userFacebook ? (
        <>
          เฟสบุ๊ค : <a href={row.userFacebook}>{row.userFacebook}</a>
          <br />
        </>
      ) : null}
    </>
  );
}
