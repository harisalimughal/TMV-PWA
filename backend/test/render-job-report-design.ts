import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateJobPdf } from "../src/admin/dashboard/pdf-generator";
import type { NormalizedJob } from "../src/admin/dashboard/types";
import { paperJobSample } from "../../web/test/reportPreview.sample";

async function main() {
  const directory = path.resolve("../output/pdf");
  await mkdir(directory, { recursive: true });
  const job = { ...paperJobSample, reviewEmailStatus: "No" } as unknown as NormalizedJob;
  await writeFile(path.join(directory, "job-report-design-sample.pdf"), await generateJobPdf(job));
  console.log("Created synthetic job report design sample; no database/provider access.");
}
void main();
