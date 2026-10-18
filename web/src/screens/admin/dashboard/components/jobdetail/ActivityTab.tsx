/** Activity: only events the backend recorded, filtered by the categories that have data. */
import React, { useMemo, useState } from "react";
import type { NormalizedJob } from "../../types";
import { formatDateTime } from "../../utils/format";
import { cx } from "../../../../../ui/cx";
import { focusRing } from "../ds";
import { Block } from "./parts";
import { ACTIVITY_GROUP_LABEL, activityGroup, humanAction, type ActivityGroup } from "./model";

export function ActivityTab({ job }: { job: NormalizedJob }) {
  const [group, setGroup] = useState<ActivityGroup | "all">("all");
  const entries = useMemo(() => [...(job.activity || [])].sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")), [job.activity]);
  const present = useMemo(() => (Object.keys(ACTIVITY_GROUP_LABEL) as ActivityGroup[]).filter(key => entries.some(entry => activityGroup(entry) === key)), [entries]);
  const shown = group === "all" ? entries : entries.filter(entry => activityGroup(entry) === group);
  return (
    <div className="space-y-4">
      {job.exceptions?.length > 0 && (
        <Block title="Exceptions">
          <ul className="divide-y divide-admin-line text-[14px]">
            {job.exceptions.map((exception, index) => <li key={index} className="py-2"><span className="font-medium">{exception.type.replace(/_/g, " ")}</span><span className="block break-words text-[13px] text-admin-ink-2">{exception.detail} · {formatDateTime(exception.timestamp)}</span></li>)}
          </ul>
        </Block>
      )}
      <Block title="Activity log" aside={entries.length ? `${shown.length} of ${entries.length} events` : undefined}>
        {present.length > 1 && (
          <div role="group" aria-label="Filter activity" className="mb-3 flex flex-wrap gap-1.5">
            {(["all", ...present] as const).map(key => (
              <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)}
                className={cx("rounded-full border px-3 py-1 text-[12.5px] font-semibold", focusRing, group === key ? "border-admin-brand bg-admin-brand-soft text-admin-brand" : "border-admin-line text-admin-ink-2 hover:text-admin-ink")}>{key === "all" ? "All" : ACTIVITY_GROUP_LABEL[key]}</button>
            ))}
          </div>
        )}
        {shown.length ? (
          <ol className="divide-y divide-admin-line text-[14px]">
            {shown.map((entry, index) => (
              <li key={`${entry.timestamp}-${index}`} className="py-2">
                <span className="font-medium text-admin-ink">{humanAction(entry.action)}</span>
                {entry.detail && <span className="block break-words text-[13px] text-admin-ink-2">{entry.detail}</span>}
                <span className="block text-[12.5px] text-admin-ink-2">{entry.driver || "System"} · {formatDateTime(entry.timestamp)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-[13.5px] text-admin-ink-2">No activity recorded for this job.</p>}
      </Block>
    </div>
  );
}
