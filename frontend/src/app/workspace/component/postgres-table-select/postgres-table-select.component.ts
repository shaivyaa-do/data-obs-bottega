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

import { Component, OnInit } from "@angular/core";
import { NgFor, NgIf } from "@angular/common";
import { ReactiveFormsModule } from "@angular/forms";
import { FieldType, FieldTypeConfig } from "@ngx-formly/core";
import { NzSelectModule } from "ng-zorro-antd/select";
import { NzInputDirective } from "ng-zorro-antd/input";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { of } from "rxjs";
import { catchError, distinctUntilChanged, startWith, switchMap } from "rxjs/operators";
import { ConnectorService } from "../../../dashboard/service/user/connector/connector.service";

@UntilDestroy()
@Component({
  selector: "texera-postgres-table-select",
  templateUrl: "./postgres-table-select.component.html",
  styleUrls: ["./postgres-table-select.component.scss"],
  imports: [NgFor, NgIf, ReactiveFormsModule, NzSelectModule, NzInputDirective],
})
export class PostgresTableSelectComponent extends FieldType<FieldTypeConfig> implements OnInit {
  tables: string[] = [];
  loading = false;
  useTextInput = true;

  constructor(private connectorService: ConnectorService) {
    super();
  }

  ngOnInit(): void {
    const connectionId$ = this.form?.get("connectionId")
      ? this.form.get("connectionId")!.valueChanges.pipe(startWith(this.form.get("connectionId")!.value))
      : of(this.model?.["connectionId"]);

    connectionId$
      .pipe(
        distinctUntilChanged(),
        switchMap((raw: unknown) => {
          const connectionId = typeof raw === "string" ? raw.trim() : "";
          if (!connectionId) {
            this.tables = [];
            this.useTextInput = true;
            this.loading = false;
            return of(null);
          }
          this.loading = true;
          return this.connectorService.listTables(connectionId).pipe(
            catchError(() => {
              this.tables = [];
              this.useTextInput = true;
              this.loading = false;
              return of(null);
            })
          );
        }),
        untilDestroyed(this)
      )
      .subscribe({
        next: tables => {
          if (tables == null) {
            this.loading = false;
            return;
          }
          this.tables = tables;
          this.useTextInput = false;
          this.loading = false;
        },
      });
  }
}
