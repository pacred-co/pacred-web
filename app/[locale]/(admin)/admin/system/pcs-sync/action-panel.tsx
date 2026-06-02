"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { Play, FlaskConical, ChevronDown, ChevronUp } from "lucide-react";
import { runPcsSyncNow, testPcsEndpoint } from "@/actions/admin/pcs-sync";

/**
 * Action panel for /admin/system/pcs-sync.
 *
 *   - "Trigger sync ตอนนี้" — calls runPcsSyncNow() (same flow as cron)
 *   - "Test endpoint" — calls testPcsEndpoint() (last 1 hour) and shows raw JSON
 *
 * Both Server Actions are super-only; if a non-super opens this page they'll
 * see the buttons but get an "unauthorized" toast when clicking. Page is
 * already RBAC-gated at the route level so this is just belt+braces.
 */
export function PcsSyncActionPanel() {
  const router = useRouter();
  const [pendingSync, startSync] = useTransition();
  const [pendingTest, startTest] = useTransition();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testResp, setTestResp] = useState<unknown>(null);
  const [showRaw, setShowRaw] = useState(false);

  const onSync = () => {
    if (!confirm("รัน PCS sync เดี๋ยวนี้ (ดึงข้อมูลจาก PCS)?")) return;
    startSync(async () => {
      setSyncMsg("กำลังรัน…");
      const res = await runPcsSyncNow();
      if (res.ok) {
        const d = res.data!;
        setSyncMsg(
          `✓ ดึง ${d.rowsSeen} แถว · เขียน ${d.rowsUpserted} · ข้าม ${d.rowsSkippedNoMatch + d.rowsSkippedNoWrite} · fail ${d.rowsFailed} · ${d.durationMs}ms`,
        );
        router.refresh();
      } else {
        setSyncMsg(`✗ ${res.error}`);
      }
    });
  };

  const onTest = () => {
    startTest(async () => {
      setTestMsg("กำลังเทส…");
      setTestResp(null);
      const res = await testPcsEndpoint();
      if (res.ok) {
        const d = res.data!;
        setTestMsg(`✓ HTTP 200 · count=${d.response.count} · since=${d.since}`);
        setTestResp(d.response);
        setShowRaw(true);
      } else {
        setTestMsg(`✗ ${res.error}`);
        setTestResp(null);
      }
    });
  };

  return (
    <section className="bg-white rounded-lg border border-border p-4 space-y-3">
      <header>
        <h2 className="text-sm font-semibold text-foreground">เครื่องมือสำหรับ admin (super-only)</h2>
        <p className="text-[11px] text-muted mt-0.5">
          Trigger รันได้ทันที (ไม่ต้องรอ cron 10 นาที) หรือเทส endpoint เพื่อตรวจ contract
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pendingSync || pendingTest}
          onClick={onSync}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-100 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {pendingSync ? "กำลังรัน…" : "Trigger sync ตอนนี้"}
        </button>
        {syncMsg && <span className="text-[11px] text-muted self-center">{syncMsg}</span>}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
        <button
          type="button"
          disabled={pendingSync || pendingTest}
          onClick={onTest}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-alt disabled:opacity-50"
        >
          <FlaskConical className="w-3.5 h-3.5" />
          {pendingTest ? "กำลังเทส…" : "Test endpoint (1 hr ล่าสุด)"}
        </button>
        {testMsg && <span className="text-[11px] text-muted self-center">{testMsg}</span>}
      </div>

      {testResp !== null && (
        <div className="border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground"
          >
            {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Raw JSON response
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-border bg-surface-alt p-3 text-[10.5px] text-foreground/80 whitespace-pre-wrap break-words">
              {JSON.stringify(testResp, null, 2)}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
