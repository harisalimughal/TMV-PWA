import { describe, expect, it } from "vitest";
import { ExtraChargeType, JobStatus } from "../src/jobs/job.types";
import { summarizeDrivers } from "../src/admin/dashboard/drivers-summary.routes";

describe("summarizeDrivers", () => {
  it("separates original calculated charges from adjusted driver charges and receipts", () => {
    const [row] = summarizeDrivers([], [
      { driverInitials: "MA", status: JobStatus.COMPLETED, calculatedTotalCharges: 32660, totalCharges: 32660,
        amountCharged: 32660, paymentMethod: "Card", paymentBreakdown: [{ method: "Card", amount: 32660 }], evidenceCompleteness: {} },
      { driverInitials: "MA", status: JobStatus.COMPLETED, calculatedTotalCharges: 32660, totalCharges: 5000,
        amountCharged: 5000, paymentMethod: "Card", paymentBreakdown: [{ method: "Card", amount: 18000 }], evidenceCompleteness: {} },
      { driverInitials: "MA", status: JobStatus.READY, calculatedTotalCharges: 99999, totalCharges: 99999, evidenceCompleteness: {} }
    ] as any);
    expect(row).toMatchObject({ calculatedChargesPounds: 653.2, totalChargesPounds: 376.6,
      revenuePounds: 376.6, totalCollectionsPounds: 506.6, completed: 2 });
  });
  it("preserves an explicit zero calculated total", () => {
    const [row] = summarizeDrivers([], [{ driverInitials: "MA", status: JobStatus.COMPLETED,
      calculatedTotalCharges: 0, totalCharges: 10000, amountCharged: 10000, evidenceCompleteness: {} } as any]);
    expect(row.calculatedChargesPounds).toBe(0);
  });
  it("preserves an explicitly accepted zero total instead of falling back to the original calculation", () => {
    const [row] = summarizeDrivers([], [{ driverInitials: "AB", status: JobStatus.COMPLETED, totalCharges: 0, calculatedTotalCharges: 25000,
      amountCharged: 0, paymentMethod: "Cash", paymentBreakdown: [{ method: "Cash", amount: 0 }], evidenceCompleteness: {} } as any]);
    expect(row.totalChargesPounds).toBe(0);
  });
  it("keeps split receipts, Link and unpaid invoices separate in settlement summaries", () => {
    const [row] = summarizeDrivers([], [{ driverInitials: "AB", status: JobStatus.COMPLETED, amountCharged: 30000, totalCharges: 30000,
      paymentMethod: "Cash + Card + Link + Invoice", paymentBreakdown: [{ method: "Cash", amount: 10000 }, { method: "Card", amount: 5000 }, { method: "Link", amount: 5000 }, { method: "Invoice", amount: 10000 }], evidenceCompleteness: {} } as any]);
    expect(row).toMatchObject({ cashCollectedPounds: 100, cardCollectedPounds: 50, linkCollectedPounds: 50, totalCollectionsPounds: 200, invoiceUncollectedPounds: 100 });
  });
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

  it("rolls up total charges separately from driver charged revenue", () => {
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
          totalCharges: 12000,
          amountCharged: 10000,
          paymentMethod: "Card",
          actualMinutes: 120,
          delayMinutes: 0,
          overtimeMinutes: 0,
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

    expect(row.totalChargesPounds).toBe(120);
    expect(row.revenuePounds).toBe(100);
  });

  it("counts review emails sent and not sent for completed jobs", () => {
    const [row] = summarizeDrivers(
      [{ initials: "TI", fullName: "Tiago", email: "tiago@example.com", chatUserName: "", active: true, role: "Driver", phone: "", vanRegistration: "", imei: "" }],
      [
        { driverInitials: "TI", driverName: "Tiago", status: JobStatus.COMPLETED, reviewEmailSent: true, amountCharged: 0, totalCharges: 0, paymentMethod: "", evidenceCompleteness: {} } as any,
        { driverInitials: "TI", driverName: "Tiago", status: JobStatus.COMPLETED, reviewEmailSent: false, amountCharged: 0, totalCharges: 0, paymentMethod: "", evidenceCompleteness: {} } as any,
        { driverInitials: "TI", driverName: "Tiago", status: JobStatus.IN_PROGRESS, reviewEmailSent: true, amountCharged: 0, totalCharges: 0, paymentMethod: "", evidenceCompleteness: {} } as any
      ]
    );

    expect(row.reviewSentCount).toBe(1);
    expect(row.reviewNotSentCount).toBe(1);
  });
});
