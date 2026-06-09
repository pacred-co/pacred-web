import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Wallet } from "lucide-react";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { legacyMemberUrl } from "@/lib/legacy-image";
import { PaymentDueList, type PaymentDueItem } from "./payment-due-list";
import type { ForwarderRow } from "../service-import/forwarder-row-view";

/**
 * รายการที่ต้องชำระ — a cross-service "items awaiting payment" aggregator
 * (ปอน 2026-05-30). NEW Pacred screen (no legacy 1:1 counterpart): it pulls
 * every payment-due item the customer has across services into ONE list,
 * split by service tabs, defaulting to ทั้งหมด — visually modelled on the
 * /service-order list.
 *
 * "ต้องชำระ" per service (same status filters the sidebar badges + each
 * service page already use — see lib/legacy/pcs-chrome.ts):
 *   - ฝากสั่งซื้อ (order)   → tb_header_order  hstatus = "2" (รอชำระเงิน)
 *   - นำเข้า (import)       → tb_forwarder     fstatus = "5" (รอชำระเงิน)
 *   - ฝากชำระ (payment)     → tb_payment       paystatus = "1" (รอดำเนินการ)
 *   - ส่งออก / พิธีการศุลกากร → no backing data yet → empty tabs (client-side)
 *
 * `tb_*` is RLS-locked to service_role, so reads go through the admin client;
 * the join key is `tb_*.userid === profile.member_code` (the "PR<n>" code).
 * Each row is normalised to a serialisable `PaymentDueItem`; tab filtering is
 * done CLIENT-side in <PaymentDueList> (instant switching).
 *
 * The CTA per item points at the existing pay/detail flow on the owning
 * service (order → its detail `?pay=true`; import → the รอชำระ filter where
 * the pay-bar lives; payment → its detail) — no payment logic is reproduced
 * here, this screen only routes the customer to it.
 */

// Reads cookies/auth under the (protected) layout → must be dynamic.
export const dynamic = "force-dynamic";

// dd/mm/yyyy — matches the /service-order list's fmtRelative output.
function fmtDate(s: string | null): string {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Epoch ms for sorting the merged list newest-first (transient, not sent down).
function parseTs(s: string | null): number {
  if (!s) return 0;
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// Resolve a tb_* cover image (order hcover / forwarder fcover — both stored
// under the legacy images/shops/ folder) to a thumbnail URL, same as the
// /service-order card: full OSS/Taobao URLs are cleaned + sized to 150x150;
// bare filenames resolve to the scrub-safe Supabase mirror (legacyMemberUrl —
// NEVER pcscargo.co.th). Empty/"-" → null so the card falls back to the
// service icon instead of a broken/placeholder image.
function resolveCover(
  cover: string | null,
  service: "order" | "import",
): string | null {
  const c = (cover ?? "").trim();
  if (c === "" || c === "-") return null;
  // Full URL / path (Taobao·1688 OSS, or already-absolute). Clean the OSS
  // style params + size down to a 150px thumbnail; pcscargo URLs pass through.
  if (c.includes("/")) {
    const cleaned = c
      .replace("?x-oss-process=style/alsy", "")
      .replace("?x-oss-process=style/tbsy", "")
      .replace("_250x250.jpg", "");
    if (/pcscargo\.co\.th/i.test(cleaned)) return cleaned;
    return cleaned + "_150x150.jpg";
  }
  // Bare filename. Forwarder (import) admin-uploaded covers live ONLY on the
  // legacy host — they were NOT in ภูม's 2026-05-24 Supabase mirror (verified
  // 2026-05-30: the mirror 400s for these, pcscargo.co.th/member/images/shops/
  // 200s) — and the live /service-import list already resolves them this exact
  // way (convertIMGCHN). Order covers WERE mirrored, so they use the scrub-safe
  // Supabase mirror (same as the /service-order card). The card's onError still
  // falls back to the service icon if any image 404s.
  // TODO: flip import → legacyMemberUrl once forwarder covers are mirrored.
  if (service === "import") {
    return `https://pcscargo.co.th/member/images/shops/${c}`;
  }
  return legacyMemberUrl(`images/shops/${c}`);
}

export default async function PaymentDuePage() {
  const t = await getTranslations("paymentDuePage");
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const userID = profile.member_code ?? "";

  // Pull the payment-due slice of each service in parallel.
  const [orderRes, importRes, paymentRes] = await Promise.all([
    admin
      .from("tb_header_order")
      .select(
        "hno, hcover, hdate, htitle, hcount, htotalpricechn, hrate, hshippingchn, hshippingservice",
      )
      .eq("userid", userID)
      .eq("hstatus", "2"),
    admin
      .from("tb_forwarder")
      // Full ForwarderRow column set (same as the /service-import list,
      // page.tsx L253) so the in-place <ForwarderPayModal> can compute the
      // bill + QR without navigating away.
      .select(
        "id, fdate, fstatus, ftrackingchn, ftrackingchn2, ftrackingth, ftransporttype, fshipby, fdetail, fcover, famount, fweight, fvolume, ftotalprice, ftransportprice, fpriceupdate, fdiscount, fshippingservice, pricecrate, ftransportpricechnthb, priceother, fusercompany, fcredit, fcreditdate, fdatestatus5, fdatetothai, fcabinetnumber, fdatecontainerclose, fnote, fnoteuser, reforder, adminidcreator, fproductstype",
      )
      .eq("userid", userID)
      .eq("fstatus", "5"),
    admin
      .from("tb_payment")
      .select("id, paydate, paydetail, paythb")
      .eq("userid", userID)
      .eq("paystatus", "1"),
  ]);

  if (orderRes.error)
    console.error(`[payment-due] tb_header_order failed`, orderRes.error.message);
  if (importRes.error)
    console.error(`[payment-due] tb_forwarder failed`, importRes.error.message);
  if (paymentRes.error)
    console.error(`[payment-due] tb_payment failed`, paymentRes.error.message);

  // Normalise each service into the unified shape (+ a transient sort ts).
  const withTs: { ts: number; item: PaymentDueItem }[] = [];

  for (const r of (orderRes.data ?? []) as Record<string, unknown>[]) {
    const hno = String(r.hno ?? "");
    const amount =
      (Number(r.htotalpricechn ?? 0) + Number(r.hshippingchn ?? 0)) *
        Number(r.hrate ?? 0) +
      Number(r.hshippingservice ?? 0);
    const count = Number(r.hcount ?? 0);
    const title =
      String(r.htitle ?? "") +
      (count > 1 ? t("orderTitleSuffix", { count: Math.round(count - 1) }) : "");
    withTs.push({
      ts: parseTs(r.hdate as string | null),
      item: {
        service: "order",
        key: `order-${hno}`,
        ref: hno,
        refHref: `/service-order/${hno}`,
        imageUrl: resolveCover(r.hcover as string | null, "order"),
        title,
        dateText: fmtDate(r.hdate as string | null),
        amountThb: amount,
        statusLabel: "รอชำระเงิน",
        ctaLabel: "ชำระเงิน",
        ctaHref: `/service-order/${hno}?pay=true`,
      },
    });
  }

  for (const r of (importRes.data ?? []) as Record<string, unknown>[]) {
    const id = Number(r.id);
    const detail = String(r.fdetail ?? "").trim();
    // Build the full ForwarderRow (same field mapping as the /service-import
    // list, page.tsx L302-336) so the card can open <ForwarderPayModal>
    // in-place — QR + slip + submit for THIS item without leaving the page.
    // promoid is display-only (promo strip) → null here.
    const forwarderRow: ForwarderRow = {
      id,
      fdate: (r.fdate as string) ?? null,
      fstatus: (r.fstatus as string) ?? null,
      ftrackingchn: (r.ftrackingchn as string) ?? null,
      ftrackingchn2: (r.ftrackingchn2 as string) ?? null,
      ftrackingth: (r.ftrackingth as string) ?? null,
      ftransporttype: (r.ftransporttype as string) ?? null,
      fshipby: (r.fshipby as string) ?? null,
      fdetail: (r.fdetail as string) ?? null,
      fcover: (r.fcover as string) ?? null,
      famount: Number(r.famount ?? 0),
      fweight: Number(r.fweight ?? 0),
      fvolume: Number(r.fvolume ?? 0),
      ftotalprice: Number(r.ftotalprice ?? 0),
      ftransportprice: Number(r.ftransportprice ?? 0),
      fpriceupdate: Number(r.fpriceupdate ?? 0),
      fdiscount: Number(r.fdiscount ?? 0),
      fshippingservice: Number(r.fshippingservice ?? 0),
      pricecrate: Number(r.pricecrate ?? 0),
      ftransportpricechnthb: Number(r.ftransportpricechnthb ?? 0),
      priceother: Number(r.priceother ?? 0),
      fusercompany: (r.fusercompany as string) ?? null,
      fcredit: (r.fcredit as string) ?? null,
      fcreditdate: (r.fcreditdate as string) ?? null,
      fdatestatus5: (r.fdatestatus5 as string) ?? null,
      fdatetothai: (r.fdatetothai as string) ?? null,
      fcabinetnumber: (r.fcabinetnumber as string) ?? null,
      fdatecontainerclose: (r.fdatecontainerclose as string) ?? null,
      fnote: (r.fnote as string) ?? null,
      fnoteuser: (r.fnoteuser as string) ?? null,
      reforder: (r.reforder as string) ?? null,
      adminidcreator: (r.adminidcreator as string) ?? null,
      promoid: null,
      fproductstype: (r.fproductstype as string) ?? null,
    };
    withTs.push({
      ts: parseTs(r.fdate as string | null),
      item: {
        service: "import",
        key: `import-${id}`,
        ref: `#${id}`,
        refHref: `/service-import?q=5`,
        imageUrl: resolveCover(r.fcover as string | null, "import"),
        // Some legacy rows store a bare "-" / "" as fdetail — show a clean
        // generic label instead of a lone dash.
        title: detail && detail !== "-" ? detail : t("importFallbackTitle"),
        dateText: fmtDate(r.fdate as string | null),
        amountThb: Number(r.ftotalprice ?? 0),
        statusLabel: "รอชำระเงิน",
        ctaLabel: "ชำระเงิน",
        ctaHref: `/service-import?q=5`,
        forwarderRow,
        isJuristic: (r.fusercompany as string) === "1",
      },
    });
  }

  for (const r of (paymentRes.data ?? []) as Record<string, unknown>[]) {
    const id = Number(r.id);
    const detail = String(r.paydetail ?? "").trim();
    withTs.push({
      ts: parseTs(r.paydate as string | null),
      item: {
        service: "payment",
        key: `payment-${id}`,
        ref: `#${id}`,
        refHref: `/service-payment/${id}`,
        imageUrl: null,
        title: detail && detail !== "-" ? detail : t("paymentFallbackTitle"),
        dateText: fmtDate(r.paydate as string | null),
        amountThb: Number(r.paythb ?? 0),
        statusLabel: "รอดำเนินการ",
        ctaLabel: "ดูรายละเอียด",
        ctaHref: `/service-payment/${id}`,
      },
    });
  }

  // Merge newest-first across services.
  withTs.sort((a, b) => b.ts - a.ts);
  const items: PaymentDueItem[] = withTs.map((w) => w.item);

  return (
    <>
      <title>{`${t("pageTitle")} | Pacred`}</title>

      <div className="pcs-content-pad w-full px-3 md:px-6 pt-4 pb-24 md:py-6">
        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-2 text-[11px] text-muted mb-2">
          <Link
            href="/dashboard"
            className="hover:text-foreground transition-colors"
          >
            {t("breadcrumbHome")}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{t("heading")}</span>
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <p
            className="flex items-center gap-2 text-[16px] md:text-[26px] font-black tracking-tight text-foreground min-w-0"
            role="heading"
            aria-level={1}
          >
            <span className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-md shadow-primary-600/25 shrink-0">
              <Wallet className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2} />
            </span>
            {t("heading")}
          </p>
          {items.length > 0 && (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[12px] md:text-[13px] font-bold px-3 py-1.5">
              {t("pendingCount", { count: items.length })}
            </span>
          )}
        </div>

        <PaymentDueList items={items} />
      </div>
    </>
  );
}
