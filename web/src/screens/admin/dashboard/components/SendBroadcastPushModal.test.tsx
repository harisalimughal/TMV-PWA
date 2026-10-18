import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../../../components/ui/Toast";
import { SendBroadcastPushModal } from "./SendBroadcastPushModal";
import { setIncludeMA } from "../../../../lib/adminDriverScope";

const mocks = vi.hoisted(() => ({ fetchDrivers: vi.fn(), adminFetch: vi.fn() }));
vi.mock("../../../../api/admin", () => ({ fetchDrivers: mocks.fetchDrivers }));
vi.mock("../../../../lib/adminTransport", () => ({ adminFetch: mocks.adminFetch }));

const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });

function setup() {
  const onClose = vi.fn();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><SendBroadcastPushModal isOpen onClose={onClose} /></ToastProvider></QueryClientProvider>);
  return { onClose };
}
const compose = async (message = "Depot closed early today") => {
  await screen.findByRole("option", { name: /Broadcast to all active drivers \(2\)/ });
  fireEvent.change(screen.getByRole("textbox", { name: "Message Content" }), { target: { value: message } });
  fireEvent.click(screen.getByRole("button", { name: "Review notice" }));
};

beforeEach(() => {
  mocks.fetchDrivers.mockReset().mockResolvedValue([
    { initials: "SD", fullName: "Sam Driver", active: true }, { initials: "OL", fullName: "Olive Leaver", active: true }, { initials: "XX", fullName: "Gone Driver", active: false }
  ]);
  mocks.adminFetch.mockReset().mockResolvedValue(reply({ result: { sent: 3 } }));
});

describe("SendBroadcastPushModal", () => {
  it("keeps MA selectable when Overview excludes MA", async () => {
    setIncludeMA(false);
    mocks.fetchDrivers.mockResolvedValue([{ initials: "MA", fullName: "MAN VAN", active: true }, { initials: "SD", fullName: "Sam Driver", active: true }]);
    setup();
    expect(await screen.findByRole("option", { name: "MAN VAN (MA)" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Recipient/), { target: { value: "MA" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message Content" }), { target: { value: "Call the office" } });
    fireEvent.click(screen.getByRole("button", { name: "Review notice" }));
    expect(screen.getByText("MAN VAN (MA)")).toBeInTheDocument();
    expect(mocks.adminFetch).not.toHaveBeenCalled();
  });
  it("cannot be reviewed until there is a message, and, and sends nothing on its own", async () => {
    setup();
    await screen.findByRole("option", { name: /Broadcast to all active drivers \(2\)/ });
    fireEvent.click(screen.getByRole("button", { name: "Review notice" }));
    expect(await screen.findByText("Enter the message.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send Notification" })).not.toBeInTheDocument();
    expect(mocks.adminFetch).not.toHaveBeenCalled();
  });

  it("shows the audience and a preview first, and only sends after Send Notification", async () => {
    setup();
    await compose();
    expect(screen.getByText("All 2 active drivers")).toBeInTheDocument();
    expect(screen.getByText("/?tab=jobs")).toBeInTheDocument();
    expect(screen.getByText("Depot closed early today")).toBeInTheDocument();
    expect(screen.getByText(/can't be recalled/)).toBeInTheDocument();
    expect(mocks.adminFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    await waitFor(() => expect(mocks.adminFetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mocks.adminFetch.mock.calls[0][1].body)).toEqual({ title: "The Man Van Operations", body: "Depot closed early today", url: "/?tab=jobs" });
  });

  it("targets one driver by initials and excludes inactive drivers from the list", async () => {
    setup();
    await screen.findByRole("option", { name: /Broadcast to all active drivers \(2\)/ });
    expect(screen.queryByRole("option", { name: /Gone Driver/ })).toBeNull();
    fireEvent.change(screen.getByLabelText(/Recipient/), { target: { value: "OL" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Message Content" }), { target: { value: "Call the office" } });
    fireEvent.click(screen.getByRole("button", { name: "Review notice" }));
    expect(screen.getByText("Olive Leaver (OL)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    await waitFor(() => expect(mocks.adminFetch).toHaveBeenCalled());
    expect(JSON.parse(mocks.adminFetch.mock.calls[0][1].body).driverInitials).toBe("OL");
  });

  it("reports success only after the server confirms, then closes", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.adminFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { onClose } = setup();
    await compose();
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    await waitFor(() => expect(mocks.adminFetch).toHaveBeenCalled());
    expect(screen.queryByText(/Notification submitted successfully/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    finish(reply({ result: { sent: 3 } }));
    expect(await screen.findByText("Notification submitted successfully. 3 subscribed devices accepted it.")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("sends once however many times Send Notification is triggered", async () => {
    let finish: (value: unknown) => void = () => {};
    mocks.adminFetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    setup();
    await compose();
    const send = screen.getByRole("button", { name: "Send Notification" });
    fireEvent.click(send); fireEvent.click(send); fireEvent.click(send);
    expect(mocks.adminFetch).toHaveBeenCalledTimes(1);
    finish(reply({ result: { sent: 1 } }));
    await screen.findByText("Notification submitted successfully. 1 subscribed device accepted it.");
  });

  it("shows the server's error, keeps the message and does not claim it was sent", async () => {
    mocks.adminFetch.mockResolvedValue(reply({ error: { message: "Push is not configured" } }, false));
    const { onClose } = setup();
    await compose();
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Push is not configured");
    expect(screen.getByText("Depot closed early today")).toBeInTheDocument();
    expect(screen.queryByText(/Notification submitted successfully/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call it a success when no subscribed device received the notice", async () => {
    mocks.adminFetch.mockResolvedValue(reply({ result: { sent: 0 } }));
    const { onClose } = setup();
    await compose();
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no subscribed device received it/);
    expect(screen.queryByText(/Notification submitted successfully/)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("SendBroadcastPushModal as Notify Driver", () => {
  const job = (driverInitials: string) => reply({ job: { jobId: "TMV-9", driverInitials } });
  /** Job lookup first, then the existing broadcast endpoint. */
  const serve = (assigned: string, sent = 1) => mocks.adminFetch.mockImplementation(async (url: string) => String(url).startsWith("/api/admin/jobs/") ? job(assigned) : reply({ result: { sent } }));
  const setupDirect = () => {
    const onClose = vi.fn(), onSent = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider><SendBroadcastPushModal isOpen onClose={onClose} onSent={onSent} direct={{ driver: "SD", jobId: "TMV-9" }} /></ToastProvider></QueryClientProvider>);
    return { onClose, onSent };
  };
  const write = async (text: string) => {
    await screen.findByText(/Only this driver is notified/);
    fireEvent.change(screen.getByRole("textbox", { name: "Message Content" }), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Review notice" }));
  };
  const broadcastCalls = () => mocks.adminFetch.mock.calls.filter(([url]) => String(url).includes("/broadcast"));

  it("is locked to the one driver, titled with the job, with no audience picker or all-drivers option", async () => {
    setupDirect();
    expect(await screen.findByText("Sam Driver (SD)")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Send Push Notification" })).toBeInTheDocument();
    expect(screen.getByLabelText("Notification Title")).toHaveValue("Job Update — TMV-9");
    expect(screen.getByLabelText("Tap Destination URL")).toHaveValue("/?tab=jobs");
    const recipient = screen.getByLabelText(/Recipient/) as HTMLSelectElement;
    expect(recipient).toBeDisabled();
    expect(within(recipient).getAllByRole("option")).toHaveLength(1);
    expect(screen.queryByText(/Broadcast to all/)).not.toBeInTheDocument();
  });

  it("sends through the existing broadcast endpoint to that driver only, after confirming the assignment", async () => {
    serve("SD");
    const { onClose, onSent } = setupDirect();
    await write("Hi Sam, is everything okay? Please check in.");
    expect(mocks.adminFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(broadcastCalls()).toHaveLength(1);
    expect(JSON.parse(broadcastCalls()[0][1].body)).toMatchObject({ title: "Job Update — TMV-9", body: "Hi Sam, is everything okay? Please check in.", driverInitials: "SD" });
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses, and sends nothing, when the job was reassigned or has no driver", async () => {
    serve("TI");
    const { onSent } = setupDirect();
    await write("Hello");
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    expect(await screen.findByText(/reassigned.*Nothing was sent/)).toBeInTheDocument();
    serve("");
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    expect(await screen.findByText(/no assigned driver/)).toBeInTheDocument();
    expect(broadcastCalls()).toHaveLength(0);
    expect(onSent).not.toHaveBeenCalled();
  });

  it("does not claim success when no device received it", async () => {
    serve("SD", 0);
    const { onSent } = setupDirect();
    await write("Hello");
    fireEvent.click(screen.getByRole("button", { name: "Send Notification" }));
    expect(await screen.findByText(/no subscribed device received it/)).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();
  });
});

describe("SendBroadcastPushModal destination", () => {
  it("refuses an off-app destination and sends nothing", async () => {
    setup();
    await compose();
    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    fireEvent.change(screen.getByLabelText("Tap Destination URL"), { target: { value: "https://evil.example/x" } });
    expect(screen.getByText("Use an app path such as /?tab=jobs.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review notice" }));
    expect(screen.queryByRole("button", { name: "Send Notification" })).not.toBeInTheDocument();
    expect(mocks.adminFetch).not.toHaveBeenCalled();
  });
});
