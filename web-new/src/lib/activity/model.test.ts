import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_EVENT_BY_TYPE, ACTIVITY_FILTER_GROUPS, MESSAGE_TYPES, arrivedLate, bubbleKind, clock, compareActivity, dayLabel, groupByDay, mergeActivity, newestCursor,
  previewText, statusLabel, unreadLabel, type ActivityMessage
} from ".";

const entry = (id: string, occurredAt: string, patch: Partial<ActivityMessage> = {}): ActivityMessage => ({
  id, jobId: "TMV-1", kind: "operational", type: "job.started", category: "lifecycle", actor: { role: "driver", driverInitials: "WD", displayName: "Wander" },
  title: "Driver started the job", occurredAt, recordedAt: occurredAt, source: "driver_app", verification: "driver_submitted", idempotencyKey: `k-${id}`, ...patch
});

describe("ordering", () => {
  it("sorts by when it happened, then when the server stored it, then id", () => {
    const list = [
      entry("c", "2026-10-15T09:00:00Z", { recordedAt: "2026-10-15T09:00:02Z" }),
      entry("b", "2026-10-15T09:00:00Z", { recordedAt: "2026-10-15T09:00:01Z" }),
      entry("a", "2026-10-15T09:00:00Z", { recordedAt: "2026-10-15T09:00:01Z" }),
      entry("z", "2026-10-15T08:00:00Z")
    ];
    expect([...list].sort(compareActivity).map(item => item.id)).toEqual(["z", "a", "b", "c"]);
    expect([...list].reverse().sort(compareActivity).map(item => item.id)).toEqual(["z", "a", "b", "c"]);
  });

  it("puts a late-arriving event where it happened, not where it arrived, and invents nothing", () => {
    const first = entry("1", "2026-10-15T09:00:00Z");
    const third = entry("3", "2026-10-15T10:05:00Z");
    const late = entry("9", "2026-10-15T09:31:00Z", { recordedAt: "2026-10-15T10:40:00Z" });
    const merged = mergeActivity([first, third], [late]);
    expect(merged.map(item => item.id)).toEqual(["1", "9", "3"]);
    expect(merged).toHaveLength(3);
    expect(arrivedLate(late)).toBe(true);
    expect(arrivedLate(first)).toBe(false);
  });

  it("shows a repeated id once and lets an update replace it", () => {
    const original = entry("m1", "2026-10-15T09:00:00Z", { kind: "message", type: "message.admin_to_driver", delivery: "recorded" });
    const updated = { ...original, delivery: "notified" as const, readAt: "2026-10-15T09:05:00Z" };
    const merged = mergeActivity([original], [original, updated]);
    expect(merged).toHaveLength(1);
    expect(merged[0].delivery).toBe("notified");
    expect(merged[0].readAt).toBeTruthy();
  });

  it("takes the newest cursor by server order, whatever the display order", () => {
    expect(newestCursor([entry("0003", "2026-10-15T09:00:00Z"), entry("0009", "2026-10-15T07:00:00Z"), entry("0005", "2026-10-15T10:00:00Z")])).toBe("0009");
    expect(newestCursor([], "0004")).toBe("0004");
    expect(newestCursor([])).toBeUndefined();
  });
});

describe("time", () => {
  it("renders in London time across the clock change", () => {
    expect(clock("2026-07-01T08:00:00Z")).toBe("09:00"); // BST
    expect(clock("2026-12-01T08:00:00Z")).toBe("08:00"); // GMT
  });
  it("groups by London day and names today and yesterday", () => {
    const now = DateTime.fromISO("2026-10-16T12:00:00", { zone: "Europe/London" });
    const groups = groupByDay([entry("1", "2026-10-14T23:30:00Z"), entry("2", "2026-10-15T09:00:00Z"), entry("3", "2026-10-16T09:00:00Z")], now);
    expect(groups.map(group => group.key)).toEqual(["2026-10-15", "2026-10-15", "2026-10-16"].filter((key, index, all) => all.indexOf(key) === index));
    expect(groups.map(group => group.label)).toEqual(["Yesterday", "Today"]);
    expect(groups[0].items).toHaveLength(2);
    expect(dayLabel("2026-01-05", now)).toBe("Mon 5 Jan");
    expect(dayLabel("2025-12-31", now)).toBe("Wed 31 Dec 2025");
  });
});

describe("bubbles", () => {
  const message = (role: "admin" | "driver", patch: Partial<ActivityMessage> = {}) => entry("m", "2026-10-15T09:00:00Z", {
    kind: "message", type: role === "admin" ? "message.admin_to_driver" : "message.driver_to_admin", category: "message", body: "Hello there",
    actor: role === "admin" ? { role, adminId: "a", displayName: "TMV" } : { role, driverInitials: "WD", displayName: "Wander" }, verification: "not_applicable", ...patch
  });
  it("shows the viewer's own messages as outgoing and the other party's as incoming", () => {
    expect(bubbleKind(message("admin"), "admin")).toBe("outgoing");
    expect(bubbleKind(message("driver"), "admin")).toBe("incoming");
    expect(bubbleKind(message("admin"), "driver")).toBe("incoming");
    expect(bubbleKind(message("driver"), "driver")).toBe("outgoing");
  });
  it("never lets a message look like an event, a tracker reading look confirmed, or a routine step look like a warning", () => {
    expect(bubbleKind(entry("e", "2026-10-15T09:00:00Z"), "admin")).toBe("event");
    expect(bubbleKind(entry("t", "2026-10-15T09:00:00Z", { type: "tracker.pickup_arrival_detected", verification: "tracker_observed" }), "admin")).toBe("tracker");
    expect(bubbleKind(entry("w", "2026-10-15T09:00:00Z", { type: "issue.report_submitted" }), "admin")).toBe("warning");
    expect(bubbleKind(entry("n", "2026-10-15T09:00:00Z", { type: "issue.none_reported_pickup" }), "admin")).toBe("event");
    expect(bubbleKind(entry("l", "2026-10-15T09:00:00Z", { type: "legacy.entry" }), "admin")).toBe("legacy");
  });
  it("previews a message by sender and an event by its headline", () => {
    const last = (m: ActivityMessage) => ({ id: m.id, type: m.type, kind: m.kind, category: m.category, title: m.title, body: m.body, occurredAt: m.occurredAt, recordedAt: m.recordedAt, actor: m.actor, verification: m.verification });
    expect(previewText(last(message("admin")), "admin")).toBe("You: Hello there");
    expect(previewText(last(message("driver")), "admin")).toBe("Wander: Hello there");
    expect(previewText(last(message("admin")), "driver")).toBe("TMV: Hello there");
    expect(previewText(last(entry("e", "2026-10-15T09:00:00Z")), "admin")).toBe("Driver started the job");
    expect(previewText(undefined, "admin")).toBe("No activity yet");
  });
});

describe("filters and labels", () => {
  it("offers only event types that exist", () => {
    for (const group of ACTIVITY_FILTER_GROUPS) for (const type of group.types) {
      expect(ACTIVITY_EVENT_BY_TYPE.has(type) || (MESSAGE_TYPES as readonly string[]).includes(type), `${group.id}: ${type}`).toBe(true);
    }
    expect(new Set(ACTIVITY_FILTER_GROUPS.map(group => group.id)).size).toBe(ACTIVITY_FILTER_GROUPS.length);
  });
  it("labels job status and caps the unread count", () => {
    expect(statusLabel("COMPLETED")).toBe("Completed");
    expect(statusLabel("READY")).toBe("Scheduled");
    expect(statusLabel("IN_PROGRESS", "IN_PROGRESS")).toBe("Moving");
    expect(statusLabel("IN_PROGRESS", "WAITING_PAYMENT")).toBe("In progress");
    expect(unreadLabel(7)).toBe("7");
    expect(unreadLabel(250)).toBe("99+");
  });
});
