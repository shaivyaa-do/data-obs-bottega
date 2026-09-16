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

import { HttpClientTestingModule, HttpTestingController } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { firstValueFrom } from "rxjs";
import { AppSettings } from "../../../../common/app-setting";
import {
  ConnectorType,
  CreateConnectorRequest,
  destinationSummary,
  mapSavedConnector,
  SavedConnectorResponse,
} from "../../../type/connector";
import { CONNECTOR_APPS, mergeConnectorApps } from "./mock-connectors";
import { CONNECTORS_BASE_URL, ConnectorService, ConnectorTestError } from "./connector.service";

const API = `${AppSettings.getApiEndpoint()}/${CONNECTORS_BASE_URL}`;
const SECRET = "super-secret-password";

const POSTGRES_TYPE: ConnectorType = {
  id: 1,
  code: "postgres",
  displayName: "PostgreSQL",
  fieldsSchema: {
    fields: [
      { name: "host", label: "Host", type: "string", required: true },
      { name: "port", label: "Port", type: "string", required: true, default: "5432" },
      { name: "database", label: "Database", type: "string", required: true },
      { name: "username", label: "Username", type: "string", required: true },
      { name: "password", label: "Password", type: "password", required: true, secret: true },
      { name: "schema", label: "Schema", type: "string", required: false, default: "public" },
    ],
  },
};

function apiRow(over: Partial<SavedConnectorResponse> = {}): SavedConnectorResponse {
  return {
    id: 7,
    name: "lab-pg",
    status: "active",
    connectorCode: "postgres",
    connectorDisplayName: "PostgreSQL",
    config: {
      host: "127.0.0.1",
      port: 5432,
      database: "analytics",
      username: "analyst",
      schema: "public",
    },
    lastTestedAt: "2026-09-16T10:00:00Z",
    lastError: null,
    ...over,
  };
}

function createBody(over: Partial<CreateConnectorRequest> = {}): CreateConnectorRequest {
  return {
    name: "lab-pg",
    connectorCode: "postgres",
    host: "127.0.0.1",
    port: 5432,
    database: "analytics",
    username: "analyst",
    schema: "public",
    password: SECRET,
    ...over,
  };
}

describe("ConnectorService", () => {
  let service: ConnectorService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ConnectorService],
    });
    service = TestBed.inject(ConnectorService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it("lists connectors from GET /api/connectors without a seed card or password", async () => {
    const listed = firstValueFrom(service.listConnectors());
    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe("GET");
    req.flush([]);
    expect(await listed).toEqual([]);

    const withRow = firstValueFrom(service.listConnectors());
    httpMock.expectOne(API).flush([
      apiRow(),
      apiRow({
        id: 8,
        name: "broken",
        status: "error",
        lastError: "Could not connect to PostgreSQL: boom",
        lastTestedAt: null,
        config: { host: "db.example", port: 5432, database: "x", username: "u", password: SECRET },
      }),
    ]);
    const connectors = await withRow;
    expect(connectors.map(connector => connector.name)).toEqual(["lab-pg", "broken"]);
    expect(connectors[0].id).toBe("7");
    expect(connectors[0].connectorDisplayName).toBe("PostgreSQL");
    expect(connectors[0].status).toBe("active");
    expect(connectors[1].status).toBe("error");
    expect(connectors[1].lastError).toMatch(/boom/);
    expect(JSON.stringify(connectors)).not.toContain(SECRET);
    expect(JSON.stringify(connectors[1].config)).not.toMatch(/password/i);
    expect(destinationSummary(connectors[0])).toBe("Live query in workflows");
    expect(destinationSummary(connectors[0])).not.toMatch(/Published as dataset/i);
  });

  it("loads types from GET /api/connectors/types", async () => {
    const pending = firstValueFrom(service.listConnectorTypes());
    const req = httpMock.expectOne(`${API}/types`);
    expect(req.request.method).toBe("GET");
    req.flush([POSTGRES_TYPE]);
    expect(await pending).toEqual([POSTGRES_TYPE]);
  });

  it("creates with password in the body and never echoes it", async () => {
    const pending = firstValueFrom(service.createConnector(createBody()));
    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(createBody());
    expect(req.request.body.password).toBe(SECRET);
    req.flush(apiRow({ lastTestedAt: null, lastError: null }));
    const created = await pending;
    expect(created.id).toBe("7");
    expect(created.name).toBe("lab-pg");
    expect(JSON.stringify(created)).not.toContain(SECRET);
    expect(created.config["password"]).toBeUndefined();
  });

  it("POSTs create then test and returns the tested connector", async () => {
    const pending = firstValueFrom(service.createAndTest(createBody()));
    const createReq = httpMock.expectOne(API);
    expect(createReq.request.method).toBe("POST");
    createReq.flush(apiRow({ status: "active", lastTestedAt: null }));
    const testReq = httpMock.expectOne(`${API}/7/test`);
    expect(testReq.request.method).toBe("POST");
    testReq.flush(apiRow({ status: "active", lastTestedAt: "2026-09-16T10:01:00Z" }));
    const saved = await pending;
    expect(saved.status).toBe("active");
    expect(saved.lastTestedAt).toBe("2026-09-16T10:01:00Z");
    expect(JSON.stringify(saved)).not.toContain(SECRET);
  });

  it("stays failed when POST test returns last_error and does not emit Active", async () => {
    const pending = firstValueFrom(service.createAndTest(createBody()));
    httpMock.expectOne(API).flush(apiRow({ status: "active", lastTestedAt: null }));
    httpMock
      .expectOne(`${API}/7/test`)
      .flush(
        { code: 400, message: "Could not connect to PostgreSQL: FATAL: database does not exist" },
        { status: 400, statusText: "Bad Request" }
      );
    try {
      await pending;
      throw new Error("expected createAndTest to fail");
    } catch (err) {
      expect(err).toBeInstanceOf(ConnectorTestError);
      const failure = err as ConnectorTestError;
      expect(failure.message).toMatch(/Could not connect to PostgreSQL/);
      expect(failure.connector.id).toBe("7");
      expect(failure.connector.status).toBe("error");
    }
  });

  it("tests an existing connector by id", async () => {
    const pending = firstValueFrom(service.testConnector("7"));
    const req = httpMock.expectOne(`${API}/7/test`);
    expect(req.request.method).toBe("POST");
    req.flush(apiRow({ status: "error", lastError: "timeout" }));
    const result = await pending;
    expect(result.status).toBe("error");
    expect(result.lastError).toBe("timeout");
  });

  it("removes the connector via DELETE /api/connectors/{id}", async () => {
    const pending = firstValueFrom(service.deleteConnector("7"));
    const req = httpMock.expectOne(`${API}/7`);
    expect(req.request.method).toBe("DELETE");
    req.flush(null);
    await pending;
  });

  it("lists table names from GET /api/connectors/{id}/tables", async () => {
    const pending = firstValueFrom(service.listTables("7"));
    const req = httpMock.expectOne(`${API}/7/tables`);
    expect(req.request.method).toBe("GET");
    req.flush(["buildings", "hourly_kwh"]);
    expect(await pending).toEqual(["buildings", "hourly_kwh"]);
  });

  it("returns an empty list when GET /tables is not a string array", async () => {
    const pending = firstValueFrom(service.listTables("7"));
    httpMock.expectOne(`${API}/7/tables`).flush({ tables: ["buildings"] });
    expect(await pending).toEqual([]);
  });

  it("finds a connector from the list by id", async () => {
    const pending = firstValueFrom(service.getConnector("7"));
    httpMock.expectOne(API).flush([apiRow()]);
    expect((await pending).name).toBe("lab-pg");
  });
});

describe("connector catalog", () => {
  it("keeps the marketing grid but only enables types returned by the API", () => {
    expect(CONNECTOR_APPS.map(app => app.id)).toEqual([
      "postgresql",
      "mysql",
      "snowflake",
      "databricks",
      "s3",
      "bigquery",
      "redshift",
      "salesforce",
    ]);
    expect(CONNECTOR_APPS.every(app => app.available === false)).toBe(true);
    expect(CONNECTOR_APPS.map(app => app.id).join(" ")).not.toMatch(/airbyte|fivetran/i);

    const merged = mergeConnectorApps([POSTGRES_TYPE, { ...POSTGRES_TYPE, id: 2, code: "mysql", displayName: "MySQL" }]);
    expect(merged.filter(app => app.available).map(app => app.id)).toEqual(["postgresql", "mysql"]);
    expect(merged.find(app => app.id === "postgresql")?.fieldsSchema?.fields.map(field => field.name)).toEqual([
      "host",
      "port",
      "database",
      "username",
      "password",
      "schema",
    ]);
    expect(merged.filter(app => !app.available).map(app => app.id)).toEqual([
      "snowflake",
      "databricks",
      "s3",
      "bigquery",
      "redshift",
      "salesforce",
    ]);
  });

  it("enables Snowflake from GET /types without hardcoding Available", () => {
    const snowflakeType: ConnectorType = {
      id: 3,
      code: "snowflake",
      displayName: "Snowflake",
      fieldsSchema: {
        fields: [
          { name: "account", label: "Account", type: "string", required: true },
          { name: "warehouse", label: "Warehouse", type: "string", required: true },
          { name: "database", label: "Database", type: "string", required: true },
          { name: "schema", label: "Schema", type: "string", required: false, default: "PUBLIC" },
          { name: "role", label: "Role", type: "string", required: false },
          { name: "username", label: "Username", type: "string", required: true },
          { name: "password", label: "Password", type: "password", required: true, secret: true },
        ],
      },
    };
    const merged = mergeConnectorApps([POSTGRES_TYPE, snowflakeType]);
    expect(merged.find(app => app.id === "snowflake")?.available).toBe(true);
    expect(merged.find(app => app.id === "mysql")?.available).toBe(false);
    expect(merged.find(app => app.id === "snowflake")?.fieldsSchema?.fields.map(field => field.name)).toEqual([
      "account",
      "warehouse",
      "database",
      "schema",
      "role",
      "username",
      "password",
    ]);
  });

  it("enables Snowflake from GET /types without hardcoding Available", () => {
    const snowflakeType: ConnectorType = {
      id: 3,
      code: "snowflake",
      displayName: "Snowflake",
      fieldsSchema: {
        fields: [
          { name: "account", label: "Account", type: "string", required: true },
          { name: "warehouse", label: "Warehouse", type: "string", required: true },
          { name: "database", label: "Database", type: "string", required: true },
          { name: "schema", label: "Schema", type: "string", required: false, default: "PUBLIC" },
          { name: "role", label: "Role", type: "string", required: false },
          { name: "username", label: "Username", type: "string", required: true },
          { name: "password", label: "Password", type: "password", required: true, secret: true },
        ],
      },
    };
    const merged = mergeConnectorApps([POSTGRES_TYPE, snowflakeType]);
    expect(merged.find(app => app.id === "snowflake")?.available).toBe(true);
    expect(merged.find(app => app.id === "mysql")?.available).toBe(false);
    expect(merged.find(app => app.id === "snowflake")?.fieldsSchema?.fields.map(field => field.name)).toEqual([
      "account",
      "warehouse",
      "database",
      "schema",
      "role",
      "username",
      "password",
    ]);
  });

  it("strips secrets when mapping an API connector", () => {
    const mapped = mapSavedConnector(
      apiRow({
        config: { host: "h", password: SECRET, secret_enc: "abc" },
      })
    );
    expect(mapped.config).toEqual({ host: "h" });
    expect(JSON.stringify(mapped)).not.toContain(SECRET);
  });
});
