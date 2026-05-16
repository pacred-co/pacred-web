"use client";

import { useRef, useEffect } from "react";

/**
 * 6-digit OTP input. Auto-advance on digit entry · backspace returns
 * focus to previous box · paste a 6-digit code into ANY box and it fans
 * out across all boxes. `onComplete` fires when all digits are filled.
 *
 * Used by `/register` step "otp" — Pacred prod OTP path (with
 * `OTP_BYPASS=false`). When bypass is on, the register flow skips the
 * OTP step entirely and never instantiates this component.
 */

interface OtpInputProps {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  onComplete?: (code: string) => void;
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  disabled = false,
  onComplete,
}: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus && !disabled) refs.current[0]?.focus();
  }, [autoFocus, disabled]);

  const digits = value.split("").concat(Array(length).fill("")).slice(0, length);

  function commit(next: string) {
    const cleaned = next.replace(/\D/g, "").slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length) onComplete?.(cleaned);
  }

  function setDigit(i: number, d: string) {
    const clean = d.replace(/\D/g, "").slice(-1);
    const arr = [...digits];
    arr[i] = clean;
    commit(arr.join(""));
    if (clean && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[i]) {
        const arr = [...digits];
        arr[i] = "";
        commit(arr.join(""));
        return;
      }
      if (i > 0) {
        const arr = [...digits];
        arr[i - 1] = "";
        commit(arr.join(""));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    commit(pasted);
    const lastIdx = Math.min(pasted.length, length) - 1;
    refs.current[lastIdx]?.focus();
  }

  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={digits[i]}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`OTP digit ${i + 1}`}
          style={{
            width: 44,
            height: 52,
            textAlign: "center",
            fontSize: 22,
            fontWeight: 700,
            borderRadius: 12,
            border: `1.5px solid ${digits[i] ? "#E8A0A0" : "#ECEEF2"}`,
            background: digits[i] ? "#FFF5F5" : "#FAFBFC",
            color: digits[i] ? "#D42B2B" : "#1A1D23",
            outline: "none",
            transition: "all .15s",
            boxShadow: digits[i]
              ? "0 2px 8px rgba(212,43,43,0.10)"
              : "0 1px 3px rgba(0,0,0,0.05)",
            opacity: disabled ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  );
}
