import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeForwarderDebitBatch,
  type ForwarderDebitBatch,
  type ForwarderDebitRow,
} from "@/lib/forwarder/forwarder-debit-total";
import { resolveMaoAnchorIds } from "@/lib/forwarder/mao-anchor";

type Result =
  | { ok: true; batch: ForwarderDebitBatch; missingIds: string[] }
  | { ok: false; error: string };

/** Load and calculate one linked forwarder payment with the production money engine. */
export async function loadLinkedForwarderPaymentBatch(
  admin: SupabaseClient,
  args: { userId: string; forwarderIds: ReadonlyArray<string | number> },
): Promise<Result> {
  const ids = Array.from(
    new Set(args.forwarderIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)),
  ).sort((a, b) => a - b);
  if (ids.length === 0) return { ok: false, error: "no_forwarder_ids" };

  const { data: corp, error: corpErr } = await admin
    .from("tb_corporate")
    .select("id")
    .eq("userid", args.userId)
    .limit(1)
    .maybeSingle<{ id: number }>();
  if (corpErr) return { ok: false, error: `corporate_lookup:${corpErr.code ?? "unknown"}` };

  const { data, error } = await admin
    .from("tb_forwarder")
    .select(
      "id,fshipby,paymethod,ftotalprice,ftransportprice,fpriceupdate,fshippingservice,pricecrate,ftransportpricechnthb,priceother,fdiscount,ftrackingchn,fcabinetnumber",
    )
    .eq("userid", args.userId)
    .in("id", ids)
    .order("id", { ascending: true });
  if (error) return { ok: false, error: `forwarder_lookup:${error.code ?? "unknown"}` };

  const rows = (data ?? []) as ForwarderDebitRow[];
  const found = new Set(rows.map((row) => String(row.id)));
  const missingIds = ids.map(String).filter((id) => !found.has(id));
  const maoAnchorIds = await resolveMaoAnchorIds(admin, rows.map((row) => row.ftrackingchn));
  const batch = computeForwarderDebitBatch(rows, {
    userId: args.userId,
    isCorporate: corp != null,
    maoAnchorIds,
  });
  return { ok: true, batch, missingIds };
}
