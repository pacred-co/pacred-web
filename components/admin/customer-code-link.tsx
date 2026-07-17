import { Link } from "@/i18n/navigation";

/**
 * A customer PR / member code rendered as a link to that customer's profile
 * (`/admin/customers/<code>`). Use this EVERYWHERE a PR code is displayed so it
 * is consistently clickable (owner 2026-07-17 "รหัส pr ทุกจุดต้องกดเข้าโปรไฟล์ได้").
 *
 * - Renders a plain muted "—" when the code is empty (never a dead link).
 * - Link styling (font-mono · primary color · hover underline) matches the
 *   already-linked PR codes on the accounting pages. Pass `className` to tune
 *   size/weight per surface (e.g. `text-sm`).
 */
export function CustomerCodeLink({
  code,
  className = "",
}: {
  code: string | null | undefined;
  className?: string;
}) {
  const c = (code ?? "").trim();
  if (!c || c === "—" || c === "0") {
    return <span className={`text-muted ${className}`}>—</span>;
  }
  return (
    <Link
      href={`/admin/customers/${encodeURIComponent(c)}`}
      className={`font-mono font-semibold text-primary-600 hover:underline ${className}`}
      title={`ดูโปรไฟล์ลูกค้า ${c}`}
    >
      {c}
    </Link>
  );
}
