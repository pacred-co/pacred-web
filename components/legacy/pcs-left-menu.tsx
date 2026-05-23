/* eslint-disable @next/next/no-img-element */
import { Link } from "@/i18n/navigation";
import { signOutAction } from "@/actions/auth";
import { formatPhoneNumber, type PcsChromeData } from "@/lib/legacy/pcs-chrome";

/** Legacy basePath."assets" — the staged Modern-Admin theme bundle. */
const A = "/legacy/pcs/assets";

/** left-menu.php L33 — the central PCS line is shown pre-formatted, as-is. */
const CENTRAL_TEL = "02-055-6063";

/** left-menu.php L99 — the four member codes that see the agent-history menu
 *  (legacy PCS888/PCS352/PCS2678/PCS4155 → rebranded PR<n>). */
const AGENT_CODES = ["PR888", "PR352", "PR2678", "PR4155"];

/** member/include/function.php L360-367 — badgeMenu(): a small red pill, or none. */
function MenuBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <div className="pcs-sm-badge badge-danger pcs-sm-badge-pill">{n}</div>;
}

/** member/include/function.php L469-491 — badgeVIP2(): the coID tier badge
 *  (PCS → none) followed by the SVIP + บริษัท badges. */
function VipBadges({
  coID,
  svip,
  corporate,
}: {
  coID: string;
  svip: boolean;
  corporate: boolean;
}) {
  return (
    <>
      {coID && coID !== "PCS" ? (
        <span className="badge badge-vip badge-pill">{coID}</span>
      ) : null}
      {svip ? (
        <>
          {" "}
          <span className="badge badge-vip badge-pill">SVIP</span>
        </>
      ) : null}
      {corporate ? (
        <>
          {" "}
          <span className="badge badge-vip badge-pill">บริษัท</span>
        </>
      ) : null}
    </>
  );
}

/**
 * Legacy PCS Cargo customer left sidebar — a 1:1 transcription of
 * `member/include/left-menu.php` (the fixed accordion menu). Verbatim
 * Bootstrap-4 / Modern-Admin markup; the legacy `basePath."<screen>/"` hrefs
 * are rebranded to the equivalent Pacred (protected) routes.
 */
export function PcsLeftMenu({ data }: { data: PcsChromeData }) {
  const isAgent = AGENT_CODES.includes(data.userID);
  const salesTel =
    data.sales.tel === CENTRAL_TEL
      ? data.sales.tel
      : formatPhoneNumber(data.sales.tel);

  return (
    <div
      id="pcs-left-menu"
      className="notranslate main-menu menu-fixed menu-light menu-accordion menu-shadow pcs-menu"
      data-scroll-to-active="true"
    >
      <div className="main-menu-content">
        <ul
          className="navigation navigation-main"
          id="main-menu-navigation"
          data-menu="menu-navigation"
        >
          <li className="nav-item itop has-sub">
            <a href="#">
              <img
                src={data.userPicture}
                className="rounded-circle"
                width={40}
                style={{ marginLeft: "-0.7rem" }}
                alt=""
              />
              <span className="menu-title">
                {data.userID}{" "}
                <VipBadges
                  coID={data.coID}
                  svip={data.vipSvip}
                  corporate={data.vipCorporate}
                />
              </span>
            </a>
            <ul className="menu-content">
              <li>
                <Link className="menu-item" href="/profile">
                  <i className="ft-user"></i>
                  <span className="lang-profile">โปรไฟล์ของฉัน</span>
                </Link>
              </li>
              <li>
                <Link className="menu-item" href="/account-settings">
                  <i className="ft-settings"></i>
                  <span className="lang-account-settings">
                    ตั้งค่าบัญชีผู้ใช้งาน
                  </span>
                </Link>
              </li>
              <li>
                <form action={signOutAction}>
                  <button type="submit" className="menu-item">
                    <i className="ft-log-out"></i>
                    <span className="lang-logout">ออกจากระบบ</span>
                  </button>
                </form>
              </li>
            </ul>
          </li>
          <li className="navigation-header last-login text-center">
            <span className="font-10">
              <div className="mb--5">
                {data.userName} {data.userLastName}
              </div>
              <div>{data.userEmail}</div>
            </span>
          </li>
          <li className="nav-item">
            <div className="box-sale-main">
              <div className="box-sale1"></div>
              <div className="box-sale2">
                <div className="row">
                  <div className="col-4 d-flex justify-content-center">
                    <div className="rounded-circle border-main2">
                      <a
                        className="image-popup-vertical-fit el-link"
                        href={data.sales.picture}
                      >
                        <img
                          src={data.sales.picture}
                          className="rounded-circle"
                          width={55}
                          alt=""
                        />
                      </a>
                    </div>
                  </div>
                  <div className="col-8">
                    <div className="text-sale-crad-top">ผู้ดูแล</div>
                    <div className="text-sale-crad-2">
                      เซลล์ <span>{data.sales.nickname}</span>
                    </div>
                    <div className="text-sale-crad-tell">
                      Tel :{" "}
                      <a
                        style={{ display: "inline" }}
                        href={`tel:${data.sales.tel}`}
                      >
                        <span className="text-dark">{salesTel}</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
          <li className="nav-item">
            <Link href="/">
              <img
                src={`${A}/images/icon/pcs-home-main.png`}
                className="pcs-icon"
                alt=""
              />
              <span className="menu-title">
                <span className="menu-home">หน้าแรก</span>
              </span>
            </Link>
          </li>
          <li className="nav-item">
            <Link href="/dashboard">
              <img
                src={`${A}/images/icon/pcs-home.png`}
                className="pcs-icon"
                alt=""
              />
              <span className="menu-title">
                <span className="menu-system-member">ระบบสมาชิก</span>
              </span>
            </Link>
          </li>
          <li className="nav-item has-sub">
            <a href="#">
              <img
                src={`${A}/images/icon/pcs-shops.png`}
                className="pcs-icon"
                alt=""
              />
              <span className="menu-title">
                <span className="menu-shop">บริการฝากสั่งสินค้า</span>{" "}
                <MenuBadge n={data.countShops2 + data.countCart} />
              </span>
            </a>
            <ul className="menu-content">
              <li>
                <Link className="menu-item" href="/service-order">
                  <i className="ft-layers"></i>
                  <span className="menu-shop-all">รายการสั่งสินค้าทั้งหมด</span>
                </Link>
              </li>
              <li>
                <Link className="menu-item" href="/service-order?q=2">
                  <i className="la la-money"></i>
                  <span>
                    <span className="menu-shop-w-pay">รอชำระเงิน</span>{" "}
                    <MenuBadge n={data.countShops2} />
                  </span>
                </Link>
              </li>
              <li>
                <Link className="menu-item" href="/cart">
                  <i className="ft-shopping-cart"></i>
                  <span>
                    <span className="lang-shop-cart">รถเข็นสินค้า</span>{" "}
                    <MenuBadge n={data.countCart} />
                  </span>
                </Link>
              </li>
              <li>
                <Link className="menu-item" href="/cart/add">
                  <i className="ft-plus"></i>
                  <span className="lang-add-cart">เพิ่มสินค้าในรถเข็น</span>
                </Link>
              </li>
            </ul>
          </li>
          <li className="nav-item has-sub">
            <a href="#">
              <img
                src={`${A}/images/icon/pcs-forwarder.png`}
                className="pcs-icon"
                alt=""
              />
              <span className="menu-title">
                <span className="menu-forwarder">บริการฝากนำเข้า</span>{" "}
                <MenuBadge n={data.countForwarder5 + data.countFCredit} />
              </span>
            </a>
            <ul className="menu-content">
              <li>
                <Link className="menu-item" href="/service-import">
                  <i className="ft-box"></i>
                  <span className="menu-forwarder-all">รายการนำเข้าทั้งหมด</span>
                </Link>
              </li>
              <li>
                <Link className="menu-item" href="/service-import?q=5">
                  <i className="la la-money"></i>
                  <span>
                    <span className="menu-shop-w-pay">รอชำระเงิน</span>{" "}
                    <MenuBadge n={data.countForwarder5} />
                  </span>
                </Link>
              </li>
              {data.creditUser && (
                <li>
                  <Link className="menu-item" href="/service-import?q=c">
                    <i className="la la-money"></i>
                    <span>
                      <span className="menu-credit-list">รายการเครดิต</span>{" "}
                      <MenuBadge n={data.countFCredit} />
                    </span>
                  </Link>
                </li>
              )}
              <li>
                <Link className="menu-item" href="/service-import/receipts">
                  <i className="la la-print"></i>
                  <span>ประวัติใบเสร็จ</span>
                </Link>
              </li>
              <li>
                <Link className="menu-item" href="/service-import/add">
                  <i className="ft-plus"></i>
                  <span className="lang-add-forwarder">เพิ่มรายการนำเข้า</span>
                </Link>
              </li>
            </ul>
          </li>
          <li className="nav-item has-sub">
            <a href="#">
              <img
                src={`${A}/images/icon/pcs-payment.png`}
                className="pcs-icon"
                alt=""
              />
              <span className="menu-title menu-payment">บริการฝากชำระ/โอน</span>
            </a>
            <ul className="menu-content">
              <li>
                <Link className="menu-item" href="/service-payment">
                  <i>
                    <svg
                      viewBox="0 0 24 24"
                      width="24"
                      height="24"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="css-i6dzq1"
                    >
                      <line x1="12" y1="1" x2="12" y2="23"></line>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                  </i>
                  <span className="menu-payment">รายการฝากชำระ</span>
                </Link>
              </li>
              <li>
                <Link className="menu-item" href="/service-payment/add">
                  <i className="ft-plus"></i>
                  <span className="lang-add-payment">เพิ่มรายการฝากชำระ</span>
                </Link>
              </li>
            </ul>
          </li>
          <li className="nav-item has-sub">
            <a href="#">
              <img
                src={`${A}/images/icon/pcs-wallet.png`}
                className="pcs-icon"
                alt=""
              />
              <span className="menu-title menu-cash-wallet">
                กระเป๋าสตางค์เงินสด
              </span>
            </a>
            <ul className="menu-content">
              <li className="">
                <Link className="menu-item" href="/wallet">
                  <i className="la la-money"></i>
                  <span className="lang-statement">รายการเดินบัญชี</span>
                </Link>
              </li>
              <li className="">
                <Link className="menu-item" href="/wallet/withdraw">
                  <i className="la la-refresh"></i>
                  <span className="lang-withdraw-wallet">ถอนเงิน</span>
                </Link>
              </li>
              <li className="">
                <Link className="menu-item" href="/wallet/deposit">
                  <i className="ft-plus"></i>
                  <span className="lang-top-up">เติมเงิน</span>
                </Link>
              </li>
            </ul>
          </li>
          {data.creditUser && (
            <li className="nav-item has-sub">
              <a href="#">
                <img
                  src={`${A}/images/icon/pcs-wallet.png`}
                  className="pcs-icon"
                  alt=""
                />
                <span className="menu-title">
                  <span className="menu-credit-wallet">
                    กระเป๋าสตางค์เครดิต
                  </span>{" "}
                  <MenuBadge n={data.countFCreditError} />
                </span>
              </a>
              <ul className="menu-content">
                <li className="">
                  <Link className="menu-item" href="/wallet-credit">
                    <i className="la la-money"></i>
                    <span className="lang-statement">รายการเดินบัญชี</span>
                  </Link>
                </li>
                <li className="">
                  <Link className="menu-item" href="/service-import?q=c">
                    <i className="la la-money"></i>
                    <span>
                      <span className="lang-pay">ชำระเงิน</span>{" "}
                      <MenuBadge n={data.countFCreditError} />
                    </span>
                  </Link>
                </li>
              </ul>
            </li>
          )}
          {isAgent && (
            <li className="nav-item has-sub">
              <a href="#">
                <img
                  src={`${A}/images/icon/pcs-sales.png`}
                  className="pcs-icon"
                  alt=""
                />
                <span className="menu-title lang-agent-his">ประวัติตัวแทน</span>
              </a>
              <ul className="menu-content">
                <li className="">
                  <Link className="menu-item" href="/sales">
                    <i className="ft-users"></i>
                    <span className="lang-team-members">สมาชิกในทีม</span>
                  </Link>
                </li>
                <li className="">
                  <Link className="menu-item" href="/sales/report">
                    <i className="la la-refresh"></i>
                    <span className="menu-forwarder">
                      ประวัติรายการทั้งหมด
                    </span>
                  </Link>
                </li>
                <li className="">
                  <Link className="menu-item" href="/sales/history">
                    <i className="ft-file-text"></i>
                    <span className="lang-payment-history">
                      ประวัติการเบิกเงิน
                    </span>
                  </Link>
                </li>
                <li className="">
                  <Link className="menu-item" href="/sales/report/add">
                    <i className="ft-plus"></i>
                    <span>ทำรายการเบิกเงิน</span>
                  </Link>
                </li>
              </ul>
            </li>
          )}
          <li className="nav-item">
            <Link href="/addresses">
              <img
                src={`${A}/images/icon/pcs-address.png`}
                className="pcs-icon"
                alt=""
              />
              <span className="menu-title lang-address">ที่อยู่จัดส่งสินค้า</span>
            </Link>
          </li>
          <li className="text-center">
            <img
              src={`${A}/images/theme/pcs-monkey-2.webp`}
              className="img-fluid"
              style={{ maxWidth: "150px" }}
              alt=""
            />
          </li>
        </ul>
      </div>
    </div>
  );
}
