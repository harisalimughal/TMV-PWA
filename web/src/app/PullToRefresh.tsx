import React, { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Spinner } from "../ui";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
  /** Ref to the actual scrolling ancestor (AppShell's contentRef). Pull gesture reads
   *  its scrollTop instead of this component owning a scroll container of its own --
   *  see below for why. */
  scrollRef: React.RefObject<HTMLDivElement>;
}

const PULL_THRESHOLD = 72;

/**
 * Touch-driven pull-to-refresh. Only engages when the list is already scrolled to the
 * very top, and never fights the browser's own scrolling.
 *
 * Does NOT create its own scroll container -- it used to (`overflow-y-auto` on its own
 * wrapper), but that nested inside AppShell's already-scrolling content div, giving two
 * ancestors both marked `overscroll-behavior: contain`. The inner one never actually
 * had anything to scroll (its height just matched its content), so touch scroll hit-
 * tested to it and `contain` then refused to chain the gesture up to the real
 * scrollable ancestor -- the whole list would sit frozen under a finger. Reading
 * scrollTop off AppShell's own content ref instead, and rendering as a plain
 * (non-scrolling) wrapper here, leaves exactly one scroll container in the tree.
 */
export function PullToRefresh({ onRefresh, children, className = "", scrollRef }: PullToRefreshProps) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function handleTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    const el = scrollRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startY.current === null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Rubber-band: the further you pull the less it moves, like a native list.
    setPull(Math.min(PULL_THRESHOLD * 1.5, delta * 0.5));
  }

  async function handleTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;
    if (pull >= PULL_THRESHOLD * 0.8) {
      setRefreshing(true);
      setPull(PULL_THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  return (
    <div
      className={`relative ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-slow"
        style={{ height: pull }}
        aria-hidden={!refreshing}
      >
        {refreshing ? (
          <Spinner size="lg" className="text-brand" />
        ) : (
          <RefreshCw
            className="size-5 text-fg-subtle transition-transform"
            style={{
              transform: `rotate(${(pull / PULL_THRESHOLD) * 180}deg)`,
              opacity: pull / PULL_THRESHOLD
            }}
          />
        )}
      </div>
      {children}
    </div>
  );
}
