import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { Modal } from "../../../../ui/Modal";
import { Action } from "./ds";
import { cx } from "../../../../ui/cx";

export interface PreviewPhoto {
  id: string;
  title: string;
  url: string;
  /** Capture time / place line under the image. */
  caption?: React.ReactNode;
  driveUrl?: string;
}

/**
 * Focused photo preview: one image at a time with previous/next, instead of a wall of
 * thumbnails (audit p.16). Dialog semantics, Escape and focus restore come from the
 * shared Modal.
 */
export function PhotoModal({ isOpen, onClose, photos, index, onIndex, onDelete, deletingId }: {
  isOpen: boolean;
  onClose: () => void;
  photos: PreviewPhoto[];
  index: number;
  onIndex: (index: number) => void;
  onDelete?: (photo: PreviewPhoto) => void;
  deletingId?: string | null;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const photo = photos[index];
  const count = photos.length;
  const go = (delta: number) => { setZoomed(false); onIndex((index + delta + count) % count); };
  useEffect(() => { setLoaded(false); setFailed(false); }, [photo?.id, photo?.url]);
  // Left/Right move between photos; ignored while typing or when there is only one.
  useEffect(() => {
    if (!isOpen || count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isOpen || !photo) return null;
  return (
    <Modal open onClose={onClose} title={`${photo.title} (${index + 1} of ${photos.length})`} size="xl" placement="center"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Action size="sm" icon={<ChevronLeft />} disabled={photos.length < 2} onClick={() => go(-1)}>Previous</Action>
            <Action size="sm" disabled={photos.length < 2} onClick={() => go(1)}>Next<ChevronRight aria-hidden className="h-4 w-4" /></Action>
          </div>
          <div className="flex flex-wrap gap-2">
            <Action size="sm" icon={zoomed ? <ZoomOut /> : <ZoomIn />} onClick={() => setZoomed(value => !value)}>{zoomed ? "Fit to window" : "Actual size"}</Action>
            {photo.driveUrl && <a href={photo.driveUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-2 rounded-lg border border-admin-line px-2.5 text-[13px] font-semibold text-admin-ink hover:bg-admin-surface"><ExternalLink aria-hidden className="h-4 w-4" />Open original</a>}
            {onDelete && <Action size="sm" variant="ghost" icon={<Trash2 />} loading={deletingId === photo.id} onClick={() => onDelete(photo)} className="text-admin-status-red">Delete photo</Action>}
          </div>
        </div>
      }>
      <div className={zoomed ? "overflow-auto" : "flex min-h-[200px] items-center justify-center"} {...(zoomed ? { tabIndex: 0, role: "region", "aria-label": "Photo at actual size" } : {})}>
        {failed ? <p role="alert" className="py-10 text-[14px] text-admin-ink-2">This photo could not be loaded.</p> : (
          <>
            {!loaded && <span role="status" className="tmv-shimmer h-48 w-72 max-w-full rounded-lg"><span className="sr-only">Loading photo</span></span>}
            <img src={photo.url} alt={photo.title} onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
              className={zoomed ? "max-w-none" : cx("max-h-[60vh] w-auto max-w-full object-contain", !loaded && "hidden")} />
          </>
        )}
      </div>
      {photo.caption && <div className="mt-3 text-[13px] text-admin-ink-2">{photo.caption}</div>}
    </Modal>
  );
}
