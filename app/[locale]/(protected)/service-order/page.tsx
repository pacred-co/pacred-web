import { redirect } from "next/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { legacyMemberUrl } from "@/lib/legacy-image";
import {
  ShoppingBag,
  Plus,
  Search,
  Calendar,
  Receipt,
  FileText,
  XCircle,
  CheckCircle2,
  Eye,
} from "lucide-react";

/**
 * รายการฝากสั่งซื้อสินค้า — Tailwind-rebuilt version (ปอน 2026-05-26).
 *
 * Replaces the legacy 1:1 PCS Cargo Bootstrap-4 transcription with a clean
 * Tailwind/Pacred-branded layout. All data queries against the ported
 * legacy `tb_*` schema and the Thai labels are preserved verbatim. The
 * unwired jQuery interactions (DataTables sort/responsive/checkboxes,
 * AJAX cancel/pay endpoints) are NOT reproduced — same as the previous
 * version. The "bulk cancel" + "ชำระเงิน multi-select" buttons render as
 * static UI placeholders pending the matching Server Actions.
 *
 * Data — every `shops.php` mysqli query (transcribed in the previous
 * iteration) is preserved 1:1. RLS-locked tables read through the admin
 * client, join key `tb_*.userid === profile.member_code`.
 */

export const dynamic = "force-dynamic";

// ── Status badge palette — Pacred-themed Tailwind tints (replaces the
// legacy Bootstrap badge-* classes). Each entry maps a `hstatus` value
// to a label + Tailwind chip styles.
const SHOP_STATUS: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  "1": { label: "รอดำเนินการ",     cls: "bg-amber-100 text-amber-700 border-amber-200",    dot: "bg-amber-500"   },
  "2": { label: "รอชำระเงิน",      cls: "bg-rose-100 text-rose-700 border-rose-200",       dot: "bg-rose-500"    },
  "3": { label: "สั่งสินค้า",      cls: "bg-sky-100 text-sky-700 border-sky-200",          dot: "bg-sky-500"     },
  "4": { label: "รอร้านจีนจัดส่ง",  cls: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-500"    },
  "5": { label: "สำเร็จ",          cls: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  "6": { label: "ยกเลิกออเดอร์",   cls: "bg-neutral-200 text-neutral-600 border-neutral-300", dot: "bg-neutral-500" },
};

function StatusBadge({ hStatus }: { hStatus: string }) {
  const s = SHOP_STATUS[hStatus];
  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-bold border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

// ── Date helpers (preserved from the legacy transcription, MySQL formats).
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function parseDT(s: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6]),
  );
}
function fmtDMYHMS(s: string | null): string {
  const d = parseDT(s);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtRelative(s: string | null): string {
  const d = parseDT(s);
  if (!d) return "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function numberLimit(limit: number): string {
  return limit > 99 ? "99+" : String(limit);
}

type HeaderOrderRow = {
  hno: string;
  hstatus: string;
  hdate: string | null;
  hdatepayment: string | null;
  hcover: string | null;
  htitle: string | null;
  hcount: number | null;
  htotalpricechn: number | null;
  hrate: number | null;
  hshippingchn: number | null;
  hshippingservice: number | null;
  hnoteuser: string | null;
  hnote: string | null;
};

// 7-tab definition for the status filter strip.
type Tab = { key: string; label: string; activeCls: string };
const TABS: readonly Tab[] = [
  { key: "",  label: "ทั้งหมด",        activeCls: "bg-primary-600 text-white border-primary-600" },
  { key: "1", label: "รอดำเนินการ",     activeCls: "bg-amber-500 text-white border-amber-500"     },
  { key: "2", label: "รอชำระเงิน",      activeCls: "bg-rose-600 text-white border-rose-600"       },
  { key: "3", label: "สั่งสินค้า",      activeCls: "bg-sky-600 text-white border-sky-600"         },
  { key: "4", label: "รอร้านจีนจัดส่ง",  activeCls: "bg-blue-600 text-white border-blue-600"       },
  { key: "5", label: "สำเร็จ",          activeCls: "bg-emerald-600 text-white border-emerald-600" },
  { key: "6", label: "ยกเลิกออเดอร์",   activeCls: "bg-neutral-600 text-white border-neutral-600" },
] as const;

export default async function ServiceOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; hNo?: string }>;
}) {
  const data = await getCurrentUserWithProfile();
  if (!data?.profile) redirect("/complete-profile");
  const { profile } = data;

  const admin = createAdminClient();
  const userID = profile.member_code ?? "";

  const sp = await searchParams;
  const q = (sp.q ?? "").replace(/[^a-z\d]/gi, "");
  const hNoAnchor = sp.hNo ?? "";

  // ── shops.php L756-758 — juristic-pending gate.
  const { data: corpRows } = await admin
    .from("tb_corporate")
    .select("id")
    .eq("userid", userID)
    .eq("corporatestatus", "1");
  const corporatePending = (corpRows?.length ?? 0) > 0;

  // ── shops.php L784-839 — 7 status counters.
  const countQuery = (status?: string) => {
    let qb = admin
      .from("tb_header_order")
      .select("id", { count: "exact", head: true })
      .eq("userid", userID);
    if (status) qb = qb.eq("hstatus", status);
    return qb;
  };
  const [cAll, cF1, cF2, cF3, cF4, cF5, cF6] = await Promise.all([
    countQuery(),
    countQuery("1"),
    countQuery("2"),
    countQuery("3"),
    countQuery("4"),
    countQuery("5"),
    countQuery("6"),
  ]);
  const counts: Record<string, number> = {
    "":  cAll.count ?? 0,
    "1": cF1.count  ?? 0,
    "2": cF2.count  ?? 0,
    "3": cF3.count  ?? 0,
    "4": cF4.count  ?? 0,
    "5": cF5.count  ?? 0,
    "6": cF6.count  ?? 0,
  };
  const countAll = counts[""];
  const countShops2 = counts["2"];

  // ── shops.php L902-917 — main list query.
  let listQuery = admin
    .from("tb_header_order")
    .select(
      "hno, hstatus, hdate, hdatepayment, hcover, htitle, hcount, htotalpricechn, hrate, hshippingchn, hshippingservice, hnoteuser, hnote",
    )
    .eq("userid", userID)
    .order("hdate", { ascending: false });
  if (["1", "2", "3", "4", "5", "6"].includes(q)) {
    listQuery = listQuery.eq("hstatus", q);
  }
  const { data: rowsData } = await listQuery;
  const rows: HeaderOrderRow[] = (rowsData ?? []) as HeaderOrderRow[];

  // ── shops.php L1095-1097 — promo badge lookup (one query for all rows).
  const orderHnos = rows.map((r) => r.hno);
  let promoMap = new Map<string, number>();
  if (orderHnos.length > 0) {
    const { data: promoRows } = await admin
      .from("tb_promotion")
      .select("promoid, hno")
      .in("hno", orderHnos);
    promoMap = new Map(
      (promoRows ?? []).map((p: { promoid: number; hno: string }) => [p.hno, p.promoid]),
    );
  }

  return (
    <>
      <title>รายการฝากสั่งซื้อสินค้า | Pacred</title>

      <div className="w-full px-3 md:px-6 md:pl-[280px] md:pr-[90px] pt-4 pb-24 md:py-6 max-w-[1280px] mx-auto">

        {/* ── Breadcrumb (above header row) ── */}
        <div className="flex items-center gap-2 text-[11px] text-muted mb-2">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">หน้าแรก</Link>
          <span>/</span>
          <span className="text-foreground font-medium">รายการฝากสั่งซื้อสินค้า</span>
        </div>

        {/* ── Header row — title (icon + text) + add CTA aligned on same line ── */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="flex items-center gap-2 text-[16px] md:text-[26px] font-black tracking-tight text-foreground whitespace-nowrap min-w-0" role="heading" aria-level={1}>
            <span className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-white flex items-center justify-center shadow-md shadow-primary-600/25 shrink-0">
              <ShoppingBag className="w-4 h-4 md:w-5 md:h-5" strokeWidth={2} />
            </span>
            รายการฝากสั่งซื้อสินค้า
          </p>
          <Link
            href="/cart/add"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[12.5px] md:text-[14px] font-bold px-3.5 md:px-4 py-2 md:py-2.5 shadow-lg shadow-primary-600/30 hover:shadow-primary-600/40 hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            สั่งสินค้าเพิ่ม
          </Link>
        </div>

        {corporatePending ? (
          /* shops.php L1090 — juristic-pending gate. */
          <div className="rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 text-white px-6 py-8 text-center shadow-md max-w-[670px] mx-auto mt-10">
            <p className="text-[16px] md:text-[18px] font-bold leading-relaxed">
              รอเจ้าหน้าที่ดำเนิน อนุมัติการเป็นนิติบุคคล ภายใน 24 ชม.
            </p>
            <p className="text-[13px] mt-2 opacity-90">
              (ยกเว้นวันอาทิตย์และวันหยุดนักขัตฤกษ์)
            </p>
          </div>
        ) : (
          <>
            {/* ── Status tabs — horizontal scrollable pills ── */}
            <div className="mb-4">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5" role="heading" aria-level={2}>
                <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
                สถานะรายการ
              </p>
              <div className="flex flex-wrap gap-2">
                {TABS.map((tab) => {
                  const isActive = tab.key === "" ? !q : q === tab.key;
                  const href = tab.key === "" ? "/service-order" : `/service-order?q=${tab.key}`;
                  const count = counts[tab.key] ?? 0;
                  return (
                    <Link
                      key={tab.key || "all"}
                      href={href}
                      className={`inline-flex items-center gap-1 rounded-full px-3 md:px-3.5 py-1.5 text-[11.5px] md:text-[12.5px] font-bold border transition-all ${
                        isActive
                          ? `${tab.activeCls} shadow-md`
                          : "bg-white text-foreground border-border hover:border-primary-300 hover:text-primary-600"
                      }`}
                    >
                      {tab.label}
                      {count > 0 && (
                        <span
                          className={`inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full text-[9.5px] font-black ${
                            isActive ? "bg-white/25 text-white" : "bg-primary-50 text-primary-700"
                          }`}
                        >
                          {numberLimit(count)}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* ── List body ── */}
            {countAll === 0 ? (
              /* shops.php L1034-1047 — empty everything */
              <EmptyState title="คุณยังไม่มีรายการฝากสั่งซื้อ" showCta />
            ) : rows.length === 0 ? (
              /* shops.php L1022-1029 — filter result empty */
              <EmptyState title="คุณยังไม่มีข้อมูลฝากสั่งซื้อ" showCta={false} />
            ) : (
              <>
                {/* Order cards — responsive (card-stack on mobile, row-grid on desktop) */}
                <div className="space-y-2.5">
                  {rows.map((row) => (
                    <OrderCard
                      key={row.hno}
                      row={row}
                      promoId={promoMap.get(row.hno)}
                      isAnchor={!!hNoAnchor && hNoAnchor === row.hno}
                    />
                  ))}
                </div>
              </>
            )}

            {/* shops.php L1059-1081 — b-pay fixed bottom bar (multi-select pay,
                shown when there are unpaid orders on q=2 or q="" tabs).
                The select-all checkbox + "ชำระเงิน" button are UI placeholders
                until the matching Server Action wires up — same as legacy. */}
            {countShops2 > 0 && (q === "" || q === "2") && (
              <PaymentBar count={countShops2} />
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────── ORDER CARD ─────────────────────────── */
function OrderCard({
  row,
  promoId,
  isAnchor,
}: {
  row: HeaderOrderRow;
  promoId: number | undefined;
  isAnchor: boolean;
}) {
  const pricePayNum =
    (Number(row.htotalpricechn ?? 0) + Number(row.hshippingchn ?? 0)) *
      Number(row.hrate ?? 0) +
    Number(row.hshippingservice ?? 0);
  const pricePay = numberFormat2(pricePayNum);

  // hCover URL resolution (preserved from legacy shops.php L969-978).
  let hCover: string;
  const cover = row.hcover ?? "";
  if (/https|http/m.test(cover)) {
    const cleaned = cover
      .replace("?x-oss-process=style/alsy", "")
      .replace("?x-oss-process=style/tbsy", "")
      .replace("_250x250.jpg", "");
    hCover = cleaned + "_150x150.jpg";
  } else if (cover !== "") {
    hCover = legacyMemberUrl(`images/shops/${cover}`);
  } else {
    hCover = "/legacy/pcs/shops/default.png";
  }

  const itemTitle =
    (row.htitle ?? "") +
    (Number(row.hcount ?? 0) > 1 ? ` และอีก ${Math.round(Number(row.hcount) - 1)} รายการ` : "");

  return (
    <article
      id={isAnchor ? row.hno : undefined}
      className={`relative rounded-2xl bg-white border shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.07)] transition-shadow overflow-hidden ${
        isAnchor ? "border-primary-400 ring-2 ring-primary-100" : "border-border"
      }`}
    >
      <div className="grid grid-cols-[72px_1fr] md:grid-cols-[88px_1fr_auto] gap-3 md:gap-4 p-3">
        {/* Product image */}
        <div className="relative w-[72px] h-[72px] md:w-[88px] md:h-[88px] rounded-xl overflow-hidden bg-surface border border-border shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hCover}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        </div>

        {/* Info — middle column (full row on mobile under image) */}
        <div className="min-w-0 col-span-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/service-order/${row.hno}`}
              className="text-[13px] md:text-[14px] font-bold text-primary-600 hover:underline notranslate"
            >
              {row.hno}
            </Link>
            <ProBadge promoId={promoId} />
            <StatusBadge hStatus={row.hstatus} />
          </div>
          <Link
            href={`/service-order/${row.hno}`}
            className="block mt-1 text-[12.5px] md:text-[13.5px] text-foreground hover:text-primary-600 line-clamp-2"
          >
            {itemTitle || "—"}
          </Link>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" strokeWidth={2} />
              {fmtRelative(row.hdate)}
            </span>
            <span className="font-mono text-[12px]">
              ราคา <span className="text-primary-600 font-black">{pricePay}</span> บาท
            </span>
          </div>
          {row.hstatus === "2" && (
            <p className="mt-1 text-[11.5px] text-rose-700">
              ⚠ กรุณาชำระเงินก่อน{" "}
              <span className="font-bold">{fmtDMYHMS(row.hdatepayment)}</span> น.
            </p>
          )}
          {row.hnoteuser === "2" && row.hnote && (
            <div className="mt-1 text-[11.5px] bg-rose-50 text-rose-700 border border-rose-100 rounded-md px-2 py-1">
              หมายเหตุ : {row.hnote}
            </div>
          )}
        </div>

        {/* Action buttons — right column on desktop, full row beneath on mobile */}
        <div className="col-span-2 md:col-span-1 flex flex-wrap md:flex-col items-end justify-end gap-1.5">
          <Link
            href={`/service-order/${row.hno}`}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11.5px] font-bold px-2.5 py-1 hover:bg-emerald-100 transition-colors"
          >
            <Eye className="w-3 h-3" strokeWidth={2.2} />
            ดูรายละเอียด
          </Link>
          {row.hstatus === "2" && (
            <Link
              href={`/service-order/${row.hno}?pay=true`}
              className="inline-flex items-center gap-1 rounded-full bg-sky-600 text-white text-[11.5px] font-bold px-2.5 py-1 shadow-md shadow-sky-600/25 hover:bg-sky-700 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" strokeWidth={2.2} />
              ชำระเงิน
            </Link>
          )}
          {Number(row.hstatus) <= 2 && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11.5px] font-bold px-2.5 py-1 hover:bg-rose-100 transition-colors"
            >
              <XCircle className="w-3 h-3" strokeWidth={2.2} />
              ยกเลิก
            </button>
          )}
          {row.hstatus === "5" && (
            <Link
              href={`/service-order/print?print=1&id=${row.hno}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-full bg-primary-50 text-primary-700 border border-primary-200 text-[11.5px] font-bold px-2.5 py-1 hover:bg-primary-100 transition-colors"
            >
              <Receipt className="w-3 h-3" strokeWidth={2.2} />
              พิมพ์ใบเสร็จ
            </Link>
          )}
          {Number(row.hstatus) > 1 && Number(row.hstatus) < 6 && (
            <Link
              href={`/service-order/print?print=2&id=${row.hno}`}
              target="_blank"
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11.5px] font-bold px-2.5 py-1 hover:bg-rose-100 transition-colors"
            >
              <FileText className="w-3 h-3" strokeWidth={2.2} />
              พิมพ์ใบแจ้งหนี้
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────── EMPTY STATE ─────────────────────────── */
function EmptyState({ title, showCta }: { title: string; showCta: boolean }) {
  return (
    <div className="rounded-2xl bg-white border border-border p-8 md:p-12 text-center shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/legacy/pcs/shop-2-300x300.png"
        alt=""
        className="mx-auto w-40 h-40 md:w-52 md:h-52 object-contain opacity-70 mb-4"
      />
      <h3 className="text-[15px] md:text-[17px] font-bold text-foreground">{title}</h3>
      {showCta && (
        <Link
          href="/service-order/add"
          className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white text-[13px] font-bold px-4 py-2 shadow-lg shadow-primary-600/30 hover:shadow-primary-600/40 hover:-translate-y-0.5 transition-all"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          สั่งสินค้าเพิ่ม
        </Link>
      )}
    </div>
  );
}

/* ─────────────────────────── PAYMENT BOTTOM BAR ─────────────────────────── */
function PaymentBar({ count }: { count: number }) {
  return (
    <div className="fixed bottom-20 md:bottom-6 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[640px] z-40">
      <div className="rounded-2xl bg-gradient-to-br from-primary-600 to-primary-700 text-white px-4 py-3 shadow-2xl shadow-primary-600/40 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] opacity-90">มีรายการรอชำระ</p>
          <p className="text-[15px] font-bold">
            {count} ออเดอร์
          </p>
        </div>
        <Link
          href="/service-order?q=2"
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-white text-primary-700 text-[12.5px] font-bold px-3.5 py-1.5 shadow-md hover:bg-primary-50 transition-colors"
        >
          ดูรายการ
        </Link>
      </div>
    </div>
  );
}

/* ─────────────────────────── PROMO BADGE ───────────────────────────
 * Transcribes legacy `chProhNo()` (function.php L1095-1183). Cases 1-6 are
 * PLAIN badges (no link), cases 7-77 are LINKED badges. The original
 * `B = "https://pcscargo.co.th/"` is REWRITTEN to the internal Pacred
 * landing — customer stays inside Pacred per pcs-scrub-plan. The legacy
 * promo slug is preserved as a `?ref=` query string for analytics +
 * future Pacred-hosted promo page resolution.
 */
function ProBadge({ promoId }: { promoId: number | undefined }) {
  if (promoId == null) return null;
  const PLAIN: Record<number, string> = {
    1: "Pro 3.15", 2: "Pro 4.4", 3: "Pro 4.25", 4: "Pro 5.5",
    5: "Pro 5.15", 6: "Pro 6.6",
  };
  // All legacy LINKED hrefs were `${pcscargo.co.th/}<slug>`. Rewriting `B`
  // to the Pacred landing + a `?ref=` slug param keeps the analytics
  // trail while moving every customer click off the legacy host.
  const B = "/services/import-china?ref=";
  const LINKED: Record<number, { label: string; title: string; href: string }> = {
    7:  { label: "Pro 6.25",  title: "เรท 5.39 และ ขนส่ง 5%",  href: `${B}โปรโมชัน-6-25` },
    8:  { label: "Pro 7.7",   title: "เรท 5.42",               href: `${B}โปรโมชัน-7-7` },
    9:  { label: "Pro 7.25",  title: "เรท 5.54 และ ขนส่ง 3%",  href: `${B}โปรโมชัน-7-25` },
    10: { label: "Pro 8.8",   title: "เรท 5.57",               href: `${B}โปรโมชัน-8-8` },
    11: { label: "Pro 8.25",  title: "เรท 5.49 และขนส่ง 3%",   href: `${B}โปรโมชัน-8-25` },
    12: { label: "Pro 9.9",   title: "เรท 5.49",               href: `${B}โปรโมชัน-9-9` },
    13: { label: "Pro Survey", title: "เรท 5.49",              href: `${B}โปรโมชัน-9-16` },
    14: { label: "Pro 10.10", title: "เรท 5.48",               href: `${B}โปรโมชัน-10-10` },
    15: { label: "Pro 10.25", title: "เรท 5.49 ขนส่ง 3%",      href: `${B}โปรโมชัน-10-25` },
    16: { label: "Pro 11.11", title: "เรท 5.47 ขนส่ง -11 บาท", href: `${B}โปรโมชัน-11-11` },
    17: { label: "Pro 11.25", title: "เรท 5.44",               href: `${B}โปรโมชัน/โปรโมชัน-11-25` },
    18: { label: "Pro 12.12", title: "เรท 5.22",               href: `${B}โปรโมชัน/โปรโมชัน-12-12` },
    19: { label: "Pro Valentine", title: "เรท 5.10",           href: `${B}โปรโมชัน/โปรโมชัน-วาเลนไทน์` },
    20: { label: "Pro 3.3",   title: "เรท 5.18",               href: `${B}โปรโมชัน/โปรโมชัน-2023-3-3/` },
    21: { label: "Pro Songkran", title: "เรท 5.15",            href: `${B}โปรโมชัน/โปรโมชัน-songkran-2023/` },
    22: { label: "Pro เลือกตั้ง", title: "เรท 5.18",           href: `${B}โปรโมชัน/โปรโมชัน-เลือกตั้ง-2566/` },
    23: { label: "Pro Surveyนี้ โอเคมั๊ย", title: "เรท 5.10",  href: `${B}โปรโมชัน/โปรโมชัน-survey-นี้-โอเคมั๊ย/` },
    24: { label: "Pride month 06", title: "เรท 5.06",          href: `${B}โปรโมชัน/โปรโมชัน-pride-month-2023-06/` },
    25: { label: "Pro 7.7",   title: "เรท 5.06",               href: `${B}โปรโมชัน/โปรโมชัน-2023-7-7/` },
    26: { label: "Pro แซงทางโค้ง", title: "เรท 5.05",          href: `${B}โปรโมชัน/โปรโมชัน-2023-7-โปรดี/` },
    27: { label: "Happy Mother's Day", title: "เรท 5.04",      href: `${B}โปรโมชัน/2023-08-happy-mother-day/` },
    28: { label: "ไม่ต้องทุบกระปุก", title: "เรท 5.04",         href: `${B}โปรโมชัน/2023-08-ไม่ต้องทุบกระปุกช้อป/` },
    29: { label: "3 Year Anniversary", title: "เรท 5.04",      href: `${B}โปรโมชัน/pcs-3-year-anniversary/` },
    30: { label: "Oh! My Ghost", title: "เรท 5.17",            href: `${B}โปรโมชัน/pcs-oh-my-ghost-2023/` },
    31: { label: "ล่าท้าเรทหยวน", title: "เรท 5.15",            href: `${B}โปรโมชัน/challeng-yuan-rate-10-2023/` },
    32: { label: "สุขลันตลิ่ง", title: "เรท 5.14",              href: `${B}โปรโมชัน/สุขลันตลิ่ง-2023/` },
    33: { label: "สุขสันต์วันปีใหม่", title: "เรท 5.15",         href: `${B}โปรโมชัน/สุขสันต์วันปีใหม่จาก-pcs-cargo/` },
    34: { label: "ซินเจียยู่อี่", title: "เรท 5.12",              href: `${B}โปรโมชัน/ซินเจียยู่อี่-2024/` },
    35: { label: "ช้อปฉลองปีมังกร", title: "เรท 5.14",          href: `${B}โปรโมชัน/ช้อปฉลองปีมังกร-2024/` },
    36: { label: "Happy March", title: "เรท 5.17",             href: `${B}โปรโมชัน/มีนานี้-สต๊อกสินค้าไว้ร/` },
    37: { label: "สงกรานต์ 2024", title: "เรท 5.15",            href: `${B}โปรโมชัน/สงกรานต์-2024/` },
    38: { label: "End of month 04/2024", title: "เรท 5.18",    href: `${B}โปรโมชัน/endofmonth-04-2024/` },
    39: { label: "5.5 Double Day/", title: "เรท 5.20",          href: `${B}โปรโมชัน/2024-5-5-double-day/` },
    40: { label: "May Day", title: "เรท 5.22",                  href: `${B}โปรโมชัน/2024-may-day/` },
    41: { label: "Late May", title: "เรท 5.20",                 href: `${B}โปรโมชัน/late-may-2024-05/` },
    42: { label: "MID YEAR", title: "เรท 5.22",                 href: `${B}โปรโมชัน/mid-year-2024-06/` },
    43: { label: "BYE BYE JUNE", title: "เรท 5.22",             href: `${B}โปรโมชัน/bye-bye-june-2024/` },
    44: { label: "LUCK DAY SPACIAL", title: "เรท 5.22",         href: `${B}โปรโมชัน/luck-day-spacial-2024/` },
    45: { label: "JULY JUMBO SALE", title: "เรท 5.20",          href: `${B}โปรโมชัน/july-jumbo-sale-7-24/` },
    46: { label: "8.8 Aug", title: "เรท 5.15",                  href: `${B}โปรโมชัน/8-8-august-attraction-sale-2024/` },
    47: { label: "Final Aug", title: "เรท 5.10",                href: `${B}โปรโมชัน/final-august-flash-sale-2024/` },
    48: { label: "9.9 Double Day", title: "เรท 5.05",           href: `${B}โปรโมชัน/9-9-double-day/` },
    49: { label: "October Save", title: "เรท 4.95",             href: `${B}โปรโมชัน/2024-10-october-save-เวอร์/` },
    50: { label: "Fright Night", title: "เรท 4.94",             href: `${B}โปรโมชัน/fright-night-special-2024/` },
    51: { label: "พฤศจิกาพาเซฟ", title: "เรท 4.97",              href: `${B}โปรโมชัน/พฤศจิกาพาเซฟ-2024/` },
    52: { label: "NOVEMBER Super Pro", title: "เรท 5.02",       href: `${B}โปรโมชัน/november-super-pro-2024/` },
    54: { label: "SANTAS SURPRIESALE", title: "เรท 4.93",       href: `${B}โปรโมชัน/santas-surprisesale-2024/` },
    55: { label: "โปรโมชั่นนำเข้าสินค้าจากจีน", title: "เรท 4.89", href: `${B}โปรโมชัน/โปรโมชั่นนำเข้าจีน/` },
    56: { label: "February Fever Sale", title: "เรท 4.87",      href: `${B}โปรโมชัน/february-fever-sale-2025/` },
    57: { label: "March madness", title: "เรท 4.85",            href: `${B}โปรโมชัน/march-madness-2025/` },
    58: { label: "MEGA YUAN MARCH", title: "เรท 4.87",          href: `${B}โปรโมชัน/mega-yuan-march-2025/` },
    59: { label: "MARCH YUAN DEAL", title: "เรท 4.85",          href: `${B}โปรโมชัน/march-yuan-deal-2025/` },
    60: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.85",         href: `${B}โปรโมชัน/โปรนำเข้าสินค้าจีน-4-2025/` },
    61: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.89",         href: `${B}โปรโมชัน/โปรนำเข้าสินค้าจีน-5-5-2025/` },
    62: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.79",         href: `${B}โปรโมชัน/โปรนำเข้าสินค้าจีน-19-5-2025/` },
    63: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.77",         href: `${B}โปรโมชัน/โปรนำเข้าสินค้าจีน-6-6-2025/` },
    64: { label: "นำเข้าสินค้าจากจีน", title: "เรท 4.75",         href: `${B}โปรโมชัน/โปรโมชันกลางปี-2025/` },
    65: { label: "โปรโมชัน 7.7",   title: "เรท 4.75",            href: `${B}โปรโมชัน/โปรโมชัน-2025-7-7/` },
    66: { label: "โปรโมชัน 8.8",   title: "เรท 4.72",            href: `${B}โปรโมชัน/นำเข้าจีน082025/` },
    67: { label: "โปรโมชันกลางเดือน", title: "เรท 4.73",         href: `${B}โปรโมชัน/นำเข้าจีน18082025/` },
    68: { label: "โปรโมชัน 9.9",   title: "เรท 4.71",            href: `${B}โปรโมชัน/นำเข้าจีน09092025/` },
    69: { label: "โปรโมชัน 9.22",  title: "เรท 4.72",            href: `${B}โปรโมชัน/นำเข้าจีน09222025/` },
    70: { label: "โปรโมชัน 10.10", title: "เรท 4.73",            href: `${B}โปรโมชัน/นำเข้าจีน10102025/` },
    71: { label: "โปรโมชันนำเข้าจีน", title: "เรท 4.79",         href: `${B}โปรโมชัน/นำเข้าจีน21102025/` },
    72: { label: "โปรโมชัน 11.11", title: "เรท 4.79",            href: `${B}โปรโมชัน/นำเข้าจีน11112025/` },
    73: { label: "โปรโมชัน 25.11", title: "เรท 4.78",            href: `${B}โปรโมชัน/นำเข้าจีน25112025/` },
    74: { label: "โปรโมชัน 12.12", title: "เรท 4.78",            href: `${B}โปรโมชัน/นำเข้าจีน251212/` },
    75: { label: "โปรโมชัน 12.17", title: "เรท 4.76",            href: `${B}โปรโมชัน/นำเข้าจีน251217/` },
    76: { label: "โปรโมชัน 1.20",  title: "เรท 4.75",            href: `${B}โปรโมชัน/นำเข้าจีน260120/` },
    77: { label: "โปรโมชัน 3.3",   title: "เรท 4.70",            href: `${B}โปรโมชัน/นำเข้าจีน260303/` },
  };
  if (PLAIN[promoId]) {
    return (
      <span className="inline-flex items-center rounded-full bg-yellow-300/90 text-primary-900 text-[10.5px] font-black px-2 py-0.5 border border-yellow-400">
        🎁 {PLAIN[promoId]}
      </span>
    );
  }
  const linked = LINKED[promoId];
  if (linked) {
    return (
      <a
        href={linked.href}
        target="_blank"
        rel="noopener noreferrer"
        title={linked.title}
        className="inline-flex items-center rounded-full bg-yellow-300/90 text-primary-900 text-[10.5px] font-black px-2 py-0.5 border border-yellow-400 hover:bg-yellow-300"
      >
        🎁 {linked.label}
      </a>
    );
  }
  return null;
}
