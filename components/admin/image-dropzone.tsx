"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, ImageIcon, Star, Upload, X } from "lucide-react";
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
  const maxImages = 10;
  const imageCount = value.length;
  const availableSlots = maxImages - imageCount;

  function moveImage(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= value.length || fromIndex === toIndex) return;
    const next = [...value];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange(next);
  }

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    setError(null);

    try {
      const fileList = Array.from(files);

      if (fileList.length > availableSlots) {
        throw new Error(
          `You can add ${availableSlots} more image${availableSlots === 1 ? "" : "s"}.`
        );
      }

      for (const file of fileList) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`"${file.name}" is not an image.`);
        }
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
          throw new Error(`"${file.name}" is too large (max 5 MB).`);
        }
      }

      const formData = new FormData();
      fileList.forEach(file => formData.append("files", file));

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

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          if (!uploading && e.dataTransfer.files?.length && availableSlots > 0) {
            void uploadFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => !uploading && availableSlots > 0 && inputRef.current?.click()}
        className={cn(
          "flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[2px] border-2 border-dashed p-8 text-center transition-all",
          isDragging
            ? "border-brass bg-brass/10"
            : "border-text/25 bg-stone/50 hover:border-brass hover:bg-stone",
          (uploading || availableSlots === 0) && "cursor-not-allowed opacity-60"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/avif"
          onChange={e => {
            if (e.target.files?.length && availableSlots > 0) {
              void uploadFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />

        {uploading ? (
          <>
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brass border-t-transparent" />
            <p className="text-sm font-medium text-text">Uploading...</p>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brass/15">
              <Upload className="h-6 w-6 text-brass" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">
                {imageCount > 0
                  ? availableSlots > 0
                    ? `Add ${availableSlots} more image${availableSlots !== 1 ? "s" : ""}`
                    : "Image limit reached"
                  : "Tap or drop product images"}
              </p>
              <p className="mt-1 text-xs text-muted">
                JPG, PNG, WEBP, GIF, AVIF • max 5 MB each • up to {maxImages} images
              </p>
            </div>
          </>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-[2px] border border-red-400/50 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400"
        >
          <X className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {value.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {value.length} image{value.length !== 1 ? "s" : ""} uploaded (first image is cover)
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {value.map((url, index) => (
              <div
                key={`${url}-${index}`}
                className="group relative aspect-square overflow-hidden rounded-[2px] border border-border bg-stone"
              >
                <Image
                  src={url}
                  alt={`Product image ${index + 1}`}
                  fill
                  sizes="(max-width: 640px) 50vw, 200px"
                  className="object-cover"
                />

                {index === 0 ? (
                  <span className="absolute left-2 top-2 rounded-[2px] bg-brass px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
                    Cover
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => moveImage(index, 0)}
                    className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-[2px] bg-paper/90 px-2 py-1 text-[11px] font-medium text-text hover:text-brass"
                    aria-label={`Set image ${index + 1} as cover`}
                  >
                    <Star className="h-3 w-3" aria-hidden />
                    Cover
                  </button>
                )}

                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    {index > 0 ? (
                      <button
                        type="button"
                        onClick={() => moveImage(index, index - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-[2px] bg-paper/90 text-text hover:text-brass"
                        aria-label={`Move image ${index + 1} left`}
                      >
                        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                    {index < value.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => moveImage(index, index + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-[2px] bg-paper/90 text-text hover:text-brass"
                        aria-label={`Move image ${index + 1} right`}
                      >
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() => onChange(value.filter((_, i) => i !== index))}
                    className="flex items-center gap-1 rounded-[2px] bg-paper/90 px-2.5 py-1 text-xs font-medium text-text transition hover:bg-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-brass"
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {value.length === 0 ? (
        <p className="text-center text-xs text-muted">
          <ImageIcon className="mr-1 inline h-3.5 w-3.5" />
          No images yet — upload at least one to display on the storefront
        </p>
      ) : null}
    </div>
  );
}
