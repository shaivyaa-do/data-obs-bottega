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

import { CommonModule } from "@angular/common";
import { ComponentFixture, fakeAsync, TestBed, tick } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { NzResizeHandlesComponent } from "ng-zorro-antd/resizable";
import { PropertyEditorComponent, PROPERTY_PANEL_TOP_OFFSET_PX } from "./property-editor.component";
import {
  mockPoint,
  mockResultPredicate,
  mockScanPredicate,
  mockScanResultLink,
} from "../../service/workflow-graph/model/mock-workflow-data";
import { WorkflowActionService } from "../../service/workflow-graph/model/workflow-action.service";
import { OperatorPropertyEditFrameComponent } from "./operator-property-edit-frame/operator-property-edit-frame.component";
import { PortPropertyEditFrameComponent } from "./port-property-edit-frame/port-property-edit-frame.component";
import { PanelService } from "../../service/panel/panel.service";
import { FormBindingService } from "../../service/form-binding/form-binding.service";
import { HttpClientTestingModule } from "@angular/common/http/testing";
import { OperatorMetadataService } from "../../service/operator-metadata/operator-metadata.service";
import { StubOperatorMetadataService } from "../../service/operator-metadata/stub-operator-metadata.service";
import { ComputingUnitStatusService } from "../../../common/service/computing-unit/computing-unit-status/computing-unit-status.service";
import { MockComputingUnitStatusService } from "../../../common/service/computing-unit/computing-unit-status/mock-computing-unit-status.service";
import { commonTestProviders } from "../../../common/testing/test-utils";

describe("PropertyEditorComponent", () => {
  let component: PropertyEditorComponent;
  let fixture: ComponentFixture<PropertyEditorComponent>;
  let workflowActionService: WorkflowActionService;
  let panelService: PanelService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropertyEditorComponent, CommonModule, HttpClientTestingModule],
      providers: [
        {
          provide: OperatorMetadataService,
          useClass: StubOperatorMetadataService,
        },
        { provide: ComputingUnitStatusService, useClass: MockComputingUnitStatusService },
        ...commonTestProviders,
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PropertyEditorComponent);
    component = fixture.componentInstance;
    workflowActionService = TestBed.inject(WorkflowActionService);
    panelService = TestBed.inject(PanelService);
    fixture.detectChanges();
  });

  afterEach(() => {
    // Note: no fixture.whenStable() here — the rendered child frames keep the zone
    // perpetually unstable, so awaiting it hangs teardown and leaves TestBed un-reset
    // (causing "test module already instantiated" on the next spec). Destroy synchronously.
    fixture.destroy();
    vi.restoreAllMocks();
    localStorage.removeItem("right-panel-width");
    localStorage.removeItem("right-panel-height");
    localStorage.removeItem("right-panel-style");
    localStorage.removeItem("property-panel-dock");
  });

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  /**
   * test if the property editor correctly receives the operator unhighlight stream
   *  and clears all the operator data, and hide the form.
   */
  it("should clear and hide the property editor panel correctly when no operator is highlighted", () => {
    const jointGraphWrapper = workflowActionService.getJointGraphWrapper();

    // add and highlight an operator
    workflowActionService.addOperator(mockScanPredicate, mockPoint);
    jointGraphWrapper.highlightOperators(mockScanPredicate.operatorID);

    fixture.detectChanges();

    expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);
    expect(component.componentInputs).toEqual({
      currentOperatorId: mockScanPredicate.operatorID,
      exposeChoosing: false,
    });

    // unhighlight the operator
    jointGraphWrapper.unhighlightOperators(mockScanPredicate.operatorID);
    expect(jointGraphWrapper.getCurrentHighlightedOperatorIDs()).toEqual([]);
    fixture.detectChanges();

    // check if the clearPropertyEditor called after the operator
    //  is unhighlighted has correctly updated the variables
    expect(component.currentComponent).toBeNull();
  });

  it("should clear and hide the property editor panel correctly when multiple operators are highlighted", () => {
    const jointGraphWrapper = workflowActionService.getJointGraphWrapper();

    // add and highlight two operators
    workflowActionService.addOperatorsAndLinks(
      [
        { op: mockScanPredicate, pos: mockPoint },
        { op: mockResultPredicate, pos: mockPoint },
      ],
      []
    );
    jointGraphWrapper.highlightOperators(mockScanPredicate.operatorID, mockResultPredicate.operatorID);

    // assert that multiple operators are highlighted
    expect(jointGraphWrapper.getCurrentHighlightedOperatorIDs()).toContain(mockResultPredicate.operatorID);
    expect(jointGraphWrapper.getCurrentHighlightedOperatorIDs()).toContain(mockScanPredicate.operatorID);
    fixture.detectChanges();

    // expect that the property editor is cleared
    expect(component.currentComponent).toBeNull();
  });

  it("should switch the content of property editor to another operator from the former operator correctly", () => {
    const jointGraphWrapper = workflowActionService.getJointGraphWrapper();

    // add two operators
    workflowActionService.addOperator(mockScanPredicate, mockPoint);
    workflowActionService.addOperator(mockResultPredicate, mockPoint);

    // highlight the first operator
    jointGraphWrapper.highlightOperators(mockScanPredicate.operatorID);
    fixture.detectChanges();

    // check the variables
    expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);
    expect(component.componentInputs).toEqual({
      currentOperatorId: mockScanPredicate.operatorID,
      exposeChoosing: false,
    });

    // unhighlight the operator
    jointGraphWrapper.unhighlightOperators(mockScanPredicate.operatorID);
    fixture.detectChanges();

    expect(component.currentComponent).toBeNull();

    // highlight the second operator
    jointGraphWrapper.highlightOperators(mockResultPredicate.operatorID);
    fixture.detectChanges();

    expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);
    expect(component.componentInputs).toEqual({
      currentOperatorId: mockResultPredicate.operatorID,
      exposeChoosing: false,
    });
  });

  it("should show the port property frame when exactly one port (and no link) is highlighted", () => {
    const jointGraphWrapper = workflowActionService.getJointGraphWrapper();

    workflowActionService.addOperator(mockScanPredicate, mockPoint);
    const port = { operatorID: mockScanPredicate.operatorID, portID: mockScanPredicate.outputPorts[0].portID };

    jointGraphWrapper.highlightPorts(port);
    fixture.detectChanges();

    expect(jointGraphWrapper.getCurrentHighlightedPortIDs()).toEqual([port]);
    expect(component.currentComponent).toBe(PortPropertyEditFrameComponent);
    expect(component.componentInputs).toEqual({ currentPortID: port });
  });

  it("should switch from the operator frame to the port frame when the highlight moves from an operator to a port", () => {
    const jointGraphWrapper = workflowActionService.getJointGraphWrapper();

    workflowActionService.addOperator(mockScanPredicate, mockPoint);

    // start on the operator frame
    jointGraphWrapper.highlightOperators(mockScanPredicate.operatorID);
    fixture.detectChanges();
    expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);

    // moving the highlight to one of its ports swaps the frame
    const port = { operatorID: mockScanPredicate.operatorID, portID: mockScanPredicate.outputPorts[0].portID };
    jointGraphWrapper.unhighlightOperators(mockScanPredicate.operatorID);
    jointGraphWrapper.highlightPorts(port);
    fixture.detectChanges();

    expect(jointGraphWrapper.getCurrentHighlightedOperatorIDs()).toEqual([]);
    expect(component.currentComponent).toBe(PortPropertyEditFrameComponent);
    expect(component.componentInputs).toEqual({ currentPortID: port });
  });

  it("should clear the panel when a port and a link are highlighted at the same time", () => {
    const jointGraphWrapper = workflowActionService.getJointGraphWrapper();

    workflowActionService.addOperatorsAndLinks(
      [
        { op: mockScanPredicate, pos: mockPoint },
        { op: mockResultPredicate, pos: mockPoint },
      ],
      [mockScanResultLink]
    );

    // highlight the link first; highlighting a port afterwards does not clear the link,
    // so both a link and a port end up highlighted -> the port branch guard fails
    jointGraphWrapper.highlightLinks(mockScanResultLink.linkID);
    fixture.detectChanges();
    expect(component.currentComponent).toBeNull();

    const port = { operatorID: mockScanPredicate.operatorID, portID: mockScanPredicate.outputPorts[0].portID };
    jointGraphWrapper.highlightPorts(port);
    fixture.detectChanges();

    expect(jointGraphWrapper.getCurrentHighlightedLinkIDs()).toEqual([mockScanResultLink.linkID]);
    expect(jointGraphWrapper.getCurrentHighlightedPortIDs()).toEqual([port]);
    expect(component.currentComponent).toBeNull();
  });

  it("should clear currentlyEditing shared awareness when the panel is cleared", () => {
    const jointGraphWrapper = workflowActionService.getJointGraphWrapper();
    const awarenessSpy = vi.spyOn(workflowActionService.getTexeraGraph(), "updateSharedModelAwareness");

    // add and highlight an operator, then unhighlight to fall into the "clear" branch
    workflowActionService.addOperator(mockScanPredicate, mockPoint);
    jointGraphWrapper.highlightOperators(mockScanPredicate.operatorID);
    fixture.detectChanges();
    awarenessSpy.mockClear();

    jointGraphWrapper.unhighlightOperators(mockScanPredicate.operatorID);
    fixture.detectChanges();

    expect(component.currentComponent).toBeNull();
    expect(awarenessSpy).toHaveBeenCalledWith("currentlyEditing", undefined);
  });

  it("should not react to highlight changes while the texera graph is not syncing", () => {
    const jointGraphWrapper = workflowActionService.getJointGraphWrapper();

    // establish the operator frame while the graph is syncing
    workflowActionService.addOperator(mockScanPredicate, mockPoint);
    jointGraphWrapper.highlightOperators(mockScanPredicate.operatorID);
    fixture.detectChanges();
    expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);

    // turn off graph sync -> the filter guard should reject every subsequent highlight event
    workflowActionService.getTexeraGraph().setSyncTexeraGraph(false);
    jointGraphWrapper.unhighlightOperators(mockScanPredicate.operatorID);
    fixture.detectChanges();

    // the graph state changed (nothing highlighted) but the panel did not react to it
    expect(jointGraphWrapper.getCurrentHighlightedOperatorIDs()).toEqual([]);
    expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);
  });

  it("onResize should schedule a width update through requestAnimationFrame", () => {
    const heightBefore = component.height;
    const cancelSpy = vi.spyOn(window, "cancelAnimationFrame");
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback): number => {
      cb(0);
      return 4242;
    });

    component.onResize({ width: 517, height: 421 } as any);

    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(rafSpy).toHaveBeenCalledTimes(1);
    expect(component.width).toBe(517);
    expect(component.height).toBe(heightBefore);
    expect(component.id).toBe(4242);
  });

  it("closePanel should collapse the panel to a docked bar", () => {
    component.width = 260;
    component.height = 300;

    component.closePanel();

    expect(component.width).toBe(0);
    expect(component.height).toBe(65);
  });

  it("openPanel should restore the default open dimensions", () => {
    const heightSpy = vi.spyOn(component as any, "updateHeightBasedOnContent").mockImplementation(() => {});
    component.width = 0;
    component.height = 65;

    component.openPanel();

    expect(component.width).toBe(280);
    expect(component.height).toBe(PropertyEditorComponent.fullPanelHeight());
    expect(heightSpy).toHaveBeenCalledTimes(1);
  });

  it("resetPanelPosition should snap the drag position back to the return position", () => {
    component.returnPosition = { x: 12, y: -34 };

    component.resetPanelPosition();

    expect(component.dragPosition).toEqual({ x: 12, y: -34 });
  });

  it("should close the panel in response to the panel service close stream", () => {
    component.width = 260;
    component.height = 300;

    panelService.closePanels();

    expect(component.width).toBe(0);
    expect(component.height).toBe(65);
  });

  it("should reset position and re-open the panel in response to the panel service reset stream", () => {
    const heightSpy = vi.spyOn(component as any, "updateHeightBasedOnContent").mockImplementation(() => {});
    component.returnPosition = { x: 7, y: 9 };
    component.width = 0;
    component.height = 65;

    panelService.resetPanels();

    expect(component.dragPosition).toEqual({ x: 0, y: 0 });
    expect(component.width).toBe(280);
    expect(component.height).toBe(PropertyEditorComponent.fullPanelHeight());
    expect(heightSpy).toHaveBeenCalled();
  });

  it("should persist the panel size to localStorage on the window beforeunload host listener", () => {
    component.width = 199;
    component.height = 288;

    window.dispatchEvent(new Event("beforeunload"));

    expect(localStorage.getItem("right-panel-width")).toBe("199");
    expect(localStorage.getItem("right-panel-height")).toBe("288");
  });

  it("updateHeightBasedOnContent fills the remaining viewport below the menu", () => {
    component.height = 65;

    (component as any).updateHeightBasedOnContent();

    expect(component.height).toBe(Math.max(300, window.innerHeight - PROPERTY_PANEL_TOP_OFFSET_PX));
  });

  it("ngOnDestroy should persist width/height but skip the style when the right-container is missing", () => {
    localStorage.removeItem("right-panel-style");
    component.width = 137;
    component.height = 246;
    vi.spyOn(document, "getElementById").mockReturnValue(null);

    component.ngOnDestroy();

    expect(localStorage.getItem("right-panel-width")).toBe("137");
    expect(localStorage.getItem("right-panel-height")).toBe("246");
    expect(localStorage.getItem("right-panel-style")).toBeNull();
  });

  it("should read the persisted width from localStorage and always use full viewport height", () => {
    localStorage.setItem("right-panel-width", "321");
    localStorage.setItem("right-panel-height", "654");

    const persistedFixture = TestBed.createComponent(PropertyEditorComponent);
    try {
      expect(persistedFixture.componentInstance.width).toBe(321);
      expect(persistedFixture.componentInstance.height).toBe(PropertyEditorComponent.fullPanelHeight());
    } finally {
      persistedFixture.destroy();
    }
  });

  it("should fall back to default dimensions when localStorage has no persisted size", () => {
    localStorage.removeItem("right-panel-width");
    localStorage.removeItem("right-panel-height");

    const freshFixture = TestBed.createComponent(PropertyEditorComponent);
    try {
      expect(freshFixture.componentInstance.width).toBe(260);
      expect(freshFixture.componentInstance.height).toBe(PropertyEditorComponent.fullPanelHeight());
    } finally {
      freshFixture.destroy();
    }
  });

  // ─── template rendering ────────────────────────────────────────────────────
  // The docked buttons swap between a collapse and an expand item depending on the
  // panel width; drive both through the DOM so each (click) binding executes.
  describe("template rendering", () => {
    const dockedItems = (): HTMLElement[] =>
      Array.from(fixture.nativeElement.querySelectorAll("#docked-buttons li")) as HTMLElement[];

    it("collapses the panel when the header collapse item is clicked", () => {
      component.width = 280;
      fixture.detectChanges();

      const collapse = Array.from(
        fixture.nativeElement.querySelectorAll("#property-buttons li") as NodeListOf<HTMLElement>
      ).at(-1) as HTMLElement;
      expect(collapse).toBeTruthy();
      collapse.click();
      fixture.detectChanges();

      expect(component.width).toBe(0);
    });

    it("reopens the panel when the collapsed docked item is clicked", () => {
      // openPanel() schedules a setTimeout that would call detectChanges() after the
      // fixture is destroyed in afterEach; stub it the way the specs above do.
      vi.spyOn(component as any, "updateHeightBasedOnContent").mockImplementation(() => {});
      component.width = 0;
      component.currentComponent = OperatorPropertyEditFrameComponent;
      fixture.detectChanges();

      const items = dockedItems();
      expect(items).toHaveLength(1); // only the expand arm renders while collapsed
      items[0].click();
      fixture.detectChanges();

      expect(component.width).toBe(280);
    });

    it("pins the open panel to the left of the workspace", () => {
      component.width = 280;
      component.leftDockOffset = 0;
      component.currentComponent = OperatorPropertyEditFrameComponent;
      component.dragPosition = { x: 0, y: 0 };
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector("#right-container") as HTMLElement;
      expect(container.classList.contains("left-docked")).toBe(true);
      expect(container.style.left).toBe("0px");
      expect(fixture.nativeElement.querySelector("#title").textContent).toContain("Property");
      expect((fixture.nativeElement.querySelector("#docked-buttons") as HTMLElement).hidden).toBe(true);
      const header = fixture.nativeElement.querySelector(".panel-header-bar") as HTMLElement;
      expect(header).toBeTruthy();
      expect(header.querySelector("#title")).toBeTruthy();
      expect(header.querySelector("#property-buttons")).toBeTruthy();
    });

    it("sits to the right of the operators panel when that panel is open", () => {
      const left = document.createElement("div");
      left.id = "left-container";
      Object.defineProperty(left, "offsetWidth", { value: 230, configurable: true });
      document.body.appendChild(left);
      try {
        component.updateLeftDockOffset();
        expect(component.leftDockOffset).toBe(230);
      } finally {
        left.remove();
      }
    });

    it("docks beside the operators panel and resizes toward the canvas", () => {
      component.width = 280;
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector("#right-container") as HTMLElement;
      expect(container.classList.contains("left-docked")).toBe(true);

      const handles = fixture.debugElement.query(By.directive(NzResizeHandlesComponent));
      expect(handles.componentInstance.nzDirections).toEqual(["right"]);
    });
  });

  describe("choosing which properties the Form View exposes", () => {
    it("toggles choosing through the shared service", () => {
      const service = TestBed.inject(FormBindingService);
      vi.spyOn(service, "isChoosing").mockReturnValue(false);
      const setChoosing = vi.spyOn(service, "setChoosing");

      component.toggleChoosing();

      expect(setChoosing).toHaveBeenCalledWith(true);
    });

    it("renders the choose-fields button and toggles choosing when it is clicked", () => {
      const service = TestBed.inject(FormBindingService);
      vi.spyOn(service, "isChoosing").mockReturnValue(false);
      const setChoosing = vi.spyOn(service, "setChoosing");
      // The button is offered only where the Form View flag is on and the panel is open.
      vi.spyOn(component, "formViewFeatureEnabled", "get").mockReturnValue(true);
      component.width = 300;
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector("button.choose-fields") as HTMLButtonElement;
      expect(button).toBeTruthy();
      button.click();

      expect(setChoosing).toHaveBeenCalledWith(true);
    });

    it("hides the choose-fields button when the Form View flag is off", () => {
      vi.spyOn(component, "formViewFeatureEnabled", "get").mockReturnValue(false);
      component.width = 300;
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("button.choose-fields")).toBeNull();
    });

    it("remounts the operator frame when the expose-choosing input changes after first render", fakeAsync(() => {
      component.currentComponent = OperatorPropertyEditFrameComponent;

      component.ngOnChanges({
        exposeChoosing: { firstChange: false, currentValue: true, previousValue: false, isFirstChange: () => false },
      });
      expect(component.currentComponent).toBeNull();
      tick();

      expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);
    }));

    // The rebuild is deferred to a timer; if the panel is destroyed before it fires, the
    // timer must not run detectChanges on the destroyed view (which throws).
    it("skips the deferred frame rebuild when the view is destroyed before the timer fires", fakeAsync(() => {
      const f = TestBed.createComponent(PropertyEditorComponent);
      const comp = f.componentInstance;
      f.detectChanges();
      comp.currentComponent = OperatorPropertyEditFrameComponent;

      comp.ngOnChanges({
        exposeChoosing: { firstChange: false, currentValue: true, previousValue: false, isFirstChange: () => false },
      });
      expect(comp.currentComponent).toBeNull();

      f.destroy();

      expect(() => tick()).not.toThrow();
    }));

    it("does not remount when no operator frame is showing", () => {
      component.currentComponent = null;

      component.ngOnChanges({
        exposeChoosing: { firstChange: false, currentValue: true, previousValue: false, isFirstChange: () => false },
      });

      expect(component.currentComponent).toBeNull();
    });

    it("leaves the frame alone on the input's first change", () => {
      component.currentComponent = OperatorPropertyEditFrameComponent;

      component.ngOnChanges({
        exposeChoosing: { firstChange: true, currentValue: true, previousValue: undefined, isFirstChange: () => true },
      });

      expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);
    });

    it("remounts the frame when the toolbar toggles choosing", fakeAsync(() => {
      component.currentComponent = OperatorPropertyEditFrameComponent;

      TestBed.inject(FormBindingService).setChoosing(true);
      expect(component.currentComponent).toBeNull();
      tick();

      expect(component.currentComponent).toBe(OperatorPropertyEditFrameComponent);
    }));
  });
});
