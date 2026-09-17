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

import { describe, expect, test } from "bun:test";
import { rowToRecord, sanitizePersistedSettings } from "./user-agent-row";

describe("sanitizePersistedSettings", () => {
  test("keeps documented settings and drops a provider key if one is smuggled in", () => {
    const sanitized = sanitizePersistedSettings({
      maxSteps: 4,
      disabledTools: ["ExecuteOperator"],
      providerApiKey: "sk-secret",
    } as never);

    expect(sanitized).toEqual({ maxSteps: 4, disabledTools: ["ExecuteOperator"] });
    expect(JSON.stringify(sanitized)).not.toContain("sk-secret");
    expect(JSON.stringify(sanitized)).not.toContain("providerApiKey");
  });

  test("returns an empty object for missing settings", () => {
    expect(sanitizePersistedSettings(undefined)).toEqual({});
  });
});

describe("rowToRecord", () => {
  test("maps a postgres row including JSON settings", () => {
    expect(
      rowToRecord({
        agent_id: "agent-3",
        uid: 7,
        name: "Bob",
        model_type: "gpt-5-mini",
        settings: { maxSteps: 2 },
        workflow_id: 11,
        computing_unit_id: null,
        created_at: new Date("2026-01-02T00:00:00.000Z"),
      })
    ).toEqual({
      agentId: "agent-3",
      uid: 7,
      name: "Bob",
      modelType: "gpt-5-mini",
      settings: { maxSteps: 2 },
      workflowId: 11,
      createdAt: "2026-01-02T00:00:00.000Z",
    });
  });

  test("maps chat_history and chat_head_id when present", () => {
    const record = rowToRecord({
      agent_id: "agent-1",
      uid: 1,
      name: "x",
      model_type: "m",
      settings: {},
      workflow_id: null,
      computing_unit_id: null,
      chat_history: [
        {
          id: "u1",
          messageId: "m1",
          stepId: 0,
          timestamp: 1,
          role: "user",
          content: "hi",
          isBegin: true,
          isEnd: true,
        },
      ],
      chat_head_id: "u1",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(record.chatHistory).toHaveLength(1);
    expect(record.chatHistory?.[0].content).toBe("hi");
    expect(record.chatHeadId).toBe("u1");
  });

  test("treats malformed settings JSON as empty instead of throwing", () => {
    const record = rowToRecord({
      agent_id: "agent-1",
      uid: 1,
      name: "x",
      model_type: "m",
      settings: "{not-json",
      workflow_id: null,
      computing_unit_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(record.settings).toEqual({});
  });
});
