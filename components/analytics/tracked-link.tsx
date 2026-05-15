"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { trackCtaClick } from "@/lib/analytics";

type CommonProps = {
  cta: string;
  surface: string;
  ctaProps?: Record<string, string | number | boolean>;
  children: ReactNode;
  className?: string;
};

/** Internal navigation (uses next-intl Link) with GTM cta_click event. */
export function TrackedLink({
  href,
  cta,
  surface,
  ctaProps,
  children,
  className,
}: CommonProps & { href: string }) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => trackCtaClick(cta, surface, ctaProps)}
    >
      {children}
    </Link>
  );
}

/** External link (uses <a> with target/rel) with GTM cta_click event. */
export function TrackedExternalLink({
  href,
  cta,
  surface,
  ctaProps,
  children,
  className,
  target = "_blank",
  rel = "noopener noreferrer",
  ...rest
}: CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }) {
  return (
    <a
      href={href}
      target={target}
      rel={rel}
      className={className}
      onClick={() => trackCtaClick(cta, surface, ctaProps)}
      {...rest}
    >
      {children}
    </a>
  );
}

/** Tel/mailto link with GTM cta_click event. */
export function TrackedPhoneLink({
  phone,
  cta,
  surface,
  ctaProps,
  children,
  className,
}: CommonProps & { phone: string }) {
  return (
    <a
      href={`tel:${phone}`}
      className={className}
      onClick={() => trackCtaClick(cta, surface, ctaProps)}
    >
      {children}
    </a>
  );
}
