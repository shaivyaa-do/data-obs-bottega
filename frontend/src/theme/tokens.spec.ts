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

import { TEXT_BASE, textColors } from "./tokens";

describe("textColors", () => {
  it("builds light-mode opacities from #2B2B2B", () => {
    expect(TEXT_BASE.light).toBe("43 43 43");
    expect(textColors("light")).toEqual({
      black: "rgb(43 43 43 / 0.90)",
      primary: "rgb(43 43 43 / 0.70)",
      secondary: "rgb(43 43 43 / 0.50)",
      tertiary: "rgb(43 43 43 / 0.30)",
      disabled: "rgb(43 43 43 / 0.30)",
    });
  });

  it("keeps the same opacities in dark mode and only flips the base", () => {
    expect(TEXT_BASE.dark).toBe("255 255 255");
    const dark = textColors("dark");
    expect(dark.black).toBe("rgb(255 255 255 / 0.90)");
    expect(dark.primary).toBe("rgb(255 255 255 / 0.70)");
    expect(dark.disabled).toBe(dark.tertiary);
  });

  it("rejects an unsupported mode at runtime", () => {
    expect(() => textColors("sepia" as "light")).toThrow(/Unsupported color mode/);
  });
});
