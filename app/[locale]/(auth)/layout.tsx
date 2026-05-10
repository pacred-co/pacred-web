import { requireGuest } from "@/lib/auth/require-auth";

/**
 * Layout for routes under (auth) — login, register, forgot-password.
 * Redirects to / if user is already signed in.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireGuest();
  return <>{children}</>;
}
