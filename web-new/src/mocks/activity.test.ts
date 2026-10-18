import { beforeEach, describe, expect, it } from "vitest";
import { handleAdmin } from "./admin";
import { resetActivity } from "./activity";
import { isValidActivity, newClientRequestId, type ActivityConversation, type ActivityMessage } from "../lib/activity";

const get = async (path: string, search = "") => (await handleAdmin("GET", path, search, undefined)) as { status: number; body: any };
const post = async (path: string, body: unknown) => (await handleAdmin("POST", path, "", JSON.stringify(body))) as { status: number; body: any };

describe("activity mock", () => {
  beforeEach(() => resetActivity());

  it("lists conversations newest first with real unread counts, only for jobs with a driver", async () => {
    const res = await get("/api/admin/activity/conversations");
    expect(res.status).toBe(200);
    const rows = res.body.items as ActivityConversation[];
    expect(rows.length).toBeGreaterThan(3);
    expect(rows.every(row => row.driver.initials)).toBe(true);
    const sorted = [...rows].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    expect(rows.map(r => r.jobId)).toEqual(sorted.map(r => r.jobId));
    const unread = await get("/api/admin/activity/unread");
    expect(unread.body.total).toBe(rows.reduce((n, r) => n + r.unreadCount, 0));
  });

  it("serves valid entries, paged both ways, from the shared catalogue", async () => {
    const list = (await get("/api/admin/activity/conversations")).body.items as ActivityConversation[];
    const target = list.find(row => row.jobStatus === "COMPLETED")!;
    const path = `/api/admin/jobs/${target.jobId}/activity`;
    const latest = (await get(path, "?limit=3")).body;
    expect(latest.items).toHaveLength(3);
    expect((latest.items as ActivityMessage[]).every(isValidActivity)).toBe(true);
    expect(latest.olderCursor).toBeTruthy();
    const older = (await get(path, `?limit=50&before=${latest.olderCursor}`)).body;
    expect(older.items.every((e: ActivityMessage) => e.id < latest.olderCursor)).toBe(true);
    const none = (await get(path, `?after=${latest.nextCursor}`)).body;
    expect(none.items).toEqual([]);
  });

  it("marks read and reduces the unread count", async () => {
    const list = (await get("/api/admin/activity/conversations", "?unreadOnly=true")).body.items as ActivityConversation[];
    const target = list[0];
    const { items } = (await get(`/api/admin/jobs/${target.jobId}/activity`)).body;
    await post(`/api/admin/jobs/${target.jobId}/activity/read`, { upToId: items[items.length - 1].id });
    const after = (await get("/api/admin/activity/conversations")).body.items as ActivityConversation[];
    expect(after.find(row => row.jobId === target.jobId)!.unreadCount).toBe(0);
  });

  it("posts a direct message once per client id, as an admin message that claims no delivery it cannot know", async () => {
    const target = ((await get("/api/admin/activity/conversations")).body.items as ActivityConversation[]).find(row => row.capabilities.canMessage)!;
    const clientMessageId = newClientRequestId();
    const path = `/api/admin/jobs/${target.jobId}/activity/messages`;
    const first = await post(path, { clientMessageId, body: " Please call me when you arrive. ", expectedDriver: target.driver.initials });
    const second = await post(path, { clientMessageId, body: "Please call me when you arrive.", expectedDriver: target.driver.initials });
    expect(first.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(first.body).toMatchObject({ kind: "message", type: "message.admin_to_driver", body: "Please call me when you arrive.", delivery: "recorded" });
    expect(isValidActivity(first.body)).toBe(true);
  });

  it("refuses an empty message, a stale driver and an unknown job", async () => {
    const target = ((await get("/api/admin/activity/conversations")).body.items as ActivityConversation[])[0];
    const path = `/api/admin/jobs/${target.jobId}/activity/messages`;
    expect((await post(path, { clientMessageId: "x", body: "  " })).status).toBe(400);
    const stale = await post(path, { clientMessageId: "y", body: "hi", expectedDriver: "ZZ" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("DRIVER_CHANGED");
    expect((await get("/api/admin/jobs/NOPE/activity")).status).toBe(404);
  });
});

describe("activity demo roster", () => {
  it("has a conversation for each of the nine real drivers", async () => {
    resetActivity();
    const rows = ((await get("/api/admin/activity/conversations", "?limit=200")).body.items as ActivityConversation[]);
    const have = new Set(rows.map(row => row.driver.initials));
    for (const initials of ["AR", "KA", "HE", "MK", "MA", "PL", "RF", "TI", "WD"]) expect(have.has(initials), initials).toBe(true);
  });
});
