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

export type ConnectorAppId =
  | "postgresql"
  | "mysql"
  | "snowflake"
  | "databricks"
  | "s3"
  | "bigquery"
  | "redshift"
  | "salesforce";

export type ConnectorStatus = "active" | "error" | "disabled" | "testing";

export type DestinationMode = "live" | "dataset" | "both";

export interface ConnectorFieldSchema {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  secret?: boolean;
  default?: string;
}

export interface ConnectorFieldsSchema {
  fields: ConnectorFieldSchema[];
}

export interface ConnectorType {
  id: number;
  code: string;
  displayName: string;
  fieldsSchema: ConnectorFieldsSchema;
}

export interface ConnectorApp {
  id: ConnectorAppId;
  /** Backend `data_connector.code` (postgres), which may differ from the UI id (postgresql). */
  code: string;
  name: string;
  shortName: string;
  description: string;
  available: boolean;
  icon: string;
  fieldsSchema?: ConnectorFieldsSchema;
}

export interface SavedConnector {
  id: string;
  name: string;
  status: ConnectorStatus;
  connectorCode: string;
  connectorDisplayName: string;
  config: Record<string, unknown>;
  lastTestedAt: string | null;
  lastError: string | null;
}

export interface SavedConnectorResponse {
  id: number;
  name: string;
  status: string;
  connectorCode: string;
  connectorDisplayName: string;
  config?: Record<string, unknown> | null;
  lastTestedAt?: string | null;
  lastError?: string | null;
}

export interface CreateConnectorRequest {
  name: string;
  connectorCode: string;
  host: string;
  port: number | string;
  database: string;
  username: string;
  schema?: string;
  password: string;
}

export interface UpdateConnectorRequest {
  name?: string;
  host?: string;
  port?: number | string;
  database?: string;
  username?: string;
  schema?: string;
  password?: string;
}

const SECRET_CONFIG_KEYS = new Set(["password", "secret", "secret_enc"]);

export function isActiveStatus(status: ConnectorStatus): boolean {
  return status === "active";
}

export function statusLabel(status: ConnectorStatus): string {
  if (status === "active") {
    return "Active";
  }
  if (status === "error") {
    return "Error";
  }
  if (status === "testing") {
    return "Testing";
  }
  return "Disabled";
}

export function normalizeConnectorStatus(raw: string | null | undefined): ConnectorStatus {
  const value = (raw ?? "").toLowerCase();
  if (value === "active" || value === "connected") {
    return "active";
  }
  if (value === "error") {
    return "error";
  }
  if (value === "testing") {
    return "testing";
  }
  return "disabled";
}

export function stripSecretConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config ?? {})) {
    if (SECRET_CONFIG_KEYS.has(key.toLowerCase())) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function mapSavedConnector(raw: SavedConnectorResponse): SavedConnector {
  return {
    id: String(raw.id),
    name: raw.name,
    status: normalizeConnectorStatus(raw.status),
    connectorCode: raw.connectorCode,
    connectorDisplayName: raw.connectorDisplayName,
    config: stripSecretConfig(raw.config),
    lastTestedAt: raw.lastTestedAt ?? null,
    lastError: raw.lastError ?? null,
  };
}

/** v1 connections are live-query JDBC. Do not invent a published dataset line. */
export function destinationSummary(_connector: SavedConnector): string {
  return "Live query in workflows";
}

export function connectedToast(app: ConnectorApp, name: string): string {
  return `${app.shortName} · ${name} connected.`;
}
