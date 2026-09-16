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
import { nextAgentId, parseAgentSeq } from "./agent-id";

describe("parseAgentSeq", () => {
  test("reads the numeric suffix of an agent id", () => {
    expect(parseAgentSeq("agent-12")).toBe(12);
  });

  test("returns 0 for an id that is not agent-N", () => {
    expect(parseAgentSeq("custom")).toBe(0);
    expect(parseAgentSeq("agent-")).toBe(0);
  });
});

describe("nextAgentId", () => {
  test("continues from the larger of the in-memory counter and persisted max", () => {
    expect(nextAgentId(1, 9)).toEqual({ agentId: "agent-10", counter: 10 });
    expect(nextAgentId(4, 2)).toEqual({ agentId: "agent-5", counter: 5 });
  });
});
