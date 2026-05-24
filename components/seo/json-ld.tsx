export function JsonLd({ data, id }: { data: unknown; id?: string }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  // Stable id derived from a content hash so multiple <JsonLd /> on one
  // page get unique ids. `async` + `id` opts into React 19's script
  // dedup/hoist path so this Server Component does not trip the
  // "script tag inside React component" dev warning. The `async`
  // attribute has no runtime effect on a `type="application/ld+json"`
  // script (it is metadata, never executed) — it only flags the tag to
  // React as a resource rather than render output.
  const scriptId = id ?? `json-ld-${hash32(json).toString(36)}`;
  return (
    <script
      async
      id={scriptId}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
