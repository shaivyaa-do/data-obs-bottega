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

import type { AgentSettingsApi, ReActStep } from "../types/agent";
import type { PersistedChatSession } from "./chat-session";

/** Durable agent metadata. Provider API keys are never stored. */
export interface PersistedAgentRecord {
  agentId: string;
  uid: number;
  name: string;
  modelType: string;
  settings: AgentSettingsApi;
  workflowId?: number;
  computingUnitId?: number;
  /** ReAct chat steps (excludes the sentinel initial step). */
  chatHistory?: ReActStep[];
  /** HEAD of the ReAct version tree after the last turn. */
  chatHeadId?: string;
  /** Archived chats the user can reopen (does not include the active transcript). */
  chatSessions?: PersistedChatSession[];
  createdAt: string;
}

export interface AgentPersistence {
  save(record: PersistedAgentRecord): Promise<void>;
  get(agentId: string): Promise<PersistedAgentRecord | undefined>;
  listByUid(uid: number): Promise<PersistedAgentRecord[]>;
  delete(agentId: string): Promise<boolean>;
  maxAgentSeq(): Promise<number>;
}
