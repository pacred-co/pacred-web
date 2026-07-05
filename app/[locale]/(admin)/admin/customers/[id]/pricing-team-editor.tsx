"use client";

/**
 * PricingTeamEditor — the collapsed "ทีม Pricing" control (owner 2026-07-05).
 *
 * Replaces the three side-by-side <ExtraRepEditor kind="interpreter|pricing|
 * purchaser"> chips with ONE compact control. Owner: "ตรง pricing ให้ย่อเหลือแค่
 * ช่องเดียวพอ · พอเลือกใครค่อยดึง row มาเทียบว่าเป็นล่าม หรือสั่งซื้อ หรือ ไพร้ซิ่ง."
 *
 * Interaction:
 *   1. The chip DISPLAYS the currently-assigned three people compactly
 *      (ล่าม=X · สั่งซื้อ=Y · Pricing=Z) so it stays self-explaining (§0g).
 *   2. Click "แก้ไข" → a small inline editor: pick a person (one selector) →
 *      pick a role (ล่าม / สั่งซื้อ / Pricing) → บันทึก assigns that person to
 *      the chosen role via the existing per-role action.
 *
 * ALL 3 assignee columns are PRESERVED in the data — commission needs to know
 * who did what ("จ่ายค่าคอมถูกคน"). This component just collapses the UI: one
 * selector at a time, three columns of state underneath.
 *
 * Writes go through the SAME server actions the old chips used:
 *   adminUpdateUserInterpreter → tb_users.adminIDInterpreter (ล่ามจีน)
 *   adminUpdateUserPurchaser   → tb_users.adminIDPurchaser  (ผู้สั่งซื้อ)
 *   adminUpdateUserPricing     → tb_users.adminIDPricing    (Pricing)
 * (all gated on WRITE_ROLES · logAdminAction · no money side-effects.)
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, X, Users } from "lucide-react";
import {
  adminUpdateUserInterpreter,
  adminUpdateUserPricing,
  adminUpdateUserPurchaser,
  type SalesAdminOption,
} from "@/actions/admin/customer-profile";

type TeamRole = "interpreter" | "purchaser" | "pricing";

const ROLE_CFG: Record<
  TeamRole,
  { label: string; action: (i: { userid: string; adminID: string }) => Promise<{ ok: boolean; error?: string }> }
> = {
  interpreter: { label: "ล่าม", action: adminUpdateUserInterpreter },
  purchaser: { label: "สั่งซื้อ", action: adminUpdateUserPurchaser },
  pricing: { label: "Pricing", action: adminUpdateUserPricing },
};
// Display order: ล่าม → สั่งซื้อ → Pricing.
const ROLE_ORDER: TeamRole[] = ["interpreter", "purchaser", "pricing"];

export function PricingTeamEditor({
  userid,
  interpreter,
  purchaser,
  pricing,
  admins,
}: {
  userid: string;
  interpreter: string | null;
  purchaser: string | null;
  pricing: string | null;
  admins: SalesAdminOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The three assigned people are kept as local state so the chip reflects a
  // save immediately (also refreshed server-side via router.refresh()).
  const [assigned, setAssigned] = useState<Record<TeamRole, string>>({
    interpreter: interpreter ?? "",
    purchaser: purchaser ?? "",
    pricing: pricing ?? "",
  });

  // Editor draft: which PERSON + which ROLE to assign them to.
  const [person, setPerson] = useState("");
  const [role, setRole] = useState<TeamRole>("interpreter");

  const shortOf = (adminID: string) => {
    if (!adminID) return "—";
    const found = admins.find((a) => a.adminID === adminID);
    return found ? found.nickname || found.adminID : adminID;
  };

  function save() {
    setError(null);
    if (!person) {
      setError("เลือกผู้ดูแลก่อน");
      return;
    }
    start(async () => {
      const res = await ROLE_CFG[role].action({ userid, adminID: person });
      if (!res.ok) {
        setError(res.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      // Pull the just-assigned person into the matching role slot (§0g compare).
      setAssigned((prev) => ({ ...prev, [role]: person }));
      setPerson("");
      setEditing(false);
      router.refresh();
    });
  }

  // ── Collapsed display chip — self-explaining (ทีม Pricing: ล่าม=X · สั่งซื้อ=Y · Pricing=Z) ──
  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-1 text-[11px]">
        <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
          <Users className="h-3 w-3" /> ทีม Pricing
        </span>
        {ROLE_ORDER.map((r) => (
          <span key={r} className="text-muted">
            {ROLE_CFG[r].label}=<span className="font-medium text-foreground">{shortOf(assigned[r])}</span>
          </span>
        ))}
        <button
          type="button"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
          className="shrink-0 text-primary-600 hover:text-primary-700"
          aria-label="แก้ไขทีม Pricing"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  // ── Inline editor — pick a person, pick a role, save ──
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px]">
      <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
        <Users className="h-3 w-3" /> ทีม Pricing
      </span>
      <select
        value={person}
        onChange={(e) => setPerson(e.target.value)}
        disabled={pending}
        aria-label="เลือกผู้ดูแล"
        className="max-w-[160px] rounded border border-border bg-white px-1 py-0.5 text-[11px] dark:bg-surface"
      >
        <option value="">— เลือกผู้ดูแล —</option>
        {admins.map((a) => (
          <option key={a.adminID} value={a.adminID}>
            {a.nickname ? `${a.nickname} · ` : ""}
            {a.name} ({a.adminID})
          </option>
        ))}
      </select>
      <span className="text-muted">เป็น</span>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as TeamRole)}
        disabled={pending}
        aria-label="เลือกบทบาท"
        className="rounded border border-border bg-white px-1 py-0.5 text-[11px] dark:bg-surface"
      >
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {ROLE_CFG[r].label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="text-primary-600 disabled:opacity-50"
        aria-label="บันทึก"
      >
        <Save className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => {
          setEditing(false);
          setError(null);
          setPerson("");
        }}
        disabled={pending}
        className="text-muted hover:text-foreground"
        aria-label="ยกเลิก"
      >
        <X className="h-3 w-3" />
      </button>
      {admins.length === 0 && <span className="text-amber-700">ไม่พบผู้ดูแลที่ active</span>}
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
