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

import { ANT_TO_FLUENT, FLUENT_ICON_SVGS, IconSize, IconWeight } from "./fluent-icon-literals";

export const ICON_SIZES: IconSize[] = [16, 20, 24];
export const DEFAULT_ICON_SIZE: IconSize = 20;

export type IconTone = "primary" | "secondary" | "tertiary" | "black";

export const ICON_TONE_COLOR: Record<IconTone, string> = {
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  black: "var(--text-black)",
};

export function iconSvg(name: string, size: IconSize = DEFAULT_ICON_SIZE, filled = false): string {
  if (!name || typeof name !== "string") {
    throw new Error("Icon name is required.");
  }
  const glyphs = FLUENT_ICON_SVGS[name];
  if (!glyphs) {
    throw new Error(`No Fluent mapping for icon "${name}".`);
  }
  const weight: IconWeight = filled ? "filled" : "regular";
  const exact = glyphs[`${size}-${weight}`];
  if (exact) {
    return exact;
  }
  const fallback = glyphs[`20-${weight}`] ?? glyphs["20-regular"];
  if (!fallback) {
    throw new Error(`No glyph for icon "${name}" at ${size}px ${weight}.`);
  }
  return fallback;
}

export function registerFluentNzIcons(addIconLiteral: (name: string, svg: string) => void): void {
  for (const name of Object.keys(ANT_TO_FLUENT)) {
    const regular = iconSvg(name, 20, false);
    const filled = iconSvg(name, 20, true);
    addIconLiteral(name, regular);
    addIconLiteral(`${name}:outline`, regular);
    addIconLiteral(`${name}:fill`, filled);
  }
}
