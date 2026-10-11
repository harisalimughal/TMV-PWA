import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import ExcelJS from "exceljs";
import { driverExportSample } from "../test/fixtures/driver-export.sample";
import { generateDriverReportXlsx } from "../src/reports/driver-report.xlsx";
import { generateDriverReportPdf } from "../src/reports/driver-report.pdf";

async function main() {
  const count = Number(process.argv[2] || 500);
  if (!Number.isSafeInteger(count) || count < 1 || count > 700) throw new RangeError("Synthetic stress check accepts 1-700 jobs only.");
  const dir = path.resolve("../outputs/phase9-check"); await mkdir(dir, { recursive: true });
  const report = driverExportSample(count), before = process.memoryUsage().rss;
  const start = performance.now(), excel = await generateDriverReportXlsx(report), excelMs = performance.now() - start;
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(excel as any);
  assert.equal(workbook.getWorksheet("Jobs")!.getCell(count + 4, 1).value, `SAMPLE-${String(count).padStart(3, "0")}`);
  const pdfStart = performance.now(), pdf = await generateDriverReportPdf(report), pdfMs = performance.now() - pdfStart;
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  await writeFile(path.join(dir, `synthetic-${count}.xlsx`), excel); await writeFile(path.join(dir, `synthetic-${count}.pdf`), pdf);
  const result = { syntheticOnly: true, jobCount: count, excelBytes: excel.length, pdfBytes: pdf.length, excelMs, pdfMs, baselineRssBytes: before,
    finalRssBytes: process.memoryUsage().rss, processHighWaterRssKiB: process.resourceUsage().maxRSS,
    notes: ["Serializer check only; no database, provider, notification or upload calls. Not a production capacity guarantee.", "Process memory includes libraries, report data and XLSX reopening; validate real deployment limits in staging."] };
  await writeFile(path.join(dir, "stress.json"), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
