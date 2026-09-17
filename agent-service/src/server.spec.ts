/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  buildApp,
  start,
  _resetAgentStoreForTests,
  _resetRuntimeAgentsForTests,
  _getAgentForTests,
  _getPersistedRecordForTests,
} from "./server";
import { WorkflowSystemMetadata } from "./agent/util/workflow-system-metadata";
import { env } from "./config/env";

const API = env.API_PREFIX;
const app = buildApp();

function mintTestToken(userId = 1): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "tester",
      userId,
      email: "tester@example.com",
      role: "REGULAR",
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString("base64url");
  return `${header}.${payload}.test-signature`;
}

const TOKEN = mintTestToken();

function url(path: string): string {
  return `http://localhost${path}`;
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return app.handle(
    new Request(url(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
}

async function createAgent(body: Record<string, unknown> = {}, token: string | null = TOKEN): Promise<Response> {
  return postJson(`${API}/agents`, { modelType: "m", ...body }, token ? { Authorization: `Bearer ${token}` } : {});
}

async function patchJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return app.handle(
    new Request(url(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
  );
}

async function patchJsonAuth(
  path: string,
  body: unknown,
  token: string | null = TOKEN
): Promise<Response> {
  return patchJson(path, body, token ? { Authorization: `Bearer ${token}` } : {});
}

const EMPTY_WORKFLOW_CONTENT = {
  operators: [],
  operatorPositions: {},
  links: [],
  commentBoxes: [],
  settings: { dataTransferBatchSize: 400, executionMode: "local" },
};

function mockRetrieveWorkflow(result: "ok" | "fail" = "ok"): ReturnType<typeof spyOn> {
  const originalFetch = globalThis.fetch.bind(globalThis);
  return spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = String(input);
    if (!href.includes("/api/workflow/")) {
      return originalFetch(input as RequestInfo, init);
    }
    if (result === "fail") {
      return new Response("missing", { status: 404, statusText: "Not Found" });
    }
    const wid = Number(href.split("/").pop());
    return new Response(
      JSON.stringify({
        wid,
        name: `Workflow ${wid}`,
        content: EMPTY_WORKFLOW_CONTENT,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });
}

async function getJson(path: string): Promise<Response> {
  return app.handle(new Request(url(path)));
}

async function getJsonAuth(path: string, token: string | null = TOKEN): Promise<Response> {
  return app.handle(
    new Request(url(path), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  );
}

async function del(path: string): Promise<Response> {
  return app.handle(new Request(url(path), { method: "DELETE" }));
}

async function readJson<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

beforeEach(() => {
  _resetAgentStoreForTests();
});

describe(`GET ${API}/healthcheck`, () => {
  test("returns 200 with status ok", async () => {
    const res = await getJson(`${API}/healthcheck`);
    expect(res.status).toBe(200);
    const body = await readJson<{ status: string; timestamp: string }>(res);
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });
});

describe(`POST ${API}/agents`, () => {
  test("creates an agent for the delegating user", async () => {
    const res = await createAgent({ modelType: "test-model", name: "Tester" });
    expect(res.status).toBe(200);

    const agent = await readJson<{
      id: string;
      name: string;
      modelType: string;
      state: string;
      delegate: unknown;
    }>(res);
    expect(agent.id).toMatch(/^agent-\d+$/);
    expect(agent.name).toBe("Tester");
    expect(agent.modelType).toBe("test-model");
    expect(agent.state).toBe("AVAILABLE");
  });

  test("auto-numbers agent ids monotonically", async () => {
    const a = await readJson<{ id: string }>(await createAgent());
    const b = await readJson<{ id: string }>(await createAgent());

    const aNum = Number(a.id.split("-")[1]);
    const bNum = Number(b.id.split("-")[1]);
    expect(bNum).toBe(aNum + 1);
  });

  test("rejects invalid token", async () => {
    const res = await createAgent({}, "obviously-not-a-jwt");
    expect(res.status).toBe(401);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Invalid or expired token");
  });

  test("rejects missing Authorization header", async () => {
    const res = await createAgent({}, null);
    expect(res.status).toBe(401);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Authorization header with a Bearer token is required");
  });

  test("rejects non-Bearer Authorization header", async () => {
    const res = await postJson(`${API}/agents`, { modelType: "m" }, { Authorization: `Basic ${TOKEN}` });
    expect(res.status).toBe(401);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Authorization header with a Bearer token is required");
  });

  test("rejects missing modelType", async () => {
    const res = await createAgent({ modelType: undefined, name: "no-model" });
    expect(res.status).toBe(400);
  });

  test("accepts a providerApiKey and never echoes it back", async () => {
    const res = await createAgent({ providerApiKey: "sk-ant-secret" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("sk-ant-secret");
    expect(text).not.toContain("providerApiKey");
  });
});

describe(`GET ${API}/agents`, () => {
  test("empty store returns no agents", async () => {
    const res = await getJson(`${API}/agents`);
    expect(res.status).toBe(200);
    const body = await readJson<{ agents: unknown[] }>(res);
    expect(body.agents).toEqual([]);
  });

  test("lists every created agent", async () => {
    await createAgent({ name: "one" });
    await createAgent({ name: "two" });

    const res = await getJson(`${API}/agents`);
    const body = await readJson<{ agents: { name: string }[] }>(res);
    expect(body.agents).toHaveLength(2);
    expect(body.agents.map(a => a.name).sort()).toEqual(["one", "two"]);
  });
});

describe(`GET ${API}/agents/:id`, () => {
  test("returns the agent plus its workflow snapshot", async () => {
    const created = await readJson<{ id: string }>(await createAgent());

    const res = await getJson(`${API}/agents/${created.id}`);
    expect(res.status).toBe(200);
    const body = await readJson<{ id: string; workflow: unknown; stepCount: number }>(res);
    expect(body.id).toBe(created.id);
    expect(body.workflow).toBeDefined();
    expect(typeof body.stepCount).toBe("number");
  });

  test("returns 404 for an unknown id", async () => {
    const res = await getJson(`${API}/agents/agent-does-not-exist`);
    expect(res.status).toBe(404);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toBe("Agent not found");
  });
});

describe(`DELETE ${API}/agents/:id`, () => {
  test("destroys the agent and a follow-up GET returns 404", async () => {
    const created = await readJson<{ id: string }>(await createAgent());

    const delRes = await del(`${API}/agents/${created.id}`);
    expect(delRes.status).toBe(200);
    expect(await readJson<unknown>(delRes)).toEqual({ deleted: true });

    const getRes = await getJson(`${API}/agents/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  test("returns 404 when deleting an unknown agent", async () => {
    const res = await del(`${API}/agents/missing`);
    expect(res.status).toBe(404);
  });
});

describe("Agent control routes", () => {
  test("POST /:id/stop returns stopping", async () => {
    const created = await readJson<{ id: string }>(await createAgent());
    const res = await postJson(`${API}/agents/${created.id}/stop`, {});
    expect(res.status).toBe(200);
    expect(await readJson<unknown>(res)).toEqual({ status: "stopping" });
  });

  test("POST /:id/clear resets history", async () => {
    const created = await readJson<{ id: string }>(await createAgent());
    const res = await postJson(`${API}/agents/${created.id}/clear`, {});
    expect(res.status).toBe(200);
    expect(await readJson<unknown>(res)).toEqual({ status: "cleared" });
  });

  test("GET /:id/operator-results returns an empty map on the framework build", async () => {
    const created = await readJson<{ id: string }>(await createAgent());
    const res = await getJson(`${API}/agents/${created.id}/operator-results`);
    expect(res.status).toBe(200);
    expect(await readJson<unknown>(res)).toEqual({ results: {} });
  });
});

describe(`PATCH ${API}/agents/:id/settings`, () => {
  test("updates settings and returns the new values", async () => {
    const created = await readJson<{ id: string }>(await createAgent());

    const res = await patchJson(`${API}/agents/${created.id}/settings`, {
      maxSteps: 7,
      toolTimeoutSeconds: 30,
    });
    expect(res.status).toBe(200);
    const body = await readJson<{ maxSteps: number; toolTimeoutSeconds: number }>(res);
    expect(body.maxSteps).toBe(7);
    expect(body.toolTimeoutSeconds).toBe(30);

    // A follow-up GET reflects the same values.
    const reread = await readJson<{ maxSteps: number; toolTimeoutSeconds: number }>(
      await getJson(`${API}/agents/${created.id}/settings`)
    );
    expect(reread.maxSteps).toBe(7);
    expect(reread.toolTimeoutSeconds).toBe(30);
  });
});

describe("agent creation edge cases", () => {
  test("rejects an empty modelType", async () => {
    // The body schema accepts any string, so the handler's own guard runs.
    const res = await postJson(`${API}/agents`, { modelType: "" }, { Authorization: `Bearer ${TOKEN}` });
    expect(res.status).toBe(400);
    expect((await readJson<{ error: string }>(res)).error).toContain("modelType");
  });

  test("applies initial settings supplied at creation time", async () => {
    const res = await createAgent({ settings: { maxSteps: 9, toolTimeoutSeconds: 12 } });
    expect(res.status).toBe(200);
    const body = await readJson<{ settings: { maxSteps: number; toolTimeoutSeconds: number } }>(res);
    expect(body.settings.maxSteps).toBe(9);
    expect(body.settings.toolTimeoutSeconds).toBe(12);
  });

  test("creates the agent even when the workflow load fails (non-fatal)", async () => {
    // retrieveWorkflow targets the (unavailable) dashboard service; the failure
    // is caught and the agent is still created.
    const res = await createAgent({ workflowId: 123 });
    expect(res.status).toBe(200);
  });

  test("masks the delegate token in agent info", async () => {
    const id = (await readJson<{ id: string }>(await createAgent())).id;
    _getAgentForTests(id)!.setDelegateConfig({
      userToken: "super-secret",
      userInfo: { uid: 1, email: "tester@example.com" },
      workflowId: 5,
      workflowName: "My Flow",
      computingUnitId: 2,
    } as any);

    const info = await readJson<{ delegate?: { userToken: string; workflowName: string } }>(
      await getJson(`${API}/agents/${id}`)
    );
    expect(info.delegate?.userToken).toBe("***");
    expect(info.delegate?.workflowName).toBe("My Flow");
  });
});

describe("agent read routes", () => {
  let id: string;
  beforeEach(async () => {
    id = (await readJson<{ id: string }>(await createAgent())).id;
  });

  test("GET /:id/react-steps returns steps and state", async () => {
    const body = await readJson<{ steps: unknown[]; state: string }>(await getJson(`${API}/agents/${id}/react-steps`));
    expect(Array.isArray(body.steps)).toBe(true);
    expect(body.state).toBe("AVAILABLE");
  });

  test("GET /:id/system-info responds", async () => {
    const res = await getJson(`${API}/agents/${id}/system-info`);
    expect(res.status).toBe(200);
  });

  test("GET /:id/operator-types returns a list", async () => {
    const res = await getJson(`${API}/agents/${id}/operator-types`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await readJson(res))).toBe(true);
  });

  test("POST /:id/steps-by-operators returns steps", async () => {
    const res = await postJson(`${API}/agents/${id}/steps-by-operators`, { operatorIds: [] });
    expect(res.status).toBe(200);
    expect(Array.isArray((await readJson<{ steps: unknown[] }>(res)).steps)).toBe(true);
  });

  test("GET /:id/operator-results maps the visible operator results", async () => {
    const agent = _getAgentForTests(id)!;
    (agent as any).getWorkflowResultState = () => ({
      getAllVisible: () =>
        new Map([
          [
            "op-1",
            {
              operatorInfo: {
                state: "COMPLETED",
                inputTuples: 1,
                outputTuples: 2,
                inputPortShapes: [],
                result: [{ a: 1 }],
                error: undefined,
                warnings: [],
                consoleLogs: [],
                totalRowCount: 2,
                resultStatistics: {},
              },
            },
          ],
        ]),
    });

    const body = await readJson<{ results: Record<string, { outputTuples: number; outputColumns: number }> }>(
      await getJson(`${API}/agents/${id}/operator-results`)
    );
    expect(body.results["op-1"].outputTuples).toBe(2);
    expect(body.results["op-1"].outputColumns).toBe(1);
  });
});

describe("non-router routes", () => {
  test("unknown routes fall through to the catch-all error handler", async () => {
    const res = await getJson("/no-such-route");
    expect(res.status).toBe(500);
  });
});

describe(`PATCH ${API}/agents/:id/delegate`, () => {
  let fetchSpy: ReturnType<typeof spyOn>;

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  test("binds an existing agent to a workflow", async () => {
    fetchSpy = mockRetrieveWorkflow("ok");
    const created = await readJson<{ id: string }>(await createAgent());

    const res = await patchJsonAuth(`${API}/agents/${created.id}/delegate`, {
      workflowId: 7,
      computingUnitId: 3,
    });
    expect(res.status).toBe(200);
    const body = await readJson<{
      id: string;
      delegate?: { workflowId: number; workflowName: string; computingUnitId?: number; userToken: string };
    }>(res);
    expect(body.id).toBe(created.id);
    expect(body.delegate?.workflowId).toBe(7);
    expect(body.delegate?.workflowName).toBe("Workflow 7");
    expect(body.delegate?.computingUnitId).toBe(3);
    expect(body.delegate?.userToken).toBe("***");

    const live = _getAgentForTests(created.id)!;
    expect(live.getDelegateConfig()?.workflowId).toBe(7);
    expect(live.getDelegateConfig()?.computingUnitId).toBe(3);
  });

  test("preserves computingUnitId when a later bind omits it", async () => {
    fetchSpy = mockRetrieveWorkflow("ok");
    const created = await readJson<{ id: string }>(await createAgent());
    await patchJsonAuth(`${API}/agents/${created.id}/delegate`, {
      workflowId: 7,
      computingUnitId: 3,
    });

    const res = await patchJsonAuth(`${API}/agents/${created.id}/delegate`, { workflowId: 7 });
    expect(res.status).toBe(200);
    expect(_getAgentForTests(created.id)!.getDelegateConfig()?.computingUnitId).toBe(3);
  });

  test("rebinds an agent from one workflow to another", async () => {
    fetchSpy = mockRetrieveWorkflow("ok");
    const created = await readJson<{ id: string }>(await createAgent());
    await patchJsonAuth(`${API}/agents/${created.id}/delegate`, { workflowId: 5 });

    const res = await patchJsonAuth(`${API}/agents/${created.id}/delegate`, { workflowId: 8 });
    expect(res.status).toBe(200);
    const body = await readJson<{ delegate?: { workflowId: number; workflowName: string } }>(res);
    expect(body.delegate?.workflowId).toBe(8);
    expect(body.delegate?.workflowName).toBe("Workflow 8");
  });

  test("rejects a missing Authorization header", async () => {
    const created = await readJson<{ id: string }>(await createAgent());
    const res = await patchJsonAuth(`${API}/agents/${created.id}/delegate`, { workflowId: 7 }, null);
    expect(res.status).toBe(401);
    expect((await readJson<{ error: string }>(res)).error).toBe(
      "Authorization header with a Bearer token is required"
    );
  });

  test("rejects an invalid token", async () => {
    const created = await readJson<{ id: string }>(await createAgent());
    const res = await patchJsonAuth(`${API}/agents/${created.id}/delegate`, { workflowId: 7 }, "not-a-jwt");
    expect(res.status).toBe(401);
    expect((await readJson<{ error: string }>(res)).error).toBe("Invalid or expired token");
  });

  test("returns 404 for an unknown agent", async () => {
    const res = await patchJsonAuth(`${API}/agents/agent-missing/delegate`, { workflowId: 7 });
    expect(res.status).toBe(404);
    expect((await readJson<{ error: string }>(res)).error).toBe("Agent not found");
  });

  test("rejects a missing workflowId", async () => {
    const created = await readJson<{ id: string }>(await createAgent());
    const res = await patchJsonAuth(`${API}/agents/${created.id}/delegate`, {});
    expect(res.status).toBe(400);
  });

  test("rejects workflowId 0", async () => {
    const created = await readJson<{ id: string }>(await createAgent());
    const res = await patchJsonAuth(`${API}/agents/${created.id}/delegate`, { workflowId: 0 });
    expect(res.status).toBe(400);
    expect((await readJson<{ error: string }>(res)).error).toBe("workflowId is required");
  });

  test("returns 500 when the workflow cannot be loaded", async () => {
    fetchSpy = mockRetrieveWorkflow("fail");
    const created = await readJson<{ id: string }>(await createAgent());
    const res = await patchJsonAuth(`${API}/agents/${created.id}/delegate`, { workflowId: 7 });
    expect(res.status).toBe(500);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toContain("Failed to retrieve workflow");
  });
});

describe("agent persistence", () => {
  test("survives a runtime store wipe and hydrates on authenticated GET", async () => {
    const created = await readJson<{ id: string; name: string }>(
      await createAgent({ name: "durable", settings: { maxSteps: 3 } })
    );
    _resetRuntimeAgentsForTests();

    const unauthenticated = await readJson<{ agents: unknown[] }>(await getJson(`${API}/agents`));
    expect(unauthenticated.agents).toEqual([]);

    const listed = await readJson<{ agents: { id: string; name: string; settings?: { maxSteps?: number } }[] }>(
      await getJsonAuth(`${API}/agents`)
    );
    expect(listed.agents).toHaveLength(1);
    expect(listed.agents[0].id).toBe(created.id);
    expect(listed.agents[0].name).toBe("durable");
    expect(listed.agents[0].settings?.maxSteps).toBe(3);
  });

  test("restores chat history after a runtime wipe + hydrate", async () => {
    const created = await readJson<{ id: string }>(await createAgent({ name: "chatter" }));
    const agent = _getAgentForTests(created.id)!;
    agent.restoreChatHistory(
      [
        {
          id: "u1",
          parentId: "step-initial",
          messageId: "msg-agent-1-1-1",
          stepId: 0,
          timestamp: 1,
          role: "user",
          content: "remember me",
          isBegin: true,
          isEnd: true,
        },
        {
          id: "a1",
          parentId: "u1",
          messageId: "msg-agent-1-1-1",
          stepId: 1,
          timestamp: 2,
          role: "agent",
          content: "I do",
          isBegin: true,
          isEnd: true,
        },
      ],
      "a1"
    );
    // Settings PATCH persists the full agent row, including chat history.
    await patchJson(`${API}/agents/${created.id}/settings`, { maxSteps: 9 });

    _resetRuntimeAgentsForTests();
    await getJsonAuth(`${API}/agents`);

    const restored = _getAgentForTests(created.id)!;
    expect(restored.getAllSteps().map(s => s.content)).toEqual(["remember me", "I do"]);
    expect(restored.getHead()).toBe("a1");

    const stepsRes = await getJson(`${API}/agents/${created.id}/react-steps`);
    const body = await readJson<{ steps: { content: string }[]; state: string }>(stepsRes);
    expect(body.steps.map(s => s.content)).toEqual(["remember me", "I do"]);
  });

  test("clear empties persisted chat history", async () => {
    const created = await readJson<{ id: string }>(await createAgent({ name: "clear-chat" }));
    const agent = _getAgentForTests(created.id)!;
    agent.restoreChatHistory(
      [
        {
          id: "u1",
          parentId: "step-initial",
          messageId: "msg-1",
          stepId: 0,
          timestamp: 1,
          role: "user",
          content: "bye",
          isBegin: true,
          isEnd: true,
        },
      ],
      "u1"
    );
    await patchJson(`${API}/agents/${created.id}/settings`, { maxSteps: 2 });

    const clearRes = await postJson(`${API}/agents/${created.id}/clear`, {});
    expect(clearRes.status).toBe(200);

    const record = await _getPersistedRecordForTests(created.id);
    expect(record?.chatHistory ?? []).toEqual([]);
    expect(record?.chatHeadId).toBeUndefined();
  });

  test("new chat archives the current transcript and open restores it", async () => {
    const created = await readJson<{ id: string }>(await createAgent({ name: "sessions" }));
    const agent = _getAgentForTests(created.id)!;
    agent.restoreChatHistory(
      [
        {
          id: "u1",
          parentId: "step-initial",
          messageId: "msg-1",
          stepId: 0,
          timestamp: 1,
          role: "user",
          content: "archive me",
          isBegin: true,
          isEnd: true,
        },
      ],
      "u1"
    );
    await patchJson(`${API}/agents/${created.id}/settings`, { maxSteps: 2 });

    const newRes = await postJson(`${API}/agents/${created.id}/chats`, {});
    expect(newRes.status).toBe(200);
    const afterNew = await readJson<{ chats: { id: string; title: string; isCurrent?: boolean }[]; steps: unknown[] }>(
      newRes
    );
    expect(afterNew.steps).toEqual([]);
    expect(afterNew.chats).toHaveLength(1);
    expect(afterNew.chats[0].title).toBe("archive me");
    const archivedId = afterNew.chats[0].id;

    const openRes = await postJson(`${API}/agents/${created.id}/chats/${archivedId}/open`, {});
    expect(openRes.status).toBe(200);
    const opened = await readJson<{ steps: { content: string }[]; chats: { isCurrent?: boolean; title: string }[] }>(
      openRes
    );
    expect(opened.steps.map(s => s.content)).toEqual(["archive me"]);
    expect(opened.chats.some(c => c.isCurrent && c.title === "archive me")).toBe(true);
  });

  test("does not show another user's persisted agents", async () => {
    await createAgent({ name: "mine" });
    const listed = await readJson<{ agents: { name: string }[] }>(
      await getJsonAuth(`${API}/agents`, mintTestToken(2))
    );
    expect(listed.agents).toEqual([]);
  });

  test("delete removes the persisted row so a later hydrate is empty", async () => {
    const created = await readJson<{ id: string }>(await createAgent({ name: "gone" }));
    const delRes = await del(`${API}/agents/${created.id}`);
    expect(delRes.status).toBe(200);

    _resetRuntimeAgentsForTests();
    const listed = await readJson<{ agents: unknown[] }>(await getJsonAuth(`${API}/agents`));
    expect(listed.agents).toEqual([]);
  });

  test("never stores a provider API key", async () => {
    const created = await readJson<{ id: string }>(await createAgent({ providerApiKey: "sk-ant-secret" }));
    const record = await _getPersistedRecordForTests(created.id);
    expect(record).toBeDefined();
    expect(JSON.stringify(record)).not.toContain("sk-ant-secret");
    expect(JSON.stringify(record)).not.toContain("providerApiKey");
  });

  test("allocates the next agent-N after a restart from the persisted max", async () => {
    await createAgent();
    await createAgent();
    _resetRuntimeAgentsForTests();

    const created = await readJson<{ id: string }>(await createAgent());
    expect(created.id).toBe("agent-3");
  });

  test("persists settings updates", async () => {
    const created = await readJson<{ id: string }>(await createAgent());
    const patchRes = await patchJson(`${API}/agents/${created.id}/settings`, { maxSteps: 9 });
    expect(patchRes.status).toBe(200);

    _resetRuntimeAgentsForTests();
    const listed = await readJson<{ agents: { settings?: { maxSteps?: number } }[] }>(
      await getJsonAuth(`${API}/agents`)
    );
    expect(listed.agents[0].settings?.maxSteps).toBe(9);
  });
});

describe("start()", () => {
  test("boots a listening app and prints the startup banner", async () => {
    const booted = await start();
    expect(typeof booted.server?.port).toBe("number");
    await booted.stop();
  });

  test("tolerates a metadata-initialization failure", async () => {
    const spy = spyOn(WorkflowSystemMetadata, "initializeGlobal").mockImplementation(async () => {
      throw new Error("metadata unavailable");
    });
    const booted = await start();
    await booted.stop();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
