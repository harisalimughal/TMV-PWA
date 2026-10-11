import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { stagingConfig } = require("../scripts/phase9-staging-inventory.cjs");
const production = "mongodb://production.example/tmv_pwa";

describe("staging verifier target isolation", () => {
  it("never falls back to the production URI", () => {
    expect(() => stagingConfig({ MONGODB_URI: production })).toThrow(/no fallback/);
    expect(() => stagingConfig({ MONGODB_URI: production, LOCAL_MONGODB_URI_PRE_PROD_SWITCH: "true" })).toThrow(/no fallback/);
  });
  it("rejects the same host/database even with different credentials", () => {
    expect(() => stagingConfig({ MONGODB_URI: production,
      LOCAL_MONGODB_URI_PRE_PROD_SWITCH: "mongodb://test:password@production.example/tmv_pwa" })).toThrow(/same host\/database/);
  });
  it("also protects the app's explicit production database override", () => {
    expect(() => stagingConfig({ MONGODB_URI: "mongodb://production.example/uri_name", MONGODB_DB_NAME: "actual_name",
      LOCAL_MONGODB_URI_PRE_PROD_SWITCH: "mongodb://production.example/actual_name" })).toThrow(/same host\/database/);
  });
  it("uses an explicit staging database on a shared cluster", () => {
    const config = stagingConfig({ MONGODB_URI: production,
      LOCAL_MONGODB_URI_PRE_PROD_SWITCH: "mongodb://production.example/staging_only" });
    expect(config.database).toBe("staging_only");
  });
  it("permits an isolated staging host with the configured database name", () => {
    expect(stagingConfig({ MONGODB_URI: production, MONGODB_DB_NAME: "tmv_pwa",
      LOCAL_MONGODB_URI_PRE_PROD_SWITCH: "mongodb://staging.example" }).database).toBe("tmv_pwa");
  });
});
