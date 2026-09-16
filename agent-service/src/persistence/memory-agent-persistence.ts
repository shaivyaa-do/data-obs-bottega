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

import type { AgentPersistence, PersistedAgentRecord } from "./agent-record";
import { parseAgentSeq } from "./agent-id";
import { sanitizePersistedSettings } from "./user-agent-row";

export class MemoryAgentPersistence implements AgentPersistence {
  private readonly records = new Map<string, PersistedAgentRecord>();

  async save(record: PersistedAgentRecord): Promise<void> {
    this.records.set(record.agentId, {
      ...record,
      settings: sanitizePersistedSettings(record.settings),
    });
  }

  async get(agentId: string): Promise<PersistedAgentRecord | undefined> {
    const record = this.records.get(agentId);
    return record ? { ...record, settings: { ...record.settings } } : undefined;
  }

  async listByUid(uid: number): Promise<PersistedAgentRecord[]> {
    return [...this.records.values()]
      .filter(record => record.uid === uid)
      .map(record => ({ ...record, settings: { ...record.settings } }));
  }

  async delete(agentId: string): Promise<boolean> {
    return this.records.delete(agentId);
  }

  async maxAgentSeq(): Promise<number> {
    let max = 0;
    for (const agentId of this.records.keys()) {
      max = Math.max(max, parseAgentSeq(agentId));
    }
    return max;
  }

  async clear(): Promise<void> {
    this.records.clear();
  }
}
