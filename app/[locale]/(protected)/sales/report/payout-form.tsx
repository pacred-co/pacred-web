"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { requestPayout, type SalesCommission, type TeamLeaderRole } from "@/actions/sales";

const inputCls = "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

type Props = {
  commissions: SalesCommission[];     // unpaid only
  roles:       TeamLeaderRole[];
};

export function PayoutForm({ commissions, roles }: Props) {
  const t = useTranslations("sales");
  const router = useRouter();

  // Group commissions by team leader (a leader can have multiple roles)
  const [activeLeaderId, setActiveLeaderId] = useState<string>(roles[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bank, setBank] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ amount: number } | null>(null);
  const [pending, startTransition] = useTransition();

  const visibleCommissions = useMemo(
    () => commissions.filter((c) => c.team_leader_id === activeLeaderId),
    [commissions, activeLeaderId],
  );

  const selectedCommissions = useMemo(
    () => visibleCommissions.filter((c) => selected.has(c.id)),
    [visibleCommissions, selected],
  );

  const totalAmount = useMemo(
    () => selectedCommissions.reduce((s, c) => s + c.commission_amount, 0),
    [selectedCommissions],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllVisible() {
    if (selected.size === visibleCommissions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleCommissions.map((c) => c.id)));
    }
  }

  function switchLeader(id: string) {
    setActiveLeaderId(id);
    setSelected(new Set());
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected.size === 0) {
      setError(t("selectAtLeastOne"));
      return;
    }
    startTransition(async () => {
      const res = await requestPayout({
        commission_ids: Array.from(selected),
        bank_name:      bank,
        account_name:   accountName,
        account_number: accountNumber,
        note:           note || undefined,
      });
      if (res.ok && res.data) {
        setDone({ amount: res.data.amount_total });
        router.refresh();
      } else if (!res.ok) {
        setError(res.error);
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center space-y-3">
        <h2 className="text-xl font-bold text-green-800">{t("payoutRequestedTitle")}</h2>
        <p className="text-sm text-green-700">
          {t("payoutRequestedSubtitle", { amount: done.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 }) })}
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" type="button" onClick={() => router.push("/sales/history")}>
            {t("viewHistory")}
          </Button>
          <Button type="button" onClick={() => router.push("/sales")}>
            {t("backToOverview")}
          </Button>
        </div>
      </div>
    );
  }

  if (commissions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted">{t("noUnpaidCommissions")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid lg:grid-cols-[1fr_360px] gap-6">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        {/* Tabs for multi-team leaders */}
        {roles.length > 1 && (
          <div className="flex gap-2 border-b border-border">
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => switchLeader(r.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 ${
                  activeLeaderId === r.id ? "border-primary-500 text-primary-600" : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {r.team_code}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between border-b border-border">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={visibleCommissions.length > 0 && selected.size === visibleCommissions.length}
                onChange={toggleAllVisible}
              />
              <span>{t("selectAll", { selected: selected.size, total: visibleCommissions.length })}</span>
            </label>
          </div>
          {visibleCommissions.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">{t("noUnpaidForTeam")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 w-10"></th>
                  <th className="px-4 py-3">{t("colCustomer")}</th>
                  <th className="px-4 py-3">{t("colReference")}</th>
                  <th className="px-4 py-3 text-right">{t("colBase")}</th>
                  <th className="px-4 py-3 text-right">{t("colPct")}</th>
                  <th className="px-4 py-3 text-right">{t("colCommission")}</th>
                  <th className="px-4 py-3">{t("colEarnedAt")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleCommissions.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
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
                    <td className="px-4 py-3 text-xs text-muted">{new Date(c.earned_at).toLocaleDateString("th-TH")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Payout form sidebar */}
      <aside className="lg:sticky lg:top-20 self-start space-y-4">
        <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-5 shadow-sm">
          <h3 className="font-bold text-sm mb-3">{t("payoutSummary")}</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span>{t("selected")}</span><span>{selected.size}</span></div>
            <hr className="border-primary-200" />
            <div className="flex justify-between font-bold text-base">
              <span>{t("requestAmount")}</span>
              <span className="font-mono">฿{totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-sm">{t("bankInfo")}</h3>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium">{t("bankName")}<span className="text-red-600 ml-0.5">*</span></span>
            <input value={bank} onChange={(e) => setBank(e.target.value)} className={inputCls} required placeholder={t("bankPlaceholder")} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium">{t("accountName")}<span className="text-red-600 ml-0.5">*</span></span>
            <input value={accountName} onChange={(e) => setAccountName(e.target.value)} className={inputCls} required />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium">{t("accountNumber")}<span className="text-red-600 ml-0.5">*</span></span>
            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className={inputCls} required />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium">{t("note")}</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </label>
        </div>

        <Button type="submit" fullWidth disabled={pending || selected.size === 0 || !bank || !accountName || !accountNumber}>
          {pending ? t("submitting") : t("submitPayout")}
        </Button>
      </aside>
    </form>
  );
}
