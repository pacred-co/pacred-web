"use client";

/**
 * Invisible hCaptcha widget — render once per form, call `execute()` from
 * your submit handler to get a token before posting to the server action.
 *
 *   import { useRef } from "react";
 *   import HCaptchaInvisible, { type HCaptchaHandle } from "@/components/hcaptcha-invisible";
 *
 *   const captchaRef = useRef<HCaptchaHandle>(null);
 *
 *   async function handleSubmit() {
 *     const token = await captchaRef.current?.execute();
 *     // token is null in dev (no site key) — server-side verifyHcaptcha
 *     // also passes when HCAPTCHA_SECRET_KEY is unset, so dev works
 *     // end-to-end with no captcha checks at all.
 *     const res = await signupAction({ ...formData, captchaToken: token ?? "" });
 *     if (!res.ok) captchaRef.current?.reset();
 *   }
 *
 *   return (
 *     <form>
 *       …
 *       <HCaptchaInvisible ref={captchaRef} />
 *       <button type="submit">Sign up</button>
 *     </form>
 *   );
 *
 * When `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` is unset (dev), the component
 * renders nothing and `execute()` resolves to `null` immediately.
 * Pair with `lib/hcaptcha.ts` `verifyHcaptcha(token, ip)` server-side.
 */

import { useImperativeHandle, useRef, forwardRef } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";

export type HCaptchaHandle = {
  /**
   * Trigger the invisible challenge.
   * Returns the verification token, or `null` if the site key is unset
   * (dev) or the user fails / cancels the challenge. Caller should pass
   * the result to a server action that calls `verifyHcaptcha`.
   */
  execute: () => Promise<string | null>;
  /** Reset the widget so a fresh token can be obtained on retry. */
  reset:   () => void;
};

type Props = {
  /** Called when the widget itself errors (network, etc.). */
  onError?: (event: string) => void;
};

const HCaptchaInvisible = forwardRef<HCaptchaHandle, Props>(function HCaptchaInvisible(
  { onError },
  ref,
) {
  const siteKey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
  const captchaRef = useRef<HCaptcha>(null);

  useImperativeHandle(
    ref,
    () => ({
      execute: async () => {
        if (!siteKey || !captchaRef.current) return null;
        try {
          // SDK v2.x supports a Promise mode via `{ async: true }`.
          const res = await captchaRef.current.execute({ async: true });
          return res?.response ?? null;
        } catch {
          // User cancelled or challenge failed — caller should reset.
          return null;
        }
      },
      reset: () => captchaRef.current?.resetCaptcha(),
    }),
    [siteKey],
  );

  if (!siteKey) return null;

  return (
    <HCaptcha
      ref={captchaRef}
      sitekey={siteKey}
      size="invisible"
      // We don't need the onVerify callback — we await execute() directly.
      // onError still wired so callers can show a friendly retry message.
      onError={onError}
    />
  );
});

export default HCaptchaInvisible;
