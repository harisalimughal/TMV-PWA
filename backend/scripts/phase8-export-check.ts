import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { driverExportSample } from "../test/fixtures/driver-export.sample";
import { generateDriverReportPdf } from "../src/reports/driver-report.pdf";
import { generateDriverReportXlsx } from "../src/reports/driver-report.xlsx";

async function main() {
  const dir = path.resolve("../outputs/phase8-check"); await mkdir(dir, { recursive: true });
  for (const count of [0, 3, 105]) {
    const report = driverExportSample(count);
    await writeFile(path.join(dir, `synthetic-${count}.json`), JSON.stringify(report));
    await writeFile(path.join(dir, `synthetic-${count}.pdf`), await generateDriverReportPdf(report));
    await writeFile(path.join(dir, `synthetic-${count}.xlsx`), await generateDriverReportXlsx(report));
  }
  console.log(`Synthetic export checks saved to ${dir}; no database or provider access.`);
}
void main();
