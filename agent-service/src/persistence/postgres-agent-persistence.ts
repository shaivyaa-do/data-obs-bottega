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

import { SQL } from "bun";
import type { AgentPersistence, PersistedAgentRecord } from "./agent-record";
import { parseAgentSeq } from "./agent-id";
import { parseJdbcUrl } from "./jdbc-url";
import { rowToRecord, sanitizePersistedSettings, type UserAgentRow } from "./user-agent-row";

export class PostgresAgentPersistence implements AgentPersistence {
  private constructor(private readonly sql: SQL) {}

  static async connect(jdbcUrl: string, username: string, password: string): Promise<PostgresAgentPersistence> {
    const conn = parseJdbcUrl(jdbcUrl, username, password);
    const sql = new SQL({
      hostname: conn.hostname,
      port: conn.port,
      database: conn.database,
      username: conn.username,
      password: conn.password,
      max: 4,
      connectionTimeout: 5,
    });
    return new PostgresAgentPersistence(sql);
  }

  async save(record: PersistedAgentRecord): Promise<void> {
    const settings = sanitizePersistedSettings(record.settings);
    await this.sql`
      INSERT INTO texera_db.user_agent (
        agent_id, uid, name, model_type, settings, workflow_id, computing_unit_id, created_at
      ) VALUES (
        ${record.agentId},
        ${record.uid},
        ${record.name},
        ${record.modelType},
        CAST(${JSON.stringify(settings)} AS jsonb),
        ${record.workflowId ?? null},
        ${record.computingUnitId ?? null},
        CAST(${record.createdAt} AS timestamptz)
      )
      ON CONFLICT (agent_id) DO UPDATE SET
        name = EXCLUDED.name,
        model_type = EXCLUDED.model_type,
        settings = EXCLUDED.settings,
        workflow_id = EXCLUDED.workflow_id,
        computing_unit_id = EXCLUDED.computing_unit_id
    `;
  }

  async get(agentId: string): Promise<PersistedAgentRecord | undefined> {
    const rows = (await this.sql`
      SELECT agent_id, uid, name, model_type, settings, workflow_id, computing_unit_id, created_at
      FROM texera_db.user_agent
      WHERE agent_id = ${agentId}
    `) as UserAgentRow[];
    return rows[0] ? rowToRecord(rows[0]) : undefined;
  }

  async listByUid(uid: number): Promise<PersistedAgentRecord[]> {
    const rows = (await this.sql`
      SELECT agent_id, uid, name, model_type, settings, workflow_id, computing_unit_id, created_at
      FROM texera_db.user_agent
      WHERE uid = ${uid}
      ORDER BY created_at ASC
    `) as UserAgentRow[];
    return rows.map(rowToRecord);
  }

  async delete(agentId: string): Promise<boolean> {
    const rows = (await this.sql`
      DELETE FROM texera_db.user_agent WHERE agent_id = ${agentId} RETURNING agent_id
    `) as Array<{ agent_id: string }>;
    return rows.length > 0;
  }

  async maxAgentSeq(): Promise<number> {
    const rows = (await this.sql`SELECT agent_id FROM texera_db.user_agent`) as Array<{ agent_id: string }>;
    return rows.reduce((max, row) => Math.max(max, parseAgentSeq(row.agent_id)), 0);
  }

  async close(): Promise<void> {
    await this.sql.close();
  }
}
