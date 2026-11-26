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

function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // GIF: GIF87a / GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }

  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  // AVIF / HEIF ISO BMFF: ....ftypavif or ....ftypavis
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis" || brand === "mif1") {
      return "image/avif";
    }
  }

  return null;
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

    const preparedFiles: Array<{
      name: string;
      buffer: Buffer;
      contentType: string;
    }> = [];

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

      const buffer = Buffer.from(await value.arrayBuffer());
      const detectedMime = detectImageMimeType(buffer);
      if (!detectedMime) {
        return NextResponse.json(
          {
            error: `"${value.name}" does not appear to be a valid image file.`
          },
          { status: 400 }
        );
      }

      preparedFiles.push({
        name: value.name,
        buffer,
        contentType: detectedMime
      });
    }

    const supabase = createAdminSupabaseClient();

    const { data: existingBucket } = await supabase.storage.getBucket(BUCKET_NAME);
    if (!existingBucket) {
      const { error: createBucketError } = await supabase.storage.createBucket(
        BUCKET_NAME,
        {
          public: true,
          allowedMimeTypes: Array.from(ALLOWED_MIME_TYPES),
          fileSizeLimit: MAX_FILE_SIZE
        }
      );
      if (createBucketError) {
        throw new Error(`Could not create storage bucket: ${createBucketError.message}`);
      }
    }

    const uploadedUrls = await Promise.all(
      preparedFiles.map(async file => {
        const path = `products/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(path, file.buffer, {
            contentType: file.contentType,
            upsert: false,
            cacheControl: "31536000"
          });

        if (uploadError) {
          throw new Error(`Upload failed for "${file.name}": ${uploadError.message}`);
        }

        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(path);

        if (!publicUrlData?.publicUrl) {
          throw new Error(`Could not resolve public URL for "${file.name}".`);
        }

        return publicUrlData.publicUrl;
      })
    );

    return NextResponse.json({ urls: uploadedUrls });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Upload failed.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    logger.error("Admin storage upload failed", { error: message, status });
    return NextResponse.json({ error: message }, { status });
  }
}
