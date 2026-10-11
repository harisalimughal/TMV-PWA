import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Isolated synthetic review server: deliberately no /api proxy or backend environment.
export default defineConfig({ optimizeDeps: { entries: ["phase8-check.html"] }, plugins: [react(), { name: "phase8-synthetic-files", configureServer(server) {
  server.middlewares.use(async (req, res, next) => {
    const match = /^\/phase8-fixtures\/synthetic-(0|3|105)\.(pdf|xlsx|json)$/.exec(req.url || "");
    if (!match) { if (req.url?.startsWith("/api/")) { res.statusCode = 503; res.end("Live backend access is disabled in this review fixture."); } else next(); return; }
    try {
      const buffer = await readFile(fileURLToPath(new URL(`../outputs/phase8-check/synthetic-${match[1]}.${match[2]}`, import.meta.url)));
      res.setHeader("Content-Type", match[2] === "pdf" ? "application/pdf" : match[2] === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/json");
      res.setHeader("Cache-Control", "no-store"); res.end(buffer);
    } catch { res.statusCode = 404; res.end("Run the backend phase8-export-check script first."); }
  });
} }], server: { host: "127.0.0.1", port: 5180, strictPort: true } });
