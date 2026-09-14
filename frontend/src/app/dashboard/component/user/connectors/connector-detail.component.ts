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
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { formatRelativeTime } from "../../../../common/util/format.util";
import { CONNECTORS, USER_WORKFLOW } from "../../../../app-routing.constant";
import { destinationSummary, isActiveStatus, SavedConnector } from "../../../type/connector";
import { ConnectorService } from "../../../service/user/connector/connector.service";
import { appById } from "../../../service/user/connector/mock-connectors";

@UntilDestroy()
@Component({
  selector: "texera-connector-detail",
  templateUrl: "./connector-detail.component.html",
  styleUrls: ["./connector-detail.component.scss"],
  imports: [NzCardComponent, NgIf, NgFor, NzButtonComponent, NzWaveDirective, NzIconDirective, NzTooltipDirective],
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
    if (!this.connection) {
      return "";
    }
    return appById(this.connection.appId)?.name ?? this.connection.appId;
  }

  statusLabel(): string {
    if (!this.connection) {
      return "";
    }
    if (isActiveStatus(this.connection.status)) {
      return "Active";
    }
    if (this.connection.status === "error") {
      return "Error";
    }
    if (this.connection.status === "testing") {
      return "Testing";
    }
    return "Inactive";
  }

  maskedSecret(): string {
    return this.connection?.hasSecret ? "••••••••" : "—";
  }

  credentialRows(): { label: string; value: string }[] {
    if (!this.connection) {
      return [];
    }
    const config = this.connection.config;
    const rows: { label: string; value: string }[] = [
      { label: "Password", value: this.maskedSecret() },
    ];
    if ("host" in config) {
      return [
        { label: "Host", value: config.host },
        { label: "Port", value: String(config.port) },
        { label: "Database", value: config.database },
        { label: "Username", value: config.username },
        { label: "SSL", value: config.ssl ? "On" : "Off" },
        ...rows,
      ];
    }
    if ("account" in config) {
      return [
        { label: "Account", value: config.account },
        { label: "Warehouse", value: config.warehouse },
        { label: "Database", value: config.database },
        { label: "Schema", value: config.schema },
        { label: "Role", value: config.role },
        { label: "User", value: config.user },
        ...rows,
      ];
    }
    if ("workspaceUrl" in config) {
      return [
        { label: "Workspace URL", value: config.workspaceUrl },
        { label: "HTTP path", value: config.httpPath },
        { label: "Catalog", value: config.catalog },
        { label: "Schema", value: config.schema },
        { label: "Token", value: this.maskedSecret() },
      ];
    }
    return [
      { label: "Bucket", value: config.bucket },
      { label: "Region", value: config.region },
      { label: "Access key", value: config.accessKey },
      { label: "Secret", value: this.maskedSecret() },
    ];
  }

  lastTested(): string {
    if (!this.connection?.lastTestedAt) {
      return "Never";
    }
    return formatRelativeTime(Date.parse(this.connection.lastTestedAt));
  }

  enabledTables(): string[] {
    return (this.connection?.tables ?? [])
      .filter(table => table.enabled)
      .map(table => (table.schema ? `${table.schema}.${table.name}` : table.name));
  }

  recentLogs() {
    return (this.connection?.logs ?? []).slice(0, 5);
  }

  testAgain(): void {
    if (!this.connection) {
      return;
    }
    this.connectorService
      .testConnector({
        name: this.connection.name,
        appId: this.connection.appId,
        config: this.connection.config,
        connectorId: this.connection.id,
      })
      .pipe(untilDestroyed(this))
      .subscribe({
        next: result => {
          if (result.ok) {
            this.notification.success(result.message);
          } else {
            this.notification.error(result.message);
          }
          this.load(this.connection!.id);
        },
        error: () => this.notification.error("Test failed."),
      });
  }

  disconnect(): void {
    if (!this.connection) {
      return;
    }
    this.connectorService
      .disconnectConnector(this.connection.id)
      .pipe(untilDestroyed(this))
      .subscribe(() => this.router.navigate([CONNECTORS]));
  }

  openInWorkflow(): void {
    this.router.navigate([USER_WORKFLOW]);
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
        error: () => this.router.navigate([CONNECTORS]),
      });
  }
}
