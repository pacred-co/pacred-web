import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/actions/auth";
import { WalletCounter } from "./wallet-counter";
import "./menu.legacy.css";

/**
 * Customer post-login launchpad — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy PCS Cargo `member/menu.php` (D1 / ADR-0017 · the faithful-port
 * transcription pilot · runbook `docs/runbook/faithful-port-transcription.md`).
 *
 * This is a transcription, NOT a reinterpretation. The JSX below is the
 * exact HTML markup `menu.php` renders — same elements, same Bootstrap-4
 * class names, same structure, same labels, same order. The visual
 * identity comes from the legacy CSS, brought in verbatim as the
 * co-located, `.pcs-legacy`-scoped `./menu.legacy.css` (see that file's
 * header for the full CSS-handling pattern). The icon PNGs + logo + bg
 * are the legacy raster assets, copied to `public/legacy/pcs/`.
 *
 * `menu.php` source structure transcribed here (lines 66-347):
 *   .app-content > .content-wrapper > .content-body > section#basic-carousel
 *     > .row > .col-md-12 > .card.border-black > .card-content > .card-body.p-0
 *       1. .bg-gradient-x-danger.bg-box — red header band
 *          - 2 corner icon buttons (edit profile · account settings)
 *          - 80px round avatar + image-edit button
 *          - <h2> name · <h5> "รหัสสมาชิก : <PR####>"
 *       2. .col-123 > .box-wallet — wallet card (animated tam-counter)
 *       3. .box-sale-main — assigned sales-rep card
 *       4. .row > .card-body.col-12 > .row.text-center — the 9-icon grid
 *
 * Data — every `menu.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to service_role,
 * so reads go through the admin client; the join key is
 * `tb_*.userid === profile.member_code` (the customer's "PR<n>" code).
 *   - $walletTotal  → tb_wallet.wallettotal      (header.php L86-92)
 *   - sales rep     → tb_users.adminidsale → tb_admin ⋈ tb_org_tell_ships
 *                     ⋈ tb_organization_tell  (left-menu.php L19-34)
 *   - $userName etc → tb_users / profiles        (header.php L33-38)
 *
 * Rebrand: legacy `PCS<n>` → `PR<n>` (member codes) + branding text only.
 *
 * Not transcribed (deliberate · documented for the pilot): the legacy
 * edit-profile / edit-image jQuery modals (dropify + croppie + cropper).
 * Per the runbook §3 the profile/auth stack stays as-is — the two corner
 * icons link to Pacred's existing /profile screen (the equivalent of the
 * legacy edit-profile modal); the upload modal is a separate screen to
 * transcribe later. The visible launchpad surface is 1:1.
 *
 * Route targets: the legacy hrefs (shops/ · forwarder/ · payment/ · …)
 * map to the equivalent Pacred protected routes — Next.js owns routing;
 * markup + CSS + labels + icons are unchanged.
 */

// Legacy left-menu.php fallback when a customer has no assigned sales rep
// (left-menu.php L30-34) — the central PCS line, rebranded.
const SALES_FALLBACK = {
  nickname: "ส่วนกลาง",
  picture: "/legacy/pcs/logo.png",
  tel: "02-055-6063",
} as const;

export default async function DashboardPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const t = await getTranslations("pcsHome");

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // ── Transcribed queries ──────────────────────────────────────
  // header.php L86-92:  SELECT walletTotal FROM tb_wallet WHERE userID=…
  // left-menu.php L19:  SELECT adminNickname,tell,adminPicture FROM tb_admin a
  //                     LEFT JOIN tb_org_tell_ships ots ON a.adminID=ots.adminID
  //                     LEFT JOIN tb_organization_tell ot ON ot.ID=ots.otID
  //                     WHERE a.adminID=$adminIDSale ORDER BY ots.ID DESC
  // PostgREST can't express that 3-table ordered join in one select, so
  // it is run as the same sequence of lookups the PHP effectively does.
  const [walletRes, userRowRes] = await Promise.all([
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", memberCode)
      .maybeSingle<{ wallettotal: number }>(),
    admin
      .from("tb_users")
      .select("adminidsale, username, userlastname, userpicture")
      .eq("userid", memberCode)
      .maybeSingle<{
        adminidsale: string | null;
        username: string | null;
        userlastname: string | null;
        userpicture: string | null;
      }>(),
  ]);

  const walletTotal = Number(walletRes.data?.wallettotal ?? 0);

  // Resolve the assigned sales rep (left-menu.php L17-34).
  const sales = await resolveSalesRep(admin, userRowRes.data?.adminidsale ?? null);

  // $userName . ' ' . $userLastName — prefer the ported tb_users name
  // (faithful to menu.php), fall back to the Pacred profile fields.
  const legacyName = [userRowRes.data?.username, userRowRes.data?.userlastname]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const profileName = [profile.first_name, profile.last_name]
    .filter((s): s is string => !!s && s.trim() !== "")
    .join(" ")
    .trim();
  const fullName = legacyName || profileName || profile.company_name || t("fallbackName");

  // $userID — the customer's member code (menu.php prints it in <title>
  // and the <h5>); legacy PCS#### is rebranded PR####.
  const userID = profile.member_code ?? "";

  return (
    <div className="pcs-legacy">
      {/* BEGIN: Content — menu.php L66 */}
      <div className="app-content content" style={{ paddingTop: "0rem" }}>
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body">
            {/* Basic Carousel start — menu.php L71 */}
            <section id="basic-carousel">
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card border-black">
                    <div className="card-content">
                      <div className="card-body p-0">
                        {/* ── Red header band — menu.php L77 ── */}
                        <div
                          className="bg-gradient-x-danger bg-box pb-5"
                          style={{ borderRadius: "0 0 30px 30px" }}
                        >
                          {/* Two corner icon buttons — menu.php L78-95.
                              Legacy opens jQuery modals; Pacred routes them
                              to /profile (the equivalent edit screen). */}
                          <ul className="list-inline dl text-right pr-2">
                            <li className="list-inline-item">
                              <Link href="/profile">
                                <button
                                  className="btn tn-icon btn-pure text-white p-0 pull-up"
                                  type="button"
                                  aria-label={t("editProfile")}
                                >
                                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                <span className="font-normal text-dark d-none d-sm-inline-block d-sm-none">
                                  {t("editProfile")}
                                </span>
                              </Link>
                            </li>
                            <li className="list-inline-item text-info">
                              <Link href="/profile">
                                <button
                                  className="btn tn-icon btn-pure text-white p-0 pull-up"
                                  type="button"
                                  aria-label={t("accountSettings")}
                                >
                                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                  </svg>
                                </button>
                                <span className="font-normal text-dark d-none d-sm-inline-block d-sm-none">
                                  <span className="lang-account-settings">{t("accountSettings")}</span>
                                </span>
                              </Link>
                            </li>
                          </ul>

                          {/* Avatar + name + member code — menu.php L171-230 */}
                          <div className="text-center" style={{ marginTop: "-30px" }}>
                            <span className="image-popup-vertical-fit el-link">
                              {profile.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={profile.avatar_url}
                                  className="rounded-circle"
                                  width={80}
                                  height={80}
                                  alt={fullName}
                                />
                              ) : (
                                <span
                                  className="rounded-circle d-inline-block"
                                  style={{
                                    width: 80,
                                    height: 80,
                                    lineHeight: "80px",
                                    background: "#fff",
                                    color: "#E9091F",
                                    fontSize: "2rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {(fullName || "?").charAt(0).toUpperCase()}
                                </span>
                              )}
                            </span>
                            <div className="edit-img-profile mb--20">
                              <Link
                                href="/profile"
                                className="btn rounded-circle btn-xs btn-dark text-white"
                                aria-label={t("editProfile")}
                              >
                                <svg viewBox="0 0 24 24" width="12" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="css-i6dzq1 svg-15">
                                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                                  <circle cx="12" cy="13" r="4"></circle>
                                </svg>
                              </Link>
                            </div>
                            <h2 className="text-white">
                              <span className="d-inline-block">{fullName}</span>
                            </h2>
                            <h5 className="text-white">
                              {t("memberCode")} : <span>{userID}</span>
                            </h5>
                          </div>
                        </div>

                        {/* ── Wallet card — menu.php L232-255 ── */}
                        <div className="row">
                          <div className="col-123">
                            <Link href="/wallet/history">
                              <div className="card-body pb-0 box-wallet">
                                <div className="media d-flex">
                                  <div className="media-body text-left">
                                    <h3 className="warning mb-0">
                                      <span className="text-black-1 font-14">{t("walletLabel")}</span>
                                      <br />
                                      <WalletCounter value={walletTotal} />
                                      <br />
                                    </h3>
                                  </div>
                                  <div>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      className="brand-logo logo-wallet"
                                      alt="logo"
                                      src="/legacy/pcs/logo.png"
                                    />
                                  </div>
                                </div>
                                <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                                  <div
                                    className="progress-bar bg-gradient-x-warning"
                                    role="progressbar"
                                    style={{ width: "100%" }}
                                    aria-valuenow={100}
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                  ></div>
                                </div>
                                <div className="text-center pt-1" style={{ marginBottom: "10px" }}></div>
                              </div>
                            </Link>
                          </div>
                        </div>

                        {/* ── Sales-rep card — menu.php L256-274 ── */}
                        <div className="box-sale-main">
                          <div className="box-sale1"></div>
                          <div className="box-sale2">
                            <div className="row">
                              <div className="col-4 d-flex justify-content-center">
                                <div className="rounded-circle border-main2">
                                  <span className="image-popup-vertical-fit el-link">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={sales.picture}
                                      className="rounded-circle"
                                      width={55}
                                      height={55}
                                      alt={sales.nickname}
                                    />
                                  </span>
                                </div>
                              </div>
                              <div className="col-8">
                                <div className="text-sale-crad-top">{t("supervisor")}</div>
                                <div className="text-sale-crad-2">
                                  {t("salesPrefix")} <span>{sales.nickname}</span>
                                </div>
                                <div className="text-sale-crad-tell">
                                  Tel :{" "}
                                  <a style={{ display: "inline" }} href={`tel:${sales.tel}`}>
                                    <span className="text-dark">{formatPhoneNumber(sales.tel)}</span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ── 9-icon launchpad grid — menu.php L275-336 ── */}
                        <div className="row">
                          <div style={{ height: "65px" }}>.</div>
                          <div className="card-body col-12" style={{ height: "70vh" }}>
                            <div className="row text-center">
                              {/* 1 — ฝากสั่งสินค้า · shops/ */}
                              <div className="col-4 text-center">
                                <Link href="/service-order">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src="/legacy/pcs/icon/pcs-shops.png" className="pcs-icon-menu" alt="" />
                                  <h4 className="menu-shop">{t("tileShop")}</h4>
                                </Link>
                              </div>
                              {/* 2 — ฝากนำเข้าสินค้า · forwarder/ */}
                              <div className="col-4 text-center">
                                <Link href="/service-import">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src="/legacy/pcs/icon/pcs-forwarder.png" className="pcs-icon-menu" alt="" />
                                  <h4 className="menu-forwarder">{t("tileImport")}</h4>
                                </Link>
                              </div>
                              {/* 3 — ประวัติใบเสร็จรายการนำเข้า · receipt-f-hs/ */}
                              <div className="col-4 text-center">
                                <Link href="/service-import/receipts">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src="/legacy/pcs/icon/pcs-forwarder.png" className="pcs-icon-menu" alt="" />
                                  <h4 className="">{t("tileReceipts")}</h4>
                                </Link>
                              </div>
                              {/* 4 — ฝากชำระ/โอน · payment/ */}
                              <div className="col-4 text-center">
                                <Link href="/service-payment">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src="/legacy/pcs/icon/pcs-payment.png" className="pcs-icon-menu" alt="" />
                                  <h4 className="menu-payment">{t("tilePayment")}</h4>
                                </Link>
                              </div>
                              {/* 5 — เป๋าตัง · wallet/ */}
                              <div className="col-4 text-center">
                                <Link href="/wallet/history">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src="/legacy/pcs/icon/pcs-wallet.png" className="pcs-icon-menu" alt="" />
                                  <h4 className="lang-wallet">{t("tileWallet")}</h4>
                                </Link>
                              </div>
                              {/* 6 — เติมเงิน · wallet/add/ */}
                              <div className="col-4 text-center">
                                <Link href="/wallet/deposit">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src="/legacy/pcs/icon/pcs-wallet-add.png" className="pcs-icon-menu" alt="" />
                                  <h4 className="lang-top-up">{t("tileTopUp")}</h4>
                                </Link>
                              </div>
                              {/* 7 — ถอนเงิน · wallet/withdraw/ */}
                              <div className="col-4 text-center">
                                <Link href="/wallet/withdraw">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src="/legacy/pcs/icon/pcs-wallet-drop.png" className="pcs-icon-menu" alt="" />
                                  <h4 className="lang-withdraw-wallet">{t("tileWithdraw")}</h4>
                                </Link>
                              </div>
                              {/* 8 — ที่อยู่จัดส่งสินค้า · address/ */}
                              <div className="col-4 text-center">
                                <Link href="/addresses">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src="/legacy/pcs/icon/pcs-address.png" className="pcs-icon-menu" alt="" />
                                  <h4 className="lang-address">{t("tileAddress")}</h4>
                                </Link>
                              </div>
                              {/* 9 — ออกจากระบบ · logout/  (a server action, not a route) */}
                              <div className="col-4 text-center">
                                <form action={signOutAction}>
                                  <button type="submit" className="pcs-logout-tile">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/legacy/pcs/icon/pcs-log-out.png" className="pcs-icon-menu" alt="" />
                                    <h4 className="lang-logout">{t("tileLogout")}</h4>
                                  </button>
                                </form>
                              </div>
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
      {/* END: Content */}
    </div>
  );
}

/**
 * Transcribes the legacy `formatPhoneNumber()` helper
 * (`member/include/function.php` L2444-2451): a 10-digit phone is
 * rendered `xxx-xxx-xxxx`; anything else returns the legacy error
 * string. The central PCS line ("02-055-6063") is already formatted,
 * so left-menu.php L51 passes it through unchanged — mirrored here.
 */
function formatPhoneNumber(phone: string): string {
  if (phone === SALES_FALLBACK.tel) return phone;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  return "เบอร์โทรไม่ถูกต้อง";
}

/**
 * Resolves the customer's assigned sales rep, transcribing the
 * left-menu.php L17-34 query:
 *   tb_admin a ⋈ tb_org_tell_ships ots ⋈ tb_organization_tell ot
 *   WHERE a.adminID = $adminIDSale  ORDER BY ots.ID DESC
 * Returns the rep nickname + photo + phone, or the central PCS
 * fallback (left-menu.php L30-34) when none is assigned.
 */
async function resolveSalesRep(
  admin: ReturnType<typeof createAdminClient>,
  adminIdSale: string | null,
): Promise<{ nickname: string; picture: string; tel: string }> {
  if (!adminIdSale) return { ...SALES_FALLBACK };

  // tb_admin — adminNickname + adminPicture for the rep.
  const { data: adminRow } = await admin
    .from("tb_admin")
    .select("adminnickname, adminpicture")
    .eq("adminid", adminIdSale)
    .maybeSingle<{ adminnickname: string | null; adminpicture: string | null }>();

  if (!adminRow) return { ...SALES_FALLBACK };

  // tb_org_tell_ships ⋈ tb_organization_tell — the rep's org phone
  // line; ORDER BY ots.ID DESC keeps the most-recent assignment.
  let tel: string | null = null;
  const { data: shipRow } = await admin
    .from("tb_org_tell_ships")
    .select("otid")
    .eq("adminid", adminIdSale)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle<{ otid: number | null }>();

  if (shipRow?.otid != null) {
    const { data: tellRow } = await admin
      .from("tb_organization_tell")
      .select("tell")
      .eq("id", shipRow.otid)
      .maybeSingle<{ tell: string | null }>();
    tel = tellRow?.tell ?? null;
  }

  // left-menu.php L28: $adminPicture = basePath."images/admin/".picture.
  // The migrated tb_admin.adminpicture holds a bare filename (default
  // 'user.jpg'); only use it when it resolves to a real URL/path,
  // else fall back to the central PCS logo.
  const picture =
    adminRow.adminpicture &&
    adminRow.adminpicture !== "user.jpg" &&
    /^(https?:|\/)/.test(adminRow.adminpicture)
      ? adminRow.adminpicture
      : SALES_FALLBACK.picture;

  return {
    nickname: (adminRow.adminnickname && adminRow.adminnickname.trim()) || SALES_FALLBACK.nickname,
    picture,
    tel: tel ?? SALES_FALLBACK.tel,
  };
}
