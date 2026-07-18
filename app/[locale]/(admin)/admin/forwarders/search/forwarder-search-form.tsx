"use client";

/**
 * ค้นหารายการฝากนำเข้าสินค้า — the clean dedicated search page, a faithful port
 * of legacy `forwarder-search.php` (the owner: warehouse staff need the tidy
 * search box, NOT the full 549-row import list dumped on click).
 *
 * Legacy has a `keyType` selector (ทั้งหมด · เลขแทรคกิ้ง · ID CO · เลขตู้ · วันปิดตู้ ·
 * เลขที่นำเข้า · รหัสลูกค้า · เลขที่ฝากสั่ง) + a search box. Our `/admin/forwarders`
 * list already searches ALL of those via `?q=` — so the selector drives the box
 * PLACEHOLDER (guides the worker) and Search routes to the FILTERED list (reuse
 * the proven search + result table · no duplicated query logic).
 */

import { useState } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { Search, ShoppingCart } from "lucide-react";

const KEY_TYPES: { value: string; label: string; hint: string }[] = [
  { value: "all",      label: "ทั้งหมด",        hint: "พิมพ์คำค้นหา..." },
  { value: "tracking", label: "เลขแทรคกิ้ง",    hint: "พิมพ์เลขแทรคกิ้ง (จีน/ไทย)..." },
  { value: "idco",     label: "เลข ID CO",      hint: "พิมพ์เลข ID CO..." },
  { value: "cabinet",  label: "เลขตู้",         hint: "พิมพ์เลขตู้ (เช่น GZE260714-1)..." },
  { value: "closedate",label: "วันที่ปิดตู้",   hint: "พิมพ์วันที่ปิดตู้ YYYY-MM-DD..." },
  { value: "fno",      label: "เลขที่นำเข้า",   hint: "พิมพ์เลขที่นำเข้า..." },
  { value: "member",   label: "รหัสลูกค้า",     hint: "พิมพ์รหัสลูกค้า (PR####)..." },
  { value: "shop",     label: "เลขที่ฝากสั่ง",  hint: "พิมพ์เลขที่ฝากสั่ง..." },
];

export function ForwarderSearchForm() {
  const [keyType, setKeyType] = useState("all");
  const [value, setValue] = useState("");
  const router = useRouter();

  const placeholder = KEY_TYPES.find((k) => k.value === keyType)?.hint ?? "พิมพ์คำค้นหา...";

  function go() {
    const q = value.trim();
    if (!q) return;
    router.push(`/admin/forwarders?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="mx-auto mt-6 max-w-3xl">
      <h1 className="text-center text-xl font-bold text-[#cc3333]">ค้นหารายการฝากนำเข้าสินค้า</h1>

      {/* option row — selector + shop-order search shortcut */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <span>ตัวเลือกค้นหา <span className="text-gray-400">(*วันที่ปิดตู้ YYYY-MM-DD)</span></span>
          <select
            value={keyType}
            onChange={(e) => setKeyType(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:border-[#cc3333] focus:outline-none"
          >
            {KEY_TYPES.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <Link
          href="/admin/service-orders"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7b2ff7] to-[#1e9ff2] px-4 py-1.5 text-sm font-medium text-white shadow-sm active:opacity-90"
        >
          <ShoppingCart className="h-4 w-4" strokeWidth={2} />
          ค้นหาฝากสั่งซื้อ
        </Link>
      </div>

      {/* the search box + red magnifier (matches legacy) */}
      <div className="mt-4 flex items-stretch overflow-hidden rounded-full border-2 border-[#ffb0b7] bg-white">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
          inputMode="search"
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-5 py-3 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={go}
          aria-label="ค้นหา"
          className="flex items-center justify-center bg-[#cc3333] px-5 text-white active:bg-[#b22a2a]"
        >
          <Search className="h-5 w-5" strokeWidth={2.2} />
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-gray-400">
        พิมพ์คำค้นหาแล้วกดค้นหา — ระบบจะแสดงเฉพาะรายการที่ตรง (ไม่ใช่ทั้งหมด)
      </p>
    </div>
  );
}
