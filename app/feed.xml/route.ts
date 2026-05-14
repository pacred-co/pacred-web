import { KNOWLEDGE_ARTICLES } from "@/lib/knowledge-articles";
import { SITE_NAME, SITE_URL } from "@/components/seo/site";

export const dynamic = "force-static";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const lastBuild = new Date().toUTCString();
  const items = KNOWLEDGE_ARTICLES.map((a) => {
    const url = `${SITE_URL}/knowledge/${a.slug}`;
    const img = `${SITE_URL}${a.image}`;
    return `    <item>
      <title>${xmlEscape(a.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${xmlEscape(a.excerpt)}</description>
      <category>${xmlEscape(a.category)}</category>
      <enclosure url="${img}" type="image/png" />
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(SITE_NAME)} — Knowledge Base</title>
    <link>${SITE_URL}/knowledge</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <description>บทความนำเข้า ส่งออก เคลียร์ศุลกากร จาก Pacred Shipping</description>
    <language>th-TH</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
