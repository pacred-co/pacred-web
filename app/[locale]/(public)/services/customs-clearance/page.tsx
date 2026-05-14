import { permanentRedirect } from "next/navigation";

// Old slug kept as a 308 permanent redirect for any external backlinks /
// search-engine results that still point here. Canonical URL is now
// `/customs-clearance-shipping-suvarnabhumi`.
export default function OldCustomsClearanceRedirect() {
  permanentRedirect("/customs-clearance-shipping-suvarnabhumi");
}
