import { Link } from "@/i18n/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeContainerMargin } from "@/lib/cost/container-margin";

/**
 * U2-2: Cost & margin panel on the container detail page.
 *
 * Renders:
 *   1. Margin summary (revenue · cost · margin · margin%)
 *   2. Rate-card lookup (matching container_costs by carrier + mode + route + container_type)
 *   3. Disbursement list (sum of container_disbursements rows attached to this container)
 *
 * Server component — must receive an admin Supabase client because
 * container_disbursements RLS is super/accounting-only.
 *
 * The "+ บันทึกค่าใช้จ่ายใหม่" CTA links to /admin/accounting/disbursements?container_code=...
 * which pre-fills the form for this container. Inline create on this
 * panel would mean shipping the client form here too — keep concerns
 * separated for V1; revisit if staff feedback says it's slow.
 */

const KIND_LABEL_TH: Record<string, string> = {
  freight:      "ค่าระวาง",
  customs_duty: "ภาษีศุลกากร",
  handling:     "handling/THC",
  fuel:         "fuel",
  storage:      "เช่า/demurrage",
  trucking:     "trucking",
  other:        "อื่นๆ",
};

function thb(n: number) {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export async function CostMarginPanel({
  admin,
  containerId,
  containerCode,
  transportMode,
  origin,
  destination,
}: {
  admin:         SupabaseClient;
  containerId:   string;
  containerCode: string | null;
  /** May be null on legacy / unmigrated rows. We skip the rate-card
   *  match query when any of the three are missing — staff would just
   *  see no matches anyway. */
  transportMode: string | null;
  origin:        string | null;
  destination:   string | null;
}) {
  const canQueryRates = !!transportMode && !!origin && !!destination;
  // ── 1) Margin ──
  const marginRes = await computeContainerMargin(admin, containerId);

  // ── 2) Active rate card matches for this route+mode (any carrier+container_type) ──
  // Loose match — show all currently-effective rows on this route+mode.
  // Staff eyeballs the right one (proper auto-match would need carrier
  // assignment on the container, which doesn't exist yet).
  const today = new Date().toISOString().slice(0, 10);
  type RateRow = {
    id: string; carrier_name: string; container_type: string;
    rate_per_cbm_thb: number | string | null; rate_per_kg_thb: number | string | null;
    minimum_charge_thb: number | string | null; fuel_surcharge_pct: number | string | null;
    effective_from: string; effective_to: string | null;
  };
  let rates: RateRow[] = [];
  if (canQueryRates) {
    const { data: rateRows } = await admin
      .from("container_costs")
      .select("id, carrier_name, container_type, rate_per_cbm_thb, rate_per_kg_thb, minimum_charge_thb, fuel_surcharge_pct, effective_from, effective_to")
      .eq("transport_mode", transportMode!)
      .eq("origin", origin!)
      .eq("destination", destination!)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("carrier_name", { ascending: true })
      .limit(20);
    rates = (rateRows ?? []) as RateRow[];
  }

  // ── 3) Disbursement rows for this container ──
  const { data: disbRows } = await admin
    .from("container_disbursements")
    .select("id, kind, amount_thb, vendor_name, invoice_no, paid_at, note, created_at")
    .eq("cargo_container_id", containerId)
    .order("created_at", { ascending: false })
    .limit(50);
  type DisbRow = {
    id: string; kind: string; amount_thb: number | string;
    vendor_name: string; invoice_no: string | null;
    paid_at: string | null; note: string | null; created_at: string;
  };
  const disbursements = (disbRows ?? []) as DisbRow[];

  const addDisbHref = containerCode
    ? `/admin/accounting/disbursements?container_code=${encodeURIComponent(containerCode)}`
    : `/admin/accounting/disbursements`;

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-sm">💰 Cost &amp; margin (U2-2)</h2>
          <p className="text-[11px] text-muted mt-0.5">
            super + accounting · revenue (forwarder.total_price) − cost (disbursements)
          </p>
        </div>
        <Link
          href={addDisbHref}
          className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100"
        >
          + บันทึกค่าใช้จ่าย
        </Link>
      </div>

      {/* Margin summary */}
      <div className="p-5 border-b border-border">
        {!marginRes.ok ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            คำนวณ margin ไม่สำเร็จ: {marginRes.error}
          </div>
        ) : (
          <div className="grid sm:grid-cols-4 gap-3">
            <MarginCell
              label="รายรับ"
              value={thb(marginRes.data.total_revenue_thb)}
              tone="green"
              hint={`${marginRes.data.details.revenue.forwarder_count} forwarders`}
            />
            <MarginCell
              label="ต้นทุน (AP)"
              value={thb(marginRes.data.total_cost_thb)}
              tone="red"
              hint={`${marginRes.data.details.cost.disbursement_count} disbursements`}
            />
            <MarginCell
              label="กำไร (margin)"
              value={thb(marginRes.data.margin_thb)}
              tone={marginRes.data.margin_thb > 0 ? "green" : marginRes.data.margin_thb < 0 ? "red" : undefined}
              hint={marginRes.data.margin_thb < 0 ? "⚠ billed below cost" : undefined}
            />
            <MarginCell
              label="margin %"
              value={marginRes.data.margin_pct == null ? "—" : `${marginRes.data.margin_pct.toFixed(2)}%`}
              tone={
                marginRes.data.margin_pct == null ? undefined
                : marginRes.data.margin_pct > 0 ? "green"
                : marginRes.data.margin_pct < 0 ? "red"
                : undefined
              }
            />
          </div>
        )}
      </div>

      {/* Rate-card matches */}
      <div className="p-5 border-b border-border">
        <h3 className="font-bold text-xs uppercase tracking-wide text-muted mb-2">
          📋 Rate cards ที่ตรงกับ route นี้ ({transportMode ?? "—"} · {origin ?? "—"} → {destination ?? "—"})
        </h3>
        {!canQueryRates ? (
          <p className="text-[12px] text-muted italic">
            ตู้นี้ไม่มี transport_mode / origin / destination ครบ — เพิ่ม metadata ตู้ก่อนถึงจะค้น rate ได้
          </p>
        ) : rates.length === 0 ? (
          <p className="text-[12px] text-muted italic">
            ยังไม่มี rate card ที่ตรงกับ route นี้ —{" "}
            <Link href="/admin/accounting/container-costs" className="underline text-primary-600">
              เพิ่ม rate card →
            </Link>
          </p>
        ) : (
          <ul className="space-y-2 text-xs">
            {rates.map((r) => {
              const cbm = r.rate_per_cbm_thb != null ? Number(r.rate_per_cbm_thb) : null;
              const kg  = r.rate_per_kg_thb  != null ? Number(r.rate_per_kg_thb)  : null;
              const min = r.minimum_charge_thb != null ? Number(r.minimum_charge_thb) : null;
              const fp  = r.fuel_surcharge_pct != null ? Number(r.fuel_surcharge_pct) : null;
              return (
                <li key={r.id} className="rounded border border-border bg-surface-alt/30 px-3 py-2 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-medium font-mono">
                      {r.carrier_name} <span className="text-muted">·</span> {r.container_type}
                    </p>
                    <p className="text-muted text-[11px]">
                      ตั้งแต่ {new Date(r.effective_from).toLocaleDateString("th-TH")}
                      {r.effective_to && <> ถึง {new Date(r.effective_to).toLocaleDateString("th-TH")}</>}
                      {!r.effective_to && <> · กำลังใช้</>}
                    </p>
                  </div>
                  <div className="text-right space-y-0.5 text-[11px] font-mono">
                    {cbm != null && <p>{thb(cbm)} / CBM</p>}
                    {kg  != null && <p>{thb(kg)} / kg</p>}
                    {min != null && <p className="text-muted">min: {thb(min)}</p>}
                    {fp  != null && fp > 0 && <p className="text-amber-700">+ {fp.toFixed(2)}% fuel</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Disbursement list */}
      <div className="p-5">
        <h3 className="font-bold text-xs uppercase tracking-wide text-muted mb-2">
          💸 ค่าใช้จ่ายจริง (AP ledger · {disbursements.length} รายการ)
        </h3>
        {disbursements.length === 0 ? (
          <p className="text-[12px] text-muted italic">
            ยังไม่มี disbursement สำหรับตู้นี้ —{" "}
            <Link href={addDisbHref} className="underline text-primary-600">
              บันทึกค่าใช้จ่ายแรก →
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border text-xs">
            {disbursements.map((d) => (
              <li key={d.id} className="py-2 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="text-muted">[{KIND_LABEL_TH[d.kind] ?? d.kind}]</span>{" "}
                    {d.vendor_name}
                  </p>
                  {(d.invoice_no || d.note) && (
                    <p className="text-[11px] text-muted">
                      {d.invoice_no && <>inv: <span className="font-mono">{d.invoice_no}</span></>}
                      {d.invoice_no && d.note && " · "}
                      {d.note}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold text-red-700">{thb(Number(d.amount_thb))}</p>
                  <p className="text-[10px] text-muted">
                    {d.paid_at
                      ? `ชำระ ${new Date(d.paid_at).toLocaleDateString("th-TH")}`
                      : <span className="text-amber-700">รอชำระ</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MarginCell({
  label, value, tone, hint,
}: {
  label: string;
  value: string;
  tone?:  "green" | "red";
  hint?: string;
}) {
  const color = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-foreground";
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-bold font-mono ${color}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  );
}
