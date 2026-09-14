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

  it("returns a glyph for the filter ant name", () => {
    expect(iconSvg("filter")).toContain("<svg");
  });
});

describe("registerFluentNzIcons", () => {
  it("registers outline and fill IconDefinitions for every mapped ant name", () => {
    const icons: Array<{ name: string; theme?: string; icon: string }> = [];
    registerFluentNzIcons((...defs) => icons.push(...defs));
    const deleteOutline = icons.find(icon => icon.name === "delete" && icon.theme === "outline");
    const deleteFill = icons.find(icon => icon.name === "delete" && icon.theme === "fill");
    expect(deleteOutline?.icon).toContain("<svg");
    expect(deleteFill?.icon).not.toBe(deleteOutline?.icon);
    expect(icons.every(icon => icon.theme === "outline" || icon.theme === "fill")).toBe(true);
    expect(icons.some(icon => !icon.name.includes(":"))).toBe(true);
    expect(new Set(icons.map(icon => icon.name)).size).toBeGreaterThan(90);
  });

  it("does not pass a namespace-less string to addIconLiteral", () => {
    const literals: string[] = [];
    registerFluentNzIcons((...defs) => {
      for (const def of defs) {
        literals.push(def.name);
      }
    });
    expect(literals).not.toContain("delete:outline");
    expect(literals.every(name => !name.includes(":"))).toBe(true);
  });
});
