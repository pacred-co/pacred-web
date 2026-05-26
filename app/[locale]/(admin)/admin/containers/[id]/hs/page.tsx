import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { HsLinesEditor } from "./hs-lines-editor";

type HsCode = {
  code:             string;
  description:      string;
  default_duty_pct: number;
  unit:             string | null;
};

type HsLine = {
  id:            string;
  hs_code:       string;
  qty:           number;
  weight_kg:     number;
  value_thb:     number;
  duty_pct_used: number | null;
  note:          string | null;
  hs:            { code: string; description: string } | { code: string; description: string }[] | null;
};

function thb(n: number): string {
  return "฿" + n.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}
function normSingle<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export default async function ContainerHsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin  = createAdminClient();

  const { data: container, error: containerErr } = await admin
    .from("containers")
    .select("id, container_no, status, origin_warehouse, transport_type, total_weight_kg, total_volume_cbm")
    .eq("id", id)
    .maybeSingle<{
      id:               string;
      container_no:     string | null;
      status:           string;
      origin_warehouse: string | null;
      transport_type:   string;
      total_weight_kg:  number | null;
      total_volume_cbm: number | null;
    }>();

  if (containerErr) {
    console.error(`[containers lookup] failed`, { code: containerErr.code, message: containerErr.message, details: containerErr.details, hint: containerErr.hint });
    throw new Error(`Failed to load containers (${containerErr.code ?? "unknown"}): ${containerErr.message}`);
  }
  if (!container) notFound();

  const { data: lines, error: linesErr } = await admin
    .from("container_hs_lines")
    .select(`
      id, hs_code, qty, weight_kg, value_thb, duty_pct_used, note,
      hs:hs_codes!hs_code ( code, description )
    `)
    .eq("container_id", id)
    .order("created_at", { ascending: true });
  if (linesErr) {
    console.error(`[container_hs_lines list] failed`, { code: linesErr.code, message: linesErr.message });
  }

  const linesNorm = ((lines ?? []) as HsLine[]).map((l) => ({
    ...l,
    hs: normSingle(l.hs),
  }));

  const { data: hsCodesRaw, error: hsCodesRawErr } = await admin
    .from("hs_codes")
    .select("code, description, default_duty_pct, unit")
    .eq("is_active", true)
    .order("code", { ascending: true });
  if (hsCodesRawErr) {
    console.error(`[hs_codes list] failed`, { code: hsCodesRawErr.code, message: hsCodesRawErr.message });
  }
  const hsCodes = (hsCodesRaw ?? []) as HsCode[];

  // Aggregates
  const totalQty       = linesNorm.reduce((s, l) => s + Number(l.qty), 0);
  const totalWeight    = linesNorm.reduce((s, l) => s + Number(l.weight_kg), 0);
  const totalValue     = linesNorm.reduce((s, l) => s + Number(l.value_thb), 0);
  const estimatedDuty  = linesNorm.reduce(
    (s, l) => s + (Number(l.value_thb) * Number(l.duty_pct_used ?? 0)) / 100,
    0,
  );

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-5xl">
      <Link href={`/admin/containers/${container.id}`} className="text-xs text-primary-600 hover:underline">
        ← กลับ container detail
      </Link>

      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN</p>
        <h1 className="mt-1 text-2xl font-bold">
          HS code lines · <span className="font-mono">{container.container_no ?? "—"}</span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          {container.origin_warehouse} · {container.transport_type} · status {container.status}
        </p>
      </div>

      {/* Aggregate cards */}
      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="จำนวน (qty)"   value={totalQty.toLocaleString("th-TH")} />
        <Stat label="น้ำหนัก (kg)" value={totalWeight.toLocaleString("th-TH", { minimumFractionDigits: 2 })} />
        <Stat label="มูลค่า (THB)" value={thb(totalValue)} />
        <Stat label="อากรประมาณ"  value={thb(estimatedDuty)} tone="amber" />
      </section>

      {/* Editor */}
      <HsLinesEditor
        containerId={container.id}
        lines={linesNorm.map((l) => ({
          id:            l.id,
          hs_code:       l.hs_code,
          description:   l.hs?.description ?? "",
          qty:           Number(l.qty),
          weight_kg:     Number(l.weight_kg),
          value_thb:     Number(l.value_thb),
          duty_pct_used: l.duty_pct_used !== null ? Number(l.duty_pct_used) : null,
          note:          l.note,
        }))}
        hsCodes={hsCodes}
      />
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "amber";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-white dark:bg-surface border-border";
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-bold font-mono">{value}</p>
    </div>
  );
}
