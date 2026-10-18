/**
 * The eight operational milestones of a job, in the order the deployed dashboard shows
 * them. Each is either a recorded time or an explicit reason it is missing; a missing
 * tracker event is never shown as a time and never read as a driver fault.
 */
import type { DriverReportJob } from "../../driverReport.types";
import { withArrivalDistance } from "../../../../../lib/trackerArrival";
import { formatTime } from "../../utils/format";

export interface Milestone { key: string; label: string; source: string; at: string | null; display: string | null; missing: string }

const photoSource = (value?: "captured" | "recorded" | null) => value === "captured" ? "Photo capture time" : value === "recorded" ? "Upload time" : "Driver app";

export function milestones(job: DriverReportJob): Milestone[] {
  const t = job.timings;
  const pickupMissing = t?.trackerUnverifiedReason || "Not recorded";
  const dropoffMissing = t?.trackerDropoffUnverifiedReason || "Not recorded";
  const at = (value: string | null | undefined) => value ?? null;
  return [
    { key: "onTheWay", label: "On the Way", source: "Driver app", at: at(t?.onMyWayAt), display: null, missing: "Not recorded" },
    { key: "pickup", label: "Tracker Pick-up arrival", source: "Tracker", at: at(t?.trackerArrivalAt),
      display: t?.trackerArrivalAt ? withArrivalDistance(formatTime(t.trackerArrivalAt), t.trackerArrivalDistanceMeters) : null, missing: pickupMissing },
    { key: "proof", label: "Proof Photo", source: photoSource(t?.proofPhotoSource), at: at(t?.proofPhotoAt), display: null, missing: "Not recorded" },
    { key: "loaded", label: "Van Loaded", source: photoSource(t?.vanLoadedSource), at: at(t?.vanLoadedAt), display: null, missing: "Not recorded" },
    { key: "dropoff", label: "Tracker Drop-off arrival", source: "Tracker", at: at(t?.trackerDropoffArrivalAt), display: null, missing: dropoffMissing },
    { key: "empty", label: "Empty Van", source: photoSource(t?.emptyVanSource), at: at(t?.emptyVanAt), display: null, missing: "Not recorded" },
    { key: "departure", label: "Tracker Drop-off departure", source: "Tracker", at: at(t?.trackerDropoffDepartureAt), display: null, missing: dropoffMissing },
    { key: "signed", label: "Customer Signed", source: "Customer", at: at(t?.customerSignedAt), display: null, missing: "Not recorded" }
  ].map(item => ({ ...item, display: item.display ?? (item.at ? formatTime(item.at) : null) }));
}
