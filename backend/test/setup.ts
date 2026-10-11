import http from "node:http";
import https from "node:https";
import path from "node:path";

// Worker-local configuration only; never load the developer's live .env or credentials.
process.env.DOTENV_CONFIG_PATH = path.resolve("test/fixtures/no-live-environment.env");
process.env.MONGODB_URI = "mongodb://127.0.0.1:9/tmv_synthetic_test";
process.env.MONGODB_DB_NAME = "tmv_synthetic_test";
process.env.TMV_SIGNATURE_LINK_SECRET = "synthetic-suite-secret-not-for-release";
process.env.TMV_ADMIN_PASSWORD = "synthetic-suite-admin-not-for-release";
for (const key of ["GPS_API", "FIRETEXT_API_KEY", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_WORKSPACE_IMPERSONATED_USER", "VAPID_PRIVATE_KEY", "VAPID_PUBLIC_KEY", "TMV_GPSLIVE_WEBHOOK_TOKEN"]) process.env[key] = "";

function localOnly(input: unknown) {
  const value = typeof input === "string" ? new URL(input) : input instanceof URL ? input : input as { hostname?: string; host?: string; socketPath?: string };
  const host = "hostname" in value ? value.hostname : undefined;
  if (value && "socketPath" in value && value.socketPath) throw new Error("Socket-path network calls are disabled in tests.");
  const hostname = host || ("host" in value ? value.host?.split(":")[0] : undefined) || "localhost";
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) throw new Error("External HTTP calls are disabled in tests; mock the provider adapter.");
}
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  localOnly(typeof input === "object" && "url" in input ? input.url : input);
  return nativeFetch(input, options);
};
for (const client of [http, https]) {
  for (const method of ["request", "get"] as const) {
    const original = client[method];
    client[method] = ((...args: unknown[]) => { localOnly(args[0]); return (original as (...values: unknown[]) => unknown)(...args); }) as typeof original;
  }
}
