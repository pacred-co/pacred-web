import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "outline" | "white" | "ghost-primary" | "link";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-primary-500 text-white hover:bg-primary-600 shadow-sm",
  outline:
    "border border-border bg-surface hover:bg-surface-alt",
  white:
    "bg-white text-primary-600 hover:bg-white/90",
  "ghost-primary":
    "border border-white/40 bg-white/10 text-white hover:bg-white/20",
  link:
    "text-primary-500 hover:text-primary-600 px-0 underline-offset-4 hover:underline",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-4 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth, className = "", children, ...props }, ref) => {
    const isLink = variant === "link";
    return (
      <button
        ref={ref}
        className={[
          "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors",
          "disabled:pointer-events-none disabled:opacity-50",
          isLink ? "" : sizeStyles[size],
          variantStyles[variant],
          fullWidth ? "w-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
