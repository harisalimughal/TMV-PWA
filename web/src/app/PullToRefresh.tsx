import React, { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Spinner } from "../ui";

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  className?: string;
}

const PULL_THRESHOLD = 72;

/**
 * Touch-driven pull-to-refresh. Only engages when the list is already scrolled to the
 * very top, and never fights the browser's own scrolling. Wraps the scroll region, so
 * place it as the AppShell content.
 */
export function PullToRefresh({ onRefresh, children, className = "" }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  function handleTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    const el = containerRef.current;
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
      ref={containerRef}
      className={`relative h-full overflow-y-auto scroll-touch ${className}`}
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
