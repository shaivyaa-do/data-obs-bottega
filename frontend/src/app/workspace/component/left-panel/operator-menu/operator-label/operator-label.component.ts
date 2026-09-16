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

import { DragDropService } from "../../../../service/drag-drop/drag-drop.service";
import { WorkflowActionService } from "../../../../service/workflow-graph/model/workflow-action.service";
import { WorkflowUtilService } from "../../../../service/workflow-graph/util/workflow-util.service";
import { AfterContentInit, Component, Input } from "@angular/core";
import { OperatorSchema } from "../../../../types/operator-schema.interface";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { Point } from "../../../../types/workflow-common.interface";
import { CdkDropList, CdkDrag, CdkDragPreview } from "@angular/cdk/drag-drop";
import { NgClass } from "@angular/common";

@UntilDestroy()
@Component({
  selector: "texera-operator-label",
  templateUrl: "operator-label.component.html",
  styleUrls: ["operator-label.component.scss"],
  imports: [CdkDropList, CdkDrag, NgClass, CdkDragPreview],
})
export class OperatorLabelComponent implements AfterContentInit {
  @Input() operator?: OperatorSchema;
  /** Search autocomplete already adds on selection, so those labels turn this off. */
  @Input() clickAddsToCanvas = true;
  public draggable = true;
  private addedByDrag = false;

  constructor(
    private dragDropService: DragDropService,
    private workflowActionService: WorkflowActionService,
    private workflowUtilService: WorkflowUtilService
  ) {}

  ngAfterContentInit(): void {
    this.workflowActionService
      .getWorkflowModificationEnabledStream()
      .pipe(untilDestroyed(this))
      .subscribe(canModify => {
        this.draggable = canModify;
      });
  }

  dragStarted() {
    this.addedByDrag = false;
    if (this.draggable) {
      this.dragDropService.dragStarted(this.operator!.operatorType);
    }
  }

  dragDropped(dropPoint: Point) {
    this.addedByDrag = true;
    this.dragDropService.dragDropped(dropPoint);
  }

  onClick(event: Event): void {
    event.stopPropagation();
    if (!this.clickAddsToCanvas || !this.draggable || !this.operator || this.addedByDrag) {
      this.addedByDrag = false;
      return;
    }
    this.addAtDefaultPosition();
  }

  private addAtDefaultPosition(): void {
    const origin = this.workflowActionService.getJointGraphWrapper().getMainJointPaper()?.translate();
    const point = { x: 400 - (origin?.tx ?? 0), y: 200 - (origin?.ty ?? 0) };
    this.workflowActionService.addOperator(
      this.workflowUtilService.getNewOperatorPredicate(this.operator!.operatorType),
      point
    );
  }
}
