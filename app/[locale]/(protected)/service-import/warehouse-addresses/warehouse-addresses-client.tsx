"use client";

import { useState } from "react";

type Warehouse = {
  slug:        "guangzhou" | "yiwu";
  city_th:     string;
  city_en:     string;
  province_th: string;
  address_cn:  string;
  postal_code: string;
  phone:       string;
  hours_th:    string;
  highlight:   string;
};

type TransportMode = "EK" | "SEA" | "AIR";

const TRANSPORT_LABEL: Record<TransportMode, string> = {
  EK:  "ทางรถ (EK)",
  SEA: "ทางเรือ (SEA)",
  AIR: "ทางอากาศ (AIR)",
};

export function WarehouseAddressesClient({
  memberCode,
  warehouses,
}: {
  memberCode:  string;
  warehouses:  Warehouse[];
}) {
  const [mode, setMode] = useState<TransportMode>("EK");

  return (
    <div className="space-y-6">
      {/* Transport mode picker — affects the recipient line on every card */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <p className="text-sm font-semibold mb-2">เลือกรูปแบบขนส่ง</p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(TRANSPORT_LABEL) as TransportMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                mode === m
                  ? "border-primary-500 bg-primary-50 text-primary-700"
                  : "border-border bg-white dark:bg-surface text-foreground hover:border-primary-200"
              }`}
            >
              {TRANSPORT_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          ระบบจะอัปเดต <b>收货人姓名 (ผู้รับ)</b> ใน Shipping Mark ของทุกโกดังตามรูปแบบที่เลือก
        </p>
      </div>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-2 print:grid-cols-1">
        {warehouses.map((w) => (
          <WarehouseCard key={w.slug} warehouse={w} memberCode={memberCode} mode={mode} />
        ))}
      </div>
    </div>
  );
}

function WarehouseCard({
  warehouse: w,
  memberCode,
  mode,
}: {
  warehouse:  Warehouse;
  memberCode: string;
  mode:       TransportMode;
}) {
  const [copied, setCopied] = useState(false);

  const recipientLine = `${memberCode} ${mode}`;
  const shippingMarkText = [
    `收货人姓名 (ผู้รับ): ${recipientLine}`,
    `详细地址 (ที่อยู่): ${w.address_cn}`,
    `邮政编码 (ไปรษณีย์): ${w.postal_code}`,
    `手机号码 (โทร): ${w.phone}`,
  ].join("\n");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shippingMarkText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API blocked (older mobile / insecure context) — fall
      // back to a hidden textarea + execCommand("copy")
      const ta = document.createElement("textarea");
      ta.value = shippingMarkText;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <article className="warehouse-card rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <header className="border-b border-border px-5 py-4 bg-primary-50/30">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-600">
          🇨🇳 {w.city_en}
        </p>
        <h2 className="mt-0.5 text-lg font-bold text-foreground">โกดัง{w.city_th}</h2>
        <p className="text-xs text-muted">{w.province_th}</p>
      </header>

      <div className="px-5 py-4 space-y-4">
        <p className="text-xs text-muted leading-relaxed">{w.highlight}</p>

        {/* Shipping mark block — main content */}
        <div className="rounded-xl border-2 border-dashed border-primary-300 bg-primary-50/20 p-4 space-y-1.5 font-mono text-[13px] leading-relaxed text-foreground">
          <ShippingRow label="收货人姓名 (ผู้รับ)"        value={recipientLine}    highlight />
          <ShippingRow label="详细地址 (ที่อยู่)"          value={w.address_cn} />
          <ShippingRow label="邮政编码 (ไปรษณีย์)"        value={w.postal_code} />
          <ShippingRow label="手机号码 (โทร)"             value={w.phone} />
        </div>

        <p className="text-[11px] text-muted">{w.hours_th}</p>

        <div className="flex flex-wrap gap-2 no-print">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-primary-700 transition-colors"
          >
            {copied ? "✓ คัดลอกแล้ว" : "📋 คัดลอกที่อยู่"}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface px-3.5 py-2 text-xs font-medium hover:bg-surface-alt"
          >
            🖨 พิมพ์สลาก
          </button>
        </div>
      </div>

      {/* Print styles — applied only when window.print() is invoked. We
         scope to body via @media print + hide every other card on the
         page so users get a single-mark A4 sheet. */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .warehouse-card,
          .warehouse-card * {
            visibility: visible;
          }
          .warehouse-card {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            border: none;
            box-shadow: none;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </article>
  );
}

function ShippingRow({
  label,
  value,
  highlight,
}: {
  label:     string;
  value:     string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-muted shrink-0 min-w-[170px]">{label}:</span>
      <span className={highlight ? "font-bold text-primary-700" : "text-foreground"}>
        {value}
      </span>
    </div>
  );
}
