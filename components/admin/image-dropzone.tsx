"use client";

import Image from "next/image";
import { Upload, X, ImageIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface ImageDropzoneProps {
  value: string[];
  onChange: (urls: string[]) => void;
}

export function ImageDropzone({ value, onChange }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    setError(null);

    try {
      const fileList = Array.from(files);

      // Validation
      for (const file of fileList) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`"${file.name}" is not an image.`);
        }
        const maxSize = 5 * 1024 * 1024; // 5 MB
        if (file.size > maxSize) {
          throw new Error(`"${file.name}" is too large (max 5 MB).`);
        }
      }

      const formData = new FormData();
      fileList.forEach((file) => formData.append("files", file));

      const response = await fetch("/api/admin/storage/upload", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { urls?: string[]; error?: string };

      if (!response.ok || !payload.urls) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      onChange([...value, ...payload.urls]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const imageCount = value.length;
  const maxImages = 10;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) {
            void uploadFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all min-h-[160px]",
          isDragging
            ? "border-bronze bg-bronze/5 scale-[1.01]"
            : "border-bronze/40 bg-white/40 hover:border-bronze hover:bg-white/60",
          uploading && "opacity-60 cursor-not-allowed"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
          onChange={(e) => {
            if (e.target.files?.length) {
              void uploadFiles(e.target.files);
              e.target.value = ""; // allow re-selecting same files
            }
          }}
        />

        {uploading ? (
          <>
            <div className="h-10 w-10 rounded-full border-2 border-bronze border-t-transparent animate-spin" />
            <p className="text-sm text-ink font-medium">Uploading...</p>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bronze/10">
              <Upload className="h-6 w-6 text-bronze" />
            </div>
            <div>
              <p className="text-sm font-medium text-ink">
                {imageCount > 0
                  ? `Add ${maxImages - imageCount} more image${maxImages - imageCount !== 1 ? "s" : ""}`
                  : "Tap to upload product images"}
              </p>
              <p className="mt-1 text-xs text-muted">
                JPG, PNG, WEBP, GIF • max 5 MB each • up to {maxImages} images
              </p>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
          <X className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Image previews — 2-column grid on mobile */}
      {value.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {value.length} image{value.length !== 1 ? "s" : ""} uploaded
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {value.map((url, index) => (
              <div
                key={url}
                className="relative group rounded-2xl overflow-hidden border border-border bg-white aspect-square"
              >
                <Image
                  src={url}
                  alt={`Product image ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 50vw, 200px"
                  className="object-cover"
                />
                {/* Overlay with remove button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-ink text-xs font-medium shadow hover:bg-red-50 hover:text-red-600 transition"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove
                  </button>
                </div>
                {/* Primary badge */}
                {index === 0 && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-bronze text-white text-[10px] font-bold uppercase tracking-wide">
                    Cover
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state hint */}
      {value.length === 0 && (
        <p className="text-xs text-center text-muted">
          <ImageIcon className="inline h-3.5 w-3.5 mr-1" />
          No images yet — upload at least one to display on the storefront
        </p>
      )}
    </div>
  );
}
