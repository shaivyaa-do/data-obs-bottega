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

import { TEXT_BASE } from "./tokens";
import {
  contrastRatio,
  escalateTextToken,
  meetsWcagAa,
  resolveReadableTextToken,
  compositeTextRgb,
} from "./contrast";

const LIGHT_BASE = TEXT_BASE.light.split(" ").map(Number) as [number, number, number];
const WHITE: [number, number, number] = [255, 255, 255];
const BRAND_BLUE: [number, number, number] = [0, 120, 212];
const BRAND_ORANGE: [number, number, number] = [232, 73, 23];

describe("text-token contrast", () => {
  it("keeps 70% primary on white because it already meets WCAG AA", () => {
    const fg = compositeTextRgb(LIGHT_BASE, 0.7, WHITE);
    expect(meetsWcagAa(contrastRatio(fg, WHITE))).toBe(true);
    expect(resolveReadableTextToken("primary", LIGHT_BASE, WHITE)).toBe("primary");
  });

  it("escalates secondary and tertiary on white until AA passes", () => {
    const secondary = compositeTextRgb(LIGHT_BASE, 0.5, WHITE);
    const tertiary = compositeTextRgb(LIGHT_BASE, 0.3, WHITE);
    expect(meetsWcagAa(contrastRatio(secondary, WHITE))).toBe(false);
    expect(meetsWcagAa(contrastRatio(tertiary, WHITE))).toBe(false);
    expect(resolveReadableTextToken("secondary", LIGHT_BASE, WHITE)).toBe("primary");
    expect(resolveReadableTextToken("tertiary", LIGHT_BASE, WHITE)).toBe("primary");
  });

  it("escalates 70% text on branded fills instead of inventing a color", () => {
    expect(resolveReadableTextToken("primary", LIGHT_BASE, BRAND_BLUE)).toBe("black");
    expect(resolveReadableTextToken("primary", LIGHT_BASE, BRAND_ORANGE)).toBe("black");
  });

  it("does not invent a token past black when contrast still fails", () => {
    expect(escalateTextToken("black", false)).toBe("black");
    expect(escalateTextToken("primary", true)).toBe("primary");
  });

  it("rejects an unknown token and an invalid ratio", () => {
    expect(() => escalateTextToken("caption" as "primary", false)).toThrow(/Unknown text token/);
    expect(() => meetsWcagAa(0)).toThrow(/Contrast ratio/);
  });
});
