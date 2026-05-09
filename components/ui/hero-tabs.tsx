"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type FieldType = { label: string; placeholder: string; type?: "text" | "select"; options?: string[] };
type TabConfig = { title: string; sub: string; fields: FieldType[]; submitLabel: string };

function FormField({ field }: { field: FieldType }) {
  const base =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent";
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <label className="text-xs font-medium text-muted">{field.label}</label>
      {field.type === "select" ? (
        <select className={base}>
          <option value="">{field.placeholder}</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type="text" placeholder={field.placeholder} className={base} />
      )}
    </div>
  );
}

interface HeroTabsProps {
  onActiveChange?: (i: number | null) => void;
}

export function HeroTabs({ onActiveChange }: HeroTabsProps) {
  const t = useTranslations("heroTabs");
  const [active, setActive] = useState<number | null>(null);

  const tabs: TabConfig[] = [
    {
      title: t("tab1Title"), sub: t("tab1Sub"),
      submitLabel: "ขอใบเสนอราคา",
      fields: [
        { label: "ประเภท", placeholder: "เลือกประเภท", type: "select", options: ["LCL", "FCL"] },
        { label: "ต้นทาง", placeholder: "เช่น Shanghai, China" },
        { label: "ปลายทาง", placeholder: "เช่น กรุงเทพฯ, ไทย" },
        { label: "น้ำหนัก / CBM", placeholder: "เช่น 500 kg / 2 CBM" },
      ],
    },
    {
      title: t("tab2Title"), sub: t("tab2Sub"),
      submitLabel: "ขอใบเสนอราคา",
      fields: [
        { label: "ต้นทาง", placeholder: "เช่น กวางโจว, จีน" },
        { label: "ปลายทาง", placeholder: "เช่น กรุงเทพฯ, ไทย" },
        { label: "ประเภทสินค้า", placeholder: "เช่น สินค้าทั่วไป" },
        { label: "น้ำหนัก (kg)", placeholder: "เช่น 1,000 kg" },
      ],
    },
    {
      title: t("tab3Title"), sub: t("tab3Sub"),
      submitLabel: "ขอใบเสนอราคา",
      fields: [
        { label: "ประเภท", placeholder: "เลือกประเภท", type: "select", options: ["นำเข้า", "ส่งออก"] },
        { label: "ต้นทาง", placeholder: "เช่น Beijing, China" },
        { label: "ปลายทาง", placeholder: "เช่น Suvarnabhumi, TH" },
        { label: "น้ำหนัก (kg)", placeholder: "เช่น 200 kg" },
      ],
    },
    {
      title: t("tab4Title"), sub: t("tab4Sub"),
      submitLabel: "ติดต่อเจ้าหน้าที่",
      fields: [
        { label: "ด่านศุลกากร", placeholder: "เช่น ท่าเรือแหลมฉบัง" },
        { label: "ประเภทสินค้า", placeholder: "เช่น อิเล็กทรอนิกส์" },
        { label: "เลขที่ใบขนสินค้า", placeholder: "เช่น 1101-XXXXXXXX" },
        { label: "เบอร์โทรติดต่อ", placeholder: "เช่น 08X-XXX-XXXX" },
      ],
    },
    {
      title: t("tab5Title"), sub: t("tab5Sub"),
      submitLabel: "ส่งรายการสั่งซื้อ",
      fields: [
        { label: "แพลตฟอร์ม", placeholder: "เลือกแพลตฟอร์ม", type: "select", options: ["1688", "Taobao", "Tmall", "Alibaba"] },
        { label: "ลิงก์สินค้า", placeholder: "วางลิงก์สินค้าที่นี่" },
        { label: "จำนวน (ชิ้น)", placeholder: "เช่น 100" },
        { label: "งบประมาณ (บาท)", placeholder: "เช่น 50,000" },
      ],
    },
    {
      title: t("tab6Title"), sub: t("tab6Sub"),
      submitLabel: "ขอใบเสนอราคา",
      fields: [
        { label: "สกุลเงิน", placeholder: "เลือกสกุลเงิน", type: "select", options: ["CNY (หยวน)", "USD (ดอลลาร์)", "EUR (ยูโร)", "JPY (เยน)"] },
        { label: "จำนวนเงิน", placeholder: "เช่น 10,000" },
        { label: "ประเทศปลายทาง", placeholder: "เช่น จีน" },
        { label: "วัตถุประสงค์", placeholder: "เช่น ชำระค่าสินค้า" },
      ],
    },
  ];

  function handleTabClick(i: number) {
    const next = active === i ? null : i;
    setActive(next);
    onActiveChange?.(next);
  }

  const cardOpen = active !== null;

  return (
    <div>
      {/* Tabs bar */}
      <div className="bg-white dark:bg-surface rounded-xl shadow-xl border border-border overflow-hidden">
        <div className="flex overflow-x-auto">
          {tabs.map((tab, i) => (
            <button
              key={tab.title}
              onClick={() => handleTabClick(i)}
              className={`group flex flex-1 min-w-0 flex-col items-center gap-0.5 px-4 py-3 text-center transition-colors border-b-2 ${
                active === i
                  ? "border-primary-500 bg-primary-50 dark:bg-primary-950"
                  : "border-transparent hover:bg-surface"
              }`}
            >
              <span className={`text-sm font-semibold whitespace-nowrap transition-colors ${active === i ? "text-primary-500" : "text-foreground"}`}>
                {tab.title}
              </span>
              <span className={`text-xs whitespace-nowrap transition-colors ${active === i ? "text-primary-400" : "text-muted"}`}>
                {tab.sub}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Form card — smooth open/close */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          cardOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        {active !== null && (
          <div className="mt-2 rounded-xl border border-border bg-white dark:bg-surface shadow-lg px-6 py-5">
            <div className="flex items-end gap-3">
              {tabs[active].fields.map((field) => (
                <FormField key={field.label} field={field} />
              ))}
              <div className="shrink-0 pb-0.5">
                <Button variant="primary" size="md">
                  {tabs[active].submitLabel}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
