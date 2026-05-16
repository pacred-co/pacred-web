/**
 * Normalize a Thai phone number to E.164 format (+66...).
 * Accepts variations like "081 234 5678", "0812345678", "+66812345678", "66812345678".
 */
export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s-()]/g, "");

  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("66")) return "+" + cleaned;
  if (cleaned.startsWith("0")) return "+66" + cleaned.slice(1);
  return "+66" + cleaned;
}

/**
 * Detect identifier format used at sign-in.
 */
export type IdentifierKind = "email" | "memberCode" | "phone";

export function detectIdentifier(input: string): IdentifierKind {
  if (input.includes("@")) return "email";
  // member_code = PR + min 3 digits (PR001 … PR999, PR1000+). Matches the
  // new 3-digit-minimum pattern AND any legacy 5-digit codes (PR00001).
  if (/^PR\d{3,}$/i.test(input.trim())) return "memberCode";
  return "phone";
}
