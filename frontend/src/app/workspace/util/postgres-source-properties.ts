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

import { cloneDeep } from "lodash-es";
import { v4 as uuid } from "uuid";
import { WorkflowContent, WorkflowSettings } from "../../common/type/workflow";
import { OperatorPredicate } from "../types/workflow-common.interface";
import { OperatorSchema } from "../types/operator-schema.interface";

export const POSTGRES_SOURCE_OPERATOR_TYPE = "PostgreSQLSource";
export const MYSQL_SOURCE_OPERATOR_TYPE = "MySQLSource";
export const CONNECTION_ID_QUERY_PARAM = "connection_id";
export const CONNECTOR_CODE_QUERY_PARAM = "connector_code";
export const POSTGRES_ADD_CONNECTION_MESSAGE = "Add a PostgreSQL connection under Connectors.";
export const MYSQL_ADD_CONNECTION_MESSAGE = "Add a MySQL connection under Connectors.";

export const POSTGRES_JDBC_PROPERTY_KEYS = ["host", "port", "database", "username", "password"] as const;
export const JDBC_SOURCE_OPERATOR_TYPES = new Set([POSTGRES_SOURCE_OPERATOR_TYPE, MYSQL_SOURCE_OPERATOR_TYPE]);

export function isJdbcSourceOperatorType(operatorType: string | undefined): boolean {
  return operatorType != null && JDBC_SOURCE_OPERATOR_TYPES.has(operatorType);
}

export function hasPostgresConnectionId(properties: Record<string, unknown> | undefined): boolean {
  const connectionId = properties?.["connectionId"];
  return connectionId != null && String(connectionId).trim() !== "";
}

export function isLegacyPostgresSource(properties: Record<string, unknown> | undefined): boolean {
  const host = typeof properties?.["host"] === "string" && properties["host"].trim().length > 0;
  return host && !hasPostgresConnectionId(properties);
}

export function sanitizePostgresSourceProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  if (!hasPostgresConnectionId(properties)) {
    return properties;
  }
  const next = { ...properties };
  for (const key of POSTGRES_JDBC_PROPERTY_KEYS) {
    delete next[key];
  }
  return next;
}

export function adaptPostgresSourceSchema(operator: OperatorPredicate, schema: OperatorSchema): OperatorSchema {
  if (!isJdbcSourceOperatorType(schema.operatorType)) {
    return schema;
  }
  if (isLegacyPostgresSource(operator.operatorProperties)) {
    return schema;
  }
  const jsonSchema = cloneDeep(schema.jsonSchema);
  const jdbcKeys = new Set<string>(POSTGRES_JDBC_PROPERTY_KEYS);
  const required = (jsonSchema.required ?? []).filter(key => !jdbcKeys.has(key));
  if (!required.includes("connectionId")) {
    required.push("connectionId");
  }
  if (!required.includes("table")) {
    required.push("table");
  }
  const properties = { ...(jsonSchema.properties ?? {}) };
  const isMysql = schema.operatorType === MYSQL_SOURCE_OPERATOR_TYPE;
  if (properties["connectionId"] == null) {
    properties["connectionId"] = {
      type: "string",
      title: "Connection",
      description: isMysql
        ? "Saved MySQL connection from Connectors"
        : "Saved PostgreSQL connection from Connectors",
      propertyOrder: 2,
    };
  }
  return { ...schema, jsonSchema: { ...jsonSchema, properties, required } };
}

export function jdbcSourceOperator(connectionId: string, operatorType: string): OperatorPredicate {
  const operatorID = `${operatorType}-${uuid()}`;
  return {
    operatorID,
    operatorType,
    operatorVersion: "",
    operatorProperties: { connectionId },
    inputPorts: [],
    outputPorts: [{ portID: "output-0" }],
    showAdvanced: false,
  };
}

export function postgresSourceOperator(connectionId: string): OperatorPredicate {
  return jdbcSourceOperator(connectionId, POSTGRES_SOURCE_OPERATOR_TYPE);
}

export function mysqlSourceOperator(connectionId: string): OperatorPredicate {
  return jdbcSourceOperator(connectionId, MYSQL_SOURCE_OPERATOR_TYPE);
}

export function workflowContentWithPostgresSource(
  connectionId: string,
  settings: WorkflowSettings
): WorkflowContent {
  return workflowContentWithJdbcSource(connectionId, settings, POSTGRES_SOURCE_OPERATOR_TYPE);
}

export function workflowContentWithJdbcSource(
  connectionId: string,
  settings: WorkflowSettings,
  operatorType: string
): WorkflowContent {
  const operator = jdbcSourceOperator(connectionId, operatorType);
  return {
    operators: [operator],
    operatorPositions: { [operator.operatorID]: { x: 280, y: 180 } },
    links: [],
    commentBoxes: [],
    settings,
  };
}
