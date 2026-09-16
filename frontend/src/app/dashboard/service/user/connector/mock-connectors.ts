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
 * Marketing catalog for the Choose an app grid. Availability is set from
 * GET /api/connectors/types — never from this hardcoded list.
 */

import { ConnectorApp, ConnectorAppId, ConnectorType } from "../../../type/connector";

export const CONNECTOR_APPS: ConnectorApp[] = [
  {
    id: "postgresql",
    code: "postgres",
    name: "PostgreSQL",
    shortName: "Postgres",
    description: "Query a Postgres warehouse or operational database.",
    available: false,
    icon: "database",
  },
  {
    id: "mysql",
    code: "mysql",
    name: "MySQL",
    shortName: "MySQL",
    description: "Query a MySQL or compatible database.",
    available: false,
    icon: "database",
  },
  {
    id: "snowflake",
    code: "snowflake",
    name: "Snowflake",
    shortName: "Snowflake",
    description: "Query Snowflake databases and schemas over JDBC.",
    available: false,
    icon: "cloud",
  },
  {
    id: "databricks",
    code: "databricks",
    name: "Databricks",
    shortName: "Databricks",
    description: "Connect a Databricks SQL warehouse by workspace URL.",
    available: false,
    icon: "thunderbolt",
  },
  {
    id: "s3",
    code: "s3",
    name: "Amazon S3",
    shortName: "S3",
    description: "Browse objects in an S3 bucket by prefix.",
    available: false,
    icon: "folder",
  },
  {
    id: "bigquery",
    code: "bigquery",
    name: "BigQuery",
    shortName: "BigQuery",
    description: "Google BigQuery datasets.",
    available: false,
    icon: "table",
  },
  {
    id: "redshift",
    code: "redshift",
    name: "Redshift",
    shortName: "Redshift",
    description: "Amazon Redshift clusters.",
    available: false,
    icon: "database",
  },
  {
    id: "salesforce",
    code: "salesforce",
    name: "Salesforce",
    shortName: "Salesforce",
    description: "Salesforce objects and reports.",
    available: false,
    icon: "team",
  },
];

export function appById(id: ConnectorAppId): ConnectorApp | undefined {
  return CONNECTOR_APPS.find(app => app.id === id);
}

export function appByCode(code: string): ConnectorApp | undefined {
  return CONNECTOR_APPS.find(app => app.code === code);
}

export function mergeConnectorApps(types: ConnectorType[]): ConnectorApp[] {
  const byCode = new Map(types.map(type => [type.code, type]));
  return CONNECTOR_APPS.map(app => {
    const type = byCode.get(app.code);
    if (!type) {
      return { ...app, available: false };
    }
    return {
      ...app,
      available: true,
      name: type.displayName || app.name,
      fieldsSchema: type.fieldsSchema,
    };
  });
}

export function hostFromConfig(config: Record<string, unknown>): string {
  const host = config["host"];
  return typeof host === "string" ? host : "";
}
