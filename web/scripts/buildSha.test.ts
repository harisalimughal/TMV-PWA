import { describe, expect, it, vi } from "vitest";
import { resolveBuildSha } from "./buildSha";

describe("resolveBuildSha", () => {
  it("uses GITHUB_SHA when set, shortened, without running git", () => {
    const git = vi.fn(() => "abc1234");
    expect(resolveBuildSha({ GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567" }, git)).toBe("0123456");
    expect(git).not.toHaveBeenCalled();
  });

  it("falls back to the local git short sha", () => {
    expect(resolveBuildSha({}, () => "9fceb02\n")).toBe("9fceb02");
    expect(resolveBuildSha({ GITHUB_SHA: "  " }, () => "9fceb02")).toBe("9fceb02");
  });

  it("returns unknown when git fails or prints nothing", () => {
    const failing = () => {
      throw new Error("not a git repository");
    };
    expect(resolveBuildSha({}, failing)).toBe("unknown");
    expect(resolveBuildSha({}, () => "")).toBe("unknown");
  });
});
