import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CircleDollarSign, Plus, Inbox } from "lucide-react";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Explain } from "@/components/ui/tooltip";

/**
 * Customer ฝากชำระ / โอนหยวน screen — the customer ฝากโอนหยวน list,
 * ported from the legacy PCS Cargo `member/payment.php` default branch
 * (D1 / ADR-0017 · faithful-port workstream).
 *
 * ── Tailwind rebuild (2026-05-30 · ปอน) ──
 * The page's WORKFLOW is the legacy payment.php list (same data fields,
 * same `?q=` status filter, same "เพิ่มรายการ" → /service-payment/add,
 * same per-row "ดูรายละเอียด" → /service-payment/[id]); the CHROME is now
 * our own Tailwind, mobile-first design (per AGENTS.md §0a — "we copy the
 * working system, polish the look ourselves"). Same approach already
 * shipped on /service-import: list = responsive cards on phone, table on
 * desktop. NO data / relation / query / href changed — pure presentation.
 * `.pcs-legacy` + payment.css are kept for any layout-scope globals; the
 * Bootstrap-4 markup + #myTable DataTables grid are gone.
 *
 * Data — every `payment.php` mysqli query transcribed 1:1 to the ported
 * legacy `tb_*` schema (Supabase). `tb_*` is RLS-locked to service_role,
 * so reads go through the admin client; the join key is
 * `tb_*.userid === profile.member_code` (the customer's "PR<n>" code).
 *   - juristic check  → tb_corporate.corporatestatus  (payment.php L258)
 *   - used-forwarder  → tb_forwarder WHERE fstatus>5   (payment.php L264)
 *   - used-shop       → tb_header_order WHERE hstatus>3 AND <>6 (L270)
 *   - status counts   → tb_payment.paystatus           (payment.php L313)
 *   - the list rows   → tb_payment                     (payment.php L379)
 *
 * The `?q=` URL filter (all / 1 / 2 / 3 → the four status tabs) is the
 * legacy `$_GET['q']` (L380-390) — exposed here as `searchParams`.
 * Rebrand DONE: legacy `PCS<n>` member codes + "PCS Cargo" brand → `PR<n>`.
 *
 * ── NOT reproduced (deliberate · flagged for the integrator) ──
 *  1. payment.php L4-215 POST handler (image→webp + INSERT tb_wallet_hs +
 *     INSERT tb_payment) — a Server Component render is a PURE READ.
 *  2. header.php L75-85 auto-expire UPDATE — render-time write, not reproduced.
 *  3. F2 (2026-05-29): the in-page #add-payment modal was removed; the real
 *     create form lives at `/service-payment/add` (YuanPaymentForm +
 *     createYuanPayment) and "เพิ่มรายการ" links straight there.
 *
 * The legacy `?page=detail&id=X` branch is the separate `/service-payment/[id]` route.
 */

// Server Components reading cookies/auth under a layout must be dynamic.
export const dynamic = "force-dynamic";

// payment.php L379 — the four status-filter tabs. payStatus enum:
// 1=รอดำเนินการ 2=สำเร็จ 3=ไม่สำเร็จ.
type PayQ = "1" | "2" | "3";

// payment.php L396-399 — the payType pill (วิธีการชำระ column). Tailwind rebuild.
function payTypeBadge(payType: string | null, t: (key: string) => string) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium border";
  switch (payType) {
    case "1":
      return (
        <span className={`${base} bg-blue-50 text-blue-700 border-blue-200`}>
          {t("payTypeWebsite")}
        </span>
      );
    case "2":
      return (
        <span className={`${base} bg-sky-50 text-sky-700 border-sky-200`}>
          {t("payTypeAlipayShop")}
        </span>
      );
    case "3":
      return (
        <span className={`${base} bg-slate-100 text-slate-600 border-slate-200`}>
          {t("payTypeOther")}
        </span>
      );
    default:
      return null;
  }
}

// payment.php L400-404 — the payStatus pill (สถานะ column). Tailwind rebuild
// with clean semantic colours (รอ=amber · สำเร็จ=emerald · ไม่สำเร็จ=red).
function payStatusBadge(payStatus: string | null, t: (key: string) => string) {
  const base =
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border";
  switch (payStatus) {
    case "1":
      return (
        <span className={`${base} bg-amber-50 text-amber-700 border-amber-200`}>
          {t("statusPending")}
        </span>
      );
    case "2":
      return (
        <span className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200`}>
          {t("statusSuccess")}
        </span>
      );
    case "3":
      return (
        <span className={`${base} bg-red-50 text-red-700 border-red-200`}>
          {t("statusFailed")}
        </span>
      );
    default:
      return null;
  }
}

// Legacy `numberLimit($limit)` — member/include/function.php L10-13. Caps at "99+".
function numberLimit(limit: number): string {
  return limit > 99 ? "99+" : String(limit);
}

// Legacy `countText($text,$num)` — member/include/function.php L14-24.
// UTF-8-aware truncate to `num` characters with a trailing "...".
function countText(text: string | null, num: number): string {
  const s = text ?? "";
  const chars = Array.from(s); // Array.from counts code points (UTF-8 safe)
  if (chars.length >= num) {
    return chars.slice(0, num).join("") + "...";
  }
  return s;
}

// PHP `number_format($n, 2)` — 2 decimals, comma thousands separator.
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// payment.php L408/L410 — DATE(payDate) + TIME(payDate). Legacy MySQL
// renders DATE() as "YYYY-MM-DD" and TIME() as "HH:MM:SS".
function splitDateTime(strDate: string | null): { date: string; time: string } {
  if (!strDate) return { date: "", time: "" };
  const d = new Date(strDate.replace(" ", "T"));
  if (isNaN(d.getTime())) {
    // Fall back to a raw split if it is already "YYYY-MM-DD HH:MM:SS".
    const [date = "", time = ""] = strDate.split(" ");
    return { date, time };
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}:${ss}` };
}

// A single tb_payment row as payment.php L406-430 renders it.
type PaymentRow = {
  ID: number;
  payDate: string | null;
  payStatus: string | null;
  payType: string | null;
  payDetail: string | null;
  payTHB: number;
};

export default async function ServicePaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("payment");

  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const memberCode = profile.member_code ?? "";

  // payment.php L380-390 — sanitise `?q=` exactly like the legacy
  // preg_replace, then keep only the recognised "1"/"2"/"3" values.
  const rawQ = (sp.q ?? "").replace(/[^a-z\d]/gi, "");
  const q: PayQ | null =
    rawQ === "1" || rawQ === "2" || rawQ === "3" ? (rawQ as PayQ) : null;

  // ── Transcribed queries ──────────────────────────────────────
  // payment.php L258: SELECT ID FROM tb_corporate WHERE userID=…
  //                   AND corporateStatus=1
  // payment.php L264: SELECT ID FROM tb_forwarder WHERE userID=…
  //                   AND fStatus>5
  // payment.php L270: SELECT ID FROM tb_header_order WHERE userID=…
  //                   AND hStatus>3 AND hStatus<>6
  // payment.php L313: SELECT payStatus FROM tb_payment WHERE userID=…
  const [
    corporateRes,
    forwarderRes,
    headerOrderRes,
    payCountRes,
  ] = await Promise.all([
    admin
      .from("tb_corporate")
      .select("id")
      .eq("userid", memberCode)
      .eq("corporatestatus", "1"),
    // legacy `fStatus>5` — fstatus is a 1-char string ('1'..'7') in the
    // ported schema; MySQL coerced the varchar for `>5`, and for
    // single-digit strings lexical order == numeric order, so `.gt('5')`
    // is the faithful 1:1 (selects fstatus '6' or '7').
    admin
      .from("tb_forwarder")
      .select("id")
      .eq("userid", memberCode)
      .gt("fstatus", "5"),
    admin
      .from("tb_header_order")
      .select("id, hstatus")
      .eq("userid", memberCode),
    admin
      .from("tb_payment")
      .select("paystatus")
      .eq("userid", memberCode),
  ]);

  // payment.php L256-276 — the gate logic.
  //  $statusCheckJuristic = 1 only when the customer has NO active
  //  tb_corporate row; otherwise the "นิติบุคคล pending" block shows.
  const statusCheckJuristic = (corporateRes.data?.length ?? 0) === 0;

  //  legacy `hStatus>3 AND hStatus<>6` — hstatus is stored as a 1-char
  //  string in the ported schema; compare numerically. (>3 and <>6 =
  //  hstatus 4 or 5.)
  const usedShop = (headerOrderRes.data ?? []).some((r) => {
    const h = Number(r.hstatus);
    return h > 3 && h !== 6;
  });
  //  legacy `fStatus>5` — fstatus 6 or 7.
  const usedForwarder = (forwarderRes.data?.length ?? 0) > 0;

  //  payment.php L276 — `if(!$usedShop || !$usedForwarder)` shows the
  //  never-paid block; the list shows only when BOTH are true.
  const showNeverPaidBlock = !usedShop || !usedForwarder;

  // payment.php L309-326 — tally the payStatus counts for the tab badges.
  let countStatusAll = 0;
  let countStatusF1 = 0;
  let countStatusF2 = 0;
  let countStatusF3 = 0;
  for (const r of payCountRes.data ?? []) {
    const ps = (r as { paystatus: string | null }).paystatus;
    if (ps === "1") countStatusF1++;
    else if (ps === "2") countStatusF2++;
    else if (ps === "3") countStatusF3++;
    countStatusAll++;
  }

  // payment.php L378-391 — the list query. Built only when the list
  // view will render (statusCheckJuristic && !showNeverPaidBlock).
  let rows: PaymentRow[] = [];
  if (statusCheckJuristic && !showNeverPaidBlock) {
    let listQuery = admin
      .from("tb_payment")
      .select("id, paydate, paystatus, paytype, paydetail, paythb")
      .eq("userid", memberCode);
    // payment.php L382-387 — when ?q is set, also filter by payStatus.
    if (q) listQuery = listQuery.eq("paystatus", q);
    const { data: listData, error: listDataErr } = await listQuery;
    if (listDataErr) {
      console.error(`[tb_payment list] failed`, { code: listDataErr.code, message: listDataErr.message });
    }
    rows = (
      (listData ?? []) as {
        id: number;
        paydate: string | null;
        paystatus: string | null;
        paytype: string | null;
        paydetail: string | null;
        paythb: number | string | null;
      }[]
    ).map((r) => ({
      ID: r.id,
      payDate: r.paydate,
      payStatus: r.paystatus,
      payType: r.paytype,
      payDetail: r.paydetail,
      payTHB: Number(r.paythb ?? 0),
    }));
    // legacy DataTables default order [[0,'desc']] = newest first.
    rows.sort((a, b) => {
      const ta = a.payDate ? new Date(a.payDate.replace(" ", "T")).getTime() : 0;
      const tb = b.payDate ? new Date(b.payDate.replace(" ", "T")).getTime() : 0;
      return tb - ta;
    });
  }

  // Status-filter chips (payment.php L330-362 tabs → Tailwind pills). Same
  // hrefs + counts as the legacy nav-tabs; active = solid red.
  const statusChips: {
    href: string;
    label: string;
    count: number;
    active: boolean;
    chip: string;
  }[] = [
    { href: "/service-payment",      label: t("filterAll"),      count: countStatusAll, active: q === null, chip: "bg-slate-100 text-slate-700" },
    { href: "/service-payment?q=1",  label: t("statusPending"),  count: countStatusF1,  active: q === "1",  chip: "bg-amber-100 text-amber-700" },
    { href: "/service-payment?q=2",  label: t("statusSuccess"),  count: countStatusF2,  active: q === "2",  chip: "bg-emerald-100 text-emerald-700" },
    { href: "/service-payment?q=3",  label: t("statusFailed"),   count: countStatusF3,  active: q === "3",  chip: "bg-red-100 text-red-700" },
  ];

  return (
    <div className="pcs-legacy">
      {/* Legacy PCS theme CSS — kept for layout-scope globals (.pcs-content-pad
          padding etc.). The visible surface below is Tailwind. */}
      <link rel="stylesheet" href="/legacy/pcs/payment.css" />

      {/* payment.php <title> L217 (Next.js owns <head>):  รายการฝากชำระเงิน | Pacred */}

      <div className="pcs-content-pad w-full px-3 md:px-6 pt-3 pb-24 md:py-6">
        {!statusCheckJuristic ? (
          /* payment.php L448-451 — active tb_corporate row → awaiting approval. */
          <div className="mx-auto max-w-[640px] mt-8 md:mt-12 text-center">
            <h2 className="rounded-2xl bg-red-600 text-white px-4 py-4 text-sm md:text-base font-bold leading-relaxed shadow-sm">
              {t("juristicPending")}
              <br />
              <span className="text-sm font-normal opacity-90">
                {t("juristicPendingNote")}
              </span>
            </h2>
          </div>
        ) : showNeverPaidBlock ? (
          /* payment.php L278-280 — never used ฝากสั่งซื้อ / ฝากนำเข้า before. */
          <div className="mx-auto max-w-[600px] mt-8 md:mt-12 text-center">
            <h2 className="rounded-2xl bg-red-600 text-white px-4 py-4 text-sm md:text-base font-bold leading-relaxed shadow-sm">
              {t("neverPaidLine1")}
              <br />
              {t("neverPaidLine2")}
              <br />
              <span className="mt-2 inline-block text-sm font-normal opacity-90">
                {t("neverPaidNote")}
              </span>
            </h2>
          </div>
        ) : (
          /* payment.php L284-444 — the list view. */
          <section className="bg-white dark:bg-surface border border-border rounded-2xl shadow-sm overflow-hidden">
            {/* ── Header: title + เพิ่มรายการ CTA ── */}
            <div className="flex flex-col gap-2.5 border-b border-border px-3 py-3 md:flex-row md:items-center md:justify-between md:px-5 md:py-4">
              <h1 className="flex items-center gap-2 text-base md:text-xl font-bold text-foreground">
                <CircleDollarSign className="h-5 w-5 md:h-6 md:w-6 shrink-0 text-primary-600" />
                <Explain
                  label={<span>{t("listTitle")}</span>}
                  def="ฝากโอนหยวน = ให้ Pacred โอนเงินหยวนจ่ายร้าน/คู่ค้าจีนแทนคุณ — คุณกรอกยอดหยวน ระบบคิดเป็นบาทตามเรท แล้วแนบสลิปโอนให้บริษัท"
                />
              </h1>
              <Link
                href="/service-payment/add"
                className="self-start md:self-auto shrink-0 inline-flex items-center gap-2 rounded-full bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 py-2 pl-2 pr-4 text-sm font-semibold text-white shadow-sm transition-colors"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/25">
                  <Plus className="h-4 w-4" />
                </span>
                {t("addItem")}
              </Link>
            </div>

            {/* ── Status filter chips ── */}
            <div className="px-3 py-3 md:px-5 md:py-4">
              <h2 className="mb-2.5 text-sm md:text-base font-bold text-foreground">
                <Explain
                  label={t("statusSection")}
                  def="สถานะการชำระ — รอดำเนินการ = ทีมงานกำลังตรวจสลิป · สำเร็จ = โอนให้คู่ค้าจีนเรียบร้อย · ไม่สำเร็จ = มีปัญหา ติดต่อทีมงาน · กดที่ป้ายเพื่อกรอง"
                />
              </h2>
              <div className="flex flex-wrap gap-2">
                {statusChips.map((chip) => (
                  <Link
                    key={chip.href}
                    href={chip.href}
                    aria-current={chip.active ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${
                      chip.active
                        ? "border-red-600 bg-red-600 text-white shadow-sm"
                        : "border-border bg-surface-alt/60 text-foreground hover:bg-surface-alt"
                    }`}
                  >
                    <span>{chip.label}</span>
                    {chip.count > 0 && (
                      <span
                        className={`inline-flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                          chip.active ? "bg-white/25 text-white" : chip.chip
                        }`}
                      >
                        {numberLimit(chip.count)}
                      </span>
                    )}
                  </Link>
                ))}
              </div>

              <hr className="my-3 border-t border-dashed border-border" />

              {/* ── Empty state ── */}
              {rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Inbox className="h-10 w-10 text-muted/50" />
                  <p className="text-sm text-muted">{t("emptyState")}</p>
                  <Link
                    href="/service-payment/add"
                    className="mt-1 text-sm font-semibold text-emerald-600 hover:underline"
                  >
                    {t("addFirstItem")}
                  </Link>
                </div>
              ) : (
                <>
                  {/* ── Mobile: stacked cards (≥1 col, no horizontal scroll) ── */}
                  <div className="space-y-3 md:hidden">
                    {rows.map((row) => {
                      const { date, time } = splitDateTime(row.payDate);
                      return (
                        <div
                          key={row.ID}
                          className="rounded-xl border border-border bg-white dark:bg-surface p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-xs text-muted">
                              {t("orderNo", { id: row.ID })}
                            </span>
                            {payStatusBadge(row.payStatus, t)}
                          </div>
                          {row.payDetail && (
                            <p
                              className="mt-1.5 text-sm text-foreground line-clamp-2"
                              title={row.payDetail}
                            >
                              {countText(row.payDetail, 120)}
                            </p>
                          )}
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span>{payTypeBadge(row.payType, t)}</span>
                            <span className="font-mono text-sm font-bold text-red-600">
                              -{numberFormat2(row.payTHB)} ฿
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
                            <span className="text-[11px] text-muted">
                              {date} {time && `· ${time} ${t("timeSuffix")}`}
                            </span>
                            <Link
                              href={`/service-payment/${row.ID}`}
                              className="rounded-full border border-emerald-500 px-3 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                            >
                              {t("viewDetail")}
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Desktop: table ── */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-4 py-3 font-medium">{t("colCreatedDate")}</th>
                          <th className="px-4 py-3 font-medium">{t("colOrderNo")}</th>
                          <th className="px-4 py-3 font-medium">{t("colDetail")}</th>
                          <th className="px-4 py-3 font-medium">
                            <Explain
                              label={t("colPayMethod")}
                              def="วิธีการชำระ = ช่องทางที่คุณส่งคำสั่งโอน (ผ่านเว็บไซต์ / Alipay หน้าร้าน / อื่นๆ)"
                            />
                          </th>
                          <th className="px-4 py-3 text-right font-medium">{t("colTotalBaht")}</th>
                          <th className="px-4 py-3 text-center font-medium">
                            <Explain
                              align="right"
                              label={t("colStatusHead")}
                              def="สถานะ — รอดำเนินการ = กำลังตรวจ · สำเร็จ = โอนให้คู่ค้าจีนแล้ว · ไม่สำเร็จ = มีปัญหา ติดต่อทีมงาน"
                            />
                          </th>
                          <th className="px-4 py-3 text-center font-medium">{t("colOptions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const { date, time } = splitDateTime(row.payDate);
                          return (
                            <tr
                              key={row.ID}
                              className="border-t border-border align-top hover:bg-surface-alt/30"
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-muted">
                                {date}
                                <br />
                                {time && `${time} ${t("timeSuffix")}`}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">{row.ID}</td>
                              <td
                                className="px-4 py-3 max-w-[280px] text-xs"
                                title={row.payDetail ?? ""}
                              >
                                {countText(row.payDetail, 120)}
                              </td>
                              <td className="px-4 py-3">{payTypeBadge(row.payType, t)}</td>
                              <td className="px-4 py-3 text-right font-mono font-bold text-red-600">
                                -{numberFormat2(row.payTHB)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {payStatusBadge(row.payStatus, t)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Link
                                  href={`/service-payment/${row.ID}`}
                                  className="inline-block rounded-full border border-emerald-500 px-3 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                                >
                                  {t("viewDetail")}
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
