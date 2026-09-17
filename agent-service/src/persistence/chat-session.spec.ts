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
import { titleFromChatSteps } from "./chat-session";
import type { ReActStep } from "../types/agent";

function step(role: "user" | "agent", content: string): ReActStep {
  return {
    id: `s-${content}`,
    messageId: "m1",
    stepId: 0,
    timestamp: 1,
    role,
    content,
    isBegin: true,
    isEnd: true,
  };
}

describe("titleFromChatSteps", () => {
  test("uses the first non-empty user message", () => {
    expect(titleFromChatSteps([step("agent", "hi"), step("user", "  Load sales CSV  ")])).toBe("Load sales CSV");
  });

  test("truncates long titles", () => {
    const long = "x".repeat(80);
    expect(titleFromChatSteps([step("user", long)])).toBe(`${"x".repeat(57)}...`);
  });

  test("falls back when there is no user text", () => {
    expect(titleFromChatSteps([step("agent", "only agent")])).toBe("Untitled chat");
  });
});
