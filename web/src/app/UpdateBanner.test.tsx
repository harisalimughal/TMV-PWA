import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateBanner } from "./UpdateBanner";

const updateState = vi.hoisted(() => ({
  needRefresh: true,
  updating: false,
  applyUpdate: vi.fn(async () => {}),
}));

vi.mock("../screens/pwa-settings/hooks/useServiceWorkerUpdate", () => ({
  useServiceWorkerUpdate: () => updateState,
}));

describe("UpdateBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    updateState.needRefresh = true;
    updateState.updating = false;
    updateState.applyUpdate.mockClear();
  });

  it("only renders when a service-worker update is waiting", () => {
    updateState.needRefresh = false;

    render(<UpdateBanner />);

    expect(
      screen.queryByText("A new version of TMV BOT is available."),
    ).not.toBeInTheDocument();
  });

  it("keeps the same pending update dismissed after the app is reopened", () => {
    const firstRender = render(<UpdateBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    firstRender.unmount();

    render(<UpdateBanner />);

    expect(
      screen.queryByText("A new version of TMV BOT is available."),
    ).not.toBeInTheDocument();
  });
});
