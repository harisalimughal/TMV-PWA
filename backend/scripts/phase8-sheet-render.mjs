import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const base = "C:/Users/fc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { FileBlob, SpreadsheetFile } = await import(pathToFileURL(path.join(base, "@oai/artifact-tool/dist/artifact_tool.mjs")).href);
const dir = path.resolve("../outputs/phase8-check");
const book = await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(dir, "synthetic-3.xlsx")));
console.log((await book.inspect({ kind: "sheet", include: "id,name", maxChars: 2000 })).ndjson);
for (const sheetName of ["Summary", "Performance", "Payments", "Jobs", "Comparison", "Tunnels", "Congestion", "Liabilities"]) {
  const render = await book.render({ sheetName, range: sheetName === "Summary" ? "A1:B18" : sheetName === "Tunnels" ? "A1:C12" : "A1:H8", scale: 1, format: "png" });
  await fs.writeFile(path.join(dir, `sheet-${sheetName}.png`), new Uint8Array(await render.arrayBuffer()));
}
