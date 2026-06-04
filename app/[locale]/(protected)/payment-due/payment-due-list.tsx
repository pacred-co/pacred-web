"use client";

/**
 * รายการที่ต้องชำระ — the client tab switcher + unified card list
 * (ปอน 2026-05-30). The server page (`./page.tsx`) gathers every payment-due
 * item across the customer's services into one normalised `PaymentDueItem[]`
 * and hands it down here; this component renders the service-type tab strip
 * and filters the list CLIENT-side (instant switching, no navigation) — the
 * visual language mirrors the /service-order list (rounded pills + status
 * badges + stacked cards) per ปอน's "หน้าตาคล้ายๆ รายการสั่งสินค้าทั้งหมด".
 *
 * Tabs: ทั้งหมด · ฝากสั่งซื้อ(order) · นำเข้า(import) · ส่งออก(export) ·
 * ฝากชำระ(payment) · พิธีการศุลกากร(customs). Default = ทั้งหมด. ส่งออก +
 * พิธีการศุลกากร have no backing data yet, so those tabs render an empty state.
 */

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  ShoppingBag,
  Ship,
  CircleDollarSign,
  Calendar,
  ArrowRight,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { ForwarderPayModal } from "../service-import/forwarder-pay-modal";
import type { ForwarderRow } from "../service-import/forwarder-row-view";

export type PaymentDueService = "order" | "import" | "payment";

export type PaymentDueItem = {
  service: PaymentDueService;
  key: string; // unique React key
  ref: string; // display reference (order no. / #id)
  refHref: string; // link on the ref + title
  imageUrl: string | null; // real item cover (order/forwarder); null → icon
  title: string;
  dateText: string; // pre-formatted dd/mm/yyyy
  amountThb: number;
  statusLabel: string; // per-item status (รอชำระเงิน / รอดำเนินการ)
  ctaLabel: string; // ชำระเงิน / ดูรายละเอียด
  ctaHref: string;
  /** Import items only — the full forwarder row lets the card open the
   *  in-place pay modal (QR + slip) instead of navigating to /service-import. */
  forwarderRow?: ForwarderRow;
  isJuristic?: boolean;
};

type TabKey = "all" | "order" | "import" | "export" | "payment" | "customs";

const TABS: readonly { key: TabKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "order", label: "ฝากสั่งซื้อ" },
  { key: "import", label: "นำเข้า" },
  { key: "export", label: "ส่งออก" },
  { key: "payment", label: "ฝากชำระ" },
  { key: "customs", label: "พิธีการศุลกากร" },
] as const;

// Per-service card chrome (icon + colour). Only the three services that
// produce items need an entry; export/customs never render a card.
const SERVICE_META: Record<
  PaymentDueService,
  { label: string; Icon: typeof ShoppingBag; iconCls: string; pillCls: string }
> = {
  order: {
    label: "ฝากสั่งซื้อ",
    Icon: ShoppingBag,
    iconCls: "bg-primary-50 text-primary-600",
    pillCls: "bg-primary-50 text-primary-700 border-primary-200",
  },
  import: {
    label: "นำเข้า",
    Icon: Ship,
    iconCls: "bg-blue-50 text-blue-600",
    pillCls: "bg-blue-50 text-blue-700 border-blue-200",
  },
  payment: {
    label: "ฝากชำระ",
    Icon: CircleDollarSign,
    iconCls: "bg-emerald-50 text-emerald-600",
    pillCls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

const STATUS_CLS: Record<string, string> = {
  รอชำระเงิน: "bg-rose-100 text-rose-700 border-rose-200",
  รอดำเนินการ: "bg-amber-100 text-amber-700 border-amber-200",
};

function numberFormat2(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numberLimit(n: number): string {
  return n > 99 ? "99+" : String(n);
}

export function PaymentDueList({ items }: { items: PaymentDueItem[] }) {
  const [tab, setTab] = useState<TabKey>("all");
  // The import item whose in-place pay modal (QR + slip) is open, if any.
  const [payItem, setPayItem] = useState<PaymentDueItem | null>(null);

  const counts: Record<TabKey, number> = {
    all: items.length,
    order: 0,
    import: 0,
    export: 0,
    payment: 0,
    customs: 0,
  };
  for (const it of items) counts[it.service] += 1;

  const filtered =
    tab === "all" ? items : items.filter((it) => it.service === tab);
  const activeLabel = TABS.find((t) => t.key === tab)?.label ?? "";

  return (
    <>
    <section className="rounded-2xl bg-white dark:bg-surface border border-border shadow-sm overflow-hidden">
      {/* ── Status/service tab strip ── */}
      <div className="border-b border-border px-3 py-3 md:px-5 md:py-4">
        <p
          className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5"
          role="heading"
          aria-level={2}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
          แยกตามบริการ
        </p>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const isActive = t.key === tab;
            const count = counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 md:px-3.5 py-1.5 text-[11.5px] md:text-[12.5px] font-bold border transition-all ${
                  isActive
                    ? "bg-primary-600 text-white border-primary-600 shadow-md"
                    : "bg-white dark:bg-surface text-foreground border-border hover:border-primary-300 hover:text-primary-600"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full text-[9.5px] font-black ${
                      isActive
                        ? "bg-white/25 text-white"
                        : "bg-primary-50 text-primary-700"
                    }`}
                  >
                    {numberLimit(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── List body ── */}
      <div className="px-3 py-3 md:px-5 md:py-4">
        {filtered.length === 0 ? (
          items.length === 0 ? (
            /* Nothing due anywhere — the happy "all clear" state. */
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <p className="mt-1 text-[15px] font-bold text-foreground">
                ไม่มีรายการที่ต้องชำระ
              </p>
              <p className="text-[12.5px] text-muted">
                ทุกบริการชำระเงินครบแล้ว 🎉
              </p>
            </div>
          ) : (
            /* This service tab has no pending items. */
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted/50" />
              <p className="text-[13.5px] text-muted">
                ไม่มีรายการ{activeLabel}ที่ต้องชำระ
              </p>
            </div>
          )
        ) : (
          <div className="space-y-2.5">
            {filtered.map((it) => (
              <PaymentDueCard key={it.key} item={it} onPay={setPayItem} />
            ))}
          </div>
        )}
      </div>
    </section>

    {/* In-place forwarder payment (QR + slip + submit) — reuses the verified
        /service-import pay modal so import items pay right here, no navigation.
        Renders hidden until an import card is tapped. */}
    <ForwarderPayModal
      rows={payItem?.forwarderRow ? [payItem.forwarderRow] : []}
      isJuristic={!!payItem?.isJuristic}
      open={!!payItem?.forwarderRow}
      onClose={() => setPayItem(null)}
    />
    </>
  );
}

function PaymentDueCard({
  item,
  onPay,
}: {
  item: PaymentDueItem;
  onPay?: (item: PaymentDueItem) => void;
}) {
  const meta = SERVICE_META[item.service];
  const Icon = meta.Icon;
  const [imgFailed, setImgFailed] = useState(false);
  const statusCls =
    STATUS_CLS[item.statusLabel] ??
    "bg-slate-100 text-slate-700 border-slate-200";
  const showImage = !!item.imageUrl && !imgFailed;

  return (
    <article className="relative rounded-2xl bg-white dark:bg-surface border border-border shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.07)] transition-shadow overflow-hidden">
      <div className="grid grid-cols-[52px_1fr] md:grid-cols-[60px_1fr_auto] gap-3 md:gap-4 p-3">
        {/* Real item cover (order hcover / forwarder fcover) — falls back to
            the service icon when there's no image or it fails to load. */}
        {showImage ? (
          <div className="w-[52px] h-[52px] md:w-[60px] md:h-[60px] rounded-xl overflow-hidden shrink-0 border border-border bg-surface-alt">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl ?? undefined}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div
            className={`w-[52px] h-[52px] md:w-[60px] md:h-[60px] rounded-xl grid place-items-center shrink-0 ${meta.iconCls}`}
          >
            <Icon className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2} />
          </div>
        )}

        {/* Info */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              href={item.refHref}
              className="text-[13px] md:text-[14px] font-bold text-primary-600 hover:underline notranslate"
            >
              {item.ref}
            </Link>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${meta.pillCls}`}
            >
              {meta.label}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${statusCls}`}
            >
              {item.statusLabel}
            </span>
          </div>
          <Link
            href={item.refHref}
            className="block mt-1 text-[12.5px] md:text-[13.5px] text-foreground hover:text-primary-600 line-clamp-2"
          >
            {item.title || "—"}
          </Link>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[11px] text-muted">
            {item.dateText && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" strokeWidth={2} />
                {item.dateText}
              </span>
            )}
            <span className="font-mono text-[12px]">
              ยอด{" "}
              <span className="text-primary-600 font-black">
                {numberFormat2(item.amountThb)}
              </span>{" "}
              บาท
            </span>
          </div>
        </div>

        {/* CTA — import items pay in-place via the QR modal; others navigate
            to their own pay/detail flow. */}
        <div className="col-span-2 md:col-span-1 flex md:flex-col items-stretch md:items-end justify-end gap-1.5">
          {item.service === "import" && item.forwarderRow && onPay ? (
            <button
              type="button"
              onClick={() => onPay(item)}
              className="inline-flex items-center justify-center gap-1 rounded-full bg-sky-600 text-white text-[12px] font-bold px-3.5 py-2 md:py-1.5 shadow-md shadow-sky-600/25 hover:bg-sky-700 transition-colors w-auto"
            >
              {item.ctaLabel}
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.4} />
            </button>
          ) : (
            <Link
              href={item.ctaHref}
              className="inline-flex items-center justify-center gap-1 rounded-full bg-sky-600 text-white text-[12px] font-bold px-3.5 py-2 md:py-1.5 shadow-md shadow-sky-600/25 hover:bg-sky-700 transition-colors w-auto"
            >
              {item.ctaLabel}
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.4} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
