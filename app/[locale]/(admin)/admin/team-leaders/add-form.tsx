"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminCreateTeamLeader } from "@/actions/admin/team-leaders";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Group = { code: string; name: string };

export function AddTeamLeaderForm({ groups }: { groups: Group[] }) {
  const router = useRouter();
  const [profileId, setProfileId]   = useState("");
  const [teamCode,  setTeamCode]    = useState(groups[0]?.code ?? "");
  const [pctPct,    setPctPct]      = useState("1");          // entered as percent, e.g. "1" = 1%
  const [error, setError]           = useState<string | null>(null);
  const [msg,   setMsg]             = useState<string | null>(null);
  const [pending, startTransition]  = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setMsg(null);
    const pct = Number(pctPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError("% ต้องอยู่ระหว่าง 0-100");
      return;
    }
    startTransition(async () => {
      const res = await adminCreateTeamLeader({
        profile_id:     profileId,
        team_code:      teamCode,
        commission_pct: pct / 100,
      });
      if (res.ok) {
        setMsg("เพิ่มแล้ว");
        setProfileId(""); setPctPct("1");
        router.refresh();
        setTimeout(() => setMsg(null), 3000);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">เพิ่มหัวหน้าทีม</h3>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      {msg   && <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>}

      <label className="block space-y-1">
        <span className="text-xs font-medium">Profile UUID</span>
        <input value={profileId} onChange={(e) => setProfileId(e.target.value)} className={inputCls} required placeholder="copy จาก /admin/customers" />
        <span className="block text-[10px] text-muted">ดู uuid ที่ /admin/customers หรือ Supabase profiles</span>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">ทีม (customer_group)</span>
        <select value={teamCode} onChange={(e) => setTeamCode(e.target.value)} className={inputCls}>
          {groups.map((g) => (
            <option key={g.code} value={g.code}>{g.code} — {g.name}</option>
          ))}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">ค่าคอม %</span>
        <input type="number" min="0" max="100" step="0.01" value={pctPct} onChange={(e) => setPctPct(e.target.value)} className={inputCls} required />
        <span className="block text-[10px] text-muted">เช่น 1 = 1% (เก็บใน DB เป็น 0.01)</span>
      </label>

      <Button type="submit" fullWidth disabled={pending}>
        {pending ? "กำลังเพิ่ม..." : "เพิ่ม"}
      </Button>
    </form>
  );
}
