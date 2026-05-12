"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminBarcodeScan } from "@/actions/admin/barcode";

const inputCls = "w-full rounded-lg border-2 border-primary-500 bg-white px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30";

type Mode = "intake" | "prepare" | "driver";

export function ScanForm() {
  const [mode, setMode] = useState<Mode>("intake");
  const [code, setCode] = useState("");
  const [log, setLog]   = useState<Array<{ ts: string; code: string; ok: boolean; msg: string }>>([]);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  useEffect(() => { inputRef.current?.focus(); }, [mode]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    const snapshot = code.trim();
    setCode("");
    startTransition(async () => {
      const res = await adminBarcodeScan({ mode, code: snapshot });
      const ts = new Date().toLocaleTimeString("th-TH");
      setLog((prev) => [{
        ts, code: snapshot,
        ok: res.ok,
        msg: res.ok ? (res.data?.message ?? "บันทึกแล้ว") : res.error,
      }, ...prev.slice(0, 49)]);
      if (res.ok) router.refresh();
      inputRef.current?.focus();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["intake", "prepare", "driver"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold border-2 transition-colors ${
              mode === m ? "bg-primary-500 text-white border-primary-500" : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {m === "intake"  && "📦 รับเข้าโกดัง"}
            {m === "prepare" && "🚚 เตรียมส่ง"}
            {m === "driver"  && "🛻 ปล่อยให้คนขับ"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border-2 border-primary-200 bg-primary-50/30 p-6 shadow-sm space-y-3">
        <label className="block space-y-2">
          <span className="text-sm font-bold">สแกนบาร์โค้ด (หรือพิมพ์เลข tracking / f_no / h_no)</span>
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputCls}
            placeholder="F260513-1, O260513-12, หรือ tracking CN/TH"
            autoComplete="off"
            disabled={pending}
          />
        </label>
        <Button type="submit" fullWidth disabled={pending}>
          {pending ? "..." : `บันทึก (${mode})`}
        </Button>
      </form>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-surface-alt/30 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-sm">บันทึกล่าสุด</h3>
          <span className="text-xs text-muted">{log.length}/50</span>
        </div>
        {log.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">รอสแกนรายการแรก</p>
        ) : (
          <ul className="divide-y divide-border max-h-[400px] overflow-y-auto">
            {log.map((entry, i) => (
              <li key={i} className={`px-4 py-2 text-xs flex items-center justify-between ${
                entry.ok ? "" : "bg-red-50"
              }`}>
                <div>
                  <span className="font-mono">{entry.code}</span>
                  <span className={`ml-2 ${entry.ok ? "text-green-700" : "text-red-700"}`}>
                    {entry.ok ? "✓" : "✗"} {entry.msg}
                  </span>
                </div>
                <span className="text-muted">{entry.ts}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
