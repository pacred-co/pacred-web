"use client";

/**
 * Tracking search box on the warehouse home — faithful to the legacy
 * "ค้นหาหมายเลข Tracking..." field with the red magnifier button.
 *
 * owner/ภูม 2026-07-30: พนักงานคลังพิมพ์/สแกน "แทรคเดียว" แล้วกดค้นหา → พาไปพัสดุนั้น
 * เลย (/admin/forwarders/[fNo]) ไม่ต้องเด้งไปหน้า "วางหลายแทรค" แล้วให้กดค้นซ้ำ.
 *   - เจอ forwarder เดียว → ไปหน้านั้นทันที
 *   - ไม่พบ → โชว์ข้อความใต้ช่อง (ไม่เด้งไปไหน)
 *   - แทรคเดียวชนหลาย forwarder (หายาก) → ไปหน้า bulk-search แจงเอง
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Search, Loader2 } from "lucide-react";
import { resolveTrackingToForwarder } from "@/actions/admin/resolve-tracking";

export function HomeTrackingSearch() {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function go() {
    const q = value.trim();
    if (!q || pending) return;
    setMsg(null);
    startTransition(async () => {
      const res = await resolveTrackingToForwarder(q);
      if (!res.ok || !res.data) {
        setMsg("ค้นหาไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      const r = res.data;
      if (r.kind === "one") {
        router.push(`/admin/forwarders/${r.fid}`);
        return;
      }
      if (r.kind === "none") {
        setMsg(`ไม่พบพัสดุที่มีแทรคกิ้ง "${q}"`);
        return;
      }
      // แทรคเดียวชนหลาย forwarder → ไปหน้ารวมให้เลือก
      router.push(`/admin/forwarders/bulk-search?q=${encodeURIComponent(q)}`);
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-stretch overflow-hidden rounded-full border-2 border-[#ffb0b7] bg-white">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (msg) setMsg(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") go();
          }}
          inputMode="search"
          disabled={pending}
          placeholder="ค้นหาหมายเลข Tracking..."
          className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={go}
          disabled={pending}
          aria-label="ค้นหา"
          className="flex items-center justify-center bg-[#cc3333] px-4 text-white active:bg-[#b22a2a] disabled:opacity-70"
        >
          {pending ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.2} /> : <Search className="h-5 w-5" strokeWidth={2.2} />}
        </button>
      </div>
      {msg && <p className="px-2 text-xs text-amber-700">{msg}</p>}
    </div>
  );
}
