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

import { fakeAsync, TestBed, tick } from "@angular/core/testing";
import { firstValueFrom } from "rxjs";
import { ConnectorService, MOCK_TEST_CONNECTION_MS } from "./connector.service";
import { CONNECTOR_APPS } from "./mock-connectors";
import { CreateConnectorRequest, destinationSummary, PostgresMysqlConfig } from "../../../type/connector";

function postgresConfig(host = "db.example.com"): PostgresMysqlConfig {
  return {
    host,
    port: 5432,
    database: "analytics",
    username: "analyst",
    ssl: true,
    schema: "public",
  };
}

function createBody(over: Partial<CreateConnectorRequest> = {}): CreateConnectorRequest {
  return {
    name: "lab-warehouse",
    environment: "prod",
    appId: "postgresql",
    config: postgresConfig(),
    destination: { mode: "live" },
    ...over,
  };
}

describe("ConnectorService", () => {
  let service: ConnectorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ConnectorService],
    });
    service = TestBed.inject(ConnectorService);
  });

  it("seeds an Active Postgres named facilities-prod with hourly_kwh and buildings", async () => {
    const connectors = await firstValueFrom(service.listConnectors());
    expect(connectors).toHaveLength(1);
    expect(connectors[0].id).toBe("facilities-prod");
    expect(connectors[0].appId).toBe("postgresql");
    expect(connectors[0].status).toBe("active");
    expect(connectors[0].tables.map(table => table.name)).toEqual(["hourly_kwh", "buildings"]);
    expect(destinationSummary(connectors[0])).toBe("Published as dataset · energy / hourly_kwh");
    expect(connectors[0].hasSecret).toBe(true);
    expect(JSON.stringify(connectors[0])).not.toMatch(/\$POSTGRES_PASSWORD|"password"\s*:/);
  });

  it("fails a test when host is empty or the display name is fail", fakeAsync(() => {
    let emptyHost: { ok: boolean } | undefined;
    service.testConnector({ name: "ok", appId: "postgresql", config: postgresConfig("  ") }).subscribe(result => {
      emptyHost = result;
    });
    tick(MOCK_TEST_CONNECTION_MS - 1);
    expect(emptyHost).toBeUndefined();
    tick(1);
    expect(emptyHost?.ok).toBe(false);

    let failName: { ok: boolean; message: string } | undefined;
    service.testConnector({ name: "fail", appId: "postgresql", config: postgresConfig() }).subscribe(result => {
      failName = result;
    });
    tick(MOCK_TEST_CONNECTION_MS);
    expect(failName?.ok).toBe(false);
    expect(failName?.message).toMatch(/failed/i);
  }));

  it("succeeds after the mock delay and returns discovered schemas and tables", fakeAsync(() => {
    let result: { ok: boolean; tables: { name: string }[]; schemas: string[] } | undefined;
    service.testConnector({ name: "lab", appId: "postgresql", config: postgresConfig() }).subscribe(value => {
      result = value;
    });
    tick(MOCK_TEST_CONNECTION_MS - 1);
    expect(result).toBeUndefined();
    tick(1);
    expect(result?.ok).toBe(true);
    expect(result?.schemas).toContain("public");
    expect(result?.tables.map(table => table.name)).toContain("hourly_kwh");
  }));

  it("saves a connector without echoing the secret", async () => {
    const created = await firstValueFrom(
      service.createConnector(
        createBody({
          secret: "$POSTGRES_PASSWORD",
          enabledTables: ["hourly_kwh"],
        })
      )
    );
    expect(created.id).toBe("lab-warehouse");
    expect(created.status).toBe("active");
    expect(created.hasSecret).toBe(true);
    expect(JSON.stringify(created)).not.toContain("$POSTGRES_PASSWORD");
    expect(created.tables.find(table => table.name === "hourly_kwh")?.enabled).toBe(true);
  });

  it("rejects coming-soon apps", async () => {
    await expect(
      firstValueFrom(
        service.createConnector(
          createBody({
            name: "sales",
            appId: "salesforce",
          })
        )
      )
    ).rejects.toThrow(/salesforce/i);
  });

  it("marks a connector inactive on disconnect instead of deleting it", async () => {
    const updated = await firstValueFrom(service.disconnectConnector("facilities-prod"));
    expect(updated.status).toBe("inactive");
    const listed = await firstValueFrom(service.listConnectors());
    expect(listed.map(connector => connector.id)).toContain("facilities-prod");
  });

  it("keeps the last five test and ingest logs", fakeAsync(() => {
    service
      .testConnector({
        name: "facilities-prod",
        appId: "postgresql",
        config: postgresConfig("db.facilities.internal"),
        connectorId: "facilities-prod",
      })
      .subscribe();
    tick(MOCK_TEST_CONNECTION_MS);
    let logs: { kind: string }[] | undefined;
    service.getConnector("facilities-prod").subscribe(connector => {
      logs = connector.logs;
    });
    expect(logs?.length).toBeLessThanOrEqual(5);
    expect(logs?.[0].kind).toBe("test");
  }));

  it("records a publish ingest log", async () => {
    const updated = await firstValueFrom(service.publishConnector("facilities-prod"));
    expect(updated.logs[0].kind).toBe("ingest");
  });
});

describe("connector catalog", () => {
  it("lists Available JDBC apps and Coming soon apps without Airbyte", () => {
    expect(CONNECTOR_APPS.filter(app => app.available).map(app => app.id)).toEqual([
      "postgresql",
      "mysql",
      "snowflake",
      "databricks",
      "s3",
    ]);
    expect(CONNECTOR_APPS.filter(app => !app.available).map(app => app.id)).toEqual([
      "bigquery",
      "redshift",
      "salesforce",
    ]);
    expect(CONNECTOR_APPS.map(app => app.id).join(" ")).not.toMatch(/airbyte|fivetran/i);
    expect(CONNECTOR_APPS.every(app => Boolean(app.icon))).toBe(true);
  });
});
