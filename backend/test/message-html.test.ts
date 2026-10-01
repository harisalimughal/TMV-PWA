import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type Job } from "../src/jobs/job.types";
import { WorkflowState } from "../src/workflow/workflow.states";

const getSetting = vi.fn();

vi.mock("../src/db/settings.repo", () => ({
  getSetting: (key: string, fallback: string) => getSetting(key, fallback)
}));

import { findMessageDef, getMessageHtml } from "../src/notifications/message-catalog";
import { renderTemplatedEmailContent } from "../src/google/gmail";

function job(): Job {
  return {
    jobId: "TMV-HTML",
    calendarEventId: "cal-html",
    driverInitials: "AB",
    customerName: "Sarah Jenkins",
    customerEmail: "sarah@example.com",
    customerPhone: "",
    pickup: "Pickup Road",
    dropoff: "Drop Road",
    crewSize: 2,
    basePrice: 120,
    paidOnline: false,
    bookedStart: "2026-09-25T09:00:00.000Z",
    bookedFinish: "2026-09-25T11:00:00.000Z",
    actualStart: "",
    actualFinish: "",
    bookedMinutes: 120,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 120,
    amountCharged: 0,
    paymentMethod: "",
    paymentStatus: "",
    clientNamePostcode: "",
    clientConfirmedBy: "",
    signatureUrl: "",
    driveFolderId: "",
    driveFolderUrl: "",
    status: JobStatus.READY,
    currentState: WorkflowState.READY,
    rawTitle: "",
    rawDescription: "",
    createdAt: "2026-09-25T08:00:00.000Z",
    updatedAt: "2026-09-25T08:00:00.000Z"
  } as Job;
}

describe("email HTML message templates", () => {
  beforeEach(() => {
    getSetting.mockReset();
  });

  it("exposes optional HTML keys for email templates only", () => {
    expect(findMessageDef("CUSTOMER_JOB_STARTED_EMAIL")?.htmlKey).toBe("JOB_STARTED_EMAIL_HTML");
    expect(findMessageDef("CUSTOMER_JOB_STARTED_EMAIL")?.htmlEnabledKey).toBe("JOB_STARTED_EMAIL_HTML_ENABLED");
    expect(findMessageDef("CUSTOMER_REVIEW_REQUEST_EMAIL")?.htmlKey).toBe("REVIEW_REQUEST_EMAIL_HTML");
    expect(findMessageDef("DRIVER_JOB_ASSIGNMENT_EMAIL")?.htmlKey).toBe("DRIVER_JOB_ASSIGNMENT_EMAIL_HTML");
    expect(findMessageDef("CUSTOMER_JOB_STARTED_SMS")?.htmlKey).toBeUndefined();
  });

  it("renders saved HTML only when the HTML toggle is enabled", async () => {
    getSetting.mockImplementation((key: string, fallback: string) => {
      if (key === "JOB_STARTED_EMAIL_HTML_ENABLED") return Promise.resolve("true");
      if (key === "JOB_STARTED_EMAIL_HTML") return Promise.resolve("<h1>Hello {customerName}</h1><p>{pickup}</p>");
      return Promise.resolve(fallback);
    });

    await expect(getMessageHtml("CUSTOMER_JOB_STARTED_EMAIL", job())).resolves.toBe(
      "<h1>Hello Sarah Jenkins</h1><p>Pickup Road</p>"
    );
    expect(getSetting).toHaveBeenCalledWith("JOB_STARTED_EMAIL_HTML_ENABLED", "false");
    expect(getSetting).toHaveBeenCalledWith("JOB_STARTED_EMAIL_HTML", "");
  });

  it("returns no HTML when code is saved but the HTML toggle is off", async () => {
    getSetting.mockImplementation((key: string, fallback: string) => {
      if (key === "JOB_STARTED_EMAIL_HTML_ENABLED") return Promise.resolve("false");
      if (key === "JOB_STARTED_EMAIL_HTML") return Promise.resolve("<h1>Saved but off</h1>");
      return Promise.resolve(fallback);
    });

    await expect(getMessageHtml("CUSTOMER_JOB_STARTED_EMAIL", job())).resolves.toBe("");
    expect(getSetting).toHaveBeenCalledWith("JOB_STARTED_EMAIL_HTML_ENABLED", "false");
    expect(getSetting).not.toHaveBeenCalledWith("JOB_STARTED_EMAIL_HTML", "");
  });

  it("keeps email text as fallback while adding rendered HTML", () => {
    const content = renderTemplatedEmailContent(
      "Plain hello {customerName}",
      job(),
      undefined,
      "<strong>Hello {customerName}</strong>"
    );

    expect(content.text).toBe("Plain hello Sarah Jenkins");
    expect(content.html).toBe("<strong>Hello Sarah Jenkins</strong>");
  });
});
