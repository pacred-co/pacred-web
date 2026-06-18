/**
 * Container/cabinet NAME → transport mode (the authoritative decode).
 *
 * Owner 2026-06-19 (corrected): the container code prefix/token is the source of
 * truth for transport mode — the stored tb_forwarder.ftransporttype is unreliable
 * ("อย่าหลงเชื่อข้อมูลผิดๆ"). Decode:
 *
 *   GZS  /  *SEA*   = ทางเรือ (sea)   → "2"
 *   GZA  /  *AIR*   = ทางอากาศ (air)  → "3"
 *   GZE  /  *EK*    = ทางรถ   (road)  → "1"   ← EK is ROAD, not air
 *
 * Examples seen in prod / packing lists: GZS260529-1 (sea), GZE2604-01 (road),
 * CBX260616-SEA01 (sea), CBX260616-EK08 (road), MO20260523-SEA02 (sea),
 * GZA…-AIR (air). The mode token appears EITHER as the GZx prefix OR a SEA/EK/AIR
 * suffix; both forms are handled.
 *
 * Use this everywhere a cabinet name implies a transport mode (display label,
 * the cost-column car-vs-ship basis, write-time ftransporttype derivation) so the
 * mode is correct automatically, not hand-entered.
 */

export type TransportMode = "1" | "2" | "3"; // 1 = รถ (road) · 2 = เรือ (sea) · 3 = อากาศ (air)

/**
 * Decode the transport mode from a cabinet name. Returns null when the name
 * carries no recognised mode token (caller falls back to the stored value).
 */
export function transportModeFromCabinetName(cabinetName: string | null | undefined): TransportMode | null {
  const n = (cabinetName ?? "").toUpperCase();
  if (!n) return null;
  // Order matters only for safety; the tokens are mutually exclusive in practice.
  if (n.includes("GZS") || n.includes("SEA")) return "2"; // sea
  if (n.includes("GZA") || n.includes("AIR")) return "3"; // air
  if (n.includes("GZE") || n.includes("EK")) return "1";  // road (GZE + EK)
  return null;
}

/**
 * Resolve the transport mode to display/use: the cabinet NAME wins (authoritative);
 * fall back to the stored ftransporttype only when the name has no mode token; and
 * default to road ("1") when neither is usable.
 */
export function resolveTransportMode(
  cabinetName: string | null | undefined,
  storedType: string | null | undefined,
): TransportMode {
  const byName = transportModeFromCabinetName(cabinetName);
  if (byName) return byName;
  const s = (storedType ?? "").trim();
  return s === "2" ? "2" : s === "3" ? "3" : "1";
}
