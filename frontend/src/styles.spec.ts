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

const styles = readFileSync("src/styles.scss", "utf8");

describe("global styles.scss chrome", () => {
  it("lets primary and create buttons paint icons with inherited (white) color", () => {
    expect(styles).not.toMatch(/\.anticon,\s*\.texera-icon\s*\{[^}]*color:\s*var\(--text-primary\)/);
    expect(styles).toMatch(/\.ant-btn-primary\s+\.anticon/);
    expect(styles).toMatch(/button\.create-btn\s+\.anticon/);
  });

  it("paints create buttons with the app primary blue", () => {
    expect(styles).toMatch(/button\.create-btn[\s\S]*?background:\s*var\(--app-primary\)/);
  });

  it("keeps local create-button overrides on the same primary blue", () => {
    const localCreateStyles = [
      "src/app/dashboard/component/button-style.scss",
      "src/app/dashboard/component/section-style.scss",
      "src/app/dashboard/component/user/user-venv/user-venv.component.scss",
      "src/app/dashboard/component/user/user-computing-unit/user-computing-unit.component.scss",
      "src/app/dashboard/component/user/user-dataset/user-dataset-explorer/dataset-detail.component.scss",
      "src/app/dashboard/component/user/user-dataset/user-dataset-explorer/user-dataset-version-creator/user-dataset-version-creator.component.scss",
      "src/app/dashboard/component/user/user-model/user-model-creator/user-model-creator.component.scss",
      "src/app/dashboard/component/user/user-agent/user-agent.component.scss",
    ].map(path => readFileSync(path, "utf8"));

    for (const local of localCreateStyles) {
      expect(local).toMatch(/\.create-btn[\s\S]*?var\(--app-primary\)|\.submit-btn[\s\S]*?var\(--app-primary\)/);
    }
  });

  it("does not round or fill the inner input of an affix wrapper", () => {
    expect(styles).toMatch(
      /\.ant-input-affix-wrapper\s+\.ant-input\s*\{[^}]*border-radius:\s*0\s*!important/
    );
    expect(styles).toMatch(
      /\.ant-input-affix-wrapper\s+\.ant-input\s*\{[^}]*background:\s*transparent\s*!important/
    );
  });

  it("renders ant-cards without a drop shadow", () => {
    expect(styles).toMatch(/\.ant-card\s*\{[^}]*box-shadow:\s*none/);
  });
});
