import React, { useEffect } from "react";
import { X, ExternalLink, Download, ZoomIn, ZoomOut } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  photoUrl: string;
  driveUrl?: string;
}

export function PhotoModal({ isOpen, onClose, title, photoUrl, driveUrl }: Props) {
  const [zoomed, setZoomed] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative max-w-4xl w-full bg-white rounded-lg shadow-2xl border border-admin-line overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-admin-line bg-admin-surface">
          <div>
            <h3 className="text-base font-bold text-admin-ink">{title}</h3>
            <p className="text-xs text-admin-muted">Evidence photograph proxy</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoomed(!zoomed)}
              className="p-2 rounded-lg hover:bg-admin-surface-2 text-admin-ink-2 transition"
              title={zoomed ? "Zoom out" : "Zoom in"}
            >
              {zoomed ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            </button>
            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg hover:bg-admin-surface-2 text-tmv-blue transition"
                title="Open in Google Drive"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-admin-status-red-bg text-admin-status-red transition ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-navy-900/5 min-h-[360px]">
          <img
            src={photoUrl}
            alt={title}
            className={`transition-transform duration-200 rounded-lg max-h-[70vh] object-contain shadow ${
              zoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"
            }`}
            onClick={() => setZoomed(!zoomed)}
          />
        </div>
      </div>
    </div>
  );
}
