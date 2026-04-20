import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9.\-_]/g, "-").toLowerCase();
}

export async function POST(request: Request) {
  try {
    await assertAdminRequest();
    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files.length) {
      return NextResponse.json({ error: "No files received." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const uploadedUrls: string[] = [];

    for (const value of files) {
      if (!(value instanceof File)) {
        continue;
      }

      const path = `products/${crypto.randomUUID()}-${sanitizeFileName(value.name)}`;
      const buffer = Buffer.from(await value.arrayBuffer());
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, buffer, {
          contentType: value.type,
          upsert: false
        });

      if (error) {
        throw new Error(error.message);
      }

      const { data: publicUrlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(path);

      uploadedUrls.push(publicUrlData.publicUrl);
    }

    return NextResponse.json({ urls: uploadedUrls });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Upload failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
