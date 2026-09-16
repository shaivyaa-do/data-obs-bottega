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
import { FormControl } from "@angular/forms";
import { By } from "@angular/platform-browser";
import { RouterTestingModule } from "@angular/router/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { FieldTypeConfig } from "@ngx-formly/core";
import { of } from "rxjs";
import { PostgresConnectionSelectComponent } from "./postgres-connection-select.component";
import { ConnectorService } from "../../../dashboard/service/user/connector/connector.service";
import { SavedConnector } from "../../../dashboard/type/connector";
import { POSTGRES_ADD_CONNECTION_MESSAGE } from "../../util/postgres-source-properties";

function saved(over: Partial<SavedConnector> = {}): SavedConnector {
  return {
    id: "7",
    name: "facilities-prod",
    status: "active",
    connectorCode: "postgres",
    connectorDisplayName: "PostgreSQL",
    config: { host: "127.0.0.1" },
    lastTestedAt: null,
    lastError: null,
    ...over,
  };
}

describe("PostgresConnectionSelectComponent", () => {
  let fixture: ComponentFixture<PostgresConnectionSelectComponent>;
  let listConnectors: ReturnType<typeof vi.fn>;

  async function render(
    connectors: SavedConnector[],
    props: Record<string, unknown> = {}
  ): Promise<PostgresConnectionSelectComponent> {
    listConnectors = vi.fn().mockReturnValue(of(connectors));
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PostgresConnectionSelectComponent, RouterTestingModule, NoopAnimationsModule],
      providers: [{ provide: ConnectorService, useValue: { listConnectors } }],
    }).compileComponents();
    fixture = TestBed.createComponent(PostgresConnectionSelectComponent);
    const component = fixture.componentInstance;
    component.field = {
      formControl: new FormControl(""),
      props,
    } as unknown as FieldTypeConfig;
    fixture.detectChanges();
    return component;
  }

  it("lists active postgres connections by name", async () => {
    const component = await render([
      saved(),
      saved({ id: "8", name: "lab-pg", status: "error" }),
      saved({ id: "9", name: "mysql-prod", connectorCode: "mysql" }),
    ]);
    expect(component.connections.map(c => c.name)).toEqual(["facilities-prod"]);
    expect(component.connections.map(c => c.id)).not.toContain("8");
    expect(component.connections.map(c => c.id)).not.toContain("9");
  });

  it("shows the Connectors empty copy when the user has no saved Postgres connection", async () => {
    await render([]);
    const hint = fixture.nativeElement.querySelector(".empty-hint") as HTMLElement;
    expect(hint.textContent?.replace(/\s+/g, " ").trim()).toBe(POSTGRES_ADD_CONNECTION_MESSAGE);
    const link = fixture.debugElement.query(By.css(".empty-hint a"));
    expect(link.attributes["href"] || link.nativeElement.getAttribute("href")).toContain("connectors");
  });

  it("lists active mysql connections when connectorCode is mysql", async () => {
    const component = await render(
      [
        saved(),
        saved({ id: "9", name: "mysql-prod", connectorCode: "mysql" }),
        saved({ id: "10", name: "mysql-down", connectorCode: "mysql", status: "error" }),
      ],
      { connectorCode: "mysql" }
    );
    expect(component.connections.map(c => c.name)).toEqual(["mysql-prod"]);
  });

  it("lists active snowflake connections when connectorCode is snowflake", async () => {
    const component = await render(
      [
        saved(),
        saved({ id: "11", name: "lab-sf", connectorCode: "snowflake" }),
        saved({ id: "12", name: "sf-down", connectorCode: "snowflake", status: "error" }),
      ],
      { connectorCode: "snowflake" }
    );
    expect(component.connections.map(c => c.name)).toEqual(["lab-sf"]);
  });
});
