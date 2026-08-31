import React, { useState } from "react";

/**
 * DEV-ONLY dual preview, gated behind `?preview` in the URL. `import.meta.env.DEV`
 * is statically false in `vite build`, so this whole module (and the <iframe>) is
 * tree-shaken from production — the shipped app is just its responsive self.
 *
 * On a wide screen it shows the live responsive app (which renders the desktop
 * sidebar layout) beside a real phone-width <iframe> of the same app, so both the
 * desktop and mobile experiences can be checked at once. The iframe is a genuine
 * separate viewport — the only way media-query breakpoints actually resolve at a
 * simulated width.
 */
export function DevicePreview({ children }: { children: React.ReactNode }) {
  const on =
    import.meta.env.DEV &&
    (() => {
      try {
        return new URLSearchParams(window.location.search).has("preview");
      } catch {
        return false;
      }
    })();

  const [w, setW] = useState(390);
  if (!on) return <>{children}</>;

  return (
    <div className="flex h-[100dvh] w-full bg-surface-sunken">
      <div className="min-w-0 flex-1 overflow-hidden border-r border-line">{children}</div>

      <div className="flex shrink-0 flex-col items-center gap-3 p-6">
        <div className="flex items-center gap-1 rounded-pill border border-line bg-surface p-1 text-[12px] font-semibold">
          {[360, 390, 430].map(px => (
            <button
              key={px}
              type="button"
              onClick={() => setW(px)}
              className={`rounded-pill px-3 py-1 ${w === px ? "bg-brand text-brand-fg" : "text-fg-muted"}`}
            >
              {px}
            </button>
          ))}
        </div>
        <iframe
          title="Mobile preview"
          src="/"
          style={{ width: w, height: "min(844px, calc(100dvh - 120px))" }}
          className="rounded-[36px] border-[6px] border-[#15181d] bg-bg shadow-md"
        />
        <p className="text-[12px] text-fg-subtle">Mobile · {w}px</p>
      </div>
    </div>
  );
}
