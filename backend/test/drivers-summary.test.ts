import { describe, expect, it } from "vitest";
import { ExtraChargeType, JobStatus } from "../src/jobs/job.types";
import { summarizeDrivers } from "../src/admin/dashboard/drivers-summary.routes";

describe("summarizeDrivers", () => {
  it("rolls up congestion, tunnel and overtime minutes per driver", () => {
    const [row] = summarizeDrivers(
      [{
        initials: "TI",
        fullName: "Tiago",
        email: "tiago@example.com",
        chatUserName: "",
        active: true,
        role: "Driver",
        phone: "",
        vanRegistration: "",
        imei: ""
      }],
      [
        {
          driverInitials: "TI",
          driverName: "Tiago",
          driverEmail: "tiago@example.com",
          status: JobStatus.COMPLETED,
          amountCharged: 30000,
          paymentMethod: "Cash",
          actualMinutes: 180,
          delayMinutes: 0,
          overtimeMinutes: 45,
          extraChargeSelections: [ExtraChargeType.CONGESTION, ExtraChargeType.TUNNEL],
          congestionCharge: 2000,
          tunnelCharge: 1500,
          evidenceCompleteness: {
            arrival: "COMPLETED",
            vanLoaded: "COMPLETED",
            stopBy: "MISSING",
            emptyVan: "COMPLETED",
            organized: "MISSING",
            signature: "COMPLETED"
          }
        } as any
      ]
    );

    expect(row.congestionChargePounds).toBe(20);
    expect(row.tunnelChargePounds).toBe(15);
    expect(row.overtimeMinutes).toBe(45);
  });
});
