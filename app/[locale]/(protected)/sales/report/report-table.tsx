"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { SalesCommission, TeamLeaderRole } from "@/actions/sales";

type StatusFilter = "all" | "unpaid" | "paid" | "cancelled";

const STATUS_BADGE: Record<SalesCommission["status"], string> = {
  unpaid:    "bg-yellow-50 text-yellow-700 border-yellow-200",
  paid:      "bg-green-50  text-green-700  border-green-200",
  cancelled: "bg-gray-50   text-gray-700   border-gray-200",
};

export function ReportTable({
  commissions,
  roles,
}: {
  commissions: SalesCommission[];
  roles:       TeamLeaderRole[];
}) {
  const t = useTranslations("sales");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [teamId, setTeamId] = useState<string>("all");

  const filtered = useMemo(() => {
    return commissions.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (teamId !== "all" && c.team_leader_id !== teamId) return false;
      return true;
    });
  }, [commissions, status, teamId]);

  const subtotal = filtered.reduce((s, c) => s + c.commission_amount, 0);

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      {/* Filter bar */}
      <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={status === "all"}       onClick={() => setStatus("all")}>{t("filterAll")}</FilterChip>
          <FilterChip active={status === "unpaid"}    onClick={() => setStatus("unpaid")}>{t("filterUnpaid")}</FilterChip>
          <FilterChip active={status === "paid"}      onClick={() => setStatus("paid")}>{t("filterPaid")}</FilterChip>
          <FilterChip active={status === "cancelled"} onClick={() => setStatus("cancelled")}>{t("filterCancelled")}</FilterChip>
        </div>
        {roles.length > 1 && (
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-lg border border-border bg-white dark:bg-surface px-3 py-1.5 text-sm"
          >
            <option value="all">{t("filterAllTeams")}</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.team_code}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="p-12 text-center text-sm text-muted">{t("noCommissionsInFilter")}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">{t("colCustomer")}</th>
                  <th className="px-4 py-3">{t("colReference")}</th>
                  <th className="px-4 py-3 text-right">{t("colBase")}</th>
                  <th className="px-4 py-3 text-right">{t("colPct")}</th>
                  <th className="px-4 py-3 text-right">{t("colCommission")}</th>
                  <th className="px-4 py-3">{t("colStatus")}</th>
                  <th className="px-4 py-3">{t("colEarnedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{c.customer_member_code ?? "—"}</div>
                      <div className="text-muted">{c.customer_name ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="rounded-full bg-primary-50 text-primary-700 px-2 py-0.5 border border-primary-200 text-[10px]">
                        {c.reference_type === "forwarder" ? t("refForwarder") : t("refOrder")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">฿{c.base_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right text-xs">{(c.commission_pct * 100).toFixed(2)}%</td>
                    <td className="px-4 py-3 text-right font-mono font-bold">฿{c.commission_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[c.status]}`}>
                        {t(`commissionStatus.${c.status}` as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{new Date(c.earned_at).toLocaleDateString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-alt/30 text-sm font-bold">
                <tr>
                  <td className="px-4 py-3" colSpan={4}>{t("subtotal", { count: filtered.length })}</td>
                  <td className="px-4 py-3 text-right font-mono">฿{subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
        active
          ? "bg-primary-500 text-white border-primary-500"
          : "bg-white dark:bg-surface text-foreground border-border hover:bg-surface-alt"
      }`}
    >
      {children}
    </button>
  );
}
