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
import { FormControl, FormGroup } from "@angular/forms";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { FieldTypeConfig } from "@ngx-formly/core";
import { of, throwError } from "rxjs";
import { PostgresTableSelectComponent } from "./postgres-table-select.component";
import { ConnectorService } from "../../../dashboard/service/user/connector/connector.service";

describe("PostgresTableSelectComponent", () => {
  let fixture: ComponentFixture<PostgresTableSelectComponent>;
  let listTables: ReturnType<typeof vi.fn>;

  async function render(connectionId: string): Promise<PostgresTableSelectComponent> {
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PostgresTableSelectComponent, NoopAnimationsModule],
      providers: [{ provide: ConnectorService, useValue: { listTables } }],
    }).compileComponents();
    fixture = TestBed.createComponent(PostgresTableSelectComponent);
    const component = fixture.componentInstance;
    const form = new FormGroup({
      connectionId: new FormControl(connectionId),
      table: new FormControl(""),
    });
    component.field = {
      formControl: form.get("table"),
      form,
      props: {},
      model: { connectionId },
    } as unknown as FieldTypeConfig;
    fixture.detectChanges();
    return component;
  }

  it("loads table names from GET /connectors/{id}/tables into a dropdown", async () => {
    listTables = vi.fn().mockReturnValue(of(["buildings", "hourly_kwh"]));
    const component = await render("3");
    expect(listTables).toHaveBeenCalledWith("3");
    expect(component.tables).toEqual(["buildings", "hourly_kwh"]);
    expect(component.useTextInput).toBe(false);
    expect(component.tables).not.toContain("connection_cred");
    expect(fixture.nativeElement.querySelector("nz-select")).not.toBeNull();
    expect(fixture.nativeElement.querySelector("input.table-input")).toBeNull();
  });

  it("falls back to a text input when listing tables fails", async () => {
    listTables = vi.fn().mockReturnValue(throwError(() => new Error("boom")));
    const component = await render("3");
    expect(component.useTextInput).toBe(true);
    expect(component.tables).toEqual([]);
    expect(fixture.nativeElement.querySelector("input.table-input")).not.toBeNull();
  });

  it("keeps a text input until a connection is selected", async () => {
    listTables = vi.fn();
    const component = await render("");
    expect(listTables).not.toHaveBeenCalled();
    expect(component.useTextInput).toBe(true);
    expect(fixture.nativeElement.querySelector("input.table-input")).not.toBeNull();
  });
});
