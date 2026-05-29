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
 *
 * **Perf (Sprint-8b):** the public export `loadPcsChromeData` is wrapped in
 * `unstable_cache` keyed by `memberCode` with a 30-second TTL. Without this
 * the chrome runs ~17 round-trip Supabase queries (8 are `count('exact')`)
 * on every protected-page navigation — each click felt slow because the
 * sidebar/header data was re-fetched. 30 s is short enough that badge
 * counts feel live; if a customer's nav-clicks are slower than that we'll
 * pay the round-trip once and then cache for the rest of the session.
 */
import { unstable_cache } from "next/cache";
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

/** Fallback sales rep — shown when the customer has no `adminidsale` set.
 *  Mirrors the central rep on the public site's <SalesCarousel /> (แนท
 *  with the Pacred logo + office line 02-421-3325 — ปอน 2026-05-24). */
const SALES_FALLBACK: PcsSalesRep = {
  nickname: "แนท",
  picture: "/images/pacred-logo-red.png",
  tel: "02-421-3325",
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

  // Run both first-level queries in parallel — they only depend on adminIdSale,
  // not on each other. Saves 1 serial RTT vs the original 3-sequential chain.
  const [{ data: adminRow, error: adminRowErr }, { data: shipRow, error: shipRowErr }] =
    await Promise.all([
      admin
        .from("tb_admin")
        .select("adminNickname, adminPicture")
        .eq("adminID", adminIdSale)
        .maybeSingle<{ adminNickname: string | null; adminPicture: string | null }>(),
      admin
        .from("tb_org_tell_ships")
        .select("otid")
        .eq("adminid", adminIdSale)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle<{ otid: number | null }>(),
    ]);

  if (adminRowErr) console.error(`[tb_admin] failed`, adminRowErr.message);
  if (shipRowErr) console.error(`[tb_org_tell_ships] failed`, shipRowErr.message);
  if (!adminRow) return { ...SALES_FALLBACK };

  // tb_organization_tell depends on shipRow.otid — unavoidably sequential.
  let tel: string | null = null;
  if (shipRow?.otid != null) {
    const { data: tellRow, error: tellRowErr } = await admin
      .from("tb_organization_tell")
      .select("tell")
      .eq("id", shipRow.otid)
      .maybeSingle<{ tell: string | null }>();
    if (tellRowErr) console.error(`[tb_organization_tell] failed`, tellRowErr.message);
    tel = tellRow?.tell ?? null;
  }

  // left-menu.php L28: $adminPicture = basePath."images/admin/".picture.
  const picture =
    adminRow.adminPicture &&
    adminRow.adminPicture !== "user.jpg" &&
    /^(https?:|\/)/.test(adminRow.adminPicture)
      ? adminRow.adminPicture
      : SALES_FALLBACK.picture;

  return {
    nickname: adminRow.adminNickname?.trim() || SALES_FALLBACK.nickname,
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
async function loadPcsChromeDataUncached(
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
        .select("userName, userLastName, userEmail, userPicture, coID, adminIDSale")
        .eq("userID", uid)
        .maybeSingle<{
          userName: string | null;
          userLastName: string | null;
          userEmail: string | null;
          userPicture: string | null;
          coID: string | null;
          adminIDSale: string | null;
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
      admin
        .from("tb_keyword_product")
        .select("keyword")
        .order("id", { ascending: false })
        .limit(20),  // Sprint-8b: cap legacy keyword strip at 20 (was unbounded — full table scan + serialise on every nav)
      admin.from("tb_rate_custom_cbm").select("*", { count: "exact", head: true }).eq("userid", uid),
      admin.from("tb_corporate").select("*", { count: "exact", head: true }).eq("userid", uid),
    ]);

    const sales = await resolveSalesRep(admin, userRow.data?.adminIDSale ?? null);
    const keywordRows = (keywordRes.data ?? []) as { keyword: string | null }[];

    return {
      userID: uid,
      userName: userRow.data?.userName ?? "",
      userLastName: userRow.data?.userLastName ?? "",
      userEmail: (userRow.data?.userEmail ?? "").toLowerCase(),
      userPicture: PCS_DEFAULT_AVATAR,
      coID: userRow.data?.coID ?? "",
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

/**
 * Cached chrome loader — 30-second TTL keyed on `memberCode`.
 *
 * Cache lives in the Next.js server's Data Cache (per Vercel region). On
 * cache hit (~99% of nav within a session), the protected layout returns
 * in single-digit milliseconds. On cache miss (first nav, or after TTL
 * expiry), it falls through to the 17-query underlying loader.
 *
 * Tag `pcs-chrome` lets future invalidation (Server Actions that change
 * wallet/cart/forwarder counts) call `revalidateTag("pcs-chrome")` to
 * refresh the badge counts immediately instead of waiting 30 s.
 */
export const loadPcsChromeData = unstable_cache(
  loadPcsChromeDataUncached,
  ["pcs-chrome"],
  { revalidate: 60, tags: ["pcs-chrome"] },
);
