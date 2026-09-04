import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BUCKET_NAME = "product-images";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 10;
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif"
]);

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

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `You can upload up to ${MAX_FILES} files at once.` },
        { status: 400 }
      );
    }

    // Validate every file before touching storage
    for (const value of files) {
      if (!(value instanceof File)) {
        return NextResponse.json(
          { error: "Invalid payload: expected file objects." },
          { status: 400 }
        );
      }
      if (!ALLOWED_MIME_TYPES.has(value.type)) {
        return NextResponse.json(
          {
            error: `"${value.name}" has unsupported type "${value.type}". Allowed: JPG, PNG, WEBP, GIF, AVIF.`
          },
          { status: 400 }
        );
      }
      if (value.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `"${value.name}" is ${(value.size / 1024 / 1024).toFixed(1)} MB. Maximum allowed is 5 MB.`
          },
          { status: 400 }
        );
      }
    }

    // Use the service-role client so RLS on storage.objects doesn't block us.
    // Admin privileges were already verified above via assertAdminRequest().
    const supabase = createAdminSupabaseClient();

    // Make sure the bucket exists (safe to call repeatedly).
    const { data: existingBucket } = await supabase.storage.getBucket(BUCKET_NAME);
    if (!existingBucket) {
      const { error: createBucketError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
        fileSizeLimit: MAX_FILE_SIZE
      });
      if (createBucketError) {
        throw new Error(`Could not create storage bucket: ${createBucketError.message}`);
      }
    }

    const uploadedUrls: string[] = [];

    for (const value of files) {
      if (!(value instanceof File)) continue;

      const path = `products/${crypto.randomUUID()}-${sanitizeFileName(value.name)}`;
      const buffer = Buffer.from(await value.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(path, buffer, {
          contentType: value.type,
          upsert: false,
          cacheControl: "3600"
        });

      if (uploadError) {
        throw new Error(`Upload failed for "${value.name}": ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(path);

      if (!publicUrlData?.publicUrl) {
        throw new Error(`Could not resolve public URL for "${value.name}".`);
      }

      uploadedUrls.push(publicUrlData.publicUrl);
    }

    return NextResponse.json({ urls: uploadedUrls });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Upload failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    logger.error("Admin storage upload failed", { error: message, status });
    return NextResponse.json({ error: message }, { status });
  }
}
