import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Car, FileWarning, PackageMinus, PackagePlus } from "lucide-react";
import {
  fetchJobScenarios,
  fetchJobsList,
  type ApiError,
  type Job,
  type ScenarioSubmission
} from "../api/jobs";
import { AppShell } from "../app/AppShell";
import { OfflineBanner } from "../app/OfflineBanner";
import { IssueChoiceCard } from "../components/driver";
import type { ScenarioKey } from "../scenarioSpec";
import { Alert, Field, Select, Skeleton, cx } from "../ui";
import { ScenarioFormScreen } from "./ScenarioFormScreen";
import {
  liabilityCheckpointOptions,
  pickLiabilityJob,
  reportedAtForLiabilityCheckpoint,
  type LiabilityCheckpoint
} from "./liabilityFlow";

export type { LiabilityCheckpoint } from "./liabilityFlow";

interface LiabilityScreenProps {
  initialCheckpoint?: LiabilityCheckpoint;
  initialJobId?: string;
}

const LIABILITY_SCENARIOS: Array<{
  key: ScenarioKey;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    key: "parking",
    title: "Parking Liability",
    description: "Restricted bay, red route, or anywhere a PCN could land.",
    icon: <Car aria-hidden />
  },
  {
    key: "liability",
    title: "Other Liability",
    description: "Damage, unprotected items, overloading, or anything that needs evidence.",
    icon: <FileWarning aria-hidden />
  },
  {
    key: "checkin",
    title: "Check-In",
    description: "Record items entering storage for this job.",
    icon: <PackagePlus aria-hidden />
  },
  {
    key: "checkout",
    title: "Check-Out",
    description: "Release stored items for this job.",
    icon: <PackageMinus aria-hidden />
  }
];

export function LiabilityScreen({ initialCheckpoint, initialJobId }: LiabilityScreenProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [submissions, setSubmissions] = useState<ScenarioSubmission[]>([]);
  const [checkpoint, setCheckpoint] = useState<LiabilityCheckpoint | "">(initialCheckpoint ?? "");
  const [openScenario, setOpenScenario] = useState<ScenarioKey | null>(null);

  useEffect(() => {
    setCheckpoint(initialCheckpoint ?? "");
  }, [initialCheckpoint, initialJobId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchJobsList();
      const job = pickLiabilityJob(list, initialJobId);
      setActiveJob(job);
      if (job) {
        const scenarioResult = await fetchJobScenarios(job.jobId);
        setSubmissions(scenarioResult.submissions ?? []);
      } else {
        setSubmissions([]);
      }
    } catch (err) {
      setError((err as ApiError)?.message || "Couldn't load liability reports.");
    } finally {
      setLoading(false);
    }
  }, [initialJobId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedReportedAt = useMemo(() => {
    if (!activeJob || !checkpoint) return undefined;
    return reportedAtForLiabilityCheckpoint(checkpoint, activeJob);
  }, [activeJob, checkpoint]);

  const existingSubmission = useMemo(() => {
    if (!openScenario || !selectedReportedAt) return undefined;
    const reportedAt = reportedAtValue(selectedReportedAt);
    return submissions
      .filter(submission => submission.scenario === openScenario)
      .filter(submission => !reportedAt || submission.fields?.reported_at === reportedAt)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  }, [openScenario, selectedReportedAt, submissions]);

  if (openScenario && activeJob && selectedReportedAt) {
    return (
      <ScenarioFormScreen
        jobId={activeJob.jobId}
        scenario={openScenario}
        job={{
          customerName: activeJob.customerName,
          customerEmail: activeJob.customerEmail,
          customerPhone: activeJob.customerPhone,
          clientNamePostcode: activeJob.clientNamePostcode,
          rawDescription: activeJob.rawDescription,
          rawTitle: activeJob.rawTitle,
          bookedStart: activeJob.bookedStart,
          bookedFinish: activeJob.bookedFinish
        }}
        reportedAt={selectedReportedAt}
        existingSubmission={existingSubmission}
        onCancel={() => setOpenScenario(null)}
        onDone={() => {
          setOpenScenario(null);
          void load();
        }}
      />
    );
  }

  const cardsEnabled = Boolean(activeJob && checkpoint);

  return (
    <AppShell banner={<OfflineBanner />} contentWidth="content" topInset={false}>
      <div className="flex flex-col gap-5 px-4 pt-5 pb-8 scroll-pb-nav">
        <header className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-warning-subtle text-warning">
            <FileWarning className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-title text-fg">Liability</h1>
            <p className="mt-1 text-body text-fg-muted">Report issues linked to the active job.</p>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 rounded-card" />
            <Skeleton className="h-14 rounded-card" />
            <Skeleton className="h-28 rounded-card" />
          </div>
        ) : (
          <>
            {error && (
              <Alert tone="danger" title="Liability unavailable">
                {error}
              </Alert>
            )}

            {!activeJob && (
              <Alert tone="warning" title="Please start the job to use liability tab">
                Liability reports are saved against the job that is currently in progress.
              </Alert>
            )}

            {activeJob && (
              <div className="rounded-card border border-line bg-surface px-4 py-3.5">
                <p className="text-eyebrow uppercase text-fg-subtle">Active job</p>
                <p className="mt-1 text-card text-fg">{activeJob.customerName || activeJob.jobId}</p>
                <p className="mt-0.5 text-helper text-fg-muted">{activeJob.jobId}</p>
              </div>
            )}

            <Field label="Where are you reporting this?" required>
              {control => (
                <Select
                  {...control}
                  disabled={!activeJob}
                  value={checkpoint}
                  onChange={event => {
                    setCheckpoint(event.target.value as LiabilityCheckpoint | "");
                  }}
                >
                  <option value="">Select checkpoint</option>
                  {liabilityCheckpointOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {!checkpoint && activeJob && (
              <Alert tone="info" title="Select a checkpoint first">
                Pick Pickup, Stop-by, or Drop-off to enable the report options below.
              </Alert>
            )}

            <div
              className={cx(
                "grid gap-3 sm:grid-cols-2",
                !cardsEnabled && "pointer-events-none opacity-45 grayscale"
              )}
              aria-disabled={!cardsEnabled}
            >
              {LIABILITY_SCENARIOS.map(item => (
                <IssueChoiceCard
                  key={item.key}
                  icon={item.icon}
                  title={item.title}
                  description={item.description}
                  onClick={() => {
                    if (!cardsEnabled) return;
                    setOpenScenario(item.key);
                  }}
                />
              ))}
            </div>

          </>
        )}
      </div>
    </AppShell>
  );
}

function reportedAtValue(reportedAt: { label: string; address?: string }): string {
  return reportedAt.address ? `${reportedAt.label} — ${reportedAt.address}` : reportedAt.label;
}
