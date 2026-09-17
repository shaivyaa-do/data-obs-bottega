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

import type { ReActStep } from "../types/agent";

/** One archived (or previously active) chat transcript for an agent. */
export interface PersistedChatSession {
  id: string;
  title: string;
  updatedAt: string;
  headId?: string;
  steps: ReActStep[];
}

/** List row for the chat-history UI (no full step payloads). */
export interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  /** True when this row is the agent's currently loaded transcript. */
  isCurrent?: boolean;
}

export function titleFromChatSteps(steps: ReActStep[]): string {
  const firstUser = steps.find(s => s.role === "user" && (s.content || "").trim().length > 0);
  const raw = (firstUser?.content || "").trim().replace(/\s+/g, " ");
  if (!raw) {
    return "Untitled chat";
  }
  return raw.length > 60 ? `${raw.slice(0, 57)}...` : raw;
}

export function summarizeChatSession(session: PersistedChatSession, isCurrent = false): ChatSessionSummary {
  return {
    id: session.id,
    title: session.title,
    updatedAt: session.updatedAt,
    messageCount: session.steps.length,
    isCurrent,
  };
}
