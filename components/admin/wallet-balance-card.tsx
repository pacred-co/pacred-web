/**
 * WalletBalanceCard — the legacy PCS member-balance card (red-bordered rounded
 * card · Pacred "P" mark · big Prompt-light orange figure · cash-back line ·
 * orange rule · optional floating "ชำระเงิน" pill). Extracted from
 * /admin/wallet/[id] so /admin/wallet/pay-user (and others) reuse the SAME card
 * (owner 2026-07-16 · "เอาแบบในภาพ · ผมทำไว้ในระบบแล้ว"). Presentational + no
 * hooks → works in server pages AND client components.
 */
import { Link } from "@/i18n/navigation";
import { Plus } from "lucide-react";

export function WalletBalanceCard({
  title,
  subtitle,
  amount,
  cashback,
  titleTone = "danger",
  payHref,
  compact = false,
}: {
  title: string;
  subtitle: string;
  amount: number;
  cashback: number;
  titleTone?: "danger" | "ink";
  /** When set, render the floating "ชำระเงิน" pill linking here. Omit to hide it. */
  payHref?: string;
  /** ย่อให้พอดีจอทำงาน (owner 2026-07-16 · หน้า pay-user) — ลด mark/ตัวเลข/ระยะ. */
  compact?: boolean;
}) {
  // compact = พอดีจอทำงาน (pay-user) · เต็ม = hero card หน้า wallet detail
  const c = {
    frame: compact
      ? "rounded-2xl border-[3px] shadow-[0_0_10px_rgba(0,0,0,0.12)]"
      : "rounded-3xl border-[3px] shadow-[0_0_18px_rgba(0,0,0,0.18)]",
    markPos: compact ? "right-3 top-3 h-12 w-12" : "right-4 top-4 h-20 w-20",
    pad: compact ? "p-3" : "p-4",
    titlePr: compact ? "pr-16" : "pr-24",
    title: compact ? "text-[17px]" : "text-[21.14px]",
    amount: compact ? "text-[30px]" : "text-[42px]",
    cash: compact ? "mt-0.5 text-[12.5px]" : "mt-1 text-[14px]",
    rule: compact ? "mt-2 h-1" : "mt-3 h-1.5",
  };
  return (
    /* shadow: an even halo, not shadow-lg (which offsets down). pb-2, NOT pb-8:
       the CTA pill is absolute, so no in-flow room needed. */
    <div className={`relative border-[#FF4961] bg-white pb-2 dark:bg-surface ${c.frame}`}>
      {/* The Pacred "P" mark — ABSOLUTE so growing it never pushes the figure. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/pdiwaicon.png"
        alt="Pacred"
        className={`absolute rounded-xl object-contain ${c.markPos}`}
      />
      <div className={c.pad}>
        <div className={`space-y-0.5 ${c.titlePr}`}>
          <p
            className={
              `${c.title} font-light leading-tight ` +
              (titleTone === "danger" ? "text-[#FF4961]" : "text-[#464855] dark:text-foreground")
            }
          >
            {title}
          </p>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        {/* NOT font-mono: Prompt has a real 300; the mono stack faux-thins it.
            tabular-nums keeps the digits from jittering. */}
        <p className={`mt-1 ${c.amount} font-light leading-none tabular-nums text-[#FF9149]`}>
          {amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
        </p>
        <p className={`${c.cash} text-[#464855] dark:text-muted`}>
          Cash Back : {cashback.toLocaleString("th-TH", { minimumFractionDigits: 2 })} (บาท)
        </p>
        <div className={`${c.rule} rounded-full bg-orange-500`} />
      </div>
      {payHref && (
        <Link
          href={payHref}
          className="absolute -bottom-3.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-primary-700 px-4 py-1.5 text-xs font-bold text-white shadow-md hover:bg-primary-800"
        >
          <Plus className="h-3 w-3" /> ชำระเงิน
        </Link>
      )}
    </div>
  );
}
