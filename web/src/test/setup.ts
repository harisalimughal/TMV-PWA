import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Extends Vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.).
import "@testing-library/jest-dom/vitest";

// Unmount anything a test rendered so DOM queries don't see leftovers from prior cases
// (config has no `globals`, so React Testing Library's auto-cleanup isn't wired).
afterEach(() => {
  cleanup();
});
