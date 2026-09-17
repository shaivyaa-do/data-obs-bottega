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

import { describe, expect, test } from "bun:test";
import {
  adaptJdbcSourceSchemaForConnection,
  formatValidationErrors,
  formatCompactSchemaForError,
  WorkflowSystemMetadata,
} from "./workflow-system-metadata";

const RAW_POSTGRES_SCHEMA = {
  $id: "PostgreSQLSource",
  type: "object",
  required: ["host", "port", "database", "username", "password", "table"],
  properties: {
    host: { type: "string" },
    port: { type: "integer" },
    database: { type: "string" },
    username: { type: "string" },
    password: { type: "string" },
    table: { type: "string" },
  },
};

const RAW_SNOWFLAKE_SCHEMA = {
  $id: "SnowflakeSource",
  type: "object",
  required: ["account", "warehouse", "database", "schema", "username", "password", "table"],
  properties: {
    account: { type: "string" },
    warehouse: { type: "string" },
    database: { type: "string" },
    schema: { type: "string" },
    username: { type: "string" },
    password: { type: "string" },
    table: { type: "string" },
  },
};

describe("formatValidationErrors", () => {
  test("returns an empty string for a valid result", () => {
    expect(formatValidationErrors({ isValid: true })).toBe("");
  });

  test("joins each message as 'key: msg' with '; '", () => {
    expect(formatValidationErrors({ isValid: false, messages: { a: "x", b: "y" } })).toBe("a: x; b: y");
  });
});

describe("formatCompactSchemaForError", () => {
  test("lists required keys and JSON-stringifies only the present required properties", () => {
    expect(formatCompactSchemaForError({ required: ["a", "b"], properties: { a: { type: "string" } } })).toBe(
      'required: [a, b], properties: {"a":{"type":"string"}}'
    );
  });

  test("renders empty required and properties", () => {
    expect(formatCompactSchemaForError({ required: [], properties: {} })).toBe("required: [], properties: {}");
  });
});

describe("adaptJdbcSourceSchemaForConnection", () => {
  test("requires connectionId+table and drops JDBC credential fields from required", () => {
    const adapted = adaptJdbcSourceSchemaForConnection(RAW_POSTGRES_SCHEMA, "PostgreSQLSource");
    expect(adapted.required).toEqual(["table", "connectionId"]);
    expect(adapted.properties.connectionId.description).toContain("PostgreSQL");
    expect(adapted.$id).toBeUndefined();
  });

  test("uses Snowflake-specific connection description", () => {
    const adapted = adaptJdbcSourceSchemaForConnection(RAW_SNOWFLAKE_SCHEMA, "SnowflakeSource");
    expect(adapted.required).toContain("connectionId");
    expect(adapted.properties.connectionId.description).toContain("Snowflake");
  });
});

describe("WorkflowSystemMetadata JDBC connection validation", () => {
  function storeWithJdbcSchemas(): WorkflowSystemMetadata {
    const store = new WorkflowSystemMetadata();
    store.loadFromMetadata({
      operators: [
        {
          operatorType: "PostgreSQLSource",
          jsonSchema: RAW_POSTGRES_SCHEMA,
          additionalMetadata: { userFriendlyName: "PostgreSQL Source", operatorDescription: "pg" },
          operatorVersion: "1",
        },
        {
          operatorType: "SnowflakeSource",
          jsonSchema: RAW_SNOWFLAKE_SCHEMA,
          additionalMetadata: { userFriendlyName: "Snowflake Source", operatorDescription: "sf" },
          operatorVersion: "1",
        },
      ],
      operatorSchema: [], // unused by loadFromMetadata
    } as any);
    return store;
  }

  test("accepts connectionId+table without host/password for PostgreSQLSource", () => {
    const store = storeWithJdbcSchemas();
    expect(
      store.validateOperatorProperties("PostgreSQLSource", {
        connectionId: "42",
        table: "public.orders",
      })
    ).toEqual({ isValid: true });
  });

  test("accepts connectionId+table for SnowflakeSource", () => {
    const store = storeWithJdbcSchemas();
    expect(
      store.validateOperatorProperties("SnowflakeSource", {
        connectionId: "7",
        table: "ANALYTICS.EVENTS",
      })
    ).toEqual({ isValid: true });
  });

  test("still requires host/password for legacy JDBC properties without connectionId", () => {
    const store = storeWithJdbcSchemas();
    const missingCreds = store.validateOperatorProperties("PostgreSQLSource", { table: "t" });
    expect(missingCreds.isValid).toBe(false);

    expect(
      store.validateOperatorProperties("PostgreSQLSource", {
        host: "localhost",
        port: 5432,
        database: "db",
        username: "u",
        password: "p",
        table: "t",
      })
    ).toEqual({ isValid: true });
  });

  test("getCompactSchema exposes connectionId as required for JDBC sources", () => {
    const store = storeWithJdbcSchemas();
    const compact = store.getCompactSchema("PostgreSQLSource");
    expect(compact?.required).toContain("connectionId");
    expect(compact?.required).toContain("table");
    expect(compact?.required).not.toContain("password");
  });
});
