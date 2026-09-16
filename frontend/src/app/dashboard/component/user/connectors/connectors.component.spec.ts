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

import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { convertToParamMap, ActivatedRoute, Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { BehaviorSubject, of } from "rxjs";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { NzDropdownMenuComponent } from "ng-zorro-antd/dropdown";
import { ConnectorsComponent } from "./connectors.component";
import { ConnectorService } from "../../../service/user/connector/connector.service";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { USER_WORKFLOW } from "../../../../app-routing.constant";
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

const MYSQL_TYPE: ConnectorType = {
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

function saved(over: Partial<SavedConnector> = {}): SavedConnector {
  return {
    id: "7",
    name: "lab-pg",
    status: "active",
    connectorCode: "postgres",
    connectorDisplayName: "PostgreSQL",
    config: { host: "127.0.0.1", port: 5432, database: "analytics", username: "analyst", schema: "public" },
    lastTestedAt: "2026-09-16T10:00:00.000Z",
    lastError: null,
    ...over,
  };
}

describe("ConnectorsComponent", () => {
  let fixture: ComponentFixture<ConnectorsComponent>;
  let router: Router;
  let connectors$: BehaviorSubject<SavedConnector[]>;
  let notification: {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };

  async function render(initial: SavedConnector[] = [], types: ConnectorType[] = [POSTGRES_TYPE]): Promise<void> {
    connectors$ = new BehaviorSubject(initial);
    notification = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ConnectorsComponent, RouterTestingModule, NoopAnimationsModule],
      providers: [
        {
          provide: ConnectorService,
          useValue: {
            listConnectors: () => connectors$.asObservable(),
            listConnectorTypes: () => of(types),
            testConnector: vi.fn(() => of(saved())),
            deleteConnector: vi.fn(() => of(undefined)),
          },
        },
        { provide: NotificationService, useValue: notification },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ConnectorsComponent);
    router = TestBed.inject(Router);
    fixture.detectChanges();
  }

  it("shows the empty state when GET /connectors returns nothing", async () => {
    await render([]);
    expect(fixture.nativeElement.textContent).toContain("My connectors");
    expect(fixture.nativeElement.textContent).toContain("Saved sources you can use in workflows and with the agent.");
    expect(fixture.nativeElement.textContent).toContain("No connectors yet");
    expect(fixture.nativeElement.textContent).toContain("Connect a database so you can query it from workflows.");
    expect(fixture.nativeElement.textContent).not.toContain("facilities-prod");
    expect(fixture.nativeElement.textContent).not.toContain("Choose an app");
    expect(fixture.nativeElement.textContent).not.toContain("Coming soon");
    expect(fixture.nativeElement.textContent).not.toContain("BigQuery");
  });

  it("renders cards from GET including Error and Disabled, without a dataset line", async () => {
    await render([
      saved(),
      saved({ id: "8", name: "bad-pg", status: "error", lastError: "boom", lastTestedAt: null }),
      saved({ id: "9", name: "old-pg", status: "disabled" }),
    ]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("lab-pg");
    expect(text).toContain("bad-pg");
    expect(text).toContain("old-pg");
    expect(text).toContain("PostgreSQL");
    expect(text).toContain("Active");
    expect(text).toContain("Error");
    expect(text).toContain("Disabled");
    expect(text).toContain("Live query in workflows");
    expect(text).not.toMatch(/Published as dataset/i);
    expect(text).not.toContain("facilities-prod");
    expect(text).not.toContain("hourly_kwh");
    expect(JSON.stringify(fixture.componentInstance.connectors)).not.toMatch(/password/i);
  });

  it("opens the Choose an app modal from Add connector and keeps unseeded apps disabled", async () => {
    await render([]);
    fixture.debugElement.queryAll(By.css(".add-connector-btn"))[0]?.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Choose an app");
    const names = fixture.debugElement
      .queryAll(By.css(".catalog-card h4"))
      .map(el => el.nativeElement.textContent.trim());
    expect(names).toEqual([
      "PostgreSQL",
      "MySQL",
      "Snowflake",
      "Databricks",
      "Amazon S3",
      "BigQuery",
      "Redshift",
      "Salesforce",
    ]);
    const cards = fixture.debugElement.queryAll(By.css(".catalog-card"));
    const postgres = cards.find(card => card.query(By.css("h4"))?.nativeElement.textContent.trim() === "PostgreSQL");
    const mysql = cards.find(card => card.query(By.css("h4"))?.nativeElement.textContent.trim() === "MySQL");
    const snowflake = cards.find(card => card.query(By.css("h4"))?.nativeElement.textContent.trim() === "Snowflake");
    expect(postgres?.nativeElement.disabled).toBe(false);
    expect(mysql?.nativeElement.disabled).toBe(true);
    expect(snowflake?.nativeElement.disabled).toBe(true);
    expect(postgres?.nativeElement.textContent).toContain("Available");
    expect(mysql?.nativeElement.textContent).toContain("Coming soon");
  });

  it("marks MySQL Available when GET /types includes mysql", async () => {
    await render([], [POSTGRES_TYPE, MYSQL_TYPE]);
    fixture.componentInstance.openAddModal();
    fixture.detectChanges();
    const cards = fixture.debugElement.queryAll(By.css(".catalog-card"));
    const mysql = cards.find(card => card.query(By.css("h4"))?.nativeElement.textContent.trim() === "MySQL");
    expect(mysql?.nativeElement.disabled).toBe(false);
    expect(mysql?.nativeElement.textContent).toContain("Available");
    mysql?.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Connect MySQL");
    expect(fixture.nativeElement.textContent).toContain("Host");
    expect(fixture.nativeElement.textContent).toContain("Password");
  });

  it("starts the wizard only for a seeded Available app", async () => {
    await render([]);
    fixture.componentInstance.openAddModal();
    fixture.detectChanges();
    const cards = fixture.debugElement.queryAll(By.css(".catalog-card"));
    const mysql = cards.find(card => card.query(By.css("h4"))?.nativeElement.textContent.trim() === "MySQL");
    mysql?.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Choose an app");
    expect(fixture.nativeElement.textContent).not.toContain("Connect MySQL");

    const postgres = cards.find(card => card.query(By.css("h4"))?.nativeElement.textContent.trim() === "PostgreSQL");
    postgres?.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Connect PostgreSQL");
    expect(fixture.nativeElement.textContent).toContain("Display name");
    expect(fixture.nativeElement.textContent).toContain("Host");
    expect(fixture.nativeElement.textContent).toContain("Password");
    expect(fixture.nativeElement.textContent).not.toContain("Query a Postgres warehouse or operational database.");
  });

  it("keeps Add connector on the far right and has no Inactive filter", async () => {
    await render([saved()]);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector("nz-switch")).toBeNull();
    expect(host.textContent).not.toContain("Inactive");
    const header = host.querySelector(".connectors-header") as HTMLElement;
    const add = header.querySelector(".add-connector-btn") as HTMLElement;
    expect(add).not.toBeNull();
    expect(add.textContent).toContain("Add connector");
  });

  it("shows app icons in the Choose an app modal and closes with an X, not Close", async () => {
    await render([]);
    fixture.componentInstance.openAddModal();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Choose an app");
    expect(fixture.nativeElement.textContent).not.toMatch(/\bClose\b/);
    expect(fixture.debugElement.query(By.css(".modal-close-btn"))).toBeTruthy();
    const icons = fixture.debugElement.queryAll(By.css(".catalog-card .app-icon"));
    expect(icons.length).toBe(8);
  });

  it("sends Use in workflow to Workflows without pretending it published a dataset", async () => {
    await render([saved()]);
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
    fixture.debugElement.query(By.css(".use-in-workflow")).nativeElement.click();
    expect(navigate).toHaveBeenCalledWith([USER_WORKFLOW], {
      queryParams: { connection_id: "7", connector_code: "postgres" },
    });
    expect(notification.info).not.toHaveBeenCalled();
  });

  it("deletes a connector from the card menu and drops the card", async () => {
    await render([saved(), saved({ id: "1", name: "curl-lab-pg", status: "disabled" })]);
    const menu = fixture.debugElement.query(By.css("nz-dropdown-menu"))
      .componentInstance as NzDropdownMenuComponent;
    menu.viewContainerRef.createEmbeddedView(menu.templateRef);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Delete");
    expect(fixture.nativeElement.textContent).not.toContain("Disconnect");
    const service = TestBed.inject(ConnectorService);
    fixture.componentInstance.removeConnector(saved({ id: "1", name: "curl-lab-pg" }));
    expect(service.deleteConnector).toHaveBeenCalledWith("1");
    connectors$.next([saved()]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain("curl-lab-pg");
    expect(fixture.nativeElement.textContent).toContain("lab-pg");
  });
});

describe("ConnectorsComponent card grid", () => {
  it("lays out connection cards two per row and stretches the header across the page", () => {
    const css = (ConnectorsComponent as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join(" ");
    expect(css).toContain("repeat(2, minmax(0, 1fr))");
    expect(css).toMatch(/\.connectors-header[^{]*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/\.connector-modal[^{]*\{[^}]*width:\s*min\(1080px/);
    expect(css).toMatch(/\.connector-modal-wizard[^{]*\{[^}]*width:\s*min\(560px/);
    expect(css).toMatch(/\.use-in-workflow[^{]*\{[^}]*height:\s*24px/);
    expect(css).toMatch(/\.use-in-workflow[^{]*\{[^}]*width:\s*fit-content/);
  });
});
