"use client";

/**
 * รายการที่ต้องชำระ — the client tab switcher + per-service rich views
 * (ปอน 2026-05-30 · per-category rich views 2026-06-06). The server page
 * (`./page.tsx`) gathers every payment-due item across the customer's services
 * into one normalised `PaymentDueItem[]` (import items carry their full
 * `ForwarderRow`) and hands it down here; this component renders the
 * service-type tab strip and, per tab, the RICH view that belongs to that
 * service — the display format differs by category (ปอน: "รูปแบบที่แสดงผล
 * ต่างกันไปตามหมวดหมู่"):
 *
 *   - นำเข้า (import)   → the EXACT grouped-by-ตู้ <ForwarderInteractivity>
 *       view from /service-import (container accordions · tracking · ETA ·
 *       per-ตู้ totals · sticky pay-bar · in-place QR/slip modal). Reused
 *       as-is — it's already prop-driven (page.tsx reads ?q, not the
 *       component) so embedding it here touches ZERO of the money flow.
 *   - ฝากสั่งซื้อ (order) → stacked order cards (cover · ref · ยอด · ชำระเงิน).
 *   - ฝากชำระ (payment)  → stacked yuan-transfer cards (ดูรายละเอียด).
 *   - ส่งออก / พิธีการศุลกากร → no backing data yet → empty state.
 *   - ทั้งหมด (all) → every service stacked under its own section header,
 *       each in its own format.
 *
 * Tab filtering is CLIENT-side (instant switching, no navigation).
 */

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
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
import { ForwarderInteractivity } from "../service-import/forwarder-interactivity";
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
  /** Import items only — the full forwarder row feeds the grouped-by-ตู้
   *  <ForwarderInteractivity> view (which owns the in-place pay modal). */
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

// Per-service card chrome (icon + colour). Used by the order/payment cards
// and the "ทั้งหมด" section headers. (import has its own grouped view.)
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
  const t = useTranslations("paymentDueList");
  const [tab, setTab] = useState<TabKey>("all");

  // Display label per tab/service — keyed on the stable enum so the Thai-keyed
  // logic (TABS.key, SERVICE_META[service]) stays untouched.
  const tabLabel = (key: TabKey) => t(`tab.${key}`);
  const serviceLabel = (service: PaymentDueService) => t(`service.${service}`);

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
  const activeLabel = tabLabel(tab);

  // ── นำเข้า: feed the full forwarder rows into the SAME grouped-by-ตู้
  //    <ForwarderInteractivity> used on /service-import. It owns its own
  //    selection · live total recompute · sticky pay-bar · QR/slip modal,
  //    so no payment-due-local pay machinery is needed (and /service-import
  //    is never touched → the money flow stays byte-identical).
  const importRows = useMemo(
    () =>
      filtered
        .filter((it) => it.service === "import" && it.forwarderRow)
        .map((it) => it.forwarderRow as ForwarderRow),
    [filtered],
  );
  const importJuristic = filtered.some(
    (it) => it.service === "import" && it.isJuristic,
  );
  const orderItems = filtered.filter((it) => it.service === "order");
  const paymentItems = filtered.filter((it) => it.service === "payment");

  const importView =
    importRows.length > 0 ? (
      <ForwarderInteractivity
        rowsData={importRows}
        arrFidDriver={[]}
        q="5"
        isJuristic={importJuristic}
        showPayBar
        showPayStrip={false}
        showMaoStrip={false}
        columnCount={8}
        maoPromos={[]}
      />
    ) : null;

  function cards(list: PaymentDueItem[]) {
    return (
      <div className="space-y-2.5">
        {list.map((it) => (
          <PaymentDueCard key={it.key} item={it} />
        ))}
      </div>
    );
  }

  return (
    <section className="rounded-2xl bg-white dark:bg-surface border border-border shadow-sm overflow-hidden">
      {/* ── Status/service tab strip ── */}
      <div className="border-b border-border px-3 py-3 md:px-5 md:py-4">
        <p
          className="text-[12px] font-semibold uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5"
          role="heading"
          aria-level={2}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />
          {t("byServiceHeading")}
        </p>
        <div className="flex flex-wrap gap-2">
          {TABS.map((tabItem) => {
            const isActive = tabItem.key === tab;
            const count = counts[tabItem.key];
            return (
              <button
                key={tabItem.key}
                type="button"
                onClick={() => setTab(tabItem.key)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 md:px-3.5 py-1.5 text-[11.5px] md:text-[12.5px] font-bold border transition-all ${
                  isActive
                    ? "bg-primary-600 text-white border-primary-600 shadow-md"
                    : "bg-white dark:bg-surface text-foreground border-border hover:border-primary-300 hover:text-primary-600"
                }`}
              >
                {tabLabel(tabItem.key)}
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

      {/* ── List body — per-tab rich view ── */}
      <div className="px-3 py-3 md:px-5 md:py-4">
        {filtered.length === 0 ? (
          items.length === 0 ? (
            /* Nothing due anywhere — the happy "all clear" state. */
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </span>
              <p className="mt-1 text-[15px] font-bold text-foreground">
                {t("emptyAllClearTitle")}
              </p>
              <p className="text-[12.5px] text-muted">
                {t("emptyAllClearSubtitle")}
              </p>
            </div>
          ) : (
            /* This service tab has no pending items (e.g. ส่งออก / พิธีการฯ). */
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox className="h-10 w-10 text-muted/50" />
              <p className="text-[13.5px] text-muted">
                {t("emptyTab", { label: activeLabel })}
              </p>
            </div>
          )
        ) : tab === "import" ? (
          // นำเข้า — grouped-by-ตู้ rich view (or fall back to cards if a row
          // somehow lacks its forwarder payload).
          (importView ?? cards(filtered))
        ) : tab === "order" ? (
          cards(orderItems)
        ) : tab === "payment" ? (
          cards(paymentItems)
        ) : (
          // ทั้งหมด — each service stacked under its own section, in its own format.
          <div className="space-y-5">
            {importView && (
              <PdSection
                Icon={Ship}
                label={serviceLabel("import")}
                count={importRows.length}
              >
                {importView}
              </PdSection>
            )}
            {orderItems.length > 0 && (
              <PdSection
                Icon={ShoppingBag}
                label={serviceLabel("order")}
                count={orderItems.length}
              >
                {cards(orderItems)}
              </PdSection>
            )}
            {paymentItems.length > 0 && (
              <PdSection
                Icon={CircleDollarSign}
                label={serviceLabel("payment")}
                count={paymentItems.length}
              >
                {cards(paymentItems)}
              </PdSection>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// Section header for the "ทั้งหมด" tab — labels each service group.
function PdSection({
  Icon,
  label,
  count,
  children,
}: {
  Icon: typeof ShoppingBag;
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary-50 text-primary-600">
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </span>
        <h3 className="text-[13.5px] font-black text-foreground">{label}</h3>
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary-50 text-primary-700 text-[10px] font-black">
          {numberLimit(count)}
        </span>
      </div>
      {children}
    </section>
  );
}

function PaymentDueCard({ item }: { item: PaymentDueItem }) {
  const t = useTranslations("paymentDueList");
  const meta = SERVICE_META[item.service];
  const Icon = meta.Icon;
  const [imgFailed, setImgFailed] = useState(false);
  const statusCls =
    STATUS_CLS[item.statusLabel] ??
    "bg-slate-100 text-slate-700 border-slate-200";
  const showImage = !!item.imageUrl && !imgFailed;
  // Display-only translation of the per-item labels — keyed on the Thai data
  // value (which still keys STATUS_CLS / SERVICE_META); falls back to the raw
  // value if a custom legacy label has no mapping.
  const statusText: Record<string, string> = {
    รอชำระเงิน: t("status.awaitingPayment"),
    รอดำเนินการ: t("status.pending"),
  };
  const ctaText: Record<string, string> = {
    ชำระเงิน: t("cta.pay"),
    ดูรายละเอียด: t("cta.viewDetail"),
  };

  return (
    <article className="relative rounded-2xl bg-white dark:bg-surface border border-border shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_22px_rgba(0,0,0,0.07)] transition-shadow overflow-hidden">
      <div className="grid grid-cols-[52px_1fr] md:grid-cols-[60px_1fr_auto] gap-3 md:gap-4 p-3 flex-1 min-w-0">
        {/* Real item cover (order hcover) — falls back to the service icon. */}
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
              {t(`service.${item.service}`)}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${statusCls}`}
            >
              {statusText[item.statusLabel] ?? item.statusLabel}
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
              {t("amountPrefix")}{" "}
              <span className="text-primary-600 font-black">
                {numberFormat2(item.amountThb)}
              </span>{" "}
              {t("currencyBaht")}
            </span>
          </div>
        </div>

        {/* CTA — order/payment navigate to their own pay/detail flow. */}
        <div className="col-span-2 md:col-span-1 flex md:flex-col items-stretch md:items-end justify-end gap-1.5">
          <Link
            href={item.ctaHref}
            className="inline-flex items-center justify-center gap-1 rounded-full bg-sky-600 text-white text-[12px] font-bold px-3.5 py-2 md:py-1.5 shadow-md shadow-sky-600/25 hover:bg-sky-700 transition-colors w-auto"
          >
            {ctaText[item.ctaLabel] ?? item.ctaLabel}
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.4} />
          </Link>
        </div>
      </div>
    </article>
  );
}
