const fs = require("node:fs/promises");
const path = require("node:path");
const { generateDriverReportPdf } = require("../dist/reports/driver-report.pdf.js");
const { summarizeReportJobs } = require("../dist/reports/driver-report.model.js");

async function main() {
  const root = path.resolve(__dirname, "../..");
  for (const count of [3, 105, 0]) {
    const report = JSON.parse(await fs.readFile(path.join(root, `outputs/phase8-check/synthetic-${count}.json`), "utf8"));
    report.summary = { ...summarizeReportJobs(report.jobs), movingKnownSeconds: 0, movingUnknownJobs: count, movingPartialJobs: 0 };
    if (count) report.jobs[0].customer.name = "Sample Customer 1";
    if (count === 105) report.jobs[0].customer.name = "Long synthetic customer name ".repeat(70) + "FINAL_CUSTOMER_MARKER";
    report.roadAlerts = count ? ["congestion", "tunnel"].map((type, index) => ({ id: `synthetic-${type}`, type, scheme: type === "congestion" ? "congestion" : "dartford", zone: type === "congestion" ? "Sample congestion zone" : "Dartford Crossing",
      jobId: report.jobs[0].jobId, enteredAt: "2026-10-09T09:10:00Z", exitedAt: "2026-10-09T09:20:00Z", durationSeconds: 600, chargeable: true, estimatedPence: index ? 1360 : 1800, rateBasis: "Job pricing snapshot" })) : [];
    const directory = path.join(root, count === 3 ? "output/pdf" : "tmp/pdfs/driver-clean");
    await fs.mkdir(directory, { recursive: true });
    const name = count === 3 ? "driver-breakdown-clean-sample.pdf" : `driver-clean-${count}.pdf`;
    await fs.writeFile(path.join(directory, name), await generateDriverReportPdf(report));
    console.log(`Generated synthetic ${count}-job report; no database/provider access.`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
