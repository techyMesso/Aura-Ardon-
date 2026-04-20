"use client";

import Image from "next/future/image";
import { Upload, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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
        // Validate files before upload
        const fileList = Array.from(files);
        
        // Check each file
        for (const file of fileList) {
            // Check file type
            if (!file.type.startsWith('image/')) {
                throw new Error(`File "${file.name}" is not an image. Please upload only image files.`);
            }
            
            // Check file size (5MB limit)
            const maxSizeInBytes = 5 * 1024 * 1024; // 5MB
            if (file.size > maxSizeInBytes) {
                throw new Error(`File "${file.name}" is too large. Maximum size allowed is 5MB.`);
            }
        }

        const formData = new FormData();

        fileList.forEach((file) => {
            formData.append("files", file);
        });

        const response = await fetch("/api/admin/storage/upload", {
            method: "POST",
            body: formData
        });

        const payload = (await response.json()) as { urls?: string[]; error?: string };

        if (!response.ok || !payload.urls) {
            throw new Error(payload.error ?? "Image upload failed.");
        }

        onChange([...value, ...payload.urls]);
    } catch (caughtError) {
        setError(
            caughtError instanceof Error
                ? caughtError.message
                : "Image upload failed."
        );
    } finally {
        setUploading(false);
    }
}

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          void uploadFiles(event.dataTransfer.files);
        }}
        className={cn(
          "rounded-[1.5rem] border border-dashed border-bronze/40 bg-background/60 p-6 text-center transition",
          isDragging && "border-bronze bg-sand/60"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept="image/*"
          onChange={(event) => {
            if (event.target.files?.length) {
              void uploadFiles(event.target.files);
            }
          }}
        />
        <Upload className="mx-auto mb-3 h-8 w-8 text-bronze" />
        <p className="text-sm text-ink">
          Drop high-resolution product shots here or choose files.
        </p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Select images"}
        </Button>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {value.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {value.map((url) => (
            <div
              key={url}
              className="relative overflow-hidden rounded-[1.5rem] border border-border bg-white"
            >
              <Image
                src={url}
                alt="Uploaded jewelry preview"
                width={480}
                height={640}
                className="h-48 w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== url))}
                className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-ink shadow"
                aria-label="Remove image"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
