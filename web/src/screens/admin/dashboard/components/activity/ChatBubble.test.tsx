import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityMessage } from "../../../../../lib/activity";
import { ChatBubble } from "./ChatBubble";

const base: ActivityMessage = {
  id: "act_1", jobId: "TMV-1", kind: "operational", type: "load.photo_submitted", category: "evidence", actor: { role: "driver", driverInitials: "KA", displayName: "Caio" },
  title: "Van loaded photo submitted", occurredAt: "2026-10-16T09:00:00Z", recordedAt: "2026-10-16T09:00:04Z", source: "driver_app", verification: "driver_submitted", idempotencyKey: "k"
};
const show = (patch: Partial<ActivityMessage>) => render(<ul><ChatBubble entry={{ ...base, ...patch }} /></ul>);

describe("ChatBubble", () => {
  it("shows an automatic driver step as a left-aligned event with who submitted it", () => {
    const { container } = show({});
    expect(container.querySelector("[data-bubble='event']")).toBeInTheDocument();
    expect(screen.getByText(/Submitted by the driver/)).toBeInTheDocument();
    expect(container.querySelector("li")).toHaveClass("justify-start");
  });

  it("shows an office message right-aligned as the office's own, never as a driver event", () => {
    const { container } = show({ kind: "message", type: "message.admin_to_driver", category: "message", actor: { role: "admin", displayName: "Office" }, title: "Message from the office", body: "Call me", verification: "not_applicable", delivery: "recorded" });
    expect(container.querySelector("li")).toHaveClass("justify-end");
    expect(screen.getByText("You (office)")).toBeInTheDocument();
    expect(screen.queryByText(/Submitted by the driver/)).not.toBeInTheDocument();
    expect(screen.getByText(/Saved/)).toBeInTheDocument();
  });

  it("claims no delivery when the server does not report one, and never draws ticks", () => {
    const { container } = show({ kind: "message", type: "message.admin_to_driver", category: "message", actor: { role: "admin", displayName: "Office" }, body: "Hi", verification: "not_applicable" });
    expect(container.textContent).not.toMatch(/Saved|sent|delivered|read|✓/);
  });

  it("says a notification could not be sent when the server says so", () => {
    show({ kind: "message", type: "message.admin_to_driver", category: "message", actor: { role: "admin", displayName: "Office" }, body: "Hi", verification: "not_applicable", delivery: "notify_failed" });
    expect(screen.getByText(/notification could not be sent/)).toBeInTheDocument();
  });

  it("labels a tracker observation as not confirmed", () => {
    show({ type: "tracker.pickup_arrival_detected", category: "tracking", verification: "tracker_observed", source: "gps_tracker", title: "Tracker detected arrival" });
    expect(screen.getByText(/Tracker signal, not confirmed/)).toBeInTheDocument();
  });

  it("shows both times when the server received it noticeably later", () => {
    show({ recordedAt: "2026-10-16T09:12:00Z" });
    expect(screen.getByText(/Happened .* received /)).toBeInTheDocument();
  });
});
