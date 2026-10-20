// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as mine } from "../../app/api/webhooks/mine/route";
import { POST as register } from "../../app/api/webhooks/register/route";
import { POST as activate } from "../../app/api/webhooks/activate/route";
import { POST as uuidOp } from "../../app/api/webhooks/[id]/[...rest]/route";
import { POST as uuidRoot } from "../../app/api/webhooks/[id]/route";

const SESSION = { token: "dev-token", instanceUrl: "https://dev.test" };

function req(body: unknown): Request {
  return new Request("https://local.test/api/webhooks/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function ctx(id: string, rest: string[]) {
  return { params: Promise.resolve({ id, rest }) };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ organization_id: "org-dev", user_id: "user-dev" }),
    }))
  );
});

/** User flow: register -> listed -> pause/resume -> open inbox -> deregister wipes all. */
describe("localhost webhook flow (dev mesh)", () => {
  it("registers, lists, toggles, captures, and deregisters cleanly", async () => {
    const reg = await register(req({ ...SESSION, name: "order-events" }));
    expect(reg.status).toBe(200);
    const { uuid } = (await reg.json()) as { uuid: string };
    expect(uuid).toMatch(/^[A-Za-z0-9_-]{8,128}$/);

    const listed = (await (await mine(req(SESSION))).json()) as {
      entries: { uuid: string; active: boolean }[];
    };
    expect(listed.entries.map((e) => e.uuid)).toContain(uuid);

    // Pause then resume through activate.
    const paused = (await (await activate(req({ ...SESSION, uuids: [{ uuid, active: false }] }))).json()) as {
      entries: { uuid: string; active: boolean }[];
    };
    expect(paused.entries.find((e) => e.uuid === uuid)?.active).toBe(false);
    const resumed = (await (await activate(req({ ...SESSION, uuids: [{ uuid, active: true }] }))).json()) as {
      entries: { uuid: string; active: boolean }[];
    };
    expect(resumed.entries.find((e) => e.uuid === uuid)?.active).toBe(true);

    // Inbox: capture on a sub-path, then read it back through the owner feed.
    const cap = await uuidOp(req({ hello: "dev" }), ctx(uuid, ["sf", "order"]));
    expect(cap.status).toBe(200);
    const feed = (await (await uuidOp(req(SESSION), ctx(uuid, ["feed"]))).json()) as {
      ok: boolean;
      requests: { path: string; bodyText: string }[];
    };
    expect(feed.ok).toBe(true);
    expect(feed.requests).toHaveLength(1);
    expect(feed.requests[0].path).toBe("/sf/order");

    // Deregister: release wipes events and the registry entry.
    const rel = await uuidOp(req(SESSION), ctx(uuid, ["release"]));
    expect(rel.status).toBe(200);
    const after = (await (await mine(req(SESSION))).json()) as { entries: unknown[] };
    expect(after.entries).toHaveLength(0);
    const gone = await uuidRoot(req({}), { params: Promise.resolve({ id: uuid }) });
    expect(gone.status).toBe(404);
  });
});
