const fs = require("node:fs/promises");
const path = require("node:path");
const { driverExportSample } = require("../test/fixtures/driver-export.sample.ts");
const { generateDriverReportPdf } = require("../src/reports/driver-report.pdf.ts");

async function main() {
  const report = driverExportSample(3);
  report.jobs[0].customer.name = "Sample Customer 1";
  const directory = path.resolve(__dirname, "../../output/pdf");
  await fs.mkdir(directory, { recursive: true });
  const filename = path.join(directory, "driver-breakdown-payment-total.pdf");
  await fs.writeFile(filename, await generateDriverReportPdf(report));
  console.log(filename);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
