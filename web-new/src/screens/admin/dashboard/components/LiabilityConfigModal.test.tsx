import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiabilityConfigModal } from "./LiabilityConfigModal";

const api = vi.hoisted(() => ({ fetchSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("../api", () => api);

beforeEach(() => {
  api.fetchSettings.mockReset().mockResolvedValue({ settings: [{ key: "LIABILITY_DAMAGE_CATEGORIES", value: JSON.stringify(["Scratch", "Dent"]) }] });
  api.saveSetting.mockReset().mockResolvedValue(undefined);
});

describe("LiabilityConfigModal", () => {
  it("is a labelled dialog portaled to the body, with the saved categories", async () => {
    const { container } = render(<div><LiabilityConfigModal isOpen onClose={vi.fn()} /></div>);
    const dialog = screen.getByRole("dialog", { name: "Manage damage categories" });
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
    expect(await screen.findByDisplayValue("Scratch")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Category 2" })).toHaveValue("Dent");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<LiabilityConfigModal isOpen onClose={onClose} />);
    await screen.findByDisplayValue("Scratch");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("saves the cleaned list and closes", async () => {
    const onClose = vi.fn();
    render(<LiabilityConfigModal isOpen onClose={onClose} />);
    await screen.findByDisplayValue("Scratch");
    fireEvent.change(screen.getByRole("textbox", { name: "New category" }), { target: { value: "  Glass  " } });
    fireEvent.click(screen.getByRole("button", { name: "Add category" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(api.saveSetting).toHaveBeenCalledWith("LIABILITY_DAMAGE_CATEGORIES", JSON.stringify(["Scratch", "Dent", "Glass"]));
  });

  it("renders nothing when closed", () => {
    render(<LiabilityConfigModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
