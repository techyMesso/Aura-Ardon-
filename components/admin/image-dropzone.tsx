"use client";

import Image from "next/image";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  GripVertical,
  ImageIcon,
  Star,
  Upload,
  X
} from "lucide-react";
import { useRef, useState } from "react";

import {
  analyzeImageDimensions,
  compressImageToWebp
} from "@/lib/image-processing";
import { cn } from "@/lib/utils";

interface ImageDropzoneProps {
  value: string[];
  alts: string[];
  onChange: (urls: string[], alts: string[]) => void;
}

export function ImageDropzone({ value, alts, onChange }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warningsByUrl, setWarningsByUrl] = useState<Record<string, string[]>>({});
  const maxImages = 10;
  const imageCount = value.length;
  const availableSlots = maxImages - imageCount;

  const normalizedAlts = value.map((_, idx) => alts[idx] ?? "");

  function moveImage(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= value.length || fromIndex === toIndex) return;
    const nextUrls = [...value];
    const nextAlts = [...normalizedAlts];
    const [movedUrl] = nextUrls.splice(fromIndex, 1);
    const [movedAlt] = nextAlts.splice(fromIndex, 1);
    nextUrls.splice(toIndex, 0, movedUrl);
    nextAlts.splice(toIndex, 0, movedAlt);
    onChange(nextUrls, nextAlts);
  }

  function updateAlt(index: number, nextAlt: string) {
    const nextAlts = [...normalizedAlts];
    nextAlts[index] = nextAlt;
    onChange(value, nextAlts);
  }

  function removeImage(index: number) {
    const nextUrls = value.filter((_, i) => i !== index);
    const nextAlts = normalizedAlts.filter((_, i) => i !== index);
    onChange(nextUrls, nextAlts);
  }

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    setUploadStatus("Compressing and converting images to WebP...");
    setError(null);

    try {
      const fileList = Array.from(files);

      if (fileList.length > availableSlots) {
        throw new Error(
          `You can add ${availableSlots} more image${availableSlots === 1 ? "" : "s"}.`
        );
      }

      const processed: Array<{ file: File; warnings: string[] }> = [];

      for (const file of fileList) {
        if (!file.type.startsWith("image/")) {
          throw new Error(`"${file.name}" is not an image.`);
        }
        const compressed = await compressImageToWebp(file, 2000, 0.85);
        const maxSize = 5 * 1024 * 1024;
        if (compressed.file.size > maxSize) {
          throw new Error(`"${file.name}" is still over 5 MB after compression.`);
        }
        processed.push({
          file: compressed.file,
          warnings: compressed.warnings
        });
      }

      setUploadStatus(`Uploading ${processed.length} optimized image${processed.length === 1 ? "" : "s"}...`);

      const formData = new FormData();
      processed.forEach(item => formData.append("files", item.file));

      const response = await fetch("/api/admin/storage/upload", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as { urls?: string[]; error?: string };

      if (!response.ok || !payload.urls) {
        throw new Error(payload.error ?? "Upload failed.");
      }

      const nextWarnings: Record<string, string[]> = { ...warningsByUrl };
      payload.urls.forEach((url, idx) => {
        const fileWarnings = processed[idx]?.warnings ?? [];
        if (fileWarnings.length > 0) {
          nextWarnings[url] = fileWarnings;
        }
      });
      setWarningsByUrl(nextWarnings);

      const newAlts = payload.urls.map(() => "");
      onChange([...value, ...payload.urls], [...normalizedAlts, ...newAlts]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={e => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setIsDraggingFiles(true);
        }}
        onDragLeave={() => setIsDraggingFiles(false)}
        onDrop={e => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setIsDraggingFiles(false);
          if (!uploading && e.dataTransfer.files?.length && availableSlots > 0) {
            void uploadFiles(e.dataTransfer.files);
          }
        }}
        onClick={() => !uploading && availableSlots > 0 && inputRef.current?.click()}
        className={cn(
          "flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[2px] border-2 border-dashed p-6 text-center transition-all",
          isDraggingFiles
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
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-brass border-t-transparent" />
            <p className="text-sm font-medium text-text">
              {uploadStatus ?? "Uploading..."}
            </p>
          </>
        ) : (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brass/15">
              <Upload className="h-5 w-5 text-brass" />
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
                Auto-resized to max 2000 px &amp; compressed to WebP • square 800×800+ px recommended • up to {maxImages} images
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
            {value.length} image{value.length !== 1 ? "s" : ""} — drag cards or use arrows to reorder (first image is cover). Alt text is required for every photo.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {value.map((url, index) => {
              const altText = normalizedAlts[index] ?? "";
              const altMissing = altText.trim().length < 2;
              const warnings = warningsByUrl[url] ?? [];

              return (
                <div
                  key={`${url}-${index}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={e => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    setDragOverIndex(index);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === index) setDragOverIndex(null);
                  }}
                  onDrop={e => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    moveImage(dragIndex, index);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={cn(
                    "flex flex-col overflow-hidden rounded-[2px] border bg-paper transition",
                    dragOverIndex === index
                      ? "border-brass ring-2 ring-brass/50"
                      : "border-border",
                    dragIndex === index && "opacity-60"
                  )}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-stone">
                    <Image
                      src={url}
                      alt={altText.trim() || `Product image ${index + 1}`}
                      fill
                      sizes="(max-width: 640px) 100vw, 240px"
                      className="object-cover"
                      onLoad={event => {
                        const target = event.currentTarget;
                        if (target.naturalWidth && target.naturalHeight && !warningsByUrl[url]) {
                          const analysis = analyzeImageDimensions(
                            target.naturalWidth,
                            target.naturalHeight
                          );
                          if (analysis.warnings.length > 0) {
                            setWarningsByUrl(prev =>
                              prev[url] ? prev : { ...prev, [url]: analysis.warnings }
                            );
                          }
                        }
                      }}
                    />

                    <div className="absolute left-2 top-2 flex items-center gap-1">
                      <span
                        title="Drag to reorder"
                        className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-[2px] bg-paper/90 text-text"
                      >
                        <GripVertical className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      {index === 0 ? (
                        <span className="rounded-[2px] bg-brass px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink">
                          Cover
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => moveImage(index, 0)}
                          className="inline-flex items-center gap-1 rounded-[2px] bg-paper/90 px-2 py-1 text-[11px] font-medium text-text hover:text-brass"
                          aria-label={`Set image ${index + 1} as cover`}
                        >
                          <Star className="h-3 w-3" aria-hidden />
                          Cover
                        </button>
                      )}
                    </div>

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
                        onClick={() => removeImage(index)}
                        className="flex items-center gap-1 rounded-[2px] bg-paper/90 px-2.5 py-1 text-xs font-medium text-text transition hover:bg-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-brass"
                        aria-label={`Remove image ${index + 1}`}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 p-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold text-text">
                        Alt text (Photo {index + 1}) <span className="text-brass">*</span>
                      </span>
                      <input
                        type="text"
                        required
                        maxLength={240}
                        placeholder="e.g. Gold cuff bracelet side angle on cream linen"
                        value={altText}
                        onChange={e => updateAlt(index, e.target.value)}
                        className={cn(
                          "h-9 w-full rounded-[2px] border bg-paper px-2.5 text-xs text-text outline-none transition focus:border-brass",
                          altMissing
                            ? "border-red-400/70"
                            : "border-text/20"
                        )}
                      />
                    </label>
                    {altMissing ? (
                      <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        Required for accessibility &amp; SEO.
                      </p>
                    ) : null}
                    {warnings.length > 0 ? (
                      <div className="space-y-1 rounded-[2px] border border-amber-400/50 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300">
                        {warnings.map(warning => (
                          <p key={warning} className="flex items-start gap-1.5">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span>{warning}</span>
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
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
