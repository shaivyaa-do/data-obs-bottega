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
import { MemoryAgentPersistence } from "./memory-agent-persistence";
import type { PersistedAgentRecord } from "./agent-record";

function record(over: Partial<PersistedAgentRecord> = {}): PersistedAgentRecord {
  return {
    agentId: "agent-1",
    uid: 1,
    name: "Tester",
    modelType: "gpt-5-mini",
    settings: { maxSteps: 8 },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("MemoryAgentPersistence", () => {
  test("saves a record and returns it by id without a provider key field", async () => {
    const store = new MemoryAgentPersistence();
    await store.save(record());

    const loaded = await store.get("agent-1");
    expect(loaded).toEqual(record());
    expect(JSON.stringify(loaded)).not.toContain("providerApiKey");
  });

  test("lists only the calling user's agents", async () => {
    const store = new MemoryAgentPersistence();
    await store.save(record({ agentId: "agent-1", uid: 1, name: "mine" }));
    await store.save(record({ agentId: "agent-2", uid: 2, name: "theirs" }));

    const mine = await store.listByUid(1);
    expect(mine.map(r => r.name)).toEqual(["mine"]);
  });

  test("delete removes the row and reports whether it existed", async () => {
    const store = new MemoryAgentPersistence();
    await store.save(record());

    expect(await store.delete("agent-1")).toBe(true);
    expect(await store.get("agent-1")).toBeUndefined();
    expect(await store.delete("agent-1")).toBe(false);
  });

  test("clear empties the store", async () => {
    const store = new MemoryAgentPersistence();
    await store.save(record());
    await store.clear();
    expect(await store.listByUid(1)).toEqual([]);
  });

  test("maxAgentSeq is the largest persisted agent-N suffix", async () => {
    const store = new MemoryAgentPersistence();
    expect(await store.maxAgentSeq()).toBe(0);
    await store.save(record({ agentId: "agent-2" }));
    await store.save(record({ agentId: "agent-11" }));
    expect(await store.maxAgentSeq()).toBe(11);
  });

  test("strips a smuggled provider key on save", async () => {
    const store = new MemoryAgentPersistence();
    await store.save(
      record({
        settings: { maxSteps: 3, providerApiKey: "sk-secret" } as never,
      })
    );
    const loaded = await store.get("agent-1");
    expect(loaded?.settings).toEqual({ maxSteps: 3 });
    expect(JSON.stringify(loaded)).not.toContain("sk-secret");
  });
});
