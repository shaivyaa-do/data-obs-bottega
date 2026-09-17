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
import type { PersistedAgentRecord } from "./agent-record";
import type { PersistedChatSession } from "./chat-session";

export interface UserAgentRow {
  agent_id: string;
  uid: number;
  name: string;
  model_type: string;
  settings: AgentSettingsApi | string | null;
  workflow_id: number | null;
  computing_unit_id: number | null;
  chat_history?: ReActStep[] | string | null;
  chat_head_id?: string | null;
  chat_sessions?: PersistedChatSession[] | string | null;
  created_at: Date | string;
}

/** Persist only the documented settings fields. Provider keys never go to the database. */
export function sanitizePersistedSettings(settings: AgentSettingsApi | undefined): AgentSettingsApi {
  if (!settings) {
    return {};
  }
  const sanitized: AgentSettingsApi = {};
  if (settings.maxOperatorResultCharLimit !== undefined) {
    sanitized.maxOperatorResultCharLimit = settings.maxOperatorResultCharLimit;
  }
  if (settings.maxOperatorResultCellCharLimit !== undefined) {
    sanitized.maxOperatorResultCellCharLimit = settings.maxOperatorResultCellCharLimit;
  }
  if (settings.operatorResultSerializationMode !== undefined) {
    sanitized.operatorResultSerializationMode = settings.operatorResultSerializationMode;
  }
  if (settings.toolTimeoutSeconds !== undefined) {
    sanitized.toolTimeoutSeconds = settings.toolTimeoutSeconds;
  }
  if (settings.executionTimeoutMinutes !== undefined) {
    sanitized.executionTimeoutMinutes = settings.executionTimeoutMinutes;
  }
  if (settings.disabledTools !== undefined) {
    sanitized.disabledTools = [...settings.disabledTools];
  }
  if (settings.maxSteps !== undefined) {
    sanitized.maxSteps = settings.maxSteps;
  }
  if (settings.allowedOperatorTypes !== undefined) {
    sanitized.allowedOperatorTypes = [...settings.allowedOperatorTypes];
  }
  return sanitized;
}

export function parseChatHistory(raw: UserAgentRow["chat_history"]): ReActStep[] {
  if (raw == null) {
    return [];
  }
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(
    (step): step is ReActStep =>
      step != null &&
      typeof step === "object" &&
      typeof (step as ReActStep).id === "string" &&
      typeof (step as ReActStep).role === "string"
  );
}

export function parseChatSessions(raw: UserAgentRow["chat_sessions"]): PersistedChatSession[] {
  if (raw == null) {
    return [];
  }
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(
    (session): session is PersistedChatSession =>
      session != null &&
      typeof session === "object" &&
      typeof (session as PersistedChatSession).id === "string" &&
      Array.isArray((session as PersistedChatSession).steps)
  );
}

export function rowToRecord(row: UserAgentRow): PersistedAgentRecord {
  let settings: AgentSettingsApi = {};
  if (typeof row.settings === "string") {
    try {
      settings = JSON.parse(row.settings) as AgentSettingsApi;
    } catch {
      settings = {};
    }
  } else if (row.settings && typeof row.settings === "object") {
    settings = row.settings;
  }

  const chatHistory = parseChatHistory(row.chat_history);
  const chatSessions = parseChatSessions(row.chat_sessions);
  const chatHeadId =
    typeof row.chat_head_id === "string" && row.chat_head_id.trim() !== ""
      ? row.chat_head_id
      : undefined;

  return {
    agentId: row.agent_id,
    uid: row.uid,
    name: row.name,
    modelType: row.model_type,
    settings: sanitizePersistedSettings(settings),
    workflowId: row.workflow_id ?? undefined,
    computingUnitId: row.computing_unit_id ?? undefined,
    chatHistory: chatHistory.length > 0 ? chatHistory : undefined,
    chatHeadId,
    chatSessions: chatSessions.length > 0 ? chatSessions : undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}
