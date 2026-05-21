/* eslint-disable @next/next/no-img-element */
import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { PcsCarousel } from "@/components/legacy/pcs-carousel";

/**
 * Customer member home — a faithful 1:1 transcription of the legacy PCS Cargo
 * `member/index.php` (the page a customer lands on after login, served at
 * `pcscargo.co.th/member/`).
 *
 * The `index.php` body is: the promo carousel (`.single-item-member`, slick)
 * + 2 side banners + the 4 `.tam-counter` statistic cards (ฝากสั่ง / ฝากนำเข้า
 * / ฝากชำระ / กระเป๋าเงิน). The shared chrome (navbar / sidebar / footer /
 * mobile-nav) is rendered once by `(protected)/layout.tsx` — this page is the
 * `<div class="app-content content">` body only.
 *
 * Thai text is hardcoded verbatim from `index.php`. Every legacy mysqli SELECT
 * is transcribed to the ported `tb_*` schema via the service-role admin client.
 *
 * NOTE — the legacy `menu.php` 9-icon launchpad is a DIFFERENT page (served at
 * `member/menu/`); it belongs at a `/menu` route, not here.
 */
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const uid = profile.member_code ?? "";

  // index.php / header.php SELECTs — $countShops (header.php L105),
  // $countForwarder (L100), $countPayment (L104), $walletTotal (L86-92),
  // and the tb_corporate juristic-pending gate (index.php L40).
  const [shopsRes, forwarderRes, paymentRes, walletRes, corpRes] = await Promise.all([
    admin
      .from("tb_header_order")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid),
    admin
      .from("tb_forwarder")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid),
    admin
      .from("tb_payment")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid),
    admin
      .from("tb_wallet")
      .select("wallettotal")
      .eq("userid", uid)
      .maybeSingle<{ wallettotal: number | string | null }>(),
    admin
      .from("tb_corporate")
      .select("*", { count: "exact", head: true })
      .eq("userid", uid)
      .eq("corporatestatus", "1"),
  ]);

  const countShops = shopsRes.count ?? 0;
  const countForwarder = forwarderRes.count ?? 0;
  const countPayment = paymentRes.count ?? 0;
  const walletTotal = Number(walletRes.data?.wallettotal ?? 0);
  const walletText = walletTotal.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // index.php L40-42 — a tb_corporate row with corporateStatus=1 = a
  // juristic-person application still pending approval.
  const isJuristicPending = (corpRes.count ?? 0) > 0;

  // index.php L49 — the March promo carousel slide is date-gated.
  const now = new Date();
  const showMarchPromo =
    now >= new Date("2026-03-04T00:00:01") &&
    now <= new Date("2026-03-06T23:59:59");

  return (
    <>
      <link rel="stylesheet" href="/legacy/pcs/assets/plugins/slick/slick.css" />
      <link
        rel="stylesheet"
        href="/legacy/pcs/assets/plugins/slick/slick-theme.css"
      />
      <link rel="stylesheet" href="/legacy/pcs/index.css" />

      {/* BEGIN: Content — index.php L34 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {!isJuristicPending ? (
            <div className="content-body pr110">
              <div className="container bander-index pl-1 pt-1 pr-1">
                <div className="row">
                  <div className="col-sm-12 col-md-8">
                    <PcsCarousel>
                      {showMarchPromo && (
                        <div>
                          <a href="#">
                            <img
                              className="img-fluid"
                              src="https://pcscargo.co.th/wp-content/uploads/2026/03/3.3-06-2048x598.jpg"
                              alt="โปรโมชัน"
                            />
                          </a>
                        </div>
                      )}
                      <div>
                        <img
                          className="img-fluid"
                          src="/legacy/pcs/assets/images/theme/pcs50-900x270.jpg"
                          alt=""
                        />
                      </div>
                      <div>
                        <img
                          className="img-fluid"
                          src="/legacy/pcs/assets/images/theme/search-900x270.jpg"
                          alt=""
                        />
                      </div>
                    </PcsCarousel>
                  </div>
                  <div className="col-md-4 d-none d-sm-block">
                    <Link href="/service-order">
                      <img
                        className="img-fluid pr-05 pl-05 pb-05"
                        src="/legacy/pcs/assets/images/theme/bill-shop-900x270.jpg"
                        alt=""
                      />
                    </Link>
                    {/* Legacy linked to pcscargo.co.th/line-notify/ —
                        rewritten to internal /line-notify. */}
                    <Link href="/line-notify">
                      <img
                        className="img-fluid pr-05 pl-05 pt-05"
                        src="/legacy/pcs/assets/images/theme/line-notify-900x270.jpg"
                        alt=""
                      />
                    </Link>
                  </div>
                </div>
              </div>

              {/* eCommerce statistic */}
              <div className="row">
                {/* 1 — ฝากสั่งซื้อสินค้า */}
                <div className="col-xl-3 col-lg-6 col-12 align-self-center d-none d-sm-block col-sm-6">
                  <Link href="/service-order">
                    <div className="card pull-up">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="media d-flex">
                            <div className="media-body text-left">
                              <h2
                                className="info tam-counter"
                                data-count={countShops}
                              >
                                {countShops}
                              </h2>
                              <h4>
                                <span className="menu-shop">ฝากสั่งซื้อสินค้า</span>
                              </h4>
                            </div>
                            <div>
                              <i className="icon-basket-loaded info font-large-2 float-right"></i>
                            </div>
                          </div>
                          <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                            <div
                              className="progress-bar bg-gradient-x-info"
                              role="progressbar"
                              style={{ width: "100%" }}
                              aria-valuenow={100}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>

                {/* 2 — ฝากนำเข้าสินค้า */}
                <div className="col-xl-3 col-lg-6 col-12 align-self-center d-none d-sm-block col-sm-6">
                  <Link href="/service-import">
                    <div className="card pull-up">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="media d-flex">
                            <div className="media-body text-left">
                              <h2
                                className="warning tam-counter"
                                data-count={countForwarder}
                              >
                                {countForwarder}
                              </h2>
                              <h4>
                                <span className="menu-forwarder">
                                  ฝากนำเข้าสินค้า
                                </span>
                              </h4>
                            </div>
                            <div>
                              <i className="ft-box warning font-large-2 float-right"></i>
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
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>

                {/* 3 — ฝากชำระเงิน */}
                <div className="col-xl-3 col-lg-6 col-12 align-self-center d-none d-sm-block col-sm-6">
                  <Link href="/service-payment">
                    <div className="card pull-up">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="media d-flex">
                            <div className="media-body text-left">
                              <h2
                                className="purple tam-counter"
                                data-count={countPayment}
                              >
                                {countPayment}
                              </h2>
                              <h4 className="menu-payment">ฝากชำระเงิน</h4>
                            </div>
                            <div>
                              <i className="purple font-large-2 float-right">
                                <svg
                                  viewBox="0 0 24 24"
                                  width="35"
                                  height="35"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="css-i6dzq1 font-large-2"
                                >
                                  <line x1="12" y1="1" x2="12" y2="23"></line>
                                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                              </i>
                            </div>
                          </div>
                          <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                            <div
                              className="progress-bar bg-gradient-x-purple"
                              role="progressbar"
                              style={{ width: "100%" }}
                              aria-valuenow={100}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>

                {/* 4 — กระเป๋าสตางค์ (shown on mobile too — no d-none) */}
                <div className="col-xl-3 col-lg-6 col-12 align-self-center col-sm-6">
                  <Link href="/wallet">
                    <div className="card pull-up">
                      <div className="card-content">
                        <div className="card-body">
                          <div className="media d-flex">
                            <div className="media-body text-left">
                              <h2 className="success">
                                <span
                                  className="tam-counter"
                                  data-count={walletText}
                                >
                                  {walletText}
                                </span>
                                <span className="font-14 lang-baht"> บาท</span>
                              </h2>
                              <h4 className="menu-cash-wallet">กระเป๋าสตางค์</h4>
                            </div>
                            <div>
                              <i className="icon-wallet success font-large-2 float-right"></i>
                            </div>
                          </div>
                          <div className="progress progress-sm mt-1 mb-0 box-shadow-2">
                            <div
                              className="progress-bar bg-gradient-x-success"
                              role="progressbar"
                              style={{ width: "100%" }}
                              aria-valuenow={100}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            /* index.php L154-156 — juristic-person application pending */
            <div className="text-center">
              <h2
                style={{ maxWidth: "670px", margin: "auto", marginTop: "10%" }}
                className="text-white bg-danger p-1"
              >
                รอเจ้าหน้าที่ดำเนิน อนุมัติการเป็นนิติบุคคล ภายใน 24 ชม. <br />{" "}
                (ยกเว้นวันอาทิตย์และวันหยุดนักขัตฤกษ์)
              </h2>
            </div>
          )}
        </div>
      </div>
      {/* END: Content */}
    </>
  );
}
