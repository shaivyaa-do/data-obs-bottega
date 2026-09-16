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

import { TestBed } from "@angular/core/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { of, throwError } from "rxjs";
import { ConnectorWizardComponent } from "./connector-wizard.component";
import { ConnectorService, ConnectorTestError } from "../../../service/user/connector/connector.service";
import { mergeConnectorApps } from "../../../service/user/connector/mock-connectors";
import { ConnectorType, SavedConnector } from "../../../type/connector";

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

const postgres = mergeConnectorApps([POSTGRES_TYPE]).find(app => app.id === "postgresql")!;

const SECRET = "hunter2";

function saved(over: Partial<SavedConnector> = {}): SavedConnector {
  return {
    id: "7",
    name: "lab-pg",
    status: "active",
    connectorCode: "postgres",
    connectorDisplayName: "PostgreSQL",
    config: { host: "db.lab.internal", port: 5432, database: "analytics", username: "analyst", schema: "public" },
    lastTestedAt: "2026-09-16T10:00:00.000Z",
    lastError: null,
    ...over,
  };
}

describe("ConnectorWizardComponent postgres flow", () => {
  let createAndTest: ReturnType<typeof vi.fn>;
  let listConnectorTypes: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createAndTest = vi.fn();
    listConnectorTypes = vi.fn().mockReturnValue(of([POSTGRES_TYPE]));
    await TestBed.configureTestingModule({
      imports: [ConnectorWizardComponent, NoopAnimationsModule],
      providers: [
        {
          provide: ConnectorService,
          useValue: {
            createAndTest,
            listConnectorTypes,
            updateConnector: vi.fn(),
            testConnector: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  function fillCredentials(component: ConnectorWizardComponent): void {
    component.displayName = "lab-pg";
    component.values = {
      host: "db.lab.internal",
      port: "5432",
      database: "analytics",
      username: "analyst",
      password: SECRET,
      schema: "public",
    };
  }

  it("opens on GET /connectors/types fields, not the mock App step", () => {
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    fixture.componentRef.setInput("app", postgres);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const text = fixture.nativeElement.textContent as string;
    expect(listConnectorTypes).toHaveBeenCalled();
    expect(text).toContain("Display name");
    expect(text).toContain("Host");
    expect(text).toContain("Port");
    expect(text).toContain("Database");
    expect(text).toContain("Username");
    expect(text).toContain("Password");
    expect(text).toContain("Schema (optional)");
    expect(text).not.toContain("SSL");
    expect(text).not.toContain("Environment");
    expect(text).not.toContain("Description (optional)");
    expect(text).not.toMatch(/Destination/);
    expect(text).not.toContain("Query a Postgres warehouse or operational database.");
    expect(component.step).toBe(0);
    expect(component.values["port"]).toBe("5432");
    expect(component.values["schema"]).toBe("public");
    const closeBtn = fixture.nativeElement.querySelector(".modal-close-btn") as HTMLButtonElement;
    const changeApp = fixture.nativeElement.querySelector(".change-app-link") as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    expect(changeApp).not.toBeNull();
    expect(changeApp.textContent).toContain("Change app");
  });

  it("builds the form from GET /connectors/types when the catalog app has no fieldsSchema", () => {
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    const { fieldsSchema: _dropped, ...withoutSchema } = postgres;
    fixture.componentRef.setInput("app", withoutSchema);
    fixture.detectChanges();
    expect(listConnectorTypes).toHaveBeenCalled();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("Host");
    expect(text).toContain("Password");
    expect(fixture.componentInstance.credentialFields.map(field => field.name)).toEqual([
      "host",
      "port",
      "database",
      "username",
      "password",
      "schema",
    ]);
  });

  it("shows an error when GET /connectors/types has no matching schema", () => {
    listConnectorTypes.mockReturnValue(of([]));
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    fixture.componentRef.setInput("app", postgres);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Could not load connection fields for PostgreSQL.");
    expect(fixture.nativeElement.textContent).not.toContain("Host");
    expect(fixture.componentInstance.canAdvanceFromCredentials).toBe(false);
  });

  it("POSTs create then test on Test & save and emits without the password", () => {
    createAndTest.mockReturnValue(of(saved()));
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput("app", postgres);
    fixture.detectChanges();
    fillCredentials(component);
    component.step = 1;
    fixture.detectChanges();

    const emitted: SavedConnector[] = [];
    component.saved.subscribe(value => emitted.push(value));
    component.save();

    expect(createAndTest).toHaveBeenCalledWith({
      name: "lab-pg",
      connectorCode: "postgres",
      host: "db.lab.internal",
      port: "5432",
      database: "analytics",
      username: "analyst",
      schema: "public",
      password: SECRET,
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0].status).toBe("active");
    expect(JSON.stringify(emitted[0])).not.toContain(SECRET);
    expect(component.values["password"]).toBe("");
  });

  it("stays on Test & save with last_error when JDBC test fails and does not emit Active", () => {
    const failure = new ConnectorTestError("Could not connect to PostgreSQL: FATAL: database does not exist", {
      ...saved(),
      status: "error",
      lastError: "Could not connect to PostgreSQL: FATAL: database does not exist",
      lastTestedAt: null,
    });
    createAndTest.mockReturnValue(throwError(() => failure));
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput("app", postgres);
    fixture.detectChanges();
    fillCredentials(component);
    component.step = 1;
    const emitted: SavedConnector[] = [];
    component.saved.subscribe(value => emitted.push(value));
    component.testConnection();
    fixture.detectChanges();

    expect(component.step).toBe(1);
    expect(component.testState).toBe("fail");
    expect(component.testOk).toBe(false);
    expect(component.testMessage).toMatch(/Could not connect to PostgreSQL/);
    expect(emitted).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain("Could not connect to PostgreSQL");
  });

  it("emits backToPicker from the first step", () => {
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput("app", postgres);
    fixture.detectChanges();
    const back = vi.fn();
    component.backToPicker.subscribe(back);
    component.back();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("closes with an X control instead of a Close label", () => {
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    fixture.componentRef.setInput("app", postgres);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toMatch(/\bClose\b/);
    const closeBtn = fixture.nativeElement.querySelector(".modal-close-btn") as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
  });
});

describe("ConnectorWizardComponent mysql flow", () => {
  it("defaults port to 3306 from GET /connectors/types fields_schema", async () => {
    const mysqlType: ConnectorType = {
      id: 2,
      code: "mysql",
      displayName: "MySQL",
      fieldsSchema: {
        fields: [
          { name: "host", label: "Host", type: "string", required: true },
          { name: "port", label: "Port", type: "string", required: true, default: "3306" },
          { name: "database", label: "Database", type: "string", required: true },
          { name: "username", label: "Username", type: "string", required: true },
          { name: "password", label: "Password", type: "password", required: true, secret: true },
          { name: "schema", label: "Schema", type: "string", required: false },
        ],
      },
    };
    const mysql = mergeConnectorApps([mysqlType]).find(app => app.id === "mysql")!;
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ConnectorWizardComponent, NoopAnimationsModule],
      providers: [
        {
          provide: ConnectorService,
          useValue: {
            createAndTest: vi.fn(),
            listConnectorTypes: vi.fn().mockReturnValue(of([mysqlType])),
            updateConnector: vi.fn(),
            testConnector: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    fixture.componentRef.setInput("app", mysql);
    fixture.detectChanges();
    expect(fixture.componentInstance.values["port"]).toBe("3306");
    expect(fixture.nativeElement.textContent).toContain("Connect MySQL");
    expect(fixture.nativeElement.textContent).not.toMatch(/Destination/);
  });
});
