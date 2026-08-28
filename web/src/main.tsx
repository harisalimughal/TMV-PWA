import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Chat/job data is live and short-lived -- don't let react-query silently serve a
    // stale cached response, that's exactly the kind of bug that erodes driver trust
    // ("it says I have no jobs but I do").
    queries: { staleTime: 0, refetchOnWindowFocus: true }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
