import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricingSettings, validatePrice } from "./PricingSettings";
import { failureMessage, saveSettingChanges } from "../../hooks/useSettingsDraft";
import { renderPreview, unknownTokens } from "./MessageTemplates";
import { hasUnsavedChanges } from "../../utils/unsavedChanges";

const api = vi.hoisted(() => ({ fetchSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("../../api", () => api);

const spec = (key: string, label: string, value: string, fallback = "") => ({ key, label, type: "number" as const, fallback, value });
let stored: Record<string, string>;
const settingsResponse = () => ({ settings: [
  spec("CREW_RATE_2_MAN", "2-person crew", stored.CREW_RATE_2_MAN, "55"),
  spec("CREW_RATE_3_MAN", "3-person crew", stored.CREW_RATE_3_MAN, "65"),
  spec("PACKING_RATE", "Packing rate", stored.PACKING_RATE, "40"),
  spec("OVERTIME_RATE_PER_30", "Overtime rate", stored.OVERTIME_RATE_PER_30)
] });
const renderPricing = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PricingSettings /></QueryClientProvider>);

beforeEach(() => {
  stored = { CREW_RATE_2_MAN: "55", CREW_RATE_3_MAN: "65", PACKING_RATE: "40", OVERTIME_RATE_PER_30: "" };
  api.fetchSettings.mockReset().mockImplementation(async () => settingsResponse());
  api.saveSetting.mockReset().mockImplementation(async (key: string, value: string) => { stored[key] = value; });
});

describe("saveSettingChanges", () => {
  it("saves each key independently and reports partial failure honestly", async () => {
    const save = vi.fn(async (key: string) => { if (key === "B") throw new Error("Rejected"); });
    const outcome = await saveSettingChanges({ A: "1", B: "2", C: "3" }, save);
    expect(save).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ saved: ["A", "C"], failed: [{ key: "B", message: "Rejected" }] });
    expect(failureMessage(outcome, key => `Field ${key}`)).toBe("2 saved, 1 not saved: Field B.");
    expect(failureMessage({ saved: [], failed: outcome.failed }, key => key)).toBe("Nothing was saved. This change failed: B.");
  });
});

describe("validatePrice", () => {
  it("rejects negative and non-numeric amounts and allows blanks only where a default applies", () => {
    expect(validatePrice("-1", { allowBlank: true })).toBe("Can't be negative");
    expect(validatePrice("abc", { allowBlank: true })).toBe("Enter a number");
    expect(validatePrice("", { allowBlank: false })).toBe("Enter an amount");
    expect(validatePrice("", { allowBlank: true })).toBeNull();
    expect(validatePrice("12.50", { allowBlank: false })).toBeNull();
  });
});

describe("PricingSettings", () => {
  it("shows units on every rate", async () => {
    renderPricing();
    await screen.findByLabelText(/2-person crew/);
    expect(screen.getAllByText("£ per 30 min").length).toBeGreaterThan(0);
  });

  it("tracks unsaved edits, guards navigation and discards back to the stored values", async () => {
    renderPricing();
    const field = await screen.findByLabelText(/2-person crew/);
    fireEvent.change(field, { target: { value: "60" } });
    expect(await screen.findByText("1 unsaved change")).toBeInTheDocument();
    expect(hasUnsavedChanges()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByLabelText(/2-person crew/)).toHaveValue(55);
    expect(hasUnsavedChanges()).toBe(false);
    expect(api.saveSetting).not.toHaveBeenCalled();
  });

  it("refreshes the baseline after saving, so Discard does not revert saved values", async () => {
    renderPricing();
    fireEvent.change(await screen.findByLabelText(/2-person crew/), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();
    expect(api.saveSetting).toHaveBeenCalledWith("CREW_RATE_2_MAN", "60");
    await waitFor(() => expect(api.fetchSettings).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText(/2-person crew/)).toHaveValue(60);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("keeps failed fields editable and names them when a save partly fails", async () => {
    api.saveSetting.mockImplementation(async (key: string, value: string) => { if (key === "PACKING_RATE") throw new Error("Server rejected value"); stored[key] = value; });
    renderPricing();
    fireEvent.change(await screen.findByLabelText(/2-person crew/), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText(/Packing rate/), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(await screen.findByText("1 saved, 1 not saved: Packing rate.")).toBeInTheDocument();
    expect(screen.getByText("Not saved: Server rejected value")).toBeInTheDocument();
    expect(screen.getByLabelText(/Packing rate/)).toHaveValue(45);
    expect(screen.getByRole("button", { name: "Retry failed changes" })).toBeInTheDocument();
    expect(hasUnsavedChanges()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  });

  it("blocks saving an invalid amount", async () => {
    renderPricing();
    fireEvent.change(await screen.findByLabelText(/2-person crew/), { target: { value: "-5" } });
    expect(screen.getByText("Can't be negative")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save pricing" }));
    expect(api.saveSetting).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  });

  it("explains what a blank overtime rate means", async () => {
    renderPricing();
    expect(await screen.findByText(/Blank: overtime is charged at the job's own crew or packing rate/)).toBeInTheDocument();
  });
});

describe("message templates", () => {
  it("finds tokens the message can't fill in", () => {
    expect(unknownTokens("Hi {customerName}, see {pickup} {typo}", ["{customerName}", "{pickup}"])).toEqual(["{typo}"]);
    expect(unknownTokens("body { color: red }", [])).toEqual([]);
  });
  it("previews with clearly fictional sample values", () => {
    expect(renderPreview("Hi {customerName}")).toBe("Hi Alex Sample");
  });
});
