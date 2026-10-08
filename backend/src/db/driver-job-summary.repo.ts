import { driverJobSummariesCollection } from "./mongo";

export type DriverSummaryPaymentMethod = "Cash" | "Card" | "Link" | "Invoice/Transfer";

export interface DriverJobSummaryPaymentItem {
  method: DriverSummaryPaymentMethod;
  amountPence: number;
}

export interface DriverJobSummaryDoc {
  jobId: string;
  driverEmail: string;
  driverInitials: string;
  startTime: string;
  endTime: string;
  congestionCharge: boolean;
  congestionChargePence: number;
  helperName: string;
  helperHours: number;
  paymentMethod: string;
  amountCollectedPence: number;
  paymentBreakdown?: DriverJobSummaryPaymentItem[];
  submittedAt: string;
  createdAt: Date;
}

export type NewDriverJobSummary = Omit<DriverJobSummaryDoc, "createdAt">;

export async function insertDriverJobSummary(summary: NewDriverJobSummary): Promise<DriverJobSummaryDoc> {
  const col = await driverJobSummariesCollection();
  const doc: DriverJobSummaryDoc = { ...summary, createdAt: new Date() };
  await col.insertOne(doc);
  return doc;
}

export async function getDriverJobSummary(jobId: string): Promise<DriverJobSummaryDoc | null> {
  const col = await driverJobSummariesCollection();
  return col.findOne({ jobId });
}

export async function listDriverJobSummariesForJobs(jobIds: string[]): Promise<DriverJobSummaryDoc[]> {
  if (jobIds.length === 0) return [];
  const col = await driverJobSummariesCollection();
  return col.find({ jobId: { $in: jobIds } }).toArray();
}

export async function listAllDriverJobSummaries(): Promise<DriverJobSummaryDoc[]> {
  const col = await driverJobSummariesCollection();
  return col.find({}).toArray();
}
