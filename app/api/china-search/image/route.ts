import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchByImage } from "@/lib/china-search";

/**
 * POST /api/china-search/image  (multipart form-data, field name 'image')
 *
 * Reverse-image search. Mirrors legacy searchIMG.php — accepts an
 * image upload from the client and forwards to the RCGroup endpoint.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: dataErr } = await supabase.auth.getUser();
  if (dataErr) {
    console.error(`[supabase list] failed`, { code: dataErr.code, message: dataErr.message });
  }
  if (!user) {
    return NextResponse.json({ available: false, reason: "not_authorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ available: false, reason: "no_image" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ available: false, reason: "image_too_large" }, { status: 413 });
  }

  const result = await searchByImage(file);
  return NextResponse.json(result);
}
