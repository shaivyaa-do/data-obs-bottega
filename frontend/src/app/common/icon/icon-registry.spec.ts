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

import { ANT_TO_FLUENT } from "./fluent-icon-literals";
import { iconSvg, registerFluentNzIcons } from "./icon-registry";

describe("iconSvg", () => {
  it("returns a 20px regular Fluent glyph for a mapped ant name", () => {
    const svg = iconSvg("delete");
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox");
    expect(svg).toContain("currentColor");
  });

  it("switches Regular to Filled for the same name", () => {
    expect(iconSvg("star", 20, false)).not.toBe(iconSvg("star", 20, true));
  });

  it("rejects an unknown or empty name", () => {
    expect(() => iconSvg("not-an-icon")).toThrow(/No Fluent mapping/);
    expect(() => iconSvg("")).toThrow(/required/);
  });
});

describe("registerFluentNzIcons", () => {
  it("registers outline and fill aliases for every mapped ant name", () => {
    const calls: Array<[string, string]> = [];
    registerFluentNzIcons((name, svg) => calls.push([name, svg]));
    const names = calls.map(([name]) => name);
    expect(names).toContain("delete");
    expect(names).toContain("delete:outline");
    expect(names).toContain("delete:fill");
    expect(calls.find(([name]) => name === "delete:fill")?.[1]).not.toBe(
      calls.find(([name]) => name === "delete:outline")?.[1]
    );
    expect(new Set(Object.keys(ANT_TO_FLUENT)).size).toBeGreaterThan(90);
  });
});
