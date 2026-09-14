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

import { readFileSync } from "node:fs";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { Router } from "@angular/router";
import { RouterTestingModule } from "@angular/router/testing";
import { NoopAnimationsModule } from "@angular/platform-browser/animations";
import { of, throwError, Subject } from "rxjs";
import { UserAgentComponent } from "./user-agent.component";
import { AgentInfo, AgentService, LLM_PROVIDER_API_KEY_STORAGE_KEY, ModelType } from "../../../../workspace/service/agent/agent.service";
import { NotificationService } from "../../../../common/service/notification/notification.service";
import { ComputingUnitStatusService } from "../../../../common/service/computing-unit/computing-unit-status/computing-unit-status.service";
import { USER_COMPUTING_UNIT, USER_WORKSPACE } from "../../../../app-routing.constant";
import { commonTestProviders } from "../../../../common/testing/test-utils";
import { NzModalService } from "ng-zorro-antd/modal";
import { NzPopoverDirective } from "ng-zorro-antd/popover";

const MODEL: ModelType = { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", description: "Model: claude-haiku-4.5", icon: "robot" };

const USER_INFO = { uid: 1, name: "user", email: "user@example.com", role: "REGULAR" };

function makeAgent(id: string, overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id,
    name: `Agent ${id}`,
    modelType: "gpt-test",
    isBaselineMode: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    delegate: { userInfo: USER_INFO, workflowId: 10, workflowName: "Sales pipeline" },
    ...overrides,
  };
}

describe("UserAgentComponent", () => {
  let fixture: ComponentFixture<UserAgentComponent>;
  let component: UserAgentComponent;
  let fetchModelTypes: ReturnType<typeof vi.fn>;
  let createAgent: ReturnType<typeof vi.fn>;
  let getAllAgents: ReturnType<typeof vi.fn>;
  let deleteAgent: ReturnType<typeof vi.fn>;
  let notifyError: ReturnType<typeof vi.fn>;
  let notifyInfo: ReturnType<typeof vi.fn>;
  let notifySuccess: ReturnType<typeof vi.fn>;
  let getAllComputingUnits: ReturnType<typeof vi.fn>;
  let navigateSpy: ReturnType<typeof vi.spyOn>;
  let agentChangeSubject: Subject<void>;

  beforeEach(async () => {
    fetchModelTypes = vi.fn().mockReturnValue(of([MODEL]));
    createAgent = vi.fn();
    getAllAgents = vi.fn().mockReturnValue(of([]));
    deleteAgent = vi.fn();
    notifyError = vi.fn();
    notifyInfo = vi.fn();
    notifySuccess = vi.fn();
    getAllComputingUnits = vi.fn().mockReturnValue(of([{ status: "Running" }]));
    agentChangeSubject = new Subject<void>();

    await TestBed.configureTestingModule({
      imports: [UserAgentComponent, HttpClientTestingModule, RouterTestingModule, NoopAnimationsModule],
      providers: [
        NzModalService,
        {
          provide: AgentService,
          useValue: {
            fetchModelTypes,
            createAgent,
            getAllAgents,
            deleteAgent,
            agentChange$: agentChangeSubject.asObservable(),
          },
        },
        { provide: NotificationService, useValue: { error: notifyError, info: notifyInfo, success: notifySuccess } },
        { provide: ComputingUnitStatusService, useValue: { getAllComputingUnits } },
        ...commonTestProviders,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserAgentComponent);
    component = fixture.componentInstance;
    navigateSpy = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("loads available models and a running computing unit", () => {
    fixture.detectChanges();

    expect(component.modelTypes).toEqual([MODEL]);
    expect(component.customAgentName).toBe("");
    expect(component.isLoadingModels).toBe(false);
    expect(component.hasRunningComputingUnit).toBe(true);
    expect(component.hasLoadingError).toBe(false);
  });

  it("flags a loading error when LiteLLM returns no models", () => {
    fetchModelTypes.mockReturnValue(of([]));
    fixture.detectChanges();

    expect(component.hasLoadingError).toBe(true);
    expect(notifyError).toHaveBeenCalled();
  });

  it("flags a loading error when fetching models fails", () => {
    fetchModelTypes.mockReturnValue(throwError(() => new Error("gateway down")));
    fixture.detectChanges();

    expect(component.hasLoadingError).toBe(true);
    expect(notifyError).toHaveBeenCalled();
  });

  it("cannot create until a model, an API key, and a name are set", () => {
    fixture.detectChanges();
    expect(component.canCreate()).toBe(false);

    component.selectModelType(MODEL.id);
    expect(component.canCreate()).toBe(false);

    component.providerApiKey = "sk-ant-test";
    expect(component.canCreate()).toBe(false);

    component.customAgentName = "Builder";
    expect(component.canCreate()).toBe(true);
  });

  it("does not create when the API key is blank", () => {
    fixture.detectChanges();
    component.selectModelType(MODEL.id);
    component.customAgentName = "Builder";
    component.providerApiKey = "   ";
    component.createAgent();
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("does not create when the agent name is blank", () => {
    fixture.detectChanges();
    component.selectModelType(MODEL.id);
    component.providerApiKey = "sk-ant-test";
    component.customAgentName = "   ";
    component.createAgent();
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("does not create when no model is selected", () => {
    fixture.detectChanges();
    component.providerApiKey = "sk-ant-test";
    component.createAgent();
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("creates an unbound agent and stays on the agents page", () => {
    createAgent.mockReturnValue(of({ id: "agent-7" }));
    fixture.detectChanges();
    component.selectModelType(MODEL.id);
    component.providerApiKey = "  sk-ant-test  ";
    component.customAgentName = "Builder";

    component.createAgent();

    expect(createAgent).toHaveBeenCalledWith(MODEL.id, "Builder", undefined, "sk-ant-test");
    expect(sessionStorage.getItem(LLM_PROVIDER_API_KEY_STORAGE_KEY)).toBe(JSON.stringify("sk-ant-test"));
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(notifySuccess).toHaveBeenCalled();
    expect(component.customAgentName).toBe("");
    expect(component.isCreating).toBe(false);
  });

  it("surfaces an agent-creation failure and does not navigate", () => {
    createAgent.mockReturnValue(throwError(() => new Error("agent down")));
    fixture.detectChanges();
    component.selectModelType(MODEL.id);
    component.providerApiKey = "sk-ant-test";
    component.customAgentName = "Builder";

    component.createAgent();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(component.isCreating).toBe(false);
  });

  it("warns when no computing unit is running", () => {
    getAllComputingUnits.mockReturnValue(of([{ status: "Pending" }]));
    fixture.detectChanges();
    expect(component.hasRunningComputingUnit).toBe(false);
    expect(component.computingUnitRoute).toBe(USER_COMPUTING_UNIT);
  });

  it("prefills the API key from this browser session", () => {
    sessionStorage.setItem(LLM_PROVIDER_API_KEY_STORAGE_KEY, JSON.stringify("sk-ant-saved"));
    fixture.detectChanges();
    expect(component.providerApiKey).toBe("sk-ant-saved");
  });

  describe("configured agents list", () => {
    it("renders configured agents in a table", () => {
      const agents = [makeAgent("a"), makeAgent("b", { name: "Researcher", modelType: "claude-haiku-4.5" })];
      getAllAgents.mockReturnValue(of(agents));
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("nz-table.agent-table")).toBeTruthy();
      expect(getAllAgents).toHaveBeenCalledTimes(1);
      expect(fixture.nativeElement.querySelector(".page-title")?.textContent).toContain("Agents");
      const names = Array.from(
        fixture.nativeElement.querySelectorAll(".configured-agent-name") as NodeListOf<HTMLElement>
      ).map(el => el.textContent?.trim());
      expect(names).toEqual(["Agent a", "Researcher"]);
      expect(fixture.nativeElement.textContent).toContain("gpt-test");
      expect(fixture.nativeElement.textContent).toContain("claude-haiku-4.5");
      expect(fixture.nativeElement.textContent).toContain("Sales pipeline");
    });

    it("shows an empty state when no agents are configured", () => {
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll(".configured-agent-item").length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain("No agents configured yet");
    });

    it("reloads the list when the agent service signals a change", () => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("No agents configured yet");

      getAllAgents.mockReturnValue(of([makeAgent("a")]));
      agentChangeSubject.next();
      fixture.detectChanges();

      expect(getAllAgents).toHaveBeenCalledTimes(2);
      expect(fixture.nativeElement.querySelector(".configured-agent-name").textContent).toContain("Agent a");
    });

    it("notifies and shows empty list when loading agents fails", () => {
      getAllAgents.mockReturnValue(throwError(() => new Error("backend down")));
      fixture.detectChanges();

      expect(notifyError).toHaveBeenCalled();
      expect(fixture.nativeElement.textContent).toContain("No agents configured yet");
    });

    it("opens the agent's workflow from the list", () => {
      getAllAgents.mockReturnValue(of([makeAgent("a")]));
      fixture.detectChanges();

      (fixture.nativeElement.querySelector(".configured-agent-open") as HTMLButtonElement).click();

      expect(navigateSpy).toHaveBeenCalledWith([USER_WORKSPACE, 10], { queryParams: { agent: "a" } });
    });

    it("does not open an agent that has no workflow", () => {
      getAllAgents.mockReturnValue(of([makeAgent("loose", { delegate: undefined })]));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("Any workflow");
      (fixture.nativeElement.querySelector(".configured-agent-open") as HTMLButtonElement).click();

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(notifyInfo).toHaveBeenCalled();
    });

    it("falls back to the workflow id when the agent has no workflow name", () => {
      getAllAgents.mockReturnValue(of([makeAgent("a", { delegate: { userInfo: USER_INFO, workflowId: 99 } })]));
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("Workflow 99");
    });

    it("deletes an agent after confirmation and leaves the list unchanged when cancelled", () => {
      getAllAgents.mockReturnValue(of([makeAgent("a")]));
      deleteAgent.mockReturnValue(of(true));
      fixture.detectChanges();

      vi.spyOn(window, "confirm").mockReturnValueOnce(false);
      (fixture.nativeElement.querySelector(".configured-agent-delete") as HTMLButtonElement).click();
      expect(deleteAgent).not.toHaveBeenCalled();

      vi.spyOn(window, "confirm").mockReturnValueOnce(true);
      (fixture.nativeElement.querySelector(".configured-agent-delete") as HTMLButtonElement).click();
      expect(deleteAgent).toHaveBeenCalledWith("a");
    });

    it("notifies when deleting an agent fails", () => {
      getAllAgents.mockReturnValue(of([makeAgent("a")]));
      deleteAgent.mockReturnValue(throwError(() => new Error("boom")));
      vi.spyOn(window, "confirm").mockReturnValue(true);
      fixture.detectChanges();

      (fixture.nativeElement.querySelector(".configured-agent-delete") as HTMLButtonElement).click();

      expect(notifyError).toHaveBeenCalled();
    });
  });

  describe("configure agent modal", () => {
    it("shows only the agents table until Configure agent is opened", () => {
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector(".create-btn")?.textContent).toContain("Configure agent");
      expect(fixture.nativeElement.querySelector(".model-cards")).toBeNull();
      expect(fixture.nativeElement.querySelector(".agent-name-input")).toBeNull();
      expect(component.configureVisible).toBe(false);
    });

    it("opens the configure modal from the toolbar button", () => {
      fixture.detectChanges();
      (fixture.nativeElement.querySelector(".create-btn") as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(component.configureVisible).toBe(true);
    });

    it("hides provider API key help behind an info icon until it is clicked", () => {
      component.configureVisible = true;
      fixture.detectChanges();

      const info = fixture.debugElement.query(By.css(".api-key-info"));
      expect(info).toBeTruthy();
      expect(info.injector.get(NzPopoverDirective).trigger).toBe("click");
      expect(info.injector.get(NzPopoverDirective).placement).toBe("bottom");
      expect(info.injector.get(NzPopoverDirective).overlayClassName).toBe("api-key-help-popover");
      expect(fixture.nativeElement.textContent).not.toContain("Use the key that matches the model");
      expect(document.querySelector(".ant-popover")).toBeNull();

      info.nativeElement.click();
      fixture.detectChanges();

      const panel = document.querySelector(".ant-popover.api-key-help-popover") as HTMLElement | null;
      expect(panel, "expected the API key help popover to open on click").toBeTruthy();
      expect(panel?.textContent).toContain("Use the key that matches the model");
      expect(panel?.textContent).toContain("not saved in the database");
    });

    it("wraps provider API key help in a compact popover with secondary text", () => {
      const css = (UserAgentComponent as unknown as { ɵcmp: { styles: string[] } }).ɵcmp.styles.join(" ");
      expect(css).toMatch(/\.api-key-help-popover[\s\S]*max-width:\s*260px/);
      expect(css).toMatch(/\.api-key-help-text[\s\S]*--text-secondary/);
      expect(css).toMatch(/\.api-key-help-text[\s\S]*white-space:\s*normal/);
    });

    it("uses a 360px configure-agent dialog", () => {
      fixture.detectChanges();
      const modal = fixture.debugElement.query(By.css("nz-modal"));
      expect(modal.componentInstance.nzWidth).toBe(360);
      expect(modal.componentInstance.nzWrapClassName).toBe("configure-agent-modal");
    });

    it("paints the Create agent submit button as a create-btn", () => {
      const template = readFileSync(
        "src/app/dashboard/component/user/user-agent/user-agent.component.html",
        "utf8"
      );
      expect(template).toMatch(/class="submit-btn create-btn"/);
      expect(template).toMatch(/Create agent/);
    });

    it("closes the configure modal after a successful create", () => {
      createAgent.mockReturnValue(of({ id: "agent-7" }));
      fixture.detectChanges();
      component.configureVisible = true;
      component.selectModelType(MODEL.id);
      component.providerApiKey = "sk-ant-test";
      component.customAgentName = "Builder";

      component.createAgent();

      expect(component.configureVisible).toBe(false);
    });
  });
});
