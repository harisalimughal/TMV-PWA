import { describe, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({ verify: vi.fn(), cookie: vi.fn(() => "synthetic") }));
vi.mock("../src/auth/admin-session", () => ({ readAdminSessionCookie: session.cookie, verifyAdminSessionToken: session.verify, shouldRefresh: () => false, setAdminSessionCookie: vi.fn() }));
import { requireAdminAuth } from "../src/auth/require-admin-auth";
describe("Existing admin gate used by driver export mount", () => {
  it("blocks missing/expired/driver tokens before an export handler can run", () => {
    session.verify.mockReturnValue(null); const next = vi.fn(); const res = { status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
    requireAdminAuth({} as any, res as any, next); expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled();
  });
  it("allows a verified admin session", () => {
    session.verify.mockReturnValue({ sub: "admin" }); const next = vi.fn();
    requireAdminAuth({} as any, {} as any, next); expect(next).toHaveBeenCalledOnce();
  });
});
