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
import { NzDropdownDirective, NzDropdownMenuComponent } from "ng-zorro-antd/dropdown";
import { NzMenuDirective, NzMenuItemComponent } from "ng-zorro-antd/menu";
import { NzPopconfirmDirective } from "ng-zorro-antd/popconfirm";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { formatRelativeTime } from "../../../../common/util/format.util";
import { CONNECTORS, USER_WORKFLOW } from "../../../../app-routing.constant";
import {
  CONNECTION_ID_QUERY_PARAM,
  CONNECTOR_CODE_QUERY_PARAM,
} from "../../../../workspace/util/postgres-source-properties";
import {
  connectedToast,
  ConnectorApp,
  destinationSummary,
  SavedConnector,
  statusLabel as connectorStatusLabel,
} from "../../../type/connector";
import { ConnectorService, connectorErrorMessage } from "../../../service/user/connector/connector.service";
import { CONNECTOR_APPS, mergeConnectorApps } from "../../../service/user/connector/mock-connectors";
import { ConnectorWizardComponent } from "./connector-wizard.component";

@UntilDestroy()
@Component({
  selector: "texera-connectors",
  templateUrl: "./connectors.component.html",
  styleUrls: ["./connectors.component.scss"],
  imports: [
    NzCardComponent,
    NgFor,
    NgIf,
    NzButtonComponent,
    NzWaveDirective,
    NzIconDirective,
    NzDropdownDirective,
    NzDropdownMenuComponent,
    NzMenuDirective,
    NzMenuItemComponent,
    NzPopconfirmDirective,
    ConnectorWizardComponent,
  ],
})
export class ConnectorsComponent implements OnInit {
  apps: ConnectorApp[] = CONNECTOR_APPS.map(app => ({ ...app }));
  readonly destinationSummary = destinationSummary;
  connectors: SavedConnector[] = [];
  testingId: string | null = null;
  modalOpen = false;
  modalPhase: "picker" | "wizard" = "picker";
  selectedApp: ConnectorApp | null = null;
  editing: SavedConnector | null = null;

  constructor(
    private connectorService: ConnectorService,
    private router: Router,
    private route: ActivatedRoute,
    private notification: NotificationService
  ) {}

  ngOnInit(): void {
    this.refresh();
    this.route.queryParamMap.pipe(untilDestroyed(this)).subscribe(params => {
      if (params.get("add") === "1") {
        this.openAddModal();
      }
    });
  }

  get visibleConnectors(): SavedConnector[] {
    return this.connectors;
  }

  get showEmptyState(): boolean {
    return this.connectors.length === 0;
  }

  openAddModal(): void {
    this.editing = null;
    this.selectedApp = null;
    this.modalPhase = "picker";
    this.modalOpen = true;
  }

  closeModal(): void {
    this.modalOpen = false;
    this.selectedApp = null;
    this.editing = null;
    this.modalPhase = "picker";
    this.refresh();
  }

  pickApp(app: ConnectorApp): void {
    if (!app.available) {
      return;
    }
    this.selectedApp = app;
    this.modalPhase = "wizard";
  }

  backToPicker(): void {
    this.selectedApp = null;
    this.editing = null;
    this.modalPhase = "picker";
  }

  openDetail(connector: SavedConnector): void {
    this.router.navigate([CONNECTORS, connector.id]);
  }

  edit(connector: SavedConnector, event?: Event): void {
    event?.stopPropagation();
    const app = this.apps.find(item => item.code === connector.connectorCode);
    if (!app?.available) {
      return;
    }
    this.editing = connector;
    this.selectedApp = app;
    this.modalPhase = "wizard";
    this.modalOpen = true;
  }

  useInWorkflow(connector: SavedConnector, event?: Event): void {
    event?.stopPropagation();
    this.router.navigate([USER_WORKFLOW], {
      queryParams: {
        [CONNECTION_ID_QUERY_PARAM]: connector.id,
        [CONNECTOR_CODE_QUERY_PARAM]: connector.connectorCode,
      },
    });
  }

  testAgain(connector: SavedConnector, event?: Event): void {
    event?.stopPropagation();
    this.testingId = connector.id;
    this.connectorService
      .testConnector(connector.id)
      .pipe(untilDestroyed(this))
      .subscribe({
        next: result => {
          this.testingId = null;
          if (result.status === "active") {
            this.notification.success("Connected.");
          } else {
            this.notification.error(result.lastError || "Test failed.");
          }
          this.refresh();
        },
        error: (err: unknown) => {
          this.testingId = null;
          this.notification.error(connectorErrorMessage(err));
          this.refresh();
        },
      });
  }

  removeConnector(connector: SavedConnector, event?: Event): void {
    event?.stopPropagation();
    this.connectorService
      .deleteConnector(connector.id)
      .pipe(untilDestroyed(this))
      .subscribe({
        next: () => this.refresh(),
        error: (err: unknown) => this.notification.error(connectorErrorMessage(err)),
      });
  }

  onSaved(connector: SavedConnector): void {
    const app = this.selectedApp ?? this.apps.find(item => item.code === connector.connectorCode);
    if (app && !this.editing) {
      this.notification.success(connectedToast(app, connector.name));
    }
    this.closeModal();
  }

  formatWhen(iso: string | null): string {
    if (!iso) {
      return "Never";
    }
    return formatRelativeTime(Date.parse(iso));
  }

  statusLabel(connector: SavedConnector): string {
    if (this.testingId === connector.id) {
      return "Testing";
    }
    return connectorStatusLabel(connector.status);
  }

  appName(connector: SavedConnector): string {
    return (
      connector.connectorDisplayName ||
      this.apps.find(app => app.code === connector.connectorCode)?.name ||
      connector.connectorCode
    );
  }

  appIcon(connector: SavedConnector): string {
    return this.apps.find(app => app.code === connector.connectorCode)?.icon ?? "database";
  }

  private refresh(): void {
    this.connectorService
      .listConnectors()
      .pipe(untilDestroyed(this))
      .subscribe({
        next: connectors => {
          this.connectors = connectors;
        },
        error: (err: unknown) => {
          this.connectors = [];
        },
      });
    this.connectorService
      .listConnectorTypes()
      .pipe(untilDestroyed(this))
      .subscribe({
        next: types => {
          this.apps = mergeConnectorApps(types);
        },
        error: (err: unknown) => {
          this.apps = mergeConnectorApps([]);
        },
      });
  }
}
