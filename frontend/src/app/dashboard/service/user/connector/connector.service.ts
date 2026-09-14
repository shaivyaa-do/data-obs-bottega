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

import { Injectable } from "@angular/core";
import { Observable, of, throwError } from "rxjs";
import { delay, map } from "rxjs/operators";
import {
  ConnectorLog,
  CreateConnectorRequest,
  RemoteTable,
  SavedConnector,
  TestConnectorRequest,
  TestConnectorResult,
  UpdateConnectorRequest,
} from "../../../type/connector";
import {
  AVAILABLE_CONNECTOR_IDS,
  cloneSeedConnectors,
  MOCK_DISCOVERED_DATABASES,
  MOCK_DISCOVERED_SCHEMAS,
  MOCK_REMOTE_TABLES,
} from "./mock-connectors";

/**
 * Product-shell connectors API. There is no warehouse backend yet — every
 * method is an in-memory stand-in for:
 *   GET    /connectors
 *   POST   /connectors
 *   POST   /connectors/:id/test
 *   GET    /connectors/:id/tables
 *   PATCH  /connectors/:id
 *   DELETE /connectors/:id
 *   POST   /connectors/:id/publish
 *
 * Secrets stay in `secretsById` and are never copied onto SavedConnector.
 */
export const MOCK_TEST_CONNECTION_MS = 800;

@Injectable({
  providedIn: "root",
})
export class ConnectorService {
  private connectors: SavedConnector[] = cloneSeedConnectors();
  private secretsById = new Map<string, string>([["facilities-prod", "$POSTGRES_PASSWORD"]]);

  listConnectors(): Observable<SavedConnector[]> {
    return of(this.snapshot());
  }

  getConnector(id: string): Observable<SavedConnector> {
    const found = this.connectors.find(connector => connector.id === id);
    if (!found) {
      return throwError(() => new Error(`Unknown connector "${id}"`));
    }
    return of(structuredClone(found));
  }

  createConnector(request: CreateConnectorRequest): Observable<SavedConnector> {
    if (!AVAILABLE_CONNECTOR_IDS.includes(request.appId)) {
      return throwError(() => new Error(`Cannot save connector type "${request.appId}"`));
    }
    const id = this.slug(request.name);
    const tables = MOCK_REMOTE_TABLES.map(table => ({
      ...table,
      enabled: (request.enabledTables ?? []).includes(table.name),
    }));
    const saved: SavedConnector = {
      id,
      name: request.name.trim(),
      description: request.description?.trim() ?? "",
      environment: request.environment,
      appId: request.appId,
      status: "active",
      lastTestedAt: new Date().toISOString(),
      createdBy: "admin",
      createdAt: new Date().toISOString(),
      destination: structuredClone(request.destination),
      tables,
      config: structuredClone(request.config),
      hasSecret: Boolean(request.secret),
      logs: [
        {
          at: new Date().toISOString(),
          kind: "test",
          ok: true,
          message: "Connected.",
        },
      ],
    };
    this.connectors = [...this.connectors.filter(connector => connector.id !== id), saved];
    if (request.secret) {
      this.secretsById.set(id, request.secret);
    }
    return of(structuredClone(saved));
  }

  testConnector(request: TestConnectorRequest): Observable<TestConnectorResult> {
    return of(request).pipe(
      delay(MOCK_TEST_CONNECTION_MS),
      map(payload => this.evaluateTest(payload))
    );
  }

  listTables(id: string): Observable<RemoteTable[]> {
    return this.getConnector(id).pipe(map(connector => structuredClone(connector.tables)));
  }

  updateConnector(id: string, patch: UpdateConnectorRequest): Observable<SavedConnector> {
    const index = this.connectors.findIndex(connector => connector.id === id);
    if (index === -1) {
      return throwError(() => new Error(`Unknown connector "${id}"`));
    }
    const current = this.connectors[index];
    const tables = patch.enabledTables
      ? current.tables.map(table => ({ ...table, enabled: patch.enabledTables!.includes(table.name) }))
      : current.tables;
    const updated: SavedConnector = {
      ...current,
      name: patch.name?.trim() ?? current.name,
      description: patch.description !== undefined ? patch.description.trim() : current.description,
      environment: patch.environment ?? current.environment,
      config: patch.config ? structuredClone(patch.config) : current.config,
      destination: patch.destination ? structuredClone(patch.destination) : current.destination,
      status: patch.status ?? current.status,
      tables,
      hasSecret: patch.secret ? true : current.hasSecret,
    };
    this.connectors = [...this.connectors.slice(0, index), updated, ...this.connectors.slice(index + 1)];
    if (patch.secret) {
      this.secretsById.set(id, patch.secret);
    }
    return of(structuredClone(updated));
  }

  deleteConnector(id: string): Observable<void> {
    this.connectors = this.connectors.filter(connector => connector.id !== id);
    this.secretsById.delete(id);
    return of(undefined);
  }

  publishConnector(id: string): Observable<SavedConnector> {
    return this.appendLog(id, {
      at: new Date().toISOString(),
      kind: "ingest",
      ok: true,
      message: "Published sample into the dataset catalog.",
    });
  }

  disconnectConnector(id: string): Observable<SavedConnector> {
    return this.updateConnector(id, { status: "inactive" });
  }

  private evaluateTest(request: TestConnectorRequest): TestConnectorResult {
    const host = this.hostOf(request.config);
    const failed = !host.trim() || request.name.trim().toLowerCase() === "fail";
    const result: TestConnectorResult = failed
      ? {
          ok: false,
          message: "Connection failed. Check host and display name.",
          tables: [],
          databases: [],
          schemas: [],
        }
      : {
          ok: true,
          message: "Connected. Mock catalog only — no warehouse was contacted.",
          tables: MOCK_REMOTE_TABLES.map(table => ({ ...table })),
          databases: [...MOCK_DISCOVERED_DATABASES],
          schemas: [...MOCK_DISCOVERED_SCHEMAS],
        };
    if (request.connectorId) {
      const index = this.connectors.findIndex(connector => connector.id === request.connectorId);
      if (index !== -1) {
        const current = this.connectors[index];
        const log: ConnectorLog = {
          at: new Date().toISOString(),
          kind: "test",
          ok: !failed,
          message: result.message,
        };
        const updated: SavedConnector = {
          ...current,
          status: failed ? "error" : "active",
          lastTestedAt: log.at,
          tables: failed
            ? current.tables
            : result.tables.map(table => ({
                ...table,
                enabled: current.tables.find(existing => existing.name === table.name)?.enabled ?? false,
              })),
          logs: [log, ...current.logs].slice(0, 5),
        };
        this.connectors = [...this.connectors.slice(0, index), updated, ...this.connectors.slice(index + 1)];
      }
    }
    return result;
  }

  private appendLog(id: string, log: ConnectorLog): Observable<SavedConnector> {
    const index = this.connectors.findIndex(connector => connector.id === id);
    if (index === -1) {
      return throwError(() => new Error(`Unknown connector "${id}"`));
    }
    const current = this.connectors[index];
    const updated = { ...current, logs: [log, ...current.logs].slice(0, 5) };
    this.connectors = [...this.connectors.slice(0, index), updated, ...this.connectors.slice(index + 1)];
    return of(structuredClone(updated));
  }

  private hostOf(config: SavedConnector["config"]): string {
    if ("host" in config) {
      return config.host;
    }
    if ("account" in config) {
      return config.account;
    }
    if ("workspaceUrl" in config) {
      return config.workspaceUrl;
    }
    return config.bucket;
  }

  private snapshot(): SavedConnector[] {
    return structuredClone(this.connectors);
  }

  private slug(name: string): string {
    const base = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return base || `connector-${this.connectors.length + 1}`;
  }
}
