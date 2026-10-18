import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmProvider, useConfirm } from "./ConfirmProvider";

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const confirm = useConfirm();
  return (
    <button type="button" onClick={async () => onResult(await confirm({ title: "Delete this photo?", body: "Gone for good.", confirmLabel: "Delete photo", tone: "danger" }))}>
      Ask
    </button>
  );
}

describe("useConfirm", () => {
  it("resolves true when confirmed, in a themed dialog instead of window.confirm", async () => {
    const native = vi.spyOn(window, "confirm");
    const result = vi.fn();
    render(<ConfirmProvider><Harness onResult={result} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Delete this photo?")).toBeInTheDocument();
    expect(screen.getByText("Gone for good.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete photo" }));
    await waitFor(() => expect(result).toHaveBeenCalledWith(true));
    expect(native).not.toHaveBeenCalled();
    native.mockRestore();
  });

  it("resolves false on cancel", async () => {
    const result = vi.fn();
    render(<ConfirmProvider><Harness onResult={result} /></ConfirmProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(result).toHaveBeenCalledWith(false));
  });

  it("falls back to window.confirm outside a provider", async () => {
    const native = vi.spyOn(window, "confirm").mockReturnValue(false);
    const result = vi.fn();
    render(<Harness onResult={result} />);
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await waitFor(() => expect(result).toHaveBeenCalledWith(false));
    expect(native).toHaveBeenCalled();
    native.mockRestore();
  });
});
