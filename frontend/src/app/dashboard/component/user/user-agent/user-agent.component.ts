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
import { Router, RouterLink } from "@angular/router";
import { NgFor, NgIf } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { of } from "rxjs";
import { catchError } from "rxjs/operators";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { NzCardComponent } from "ng-zorro-antd/card";
import { NzButtonComponent } from "ng-zorro-antd/button";
import { NzWaveDirective } from "ng-zorro-antd/core/wave";
import { ɵNzTransitionPatchDirective } from "ng-zorro-antd/core/transition-patch";
import { NzIconDirective } from "ng-zorro-antd/icon";
import { NzSpinComponent } from "ng-zorro-antd/spin";
import { NzInputDirective } from "ng-zorro-antd/input";
import { NzAlertComponent } from "ng-zorro-antd/alert";
import { USER_COMPUTING_UNIT, USER_WORKSPACE } from "../../../../app-routing.constant";
import { sessionGetObject, sessionSetObject } from "../../../../common/util/storage";
import { AgentService, AgentInfo, LLM_PROVIDER_API_KEY_STORAGE_KEY, ModelType } from "../../../../workspace/service/agent/agent.service";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { ComputingUnitStatusService } from "../../../../common/service/computing-unit/computing-unit-status/computing-unit-status.service";

@UntilDestroy()
@Component({
  selector: "texera-user-agent",
  templateUrl: "user-agent.component.html",
  styleUrls: ["user-agent.component.scss"],
  imports: [
    NzCardComponent,
    NgIf,
    NzSpinComponent,
    NzIconDirective,
    NgFor,
    NzInputDirective,
    FormsModule,
    NzAlertComponent,
    NzButtonComponent,
    NzWaveDirective,
    ɵNzTransitionPatchDirective,
    RouterLink,
  ],
})
export class UserAgentComponent implements OnInit {
  public modelTypes: ModelType[] = [];
  public selectedModelType: string | null = null;
  public customAgentName = "";
  public providerApiKey = "";
  public apiKeyVisible = false;
  public isLoadingModels = false;
  public hasLoadingError = false;
  public hasRunningComputingUnit = false;
  public isCreating = false;
  public agents: AgentInfo[] = [];
  public isLoadingAgents = false;
  public readonly computingUnitRoute = USER_COMPUTING_UNIT;

  constructor(
    private agentService: AgentService,
    private computingUnitStatusService: ComputingUnitStatusService,
    private notificationService: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const savedKey = sessionGetObject<string>(LLM_PROVIDER_API_KEY_STORAGE_KEY);
    if (typeof savedKey === "string") {
      this.providerApiKey = savedKey;
    }
    this.isLoadingModels = true;
    this.agentService
      .fetchModelTypes()
      .pipe(untilDestroyed(this))
      .subscribe({
        next: models => {
          this.modelTypes = models;
          this.isLoadingModels = false;
          if (models.length === 0) {
            this.hasLoadingError = true;
            this.notificationService.error("No models available. Please check the LiteLLM configuration.");
          }
        },
        error: (error: unknown) => {
          this.isLoadingModels = false;
          this.hasLoadingError = true;
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.notificationService.error(`Failed to fetch models: ${errorMessage}`);
        },
      });

    this.computingUnitStatusService
      .getAllComputingUnits()
      .pipe(untilDestroyed(this))
      .subscribe(units => {
        this.hasRunningComputingUnit = units.some(unit => unit.status === "Running");
      });

    this.loadConfiguredAgents();
    this.agentService.agentChange$.pipe(untilDestroyed(this)).subscribe(() => {
      this.loadConfiguredAgents();
    });
  }

  public selectModelType(modelTypeId: string): void {
    this.selectedModelType = modelTypeId;
  }

  public canCreate(): boolean {
    return (
      this.selectedModelType !== null &&
      this.trimmedProviderApiKey() !== "" &&
      this.trimmedAgentName() !== "" &&
      !this.isCreating
    );
  }

  public createAgent(): void {
    if (!this.canCreate()) {
      return;
    }

    this.isCreating = true;
    const providerApiKey = this.trimmedProviderApiKey();
    sessionSetObject(LLM_PROVIDER_API_KEY_STORAGE_KEY, providerApiKey);

    this.agentService
      .createAgent(this.selectedModelType!, this.trimmedAgentName(), undefined, providerApiKey)
      .pipe(untilDestroyed(this))
      .subscribe({
        next: () => {
          this.isCreating = false;
          this.customAgentName = "";
          this.notificationService.success("Agent created. Open any workflow and select it from the dropdown.");
        },
        error: () => {
          this.isCreating = false;
        },
      });
  }

  public trimmedProviderApiKey(): string {
    return this.providerApiKey.trim();
  }

  public trimmedAgentName(): string {
    return this.customAgentName.trim();
  }

  public workflowLabel(agent: AgentInfo): string {
    const workflowName = agent.delegate?.workflowName?.trim();
    if (workflowName) {
      return workflowName;
    }
    const workflowId = agent.delegate?.workflowId;
    if (workflowId !== undefined && workflowId !== 0) {
      return `Workflow ${workflowId}`;
    }
    return "Any workflow";
  }

  public openAgent(agent: AgentInfo): void {
    const workflowId = agent.delegate?.workflowId;
    if (workflowId === undefined || workflowId === 0) {
      this.notificationService.info("Open any workflow and select this agent from the dropdown.");
      return;
    }
    this.router.navigate([USER_WORKSPACE, workflowId], { queryParams: { agent: agent.id } });
  }

  public deleteConfiguredAgent(agent: AgentInfo, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${agent.name}"?`)) {
      return;
    }
    this.agentService
      .deleteAgent(agent.id)
      .pipe(untilDestroyed(this))
      .subscribe({
        error: (error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.notificationService.error(`Failed to delete agent: ${errorMessage}`);
        },
      });
  }

  private loadConfiguredAgents(): void {
    this.isLoadingAgents = true;
    this.agentService
      .getAllAgents()
      .pipe(
        catchError((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.notificationService.error(`Failed to load agents: ${errorMessage}`);
          return of([]);
        }),
        untilDestroyed(this)
      )
      .subscribe(agents => {
        this.agents = agents;
        this.isLoadingAgents = false;
      });
  }
}
