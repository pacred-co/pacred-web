import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/get-user";
import { NavBar } from "@/components/sections/navbar";
import { Footer } from "@/components/sections/footer";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  // Magic link landing — the /auth/callback exchange already set the session.
  // If a user reaches this page without a session (direct URL, expired link),
  // bounce them back to /forgot-password so they can request a fresh email.
  const user = await getCurrentUser();
  if (!user) redirect("/forgot-password");

  return (
    <>
      <NavBar />
      <main className="flex min-h-[calc(100vh-200px)] items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-[480px] rounded-[18px] bg-white dark:bg-surface p-6 sm:p-8 shadow-[0_8px_40px_rgba(0,0,0,0.10)]">
          <ResetPasswordForm email={user.email ?? null} />
        </div>
      </main>
      <Footer />
    </>
  );
}
