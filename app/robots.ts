import type { MetadataRoute } from "next";
import { SITE_URL } from "@/components/seo/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/auth/",
          "/api/",
          "/dashboard",
          "/profile",
          "/addresses",
          "/wallet",
          "/orders",
          "/service-order",
          "/service-import",
          "/service-payment",
          "/sales",
          "/receipts",
          "/notifications",
          "/complete-profile",
          "/login",
          "/register",
          "/recover",
        ],
      },
      {
        userAgent: ["GPTBot", "ChatGPT-User", "CCBot", "Google-Extended", "anthropic-ai", "Claude-Web"],
        allow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
