"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { UploadCloud, CheckCircle2 } from "lucide-react";

type Props = {
  /** For native form submission — the input's name attribute. */
  name?: string;
  id?: string;
  accept?: string;
  required?: boolean;
  disabled?: boolean;
  /** Allow selecting multiple files (native multi-select). */
  multiple?: boolean;
  /** Label text shown on the button when no file is selected. */
  label?: string;
  /** Small hint text below the button (hidden once a file is selected). */
  hint?: string;
  /**
   * Override the "แนบแล้ว: filename" text with a custom string.
   * Pass a truthy string to force the "selected" visual state.
   */
  selectedLabel?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
};

/**
 * Styled file input — replaces raw `<input type="file">` across the app.
 *
 * Renders a hidden `<input type="file">` paired with a visible dashed-border
 * button (UploadCloud icon + filename feedback). Works in both client
 * components (via onChange) and native `<form>` submissions (via name).
 *
 * Supports forwardRef so parents can clear the input:
 *   `ref.current.value = ""; ref.current.dispatchEvent(new Event("change"))`
 */
export const StyledFileInput = forwardRef<HTMLInputElement, Props>(
  function StyledFileInput(
    {
      name,
      id,
      accept,
      required,
      disabled,
      multiple,
      label = "เลือกไฟล์",
      hint,
      selectedLabel,
      onChange,
    },
    fwdRef,
  ) {
    const innerRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(fwdRef, () => innerRef.current!, []);
    const [fileName, setFileName] = useState<string | null>(null);

    const isSelected = !!(selectedLabel || fileName);
    const displayLabel = selectedLabel ?? (fileName ? `แนบแล้ว: ${fileName}` : label);

    return (
      <>
        <input
          ref={innerRef}
          type="file"
          name={name}
          id={id}
          accept={accept}
          required={required}
          disabled={disabled}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => {
            const picked = e.target.files;
            setFileName(
              picked && picked.length > 1
                ? `${picked.length} ไฟล์`
                : (picked?.[0]?.name ?? null),
            );
            onChange?.(e);
          }}
        />
        <button
          type="button"
          onClick={() => innerRef.current?.click()}
          disabled={disabled}
          className={`flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-3 text-[14px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
            isSelected
              ? "border-green-300 bg-green-50/50 text-green-700 dark:border-green-700 dark:bg-green-950/20 dark:text-green-400"
              : "border-gray-300 text-gray-600 hover:border-primary-400 hover:bg-primary-50/30 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-primary-950/20"
          }`}
        >
          {isSelected ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <UploadCloud className="h-5 w-5" />
          )}
          {displayLabel}
        </button>
        {hint && !isSelected && (
          <span className="mt-1 block text-[11px] text-muted">{hint}</span>
        )}
      </>
    );
  },
);
