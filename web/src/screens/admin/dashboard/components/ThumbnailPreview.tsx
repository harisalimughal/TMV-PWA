import React, { useState } from "react";
import { Loader2, AlertCircle, ImageOff, ZoomIn } from "lucide-react";

interface Props {
  src?: string;
  alt: string;
  category?: string;
  state?: "COMPLETED" | "PROCESSING" | "FAILED" | "MISSING";
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
}

export function ThumbnailPreview({ src, alt, category, state, onClick, size = "md" }: Props) {
  const [loadStatus, setLoadStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");

  const sizeClasses = {
    sm: "w-7 h-7 text-[9px] rounded",
    md: "w-8 h-8 text-[10px] rounded",
    lg: "w-16 h-16 text-xs rounded-lg"
  }[size];

  // If explicitly declared state is PROCESSING
  if (state === "PROCESSING") {
    return (
      <div
        className={`${sizeClasses} border border-amber-300 bg-admin-status-amber-bg text-admin-status-amber flex flex-col items-center justify-center p-0.5 text-center animate-pulse flex-shrink-0`}
        title={`${alt} — Processing`}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin text-admin-status-amber" />
      </div>
    );
  }

  // If explicitly declared state is FAILED
  if (state === "FAILED") {
    return (
      <div
        className={`${sizeClasses} border border-admin-status-red bg-admin-status-red-bg text-admin-status-red flex flex-col items-center justify-center p-0.5 text-center flex-shrink-0`}
        title={`${alt} — Upload failed`}
      >
        <AlertCircle className="w-3.5 h-3.5 text-admin-status-red" />
      </div>
    );
  }

  // If no source or MISSING
  if (!src || state === "MISSING") {
    return (
      <div
        className={`${sizeClasses} border border-dashed border-admin-line-strong bg-admin-surface text-admin-muted flex flex-col items-center justify-center p-0.5 text-center flex-shrink-0`}
        title={`${alt} — Not captured`}
      >
        <ImageOff className="w-3 h-3 text-admin-muted opacity-60" />
      </div>
    );
  }

  return (
    <div
      onClick={loadStatus === "loaded" && onClick ? onClick : undefined}
      className={`${sizeClasses} overflow-hidden border border-admin-line bg-white flex items-center justify-center relative flex-shrink-0 ${
        onClick && loadStatus === "loaded" ? "cursor-pointer hover:border-admin-brand transition group" : ""
      }`}
      title={alt}
    >
      {loadStatus === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-admin-surface animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin text-admin-muted" />
        </div>
      )}

      {loadStatus === "error" && (
        <div className="flex flex-col items-center justify-center text-admin-status-red bg-admin-status-red-bg w-full h-full border border-admin-status-red">
          <AlertCircle className="w-3 h-3 text-admin-status-red" />
        </div>
      )}

      <img
        src={src}
        alt={alt}
        onLoad={() => setLoadStatus("loaded")}
        onError={() => setLoadStatus("error")}
        className={`w-full h-full object-cover transition ${
          loadStatus === "loaded" ? "opacity-100 group-hover:scale-105" : "opacity-0"
        }`}
      />

      {loadStatus === "loaded" && onClick && (
        <div className="absolute inset-0 bg-admin-ink/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
          <ZoomIn className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
}
