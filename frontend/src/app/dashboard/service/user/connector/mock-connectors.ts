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
 *
 * Product-shell fixtures. No warehouse secrets belong here — use env
 * placeholders such as $POSTGRES_PASSWORD when filling the wizard.
 */

import {
  ConnectorApp,
  ConnectorAppId,
  PostgresMysqlConfig,
  RemoteTable,
  SavedConnector,
} from "../../../type/connector";

export const CONNECTOR_APPS: ConnectorApp[] = [
  {
    id: "postgresql",
    name: "PostgreSQL",
    shortName: "Postgres",
    description: "Query a Postgres warehouse or operational database.",
    available: true,
    icon: "database",
  },
  {
    id: "mysql",
    name: "MySQL",
    shortName: "MySQL",
    description: "Query a MySQL or compatible database.",
    available: true,
    icon: "database",
  },
  {
    id: "snowflake",
    name: "Snowflake",
    shortName: "Snowflake",
    description: "Query Snowflake databases and schemas over JDBC.",
    available: true,
    icon: "cloud",
  },
  {
    id: "databricks",
    name: "Databricks",
    shortName: "Databricks",
    description: "Connect a Databricks SQL warehouse by workspace URL.",
    available: true,
    icon: "thunderbolt",
  },
  {
    id: "s3",
    name: "Amazon S3",
    shortName: "S3",
    description: "Browse objects in an S3 bucket by prefix.",
    available: true,
    icon: "folder",
  },
  {
    id: "bigquery",
    name: "BigQuery",
    shortName: "BigQuery",
    description: "Google BigQuery datasets.",
    available: false,
    icon: "table",
  },
  {
    id: "redshift",
    name: "Redshift",
    shortName: "Redshift",
    description: "Amazon Redshift clusters.",
    available: false,
    icon: "database",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    shortName: "Salesforce",
    description: "Salesforce objects and reports.",
    available: false,
    icon: "team",
  },
];

export const AVAILABLE_CONNECTOR_IDS = CONNECTOR_APPS.filter(app => app.available).map(app => app.id);

export const MOCK_REMOTE_TABLES: RemoteTable[] = [
  { name: "hourly_kwh", schema: "public", enabled: false },
  { name: "buildings", schema: "public", enabled: false },
  { name: "meter_readings", schema: "public", enabled: false },
  { name: "occupancy", schema: "public", enabled: false },
  { name: "weather_hourly", schema: "public", enabled: false },
  { name: "equipment", schema: "public", enabled: false },
];

export const MOCK_DISCOVERED_DATABASES = ["facilities"];
export const MOCK_DISCOVERED_SCHEMAS = ["public"];

const SEED_CONFIG: PostgresMysqlConfig = {
  host: "db.facilities.internal",
  port: 5432,
  database: "facilities",
  username: "analyst",
  ssl: true,
  schema: "public",
  defaultTable: "hourly_kwh",
};

export const SEED_CONNECTORS: SavedConnector[] = [
  {
    id: "facilities-prod",
    name: "facilities-prod",
    description: "Campus energy meters",
    environment: "prod",
    appId: "postgresql",
    status: "active",
    lastTestedAt: "2026-09-01T12:00:00.000Z",
    createdBy: "admin",
    createdAt: "2026-08-20T09:00:00.000Z",
    destination: {
      mode: "dataset",
      datasetName: "hourly_kwh",
      folder: "energy",
      selectOrTable: "public.hourly_kwh",
      rowLimit: 10000,
    },
    tables: [
      { name: "hourly_kwh", schema: "public", enabled: true },
      { name: "buildings", schema: "public", enabled: true },
    ],
    config: SEED_CONFIG,
    hasSecret: true,
    logs: [
      {
        at: "2026-09-01T12:00:00.000Z",
        kind: "test",
        ok: true,
        message: "Connected.",
      },
      {
        at: "2026-09-01T12:01:00.000Z",
        kind: "ingest",
        ok: true,
        message: "Published sample to energy / hourly_kwh.",
      },
    ],
  },
];

export function cloneSeedConnectors(): SavedConnector[] {
  return structuredClone(SEED_CONNECTORS);
}

export function appById(id: ConnectorAppId): ConnectorApp | undefined {
  return CONNECTOR_APPS.find(app => app.id === id);
}

export function hostOrAccountFromConfig(config: SavedConnector["config"]): string {
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
