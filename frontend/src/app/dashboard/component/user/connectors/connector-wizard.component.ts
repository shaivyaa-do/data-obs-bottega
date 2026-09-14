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

import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { NgFor, NgIf } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NzButtonComponent } from "ng-zorro-antd/button";
import { NzWaveDirective } from "ng-zorro-antd/core/wave";
import { NzIconDirective } from "ng-zorro-antd/icon";
import { NzInputDirective } from "ng-zorro-antd/input";
import { NzSwitchComponent } from "ng-zorro-antd/switch";
import { NzCheckboxComponent } from "ng-zorro-antd/checkbox";
import { NzRadioComponent, NzRadioGroupComponent } from "ng-zorro-antd/radio";
import { NzStepsComponent, NzStepComponent } from "ng-zorro-antd/steps";
import { NzSelectComponent, NzOptionComponent } from "ng-zorro-antd/select";
import {
  ConnectionConfig,
  ConnectorApp,
  ConnectorEnvironment,
  DatabricksConfig,
  DestinationMode,
  PostgresMysqlConfig,
  RemoteTable,
  S3Config,
  SavedConnector,
  SnowflakeConfig,
} from "../../../type/connector";
import { ConnectorService } from "../../../service/user/connector/connector.service";

export type WizardTestState = "idle" | "testing" | "success" | "fail";

@UntilDestroy()
@Component({
  selector: "texera-connector-wizard",
  templateUrl: "./connector-wizard.component.html",
  styleUrls: ["./connector-wizard.component.scss"],
  imports: [
    NgIf,
    NgFor,
    FormsModule,
    NzButtonComponent,
    NzWaveDirective,
    NzIconDirective,
    NzInputDirective,
    NzSwitchComponent,
    NzCheckboxComponent,
    NzRadioComponent,
    NzRadioGroupComponent,
    NzStepsComponent,
    NzStepComponent,
    NzSelectComponent,
    NzOptionComponent,
  ],
})
export class ConnectorWizardComponent implements OnChanges {
  @Input({ required: true }) app!: ConnectorApp;
  @Input() existing: SavedConnector | null = null;
  @Output() readonly saved = new EventEmitter<SavedConnector>();
  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly backToPicker = new EventEmitter<void>();

  step = 0;
  displayName = "";
  description = "";
  environment: ConnectorEnvironment = "prod";
  secret = "";
  testState: WizardTestState = "idle";
  testMessage = "";
  tables: RemoteTable[] = [];
  databases: string[] = [];
  schemas: string[] = [];
  destinationMode: DestinationMode = "live";
  datasetName = "";
  folder = "";
  selectOrTable = "";
  rowLimit = 10000;

  pg: PostgresMysqlConfig = this.emptyPg(5432);
  snowflake: SnowflakeConfig = this.emptySnowflake();
  databricks: DatabricksConfig = this.emptyDatabricks();
  s3: S3Config = this.emptyS3();

  constructor(private connectorService: ConnectorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["app"] && this.app?.id === "mysql") {
      this.pg.port = 3306;
    } else if (changes["app"] && this.app?.id === "postgresql") {
      this.pg.port = 5432;
    }
    if (changes["existing"] || changes["app"]) {
      this.applyExisting();
    }
  }

  get testOk(): boolean {
    return this.testState === "success";
  }

  get needsDatasetFields(): boolean {
    return this.destinationMode === "dataset" || this.destinationMode === "both";
  }

  get canAdvanceFromCredentials(): boolean {
    return this.displayName.trim().length > 0 && this.hostFilled();
  }

  get canAdvanceFromDestination(): boolean {
    if (!this.needsDatasetFields) {
      return true;
    }
    return this.datasetName.trim().length > 0;
  }

  next(): void {
    if (this.step < 3) {
      this.step += 1;
    }
  }

  back(): void {
    if (this.step === 0) {
      this.backToPicker.emit();
      return;
    }
    this.step -= 1;
  }

  cancel(): void {
    this.cancelled.emit();
  }

  testConnection(): void {
    this.testState = "testing";
    this.testMessage = "";
    this.connectorService
      .testConnector({
        name: this.displayName,
        appId: this.app.id,
        config: this.activeConfig(),
        secret: this.secret,
        connectorId: this.existing?.id,
      })
      .pipe(untilDestroyed(this))
      .subscribe({
        next: result => {
          this.testState = result.ok ? "success" : "fail";
          this.testMessage = result.message;
          this.tables = result.tables;
          this.databases = result.databases;
          this.schemas = result.schemas;
        },
        error: () => {
          this.testState = "fail";
          this.testMessage = "Test failed.";
        },
      });
  }

  save(): void {
    if (!this.testOk) {
      return;
    }
    const body = {
      name: this.displayName,
      description: this.description,
      environment: this.environment,
      appId: this.app.id,
      config: this.activeConfig(),
      secret: this.secret || undefined,
      destination: {
        mode: this.destinationMode,
        datasetName: this.needsDatasetFields ? this.datasetName.trim() : undefined,
        folder: this.needsDatasetFields ? this.folder.trim() || undefined : undefined,
        selectOrTable: this.needsDatasetFields ? this.selectOrTable.trim() || undefined : undefined,
        rowLimit: this.needsDatasetFields ? this.rowLimit : undefined,
      },
      enabledTables: this.tables.filter(table => table.enabled).map(table => table.name),
    };
    const request$ = this.existing
      ? this.connectorService.updateConnector(this.existing.id, body)
      : this.connectorService.createConnector(body);
    request$.pipe(untilDestroyed(this)).subscribe(saved => this.saved.emit(saved));
  }

  isSql(): boolean {
    return this.app.id === "postgresql" || this.app.id === "mysql";
  }

  tableLabel(table: RemoteTable): string {
    return table.schema ? `${table.schema}.${table.name}` : table.name;
  }

  private hostFilled(): boolean {
    const config = this.activeConfig();
    if ("host" in config) {
      return config.host.trim().length > 0;
    }
    if ("account" in config) {
      return config.account.trim().length > 0;
    }
    if ("workspaceUrl" in config) {
      return config.workspaceUrl.trim().length > 0;
    }
    return config.bucket.trim().length > 0;
  }

  private activeConfig(): ConnectionConfig {
    if (this.app.id === "snowflake") {
      return this.snowflake;
    }
    if (this.app.id === "databricks") {
      return this.databricks;
    }
    if (this.app.id === "s3") {
      return this.s3;
    }
    return this.pg;
  }

  private applyExisting(): void {
    if (!this.existing) {
      return;
    }
    this.displayName = this.existing.name;
    this.description = this.existing.description;
    this.environment = this.existing.environment;
    this.destinationMode = this.existing.destination.mode;
    this.datasetName = this.existing.destination.datasetName ?? "";
    this.folder = this.existing.destination.folder ?? "";
    this.selectOrTable = this.existing.destination.selectOrTable ?? "";
    this.rowLimit = this.existing.destination.rowLimit ?? 10000;
    this.tables = this.existing.tables.map(table => ({ ...table }));
    const config = this.existing.config;
    if ("host" in config) {
      this.pg = { ...config };
    } else if ("account" in config) {
      this.snowflake = { ...config };
    } else if ("workspaceUrl" in config) {
      this.databricks = { ...config };
    } else {
      this.s3 = { ...config };
    }
  }

  private emptyPg(port: number): PostgresMysqlConfig {
    return { host: "", port, database: "", username: "", ssl: true, schema: "", defaultTable: "" };
  }

  private emptySnowflake(): SnowflakeConfig {
    return { account: "", warehouse: "", database: "", schema: "", role: "", user: "" };
  }

  private emptyDatabricks(): DatabricksConfig {
    return { workspaceUrl: "", httpPath: "", catalog: "", schema: "" };
  }

  private emptyS3(): S3Config {
    return { bucket: "", region: "", accessKey: "", prefix: "" };
  }
}
