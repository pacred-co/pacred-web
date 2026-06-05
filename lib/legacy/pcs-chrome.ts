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

/**
 * Normalize a free-form phone to a 10-digit local number (the shape
 * `formatPhoneNumber` expects). Strips every non-digit; a leading "66"
 * country code on an 11-digit string is rewritten to a "0" prefix
 * (66812345678 → 0812345678). Returns the cleaned digits otherwise so the
 * caller can still fall back if it isn't a clean 10-digit. Empty in →
 * empty out (the resolvers treat empty as "no tel, use fallback").
 */
function normalizeTel(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("66")) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

/** First non-empty (post-normalize) tel from a candidate list, else "". */
function pickTel(candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const n = normalizeTel(c);
    if (n) return n;
  }
  return "";
}

/** member/include/function.php L14-24 — UTF-8-aware truncate to `num` glyphs. */
export function countText(text: string | null | undefined, num: number): string {
  const chars = [...(text ?? "")];
  return chars.length >= num ? `${chars.slice(0, num).join("")}...` : text ?? "";
}

export type PcsSalesRep = { nickname: string; picture: string; tel: string };
/** The customer's assigned CS (customer-service) contact — same shape as the
 *  sales rep. Resolved from tb_users.adminIDCS (migration 0141). */
export type PcsCsRep = { nickname: string; picture: string; tel: string };

export type PcsChromeData = {
  userID: string;
  userName: string;
  userLastName: string;
  userEmail: string;
  userPicture: string;
  coID: string;
  walletTotal: number;
  /** Spendable cashback balance (`tb_cash_back.cbtotal`). ADR-0025: this is
   *  the SOT the customer pay screens read to render the "ใช้แคชแบ็ก" apply
   *  input (capped to this value) + the wallet/cashback panel. The spend side
   *  (debit at checkout / on admin slip-approve) lives in
   *  actions/admin/wallet-hs.ts (`spendCashbackAtCheckout`). */
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
  /** Aggregate "ต้องชำระ/รอดำเนินการ" across services — powers the
   *  "รายการที่ต้องชำระ" sidebar badge + the /payment-due page.
   *  = order(hstatus=2) + forwarder(fstatus=5) + payment(paystatus=1). */
  countPaymentDue: number;
  countCart: number;
  keywords: string[];
  sales: PcsSalesRep;
  /** The customer's assigned CS (tb_users.adminIDCS → tb_admin) · central CS
   *  line fallback. Shown beside the sales rep in the sidebar "ผู้ดูแล" card. */
  cs: PcsCsRep;
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

/** Fallback CS — the central CS line (CONTACT.phoneCs · พลอย · 062-603-4456),
 *  stored as the raw 10-digit so `formatPhoneNumber` renders it uniformly with
 *  a resolved CS tel. Shown when the customer has no adminIDCS yet (the
 *  not-yet-assigned customers). Mirrors SALES_FALLBACK. */
const CS_FALLBACK: PcsCsRep = {
  nickname: "พลอย",
  picture: "/images/pacred-logo-red.png",
  tel: "0626034456",
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
  countPaymentDue: 0,
  countCart: 0,
  keywords: [],
  sales: { ...SALES_FALLBACK },
  cs: { ...CS_FALLBACK },
  vipSvip: false,
  vipCorporate: false,
};

/**
 * Resolve the customer's assigned sales rep (left-menu.php L17-34).
 *
 * The legacy chain (tb_admin ⋈ tb_org_tell_ships ⋈ tb_organization_tell) only
 * ever showed the LEGACY tb_admin fields, and the tell tables are empty after
 * the rebuild → a sales admin editing their pic/name/phone via the modern
 * /admin/admins/[id]/edit (which writes profiles + admin_contact_extras) never
 * showed up. Option A (resolver-only): traverse the bridge
 *   admin_contact_extras.legacy_admin_id == tb_admin.adminID
 *     → admin_contact_extras.profile_id (uuid) → profiles.id
 * read the modern profile, and PREFER it over the legacy tb_admin, then the
 * central SALES_FALLBACK. Same query count as the old tell chain.
 */
async function resolveSalesRep(
  admin: AdminClient,
  adminIdSale: string | null,
): Promise<PcsSalesRep> {
  if (!adminIdSale) return { ...SALES_FALLBACK };

  // tb_admin (legacy fallback fields) + the bridge row (modern profile id +
  // contact phones) only depend on adminIdSale, not each other → parallel.
  const [{ data: adminRow, error: adminRowErr }, { data: bridgeRow, error: bridgeErr }] =
    await Promise.all([
      admin
        .from("tb_admin")
        .select("adminNickname, adminPicture, adminTel")
        .eq("adminID", adminIdSale)
        .maybeSingle<{ adminNickname: string | null; adminPicture: string | null; adminTel: string | null }>(),
      admin
        .from("admin_contact_extras")
        .select("profile_id, nickname, work_phone, direct_phone")
        .eq("legacy_admin_id", adminIdSale)
        .maybeSingle<{ profile_id: string | null; nickname: string | null; work_phone: string | null; direct_phone: string | null }>(),
    ]);

  if (adminRowErr) console.error(`[tb_admin] failed`, adminRowErr.message);
  if (bridgeErr) console.error(`[admin_contact_extras] failed`, bridgeErr.message);
  if (!adminRow) return { ...SALES_FALLBACK };

  // Modern profile (avatar/name/phone) depends on bridgeRow.profile_id.
  let profile: { avatar_url: string | null; phone: string | null } | null = null;
  if (bridgeRow?.profile_id) {
    const { data: profileRow, error: profileErr } = await admin
      .from("profiles")
      .select("avatar_url, first_name, last_name, phone")
      .eq("id", bridgeRow.profile_id)
      .maybeSingle<{ avatar_url: string | null; first_name: string | null; last_name: string | null; phone: string | null }>();
    if (profileErr) console.error(`[profiles] failed`, profileErr.message);
    profile = profileRow ?? null;
  }

  // PREFER modern (admin_contact_extras / profiles) → legacy tb_admin → fallback.
  const nickname =
    bridgeRow?.nickname?.trim() || adminRow.adminNickname?.trim() || SALES_FALLBACK.nickname;

  const picture =
    profile?.avatar_url && /^(https?:|\/)/.test(profile.avatar_url)
      ? profile.avatar_url
      : adminRow.adminPicture &&
          adminRow.adminPicture !== "user.jpg" &&
          /^(https?:|\/)/.test(adminRow.adminPicture)
        ? adminRow.adminPicture
        : SALES_FALLBACK.picture;

  const tel =
    pickTel([bridgeRow?.work_phone, bridgeRow?.direct_phone, profile?.phone, adminRow.adminTel]) ||
    SALES_FALLBACK.tel;

  return { nickname, picture, tel };
}

/**
 * Resolve the customer's assigned CS, keyed on tb_users.adminIDCS (migration
 * 0141). CS twin of resolveSalesRep — same modern-profile bridge so a CS admin
 * editing their pic/name/phone via /admin/admins/[id]/edit shows up:
 *   admin_contact_extras.legacy_admin_id == tb_admin.adminID
 *     → admin_contact_extras.profile_id → profiles.id
 * PREFER modern (admin_contact_extras / profiles) → legacy tb_admin → the
 * central CS_FALLBACK line.
 */
async function resolveCsRep(
  admin: AdminClient,
  adminIdCs: string | null,
): Promise<PcsCsRep> {
  if (!adminIdCs) return { ...CS_FALLBACK };

  const [{ data: adminRow, error: adminRowErr }, { data: bridgeRow, error: bridgeErr }] =
    await Promise.all([
      admin
        .from("tb_admin")
        .select("adminNickname, adminPicture, adminTel")
        .eq("adminID", adminIdCs)
        .maybeSingle<{ adminNickname: string | null; adminPicture: string | null; adminTel: string | null }>(),
      admin
        .from("admin_contact_extras")
        .select("profile_id, nickname, work_phone, direct_phone")
        .eq("legacy_admin_id", adminIdCs)
        .maybeSingle<{ profile_id: string | null; nickname: string | null; work_phone: string | null; direct_phone: string | null }>(),
    ]);

  if (adminRowErr) console.error(`[tb_admin cs] failed`, adminRowErr.message);
  if (bridgeErr) console.error(`[admin_contact_extras cs] failed`, bridgeErr.message);
  if (!adminRow) return { ...CS_FALLBACK };

  let profile: { avatar_url: string | null; phone: string | null } | null = null;
  if (bridgeRow?.profile_id) {
    const { data: profileRow, error: profileErr } = await admin
      .from("profiles")
      .select("avatar_url, first_name, last_name, phone")
      .eq("id", bridgeRow.profile_id)
      .maybeSingle<{ avatar_url: string | null; first_name: string | null; last_name: string | null; phone: string | null }>();
    if (profileErr) console.error(`[profiles cs] failed`, profileErr.message);
    profile = profileRow ?? null;
  }

  const nickname =
    bridgeRow?.nickname?.trim() || adminRow.adminNickname?.trim() || CS_FALLBACK.nickname;

  const picture =
    profile?.avatar_url && /^(https?:|\/)/.test(profile.avatar_url)
      ? profile.avatar_url
      : adminRow.adminPicture &&
          adminRow.adminPicture !== "user.jpg" &&
          /^(https?:|\/)/.test(adminRow.adminPicture)
        ? adminRow.adminPicture
        : CS_FALLBACK.picture;

  const tel =
    pickTel([bridgeRow?.work_phone, bridgeRow?.direct_phone, profile?.phone, adminRow.adminTel]) ||
    CS_FALLBACK.tel;

  return { nickname, picture, tel };
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
      pay1,
      cartAll,
      keywordRes,
      svipRes,
      corpRes,
      profileRow,
    ] = await Promise.all([
      admin
        .from("tb_users")
        .select("userName, userLastName, userEmail, userPicture, coID, adminIDSale, adminIDCS")
        .eq("userID", uid)
        .maybeSingle<{
          userName: string | null;
          userLastName: string | null;
          userEmail: string | null;
          userPicture: string | null;
          coID: string | null;
          adminIDSale: string | null;
          adminIDCS: string | null;
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
      // tb_payment awaiting processing (paystatus=1) — the ฝากชำระ slice of
      // countPaymentDue. (countPayment above counts ALL payment rows.)
      admin
        .from("tb_payment")
        .select("*", { count: "exact", head: true })
        .eq("userid", uid)
        .eq("paystatus", "1"),
      admin.from("tb_cart").select("*", { count: "exact", head: true }).eq("userid", uid),
      admin
        .from("tb_keyword_product")
        .select("keyword")
        .order("id", { ascending: false })
        .limit(20),  // Sprint-8b: cap legacy keyword strip at 20 (was unbounded — full table scan + serialise on every nav)
      admin.from("tb_rate_custom_cbm").select("*", { count: "exact", head: true }).eq("userid", uid),
      admin.from("tb_corporate").select("*", { count: "exact", head: true }).eq("userid", uid),
      // The customer's uploaded avatar (profiles.avatar_url · keyed by
      // member_code = the PR code). The customer uploads it via
      // actions/profile-avatar.ts → this column; the sidebar user-pill should
      // show it instead of the static placeholder (owner 2026-06-05).
      admin.from("profiles").select("avatar_url").eq("member_code", uid).maybeSingle<{ avatar_url: string | null }>(),
    ]);

    // Sales + CS resolve in parallel (independent lookups).
    const [sales, cs] = await Promise.all([
      resolveSalesRep(admin, userRow.data?.adminIDSale ?? null),
      resolveCsRep(admin, userRow.data?.adminIDCS ?? null),
    ]);
    const keywordRows = (keywordRes.data ?? []) as { keyword: string | null }[];

    return {
      userID: uid,
      userName: userRow.data?.userName ?? "",
      userLastName: userRow.data?.userLastName ?? "",
      userEmail: (userRow.data?.userEmail ?? "").toLowerCase(),
      userPicture:
        profileRow.data?.avatar_url && profileRow.data.avatar_url.trim()
          ? profileRow.data.avatar_url
          : PCS_DEFAULT_AVATAR,
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
      countPaymentDue:
        (ho2.count ?? 0) + (fwd5.count ?? 0) + (pay1.count ?? 0),
      countCart: cartAll.count ?? 0,
      keywords: keywordRows.map((r) => r.keyword ?? "").filter((k) => k !== ""),
      sales,
      cs,
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
