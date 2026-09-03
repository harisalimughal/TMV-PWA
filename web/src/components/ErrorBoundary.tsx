import React, { Component, ErrorInfo, ReactNode } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

const RELOAD_KEYS = [
  "tmv:chunk_reload_count",
  "tmv:preload_reload_count",
  "tmv:admin_chunk_reloaded"
];

function clearReloadGuards() {
  for (const key of RELOAD_KEYS) sessionStorage.removeItem(key);
}

async function clearCachesAndWorkers() {
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }
}

function reloadFromNetwork() {
  const url = new URL(window.location.href);
  url.searchParams.set("tmv_reload", String(Date.now()));
  window.location.replace(url.toString());
}

function isStaleChunkError(error: Error): boolean {
  return (
    error?.message?.includes("Failed to fetch dynamically imported module") ||
    error?.message?.includes("Importing a module script failed") ||
    error?.message?.includes("Expected a JavaScript-or-Wasm module script") ||
    error?.name === "ChunkLoadError"
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, isChunkError: isStaleChunkError(error) };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    if (isStaleChunkError(error)) {
      const reloadKey = "tmv:chunk_reload_count";
      const count = parseInt(sessionStorage.getItem(reloadKey) || "0", 10);
      if (count < 2) {
        sessionStorage.setItem(reloadKey, String(count + 1));
        clearCachesAndWorkers().finally(reloadFromNetwork);
      }
    }
  }

  handleReload = () => {
    clearReloadGuards();
    clearCachesAndWorkers().finally(reloadFromNetwork);
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const title = this.state.isChunkError ? "New Version Available" : "Something went wrong";
      const message = this.state.isChunkError
        ? "The application has been updated. Please refresh the page to load the latest dashboard components."
        : "This section could not be opened. Refreshing will reload the app from the server.";

      return (
        <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-white p-8 rounded-card border border-admin-line shadow-lg max-w-md w-full flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-admin-brand-soft text-admin-brand flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-card font-bold text-admin-ink mb-2">{title}</h2>
            <p className="text-body text-admin-muted mb-6 text-sm">
              {message}
            </p>
            <button
              onClick={this.handleReload}
              className="w-full h-10 rounded-control bg-admin-brand hover:bg-admin-brand-dark text-white text-button transition flex items-center justify-center gap-2 shadow-sm"
            >
              <RefreshCw className="w-4 h-4" /> Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
