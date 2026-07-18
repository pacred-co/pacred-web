"use client";

/**
 * Tracking search box on the warehouse home — faithful to the legacy
 * "ค้นหาหมายเลข Tracking..." field with the red magnifier button. Routes the
 * worker to the container/tracking report where the lookup happens.
 */

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Search } from "lucide-react";

export function HomeTrackingSearch() {
  const [value, setValue] = useState("");
  const router = useRouter();

  function go() {
    const q = value.trim();
    router.push(q ? `/admin/report-cnt?find=${encodeURIComponent(q)}` : "/admin/report-cnt");
  }

  return (
    <div className="flex items-stretch overflow-hidden rounded-full border-2 border-[#ffb0b7] bg-white">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go();
        }}
        inputMode="search"
        placeholder="ค้นหาหมายเลข Tracking..."
        className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={go}
        aria-label="ค้นหา"
        className="flex items-center justify-center bg-[#cc3333] px-4 text-white active:bg-[#b22a2a]"
      >
        <Search className="h-5 w-5" strokeWidth={2.2} />
      </button>
    </div>
  );
}
