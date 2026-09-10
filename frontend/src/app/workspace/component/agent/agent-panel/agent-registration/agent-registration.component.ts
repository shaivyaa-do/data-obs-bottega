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

import { Component, EventEmitter, OnDestroy, OnInit, Output } from "@angular/core";
import { AgentService, LLM_PROVIDER_API_KEY_STORAGE_KEY, ModelType } from "../../../../service/agent/agent.service";
import { sessionGetObject, sessionSetObject } from "../../../../../common/util/storage";
import { NotificationService } from "../../../../../common/service/notification/notification.service";
import { WorkflowActionService } from "../../../../service/workflow-graph/model/workflow-action.service";
import { ComputingUnitStatusService } from "../../../../../common/service/computing-unit/computing-unit-status/computing-unit-status.service";
import { ComputingUnitState } from "../../../../../common/type/computing-unit-connection.interface";
import { Subject, takeUntil } from "rxjs";
import { NgIf, NgFor } from "@angular/common";
import { NzSpinComponent } from "ng-zorro-antd/spin";
import { ɵNzTransitionPatchDirective } from "ng-zorro-antd/core/transition-patch";
import { NzIconDirective } from "ng-zorro-antd/icon";
import { NzSpaceCompactItemDirective } from "ng-zorro-antd/space";
import { NzInputDirective } from "ng-zorro-antd/input";
import { FormsModule } from "@angular/forms";
import { NzAlertComponent } from "ng-zorro-antd/alert";
import { NzButtonComponent } from "ng-zorro-antd/button";
import { NzWaveDirective } from "ng-zorro-antd/core/wave";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";

@Component({
  selector: "texera-agent-registration",
  templateUrl: "agent-registration.component.html",
  styleUrls: ["agent-registration.component.scss"],
  imports: [
    NgIf,
    NzSpinComponent,
    ɵNzTransitionPatchDirective,
    NzIconDirective,
    NgFor,
    NzSpaceCompactItemDirective,
    NzInputDirective,
    FormsModule,
    NzAlertComponent,
    NzButtonComponent,
    NzWaveDirective,
    NzTooltipDirective,
  ],
})
export class AgentRegistrationComponent implements OnInit, OnDestroy {
  @Output() agentCreated = new EventEmitter<string>();

  public modelTypes: ModelType[] = [];
  public selectedModelType: string | null = null;
  public customAgentName: string = "";
  public providerApiKey = "";
  public apiKeyVisible = false;
  public isLoadingModels: boolean = false;
  public hasLoadingError: boolean = false;
  public computingUnitConnected: boolean = false;
  public isCreating: boolean = false;

  private destroy$ = new Subject<void>();

  constructor(
    private agentService: AgentService,
    private notificationService: NotificationService,
    private workflowActionService: WorkflowActionService,
    private computingUnitStatusService: ComputingUnitStatusService
  ) {}

  ngOnInit(): void {
    const savedKey = sessionGetObject<string>(LLM_PROVIDER_API_KEY_STORAGE_KEY);
    if (typeof savedKey === "string") {
      this.providerApiKey = savedKey;
    }
    this.isLoadingModels = true;
    this.hasLoadingError = false;

    this.computingUnitStatusService
      .getStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe(status => {
        this.computingUnitConnected = status === ComputingUnitState.Running;
      });

    this.agentService
      .fetchModelTypes()
      .pipe(takeUntil(this.destroy$))
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
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public selectModelType(modelTypeId: string): void {
    this.selectedModelType = modelTypeId;
  }

  public selectSuggestion(suggestion: string): void {
    this.customAgentName = suggestion;
  }

  public createAgent(): void {
    if (!this.selectedModelType || this.trimmedAgentName() === "" || this.isCreating) {
      return;
    }

    this.isCreating = true;

    const workflowMetadata = this.workflowActionService.getWorkflowMetadata();
    const workflowId = workflowMetadata?.wid;

    const providerApiKey = this.providerApiKey.trim() || undefined;
    if (providerApiKey) {
      sessionSetObject(LLM_PROVIDER_API_KEY_STORAGE_KEY, providerApiKey);
    }

    this.agentService
      .createAgent(this.selectedModelType!, this.trimmedAgentName(), workflowId, providerApiKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: agentInfo => {
          this.agentCreated.emit(agentInfo.id);
          this.resetForm();
        },
        error: (error: unknown) => {
          this.notificationService.error(`Failed to create agent: ${error}`);
          this.isCreating = false;
        },
      });
  }

  private resetForm(): void {
    this.selectedModelType = null;
    this.customAgentName = "";
    this.isCreating = false;
  }

  public canCreate(): boolean {
    return this.selectedModelType !== null && this.trimmedAgentName() !== "" && !this.isCreating && this.computingUnitConnected;
  }

  public trimmedAgentName(): string {
    return this.customAgentName.trim();
  }
}
