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

import { Component, HostListener, Input, OnDestroy, OnInit, OnChanges, SimpleChanges } from "@angular/core";
import { Router } from "@angular/router";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { NzResizeEvent, NzResizableDirective, NzResizeHandlesComponent } from "ng-zorro-antd/resizable";
import { AgentService, AgentInfo } from "../../../service/agent/agent.service";
import { WorkflowActionService } from "../../../service/workflow-graph/model/workflow-action.service";
import { calculateTotalTranslate3d } from "../../../../common/util/panel-dock";
import { NgIf, NgClass, NgFor } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { NzSpaceCompactItemDirective } from "ng-zorro-antd/space";
import { NzButtonComponent } from "ng-zorro-antd/button";
import { NzWaveDirective } from "ng-zorro-antd/core/wave";
import { ɵNzTransitionPatchDirective } from "ng-zorro-antd/core/transition-patch";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import { NzIconDirective } from "ng-zorro-antd/icon";
import { CdkDrag, CdkDragHandle } from "@angular/cdk/drag-drop";
import { NzMenuDirective, NzMenuItemComponent } from "ng-zorro-antd/menu";
import { NzSelectComponent, NzOptionComponent } from "ng-zorro-antd/select";
import { AgentChatComponent } from "./agent-chat/agent-chat.component";

@UntilDestroy()
@Component({
  selector: "texera-agent-panel",
  templateUrl: "agent-panel.component.html",
  styleUrls: ["agent-panel.component.scss"],
  imports: [
    NgIf,
    NzSpaceCompactItemDirective,
    NzButtonComponent,
    NzWaveDirective,
    ɵNzTransitionPatchDirective,
    NzTooltipDirective,
    NzIconDirective,
    CdkDrag,
    NzResizableDirective,
    NzMenuDirective,
    NgClass,
    NzMenuItemComponent,
    CdkDragHandle,
    FormsModule,
    NgFor,
    NzSelectComponent,
    NzOptionComponent,
    AgentChatComponent,
    NzResizeHandlesComponent,
  ],
})
export class AgentPanelComponent implements OnInit, OnDestroy, OnChanges {
  protected readonly window = window;
  private static readonly MIN_PANEL_WIDTH = 400;
  private static readonly MIN_PANEL_HEIGHT = 450;

  /**
   * Optional agent ID to activate when the panel loads.
   * When provided (from agent dashboard), the panel will open
   * and switch to this agent's tab automatically.
   */
  @Input() agentIdToActivate?: string;

  // Panel dimensions and position
  width: number = 0; // Start with 0 to show docked button
  height = Math.max(AgentPanelComponent.MIN_PANEL_HEIGHT, window.innerHeight * 0.7);
  id = -1;
  dragPosition = { x: 0, y: 0 };
  returnPosition = { x: 0, y: 0 };
  isDocked = true;

  // Index of the agent shown in the chat (and bound to the model dropdown).
  selectedTabIndex: number = 0;
  agents: AgentInfo[] = [];

  // Active agent tracking - only one agent can be connected at a time
  activeAgentId: string | null = null;
  /** Agent currently being rebound to this workflow; blocks ensureActiveAgent from racing. */
  private attachingAgentId: string | null = null;

  get selectedAgent(): AgentInfo | undefined {
    return this.agents[this.selectedTabIndex] ?? this.agents[0];
  }

  constructor(
    private agentService: AgentService,
    private workflowActionService: WorkflowActionService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadPanelSettings();

    // Subscribe to agent changes
    this.agentService.agentChange$.pipe(untilDestroyed(this)).subscribe(() => {
      this.agentService
        .getAllAgents()
        .pipe(untilDestroyed(this))
        .subscribe(agents => {
          this.applyAgentList(agents);
        });
    });

    // Load initial agents
    this.agentService
      .getAllAgents()
      .pipe(untilDestroyed(this))
      .subscribe(agents => {
        this.applyAgentList(agents);
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["agentIdToActivate"] && this.agentIdToActivate) {
      this.tryActivateAgentFromInput();
    }
  }

  /**
   * Replace the in-memory agent list and keep the current selection in range.
   */
  private applyAgentList(agents: AgentInfo[]): void {
    this.agents = agents;
    if (this.selectedTabIndex >= this.agents.length) {
      this.selectedTabIndex = Math.max(0, this.agents.length - 1);
    }
    this.tryActivateAgentFromInput();
    if (this.width > 0) {
      this.ensureActiveAgent();
    }
  }

  /**
   * Connect the first agent when the panel is open and none is active.
   * Any agent can work on the current workflow; bind happens in attachAndActivate.
   */
  private ensureActiveAgent(): void {
    if (this.activeAgentId || this.attachingAgentId || this.agents.length === 0) {
      return;
    }
    this.attachAndActivate(this.agents[0], 0);
  }

  /**
   * Try to activate the agent specified by agentIdToActivate input.
   * Opens the panel and switches to the agent's tab.
   */
  private tryActivateAgentFromInput(): void {
    if (!this.agentIdToActivate || this.agents.length === 0) {
      return;
    }

    const agentIndex = this.agents.findIndex(agent => agent.id === this.agentIdToActivate);
    if (agentIndex === -1) {
      return;
    }

    // Open the panel if it's closed
    if (this.width === 0) {
      this.width = AgentPanelComponent.MIN_PANEL_WIDTH;
    }

    const agent = this.agents[agentIndex];
    this.agentIdToActivate = undefined;
    this.attachAndActivate(agent, agentIndex);
  }

  @HostListener("window:beforeunload")
  ngOnDestroy(): void {
    // Deactivate any active agent before destroying
    this.deactivateCurrentAgent();
    this.savePanelSettings();
  }

  /**
   * Open the panel from docked state
   */
  public openPanel(): void {
    if (this.width === 0) {
      // Open panel
      this.width = AgentPanelComponent.MIN_PANEL_WIDTH;
      this.ensureActiveAgent();
    } else {
      // Close panel (dock it)
      this.width = 0;
      this.isDocked = true;
    }
  }

  /**
   * Dropdown label: agent name plus the configured model.
   */
  public agentDropdownLabel(agent: AgentInfo): string {
    return `${agent.name} · ${agent.modelType}`;
  }

  /**
   * Handle the model/agent dropdown under the ask bar.
   */
  public onAgentDropdownChange(agentId: string): void {
    const index = this.agents.findIndex(agent => agent.id === agentId);
    this.onTabSelectChange(index);
  }

  /**
   * Navigate to the user agents management dashboard
   */
  public navigateToAgentsDashboard(): void {
    this.router.navigate(["/user/agent"]);
  }

  /**
   * Handle agent creation - activates and switches to the new agent
   */
  public onAgentCreated(agentId: string): void {
    // Deactivate previous agent if any
    if (this.activeAgentId) {
      this.agentService.deactivateAgent(this.activeAgentId);
    }

    // Set the new agent as active immediately
    this.activeAgentId = agentId;
    this.agentService.activateAgent(agentId);

    // Fetch the latest agent list and switch to the new agent's tab
    this.agentService
      .getAllAgents()
      .pipe(untilDestroyed(this))
      .subscribe(agents => {
        this.applyAgentList(agents);
        const agentIndex = agents.findIndex(agent => agent.id === agentId);
        if (agentIndex !== -1) {
          this.selectedTabIndex = agentIndex;
        }
      });
  }

  /**
   * Handle tab selection change — bind the agent to the open workflow, then connect.
   */
  public onTabSelectChange(index: number): void {
    if (index < 0 || index >= this.agents.length) {
      return;
    }

    this.attachAndActivate(this.agents[index], index);
  }

  /**
   * Rebind the agent to the current workflow if needed, then open its websocket.
   * Bind failures do not activate: tools would otherwise edit the wrong workflow.
   */
  private attachAndActivate(agent: AgentInfo, index: number): void {
    const currentWid = this.workflowActionService.getWorkflowMetadata().wid;
    const alreadyOnCurrent = currentWid !== undefined && agent.delegate?.workflowId === currentWid;

    if (currentWid && !alreadyOnCurrent) {
      this.attachingAgentId = agent.id;
      this.agentService
        .bindAgentToWorkflow(agent.id, currentWid)
        .pipe(untilDestroyed(this))
        .subscribe({
          next: updated => {
            this.attachingAgentId = null;
            const i = this.agents.findIndex(a => a.id === agent.id);
            if (i !== -1) {
              this.agents[i] = { ...this.agents[i], ...updated, delegate: updated.delegate };
            }
            this.switchToAgent(agent.id, index);
          },
          error: () => {
            this.attachingAgentId = null;
          },
        });
      return;
    }

    this.switchToAgent(agent.id, index);
  }

  /**
   * Switch to a specific agent tab
   */
  private switchToAgent(agentId: string, tabIndex: number): void {
    // Skip if already on this agent and tab
    if (this.activeAgentId === agentId && this.selectedTabIndex === tabIndex) {
      return;
    }

    // Deactivate previous agent only if switching to a different agent
    if (this.activeAgentId !== agentId) {
      this.deactivateCurrentAgent();
    }

    // Activate new agent
    this.activeAgentId = agentId;
    this.agentService.activateAgent(agentId);
    this.selectedTabIndex = tabIndex;
  }

  /**
   * Deactivate the currently active agent
   */
  private deactivateCurrentAgent(): void {
    if (this.activeAgentId) {
      this.agentService.deactivateAgent(this.activeAgentId);
      this.activeAgentId = null;
    }
  }

  /**
   * Delete an agent
   */
  public deleteAgent(agentId: string, event: Event): void {
    event.stopPropagation(); // Prevent tab switch

    if (confirm("Are you sure you want to delete this agent?")) {
      const agentIndex = this.agents.findIndex(agent => agent.id === agentId);

      // Deactivate if this is the active agent
      if (this.activeAgentId === agentId) {
        this.deactivateCurrentAgent();
      }

      // Must subscribe to the observable for it to execute
      this.agentService
        .deleteAgent(agentId)
        .pipe(untilDestroyed(this))
        .subscribe({
          next: () => {
            if (agentIndex !== -1 && this.selectedTabIndex === agentIndex) {
              this.selectedTabIndex = Math.max(0, agentIndex - 1);
            } else if (this.selectedTabIndex > agentIndex) {
              this.selectedTabIndex--;
            }
          },
          error: (error: unknown) => {
            console.error("Failed to delete agent:", error);
          },
        });
    }
  }

  /**
   * Handle panel resize
   */
  onResize({ width, height }: NzResizeEvent): void {
    cancelAnimationFrame(this.id);
    this.id = requestAnimationFrame(() => {
      this.width = width!;
      this.height = height!;
    });
  }

  /**
   * Handle drag start
   */
  handleDragStart(): void {
    this.isDocked = false;
  }

  /**
   * Load panel settings from localStorage
   */
  private loadPanelSettings(): void {
    const savedWidth = localStorage.getItem("agent-panel-width");
    const savedHeight = localStorage.getItem("agent-panel-height");
    const savedStyle = localStorage.getItem("agent-panel-style");
    const savedDocked = localStorage.getItem("agent-panel-docked");

    // Only restore width if the panel was not docked
    if (savedDocked === "false" && savedWidth) {
      const parsedWidth = Number(savedWidth);
      if (!isNaN(parsedWidth) && parsedWidth >= AgentPanelComponent.MIN_PANEL_WIDTH) {
        this.width = parsedWidth;
      }
    }

    if (savedHeight) {
      const parsedHeight = Number(savedHeight);
      if (!isNaN(parsedHeight) && parsedHeight >= AgentPanelComponent.MIN_PANEL_HEIGHT) {
        this.height = parsedHeight;
      }
    }

    if (savedStyle) {
      const container = document.getElementById("agent-container");
      if (container) {
        container.style.cssText = savedStyle;
        const translates = container.style.transform;
        const [xOffset, yOffset] = calculateTotalTranslate3d(translates);
        this.returnPosition = { x: -xOffset, y: -yOffset };
        this.isDocked = this.dragPosition.x === this.returnPosition.x && this.dragPosition.y === this.returnPosition.y;
      }
    }
  }

  /**
   * Save panel settings to localStorage
   */
  private savePanelSettings(): void {
    localStorage.setItem("agent-panel-width", String(this.width));
    localStorage.setItem("agent-panel-height", String(this.height));
    localStorage.setItem("agent-panel-docked", String(this.width === 0));

    const container = document.getElementById("agent-container");
    if (container) {
      localStorage.setItem("agent-panel-style", container.style.cssText);
    }
  }
}
