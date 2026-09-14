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

export type ConnectorStatus = "active" | "connected" | "inactive" | "error" | "testing";

export type DestinationMode = "live" | "dataset" | "both";

export type ConnectorEnvironment = "prod" | "staging";

export interface ConnectorApp {
  id: ConnectorAppId;
  name: string;
  shortName: string;
  description: string;
  available: boolean;
  icon: string;
}

export interface RemoteTable {
  name: string;
  schema?: string;
  enabled: boolean;
}

export interface DestinationConfig {
  mode: DestinationMode;
  datasetName?: string;
  folder?: string;
  selectOrTable?: string;
  rowLimit?: number;
}

export interface ConnectorLog {
  at: string;
  kind: "test" | "ingest";
  ok: boolean;
  message: string;
}

export interface PostgresMysqlConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  ssl: boolean;
  schema?: string;
  defaultTable?: string;
}

export interface SnowflakeConfig {
  account: string;
  warehouse: string;
  database: string;
  schema: string;
  role: string;
  user: string;
}

export interface DatabricksConfig {
  workspaceUrl: string;
  httpPath: string;
  catalog: string;
  schema: string;
}

export interface S3Config {
  bucket: string;
  region: string;
  accessKey: string;
  prefix?: string;
}

export type ConnectionConfig = PostgresMysqlConfig | SnowflakeConfig | DatabricksConfig | S3Config;

export interface SavedConnector {
  id: string;
  name: string;
  description: string;
  environment: ConnectorEnvironment;
  appId: ConnectorAppId;
  status: ConnectorStatus;
  lastTestedAt: string | null;
  createdBy: string;
  createdAt: string;
  destination: DestinationConfig;
  tables: RemoteTable[];
  config: ConnectionConfig;
  hasSecret: boolean;
  logs: ConnectorLog[];
}

export interface TestConnectorRequest {
  name: string;
  appId: ConnectorAppId;
  config: ConnectionConfig;
  /** Never persisted on SavedConnector. */
  secret?: string;
  connectorId?: string;
}

export interface TestConnectorResult {
  ok: boolean;
  message: string;
  tables: RemoteTable[];
  databases: string[];
  schemas: string[];
}

export interface CreateConnectorRequest {
  name: string;
  description?: string;
  environment: ConnectorEnvironment;
  appId: ConnectorAppId;
  config: ConnectionConfig;
  secret?: string;
  destination: DestinationConfig;
  enabledTables?: string[];
}

export interface UpdateConnectorRequest {
  name?: string;
  description?: string;
  environment?: ConnectorEnvironment;
  config?: ConnectionConfig;
  secret?: string;
  destination?: DestinationConfig;
  enabledTables?: string[];
  status?: ConnectorStatus;
}

export function isActiveStatus(status: ConnectorStatus): boolean {
  return status === "active" || status === "connected";
}

export function destinationSummary(connector: SavedConnector): string {
  if (connector.destination.mode === "live") {
    return "Live query in workflows";
  }
  const path = [connector.destination.folder, connector.destination.datasetName].filter(Boolean).join(" / ");
  const published = path ? `Published as dataset · ${path}` : "Published as dataset";
  if (connector.destination.mode === "both") {
    return `Live query + ${published.charAt(0).toLowerCase()}${published.slice(1)}`;
  }
  return published;
}

export function connectedToast(app: ConnectorApp, name: string): string {
  return `${app.shortName} · ${name} connected.`;
}
