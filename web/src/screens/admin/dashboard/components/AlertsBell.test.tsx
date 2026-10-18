import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttentionItem } from "../hooks/useAttention";
import { AlertsBell } from "./AlertsBell";

const attention = vi.hoisted(() => ({ items: [] as AttentionItem[] }));
vi.mock("../hooks/useAttention", () => ({ useAttention: () => ({ items: attention.items, failed: [], loading: false }) }));

const item = (id: string, severity: AttentionItem["severity"], at = "2026-10-15T09:00:00Z"): AttentionItem =>
  ({ id, severity, category: "unassigned", title: `Item ${id}`, detail: "Detail", at, action: { label: "Open", kind: "job", target: id } });

beforeEach(() => {
  localStorage.clear();
  attention.items = [item("a", "high"), item("b", "medium"), item("c", "low")];
});

const bell = () => screen.getByRole("button", { name: /^Alerts:/ });

describe("AlertsBell", () => {
  it("marks every item read: the badge clears, the items stay listed", () => {
    render(<AlertsBell onOpenAlerts={vi.fn()} />);
    expect(bell()).toHaveAccessibleName(/3 items need attention, 3 unread/);
    expect(bell()).toHaveTextContent("2"); // urgent (high and medium) unread
    fireEvent.click(bell());
    const panel = screen.getByRole("dialog", { name: "Needs attention" });
    fireEvent.click(within(panel).getByRole("button", { name: "Mark all as read" }));
    expect(bell()).toHaveAccessibleName(/3 items need attention, 0 unread/);
    expect(bell()).not.toHaveTextContent("2");
    expect(within(panel).getAllByText(/^Item /)).toHaveLength(3);
    expect(within(panel).getAllByText("Read.")).toHaveLength(3);
    expect(within(panel).getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  });

  it("remembers the read state after a reload and counts new or changed items as unread", () => {
    const view = render(<AlertsBell onOpenAlerts={vi.fn()} />);
    fireEvent.click(bell());
    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));
    view.unmount();
    attention.items = [item("a", "high"), item("b", "medium", "2026-10-15T11:00:00Z"), item("d", "high")];
    render(<AlertsBell onOpenAlerts={vi.fn()} />);
    expect(bell()).toHaveAccessibleName(/3 items need attention, 2 unread/); // b changed, d is new
    expect(bell()).toHaveTextContent("2");
  });
});
