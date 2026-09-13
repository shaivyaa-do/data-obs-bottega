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

import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { DEFAULT_ICON_SIZE, ICON_TONE_COLOR, IconTone, iconSvg } from "./icon-registry";
import { IconSize } from "./fluent-icon-literals";

@Component({
  selector: "texera-icon",
  standalone: true,
  template: `<span
    class="texera-icon"
    [class.texera-icon-filled]="filled"
    [style.width.px]="size"
    [style.height.px]="size"
    [style.color]="toneColor"
    [innerHTML]="svg"></span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
      .texera-icon {
        display: inline-flex;
      }
      .texera-icon :where(svg) {
        width: 100%;
        height: 100%;
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TexeraIconComponent {
  @Input() name = "";
  @Input() size: IconSize = DEFAULT_ICON_SIZE;
  @Input() filled = false;
  @Input() tone: IconTone = "primary";

  constructor(private sanitizer: DomSanitizer) {}

  get toneColor(): string {
    return ICON_TONE_COLOR[this.tone];
  }

  get svg(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(iconSvg(this.name, this.size, this.filled));
  }
}
