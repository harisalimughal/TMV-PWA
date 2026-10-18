import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ThemeProvider } from "./ui/theme";
import { ToastProvider } from "./components/ui/Toast";
import { ConfirmProvider } from "./ui/ConfirmProvider";
import { ThemedTooltips } from "./ui/ThemedTooltips";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initServiceWorker } from "./lib/pwa/registration";
import { installKeepFocusedFieldVisible } from "./lib/keepFocusedFieldVisible";
import "./index.css";

// Auto-reload when dynamic chunk import fails due to new deployment
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    console.warn("Vite preload error detected. Reloading for latest assets...", event);
    const reloadKey = "tmv:preload_reload_count";
    const count = parseInt(sessionStorage.getItem(reloadKey) || "0", 10);
    if (count < 2) {
      sessionStorage.setItem(reloadKey, String(count + 1));
      window.location.reload();
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Job and chat data is live and short-lived -- never let react-query serve a
      // stale cached response. That's exactly the bug that erodes driver trust ("it
      // says I have no jobs but I do").
      staleTime: 0,
      refetchOnWindowFocus: true,
      // One retry, not the default three: on a flaky mobile connection three silent
      // retries just makes the failure take 30 seconds to appear.
      retry: 1
    }
  }
});

async function bootstrap() {
  // Development uses the local API by default. Explicitly opt into fictional data
  // with VITE_MOCK_API=true. Mocks are always excluded from production builds.
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "true") {
    const { installMockApi } = await import("./mocks/install");
    installMockApi();
  }

  // Register the service worker early (production only — there is no dev SW). The
  // call is idempotent; the PWA Settings hooks also ensure it.
  if (import.meta.env.PROD) initServiceWorker();

  installKeepFocusedFieldVisible();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <ConfirmProvider>
                <App />
                <ThemedTooltips />
              </ConfirmProvider>
            </ToastProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

void bootstrap();
