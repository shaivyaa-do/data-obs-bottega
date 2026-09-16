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

import Ajv from "ajv";
import {
  adaptPostgresSourceSchema,
  hasPostgresConnectionId,
  isLegacyPostgresSource,
  postgresSourceOperator,
  sanitizePostgresSourceProperties,
  workflowContentWithPostgresSource,
} from "./postgres-source-properties";
import { OperatorPredicate } from "../types/workflow-common.interface";
import { OperatorSchema } from "../types/operator-schema.interface";
import { CustomJSONSchema7 } from "../types/custom-json-schema.interface";
import { ExecutionMode } from "../../common/type/workflow";

function postgresOp(properties: Record<string, unknown>): OperatorPredicate {
  return {
    operatorID: "PostgreSQLSource-1",
    operatorType: "PostgreSQLSource",
    operatorVersion: "v",
    operatorProperties: properties,
    inputPorts: [],
    outputPorts: [{ portID: "output-0" }],
    showAdvanced: false,
  };
}

function postgresSchema(
  required: string[],
  extras: { additionalProperties?: boolean; omitConnectionId?: boolean } = {}
): OperatorSchema {
  const properties: { [key: string]: CustomJSONSchema7 } = {
    table: { type: "string" },
    host: { type: "string" },
    port: { type: "string" },
    database: { type: "string" },
    username: { type: "string" },
    password: { type: "string" },
  };
  if (!extras.omitConnectionId) {
    properties["connectionId"] = { type: "string" };
  }
  return {
    operatorType: "PostgreSQLSource",
    operatorVersion: "v",
    additionalMetadata: {
      userFriendlyName: "PostgreSQL Source",
      operatorDescription: "Read data from a PostgreSQL instance",
      operatorGroupName: "Database Connector",
      inputPorts: [],
      outputPorts: [{}],
    },
    jsonSchema: {
      type: "object",
      additionalProperties: extras.additionalProperties,
      properties,
      required,
    },
  };
}

describe("sanitizePostgresSourceProperties", () => {
  it("strips JDBC fields when a connectionId is set so workflow.content does not store a password", () => {
    const sanitized = sanitizePostgresSourceProperties({
      connectionId: "7",
      table: "facilities",
      host: "localhost",
      port: "5432",
      database: "analytics",
      username: "analyst",
      password: "hunter2",
      limit: 10,
    });
    expect(sanitized).toEqual({ connectionId: "7", table: "facilities", limit: 10 });
    expect(sanitized).not.toHaveProperty("password");
    expect(sanitized).not.toHaveProperty("host");
  });

  it("strips Snowflake account fields so workflow.content does not store a password", () => {
    const sanitized = sanitizePostgresSourceProperties({
      connectionId: "11",
      table: "ORDERS",
      account: "xy12345.us-east-1",
      warehouse: "COMPUTE_WH",
      database: "ANALYTICS",
      schema: "PUBLIC",
      role: "SYSADMIN",
      username: "analyst",
      password: "hunter2",
    });
    expect(sanitized).toEqual({ connectionId: "11", table: "ORDERS" });
    expect(sanitized).not.toHaveProperty("password");
    expect(sanitized).not.toHaveProperty("account");
  });

  it("leaves a legacy host/password operator untouched when connectionId is missing", () => {
    const original = { host: "localhost", password: "hunter2", table: "t" };
    expect(sanitizePostgresSourceProperties(original)).toEqual(original);
  });
});

describe("isLegacyPostgresSource", () => {
  it("is true only when host is set and connectionId is not", () => {
    expect(isLegacyPostgresSource({ host: "db", table: "t" })).toBe(true);
    expect(isLegacyPostgresSource({ host: "db", connectionId: "7" })).toBe(false);
    expect(isLegacyPostgresSource({ connectionId: "7" })).toBe(false);
    expect(isLegacyPostgresSource({})).toBe(false);
  });
});

describe("hasPostgresConnectionId", () => {
  it("treats blank connectionId as missing", () => {
    expect(hasPostgresConnectionId({ connectionId: "  " })).toBe(false);
    expect(hasPostgresConnectionId({ connectionId: "7" })).toBe(true);
  });
});

describe("adaptPostgresSourceSchema", () => {
  it("requires connectionId and table, not JDBC fields, for a new PostgreSQL Source", () => {
    const adapted = adaptPostgresSourceSchema(
      postgresOp({}),
      postgresSchema(["host", "port", "database", "table", "username", "password"])
    );
    expect(adapted.jsonSchema.required).toEqual(["table", "connectionId"]);
  });

  it("adds a connectionId property so additionalProperties:false does not reject a saved connection", () => {
    const schema = postgresSchema(["host", "port", "database", "table", "username", "password"], {
      additionalProperties: false,
      omitConnectionId: true,
    });
    const ajv = new Ajv({ allErrors: true, strict: false });
    const saved = { connectionId: "3", table: "buildings" };
    expect(ajv.validate(schema.jsonSchema, saved)).toBe(false);
    const adapted = adaptPostgresSourceSchema(postgresOp(saved), schema);
    expect(adapted.jsonSchema.properties).toHaveProperty("connectionId");
    expect(ajv.validate(adapted.jsonSchema, saved)).toBe(true);
  });

  it("keeps JDBC fields required for a legacy host-only operator", () => {
    const adapted = adaptPostgresSourceSchema(
      postgresOp({ host: "legacy.internal" }),
      postgresSchema(["host", "port", "database", "table", "username", "password"])
    );
    expect(adapted.jsonSchema.required).toEqual(["host", "port", "database", "table", "username", "password"]);
  });

  it("leaves other operator types unchanged", () => {
    const schema: OperatorSchema = {
      ...postgresSchema(["tableName"]),
      operatorType: "CSVFileScan",
    };
    expect(adaptPostgresSourceSchema(postgresOp({}), schema)).toBe(schema);
  });

  it("requires connectionId and table for a new MySQL Source", () => {
    const mysqlOp: OperatorPredicate = { ...postgresOp({}), operatorType: "MySQLSource" };
    const schema: OperatorSchema = {
      ...postgresSchema(["host", "port", "database", "table", "username", "password"], {
        omitConnectionId: true,
      }),
      operatorType: "MySQLSource",
    };
    const adapted = adaptPostgresSourceSchema(mysqlOp, schema);
    expect(adapted.jsonSchema.required).toEqual(["table", "connectionId"]);
    expect(JSON.stringify(adapted.jsonSchema.properties?.["connectionId"])).toContain("MySQL");
  });

  it("requires connectionId and table for a new Snowflake Source", () => {
    const snowflakeOp: OperatorPredicate = { ...postgresOp({}), operatorType: "SnowflakeSource" };
    const schema: OperatorSchema = {
      ...postgresSchema(["host", "port", "database", "table", "username", "password", "account", "warehouse"], {
        omitConnectionId: true,
      }),
      operatorType: "SnowflakeSource",
    };
    const adapted = adaptPostgresSourceSchema(snowflakeOp, schema);
    expect(adapted.jsonSchema.required).toEqual(["table", "connectionId"]);
    expect(JSON.stringify(adapted.jsonSchema.properties?.["connectionId"])).toContain("Snowflake");
  });
});

describe("postgresSourceOperator", () => {
  it("builds a PostgreSQL Source that stores only connectionId", () => {
    const op = postgresSourceOperator("7");
    expect(op.operatorType).toBe("PostgreSQLSource");
    expect(op.operatorProperties).toEqual({ connectionId: "7" });
    expect(op.operatorProperties).not.toHaveProperty("password");
    expect(op.inputPorts).toEqual([]);
    expect(op.outputPorts[0].portID).toBe("output-0");
  });
});

describe("workflowContentWithPostgresSource", () => {
  it("places the pre-filled source on a new workflow without JDBC secrets", () => {
    const settings = { dataTransferBatchSize: 10, executionMode: ExecutionMode.PIPELINED };
    const content = workflowContentWithPostgresSource("7", settings);
    expect(content.operators).toHaveLength(1);
    expect(content.operators[0].operatorProperties).toEqual({ connectionId: "7" });
    expect(content.operatorPositions[content.operators[0].operatorID]).toEqual({ x: 280, y: 180 });
    expect(content.settings).toBe(settings);
  });
});
