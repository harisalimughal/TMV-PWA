import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../ui/Toast";
import { FeaturedJobCard } from "./FeaturedJobCard";
import type { Job } from "../../api/jobs";

const startJob = vi.fn().mockResolvedValue({});
const sendOnMyWay = vi.fn().mockResolvedValue({});
const markJobViewed = vi.fn().mockResolvedValue({});

vi.mock("../../api/jobs", async importOriginal => ({
  ...(await importOriginal<typeof import("../../api/jobs")>()),
  startJob: (...args: any[]) => startJob(...args),
  sendOnMyWay: (...args: any[]) => sendOnMyWay(...args),
  markJobViewed: (...args: any[]) => markJobViewed(...args)
}));

function job(overrides: Partial<Job> = {}): Job {
  return {
    jobId: "TMV-ARRIVAL",
    calendarEventId: "cal-arrival",
    driverInitials: "SD",
    customerName: "Priya Shah",
    customerEmail: "priya@example.com",
    customerPhone: "+44 7700 900201",
    pickup: "7 Larch Close, London N1 7DP",
    pickupLocation: { lat: 51.5394, lng: -0.1027 },
    dropoff: "22 Bridge Road, St Albans AL1 3RX",
    stopBy: "",
    floorFrom: "",
    floorTo: "",
    crewSize: 2,
    vanSize: "",
    hireDurationText: "",
    extraRequest: "",
    inventory: "",
    extraChargeText: "",
    basePrice: 285,
    paidOnline: false,
    bookedStart: "2026-09-30T08:30:00+01:00",
    bookedFinish: "2026-09-30T11:30:00+01:00",
    actualStart: "",
    actualFinish: "",
    bookedMinutes: 180,
    actualMinutes: 0,
    differenceMinutes: 0,
    delayStatus: "Waiting",
    extraCharges: [],
    overtimeMinutes: 0,
    overtimeCharge: 0,
    totalCharges: 285,
    amountCharged: 0,
    paymentMethod: "",
    paymentStatus: "Pending",
    clientNamePostcode: "",
    clientConfirmedBy: "",
    signatureUrl: "",
    status: "READY",
    currentState: "READY",
    onMyWayAt: "2026-09-30T06:45:00.000Z",
    rawTitle: "2 Men - £285 - 08:30 / Y - SD",
    rawDescription: "Pickup: 7 Larch Close",
    createdAt: "2026-09-30T06:00:00.000Z",
    updatedAt: "2026-09-30T06:00:00.000Z",
    ...overrides
  };
}

describe("FeaturedJobCard arrival automation", () => {
  let positionCallback: PositionCallback;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        watchPosition: vi.fn((success: PositionCallback) => {
          positionCallback = success;
          return 7;
        }),
        clearWatch: vi.fn()
      }
    });
  });

  it("opens Proof of Arrival automatically when the driver reaches the pickup", async () => {
    const onStarted = vi.fn();
    render(
      <ToastProvider>
        <FeaturedJobCard job={job()} onStarted={onStarted} />
      </ToastProvider>
    );

    expect(screen.getByRole("button", { name: /proof of arrival/i })).toBeInTheDocument();
    await waitFor(() => expect(navigator.geolocation.watchPosition).toHaveBeenCalled());

    act(() => {
      positionCallback({
        coords: {
          latitude: 51.5398,
          longitude: -0.1021,
          accuracy: 25,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: Date.now()
      } as GeolocationPosition);
    });

    await waitFor(() => expect(startJob).toHaveBeenCalledWith("TMV-ARRIVAL"));
    expect(onStarted).toHaveBeenCalledWith("TMV-ARRIVAL");
  });

  it("opens Proof of Arrival from a confirmed tracker arrival without phone geolocation", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    const onStarted = vi.fn();
    render(
      <ToastProvider>
        <FeaturedJobCard job={job({ trackerArrivalAt: "2026-09-30T08:25:00.000Z" })} onStarted={onStarted} />
      </ToastProvider>
    );

    await waitFor(() => expect(startJob).toHaveBeenCalledWith("TMV-ARRIVAL"));
    expect(onStarted).toHaveBeenCalledWith("TMV-ARRIVAL");
  });
});
