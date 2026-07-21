import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { splitShopTrackingTokens, type LinkedForwarderArrivalRow } from "./shop-order-status-rule";

export type LinkedShopForwarder = LinkedForwarderArrivalRow & {
  id: number;
  userid: string | null;
  reforder: string | null;
  ftrackingchn: string | null;
  fstatus: string | null;
  fcabinetnumber: string | null;
};

/**
 * Load every non-cancelled import row linked to one shop order.
 *
 * Migration 0268 owns the canonical DB match: explicit reforder OR same-user
 * tracking-family match (comma-tokenised + MOMO `-N[/M]` base-aware). The
 * two-query fallback keeps pages usable during the migration rollout window;
 * it is exact-token only and logs loudly so it cannot masquerade as parity.
 */
export async function loadLinkedShopForwarders(
  admin: SupabaseClient,
  hno: string,
): Promise<LinkedShopForwarder[]> {
  const key = (hno ?? "").trim();
  if (!key) return [];

  const { data: rpcRows, error: rpcErr } = await admin.rpc("get_linked_shop_forwarders", {
    p_hno: key,
  });
  if (!rpcErr) {
    return ((rpcRows ?? []) as LinkedShopForwarder[]).filter(
      (row) => (row.fstatus ?? "").trim() !== "99",
    );
  }

  // Rollout fallback: migration may not have reached this environment yet.
  // Preserve the previous exact-link behaviour, but tokenize comma bags and
  // scope every query through the order's owner.
  console.error("[loadLinkedShopForwarders] canonical RPC unavailable; exact fallback active", {
    hno: key,
    code: rpcErr.code,
    message: rpcErr.message,
  });

  const { data: header, error: headerErr } = await admin
    .from("tb_header_order")
    .select("userid")
    .eq("hno", key)
    .maybeSingle<{ userid: string | null }>();
  if (headerErr || !header?.userid) return [];

  const { data: orderRows, error: orderErr } = await admin
    .from("tb_order")
    .select("ctrackingnumber")
    .eq("hno", key)
    .limit(10_000);
  if (orderErr) return [];
  const tokens = Array.from(new Set(
    (orderRows ?? []).flatMap((row) => splitShopTrackingTokens(row.ctrackingnumber)),
  ));

  const columns = "id,userid,reforder,ftrackingchn,fstatus,fcabinetnumber";
  const [byRef, byTracking] = await Promise.all([
    admin
      .from("tb_forwarder")
      .select(columns)
      .eq("userid", header.userid)
      .eq("reforder", key)
      .neq("fstatus", "99")
      .limit(10_000),
    tokens.length > 0
      ? admin
          .from("tb_forwarder")
          .select(columns)
          .eq("userid", header.userid)
          .in("ftrackingchn", tokens)
          .neq("fstatus", "99")
          .limit(10_000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (byRef.error || byTracking.error) return [];

  const seen = new Set<number>();
  return ([...(byRef.data ?? []), ...(byTracking.data ?? [])] as LinkedShopForwarder[])
    .filter((row) => !seen.has(Number(row.id)) && seen.add(Number(row.id)));
}
