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
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { formatRelativeTime } from "../../../../common/util/format.util";
import { CONNECTORS, USER_WORKFLOW } from "../../../../app-routing.constant";
import {
  connectedToast,
  ConnectorApp,
  destinationSummary,
  isActiveStatus,
  SavedConnector,
} from "../../../type/connector";
import { ConnectorService } from "../../../service/user/connector/connector.service";
import { appById, CONNECTOR_APPS } from "../../../service/user/connector/mock-connectors";
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
    ConnectorWizardComponent,
  ],
})
export class ConnectorsComponent implements OnInit {
  readonly apps = CONNECTOR_APPS;
  readonly appById = appById;
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
    return this.connectors.filter(connector => isActiveStatus(connector.status));
  }

  get showEmptyState(): boolean {
    return this.visibleConnectors.length === 0;
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
    const app = appById(connector.appId);
    if (!app) {
      return;
    }
    this.editing = connector;
    this.selectedApp = app;
    this.modalPhase = "wizard";
    this.modalOpen = true;
  }

  useInWorkflow(event?: Event): void {
    event?.stopPropagation();
    this.router.navigate([USER_WORKFLOW]);
  }

  testAgain(connector: SavedConnector, event?: Event): void {
    event?.stopPropagation();
    this.testingId = connector.id;
    this.connectorService
      .testConnector({
        name: connector.name,
        appId: connector.appId,
        config: connector.config,
        connectorId: connector.id,
      })
      .pipe(untilDestroyed(this))
      .subscribe({
        next: result => {
          this.testingId = null;
          if (result.ok) {
            this.notification.success(result.message);
          } else {
            this.notification.error(result.message);
          }
          this.refresh();
        },
        error: () => {
          this.testingId = null;
          this.notification.error("Test failed.");
        },
      });
  }

  disconnect(connector: SavedConnector, event?: Event): void {
    event?.stopPropagation();
    this.connectorService
      .disconnectConnector(connector.id)
      .pipe(untilDestroyed(this))
      .subscribe(() => this.refresh());
  }

  onSaved(connector: SavedConnector): void {
    const app = this.selectedApp ?? appById(connector.appId);
    if (app && !this.editing) {
      this.notification.success(connectedToast(app, connector.name));
    }
    this.closeModal();
    this.refresh();
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
    if (isActiveStatus(connector.status)) {
      return "Active";
    }
    if (connector.status === "error") {
      return "Error";
    }
    return "Inactive";
  }

  appName(connector: SavedConnector): string {
    return appById(connector.appId)?.name ?? connector.appId;
  }

  appIcon(connector: SavedConnector): string {
    return appById(connector.appId)?.icon ?? "database";
  }

  private refresh(): void {
    this.connectorService
      .listConnectors()
      .pipe(untilDestroyed(this))
      .subscribe(connectors => {
        this.connectors = connectors;
      });
  }
}
