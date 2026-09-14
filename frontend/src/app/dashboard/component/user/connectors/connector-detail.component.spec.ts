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
import { ConnectorDetailComponent } from "./connector-detail.component";
import { ConnectorService } from "../../../service/user/connector/connector.service";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { USER_WORKFLOW } from "../../../../app-routing.constant";

describe("ConnectorDetailComponent", () => {
  async function render(id = "facilities-prod") {
    const navigate = vi.fn().mockResolvedValue(true);
    await TestBed.configureTestingModule({
      imports: [ConnectorDetailComponent, RouterTestingModule, NoopAnimationsModule],
      providers: [
        ConnectorService,
        { provide: NotificationService, useValue: { success: vi.fn(), error: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id }) } },
        },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ConnectorDetailComponent);
    fixture.detectChanges();
    return { fixture, navigate, component: fixture.componentInstance };
  }

  it("shows read-only creds, destination, enabled tables, and logs", async () => {
    const { fixture } = await render();
    expect(fixture.nativeElement.textContent).toContain("facilities-prod");
    expect(fixture.nativeElement.textContent).toContain("Published as dataset · energy / hourly_kwh");
    expect(fixture.nativeElement.textContent).toContain("hourly_kwh");
    expect(fixture.nativeElement.textContent).toContain("buildings");
    expect(fixture.nativeElement.textContent).toContain("••••••••");
    expect(JSON.stringify(fixture.componentInstance.connection)).not.toMatch(/\$POSTGRES_PASSWORD/);
    expect(fixture.nativeElement.textContent).toContain("test");
    expect(fixture.nativeElement.textContent).toContain("ingest");
  });

  it("puts an arrow-only back control on the far left and icons on the action buttons", async () => {
    const { fixture, navigate } = await render();
    const back = fixture.debugElement.query(By.css(".go-back-button"));
    expect(back).toBeTruthy();
    expect((back.nativeElement.textContent ?? "").trim()).toBe("");
    expect(back.query(By.css("[nztype='arrow-left'], .anticon-arrow-left"))).toBeTruthy();
    back.nativeElement.click();
    expect(navigate).toHaveBeenCalledWith(["/connectors"]);

    const labels = ["Test again", "Disconnect", "Use in workflow"];
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
    expect(navigate).toHaveBeenCalledWith([USER_WORKFLOW]);
  });
});
