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
import { ActivatedRoute, Router } from "@angular/router";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { NgFor, NgIf } from "@angular/common";
import { NzCardComponent } from "ng-zorro-antd/card";
import { NzButtonComponent } from "ng-zorro-antd/button";
import { NzWaveDirective } from "ng-zorro-antd/core/wave";
import { NzIconDirective } from "ng-zorro-antd/icon";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import { NzPopconfirmDirective } from "ng-zorro-antd/popconfirm";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { formatRelativeTime } from "../../../../common/util/format.util";
import { CONNECTORS, USER_WORKFLOW } from "../../../../app-routing.constant";
import {
  CONNECTION_ID_QUERY_PARAM,
  CONNECTOR_CODE_QUERY_PARAM,
} from "../../../../workspace/util/postgres-source-properties";
import { destinationSummary, SavedConnector, statusLabel as connectorStatusLabel } from "../../../type/connector";
import { ConnectorService, connectorErrorMessage } from "../../../service/user/connector/connector.service";

const CONFIG_ORDER = ["host", "port", "database", "username", "schema"];

@UntilDestroy()
@Component({
  selector: "texera-connector-detail",
  templateUrl: "./connector-detail.component.html",
  styleUrls: ["./connector-detail.component.scss"],
  imports: [
    NzCardComponent,
    NgIf,
    NgFor,
    NzButtonComponent,
    NzWaveDirective,
    NzIconDirective,
    NzTooltipDirective,
    NzPopconfirmDirective,
  ],
})
export class ConnectorDetailComponent implements OnInit {
  connection: SavedConnector | null = null;
  readonly destinationSummary = destinationSummary;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private connectorService: ConnectorService,
    private notification: NotificationService
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get("id");
    if (!id) {
      this.router.navigate([CONNECTORS]);
      return;
    }
    this.load(id);
  }

  get typeLabel(): string {
    return this.connection?.connectorDisplayName ?? "";
  }

  statusLabel(): string {
    if (!this.connection) {
      return "";
    }
    return connectorStatusLabel(this.connection.status);
  }

  credentialRows(): { label: string; value: string }[] {
    if (!this.connection) {
      return [];
    }
    const config = this.connection.config;
    const labels: Record<string, string> = {
      host: "Host",
      port: "Port",
      database: "Database",
      username: "Username",
      schema: "Schema",
    };
    const rows: { label: string; value: string }[] = [];
    for (const key of CONFIG_ORDER) {
      const value = config[key];
      if (value === undefined || value === null || value === "") {
        continue;
      }
      rows.push({ label: labels[key] ?? key, value: String(value) });
    }
    return rows;
  }

  lastTested(): string {
    if (!this.connection?.lastTestedAt) {
      return "Never";
    }
    return formatRelativeTime(Date.parse(this.connection.lastTestedAt));
  }

  testAgain(): void {
    if (!this.connection) {
      return;
    }
    this.connectorService
      .testConnector(this.connection.id)
      .pipe(untilDestroyed(this))
      .subscribe({
        next: result => {
          this.connection = result;
          if (result.status === "active") {
            this.notification.success("Connected.");
          } else {
            this.notification.error(result.lastError || "Test failed.");
          }
        },
        error: (err: unknown) => this.notification.error(connectorErrorMessage(err)),
      });
  }

  removeConnector(): void {
    if (!this.connection) {
      return;
    }
    this.connectorService
      .deleteConnector(this.connection.id)
      .pipe(untilDestroyed(this))
      .subscribe({
        next: () => this.router.navigate([CONNECTORS]),
        error: (err: unknown) => this.notification.error(connectorErrorMessage(err)),
      });
  }

  openInWorkflow(): void {
    if (!this.connection) {
      return;
    }
    this.router.navigate([USER_WORKFLOW], {
      queryParams: {
        [CONNECTION_ID_QUERY_PARAM]: this.connection.id,
        [CONNECTOR_CODE_QUERY_PARAM]: this.connection.connectorCode,
      },
    });
  }

  back(): void {
    this.router.navigate([CONNECTORS]);
  }

  private load(id: string): void {
    this.connectorService
      .getConnector(id)
      .pipe(untilDestroyed(this))
      .subscribe({
        next: connection => {
          this.connection = connection;
        },
        error: (err: unknown) => this.router.navigate([CONNECTORS]),
      });
  }
}
