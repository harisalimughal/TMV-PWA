#!/usr/bin/env node
/**
 * Guards the driver PWA's offline precache after `npm run build`.
 *
 * Drivers install this app on their phones, and the service worker downloads every
 * precached file in the background (again on every deploy, for files whose hash changed).
 * The admin dashboard is only used on desktop, so its code must stay out of that list,
 * while everything the driver app needs offline must stay in it.
 *
 * Uses the chunk graph written during the build by scripts/adminChunks.ts. Fails when:
 *   1. any admin-only file (JS or CSS) is precached,
 *   2. any driver file (JS or CSS) is missing from the precache (would break offline use),
 *   3. the precache grows past the budget.
 *
 * Usage: npm run build && npm run check:precache
 * Budget override: PRECACHE_BUDGET_KIB=2600 npm run check:precache
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const GRAPH = join(ROOT, "node_modules", ".cache", "tmv-web", "chunk-graph.json");
const DEFAULT_BUDGET_KIB = 2400;

const fail = message => { console.error(`check-precache: ${message}`); process.exit(1); };

const budgetSetting = process.env.PRECACHE_BUDGET_KIB;
const BUDGET_KIB = budgetSetting === undefined || budgetSetting === "" ? DEFAULT_BUDGET_KIB : Number(budgetSetting);
if (!Number.isFinite(BUDGET_KIB) || BUDGET_KIB <= 0) fail(`PRECACHE_BUDGET_KIB must be a positive number, got "${budgetSetting}".`);

const swPath = join(DIST, "sw.js");
if (!existsSync(swPath)) fail("dist/sw.js not found. Run `npm run build` first.");
if (!existsSync(GRAPH)) fail("chunk graph not found (node_modules/.cache/tmv-web/chunk-graph.json). Run `npm run build` first.");

const sw = readFileSync(swPath, "utf8");
const precached = [...new Set([...sw.matchAll(/url:"([^"]+)"/g)].map(match => match[1].replace(/^\/+/, "")))];
if (precached.length === 0) fail("no precache entries found in dist/sw.js (did the Workbox output format change?).");

const graph = JSON.parse(readFileSync(GRAPH, "utf8"));
if (!graph.adminEntryFound) fail("the build has no AdminApp chunk, so admin-only code cannot be identified. Was src/screens/admin/AdminApp.tsx moved?");
if (graph.adminEntryCount !== 1) fail(`expected 1 AdminApp chunk (src/screens/admin), found ${graph.adminEntryCount}. An admin entry that is not recognised ends up in the driver precache.`);

const precachedSet = new Set(precached);
const isCode = file => /\.(js|css)$/.test(file);
const adminLeaks = graph.adminOnlyFiles.filter(file => precachedSet.has(file));
const driverMissing = graph.driverFiles.filter(file => isCode(file) && !precachedSet.has(file));

let totalBytes = 0;
const missingOnDisk = [];
const rows = precached.map(url => {
  const file = join(DIST, url);
  if (!existsSync(file)) { missingOnDisk.push(url); return { url, bytes: 0 }; }
  const bytes = statSync(file).size;
  totalBytes += bytes;
  return { url, bytes };
});
const totalKib = totalBytes / 1024;

console.log(`Precache: ${rows.length} files, ${totalKib.toFixed(0)} KiB (budget ${BUDGET_KIB} KiB)`);
console.log(`Chunk graph: ${graph.driverFiles.length} driver files, ${graph.adminOnlyFiles.length} admin-only files (not precached)`);
for (const row of [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, 8)) {
  console.log(`  ${(row.bytes / 1024).toFixed(1).padStart(8)} KiB  ${row.url}`);
}
if (missingOnDisk.length) console.warn(`warning: precached but not found in dist/: ${missingOnDisk.join(", ")}`);

const problems = [];
if (adminLeaks.length) problems.push(`admin-only file(s) precached: ${adminLeaks.join(", ")}`);
if (driverMissing.length) problems.push(`driver file(s) missing from the precache (offline would break): ${driverMissing.join(", ")}`);
if (totalKib > BUDGET_KIB) problems.push(`precache is ${totalKib.toFixed(0)} KiB, over the ${BUDGET_KIB} KiB budget`);

if (problems.length) {
  console.error("\ncheck-precache FAILED:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nSee CLAUDE.md, 'PWA precache rule', and scripts/adminChunks.ts.");
  process.exit(1);
}
console.log("check-precache: OK");
