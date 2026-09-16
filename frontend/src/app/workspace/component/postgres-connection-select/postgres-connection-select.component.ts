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
import { RouterLink } from "@angular/router";
import { FieldType, FieldTypeConfig } from "@ngx-formly/core";
import { NzSelectModule } from "ng-zorro-antd/select";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { CONNECTORS } from "../../../app-routing.constant";
import { SavedConnector } from "../../../dashboard/type/connector";
import { ConnectorService } from "../../../dashboard/service/user/connector/connector.service";

@UntilDestroy()
@Component({
  selector: "texera-postgres-connection-select",
  templateUrl: "./postgres-connection-select.component.html",
  styleUrls: ["./postgres-connection-select.component.scss"],
  imports: [NgFor, NgIf, ReactiveFormsModule, RouterLink, NzSelectModule],
})
export class PostgresConnectionSelectComponent extends FieldType<FieldTypeConfig> implements OnInit {
  readonly connectorsPath = CONNECTORS;
  connections: SavedConnector[] = [];
  loading = false;

  constructor(private connectorService: ConnectorService) {
    super();
  }

  get connectorCode(): string {
    const code = this.props["connectorCode"];
    return typeof code === "string" && code.trim() !== "" ? code : "postgres";
  }

  get placeholder(): string {
    const value = this.props["placeholder"];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
    if (this.connectorCode === "mysql") {
      return "Select a MySQL connection";
    }
    if (this.connectorCode === "snowflake") {
      return "Select a Snowflake connection";
    }
    return "Select a PostgreSQL connection";
  }

  get addConnectionLead(): string {
    const value = this.props["addConnectionLead"];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
    if (this.connectorCode === "mysql") {
      return "Add a MySQL connection under";
    }
    if (this.connectorCode === "snowflake") {
      return "Add a Snowflake connection under";
    }
    return "Add a PostgreSQL connection under";
  }

  ngOnInit(): void {
    this.loading = true;
    this.connectorService
      .listConnectors()
      .pipe(untilDestroyed(this))
      .subscribe({
        next: connectors => {
          this.connections = connectors.filter(
            connector => connector.connectorCode === this.connectorCode && connector.status === "active"
          );
          this.loading = false;
        },
        error: () => {
          this.connections = [];
          this.loading = false;
        },
      });
  }
}
