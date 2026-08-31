import React from "react";
import { FileSpreadsheet, Download, CheckCircle2 } from "lucide-react";
import { sounds } from "../utils/audio";
import { Button } from "../../../../ui";

export function ReportsPage() {
  const downloadAllJobsCsv = () => {
    sounds.playSuccess();
    window.location.href = "/api/admin/jobs/export.csv";
  };

  const downloadCompletedJobsCsv = () => {
    sounds.playSuccess();
    window.location.href = "/api/admin/jobs/export.csv?status=COMPLETED";
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-title text-fg">Reports</h2>
        <p className="mt-0.5 text-label font-normal text-fg-muted">
          Downloadable operational datasets and certified export files
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="flex flex-col justify-between rounded-card border border-line bg-surface p-6 shadow-xs transition hover:shadow-sm">
          <div>
            <div className="mb-4 flex size-10 items-center justify-center rounded-card bg-brand-subtle text-brand">
              <FileSpreadsheet className="size-5" />
            </div>
            <h3 className="mb-1 text-card text-fg">Complete Jobs Workbook (CSV)</h3>
            <p className="mb-4 text-label font-normal text-fg-muted">
              Full dataset including scheduled start, actual timing variance, financials, driver mapping and
              evidence status.
            </p>
          </div>
          <Button fullWidth onClick={downloadAllJobsCsv} iconLeft={<Download />}>
            Download complete CSV
          </Button>
        </div>

        <div className="flex flex-col justify-between rounded-card border border-line bg-surface p-6 shadow-xs transition hover:shadow-sm">
          <div>
            <div className="mb-4 flex size-10 items-center justify-center rounded-card bg-success-subtle text-success">
              <CheckCircle2 className="size-5" />
            </div>
            <h3 className="mb-1 text-card text-fg">Completed Jobs Audit (CSV)</h3>
            <p className="mb-4 text-label font-normal text-fg-muted">
              Filtered to completed jobs with financial totals, customer sign-off names and Drive folder URLs.
            </p>
          </div>
          <Button variant="secondary" fullWidth onClick={downloadCompletedJobsCsv} iconLeft={<Download />}>
            Download completed jobs CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
