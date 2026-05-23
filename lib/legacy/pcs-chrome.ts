/**
 * Legacy PCS Cargo customer-portal chrome — the data layer.
 *
 * D1 faithful port (ADR-0017). Every legacy `member/*.php` page shares one
 * chrome, assembled by `member/include/header.php` + `header-theme.php`
 * + `top-menu.php` + `left-menu.php` + `all-script.php`. This module is the
 * 1:1 transcription of the data those includes query — each legacy mysqli
 * SELECT mapped to the ported `tb_*` Supabase schema, read through the
 * service-role admin client (`tb_*` is RLS-locked to service_role).
 *
 * Join key: `tb_*.userid === profile.member_code` (the customer "PR<n>" code).
 */
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** member/include/function.php L2444-2451 — a 10-char phone → xxx-xxx-xxxx. */
export function formatPhoneNumber(phone: string | null | undefined): string {
  const p = phone ?? "";
  if (p.length === 10) {
    return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6, 10)}`;
  }
  return "เบอร์โทรไม่ถูกต้อง";
}

/** member/include/function.php L14-24 — UTF-8-aware truncate to `num` glyphs. */
export function countText(text: string | null | undefined, num: number): string {
  const chars = [...(text ?? "")];
  return chars.length >= num ? `${chars.slice(0, num).join("")}...` : text ?? "";
}

export type PcsSalesRep = { nickname: string; picture: string; tel: string };

export type PcsChromeData = {
  userID: string;
  userName: string;
  userLastName: string;
  userEmail: string;
  userPicture: string;
  coID: string;
  walletTotal: number;
  cbTotal: number;
  creditValue: number;
  creditUser: boolean;
  rsDefault: number;
  rpDefault: number;
  countForwarder: number;
  countForwarder5: number;
  countFCredit: number;
  countFCreditError: number;
  countShops: number;
  countShops2: number;
  countPayment: number;
  countCart: number;
  keywords: string[];
  sales: PcsSalesRep;
  vipSvip: boolean;
  vipCorporate: boolean;
};

/** left-menu.php L30-34 — the central PCS line, shown when no rep is assigned. */
const SALES_FALLBACK: PcsSalesRep = {
  nickname: "ส่วนกลาง",
  picture: "/legacy/pcs/assets/images/theme/logo.png",
  tel: "02-055-6063",
};

/**
 * Default avatar — legacy `images/users/<file>`. The customer image export is
 * backfilled after the Supabase-Pro upgrade, so the staged placeholder stands
 * in until then (keeps the screen 1:1 — never a broken image).
 */
export const PCS_DEFAULT_AVATAR = "/legacy/pcs/images/users/user.jpg";

/** Zeroed chrome — used if the data layer throws, so the portal never 500s. */
const EMPTY_CHROME: PcsChromeData = {
  userID: "",
  userName: "",
  userLastName: "",
  userEmail: "",
  userPicture: PCS_DEFAULT_AVATAR,
  coID: "",
  walletTotal: 0,
  cbTotal: 0,
  creditValue: 0,
  creditUser: false,
  rsDefault: 0,
  rpDefault: 0,
  countForwarder: 0,
  countForwarder5: 0,
  countFCredit: 0,
  countFCreditError: 0,
  countShops: 0,
  countShops2: 0,
  countPayment: 0,
  countCart: 0,
  keywords: [],
  sales: { ...SALES_FALLBACK },
  vipSvip: false,
  vipCorporate: false,
};

/**
 * left-menu.php L17-34 — resolve the customer's assigned sales rep:
 *   tb_admin a ⋈ tb_org_tell_ships ots ⋈ tb_organization_tell ot
 *   WHERE a.adminID = $adminIDSale  ORDER BY ots.ID DESC
 */
async function resolveSalesRep(
  admin: AdminClient,
  adminIdSale: string | null,
): Promise<PcsSalesRep> {
  if (!adminIdSale) return { ...SALES_FALLBACK };

  const { data: adminRow } = await admin
    .from("tb_admin")
    .select("adminnickname, adminpicture")
    .eq("adminid", adminIdSale)
    .maybeSingle<{ adminnickname: string | null; adminpicture: string | null }>();
  if (!adminRow) return { ...SALES_FALLBACK };

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
  const picture =
    adminRow.adminpicture &&
    adminRow.adminpicture !== "user.jpg" &&
    /^(https?:|\/)/.test(adminRow.adminpicture)
      ? adminRow.adminpicture
      : SALES_FALLBACK.picture;

  return {
    nickname:
      (adminRow.adminnickname && adminRow.adminnickname.trim()) ||
      SALES_FALLBACK.nickname,
    picture,
    tel: tel ?? SALES_FALLBACK.tel,
  };
}

/**
 * Transcribes every SELECT in header.php (L86-134) + header-theme.php (L2-9)
 * + top-menu.php (keywords) + left-menu.php (sales rep, VIP badges).
 *
 * NOTE — header.php L75-85 also runs an auto-cancel UPDATE
 * (`tb_header_order SET hStatus=6 WHERE hDatePayment<NOW() AND hStatus=2`).
 * A Server Component render must stay a pure read, so that mutation is NOT
 * done here — it belongs in a cron / Server Action (deferred, tracked).
 */
export async function loadPcsChromeData(
  memberCode: string,
): Promise<PcsChromeData> {
  try {
    const admin = createAdminClient();
    const uid = memberCode ?? "";
    const nowIso = new Date().toISOString();

    const [
      userRow,
      walletRow,
      cashbackRow,
      creditRow,
      settingsRow,
      fwdAll,
      fwd5,
      fwdCredit,
      fwdCreditErr,
      hoAll,
      ho2,
      payAll,
      cartAll,
      keywordRes,
      svipRes,
      corpRes,
    ] = await Promise.all([
      admin
        .from("tb_users")
        .select("username, userlastname, useremail, userpicture, coid, adminidsale")
        .eq("userid", uid)
        .maybeSingle<{
          username: string | null;
          userlastname: string | null;
          useremail: string | null;
          userpicture: string | null;
          coid: string | null;
          adminidsale: string | null;
        }>(),
      admin
        .from("tb_wallet")
        .select("wallettotal")
        .eq("userid", uid)
        .maybeSingle<{ wallettotal: number | string | null }>(),
      admin
        .from("tb_cash_back")
        .select("cbtotal")
        .eq("userid", uid)
        .maybeSingle<{ cbtotal: number | string | null }>(),
      admin
        .from("tb_credit")
        .select("creditvalue")
        .eq("userid", uid)
        .maybeSingle<{ creditvalue: number | string | null }>(),
      admin
        .from("tb_settings")
        .select("rsdefault, rpdefault")
        .eq("id", 1)
        .maybeSingle<{ rsdefault: number | string | null; rpdefault: number | string | null }>(),
      admin.from("tb_forwarder").select("*", { count: "exact", head: true }).eq("userid", uid),
      admin
        .from("tb_forwarder")
        .select("*", { count: "exact", head: true })
        .eq("userid", uid)
        .eq("fstatus", "5"),
      admin
        .from("tb_forwarder")
        .select("*", { count: "exact", head: true })
        .eq("userid", uid)
        .eq("fcredit", "1"),
      admin
        .from("tb_forwarder")
        .select("*", { count: "exact", head: true })
        .eq("userid", uid)
        .eq("fcredit", "1")
        .lt("fcreditdate", nowIso),
      admin.from("tb_header_order").select("*", { count: "exact", head: true }).eq("userid", uid),
      admin
        .from("tb_header_order")
        .select("*", { count: "exact", head: true })
        .eq("userid", uid)
        .eq("hstatus", "2"),
      admin.from("tb_payment").select("*", { count: "exact", head: true }).eq("userid", uid),
      admin.from("tb_cart").select("*", { count: "exact", head: true }).eq("userid", uid),
      admin.from("tb_keyword_product").select("keyword").order("id", { ascending: false }),
      admin.from("tb_rate_custom_cbm").select("*", { count: "exact", head: true }).eq("userid", uid),
      admin.from("tb_corporate").select("*", { count: "exact", head: true }).eq("userid", uid),
    ]);

    const sales = await resolveSalesRep(admin, userRow.data?.adminidsale ?? null);
    const keywordRows = (keywordRes.data ?? []) as { keyword: string | null }[];

    return {
      userID: uid,
      userName: userRow.data?.username ?? "",
      userLastName: userRow.data?.userlastname ?? "",
      userEmail: (userRow.data?.useremail ?? "").toLowerCase(),
      userPicture: PCS_DEFAULT_AVATAR,
      coID: userRow.data?.coid ?? "",
      walletTotal: Number(walletRow.data?.wallettotal ?? 0),
      cbTotal: Number(cashbackRow.data?.cbtotal ?? 0),
      creditValue: Number(creditRow.data?.creditvalue ?? 0),
      creditUser: !!creditRow.data,
      rsDefault: Number(settingsRow.data?.rsdefault ?? 0),
      rpDefault: Number(settingsRow.data?.rpdefault ?? 0),
      countForwarder: fwdAll.count ?? 0,
      countForwarder5: fwd5.count ?? 0,
      countFCredit: fwdCredit.count ?? 0,
      countFCreditError: fwdCreditErr.count ?? 0,
      countShops: hoAll.count ?? 0,
      countShops2: ho2.count ?? 0,
      countPayment: payAll.count ?? 0,
      countCart: cartAll.count ?? 0,
      keywords: keywordRows.map((r) => r.keyword ?? "").filter((k) => k !== ""),
      sales,
      vipSvip: (svipRes.count ?? 0) > 0,
      vipCorporate: (corpRes.count ?? 0) > 0,
    };
  } catch {
    return { ...EMPTY_CHROME, sales: { ...SALES_FALLBACK } };
  }
}
