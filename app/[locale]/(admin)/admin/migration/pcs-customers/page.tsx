// U2-1 · PCS → Pacred customer migration admin page.
// Per docs/UPGRADE_PLAN.md §2 U2-1 + runbook docs/runbook/u2-1-pcs-customer-migration.md.
//
// One-shot launch-week job: drains pcs_legacy_customers_staging into auth.users +
// profiles. Super-only — bulk-creates auth identities + touches sequence offset.

import { Link } from "@/i18n/navigation";
import { ChevronRight, Database, Home } from "lucide-react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { RunBackfillPanel } from "./run-backfill-panel";

export const dynamic = "force-dynamic";  // reads session cookies

type StatusRow = {
  staging_rows:              number;
  staging_pending:           number;
  staging_done:              number;
  migrated_profiles:         number;
  member_code_seq_current:   number;
  max_legacy_num_in_staging: number;
  max_member_code_num:       number;
};

export default async function PcsMigrationPage() {
  // super-only — backfill creates auth.users in bulk + touches member_code_seq.
  await requireAdmin(["super"]);

  const admin = createAdminClient();
  const { data: status, error: statusErr } = await admin
    .from("v_pcs_migration_status")
    .select("*")
    .maybeSingle<StatusRow>();
  if (statusErr) {
    console.error(`[v_pcs_migration_status list] failed`, { code: statusErr.code, message: statusErr.message });
  }

  const seqOffsetOk = status ? status.member_code_seq_current > status.max_legacy_num_in_staging : true;

  return (
    <main className="p-6 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600 inline-flex items-center gap-1">
          <Home className="w-3.5 h-3.5" /> Admin
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-medium">PCS → Pacred migration</span>
      </nav>

      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 dark:bg-primary-900/20 text-primary-600">
          <Database className="h-6 w-6" />
        </div>
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · U2-1</p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold">PCS → Pacred customer migration</h1>
          <p className="text-xs text-muted mt-0.5">
            One-shot backfill of legacy <code>tb_users</code> rows → Pacred <code>profiles</code>.
            Re-stamps <code>PCS&lt;n&gt;</code> → <code>PR&lt;n&gt;</code>. Idempotent.
          </p>
        </div>
      </div>

      {/* Status panel */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Migration status</h2>
        </div>
        <div className="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Staging total"     value={status?.staging_rows ?? 0} />
          <Stat label="Pending backfill"  value={status?.staging_pending ?? 0} accent={status && status.staging_pending > 0 ? "amber" : undefined} />
          <Stat label="Done"              value={status?.staging_done ?? 0} accent="green" />
          <Stat label="Migrated profiles" value={status?.migrated_profiles ?? 0} accent="green" />
          <Stat label="Highest PCS<n> in staging" value={status?.max_legacy_num_in_staging ?? 0} />
          <Stat label="Highest PR<n> in profiles" value={status?.max_member_code_num ?? 0} />
          <Stat label="member_code_seq (current)" value={status?.member_code_seq_current ?? 0}
            accent={seqOffsetOk ? "green" : "red"} />
          <Stat label="Sequence offset OK?" value={seqOffsetOk ? "YES" : "NO — re-apply migration 0067"}
            accent={seqOffsetOk ? "green" : "red"} />
        </div>
      </div>

      {/* Runbook reminder */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-4 text-sm text-amber-900 dark:text-amber-200 space-y-2">
        <p className="font-semibold">Before you run the backfill:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>Export legacy <code>tb_users</code> to CSV per the runbook.</li>
          <li>Load CSV → <code>pcs_legacy_customers_staging</code> via Supabase SQL Editor.</li>
          <li>Apply <code>0067_pcs_customer_migration.sql</code> (offsets <code>member_code_seq</code>).</li>
          <li>Confirm <strong>Sequence offset OK = YES</strong> in the panel above.</li>
          <li>Click <em>Dry run</em> first, then <em>Run backfill</em> in batches of 500.</li>
          <li>Verify migrated count matches expected total.</li>
        </ol>
        <p className="text-xs">
          See <code>docs/runbook/u2-1-pcs-customer-migration.md</code> for the full step-by-step.
        </p>
      </div>

      {/* Run panel */}
      <RunBackfillPanel />
    </main>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: "amber" | "green" | "red" }) {
  const klass =
    accent === "amber" ? "border-amber-200 bg-amber-50 text-amber-700" :
    accent === "green" ? "border-green-200 bg-green-50 text-green-700" :
    accent === "red"   ? "border-red-200 bg-red-50 text-red-700" :
                         "border-border bg-surface";
  return (
    <div className={`rounded-lg border px-3 py-2 ${klass}`}>
      <p className="text-[11px] uppercase tracking-wider font-semibold opacity-70">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
