import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "./Button";
import { Field } from "./Field";
import { Input } from "./Input";
import { StatusBadge } from "./StatusBadge";
import { SegmentedControl } from "./SegmentedControl";

describe("Button", () => {
  it("calls onClick when enabled", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("blockedReason: stays interactive, calls onBlocked not onClick", () => {
    const onClick = vi.fn();
    const onBlocked = vi.fn();
    render(
      <Button onClick={onClick} onBlocked={onBlocked} blockedReason="Add a photo first">
        Submit
      </Button>
    );
    const btn = screen.getByRole("button", { name: "Submit" });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
    expect(onBlocked).toHaveBeenCalledWith("Add a photo first");
  });

  it("loading: disabled, aria-busy, no click", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Saving
      </Button>
    );
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders an anchor when href is given", () => {
    render(<Button href="/jobs">Jobs</Button>);
    const link = screen.getByRole("link", { name: "Jobs" });
    expect(link).toHaveAttribute("href", "/jobs");
  });
});

describe("Field", () => {
  it("wires label, describedby and aria-invalid to the control", () => {
    render(
      <Field label="Email" error="Required">
        {p => <Input {...p} />}
      </Field>
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const descId = input.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId as string)).toHaveTextContent("Required");
  });

  it("shows the hint when there is no error", () => {
    render(
      <Field label="Email" hint="We only use this to sign you in">
        {p => <Input {...p} />}
      </Field>
    );
    expect(screen.getByText("We only use this to sign you in")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });
});

describe("StatusBadge", () => {
  it("maps a domain status to a human label", () => {
    render(<StatusBadge kind="job" status="IN_PROGRESS" />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
  });

  it("falls back to the raw status for an unknown value", () => {
    render(<StatusBadge kind="job" status="WEIRD_STATE" />);
    expect(screen.getByText("WEIRD_STATE")).toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "a", label: "A" },
    { value: "b", label: "B" },
    { value: "c", label: "C" }
  ];

  it("selects on click", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Pick" value="a" onChange={onChange} options={options} />);
    fireEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("ArrowRight moves the selection and wraps", () => {
    const onChange = vi.fn();
    render(<SegmentedControl aria-label="Pick" value="c" onChange={onChange} options={options} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("marks the active option with aria-checked and makes it the tab stop", () => {
    render(<SegmentedControl aria-label="Pick" value="b" onChange={() => {}} options={options} />);
    const active = screen.getByRole("radio", { name: "B" });
    expect(active).toHaveAttribute("aria-checked", "true");
    expect(active).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("tabindex", "-1");
  });
});
