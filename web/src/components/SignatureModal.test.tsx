import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./ui/Toast";
import { SignatureModal } from "./SignatureModal";

describe("SignatureModal", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      arc: vi.fn(),
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      fill: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      setTransform: vi.fn(),
      stroke: vi.fn()
    } as unknown as CanvasRenderingContext2D);
  });

  it("gives the signature canvas a large mobile drawing area", () => {
    render(
      <ToastProvider>
        <SignatureModal
          open
          onClose={vi.fn()}
          onSave={vi.fn()}
          title="Customer sign-off"
          instruction="Ask the customer to sign."
          agreementText="I confirm the job is complete."
        />
      </ToastProvider>
    );

    const canvas = screen.getByRole("img", { name: "Signature pad, empty" });

    expect(canvas.parentElement).toHaveClass("min-h-[360px]");
  });
});
