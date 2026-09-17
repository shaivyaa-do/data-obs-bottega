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

import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { createOpenAI } from "@ai-sdk/openai";
import { TexeraAgent } from "./agent/texera-agent";
import { getVisibleResultHeaders } from "./agent/tools/tools-utility";
import { getBackendConfig } from "./api/backend-api";
import { llmGatewayClientOptions } from "./api/llm-client";
import { extractBearerToken, extractUserFromToken, validateToken } from "./api/auth-api";
import { retrieveWorkflow } from "./api/workflow-api";
import { WorkflowSystemMetadata } from "./agent/util/workflow-system-metadata";
import { env } from "./config/env";
import { createLogger } from "./logger";
import type { AgentPersistence, PersistedAgentRecord } from "./persistence/agent-record";
import { MemoryAgentPersistence } from "./persistence/memory-agent-persistence";
import { nextAgentId, parseAgentSeq } from "./persistence/agent-id";
import { sanitizePersistedSettings } from "./persistence/user-agent-row";

const log = createLogger("Server");
const wsLog = createLogger("WS");
import type {
  AgentInfo,
  AgentDelegateConfig,
  BindAgentRequest,
  CreateAgentRequest,
  UpdateAgentSettingsRequest,
  AgentSettingsApi,
  ReActStep,
} from "./types/agent";
import { AgentState, DEFAULT_AGENT_SETTINGS, INITIAL_STEP_ID, OperatorResultSerializationMode } from "./types/agent";
import type { WsClientCommand, WsServerEvent } from "./types/ws";
import { WsServerSnapshotEvent, WsServerStepEvent, WsServerStatusEvent, WsServerErrorEvent } from "./types/ws";
import type { OperatorResultSummary } from "./types/execution";

const agentStore = new Map<string, TexeraAgent>();
let agentCounter = 0;
const memoryPersistence = new MemoryAgentPersistence();
let persistence: AgentPersistence = memoryPersistence;
let persistenceBackend: "memory" | "postgres" = "memory";

async function allocateAgentId(): Promise<string> {
  const { agentId, counter } = nextAgentId(agentCounter, await persistence.maxAgentSeq());
  agentCounter = counter;
  return agentId;
}

function persistableRecord(agentId: string, agent: TexeraAgent): PersistedAgentRecord | undefined {
  const info = getAgentInfo(agentId, agent);
  const uid = info.delegate?.userInfo?.uid;
  if (uid == null) {
    return undefined;
  }
  return {
    agentId,
    uid,
    name: info.name,
    modelType: info.modelType,
    settings: sanitizePersistedSettings(info.settings),
    workflowId: info.delegate?.workflowId,
    computingUnitId: info.delegate?.computingUnitId,
    chatHistory: agent.getAllSteps(),
    chatHeadId: agent.getHead() === INITIAL_STEP_ID ? undefined : agent.getHead(),
    chatSessions: agent.getPersistedChatSessions(),
    createdAt: info.createdAt instanceof Date ? info.createdAt.toISOString() : String(info.createdAt),
  };
}

async function persistAgent(agentId: string, agent: TexeraAgent): Promise<void> {
  const record = persistableRecord(agentId, agent);
  if (!record) {
    log.warn({ agentId }, "skip persist: agent has no owning uid");
    return;
  }
  await persistence.save(record);
}

async function restoreRecord(
  record: PersistedAgentRecord,
  user: { uid: number; name: string; email: string; role: string },
  userToken: string
): Promise<void> {
  if (agentStore.has(record.agentId)) {
    return;
  }
  const { agent } = await createAgentInstance(
    record.modelType,
    {
      userToken,
      userInfo: user,
      workflowId: record.workflowId,
      computingUnitId: record.computingUnitId,
    },
    record.name,
    undefined,
    record.agentId,
    new Date(record.createdAt)
  );
  if (record.settings) {
    // Prior defaults (2k / 2k|4k) truncated large tables so the agent wrongly
    // concluded values were missing. Bump only those legacy defaults on restore;
    // any other saved value is treated as intentional.
    const charLimit = record.settings.maxOperatorResultCharLimit;
    const cellLimit = record.settings.maxOperatorResultCellCharLimit;
    agent.updateSettings({
      maxOperatorResultCharLimit:
        charLimit === 2000 ? DEFAULT_AGENT_SETTINGS.maxOperatorResultCharLimit : charLimit,
      maxOperatorResultCellCharLimit:
        cellLimit === 2000 || cellLimit === 4000
          ? DEFAULT_AGENT_SETTINGS.maxOperatorResultCellCharLimit
          : cellLimit,
      operatorResultSerializationMode: record.settings.operatorResultSerializationMode
        ? (record.settings.operatorResultSerializationMode as OperatorResultSerializationMode)
        : undefined,
      toolTimeoutMs: record.settings.toolTimeoutSeconds ? record.settings.toolTimeoutSeconds * 1000 : undefined,
      executionTimeoutMs: record.settings.executionTimeoutMinutes
        ? record.settings.executionTimeoutMinutes * 60000
        : undefined,
      disabledTools: record.settings.disabledTools ? new Set(record.settings.disabledTools) : undefined,
      maxSteps: record.settings.maxSteps,
      allowedOperatorTypes: record.settings.allowedOperatorTypes,
    });
  }
  if (record.chatHistory && record.chatHistory.length > 0) {
    agent.restoreChatHistory(record.chatHistory, record.chatHeadId);
  }
  agent.restoreChatSessions(record.chatSessions);
}

async function restorePersistedAgents(
  user: { uid: number; name: string; email: string; role: string },
  userToken: string
): Promise<void> {
  const records = await persistence.listByUid(user.uid);
  for (const record of records) {
    try {
      await restoreRecord(record, user, userToken);
    } catch (error) {
      log.warn({ agentId: record.agentId, err: error }, "failed to restore persisted agent");
    }
  }
}

async function createAgentInstance(
  modelType: string,
  delegateConfig: AgentDelegateConfig,
  customName?: string,
  providerApiKey?: string,
  existingId?: string,
  createdAt?: Date
): Promise<{ agentId: string; agent: TexeraAgent }> {
  const agentId = existingId ?? (await allocateAgentId());
  if (existingId) {
    agentCounter = Math.max(agentCounter, parseAgentSeq(existingId));
  }
  const config = getBackendConfig();

  const openai = createOpenAI(
    llmGatewayClientOptions(config.modelsEndpoint, delegateConfig.userToken, providerApiKey)
  );

  // Reasoning effort variants are configured as separate model entries in litellm-config.yaml
  // with extra_body to inject reasoning_effort, bypassing LiteLLM's param validation.
  const agent = new TexeraAgent({
    model: openai.chat(modelType),
    modelType,
    agentId,
    agentName: customName || "Bob",
    createdAt,
  });

  await agent.initialize();

  agent.setDelegateConfig({
    userToken: delegateConfig.userToken,
    userInfo: delegateConfig.userInfo,
    workflowId: delegateConfig.workflowId,
    computingUnitId: delegateConfig.computingUnitId,
  });

  if (delegateConfig.workflowId) {
    try {
      await bindAgentToWorkflow(agent, delegateConfig);
      log.info({ agentId, workflowId: delegateConfig.workflowId }, "loaded workflow for agent");
    } catch (error) {
      log.warn({ agentId, workflowId: delegateConfig.workflowId, err: error }, "failed to load workflow");
    }
  }

  agentStore.set(agentId, agent);
  log.info({ agentId, userId: delegateConfig.userInfo?.uid }, "created agent");

  return { agentId, agent };
}

async function bindAgentToWorkflow(agent: TexeraAgent, delegateConfig: AgentDelegateConfig): Promise<void> {
  if (!delegateConfig.workflowId) {
    throw new Error("workflowId is required");
  }

  const workflow = await retrieveWorkflow(delegateConfig.userToken, delegateConfig.workflowId);
  // Keep a previously bound computing unit when the client omits it (e.g. CU
  // status not loaded yet on first attach). Otherwise execute falls back to cuid=0.
  const computingUnitId =
    delegateConfig.computingUnitId ?? agent.getDelegateConfig()?.computingUnitId;
  agent.getWorkflowState().setWorkflowContent(workflow.content);
  agent.setDelegateConfig({
    userToken: delegateConfig.userToken,
    userInfo: delegateConfig.userInfo,
    workflowId: delegateConfig.workflowId,
    workflowName: workflow.name,
    computingUnitId,
  });
}

function getAgentInfo(agentId: string, agent: TexeraAgent): AgentInfo {
  const agentSettings = agent.getSettings();
  const settingsApi: AgentSettingsApi = {
    maxOperatorResultCharLimit: agentSettings.maxOperatorResultCharLimit,
    maxOperatorResultCellCharLimit: agentSettings.maxOperatorResultCellCharLimit,
    operatorResultSerializationMode: agentSettings.operatorResultSerializationMode,
    toolTimeoutSeconds: Math.round(agentSettings.toolTimeoutMs / 1000),
    executionTimeoutMinutes: Math.round(agentSettings.executionTimeoutMs / 60000),
    disabledTools: Array.from(agentSettings.disabledTools),
    maxSteps: agentSettings.maxSteps,
    allowedOperatorTypes: agentSettings.allowedOperatorTypes,
  };

  const delegateConfig = agent.getDelegateConfig();

  return {
    id: agentId,
    name: agent.agentName,
    modelType: agent.modelType,
    state: agent.getState(),
    createdAt: agent.createdAt,
    delegate: delegateConfig
      ? {
          userToken: "***",
          userInfo: delegateConfig.userInfo,
          workflowId: delegateConfig.workflowId,
          workflowName: delegateConfig.workflowName,
          computingUnitId: delegateConfig.computingUnitId,
        }
      : undefined,
    settings: settingsApi,
  };
}

function getAgent(agentId: string): TexeraAgent {
  const agent = agentStore.get(agentId);
  if (!agent) {
    throw new Error("Agent not found");
  }
  return agent;
}

// Status codes for handler-thrown errors; anything unlisted is a 500.
const ERROR_STATUS: Record<string, number> = {
  "Agent not found": 404,
  "Invalid or expired token": 401,
  "Authorization header with a Bearer token is required": 401,
  "modelType is required": 400,
  "workflowId is required": 400,
};

const agentsRouter = new Elysia({ prefix: "/agents" })
  // Error handler must live on the same Elysia instance whose routes throw, or
  // its scope will not see the errors. Elysia 1.x defaults to local scoping for
  // .onError, so attach here rather than on the outer app.
  .onError(({ code, error, set }) => {
    log.error({ err: error }, "request error");
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Body schema violations and malformed JSON are client errors, not 500s.
    if (code === "VALIDATION" || code === "PARSE") {
      set.status = 400;
      return { error: errorMessage || "Invalid request body" };
    }
    set.status = ERROR_STATUS[errorMessage] ?? 500;
    return { error: errorMessage || "Internal server error" };
  })
  .get("/", async ({ headers }) => {
    const token = extractBearerToken(headers.authorization);
    if (token && validateToken(token)) {
      const user = extractUserFromToken(token);
      await restorePersistedAgents(user, token);
      const agents = Array.from(agentStore.entries())
        .filter(([, agent]) => agent.getDelegateConfig()?.userInfo?.uid === user.uid)
        .map(([id, agent]) => getAgentInfo(id, agent));
      return { agents };
    }
    const agentList = Array.from(agentStore.entries()).map(([id, agent]) => getAgentInfo(id, agent));
    return { agents: agentList };
  })

  .post(
    "/",
    async ({ body, headers }) => {
      const { modelType, name, workflowId, computingUnitId, settings, providerApiKey } = body as CreateAgentRequest;

      if (!modelType) {
        throw new Error("modelType is required");
      }

      // The agent always calls the LLM gateway as the delegating user, so an
      // agent without a user token would be unable to generate anything. The
      // token travels in the Authorization header, never in the payload.
      const userToken = extractBearerToken(headers.authorization);
      if (!userToken) {
        throw new Error("Authorization header with a Bearer token is required");
      }
      if (!validateToken(userToken)) {
        throw new Error("Invalid or expired token");
      }

      const userInfo = extractUserFromToken(userToken);
      const delegateConfig: AgentDelegateConfig = {
        userToken,
        userInfo,
        workflowId,
        computingUnitId,
      };

      const { agentId, agent } = await createAgentInstance(modelType, delegateConfig, name, providerApiKey);

      if (settings) {
        log.info(
          {
            agentId,
            maxOperatorResultCharLimit: settings.maxOperatorResultCharLimit,
            maxOperatorResultCellCharLimit: settings.maxOperatorResultCellCharLimit,
          },
          "applying initial agent settings"
        );
        agent.updateSettings({
          maxOperatorResultCharLimit: settings.maxOperatorResultCharLimit,
          maxOperatorResultCellCharLimit: settings.maxOperatorResultCellCharLimit,
          operatorResultSerializationMode: settings.operatorResultSerializationMode
            ? (settings.operatorResultSerializationMode as OperatorResultSerializationMode)
            : undefined,
          toolTimeoutMs: settings.toolTimeoutSeconds ? settings.toolTimeoutSeconds * 1000 : undefined,
          executionTimeoutMs: settings.executionTimeoutMinutes ? settings.executionTimeoutMinutes * 60000 : undefined,
          disabledTools: settings.disabledTools ? new Set(settings.disabledTools) : undefined,
          maxSteps: settings.maxSteps,
          allowedOperatorTypes: settings.allowedOperatorTypes,
        });
      }

      await persistAgent(agentId, agent);

      return getAgentInfo(agentId, agent);
    },
    {
      body: t.Object({
        modelType: t.String(),
        name: t.Optional(t.String()),
        workflowId: t.Optional(t.Number()),
        computingUnitId: t.Optional(t.Number()),
        providerApiKey: t.Optional(t.String()),
        settings: t.Optional(
          t.Object({
            maxOperatorResultCharLimit: t.Optional(t.Number()),
            maxOperatorResultCellCharLimit: t.Optional(t.Number()),
            operatorResultSerializationMode: t.Optional(t.Literal("tsv")),
            toolTimeoutSeconds: t.Optional(t.Number()),
            executionTimeoutMinutes: t.Optional(t.Number()),
            disabledTools: t.Optional(t.Array(t.String())),
            maxSteps: t.Optional(t.Number()),
            allowedOperatorTypes: t.Optional(t.Array(t.String())),
          })
        ),
      }),
    }
  )

  .get("/:id", ({ params: { id } }) => {
    const agent = getAgent(id);
    return {
      ...getAgentInfo(id, agent),
      workflow: agent.getWorkflowState().getWorkflowContent(),
      stepCount: agent.getReActSteps().length,
    };
  })

  .delete("/:id", async ({ params: { id }, set }) => {
    const agent = agentStore.get(id);
    if (agent) {
      agent.destroy();
      agentStore.delete(id);
    }
    const existed = await persistence.delete(id);
    if (!agent && !existed) {
      set.status = 404;
      return { error: "Agent not found" };
    }
    return { deleted: true };
  })

  .get("/:id/react-steps", ({ params: { id } }) => {
    const agent = getAgent(id);
    return { steps: agent.getReActSteps(), state: agent.getState() };
  })

  .get("/:id/operator-results", ({ params: { id } }) => {
    const agent = getAgent(id);
    return { results: getOperatorResultSummaries(agent) };
  })

  .post(
    "/:id/steps-by-operators",
    ({ params: { id }, body }) => {
      const agent = getAgent(id);
      const { operatorIds } = body;
      return { steps: agent.getReActStepsByOperatorIds(operatorIds || []) };
    },
    {
      body: t.Object({
        operatorIds: t.Array(t.String()),
      }),
    }
  )

  .get("/:id/system-info", ({ params: { id } }) => {
    const agent = getAgent(id);
    return agent.getSystemInfo();
  })

  .post("/:id/stop", ({ params: { id } }) => {
    const agent = getAgent(id);
    agent.stop();
    return { status: "stopping" };
  })

  .post("/:id/clear", async ({ params: { id } }) => {
    const agent = getAgent(id);
    agent.clearHistory();
    await persistAgent(id, agent);
    return { status: "cleared" };
  })

  .get("/:id/chats", ({ params: { id } }) => {
    const agent = getAgent(id);
    return { chats: agent.listChatSummaries() };
  })

  .post("/:id/chats", async ({ params: { id } }) => {
    const agent = getAgent(id);
    agent.startNewChat();
    await persistAgent(id, agent);
    broadcastToAgentClients(id, new WsServerSnapshotEvent(agent.getState(), agent.getAllSteps(), agent.getHead()));
    return {
      chats: agent.listChatSummaries(),
      steps: agent.getReActSteps(),
      head: agent.getHead(),
    };
  })

  .post("/:id/chats/:chatId/open", async ({ params: { id, chatId }, set }) => {
    const agent = getAgent(id);
    if (!agent.openChat(chatId)) {
      set.status = 404;
      return { error: "Chat not found" };
    }
    await persistAgent(id, agent);
    broadcastToAgentClients(id, new WsServerSnapshotEvent(agent.getState(), agent.getAllSteps(), agent.getHead()));
    return {
      chats: agent.listChatSummaries(),
      steps: agent.getReActSteps(),
      head: agent.getHead(),
    };
  })

  .get("/:id/operator-types", ({ params: { id } }) => {
    const agent = getAgent(id);
    const metadataStore = agent.getMetadataStore();
    const allTypes = metadataStore.getAllOperatorTypes();
    return Object.entries(allTypes).map(([type, description]) => ({ type, description }));
  })

  .get("/:id/settings", ({ params: { id } }) => {
    const agent = getAgent(id);
    const agentSettings = agent.getSettings();
    return {
      maxOperatorResultCharLimit: agentSettings.maxOperatorResultCharLimit,
      maxOperatorResultCellCharLimit: agentSettings.maxOperatorResultCellCharLimit,
      operatorResultSerializationMode: agentSettings.operatorResultSerializationMode,
      toolTimeoutSeconds: Math.round(agentSettings.toolTimeoutMs / 1000),
      executionTimeoutMinutes: Math.round(agentSettings.executionTimeoutMs / 60000),
      disabledTools: Array.from(agentSettings.disabledTools),
      maxSteps: agentSettings.maxSteps,
      allowedOperatorTypes: agentSettings.allowedOperatorTypes,
    };
  })

  .patch(
    "/:id/delegate",
    async ({ params: { id }, body, headers }) => {
      const agent = getAgent(id);
      const { workflowId, computingUnitId } = body as BindAgentRequest;

      if (!workflowId) {
        throw new Error("workflowId is required");
      }

      const userToken = extractBearerToken(headers.authorization);
      if (!userToken) {
        throw new Error("Authorization header with a Bearer token is required");
      }
      if (!validateToken(userToken)) {
        throw new Error("Invalid or expired token");
      }

      const userInfo = extractUserFromToken(userToken);
      await bindAgentToWorkflow(agent, {
        userToken,
        userInfo,
        workflowId,
        computingUnitId,
      });
      log.info({ agentId: id, workflowId }, "bound agent to workflow");
      await persistAgent(id, agent);
      return getAgentInfo(id, agent);
    },
    {
      body: t.Object({
        workflowId: t.Number(),
        computingUnitId: t.Optional(t.Number()),
      }),
    }
  )

  .patch(
    "/:id/settings",
    async ({ params: { id }, body }) => {
      const agent = getAgent(id);
      const settings = body as UpdateAgentSettingsRequest;

      log.info(
        {
          agentId: id,
          maxOperatorResultCharLimit: settings.maxOperatorResultCharLimit,
          maxOperatorResultCellCharLimit: settings.maxOperatorResultCellCharLimit,
        },
        "updating agent settings"
      );

      agent.updateSettings({
        maxOperatorResultCharLimit: settings.maxOperatorResultCharLimit,
        maxOperatorResultCellCharLimit: settings.maxOperatorResultCellCharLimit,
        operatorResultSerializationMode: settings.operatorResultSerializationMode
          ? (settings.operatorResultSerializationMode as OperatorResultSerializationMode)
          : undefined,
        toolTimeoutMs: settings.toolTimeoutSeconds !== undefined ? settings.toolTimeoutSeconds * 1000 : undefined,
        executionTimeoutMs:
          settings.executionTimeoutMinutes !== undefined ? settings.executionTimeoutMinutes * 60000 : undefined,
        disabledTools: settings.disabledTools ? new Set(settings.disabledTools) : undefined,
        maxSteps: settings.maxSteps,
        allowedOperatorTypes: settings.allowedOperatorTypes,
      });

      await persistAgent(id, agent);

      const agentSettings = agent.getSettings();
      return {
        maxOperatorResultCharLimit: agentSettings.maxOperatorResultCharLimit,
        maxOperatorResultCellCharLimit: agentSettings.maxOperatorResultCellCharLimit,
        operatorResultSerializationMode: agentSettings.operatorResultSerializationMode,
        toolTimeoutSeconds: Math.round(agentSettings.toolTimeoutMs / 1000),
        executionTimeoutMinutes: Math.round(agentSettings.executionTimeoutMs / 60000),
        disabledTools: Array.from(agentSettings.disabledTools),
        maxSteps: agentSettings.maxSteps,
        allowedOperatorTypes: agentSettings.allowedOperatorTypes,
      };
    },
    {
      body: t.Object({
        maxOperatorResultCharLimit: t.Optional(t.Number()),
        maxOperatorResultCellCharLimit: t.Optional(t.Number()),
        operatorResultSerializationMode: t.Optional(t.Literal("tsv")),
        toolTimeoutSeconds: t.Optional(t.Number()),
        executionTimeoutMinutes: t.Optional(t.Number()),
        maxSteps: t.Optional(t.Number()),
        disabledTools: t.Optional(t.Array(t.String())),
        allowedOperatorTypes: t.Optional(t.Array(t.String())),
      }),
    }
  );

function getOperatorResultSummaries(agent: TexeraAgent): Record<string, OperatorResultSummary> {
  const resultState = agent.getWorkflowResultState();
  const visible = resultState.getAllVisible();
  const results: Record<string, OperatorResultSummary> = {};
  for (const [opId, entry] of visible) {
    const info = entry.operatorInfo;
    results[opId] = {
      state: info.state,
      inputTuples: info.inputTuples,
      outputTuples: info.outputTuples,
      inputPortShapes: info.inputPortShapes,
      outputColumns: info.result && info.result.length > 0 ? getVisibleResultHeaders(info.result[0]).length : undefined,
      error: info.error,
      warnings: info.warnings,
      consoleLogCount: info.consoleLogs?.length,
      totalRowCount: info.totalRowCount,
      sampleRecords: info.result,
      resultStatistics: info.resultStatistics,
    };
  }
  return results;
}

// Send a single server event to one client. Each event is constructed with
// `new WsServer*Event(...)`, so the `type` tag is never hand-written here.
function sendEventToClient(ws: { send(data: string): void }, event: WsServerEvent): void {
  ws.send(JSON.stringify(event));
}

// Broadcast a server event to every client attached to the agent.
function broadcastToAgentClients(agentId: string, event: WsServerEvent): void {
  const agent = agentStore.get(agentId);
  if (!agent) return;

  const serializedEvent = JSON.stringify(event);
  for (const ws of agent.getClients()) {
    try {
      ws.send(serializedEvent);
    } catch (error) {
      wsLog.error({ agentId, err: error }, "failed to send event to a client");
      agent.removeClient(ws);
    }
  }
}

export function buildApp() {
  return new Elysia()
    .use(cors())
    .group(env.API_PREFIX, app =>
      app
        .get("/healthcheck", () => ({
          status: "ok",
          timestamp: new Date().toISOString(),
        }))
        .use(agentsRouter)
    )
    .ws(`${env.API_PREFIX}/agents/:id/react`, {
      open(ws) {
        const agentId = (ws.data as any).params?.id;
        wsLog.info({ agentId }, "client connected");

        const agent = agentStore.get(agentId);
        if (!agent) {
          sendEventToClient(ws, new WsServerErrorEvent("Agent not found"));
          ws.close();
          return;
        }

        agent.addClient(ws);

        sendEventToClient(ws, new WsServerSnapshotEvent(agent.getState(), agent.getAllSteps(), agent.getHead()));
      },

      async message(ws, messageData) {
        const agentId = (ws.data as any).params?.id;
        const agent = agentStore.get(agentId);

        if (!agent) {
          sendEventToClient(ws, new WsServerErrorEvent("Agent not found"));
          return;
        }

        let msg: WsClientCommand;
        try {
          msg = typeof messageData === "string" ? JSON.parse(messageData) : (messageData as WsClientCommand);
        } catch {
          sendEventToClient(ws, new WsServerErrorEvent("Invalid message format"));
          return;
        }

        switch (msg.type) {
          case "WsClientStopCommand":
            agent.stop();
            broadcastToAgentClients(agentId, new WsServerStatusEvent(AgentState.STOPPING));
            return;

          case "WsClientPromptCommand": {
            if (!msg.content || typeof msg.content !== "string") {
              sendEventToClient(ws, new WsServerErrorEvent("Message content is required"));
              return;
            }

            wsLog.info({ agentId, preview: msg.content.substring(0, 50) }, "received command");

            agent.setStepCallback((step: ReActStep) => {
              broadcastToAgentClients(agentId, new WsServerStepEvent(step));
            });

            broadcastToAgentClients(agentId, new WsServerStatusEvent(AgentState.GENERATING));

            try {
              const result = await agent.sendMessage(msg.content, msg.messageSource);

              agent.setStepCallback(null);

              const allSteps = agent.getReActSteps();
              const lastStep = allSteps[allSteps.length - 1];
              if (lastStep && lastStep.isEnd) {
                broadcastToAgentClients(agentId, new WsServerStepEvent(lastStep));
              }

              wsLog.info({ agentId, steps: result.messages.length }, "agent run complete");
            } catch (error: any) {
              agent.setStepCallback(null);
              broadcastToAgentClients(agentId, new WsServerErrorEvent(error.message));
            } finally {
              // Persist chat so history survives agent-service restart / hydrate.
              try {
                await persistAgent(agentId, agent);
              } catch (persistError) {
                wsLog.warn({ agentId, err: persistError }, "failed to persist chat history");
              }
              // The run is over (success or failure) and TexeraAgent.sendMessage has
              // reset the agent to its resting state (AVAILABLE) in its own finally.
              // This status frame is the run-end signal (it also unsticks the client
              // from GENERATING after errors).
              broadcastToAgentClients(agentId, new WsServerStatusEvent(agent.getState()));
            }
            return;
          }

          default:
            // Frames are parsed from untrusted JSON; reject unknown discriminators
            // explicitly instead of silently no-op'ing, so client/server mismatches
            // are easy to diagnose.
            sendEventToClient(ws, new WsServerErrorEvent(`Unknown message type: ${(msg as { type?: unknown }).type}`));
        }
      },

      close(ws) {
        const agentId = (ws.data as any).params?.id;
        wsLog.info({ agentId }, "client disconnected");

        const agent = agentStore.get(agentId);
        if (agent) {
          agent.removeClient(ws);
        }
      },
    })
    .onError(({ error, set }) => {
      // Catch-all for non-router routes such as /api/healthcheck and the websocket route.
      log.error({ err: error }, "request error");
      set.status = 500;
      return { error: error instanceof Error ? error.message : String(error) };
    });
}

// Reset module-level state. Used by tests to start each case from a clean store.
export function _resetAgentStoreForTests(): void {
  agentStore.clear();
  agentCounter = 0;
  void memoryPersistence.clear();
  persistence = memoryPersistence;
  persistenceBackend = "memory";
}

export function _resetRuntimeAgentsForTests(): void {
  agentStore.clear();
  agentCounter = 0;
}

export async function _getPersistedRecordForTests(agentId: string): Promise<PersistedAgentRecord | undefined> {
  return persistence.get(agentId);
}

// Look up an agent instance by id. Used by tests to stub agent behavior (e.g.
// `sendMessage`) when exercising the WebSocket handlers.
export function _getAgentForTests(agentId: string): TexeraAgent | undefined {
  return agentStore.get(agentId);
}

function printStartupMessage(app: ReturnType<typeof buildApp>) {
  const LINE = "=".repeat(60);
  console.log(LINE);
  console.log("Texera Agent Service (Elysia.js + RxJS)");
  console.log(LINE);
  console.log(`Server running at http://localhost:${env.PORT}`);
  console.log("");

  console.log("Registered Routes:");
  const routes = app.routes;

  const httpRoutes = routes.filter(r => r.method !== "WS");
  const wsRoutes = routes.filter(r => r.method === "WS");

  for (const route of httpRoutes) {
    const method = route.method.padEnd(6);
    console.log(`  ${method} ${route.path}`);
  }

  if (wsRoutes.length > 0) {
    console.log("");
    console.log("WebSocket Endpoints:");
    for (const route of wsRoutes) {
      console.log(`  WS     ${route.path}`);
    }
    console.log("         Send: { type: 'WsClientPromptCommand', content: '...' }");
    console.log("         Send: { type: 'WsClientStopCommand' }");
    console.log(
      "         Recv: { type: 'WsServerSnapshotEvent' | 'WsServerStepEvent' | 'WsServerStatusEvent' | 'WsServerErrorEvent', ... }"
    );
  }

  console.log("");
  console.log("Environment:");
  console.log(`  LLM_ENDPOINT: ${getBackendConfig().modelsEndpoint}`);
  console.log(`  WORKFLOW_COMPILING_SERVICE_ENDPOINT: ${getBackendConfig().compileEndpoint}`);
  console.log(`  TEXERA_DASHBOARD_SERVICE_ENDPOINT: ${getBackendConfig().apiEndpoint}`);
  console.log(`  AGENT_PERSISTENCE: ${persistenceBackend}`);
  console.log("");
  console.log("Features:");
  console.log("  - Auto-persistence with debounce (500ms)");
  console.log(LINE);
}

async function initializeAgentPersistence() {
  if (!env.STORAGE_JDBC_URL) {
    log.info("agent persistence: in-memory (STORAGE_JDBC_URL not set)");
    persistence = memoryPersistence;
    persistenceBackend = "memory";
    return;
  }
  try {
    const { PostgresAgentPersistence } = await import("./persistence/postgres-agent-persistence");
    persistence = await PostgresAgentPersistence.connect(
      env.STORAGE_JDBC_URL,
      env.STORAGE_JDBC_USERNAME,
      env.STORAGE_JDBC_PASSWORD
    );
    persistenceBackend = "postgres";
    log.info("agent persistence: postgres user_agent");
  } catch (error) {
    log.warn({ err: error }, "failed to connect postgres agent persistence; using memory");
    persistence = memoryPersistence;
    persistenceBackend = "memory";
  }
}

async function initializeServices() {
  try {
    log.info("initializing global workflow system metadata");
    const metadata = await WorkflowSystemMetadata.initializeGlobal();
    log.info({ operatorCount: metadata.getOperatorCount() }, "loaded operators into global metadata");
  } catch (error) {
    log.warn({ err: error }, "failed to initialize global metadata; agents will initialize individually");
  }
}

export async function start() {
  await initializeServices();
  await initializeAgentPersistence();
  const app = buildApp().listen(env.PORT);
  printStartupMessage(app);
  return app;
}

// Run the server only when this file is the entry point, not when it is
// imported by tests or other modules.
if (import.meta.main) start();
