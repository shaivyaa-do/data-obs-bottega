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
import { By } from "@angular/platform-browser";
import { convertToParamMap, ActivatedRoute, Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { of } from "rxjs";
import { ConnectorDetailComponent } from "./connector-detail.component";
import { ConnectorService } from "../../../service/user/connector/connector.service";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { USER_WORKFLOW } from "../../../../app-routing.constant";
import { SavedConnector } from "../../../type/connector";

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

describe("ConnectorDetailComponent", () => {
  async function render(connection: SavedConnector = saved()) {
    const navigate = vi.fn().mockResolvedValue(true);
    const notification = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ConnectorDetailComponent, RouterTestingModule, NoopAnimationsModule],
      providers: [
        {
          provide: ConnectorService,
          useValue: {
            getConnector: () => of(connection),
            testConnector: vi.fn(() => of(connection)),
            deleteConnector: vi.fn(() => of(undefined)),
          },
        },
        { provide: NotificationService, useValue: notification },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: connection.id }) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConnectorDetailComponent);
    fixture.detectChanges();
    return { fixture, navigate, notification, component: fixture.componentInstance };
  }

  it("shows name, type, status, last tested, and live-query destination without a password", async () => {
    const { fixture } = await render();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("lab-pg");
    expect(text).toContain("PostgreSQL");
    expect(text).toContain("Active");
    expect(text).toContain("Live query in workflows");
    expect(text).toContain("127.0.0.1");
    expect(text).toContain("analytics");
    expect(text).not.toMatch(/Published as dataset/i);
    expect(text).not.toContain("hourly_kwh");
    expect(text).not.toContain("••••••••");
    expect(text).not.toMatch(/password/i);
    expect(JSON.stringify(fixture.componentInstance.connection)).not.toMatch(/password/i);
  });

  it("puts an arrow-only back control on the far left and icons on the action buttons", async () => {
    const { fixture, navigate } = await render();
    const back = fixture.debugElement.query(By.css(".go-back-button"));
    expect(back).toBeTruthy();
    expect((back.nativeElement.textContent ?? "").trim()).toBe("");
    expect(back.query(By.css("[nztype='arrow-left'], .anticon-arrow-left"))).toBeTruthy();
    back.nativeElement.click();
    expect(navigate).toHaveBeenCalledWith(["/connectors"]);

    const labels = ["Test again", "Delete", "Use in workflow"];
    for (const label of labels) {
      const btn = fixture.debugElement
        .queryAll(By.css("button"))
        .find(el => (el.nativeElement.textContent ?? "").includes(label));
      expect(btn, label).toBeTruthy();
      expect(btn!.query(By.css("i[nz-icon], .anticon")), `${label} icon`).toBeTruthy();
    }
  });

  it("navigates Use in workflow to the workflows list", async () => {
    const { fixture, navigate } = await render();
    fixture.debugElement
      .queryAll(By.css("button"))
      .find(btn => btn.nativeElement.textContent.includes("Use in workflow"))
      ?.nativeElement.click();
    expect(navigate).toHaveBeenCalledWith([USER_WORKFLOW], {
      queryParams: { connection_id: "7", connector_code: "postgres" },
    });
  });
});
