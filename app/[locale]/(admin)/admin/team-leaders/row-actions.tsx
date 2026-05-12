"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminToggleTeamLeader, adminUpdateTeamLeaderPct } from "@/actions/admin/team-leaders";

export function TeamLeaderRowActions({ id, isActive, commissionPct }: { id: string; isActive: boolean; commissionPct: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pctPct, setPctPct] = useState((commissionPct * 100).toFixed(2));
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    startTransition(async () => {
      const res = await adminToggleTeamLeader({ id, is_active: !isActive });
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }
  function savePct() {
    const pct = Number(pctPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { setError("0-100"); return; }
    startTransition(async () => {
      const res = await adminUpdateTeamLeaderPct({ id, commission_pct: pct / 100 });
      if (res.ok) { setEditing(false); router.refresh(); }
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-1">
      {error && <div className="text-[10px] text-red-700">{error}</div>}
      <div className="flex items-center gap-1">
        {editing ? (
          <>
            <input
              type="number" min="0" max="100" step="0.01"
              value={pctPct} onChange={(e) => setPctPct(e.target.value)}
              className="w-16 rounded border border-border px-1 py-0.5 text-xs"
            />
            <Button size="sm" type="button" onClick={savePct} disabled={pending}>OK</Button>
            <Button size="sm" variant="outline" type="button" onClick={() => setEditing(false)}>×</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" type="button" onClick={() => setEditing(true)}>แก้ %</Button>
        )}
        <Button size="sm" variant="outline" type="button" onClick={toggle} disabled={pending}>
          {isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
        </Button>
      </div>
    </div>
  );
}
