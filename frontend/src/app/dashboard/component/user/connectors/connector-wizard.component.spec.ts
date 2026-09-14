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
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { ConnectorWizardComponent } from "./connector-wizard.component";
import { ConnectorService, MOCK_TEST_CONNECTION_MS } from "../../../service/user/connector/connector.service";
import { CONNECTOR_APPS } from "../../../service/user/connector/mock-connectors";
import { SavedConnector } from "../../../type/connector";

const postgres = CONNECTOR_APPS.find(app => app.id === "postgresql")!;

describe("ConnectorWizardComponent postgres flow", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConnectorWizardComponent, NoopAnimationsModule],
      providers: [ConnectorService],
    }).compileComponents();
  });

  it("tests the mock connection and saves after success", fakeAsync(() => {
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput("app", postgres);
    fixture.detectChanges();

    const saved: SavedConnector[] = [];
    component.saved.subscribe(value => saved.push(value));

    component.displayName = "lab";
    component.pg.host = "db.lab.internal";
    component.step = 3;
    fixture.detectChanges();

    const saveBtn = (): HTMLButtonElement =>
      Array.from(fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>).find(btn =>
        (btn.textContent ?? "").includes("Save connector")
      ) as HTMLButtonElement;

    expect(saveBtn().disabled).toBe(true);

    component.testConnection();
    tick(MOCK_TEST_CONNECTION_MS);
    fixture.detectChanges();
    expect(component.testOk).toBe(true);
    expect(component.tables.map(table => table.name)).toContain("hourly_kwh");
    expect(fixture.nativeElement.textContent).toContain("hourly_kwh");
    expect(saveBtn().disabled).toBe(false);

    component.tables[0].enabled = true;
    component.save();
    expect(saved[0].id).toBe("lab");
    expect(saved[0].status).toBe("active");
  }));

  it("fails the mock test when the display name is fail and keeps Save disabled", fakeAsync(() => {
    const fixture = TestBed.createComponent(ConnectorWizardComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput("app", postgres);
    fixture.detectChanges();
    component.displayName = "fail";
    component.pg.host = "db.lab.internal";
    component.step = 3;
    component.testConnection();
    tick(MOCK_TEST_CONNECTION_MS);
    fixture.detectChanges();
    expect(component.testOk).toBe(false);
    expect(component.testState).toBe("fail");
    expect(component.testMessage).toMatch(/failed/i);
    const saveBtn = Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>
    ).find(btn => (btn.textContent ?? "").includes("Save connector")) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  }));

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
