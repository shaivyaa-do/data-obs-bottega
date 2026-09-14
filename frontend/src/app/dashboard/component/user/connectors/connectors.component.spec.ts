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
import { firstValueFrom, of } from "rxjs";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { ConnectorsComponent } from "./connectors.component";
import { ConnectorService } from "../../../service/user/connector/connector.service";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { USER_WORKFLOW } from "../../../../app-routing.constant";

describe("ConnectorsComponent", () => {
  let fixture: ComponentFixture<ConnectorsComponent>;
  let router: Router;
  let service: ConnectorService;
  let notification: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    notification = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ConnectorsComponent, RouterTestingModule, NoopAnimationsModule],
      providers: [
        ConnectorService,
        { provide: NotificationService, useValue: notification },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ConnectorsComponent);
    router = TestBed.inject(Router);
    service = TestBed.inject(ConnectorService);
    fixture.detectChanges();
  });

  it("shows My connectors and the seed Active card, not the catalog", () => {
    expect(fixture.nativeElement.textContent).toContain("My connectors");
    expect(fixture.nativeElement.textContent).toContain(
      "Saved sources you can use in workflows and with the agent."
    );
    expect(fixture.nativeElement.textContent).toContain("facilities-prod");
    expect(fixture.nativeElement.textContent).toContain("Published as dataset · energy / hourly_kwh");
    expect(fixture.nativeElement.textContent).toContain("Active");
    expect(fixture.nativeElement.textContent).not.toContain("Choose an app");
    expect(fixture.nativeElement.textContent).not.toContain("Coming soon");
    expect(fixture.nativeElement.textContent).not.toContain("BigQuery");
  });

  it("opens the Choose an app modal from Add connector and keeps coming-soon apps disabled", () => {
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
    const bigQuery = fixture.debugElement
      .queryAll(By.css(".catalog-card"))
      .find(card => card.query(By.css("h4"))?.nativeElement.textContent.trim() === "BigQuery");
    expect(bigQuery?.nativeElement.disabled).toBe(true);
  });

  it("starts the wizard when an Available app is chosen", () => {
    fixture.componentInstance.openAddModal();
    fixture.detectChanges();
    const postgres = fixture.debugElement
      .queryAll(By.css(".catalog-card"))
      .find(card => card.query(By.css("h4"))?.nativeElement.textContent.trim() === "PostgreSQL");
    postgres?.nativeElement.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Connect PostgreSQL");
    expect(fixture.nativeElement.textContent).toContain("Credentials");
  });

  it("shows the empty state after the only Active connector is disconnected", async () => {
    await firstValueFrom(service.disconnectConnector("facilities-prod"));
    fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("No connectors yet");
    expect(fixture.nativeElement.textContent).toContain(
      "Connect a database so you can query it from workflows."
    );
    expect(fixture.nativeElement.textContent).not.toContain("facilities-prod");
  });

  it("keeps Add connector on the far right and has no Inactive filter", () => {
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector("nz-switch")).toBeNull();
    expect(host.textContent).not.toContain("Inactive");
    const header = host.querySelector(".connectors-header") as HTMLElement;
    const add = header.querySelector(".add-connector-btn") as HTMLElement;
    expect(add).not.toBeNull();
    expect(add.textContent).toContain("Add connector");
  });

  it("shows app icons in the Choose an app modal and closes with an X, not Close", () => {
    fixture.componentInstance.openAddModal();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Choose an app");
    expect(fixture.nativeElement.textContent).not.toMatch(/\bClose\b/);
    expect(fixture.debugElement.query(By.css(".modal-close-btn"))).toBeTruthy();
    const icons = fixture.debugElement.queryAll(By.css(".catalog-card .app-icon"));
    expect(icons.length).toBe(8);
  });

  it("sends Use in workflow to Workflows", () => {
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
    fixture.debugElement.query(By.css(".use-in-workflow")).nativeElement.click();
    expect(navigate).toHaveBeenCalledWith([USER_WORKFLOW]);
  });
});

describe("ConnectorsComponent card grid", () => {
  it("lays out connection cards two per row and stretches the header across the page", () => {
    const css = (ConnectorsComponent as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join(" ");
    expect(css).toContain("repeat(2, minmax(0, 1fr))");
    expect(css).toMatch(/\.connectors-header[^{]*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/\.connector-modal[^{]*\{[^}]*width:\s*min\(1080px/);
    expect(css).toMatch(/\.use-in-workflow[^{]*\{[^}]*height:\s*24px/);
    expect(css).toMatch(/\.use-in-workflow[^{]*\{[^}]*width:\s*fit-content/);
  });
});
