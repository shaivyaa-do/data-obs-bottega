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
import { Observable, throwError } from "rxjs";
import { catchError, switchMap } from "rxjs/operators";
import { NzButtonComponent } from "ng-zorro-antd/button";
import { NzWaveDirective } from "ng-zorro-antd/core/wave";
import { NzIconDirective } from "ng-zorro-antd/icon";
import { NzInputDirective } from "ng-zorro-antd/input";
import { NzStepsComponent, NzStepComponent } from "ng-zorro-antd/steps";
import {
  ConnectorApp,
  ConnectorFieldSchema,
  CreateConnectorRequest,
  SavedConnector,
  UpdateConnectorRequest,
} from "../../../type/connector";
import {
  ConnectorService,
  ConnectorTestError,
  connectorErrorMessage,
} from "../../../service/user/connector/connector.service";

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
    NzStepsComponent,
    NzStepComponent,
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
  values: Record<string, string> = {};
  testState: WizardTestState = "idle";
  testMessage = "";
  createdId: string | null = null;
  schemaLoading = false;
  schemaError = "";
  private fieldsFromApi: ConnectorFieldSchema[] = [];
  private loadedForCode: string | null = null;

  constructor(private connectorService: ConnectorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["app"] && this.app?.code !== this.loadedForCode) {
      this.loadSchema();
      return;
    }
    if (changes["existing"] && this.fieldsFromApi.length > 0) {
      this.applyDefaults();
    }
  }

  get credentialFields(): ConnectorFieldSchema[] {
    return this.fieldsFromApi;
  }

  get testOk(): boolean {
    return this.testState === "success";
  }

  get canAdvanceFromCredentials(): boolean {
    if (this.schemaLoading || this.schemaError || this.credentialFields.length === 0) {
      return false;
    }
    if (!this.displayName.trim()) {
      return false;
    }
    return this.credentialFields.every(field => {
      if (!field.required) {
        return true;
      }
      const value = (this.values[field.name] ?? "").trim();
      if (field.secret && (this.existing || this.createdId) && !value) {
        return true;
      }
      return value.length > 0;
    });
  }

  next(): void {
    if (this.step < 1 && this.canAdvanceFromCredentials) {
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

  fieldInputType(field: ConnectorFieldSchema): string {
    if (field.type === "password" || field.secret) {
      return "password";
    }
    if (field.name === "port" || field.type === "number") {
      return "number";
    }
    return "text";
  }

  fieldLabel(field: ConnectorFieldSchema): string {
    return field.required ? field.label : `${field.label} (optional)`;
  }

  testConnection(): void {
    this.saveAndTest();
  }

  save(): void {
    this.saveAndTest();
  }

  saveAndTest(): void {
    if (this.testState === "testing") {
      return;
    }
    this.testState = "testing";
    this.testMessage = "";
    this.persistThenTest()
      .pipe(untilDestroyed(this))
      .subscribe({
        next: saved => {
          this.testState = "success";
          this.values["password"] = "";
          this.saved.emit(saved);
        },
        error: (err: unknown) => {
          this.testState = "fail";
          if (err instanceof ConnectorTestError) {
            this.createdId = err.connector.id;
            this.testMessage = err.connector.lastError || err.message;
          } else {
            this.testMessage = connectorErrorMessage(err);
          }
        },
      });
  }

  private loadSchema(): void {
    this.schemaLoading = true;
    this.schemaError = "";
    this.fieldsFromApi = [];
    this.loadedForCode = this.app.code;
    this.connectorService
      .listConnectorTypes()
      .pipe(untilDestroyed(this))
      .subscribe({
        next: types => {
          const type = types.find(item => item.code === this.app.code);
          const fields = type?.fieldsSchema?.fields ?? [];
          if (fields.length === 0) {
            this.fieldsFromApi = [];
            this.schemaError = `Could not load connection fields for ${this.app.name}.`;
          } else {
            this.fieldsFromApi = fields;
            this.applyDefaults();
          }
          this.schemaLoading = false;
        },
        error: (err: unknown) => {
          this.fieldsFromApi = [];
          this.schemaError = connectorErrorMessage(err);
          this.schemaLoading = false;
        },
      });
  }

  private persistThenTest(): Observable<SavedConnector> {
    if (this.createdId) {
      return this.updateThenTest(this.createdId);
    }
    if (this.existing) {
      return this.updateThenTest(this.existing.id);
    }
    return this.connectorService.createAndTest(this.createBody());
  }

  private updateThenTest(id: string): Observable<SavedConnector> {
    return this.connectorService.updateConnector(id, this.patchBody()).pipe(
      switchMap(() => this.connectorService.testConnector(id)),
      catchError((err: unknown) => throwError(() => new Error(connectorErrorMessage(err))))
    );
  }

  private createBody(): CreateConnectorRequest {
    return {
      name: this.displayName.trim(),
      connectorCode: this.app.code,
      password: this.values["password"] ?? "",
      ...this.nonSecretFieldValues(),
    };
  }

  private patchBody(): UpdateConnectorRequest {
    const password = this.values["password"] ?? "";
    return {
      name: this.displayName.trim(),
      ...this.nonSecretFieldValues(),
      password: password.trim() ? password : undefined,
    };
  }

  private nonSecretFieldValues(): Record<string, string> {
    const next: Record<string, string> = {};
    for (const field of this.credentialFields) {
      if (field.secret || field.name === "password") {
        continue;
      }
      const value = (this.values[field.name] ?? "").trim() || this.fieldDefault(field.name);
      if (value) {
        next[field.name] = value;
      }
    }
    return next;
  }

  private fieldDefault(name: string): string {
    return this.credentialFields.find(field => field.name === name)?.default ?? "";
  }

  private applyDefaults(): void {
    const next: Record<string, string> = {};
    for (const field of this.credentialFields) {
      if (field.secret) {
        next[field.name] = "";
        continue;
      }
      const existingValue = this.existing?.config[field.name];
      if (existingValue !== undefined && existingValue !== null && existingValue !== "") {
        next[field.name] = String(existingValue);
      } else {
        next[field.name] = field.default ?? "";
      }
    }
    this.values = next;
    if (this.existing) {
      this.displayName = this.existing.name;
      this.createdId = this.existing.id;
    }
  }
}
