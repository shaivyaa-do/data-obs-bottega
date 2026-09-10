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

import { Component, inject, OnInit } from "@angular/core";
import { UntilDestroy, untilDestroyed } from "@ngneat/until-destroy";
import { ExecutionQuota, File, Workflow, WorkflowQuota } from "../../../../common/type/user";
import { DatasetQuota } from "src/app/dashboard/type/quota-statistic.interface";
import {
  NzTableSortFn,
  NzTableComponent,
  NzTheadComponent,
  NzTrDirective,
  NzTableCellDirective,
  NzThMeasureDirective,
  NzThAddOnComponent,
  NzTbodyComponent,
} from "ng-zorro-antd/table";
import { UserQuotaService } from "src/app/dashboard/service/user/quota/user-quota.service";
import { AdminUserService } from "src/app/dashboard/service/admin/user/admin-user.service";
import { NZ_MODAL_DATA } from "ng-zorro-antd/modal";
import * as Plotly from "plotly.js-basic-dist-min";
import { formatSize } from "src/app/common/util/size-formatter.util";
import { NzCardComponent } from "ng-zorro-antd/card";
import { NzTabsComponent, NzTabComponent } from "ng-zorro-antd/tabs";
import { NzCollapseComponent, NzCollapsePanelComponent } from "ng-zorro-antd/collapse";
import { NgFor, NgIf } from "@angular/common";
import { NzSpaceCompactItemDirective } from "ng-zorro-antd/space";
import { NzButtonComponent } from "ng-zorro-antd/button";
import { NzWaveDirective } from "ng-zorro-antd/core/wave";
import { NzPopconfirmDirective } from "ng-zorro-antd/popconfirm";
import { ɵNzTransitionPatchDirective } from "ng-zorro-antd/core/transition-patch";
import { NzTooltipDirective } from "ng-zorro-antd/tooltip";
import { NzIconDirective } from "ng-zorro-antd/icon";
import { NzModalModule } from "ng-zorro-antd/modal";

type UserServiceType = AdminUserService | UserQuotaService;

@UntilDestroy()
@Component({
  templateUrl: "./user-quota.component.html",
  styleUrls: ["./user-quota.component.scss"],
  imports: [
    NzCardComponent,
    NzTabsComponent,
    NzTabComponent,
    NzCollapseComponent,
    NgFor,
    NgIf,
    NzCollapsePanelComponent,
    NzTableComponent,
    NzTheadComponent,
    NzTrDirective,
    NzTableCellDirective,
    NzThMeasureDirective,
    NzThAddOnComponent,
    NzTbodyComponent,
    NzSpaceCompactItemDirective,
    NzButtonComponent,
    NzWaveDirective,
    NzPopconfirmDirective,
    ɵNzTransitionPatchDirective,
    NzTooltipDirective,
    NzIconDirective,
    NzModalModule,
  ],
})
export class UserQuotaComponent implements OnInit {
  readonly userId: number;
  backgroundColor: String = "white";
  textColor: String = "Black";
  dynamicHeight: string = "700px";

  totalFileSize: number = 0;
  totalQuotaSize: number = 0;
  totalUploadedDatasetSize: number = 0;
  totalUploadedDatasetCount: number = 0;
  createdFiles: ReadonlyArray<File> = [];
  createdWorkflows: ReadonlyArray<Workflow> = [];
  accessFiles: ReadonlyArray<number> = [];
  accessWorkflows: ReadonlyArray<number> = [];
  executionCollections: ReadonlyArray<ExecutionQuota> = [];
  datasetList: ReadonlyArray<DatasetQuota> = [];
  workflows: Array<WorkflowQuota> = [];
  UserService: UserServiceType;
  DEFAULT_PIE_CHART_WIDTH = 280;
  DEFAULT_PIE_CHART_HEIGHT = 220;
  DEFAULT_LINE_CHART_WIDTH = 280;
  DEFAULT_LINE_CHART_HEIGHT = 220;
  readonly INITIAL_ROW_COUNT = 5;
  readonly Math = Math;
  workflowPageSizeMap: { [workflowId: number]: number } = {};

  isChartModalVisible = false;
  chartModalTitle = "";
  chartModalSubtitle = "";

  get hasDatasetStorage(): boolean {
    return this.datasetList.length > 0 && this.totalUploadedDatasetSize > 0;
  }

  getPageSize(workflowId: number): number {
    return this.workflowPageSizeMap[workflowId] || this.INITIAL_ROW_COUNT;
  }

  showMoreRows(workflowId: number, totalExecutions: number): void {
    const current = this.getPageSize(workflowId);
    this.workflowPageSizeMap[workflowId] = Math.min(current + 5, totalExecutions);
  }

  showAllRows(workflowId: number, totalExecutions: number): void {
    this.workflowPageSizeMap[workflowId] = totalExecutions;
  }

  showFewerRows(workflowId: number): void {
    this.workflowPageSizeMap[workflowId] = this.INITIAL_ROW_COUNT;
  }

  activeModalChartType: string | null = null;

  openChartModal(chartType: string): void {
    this.activeModalChartType = chartType;
    if (chartType === "sizePieChart") {
      this.chartModalTitle = "Dataset Size Distribution";
      this.chartModalSubtitle = "Storage footprint breakdown per dataset";
    } else if (chartType === "datasetLineChart") {
      this.chartModalTitle = "Dataset Upload Overview";
      this.chartModalSubtitle = "Historical dataset uploads over time";
    } else if (chartType === "workflowLineChart") {
      this.chartModalTitle = "Workflow Upload Overview";
      this.chartModalSubtitle = "Historical workflow creation over time";
    }
    this.isChartModalVisible = true;
    setTimeout(() => {
      this.renderModalChart();
    }, 200);
  }

  closeChartModal(): void {
    this.isChartModalVisible = false;
    this.activeModalChartType = null;
    const container = document.getElementById("popupChart");
    if (container) {
      Plotly.purge(container);
    }
  }

  renderModalChart(): void {
    if (!this.activeModalChartType) {
      return;
    }
    const container = document.getElementById("popupChart");
    if (!container) {
      return;
    }
    Plotly.purge(container);

    const chartWidth = container.clientWidth > 0 ? container.clientWidth : 700;

    if (this.activeModalChartType === "sizePieChart") {
      let pieChartData: Array<[string, ...number[]]> = [];
      this.datasetList.forEach(dataset => {
        pieChartData.push([dataset.name, dataset.size]);
      });
      var pieData = [
        {
          values: pieChartData.map(d => d[1]),
          labels: pieChartData.map(d => d[0]),
          type: "pie" as const,
          hoverinfo: "label+percent" as const,
          textinfo: "percent" as const,
          hole: 0.38,
          marker: {
            colors: ["#18181b", "#3f3f46", "#71717a", "#a1a1aa", "#d4d4d8", "#e4e4e7"],
          },
        },
      ];
      var pieLayout = {
        height: 400,
        width: chartWidth,
        autosize: false,
        margin: { l: 40, r: 40, t: 20, b: 20 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
      };
      Plotly.newPlot("popupChart", pieData, pieLayout, { displayModeBar: false, responsive: true });
    } else if (this.activeModalChartType === "datasetLineChart") {
      let lineChartData: Map<string, number> = new Map();
      this.datasetList.forEach(dataset => {
        const date = new Date(dataset.creationTime).toLocaleDateString();
        lineChartData.set(date, (lineChartData.get(date) || 0) + 1);
      });
      let lineChartDataArray: Array<[string, number]> = [];
      lineChartData.forEach((count, date) => {
        lineChartDataArray.push([date, count]);
      });
      lineChartDataArray = this.aggregateData(lineChartDataArray, 5);
      this.renderPopupLineChart(lineChartDataArray, "Date", "Count", chartWidth);
    } else if (this.activeModalChartType === "workflowLineChart") {
      let lineChartData: Map<string, number> = new Map();
      this.createdWorkflows.forEach(workflow => {
        const date = new Date(workflow.creationTime).toLocaleDateString();
        lineChartData.set(date, (lineChartData.get(date) || 0) + 1);
      });
      let lineChartDataArray: Array<[string, number]> = [];
      lineChartData.forEach((count, date) => {
        lineChartDataArray.push([date, count]);
      });
      lineChartDataArray = this.aggregateData(lineChartDataArray, 5);
      this.renderPopupLineChart(lineChartDataArray, "Date", "Count", chartWidth);
    }
  }

  private renderPopupLineChart(
    dataToDisplay: Array<[string, number]>,
    x_label: string,
    y_label: string,
    chartWidth: number
  ) {
    var data = [
      {
        x: dataToDisplay.map(d => d[0]),
        y: dataToDisplay.map(d => d[1]),
        type: "scatter" as const,
        mode: "lines+markers" as const,
        line: { color: "#18181b", width: 2.5, shape: "spline" as const },
        marker: { color: "#18181b", size: 8 },
        fill: "tozeroy" as const,
        fillcolor: "rgba(24, 24, 27, 0.05)",
      },
    ];

    const yValues = dataToDisplay.map(d => d[1]);
    const maxY = yValues.length > 0 ? Math.max(...yValues) : 0;
    const minY = yValues.length > 0 ? Math.min(...yValues) : 0;
    const yRange = maxY - minY;

    var layout = {
      height: 400,
      width: chartWidth,
      autosize: false,
      margin: { l: 50, r: 30, t: 20, b: 50 },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      xaxis: {
        title: { text: x_label, font: { size: 12, color: "rgba(24, 24, 27, 0.7)" } },
        gridcolor: "#f4f4f5",
        type: "category" as const,
      },
      yaxis: {
        title: { text: y_label, font: { size: 12, color: "rgba(24, 24, 27, 0.7)" } },
        rangemode: "tozero" as const,
        zeroline: true,
        zerolinewidth: 1,
        zerolinecolor: "#e4e4e7",
        gridcolor: "#f4f4f5",
        tickmode: yRange <= 5 ? ("linear" as const) : undefined,
        dtick: yRange <= 5 ? 1 : undefined,
      },
    };

    Plotly.newPlot("popupChart", data, layout, { displayModeBar: false, responsive: true });
  }

  constructor(
    private adminUserService: AdminUserService,
    private regularUserService: UserQuotaService
  ) {
    this.UserService = adminUserService;
    if (inject(NZ_MODAL_DATA, { optional: true })) {
      this.userId = inject(NZ_MODAL_DATA).uid;
      this.UserService = this.adminUserService;
      this.backgroundColor = "lightcoral";
      this.textColor = "white";
    } else {
      this.userId = -1;
      this.UserService = this.regularUserService;
      this.dynamicHeight = "";
    }
  }
  ngOnInit(): void {
    this.refreshData();
  }
  /* takes in an array of tuple ('label', 'value') and generates the corresponding pie chart */
  generatePieChart(dataToDisplay: Array<[string, ...number[]]>, title: string, chart: string) {
    var data = [
      {
        values: dataToDisplay.map(d => d[1]),
        labels: dataToDisplay.map(d => d[0]),
        type: "pie" as const,
        hoverinfo: "label+percent" as const,
        textinfo: "percent" as const,
        hole: 0.35,
        marker: {
          colors: ["#18181b", "#3f3f46", "#71717a", "#a1a1aa", "#d4d4d8", "#e4e4e7"],
        },
      },
    ];
    var layout = {
      height: this.DEFAULT_PIE_CHART_HEIGHT,
      width: this.DEFAULT_PIE_CHART_WIDTH,
      margin: { l: 20, r: 20, t: 30, b: 20 },
      title: {
        text: title,
        font: { family: "var(--app-font-sans)", size: 13, color: "#18181b" },
      },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
    };
    Plotly.newPlot(chart, data, layout, { displayModeBar: false, responsive: true });
  }

  filterOutdatedData(data: Array<[string, number]>): Array<[string, number]> {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return data.filter(([date]) => new Date(date) >= oneYearAgo);
  }
  aggregateByMonth(data: Array<[string, number]>): Array<[string, number]> {
    const monthMap = new Map<string, number>();
    data.forEach(([date, value]) => {
      const month = date.substring(0, 7); // 'YYYY-MM'
      if (monthMap.has(month)) {
        monthMap.set(month, monthMap.get(month)! + value);
      } else {
        monthMap.set(month, value);
      }
    });
    return Array.from(monthMap, ([date, value]) => [date, value]);
  }

  aggregateData(data: Array<[string, number]>, numGroup: number) {
    data = this.filterOutdatedData(data);

    if (data.length < 8) {
      return data;
    }

    const uniqueMonths = new Set(data.map(([date]) => date.substring(0, 7)));
    if (uniqueMonths.size >= 3) {
      return this.aggregateByMonth(data);
    }

    const startDate = new Date(data[0][0]);
    const endDate = new Date(data[data.length - 1][0]);
    const newOfDays = (endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24);
    const daysPerGroup = Math.ceil(newOfDays / numGroup);
    let aggData: Array<[string, number]> = [];

    let currentGroupStartDate = startDate;
    let sum = 0;
    let nextDate = new Date(currentGroupStartDate);
    nextDate.setDate(currentGroupStartDate.getDate() + daysPerGroup);
    data.forEach(([date, value]) => {
      const currentDate = new Date(date);
      if (currentDate < nextDate) {
        sum += value;
      } else {
        aggData.push([currentGroupStartDate.toISOString().split("T")[0], sum]);
        currentGroupStartDate = new Date(nextDate);
        nextDate.setDate(currentGroupStartDate.getDate() + daysPerGroup);
        sum = value;
      }
    });
    aggData.push([currentGroupStartDate.toISOString().split("T")[0], sum]);
    return aggData;
  }

  generateLineChart(
    dataToDisplay: Array<[string, number]>,
    x_label: string,
    y_label: string,
    title: string,
    chart: string
  ) {
    var data = [
      {
        x: dataToDisplay.map(d => d[0]),
        y: dataToDisplay.map(d => d[1]),
        type: "scatter" as const,
        mode: "lines+markers" as const,
        line: { color: "#18181b", width: 2 },
        marker: { color: "#18181b", size: 6 },
      },
    ];

    const yValues = dataToDisplay.map(d => d[1]);
    const maxY = yValues.length > 0 ? Math.max(...yValues) : 0;
    const minY = yValues.length > 0 ? Math.min(...yValues) : 0;
    const yRange = maxY - minY;

    var layout = {
      height: this.DEFAULT_LINE_CHART_HEIGHT,
      width: this.DEFAULT_LINE_CHART_WIDTH,
      margin: { l: 45, r: 20, t: 30, b: 45 },
      title: {
        text: title,
        font: { family: "var(--app-font-sans)", size: 13, color: "#18181b" },
      },
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      xaxis: {
        title: {
          text: x_label,
          font: { size: 11, color: "rgba(24, 24, 27, 0.7)" },
        },
        gridcolor: "#f4f4f5",
        type: "category" as const,
      },
      yaxis: {
        title: {
          text: y_label,
          font: { size: 11, color: "rgba(24, 24, 27, 0.7)" },
        },
        rangemode: "tozero" as const,
        zeroline: true,
        zerolinewidth: 1,
        zerolinecolor: "#e4e4e7",
        gridcolor: "#f4f4f5",
        tickmode: yRange <= 5 ? ("linear" as const) : undefined,
        dtick: yRange <= 5 ? 1 : undefined,
      },
    };

    Plotly.newPlot(chart, data, layout, { displayModeBar: false, responsive: true });
  }

  refreshData() {
    this.UserService.getCreatedDatasets(this.userId)
      .pipe(untilDestroyed(this))
      .subscribe(datasetList => {
        this.datasetList = datasetList;
        let totalDatasetSize = 0;
        this.totalUploadedDatasetCount = datasetList.length;
        let pieChartData: Array<[string, ...number[]]> = [];
        let lineChartData: Map<string, number> = new Map();
        this.datasetList.forEach(dataset => {
          totalDatasetSize += dataset.size;
          pieChartData.push([dataset.name, dataset.size]);
          const date = new Date(dataset.creationTime).toLocaleDateString();
          if (lineChartData.has(date)) {
            lineChartData.set(date, lineChartData.get(date)! + 1);
          } else {
            lineChartData.set(date, 1);
          }
        });
        this.generatePieChart(pieChartData, "Dataset Size Distribution", "sizePieChart");
        let lineChartDataArray: Array<[string, number]> = [];
        lineChartData.forEach((count, date) => {
          lineChartDataArray.push([date, count]);
        });
        lineChartDataArray = this.aggregateData(lineChartDataArray, 5);
        this.generateLineChart(lineChartDataArray, "Date", "Count", "Dataset Upload Overview", "datasetLineChart");
        this.totalUploadedDatasetSize = totalDatasetSize;
      });

    this.UserService.getCreatedWorkflows(this.userId)
      .pipe(untilDestroyed(this))
      .subscribe(workflowList => {
        let lineChartData: Map<string, number> = new Map();
        this.createdWorkflows = workflowList;
        this.createdWorkflows.forEach(workflow => {
          const date = new Date(workflow.creationTime).toLocaleDateString();
          if (lineChartData.has(date)) {
            lineChartData.set(date, lineChartData.get(date)! + 1);
          } else {
            lineChartData.set(date, 1);
          }
        });
        let lineChartDataArray: Array<[string, number]> = [];
        lineChartData.forEach((count, date) => {
          lineChartDataArray.push([date, count]);
        });
        lineChartDataArray = this.aggregateData(lineChartDataArray, 5);
        this.generateLineChart(lineChartDataArray, "Date", "Count", "Workflow Upload Overview", "workflowLineChart");
      });

    this.UserService.getAccessWorkflows(this.userId)
      .pipe(untilDestroyed(this))
      .subscribe(accessWorkflows => {
        this.accessWorkflows = accessWorkflows;
      });

    this.UserService.getExecutionQuota(this.userId)
      .pipe(untilDestroyed(this))
      .subscribe(executionList => {
        this.totalQuotaSize = 0;
        this.executionCollections = executionList;
        this.workflows = [];

        this.executionCollections.forEach(execution => {
          this.totalQuotaSize += execution.resultBytes + execution.runTimeStatsBytes + execution.logBytes;
          let workflow = this.workflows.find(
            w => w.executions.length > 0 && w.executions[0].workflowId === execution.workflowId
          );

          if (!workflow) {
            workflow = {
              workflowId: execution.workflowId,
              workflowName: execution.workflowName,
              executions: [],
            };
            this.workflows.push(workflow);
          }
          workflow.executions.push(execution);
        });
      });
  }

  deleteCollection(eid: number) {
    this.UserService.deleteExecutionCollection(eid)
      .pipe(untilDestroyed(this))
      .subscribe(() => {
        this.workflows.forEach((workflow, index, array) => {
          const executionToDelete = workflow.executions.find(execution => execution.eid === eid);
          if (executionToDelete) {
            this.totalQuotaSize -=
              executionToDelete.resultBytes + executionToDelete.logBytes + executionToDelete.runTimeStatsBytes;
            workflow.executions = workflow.executions.filter(execution => execution.eid !== eid);
          }
        });
        this.workflows = this.workflows.filter(workflow => workflow.executions.length > 0);
      });
  }

  // alias for formatSize
  formatSize = formatSize;

  public sortBySize: NzTableSortFn<ExecutionQuota> = (a: ExecutionQuota, b: ExecutionQuota) =>
    a.resultBytes + a.logBytes + a.runTimeStatsBytes - (b.resultBytes + b.logBytes + b.runTimeStatsBytes);
}
