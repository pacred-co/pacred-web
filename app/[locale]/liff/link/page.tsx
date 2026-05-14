"use client";

/**
 * LIFF link page — D-1-LIFF (Part Q + Part O2 Track G)
 *
 * Entry URL: https://liff.line.me/<NEXT_PUBLIC_LIFF_ID>
 *
 * Flow:
 *   1. Customer opens this URL inside LINE (deep link from "เพิ่มเพื่อน" CTA
 *      on landing page or /profile)
 *   2. LIFF SDK initialises — if not logged into LINE, redirects to LINE login
 *   3. liff.getProfile() returns { userId, displayName, pictureUrl }
 *   4. We POST the userId to `linkLineAccount` server action — REQUIRES the
 *      customer to also be signed into Pacred (Supabase session). If not,
 *      the action returns "not_signed_in" and we redirect to /login with
 *      next=/liff/link
 *   5. On success, show "เชื่อมสำเร็จ" + 3-second auto-close (LIFF can
 *      close itself if opened inside the OA chat)
 *
 * Scaffold by เดฟ (D-1-LIFF). ภูม pick up to:
 *   - Polish UI copy + style (current = minimal placeholder)
 *   - Add error recovery flows (e.g. "เชื่อมแล้วกับบัญชีอื่น" — should we
 *     offer transfer? for now we just show the error)
 *   - Add /profile entry button + landing CTA hooks
 *   - Decide BOT link behaviour in LIFF console (currently scaffolded
 *     assuming BOT link = ON so adding-friend happens implicitly)
 *   - Test end-to-end with real Pacred OA on real device
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { linkLineAccount } from "@/actions/profile";

type State =
  | { status: "loading"; message: string }
  | { status: "needs_pacred_login" }
  | { status: "linking"; lineUserId: string; displayName?: string }
  | { status: "success"; displayName?: string }
  | { status: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  not_signed_in:                          "กรุณาเข้าสู่ระบบ Pacred ก่อน",
  invalid_line_user_id:                   "รหัส LINE ไม่ถูกต้อง — ลองใหม่อีกครั้ง",
  line_already_linked_to_another_account: "บัญชี LINE นี้ถูกเชื่อมกับลูกค้าท่านอื่นแล้ว — ติดต่อทีมงาน",
};

export default function LiffLinkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>({ status: "loading", message: "กำลังเชื่อมต่อ LINE…" });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) {
        if (!cancelled) {
          setState({ status: "error", message: "LIFF ยังไม่ได้ตั้งค่า — ติดต่อทีมงาน (NEXT_PUBLIC_LIFF_ID unset)" });
        }
        return;
      }

      try {
        // Lazy-import so the SDK never reaches the server bundle. liff.init
        // talks to LINE; this is the path that requires running INSIDE the
        // LINE app (or a browser with LINE login).
        const { default: liff } = await import("@line/liff");
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          // Sends the user through LINE's OAuth — they come back here
          // already logged in.
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const profile = await liff.getProfile();
        if (cancelled) return;
        setState({ status: "linking", lineUserId: profile.userId, displayName: profile.displayName });

        // Call the server action. This requires a Supabase session — if the
        // user opens the LIFF without first signing into Pacred, we get
        // "not_signed_in" and redirect them to /login with a return URL.
        const res = await linkLineAccount(profile.userId);
        if (cancelled) return;

        if (res.ok) {
          setState({ status: "success", displayName: profile.displayName });
          // Auto-close inside LINE chat after 3s. liff.closeWindow only works
          // inside the LINE in-app browser; in normal browsers it's a no-op.
          setTimeout(() => {
            try { liff.closeWindow(); } catch { /* not in LINE app */ }
            // Fallback: send the user to dashboard
            router.push("/dashboard");
          }, 3000);
          return;
        }

        if (res.error === "not_signed_in") {
          setState({ status: "needs_pacred_login" });
          return;
        }

        setState({
          status:  "error",
          message: ERROR_MESSAGES[res.error] ?? `เชื่อมไม่สำเร็จ: ${res.error}`,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status:  "error",
          message: `LIFF init failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [router, searchParams]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm rounded-3xl bg-surface border border-border p-8 text-center shadow-lg">
        {state.status === "loading" && (
          <>
            <div className="text-3xl mb-3">⏳</div>
            <p className="text-foreground/80">{state.message}</p>
          </>
        )}

        {state.status === "linking" && (
          <>
            <div className="text-3xl mb-3">🔗</div>
            <p className="text-foreground/80">กำลังเชื่อม LINE ของ {state.displayName ?? "คุณ"} กับ Pacred…</p>
          </>
        )}

        {state.status === "success" && (
          <>
            <div className="text-4xl mb-3">✅</div>
            <h1 className="text-xl font-bold text-foreground mb-2">เชื่อมสำเร็จ</h1>
            <p className="text-sm text-foreground/70">
              {state.displayName ? `LINE ของ ${state.displayName} เชื่อมกับบัญชี Pacred แล้ว` : "บัญชีของคุณเชื่อมกับ Pacred แล้ว"}
              <br />
              คุณจะได้รับแจ้งเตือนคำสั่งซื้อ + การชำระเงิน ผ่าน LINE
            </p>
            <p className="text-xs text-muted mt-4">หน้านี้จะปิดอัตโนมัติ…</p>
          </>
        )}

        {state.status === "needs_pacred_login" && (
          <>
            <div className="text-3xl mb-3">🔐</div>
            <h1 className="text-lg font-bold text-foreground mb-2">กรุณาเข้าสู่ระบบ Pacred ก่อน</h1>
            <p className="text-sm text-foreground/70 mb-4">
              เพื่อเชื่อม LINE กับบัญชีของคุณ ต้องเข้าสู่ระบบ Pacred ในเบราว์เซอร์เดียวกันก่อน
            </p>
            <a
              href={`/login?next=${encodeURIComponent("/liff/link")}`}
              className="inline-block px-5 py-2 rounded-full bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              เข้าสู่ระบบ Pacred
            </a>
          </>
        )}

        {state.status === "error" && (
          <>
            <div className="text-3xl mb-3">⚠️</div>
            <h1 className="text-lg font-bold text-foreground mb-2">เชื่อมไม่สำเร็จ</h1>
            <p className="text-sm text-foreground/70">{state.message}</p>
            <button
              type="button"
              onClick={() => location.reload()}
              className="mt-4 px-5 py-2 rounded-full border border-border text-sm hover:bg-background"
            >
              ลองใหม่
            </button>
          </>
        )}
      </div>
    </main>
  );
}
