import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export interface ConfirmOptions {
  title: React.ReactNode;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Themed, promise-based replacement for `window.confirm`:
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete photo?", tone: "danger" }))) return;
 *
 * Resolves false on Cancel, Escape or backdrop click. A second request while one is
 * open resolves the first as false, so callers never hang on a stale promise.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
  }, []);

  const confirm = useCallback<ConfirmFn>(next => {
    resolver.current?.(false);
    setOpts(next);
    setOpen(true);
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <ConfirmDialog
          open={open}
          onClose={() => settle(false)}
          onConfirm={() => settle(true)}
          title={opts.title}
          body={opts.body}
          confirmLabel={opts.confirmLabel}
          cancelLabel={opts.cancelLabel}
          tone={opts.tone}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/** Outside a provider (isolated component tests) this degrades to window.confirm. */
const nativeFallback: ConfirmFn = async o =>
  window.confirm([o.title, o.body].filter(x => typeof x === "string").join(" "));

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext) ?? nativeFallback;
}
