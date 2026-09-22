import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../components/ui/Toast";
import { PwaInstallPrompt } from "./PwaInstallPrompt";

function renderPrompt() {
  return render(
    <ToastProvider>
      <PwaInstallPrompt />
    </ToastProvider>,
  );
}

function makeInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  return {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  } as unknown as BeforeInstallPromptEvent;
}

describe("PwaInstallPrompt", () => {
  beforeEach(() => {
    window.__tmvInstallPrompt = null;
    window.__tmvInstalled = false;
    Object.defineProperty(window, "onbeforeinstallprompt", {
      configurable: true,
      value: null,
    });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  it("shows a Chrome install call-to-action when the native install prompt is available", () => {
    window.__tmvInstallPrompt = makeInstallPrompt();

    renderPrompt();

    expect(screen.getByText("Install TMV Driver")).toBeInTheDocument();
    expect(screen.getByText("Open faster from your home screen.")).toBeInTheDocument();
  });

  it("uses the captured native prompt when Install App is clicked", async () => {
    const promptEvent = makeInstallPrompt();
    window.__tmvInstallPrompt = promptEvent;
    renderPrompt();

    fireEvent.click(screen.getByRole("button", { name: /install app/i }));

    await waitFor(() => expect(promptEvent.prompt).toHaveBeenCalledTimes(1));
  });
});
