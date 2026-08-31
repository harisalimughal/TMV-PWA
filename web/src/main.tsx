import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ThemeProvider } from "./ui/theme";
import { ToastProvider } from "./components/ui/Toast";
import { initServiceWorker } from "./lib/pwa/registration";
import "./index.css";

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
  // Dev-only in-repo mock API. Statically false in `vite build`, so the whole
  // src/mocks/ tree is tree-shaken out of production. Set VITE_MOCK_API=false to
  // run `npm run dev` against a real backend on the Vite proxy target instead.
  if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API !== "false") {
    const { installMockApi } = await import("./mocks/install");
    installMockApi();
  }

  // Register the service worker early (production only — there is no dev SW). The
  // call is idempotent; the PWA Settings hooks also ensure it.
  if (import.meta.env.PROD) initServiceWorker();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <App />
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}

void bootstrap();
